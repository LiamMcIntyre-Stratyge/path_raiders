#!/usr/bin/env bash
# scripts/scan-source.sh — static integrity gates (FND-02 + FND-05)
#
# FND-05: Assert no scene calls supabase.from() for authoritative tables
#         (profiles, rooms, wallet). Scenes must go through src/lib/api/.
#
# FND-02: Assert no ?? 'guest' identity literal remains in scenes or gameState.
#         Note: the role name 'guest' (e.g. "role: 'guest'", winner === 'guest')
#         is NOT matched — only the fallback identity pattern ?? 'guest'.
set -euo pipefail

FAIL=0

echo "--- static gates ---"

# ─── FND-05: No scene calls supabase.from() for authoritative tables ─────────
echo "FND-05: checking src/scenes/ for supabase.from('profiles'|'rooms'|'wallet') …"
if grep -rEn "supabase\.from\('(profiles|rooms|wallet)'" src/scenes/ 2>/dev/null; then
  echo "::error::FND-05 FAIL: scene(s) call supabase.from() for authoritative tables — route through src/lib/api/ instead"
  FAIL=1
else
  echo "FND-05 PASS: no forbidden scene table calls"
fi

# ─── FND-02: No ?? 'guest' identity literal ──────────────────────────────────
echo "FND-02: checking src/scenes/ + src/lib/gameState.ts for ?? 'guest' …"
if grep -rnE "\?\? 'guest'" src/scenes/ src/lib/gameState.ts 2>/dev/null; then
  echo "::error::FND-02 FAIL: ?? 'guest' identity fallback found — replace with real-UUID precondition"
  FAIL=1
else
  echo "FND-02 PASS: no ?? 'guest' identity literal found"
fi

echo "--- static gates done ---"
exit $FAIL
