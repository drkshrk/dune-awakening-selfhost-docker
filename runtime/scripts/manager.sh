#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

DUNE="runtime/scripts/dune"

pause() {
  echo
  read -r -p "Press Enter to return to menu..." _ || true
}

clear_screen() {
  if [ -t 1 ]; then
    clear || true
  fi
}

read_choice() {
  local prompt="${1:-Select an option: }"
  local choice

  read -r -p "$prompt" choice || {
    echo
    echo "Exit."
    exit 0
  }

  printf '%s' "$choice"
}

confirm() {
  local prompt="$1"
  local answer

  read -r -p "$prompt [y/N]: " answer || return 1
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

run_cmd() {
  echo
  echo ">>> $*"
  echo

  set +e
  "$@"
  local rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    echo
    echo "Command exited with status $rc."
  fi
}

run_confirmed() {
  local warning="$1"
  shift

  echo
  echo "$warning"
  if confirm "Continue"; then
    run_cmd "$@"
  else
    echo "Cancelled."
  fi
}

script_exists() {
  [ -x "$1" ]
}

config_value() {
  local file="$1"
  local key="$2"

  [ -f "$file" ] || return 1

  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, length(key) + 2)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      print value
      exit
    }
  ' "$file"
}

show_config_summary() {
  echo
  echo "=== Current config summary ==="

  if [ ! -f .env ]; then
    echo "No .env file found. Run first-time setup when you are ready."
    return
  fi

  printf "%-14s %s\n" "Title:" "$(config_value .env SERVER_TITLE || echo unknown)"
  printf "%-14s %s\n" "Region:" "$(config_value .env SERVER_REGION || echo unknown)"
  printf "%-14s %s\n" "Mode:" "$(config_value .env SERVER_IP_MODE || echo unknown)"
  printf "%-14s %s\n" "Server IP:" "$(config_value .env SERVER_IP || echo unknown)"
  printf "%-14s %s\n" "Steam app:" "$(config_value .env STEAM_APP_ID || echo unknown)"

  if [ -f runtime/generated/battlegroup.env ]; then
    printf "%-14s %s\n" "Battlegroup:" "$(config_value runtime/generated/battlegroup.env BATTLEGROUP_ID || echo unknown)"
  else
    printf "%-14s %s\n" "Battlegroup:" "not generated yet"
  fi
}

show_image_tags() {
  echo
  echo "=== Generated image tags ==="

  if [ -f runtime/generated/image-tags.env ]; then
    sed -n '1,80p' runtime/generated/image-tags.env
  else
    echo "runtime/generated/image-tags.env does not exist yet."
  fi
}

show_battlegroup_id() {
  echo
  echo "=== Battlegroup ID ==="

  if [ -f runtime/generated/battlegroup.env ]; then
    config_value runtime/generated/battlegroup.env BATTLEGROUP_ID || echo "Could not read battlegroup ID."
  else
    echo "runtime/generated/battlegroup.env does not exist yet."
  fi
}

show_world_partition_count() {
  echo
  echo "=== World partition count ==="

  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx dune-postgres; then
    echo "dune-postgres is not running."
    return
  fi

  docker exec dune-postgres psql -U dune -d dune -c "select count(*) as world_partition_rows from world_partition;"
}

autoscaler_status() {
  "$DUNE" autoscaler status
}

show_autoscaler_logs() {
  "$DUNE" autoscaler logs
}

follow_dune_logs() {
  local target="$1"

  echo
  echo "Following logs for: $target"
  echo "Press Ctrl+C to stop following logs and return to the manager."
  echo

  set +e
  trap ':' INT
  bash -c 'trap - INT; exec "$@"' bash "$DUNE" logs "$target"
  local rc=$?
  trap - INT
  set -e

  if [ "$rc" -ne 0 ] && [ "$rc" -ne 130 ]; then
    echo
    echo "Log command exited with status $rc."
  fi
}

show_header() {
  echo "Dune Awakening Self-Host Docker Manager"
  echo "======================================="
  echo
  echo "Choose a category. Direct CLI commands like 'dune ready' still work normally."
  echo
}

main_menu() {
  while true; do
    clear_screen
    show_header
    cat <<'EOF'
  1) Setup / Fresh init
  2) Start / Stop server
  3) Status / Readiness
  4) Logs
  5) Restart services
  6) Updates
  7) Autoscaler / Dynamic maps
  8) Server settings
  9) Backup / Import database
 10) Advanced tools
 11) Exit
EOF
    echo

    case "$(read_choice)" in
      1) setup_menu ;;
      2) start_stop_menu ;;
      3) status_menu ;;
      4) logs_menu ;;
      5) restart_menu ;;
      6) updates_menu ;;
      7) autoscaler_menu ;;
      8) server_settings_menu ;;
      9) backup_menu ;;
      10) advanced_menu ;;
      11|q|Q|quit|exit) echo "Bye."; exit 0 ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

setup_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Setup / Fresh init
==================
  1) Run first-time setup / reset
  2) Show current config summary
  3) Back
EOF
    echo

    case "$(read_choice)" in
      1)
        run_confirmed \
          "WARNING: dune init is a fresh-start setup command. It can reset the local database/world after backing up current local state." \
          "$DUNE" init
        pause
        ;;
      2) show_config_summary; pause ;;
      3|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

start_stop_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Start / Stop server
===================
  1) Start battlegroup
  2) Stop battlegroup
  3) Restart battlegroup
  4) Back
EOF
    echo

    case "$(read_choice)" in
      1) run_cmd "$DUNE" start; pause ;;
      2)
        run_confirmed \
          "WARNING: dune stop removes the running Dune service containers. Players will be disconnected." \
          "$DUNE" stop
        pause
        ;;
      3)
        echo
        echo "Restart battlegroup will run 'dune stop' and then 'dune start'. Players will be disconnected."
        if confirm "Continue"; then
          run_cmd "$DUNE" stop
          run_cmd "$DUNE" start
        else
          echo "Cancelled."
        fi
        pause
        ;;
      4|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

status_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Status / Readiness
==================
  1) Safe dashboard
  2) Readiness check
  3) Containers
  4) Ports
  5) Version
  6) Back
EOF
    echo

    case "$(read_choice)" in
      1) run_cmd "$DUNE" status; pause ;;
      2) run_cmd "$DUNE" ready; pause ;;
      3) run_cmd "$DUNE" ps; pause ;;
      4) run_cmd "$DUNE" ports; pause ;;
      5) run_cmd "$DUNE" version; pause ;;
      6|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

logs_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Logs
====
  1) Survival_1 logs
  2) Overmap logs
  3) Director logs
  4) Gateway logs
  5) TextRouter logs
  6) RabbitMQ game logs
  7) Autoscaler logs
  8) Back
EOF
    echo

    case "$(read_choice)" in
      1) follow_dune_logs survival; pause ;;
      2) follow_dune_logs overmap; pause ;;
      3) follow_dune_logs director; pause ;;
      4) follow_dune_logs gateway; pause ;;
      5) follow_dune_logs text-router; pause ;;
      6) follow_dune_logs rmq-game; pause ;;
      7) run_cmd "$DUNE" autoscaler logs; pause ;;
      8|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

restart_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Restart services
================
  1) Restart Survival_1
  2) Restart Overmap
  3) Restart Director
  4) Restart Gateway
  5) Restart TextRouter
  6) Restart autoscaler
  7) Back
EOF
    echo

    case "$(read_choice)" in
      1) run_cmd "$DUNE" restart survival; pause ;;
      2) run_cmd "$DUNE" restart overmap; pause ;;
      3) run_cmd "$DUNE" restart director; pause ;;
      4) run_cmd "$DUNE" restart gateway; pause ;;
      5) run_cmd "$DUNE" restart text-router; pause ;;
      6)
        run_cmd "$DUNE" autoscaler restart
        pause
        ;;
      7|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

updates_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Updates
=======
  1) Check game/server update
  2) Apply game/server update interactively
  3) Enable automatic updates
  4) Disable automatic updates
  5) Automatic update status
  6) Back
EOF
    echo

    case "$(read_choice)" in
      1) run_cmd "$DUNE" update check; pause ;;
      2) run_cmd "$DUNE" update; pause ;;
      3) run_cmd "$DUNE" update auto enable; pause ;;
      4) run_cmd "$DUNE" update auto disable; pause ;;
      5) run_cmd "$DUNE" update auto status; pause ;;
      6|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

autoscaler_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Autoscaler / Dynamic maps
=========================
  1) Autoscaler status
  2) Start autoscaler
  3) Stop autoscaler
  4) Show running servers/maps
  5) Show autoscaler logs
  6) Back
EOF
    echo

    case "$(read_choice)" in
      1) run_cmd "$DUNE" autoscaler status; pause ;;
      2)
        run_cmd "$DUNE" autoscaler start
        pause
        ;;
      3)
        run_cmd "$DUNE" autoscaler stop
        pause
        ;;
      4) run_cmd "$DUNE" servers; pause ;;
      5) run_cmd "$DUNE" autoscaler logs; pause ;;
      6|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

server_settings_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Server settings
===============
  1) Show current server title/name
  2) Change server title/name
  3) Show configured memory per map/server
  4) Change memory allocation
  5) Remove memory override
  6) Back
EOF
    echo

    case "$(read_choice)" in
      1) run_cmd "$DUNE" config title; pause ;;
      2)
        echo
        read -r -p "New server title: " new_title || new_title=""
        if [ -z "$new_title" ]; then
          echo "Title cannot be empty."
        else
          run_cmd "$DUNE" config title "$new_title"
        fi
        pause
        ;;
      3) run_cmd "$DUNE" memory status; pause ;;
      4)
        echo
        read -r -p "Map/server name (survival, overmap, default, or map name): " map_name || map_name=""
        read -r -p "Memory value (example 8g or 4096m): " memory_value || memory_value=""
        if [ -z "$map_name" ] || [ -z "$memory_value" ]; then
          echo "Map/server and memory value are required."
        else
          run_cmd "$DUNE" memory set "$map_name" "$memory_value"
        fi
        pause
        ;;
      5)
        echo
        read -r -p "Map/server name to unset: " map_name || map_name=""
        if [ -z "$map_name" ]; then
          echo "Map/server name is required."
        else
          run_cmd "$DUNE" memory unset "$map_name"
        fi
        pause
        ;;
      6|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

backup_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Backup / Import database
========================
  1) Backup battlegroup database
  2) List database backups
  3) Database status
  4) Import/restore database backup
  5) Back
EOF
    echo

    case "$(read_choice)" in
      1) run_cmd "$DUNE" db backup; pause ;;
      2) run_cmd "$DUNE" db list; pause ;;
      3) run_cmd "$DUNE" db status; pause ;;
      4)
        echo
        echo "WARNING: importing a database backup replaces the current battlegroup database state."
        read -r -p "Backup file path: " backup_file || backup_file=""
        if [ -z "$backup_file" ]; then
          echo "Backup file path is required."
        else
          run_cmd "$DUNE" db import "$backup_file"
        fi
        pause
        ;;
      5|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

advanced_menu() {
  while true; do
    clear_screen
    cat <<'EOF'
Advanced tools
==============
  1) Shell inside orchestrator
  2) Show generated image tags
  3) Show battlegroup ID
  4) Show world partition count
  5) Run doctor diagnostics
  6) Back
EOF
    echo

    case "$(read_choice)" in
      1) run_cmd docker compose exec orchestrator bash; pause ;;
      2) show_image_tags; pause ;;
      3) show_battlegroup_id; pause ;;
      4) show_world_partition_count; pause ;;
      5) run_cmd "$DUNE" doctor; pause ;;
      6|b|B|back) return ;;
      *) echo "Invalid selection."; sleep 1 ;;
    esac
  done
}

main_menu
