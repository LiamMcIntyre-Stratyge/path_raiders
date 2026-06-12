---
phase: 09-backend-foundations-integrity
plan: 01
subsystem: test-harness
tags: [vitest, testing, pathfinder, FND-04]
dependency_graph:
  requires: []
  provides: [vitest-harness, pathfinder-unit-tests]
  affects: [all-subsequent-09-plans]
tech_stack:
  added: [vitest@^4, jsdom@^29, "@vitest/coverage-v8@^4"]
  patterns: [two-project-vitest-config, separate-test-tsconfig]
key_files:
  created:
    - vitest.config.ts
    - tsconfig.test.json
    - test/unit/pathfinder.test.ts
  modified:
    - package.json
decisions:
  - Explicit vitest imports (no globals) in test files to avoid polluting prod tsc types (Pitfall 8)
  - Hand-built ROWS×COLS (16×22) grids for deterministic pathfinder tests (not real MAPS)
  - 'break_plant' overlay as the unreachability barrier for 'machines' faction test (wall is universally breakable)
metrics:
  duration: ~15min
  completed: 2026-06-12
  tasks_completed: 3
  files_created: 3
  files_modified: 1
---

# Phase 9 Plan 01: Vitest Harness + Pathfinder Tests Summary

Vitest two-project harness installed and wired; pathfinder pure-function tests green with 31 cases.

## What Was Built

**Task 1 — Install devDependencies:** Ran `npm install -D vitest@^4 jsdom @vitest/coverage-v8@^4`. Added `"test": "vitest run"` script to `package.json`. `@supabase/supabase-js` stays pinned at `^2.99.3`.

**Task 2 — Vitest config + test tsconfig:**
- `vitest.config.ts`: two-project config with a `unit` project (node env, `test/unit/**/*.test.ts`) and an `rls` project (jsdom env, `test/rls/**/*.test.ts`, `fileParallelism: false`)
- `tsconfig.test.json`: extends `./tsconfig.json`, adds `vitest/globals` to `compilerOptions.types`, includes `test/` and `vitest.config.ts` — prod `tsc` scope (`src` only) is unchanged

**Task 3 — Pathfinder unit tests:** 31 tests across three suites covering:
- `isWalkable`: wall/break_* overlays → false; base rows 0/1/14/15 → true regardless of terrain; base_zone overlay → true; path/bridge/cross terrain → true; open/rock terrain → false
- `canBreakWall`: wall → any faction; break_mach/plant/wiz → faction-gated; null/other overlay → false
- `findPath`: open corridor with path verification; unreachable goal returns `[]`; faction-gated breakable wall (reachable for matching faction, `[]` for non-matching); multiple goals; 4-adjacency invariant

## Must-Haves Status

| Truth | Status |
|-------|--------|
| Vitest harness exists and runs | PASS — `npx vitest run --project unit` exits 0 |
| Pathfinder pure functions have passing tests | PASS — 31 tests, all green |
| Unit project runs with zero network and sub-second | PASS — 231ms total, node env |
| Test files type-checked without polluting prod tsc | PASS — `tsconfig.test.json` scopes test types; `npx tsc --noEmit` still passes over `src/` |

| Artifact | Verified |
|----------|---------|
| `vitest.config.ts` has `projects` with `unit` + `rls` | PASS |
| `test/unit/pathfinder.test.ts` imports and tests `findPath` | PASS |
| `tsconfig.test.json` extends `./tsconfig.json` with `vitest/globals` | PASS |

| Key Link | Status |
|----------|--------|
| `test/unit/pathfinder.test.ts` → `src/lib/pathfinder` via `import { findPath, isWalkable, canBreakWall }` | PASS |
| `vitest.config.ts` → `test/unit` via include glob | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect "unreachable goal" test case**

- **Found during:** Task 3 verification (`npx vitest run --project unit` failed 1 test)
- **Issue:** The original test surrounded the goal with `'wall'` overlays, but `canBreakWall('wall', 'machines')` returns `true` — phase 2 BFS successfully broke through, so the path was not empty.
- **Fix:** Changed the barrier overlay to `'break_plant'` (machines cannot break these), making the goal genuinely unreachable for the `'machines'` faction under both BFS phases.
- **Files modified:** `test/unit/pathfinder.test.ts`
- **Commit:** ae8d45a (the fix was incorporated before the task commit)

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. Test files are excluded from prod bundle by `tsconfig.json` include staying `["src"]`.

## Known Stubs

None — all tests assert real behavior against the live `src/lib/pathfinder.ts` source.

## Self-Check: PASSED

- `vitest.config.ts` exists: FOUND
- `tsconfig.test.json` exists: FOUND
- `test/unit/pathfinder.test.ts` exists: FOUND
- Commit 7aa24c0: FOUND (chore: install devDeps)
- Commit e63b27f: FOUND (chore: vitest config + tsconfig)
- Commit ae8d45a: FOUND (feat: pathfinder unit tests)
