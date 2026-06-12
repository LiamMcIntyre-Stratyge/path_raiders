---
phase: 10-services-simulation-refactor
plan: 04
subsystem: state
tags: [gamestate, typescript, sim, cache, read-through, cleanup]

# Dependency graph
requires:
  - phase: 10-services-simulation-refactor
    plan: 02
    provides: src/sim/ pure core — SimWorld owns gold/hostBaseHp/guestBaseHp
  - phase: 10-services-simulation-refactor
    plan: 03
    provides: GameScene drives step() and reads all live battle state from this.world
provides:
  - src/types/index.ts — GameStateType slimmed to session + read-through profile cache (battle fields removed)
  - src/lib/gameState.ts — gameState singleton slimmed + documented as a cache, not the battle source
  - src/sim/world.ts — exported STARTING_GOLD constant (the starting-gold default, single source)
affects: [10-05, phase-11-accounts-economy, phase-14-determinism]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gameState is a session + read-through profile cache (D-14); SimWorld is the sole source of truth for live battle state (D-12)"
    - "Field removal from GameStateType is the compile-time enforcement — tsc surfaces every remaining battle write site (Pitfall 1)"
    - "STARTING_GOLD exported from src/sim/world.ts so pre-battle UI shows the default without reaching into gameState"
    - "recordResult write path through src/lib/api/account left unchanged (D-13 — authority move is Phase 11/14)"

key-files:
  created: []
  modified:
    - src/types/index.ts
    - src/lib/gameState.ts
    - src/sim/world.ts
    - src/scenes/GameScene.ts
    - src/scenes/LobbyScene.ts

key-decisions:
  - "init() no longer seeds world gold from gameState.gold — gold is omitted from createWorld so the world uses STARTING_GOLD; no cross-scene gold persistence is required (per plan, current behavior resets to default)"
  - "LobbyScene resources HUD switched from gameState.gold to the exported STARTING_GOLD constant — behavior-preserving (the lobby only ever showed the static 200 starting value; it never spent gold)"
  - "STARTING_GOLD added to src/sim/world.ts (not a new module) as the single source for the gold default, consumed by both createWorld and the lobby display"

requirements-completed: [BATTLE-02]

# Metrics
duration: 6min
completed: 2026-06-12
---

# Phase 10 Plan 04: gameState Reduction Summary

**`gameState` is now a documented session + read-through profile cache: the four live-battle/dead fields (`hostBaseHp`, `guestBaseHp`, `gold`, `gameMode`) are removed from `GameStateType` and the singleton, making the sim `SimWorld` the sole source of truth for live battle state (D-12/D-14) — with the persistent profile fields still hydrated via the unchanged `src/lib/api/account` seam (D-13).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-12T13:03:30Z
- **Completed:** 2026-06-12T13:09:01Z
- **Tasks:** 2 (committed as one atomic commit per plan)
- **Files modified:** 5

## Accomplishments
- **Removed the four fields from `GameStateType` (D-12/D-14):** deleted `hostBaseHp`, `guestBaseHp`, `gold`, and the dead `gameMode` from `src/types/index.ts`. Added a doc-comment marking the interface a session + read-through profile cache — live battle state lives on `SimWorld`; persistent fields hydrate via `src/lib/api/account`; the rest is session context carried across the scene handoff.
- **Slimmed the `gameState` singleton (`src/lib/gameState.ts`):** dropped the matching `hostBaseHp: 1000`, `guestBaseHp: 1000`, `gold: 200`, `gameMode: 'topdown'` initializers and added the same cache doc-comment. Session + profile fields (`userId`, `username`, `unlockedUnits`, `loadout`, `wins`, `losses`, `roomId`, `role`, `mapId`, `hostSlot`, `guestSlot`) preserved intact.
- **Fixed every surfaced write/read site via tsc (Pitfall 1):** removing `gold` from the type surfaced two remaining `gameState.gold` consumers — `GameScene.init` (the `createWorld` seed) and the `LobbyScene` resources HUD. Both fixed; `npx tsc --noEmit` returns to 0.
- **`init()` handoff to the sim cleaned up (Q5):** dropped `gold: gameState.gold` from the `createWorld({...})` call so the world seeds the `STARTING_GOLD` default; no cross-scene gold persistence is required (current behavior resets to default each battle). The roomId/role/playerFaction/mapId/slots handoff into `gameState` is preserved unchanged.
- **`STARTING_GOLD` exported from `src/sim/world.ts`:** the single source for the gold default, consumed by `createWorld` (`opts.gold ?? STARTING_GOLD`) and the lobby display so pre-battle UI shows the starting value without reaching into `gameState`.
- **D-13 untouched:** `recordMatchResult` (via `src/lib/api/account`) write path is byte-for-byte unchanged — authority stays client-side this phase.

## Task Commits

Tasks 1 and 2 form a single atomic commit (per the plan: the intermediate post-Task-1 tsc-broken state is never committed standalone):

1. **Task 1 + Task 2: slim GameStateType/gameState + repoint surfaced sites to world** — `bbceeb6` (refactor)

## Files Created/Modified
- `src/types/index.ts` (modified) — `GameStateType` slimmed (4 fields removed) + cache doc-comment.
- `src/lib/gameState.ts` (modified) — singleton slimmed (4 initializers removed) + cache doc-comment.
- `src/sim/world.ts` (modified) — added exported `STARTING_GOLD` constant; `createWorld` default now references it.
- `src/scenes/GameScene.ts` (modified) — `init()` no longer seeds `gold` from `gameState.gold` (world uses `STARTING_GOLD`); handoff preserved.
- `src/scenes/LobbyScene.ts` (modified) — resources HUD shows `STARTING_GOLD` instead of `gameState.gold`; import added.

## Decisions Made
- **`init()` drops the `gameState.gold` → world seed** — the plan states no cross-scene gold persistence is required (current behavior resets to the default each battle), so `gold` is omitted from `createWorld` and the world seeds `STARTING_GOLD`.
- **`LobbyScene` switched to `STARTING_GOLD`** — the lobby resources bar only ever displayed the static 200 starting value (the lobby never spends gold), so substituting the exported constant is behavior-preserving and removes the last `gameState.gold` reference outside the sim.
- **`STARTING_GOLD` lives in `src/sim/world.ts`** (not a new module) — the world already owns the gold default; exporting it keeps a single source for both the factory and the pre-battle UI.

## Deviations from Plan

**1. [Rule 3 - Blocking] Second `gameState.gold` consumer surfaced in LobbyScene**
- **Found during:** Task 2
- **Issue:** The plan's interface notes listed the GameScene battle sites, but removing `gold` from `GameStateType` also surfaced a `gameState.gold` read in `src/scenes/LobbyScene.ts:146` (the lobby resources HUD) — a tsc error blocking the build.
- **Fix:** Added an exported `STARTING_GOLD` constant to `src/sim/world.ts` and pointed both the lobby HUD and the `createWorld` default at it. The lobby always showed the static 200 starting value, so this is behavior-preserving.
- **Files modified:** src/sim/world.ts, src/scenes/LobbyScene.ts
- **Commit:** see Task Commits hash below

## Authentication Gates

None.

## Issues Encountered
- `npx tsc --noEmit -p tsconfig.json` exits 0; `npx vitest run --project unit` → **38 passed (3 files)**. The single pre-existing `test/rls/wallet-rls.test.ts` failure (no local Supabase/Docker, documented Phase 9 environmental gap) is unrelated to this plan and was not run by the `unit` project gate.

## Known Stubs
None — this is a pure field-removal/repointing plan. No placeholder data, no TODO stubs. `gameState` is now a clean session/profile cache; the sim world owns all live battle state.

## Threat Flags
None — pure in-memory state relocation. No new network endpoints, auth paths, file access, or schema surface. The `recordResult`/`recordMatchResult` trust boundary (T-10-04-01) is unchanged (disposition: accept). `gameState` holds only the player's own session/profile fields (T-10-04-02, accept); slimming removes battle fields and exposes no new data.

## Next Phase Readiness
- **ROADMAP SC#3 complete:** `gameState` is reduced to a session/battle read-through cache; persistent fields read through `src/lib/api/`; battle state is no longer mutated ad hoc on `gameState`. D-12, D-13, D-14 all implemented.
- **Plan 05** adds the remaining sim tests (win/wall-break/snapshot, D-15/D-17) and runs the manual two-session parity playtest (D-16) — the only gate left before "no player-visible change" is confirmed.
- **Phase 11 (accounts & economy)** can now build on the read-through `gameState` + the `recordResult`-authority handoff (D-13): the slimmed cache is the shape it expected, and moving result/economy writes server-side is its own scope.

## Self-Check: PASSED

- `src/types/index.ts`, `src/lib/gameState.ts`, `src/sim/world.ts`, `src/scenes/GameScene.ts`, `src/scenes/LobbyScene.ts` all modified (verified on disk).
- `npx tsc --noEmit -p tsconfig.json` exits 0; `npx vitest run --project unit` → 38 passed.
- Acceptance greps verified: zero `gameState.{gold,hostBaseHp,guestBaseHp,gameMode}` references in `src/`; zero `private gold/hostBaseHP/guestBaseHP` scalar fields on GameScene; `recordMatchResult` call path present; GameScene.init still writes roomId/role/playerFaction/mapId/slots into gameState.

---
*Phase: 10-services-simulation-refactor*
*Completed: 2026-06-12*
