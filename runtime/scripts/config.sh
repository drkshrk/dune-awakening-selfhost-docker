#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

usage() {
  cat <<'EOF'
Usage:
  dune config title
  dune config title "New Server Name"
EOF
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

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp

  touch .env
  tmp="$(mktemp)"

  awk -F= -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $1 == key {
      gsub(/"/, "\\\"", value)
      print key "=\"" value "\""
      found = 1
      next
    }
    { print }
    END {
      if (!found) {
        gsub(/"/, "\\\"", value)
        print key "=\"" value "\""
      }
    }
  ' .env > "$tmp"

  mv "$tmp" .env
  chmod 600 .env
}

cmd="${1:-help}"

case "$cmd" in
  title)
    shift || true
    if [ "$#" -eq 0 ]; then
      echo "Current server title: $(config_value .env SERVER_TITLE || echo unknown)"
      exit 0
    fi

    new_title="$*"
    if [ -z "$new_title" ]; then
      echo "Server title cannot be empty."
      exit 1
    fi

    set_env_value SERVER_TITLE "$new_title"
    echo "Updated server title: $new_title"
    echo
    echo "The server browser may not show the new title until services redeclare state."
    echo "Recommended:"
    echo "  dune restart gateway"
    echo "  dune restart director"
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "Unknown config command: $cmd"
    usage
    exit 2
    ;;
esac
