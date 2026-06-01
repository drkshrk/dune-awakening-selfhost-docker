# Docker Web Admin Deployment

Run the web UI beside the existing stack:

```bash
docker compose -f docker-compose.web.yml up -d --build
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_BIND_HOST` | `0.0.0.0` | Backend bind address |
| `ADMIN_BIND_PORT` | `8088` | Backend port |
| `DUNE_DOCKER_DIR` | `/repo` in container | Runtime repo path |
| `ADMIN_AUTH_DISABLED` | `0` | Disable auth only for local development |
| `ALLOW_HOST_BOOTSTRAP` | `false` | Enable future host bootstrap actions |
| `ADMIN_MOCK_MODE` | `0` | Return mock command output for UI work |

The compose file uses host networking and mounts:

- the repository directory
- `/var/run/docker.sock`

This is required so the backend can call the existing Docker-native runtime scripts.

