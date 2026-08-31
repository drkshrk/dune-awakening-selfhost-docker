#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
source "$repo_root/runtime/scripts/game-server-roster.sh"

failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

expect_eq() {
  local label="$1" want="$2" got="$3"
  if [ "$want" != "$got" ]; then
    fail "$label: want [$want] got [$got]"
  fi
}

# The real dune2 layout, captured 2026-08-31: Survival_1 and DeepDesert_1 each
# have two partitions. "map|partition|db_ready", protected maps INCLUDED --
# excluding them the way map-modes.sh list does would drop Survival_1's second
# partition, which is the whole bug this section exists to fix.
DUNE2_ROWS="DeepDesert_1|8|t
DeepDesert_1|59|t
Overmap|2|t
SH_Arrakeen|3|t
SH_HarkoVillage|4|t
Survival_1|1|t
Survival_1|60|t"

DUNE2_ALWAYS_ON="SH_Arrakeen
SH_HarkoVillage
DeepDesert_1"

roster() {
  game_server_expected_roster "$1" "$2"
}

field() {
  printf '%s\n' "$1" | awk -F '|' -v c="$2" '{print $c}' | paste -sd, -
}

# --- container naming -------------------------------------------------------

# The protected pair have fixed names with no partition suffix; they are started
# by dedicated scripts, not spawn-server.sh. Applying the slug rule to them gives
# dune-server-survival-1-1 / dune-server-overmap-2, which do not exist.
expect_eq "survival_1 partition 1 has no suffix" \
  "dune-server-survival-1" "$(game_server_container_name Survival_1 1)"
expect_eq "overmap partition 2 has no suffix" \
  "dune-server-overmap" "$(game_server_container_name Overmap 2)"

# ...but Survival_1's other partitions ARE spawned normally and do carry it.
expect_eq "survival_1 partition 60 is slugged" \
  "dune-server-survival-1-60" "$(game_server_container_name Survival_1 60)"

expect_eq "underscore and case are slugged" \
  "dune-server-deepdesert-1-8" "$(game_server_container_name DeepDesert_1 8)"
expect_eq "leading capitals are slugged" \
  "dune-server-sh-harkovillage-4" "$(game_server_container_name SH_HarkoVillage 4)"

# Divergence guard. map-modes.sh:364-371 slugs without collapsing runs of
# dashes or trimming the ends, so for a name with adjacent non-alphanumerics it
# computes a container spawn-server.sh would never create. This asserts the
# spawn-server behaviour, which is the one docker actually sees.
expect_eq "runs of separators collapse" \
  "dune-server-foo-bar-7" "$(game_server_container_name 'Foo__Bar' 7)"
expect_eq "leading separator is trimmed" \
  "dune-server-foo-3" "$(game_server_container_name '_Foo' 3)"

# --- roster derivation ------------------------------------------------------

full="$(roster "$DUNE2_ALWAYS_ON" "$DUNE2_ROWS")"

expect_eq "dune2 roster is seven servers" "7" "$(printf '%s\n' "$full" | grep -c .)"

# Protected pair first, then always-on in startup-priority order, partitions
# ascending within a map.
expect_eq "roster order" \
  "Survival_1,Survival_1#60,Overmap,SH_Arrakeen,SH_HarkoVillage,DeepDesert_1,DeepDesert_1#59" \
  "$(field "$full" 1)"

expect_eq "container names" \
  "dune-server-survival-1,dune-server-survival-1-60,dune-server-overmap,dune-server-sh-arrakeen-3,dune-server-sh-harkovillage-4,dune-server-deepdesert-1-8,dune-server-deepdesert-1-59" \
  "$(field "$full" 4)"

# No duplicate containers: two rows resolving to one container would make their
# states indistinguishable.
expect_eq "container names are unique" "7" \
  "$(field "$full" 4 | tr ',' '\n' | sort -u | grep -c .)"

# The label rule is not cosmetic. ServerPanels.tsx detects a stopped battlegroup
# with /Survival_1\s+NOT RUNNING/ and /Overmap\s+NOT RUNNING/, so the lowest
# partition of a map must keep the bare name.
expect_eq "lowest partition keeps the bare label" "Survival_1" \
  "$(printf '%s\n' "$full" | awk -F '|' '$2 == "Survival_1"' | head -1 | cut -d '|' -f1)"

# A fresh install with no always-on maps configured must still report the
# protected pair -- never fewer.
minimal="$(roster "" "Overmap|2|t
Survival_1|1|t")"
expect_eq "no always-on maps still yields the protected pair" \
  "Survival_1,Overmap" "$(field "$minimal" 1)"

# An always-on map with no partition rows contributes nothing rather than a
# phantom server.
expect_eq "always-on map absent from world_partition yields no row" \
  "Survival_1,Overmap" \
  "$(field "$(roster "Nonexistent_Map" "Overmap|2|t
Survival_1|1|t")" 1)"

# Blocked partitions are excluded by the caller's SQL; a blocked row simply
# never arrives. Confirm a map whose only extra partition is withheld drops back
# to a single bare label.
expect_eq "withheld partition drops the suffix" "DeepDesert_1" \
  "$(field "$(roster "DeepDesert_1" "DeepDesert_1|8|t")" 1)"

# A garbled psql result must not become a phantom server.
expect_eq "non-numeric partition ids are dropped" "Survival_1" \
  "$(field "$(roster "" "Survival_1|1|t
Survival_1|abc|t
Survival_1||t")" 1)"

# map-modes.sh already filters the protected pair out of its always-on list, but
# a stale list must not duplicate their partitions.
expect_eq "protected map in the always-on list is not duplicated" \
  "Survival_1,Overmap" \
  "$(field "$(roster "Survival_1
Overmap" "Overmap|2|t
Survival_1|1|t")" 1)"

# --- rendered row format ----------------------------------------------------

# Every consumer parses rows with ^(\S+)\s+(.+?)\s{2,}(.+)$ after trimming the
# line. Merely matching is not the contract -- a malformed row can still match
# and be silently MISPARSED, so these assert the extracted fields.
#
# parse_row reproduces that regex faithfully: the MAP token is the first
# whitespace-free run, and the lazy (.+?) means STATE is the shortest prefix
# before the first run of >= 2 spaces. Emits "map<TAB>state<TAB>uptime", or
# nothing when the line does not parse at all.
parse_row() {
  printf '%s\n' "$1" | awk '
    {
      line = $0
      sub(/[ \t]+$/, "", line)
      if (!match(line, /^[^ \t]+[ \t]+/)) next
      map = substr(line, 1, RLENGTH)
      sub(/[ \t]+$/, "", map)
      rest = substr(line, RLENGTH + 1)
      if (!match(rest, /[ \t][ \t]+/)) next
      state = substr(rest, 1, RSTART - 1)
      uptime = substr(rest, RSTART + RLENGTH)
      if (state == "" || uptime == "") next
      printf "%s\t%s\t%s\n", map, state, uptime
    }'
}

render_row() {
  printf '%-24s %-13s %s' "$1" "$2" "$3"
}

check_row_parses() {
  local label="$1" state="$2" uptime="$3"
  expect_eq "row [$label|$state|$uptime] parses" \
    "$(printf '%s\t%s\t%s' "$label" "$state" "$uptime")" \
    "$(parse_row "$(render_row "$label" "$state" "$uptime")")"
}

check_row_parses "Survival_1" "READY" "Up 15 hours"
check_row_parses "DeepDesert_1#59" "NOT RUNNING" "missing"
check_row_parses "SH_HarkoVillage" "WAIT" "unknown"
check_row_parses "Survival_1#60" "WARMING" "Up 3 seconds"

# Why the "#" label form exists rather than "Map partition N": a space in the
# label does not fail the regex, it silently misparses -- the map becomes the
# first word and the state becomes the rest of the label.
expect_eq "a space in the label misparses rather than failing" \
  "Survival_1" \
  "$(parse_row "$(render_row 'Survival_1 partition 60' READY 'Up 15 hours')" | cut -f1)"

# Why the uptime column is never emitted empty: container_status can return an
# empty string, and after trimming there is no >= 2-space run left, so the row
# does not parse and vanishes from the console entirely.
expect_eq "an empty uptime makes the row vanish" "" \
  "$(parse_row "$(render_row Survival_1 READY '')")"

# --- roll-up ----------------------------------------------------------------

expect_issue() {
  if ! game_server_rows_have_issue "$2"; then fail "$1: expected an issue"; fi
}
expect_no_issue() {
  if game_server_rows_have_issue "$2"; then fail "$1: expected no issue"; fi
}
expect_warming() {
  if ! game_server_rows_have_warming "$2"; then fail "$1: expected warming"; fi
}
expect_no_warming() {
  if game_server_rows_have_warming "$2"; then fail "$1: expected no warming"; fi
}

ALL_READY="$(printf '%-24s %-13s %s\n' Survival_1 READY 'Up 15 hours' Overmap READY 'Up 15 hours')"
expect_no_issue "all ready" "$ALL_READY"
expect_no_warming "all ready" "$ALL_READY"

expect_issue "not running" "$(printf '%-24s %-13s %s\n' Survival_1 'NOT RUNNING' missing)"
expect_issue "error" "$(printf '%-24s %-13s %s\n' Survival_1 ERROR 'Up 2 minutes')"
expect_warming "warming" "$(printf '%-24s %-13s %s\n' Survival_1 WARMING 'Up 9 seconds')"

# A not-yet-spawned always-on map is not a fault: it reads WAIT, which is
# warming rather than an issue. Rendering it NOT RUNNING would put Overall:
# ISSUE on every clean boot.
expect_warming "wait is warming" "$(printf '%-24s %-13s %s\n' SH_Arrakeen WAIT unknown)"
expect_no_issue "wait is not an issue" "$(printf '%-24s %-13s %s\n' SH_Arrakeen WAIT unknown)"

# The uptime column carries container_status output, which is lowercase.
expect_issue "lowercase missing in the uptime column" \
  "$(printf '%-24s %-13s %s\n' SH_Arrakeen 'NOT RUNNING' missing)"

# Why status.sh writes "pending" rather than "missing" in a WAIT row's uptime
# column: this roll-up and summarizeGameServers both scan the WHOLE row, so a
# queued map would raise an issue on the uptime alone and WAIT would achieve
# nothing. These two assertions are the reason that substitution exists.
expect_no_issue "queued map with a pending uptime is not an issue" \
  "$(printf '%-24s %-13s %s\n' SH_Arrakeen WAIT pending)"
expect_issue "the same row with a missing uptime WOULD be an issue" \
  "$(printf '%-24s %-13s %s\n' SH_Arrakeen WAIT missing)"

expect_no_issue "empty section" ""
expect_no_warming "empty section" ""

if [ "$failures" -ne 0 ]; then
  echo "game-server-roster: $failures check(s) failed" >&2
  exit 1
fi

echo "game-server-roster: all checks passed"
