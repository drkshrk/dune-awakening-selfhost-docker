# Web API

The RedBlink web API is intentionally not a shell proxy. Endpoints must call allowlisted RedBlink commands, direct Postgres logic, direct RabbitMQ logic, or Docker/Compose inspection/control with validation.

Base path for the native RedBlink API: `/api`.


## Implemented / Partial Foundation Routes

| Endpoint | Method | Current purpose | Real operation |
|---|---:|---|---|
| `/api/health` | GET | Basic web service health | In-process health response |
| `/api/auth/state` | GET | Session/auth state | Secure cookie session read |
| `/api/auth/login` | POST | Local admin login | Password check, session cookie, CSRF token, audit |
| `/api/auth/logout` | POST | Logout | Session clear, audit |
| `/api/setup/state` | GET | Setup file state | Checks `.env`, token, generated files, `runtime/scripts/dune` |
| `/api/setup/preflight` | POST | Host preflight | OS/CPU/RAM/disk/Docker/runtime checks |
| `/api/setup/write-config` | POST | Write selected `.env` keys | Validated key allowlist |
| `/api/setup/save-token` | POST | Save Funcom token | Writes `runtime/secrets/funcom-token.txt` with restrictive permissions |
| `/api/setup/init` | POST | Start init task | `dune init` through task runner |
| `/api/setup/tasks` | GET | List tasks | In-memory task manager |
| `/api/setup/tasks/:id` | GET | Task status | In-memory task manager |
| `/api/setup/tasks/:id/stream` | GET | Task SSE stream | Redacted task logs |
| `/api/server/status` | GET | Server status | `dune status` |
| `/api/server/readiness` | GET | Readiness | `dune ready` |
| `/api/server/ports` | GET | Ports | `dune ports` |
| `/api/server/services` | GET | Services | `dune ps` |
| `/api/server/start` | POST | Start task | `dune start` |
| `/api/server/stop` | POST | Stop task | `dune stop` |
| `/api/server/restart` | POST | Restart task | `dune stop` then `dune start` |
| `/api/server/restart-service` | POST | Restart service task | `dune restart <validated-service>` |
| `/api/logs/services` | GET | Service names | Static allowlist until dynamic discovery is added |
| `/api/logs/:service` | GET | Service logs | `dune logs <validated-service>` |
| `/api/logs/:service/stream` | GET | Service log SSE stream | `dune logs <validated-service>` |
| `/api/updates/check-game` | POST | Game update check task | `dune update check` |
| `/api/updates/apply-game` | POST | Game update task | `dune update --yes` |
| `/api/updates/check-stack` | POST | Stack update check task | `dune self-update check` |
| `/api/updates/apply-stack` | POST | Stack update task | `dune self-update install latest` |
| `/api/backups` | GET | Backup list | `dune db list` |
| `/api/backups/create` | POST | Create backup task | `dune db backup` |
| `/api/backups/restore` | POST | Restore backup task | `dune db restore <validated-backup>` |
| `/api/database/tables` | GET | Database tables | `dune database tables <schema>` |
| `/api/database/table/:name` | GET | Preview table | `dune database preview <schema.table>` |
| `/api/database/query` | POST | Advanced SQL execution | Read-only `dune database sql <query>`; destructive SQL requires confirmation phrase and pre-query `dune db backup` |
| `/api/database/export` | POST | Export read-only query results | `dune database export <query>` |
| `/api/players` | GET | Player list | `dune admin players` |
| `/api/players/:id/give-item` | POST | Give item task | `dune admin grant-item` |
| `/api/players/:id/add-xp` | POST | Add XP task | `dune admin award-xp` |
| `/api/players/:id/refill-water` | POST | Refill water task | `dune admin refill-water` |
| `/api/players/:id/kick` | POST | Kick task | `dune admin kick` |
| `/api/players/:id/teleport` | POST | Teleport task | `dune admin teleport` |
| `/api/admin/history` | GET | Admin history | `dune admin history` |
| `/api/maps` | GET | Map list | `dune maps list` |
| `/api/sietches` | GET | Sietch state | `dune sietches list` |
| `/api/deepdesert` | GET | Deep Desert status | `dune deepdesert dual status` |
| `/api/settings` | GET | Runtime settings state | Setup state/config summary |

## Not Done Yet


- `/api/players/:id/set-currency`
- `/api/maps/update`
- `/api/sietches/update`
- `/api/deepdesert/update`
- `/api/setup/install-docker`

Phase 1 cleanup must either implement these for real or remove/quarantine their frontend controls.


The full route inventory and RedBlink implementation paths are in `docs/web-feature-parity-plan.md`.
