---
phase: 11-accounts-economy
plan: 04
subsystem: economy-rls-tests
tags: [rls, vitest, economy, idempotency, concurrency, migration]
requires:
  - "Plan 11-02 schema live on remote DB (inventory.unit_id, match_results, match_settlements, spend_unlock, report_match_result, provision_account, credit_wallet_for_user)"
provides:
  - "GREEN-ready RLS assertions for spend authority (ECON-03/04/05)"
  - "GREEN-ready RLS assertions for settlement idempotency/void/lone (ECON-01/02/04, D-06/D-08)"
  - "GREEN-ready RLS assertions for v1.0 backfill (ACCT-04)"
affects:
  - test/rls/inventory-rls.test.ts
  - test/rls/settlement-idempotency.test.ts
  - test/rls/migration.test.ts
tech-stack:
  added: []
  patterns:
    - "supabase-js rpc data cast via `unknown` first (drops TS2352, matches wallet-rls baseline)"
    - "admin (SERVICE) read-back to verify authoritative state after every RPC mutation"
    - "two-user ANON clients (A/B) for both-agree settlement (PATTERNS 597-614)"
    - "fresh crypto.randomUUID() match_id per settlement test for isolation"
key-files:
  created: []
  modified:
    - test/rls/inventory-rls.test.ts
    - test/rls/settlement-idempotency.test.ts
    - test/rls/migration.test.ts
decisions:
  - "Cast rpc data through `unknown` to eliminate the TS2352 null-conversion class the 11-01 versions carried — keeps the suite no-worse than the wallet-rls.test.ts typecheck baseline"
  - "spend_unlock success path now asserts the RPC's own return shape ({ok,new_balance:0,unit_id}) in addition to the admin wallet read-back, proving the server reports the post-deduct balance"
  - "double-submit test rewritten to the plan's exact shape: A reports twice BEFORE B (stays pending, no credit, no settlement row) then B agrees → A +50 not +100"
  - "migration idempotency seeds the inventory row the way the deploy-time DO-block loop does (provision_account itself only grants the wallet), so the unit-row idempotency is covered alongside the welcome-grant idempotency"
  - "added Pitfall 7 unknown-unit tolerance test: legacy unit ids insert as-is (no CHECK constraint) and provision_account must not crash"
metrics:
  duration: "~15m"
  completed: 2026-06-13
  tasks: 3
  files: 3
  scenarios: 18
---

# Phase 11 Plan 04: Economy RLS Suite GREEN-Ready Assertions Summary

Completed the three Plan 01 RED RLS scaffolds into full GREEN-ready assertions against the
live-applied Plan 02 schema: real admin read-backs, exact server constants (50/15/100),
concurrent exactly-once, mismatch-void, lone-pending, and idempotent v1.0 backfill — the
"Looks Done But Isn't" regression gate for ECON-04 (no double-spend / double-grant / negative).

## What Was Built

### Task 1 — `test/rls/inventory-rls.test.ts` (ECON-03/04/05) — commit `7a8f045`
4 scenarios:
- **Forged unlock (ECON-05):** direct `from('inventory').insert(...)` → admin re-read shows 0 rows.
- **Deduct (ECON-03):** `spend_unlock('assault_bot')` asserts the RPC return shape `{ok:true, new_balance:0, unit_id:'assault_bot'}` AND admin confirms wallet balance 0 + exactly one inventory row.
- **Insufficient funds (ECON-03):** reseed to 50, `spend_unlock('thorn_beast')` → `{ok:false, reason:'insufficient_funds'}`, balance unchanged at 50, no ownership row.
- **Concurrent double-tap (ECON-04, Pitfall 5):** `Promise.all` of two `spend_unlock` at balance==cost → exactly one `ok:true`, final balance === 0 (never negative), exactly one inventory row.

### Task 2 — `test/rls/settlement-idempotency.test.ts` (ECON-01/02/04, D-06/D-08) — commit `b12e2ed`
7 scenarios (two users A/B, fresh match_id per test):
- **Both agree (ECON-01):** A+50, B+15, one settled row.
- **Double-submit (ECON-04):** A reports twice BEFORE B → stays `pending`, no credit, no settlement row; then B agrees → A credited +50 exactly (not +100), B +15.
- **already_settled (ECON-04):** re-submit after settle → `already_settled`, both balances unchanged.
- **Concurrent second-reporters (ECON-04, Pitfall 4):** `Promise.all([B.report, A.report])` → exactly one settlement row, winner credited exactly 50.
- **Mismatch (D-06):** A says A, B says B → `match_settlements.voided=true`, neither credited.
- **Lone report (D-08):** only A reports → `status:'pending'`, zero settlement rows, no credit.
- **Server-derived reward (ECON-02):** extra client `p_amount:999999` ignored — server constants 50/15 credited.

### Task 3 — `test/rls/migration.test.ts` (ACCT-04) — commit `c70f5c5`
4 scenarios (admin SERVICE client seeds + reads):
- **Existing player:** profiles wins=5/losses=2/unlocked=['thorn_beast'] → provision → wallet 100, thorn_beast inventory, wins/losses/username preserved.
- **Idempotency (D-02):** second `provision_account` leaves balance at 100 (not 200), one inventory row.
- **New account (D-10):** empty unlocked_units → wallet 100, empty inventory.
- **Unknown unit (Pitfall 7):** legacy `__legacy_unknown_unit__` inserts as-is (no CHECK constraint) and `provision_account` does not crash.

A comment documents that `provision_account` is the unit-testable surface of the deploy-time
`DO`-block backfill (same per-profile logic looped over all profiles).

## RPC Return Shapes Matched (from `20260613061943_accounts_economy.sql`)
- `spend_unlock` → `{ok:true, new_balance, unit_id}` | `{ok:false, reason:'insufficient_funds'}`
- `report_match_result` → `{status:'pending'}` | `{status:'void', reason:'mismatch'}` | `{status:'settled', winner_id}` | `{status:'already_settled'}`
- `provision_account` → void

## Deviations from Plan

None affecting scope. Two intentional enhancements within the plan's stated acceptance criteria:
1. **[Rule 1 — improvement]** Rewrote the double-submit test to the plan's exact "A-twice-before-B" shape (the 11-01 version reported A→B→A after settlement, which proved replay but not the pre-settlement no-credit case the plan specifies). Asserts pending + zero settlement rows + no credit, then +50 once.
2. **[Rule 1 — improvement]** Cast all rpc `data` through `unknown` first. The 11-01 versions used `as { ok }` directly, which raised a TS2352 (`Conversion of null to {...}`) error class NOT present in the wallet-rls baseline. Casting via `unknown` removes that class, leaving only the baseline TS2345/TS2769 (untyped supabase-js client) — satisfying the "no NEW typecheck error class" criterion.

## Verification

- `npx vitest list --project rls` (with dummy env) enumerates **18 scenarios** total
  (3 wallet + 4 inventory + 7 settlement + 4 migration). Every plan scenario is present.
- Typecheck (`tsc -p tsconfig.test.json --noEmit`): only `TS2345` and `TS2769` across all RLS
  files — both present in the pre-existing `wallet-rls.test.ts` baseline (untyped supabase-js
  client). The 11-01 `TS2352` null-cast class was **eliminated**. No NEW error class introduced.
- **`npx vitest run --project rls` GREEN confirmation: PENDING-USER-VERIFICATION.** The executor
  has no local Supabase (Docker down) and no `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` (they live only in the user's shell). The Plan 02 schema is live on
  the remote DB; the user runs `npx vitest run --project rls` to confirm all four files GREEN.

## Self-Check: PASSED

- Files exist: `test/rls/inventory-rls.test.ts`, `test/rls/settlement-idempotency.test.ts`, `test/rls/migration.test.ts` — all FOUND.
- Commits exist: `7a8f045`, `b12e2ed`, `c70f5c5` — all FOUND in git log.
- `.planning/STATE.md` and `.planning/ROADMAP.md` untouched (HEAD~3..HEAD diff contains only the three test files).
- `npx vitest list --project rls` enumerates all 18 scenarios.
- Typecheck no-worse than wallet-rls baseline (TS2345/TS2769 only).
