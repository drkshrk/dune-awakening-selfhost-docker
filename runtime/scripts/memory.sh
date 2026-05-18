#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

usage() {
  cat <<'EOF'
Usage:
  dune memory status
  dune memory set survival 12g
  dune memory set overmap 8g
  dune memory set default 8g
  dune memory set <map-name> <memory>
  dune memory unset <map-name>

Memory values use Docker formats such as 4096m, 8g, or 12g.
Changes apply the next time the affected server container is restarted.
EOF
}

normalize_key() {
  local name="$1"
  case "${name,,}" in
    survival|survival-1|survival_1) echo "SURVIVAL_1" ;;
    overmap) echo "OVERMAP" ;;
    default) echo "DEFAULT" ;;
    *) printf '%s' "$name" | tr '[:lower:]' '[:upper:]' | sed 's/[^A-Z0-9]/_/g; s/__*/_/g; s/^_//; s/_$//' ;;
  esac
}

validate_memory() {
  printf '%s' "$1" | grep -Eq '^[1-9][0-9]*[mMgG]$'
}

env_key_for() {
  local name="$1"
  echo "DUNE_MEMORY_$(normalize_key "$name")"
}

set_env_raw() {
  local key="$1"
  local value="$2"
  local tmp

  touch .env
  tmp="$(mktemp)"

  awk -F= -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $1 == key {
      print key "=" value
      found = 1
      next
    }
    { print }
    END {
      if (!found) print key "=" value
    }
  ' .env > "$tmp"

  mv "$tmp" .env
  chmod 600 .env
}

unset_env_raw() {
  local key="$1"
  local tmp

  [ -f .env ] || return 0
  tmp="$(mktemp)"
  awk -F= -v key="$key" '$1 != key { print }' .env > "$tmp"
  mv "$tmp" .env
  chmod 600 .env
}

show_status() {
  echo "=== Memory configuration ==="
  if [ -f .env ]; then
    grep '^DUNE_MEMORY_' .env || echo "No custom memory settings configured."
  else
    echo ".env not found."
  fi

  echo
  echo "Defaults if unset:"
  echo "  DUNE_MEMORY_SURVIVAL_1=12g"
  echo "  DUNE_MEMORY_OVERMAP=2g"
  echo "  DUNE_MEMORY_DEFAULT=server catalog value, or 3g for dynamic maps"
}

cmd="${1:-status}"

case "$cmd" in
  status)
    show_status
    ;;
  set)
    if [ "$#" -ne 3 ]; then
      usage
      exit 2
    fi
    map_name="$2"
    memory="$3"
    if ! validate_memory "$memory"; then
      echo "Invalid memory value: $memory"
      echo "Use values like 4096m, 8g, or 12g."
      exit 1
    fi
    key="$(env_key_for "$map_name")"
    set_env_raw "$key" "$memory"
    echo "Set $key=$memory"
    echo "Restart affected server containers for this to take effect."
    ;;
  unset)
    if [ "$#" -ne 2 ]; then
      usage
      exit 2
    fi
    key="$(env_key_for "$2")"
    unset_env_raw "$key"
    echo "Removed $key"
    echo "Restart affected server containers for this to take effect."
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "Unknown memory command: $cmd"
    usage
    exit 2
    ;;
esac
