#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

LOG_FILE="runtime/logs/autoscaler.log"
CONTAINER_NAME="dune-autoscaler"

usage() {
  cat <<'EOF'
Usage:
  dune autoscaler status
  dune autoscaler start
  dune autoscaler stop
  dune autoscaler restart
  dune autoscaler logs

Legacy:
  dune autoscaler run      Run the autoscaler loop in the foreground
EOF
}

status() {
  echo "=== Autoscaler status ==="
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "State: running"
    docker ps --filter "name=^${CONTAINER_NAME}$" --format "Container: {{.Names}}\nStatus:    {{.Status}}"
  elif docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "State: stopped"
    docker ps -a --filter "name=^${CONTAINER_NAME}$" --format "Container: {{.Names}}\nStatus:    {{.Status}}"
  else
    echo "State: stopped"
    echo "Container: not created"
  fi
  echo "Logs:  dune autoscaler logs"
}

start() {
  runtime/scripts/start-autoscaler.sh
}

stop() {
  if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "Autoscaler is not running."
    return 0
  fi

  echo "Stopping autoscaler..."
  docker rm -f "$CONTAINER_NAME" >/dev/null
  echo "Autoscaler stopped."
}

logs() {
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    docker logs --tail 160 "$CONTAINER_NAME"
  elif [ -f "$LOG_FILE" ]; then
    tail -n 160 "$LOG_FILE"
  else
    echo "Autoscaler logs are not available yet."
  fi
}

cmd="${1:-status}"

case "$cmd" in
  status) status ;;
  start) start ;;
  stop) stop ;;
  restart)
    stop || true
    start
    ;;
  logs) logs ;;
  run) runtime/scripts/autoscaler.sh ;;
  help|--help|-h) usage ;;
  *)
    echo "Unknown autoscaler command: $cmd"
    usage
    exit 2
    ;;
esac
