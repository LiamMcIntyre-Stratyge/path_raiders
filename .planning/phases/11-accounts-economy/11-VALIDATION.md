---
phase: 11
slug: accounts-economy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `11-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (existing Phase 9 harness) |
| **Config file** | `vitest.config.ts` (exists — two projects: `unit`/node, `rls`/jsdom) |
| **Quick run command** | `npx vitest run --project unit` |
| **Full suite command** | `npx vitest run` (unit + rls; rls needs `supabase start`) |
| **Estimated runtime** | ~15s unit / ~60s full (RLS against local Supabase) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project unit`
- **After every plan wave:** Run `npx vitest run` (full suite incl. RLS against `supabase start`)
- **Before `/gsd:verify-work`:** Full suite green + `tsc --noEmit` + bundle secret-scan
- **Max feedback latency:** ~15s (unit), ~60s (full)

---

## Per-Task Verification Map

> Plan/task IDs are assigned by the planner. This map is requirement-anchored; the
> planner maps each requirement to the plan/wave that owns it.

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| ACCT-01 | Profile persists across restart: wallet + inventory readable after reload | integration (rls) | `npx vitest run --project rls` (`test/rls/inventory-rls.test.ts`) | ❌ W0 |
| ACCT-02 | Username display is escaped (no XSS) | unit | `npx vitest run --project unit` (`test/unit/escape.test.ts`) | ❌ W0 |
| ACCT-03 | `getProfileFull` returns wins/losses/balance/ownedUnits | integration (rls) | `npx vitest run --project rls` | ❌ W0 |
| ACCT-04 | v1.0 backfill: existing profiles get wallet row + welcome grant + inventory from `unlocked_units[]` | integration (rls) | `npx vitest run --project rls` (`test/rls/migration.test.ts`) | ❌ W0 |
| ACCT-04 | Welcome grant idempotent (re-run migration ≠ double-grant) | integration (rls) | `test/rls/migration.test.ts` | ❌ W0 |
| ECON-01 | `report_match_result` credits win/loss reward when both agree | integration (rls) | `test/rls/settlement-idempotency.test.ts` | ❌ W0 |
| ECON-02 | Reward server-derived: client cannot supply a custom amount | integration (rls) | `test/rls/settlement-idempotency.test.ts` | ❌ W0 |
| ECON-03 | `spend_unlock` deducts correct cost + inserts inventory row; insufficient_funds when balance < cost | integration (rls) | `test/rls/inventory-rls.test.ts` | ❌ W0 |
| ECON-04 | Double-submit same `match_id` → credited exactly once | integration (rls) | `test/rls/settlement-idempotency.test.ts` | ❌ W0 |
| ECON-04 | Concurrent spend → deducted at most once, never negative | integration (rls) | `test/rls/inventory-rls.test.ts` | ❌ W0 |
| ECON-04 | Mismatch void / lone report → no payout | integration (rls) | `test/rls/settlement-idempotency.test.ts` | ❌ W0 |
| ECON-05 | Client cannot INSERT/UPDATE inventory directly (forged unlock) | integration (rls) | `test/rls/inventory-rls.test.ts` | ❌ W0 |
| ECON-05 | Client cannot INSERT/UPDATE wallet directly (re-assert P9) | integration (rls) | `test/rls/wallet-rls.test.ts` | ✅ exists |
| D-14 | XSS payload in username escaped on display | unit | `test/unit/escape.test.ts` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — all ⬜ pending until execution.*

---

## Idempotency / Concurrency / Forged-Grant / Migration Matrix

| Scenario | Action | Assert | File |
|----------|--------|--------|------|
| Idempotency: double-submit `match_id` | A reports win twice (same `match_id`) | Credited once (WIN_REWARD), not twice | settlement-idempotency.test.ts |
| Idempotency: re-submit after settled | A reports same match after settlement | `already_settled`; balance unchanged | settlement-idempotency.test.ts |
| Concurrent second-reporters | `Promise.all([B.report, A.retry])` as second reporter | Settlement row exactly once; winner credited exactly WIN_REWARD | settlement-idempotency.test.ts |
| Mismatch void | A says A won, B says B won | `voided=true`; neither credited | settlement-idempotency.test.ts |
| Lone report (D-08) | Only A reports | `status: pending`; no settlement; no credit | settlement-idempotency.test.ts |
| Forged grant (direct wallet write) | A: `from('wallet').update({balance:9999})` | Balance unchanged (RLS denies) | wallet-rls.test.ts (existing) |
| Forged unlock (direct inventory insert) | A: `from('inventory').insert({...})` | No row inserted (RLS denies) | inventory-rls.test.ts |
| Concurrent spend (double-tap) | Two concurrent `spend_unlock('assault_bot')`, balance==cost | Deducted once (0); one inventory row; 2nd → insufficient_funds | inventory-rls.test.ts |
| Spend below zero | balance 50, cost 100 | insufficient_funds; balance unchanged | inventory-rls.test.ts |
| Migration idempotency | Run `provision_account` twice | One wallet row, one inventory row, welcome grant once | migration.test.ts |
| Existing-player migration | Profile wins=5/losses=2/unlocked=['thorn_beast'] | wallet=WELCOME_GRANT, inventory has thorn_beast, W/L unchanged | migration.test.ts |
| New account provisioning | Fresh signup, no profiles row | wallet row, welcome grant, empty inventory | migration.test.ts |

---

## Wave 0 Requirements

- [ ] `test/rls/inventory-rls.test.ts` — ECON-03, ECON-04 (spend), ECON-05 (forged unlock), concurrent spend
- [ ] `test/rls/settlement-idempotency.test.ts` — ECON-01/02, ECON-04 (idempotency, mismatch, lone report, concurrent second-reporter)
- [ ] `test/rls/migration.test.ts` — ACCT-04 (backfill, idempotency, existing-player)
- [ ] `test/unit/escape.test.ts` — D-14 / ACCT-02 (XSS escape unit tests)
- [ ] `test/unit/economy.test.ts` — pure-unit: reward/grant/cost constants positive & match expected values
- [ ] `src/lib/escapeHtml.ts` — new helper (tested by escape.test.ts)

Existing infrastructure (no Wave 0 work needed): `vitest.config.ts` ✓, `test/rls/wallet-rls.test.ts` ✓ (re-run), `test/unit/pathfinder.test.ts` ✓, `.github/workflows/ci.yml` ✓.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Profile screen renders provided design with W/L + balance + rank placeholder + owned units | ACCT-02/03, D-13 | UI is user-provided design; visual integration | Launch app, open profile, confirm bound data matches DB values |
| Full earn→spend loop feels "fast" (welcome ≈ 1 unit, further ~3–5 wins) | D-02/D-03 | Subjective pacing/UX | Play through new-account flow; confirm immediate first unlock |

*All security-critical and data-integrity behaviors have automated verification above.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
