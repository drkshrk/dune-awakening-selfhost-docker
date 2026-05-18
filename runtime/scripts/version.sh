#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

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

steam_build_id() {
  local app_id="$1"
  local manifest="/tmp/dune-appmanifest-${app_id}.acf"

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx dune-orchestrator; then
    docker compose exec -T orchestrator sh -lc "cat /srv/dune/server/steamapps/appmanifest_${app_id}.acf 2>/dev/null" > "$manifest" 2>/dev/null || true
    if [ -s "$manifest" ]; then
      awk '/"buildid"/ { gsub(/"/, "", $2); print $2; exit }' "$manifest"
      rm -f "$manifest"
      return
    fi
    rm -f "$manifest"
  fi

  echo "unknown"
}

PROJECT_VERSION="dev"
[ -f VERSION ] && PROJECT_VERSION="$(tr -d '[:space:]' < VERSION)"

GIT_BRANCH="unknown"
GIT_COMMIT="unknown"
GIT_STATE="unknown"

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_BRANCH="$(git branch --show-current 2>/dev/null || echo unknown)"
  [ -n "$GIT_BRANCH" ] || GIT_BRANCH="detached"
  GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  if git diff --quiet --ignore-submodules -- 2>/dev/null && git diff --cached --quiet --ignore-submodules -- 2>/dev/null; then
    GIT_STATE="clean"
  else
    GIT_STATE="dirty"
  fi
fi

STEAM_APP_ID_VALUE="$(config_value .env STEAM_APP_ID || echo "${STEAM_APP_ID:-3104830}")"
SERVER_IP_VALUE="$(config_value .env SERVER_IP || echo unknown)"
SERVER_MODE_VALUE="$(config_value .env SERVER_IP_MODE || true)"

if [ -z "$SERVER_MODE_VALUE" ] || [ "$SERVER_MODE_VALUE" = "unknown" ]; then
  if printf '%s' "$SERVER_IP_VALUE" | grep -Eq '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)'; then
    SERVER_MODE_VALUE="local"
  elif [ "$SERVER_IP_VALUE" != "unknown" ] && [ -n "$SERVER_IP_VALUE" ]; then
    SERVER_MODE_VALUE="public"
  else
    SERVER_MODE_VALUE="unknown"
  fi
fi

echo "=== Dune launcher version ==="
printf "%-18s %s\n" "Project version:" "$PROJECT_VERSION"
printf "%-18s %s\n" "Git branch:" "$GIT_BRANCH"
printf "%-18s %s\n" "Git commit:" "$GIT_COMMIT"
printf "%-18s %s\n" "Working tree:" "$GIT_STATE"

echo
echo "=== Server config ==="
if [ -f .env ]; then
  printf "%-18s %s\n" "Title:" "$(config_value .env SERVER_TITLE || echo unknown)"
  printf "%-18s %s\n" "Region:" "$(config_value .env SERVER_REGION || echo unknown)"
  printf "%-18s %s\n" "Mode:" "$SERVER_MODE_VALUE"
  printf "%-18s %s\n" "Server IP:" "$SERVER_IP_VALUE"
  printf "%-18s %s\n" "Steam app ID:" "$STEAM_APP_ID_VALUE"
else
  echo ".env not found"
  printf "%-18s %s\n" "Steam app ID:" "$STEAM_APP_ID_VALUE"
fi

echo
echo "=== Installed server build ==="
printf "%-18s %s\n" "Local build ID:" "$(steam_build_id "$STEAM_APP_ID_VALUE")"

echo
echo "=== Image tags ==="
if [ -f runtime/generated/image-tags.env ]; then
  sed -n '1,80p' runtime/generated/image-tags.env
else
  echo "runtime/generated/image-tags.env not found"
fi
