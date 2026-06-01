# Arrakis Server Console

Arrakis Server Console is the web admin interface for this Docker-native Dune: Awakening self-host repository.

It does not replace the runtime scripts. The backend wraps `runtime/scripts/dune` through an allowlisted API so the existing CLI, Docker Compose stack, backups, updates, logs, and admin tools remain the source of truth.

## Run Locally

Backend:

```bash
cd admin-server
npm install
DUNE_DOCKER_DIR=/home/ubuntu/dune-awakening-selfhost-docker npm run dev
```

Frontend:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to `http://127.0.0.1:8088`.

## Production Build

```bash
cd web
npm install
npm run build
cd ../admin-server
npm install
npm start
```

The backend serves `web/dist` when present.

## Container Mode

```bash
docker compose -f docker-compose.web.yml up -d --build
```

The container mounts this repo at `/repo` and mounts `/var/run/docker.sock` so the backend can run the existing Docker-backed scripts. Docker socket access is powerful; only expose this UI to trusted admins.

