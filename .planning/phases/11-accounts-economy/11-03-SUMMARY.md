---
phase: 11-accounts-economy
plan: 03
subsystem: services
tags: [api-seam, economy, supabase-rpc, inventory, settlement, profile]
requires:
  - "Plan 02 RPCs live on remote Supabase: spend_unlock, report_match_result, provision_account"
  - "Phase 9 seam: src/lib/api/wallet.ts (getBalance, creditWallet), src/lib/supabase.ts"
provides:
  - "src/lib/api/inventory.ts: getOwnedUnits, spendUnlock"
  - "src/lib/api/settlement.ts: reportMatchResult"
  - "src/lib/api/profile.ts: getProfileFull, FullProfile"
  - "src/lib/api/account.ts: slimmed (getProfile, upsertProfile only)"
affects:
  - "src/scenes/GameScene.ts (now has a dangling recordMatchResult import — Plan 05 rewires)"
tech-stack:
  added: []
  patterns:
    - "Supabase RPC client wrapper (error-unwrap + jsonb spread) per wallet.ts creditWallet"
    - "Promise.all parallel aggregate read across profiles + wallet + inventory"
key-files:
  created:
    - src/lib/api/inventory.ts
    - src/lib/api/settlement.ts
    - src/lib/api/profile.ts
  modified:
    - src/lib/api/account.ts
decisions:
  - "D-11: client-authoritative win-milestone unlock retired — THRESHOLDS/recordMatchResult/MatchResultPayload deleted from account.ts"
  - "D-13: rank is a literal 'UNRANKED' placeholder until P13"
  - "ECON-02: spendUnlock/reportMatchResult forward only unit_id / winner UUID — no amount param"
metrics:
  duration: "~10 min"
  completed: 2026-06-13
  tasks: 2
  files: 4
---

# Phase 11 Plan 03: Typed API Seam (inventory / settlement / profile) Summary

Three new typed `src/lib/api/` clients route the economy through the now-live Plan 02 SECURITY DEFINER RPCs, and the client-authoritative unlock path is deleted from `account.ts` so currency-spend is the only unlock route (D-11).

## What Was Built

**Task 1 — `inventory.ts` + `settlement.ts`** (commit `e80ba2e`)
- `getOwnedUnits(userId)`: read-own `inventory.unit_id` via RLS, maps to `string[]`, `[]` on error.
- `spendUnlock(unitId)`: wraps `supabase.rpc('spend_unlock', { p_unit_id })`; spreads the jsonb result (`ok`/`new_balance`/`unit_id` → `newBalance`/`unitId`), `{ ok:false, error }` on rpc error. No amount param (ECON-02/ECON-03).
- `reportMatchResult(matchId, claimedWinnerId)`: wraps `supabase.rpc('report_match_result', { p_match_id, p_claimed_winner })`; returns `{ status, error }` where status is `'pending'|'settled'|'already_settled'|'void'`. Client sends only the winner UUID (ECON-01/ECON-02).

**Task 2 — `profile.ts` aggregate + `account.ts` slim** (commit `9fef2d6`)
- `getProfileFull(userId)`: `Promise.all` over [profiles `username/wins/losses` `.single`, `getBalance(userId)`, inventory `unit_id` `.returns`]; returns `null` if the profile query errors, else a `FullProfile` with `balance ?? 0` and `rankPlaceholder: 'UNRANKED'` (D-13). Exports `FullProfile`.
- `account.ts`: deleted `MatchResultPayload` interface, `THRESHOLDS` const, and the entire `recordMatchResult` function (D-11). Kept `Profile`, `getProfile`, `upsertProfile`, and the `Faction` import (still used by `upsertProfile`).

## Verification

`npx tsc --noEmit` after the symbol deletion surfaces exactly one error, which is the expected and plan-documented deferral to Plan 05:

```
src/scenes/GameScene.ts(4,10): error TS2305: Module '"../lib/api/account"' has no exported member 'recordMatchResult'.
```

The api layer itself type-checks cleanly. GameScene's `recordMatchResult` import (line 4) and its `recordResult` call site (line 443) are Plan 05's rewiring job (Plan 05's `<read_first>` already lists GameScene). Per the plan's Task 2 acceptance note ("only remaining recordMatchResult reference, if any, is in GameScene.ts which Plan 05 fixes — note it in SUMMARY if tsc flags it"), no shim was added.

Acceptance greps (all pass):
- `rpc('spend_unlock'` in inventory.ts → 1
- `rpc('report_match_result'` in settlement.ts → 1
- `p_amount|p_cost|p_reward` across inventory.ts + settlement.ts → 0 (ECON-02)
- `recordMatchResult|THRESHOLDS|MatchResultPayload` in account.ts → 0 (D-11, T-11-10)
- `export ... getProfile` in account.ts → 1 (getProfile + upsertProfile preserved)
- `UNRANKED` literal in profile.ts → present (D-13)

No RLS/integration/DB tests were run: there is no local DB and no service-role/test env vars in this environment. This plan's own verification is the DB-free type-check, which was run and reported above.

## Threat Model Outcome

- **T-11-09 (Tampering — client supplies amount):** mitigated. `spendUnlock`/`reportMatchResult` forward only `unit_id` / winner UUID; the no-amount grep returns 0.
- **T-11-10 (Elevation — leftover client-authoritative unlock):** mitigated. `recordMatchResult`/`THRESHOLDS`/`MatchResultPayload` fully deleted from account.ts; grep returns 0.
- **T-11-SC:** N/A — zero new packages.

## Deviations from Plan

None affecting scope. One expected-and-documented carry-forward: deleting `recordMatchResult` leaves a dangling import in `src/scenes/GameScene.ts:4`, which the plan explicitly assigns to Plan 05. Not a deviation — it is the planned hand-off. The `UNRANKED` grep returns 2 (one in a code comment plus the literal) rather than the plan's stated `1`; the literal `'UNRANKED'` is correctly present, so the acceptance intent (D-13 placeholder shipped) is satisfied.

## Self-Check

Files created/modified verified on disk:
- FOUND: src/lib/api/inventory.ts
- FOUND: src/lib/api/settlement.ts
- FOUND: src/lib/api/profile.ts
- FOUND: src/lib/api/account.ts (symbols removed)

Commits verified in git log:
- FOUND: e80ba2e (Task 1 — inventory + settlement)
- FOUND: 9fef2d6 (Task 2 — profile aggregate + account.ts slim)

STATE.md and ROADMAP.md were intentionally NOT modified (per execution instructions).

## Self-Check: PASSED
