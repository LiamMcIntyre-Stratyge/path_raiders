# Coding Conventions

**Analysis Date:** 2026-06-12

## TypeScript Configuration

Strictness is high. `tsconfig.json` enables:
- `strict: true` (all strict-family checks on)
- `noUnusedLocals: true` and `noUnusedParameters: true` — unused symbols are errors. Intentionally-unused params are prefixed with `_` (e.g. `update(_t: number, dt: number)` in `src/scenes/GameScene.ts`, `onUpdate: (_tw, obj) => {...}` in `src/units/Unit.ts`).
- `noFallthroughCasesInSwitch: true`
- `verbatimModuleSyntax: true` — type-only imports MUST use `import type { ... }`. This is followed consistently (e.g. `import type { UnitDefinition } from '../types'` in `src/units/UnitData.ts`).
- `erasableSyntaxOnly: true` — no enums or namespaces; use `type` unions and `const` objects instead.
- `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`, `noEmit: true` — Vite does the bundling, `tsc` is type-check only (see `build` script: `tsc && vite build`).
- `target: "ES2023"`, `module: "ESNext"`.

## Module System

- **ESM only.** `package.json` declares `"type": "module"`.
- Relative imports with explicit `..` paths and **no file extensions** in app code (e.g. `from '../types'`, `from '../lib/supabase'`). One file uses an explicit `/index` path: `from '../types/index'` in `src/lib/pathfinder.ts` — the extensionless form `'../types'` is the dominant convention.
- No path aliases configured. All imports are relative.

## Naming Patterns

**Files:**
- Scene classes and the `Unit` class: `PascalCase.ts` matching the exported class — `src/scenes/GameScene.ts`, `src/units/Unit.ts`.
- Data modules: `PascalCase.ts` — `src/units/UnitData.ts`, `src/maps/MapData.ts`.
- Library/helper modules: `camelCase.ts` — `src/lib/gameState.ts`, `src/lib/supabase.ts`, `src/lib/audio.ts`, `src/lib/pathfinder.ts`.
- Tooling: `camelCase.ts` under `src/tools/` — `generateTokens.ts`, `generateSpritesheets.ts`.

**Classes:** `PascalCase`. Scenes are suffixed `Scene` (`BootScene`, `AuthScene`, `LobbyScene`, `PlacementScene`, `LoadoutScene`, `GameScene`).

**Types & interfaces:** `PascalCase`. Domain interfaces live in `src/types/index.ts` (`UnitDefinition`, `GameStateType`, `MapDef`). Scene-local interfaces are declared inline in the scene file (e.g. `GameSceneData`, `TowerDef` in `src/scenes/GameScene.ts`; `PlacementData` in `src/scenes/PlacementScene.ts`). Union string types use `PascalCase` names with lowercase string members: `Faction = 'machines' | 'plants' | 'wizards'`, `UnitSpeed`, `TerrainType`, `OverlayType`.

**Constants:** Module-level exported constants are `SCREAMING_SNAKE_CASE` (`COLS`, `ROWS`, `CELL`, `WORLD_W`, `BASE_SLOTS`, `COMBAT_RANGE`, `BASE_REACH_DMG`, `WALL_MAX_HP`). The shared design-token object in `src/scenes/AuthScene.ts` is the single-letter `T`.

**Variables / functions / methods:** `camelCase` (`slotWorldX`, `hostSpawnY`, `findPath`, `moveStep`, `takeDamage`). Identifier strings (unit ids, scene keys, terrain/overlay types) are `snake_case` or lowercase: `'scout_drone'`, `'break_mach'`, `'base_zone'`.

## Code Style

- **Quotes:** single quotes throughout. **No semicolons** (ASI style) — confirmed across every `src` file.
- **Indentation:** 2 spaces.
- No ESLint or Prettier config is committed (no `.eslintrc*`, `.prettierrc*`, `eslint.config.*`, `biome.json`). Style is enforced by convention and `tsc`, not tooling.
- A `.cursorrules` file at the repo root captures project-wide rules for AI assistants (engine, world dimensions, lane coordinates, faction list, required singletons).
- **Section banners:** files use box-drawing comment dividers to chunk regions, e.g. `// ─── Layout constants ───────...` and `// ── Login screen ──...`. Used heavily in `src/scenes/AuthScene.ts`, `src/scenes/GameScene.ts`, `src/maps/MapData.ts`, `src/units/Unit.ts`.
- Aligned assignments for readability in hot/data sections (e.g. `this.def      = def` in `src/units/Unit.ts`).

## Import Organization

Observed order (top of `src/scenes/GameScene.ts` is the canonical example):
1. `import Phaser from 'phaser'`
2. Local singletons/state — `gameState`, `supabase`
3. Local data/classes — `UNITS`, `Unit`, map data, pathfinder, audio
4. Type-only imports — `import type { Faction, OverlayType, MapDef } from '../types'`
5. Third-party type-only imports last — `import type { RealtimeChannel } from '@supabase/supabase-js'`

`import './style.css'` (side-effect CSS import) appears at the end of `src/main.ts`.

## Required Singletons (per `.cursorrules`)

- Supabase client is ALWAYS imported from `src/lib/supabase.ts` (`export const supabase = createClient(...)`). Env vars read via `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Game state is ALWAYS imported from `src/lib/gameState.ts` — a `default`-exported mutable object typed `GameStateType`. It is the only `export default` in the codebase; everything else uses named exports.
- Cross-scene communication uses Phaser scene events and `init(data)` payloads — not globals or a separate event bus.

## Phaser Scene Structure (the dominant pattern)

Every scene extends `Phaser.Scene` and follows this shape (see all files in `src/scenes/`):

```typescript
export class GameScene extends Phaser.Scene {
  // 1. Private fields with definite-assignment (!) for DOM/Phaser objects
  private hud!: HTMLDivElement
  private gold = 200          // primitives initialized inline

  // 2. Constructor only registers the scene key
  constructor() { super({ key: 'GameScene' }) }

  // 3. init(data) reads the typed payload passed from scene.start(...)
  init(data: GameSceneData) { /* copy into fields / gameState */ }

  // 4. preload() loads assets (see BootScene)
  // 5. create() builds the scene
  // 6. update(_t, dt) runs the game loop (GameScene only)
}
```

Conventions within scenes:
- The scene key string passed to `super({ key })` matches the class name exactly.
- `BootScene` (`src/scenes/BootScene.ts`) is the single asset-loading scene: it `preload()`s atlases/tokens for every entry in `UNITS` and registers idle/walk animations, then `this.scene.start('AuthScene')`.
- Scene transitions use `this.scene.start('SceneKey')`, optionally with a data object consumed by the next scene's `init`.
- DOM-overlay UI (auth/lobby/HUD) is built by injecting `<style>` once and writing `overlay.innerHTML`, then wiring `element.onclick`/`addEventListener` handlers. Overlays are torn down on `this.events.on('shutdown'/'destroy', ...)` (see `removeOverlay()` in `src/scenes/AuthScene.ts`).

## Data-Driven Definitions

Game content is defined as plain typed arrays / records, not classes:
- **Units:** `export const UNITS: UnitDefinition[]` in `src/units/UnitData.ts`. Each entry is a flat object (`id`, `name`, `faction`, `tier`, `hp`, `dmg`, `speed`, `speedPx`, `cost`, `tokenColor`, `starter`). Derived lookups are built with `Object.fromEntries` (e.g. `UNIT_FACTION`).
- **Maps:** built in `src/maps/MapData.ts` from grid-builder helpers (`makeGrid`, `paint`, `paintRect`, `hline`) producing `MapDef` objects with `base: TerrainType[][]` and `over: OverlayType[][]` matrices. Grid dimensions and pixel conversions are exported constants (`COLS`, `ROWS`, `CELL`, `slotWorldX`, etc.).
- **Towers:** `TowerDef` is an inline interface in `src/scenes/GameScene.ts`; tower instances are pushed into a `towers: TowerDef[]` array (no dedicated class).
- **Palettes / icon maps:** `Record<...>` lookups keyed by terrain/overlay/faction/unit id (`TERRAIN_COLOR`, `OVERLAY_COLOR`, `FC`, `FAC_ICON`, `UNIT_ICON`).
- `Unit` (`src/units/Unit.ts`) is the one gameplay entity modeled as a class — it extends `Phaser.GameObjects.Container` and carries `readonly def: UnitDefinition`, mutable `hp`, waypoint state, and methods like `moveStep`, `takeDamage`, `kill`, `drawHP`.

## Type-Definition Conventions (`src/types/index.ts`)

- Shared/cross-scene types only. Inline string-literal unions for closed sets (`Faction`, `UnitSpeed`, `TerrainType`, `OverlayType`). `OverlayType` includes `null` as a member rather than wrapping later.
- Interfaces use plain fields with inline `// comments` documenting valid ranges (e.g. `hostSlot: number | null   // 0 | 1 | 2`).
- Scene-specific payload shapes are NOT placed here — they live next to the scene that consumes them.

## Error Handling

There is no centralized error framework. Patterns observed:
- **Supabase calls** destructure `{ data, error }` and branch on `error` inline, surfacing messages to the user via a DOM error element with an uppercased message: `if (error) { setErr(error.message.toUpperCase()); ...; return }` (throughout `src/scenes/AuthScene.ts`, `src/scenes/LobbyScene.ts`). Buttons are disabled and their label swapped to a `'...ING'` state during async work, then restored on failure.
- **Nullish coalescing for defaults:** profile/state reads use `?? fallback` heavily (e.g. `gameState.username = profile?.username ?? null`, `gameState.playerFaction ?? 'machines'`).
- **try/catch is rare and scoped.** `src/scenes/AuthScene.ts` wraps the session check in a single `try { ... } catch { this.sessionData = null }`. `src/lib/audio.ts` wraps each Web Audio generator in `try { ... } catch { /* audio blocked */ }` so audio failures never break gameplay.
- **Defensive guards before Phaser teardown:** callbacks check object liveness before acting — `if (img.scene) img.clearTint()`, `if (this.scene) this.destroy()` (`src/units/Unit.ts`).
- **Logging is minimal.** Only 6 `console.*` calls exist in `src/`; the only `console.error` usages are `main().catch(console.error)` in the two `src/tools/` scripts. No logging library, no `console.log` left in scene/game code.

## Comments

- Comments explain intent, units, and coordinate meaning — not restating code. Examples: `COMBAT_RANGE = 52   // world px — stop and fight when this close`, `dir: 1 | -1   // +1 = moving down (guest), -1 = moving up (host)`.
- No JSDoc/TSDoc blocks are used; comments are single-line `//`.

## Function & Module Design

- Helper functions are small and pure where possible (`slotWorldX`, `isWalkable`, `canBreakWall`, `makeGrid`, `paint`). Pathfinding (`src/lib/pathfinder.ts`) is implemented as standalone exported functions plus a private `bfs`, with a two-phase strategy (open path first, then faction-breakable walls).
- Named exports everywhere except the `gameState` default export.
- No barrel files beyond `src/types/index.ts` (which is a single type module, imported as `'../types'`).

---

*Convention analysis: 2026-06-12*
