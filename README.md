# Dune Awakening Self-Host Docker

![Docker](https://img.shields.io/badge/Docker-ready-brightgreen)
![Linux](https://img.shields.io/badge/Linux-supported-brightgreen)
![Self--Hosted](https://img.shields.io/badge/Self--Hosted-yes-brightgreen)
![GitHub](https://img.shields.io/badge/GitHub-Red--Blink-blue)
![Status](https://img.shields.io/badge/Status-experimental-orange)
![License](https://img.shields.io/badge/License-MIT-brightgreen)

A RedBlink community project for running Dune: Awakening self-host servers with Docker.

Docker-based launcher for Dune: Awakening self-host servers.

This project provides a simple `dune` command and an interactive manager for running a self-host server without remembering every script.

This is an unofficial community project. It is not affiliated with, endorsed by, sponsored by, or supported by Funcom.

## Requirements

| Requirement | Notes |
|---|---|
| Linux server or Linux PC | VPS, dedicated server, or local Linux machine |
| Docker Engine | Required |
| Docker Compose | Required |
| Funcom self-host token | Required |
| Disk space | 100 GB+ recommended |
| RAM | 20 GB+ recommended |

## Install

```bash
git clone https://github.com/Red-Blink/dune-awakening-selfhost-docker.git
cd dune-awakening-selfhost-docker
sudo runtime/scripts/install-command.sh
```

Start with the friendly menu:

```bash
dune manager
```

Or run first-time setup directly:

```bash
dune init
```

`dune init` creates a fresh local world. Running it again resets the local database/world after backing up local state.

## Public vs Local/LAN

| Mode | Who can connect? | Notes |
|---|---|---|
| Public / Internet | Players over the internet | Open or forward TCP `31982` and UDP `7777-7810` |
| Local / LAN | Players on the same network | No internet port forwarding expected |

## Common Commands

| Command | Purpose |
|---|---|
| `dune manager` | Interactive control panel |
| `dune init` | Fresh setup / reset setup |
| `dune start` | Start the stack |
| `dune stop` | Stop the stack |
| `dune ready` | Quick OK / WAIT / FAIL readiness check |
| `dune status` | Safe dashboard summary |
| `dune doctor` | Troubleshooting checks with suggested fixes |
| `dune version` | Launcher, git, build, image, and config summary |
| `dune logs <service>` | Redacted service logs |
| `dune restart <service>` | Restart one service |

`dune ready` is the fast health check. `dune status` is the fuller dashboard.

## Logs

Default logs are redacted for common tokens and IDs:

```bash
dune logs survival
dune logs director
dune logs gateway
dune logs text-router
dune logs rmq-game
```

Raw logs are available with `--raw`, but may contain sensitive data:

```bash
dune logs director --raw
```

## Updates

```bash
dune update check
dune update
dune update --yes
dune update auto enable
dune update auto disable
dune update auto status
```

Automatic updates use a systemd timer when systemd is available.

## Autoscaler And Dynamic Maps

Always-on maps:

| Map | Status |
|---|---|
| Survival_1 | Always running |
| Overmap | Always running |

Autoscaler commands:

```bash
dune autoscaler status
dune autoscaler start
dune autoscaler stop
dune autoscaler restart
dune autoscaler logs
dune servers
```

Dynamic maps use UDP `7779-7810` for game traffic and `7890-7921` for server-to-server traffic.

## Backups And Import

```bash
dune db backup
dune db list
dune db status
dune db import runtime/backups/db/<backup-file>.dump
```

Import requires confirmation and creates a pre-import backup first.

## Server Settings

Change or show the server title:

```bash
dune config title
dune config title "My New Server Name"
```

Configure memory for maps/servers:

```bash
dune memory status
dune memory set survival 12g
dune memory set overmap 8g
dune memory set default 8g
dune memory set DeepDesert_1 10g
dune memory unset DeepDesert_1
```

Memory changes apply after the affected server container is restarted.

## Runtime Files

| Path | Purpose |
|---|---|
| `.env` | Local server settings |
| `runtime/secrets/` | Local secrets, including Funcom token |
| `runtime/generated/` | Generated battlegroup, image tags, catalogs, state |
| `runtime/backups/` | Init and database backups |

These paths are ignored by git.

## Security

Your Funcom token and service credentials are sensitive.

Do not share:

- `runtime/secrets/`
- raw logs containing `ServiceAuthToken`
- raw logs containing `GameRmqSecret`
- screenshots or dumps containing player/friend identifiers

If a token is exposed, rotate it from your Funcom self-host account page.

This repository does not include Funcom game files, Docker image tarballs, tokens, secrets, or proprietary assets. Server files and images are downloaded or loaded at runtime by the user's own environment.

## Project identity

This project is created and maintained as a RedBlink community project.

Please keep the LICENSE and NOTICE files intact when redistributing or modifying this project.

This project is not affiliated with, endorsed by, sponsored by, or supported by Funcom.

## License

This project is licensed under the MIT License.

See LICENSE and NOTICE for details.
