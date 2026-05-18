#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

CONTAINER_NAME="dune-autoscaler"
IMAGE="dune-orchestrator:dev"

mkdir -p runtime/generated runtime/logs

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Autoscaler already running: $CONTAINER_NAME"
  exit 0
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

if ! docker ps --format '{{.Names}}' | grep -qx dune-director; then
  echo "Cannot start autoscaler: dune-director is not running."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx dune-postgres; then
  echo "Cannot start autoscaler: dune-postgres is not running."
  exit 1
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Cannot start autoscaler: Docker image not found: $IMAGE"
  echo "Start or build the orchestrator first:"
  echo "  docker compose up -d --build orchestrator"
  exit 1
fi

echo "Starting autoscaler container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --entrypoint bash \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD:$PWD" \
  -w "$PWD" \
  "$IMAGE" \
  runtime/scripts/autoscaler.sh >/dev/null

echo "Autoscaler started: $CONTAINER_NAME"
echo "Logs:"
echo "  dune autoscaler logs"
