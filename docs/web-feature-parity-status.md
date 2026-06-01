# Web Feature Parity Status

This file is the working status ledger for the RedBlink web admin interface. A feature is not Done unless it has a frontend UI, backend endpoint, real RedBlink Docker/DB/RMQ logic, clear errors, safety confirmation where needed, and at least one test or manual verification note.

## Current Overall Status

| Area | Status | Reason |
|---|---|---|
| Phase 1 foundation | Partial | Auth/session/CSRF/task/audit/safe-runner basics exist; several placeholder routes were removed or replaced with real validated operations; broader parity coverage and tests are still incomplete. |

## Feature Group Status

| Feature group | Status | Exact reason if Partial / Blocked / Not Implemented | Test or manual verification |
|---|---|---|---|
| Status / connection / config | Partial | Basic web auth/state and command wrappers exist; structured RedBlink status/config parity does not. | Existing auth/runner tests only. |
| Server lifecycle / Server Control | Partial | Start/stop/restart/status wrappers exist; Docker service discovery, backup upload/download, scheduled restart, and doctor UI parity are missing. | Needs tests. |
| Server settings | Not Implemented | No full editor for `.env`, UserGame/UserEngine, sietch, memory, and restart impact metadata. | Needs tests. |
| Players / profiles | Partial | CLI-backed player list exists; inventory, profile modules, history, vehicles, events, dungeons, stats require DB/RMQ port. | Needs tests. |
| Database | Partial | Tables/preview wrappers exist; SQL/export now call real `dune database` commands, and destructive SQL requires confirmation plus backup; full browser/search/parity UI is still incomplete. | Runner SQL safety tests pass; more endpoint/UI tests needed. |
| Logs | Partial | Basic service log route exists; dynamic discovery, download, raw confirmation, cheat/admin logs are incomplete. | Needs tests. |
| Live map | Not Implemented | No marker/player/base query adapter or map UI parity yet. | Needs tests. |
| Storage | Not Implemented | No storage DB logic or UI yet. | Needs tests. |
| Blueprints | Not Implemented | No blueprint import/export logic or UI yet. | Needs tests. |
| Bases | Not Implemented | No base query/export logic or UI yet. | Needs tests. |
| Market | Not Implemented | No market DB query layer or UI yet. | Needs tests. |
| Starter Kit | Not Implemented | No welcome package/starter kit backend or UI yet. | Needs tests. |
| Notifications / broadcast / chat | Not Implemented | Broadcast, shutdown broadcast, whisper, and generic notify routes are not wired for RedBlink RMQ yet. | Needs tests. |
| Updates | Partial | Basic update task wrappers exist; release listing, auto-update controls, repair, and UI parity are incomplete. | Needs tests. |
| Setup wizard | Partial | Existing setup wizard scaffold exists; must be cleaned up and kept separate from parity features. | Needs tests. |
| Security / audit / tasks | Partial | Auth, CSRF, task, audit, redaction exist; runner validation expanded for update flags, backups, SQL, item names, and teleport; task lifecycle and endpoint tests still need expansion. | Auth/CSRF and runner tests pass. |

## Blocked Items

No feature group is currently marked Blocked. Features without a known reliable RedBlink implementation path are Not Implemented until a direct schema/RMQ/runtime audit proves whether they can work.

## Completion Rule

When a feature moves to Done, add:

- backend endpoint path
- frontend page/component path
- command, SQL, Docker, or RMQ operation used
- confirmation/backup behavior for dangerous actions
- automated test name or manual verification command
