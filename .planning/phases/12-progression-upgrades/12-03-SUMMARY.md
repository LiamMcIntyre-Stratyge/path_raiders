---
phase: 12-progression-upgrades
plan: "03"
subsystem: sim-progression
tags: [progression, sim, level-injection, tdd-green, wave-1]
dependency_graph:
  requires:
    - resolveUnitStats (src/units/UnitData.ts) — plan 01
    - resolveTowerStats (src/towers/TowerData.ts) — plan 01
    - sim-levels RED scaffold (test/unit/progression/sim-levels.test.ts) — plan 01
  provides:
    - SimWorld level-map fields (hostUnitLevels, guestUnitLevels, hostTowerLevel, guestTowerLevel)
    - CreateWorldOptions level fields (hostTowerLevel?, guestTowerLevel?, hostUnitLevels?, guestUnitLevels?)
    - SimInput deploy.level optional field
    - createWorld tower resolution via resolveTowerStats per side
    - spawnUnit stat resolution via resolveUnitStats from world level map
    - spawnAI stat resolution via resolveUnitStats from world.guestUnitLevels (landmine fix)
  affects:
    - plan 04 (PlacementScene passes level maps into CreateWorldOptions)
tech_stack:
  added: []
  patterns:
    - level-map carry on SimWorld (store once at createWorld, read at every spawn)
    - per-side resolver pattern (hostTowerStats/guestTowerStats before tower loop)
    - level-1-invariant (omit level fields = exact pre-P12 battle)
    - spawnAI landmine closed (def.hp/def.dmg replaced by resolveUnitStats)
key_files:
  created: []
  modified:
    - src/sim/types.ts
    - src/sim/world.ts
    - src/sim/step.ts
    - test/unit/sim/__snapshots__/snapshot.test.ts.snap
decisions:
  - "Removed unused TOWER_RANGE/TOWER_DMG/TOWER_CD imports from world.ts after tower-build loop replaced with resolveTowerStats; kept them in TowerData.ts for external callers (level-1-invariant depends on TOWER_DMG constant in other tests)"
  - "spawnUnit _events parameter typed as SimEvent[] | unknown (optional) to accept both the step.ts SimEvent[] array and the test's callback — parameter is unused so broadening the type has zero runtime impact"
  - "snapshot.test.ts.snap updated to include the four new level fields at their level-1 defaults — battle behavior is unchanged; snapshot now accurately reflects the extended SimWorld shape"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-14T14:11:43Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 12 Plan 03: Sim Level Injection (PROG-03) Summary

**One-liner:** Threaded per-side upgrade levels into the pure sim — `createWorld` resolves tower stats via `resolveTowerStats`, `spawnUnit` resolves unit stats via `resolveUnitStats` from world level maps, `spawnAI` landmine closed; sim-levels scaffold turns 5/5 GREEN with level-1-invariant preserved.

## What Was Built

### Task 1: Extend SimWorld + CreateWorldOptions + SimInput with level fields

Extended `src/sim/types.ts`:
- Added four fields to `SimWorld`: `hostUnitLevels: Record<string, number>`, `guestUnitLevels: Record<string, number>`, `hostTowerLevel: number`, `guestTowerLevel: number` (with doc comment: missing key = level 1 per D-15)
- Extended `SimInput` deploy variant with optional `level?: number` so existing callers compile unchanged

Extended `src/sim/world.ts`:
- Added four optional fields to `CreateWorldOptions`: `hostTowerLevel?`, `guestTowerLevel?`, `hostUnitLevels?`, `guestUnitLevels?`
- Populated four new fields in `createWorld` return object with `?? {}` / `?? 1` defaults

Result: `tsc --noEmit` clean; all existing callers unchanged (all new fields optional/defaulted).

### Task 2: Resolve tower + unit + AI stats from levels (createWorld, spawnUnit, spawnAI)

Modified `src/sim/world.ts`:
- Imported `resolveTowerStats` from `../towers/TowerData` and `resolveUnitStats` from `../units/UnitData`
- Removed now-unused flat `TOWER_RANGE`, `TOWER_DMG`, `TOWER_CD` imports (they are still exported from TowerData.ts for other callers)
- Tower-build loop now computes `hostTowerStats = resolveTowerStats(opts.hostTowerLevel ?? 1)` and `guestTowerStats = resolveTowerStats(opts.guestTowerLevel ?? 1)` and uses per-side stats for all 6 towers
- `spawnUnit` resolves `levelMap` from `world.hostUnitLevels` or `world.guestUnitLevels`; unit level = `input.level ?? levelMap[unitId] ?? 1`; `stats = resolveUnitStats(unitId, unitLevel)`; assigns `hp: stats.hp, maxHp: stats.hp, dmg: stats.dmg`; `speedPx`/`attackRate` stay flat per D-05
- `spawnUnit` signature updated to accept full `SimInput` deploy variant (with `type` field) and optional `_events` parameter

Modified `src/sim/step.ts`:
- Imported `resolveUnitStats` from `../units/UnitData`
- `spawnAI` landmine fixed: computes `aiLevel = world.guestUnitLevels[def.id] ?? 1` and `aiStats = resolveUnitStats(def.id, aiLevel)`; uses `aiStats.hp`/`aiStats.dmg` instead of `def.hp`/`def.dmg`
- In practice mode `guestUnitLevels = {}` so AI always resolves to level 1 (intended)
- `step()` signature unchanged

Updated `test/unit/sim/__snapshots__/snapshot.test.ts.snap`:
- Characterization snapshot updated to include the four new level fields at level-1 defaults (`hostUnitLevels:{}`, `guestUnitLevels:{}`, `hostTowerLevel:1`, `guestTowerLevel:1`)
- Battle values (gold, hp, unit counts, tower dmg at level 1) are identical — level-1-invariant confirmed

## Test Status

| Suite | File | Tests | Status |
|-------|------|-------|--------|
| sim-levels | test/unit/progression/sim-levels.test.ts | 5 | GREEN (was 3 RED + 2 GREEN) |
| sim snapshot | test/unit/sim/snapshot.test.ts | 1 | GREEN (snapshot updated) |
| all unit | all test/unit/**/*.test.ts | 94 | GREEN |

All 94 unit tests GREEN. sim-levels 5/5 GREEN.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| a671d48 | feat | Extend SimWorld/CreateWorldOptions/SimInput with level-map fields |
| 591f2e0 | feat | Resolve tower/unit/AI stats from levels; turn sim-levels GREEN |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused flat tower constant imports from world.ts**
- **Found during:** Task 2 (tsc check)
- **Issue:** After replacing tower-build loop with `resolveTowerStats`, `TOWER_RANGE`/`TOWER_DMG`/`TOWER_CD` became unused imports in `world.ts`. TypeScript would flag these as errors in strict mode.
- **Fix:** Removed the three constants from the `import` in `world.ts`. They remain exported from `TowerData.ts` for other callers (tests, scenes).
- **Files modified:** `src/sim/world.ts`
- **Commit:** 591f2e0

**2. [Rule 1 - Bug] Updated characterization snapshot to include new level fields**
- **Found during:** Task 2 (test run)
- **Issue:** `snapshot.test.ts` failed because `SimWorld` now serializes the four new level fields; the stored snapshot lacked them.
- **Fix:** Appended `"hostUnitLevels":{},"guestUnitLevels":{},"hostTowerLevel":1,"guestTowerLevel":1` to the snapshot. Battle state values are unchanged (level-1-invariant holds).
- **Files modified:** `test/unit/sim/__snapshots__/snapshot.test.ts.snap`
- **Commit:** 591f2e0

**3. [Rule 2 - Missing critical] Broadened spawnUnit _events parameter type**
- **Found during:** Task 2 (test compatibility review)
- **Issue:** The RED scaffold in `sim-levels.test.ts` calls `spawnUnit(world, input, () => events.push({}))` passing a function as the third argument. The existing `_events: SimEvent[]` type would cause a TypeScript error.
- **Fix:** Changed `_events` to `_events?: SimEvent[] | unknown`. Since the parameter is entirely unused in the function body (prefixed `_`), the type broadening has no runtime impact and correctly serves both call sites: `step.ts` passing `SimEvent[]` and the test passing a callback.
- **Files modified:** `src/sim/world.ts`
- **Commit:** 591f2e0

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. The `resolveUnitStats`/`resolveTowerStats` clamping (plan 01) guards against out-of-range levels (T-12-08 already mitigated).

## Known Stubs

None — all changes are pure sim logic with no UI rendering or data wiring stubs.

## Self-Check: PASSED

Files modified:
- [x] src/sim/types.ts — FOUND (modified, 4 level fields on SimWorld + deploy.level)
- [x] src/sim/world.ts — FOUND (modified, CreateWorldOptions + createWorld + spawnUnit)
- [x] src/sim/step.ts — FOUND (modified, spawnAI uses resolveUnitStats)
- [x] test/unit/sim/__snapshots__/snapshot.test.ts.snap — FOUND (updated)

Commits verified:
- [x] a671d48 — feat(12-03): extend SimWorld/CreateWorldOptions/SimInput...
- [x] 591f2e0 — feat(12-03): resolve tower/unit/AI stats from levels...

Sim purity verified:
- [x] `grep -rE "^import.*supabase|^import.*gameState" src/sim/` returns empty
