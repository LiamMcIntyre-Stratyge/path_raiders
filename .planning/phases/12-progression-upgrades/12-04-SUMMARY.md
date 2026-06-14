---
phase: 12-progression-upgrades
plan: "04"
subsystem: scene-wiring
status: "implemented — blocking checkpoint pending"
tags: [progression, placement, loadout, game-scene, upgrade-screen, wave-2]
dependency_graph:
  requires:
    - getOwnLevels / upgradeSpend (src/lib/api/progression.ts) — plan 02
    - clampLevels (src/lib/progression/clamp.ts) — plan 01
    - resolveUnitStats / UPGRADE_COSTS (src/units/UnitData.ts) — plan 01
    - resolveTowerStats (src/towers/TowerData.ts) — plan 01
    - createWorld level fields (src/sim/world.ts) — plan 03
  provides:
    - Level broadcast + clamp in PlacementScene (D-11/D-12)
    - Level pass-through PlacementScene → LoadoutScene → GameScene → createWorld
    - Level-resolved stat display in LoadoutScene card template
    - UpgradeScene data binding (PROG-01/02 UI)
  affects:
    - task 3 (blocking human checkpoint — NOT yet attempted)
tech_stack:
  added: []
  patterns:
    - additive channel event ('loadout' alongside existing 'slot_pick' — P10 D-04 preserved)
    - async SUBSCRIBED handler for getOwnLevels before loadout broadcast
    - levelsReceived gate in checkBothReady (Pitfall 4 — levels resolved before scene transition)
    - practice branch async confirm (getOwnLevels before launchGame; AI stays level 1)
    - LaunchParams/GameSceneData four optional level fields threaded via scene.start data
    - resolveUnitStats in card template (Pitfall 6 fix)
    - UpgradeScene: ProfileScene data-binding pattern (loadAndRender + render + wirebacks)
key_files:
  created:
    - src/scenes/UpgradeScene.ts
  modified:
    - src/scenes/PlacementScene.ts
    - src/scenes/LoadoutScene.ts
    - src/scenes/GameScene.ts
    - src/main.ts
    - src/scenes/LobbyScene.ts
decisions:
  - "Added 'loadout' as a NEW additive broadcast event on placement channel — slot_pick preserved byte-for-byte (P10 D-04 wire protocol)"
  - "subscribe() callback made async to await getOwnLevels before broadcasting — Supabase realtime allows async subscribe callbacks"
  - "Practice confirm branch refactored to async IIFE to await getOwnLevels before launchGame (no channel in practice)"
  - "UPGRADE_COSTS.tower sourced from UnitData.ts (single unified mirror for both unit+tower tracks) — TowerData.ts has no UPGRADE_COSTS export"
  - "UpgradeScene wired via lobby-settings button (was a stub); UpgradeScene back button returns to LobbyScene"
  - "LoadoutScene params guard: ownRole from this.params?.role falling back to gameState.role to handle edge case of params not yet set during buildUI"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-14"
  tasks_completed: 2
  files_changed: 6
---

# Phase 12 Plan 04: Scene Wiring (PROG-03 + PROG-01/02 UI) Summary

**One-liner:** Wired progression end-to-end through the UI — PlacementScene exchanges + clamps levels over the existing channel, threads them through LoadoutScene into GameScene.createWorld, LoadoutScene shows effective (level-resolved) stats, and UpgradeScene binds all three data surfaces (getOwnLevels/getBalance/getOwnedUnits) to the spend-to-upgrade flow. Task 3 (two-client parity gate) is pending human verification.

## What Was Built

### Task 1: Level exchange + clamp in PlacementScene; thread levels to createWorld (DONE)

Modified `src/scenes/PlacementScene.ts`:
- Imported `getOwnLevels`, `OwnLevels` from `../lib/api/progression` and `clampLevels` from `../lib/progression/clamp`
- Added four private fields: `ownLevels`, `opponentUnitLevels`, `opponentTowerLevel`, `levelsReceived`; all reset in `init()`
- `setupChannel` SUBSCRIBED handler made async: awaits `getOwnLevels(userId)`, stores `this.ownLevels`, broadcasts additive `loadout` event with `{ role, unitLevels, towerLevel }` — `slot_pick` untouched (P10 D-04 wire preservation)
- Added `.on('broadcast', { event: 'loadout' }, ...)` receiver: ignores own-role echo, calls `clampLevels(p.unitLevels, p.towerLevel)` (D-12), stores clamped opponent levels, sets `levelsReceived = true`, calls `checkBothReady()`
- `checkBothReady`: added `levelsReceived` gate for multiplayer (Pitfall 4 — levels resolved before transition)
- `launchGame`: computes `hostUnitLevels/guestUnitLevels/hostTowerLevel/guestTowerLevel` by role mapping (own vs opponent); passes four level fields into `this.scene.start('LoadoutScene', {...})`
- Practice branch confirm: refactored to async IIFE to await `getOwnLevels(userId)` before `launchGame()`; `opponentUnitLevels = {}` / `opponentTowerLevel = 1` (AI always base stats — RESEARCH Focus Area 1)

Modified `src/scenes/LoadoutScene.ts`:
- Imported `resolveUnitStats` from `../units/UnitData`
- Added four optional level fields (`hostUnitLevels?`, `guestUnitLevels?`, `hostTowerLevel?`, `guestTowerLevel?`) to `LaunchParams` interface
- Replaced flat `u.hp`/`u.dmg` in card template with `resolveUnitStats(u.id, ownMap?.[u.id] ?? 1)` using role-derived level map (Pitfall 6 fix)
- Levels pass through `this.scene.start('GameScene', this.params)` verbatim — no further change needed here

Modified `src/scenes/GameScene.ts`:
- Added four optional level fields to `GameSceneData` interface
- In `createWorld({...})` call: passes `hostUnitLevels: data?.hostUnitLevels ?? {}`, `guestUnitLevels: data?.guestUnitLevels ?? {}`, `hostTowerLevel: data?.hostTowerLevel ?? 1`, `guestTowerLevel: data?.guestTowerLevel ?? 1`
- `game:${roomId}` battle wire protocol untouched (P10 D-04)

### Task 2: LoadoutScene level-resolved stat display + UpgradeScene data binding (DONE)

`src/scenes/LoadoutScene.ts` — see Task 1 above (stat fix also covered there).

Created `src/scenes/UpgradeScene.ts` (NEW):
- Follows ProfileScene data-binding pattern: `create()` → `loadAndRender()` → `render()`
- On entry: `getOwnLevels(userId)` + `getBalance(userId)` + `getOwnedUnits(userId)` loaded in parallel
- Renders per-unit upgrade card for all 6 units (cross-faction):
  - Current level, current HP+DMG stats via `resolveUnitStats`
  - Next-level HP/DMG delta preview via `resolveUnitStats(id, curLevel+1)`
  - Next-level cost from `UPGRADE_COSTS.unit[curLevel+1]` (display mirror only — D-03)
  - Ownership guard (D-16): non-owned units show "UNLOCK FIRST" — button absent
  - Max-level guard: at level 5 shows "MAX LEVEL" — button absent
  - Can't-afford styling when balance < next cost
- Renders tower track card:
  - Current level, current DMG via `resolveTowerStats`, delta preview, `UPGRADE_COSTS.tower[level+1]`
  - Max-level guard at level 5
- Spend handler: optimistic disable → `upgradeSpend(scope, targetId)` → on `ok` refresh screen; on `ok:false` show reason string; on error show message; re-enable button
- Back button navigates to LobbyScene

Modified `src/main.ts`:
- Registered `UpgradeScene` in Phaser scene array

Modified `src/scenes/LobbyScene.ts`:
- Wired `lobby-settings` button (was stub) to `this.scene.start('UpgradeScene')`

### Task 3: Two-client parity gate + upgrade-screen verification (PENDING — blocking checkpoint)

NOT attempted. Requires live two-client session against the remote DB. See checkpoint section below.

## Test Status

| Suite | Tests | Status |
|-------|-------|--------|
| unit (all) | 94 | GREEN |
| rls | not run (blocked on remote createUser DB error — known from Plan 11-04) | N/A |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 637a371 | feat | Level exchange + clamp in PlacementScene; thread to createWorld |
| aa4f0cb | feat | LoadoutScene level-resolved stat display + UpgradeScene data binding |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `supabase` import from UpgradeScene.ts**
- **Found during:** Task 2 (tsc check)
- **Issue:** Imported `supabase` to call `supabase.auth.getUser()` but the auth guard uses `gameState.userId` instead (consistent with ProfileScene pattern)
- **Fix:** Removed the unused import; `gameState.userId` is the auth gate
- **Files modified:** `src/scenes/UpgradeScene.ts`
- **Commit:** aa4f0cb

**2. [Rule 3 - Blocking] TowerData.ts has no UPGRADE_COSTS export — sourced from UnitData instead**
- **Found during:** Task 2 (tsc check)
- **Issue:** PATTERNS.md suggested `UPGRADE_COSTS.tower` might be in TowerData.ts, but it is not; the unified mirror for both unit and tower costs lives entirely in `UnitData.ts::UPGRADE_COSTS`
- **Fix:** Removed `UPGRADE_COSTS as TOWER_UPGRADE_COSTS` import from TowerData.ts; used `UPGRADE_COSTS.tower` from UnitData import instead (already imported)
- **Files modified:** `src/scenes/UpgradeScene.ts`
- **Commit:** aa4f0cb

## Blocking Checkpoint (Task 3)

**Status:** NOT ATTEMPTED — pending human verification

**What to verify:**
1. Run `npm run dev`. Sign in as Player A; navigate to the Upgrades screen (settings gear in lobby).
2. Upgrade a starter unit (e.g. scout_drone) one level and the tower track one level. Confirm: balance decreases by the displayed cost, the level increments, and stat-delta updates. Reload the app — confirm the level persisted (PROG-01/02).
3. Attempt to upgrade a non-owned, non-starter unit — confirm the button is absent (shows "UNLOCK FIRST"). At max level (5), confirm "MAX LEVEL" is shown with no button.
4. In a second browser/profile (Player B), upgrade different units/tower to different levels.
5. Start a multiplayer match between A and B via room code. In LoadoutScene confirm each player sees their own effective (upgraded) unit stats.
6. During the battle, confirm each client renders the OPPONENT's units and towers at the opponent's persisted (clamped) levels — e.g. B's upgraded tower hits harder on A's screen (PROG-03 cross-participant parity).

**Expected:** Levels persist across reload; ownership/max-level guards hold in the UI; both clients fight at each other's correct levels.

**Resume signal:** Type "approved" once parity + persistence + the ownership/max-level UI guards are confirmed, or describe issues.

**Note:** The upgrade flow cannot be fully runtime-verified until the migration is pushed to remote DB (blocked by Phase 11-04 remote `auth.users` createUser DB error). The code is wired against the existing `progression.ts` seam from plan 12-02 and the migration schema from plan 12-01/12-02.

## Threat Surface Scan

No new threat surface beyond what was planned:
- T-12-10 (opponent sends level 999): mitigated by `clampLevels` in the loadout receive handler (D-12) — implemented
- T-12-11 (forged cost): `UPGRADE_COSTS` is display-only; `upgradeSpend` sends no amount to the RPC — implemented
- T-12-12 (wire protocol regression): `loadout` is additive; `slot_pick` + game:${roomId} protocol unchanged — verified

## Known Stubs

None. All data surfaces are wired to real API calls (`getOwnLevels`, `getBalance`, `getOwnedUnits`, `upgradeSpend`). Levels default to 1 for users with no rows in the upgrades table (D-15, absence = level 1). The UI will show level-1 stats until the user upgrades, which is correct behavior (not a stub).
