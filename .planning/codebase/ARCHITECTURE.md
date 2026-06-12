<!-- refreshed: 2026-06-12 -->
# Architecture

**Analysis Date:** 2026-06-12

## System Overview

Path Raiders is a client-authoritative, browser-based tower-defence / base-attack game built on **Phaser 3** with **TypeScript**, bundled by **Vite**. Multiplayer is layered on top of **Supabase** (Auth, Postgres, and Realtime broadcast channels). There is no game server — each client simulates its own game and broadcasts player actions to the opponent over a Supabase Realtime channel.

```text
┌─────────────────────────────────────────────────────────────┐
│                    Phaser.Game (single canvas)               │
│                      `src/main.ts`                           │
├──────────┬──────────┬──────────┬──────────┬──────────┬───────┤
│BootScene │AuthScene │LobbyScene│Placement │Loadout   │Game   │
│ (load)   │ (login)  │ (rooms)  │  Scene   │ Scene    │Scene  │
│          │          │          │ (map+slot│ (units)  │(battle│
│          │          │          │  sync)   │          │ loop) │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┴───┬───┘
     │ scene.start() transitions, data passed via init(data)  │
     ▼          ▼          ▼          ▼          ▼         ▼
┌─────────────────────────────────────────────────────────────┐
│  Shared singleton state + service modules  (`src/lib/`)      │
│  gameState.ts · supabase.ts · pathfinder.ts · audio.ts       │
└──────────┬──────────────────────────────────┬───────────────┘
           │                                  │
           ▼                                  ▼
┌────────────────────────┐      ┌─────────────────────────────┐
│  Static game data      │      │  Supabase backend            │
│  `src/units/UnitData`  │      │  Auth · profiles · rooms ·   │
│  `src/maps/MapData`    │      │  Realtime broadcast channels │
└────────────────────────┘      └─────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Game bootstrap | Configures `Phaser.Game`, registers scene list | `src/main.ts` |
| BootScene | Preloads unit atlases + tokens, builds idle/walk animations, then starts AuthScene | `src/scenes/BootScene.ts` |
| AuthScene | Supabase login / signup / password reset, loads profile into `gameState` | `src/scenes/AuthScene.ts` |
| LobbyScene | Faction pick, create/join room via `rooms` table, practice mode | `src/scenes/LobbyScene.ts` |
| PlacementScene | Map sync (host authoritative), base-slot selection, slot broadcast | `src/scenes/PlacementScene.ts` |
| LoadoutScene | Choose deployable unit set (up to MAX_SLOTS) into `gameState.loadout` | `src/scenes/LoadoutScene.ts` |
| GameScene | The battle: simulation loop, units, towers, walls, base HP, multiplayer sync, win/loss | `src/scenes/GameScene.ts` |
| Global state | Cross-scene mutable singleton (user, room, faction, slots, gold, base HP) | `src/lib/gameState.ts` |
| Supabase client | Single shared `createClient` instance | `src/lib/supabase.ts` |
| Pathfinder | BFS over the grid with two-phase wall-breaking | `src/lib/pathfinder.ts` |
| Audio | Procedural Web Audio SFX (no asset files) | `src/lib/audio.ts` |
| Unit class | Phaser `Container` representing one deployed unit (movement, HP, combat) | `src/units/Unit.ts` |
| Unit data | Static `UNITS` definitions and faction lookup | `src/units/UnitData.ts` |
| Map data | 10 procedurally-built grid maps, terrain/overlay palettes, world geometry helpers | `src/maps/MapData.ts` |
| Type contracts | Shared interfaces/enums (`UnitDefinition`, `GameStateType`, `MapDef`, terrain/overlay) | `src/types/index.ts` |

## Pattern Overview

**Overall:** Phaser **Scene-based state machine**. Each major screen is a `Phaser.Scene` subclass registered once in `src/main.ts`. Scenes are linear states; transitions happen via `this.scene.start('NextScene', data)`. A single mutable module singleton (`gameState`) carries cross-scene context, and per-scene `init(data)` payloads carry the explicit handoff parameters (roomId, role, faction, mapId, slots).

**Key Characteristics:**
- **Client-authoritative simulation** — each client runs the full game loop locally (`GameScene.update`) and broadcasts intent; there is no server-side game tick.
- **DOM-over-canvas HUD** — gameplay world is rendered on the Phaser canvas, but all menus/HUD are injected as raw HTML/CSS `<div>` overlays (e.g. `buildHUD()` in `src/scenes/GameScene.ts:907`). Phaser `Graphics` is used for the map grid, towers, walls, and HP bars.
- **Static data tables** — units (`src/units/UnitData.ts`) and maps (`src/maps/MapData.ts`) are code constants, not loaded from the backend.
- **Two transport styles on Supabase** — Postgres row changes (`postgres_changes` on `rooms`) for matchmaking, and ephemeral `broadcast` channels for in-game action sync.

## Layers

**Scenes (presentation + control):**
- Purpose: Screen flow, input handling, rendering, and per-screen logic.
- Location: `src/scenes/`
- Contains: One Phaser.Scene subclass per screen.
- Depends on: `src/lib/` services, `src/units/`, `src/maps/`, `src/types/`.
- Used by: The Phaser runtime (registered in `src/main.ts`).

**Services / shared libs:**
- Purpose: Cross-cutting concerns shared by scenes.
- Location: `src/lib/` (`gameState.ts`, `supabase.ts`, `pathfinder.ts`, `audio.ts`).
- Used by: Scenes (especially GameScene) and the Unit class.

**Domain entities:**
- Purpose: Runtime game objects and their static definitions.
- Location: `src/units/` (`Unit.ts` runtime container, `UnitData.ts` definitions). Towers are an inline `TowerDef` interface inside `src/scenes/GameScene.ts` — there is no `src/towers/` implementation (the directory is empty).
- Used by: GameScene.

**Static data + types:**
- Purpose: Map geometry, palettes, world helpers, and shared TypeScript contracts.
- Location: `src/maps/MapData.ts`, `src/types/index.ts`.

**Build tools (offline, not shipped):**
- Purpose: Generate sprite tokens/spritesheets from `raw_art/` using `sharp`/`@napi-rs/canvas`.
- Location: `src/tools/` (`generateTokens.ts`, `generateSpritesheets.ts`), run via `npm run generate:tokens` / `generate:sprites`.

## Scene Flow / Lifecycle

```text
BootScene ──► AuthScene ──► LobbyScene ──► PlacementScene ──► LoadoutScene ──► GameScene
  preload      login         create/join     map + slot         pick units      battle
  assets       (Supabase)    room or          sync + lock                        loop
                             practice
```

- **BootScene → AuthScene:** after preloading atlases/tokens and registering `<unit>_idle` / `<unit>_walk` animations (`src/scenes/BootScene.ts:47`).
- **AuthScene → LobbyScene:** on existing session, successful login, or signup (`src/scenes/AuthScene.ts:298,391,490,643,881`). Loads `profiles` row into `gameState`.
- **LobbyScene → PlacementScene:** on practice start (`:314`), host detecting guest join via `postgres_changes` (`:385`), or guest joining a room (`:443`). A random `mapId` is selected here.
- **PlacementScene → LoadoutScene:** after both players lock a base slot (`launchGame()` → `this.scene.start('LoadoutScene', …)`, `src/scenes/PlacementScene.ts:252`).
- **LoadoutScene → GameScene:** on loadout confirm (`src/scenes/LoadoutScene.ts:172`), passing through the same `params` (roomId, role, faction, mapId, hostSlot, guestSlot).
- **GameScene loops back:** result overlay offers "Play Again" → `PlacementScene` (new random map, `:761`) or "Lobby" → `LobbyScene` (`:772`, `:1072`).

Each scene cleans up Supabase channels and DOM overlays on `shutdown`/`destroy` (e.g. GameScene `src/scenes/GameScene.ts:195`, LobbyScene `cleanupChannel` `:452`).

## Game State Management

`src/lib/gameState.ts` exports a single mutable `GameStateType` object (default import) shared across all scenes. It holds identity (`userId`, `username`), progression (`unlockedUnits`, `loadout`, `wins`, `losses`), match context (`roomId`, `role`, `mapId`, `hostSlot`, `guestSlot`), and live battle values (`hostBaseHp`, `guestBaseHp`, `gold`). Scenes both read and write it directly.

In addition, scene transitions pass an explicit `data` payload to the next scene's `init(data)` (see `GameSceneData` in `src/scenes/GameScene.ts:40`). GameScene reconciles the two: `init()` prefers the passed `data`, falling back to `gameState`, then writes the resolved values back into `gameState`.

## Data Flow

### Battle simulation tick (`GameScene.update`, `src/scenes/GameScene.ts:385`)

1. `updateGold(dt)` — passive +10 gold every 2s (`:399`).
2. `updateTimer(dt)` — counts down 180s; on expiry, higher base HP wins (`:410`).
3. `updateAI(dt)` — practice mode only; spawns opponent units on an interval (`:424`).
4. `updateUnits(dt)` — per unit: attack walls → fight nearby enemies (within `COMBAT_RANGE`) → follow BFS waypoints → on reaching enemy base, deal `BASE_REACH_DMG` and self-destruct (`:452`).
5. `updateTowers(dt)` — each tower hits the nearest in-range enemy unit on cooldown (`:525`).
6. Prune dead/inactive units from `hostUnits` / `guestUnits` (`:395`).

### Deploy action flow

1. Player taps a unit slot in the DOM HUD → `onDeployTap` selects it (`:1078`).
2. Player taps the map → `tryDeployAt` picks nearest base slot, spends gold, spawns a `Unit`, assigns a path, plays SFX (`:336`).
3. `assignPath(unit)` runs BFS to the enemy base slot and converts cell path to world-pixel waypoints (`:778`).
4. In multiplayer, a `broadcast` `deploy` event is sent on the game channel (`:371`); the opponent's `setupChannel` handler reconstructs the same unit locally (`:860`).

### Wall / base HP sync

- Wall damage is local (`damageWall` → `breakWall`); a broken wall broadcasts `wall_break` so the opponent mirrors it and both recompute unit paths (`:808`).
- Base HP changes broadcast `base_hp` (`:564`); game end broadcasts `game_over` (`:589`). Win/loss is persisted to `profiles` in `recordResult` (`:606`), including unlock thresholds.

**State Management:** Battle state lives as private fields on the `GameScene` instance (units, towers, `wallHP` map, `mutableOver` overlay grid, base HP), mirrored into `gameState` for cross-scene persistence and into the Supabase channel for the opponent.

## Multiplayer / Realtime Sync Model

**Matchmaking (Postgres-backed):** Rooms are rows in the `rooms` table (`host_id`, `host_faction`, `guest_id`, `guest_faction`, `code`, `state`). The host inserts a `waiting` room and subscribes via `postgres_changes` UPDATE filtered on `id` (`src/scenes/LobbyScene.ts:369`). The guest looks up by `code`, sets `guest_id` + `state='active'`, which the host observes to advance both clients.

**In-game sync (broadcast channels):** Three ephemeral channels keyed by `roomId`:
- `placement:<roomId>` — `map_sync` (host is authoritative for the map) and `slot_pick` (`src/scenes/PlacementScene.ts:194`).
- `game:<roomId>` — `deploy`, `wall_break`, `base_hp`, `game_over` (`src/scenes/GameScene.ts:856`).

**Authority model:** No server arbiter. Each client simulates independently and trusts opponent broadcasts. The host is authoritative only for map selection during placement. `roomId` values prefixed `practice-` short-circuit all networking and enable the local AI spawner.

## Key Abstractions

**Unit:**
- Purpose: A deployed combatant. Extends `Phaser.GameObjects.Container` holding a token image + HP graphics.
- File: `src/units/Unit.ts`; static definitions in `src/units/UnitData.ts` (`UnitDefinition`).
- Pattern: Carries `waypoints`/`wpIdx` for movement, `dir` (+1 guest down / -1 host up), `laneSlot`, and `wallTarget`. `moveStep`, `takeDamage`, `kill`, `popIn` encapsulate behaviour.

**Tower:**
- Purpose: Stationary auto-attacker guarding each base lane.
- Pattern: Plain `TowerDef` interface + array on GameScene — not a class. Six towers (3 slots × 2 sides) created in `create()` (`src/scenes/GameScene.ts:171`). `isHostSide` decides which unit list it targets.

**Map:**
- Purpose: The grid battlefield. `MapDef` has a `base` terrain grid and an `over` overlay grid (walls, tunnels, dead-ends, base zones).
- File: `src/maps/MapData.ts` (`MAPS`, `buildMap1..10`, `TERRAIN_COLOR`, `OVERLAY_COLOR`).

## Game World Model (lanes, bases, pathfinding)

- **Grid:** `ROWS=16`, `COLS=22`, `CELL=36px` → world `792×576` (`src/maps/MapData.ts:3`).
- **Lanes / slots:** Three base slots at column ranges `[6,7]`, `[10,11]`, `[14,15]` (`BASE_SLOTS`). Host bases occupy bottom rows `14–15` (`HOST_ROWS`), guest bases top rows `0–1` (`GUEST_ROWS`). Helpers `slotWorldX`, `hostSpawnY`, `guestSpawnY` map slots to world pixels.
- **Bases:** Each side has a single base HP pool (`hostBaseHP` / `guestBaseHP`, 1000 each). Units that reach the enemy base slot deal `BASE_REACH_DMG` and despawn.
- **Pathfinding:** BFS over the grid in `src/lib/pathfinder.ts`. `isWalkable` treats base rows `{0,1,14,15}` and `base_zone` as open, plus `path`/`bridge`/`cross` terrain. `findPath` runs two phases — open path first, then allowing faction-breakable walls (`canBreakWall`) — so units only break walls when no clear route exists. Walls have HP (`WALL_MAX_HP`, `src/scenes/GameScene.ts:18`); breaking one mutates `mutableOver` and triggers a path recompute for all units.

## Entry Points

**Application entry:**
- Location: `src/main.ts` (referenced by root `index.html`).
- Triggers: Vite dev server / build.
- Responsibilities: Build `Phaser.Types.Core.GameConfig` (960×540, FIT scale), register the six scenes in order, instantiate `new Phaser.Game(config)`.

**First active scene:**
- `BootScene` (first in the scene array) preloads assets then hands off to `AuthScene`.

## Architectural Constraints

- **Threading:** Single-threaded — Phaser's render/update loop plus the browser event loop. No web workers.
- **Global state:** Two module-level singletons: `gameState` (`src/lib/gameState.ts`) and the Supabase `supabase` client (`src/lib/supabase.ts`). Battle state is per-`GameScene` instance.
- **Empty `src/towers/` directory:** Towers are modelled inline in GameScene; there is no tower module despite the directory existing.
- **Client authority:** Because clients are authoritative and trust broadcasts, the two simulations can diverge (no reconciliation) — see CONCERNS.
- **DOM coupling:** Menus/HUD rely on injected DOM with hard-coded element IDs (`gh-*`, `pl-*`, `rc-*`, `lo-*`); these must be cleaned up on scene shutdown to avoid leaks.

## Anti-Patterns

### Inline tower definition instead of a Tower class

**What happens:** Towers exist only as a `TowerDef` interface and a `towers: TowerDef[]` array on GameScene (`src/scenes/GameScene.ts:31`), while units have a proper class in `src/units/Unit.ts`.
**Why it's wrong:** Inconsistent with the Unit abstraction and leaves `src/towers/` empty/misleading; tower logic is buried in the 1100-line GameScene.
**Do this instead:** Promote towers to `src/towers/Tower.ts` mirroring `Unit.ts`, with data in a `TowerData.ts` table.

### Large multi-responsibility GameScene with embedded HTML/CSS

**What happens:** `src/scenes/GameScene.ts` (~1100 lines) mixes simulation, rendering, networking, persistence, and large inline HTML/CSS strings for the HUD and result overlay.
**Why it's wrong:** Hard to test/modify; styling and game logic change for unrelated reasons in the same file.
**Do this instead:** Extract HUD/overlay builders into dedicated UI modules and split simulation systems (units, towers, walls) into helpers.

## Error Handling

**Strategy:** Defensive and silent. Supabase calls check returned `error`/`data` and surface user-facing messages in the DOM (e.g. lobby room create/join). Audio is wrapped in `try { … } catch {}` (`src/lib/audio.ts`). Many lookups guard with optional chaining and fallbacks (`?? 'machines'`, `?? MAPS[0]`).

**Patterns:**
- Network failures → inline DOM error text, button re-enabled (e.g. `src/scenes/LobbyScene.ts:349`).
- Missing data → safe defaults rather than thrown exceptions.

## Cross-Cutting Concerns

**Logging:** No structured logging framework; effectively none in production paths.
**Validation:** Minimal — room codes are uppercased/filtered to `[A-Z0-9]` and length-checked; gold affordability checked before deploy. No schema validation of broadcast payloads (cast with `as`).
**Authentication:** Supabase Auth (`supabase.auth.signInWithPassword`, `signUp`, `resetPasswordForEmail`) in `src/scenes/AuthScene.ts`; profile rows stored in the `profiles` table.

---

*Architecture analysis: 2026-06-12*
