#!/usr/bin/env bash
# scripts/scan-bundle.sh — fail the build if a privileged secret is bundled (FND-03)
# Usage: bash scripts/scan-bundle.sh [dist-dir]
#
# Scans dist/*.js and dist/*.html for privileged-secret markers:
#   - sb_secret_         : new Supabase opaque service-role key prefix
#   - SUPABASE_SERVICE_ROLE_KEY : literal env-var name (should never appear in bundle)
#   - eyJ.*service_role  : base64-encoded JWT payload containing "service_role"
#   - service_role       : plaintext role name (belt-and-suspenders)
#
# The anon/publishable key (sb_publishable_ / VITE_SUPABASE_ANON_KEY) is EXPECTED
# in the bundle and is NOT flagged.
set -euo pipefail

DIST="${1:-dist}"

if [ ! -d "$DIST" ]; then
  echo "::error::scan-bundle: dist directory '$DIST' not found — run 'npm run build' first"
  exit 1
fi

# Patterns that indicate a privileged secret was bundled.
# Deliberately exclude sb_publishable_ (anon key) — that is expected in the bundle.
PATTERNS='sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role'

FOUND=$(grep -REn --include='*.js' --include='*.html' "$PATTERNS" "$DIST" 2>/dev/null || true)

if [ -n "$FOUND" ]; then
  echo "::error::privileged secret marker found in built bundle:"
  echo "$FOUND"
  exit 1
fi

echo "bundle secret-scan clean"
