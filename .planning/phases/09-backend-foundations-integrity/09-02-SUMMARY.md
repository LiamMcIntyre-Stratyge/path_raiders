---
phase: 09-backend-foundations-integrity
plan: 02
subsystem: database
tags: [supabase, postgres, rls, security-definer, migrations, wallet, sql]

requires:
  - phase: none
    provides: greenfield supabase/ directory (no prior migrations)

provides:
  - "supabase/config.toml pinning local stack config (project_id=path_raiders)"
  - "20260612000001_baseline.sql: CREATE TABLE IF NOT EXISTS for profiles + rooms (v1.0 schema)"
  - "20260612085249_foundations.sql: wallet+RLS+credit_wallet SECURITY DEFINER RPC + wallet_credits idempotency ledger + inventory/upgrades/match_results bare RLS shells + tightened profiles RLS"
  - "credit_wallet(bigint,text) sole-writer RPC: hardened search_path, atomic UPDATE...RETURNING, ON CONFLICT idempotency, REVOKE/GRANT"

affects:
  - "09-05: RLS forged-write test runs supabase db reset against this migration stack"
  - "09-03: wallet client wraps credit_wallet RPC + SELECT own balance"
  - "11+: every authoritative table copies this read-via-RLS / write-via-SECURITY-DEFINER-RPC pattern"

tech-stack:
  added:
    - "supabase CLI v2.62.5 (supabase init, migration new)"
    - "supabase/config.toml (local stack config)"
  patterns:
    - "Read-via-RLS / Write-via-SECURITY-DEFINER-RPC exemplar (wallet + credit_wallet)"
    - "Bare RLS shell pattern (id+owner, select-own, no write policy)"
    - "Idempotency ledger (wallet_credits + ON CONFLICT DO NOTHING)"
    - "Profiles ALTER not recreate (A3: non-destructive against live data)"

key-files:
  created:
    - "supabase/config.toml"
    - "supabase/.gitignore"
    - "supabase/migrations/20260612000001_baseline.sql"
    - "supabase/migrations/20260612085249_foundations.sql"
  modified: []

key-decisions:
  - "Hand-written baseline fallback used for supabase db pull: no SUPABASE_ACCESS_TOKEN or live project link available in this environment; profiles+rooms schema hand-written from INTEGRATIONS.md source of truth using CREATE TABLE IF NOT EXISTS"
  - "Tasks 2 and 3 placed in the same foundations migration file: greenfield project, single-file is simpler and both are part of the same security boundary definition"
  - "profiles RLS policies guarded with pg_policies existence check (DO $$ IF NOT EXISTS $$) for idempotency on db reset over baseline"
  - "supabase CLI v2.62.5 used (available on PATH); research targeted v2.106.0 but init/migration new commands are stable across these versions"

patterns-established:
  - "Pattern: wallet is the canonical read-via-RLS / write-via-SECURITY-DEFINER-RPC exemplar for phases 11-14"
  - "Pattern: SECURITY DEFINER functions always use set search_path = '' + fully-qualified public.* names"
  - "Pattern: bare RLS shells (id+owner) with select-own policy + no write policy for deferred-column tables"
  - "Pattern: idempotency key ledger (ON CONFLICT DO NOTHING, IF NOT FOUND -> return unchanged balance)"

requirements-completed: [FND-01]

duration: 25min
completed: 2026-06-12
---

# Phase 09 Plan 02: Supabase Migrations Baseline + Security Boundary Summary

**Committed supabase/migrations SQL establishing the read-via-RLS / write-via-SECURITY-DEFINER-RPC security boundary: wallet exemplar (sole-writer credit_wallet RPC + idempotency ledger), three bare RLS shells, tightened profiles RLS, and a non-destructive baseline reproducing the live profiles+rooms schema for CI db reset fidelity.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-12T08:51:00Z
- **Completed:** 2026-06-12T09:16:00Z
- **Tasks:** 3 (Tasks 2+3 committed together — same migration file)
- **Files created:** 4

## Accomplishments

- `supabase init` run; `supabase/config.toml` created with `project_id = "path_raiders"`
- Hand-written `20260612000001_baseline.sql` reproduces live v1.0 `profiles`+`rooms` schema using `CREATE TABLE IF NOT EXISTS` (safe for future `supabase db push` against live DB)
- `20260612085249_foundations.sql` delivers the full FND-01 security boundary: wallet table + RLS (SELECT-own only, no write policy), `wallet_credits` idempotency ledger (RLS on, no client policies), `credit_wallet` SECURITY DEFINER RPC hardened with `set search_path = ''`, atomic `UPDATE...RETURNING`, `ON CONFLICT (idempotency_key) DO NOTHING`, `REVOKE ALL FROM public` + `GRANT EXECUTE TO authenticated`; three bare RLS shells (`inventory`/`upgrades`/`match_results`); `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY` with `profiles_select/insert/update_own` policies (`auth.uid() = id`)

## Task Commits

1. **Task 1: supabase init + baseline migration** - `00d8834` (chore)
2. **Tasks 2+3: foundations migration** - `e63d6d4` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `supabase/config.toml` - supabase init output; project_id=path_raiders; local stack config
- `supabase/.gitignore` - supabase init output; ignores .branches/.temp/.env.local
- `supabase/migrations/20260612000001_baseline.sql` - Hand-written baseline: CREATE TABLE IF NOT EXISTS profiles (id/username/faction/unlocked_units/wins/losses) + rooms (id/code/host_id/guest_id/host_faction/guest_faction/state); no RLS on profiles here
- `supabase/migrations/20260612085249_foundations.sql` - Full FND-01 security boundary SQL (wallet+RLS+credit_wallet RPC+idempotency ledger+RLS shells+profiles RLS tighten)

## Decisions Made

- **Hand-written db pull fallback:** No `SUPABASE_ACCESS_TOKEN` or linked project available. Hand-wrote `profiles`+`rooms` schema from `INTEGRATIONS.md` source of truth as the plan instructs. Live push happens in plan 09-06.
- **Tasks 2+3 in same file:** Greenfield project; adding profiles RLS in the same foundations file keeps the diff atomic and avoids a third near-empty migration. Plan explicitly allows this ("append or a sibling file").
- **Idempotency guard on profiles policies:** Used `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_policies ...) $$` instead of `CREATE POLICY IF NOT EXISTS` (not valid in all Postgres versions) to ensure `supabase db reset` over the baseline is idempotent.
- **CLI version:** supabase CLI v2.62.5 was on PATH; research targeted v2.106.0. `init` and `migration new` commands are stable; no functional difference for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used pg_policies existence check instead of CREATE POLICY IF NOT EXISTS**
- **Found during:** Task 3 (tighten profiles RLS)
- **Issue:** `CREATE POLICY IF NOT EXISTS` is not valid syntax in Postgres/Supabase. The plan says "use `create policy if not exists` or guard against duplicate-policy errors." The IF NOT EXISTS syntax would fail at migration time.
- **Fix:** Wrapped the three profiles policy CREATE statements in a `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies ...) THEN CREATE POLICY ... END IF; END; $$` block — equivalent idempotency, valid SQL.
- **Files modified:** `supabase/migrations/20260612085249_foundations.sql`
- **Verification:** Task 3 grep checks all pass.
- **Committed in:** e63d6d4

---

**Total deviations:** 1 auto-fixed (1 blocking syntax issue)
**Impact on plan:** Necessary correctness fix. Idempotency intent preserved exactly.

## Issues Encountered

- `supabase db pull` unavailable: no live credentials in this environment. Used the documented hand-written fallback as specified in the plan. No impact on plan goals — baseline is faithful to the live schema per INTEGRATIONS.md.

## Threat Surface Scan

All security-relevant surfaces were in the plan's `<threat_model>`. No new surfaces introduced beyond what was planned:

- `wallet`: RLS SELECT-own only, no write policy (T-09-forged-write mitigated)
- `wallet_credits`: RLS on, no client policies (deny all client access)
- `credit_wallet`: SECURITY DEFINER, `set search_path = ''`, REVOKE/GRANT (T-09-searchpath, T-09-rpc-anon mitigated)
- Idempotency ledger (T-09-double-credit mitigated)
- `check (balance >= 0)` + `p_amount > 0` guard (T-09-negbalance mitigated)
- All policies use `auth.uid() = owner/id` (T-09-cross-account mitigated)
- No `USING (true)` policy anywhere

## Known Stubs

None — migrations are complete SQL with no placeholder values.

## User Setup Required

To push these migrations to the live project after plan 09-06:
```
supabase link --project-ref <ref>
supabase db push
```
The `SUPABASE_ACCESS_TOKEN` or `supabase login` is required for the link step.

## Next Phase Readiness

- `supabase/migrations/` is ready for `supabase db reset` in CI (plan 09-05 forged-write test)
- `credit_wallet(p_amount bigint, p_idempotency_key text) returns bigint` RPC is defined; plan 09-03 wallet client can call `.rpc('credit_wallet', ...)`
- The read-via-RLS / write-via-SECURITY-DEFINER-RPC exemplar is committed and reviewable — phases 11-14 copy this exact pattern

---
*Phase: 09-backend-foundations-integrity*
*Completed: 2026-06-12*
