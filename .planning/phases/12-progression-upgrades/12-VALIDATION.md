---
phase: 12
slug: progression-upgrades
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-13
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 12-RESEARCH.md §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (already configured in `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` — two projects: `unit` (node) and `rls` (jsdom) |
| **Quick run command** | `npx vitest run --project unit` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | unit ~few seconds; rls adds live-CI Supabase round-trips |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project unit`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** < 30s for the unit project

---

## Per-Task Verification Map

> Task IDs are assigned at plan time. The rows below bind each phase requirement to its
> automated proof from RESEARCH.md; the planner maps them onto concrete task IDs and
> threat refs (see Security Domain in 12-RESEARCH.md).

| Requirement | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------|-------------------|-------------|--------|
| PROG-01 | upgrade RPC deducts wallet + increments unit level | T-12 tamper/cost | rls | `npx vitest run --project rls -- upgrades-rls` | ❌ W0 | ⬜ pending |
| PROG-01 | RPC rejects insufficient funds | T-12 | rls | `npx vitest run --project rls -- upgrades-rls` | ❌ W0 | ⬜ pending |
| PROG-01 | RPC rejects unowned unit (D-16) | T-12 ownership | rls | `npx vitest run --project rls -- upgrades-rls` | ❌ W0 | ⬜ pending |
| PROG-01 | RPC rejects unknown unit id | T-12 input-val | rls | `npx vitest run --project rls -- upgrades-rls` | ❌ W0 | ⬜ pending |
| PROG-01 | RPC idempotent/safe under concurrent calls (one wins) | T-12 concurrency | rls | `npx vitest run --project rls -- upgrades-rls` | ❌ W0 | ⬜ pending |
| PROG-01 | RPC rejects level skip (1 → 3) | T-12 tamper | rls | `npx vitest run --project rls -- upgrades-rls` | ❌ W0 | ⬜ pending |
| PROG-01 | RPC rejects at max level (5 → 6) | T-12 tamper | rls | `npx vitest run --project rls -- upgrades-rls` | ❌ W0 | ⬜ pending |
| PROG-01 | direct client INSERT/UPDATE on upgrades denied by RLS | T-12 deny-write | rls | `npx vitest run --project rls -- upgrades-rls` | ❌ W0 | ⬜ pending |
| PROG-02 | RPC works for scope='tower' target | T-12 | rls | `npx vitest run --project rls -- upgrades-rls` | ❌ W0 | ⬜ pending |
| PROG-01/02 | absence of upgrades row = level 1 (getOwnLevels default) | — | unit | `npx vitest run --project unit -- progression` | ❌ W0 | ⬜ pending |
| PROG-03 | resolveUnitStats(id, 1) === flat UNITS baseline (level-1 invariant) | — | unit | `npx vitest run --project unit -- resolver` | ❌ W0 | ⬜ pending |
| PROG-03 | resolveTowerStats(1).dmg === TOWER_DMG (level-1 invariant) | — | unit | `npx vitest run --project unit -- resolver` | ❌ W0 | ⬜ pending |
| PROG-03 | resolver clamps out-of-range level inputs (0, 999) | T-12 DoS | unit | `npx vitest run --project unit -- resolver` | ❌ W0 | ⬜ pending |
| PROG-03 | clampLevels guard: >MAX→MAX, <1→1, unknown id dropped (D-12) | T-12 DoS | unit | `npx vitest run --project unit -- clamp` | ❌ W0 | ⬜ pending |
| PROG-03 | createWorld hostTowerLevel=3 → host towers use level-3 dmg | — | unit | `npx vitest run --project unit -- sim-levels` | ❌ W0 | ⬜ pending |
| PROG-03 | spawnUnit level=2 → unit.hp/dmg match resolveUnitStats(id,2) | — | unit | `npx vitest run --project unit -- sim-levels` | ❌ W0 | ⬜ pending |
| PROG-04 | upgrade costs server-embedded, client mirror display-only | T-12 cost-tamper | unit | `npx vitest run --project unit -- progression` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/progression/resolver.test.ts` — PROG-03 resolver level-1 invariants + out-of-range clamp
- [ ] `test/unit/progression/clamp.test.ts` — PROG-03 clampLevels guard (D-12)
- [ ] `test/unit/progression/sim-levels.test.ts` — PROG-03 createWorld + spawnUnit (+ spawnAI) stat injection
- [ ] `test/rls/upgrades-rls.test.ts` — PROG-01/02/04 RPC atomic deduct, own-to-upgrade, idempotency, level-skip reject, max-level reject, RLS deny-direct-write (mirrors `test/rls/inventory-rls.test.ts`)
- [ ] Framework install: **None** — Vitest already configured; new test files only.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Both participants' battle stats reflect upgrade levels end-to-end in a live 2-client match | PROG-03 | Requires two real sessions exchanging levels over realtime; mirrors P10's D-16 manual parity gate | Two clients with different upgrade levels start a match; confirm each client renders the opponent's units/towers at the opponent's persisted levels (clamped) |
| Upgrade screen (provided design) binds current level / next-cost / stat-delta and refreshes on spend | PROG-01/02 (UI hint) | Provided design integration — visual binding | Open upgrade screen, upgrade a unit, confirm balance, level, and stat-delta preview update |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit project)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
