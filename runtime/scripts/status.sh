#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

set -a
[ -f .env ] && . ./.env
[ -f runtime/generated/battlegroup.env ] && . runtime/generated/battlegroup.env
set +a

issue=0
warming=0

is_running() {
  local name="$1"
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$name"
}

is_private_ipv4() {
  local ip="$1"
  printf '%s' "$ip" | grep -Eq '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)'
}

container_status() {
  local name="$1"
  if is_running "$name"; then
    docker ps --filter "name=^${name}$" --format '{{.Status}}'
  elif docker inspect "$name" >/dev/null 2>&1; then
    echo "stopped"
    issue=1
  else
    echo "missing"
    issue=1
  fi
}

check_tcp() {
  local port="$1"
  if ss -lntp 2>/dev/null | grep -q ":$port "; then
    echo "OK"
  else
    issue=1
    echo "MISSING"
  fi
}

check_udp() {
  local port="$1"
  if ss -lnup 2>/dev/null | grep -q ":$port "; then
    echo "OK"
  else
    issue=1
    echo "MISSING"
  fi
}

map_state() {
  local container="$1"
  local pattern="$2"
  local logs

  if ! is_running "$container"; then
    issue=1
    echo "NOT RUNNING"
    return
  fi

  logs="$(docker logs "$container" 2>&1 || true)"

  if grep -Eq "$pattern" <<< "$logs"; then
    echo "READY"
  elif grep -Eiq 'fatal error|segmentation fault|sigsegv|assertion failed|unhandled exception|core dumped|panic:' <<< "$logs"; then
    issue=1
    echo "ERROR"
  else
    warming=1
    echo "WARMING"
  fi
}

count_rmq_prefix() {
  local prefix="$1"

  if ! is_running dune-rmq-game; then
    echo "0"
    return
  fi

  docker exec dune-rmq-game rabbitmqctl list_connections user state 2>/dev/null \
    | awk -v prefix="$prefix" '$1 != "user" && index($1, prefix) == 1 && $2 == "running" { n++ } END { print n + 0 }'
}

recent_director_logs() {
  if is_running dune-director; then
    docker logs --since 15m dune-director 2>&1 || true
  fi
}

latest_number_from_director_logs() {
  local key="$1"
  grep -o "\"$key\":[0-9.]*" <<< "$director_logs" \
    | tail -n1 \
    | awk -F: '{ print $2 }'
}

signal_state() {
  local pattern="$1"
  local ok_label="$2"
  local wait_label="$3"

  if grep -q "$pattern" <<< "$director_logs"; then
    echo "$ok_label"
  else
    warming=1
    echo "$wait_label"
  fi
}

autoscaler_state() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx dune-autoscaler; then
    echo "RUNNING"
  else
    echo "STOPPED"
  fi
}

auto_update_state() {
  local state_file="runtime/generated/update-auto.env"
  local DUNE_AUTO_UPDATE_ENABLED=0
  local DUNE_AUTO_UPDATE_TIME="${DUNE_AUTO_UPDATE_TIME:-05:00:00}"

  if [ -f "$state_file" ]; then
    # shellcheck disable=SC1090
    . "$state_file"
  fi

  if [ "${DUNE_AUTO_UPDATE_ENABLED:-0}" = "1" ]; then
    echo "ENABLED at ${DUNE_AUTO_UPDATE_TIME:-05:00:00}"
  else
    echo "DISABLED"
  fi
}

display_mode="${SERVER_IP_MODE:-}"
if [ -z "$display_mode" ] || [ "$display_mode" = "unknown" ]; then
  if [ -n "${SERVER_IP:-}" ]; then
    if is_private_ipv4 "$SERVER_IP"; then
      display_mode="local"
    else
      display_mode="public"
    fi
  else
    display_mode="unknown"
  fi
fi

director_logs="$(recent_director_logs)"

container_rows=""
for c in \
  dune-postgres \
  dune-rmq-admin \
  dune-rmq-game \
  dune-text-router \
  dune-director \
  dune-server-gateway \
  dune-server-survival-1 \
  dune-server-overmap \
  dune-orchestrator
do
  container_rows="${container_rows}$(printf "%-26s %s" "$c" "$(container_status "$c")")"$'\n'
done

postgres_tcp="$(check_tcp 15432)"
rmq_admin_tcp="$(check_tcp 32573)"
rmq_game_tcp="$(check_tcp 31982)"
text_router_tcp="$(check_tcp 5059)"
director_tcp="$(check_tcp 11717)"
overmap_udp="$(check_udp 7777)"
survival_udp="$(check_udp 7778)"
survival_s2s_udp="$(check_udp 7888)"
overmap_s2s_udp="$(check_udp 7889)"

partition_count="unknown"
if is_running dune-postgres; then
  partition_count="$(docker exec dune-postgres psql -U dune -d dune -Atc "select count(*) from world_partition;" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "${partition_count:-0}" -le 0 ] 2>/dev/null; then
    issue=1
  fi
else
  issue=1
fi

survival_state="$(map_state dune-server-survival-1 'Server farm is READY .*partition 1')"
overmap_state="$(map_state dune-server-overmap 'Server farm is READY .*partition 2')"

heartbeat_state="$(signal_state 'Battlegroups_SendBattlegroupHeartbeat.*Request successful' OK WAIT)"
population_state="$(signal_state 'Battlegroups_DeclarePopulationAndActivity.*Request successful' OK WAIT)"
capacity_state="$(signal_state 'Battlegroups_DeclareMaxPlayerCapacities.*Request successful' OK WAIT)"

if is_running dune-server-gateway && docker logs --tail 5000 dune-server-gateway 2>&1 | grep -q 'Monitoring for servers going up or down'; then
  gateway_db_state="OK"
else
gateway_db_state="WAIT"
  warming=1
fi

active="$(latest_number_from_director_logs 'BattlegroupCurrentActive' || true)"
capacity="$(latest_number_from_director_logs 'BattlegroupMaxPlayerCapacity' || true)"
population="${active:-unknown}/${capacity:-unknown}"

case "$container_rows" in
  *missing*|*stopped*) issue=1 ;;
esac

for listener_state in \
  "$postgres_tcp" \
  "$rmq_admin_tcp" \
  "$rmq_game_tcp" \
  "$text_router_tcp" \
  "$director_tcp" \
  "$overmap_udp" \
  "$survival_udp" \
  "$survival_s2s_udp" \
  "$overmap_s2s_udp"
do
  [ "$listener_state" = "OK" ] || issue=1
done

case "$survival_state:$overmap_state" in
  *ERROR*|*NOT\ RUNNING*) issue=1 ;;
  *WARMING*) warming=1 ;;
esac

[ "$heartbeat_state" = "OK" ] || warming=1
[ "$population_state" = "OK" ] || warming=1
[ "$capacity_state" = "OK" ] || warming=1
[ "$gateway_db_state" = "OK" ] || warming=1

overall="READY"
if [ "$issue" -ne 0 ]; then
  overall="ISSUE"
elif [ "$warming" -ne 0 ]; then
  overall="WARMING"
fi

echo "=== Dune status ==="
echo "Overall:     $overall"
echo "Title:       ${SERVER_TITLE:-unknown}"
echo "Region:      ${SERVER_REGION:-unknown}"
echo "Mode:        $display_mode"
echo "Server IP:   ${SERVER_IP:-unknown}"
echo "Battlegroup: ${BATTLEGROUP_ID:-unknown}"
echo "Population:  $population"
echo

echo "=== Containers ==="
printf "%-26s %s\n" "SERVICE" "STATUS"
printf "%s" "$container_rows"

echo
echo "=== Listeners ==="
printf "%-24s %-8s %s\n" "CHECK" "PORT" "STATUS"
printf "%-24s %-8s %s\n" "Postgres localhost" "15432/tcp" "$postgres_tcp"
printf "%-24s %-8s %s\n" "RabbitMQ admin" "32573/tcp" "$rmq_admin_tcp"
printf "%-24s %-8s %s\n" "RabbitMQ game" "31982/tcp" "$rmq_game_tcp"
printf "%-24s %-8s %s\n" "TextRouter" "5059/tcp" "$text_router_tcp"
printf "%-24s %-8s %s\n" "Director" "11717/tcp" "$director_tcp"
printf "%-24s %-8s %s\n" "Overmap clients" "7777/udp" "$overmap_udp"
printf "%-24s %-8s %s\n" "Survival_1 clients" "7778/udp" "$survival_udp"
printf "%-24s %-8s %s\n" "Survival_1 S2S" "7888/udp" "$survival_s2s_udp"
printf "%-24s %-8s %s\n" "Overmap S2S" "7889/udp" "$overmap_s2s_udp"

echo
echo "=== Database ==="
echo "World partitions: ${partition_count:-unknown}"

echo
echo "=== Game servers ==="
printf "%-12s %-12s %s\n" "MAP" "STATE" "UPTIME"
printf "%-12s %-12s %s\n" "Survival_1" "$survival_state" "$(container_status dune-server-survival-1)"
printf "%-12s %-12s %s\n" "Overmap" "$overmap_state" "$(container_status dune-server-overmap)"

echo
echo "=== Automation ==="
echo "Autoscaler:   $(autoscaler_state)"
echo "Auto updates: $(auto_update_state)"

echo
echo "=== RabbitMQ game connections ==="
if is_running dune-rmq-game; then
  echo "Director connections:    $(count_rmq_prefix 'bgd.')"
  echo "Game server connections: $(count_rmq_prefix 'sg.')"
  echo "TextRouter connections:  $(count_rmq_prefix 'tr.')"
else
  echo "RabbitMQ game is not running"
fi

echo
echo "=== Funcom/FLS summary ==="
echo "Director heartbeat:       $heartbeat_state"
echo "Population declaration:   $population_state"
echo "Max capacity declaration: $capacity_state"
echo "Gateway DB monitoring:    $gateway_db_state"

echo
echo "Tip: use 'dune ready' for pass/wait/fail readiness checks."
echo "Tip: use 'dune doctor' for troubleshooting suggestions."
