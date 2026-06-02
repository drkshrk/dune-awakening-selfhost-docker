import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { buildDuneArgs, runDune } from "./runner.js";
import { resolveCatalogItem } from "./adminCatalog.js";

const DEFAULT_CONFIG = {
  enabled: false,
  version: "starter-kit-v1",
  items: [],
  xp: 0,
  allowRepeatGrants: false,
  autoGrantEnabled: false,
  autoGrantIntervalSeconds: 60,
  grantWhen: "first_seen"
};

export function starterKitCapabilities() {
  return {
    config: true,
    manualGrant: true,
    bulkGrant: true,
    retryFailedGrant: true,
    automaticScanner: true,
    currency: false,
    reason: "Starter Kit grants use existing RedBlink dune admin grant-item/grant-item-id and award-xp commands. Auto-grant is disabled by default and only scans when the Starter Kit and auto-grant are both explicitly enabled."
  };
}

export function starterKitConfig(config) {
  return readConfig(config);
}

export function saveStarterKitConfig(config, body) {
  const next = validateStarterKitConfig(body);
  writeConfig(config, next);
  return next;
}

export function enableStarterKit(config, enabled) {
  const next = { ...readConfig(config), enabled: Boolean(enabled) };
  writeConfig(config, next);
  return next;
}

export function starterKitHistory(config, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const file = grantsPath(config);
  if (!existsSync(file)) return { rows: [] };
  const rows = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-safeLimit)
    .map((line) => JSON.parse(line))
    .reverse();
  return { rows };
}

export function starterKitEligiblePlayers(config, players = []) {
  const kit = readConfig(config);
  const history = starterKitHistory(config, 500).rows;
  return {
    config: kit,
    rows: players.map((player) => eligibilityForPlayer(kit, history, normalizePlayer(player)))
  };
}

export async function grantEligibleStarterKits(config, players = [], body = {}) {
  const phrase = "GRANT STARTER KIT TO ELIGIBLE PLAYERS";
  if (body.confirmation !== phrase) throw new Error(`Confirmation phrase required: ${phrase}`);
  const kit = readConfig(config);
  if (!kit.items.length && !kit.xp) throw new Error("Starter Kit has no configured items or XP");
  const rows = starterKitEligiblePlayers(config, players).rows;
  const results = [];
  for (const player of rows) {
    if (!player.eligible) {
      const row = skippedGrant(config, kit, player, player.reason || "not eligible", "bulk");
      results.push(row);
      continue;
    }
    try {
      results.push(await grantStarterKit(config, player.action_player_id, {
        confirmation: "GRANT STARTER KIT",
        source: "bulk",
        characterName: player.character_name,
        actorId: player.actor_id
      }));
    } catch (error) {
      const row = failedGrant(config, kit, player, error.message || String(error), "bulk");
      results.push(row);
    }
  }
  return summarizeGrantResults(results);
}

export async function runStarterKitAutoScan(config, players = [], source = "auto") {
  const kit = readConfig(config);
  if (!kit.enabled) return { ok: true, skipped: true, reason: "Starter Kit is disabled", results: [] };
  if (!kit.autoGrantEnabled) return { ok: true, skipped: true, reason: "Auto-grant is disabled", results: [] };
  if (!kit.items.length && !kit.xp) return { ok: true, skipped: true, reason: "Starter Kit has no configured items or XP", results: [] };
  const rows = starterKitEligiblePlayers(config, players).rows;
  const results = [];
  for (const player of rows) {
    if (!player.eligible) {
      results.push(skippedGrant(config, kit, player, player.reason || "not eligible", source));
      continue;
    }
    try {
      results.push(await grantStarterKit(config, player.action_player_id, {
        confirmation: "GRANT STARTER KIT",
        source,
        characterName: player.character_name,
        actorId: player.actor_id
      }));
    } catch (error) {
      results.push(failedGrant(config, kit, player, error.message || String(error), source));
    }
  }
  return summarizeGrantResults(results);
}

export async function grantStarterKit(config, playerId, body = {}) {
  const phrase = "GRANT STARTER KIT";
  if (body.confirmation !== phrase) throw new Error(`Confirmation phrase required: ${phrase}`);
  const kit = readConfig(config);
  validatePlayerTarget(playerId);
  if (!kit.items.length && !kit.xp) throw new Error("Starter Kit has no configured items or XP");
  if (!kit.allowRepeatGrants && hasSuccessfulGrant(config, playerId, kit.version)) {
    throw new Error(`Starter Kit ${kit.version} was already granted to ${playerId}`);
  }

  const grantId = randomUUID();
  const startedAt = new Date().toISOString();
  const results = [];
  for (const item of kit.items) {
    try {
      const resolved = resolveCatalogItem(config.repoRoot, item.itemId ? { itemId: item.itemId } : { itemName: item.itemName });
      const operation = item.itemId ? "adminGiveItemId" : "adminGiveItem";
      const payload = {
        playerId,
        itemId: resolved.itemId,
        itemName: resolved.name,
        quantity: item.quantity,
        durability: item.durability
      };
      const command = buildDuneArgs(operation, payload);
      const result = config.mockMode ? { code: 0, stdout: "mock starter item grant\n", stderr: "" } : await runDune(config, command);
      results.push({ ok: true, operation, item: payload, stdout: result.stdout, stderr: result.stderr, exitCode: result.code });
    } catch (error) {
      results.push({ ok: false, item, error: error.message || String(error) });
    }
  }
  if (kit.xp > 0) {
    try {
      const payload = { playerId, amount: kit.xp };
      const command = buildDuneArgs("adminAddXp", payload);
      const result = config.mockMode ? { code: 0, stdout: "mock starter xp grant\n", stderr: "" } : await runDune(config, command);
      results.push({ ok: true, operation: "adminAddXp", amount: kit.xp, stdout: result.stdout, stderr: result.stderr, exitCode: result.code });
    } catch (error) {
      results.push({ ok: false, operation: "adminAddXp", amount: kit.xp, error: error.message || String(error) });
    }
  }
  const ok = results.every((result) => result.ok);
  const row = { id: grantId, playerId, action_player_id: playerId, actor_id: body.actorId || "", character_name: body.characterName || "", source: body.source || "manual", version: kit.version, status: ok ? "granted" : "failed", ok, startedAt, finishedAt: new Date().toISOString(), results };
  appendGrant(config, row);
  return row;
}

export async function retryStarterKitGrant(config, grantId, body = {}) {
  const phrase = "RETRY STARTER KIT";
  if (body.confirmation !== phrase) throw new Error(`Confirmation phrase required: ${phrase}`);
  const existing = starterKitHistory(config, 500).rows.find((row) => row.id === grantId);
  if (!existing) throw new Error("Starter Kit grant was not found");
  if (existing.ok) throw new Error("Only failed Starter Kit grants can be retried");
  return grantStarterKit(config, existing.playerId, { confirmation: "GRANT STARTER KIT" });
}

export function validateStarterKitConfig(body = {}) {
  const enabled = Boolean(body.enabled);
  const version = validateVersion(body.version || DEFAULT_CONFIG.version);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length > 25) throw new Error("Starter Kit supports at most 25 item entries");
  const items = rawItems.map(validateStarterKitItem);
  const xp = validateInteger(body.xp ?? 0, "xp", 0, 100000000);
  return {
    enabled,
    version,
    items,
    xp,
    allowRepeatGrants: Boolean(body.allowRepeatGrants),
    autoGrantEnabled: Boolean(body.autoGrantEnabled),
    autoGrantIntervalSeconds: validateInteger(body.autoGrantIntervalSeconds ?? DEFAULT_CONFIG.autoGrantIntervalSeconds, "autoGrantIntervalSeconds", 60, 3600),
    grantWhen: validateGrantWhen(body.grantWhen || DEFAULT_CONFIG.grantWhen)
  };
}

function eligibilityForPlayer(kit, history, player) {
  if (!player.action_player_id) return { ...player, eligible: false, reason: "Missing admin action ID" };
  if (kit.grantWhen === "first_online" && String(player.online_status || "").toLowerCase() !== "online") {
    return { ...player, eligible: false, reason: "Not currently online" };
  }
  if (!kit.allowRepeatGrants && history.some((row) => row.ok && row.version === kit.version && row.playerId === player.action_player_id)) {
    return { ...player, eligible: false, reason: `Already granted version ${kit.version}` };
  }
  return { ...player, eligible: true, reason: "" };
}

function normalizePlayer(player = {}) {
  return {
    actor_id: player.actor_id || player.player_pawn_id || "",
    player_pawn_id: player.player_pawn_id || player.actor_id || "",
    account_id: player.account_id || "",
    character_name: player.character_name || "",
    online_status: player.online_status || "",
    action_player_id: player.action_player_id || player.fls_id || player.funcom_id || (player.account_id ? String(player.account_id) : "")
  };
}

function hasSuccessfulGrant(config, playerId, version) {
  return starterKitHistory(config, 500).rows.some((row) => row.ok && row.version === version && row.playerId === playerId);
}

function skippedGrant(config, kit, player, reason, source) {
  const now = new Date().toISOString();
  const row = { id: randomUUID(), playerId: player.action_player_id || "", action_player_id: player.action_player_id || "", actor_id: player.actor_id || "", character_name: player.character_name || "", source, version: kit.version, status: "skipped", ok: true, startedAt: now, finishedAt: now, reason, results: [] };
  appendGrant(config, row);
  return row;
}

function failedGrant(config, kit, player, reason, source) {
  const now = new Date().toISOString();
  const row = { id: randomUUID(), playerId: player.action_player_id || "", action_player_id: player.action_player_id || "", actor_id: player.actor_id || "", character_name: player.character_name || "", source, version: kit.version, status: "failed", ok: false, startedAt: now, finishedAt: now, reason, results: [{ ok: false, error: reason }] };
  appendGrant(config, row);
  return row;
}

function summarizeGrantResults(results) {
  return {
    ok: results.every((row) => row.ok),
    granted: results.filter((row) => row.status === "granted").length,
    skipped: results.filter((row) => row.status === "skipped").length,
    failed: results.filter((row) => row.status === "failed").length,
    results
  };
}

function validateStarterKitItem(item = {}) {
  const itemName = String(item.itemName || "").trim();
  const itemId = String(item.itemId || "").trim();
  if (!itemName && !itemId) throw new Error("Starter Kit item requires itemName or itemId");
  if (itemName && (itemName.length > 240 || /[\r\n]/.test(itemName))) throw new Error("Invalid Starter Kit item name");
  if (itemId && !/^[A-Za-z0-9_./:-]{1,240}$/.test(itemId)) throw new Error("Invalid Starter Kit item id");
  return {
    itemName,
    itemId,
    quantity: validateInteger(item.quantity ?? 1, "quantity", 1, 1000000),
    durability: validateNumber(item.durability ?? 1, "durability", 0, 1)
  };
}

function validatePlayerTarget(value) {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_#./:-]{1,160}$/.test(raw)) return raw;
  throw new Error("Invalid player id");
}

function validateVersion(value) {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_.:-]{1,80}$/.test(raw)) return raw;
  throw new Error("Invalid Starter Kit version");
}

function validateGrantWhen(value) {
  const raw = String(value || "").trim();
  if (["first_seen", "first_online"].includes(raw)) return raw;
  throw new Error("grantWhen must be first_seen or first_online");
}

function validateInteger(value, name, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return number;
}

function validateNumber(value, name, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} must be a number from ${min} to ${max}`);
  return number;
}

function configPath(config) {
  return resolve(config.generatedDir, "starter-kit.json");
}

function grantsPath(config) {
  return resolve(config.generatedDir, "starter-kit-grants.jsonl");
}

function readConfig(config) {
  const file = configPath(config);
  if (!existsSync(file)) return DEFAULT_CONFIG;
  return validateStarterKitConfig(JSON.parse(readFileSync(file, "utf8")));
}

function writeConfig(config, value) {
  const file = configPath(config);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch {}
}

function appendGrant(config, row) {
  const file = grantsPath(config);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch {}
}
