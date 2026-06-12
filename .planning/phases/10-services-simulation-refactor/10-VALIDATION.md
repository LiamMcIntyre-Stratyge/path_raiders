---
phase: 10
slug: services-simulation-refactor
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-12
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (Phase 9 harness) |
| **Config file** | `vitest.config.ts` + `tsconfig.test.json` |
| **Quick run command** | `npx vitest run test/unit/sim` |
| **Full suite command** | `npx vitest run` |
| **Type-check command** | `npx tsc --noEmit -p tsconfig.json` (prod) + `-p tsconfig.test.json` (test) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/unit/sim` + `npx tsc --noEmit -p tsconfig.json` (build must stay tsc-green at every commit)
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | BATTLE-02 | T-10-01-NEW | N/A (pure helper extraction) | tsc | `npx tsc --noEmit -p tsconfig.json` | ✅ self | ⬜ pending |
| 10-01-02 | 01 | 1 | BATTLE-02 | T-10-01-NEW | N/A (static table) | tsc | `npx tsc --noEmit -p tsconfig.json` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | BATTLE-02 | T-10-01-NEW | N/A (render extraction) | tsc | `npx tsc --noEmit -p tsconfig.json` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | BATTLE-02 | T-10-02-PURE | Sim purity (no Phaser/Supabase) | tsc | `npx tsc --noEmit -p tsconfig.json && -p tsconfig.test.json` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 2 | BATTLE-02 | T-10-02-PURE | Sim purity; D-07 tiebreak determinism | unit | `npx vitest run test/unit/sim/movement.test.ts test/unit/sim/combat.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-03 | 02 | 2 | BATTLE-02 | T-10-02-PURE | Sim purity; injected rng | unit | `npx vitest run test/unit/sim` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 3 | BATTLE-02 | T-10-03-PURE | View/sim split; sim transport-free | tsc | `npx tsc --noEmit -p tsconfig.json` | ❌ W0 | ⬜ pending |
| 10-03-02 | 03 | 3 | BATTLE-02 | T-10-03-01/02 | Wire protocol byte-preserved (D-04) | unit | `npx tsc --noEmit -p tsconfig.json && npx vitest run` | ❌ W0 | ⬜ pending |
| 10-04-01 | 04 | 4 | BATTLE-02 | T-10-04-01 | recordResult write path unchanged (D-13) | grep | `grep -c "hostBaseHp\|guestBaseHp\|gameMode" src/lib/gameState.ts` | ✅ self | ⬜ pending |
| 10-04-02 | 04 | 4 | BATTLE-02 | T-10-04-01 | No new write authority | unit | `npx tsc --noEmit -p tsconfig.json && npx vitest run` | ✅ self | ⬜ pending |
| 10-05-01 | 05 | 5 | BATTLE-02 | T-10-05-01 | N/A (test-only) | unit | `npx vitest run test/unit/sim/win.test.ts test/unit/sim/wall-break.test.ts` | ❌ W0 | ⬜ pending |
| 10-05-02 | 05 | 5 | BATTLE-02 | T-10-05-01 | N/A (snapshot lock) | snapshot | `npx vitest run test/unit/sim/snapshot.test.ts` (×2 for determinism) | ❌ W0 | ⬜ pending |
| 10-05-03 | 05 | 5 | BATTLE-02 | T-10-05-01 | Parity gate: boundaries unchanged | manual | Two-session host+guest + practice playtest (D-16) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The pure-sim scenarios (D-15/D-17) — movement, combat death, win-by-base-reach, win-by-timer, wall-break detour, characterization snapshot — are the automated forward regression net. The old-vs-new parity proof is the manual two-session playtest (D-16), not an automated diff.*

---

## Wave 0 Requirements

- [ ] `test/unit/sim/_helpers.ts` — makeBase/makeOver/spawnTestUnit scaffold (Plan 02 Task 2)
- [ ] `test/unit/sim/movement.test.ts` — D-17a, created RED-first (Plan 02 Task 2)
- [ ] `test/unit/sim/combat.test.ts` — D-17b + D-07 tiebreak + wallTarget guard, created RED-first (Plan 02 Task 2)
- [ ] `test/unit/sim/win.test.ts` — D-17c base-reach + timer (Plan 05 Task 1)
- [ ] `test/unit/sim/wall-break.test.ts` — D-17d detour via pathfinder (Plan 05 Task 1)
- [ ] `test/unit/sim/snapshot.test.ts` — D-15 characterization snapshot fixture (Plan 05 Task 2)

*Existing Phase 9 vitest infrastructure (config, tsconfig.test.json, pathfinder tests) covers harness setup — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "No player-visible behavior change" parity gate | BATTLE-02 | Frame-identical automated diff vs old GameScene is impractical (Phaser entanglement + variable dt) — D-16 | Manual host+guest two-session playtest + one practice match per TESTING.md (Plan 05 Task 3); confirm same battle outcomes/feel; the ONLY accepted micro-change is the D-07 id-tiebreak |

*Unit tests are the forward regression net, not the old-vs-new proof (D-16).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoint task 10-05-03 is the D-16 manual gate)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned
