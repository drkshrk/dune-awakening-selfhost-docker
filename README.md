# Dune Awakening Self-Host Docker

Experimental Docker-native launcher for Dune: Awakening self-host server components.

This project replaces the normal local/k3s-style setup with Docker containers and a simple `dune` command wrapper.

## Current working stack

Core services:

- Postgres
- RabbitMQ admin
- RabbitMQ game TLS
- TextRouter
- Director
- ServerGateway

Always-on game servers:

- Overmap
- Survival_1

Dedicated/on-demand maps are not fully automated yet. The current MVP starts the minimal always-on farm and leaves future work for dynamic map spawning.

## Requirements

- Linux server/VPS
- Docker Engine
- Docker Compose
- UFW or equivalent firewall
- Valid Funcom self-host token
- SteamCMD access through the orchestrator container
- An existing/generated Funcom self-host battlegroup ID

> First-time battlegroup creation/discovery is not automated yet. A future `dune init` command should handle that. For now, this MVP expects you to import an existing/generated battlegroup ID.

## Ports

Public ports:

- TCP 31982: RabbitMQ game TLS
- UDP 7777-7810: Game servers
- UDP 7888: Survival_1 server-to-server
- UDP 7889: Overmap server-to-server

Localhost-only ports:

- TCP 15432: Postgres
- TCP 32573: RabbitMQ admin
- TCP 5059: TextRouter
- TCP 11717: Director

## Setup

Clone the repo:

```bash
git clone https://github.com/Red-Blink/dune-awakening-selfhost-docker.git
cd dune-awakening-selfhost-docker
```

Create `.env` from the example:

```bash
cp .env.example .env
nano .env
```

Example `.env`:

```env
SERVER_IP=auto
SERVER_TITLE="My Dune Server"
SERVER_REGION="Europe Test"
STEAM_APP_ID=3104830
```

Create the local secret file:

```bash
mkdir -p runtime/secrets
nano runtime/secrets/funcom-token.txt
chmod 600 runtime/secrets/funcom-token.txt
```

Import your existing/generated battlegroup ID:

```bash
mkdir -p runtime/generated
nano runtime/generated/battlegroup.env
```

Example `runtime/generated/battlegroup.env`:

```env
BATTLEGROUP_ID=sh-your-generated-funcom-battlegroup-id
```

Do not commit `.env`, `runtime/secrets/`, or `runtime/generated/`.

Install the command wrapper:

```bash
sudo runtime/scripts/install-command.sh
```

Start:

```bash
dune start
```

Check readiness:

```bash
dune ready
```

Status:

```bash
dune status
```

Ports:

```bash
dune ports
```

Logs:

```bash
dune logs survival
dune logs overmap
dune logs director
dune logs gateway
```

Stop:

```bash
dune stop
```

## Updating

The command exists:

```bash
dune update
```

Current behavior:

1. Stops Overmap and Survival_1.
2. Runs SteamCMD `app_update`.
3. Loads Funcom image tarballs.
4. Detects updated Docker image tags.
5. Runs DB migration/update.

After update, restart services manually:

```bash
dune restart text-router
dune restart director
dune restart gateway
dune restart survival
dune restart overmap
```

Automatic restarts after update are planned.

## Important design notes

The Docker image should contain the orchestrator code, not baked-in old game files. Game server files and Funcom image tarballs are downloaded and updated at runtime into persistent volumes.

The Funcom token and `BATTLEGROUP_ID` might be linked. Use the battlegroup ID generated/authorized for your token.

The current MVP is best understood as an import-and-run workflow for an existing/generated Funcom self-host battlegroup. First-time battlegroup generation/discovery should be added later as `dune init`.

## Current limitations

- First-time battlegroup creation/discovery is not automated yet.
- Dedicated/on-demand maps are not automated yet.
- The fake Kubernetes service account/IGWO behavior is a compatibility workaround.
- Overmap and Survival_1 are always-on.
- Update flow is scaffolded but still needs real-world testing after an actual upstream update.
- This is experimental and should not be treated as production-ready.
