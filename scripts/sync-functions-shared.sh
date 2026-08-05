#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$ROOT/functions/shared"
mkdir -p "$ROOT/functions/shared"
cp -R "$ROOT/packages/shared/src" "$ROOT/functions/shared/src"
cp "$ROOT/packages/shared/package.json" "$ROOT/functions/shared/package.json"
cp "$ROOT/packages/shared/tsconfig.json" "$ROOT/functions/shared/tsconfig.json"
# Strip workspace-only fields; keep publishable shape for Cloud Build
cd "$ROOT/functions/shared"
npm install --omit=dev --ignore-scripts >/dev/null 2>&1 || npm install --ignore-scripts
# Need typescript to build
npm install typescript --no-save >/dev/null 2>&1 || true
npx tsc -p tsconfig.json
echo "Synced functions/shared"
