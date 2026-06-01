import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { redact } from "./redact.js";

export const serviceAliases = new Map([
  ["postgres", "postgres"],
  ["rmq-admin", "rmq-admin"],
  ["rmq-game", "rmq-game"],
  ["text-router", "text-router"],
  ["tr", "text-router"],
  ["director", "director"],
  ["bgd", "director"],
  ["gateway", "gateway"],
  ["sgw", "gateway"],
  ["survival", "survival"],
  ["survival-1", "survival-1"],
  ["overmap", "overmap"],
  ["orchestrator", "orchestrator"],
  ["autoscaler", "autoscaler"]
]);

const simpleOperations = {
  status: ["status"],
  readiness: ["ready"],
  services: ["ps"],
  ports: ["ports"],
  start: ["start"],
  stop: ["stop"],
  updateCheck: ["update", "check"],
  updateApply: ["update", "--yes"],
  selfUpdateCheck: ["self-update", "check"],
  selfUpdateApply: ["self-update", "install", "latest"],
  backupCreate: ["db", "backup"],
  backupList: ["db", "list"],
  init: ["init"],
  dbStatus: ["database", "status"],
  mapsList: ["maps", "list"],
  sietchesList: ["sietches", "list"],
  deepdesertStatus: ["deepdesert", "dual", "status"],
  players: ["admin", "players", "--show-full-ids"],
  adminHistory: ["admin", "history"]
};

export function validateServiceName(value) {
  const raw = String(value || "").trim();
  if (/^dune-server-[a-z0-9-]+$/i.test(raw)) return raw;
  const normalized = serviceAliases.get(raw);
  if (!normalized) {
    throw new Error(`Unsupported service: ${raw}`);
  }
  return normalized;
}

export function buildDuneArgs(operation, payload = {}) {
  if (simpleOperations[operation]) return simpleOperations[operation];

  switch (operation) {
    case "restartService":
      return ["restart", validateServiceName(payload.service)];
    case "restartAll":
      return ["restart", "gateway"];
    case "logs":
      return ["logs", validateServiceName(payload.service)];
    case "backupRestore":
      return ["db", "restore", validateBackupName(payload.backup)];
    case "databaseTables":
      return ["database", "tables", payload.schema || "dune"];
    case "databasePreview":
      return ["database", "preview", validateTableName(payload.table), String(payload.limit || 50), String(payload.offset || 0)];
    case "databaseQuery":
      return ["database", "sql", validateSql(payload.query, Boolean(payload.allowDestructive))];
    case "databaseExport":
      return ["database", "export", validateSql(payload.query, false)];
    case "adminGiveItem":
      return ["admin", "grant-item", validatePlayerId(payload.playerId), validateItemName(payload.itemName), String(validateInteger(payload.quantity || 1, 1, 1000000)), String(validateInteger(payload.durability || 1, 1, 1000000000))];
    case "adminAddXp":
      return ["admin", "award-xp", validatePlayerId(payload.playerId), String(validateInteger(payload.amount, 1, 100000000))];
    case "adminRefillWater":
      return ["admin", "refill-water", validatePlayerId(payload.playerId), String(validateInteger(payload.amount || 1000000, 1, 1000000000))];
    case "adminKick":
      return ["admin", "kick", validatePlayerId(payload.playerId), "--yes", "--force"];
    case "adminTeleport":
      return [
        "admin",
        "teleport",
        validatePlayerId(payload.playerId),
        String(validateNumber(payload.x, -100000000, 100000000)),
        String(validateNumber(payload.y, -100000000, 100000000)),
        String(validateNumber(payload.z, -100000000, 100000000)),
        String(validateNumber(payload.yaw || 0, -360, 360))
      ];
    case "adminSpecializationMax":
      return ["admin", "specialization-max", String(payload.character || ""), "--grant-keystones", "--yes"];
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }
}

export function runDune(config, args, options = {}) {
  if (!existsSync(config.duneScript)) {
    return Promise.reject(new Error(`Missing dune command: ${config.duneScript}`));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(config.duneScript, args, {
      cwd: config.repoRoot,
      shell: false,
      env: { ...process.env, DUNE_ADMIN_ASSUME_YES: "1", DUNE_DB_ASSUME_YES: "1" }
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs || config.commandTimeoutMs);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = redact(chunk.toString());
      stdout += text;
      options.onLine?.(text, "stdout");
    });
    child.stderr.on("data", (chunk) => {
      const text = redact(chunk.toString());
      stderr += text;
      options.onLine?.(text, "stderr");
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      const result = { code, signal, stdout, stderr, args };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`dune ${args.join(" ")} failed with exit ${code}`), result));
    });
  });
}

function validatePlayerId(value) {
  const raw = String(value || "");
  if (raw === "*" || /^[A-Za-z0-9_:#.-]{1,128}$/.test(raw)) return raw;
  throw new Error("Invalid player id");
}

function validateInteger(value, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Expected integer ${min}-${max}`);
  return n;
}

function validateNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Expected number ${min}-${max}`);
  return n;
}

function validateItemName(value) {
  const raw = String(value || "").trim();
  if (raw && raw.length <= 200 && !/[\r\n]/.test(raw)) return raw;
  throw new Error("Invalid item name");
}

function validateTableName(value) {
  const raw = String(value || "");
  if (/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return raw;
  throw new Error("Invalid table name");
}

function validateBackupName(value) {
  const raw = String(value || "");
  if (/^[A-Za-z0-9._-]+$/.test(raw) && !raw.includes("..")) return raw;
  throw new Error("Invalid backup name");
}

export function isReadOnlySql(query) {
  const raw = String(query || "").trim();
  return /^(select|with|show|explain)\b/i.test(raw) && !/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy\s+.*\s+from)\b/i.test(raw);
}

function validateSql(query, allowDestructive) {
  const raw = String(query || "").trim();
  if (!raw || raw.length > 100000) throw new Error("Invalid SQL query");
  if (!allowDestructive && !isReadOnlySql(raw)) throw new Error("Only read-only SQL is allowed without destructive confirmation");
  return raw;
}
