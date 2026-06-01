# Web Development

Backend tests:

```bash
cd admin-server
npm test
```

Frontend dev:

```bash
cd web
npm install
npm run dev
```

Mock mode:

```bash
cd admin-server
ADMIN_MOCK_MODE=1 ADMIN_AUTH_DISABLED=1 npm run dev
```

Mock mode returns safe placeholder command output so frontend work does not require a running Dune server.

Backend design:

- `src/runner.js`: safe allowlisted command mapping
- `src/tasks.js`: long-running background tasks
- `src/auth.js`: local password/session/CSRF
- `src/preflight.js`: host setup checks
- `src/server.js`: HTTP API and static frontend serving

