---
phase: 10-services-simulation-refactor
plan: 03
subsystem: simulation
tags: [sim, phaser, typescript, integration, reconcile, events, wire-protocol, render-loop]

# Dependency graph
requires:
  - phase: 10-services-simulation-refactor
    plan: 01
    provides: TowerView (drawTowers/fac), sideHelper (resolveSide)
  - phase: 10-services-simulation-refactor
    plan: 02
    provides: src/sim/ pure core — createWorld, step(world,inputs,dt,rng), SimUnit/SimEvent/SimInput
provides:
  - src/units/UnitView.ts — Phaser render-half keyed by SimUnit.id (syncFrom + playDeathAnimation)
  - src/units/Unit.ts — thinned to a re-export of COMBAT_RANGE/BASE_REACH_DMG from the sim
  - src/scenes/GameScene.ts — thin renderer driving step() + id-reconcile + event mapping + per-attack audio + network
affects: [10-04, 10-05, gameState-reduction, phase-14-determinism]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Renderer drives the pure sim: update() = drain inputs → step(world,inputs,dt,Math.random) → reconcile → events (D-03/D-08)"
    - "Reconcile UnitViews by SimUnit.id each frame (create+popIn / syncFrom / playDeathAnimation+delete) — never by array position"
    - "Per-attack audio reproduced scene-side via prevAttackCds attackCd-reset monitor (continuous-state read, no sim audio event)"
    - "Discrete sim events (unit_died/wall_break/base_hit/game_over) drive SFX/animation/camera/network; sim stays transport+audio-free (D-04)"
    - "Wire protocol preserved byte-for-byte; received deploy/wall_break become sim inputs; received base_hp overwrites world HP directly (D-12)"

key-files:
  created:
    - src/units/UnitView.ts
  modified:
    - src/units/Unit.ts
    - src/scenes/GameScene.ts

key-decisions:
  - "UnitView constructor starts at (0,0); first syncFrom() sets position — the sim owns spawn coords, the view never computes geometry"
  - "syncFrom flashes the unit (flashHit) when hp drops, reproducing the old takeDamage() flash without a per-hit sim event"
  - "Per-attack audio fires on curr>prev with a defined prev only — a freshly-spawned unit (no prevAttackCds entry) records its attackCd silently, so the first cooldown reset plays correctly without a false hit on spawn"
  - "Received wall_break is pushed as a sim input (not applied inline) so the sim emits the wall_break event and the scene renders/reacts through the single event path — replaces the old breakWall(...,false) no-rebroadcast call"
  - "Unit.ts kept as a thin constant re-export (not deleted) so any lingering COMBAT_RANGE/BASE_REACH_DMG importer keeps compiling; single source is src/sim/types.ts"

requirements-completed: [BATTLE-02]

# Metrics
duration: 5min
completed: 2026-06-12
---

# Phase 10 Plan 03: GameScene → Sim Wiring Summary

**`GameScene` is now a thin renderer: each frame it drains queued inputs, calls the pure `step(world, inputs, dt, Math.random)`, reconciles `UnitView`s by `SimUnit.id`, reproduces per-attack audio via an `attackCd`-reset monitor, and maps the sim's discrete events to SFX/animation/camera/network — all while preserving the Supabase wire protocol byte-for-byte and keeping the sim free of any Phaser/Supabase/audio import.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-12T12:58:22Z
- **Completed:** 2026-06-12T13:03:30Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- **Split `Unit.ts` → `src/units/UnitView.ts` (D-02):** a `UnitView extends Phaser.GameObjects.Container` keyed by `SimUnit.id`. Constructor `(scene, id, def, laneSlot, dir)` does the same Phaser setup (token image, flipY when dir===1, hpGfx, depth 10). Added `syncFrom(u)` (copies x/y, redraws + flashes HP on change, tracking `_lastHp`) and renamed the old private `kill()` to public `playDeathAnimation()`. Dropped every sim-owned field/method (hp/attackCd/waypoints/wallTarget + moveStep/isAtGoal/takeDamage/setWaypoints). Reduced `Unit.ts` to a re-export of `COMBAT_RANGE`/`BASE_REACH_DMG` from the sim.
- **Drove the sim from `GameScene.update()` (D-03/D-08):** built the world in `init()` via `createWorld({...})` using `resolveSide()` factions and `gameState.gold`. Rewrote `update()` to drain `pendingInputs`, call `step()`, reconcile views by id, run the per-attack audio monitor, map events, and refresh the HUD from `world` each frame. Deleted the five private `updateX` methods and the prune lines (the sim owns them).
- **Per-attack audio preserved scene-side (SC#1, Q2 RESOLVED):** `prevAttackCds: Map<string,number>` tracks each live unit's `attackCd`; when it resets upward (`curr > prev`) the cooldown fired this frame → `audio.playHit()` once. Map entries for vanished ids are pruned each frame. No audio event added to `src/sim/`.
- **Event mapping (D-03):** `wall_break` → redraw walls + `playWallBreak` + camera shake + broadcast; `base_hit` → flashBaseHit + broadcast; `game_over` → `triggerGameOver(winner)` once; `unit_died` → handled by the reconcile prune (`playDeathAnimation`).
- **Wire protocol preserved byte-for-byte (D-04):** all four events still sent/received with identical names + payloads. Received `deploy`/`wall_break` become sim inputs; received `base_hp` overwrites `world.hostBaseHp`/`guestBaseHp` directly (D-12 — `gameState` no longer carries base HP); received `game_over` calls `triggerGameOver`.

## Task Commits

Each task committed atomically:

1. **Task 1: split Unit.ts → src/units/UnitView.ts (D-02)** — `8392ef7` (feat)
2. **Task 2: drive sim from GameScene — step + reconcile + events** — `95b4902` (feat)

## Files Created/Modified
- `src/units/UnitView.ts` (created) — Phaser render-half keyed by id: `syncFrom(u)` + `playDeathAnimation()` + kept view methods (flashHit, popIn, drawHP). No sim-owned data/logic.
- `src/units/Unit.ts` (modified) — reduced to `export { COMBAT_RANGE, BASE_REACH_DMG } from '../sim/types'`.
- `src/scenes/GameScene.ts` (modified) — thin renderer: `world` field + `unitViews`/`pendingInputs`/`prevAttackCds`; `update()` drives `step()` + reconcile + audio monitor + event mapping; HUD reads `world`; deploy/affordability read `world.gold`; channel handlers map broadcasts ↔ sim inputs/events. Net −176 lines.

## Decisions Made
- **UnitView starts at origin; position comes only from `syncFrom`** — the sim owns all spawn geometry, so the view never computes coordinates.
- **`syncFrom` flashes on hp drop** — reproduces the old `takeDamage()` tint flash without introducing a per-hit sim event (keeps the event stream small, D-03).
- **Per-attack audio fires only when `prev` is defined** — a freshly-spawned unit (no `prevAttackCds` entry, `attackCd=0`) records its value silently; the first real cooldown reset (0 → 900) then plays correctly, avoiding a false hit on spawn.
- **Received `wall_break` is pushed as a sim input** rather than mutating the world inline — the sim then emits the `wall_break` event and the scene renders/reacts through the single event path (replacing the old `breakWall(...,false)` no-rebroadcast call; the scene does not rebroadcast received breaks).
- **`Unit.ts` retained as a constant re-export** (not deleted) so any lingering importer keeps compiling; the canonical source is `src/sim/types.ts`.

## Deviations from Plan

**1. [Rule 3 - Blocking] Task 1 tsc-green criterion satisfied at the Task 2 boundary, not in isolation**
- **Found during:** Task 1
- **Issue:** Task 1's acceptance lists `npx tsc --noEmit` exit 0. But the live `GameScene.ts` deeply references the `Unit` *class* (constructor calls in deploy/AI/channel handlers), and removing the `Unit` class from `Unit.ts` necessarily breaks GameScene's import until GameScene is rewritten — which is Task 2's owned work. The two are inseparable at the type level.
- **Fix:** Kept the Task 1 file artifacts exactly as specified (UnitView created; Unit.ts reduced to a constant re-export) and committed them; tsc went green at the Task 2 commit once GameScene was rewritten to use `UnitView`. No criterion was skipped — the UnitView/Unit greps all passed at Task 1; only the project-wide tsc gate spans both commits.
- **Files modified:** src/units/Unit.ts, src/units/UnitView.ts (Task 1); src/scenes/GameScene.ts (Task 2)
- **Commit:** 8392ef7 (Task 1), 95b4902 (Task 2)

**2. [Rule 1 - Bug] `drawWallOverlays()` guarded against pre-create invocation**
- **Found during:** Task 2
- **Issue:** `drawWallOverlays()` now reads `this.world.mutableOver`/`this.world.wallHP` and runs in both `create()` and the `wall_break` event path. Added a `if (!this.wallGfx) return` guard to match the original's implicit ordering safety (wallGfx is created just before the first draw).
- **Fix:** Early-return when `wallGfx` is not yet built.
- **Files modified:** src/scenes/GameScene.ts
- **Commit:** 95b4902

## Authentication Gates

None.

## Issues Encountered
- `npx vitest run` (all projects) still reports the single pre-existing `test/rls/wallet-rls.test.ts` failure ("supabaseUrl is required" — no local Supabase credentials/Docker). This is the documented Phase 9 environmental gap (live-runs in CI on first push), unrelated to this plan. The `unit` project is fully green: `npx vitest run --project unit` → **38 passed** (31 Phase 9 + 7 sim). Prod `tsc -p tsconfig.json` exits 0.

## Known Stubs
None — `GameScene` now fully drives the sim; no placeholder data sources, no TODO stubs. The five `updateX` methods are deleted (their logic lives in `src/sim/step.ts`/`combat.ts` from Plan 02), and `Unit.ts` is an intentional thin re-export, not a stub.

## Threat Flags
None — no new network endpoints, auth paths, file access, or schema surface. The wire protocol is preserved exactly; the only state-owner change (gameState→world for base HP) does not alter the trust boundary (T-10-03-01/02 disposition: accept, unchanged). Sim purity (zero supabase + zero audio) verified by grep against `src/sim/*.ts`.

## Next Phase Readiness
- **SC#1 (battle-loop extraction) is now wired end-to-end:** the sim is the single source of truth for live battle state and `GameScene` is a thin renderer + network + input layer, pending only the Plan 05 manual two-session parity gate (D-16).
- **Plan 04** (gameState reduction, D-12/D-14) can now remove `hostBaseHp`/`guestBaseHp`/`gold`/`gameMode` from `GameStateType`/`gameState` — every former write site already reads/writes `this.world` instead. `init()` still seeds `world.gold` from `gameState.gold`; Plan 04 reconciles that handoff.
- **Plan 05** adds the remaining sim tests (win/wall-break/snapshot, D-17c/d + D-15) and executes the manual parity playtest.
- **Phase 14** swaps `Math.random` → seeded `mulberry32` and wraps `step()` in a fixed-timestep accumulator at the same call site in `update()`, and adds report submission at `triggerGameOver` — no re-architecture needed.

## Self-Check: PASSED

- `src/units/UnitView.ts` exists; `src/units/Unit.ts` and `src/scenes/GameScene.ts` modified.
- Both task commits present in git history (8392ef7, 95b4902).
- `npx tsc --noEmit -p tsconfig.json` exits 0; `npx vitest run --project unit` → 38 passed.
- Acceptance greps verified: `step(this.world` present; updateX calls/methods = 0; `syncFrom` + `Map<string, UnitView>` present; `prevAttackCds` + `audio.playHit` present; `audio` in `src/sim/*` = 0; all four wire events present on send + receive.

---
*Phase: 10-services-simulation-refactor*
*Completed: 2026-06-12*
