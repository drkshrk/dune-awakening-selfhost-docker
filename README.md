# Dune Awakening Self-Host Docker

Docker-based launcher for Dune: Awakening self-host servers.

This project replaces the normal local/k3s-style setup with Docker containers and a simple `dune` command.

It supports:

| Mode | Use case |
|---|---|
| Public / Internet | VPS, dedicated server, or home server with port forwarding |
| Local / LAN | Private server for players on the same local network |

> This project is experimental and community-built. It is not an official Funcom deployment.

---

## Features

- Simple `dune` command wrapper
- First-time setup with `dune init`
- Public or local/LAN hosting mode
- Automatic public/LAN IP detection
- Automatic Steam app ID selection
- Automatic server file download through SteamCMD
- Automatic Funcom Docker image loading
- Fresh database setup
- Automatic world partition setup
- Always-on Overmap and Survival_1
- Autoscaling support for the other maps
- Readiness checks with clear `OK`, `WAIT`, and `FAIL` states
- Manual and automatic update support

---

## Requirements

| Requirement | Notes |
|---|---|
| Linux server or Linux PC | VPS, dedicated server, or local Linux machine |
| Docker Engine | Required |
| Docker Compose | Required |
| Funcom self-host token | Required |
| Disk space | 100 GB+ recommended |
| RAM | 20 GB+ recommended |
| Firewall access | Required for public hosting |

---

## Ports

### Public/player-facing ports

| Port | Protocol | Purpose |
|---|---:|---|
| 31982 | TCP | RabbitMQ game TLS |
| 7777-7810 | UDP | Game servers |

For public hosting, open or forward:

```bash
sudo ufw allow 31982/tcp
sudo ufw allow 7777:7810/udp
```

### Local-only ports

These are bound to localhost:

| Port | Protocol | Purpose |
|---|---:|---|
| 15432 | TCP | Postgres |
| 32573 | TCP | RabbitMQ admin |
| 5059 | TCP | TextRouter |
| 11717 | TCP | Director |

---

## Install

Clone the repo:

```bash
git clone https://github.com/Red-Blink/dune-awakening-selfhost-docker.git
cd dune-awakening-selfhost-docker
```

Install the `dune` command:

```bash
sudo runtime/scripts/install-command.sh
```

Run first-time setup:

```bash
dune init
```

---

## First-time setup

`dune init` asks for:

| Prompt | Description |
|---|---|
| Server title | The name shown in-game |
| Region | Europe Test or North America Test |
| Hosting mode | Public / Internet or Local / LAN |
| Funcom token | Your self-host service token |

The token input is hidden while typing or pasting.

`dune init` automatically:

1. Detects your public and local/LAN IP addresses.
2. Lets you choose how players will connect.
3. Generates a battlegroup ID.
4. Saves local config.
5. Downloads or verifies server files.
6. Loads Funcom Docker images.
7. Starts fresh Postgres.
8. Runs database setup.
9. Applies world partitions.
10. Starts the server stack.
11. Runs a readiness check.

### Important

`dune init` is a fresh-start setup command.

Running it again resets the local server database and starts a new fresh world. Existing local state is backed up automatically, but players should treat `dune init` as a reset command.

---

## Public vs Local/LAN hosting

| Option | Who can connect? | Requires port forwarding? |
|---|---|---|
| Public / Internet | Players over the internet | Yes, unless hosted on a VPS/dedicated server with open ports |
| Local / LAN | Players on the same local network | No |

During setup, the selected address is saved as:

```env
SERVER_IP=<selected-ip>
SERVER_IP_MODE=public
```

or:

```env
SERVER_IP=<selected-ip>
SERVER_IP_MODE=local
```

---

## Commands

| Command | Description |
|---|---|
| `dune init` | Fresh first-time setup / reset setup |
| `dune manager` | Open the interactive manager |
| `dune start` | Start the stack |
| `dune stop` | Stop the stack |
| `dune ready` | Check if the stack is ready |
| `dune status` | Show full status |
| `dune ports` | Show listening ports |
| `dune ps` | Show containers |
| `dune update` | Check for and apply updates interactively |
| `dune update check` | Check if an update is available |
| `dune update --yes` | Apply update without prompting |
| `dune update auto enable` | Enable daily automatic updates |
| `dune update auto disable` | Disable automatic updates |
| `dune update auto status` | Show automatic update status |

---

## Logs

| Command | Logs |
|---|---|
| `dune logs survival` | Survival_1 |
| `dune logs overmap` | Overmap |
| `dune logs director` | Director |
| `dune logs gateway` | ServerGateway |
| `dune logs text-router` | TextRouter |
| `dune logs rmq-game` | RabbitMQ game |

---

## Restart services

| Command | Restarts |
|---|---|
| `dune restart survival` | Survival_1 |
| `dune restart overmap` | Overmap |
| `dune restart director` | Director |
| `dune restart gateway` | ServerGateway |
| `dune restart text-router` | TextRouter |

---

## Readiness checks

Run:

```bash
dune ready
```

`dune ready` uses three states:

| State | Meaning |
|---|---|
| OK | Check passed |
| WAIT | Normal startup/warm-up |
| FAIL | Something needs attention |

Example healthy output:

```text
OK   Survival_1 ready
OK   Overmap ready
READY: Dune Awakening Self-Host Docker stack looks healthy.
```

During startup, maps may show as warming:

```text
WAIT Survival_1 warming
WAIT Overmap warming
WARMING: required containers are up; one or more services/maps are still starting.
```

This is normal after setup, start, update, or restart. Large maps can take a few minutes to become ready.

When the local stack is ready, the in-game server browser may still take a few minutes to show population and sietch availability while Funcom/FLS and the game client refresh.

---

## Updates

Check for an update:

```bash
dune update check
```

Apply an update interactively:

```bash
dune update
```

Apply an update without prompting:

```bash
dune update --yes
```

The update flow:

1. Checks Steam for a newer build.
2. Stops game servers if an update is available.
3. Updates server files through SteamCMD.
4. Loads updated Funcom Docker images.
5. Detects image tags.
6. Runs database migrations.
7. Restarts the stack.

If no update is available, nothing is changed.

SteamCMD has retry logic for intermittent Steam/Funcom install errors.

---

## Automatic updates

Enable automatic updates:

```bash
dune update auto enable
```

Default schedule:

```text
05:00:00 daily
```

Choose a custom time:

```bash
dune update auto enable 04:30:00
```

Check status:

```bash
dune update auto status
```

Disable automatic updates:

```bash
dune update auto disable
```

Automatic updates use a systemd timer. The updater still checks Steam first and does nothing if no update is available.

---

## Maps and autoscaling

Always-on maps:

| Map | Status |
|---|---|
| Survival_1 | Always running |
| Overmap | Always running |

Other maps are handled by autoscaling.

The autoscaler can spawn and stop map servers as needed for the full map catalog, including social hubs, Deep Desert, caves, dungeons, and story maps.

---

## Server browser notes

A healthy Docker stack does not always mean the in-game browser updates instantly.

Normal order:

1. Gateway declares the server.
2. Survival_1 and Overmap become ready.
3. Director registers partition/server state.
4. Director sends population/activity to Funcom/FLS.
5. The in-game browser refreshes.

If `dune ready` is green but population or sietch availability is not visible yet, wait a few minutes and refresh the in-game server list.

---

## Useful checks

See how long Survival_1 and Overmap have been running:

```bash
docker ps \
  --filter "name=dune-server-survival-1" \
  --filter "name=dune-server-overmap" \
  --format "table {{.Names}}\t{{.Status}}"
```

Show exact start timestamps:

```bash
for c in dune-server-survival-1 dune-server-overmap; do
  echo "=== $c ==="
  docker ps --filter "name=^${c}$" --format "Status: {{.Status}}"
  docker inspect "$c" --format 'Started: {{.State.StartedAt}}'
done
```

Check world partitions:

```bash
docker exec dune-postgres psql -U dune -d dune -c "
select partition_id, map, dimension_index, label, blocked
from world_partition
order by partition_id;
"
```

Check recent Funcom/FLS declarations:

```bash
docker logs dune-director --since 15m 2>&1 | grep -Ei \
  'DeclareBattlegroupUpdates|DeclarePopulation|UpDeclarations|Heartbeat|Survival_1|Overmap|partition 1|partition 2' \
  | tail -n 160
```

---

## Local files

The setup creates local runtime files such as:

| Path | Purpose |
|---|---|
| `.env` | Local server config |
| `runtime/secrets/funcom-token.txt` | Funcom self-host token |
| `runtime/generated/battlegroup.env` | Generated battlegroup ID |
| `runtime/generated/image-tags.env` | Detected Funcom image tags |
| `runtime/backups/` | Automatic backups from reset/init |

These files are managed by the tool.

---

## Security

Your Funcom self-host token is sensitive.

Do not share logs that include:

- `ServiceAuthToken`
- `GameRmqSecret`
- `runtime/secrets/funcom-token.txt`

If a token is accidentally shared, rotate/regenerate it from the Funcom self-host account page.

---

## Current limitations

- This is experimental.
- Public hosting still requires correct firewall and/or router port forwarding.
- Local/LAN hosting is only reachable by players on the same network.
- Autoscaling is available, but still needs more real-world testing across all maps.
- Some compatibility behavior exists to replace parts of the normal k3s/Kubernetes environment.
