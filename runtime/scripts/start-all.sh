#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

set -a
if [ -f .env ]; then
  . ./.env
fi
set +a

echo "=== Starting Postgres ==="
runtime/scripts/start-postgres.sh

echo
echo "=== Starting RabbitMQ ==="
runtime/scripts/start-rabbitmq.sh

echo
echo "=== Starting TextRouter ==="
runtime/scripts/start-text-router.sh

echo
echo "=== Starting Director ==="
runtime/scripts/start-director.sh

echo
echo "=== Starting ServerGateway ==="
runtime/scripts/start-server-gateway.sh

echo
echo "=== Starting Survival_1 ==="
runtime/scripts/start-server-survival-1.sh

echo
echo "=== Starting Overmap ==="
runtime/scripts/start-server-overmap.sh

echo
echo "=== Final quick status ==="
docker ps --filter "name=dune-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo
echo "=== Required TCP listeners ==="
ss -lntp | grep -E ':(15432|31982|32573|5059|11717)' || true

echo
echo "=== Required UDP listeners ==="
ss -lnup | grep -E ':(7777|7778|7888|7889)' || true

cat <<'EOF'

Started. Notes:
- Survival_1 can take several minutes to become fully READY.
- Overmap can also take a few minutes.
- Use runtime/scripts/status.sh after startup to check readiness.
EOF
