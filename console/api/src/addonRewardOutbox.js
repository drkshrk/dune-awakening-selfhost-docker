// Scheduled reward delivery for addons.
//
// An addon that declares `rewardOutbox` in its manifest keeps a view of owed
// rewards in its own database schema (maintained by its own triggers). With
// the owner's approval of `rewards:schedule`, the console reads that view on
// a schedule and hands each row to the same durable queue rewards.deliver
// uses, so rewards go out without anyone keeping the addon page open.
//
// No addon code runs here. The view is addon-written SQL, so it is read:
//   - in a READ ONLY transaction (Postgres refuses every write, including
//     `select dune.<mutation>()` hidden in the view),
//   - with a short statement timeout and a pinned search_path,
//   - only from a schema the addon may own (never dune, public, ext, ...),
//   - and never while dblink/postgres_fdw are installed, since those can
//     open a second, writable connection from inside a read-only one.
// Every row is then validated like a rewards.deliver call, with the stricter
// rule that items must exist in the admin item catalog. An hourly budget
// trips a circuit breaker that disables the schedule until the owner
// re-enables it, and every run re-checks the addon's approvals.

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { assertInstalledAddonPermission, listInstalledAddons, normalizeRewardOutbox } from "./addons.js";
import { normalizeAddonReward } from "./addonDeliveries.js";
import { quoteQualified } from "./db.js";
import { clampInt, writeJsonAtomic } from "./jsonStore.js";

export { normalizeRewardOutbox };
export const REWARD_SCHEDULE_PERMISSION = "rewards:schedule";
export const REWARD_OUTBOX_REQUIRED_PERMISSIONS = ["rewards:grant", "database:read", REWARD_SCHEDULE_PERMISSION];
export const MAX_OUTBOX_ROWS_PER_RUN = 50;
export const OUTBOX_MIN_AGE_SECONDS = 60;
export const OUTBOX_STATEMENT_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MINUTES = 5;
const HOUR_MS = 60 * 60 * 1000;
const WATERMARK_PATTERN = /^[0-9]{1,18}$/;
const ESCAPE_EXTENSIONS = ["dblink", "postgres_fdw"];
const MAX_DETAIL_LENGTH = 500;
// The exact failures normalizeAddonReward and the delivery service raise for
// a row that can never be accepted. Anything else stops the run instead.
const PERMANENT_ROW_ERRORS = [
  /Delivery requestId must be/i,
  /Delivery must target one valid player ID/i,
  /Reward itemId is invalid/i,
  /must be an integer from/i,
  /Reward type must be/i,
  /already used with different delivery details/i,
  /is not in the item catalog/i
];

export function rewardSchedulesDisabled(env = process.env) {
  return String(env.DUNE_ADDON_SCHEDULED_REWARDS ?? "").trim() === "0";
}

export function rewardSchedulePath(config, addonId) {
  return resolve(config.repoRoot, "runtime/addons/jobs", addonId, "reward-outbox.json");
}

const DEFAULT_STATE = Object.freeze({
  enabled: false,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  watermark: null,
  nextRunAt: "",
  lastRunAt: "",
  lastRunStatus: "",
  lastRunDetail: "",
  breakerTripped: false,
  breakerDetail: "",
  hourStartedAt: "",
  hourCount: 0
});

export function readRewardSchedule(config, addonId) {
  const file = rewardSchedulePath(config, addonId);
  if (!existsSync(file)) return { ...DEFAULT_STATE };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return {
      ...DEFAULT_STATE,
      ...raw,
      enabled: raw.enabled === true,
      intervalMinutes: clampInt(raw.intervalMinutes, DEFAULT_INTERVAL_MINUTES, 1, 60),
      watermark: WATERMARK_PATTERN.test(String(raw.watermark ?? "")) ? String(raw.watermark) : null,
      hourCount: clampInt(raw.hourCount, 0, 0, 1_000_000),
      breakerTripped: raw.breakerTripped === true
    };
  } catch {
    // A corrupt schedule falls back to disabled rather than guessing.
    return { ...DEFAULT_STATE, lastRunStatus: "error", lastRunDetail: "Schedule state was unreadable and has been reset to disabled." };
  }
}

function writeRewardSchedule(config, addonId, state) {
  writeJsonAtomic(rewardSchedulePath(config, addonId), state);
}

// Typed update from the addon bridge. The watermark can be seeded on first
// enable (the page hands over what it already delivered) but never moved
// backwards, because a rewind could re-submit rewards whose delivery records
// have since been pruned.
export function saveRewardSchedule(config, addonId, payload = {}, { now = () => new Date() } = {}) {
  const previous = readRewardSchedule(config, addonId);
  const next = { ...previous };
  if (payload.enabled !== undefined) next.enabled = payload.enabled === true;
  if (payload.intervalMinutes !== undefined) next.intervalMinutes = clampInt(payload.intervalMinutes, previous.intervalMinutes, 1, 60);
  if (payload.startAfterId !== undefined && payload.startAfterId !== null) {
    const start = String(payload.startAfterId);
    if (!WATERMARK_PATTERN.test(start)) throw new Error("startAfterId must be a non-negative integer.");
    if (previous.watermark === null || BigInt(start) > BigInt(previous.watermark)) next.watermark = start;
  }
  if (next.enabled && (!previous.enabled || next.intervalMinutes !== previous.intervalMinutes)) {
    // Re-enabling is the owner's acknowledgement of a tripped breaker.
    next.breakerTripped = false;
    next.breakerDetail = "";
    next.nextRunAt = new Date(now().getTime() + next.intervalMinutes * 60_000).toISOString();
  }
  if (!next.enabled) next.nextRunAt = "";
  writeRewardSchedule(config, addonId, next);
  return next;
}

export function rewardScheduleStatus(config, addonId, manifestOutbox, { now = () => new Date(), env = process.env } = {}) {
  const state = readRewardSchedule(config, addonId);
  const fresh = hourWindow(state, now());
  return {
    supported: true,
    configured: Boolean(manifestOutbox),
    disabledByServer: rewardSchedulesDisabled(env),
    enabled: state.enabled,
    intervalMinutes: state.intervalMinutes,
    watermark: state.watermark,
    nextRunAt: state.nextRunAt,
    lastRunAt: state.lastRunAt,
    lastRunStatus: state.lastRunStatus,
    lastRunDetail: state.lastRunDetail,
    breakerTripped: state.breakerTripped,
    breakerDetail: state.breakerDetail,
    maxPerHour: manifestOutbox ? manifestOutbox.maxPerHour : null,
    usedThisHour: fresh.hourCount
  };
}

function hourWindow(state, at) {
  const started = Date.parse(state.hourStartedAt || "");
  if (!Number.isFinite(started) || at.getTime() - started >= HOUR_MS) {
    return { hourStartedAt: at.toISOString(), hourCount: 0 };
  }
  return { hourStartedAt: state.hourStartedAt, hourCount: state.hourCount };
}

function isPermanentRowError(error) {
  const message = String(error?.message || "");
  return PERMANENT_ROW_ERRORS.some((pattern) => pattern.test(message));
}

function cleanDetail(text) {
  return String(text || "").replace(/[\r\n]+/g, " ").slice(0, MAX_DETAIL_LENGTH);
}

function catalogLoader(repoRoot) {
  let cached = { mtimeMs: -1, ids: new Set() };
  return () => {
    const file = resolve(repoRoot, "runtime/data/admin-items.json");
    const mtimeMs = statSync(file).mtimeMs;
    if (mtimeMs !== cached.mtimeMs) {
      const items = JSON.parse(readFileSync(file, "utf8"));
      cached = { mtimeMs, ids: new Set(items.map((item) => String(item.id || "")).filter(Boolean)) };
    }
    return cached.ids;
  };
}

// Reads at most `limit` rows past the watermark, read-only and time-boxed.
export async function readOutboxRows(db, outbox, watermark, limit) {
  const extensions = await db.query(
    "select extname from pg_catalog.pg_extension where extname = any($1::text[])",
    [ESCAPE_EXTENSIONS]
  );
  if (extensions.rows.length > 0) {
    throw new Error(`Scheduled rewards are unavailable while ${extensions.rows.map((row) => row.extname).join(", ")} is installed: it can bypass the read-only protection.`);
  }
  const relation = await db.query(
    `select c.relkind::text as relkind
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2`,
    [outbox.schema, outbox.view]
  );
  if (!relation.rows.length || !["v", "r", "m"].includes(relation.rows[0].relkind)) {
    throw new Error(`Reward outbox ${outbox.schema}.${outbox.view} was not found. Run the addon's database setup.`);
  }
  return db.transaction(async (tx) => {
    // Must be the first statement: it covers everything the view executes.
    await tx.query("set transaction read only");
    await tx.query(`set local statement_timeout = '${OUTBOX_STATEMENT_TIMEOUT_MS}ms'`);
    await tx.query("set local search_path = pg_catalog, pg_temp");
    const result = await tx.query(
      `select id::text as id, request_id::text as request_id, player_id::text as player_id,
              reward_type::text as reward_type, item_id::text as item_id,
              amount::text as amount, quality::text as quality
         from ${quoteQualified(outbox.schema, outbox.view)}
        where id > $1::bigint
          and created_at <= now() - interval '${OUTBOX_MIN_AGE_SECONDS} seconds'
        order by id
        limit $2`,
      [watermark, limit]
    );
    return result.rows;
  });
}

export function createRewardOutboxScheduler(config, options = {}) {
  const getDb = options.getDb;
  const deliveryService = options.deliveryService;
  const now = options.now || (() => new Date());
  const env = options.env || process.env;
  const audit = options.audit || (() => {});
  const listAddons = options.listAddons || (() => listInstalledAddons(config));
  const assertPermission = options.assertPermission || ((addonId, permission) => assertInstalledAddonPermission(config, addonId, permission));
  const catalogIds = options.catalogIds || catalogLoader(config.repoRoot);
  const armed = new Set();
  let running = false;

  // Throws unless the addon is installed, enabled, runnable, declares an
  // outbox and has every required permission approved. Called on every run.
  function authorize(addonId) {
    let manifest = null;
    for (const permission of REWARD_OUTBOX_REQUIRED_PERMISSIONS) {
      manifest = assertPermission(addonId, permission).manifest;
    }
    const outbox = normalizeRewardOutbox(manifest?.rewardOutbox);
    if (!outbox) throw new Error("The addon does not declare a reward outbox.");
    return outbox;
  }

  async function runAddon(addonId, trigger) {
    const outbox = authorize(addonId);
    const state = readRewardSchedule(config, addonId);
    const at = now();
    const window = hourWindow(state, at);
    const summary = { addonId, trigger, examined: 0, handedOver: 0, skipped: 0, firstId: null, lastId: null, stoppedBy: "" };
    let watermark = state.watermark || "0";
    let breaker = "";

    const budgetLeft = outbox.maxPerHour - window.hourCount;
    const rows = budgetLeft > 0
      ? await readOutboxRows(getDb(), outbox, watermark, Math.min(MAX_OUTBOX_ROWS_PER_RUN, budgetLeft + 1))
      : await readOutboxRows(getDb(), outbox, watermark, 1);
    summary.examined = rows.length;

    const ids = catalogIds();
    for (const row of rows) {
      if (window.hourCount >= outbox.maxPerHour) {
        breaker = `More than ${outbox.maxPerHour} rewards were due within an hour. Scheduled delivery was disabled; review the addon, then re-enable it.`;
        break;
      }
      summary.firstId ??= row.id;
      try {
        const reward = normalizeAddonReward({
          type: row.reward_type,
          playerId: row.player_id,
          itemId: row.item_id,
          amount: Number(row.amount),
          quality: Number(row.quality || 0)
        });
        if (reward.itemId !== undefined && !ids.has(reward.itemId)) {
          throw new Error(`Item ${reward.itemId} is not in the item catalog.`);
        }
        await deliveryService.request(addonId, { ...reward, requestId: row.request_id }, { permission: "rewards:grant", attemptNow: false });
        summary.handedOver += 1;
        window.hourCount += 1;
      } catch (error) {
        if (!isPermanentRowError(error)) {
          summary.stoppedBy = cleanDetail(error?.message);
          break;
        }
        summary.skipped += 1;
        audit("addons.scheduled-rewards.skip", { id: addonId, outboxId: row.id, requestId: String(row.request_id || "").slice(0, 128), error: cleanDetail(error?.message) });
      }
      watermark = row.id;
      summary.lastId = row.id;
    }

    const next = {
      ...readRewardSchedule(config, addonId),
      watermark: watermark === "0" && state.watermark === null ? null : watermark,
      hourStartedAt: window.hourStartedAt,
      hourCount: window.hourCount,
      lastRunAt: at.toISOString(),
      lastRunStatus: breaker ? "breaker" : summary.stoppedBy ? "stopped" : "ok",
      lastRunDetail: breaker || summary.stoppedBy || `${summary.handedOver} handed to the delivery queue, ${summary.skipped} rejected.`
    };
    if (breaker) {
      next.enabled = false;
      next.breakerTripped = true;
      next.breakerDetail = breaker;
      next.nextRunAt = "";
    }
    writeRewardSchedule(config, addonId, next);
    audit("addons.scheduled-rewards", { ...summary, status: next.lastRunStatus, breaker: Boolean(breaker) });
    return { ...summary, status: next.lastRunStatus, watermark: next.watermark };
  }

  async function tick() {
    if (rewardSchedulesDisabled(env) || running) return { ran: 0 };
    running = true;
    let ran = 0;
    try {
      for (const addon of listAddons()) {
        if (!addon?.enabled) continue;
        const state = readRewardSchedule(config, addon.id);
        if (!state.enabled) continue;
        const at = now();
        // First look after a restart: re-arm instead of firing a backlog.
        if (!armed.has(addon.id)) {
          armed.add(addon.id);
          const due = Date.parse(state.nextRunAt || "");
          if (!Number.isFinite(due) || due <= at.getTime()) {
            writeRewardSchedule(config, addon.id, { ...state, nextRunAt: new Date(at.getTime() + state.intervalMinutes * 60_000).toISOString() });
            continue;
          }
        }
        const due = Date.parse(state.nextRunAt || "");
        if (Number.isFinite(due) && due > at.getTime()) continue;
        // Arm the next run before this one, so a failure cannot loop every tick.
        writeRewardSchedule(config, addon.id, { ...state, nextRunAt: new Date(at.getTime() + state.intervalMinutes * 60_000).toISOString() });
        try {
          await runAddon(addon.id, "schedule");
          ran += 1;
        } catch (error) {
          const detail = cleanDetail(error?.message || "Scheduled reward run failed.");
          writeRewardSchedule(config, addon.id, { ...readRewardSchedule(config, addon.id), lastRunAt: at.toISOString(), lastRunStatus: "error", lastRunDetail: detail });
          audit("addons.scheduled-rewards", { addonId: addon.id, trigger: "schedule", status: "error", error: detail });
        }
      }
    } finally {
      running = false;
    }
    return { ran };
  }

  return { tick, runAddon, authorize };
}
