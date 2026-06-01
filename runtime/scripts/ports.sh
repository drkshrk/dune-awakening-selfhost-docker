#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

runtime/scripts/ping-diagnostics.sh
