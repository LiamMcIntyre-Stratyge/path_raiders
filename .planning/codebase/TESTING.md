# Testing Patterns

**Analysis Date:** 2026-06-12

## Summary: No Automated Test Suite

**This project has no formal automated tests.** This is documented honestly as the current state, not an oversight to paper over.

Evidence:
- No test files exist: a repo-wide search for `*.test.*` / `*.spec.*` (excluding `node_modules`) returns nothing.
- No test runner is installed: `package.json` `devDependencies` are only `@types/node`, `ts-node`, `typescript`, `vite`. No `jest`, `vitest`, `mocha`, `playwright`, `cypress`, or `@testing-library/*`.
- No test config files: no `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or `cypress.config.*`.
- No `test` script in `package.json`. Available scripts are `dev`, `build`, `preview`, `generate:tokens`, `generate:sprites`.

**Treat this as a known gap** (see "Coverage Gaps / Recommendations" below), not as a pattern to emulate. When asked to add tests, you are establishing the framework from scratch.

## What Plays the Role of "Verification" Today

### 1. TypeScript type-checking (the de-facto safety net)

The closest thing to an automated check is the compiler. The `build` script runs `tsc && vite build`, so `tsc` must pass before a production build succeeds.

```bash
npm run build      # tsc type-check, then vite production build
npx tsc --noEmit   # type-check only (tsconfig already sets noEmit: true)
```

`tsconfig.json` is strict (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`), so the type checker catches a meaningful class of errors. This is the only gate that currently runs automatically.

### 2. Manual in-game verification via the Vite dev server

The primary verification loop is running the real game and playing it.

```bash
npm run dev        # start Vite dev server, open the game in a browser
npm run preview    # serve the production build for a final manual check
```

Flow: `BootScene` → `AuthScene` → `LobbyScene` → `PlacementScene` → `LoadoutScene` → `GameScene` (see `src/main.ts` scene array). Multiplayer features (Supabase realtime rooms, host/guest sync in `src/scenes/GameScene.ts` and `src/scenes/PlacementScene.ts`) require **two browser sessions** to verify host/guest behavior manually. There is no harness that automates this.

### 3. `public/dev-preview.html` — a standalone art/UI preview harness

`public/dev-preview.html` (~774 lines) is a self-contained HTML/CSS/JS page that does **not** import the game's TypeScript modules. It has its own mock login screen and its own `requestAnimationFrame` render loop (two `requestAnimationFrame(loop)` call sites) that draws faction/unit cards and animated sprite viewers.

Its purpose is **visual/design verification of characters, factions, tokens, and UI styling** in isolation — letting a developer eyeball sprites and card layouts without booting the full Phaser game or authenticating against Supabase. It is a manual preview tool, not a test runner: it has no assertions and no pass/fail output.

Open it directly through the dev server (it lives under `public/`, so Vite serves it at `/dev-preview.html`).

### 4. Asset-generation scripts (not tests, but verifiable pipelines)

`src/tools/generateTokens.ts` and `src/tools/generateSpritesheets.ts` (run via `npm run generate:tokens` / `npm run generate:sprites`, using `ts-node --esm`) regenerate the PNG tokens and spritesheets from source art. They each end with `main().catch(console.error)`. Verification of their output is manual — inspecting the produced files in `public/assets/` (and `public/dev-preview.html` is the convenient viewer for that). `SPRITE_PIPELINE.md` at the repo root documents this workflow and the expected frame layout (idle 4 + walk 6, with attack/death noted as missing).

## Test File Organization

Not applicable — no tests exist. If tests are introduced, no convention is established yet. A reasonable starting point given the structure:
- Pure logic (`src/lib/pathfinder.ts`, the map-builder helpers in `src/maps/MapData.ts`, `Unit.moveStep` / `Unit.takeDamage` in `src/units/Unit.ts`) is the most testable surface and has no DOM/Phaser dependency in its core math.
- Phaser scenes and Supabase/DOM code are integration-heavy and would need mocking or browser-based (Playwright) testing.

## Mocking / Fixtures

None present. No mock infrastructure, no fixture files, no test data factories exist in the repo.

## Coverage

**Coverage: 0% automated.** No coverage tooling is configured and no coverage target is enforced.

## Coverage Gaps / Recommendations (this is the gap, stated plainly)

High-value, low-friction targets if/when a suite is added (suggested runner: **Vitest**, since the project already uses Vite + ESM + TypeScript and Vitest needs near-zero extra config):

- **Pathfinding** — `findPath`, `isWalkable`, `canBreakWall`, `bfs` in `src/lib/pathfinder.ts`. Pure, deterministic, central to gameplay; the two-phase open-then-breakable logic is exactly the kind of thing that regresses silently.
- **Map builders** — `makeGrid`, `paint`, `paintRect`, `hline` and the grid/pixel helpers (`slotWorldX`, `hostSpawnY`, `guestSpawnY`) in `src/maps/MapData.ts`. Easy to assert exact grid contents and coordinate math.
- **Unit movement/combat math** — `Unit.moveStep` (waypoint stepping) and `Unit.takeDamage` (HP clamping + death return value) in `src/units/Unit.ts`. The core arithmetic is separable from the Phaser rendering if those methods are exercised with a lightweight scene stub.
- **Untested by anything today:** Supabase auth/profile flows in `src/scenes/AuthScene.ts` and room create/join in `src/scenes/LobbyScene.ts`, and all multiplayer realtime sync in `src/scenes/GameScene.ts` — these currently rely entirely on manual two-session playthroughs and would benefit from Playwright end-to-end coverage. Risk: regressions in host/guest desync go unnoticed until manually reproduced.

---

*Testing analysis: 2026-06-12*
