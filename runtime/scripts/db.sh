#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

BACKUP_DIR_DEFAULT="runtime/backups/db"

usage() {
  cat <<'EOF'
Usage:
  dune db backup
  dune db backup <output-dir>
  dune db list
  dune db status
  dune db import <backup-file>

Backups use pg_dump custom format and do not include Funcom token files.
Import requires confirmation and creates a pre-import backup first.
EOF
}

require_postgres() {
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx dune-postgres; then
    echo "dune-postgres is not running."
    exit 1
  fi
}

config_value() {
  local file="$1"
  local key="$2"

  [ -f "$file" ] || return 1
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, length(key) + 2)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      print value
      exit
    }
  ' "$file"
}

backup_db() {
  local out_dir="${1:-$BACKUP_DIR_DEFAULT}"
  local ts
  local backup_file
  local meta_file
  local tmp_file

  require_postgres
  mkdir -p "$out_dir"

  ts="$(date +%Y%m%d-%H%M%S)"
  backup_file="$out_dir/dune-db-$ts.dump"
  meta_file="$out_dir/dune-db-$ts.meta"
  tmp_file="/tmp/dune-db-$ts.dump"

  echo "Creating database backup..."
  docker exec dune-postgres pg_dump -U dune -d dune -Fc -f "$tmp_file"
  docker cp "dune-postgres:$tmp_file" "$backup_file"
  docker exec dune-postgres rm -f "$tmp_file" >/dev/null 2>&1 || true

  {
    echo "created_at=$(date -Iseconds)"
    echo "database=dune"
    echo "format=pg_dump_custom"
    echo "server_title=$(config_value .env SERVER_TITLE || echo unknown)"
    echo "server_region=$(config_value .env SERVER_REGION || echo unknown)"
    echo "server_ip_mode=$(config_value .env SERVER_IP_MODE || echo unknown)"
    echo "battlegroup_id=$(config_value runtime/generated/battlegroup.env BATTLEGROUP_ID || echo unknown)"
  } > "$meta_file"

  chmod 600 "$backup_file" "$meta_file"

  echo "Backup written:"
  echo "  $backup_file"
  echo "Metadata:"
  echo "  $meta_file"
}

list_backups() {
  local out_dir="${1:-$BACKUP_DIR_DEFAULT}"

  echo "=== Database backups ==="
  if [ -d "$out_dir" ]; then
    find "$out_dir" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.sql' \) -printf '%TY-%Tm-%Td %TH:%TM  %p\n' | sort || true
  else
    echo "No backup directory found: $out_dir"
  fi
}

status_db() {
  require_postgres

  echo "=== Database status ==="
  docker exec dune-postgres psql -U dune -d dune -c "
select current_database() as database, current_user as user;
"
  docker exec dune-postgres psql -U dune -d dune -c "
select count(*) as world_partition_rows from world_partition;
"
}

stop_db_dependents() {
  echo "Stopping services that depend on the database..."
  docker ps --format '{{.Names}}' | grep '^dune-server-' | xargs -r docker rm -f
  docker rm -f dune-server-gateway dune-director dune-text-router 2>/dev/null || true
}

import_db() {
  local backup_file="${1:-}"
  local restore_after
  local tmp_file

  if [ -z "$backup_file" ]; then
    usage
    exit 2
  fi

  if [ ! -f "$backup_file" ]; then
    echo "Backup file not found: $backup_file"
    exit 1
  fi

  require_postgres

  echo "WARNING: importing a database backup replaces current battlegroup database state."
  echo "A pre-import backup will be created first."
  read -r -p "Continue with import? [y/N]: " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Import cancelled."; exit 1 ;;
  esac

  backup_db "$BACKUP_DIR_DEFAULT/pre-import"
  stop_db_dependents

  tmp_file="/tmp/dune-db-import-$(date +%Y%m%d-%H%M%S).dump"
  docker cp "$backup_file" "dune-postgres:$tmp_file"

  echo "Restoring database..."
  docker exec dune-postgres pg_restore -U dune -d dune --clean --if-exists "$tmp_file"
  docker exec dune-postgres rm -f "$tmp_file" >/dev/null 2>&1 || true

  echo "Database import finished."
  read -r -p "Restart Dune stack now? [y/N]: " restore_after
  case "$restore_after" in
    y|Y|yes|YES) runtime/scripts/start-all.sh ;;
    *) echo "Services remain stopped. Start them with: dune start" ;;
  esac
}

cmd="${1:-help}"

case "$cmd" in
  backup)
    backup_db "${2:-$BACKUP_DIR_DEFAULT}"
    ;;
  list)
    list_backups "${2:-$BACKUP_DIR_DEFAULT}"
    ;;
  status)
    status_db
    ;;
  import|restore)
    import_db "${2:-}"
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "Unknown db command: $cmd"
    usage
    exit 2
    ;;
esac
