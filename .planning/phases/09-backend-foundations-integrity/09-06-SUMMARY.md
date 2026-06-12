---
phase: 09-backend-foundations-integrity
plan: "06"
subsystem: prod-deploy
tags: [supabase, migrations, db-push, wallet, rls, credit-rpc, fnd-01, prod, checkpoint]
dependency_graph:
  requires: [09-02, 09-05]
  provides: [live-schema]
  affects: [live-supabase-project]
tech_stack:
  added: []
  patterns: [supabase-link, supabase-db-push, non-destructive-baseline]
key_files:
  created: []
  modified: []
decisions:
  - "Live deploy executed by the user (blocking human-action gate) — Claude cannot supply project ref or access token"
  - "Project linked: project-ref obcwvyaqdihdhcldewpe (supabase/.temp/project-ref written)"
  - "Non-destructive push: baseline uses CREATE TABLE IF NOT EXISTS, preserving v1.0 profiles/rooms data (A3)"
  - "Migrations applied: 20260612000001_baseline.sql + 20260612085249_foundations.sql"
metrics:
  completed: "2026-06-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 0
---

# Phase 09 Plan 06: Push Migrations to Live Supabase Summary

Closed the false-positive verification gap (local/CI-only schema vs production) by applying
the committed Phase 9 migrations to the live Supabase project. This is the BLOCKING human
deploy plan — only the user holds the project ref and access token, so the user executed the
link + push, and confirmed the post-push schema via the Dashboard.

## What happened

- **Task 1 (checkpoint:human-action — Link the live project):** User authenticated and ran
  `supabase link --project-ref obcwvyaqdihdhcldewpe`. Link succeeded — `supabase/.temp/project-ref`
  is present in the repo (orchestrator-confirmed). User reviewed the dry-run.
- **Task 2 (checkpoint:human-verify — Push & verify):** User ran `supabase db push`, applying the
  two committed migrations to production, and confirmed completion via the "pushed" resume signal.

## Migrations applied to prod

| Migration | Effect |
|-----------|--------|
| `20260612000001_baseline.sql` | Non-destructive baseline reproducing v1.0 `profiles`/`rooms` (`CREATE TABLE IF NOT EXISTS` — no data loss, A3) |
| `20260612085249_foundations.sql` | `wallet` + `wallet_credits` ledger + `inventory`/`upgrades`/`match_results` RLS shells + `credit_wallet` SECURITY DEFINER RPC + tightened `profiles` RLS |

## Acceptance criteria

- [x] `supabase db push` applied the committed migrations to the live project with no errors (user-confirmed)
- [x] `wallet`, `wallet_credits`, `inventory`, `upgrades`, `match_results`, `credit_wallet` exist in prod (user-confirmed via Dashboard)
- [x] RLS enabled on `wallet` (SELECT-own, no client write) and `profiles` (own-row policies) (user-confirmed)
- [x] Existing v1.0 `profiles`/`rooms` data intact — non-destructive (user-confirmed)

## Verification notes

- Project link independently confirmed by orchestrator (`supabase/.temp/project-ref` = `obcwvyaqdihdhcldewpe`).
- Remote schema verified by the user in the Supabase Dashboard (Table Editor + Database → Functions + RLS/Policies). The orchestrator cannot re-query the remote without the user's access token (token correctly kept out of the repo/shell — never committed, per T-09-token-leak mitigation).
- `SUPABASE_ACCESS_TOKEN` was supplied only via the user's interactive session; it is not in `src/`, not a `VITE_*` var, and is backstopped by the plan-05 bundle secret-scan.

## Threat mitigations (from PLAN.md threat model)

- **T-09-prod-gap** (false-positive verification): MITIGATED — migrations are now live, closing the local-only schema gap before phase verification.
- **T-09-dataloss** (destructive push): MITIGATED — baseline `CREATE TABLE IF NOT EXISTS`, dry-run reviewed for `drop`, post-push row-presence confirmed.
- **T-09-token-leak** (token handling): MITIGATED — token via env/interactive login only; bundle scan backstops.

## Deviations

- The live push and all remote verification were performed in the user's authenticated session
  (by design — blocking human gate). The orchestrator's confirmation is limited to the local link
  artifact; remote-schema truth rests on the user's "pushed" sign-off, which is the plan's defined
  acceptance signal.
