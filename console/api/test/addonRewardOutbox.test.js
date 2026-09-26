import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeAddonManifest } from "../src/addons.js";
import {
  MAX_OUTBOX_ROWS_PER_RUN,
  createRewardOutboxScheduler,
  normalizeRewardOutbox,
  readOutboxRows,
  readRewardSchedule,
  rewardSchedulePath,
  rewardScheduleStatus,
  saveRewardSchedule
} from "../src/addonRewardOutbox.js";

const OUTBOX = { schema: "dune_airdrop", view: "airdrop_reward_outbox", maxPerHour: 200 };
const ADDON = "dune-airdrop-addon";

function row(id, extra = {}) {
  return { id: String(id), request_id: `airdrop:req-${id}`, player_id: "9001", reward_type: "item", item_id: "IronOre", amount: "5", quality: "0", ...extra };
}

// A db double: records every statement, answers the probes, and serves the
// outbox from `rows` honouring the watermark and limit parameters.
function fakeDb({ rows = [], extensions = [], relkind = "v" } = {}) {
  const log = [];
  const answer = (sql, params = []) => {
    log.push({ sql, params });
    if (sql.includes("pg_extension")) return { rows: extensions.map((extname) => ({ extname })) };
    if (sql.includes("pg_namespace")) return { rows: relkind ? [{ relkind }] : [] };
    if (sql.includes("from \"")) {
      const after = BigInt(params[0]);
      return { rows: rows.filter((r) => BigInt(r.id) > after).slice(0, params[1]) };
    }
    return { rows: [] };
  };
  return {
    log,
    query: async (sql, params) => answer(sql, params),
    transaction: async (fn) => {
      log.push({ sql: "BEGIN" });
      const result = await fn({ query: async (sql, params) => answer(sql, params) });
      log.push({ sql: "COMMIT" });
      return result;
    }
  };
}

function fixture(options = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), "dune-reward-outbox-"));
  mkdirSync(join(repoRoot, "runtime/data"), { recursive: true });
  writeFileSync(join(repoRoot, "runtime/data/admin-items.json"), JSON.stringify([{ id: "IronOre", name: "Iron Ore" }, { id: "WaterBottle_1", name: "Water" }]));
  const config = { repoRoot };
  const db = options.db || fakeDb(options);
  const requests = [];
  const audits = [];
  let clock = options.start || new Date("2026-09-26T12:00:00Z");
  const approved = new Set(options.approved || ["rewards:grant", "database:read", "rewards:schedule"]);
  const manifest = { rewardOutbox: options.outbox === undefined ? OUTBOX : options.outbox };
  const scheduler = createRewardOutboxScheduler(config, {
    getDb: () => db,
    now: () => clock,
    env: options.env || {},
    audit: (action, detail) => audits.push({ action, ...detail }),
    listAddons: () => [{ id: ADDON, enabled: options.addonEnabled !== false }],
    assertPermission: (addonId, permission) => {
      if (!approved.has(permission)) throw new Error(`not approved for ${permission}`);
      return { manifest };
    },
    deliveryService: {
      request: async (addonId, input, opts) => {
        if (options.deliverError) {
          const error = options.deliverError(input);
          if (error) throw error;
        }
        requests.push({ addonId, input, opts });
        return { status: "pending" };
      }
    }
  });
  return {
    config, db, scheduler, requests, audits, approved,
    advance: (ms) => { clock = new Date(clock.getTime() + ms); },
    now: () => clock,
    enable: (payload = {}) => saveRewardSchedule(config, ADDON, { enabled: true, intervalMinutes: 5, ...payload }, { now: () => clock }),
    state: () => readRewardSchedule(config, ADDON),
    cleanup: () => rmSync(repoRoot, { recursive: true, force: true })
  };
}

// Enables the schedule and moves the clock past the first run, including the
// post-restart re-arm the first tick always does.
async function runOnce(f) {
  await f.scheduler.tick();
  f.advance(6 * 60_000);
  return f.scheduler.tick();
}

test("manifest outbox: only addon-owned schemas, lowercase identifiers, bounded budget", () => {
  assert.deepEqual(normalizeRewardOutbox({ schema: "dune_airdrop", view: "airdrop_reward_outbox" }), { schema: "dune_airdrop", view: "airdrop_reward_outbox", maxPerHour: 200 });
  assert.equal(normalizeRewardOutbox({ schema: "a", view: "b", maxPerHour: 99999 }).maxPerHour, 1000);
  assert.equal(normalizeRewardOutbox({ schema: "a", view: "b", maxPerHour: 0 }).maxPerHour, 1);
  assert.equal(normalizeRewardOutbox(undefined), null);
  for (const schema of ["dune", "public", "ext", "information_schema", "dune_runtime", "pg_catalog", "pg_toast", "console_market_history"]) {
    assert.throws(() => normalizeRewardOutbox({ schema, view: "v" }), /cannot be/, schema);
  }
  for (const bad of ["Dune_Airdrop", "a.b", "a;drop", "\"x\"", "", "1abc"]) {
    assert.throws(() => normalizeRewardOutbox({ schema: bad, view: "v" }), /identifier/, bad);
    assert.throws(() => normalizeRewardOutbox({ schema: "a", view: bad }), /identifier/, bad);
  }
  const manifest = normalizeAddonManifest({ id: "x-addon", name: "X", version: "1", type: "ui", entry: { path: "web/index.html" }, permissions: ["rewards:schedule"], rewardOutbox: { schema: "x_addon", view: "outbox" } });
  assert.deepEqual(manifest.rewardOutbox, { schema: "x_addon", view: "outbox", maxPerHour: 200 });
  assert.deepEqual(manifest.permissions, ["rewards:schedule"]);
  assert.equal(normalizeAddonManifest({ id: "y-addon", name: "Y", version: "1", type: "ui", entry: { path: "a.html" } }).rewardOutbox, null);
  assert.throws(() => normalizeAddonManifest({ id: "z-addon", name: "Z", version: "1", type: "ui", entry: { path: "a.html" }, rewardOutbox: { schema: "dune", view: "x" } }), /cannot be dune/);
});

test("schedule settings: the watermark can be seeded but never rewound", () => {
  const f = fixture();
  try {
    let saved = f.enable({ startAfterId: "40" });
    assert.equal(saved.watermark, "40");
    assert.ok(saved.nextRunAt);
    saved = saveRewardSchedule(f.config, ADDON, { startAfterId: "12" });
    assert.equal(saved.watermark, "40", "a lower start must not rewind");
    saved = saveRewardSchedule(f.config, ADDON, { startAfterId: "55" });
    assert.equal(saved.watermark, "55");
    assert.throws(() => saveRewardSchedule(f.config, ADDON, { startAfterId: "5 OR 1=1" }), /non-negative integer/);
    saved = saveRewardSchedule(f.config, ADDON, { intervalMinutes: 999 });
    assert.equal(saved.intervalMinutes, 60);
    saved = saveRewardSchedule(f.config, ADDON, { enabled: false });
    assert.equal(saved.nextRunAt, "");
  } finally {
    f.cleanup();
  }
});

test("the first tick after a restart re-arms instead of firing a backlog", async () => {
  const f = fixture({ rows: [row(1), row(2)] });
  try {
    f.enable();
    f.advance(60 * 60_000); // long overdue, as if the console had been down
    await f.scheduler.tick();
    assert.equal(f.requests.length, 0);
    assert.ok(Date.parse(f.state().nextRunAt) > f.now().getTime());
    f.advance(6 * 60_000);
    await f.scheduler.tick();
    assert.equal(f.requests.length, 2);
  } finally {
    f.cleanup();
  }
});

test("a due run queues rows without attempting them inline and advances the watermark", async () => {
  const f = fixture({ rows: [row(1), row(2), row(3, { item_id: "WaterBottle_1", amount: "2", quality: "1" })] });
  try {
    f.enable();
    await runOnce(f);
    assert.equal(f.requests.length, 3);
    for (const r of f.requests) {
      assert.equal(r.addonId, ADDON);
      assert.equal(r.opts.attemptNow, false);
      assert.equal(r.opts.permission, "rewards:grant");
    }
    assert.deepEqual(f.requests[2].input, { type: "item", playerId: "9001", amount: 2, itemId: "WaterBottle_1", quality: 1, requestId: "airdrop:req-3" });
    const state = f.state();
    assert.equal(state.watermark, "3");
    assert.equal(state.lastRunStatus, "ok");
    assert.ok(f.audits.some((a) => a.action === "addons.scheduled-rewards" && a.handedOver === 3));
    // Nothing new: the next run hands nothing over.
    f.advance(6 * 60_000);
    await f.scheduler.tick();
    assert.equal(f.requests.length, 3);
  } finally {
    f.cleanup();
  }
});

test("the outbox is read read-only, time-boxed, with a pinned search_path and quoted names", async () => {
  const db = fakeDb({ rows: [row(1)] });
  const rows = await readOutboxRows(db, OUTBOX, "0", 10);
  assert.equal(rows.length, 1);
  const statements = db.log.map((entry) => entry.sql.replace(/\s+/g, " ").trim());
  const begin = statements.indexOf("BEGIN");
  assert.equal(statements[begin + 1], "set transaction read only", "read only must be the first statement in the transaction");
  assert.match(statements[begin + 2], /^set local statement_timeout = '5000ms'$/);
  assert.equal(statements[begin + 3], "set local search_path = pg_catalog, pg_temp");
  assert.match(statements[begin + 4], /from "dune_airdrop"\."airdrop_reward_outbox"/);
  assert.match(statements[begin + 4], /created_at <= now\(\) - interval '60 seconds'/);
  assert.doesNotMatch(statements[begin + 4], /\*/);
});

test("refuses to read while an extension that can escape read-only is installed", async () => {
  await assert.rejects(readOutboxRows(fakeDb({ extensions: ["dblink"] }), OUTBOX, "0", 10), /dblink is installed/);
  await assert.rejects(readOutboxRows(fakeDb({ extensions: ["postgres_fdw"] }), OUTBOX, "0", 10), /postgres_fdw is installed/);
  await assert.rejects(readOutboxRows(fakeDb({ relkind: null }), OUTBOX, "0", 10), /was not found/);
  await assert.rejects(readOutboxRows(fakeDb({ relkind: "S" }), OUTBOX, "0", 10), /was not found/);
});

test("every run re-checks approvals: revoking any required permission stops delivery", async () => {
  for (const missing of ["rewards:grant", "database:read", "rewards:schedule"]) {
    const approved = ["rewards:grant", "database:read", "rewards:schedule"].filter((p) => p !== missing);
    const f = fixture({ rows: [row(1)], approved });
    try {
      f.enable();
      await runOnce(f);
      assert.equal(f.requests.length, 0, missing);
      assert.equal(f.state().lastRunStatus, "error", missing);
      assert.equal(f.state().watermark, null, missing);
    } finally {
      f.cleanup();
    }
  }
});

test("a disabled addon or an addon without an outbox is never read", async () => {
  for (const options of [{ addonEnabled: false }, { outbox: null }]) {
    const f = fixture({ rows: [row(1)], ...options });
    try {
      f.enable();
      await runOnce(f);
      assert.equal(f.requests.length, 0);
    } finally {
      f.cleanup();
    }
  }
});

test("the server kill switch stops every schedule", async () => {
  const f = fixture({ rows: [row(1)], env: { DUNE_ADDON_SCHEDULED_REWARDS: "0" } });
  try {
    f.enable();
    await runOnce(f);
    assert.equal(f.requests.length, 0);
    assert.equal(rewardScheduleStatus(f.config, ADDON, OUTBOX, { env: { DUNE_ADDON_SCHEDULED_REWARDS: "0" } }).disabledByServer, true);
  } finally {
    f.cleanup();
  }
});

test("rows the console can never accept are skipped and audited; items must be in the catalog", async () => {
  const f = fixture({ rows: [row(1), row(2, { item_id: "NotARealItem" }), row(3, { amount: "5000" }), row(4, { player_id: "*" }), row(5)] });
  try {
    f.enable();
    await runOnce(f);
    assert.deepEqual(f.requests.map((r) => r.input.requestId), ["airdrop:req-1", "airdrop:req-5"]);
    assert.equal(f.state().watermark, "5");
    const skips = f.audits.filter((a) => a.action === "addons.scheduled-rewards.skip");
    assert.deepEqual(skips.map((s) => s.outboxId), ["2", "3", "4"]);
    assert.match(skips[0].error, /not in the item catalog/);
  } finally {
    f.cleanup();
  }
});

test("a transient failure stops the run without advancing past the failed row", async () => {
  const f = fixture({
    rows: [row(1), row(2), row(3)],
    deliverError: (input) => (input.requestId === "airdrop:req-2" ? new Error("Addon delivery state is unreadable; refusing to risk a duplicate delivery.") : null)
  });
  try {
    f.enable();
    await runOnce(f);
    assert.deepEqual(f.requests.map((r) => r.input.requestId), ["airdrop:req-1"]);
    assert.equal(f.state().watermark, "1");
    assert.equal(f.state().lastRunStatus, "stopped");
  } finally {
    f.cleanup();
  }
});

test("more than the hourly budget trips the breaker and disables the schedule", async () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(i + 1));
  const f = fixture({ rows, outbox: { ...OUTBOX, maxPerHour: 10 } });
  try {
    f.enable();
    await runOnce(f);
    assert.equal(f.requests.length, 10);
    const state = f.state();
    assert.equal(state.enabled, false);
    assert.equal(state.breakerTripped, true);
    assert.equal(state.lastRunStatus, "breaker");
    assert.equal(state.watermark, "10");
    assert.ok(f.audits.some((a) => a.action === "addons.scheduled-rewards" && a.breaker === true));
    // Stays off until the owner re-enables, which acknowledges the breaker.
    f.advance(60 * 60_000);
    await f.scheduler.tick();
    assert.equal(f.requests.length, 10);
    const reenabled = f.enable();
    assert.equal(reenabled.breakerTripped, false);
  } finally {
    f.cleanup();
  }
});

test("exactly the hourly budget does not trip the breaker", async () => {
  const f = fixture({ rows: Array.from({ length: 10 }, (_, i) => row(i + 1)), outbox: { ...OUTBOX, maxPerHour: 10 } });
  try {
    f.enable();
    await runOnce(f);
    assert.equal(f.requests.length, 10);
    assert.equal(f.state().breakerTripped, false);
    assert.equal(f.state().enabled, true);
  } finally {
    f.cleanup();
  }
});

test("a run never reads more than the per-run cap", async () => {
  const f = fixture({ rows: Array.from({ length: 120 }, (_, i) => row(i + 1)), outbox: { ...OUTBOX, maxPerHour: 1000 } });
  try {
    f.enable();
    await runOnce(f);
    assert.equal(f.requests.length, MAX_OUTBOX_ROWS_PER_RUN);
  } finally {
    f.cleanup();
  }
});

test("a corrupt schedule file falls back to disabled", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.config.repoRoot, "runtime/addons/jobs", ADDON), { recursive: true });
    writeFileSync(rewardSchedulePath(f.config, ADDON), "{not json");
    const state = readRewardSchedule(f.config, ADDON);
    assert.equal(state.enabled, false);
    assert.equal(state.lastRunStatus, "error");
    assert.ok(readFileSync(rewardSchedulePath(f.config, ADDON), "utf8").startsWith("{not"));
  } finally {
    f.cleanup();
  }
});
