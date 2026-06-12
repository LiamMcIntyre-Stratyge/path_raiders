#!/usr/bin/env bash
# test/scan-bundle.test.sh — planted-secret negative test for scripts/scan-bundle.sh
#
# Case 1: A JS file containing a service-role secret marker → scanner MUST exit non-zero.
# Case 2: A JS file containing only an anon/publishable key  → scanner MUST exit zero.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/scripts/scan-bundle.sh"
TMPDIR_BASE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_BASE"' EXIT

echo "--- scan-bundle.test.sh ---"

# ─── Case 1: planted service-role marker → scanner must exit NON-ZERO ──────────

DIRTY_DIST="$TMPDIR_BASE/dirty/dist"
mkdir -p "$DIRTY_DIST"

# Plant a fake service-role key in the format of the new opaque Supabase key
cat > "$DIRTY_DIST/app.js" <<'JS'
const config = { url: "https://example.supabase.co", key: "sb_secret_FAKESERVICEROLEKEY1234567890abcdef" }
JS

echo "Case 1: planted sb_secret_ marker in fake dist/ …"
if bash "$SCRIPT" "$DIRTY_DIST" > /dev/null 2>&1; then
  echo "FAIL: scanner exited 0 on a file containing sb_secret_ — it should have exited non-zero"
  exit 1
fi
echo "PASS: scanner correctly exited non-zero for planted sb_secret_ marker"

# Also test the base64 service_role pattern
cat > "$DIRTY_DIST/app2.js" <<'JS'
// A fake JWT-style token referencing service_role in a config object
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake"
const role = token.includes("service_role") ? "admin" : "anon"
JS

echo "Case 1b: planted service_role string in fake dist/ …"
if bash "$SCRIPT" "$DIRTY_DIST" > /dev/null 2>&1; then
  echo "FAIL: scanner exited 0 on a file containing service_role — it should have exited non-zero"
  exit 1
fi
echo "PASS: scanner correctly exited non-zero for service_role string"

# ─── Case 2: only anon/publishable key → scanner MUST exit ZERO ──────────────

CLEAN_DIST="$TMPDIR_BASE/clean/dist"
mkdir -p "$CLEAN_DIST"

# A bundle that contains only the expected anon/publishable key — should NOT be flagged
cat > "$CLEAN_DIST/app.js" <<'JS'
const config = { url: "https://example.supabase.co", key: "sb_publishable_eyJhbGciOiJIUzI1NiJ9.anon_key_content" }
JS

echo "Case 2: anon/publishable key only in fake dist/ …"
if ! bash "$SCRIPT" "$CLEAN_DIST" > /dev/null 2>&1; then
  echo "FAIL: scanner exited non-zero on a bundle with only an anon/publishable key — false positive"
  exit 1
fi
echo "PASS: scanner correctly exits 0 for a bundle containing only the anon key"

echo "--- all cases passed ---"
