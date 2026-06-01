# Web Feature Parity Status

This file is the working status ledger for the RedBlink web admin interface. A feature is not Done unless it has a frontend UI, backend endpoint, real RedBlink Docker/DB/RMQ logic, clear errors, safety confirmation where needed, and at least one test or manual verification note.

## Current Overall Status

| Area | Status | Reason |
|---|---|---|
| Phase 1 foundation | Partial | Auth/session/CSRF/task/audit/safe-runner basics exist; several placeholder routes were removed or replaced with real validated operations; broader parity coverage and tests are still incomplete. |
| Phase 2 server operations | Done | Server status/readiness/ports/services/doctor, lifecycle tasks, service restart, logs, backup list/create/restore/delete, and update tasks are wired to real RedBlink commands with frontend controls and task streaming. |

## Feature Group Status

| Feature group | Status | Exact reason if Partial / Blocked / Not Implemented | Test or manual verification |
|---|---|---|---|
| Server lifecycle / Server Control | Partial | Phase 2 server status/readiness/ports/services/doctor/start/stop/restart/restart-service are done through real RedBlink commands; broader parity items such as backup upload/download and scheduled restart controls remain. | Runner lifecycle mapping tests pass; frontend build passes. |
| Server settings | Not Implemented | No full editor for `.env`, UserGame/UserEngine, sietch, memory, and restart impact metadata. | Needs tests. |
| Players / profiles | Partial | CLI-backed player list exists; inventory, profile modules, history, vehicles, events, dungeons, stats require DB/RMQ port. | Needs tests. |
| Database | Partial | Tables/preview wrappers exist; SQL/export now call real `dune database` commands, and destructive SQL requires confirmation plus backup; full browser/search/parity UI is still incomplete. | Runner SQL safety tests pass; more endpoint/UI tests needed. |
| Logs | Partial | Phase 2 service logs are wired through `/api/logs/services`, `/api/logs/:service`, `/stream`, and `/download`; known services use `dune logs`, safely discovered dynamic `dune-server-*` containers use validated Docker logs. Cheat/admin logs remain for later parity work. | Runner log validation tests pass; frontend build passes. |
| Live map | Not Implemented | No marker/player/base query adapter or map UI parity yet. | Needs tests. |
| Storage | Not Implemented | No storage DB logic or UI yet. | Needs tests. |
| Blueprints | Not Implemented | No blueprint import/export logic or UI yet. | Needs tests. |
| Bases | Not Implemented | No base query/export logic or UI yet. | Needs tests. |
| Market | Not Implemented | No market DB query layer or UI yet. | Needs tests. |
| Starter Kit | Not Implemented | No welcome package/starter kit backend or UI yet. | Needs tests. |
| Notifications / broadcast / chat | Not Implemented | Broadcast, shutdown broadcast, whisper, and generic notify routes are not wired for RedBlink RMQ yet. | Needs tests. |
| Updates | Partial | Phase 2 game/stack check/apply task wrappers are done; release listing, auto-update controls, and repair remain for later phases. | Runner update mapping tests pass; frontend build passes. |
| Setup wizard | Partial | Existing setup wizard scaffold exists; must be cleaned up and kept separate from parity features. | Needs tests. |
| Security / audit / tasks | Partial | Auth, CSRF, task, audit, redaction exist; runner validation expanded for update flags, backups, SQL, item names, and teleport; task lifecycle and endpoint tests still need expansion. | Auth/CSRF and runner tests pass. |
| Backups | Partial | Phase 2 list/create/restore/delete are wired to `dune db list`, `backup`, `restore`, and `delete`; restore/delete require frontend confirmation and validate backup names server-side. Upload/download parity remains. | Runner backup validation and task lifecycle tests pass; frontend build passes. |

## Blocked Items

No feature group is currently marked Blocked. Features without a known reliable RedBlink implementation path are Not Implemented until a direct schema/RMQ/runtime audit proves whether they can work.

## Completion Rule

When a feature moves to Done, add:

- backend endpoint path
- frontend page/component path
- command, SQL, Docker, or RMQ operation used
- confirmation/backup behavior for dangerous actions
- automated test name or manual verification command
