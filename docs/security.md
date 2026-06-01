# Web Admin Security

Arrakis Server Console is an administrative control surface.

Security defaults:

- Local admin password generated at `runtime/secrets/admin-web-password.txt`
- Signed HTTP-only session cookie
- CSRF token required for state-changing requests
- No arbitrary shell endpoint
- All operations pass through allowlisted adapters
- Secrets are redacted from task output and audit logs
- High-risk actions are recorded in `runtime/generated/web-admin-audit.jsonl`

Development-only bypass:

```bash
ADMIN_AUTH_DISABLED=1 npm run dev
```

Do not expose the web UI to the public internet without an additional trusted reverse proxy, TLS, and access controls.

Container mode mounts `/var/run/docker.sock`. Docker socket access is equivalent to powerful host control. Treat access to the UI as host-admin access.

