#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! docker ps --format '{{.Names}}' | grep -qx dune-postgres; then
  echo "dune-postgres is not running."
  exit 1
fi

survival_log_ready=false
overmap_log_ready=false
log_ready_partition_ids=""
if docker ps --format '{{.Names}}' | grep -qx dune-server-survival-1 \
  && docker logs dune-server-survival-1 2>&1 | grep -Eq 'Server farm is READY .*partition 1'; then
  survival_log_ready=true
  log_ready_partition_ids="1"
fi
if docker ps --format '{{.Names}}' | grep -qx dune-server-overmap \
  && docker logs dune-server-overmap 2>&1 | grep -Eq 'Server farm is READY .*partition 2'; then
  overmap_log_ready=true
  log_ready_partition_ids="${log_ready_partition_ids}${log_ready_partition_ids:+,}2"
fi
while IFS= read -r container_name; do
  partition_id="${container_name##*-}"
  if [ -n "$partition_id" ] && docker logs "$container_name" 2>&1 | grep -Eq "Server farm is READY"; then
    log_ready_partition_ids="${log_ready_partition_ids}${log_ready_partition_ids:+,}${partition_id}"
  fi
done < <(docker ps --format '{{.Names}}' | grep -E '^dune-server-.+-[0-9]+$' || true)
log_ready_partition_ids="${log_ready_partition_ids:-0}"

echo "=== Dune server partitions ==="
docker exec dune-postgres psql -U postgres -d dune -P pager=off -c "
select
  wp.partition_id,
  wp.map,
  wp.dimension_index as dim,
  wp.label,
  case
    when coalesce(wp.server_id, '') = '' then ''
    else wp.server_id
  end as assigned_server,
  coalesce(fs.game_port::text, '') as game_port,
  coalesce(fs.igw_port::text, '') as igw_port,
  case
    when wp.partition_id = 1 and '${survival_log_ready}' = 'true' then 'true'
    when wp.partition_id = 2 and '${overmap_log_ready}' = 'true' then 'true'
    when wp.partition_id in (${log_ready_partition_ids}) then 'true'
    else coalesce(fs.ready::text, '')
  end as ready,
  coalesce(fs.alive::text, '') as alive
from dune.world_partition wp
left join dune.farm_state fs on fs.server_id = wp.server_id
order by wp.partition_id;
"

echo
echo "=== Map summary ==="
docker exec dune-postgres psql -U postgres -d dune -P pager=off -c "
select
  wp.map,
  count(*) as partitions,
  min(wp.partition_id) as first_id,
  max(wp.partition_id) as last_id,
  count(nullif(wp.server_id, '')) as assigned
from dune.world_partition wp
group by wp.map
order by min(wp.partition_id);
"
