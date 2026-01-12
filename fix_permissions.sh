#!/usr/bin/env bash
set -euo pipefail
ROOT="/Users/kunzt.freiheit/Documents/ϕ/Nar ϕ"

echo "[fix_permissions] Clearing macOS quarantine flags (xattr -cr)..."

if [ -d "$ROOT/desktop" ]; then
  echo "[fix_permissions] Processing: $ROOT/desktop"
  xattr -cr "$ROOT/desktop" || true
else
  echo "[fix_permissions] desktop folder not found: $ROOT/desktop"
fi

# Clear node_modules at repo root and desktop/node_modules if present
if [ -d "$ROOT/node_modules" ]; then
  echo "[fix_permissions] Processing: $ROOT/node_modules"
  xattr -cr "$ROOT/node_modules" || true
fi
if [ -d "$ROOT/desktop/node_modules" ]; then
  echo "[fix_permissions] Processing: $ROOT/desktop/node_modules"
  xattr -cr "$ROOT/desktop/node_modules" || true
fi

echo "[fix_permissions] Done." 
