import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { redact } from "./redact.js";

export function audit(config, req, action, detail = {}) {
  mkdirSync(dirname(config.auditLog), { recursive: true });
  const row = {
    timestamp: new Date().toISOString(),
    action,
    method: req?.method,
    path: req?.url,
    remote: req?.socket?.remoteAddress,
    detail: JSON.parse(redact(JSON.stringify(detail)))
  };
  appendFileSync(config.auditLog, `${JSON.stringify(row)}\n`, { mode: 0o600 });
}
