# Web Security

The web admin has host and game-server control power. Treat it as an admin-only local operations surface.

## Authentication

- The API uses a local admin password and secure session cookie.
- State-changing requests require a CSRF token from the authenticated session.
- `AUTH_DISABLED=true` is allowed only for local development.
- Login and logout are audit logged.

## Command Safety

All command execution must use the safe command runner:

- no arbitrary shell commands from the frontend
- no dynamic `sh -c`
- allowlisted RedBlink operations only
- validate service names, player IDs, item IDs, map names, backup names, filenames, and paths
- enforce timeouts
- redact secrets from stdout/stderr/task logs
- write audit entries for high-risk operations

Allowed command families are RedBlink `runtime/scripts/dune` operations and narrowly scoped Docker inspection/control where needed.

## Direct Database Safety

Direct Postgres features must:

- discover connection details from the RedBlink Docker/runtime environment
- use parameterized queries where available
- validate schema/table names against database metadata
- create a backup before destructive mutations unless an existing safe RedBlink command already does so
- require explicit confirmation for destructive SQL
- support read-only mode
- redact secrets and sensitive tokens from logs

## RabbitMQ Safety

RabbitMQ live commands must:

- use known RedBlink game/admin exchange and routing details only
- validate target player/account IDs
- audit every broadcast, whisper, kick, item grant, teleport, or live command
- avoid exposing a generic message publisher to the browser

## Docker Socket Risk

Container mode may require mounting `/var/run/docker.sock`. That grants broad control over the host Docker daemon. Documentation and compose comments must warn that this is powerful and should be exposed only to trusted admins.

## Host Bootstrap

Host-level bootstrap such as Docker installation is disabled by default.

If `ALLOW_HOST_BOOTSTRAP=true` is set:

- every command must be displayed before execution
- explicit confirmation is required
- Ubuntu/Debian must be supported first
- unsupported systems must show manual instructions only

## Audit Log

Audit logging is required for:

- login/logout
- setup/config changes
- start/stop/restart
- updates
- backup/restore/import/delete
- admin player actions
- SQL execution
- file upload/download/restore
- RabbitMQ live commands
