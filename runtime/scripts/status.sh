#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "=== Containers ==="
docker ps --filter "name=dune-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo
echo "=== TCP listeners ==="
ss -lntp | grep -E ':(15432|31982|32573|5059|11717)' || true

echo
echo "=== UDP listeners ==="
ss -lnup | grep -E ':(7777|7778|7888|7889)' || true

echo
echo "=== RabbitMQ game connections ==="
docker exec dune-rmq-game rabbitmqctl list_connections name user peer_host state 2>/dev/null || true

echo
echo "=== Survival_1 readiness ==="
docker logs dune-server-survival-1 2>&1 \
  | grep -Ei "Server farm is READY|Loaded partition definition|Set a new farm leader|ACCESS_REFUSED|RMQ runnable failed" \
  | tail -50 || true

echo
echo "=== Overmap readiness ==="
docker logs dune-server-overmap 2>&1 \
  | grep -Ei "Server farm is READY|Loaded partition definition|Set a new farm leader|ACCESS_REFUSED|RMQ runnable failed|Partition assigned from DB" \
  | tail -50 || true

echo
echo "=== Director heartbeat/errors ==="
docker logs --tail 220 dune-director 2>&1 \
  | grep -Ei "Request successful|ACCESS_DENIED|Exception|ERROR|Now listening" \
  | tail -80 || true

echo
echo "=== Gateway status/errors ==="
docker logs --tail 180 dune-server-gateway 2>&1 \
  | grep -Ei "GatewayDeclareFarmStatus|GameRmqAddress|Monitoring|ERROR|Exception|Starting gateway" \
  | tail -80 || true
