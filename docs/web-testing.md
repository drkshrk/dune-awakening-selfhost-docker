# Web Testing

This document tracks how to verify the RedBlink web admin while feature parity is built.

## Automated Test Requirements

Backend tests must cover:

- command allowlist
- service validation
- path validation
- secret redaction
- auth middleware
- CSRF protection for state-changing requests
- task lifecycle
- task log streaming redaction
- Docker status parsing
- database connection discovery
- backup/restore task creation
- admin command wrappers
- SQL destructive detection

Frontend tests must cover:

- API client request/response handling
- critical pages render
- setup wizard state
- player/admin action forms
- dangerous confirmation dialogs
- log viewer redaction/search/pause behavior

## Current Verification

Current verification:

- `npm test` in `admin-server/` passes.
- `npm run build` in `web/` passes.
- Backend tests currently cover signed sessions, CSRF rejection/acceptance, service validation, command allowlist, noninteractive update flags, backup name validation, item validation, teleport argument validation, SQL read-only/destructive detection, and secret redaction.
- `docker compose -f docker-compose.web.yml config` passed previously.
- HTTP bind smoke test could not run inside the sandbox because binding returned `EPERM`.


## Manual Verification Pattern

For every feature promoted to Done, add a note with:

- web page/component used
- API endpoint called
- RedBlink command, SQL, Docker, or RabbitMQ operation executed
- whether a backup was created
- confirmation prompt used for destructive actions
- expected output or state change

## Mock Mode

Mock mode is allowed only for UI development. It must be clearly separated from real mode and must not be used as evidence that a feature is Done.
