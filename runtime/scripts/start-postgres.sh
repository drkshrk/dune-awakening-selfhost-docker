#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

[ -f runtime/generated/image-tags.env ] && . runtime/generated/image-tags.env
POSTGRES_IMAGE_TAG="${DUNE_POSTGRES_IMAGE_TAG:-17.4-alpine-fc-13}"
IMAGE="registry.funcom.com/funcom/self-hosting/igw-postgres:${POSTGRES_IMAGE_TAG}"

mkdir -p runtime/postgres/initdb

cat > runtime/postgres/initdb/01-create-dune-user.sql <<'SQL'
DO
$$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles WHERE rolname = 'dune'
   ) THEN
      CREATE ROLE dune LOGIN PASSWORD 'dune';
   END IF;
END
$$;

ALTER DATABASE dune OWNER TO dune;
GRANT ALL PRIVILEGES ON DATABASE dune TO dune;
SQL

docker network create dune-net 2>/dev/null || true

docker rm -f dune-postgres 2>/dev/null || true

docker volume create dune-postgres-data >/dev/null

docker run -d \
  --name dune-postgres \
  --network dune-net \
  --restart unless-stopped \
  -p 127.0.0.1:15432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dune \
  -v dune-postgres-data:/var/lib/postgresql/data \
  -v "$PWD/runtime/postgres/initdb:/docker-entrypoint-initdb.d:ro" \
  "$IMAGE"

echo "Waiting for Postgres..."
for i in $(seq 1 60); do
  if docker exec dune-postgres pg_isready -U postgres -d dune >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker exec dune-postgres pg_isready -U postgres -d dune

echo
echo "=== Databases ==="
docker exec dune-postgres psql -U postgres -d dune -c '\l'

echo
echo "=== Roles ==="
docker exec dune-postgres psql -U postgres -d dune -c '\du'

echo
echo "=== Container ==="
docker ps --filter "name=dune-postgres" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
