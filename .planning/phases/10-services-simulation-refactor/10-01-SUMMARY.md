---
phase: 10-services-simulation-refactor
plan: 01
subsystem: refactor
tags: [towers, phaser, typescript, extraction, faction-resolution]

# Dependency graph
requires:
  - phase: 09-backend-foundations-integrity
    provides: Vitest unit harness (test/unit/), typed src/lib/api/ seam
provides:
  - src/lib/sideHelper.ts — pure resolveSide(role, faction) + opponentFaction(faction)
  - src/towers/TowerData.ts — flat static tower stat table (TOWER_RANGE/TOWER_DMG/TOWER_CD, TOWER_DEF)
  - src/towers/TowerView.ts — Phaser tower rendering (drawTowers) + single-source FC color table/fac()
  - Thinned GameScene that imports tower data/view and the side helper
affects: [10-02, 10-03, 10-04, 10-05, sim-extraction, gameState-reduction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tower data/view split mirroring the Unit abstraction (TowerData = static stats, TowerView = Phaser render)"
    - "Single pure side/faction resolver (resolveSide) replacing inline duplication"
    - "FC faction-color table as single source of truth in TowerView"

key-files:
  created:
    - src/lib/sideHelper.ts
    - src/towers/TowerData.ts
    - src/towers/TowerView.ts
  modified:
    - src/scenes/GameScene.ts

key-decisions:
  - "TowerData is a flat static table (no per-level scaling) per D-10; upgrades deferred to Phase 12"
  - "FC color table + fac() relocated into TowerView.ts as the single definition (was duplicated inline in GameScene)"
  - "drawTowers exported as a standalone function (not a class) — towers are static, no syncFrom needed"

patterns-established:
  - "src/towers/ data+view split consistent with src/units/ (UnitData/UnitView)"
  - "resolveSide()/opponentFaction() pure helpers — zero Phaser/Supabase/gameState code imports"

requirements-completed: [BATTLE-02]

# Metrics
duration: 4min
completed: 2026-06-12
---

# Phase 10 Plan 01: Towers Module + Side Helper Extraction Summary

**Towers promoted out of inline GameScene into dedicated src/towers/ TowerData (flat stats) + TowerView (Phaser render), and the triple-duplicated faction/side mapping collapsed into one pure resolveSide() helper — all behavior-preserving and tsc-green.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-12T12:39:10Z
- **Completed:** 2026-06-12T12:42:47Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Centralized the side/faction-resolution logic (formerly reimplemented in `drawBasePlacements`, `drawTowers`, and `updateAI`) into one pure `src/lib/sideHelper.ts` with `resolveSide()` + `opponentFaction()` — removing the documented divergence risk before the heavier sim extraction touches the same code.
- Created `src/towers/TowerData.ts` mirroring `UnitData.ts`: a flat static stat table (`TOWER_RANGE = 6*CELL`, `TOWER_DMG = 25`, `TOWER_CD = 1400`) with no Phaser/Supabase imports and no per-level scaling (D-10).
- Created `src/towers/TowerView.ts` with the extracted `drawTowers()` Phaser render and the relocated `FC` faction-color table + `fac()` helper, de-duplicating the color table to a single source.
- Thinned `GameScene`: deleted the private `opponentFaction` and `drawTowers` methods and the inline tower constants + FC table; it now imports them.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract resolveSide + opponentFaction into src/lib/sideHelper.ts** - `eb4239d` (refactor)
2. **Task 2: Create src/towers/TowerData.ts (flat static stats, D-10)** - `ce8c764` (feat)
3. **Task 3: Extract tower rendering into src/towers/TowerView.ts (D-09)** - `c0f5ef8` (feat)

## Files Created/Modified
- `src/lib/sideHelper.ts` - Pure `resolveSide(role, playerFaction)` → `{ hostFaction, guestFaction, dir }` and `opponentFaction(faction)` cycle helper; imports only the `Faction` type.
- `src/towers/TowerData.ts` - Flat static tower stat table (`TOWER_RANGE`, `TOWER_DMG`, `TOWER_CD`, `TowerDefinition`, `TOWER_DEF`); imports only `CELL`.
- `src/towers/TowerView.ts` - Phaser `drawTowers(scene, towers, hostFaction, guestFaction)` render + single-source `FC`/`fac()` color lookup.
- `src/scenes/GameScene.ts` - Imports the three new modules; deleted private `opponentFaction`/`drawTowers` methods, inline tower constants, and the duplicated FC table; `create()` now calls `renderTowers()` with `resolveSide`-derived factions.

## Decisions Made
- `drawTowers` exported as a standalone function returning the `Graphics` object (not a class) — towers are static with no per-frame sync, so a class wrapper adds no value (plan left this to discretion).
- `FC`/`fac()` placed in `TowerView.ts` (rather than a separate colors module) since towers are the primary consumer and `drawBasePlacements` imports `fac` from there — keeping it to one location satisfies the de-duplication criterion without an extra file.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' acceptance criteria verified (tsc exit 0 after each; export/grep checks all pass).

## Issues Encountered
- `npx vitest run` (all projects) reports 1 failing file: `test/rls/wallet-rls.test.ts` ("supabaseUrl is required"). This is a pre-existing environmental gap — the RLS integration test requires live Supabase credentials and is documented in STATE.md to live-run in CI on first push (no local Docker in dev). It is unrelated to this plan's changes. The `unit` project (all 31 tests, including the pathfinder suite) passes: `npx vitest run --project unit` exits 0.

## Known Stubs
None — no stubs, placeholders, or empty-value data sources introduced. All extracted code is wired and functional.

## Next Phase Readiness
- `src/towers/` is now populated and consistent with the Unit data/view split, ready for Plan 02+ to add `SimTower` targeting/firing logic in `src/sim/`.
- `resolveSide`/`opponentFaction` are available for the AI spawner and world-creation paths in the upcoming sim extraction (Pitfall 5 in RESEARCH.md — sim must not import gameState; faction args resolved via this helper).
- Parity gate (D-16, manual two-session playtest) remains deferred to the phase-end verification; this plan is behavior-preserving by construction (tsc-green, byte-identical faction mapping and tower pixel output).

## Self-Check: PASSED

All created files exist (sideHelper.ts, TowerData.ts, TowerView.ts, 10-01-SUMMARY.md) and all three task commits (eb4239d, ce8c764, c0f5ef8) are present in git history.

---
*Phase: 10-services-simulation-refactor*
*Completed: 2026-06-12*
