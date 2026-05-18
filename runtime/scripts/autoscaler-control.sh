#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

PID_FILE="runtime/generated/autoscaler.pid"
LOG_FILE="runtime/logs/autoscaler.log"

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

autoscaler_pid() {
  [ -f "$PID_FILE" ] || return 1
  cat "$PID_FILE" 2>/dev/null || true
}

is_live_pid() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

status() {
  local pid
  pid="$(autoscaler_pid || true)"

  echo "=== Autoscaler status ==="
  if is_live_pid "$pid"; then
    echo "State: running"
    echo "PID:   $pid"
  else
    echo "State: stopped"
    [ -n "$pid" ] && echo "Last PID: $pid"
  fi
  echo "Log:   $LOG_FILE"
}

start() {
  runtime/scripts/start-autoscaler.sh
}

stop() {
  local pid
  pid="$(autoscaler_pid || true)"

  if ! is_live_pid "$pid"; then
    echo "Autoscaler is not running."
    rm -f "$PID_FILE"
    return 0
  fi

  echo "Stopping autoscaler pid $pid..."
  kill "$pid"

  for _ in 1 2 3 4 5; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "Autoscaler stopped."
      return 0
    fi
    sleep 1
  done

  echo "Autoscaler did not stop after SIGTERM."
  echo "You can inspect it with: ps -p $pid"
  return 1
}

logs() {
  if [ -f "$LOG_FILE" ]; then
    tail -n 160 "$LOG_FILE"
  else
    echo "Autoscaler log is not available yet: $LOG_FILE"
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
