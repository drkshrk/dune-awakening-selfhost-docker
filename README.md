# Dune Awakening Self-Host Docker

<p align="center">
  <img src="assets/cover.png" alt="Dune Awakening Self-Host Docker cover" />
</p>

![Docker](https://img.shields.io/badge/Docker-ready-brightgreen)
![Linux](https://img.shields.io/badge/Linux-supported-brightgreen)
![Self--Hosted](https://img.shields.io/badge/Self--Hosted-yes-brightgreen)
![Status](https://img.shields.io/badge/Status-experimental-orange)
![License](https://img.shields.io/badge/License-MIT-brightgreen)

A community tool for running a self-hosted Dune: Awakening dedicated server with Docker.

The easiest way to use this project is the guided menu:

```bash
dune manager
```

This project is unofficial. It is not affiliated with, endorsed by, sponsored by, or supported by Funcom.

## Who This Is For

- Server owners who want a guided menu instead of memorizing Docker commands.
- Technical users who want direct CLI and Docker control.
- Admins who need backups, updates, logs, settings, database tools, and live admin tools.

## Beginner Quick Start

### 1. What You Need

| Requirement | Plain explanation |
|---|---|
| Linux server | Ubuntu 24.04.4 LTS is the known target. |
| Docker Engine and Docker Compose | Docker runs the server pieces for you. |
| Funcom self-host token | Required to authenticate your self-host server. |
| CPU with AVX and AVX2 | Required by the game server. |
| Disk space | 100 GB or more recommended. |
| RAM | 20 GB minimum for a basic layout; more for extra maps. |

RAM guide:

| Server layout | Recommended RAM |
|---|---:|
| Basic Hagga Basin / Sietch layout | 20 GB |
| Hagga Basin plus story/social maps | 30 GB |
| Hagga Basin plus story/social maps plus Deep Desert | 40 GB |

If map containers fail with `Illegal instruction (core dumped)`, the machine usually does not expose AVX/AVX2 to Linux. This is common with some virtual machines and must be fixed in the host or hypervisor, not inside Ubuntu.

### 2. Download And Install The `dune` Command

```bash
git clone https://github.com/Red-Blink/dune-awakening-selfhost-docker.git
cd dune-awakening-selfhost-docker
sudo runtime/scripts/install-command.sh
```

The installer creates `/usr/local/bin/dune`, so you can run `dune manager` from anywhere. If you move the repo later, either reinstall the command or set `DUNE_DOCKER_DIR=/path/to/dune-awakening-selfhost-docker`.

### 3. First-Time Setup

```bash
dune init
```

`dune init` asks for your server name, region, hosting mode, and Funcom token. It then creates local config, stores the token under `runtime/secrets/`, generates the battlegroup identity, downloads or prepares server files, initializes the database, and starts the stack.

Important: running `dune init` again later is a reset-style flow. It backs up local state first, but it can replace the local world database.

### 4. Use The Friendly Manager

```bash
dune manager
```

For normal use, stay in the manager:

1. Open `Battlegroup Settings`.
2. Choose `Start` to start the server.
3. Open `Battlegroup Overview`.
4. Choose `Readiness Check` or `Safe Dashboard`.
5. Open `Logs` if something is still warming up.
6. Choose `Stop` from `Battlegroup Settings` when you want to shut the server down safely.

Interactive terminals show a selector. Use Up and Down to move, Enter to select, and Back entries to return. Numbered prompts are used automatically when the terminal cannot draw the selector.

## The Easy Way: Dune Manager

Run:

```bash
dune manager
```

The manager is the recommended path for non-technical users.

| Manager menu | What it is for |
|---|---|
| Battlegroup Overview | Safe status, readiness, version, containers, and ports. |
| Battlegroup Settings | Start, stop, restart, name, scheduled restart, redeploy, maps, autoscaler, and database maintenance. |
| Sietches | Map settings, memory, UserGame/UserEngine settings, dimension settings, display names, and passwords where supported. |
| Updates | Stack update checks, game server update checks, runtime file repair, and automatic game updates. |
| Logs | Redacted logs for Survival, Overmap, Director, Gateway, TextRouter, RabbitMQ, and autoscaler. |
| Admin Tools | Live admin actions such as item grants, kick player, XP, water refill, vehicle spawn, and history. |
| Advanced Tools | Shell inside orchestrator, doctor diagnostics, and database browser. |

Common beginner tasks:

| Task | Beginner path | Direct command |
|---|---|---|
| Start server | `dune manager` -> `Battlegroup Settings` -> `Start` | `dune start` |
| Stop server | `dune manager` -> `Battlegroup Settings` -> `Stop` | `dune stop` |
| Restart server | `dune manager` -> `Battlegroup Settings` -> `Restart` | `dune stop` then `dune start` |
| Check status | `Battlegroup Overview` -> `Safe Dashboard` | `dune status` |
| Quick readiness | `Battlegroup Overview` -> `Readiness Check` | `dune ready` |
| View logs | `Logs` menu | `dune logs survival` |
| Run diagnostics | `Advanced Tools` -> `Run Doctor Diagnostics` | `dune doctor` |
| Update game server | `Updates` -> `Check Game Server Update` | `dune update check` then `dune update` |
| Backup database | `Battlegroup Settings` -> `Database Maintenance` | `dune db backup` |
| Edit map settings | `Sietches` -> `Edit Map` | `dune sietches ...` |
| Admin actions | `Admin Tools` | `dune admin ...` |

## Features Supported

| Feature | Beginner access | Advanced command / location |
|---|---|---|
| Guided interactive manager | `dune manager` | `runtime/scripts/manager.sh` |
| Docker-based server stack | Manager start/stop menus | `docker-compose.yml`, `dune start`, `dune stop` |
| First-time setup | `dune init` | `runtime/scripts/init.sh` |
| Status and readiness | Battlegroup Overview | `dune status`, `dune ready`, `dune ps`, `dune ports` |
| Redacted logs | Logs menu | `dune logs <service>` |
| Postgres database | Database menus | `dune db ...`, `dune database ...` |
| RabbitMQ game/admin services | Managed by stack | `dune logs rmq-game`, `dune logs rmq-admin` |
| TextRouter, Director, Gateway | Managed by stack | `dune restart text-router`, `dune restart director`, `dune restart gateway` |
| Survival_1 and Overmap | Always-on protected maps | `dune restart survival`, `dune restart overmap` |
| Dynamic maps and autoscaler | Dynamic Maps And Autoscaler menu | `dune autoscaler ...`, `dune maps ...`, `dune servers` |
| Sietch and map settings | Sietches menu | `dune sietches ...` |
| Deep Desert dual PvP/PvE support | Dynamic Maps menu | `dune deepdesert dual ...` |
| Funcom token handling | `dune init` prompt | `runtime/secrets/funcom-token.txt` |
| Server name and region config | Manager settings | `.env`, `dune config title` |
| UserGame/UserEngine editing | Sietches menu | `runtime/scripts/usersettings.py` |
| Memory tuning | Sietches menu | `dune memory ...` |
| Admin item granting | Admin Tools | `dune admin grant-item ...` |
| Kick player | Admin Tools | `dune admin kick ...` |
| Vehicle spawning | Admin Tools | `dune admin spawn-vehicle ...` |
| XP, skill, specialization, water, progression admin tools | Admin Tools | `dune admin award-xp`, `skill-points`, `skill-module`, `specialization-xp`, `refill-water` |
| Database backups/import/restore | Database Maintenance | `dune db backup`, `import`, `restore`, `delete` |
| Character transfer/account takeover | Database Maintenance | `dune db transfer ...` |
| Database browser and SQL export | Advanced Tools | `dune database ...`, `runtime/generated/db-exports/` |
| Stack updates | Updates menu | `dune self-update ...` |
| Game server updates | Updates menu | `dune update ...` |
| Automatic game updates | Updates menu | `dune update auto ...` |
| Scheduled restart | Battlegroup Settings | `dune restart-schedule ...` |
| Runtime file repair | Updates menu | `runtime/generated/*catalog*.json` |

Experimental or limited areas are labeled where they matter:

- The whole project is community/experimental because Funcom self-hosting behavior can change.
- Admin Tools publish live commands through RabbitMQ. `publish=ok` means the command was accepted by RabbitMQ, not that the game client visibly updated.
- Some progression commands are intentionally marked unsupported by the manager because the inspected command path does not provide a reliable live action.
- Dual Deep Desert changes gameplay routing, but the client selector name/Kanly badge can remain controlled by Funcom backend behavior.

## Beginner Concepts

### What Docker Does Here

Docker runs the many server pieces as containers. You do not need to manage each container by hand if you use `dune manager`.

The main always-on pieces are Postgres, RabbitMQ, TextRouter, Director, ServerGateway, Survival_1, and Overmap. Dynamic map containers can be spawned by the autoscaler when needed.

### What `dune manager` Is

`dune manager` is an interactive control panel built from repo scripts. It runs the same underlying commands that advanced users can run directly.

### What `.env` Is

`.env` is your local server settings file. It includes values such as server IP, server title, region, provider label, Steam app ID, and battlegroup ID.

Do not commit `.env` to git.

### What The Funcom Token Is

The Funcom self-host token lets your server authenticate with Funcom services. `dune init` stores it locally in:

```text
runtime/secrets/funcom-token.txt
```

Do not share this file, paste it into chat, or include it in screenshots.

### Runtime Folders In Plain Language

| Path | Meaning |
|---|---|
| `.env` | Your local server settings. |
| `.env.example` | Example settings you can compare against. |
| `docker-compose.yml` | Defines the orchestrator container used by this project. |
| `runtime/scripts/` | The scripts behind `dune` and `dune manager`. |
| `runtime/secrets/` | Local secrets such as the Funcom token. |
| `runtime/generated/` | Generated config, catalogs, state, logs, and exports. |
| `runtime/backups/` | Backups made by init, database tools, and safety flows. |
| `runtime/data/` | Catalogs used by Admin Tools. |

Most files in `runtime/secrets/`, `runtime/generated/`, and `runtime/backups/` are local machine state and are ignored by git.

### When To Restart

Some changes apply immediately; others need a service restart. The manager usually tells you. As a rule:

- Server name changes restart Gateway.
- Memory changes restart the affected map if it is running.
- UserGame/UserEngine gameplay settings usually require restarting the affected map/server container.
- Start/stop/restart actions disconnect players.

## Technical Usage

The installed `dune` command is a wrapper around `runtime/scripts/dune`.

### Install Or Reinstall The Wrapper

```bash
sudo runtime/scripts/install-command.sh
```

### Core Commands

| Command | What it does | Notes |
|---|---|---|
| `dune manager` | Opens the guided manager. | Recommended for most users. |
| `dune init` | First-time setup or reset-style re-init. | Backs up local state, but can reset the world database. |
| `dune start` | Starts Postgres, RabbitMQ, TextRouter, Director, core maps, Gateway, and autoscaler. | Survival_1 and Overmap can take several minutes to become ready. |
| `dune stop` | Stops autoscaler, publishers, game servers, Gateway, Director, TextRouter, RabbitMQ, and Postgres. | Players are disconnected. |
| `dune status` | Full safe dashboard summary. | Good first troubleshooting command. |
| `dune ready` | Fast OK/WAIT/FAIL readiness check. | Useful for scripts. |
| `dune ps` | Shows Dune containers. | Docker-level view. |
| `dune ports` | Shows expected/listening ports. | Use for firewall checks. |
| `dune version` | Shows launcher/git/build/image/config info. | Useful before updates. |
| `dune doctor` | Runs host, file, container, port, database, RabbitMQ, and service checks. | Start here when broken. |

### Logs

```bash
dune logs survival
dune logs overmap
dune logs director
dune logs gateway
dune logs text-router
dune logs rmq-game
```

Default logs redact common tokens, IDs, and secret fields. Raw logs may contain sensitive data:

```bash
dune logs director --raw
```

### Restart One Service

```bash
dune restart survival
dune restart overmap
dune restart gateway
dune restart director
dune restart text-router
```

### Dynamic Maps And Autoscaler

```bash
dune autoscaler status
dune autoscaler start
dune autoscaler stop
dune autoscaler restart
dune autoscaler logs
dune servers
dune maps list
dune maps mode
dune maps mode DeepDesert_1
dune maps set SH_Arrakeen always-on
dune maps set SH_Arrakeen dynamic
dune maps reconcile
```

`Survival_1` and `Overmap` are protected always-on maps. Other maps are dynamic unless configured otherwise.

### Manual Spawn/Despawn

```bash
dune spawn <map-name-or-partition-id>
dune despawn <map-name-or-partition-id-or-container-name>
```

Manual despawn refuses protected maps. Always-on dynamic maps may require `--force` in the lower-level script because the autoscaler would otherwise respawn them.

### Sietches, Memory, And User Settings

```bash
dune sietches list
dune sietches show Survival_1
dune sietches dimensions Survival_1
dune sietches set-display <partition-id> "Friendly Name"
dune sietches set-password <partition-id>
dune sietches sync
dune sietches validate
dune memory status
dune memory list-maps
dune memory set Survival_1 12g
dune memory unset Survival_1
dune memory set default 8g
```

The manager provides the friendlier path for these settings. It reads and writes live `Saved/UserSettings/UserEngine.ini` and `Saved/UserSettings/UserGame.ini` files where supported, while preserving unknown keys where practical.

Sietch display names and passwords are synchronized by map and dimension, then mirrored to the current live partition IDs. This prevents custom Sietch names/passwords from being lost when `Survival_1` active dimensions are increased, decreased, deleted, or recreated with new partition IDs.

When `Survival_1` active dimensions decrease, extra dynamic Survival dimensions are stopped or unassigned, but their custom dimension name/password state is preserved. If that dimension is activated again later, the preserved values are copied to the new current partition ID.

Use these when Sietches look wrong in the game selection screen:

```bash
dune sietches sync
dune sietches validate
runtime/scripts/validate-sietch-state.sh
```

The same validation and repair actions are available in `dune manager` -> `Sietches` as `Validate / Status` and `Reconcile / Repair State`.

### Deep Desert Dual PvP/PvE

```bash
dune deepdesert dual status
dune deepdesert dual enable
dune deepdesert dual disable
dune deepdesert dual bootstrap
dune deepdesert dual repair
```

This is Docker-native. It does not use Kubernetes/k3s CRDs. It configures DeepDesert_1 dimensions and UserGame PvP/PvE routing. Funcom-controlled selector labels or Kanly badges may not match the server-side gameplay routing.

### Database Commands

```bash
dune db backup
dune db list
dune db status
dune db health
dune db import runtime/backups/db/example.backup
dune db restore runtime/backups/db/example.backup
dune db delete <backup-name>
dune db delete --all
dune db auto enable 12
dune db auto enable 1 7
dune db auto retention 7
dune db auto retention off
dune db auto disable
dune db auto status
```

Character transfer/account takeover:

```bash
dune db transfer OLD_FLS_ID NEW_FLS_ID
dune db transfer --dry-run OLD_FLS_ID NEW_FLS_ID
dune db transfer --file runtime/backups/db/transfer-plan.tsv
dune db transfer pending
dune db transfer apply-pending
dune db transfer clear-pending
```

Database browser:

```bash
dune database status
dune database schemas
dune database tables
dune database counts
dune database columns
dune database preview
dune database sql
dune database export
```

The interactive database manager is also available at `dune manager` -> `Advanced Tools` -> `Database Management`.

### Admin Commands

```bash
dune admin players
dune admin players --online
dune admin item-search "ornithopter"
dune admin item-list
dune admin grant-item PLAYER_FLS_ID "Item Name" 1 1
dune admin kick PLAYER_FLS_ID
dune admin player-location PLAYER_FLS_ID
dune admin award-xp PLAYER_FLS_ID 1000
dune admin skill-points PLAYER_FLS_ID 10
dune admin skill-modules
dune admin skill-module PLAYER_FLS_ID Skills.Ability.Hypersprint 1
dune admin specialization-xp "Character Name" --all --level 100 --xp 44182
dune admin specialization-xp "Character Name" --track Combat --level 100 --xp 44182
dune admin specialization-xp "Character Name" --all --actor-id 12345 --dry-run
dune admin specialization-max "Character Name" --grant-keystones --unlock-faction Atreides
dune admin specialization-max "Character Name" --grant-keystones --dry-run
dune admin refill-water PLAYER_FLS_ID
dune admin vehicle-list
dune admin spawn-vehicle PLAYER_FLS_ID Sandbike T6
dune admin history
```

Prefer the manager for Admin Tools because it gives player, item, vehicle, and skill selection lists where available.

### Updates

```bash
dune self-update check
dune self-update list
dune self-update install latest
dune self-update install previous
dune update check
dune update
dune update --yes
dune update auto enable
dune update auto disable
dune update auto status
```

`dune self-update` updates this self-host stack from GitHub releases. `dune update` updates Funcom game server files and images. Automatic updates use a systemd timer when systemd is available.

### Scheduled Restart

```bash
dune restart-schedule status
sudo dune restart-schedule enable 12
sudo dune restart-schedule disable
```

## Docker Architecture

This repo uses Docker Compose for the `orchestrator` container and repo scripts to start the rest of the Dune service containers.

`docker-compose.yml` defines:

- `dune-orchestrator`, running with `network_mode: host`.
- Docker socket access so scripts can start and stop service containers.
- Docker volumes for server files, Steam files, cache, and generated data.
- A bind mount of `./work:/work`.

The runtime scripts then manage service containers named like:

| Container | Role |
|---|---|
| `dune-postgres` | Game database. |
| `dune-rmq-admin` | RabbitMQ admin side. |
| `dune-rmq-game` | RabbitMQ game command/message side. |
| `dune-text-router` | TextRouter service. |
| `dune-director` | Director/battlegroup coordination. |
| `dune-server-gateway` | ServerGateway/player-facing gateway. |
| `dune-server-survival-1` | Always-on Survival_1 map server. |
| `dune-server-overmap` | Always-on Overmap server. |
| `dune-autoscaler` | Watches demand and starts/stops dynamic map servers. |
| `dune-server-<map>-<partition>` | Dynamic or extra map server containers. |

Startup order in `dune start` is Postgres, database update, stale server cleanup, RabbitMQ, TextRouter, Director, Survival_1, Overmap, state publishers, Gateway, autoscaler, and deferred reconcile.

Generated runtime files live mostly under `runtime/generated/`. Local secrets live under `runtime/secrets/`. Database backups live under `runtime/backups/db/`.

## Configuration

### `.env`

`.env.example` documents the main local settings:

```env
SERVER_IP=auto
SERVER_TITLE="My Dune Server"
SERVER_REGION="Europe Test"
SERVER_PROVIDER="dune-docker"
STEAM_APP_ID=4754530
BATTLEGROUP_ID=
```

`SERVER_IP=auto` detects the public IPv4 during init/start flows. The manager checks the player-facing IP before start/restart and can update `.env` if your IP changed.

### Secrets

Secrets are stored under:

```text
runtime/secrets/
```

The Funcom token is expected at:

```text
runtime/secrets/funcom-token.txt
```

Do not commit or share this folder.

### Generated Config

Important generated files include:

| File | Purpose |
|---|---|
| `runtime/generated/battlegroup.env` | Generated battlegroup identity/config. |
| `runtime/generated/image-tags.env` | Detected image/server tag information. |
| `runtime/generated/partition-catalog.json` | Map/partition picker catalog. |
| `runtime/generated/server-catalog.json` | Server/map catalog extracted from server files. |
| `runtime/generated/sietch-config.json` | Sietch map/dimension/display/password state. |
| `runtime/generated/usersettings.json` | User settings state used by manager flows. |
| `runtime/generated/map-runtime-modes.json` | Dynamic vs always-on map mode choices. |
| `runtime/generated/admin-command-history.tsv` | Admin action history. |
| `runtime/generated/admin-command-audit.jsonl` | Detailed admin action audit log. |

Use `dune manager` -> `Updates` -> `Runtime Files Status` and `Repair Runtime Files` if generated catalogs are missing.

### Ports

Open or forward these ports for public/internet hosting:

| Port | Protocol | Purpose |
|---|---|---|
| `31982` | TCP | RabbitMQ game TLS |
| `31983` | TCP | RabbitMQ game HTTP |
| `7777` | UDP | Overmap client traffic by default |
| `7778` | UDP | Survival_1 client traffic by default |
| `7779-7810` | UDP | Dynamic map client traffic by default |
| `7888` | UDP | Survival_1 server-to-server traffic by default |
| `7889` | UDP | Overmap server-to-server traffic by default |
| `7890-7921` | UDP | Dynamic map server-to-server traffic by default |

These are intended for local host access, not public exposure:

| Port | Protocol | Purpose |
|---|---|---|
| `15432` | TCP | Postgres localhost |
| `32573` | TCP | RabbitMQ admin localhost |
| `5059` | TCP | TextRouter localhost |
| `11717` | TCP | Director localhost |

Check the current configured/listening ports with:

```bash
dune ports
```

## Admin Tools

Open:

```text
dune manager -> Admin Tools
```

Available manager actions:

- Grant Item
- Player Lookup / Location
- Kick Player
- Give XP
- Set Skill Points
- Set Skill Level
- Grant Specialization XP
- Refill Water
- Teleport Player
- Spawn Vehicle
- Clean Inventory
- Reset Progression
- Command History

Important notes:

- Grant Item is the known working reference path and uses a selectable item catalog.
- Kick Player requires the selected player's FLS `PlayerId`. It works best for online players.
- Spawn Vehicle selects a player, reads their location, selects a vehicle/template, and spawns about 4 meters in front of that player.
- Admin commands publish through `dune-rmq-game` using the same RabbitMQ command path as Grant Item.
- Specialization XP tools are different: they directly edit PostgreSQL specialization tables, validate the target character and schema first, and create a database backup before writes.
- The command result says whether the runtime path accepted the message. Some effects still need live in-game observation.
- Destructive actions require confirmation.
- Admin logs are stored in `runtime/generated/admin-command-history.tsv` and `runtime/generated/admin-command-audit.jsonl`.

Specialization commands:

```bash
dune admin specialization-xp "Character Name" --all --level 100 --xp 44182
dune admin specialization-xp "Character Name" --track Combat --level 100 --xp 44182
dune admin specialization-xp "Character Name" --all --actor-id 12345 --dry-run
dune admin specialization-max "Character Name" --grant-keystones --unlock-faction Atreides
dune admin specialization-max "Character Name" --grant-keystones --dry-run
```

Supported specialization tracks are `Crafting`, `Gathering`, `Exploration`, `Combat`, and `Sabotage`. The max helper uses level `100` and XP amount `44182`. These commands resolve the character's pawn actor id from `dune.player_state`/`dune.actors`, require a unique character match, and update `dune.specialization_tracks`; if a partial name matches multiple characters, rerun with the exact name or `--actor-id <id>`. `--grant-keystones` also inserts all rows from `dune.specialization_keystones_map` into `dune.purchased_specialization_keystones`. `--unlock-faction Atreides|Harkonnen` sets the selected faction in `dune.player_faction`, creates a reputation row, and marks the `DA_FQ_ClimbTheRanks.JoinAHouse` journey nodes complete/revealed for that account. Use these only as a server admin with backups. The player may need to relog, or affected services may need a restart, if the game has cached specialization or journey state.

## Arrakis Server Console

This repo includes an optional browser admin UI called Arrakis Server Console. It sits on top of the existing Docker runtime and wraps `runtime/scripts/dune` through a safe, allowlisted backend API.

Local development:

```bash
cd admin-server
npm install
DUNE_DOCKER_DIR="$(pwd)/.." npm run dev

cd ../web
npm install
npm run dev
```

Container mode:

```bash
docker compose -f docker-compose.web.yml up -d --build
```

Open `http://localhost:8088` for the built app, or `http://localhost:5173` during frontend development. The initial admin password is generated at `runtime/secrets/admin-web-password.txt`.

See:

- `docs/web-ui.md`
- `docs/web-setup-wizard.md`
- `docs/security.md`
- `docs/docker-admin-deployment.md`
- `docs/development-web.md`
- `docs/api.md`

## Database And Backups

Database maintenance is available in:

```text
dune manager -> Battlegroup Settings -> Database Maintenance
```

Supported flows include:

- Create database backup.
- Import local backup file.
- Import remote backup over SSH.
- Restore a database backup.
- List backups.
- Delete one backup.
- Delete all backups.
- Automatic database backups.
- Character transfer/account takeover.
- Database health and status checks.

Backups are written under:

```text
runtime/backups/db/
```

Current backup files are official-style `.backup` artifacts with a `.backup.yaml` sidecar. Older `.dump` and `.sql` backups are still accepted by import/restore.

Restore/import replaces the current battlegroup database state and creates a pre-import backup first. Do not let players create new characters until a restored database is verified.

The advanced database browser is available in:

```text
dune manager -> Advanced Tools -> Database Management
```

It can list schemas/tables, show row counts, preview rows, run SQL, and export results to `runtime/generated/db-exports/`. Destructive SQL requires explicit confirmation and creates a backup first.

## Updating

Before updating, make a database backup:

```bash
dune db backup
```

Use the manager for the safest path:

```text
dune manager -> Updates
```

Update types:

| Update type | Manager path | Command |
|---|---|---|
| This self-host stack | Updates -> Check Stack Update | `dune self-update check` |
| Install stack release | Updates -> Restore Previous Stack or latest prompt | `dune self-update install latest` |
| Funcom game server files/images | Updates -> Check Game Server Update | `dune update check`, `dune update` |
| Automatic game updates | Updates -> Automatic Updates | `dune update auto enable` |
| Runtime catalog repair | Updates -> Repair Runtime Files | Manager-only helper flow |

For stack updates, releases are expected to have matching GitHub release tags and `VERSION` file content. If local tracked project files were edited, the stack updater warns and backs up project files before continuing.

## Troubleshooting

Start simple:

```bash
dune doctor
dune status
dune ready
```

Then check logs:

```bash
dune logs director
dune logs gateway
dune logs survival
dune logs overmap
```

Common problems:

| Problem | What to try |
|---|---|
| `docker: command not found` | Install Docker Engine and Docker Compose. |
| Docker daemon not reachable | Run `sudo systemctl enable --now docker`, add your user to the docker group, then re-login or run `newgrp docker`. |
| Missing Funcom token | Run `dune init` or place it in `runtime/secrets/funcom-token.txt`. |
| SteamCMD `state is 0x6` during init | Usually disk space, Steam anonymous depot availability, stale SteamCMD metadata, or Steam CDN/network failure. Check `docker exec dune-orchestrator df -h /srv/dune/server /srv/dune/steam /srv/dune/cache`, free space, then retry `runtime/scripts/update.sh install`. |
| Server not showing publicly | Check `SERVER_IP`, router/firewall forwarding, and `dune ports`. |
| Server only needed for LAN | Use a local/private server IP during init. |
| Port conflict | Run `dune ports` and check other services using the same ports. |
| Database not starting | Run `dune doctor`, then inspect `dune logs postgres`. |
| Services stuck warming | Wait several minutes, then run `dune ready` and check Director/Gateway/map logs. |
| Runtime map picker missing | Manager -> Updates -> Runtime Files Status, then Repair Runtime Files. |
| Permission issues with `dune` | Reinstall with `sudo runtime/scripts/install-command.sh`; check Docker group membership. |
| Raw logs requested | Be careful; raw logs can contain tokens or player identifiers. |

Docker install helper shown by `dune init` if Docker is missing:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
```

Follow Docker's official Linux install steps for your distribution if Docker is not already installed.

## FAQ

### Do I need to know Docker?

No for normal use. Run `dune manager` and use the menus. Docker still needs to be installed because it runs the server in the background.

### Where do I change server settings?

Use `dune manager`. Server name is under `Battlegroup Settings`. Map, memory, UserGame, and UserEngine settings are under `Sietches`.

### Should I edit files manually or use the manager?

Use the manager unless you know exactly what you are changing. Manual edits to `.env` are fine for advanced users. Do not manually edit secrets into documentation, chat, or screenshots.

### Where are backups?

Database backups are under `runtime/backups/db/`. Init reset backups are under `runtime/backups/init-reset-*`.

### How do I stop safely?

Use `dune manager` -> `Battlegroup Settings` -> `Stop`, or run:

```bash
dune stop
```

Players will be disconnected.

### What should I not delete?

Do not delete `runtime/secrets/` unless you are intentionally removing local secrets. Do not delete `runtime/backups/` if you may need to restore. Be careful deleting generated files while the stack is running.

### Where do I get useful logs?

Use the manager's `Logs` menu or run `dune logs <service>`. Use `dune doctor` for a compact health report.

## Security Notes

- Do not share your Funcom self-host token.
- Do not commit `.env`, `runtime/secrets/`, generated credentials, or raw logs.
- Raw logs may contain tokens, player IDs, friend IDs, or account identifiers.
- Be careful exposing ports publicly. Only forward what is required.
- Back up before database edits, imports, restores, or destructive SQL.
- Admin Tools affect live players and live server state.
- If a token is exposed, rotate it from your Funcom self-host account page.

This repository does not include Funcom game files, Docker image tarballs, tokens, secrets, or proprietary assets. Server files and images are downloaded or loaded at runtime by the user's own environment.

## Contributing And Project Notes

This is a RedBlink community project. Keep `LICENSE` and `NOTICE` intact when redistributing or modifying it.

Runtime scripts live in `runtime/scripts/`. If you change Admin Tools, run:

```bash
runtime/scripts/validate-admin-tools.sh
```

If `shellcheck` or markdown tooling is available in your environment, run it before submitting changes.

## License

This project is licensed under the MIT License.

See [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.
