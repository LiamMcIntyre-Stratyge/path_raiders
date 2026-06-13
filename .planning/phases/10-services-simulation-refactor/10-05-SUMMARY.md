---
phase: 10-services-simulation-refactor
plan: 05
subsystem: simulation
tags: [sim, testing, vitest, snapshot, characterization, win-conditions, wall-break, parity-gate, d-15, d-16, d-17]

# Dependency graph
requires:
  - phase: 10-services-simulation-refactor
    plan: 02
    provides: pure src/sim/ core + test/unit/sim/_helpers.ts scaffold (makeBase/makeOver/spawnTestUnit)
  - phase: 10-services-simulation-refactor
    plan: 03
    provides: GameScene drives step() — the integrated render/sim loop the parity gate validates
  - phase: 10-services-simulation-refactor
    plan: 04
    provides: slimmed gameState — SimWorld is the sole battle source of truth the snapshot locks
provides:
  - test/unit/sim/win.test.ts — D-17c: win-by-timer-expiry AND win-by-base-reach game_over coverage
  - test/unit/sim/wall-break.test.ts — D-17d: wall-break detour through the pathfinder
  - test/unit/sim/snapshot.test.ts — D-15: deterministic characterization snapshot regression lock
  - test/unit/sim/__snapshots__/snapshot.test.ts.snap — committed scripted-battle trace fixture
affects: [phase-11-accounts-economy, phase-14-determinism]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forward regression net, not old-vs-new proof: an automated frame-identical diff vs the old GameScene is impractical (Phaser entanglement + variable dt), so parity is confirmed by the D-16 manual two-session playtest (TESTING.md)"
    - "Map-stable snapshot serialization: a JSON replacer converts any Map to Array.from(entries).sort() (Pitfall 2 — raw JSON.stringify drops Maps and is non-deterministic)"
    - "Determinism via injected rng (() => 0.5) + fixed dt (16ms) scripted-deploy loop — the snapshot is stable across repeated runs, re-locked intentionally via `npx vitest run --update-snapshots`"

key-files:
  created:
    - test/unit/sim/win.test.ts
    - test/unit/sim/wall-break.test.ts
    - test/unit/sim/snapshot.test.ts
    - test/unit/sim/__snapshots__/snapshot.test.ts.snap
  modified: []

key-decisions:
  - "No new sim code was needed — all D-17 c/d scenarios pass against the already-implemented src/sim/ (Plans 02-03); the tests are a regression net over existing behavior, not a driver of new behavior"
  - "Parity (D-16) confirmed by the manual two-session + practice playtest, not an automated diff — the project's documented verification method (TESTING.md); user signed off 2026-06-13"

requirements-completed: [BATTLE-02]

# Metrics
duration: ~2min (automated tasks); parity gate human-paced
completed: 2026-06-13
---

# Phase 10 Plan 05: Sim Test Coverage + Parity Gate Summary

**The Phase 10 simulation extraction is now locked by a complete forward regression net — win-by-timer and win-by-base-reach (D-17c), wall-break detour through the pathfinder (D-17d), and a deterministic characterization snapshot (D-15) — and the behavior-preserving claim is confirmed by the manual two-session + practice parity playtest (D-16), the authoritative "no player-visible behavior change" gate.**

## Performance

- **Duration:** ~2 min for the two automated test tasks; the D-16 parity gate is human-paced.
- **Tasks:** 3 (2 automated + 1 blocking human-verify checkpoint)
- **Files created:** 4 (3 test files + 1 committed snapshot fixture)

## Accomplishments
- **Win-condition coverage (D-17c) — `test/unit/sim/win.test.ts`:** timer-expiry (`world.timeLeft` set just above 0, one step past it emits `game_over` with winner matching the `hostBaseHp` vs `guestBaseHp` comparison, including a tie case and a host-wins case) and base-reach (a unit advanced to/past its final waypoint emits `base_hit`; driving base HP to 0 emits `game_over` with the attacker's side as winner). 14 `game_over` assertions across both paths.
- **Wall-break detour (D-17d) — `test/unit/sim/wall-break.test.ts`:** a unit whose next waypoint is a breakable wall (`canBreakWall` true for its faction) sets `wallTarget` instead of moving through; repeated steps drive wall HP to 0 → a `wall_break` event fires, `mutableOver` at that cell is cleared, and the unit's path is recomputed (detour) so it resumes toward the base. Integrates `src/lib/pathfinder.ts` end-to-end through the sim.
- **Characterization snapshot (D-15) — `test/unit/sim/snapshot.test.ts`:** a deterministic scripted battle (fixed `rng = () => 0.5`, fixed `dt = 16ms`, scripted deploy sequence) serialized via a Map-stable JSON replacer (`val instanceof Map ? Array.from(val.entries()).sort() : val`) and locked with `toMatchSnapshot()`. The committed fixture is stable across repeated runs (verified by the double-run determinism check).
- **D-16 manual parity gate — APPROVED (2026-06-13):** the user ran the two-session host+guest playtest plus a practice-mode AI match and confirmed gameplay matches v1.0 feel (gold accrual, 180s timer, unit move/fight/death, tower fire, wall break + detour, base HP flash, result overlay, win/unlock recording). The only accepted micro-change is the D-07 id-tiebreak (sub-pixel target-selection ties — effectively invisible).

## Task Commits

1. **Task 1: win-condition + wall-break detour tests (D-17 c/d)** — `449dc33` (test)
2. **Task 2: characterization snapshot regression lock (D-15)** — `d7ebac1` (test)
3. **Task 3: D-16 manual two-session parity playtest** — human-verify checkpoint, approved by user 2026-06-13 (no code commit; assurance step).

## Files Created/Modified
- `test/unit/sim/win.test.ts` (created) — D-17c timer-expiry + base-reach `game_over` coverage.
- `test/unit/sim/wall-break.test.ts` (created) — D-17d `wall_break` + `mutableOver` clear + pathfinder detour.
- `test/unit/sim/snapshot.test.ts` (created) — D-15 deterministic scripted-battle snapshot with Map-stable replacer.
- `test/unit/sim/__snapshots__/snapshot.test.ts.snap` (created) — committed snapshot fixture.

## Decisions Made
- **No new sim code** — every D-17 c/d scenario passed against the already-implemented `src/sim/` (Plans 02-03). The tests are a forward regression net, confirming no behavior gap; nothing in `src/` was changed by this plan.
- **Parity by manual playtest, not automated diff** — a frame-identical old-vs-new automated comparison is impractical (Phaser entanglement + variable dt), so D-16 is satisfied by the documented two-session manual playthrough (TESTING.md), signed off by the user.

## Deviations from Plan
None. Both automated tasks executed as specified; the human-verify gate was run and approved.

## Authentication Gates
None.

## Issues Encountered
- **Pre-existing Phase 9 RLS test red locally (not a 10-05 regression):** `test/rls/wallet-rls.test.ts` fails both `tsc -p tsconfig.test.json` (Supabase generated-type `never` on the `wallet` insert) and `vitest` (`supabaseUrl is required` — no local Supabase/Docker). This file was last touched in `4391aec` (Phase 09) and is documented in STATE.md as a CI-only live-run. It is excluded from the sim deliverable. Verification of the 10-05 deliverable:
  - `npx tsc --noEmit -p tsconfig.json` → exit 0
  - `npx vitest run test/unit/sim` → **5 files, 16 tests pass**
  - Snapshot double-run → both pass (deterministic, not flaky)
  - `npx vitest run` (full suite) → **47 / 47 tests pass** (the only failing file is the env-gated RLS test above)

## Known Stubs
None — this is a test-only + manual-verify plan. No placeholder data, no production-code stubs.

## Threat Flags
None new (T-10-05-01, disposition: accept). Test files and the snapshot fixture introduce no runtime surface, no I/O, no networking. The parity gate is a security-relevant assurance step (confirms the refactor left all Phase 10 trust boundaries unchanged — sim stays transport-free, scene keeps owning networking), not a new surface. Server-authority hardening remains deferred to Phase 11/14.

## Next Phase Readiness
- **Phase 10 COMPLETE:** ROADMAP SC#2 satisfied — the extracted simulation has unit tests in the Phase 9 harness covering core combat/movement/win resolution (D-17 a-d + the D-15 snapshot). The behavior-preserving claim is confirmed by the D-16 playtest; the only accepted micro-change is the D-07 id-tiebreak.
- **Phase 11 (Accounts & Economy)** is unblocked and already context-gathered (`11-CONTEXT.md`). It builds on the read-through `gameState` cache + the `recordResult`-authority handoff (P10 D-13): moving result/economy writes server-side is its own scope.
- **Phase 14 (Battle Authority / determinism)** inherits the snapshot fixture as a determinism anchor — the scripted-battle trace is the baseline a signed-match-report scheme can validate against.

## Self-Check: PASSED

- `test/unit/sim/{win,wall-break,snapshot}.test.ts` + `__snapshots__/snapshot.test.ts.snap` all present on disk and committed (`449dc33`, `d7ebac1`).
- Acceptance greps verified: `game_over` ×14 in win.test.ts (≥2, tie case present); `wall_break` ×6 + `mutableOver` ×2 in wall-break.test.ts; `() => 0.5` ×2, `toMatchSnapshot` ×1, `instanceof Map` ×1 in snapshot.test.ts.
- `npx tsc --noEmit -p tsconfig.json` exit 0; `npx vitest run` → 47/47 tests pass; sim suite 16/16; snapshot stable across double-run.
- D-16 parity gate approved by user 2026-06-13.

---
*Phase: 10-services-simulation-refactor*
*Completed: 2026-06-13*
