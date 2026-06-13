---
phase: 11-accounts-economy
plan: 02
subsystem: economy
tags: [supabase, migration, security-definer, rls, idempotency, economy]
requires:
  - "Phase 9 foundations migration (wallet, wallet_credits, credit_wallet RPC, bare inventory/match_results shells)"
provides:
  - "inventory.unit_id + UNIQUE(owner, unit_id) — idempotent server-truth ownership"
  - "match_results reshaped to (match_id, reporter_id) two-row report ledger, select-own RLS"
  - "match_settlements table — one row per match, select-as-party RLS"
  - "spend_unlock / report_match_result / provision_account / credit_wallet_for_user RPCs"
  - "v1.0 idempotent backfill DO block (wallet + welcome grant + inventory from unlocked_units[])"
affects:
  - "Plan 03 services (inventory.ts, settlement.ts, profile.ts) call these RPCs"
  - "Plan 05 scenes wire the unlock/report flows"
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER + search_path='' + auth.uid() null-guard + revoke/grant footer (Phase 9 credit_wallet exemplar)"
    - "RLS deny-by-default (select-own only, no client write policy)"
    - "ON CONFLICT DO NOTHING idempotency + GET DIAGNOSTICS settlement gate"
key-files:
  created:
    - "supabase/migrations/20260613061943_accounts_economy.sql"
  modified: []
decisions:
  - "Settlement credits both players via internal credit_wallet_for_user(winner,50)/(loser,15) keyed by 'match:'||id||':win|:loss' — overrides RESEARCH Pattern 4's flawed credit_wallet + non-idempotent direct UPDATE, per the plan <action> and Pitfall 1."
  - "No CHECK on inventory.unit_id — legacy unlocked_units[] ids inserted as-is (Pitfall 7)."
metrics:
  duration: "~5 min"
  completed: "2026-06-13"
  tasks-executed: 2
  tasks-deferred: 1
  files-created: 1
---

# Phase 11 Plan 02: Accounts & Economy Migration Summary

One committed Supabase migration that fills the Phase 9 `inventory` / `match_results` bare shells, adds `match_settlements`, and creates the four SECURITY DEFINER economy RPCs (`spend_unlock`, `report_match_result`, `provision_account`, `credit_wallet_for_user`) plus an idempotent v1.0 backfill — every currency/ownership write is now an RPC; RLS denies all direct client writes.

## Scope Executed

- **Task 1 (schema)** — DONE, committed.
- **Task 2 (RPCs + backfill)** — DONE, committed.
- **Task 3 ([BLOCKING] apply schema to live Supabase)** — **DEFERRED-TO-ORCHESTRATOR / NOT-YET-APPLIED** (see below).

## What Was Built

### Task 1 — Schema (`feat(11-02)` commit `69c3d94`)
- **inventory**: `ADD COLUMN IF NOT EXISTS unit_id text NOT NULL DEFAULT ''` + `CONSTRAINT inventory_owner_unit UNIQUE (owner, unit_id)`. Phase 9 `inventory_select_own` RLS retained; no client write policy added (deny-by-default, ECON-05/Pitfall 6).
- **match_results**: bare shell reshaped — dropped `id`/`owner` + old PK and select policy; added `match_id`, `reporter_id` (FK auth.users), `claimed_winner`, `reported_at`; `PRIMARY KEY (match_id, reporter_id)`; new `match_results_select_own` policy `auth.uid() = reporter_id`. P14 extension columns commented (signed_report/deploy_log/seed/report_hash).
- **match_settlements**: new table — `match_id` PK, `winner_id`/`loser_id` FK auth.users, `settled`/`voided` bool, `settled_at`, `win_amount`/`loss_amount`. RLS enabled; `match_settlements_select_party` policy `auth.uid() = winner_id OR auth.uid() = loser_id`; no client writes. P14 extension columns (validated/bounds_result) commented.

### Task 2 — RPCs + backfill (same commit `69c3d94`)
- **credit_wallet_for_user(p_user_id, p_amount, p_key)** — internal definer-only credit by explicit user id; `revoke all ... from public`, NOT granted to authenticated/anon (T-11-07). wallet_credits idempotency ledger keyed by p_key.
- **spend_unlock(p_unit_id)** — server-derived cost via CASE (assault_bot|thorn_beast|elementalist → 100; else RAISE); atomic `UPDATE wallet ... WHERE balance >= cost RETURNING`; `NOT FOUND` → `{ok:false,reason:'insufficient_funds'}`; else `INSERT inventory ON CONFLICT (owner,unit_id) DO NOTHING`; `{ok:true,new_balance,unit_id}`.
- **report_match_result(p_match_id, p_claimed_winner)** — idempotent report insert; first report → `pending`; disagreement → match_settlements voided=true → `void`; agreement → settle once via `GET DIAGNOSTICS` gate (Pitfall 2), server constants WIN=50/LOSS=15, credit both players via `credit_wallet_for_user` keyed `match:<id>:win|:loss`; already-settled → `already_settled`. Winner/loser identified by p_claimed_winner UUID, never auth.uid() (Pitfall 3).
- **provision_account(p_user_id)** — `INSERT wallet(owner,0) ON CONFLICT DO NOTHING` + `credit_wallet_for_user(uid,100,'welcome:'||uid)`; granted to authenticated.
- **v1.0 backfill DO block** — iterates profiles missing wallet/inventory; provisions wallet + 100 welcome grant + inventory from `unlocked_units[]` (FOREACH), all `ON CONFLICT DO NOTHING`; no unit_id CHECK (Pitfall 7); wins/losses/username untouched (D-11).

## Migration File

`supabase/migrations/20260613061943_accounts_economy.sql` (timestamp strictly greater than `20260612085249_foundations.sql`).

## Grep Acceptance Checks (all pass)

| Check | Expected | Actual |
|-------|----------|--------|
| `create table match_settlements \| alter table inventory \| primary key (match_id, reporter_id)` matching lines | ≥1 each | 4 |
| `unit_id` present | >0 | 13 |
| `unique (owner, unit_id)` | 1 | 1 |
| `primary key (match_id, reporter_id)` | 1 | 1 |
| `create table public.match_settlements` | 1 | 1 |
| `for insert\|for update\|for delete` (non-comment) — no client write policies | 0 | 0 |
| `security definer` (non-comment) | 4 | 4 |
| `set search_path = ''` (non-comment) | 4 | 4 |
| `p_amount\|p_reward\|p_cost` on report_match_result/spend_unlock (non-comment) | 0 | 0 |
| `revoke all ... credit_wallet_for_user ... from public` | 1 | 1 |
| credit_wallet_for_user granted to authenticated/anon | 0 | 0 |
| `get diagnostics` statement (non-comment) | ≥1 | 1 |
| `on conflict (match_id) do nothing` | ≥1 | 2 |
| backfill `foreach ... in array r.unlocked_units` | 1 | 1 |
| CHECK on inventory.unit_id | 0 | 0 |

## Deviations from Plan

**1. [Plan-directed override of RESEARCH Pattern 4] Cross-user settlement credit path**
- **Found during:** Task 2 (report_match_result authoring).
- **Issue:** RESEARCH.md Pattern 4's snippet credits the winner via `credit_wallet(50,...)` (which uses auth.uid() = caller, not necessarily the winner) and credits the loser via a non-idempotent direct `UPDATE wallet ...`. This is buggy (Pitfall 1/3): the caller may be the loser, and the loser credit is not idempotency-keyed.
- **Resolution:** Followed the plan's explicit `<action>` instead: credit BOTH players via the internal `credit_wallet_for_user(winner,50,'match:<id>:win')` and `(loser,15,'match:<id>:loss')`, each idempotency-keyed. This is the authoritative instruction and matches the threat register (T-11-08). Not a code bug fix — the plan action already specified the correct path; the RESEARCH snippet was the lower-authority reference.

No other deviations — schema and RPC bodies follow the plan `<action>` blocks and copy the Phase 9 credit_wallet invariants verbatim.

## Known Stubs

None.

## Threat Flags

None — no new security surface beyond the plan's `<threat_model>`. All new write paths are SECURITY DEFINER RPCs with RLS deny-by-default reads, exactly as the register prescribes (T-11-03 through T-11-08).

## Task 3 — DEFERRED-TO-ORCHESTRATOR (live apply, NOT yet applied)

Task 3 is a `checkpoint:human-verify gate="blocking"` step that applies this migration to a running database and runs `inventory-rls.test.ts` against it. It was **intentionally NOT executed** here:

- Docker / local Supabase is not running in this environment; no `supabase start` / `db reset` / `migration up` / `db push` was run.
- The schema is written and committed but **NOT yet live on any database**. Build/tsc pass without it (types are generated, not live), so any DB-backed verification would be a false positive until applied.
- The orchestrator owns the remote `supabase db push` (with `SUPABASE_ACCESS_TOKEN`) and the RLS verification (`npx vitest run --project rls test/rls/inventory-rls.test.ts`).

Verification performed here was **grep-based on the file contents only** (as the plan `<verify>` blocks specify) — no DB required. All grep checks pass (table above).

## Self-Check

**Files created exist:**
- FOUND: `supabase/migrations/20260613061943_accounts_economy.sql`
- FOUND: `.planning/phases/11-accounts-economy/11-02-SUMMARY.md`

**Commits exist:**
- FOUND: `69c3d94` — feat(11-02): accounts/economy migration — schema + SECURITY DEFINER RPCs
- (SUMMARY commit recorded after this file is committed.)

**Constraints honored:**
- No apply/push/db commands run. ✓
- `.planning/STATE.md` and `.planning/ROADMAP.md` untouched. ✓
- Tasks 1 & 2 committed atomically; Task 3 deferred. ✓

## Self-Check: PASSED
