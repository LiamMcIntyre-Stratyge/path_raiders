---
phase: 12-progression-upgrades
plan: "01"
subsystem: progression-foundation
tags: [progression, stat-resolver, clamp-guard, tdd, wave-0-scaffolds]
dependency_graph:
  requires: []
  provides:
    - resolveUnitStats (src/units/UnitData.ts)
    - resolveTowerStats (src/towers/TowerData.ts)
    - clampLevels (src/lib/progression/clamp.ts)
    - UNIT_LEVELS, MAX_UNIT_LEVEL, BALANCE_VERSION, UPGRADE_COSTS (UnitData.ts)
    - TOWER_LEVELS, MAX_TOWER_LEVEL, BALANCE_VERSION (TowerData.ts)
  affects:
    - plan 02 (upgrades-rls scaffold awaiting upgrade_spend RPC + upgrades table)
    - plan 03 (sim-levels scaffold awaiting createWorld/spawnUnit level injection)
tech_stack:
  added: []
  patterns:
    - pure-data-module extension (parallel flat→per-level arrays in UnitData/TowerData)
    - pure-utility-module (clamp.ts mirrors sideHelper.ts style)
    - level-1 invariant test (locks level-1 === flat baseline via UNITS iteration)
    - Wave-0 RED scaffold (sim-levels + upgrades-rls await later plans)
key_files:
  created:
    - src/lib/progression/clamp.ts
    - test/unit/progression/resolver.test.ts
    - test/unit/progression/clamp.test.ts
    - test/unit/progression/sim-levels.test.ts
    - test/rls/upgrades-rls.test.ts
  modified:
    - src/units/UnitData.ts
    - src/towers/TowerData.ts
decisions:
  - "Import paths in src/lib/progression/clamp.ts use ../../units and ../../towers (not ../), because clamp.ts is two directory levels below src/"
metrics:
  duration: "~7 minutes"
  completed: "2026-06-14T06:05:53Z"
  tasks_completed: 3
  files_changed: 7
---

# Phase 12 Plan 01: Progression Foundation (Per-Level Tables, Resolvers, clampLevels, Wave-0 Scaffolds) Summary

**One-liner:** Pure progression foundation — per-level stat arrays + `resolveUnitStats`/`resolveTowerStats` resolvers + `clampLevels` guard; all with the level-1 invariant locked by TDD and two Wave-0 RED scaffolds laid for plans 02/03.

## What Was Built

### Task 1: Per-Level Stat Tables + Resolvers + Resolver Tests (GREEN)

Extended `src/units/UnitData.ts` (appended after `UNIT_FACTION`):
- `BALANCE_VERSION = 1` (D-07 cache-key seam)
- `UnitLevelStats` interface (`hp`, `dmg`; `speedPx`/`attackRate` excluded per D-05)
- `MAX_UNIT_LEVEL = 5` (D-10)
- `UNIT_LEVELS`: per-level arrays for all 6 unit ids, index-0 equals flat `UNITS` baseline (level-1 invariant)
- `resolveUnitStats(unitId, level)`: clamps level, falls back to flat `UNITS` for unknown ids
- `UPGRADE_COSTS`: display-only mirror (`{unit: {2:75,3:150,4:300,5:600}, tower: {2:100,3:200,4:400,5:800}}`), per D-03/D-13

Extended `src/towers/TowerData.ts` (appended after `TOWER_DEF`):
- `BALANCE_VERSION = 1`
- `TowerLevelStats` interface (`dmg`, `range`, `maxCd` — all 3 authored per level per D-06)
- `MAX_TOWER_LEVEL = 5`
- `TOWER_LEVELS`: 5-entry array, dmg curve 25/32/41/52/65, range/maxCd held constant (D-02)
- `resolveTowerStats(level)`: clamping resolver

`test/unit/progression/resolver.test.ts`: 20 tests GREEN covering level-1 invariant for all 6 units + tower, array lengths, out-of-range clamping, unknown-id fallback, BALANCE_VERSION, UPGRADE_COSTS escalation.

### Task 2: clampLevels Guard + Clamp Tests (GREEN)

Created `src/lib/progression/clamp.ts`:
- Zero Phaser/Supabase imports (sim-purity D-12)
- Imports `MAX_UNIT_LEVEL` from `../../units/UnitData` and `MAX_TOWER_LEVEL` from `../../towers/TowerData`
- `KNOWN_UNIT_IDS` Set of 6 unit ids
- `clampLevels(rawUnitLevels, rawTowerLevel)`: clamps unit levels to `[1, MAX_UNIT_LEVEL]`, floors non-integers, drops unknown ids, clamps tower level

`test/unit/progression/clamp.test.ts`: 11 tests GREEN covering all D-12 behaviors.

### Task 3: Wave-0 RED Scaffolds (sim-levels RED, upgrades-rls RED)

`test/unit/progression/sim-levels.test.ts`: 5 tests, 3 RED (hostTowerLevel=3 dmg, spawnUnit level=2 hp/dmg, guestTowerLevel=5 dmg). These reference `hostTowerLevel`/`guestTowerLevel`/`hostUnitLevels` fields that plan 03 adds to `CreateWorldOptions`. 2 tests pass (baseline level-1 behavior already correct). Uses `@ts-expect-error` to suppress TS errors on the not-yet-added fields.

`test/rls/upgrades-rls.test.ts`: 8 tests all RED (reference `upgrades` table and `upgrade_spend` RPC that plan 02 creates). Covers: forged INSERT deny, owned upgrade, insufficient_funds, unowned unit D-16, unknown unit id, max-level reject (5→6), concurrent deduct-exactly-once (PROG-04), tower scope PROG-02.

## Test Status

| Suite | File | Tests | Status |
|-------|------|-------|--------|
| resolver | test/unit/progression/resolver.test.ts | 20 | GREEN |
| clamp | test/unit/progression/clamp.test.ts | 11 | GREEN |
| sim-levels | test/unit/progression/sim-levels.test.ts | 5 (2 pass, 3 fail) | RED (expected) |
| upgrades-rls | test/rls/upgrades-rls.test.ts | 8 | RED (awaits plan 02) |
| pre-existing unit suite | all other test/unit/**/*.test.ts | 58 | GREEN (unchanged) |

Total unit tests: 89 GREEN, 3 RED (sim-levels scaffold; expected until plan 03).

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 008ef00 | feat | Per-level stat tables, resolvers, BALANCE_VERSION, UPGRADE_COSTS + resolver tests GREEN |
| fbb19b0 | feat | clampLevels pure guard + clamp tests GREEN |
| e82516c | test | Wave-0 RED scaffolds for sim-levels (plan 03) and upgrades-rls (plan 02) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed import paths in clamp.ts**
- **Found during:** Task 2 (first test run)
- **Issue:** Plan's `12-PATTERNS.md` showed `import { MAX_UNIT_LEVEL } from '../units/UnitData'` — relative to `src/lib/`, but `clamp.ts` lives in `src/lib/progression/` (one level deeper), so `../units/` would resolve to `src/lib/units/` (nonexistent)
- **Fix:** Changed to `../../units/UnitData` and `../../towers/TowerData`
- **Files modified:** `src/lib/progression/clamp.ts`
- **Commit:** fbb19b0

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced in this plan (all files are pure data modules and test files).

## Known Stubs

None — all source files added are pure data/utility with no UI rendering or data wiring stubs.

## Self-Check: PASSED

Files created/modified:
- [x] src/units/UnitData.ts — FOUND (modified)
- [x] src/towers/TowerData.ts — FOUND (modified)
- [x] src/lib/progression/clamp.ts — FOUND (created)
- [x] test/unit/progression/resolver.test.ts — FOUND (created)
- [x] test/unit/progression/clamp.test.ts — FOUND (created)
- [x] test/unit/progression/sim-levels.test.ts — FOUND (created)
- [x] test/rls/upgrades-rls.test.ts — FOUND (created)

Commits verified:
- [x] 008ef00 — feat(12-01): add per-level stat tables...
- [x] fbb19b0 — feat(12-01): add clampLevels pure guard...
- [x] e82516c — test(12-01): author Wave-0 RED scaffolds...
