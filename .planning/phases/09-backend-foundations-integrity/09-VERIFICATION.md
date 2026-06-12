---
phase: 09-backend-foundations-integrity
verified: 2026-06-12T19:10:00Z
status: human_needed
score: 4/5 requirements fully verified locally; 5/5 counting user sign-off for FND-01 prod-deploy
overrides_applied: 0
human_verification:
  - test: "Confirm the RLS Vitest test passes in GitHub Actions (ubuntu-latest, Docker, real local Supabase stack)"
    expected: "'npx vitest run --project rls' exits 0 — forged-write row unchanged (100), idempotency balance 150"
    why_human: "No local Docker available in dev environment; CI-only path; test file is correct but live run cannot be asserted locally"
  - test: "Confirm live Supabase project schema matches migrations (wallet, wallet_credits, inventory, upgrades, match_results, credit_wallet SECURITY DEFINER, profiles RLS)"
    expected: "Dashboard shows all tables + credit_wallet (SECURITY DEFINER) + RLS enabled on wallet (SELECT-own) and profiles (own-row); v1.0 profiles/rooms data intact"
    why_human: "Remote schema verification requires user's Supabase access token; orchestrator cannot re-query remote without it. User confirmed 'pushed' sign-off + supabase/.temp/project-ref artifact is present."
---

# Phase 09: Backend Foundations & Integrity — Verification Report

**Phase Goal:** Establish the Postgres security boundary (authoritative tables + RLS + SECURITY DEFINER RPC), email-only identity, typed API seam, secret-containment scan, and Vitest test harness — so every downstream phase has a verified, continuously-tested foundation.

**Verified:** 2026-06-12T19:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A Vitest two-project harness (unit/rls) runs pathfinder tests green | VERIFIED | `npx vitest run --project unit` → 31/31 pass, 227 ms, exit 0 |
| 2 | Committed migrations define wallet + RLS + credit_wallet RPC + idempotency ledger + RLS shells + tightened profiles RLS | VERIFIED | `supabase/migrations/20260612085249_foundations.sql` — all SQL shapes confirmed via grep (security definer, search_path='', ON CONFLICT, check(balance>=0), revoke/grant, auth.uid()=owner) |
| 3 | Typed src/lib/api/ seam exists; no scene calls supabase.from('profiles'|'rooms'|'wallet') directly | VERIFIED | grep CLEAN on src/scenes/; api/{account,rooms,wallet}.ts exist with named exports; wallet.ts routes through rpc('credit_wallet') only |
| 4 | No '?? guest' identity literal; gameState.userId required real UUID at play entry; practice/create/join guarded | VERIFIED | grep CLEAN on src/scenes/ + gameState.ts; 4 guards in LobbyScene; role:'guest' union preserved; types/index.ts invariant comment present |
| 5 | Bundle secret-scan exits 0 on clean build; exits non-zero on planted sb_secret_/service_role marker | VERIFIED | `npm run build` → clean; `bash scripts/scan-bundle.sh dist` → "bundle secret-scan clean" (exit 0); `bash test/scan-bundle.test.sh` → all 3 cases pass |
| 6 | CI workflow runs tsc + unit + static gates + build + scan + RLS job (ubuntu-latest, correct stack order) on every push/PR | VERIFIED | .github/workflows/ci.yml: push+PR trigger, two jobs, correct sequence (supabase start → db reset → status → vitest rls); no pgTAP |
| 7 | RLS test proves forged wallet.balance UPDATE leaves row unchanged and credit_wallet is idempotent | UNCERTAIN (CI-deferred) | test/rls/wallet-rls.test.ts — correct implementation: row-unchanged assertion (not error), persistSession:false, process.env keys, idempotency case; live run requires Docker/CI |
| 8 | Committed migrations applied to LIVE Supabase project (prod-deploy, plan 06) | UNCERTAIN (user sign-off) | supabase/.temp/project-ref=obcwvyaqdihdhcldewpe present; user confirmed 'pushed'; orchestrator cannot re-query remote without access token |

**Score:** 6/8 truths fully verified locally; 2/8 require human confirmation (CI run + prod-deploy). All locally-verifiable must-haves pass.

---

## Requirement Verdicts

### FND-04: Vitest test harness — PASS

**Requirement:** A test harness (Vitest) runs the extracted simulation and economy logic, executable in CI, replacing zero automated coverage.

| Check | Result |
|-------|--------|
| `vitest.config.ts` defines two projects: `unit` (node) + `rls` (jsdom, fileParallelism:false) | PASS |
| `tsconfig.test.json` extends tsconfig.json with vitest/globals; root tsconfig `include: ["src"]` unchanged | PASS |
| `test/unit/pathfinder.test.ts` imports from `../../src/lib/pathfinder`; covers findPath/isWalkable/canBreakWall | PASS |
| `npx vitest run --project unit` — 31 tests, exit 0 | PASS |
| package.json devDeps: vitest@^4.1.8, jsdom@^29.1.1, @vitest/coverage-v8@^4.1.8 | PASS |
| package.json `@supabase/supabase-js` still at `^2.99.3` (not bumped) | PASS |
| `npx tsc --noEmit` over src/ passes (test files excluded from prod scope) | PASS |

**Verdict: PASS** — all artifacts exist, substantive, wired, and test suite passes.

---

### FND-01: Authoritative tables with RLS — PASS (with human sign-off for prod-deploy)

**Requirement:** Authoritative tables (wallet, inventory, upgrades, match results) are defined as committed Postgres migrations with Row Level Security so clients can read their own rows but never write authoritative ones.

| Check | Result |
|-------|--------|
| `supabase/migrations/20260612000001_baseline.sql` — CREATE TABLE IF NOT EXISTS profiles + rooms | PASS |
| `supabase/migrations/20260612085249_foundations.sql` — wallet table with `check (balance >= 0)` | PASS |
| wallet RLS: SELECT-own policy (`auth.uid() = owner`), no INSERT/UPDATE/DELETE policy | PASS |
| wallet_credits: RLS enabled, no client policies (no client access) | PASS |
| `credit_wallet(bigint, text)`: `security definer set search_path = ''` | PASS |
| `credit_wallet`: atomic UPDATE...RETURNING, `ON CONFLICT (idempotency_key) DO NOTHING` | PASS |
| `credit_wallet`: `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated` | PASS |
| inventory, upgrades, match_results: RLS enabled, SELECT-own, no write policy | PASS |
| profiles: ALTERed (not dropped), RLS enabled, select/insert/update own-row policies | PASS |
| No `DROP TABLE public.profiles` in any migration | PASS |
| `supabase/config.toml` with `project_id = "path_raiders"` | PASS |
| `supabase/.temp/project-ref` = obcwvyaqdihdhcldewpe (linked) | PASS |
| Live prod push (plan 06) — user confirmed "pushed" | UNCERTAIN (user sign-off accepted per plan design) |
| RLS forged-write test + idempotency test pass in CI | UNCERTAIN (CI-deferred — no local Docker) |

**Verdict: PASS with two CI/prod caveats** — SQL boundary is complete and correct in committed code; prod-deploy confirmed by user sign-off (the defined acceptance signal for the blocking human gate); RLS live run is CI-gated by design.

---

### FND-02: Email-only identity — PASS

**Requirement:** Every player gets a persistent real authenticated identity via email/password sign-in; no anonymous/guest play; the `'guest'` literal is removed.

| Check | Result |
|-------|--------|
| No `?? 'guest'` in src/scenes/ or src/lib/gameState.ts | PASS (grep CLEAN) |
| No `'PLAYING AS GUEST'` string in LobbyScene | PASS (replaced with 'NOT SIGNED IN') |
| `if (!gameState.userId) { this.scene.start('AuthScene'); return }` at scene-entry in LobbyScene.create() | PASS (line 76) |
| Guard at practice handler | PASS (line 314) |
| Guard at create-room handler | PASS (line 334) |
| Guard at join-room handler | PASS (line 399) |
| GameScene `if (!gameState.userId) return` defensive guard | PASS (line 608) |
| `role: 'host' \| 'guest' \| null` union in types/index.ts preserved | PASS (line 27) |
| `gameState.role = 'guest'` join-side role assignment preserved | PASS (line 431) |
| userId invariant comment in types/index.ts | PASS (line 19) |
| FND-02 static gate in CI and scan-source.sh | PASS |

**Verdict: PASS** — identity literal removed phase-wide; role references fully preserved; 4 scene-entry guards enforce real UUID precondition.

---

### FND-03: No privileged credentials in bundle — PASS

**Requirement:** No privileged credentials ship in the client bundle (service-role key stays server-side; a CI/scan guard fails the build if a secret is bundled).

| Check | Result |
|-------|--------|
| `scripts/scan-bundle.sh` scans dist/ for `sb_secret_`, `SUPABASE_SERVICE_ROLE_KEY`, `service_role` | PASS |
| `scripts/scan-bundle.sh` does NOT flag `sb_publishable_` / anon key | PASS |
| `test/scan-bundle.test.sh` — planted `sb_secret_` → exit non-zero | PASS |
| `test/scan-bundle.test.sh` — planted `service_role` string → exit non-zero | PASS |
| `test/scan-bundle.test.sh` — anon-only bundle → exit zero (no false positive) | PASS |
| `npm run build` succeeds (exit 0) | PASS |
| `bash scripts/scan-bundle.sh dist` on real build — "bundle secret-scan clean" (exit 0) | PASS |
| CI: build + scan step wired in `typecheck-unit-scan` job | PASS |
| RLS test reads SERVICE_ROLE from `process.env` only (never from src/) | PASS |

**Verdict: PASS** — scan catches real key shapes, ignores anon key, clean build confirmed locally, CI wired.

---

### FND-05: Typed API seam (no scene direct table access) — PASS

**Requirement:** Scenes access persistent data only through a typed services/API layer (`src/lib/api/`) — no scene writes directly to authoritative tables.

| Check | Result |
|-------|--------|
| `src/lib/api/account.ts` exists with getProfile, upsertProfile, recordMatchResult exports | PASS |
| `src/lib/api/rooms.ts` exists with createRoom, findRoomByCode, joinRoom exports | PASS |
| `src/lib/api/wallet.ts` exists with getBalance, creditWallet exports | PASS |
| All three api files import from `'../supabase'` singleton (no second createClient) | PASS |
| `wallet.ts` calls `supabase.rpc('credit_wallet', ...)` — no `.from('wallet').update` | PASS |
| No `supabase.from('profiles')` in any scene | PASS (grep CLEAN) |
| No `supabase.from('rooms')` in any scene | PASS (grep CLEAN) |
| No `supabase.from('wallet')` in any scene | PASS (grep CLEAN) |
| AuthScene imports from `../lib/api/account` and retains `supabase.auth.*` calls | PASS |
| GameScene imports from `../lib/api/account` | PASS |
| LobbyScene imports from `../lib/api/rooms`; realtime `supabase.channel` preserved in scene | PASS |
| FND-05 static gate in CI and scan-source.sh | PASS |
| `npx tsc --noEmit` passes | PASS |

**Verdict: PASS** — seam is complete, substantive, and wired; no scene bypasses it; wallet writes go through the RPC only.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vitest.config.ts` | Two-project Vitest config | VERIFIED | unit (node) + rls (jsdom, fileParallelism:false) |
| `tsconfig.test.json` | Extends tsconfig.json, vitest/globals | VERIFIED | Root include: ["src"] unchanged |
| `test/unit/pathfinder.test.ts` | 31 pathfinder tests green | VERIFIED | All 31 pass, exit 0 |
| `supabase/config.toml` | project_id = "path_raiders" | VERIFIED | From supabase init |
| `supabase/migrations/20260612000001_baseline.sql` | Non-destructive profiles+rooms baseline | VERIFIED | CREATE TABLE IF NOT EXISTS |
| `supabase/migrations/20260612085249_foundations.sql` | Full FND-01 SQL boundary | VERIFIED | All security shapes present |
| `src/lib/api/account.ts` | getProfile, upsertProfile, recordMatchResult | VERIFIED | Wired into AuthScene + GameScene |
| `src/lib/api/rooms.ts` | createRoom, findRoomByCode, joinRoom | VERIFIED | Wired into LobbyScene |
| `src/lib/api/wallet.ts` | getBalance, creditWallet (RPC only) | VERIFIED | No direct wallet UPDATE path |
| `test/rls/wallet-rls.test.ts` | Forged-write + idempotency test | VERIFIED (structure) | Correct row-unchanged assertion; live run CI-deferred |
| `scripts/scan-bundle.sh` | Secret-scan with sb_secret_ patterns | VERIFIED | Catches service_role, ignores anon key |
| `scripts/scan-source.sh` | FND-02 + FND-05 static gates | VERIFIED | Both gates pass against current tree |
| `test/scan-bundle.test.sh` | Planted-secret negative test | VERIFIED | All 3 cases pass |
| `.github/workflows/ci.yml` | Two-job CI: typecheck-unit-scan + rls | VERIFIED | Correct stack order, ubuntu-latest, pinned CLI |
| `supabase/.temp/project-ref` | Live project linked | VERIFIED | obcwvyaqdihdhcldewpe |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `test/unit/pathfinder.test.ts` | `src/lib/pathfinder.ts` | `import { findPath, isWalkable, canBreakWall }` | WIRED | Import present line 2; 31 tests exercise all three functions |
| `vitest.config.ts` | `test/unit/**` | include glob | WIRED | Line 9: `include: ['test/unit/**/*.test.ts']` |
| `vitest.config.ts` | `test/rls/**` | include glob + fileParallelism:false | WIRED | Lines 14-16 |
| `src/scenes/AuthScene.ts` | `src/lib/api/account.ts` | `import { getProfile, upsertProfile }` | WIRED | Line 3; 4 call sites replaced |
| `src/scenes/GameScene.ts` | `src/lib/api/account.ts` | `import { recordMatchResult }` | WIRED | Line 4; recordResult body replaced |
| `src/scenes/LobbyScene.ts` | `src/lib/api/rooms.ts` | `import { createRoom, findRoomByCode, joinRoom }` | WIRED | Line 3; 3 call sites; realtime channel preserved |
| `src/lib/api/wallet.ts` | `credit_wallet RPC` | `supabase.rpc('credit_wallet', ...)` | WIRED | Line 20; no direct wallet UPDATE path |
| `credit_wallet RPC` | `public.wallet` | atomic UPDATE...RETURNING under SECURITY DEFINER | WIRED | Foundations SQL line 74-77 |
| `wallet RLS` | `auth.uid()` | `using (auth.uid() = owner)` | WIRED | Foundations SQL line 20-22 |
| `test/rls/wallet-rls.test.ts` | local Supabase | `process.env.SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` | WIRED (CI-only) | Correct env references; live run requires Docker |
| `.github/workflows/ci.yml` | `scripts/scan-bundle.sh` | `run: bash scripts/scan-bundle.sh` | WIRED | After `npm run build` in typecheck-unit-scan job |
| `.github/workflows/ci.yml` | `npx vitest run --project rls` | after supabase start + db reset + status export | WIRED | Correct ordering lines 76-89 |

---

## Data-Flow Trace (Level 4)

Not applicable to this phase's primary deliverables (migrations, test harness, scan scripts, CI workflow). The api seam functions pass through to Supabase and do not render data locally. Pathfinder tests operate on hand-built grids (deterministic, no external state).

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit tests pass (FND-04) | `npx vitest run --project unit` | 31/31 pass, 227ms, exit 0 | PASS |
| TypeScript compiles clean (prod scope) | `npx tsc --noEmit` | exit 0, no output | PASS |
| Production build succeeds | `npm run build` | exit 0, dist/ produced | PASS |
| Bundle secret-scan clean on real dist/ | `bash scripts/scan-bundle.sh dist` | "bundle secret-scan clean", exit 0 | PASS |
| Planted-secret negative test | `bash test/scan-bundle.test.sh` | all 3 cases pass | PASS |
| FND-02 + FND-05 static gates | `bash scripts/scan-source.sh` | FND-05 PASS + FND-02 PASS | PASS |
| RLS live run (forged-write + idempotency) | `npx vitest run --project rls` | SKIP — requires Docker/Supabase stack | CI-deferred |

---

## Probe Execution

No conventional probe scripts (`scripts/*/tests/probe-*.sh`) declared for this phase. The CI workflow is the integration probe; its correctness is verified structurally above.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FND-01 | 09-02, 09-05, 09-06 | Authoritative tables with RLS and committed migrations | PASS (prod via user sign-off) | SQL verified in migrations; test wired in CI; prod push confirmed |
| FND-02 | 09-04, 09-05 | Email-only identity; no 'guest' literal; scene guards | PASS | grep CLEAN; 4 guards in LobbyScene; role union preserved |
| FND-03 | 09-05 | No privileged credentials in bundle; scan guard | PASS | Scan verified; clean build; negative test passes |
| FND-04 | 09-01 | Vitest test harness; pathfinder tests green | PASS | 31/31 tests pass; `npx vitest run --project unit` exit 0 |
| FND-05 | 09-03, 09-05 | Typed API seam; no scene direct table access | PASS | grep CLEAN; api modules wired into scenes |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scanned: vitest.config.ts, tsconfig.test.json, test/unit/pathfinder.test.ts, test/rls/wallet-rls.test.ts, scripts/scan-bundle.sh, scripts/scan-source.sh, .github/workflows/ci.yml, src/lib/api/{account,rooms,wallet}.ts, src/scenes/LobbyScene.ts, src/types/index.ts, src/lib/gameState.ts, supabase/migrations/*.sql

No TBD/FIXME/XXX markers, no placeholder returns, no hardcoded empty data flowing to output.

---

## Human Verification Required

### 1. RLS Vitest Test Live Run

**Test:** Push to GitHub (or manually trigger the CI workflow) and observe the `rls` job on ubuntu-latest.
**Expected:** `npx vitest run --project rls` exits 0. Test output shows: (a) forged UPDATE leaves wallet.balance at 100 (unchanged), (b) same-key retry credits once — balance 150, not 200. (c) client INSERT to wallet is blocked.
**Why human:** No local Docker available in this dev environment. The test file, CI wiring, and stack ordering are verified as correct, but the live run must execute in GitHub Actions where Docker is pre-installed.

### 2. Live Supabase Schema Confirmation (Plan 06 sign-off)

**Test:** In the Supabase Dashboard for project `obcwvyaqdihdhcldewpe` → Table Editor + Database → Functions + Authentication → Policies.
**Expected:** Tables `wallet`, `wallet_credits`, `inventory`, `upgrades`, `match_results` visible; function `credit_wallet` listed as SECURITY DEFINER; `wallet` RLS enabled with `wallet_select_own` (SELECT for auth.uid()=owner), no write policy; `profiles` RLS enabled with `profiles_select/insert/update_own`; existing v1.0 profiles rows intact.
**Why human:** The user's access token is required to query the remote Supabase project. The user already confirmed "pushed" at the blocking human gate, and the local link artifact (`supabase/.temp/project-ref`) is present. This item exists for final auditable confirmation rather than remediation.

---

## Gaps Summary

No blockers. All locally-verifiable must-haves pass. Two items require human confirmation before the phase is fully closed:

1. **RLS live run** — test/rls/wallet-rls.test.ts is correct and CI is wired; the live run is an environment constraint (no local Docker), not a code defect. This resolves automatically on first GitHub Actions run.

2. **Prod-deploy verification** — user sign-off already given at the blocking human gate (plan 06); `supabase/.temp/project-ref` present as link artifact. Dashboard re-confirmation is the final audit step.

Neither item indicates a code defect or unmet requirement. The phase goal is substantively achieved in the codebase.

---

## Deferred Items

None — all FND-01 through FND-05 requirements are addressed within this phase.

---

_Verified: 2026-06-12T19:10:00Z_
_Verifier: Claude (gsd-verifier)_
