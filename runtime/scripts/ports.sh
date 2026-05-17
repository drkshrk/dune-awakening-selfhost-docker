#!/usr/bin/env bash
set -euo pipefail

echo "=== Public / required ports ==="

echo
echo "TCP:"
ss -lntp | grep -E ':(15432|31982|32573|5059|11717)' || true

echo
echo "UDP:"
ss -lnup | grep -E ':(7777|7778|7888|7889)' || true

cat <<'EOF'

Expected:
  Public TCP:
    31982  RabbitMQ game TLS

  Public UDP:
    7777   Overmap clients
    7778   Survival_1 clients
    7888   Survival_1 server-to-server
    7889   Overmap server-to-server

  Localhost TCP:
    15432  Postgres
    32573  RabbitMQ admin
    5059   TextRouter
    11717  Director
EOF
