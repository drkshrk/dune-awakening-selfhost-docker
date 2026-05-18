#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

usage() {
  cat <<'EOF'
Usage:
  dune logs <service> [--raw]

Services:
  postgres
  rmq-admin
  rmq-game
  text-router | tr
  director    | bgd
  gateway     | sgw
  survival    | survival-1
  overmap

Default logs are redacted for common tokens, IDs, and secret fields.
Use --raw only when you understand the logs may contain sensitive data.
EOF
}

target="${1:-}"
mode="${2:-}"

container=""
case "$target" in
  postgres)             container="dune-postgres" ;;
  rmq-admin)            container="dune-rmq-admin" ;;
  rmq-game)             container="dune-rmq-game" ;;
  text-router|tr)       container="dune-text-router" ;;
  director|bgd)         container="dune-director" ;;
  gateway|sgw)          container="dune-server-gateway" ;;
  survival|survival-1)  container="dune-server-survival-1" ;;
  overmap)              container="dune-server-overmap" ;;
  help|--help|-h|"")
    usage
    [ -n "$target" ] || exit 1
    exit 0
    ;;
  *)
    echo "Unknown log target: $target"
    usage
    exit 1
    ;;
esac

if [ "$mode" = "--raw" ]; then
  echo "WARNING: raw logs may contain tokens, player IDs, friend IDs, or other sensitive data."
  read -r -p "Show raw logs anyway? [y/N]: " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Cancelled."; exit 1 ;;
  esac
  exec docker logs -f "$container"
fi

if [ -n "$mode" ]; then
  echo "Unknown logs option: $mode"
  usage
  exit 2
fi

docker logs -f "$container" 2>&1 | sed -u -E \
  -e 's/(ServiceAuthToken=)[^[:space:]"'"'"']+/\1<redacted>/g' \
  -e 's/(ServiceAuthToken[":= ]+)[^,"[:space:]]+/\1<redacted>/g' \
  -e 's/(GameRmqSecret[":= ]+)[^,"[:space:]]+/\1<redacted>/g' \
  -e 's/(RMQ_HTTP_TOKEN_AUTH_SECRET=)[^[:space:]"'"'"']+/\1<redacted>/g' \
  -e 's#runtime/secrets/funcom-token.txt#runtime/secrets/<redacted>#g' \
  -e 's/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/<redacted-jwt>/g' \
  -e 's/((friend|friendId|friend_id|player|playerId|player_id|account|accountId|account_id)[":= ]+)[A-Za-z0-9_-]{8,}/\1<redacted-id>/Ig'
