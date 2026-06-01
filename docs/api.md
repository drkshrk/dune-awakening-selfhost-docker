# Arrakis Server Console API

All dangerous endpoints require authentication and CSRF protection unless `ADMIN_AUTH_DISABLED=1`.

Implemented in Phase 1:

- `GET /api/auth/state`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/setup/state`
- `POST /api/setup/preflight`
- `POST /api/setup/write-config`
- `POST /api/setup/save-token`
- `POST /api/setup/init`
- `GET /api/setup/tasks`
- `GET /api/setup/tasks/:id`
- `GET /api/setup/tasks/:id/stream`
- `GET /api/server/status`
- `GET /api/server/readiness`
- `GET /api/server/ports`
- `GET /api/server/services`
- `POST /api/server/start`
- `POST /api/server/stop`
- `POST /api/server/restart`
- `POST /api/server/restart-service`
- `GET /api/logs/services`
- `GET /api/logs/:service`
- `GET /api/logs/:service/stream`
- `POST /api/updates/check-game`
- `POST /api/updates/apply-game`
- `POST /api/updates/check-stack`
- `POST /api/updates/apply-stack`
- `GET /api/backups`
- `POST /api/backups/create`
- `POST /api/backups/restore`
- `GET /api/database/tables`
- `GET /api/database/table/:name`
- `GET /api/players`
- `POST /api/players/:id/give-item`
- `POST /api/players/:id/add-xp`
- `POST /api/players/:id/refill-water`
- `POST /api/players/:id/kick`
- `GET /api/admin/history`
- `GET /api/maps`
- `GET /api/sietches`
- `GET /api/deepdesert`
- `GET /api/settings`
- `POST /api/settings`

Some Phase 4/5 endpoints currently return `501` until the UI includes the required confirmations and validation.

