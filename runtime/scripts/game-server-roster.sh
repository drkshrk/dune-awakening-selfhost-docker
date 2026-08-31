#!/usr/bin/env bash
# Pure helpers for the "=== Game servers ===" section of status.sh.
#
# Sourced, never executed: no `cd`, no `set -e`, no top-level work, and no
# docker/psql/python. Every input arrives as a string so the whole thing is
# testable without a running battlegroup -- see
# runtime/tests/test-game-server-roster.sh.
#
# Why this exists: status.sh used to hardcode two rows (Survival_1, Overmap).
# A host runs one server per non-blocked world_partition row of every map that
# is always-on, which on a real install is several more -- including a second
# Survival_1 partition that the two hardcoded rows hid completely. Reporting
# only two made the console's Game Servers row read OK while other maps were
# still warming.
#
# The expected set is derived from CONFIGURATION, never from `docker ps`: an
# always-on map whose container is missing must be reported, not omitted.

# Container name for a map + partition.
#
# This mirrors spawn-server.sh's slug (the name docker actually receives):
# the map and partition are slugified TOGETHER, then runs of dashes are
# collapsed and any leading/trailing dash trimmed. map-modes.sh has its own
# copy that omits the collapse/trim and can therefore compute a name that was
# never created; do not use that one here.
game_server_container_name() {
  local slug

  # The two protected partitions are brought up by dedicated scripts
  # (start-server-survival-1.sh / start-server-overmap.sh), not spawn-server.sh,
  # and carry fixed names with no partition suffix. status.sh:181-186 encodes the
  # same pairing in reverse. Applying the slug rule to them yields
  # dune-server-survival-1-1 / dune-server-overmap-2, which do not exist -- every
  # row for the two most important maps would read NOT RUNNING forever.
  #
  # Only these exact pairings are special. Survival_1's other partitions are
  # spawned normally, so partition 60 correctly slugs to
  # dune-server-survival-1-60.
  case "$1:$2" in
    Survival_1:1) printf 'dune-server-survival-1\n'; return 0 ;;
    Overmap:2) printf 'dune-server-overmap\n'; return 0 ;;
  esac

  slug="$(printf '%s-%s' "$1" "$2" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')"
  printf 'dune-server-%s\n' "$slug"
}

# True when a map is one of the two protected always-on maps. These are never
# present in map-runtime-modes.json (map-modes.sh's `set` rejects them), so they
# have to be named explicitly rather than discovered.
game_server_map_is_protected() {
  case "$1" in
    Survival_1|Overmap) return 0 ;;
    *) return 1 ;;
  esac
}

# game_server_expected_roster <always_on_maps> <partition_rows>
#
#   always_on_maps  newline-separated map names, in startup-priority order
#                   (from `map-modes.sh always-on-maps`)
#   partition_rows  "map|partition_id|db_ready" lines for every NON-BLOCKED
#                   world_partition row, protected maps INCLUDED
#
# Emits one record per expected server:
#
#   label|map|partition_id|container|db_ready
#
# Ordering is protected pair first, then configured always-on maps in the order
# given, partitions ascending within a map.
#
# Labels: the lowest partition of a map keeps the bare map name and additional
# partitions get "#<partition>". The bare first label is not cosmetic --
# ServerPanels.tsx matches /Survival_1\s+NOT RUNNING/ and /Overmap\s+NOT RUNNING/
# to detect a stopped battlegroup, and a "Survival_1#1" label would silently
# break that.
game_server_expected_roster() {
  local always_on="$1" partition_rows="$2" map

  {
    printf 'Survival_1\nOvermap\n'
    printf '%s\n' "$always_on"
  } | while IFS= read -r map; do
    [ -n "$map" ] || continue
    game_server_rows_for_map "$map" "$partition_rows"
  done | awk -F '|' '!seen[$2 "|" $3]++'
  # The awk dedup is load-bearing, not defensive tidiness: the protected pair is
  # seeded above, so an always-on list that still names Survival_1 or Overmap
  # would otherwise emit that map's partitions twice.
}

# Records for a single map, partitions ascending. Rows whose partition id is not
# numeric are dropped: a garbled psql result must not become a phantom server.
game_server_rows_for_map() {
  local map="$1" rows="$2" row_map pid ready first=1 label
  local sorted

  sorted="$(printf '%s\n' "$rows" | sort -t '|' -k1,1 -k2,2n)"

  while IFS='|' read -r row_map pid ready; do
    [ -n "$row_map" ] || continue
    [ "$row_map" = "$map" ] || continue
    case "$pid" in
      ''|*[!0-9]*) continue ;;
    esac
    if [ "$first" = "1" ]; then
      label="$map"
      first=0
    else
      label="$map#$pid"
    fi
    printf '%s|%s|%s|%s|%s\n' "$label" "$map" "$pid" "$(game_server_container_name "$map" "$pid")" "$ready"
  done <<EOF
$sorted
EOF
}

# State for an expected map server whose container does not exist.
#
# Pending, not faulty, while the battlegroup itself is still coming up: nothing
# has had the chance to spawn it yet, and reporting NOT RUNNING there put
# Overall: ISSUE through every cold start. Once the core stack is fully up, an
# absent always-on map IS a fault -- including when the autoscaler is the thing
# that is down, which is why this does not test the autoscaler.
#
# Gating on the autoscaler was the first attempt and never fired once: it starts
# roughly 100 seconds into a cold start, long after the roster is first
# reported, so every unspawned map still read NOT RUNNING.
game_server_absent_state() {
  if [ "${1:-0}" = "1" ]; then
    printf 'NOT RUNNING\n'
  else
    printf 'WAIT\n'
  fi
}

# Roll-up over the RENDERED section body.
#
# status.sh builds the rows inside a command substitution, so any issue=/warming=
# assignment made while rendering them dies with the subshell -- the same trap
# documented in container-issue-scan.sh. The parent shell must call these on the
# finished text instead.
#
# The tokens deliberately mirror summarizeGameServers in ServerPanels.tsx so the
# shell's Overall: verdict and the console's health pill cannot disagree.
game_server_rows_have_issue() {
  local upper
  upper="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
  case "$upper" in
    *ERROR*|*"NOT RUNNING"*|*MISSING*) return 0 ;;
  esac
  return 1
}

game_server_rows_have_warming() {
  local upper
  upper="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
  case "$upper" in
    *WARMING*|*WAIT*) return 0 ;;
  esac
  return 1
}
