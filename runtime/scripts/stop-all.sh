#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "=== Stopping game servers first ==="
docker rm -f dune-server-overmap dune-server-survival-1 2>/dev/null || true

echo
echo "=== Stopping gateway/director/router ==="
docker rm -f dune-server-gateway dune-director dune-text-router 2>/dev/null || true

echo
echo "=== Stopping RabbitMQ ==="
docker rm -f dune-rmq-game dune-rmq-admin 2>/dev/null || true

echo
echo "=== Stopping Postgres ==="
docker rm -f dune-postgres 2>/dev/null || true

echo
echo "=== Remaining dune containers ==="
docker ps --filter "name=dune-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
