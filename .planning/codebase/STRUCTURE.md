# Codebase Structure

**Analysis Date:** 2026-06-12

## Directory Layout

```text
path_raiders/
├── index.html                 # Vite entry HTML, loads /src/main.ts
├── package.json               # Scripts + deps (phaser, supabase, vite, sharp)
├── tsconfig.json              # TypeScript config
├── .env.local                 # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (secrets — do not read)
├── .cursorrules               # Editor AI rules
├── SPRITE_PIPELINE.md         # Docs for the sprite/token generation pipeline
├── raw_art/                   # Source PNGs per unit (input to src/tools)
├── public/                    # Static served assets
│   ├── assets/                # Generated spritesheets + tokens (loaded by BootScene)
│   ├── dev-preview.html       # Standalone sprite preview page
│   ├── favicon.svg
│   └── icons.svg
├── dist/                      # Vite build output (generated)
└── src/
    ├── main.ts                # Phaser.Game bootstrap + scene registration
    ├── style.css              # Global canvas/page styles
    ├── lib/                   # Shared services / singletons
    │   ├── gameState.ts       # Mutable cross-scene state singleton (default export)
    │   ├── supabase.ts        # Supabase client instance
    │   ├── pathfinder.ts      # BFS grid pathfinding + wall rules
    │   └── audio.ts           # Procedural Web Audio SFX (AudioManager singleton)
    ├── scenes/                # One Phaser.Scene per screen
    │   ├── BootScene.ts       # Asset preload + animation registration
    │   ├── AuthScene.ts       # Supabase auth (login/signup/reset)
    │   ├── LobbyScene.ts      # Faction pick, create/join rooms, practice
    │   ├── PlacementScene.ts  # Map sync + base-slot selection
    │   ├── LoadoutScene.ts    # Deployable unit selection
    │   └── GameScene.ts       # Battle simulation, HUD, multiplayer sync
    ├── units/                 # Unit entity + data
    │   ├── Unit.ts            # Runtime Unit (Phaser Container subclass)
    │   └── UnitData.ts        # Static UNITS definitions + UNIT_FACTION
    ├── maps/
    │   └── MapData.ts         # 10 maps, terrain/overlay palettes, world geometry
    ├── towers/                # EMPTY — towers are defined inline in GameScene
    ├── types/
    │   └── index.ts           # Shared interfaces + enums (UnitDefinition, MapDef, …)
    └── tools/                 # Offline asset generators (not bundled)
        ├── generateTokens.ts       # raw_art → birds-eye tokens (sharp)
        └── generateSpritesheets.ts # raw_art → animated spritesheets + JSON atlas
```

## Directory Purposes

**`src/lib/`:**
- Purpose: Framework-agnostic shared services and singletons used across scenes.
- Contains: State singleton, Supabase client, pathfinding, audio.
- Key files: `gameState.ts`, `supabase.ts`, `pathfinder.ts`, `audio.ts`.

**`src/scenes/`:**
- Purpose: All screen/state logic. Each file is a `Phaser.Scene` subclass registered in `src/main.ts`.
- Contains: Boot, Auth, Lobby, Placement, Loadout, Game scenes. GameScene is by far the largest (~1100 lines) and owns the battle loop.
- Key files: `GameScene.ts` (battle), `AuthScene.ts` (auth), `LobbyScene.ts` (matchmaking).

**`src/units/`:**
- Purpose: Combatant entity and its static stat table.
- Contains: `Unit.ts` (runtime behaviour), `UnitData.ts` (`UNITS` array of `UnitDefinition`).

**`src/maps/`:**
- Purpose: Battlefield definitions and world geometry.
- Contains: `MapData.ts` — `ROWS/COLS/CELL`, `BASE_SLOTS`, `HOST_ROWS`/`GUEST_ROWS`, `slotWorldX`/`hostSpawnY`/`guestSpawnY`, `TERRAIN_COLOR`/`OVERLAY_COLOR`, `buildMap1..10`, and the `MAPS` registry.

**`src/towers/`:**
- Purpose: Intended home for tower logic. Currently **empty** — `TowerDef` lives inline in `src/scenes/GameScene.ts`.

**`src/types/`:**
- Purpose: Shared TypeScript contracts with no runtime code.
- Contains: `index.ts` — `Faction`, `UnitSpeed`, `UnitDefinition`, `GameStateType`, `TerrainType`, `OverlayType`, `MapDef`.

**`src/tools/`:**
- Purpose: Offline Node scripts (run via `ts-node`) that turn `raw_art/*.png` into game assets in `public/assets/`. Not part of the browser bundle.

**`public/assets/`:**
- Purpose: Runtime-loaded sprite atlases (`<unit>.png` + `<unit>.json`) and tokens (`<unit>_token.png`), consumed by `BootScene.preload`.

## Key File Locations

**Entry Points:**
- `index.html`: Vite HTML entry, references `/src/main.ts`.
- `src/main.ts`: Phaser game config + scene registration.

**Configuration:**
- `tsconfig.json`: TypeScript compiler options.
- `package.json`: Scripts (`dev`, `build`, `preview`, `generate:tokens`, `generate:sprites`) and dependencies.
- `.env.local`: Supabase URL + anon key (referenced via `import.meta.env` in `src/lib/supabase.ts`).

**Core Logic:**
- `src/scenes/GameScene.ts`: Battle simulation, towers, walls, HUD, multiplayer.
- `src/lib/gameState.ts`: Cross-scene state.
- `src/lib/pathfinder.ts`: Movement pathfinding.
- `src/units/Unit.ts`: Unit entity.

**Data:**
- `src/units/UnitData.ts`: Unit stats.
- `src/maps/MapData.ts`: Maps + world geometry.

**Testing:**
- None present — no test files, runner, or config in the repository.

## Naming Conventions

**Files:**
- Scenes and the Unit entity use **PascalCase** matching the exported class (`GameScene.ts`, `Unit.ts`).
- Data/service/lib modules use **camelCase** (`gameState.ts`, `supabase.ts`, `pathfinder.ts`, `audio.ts`) or PascalCase for data tables tied to a domain noun (`UnitData.ts`, `MapData.ts`).
- Type barrels are lowercase (`types/index.ts`).
- Generated assets follow `<unit_id>.png` / `<unit_id>.json` / `<unit_id>_token.png`.

**Directories:**
- All lowercase, plural by role (`scenes`, `units`, `maps`, `towers`, `types`, `tools`, `lib`).

**Identifiers:**
- Unit IDs are lowercase snake_case (`scout_drone`, `vine_crawler`).
- DOM element IDs are kebab-style with screen prefixes: `gh-*` (game HUD), `pl-*` (placement), `rc-*` (room/lobby), `lo-*` (loadout).
- Supabase channels are `purpose:<roomId>` (`game:`, `placement:`) or `room-<roomId>` for matchmaking.

## Where to Add New Code

**New unit:**
- Stats: add a `UnitDefinition` to `UNITS` in `src/units/UnitData.ts`.
- Art: drop a source PNG in `raw_art/`, run `npm run generate:tokens` / `generate:sprites` to emit into `public/assets/`.
- No code change needed in `BootScene` — it iterates `UNITS`.

**New map:**
- Add a `buildMapN()` builder and register it in the `MAPS` array in `src/maps/MapData.ts`.

**New tower behaviour (recommended refactor target):**
- Today: extend `TowerDef` and tower loops in `src/scenes/GameScene.ts`.
- Preferred: create `src/towers/Tower.ts` (+ `TowerData.ts`) mirroring `src/units/Unit.ts`, then wire into GameScene.

**New screen/state:**
- Add a `Phaser.Scene` subclass in `src/scenes/`, register it in the `scene` array in `src/main.ts`, and transition to it via `this.scene.start('NewScene', data)`.

**New shared service:**
- Add to `src/lib/` (e.g. another singleton module), import where needed.

**New shared type:**
- Add to `src/types/index.ts`.

## Special Directories

**`public/assets/`:**
- Purpose: Generated sprite atlases + tokens loaded at runtime.
- Generated: Yes (by `src/tools/`).
- Committed: Present in repo (served by Vite).

**`raw_art/`:**
- Purpose: Source PNGs, input to the generation tools.
- Generated: No (hand-authored art).
- Committed: Yes.

**`dist/`:**
- Purpose: Vite production build output.
- Generated: Yes (`npm run build`).
- Committed: Should be ignored; do not edit by hand.

**`node_modules/`:**
- Purpose: Installed dependencies. Generated, not committed.

---

*Structure analysis: 2026-06-12*
