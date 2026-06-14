---
phase: 12-progression-upgrades
plan: "02"
subsystem: progression
status: "implemented — blocking checkpoint pending (Task 3 not attempted)"
tags: [progression, sql-migration, rpc, services-seam, rls]
dependency_graph:
  requires: ["12-01", "11-02"]
  provides: ["upgrades-table", "upgrade_spend-rpc", "progression-ts-client"]
  affects: ["src/lib/api/", "supabase/migrations/"]
tech_stack:
  added: []
  patterns: ["SECURITY DEFINER RPC", "atomic-wallet-deduct", "GET DIAGNOSTICS idempotency gate", "services-seam RLS read"]
key_files:
  created:
    - supabase/migrations/20260614000000_progression.sql
    - src/lib/api/progression.ts
  modified: []
decisions:
  - "Upgrade cost CASE constants embedded in SQL RPC only; client never supplies amount (D-03/PROG-04)"
  - "GET DIAGNOSTICS row_count=0 gate after ON CONFLICT WHERE level=v_cur_level rolls back deduct on concurrent race (Landmine #3)"
  - "Ownership check (inventory.owner/unit_id) precedes wallet deduct (Landmine #1 correct order)"
  - "table_grants.sql already covers public.upgrades — no separate grant needed in this migration"
metrics:
  duration: "~15min"
  completed_date: "2026-06-14"
  tasks_done: 2
  tasks_pending: 1
  files_created: 2
---

# Phase 12 Plan 02: Progression Migration + Client Summary

**One-liner:** `upgrades` table + `upgrade_spend` SECURITY DEFINER RPC with ownership/level/concurrency guards, plus `progression.ts` services-seam client (`getOwnLevels` + `upgradeSpend`).

**Plan status:** Tasks 1 & 2 DONE (committed). Task 3 is a PENDING BLOCKING CHECKPOINT — not attempted per instructions.

---

## Tasks

### Task 1 — DONE: Write the progression migration
**Commit:** `f49ad45`
**File:** `supabase/migrations/20260614000000_progression.sql`

Schema authored:
- `create table public.upgrades (user_id, scope check('unit'|'tower'), target_id, level default 1 check(level>=1), primary key(user_id,scope,target_id))` — D-15
- `alter table public.upgrades enable row level security`
- One `for select` policy (`upgrades_select_own`) only — zero insert/update/delete client policies (deny-by-default, T-12-05)
- `upgrade_spend(p_scope text, p_target_id text) returns jsonb` — SECURITY DEFINER, search_path=''

RPC logic order:
1. `auth.uid()` null-guard (T-12-06)
2. Scope validation (`'unit'|'tower'`)
3. scope='unit': ownership check via `exists (select 1 from public.inventory where owner = v_owner and unit_id = p_target_id)` → `not_owned` (D-16/T-12-02); server whitelist of 6 unit ids → `unknown_target` (T-12-03)
4. scope='tower': `p_target_id = 'tower_power'` guard → `unknown_target` (D-01/T-12-03)
5. `coalesce(select level ..., 1)` reads current level — absence = level 1 (D-15)
6. `v_new_level > 5` → `max_level` (D-10)
7. Server-derived cost CASE: unit {L2:75, L3:150, L4:300, L5:600}, tower {L2:100, L3:200, L4:400, L5:800} (T-12-01/PROG-04)
8. Atomic guarded deduct `UPDATE wallet WHERE balance >= v_cost` → `insufficient_funds` if not found
9. `INSERT INTO upgrades ... ON CONFLICT DO UPDATE SET level = v_new_level WHERE upgrades.level = v_cur_level` — concurrency guard (T-12-04/Landmine #2)
10. `GET DIAGNOSTICS v_rows = row_count; if v_rows = 0 then raise exception` — rolls back deduct on concurrent race (Landmine #3)
11. Returns `{ ok, new_level, new_balance, scope, target_id }`
Footer: `revoke all ... from public; grant execute ... to authenticated`

**Verification:** `grep -cE "upgrade_spend|security definer|search_path = ''|get diagnostics|on conflict|revoke all|insufficient_funds|not_owned"` → **9** (>= 7 required)

Note: `public.upgrades` is already covered by `20260613062000_table_grants.sql` (`grant all on table ... public.upgrades to authenticated, service_role`). No duplicate grant needed in this migration.

---

### Task 2 — DONE: Create the progression.ts services-seam client
**Commit:** `b71fde7`
**File:** `src/lib/api/progression.ts`

Exports:
- `interface OwnLevels { unitLevels: Record<string, number>; towerLevel: number }` — absent key = level 1 (D-15)
- `async getOwnLevels(userId: string): Promise<OwnLevels>` — `supabase.from('upgrades').select(...).eq('user_id', userId).returns<...>()`, folds rows into `unitLevels` map + `towerLevel`; on `error || !data` returns `{ unitLevels: {}, towerLevel: 1 }`
- `async upgradeSpend(scope: 'unit' | 'tower', targetId: string)` — calls `supabase.rpc('upgrade_spend', { p_scope, p_target_id })`; on error returns `{ ok: false, error: error.message }`; unwraps snake_case → camelCase `{ ok, reason?, newLevel?, newBalance?, error: null }`
- Only import: `{ supabase } from '../supabase'` (FND-05 — scenes never call `supabase.from('upgrades')` directly)

**Verification:**
- `npx tsc --noEmit -p tsconfig.json` — **clean** (no output, exit 0)
- `grep -cE "getOwnLevels|upgradeSpend|upgrade_spend|from\('upgrades'\)"` → **8** (>= 4 required)

---

### Task 3 — PENDING BLOCKING CHECKPOINT (not attempted)

**Gate:** `type="checkpoint:human-verify" gate="blocking"`

This task requires:
1. Pushing the migration to the linked remote Supabase project
2. Running `npx vitest run --project rls -- upgrades-rls` GREEN

**WHY NOT ATTEMPTED:** Per executor instructions and plan gate, this requires `SUPABASE_ACCESS_TOKEN` and remote DB access. It is also gated on an **unresolved known blocker** documented in STATE.md:

> Remote `auth.users` createUser fails (`500 unexpected_failure: "Database error creating new user"`) on the linked Supabase project (obcwvyaqdihdhcldewpe). This blocks `seedUser` in the RLS suite. Almost certainly a dashboard-created `on auth.users` trigger/function that raises.

Until that blocker is resolved, `npx vitest run --project rls` will fail regardless of whether the migration is pushed.

---

## Commands the User Must Run (Task 3)

**Prerequisites:**
1. Resolve the remote `auth.users` createUser 500 blocker (see STATE.md Blockers section):
   - Diagnose via Supabase Dashboard → Logs → Auth
   - Look for a trigger on `auth.users` that raises — run `execute_sql` on `pg_trigger` to find it
   - Also check: Phase 11 migration (`20260613061943_accounts_economy.sql`) must be pushed to remote BEFORE this push

2. Ensure `SUPABASE_ACCESS_TOKEN` is set and the project is linked:
   ```
   supabase projects list   # verify linked project
   ```

**Push the migration:**
```
supabase db push
```

**Confirm the migration applied:**
```
supabase migration list
```
(should show `20260614000000_progression` as applied)

**Run the RLS suite:**
```
npx vitest run --project rls -- upgrades-rls
```

**Resume signal:** Type `"applied"` once the migration is pushed and the `upgrades-rls` suite is GREEN (or describe the blocker if the createUser 500 error is still open).

---

## Deviations from Plan

None — Tasks 1 & 2 executed exactly as specified. Task 3 not attempted (by design — blocking checkpoint).

---

## Known Stubs

None in Tasks 1 & 2. The `progression.ts` client returns empty `unitLevels` and `towerLevel: 1` as safe fallbacks (not stubs — this is the correct D-15 absence-equals-level-1 behavior).

## Threat Surface Scan

No new threat surface beyond what the plan's `<threat_model>` already covers. The `upgrade_spend` RPC is the only new network endpoint; all trust boundaries (T-12-01 through T-12-07) are addressed in the migration and services seam as designed.
