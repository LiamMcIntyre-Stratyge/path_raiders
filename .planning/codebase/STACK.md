# Technology Stack

**Analysis Date:** 2026-06-12

## Languages

**Primary:**
- TypeScript `~5.9.3` - All game and tooling source under `src/` (scenes, units, lib, tools)

**Secondary:**
- HTML - `index.html` (Vite entry document), `public/dev-preview.html`
- CSS - `src/style.css` (imported in `src/main.ts`) plus inline DOM styling in scene files
- SVG - UI/icon assets (`public/favicon.svg`, `public/icons.svg`) and procedurally generated art in `src/tools/generateTokens.ts`

## Runtime

**Environment:**
- Browser (client-side game). The Phaser game is instantiated in `src/main.ts` and mounted into `<div id="app">` in `index.html`.
- Node.js - used only for offline asset-generation tooling (`src/tools/*.ts`) run via `ts-node`. `@types/node` `^25.5.0` is a devDependency.

**Package Manager:**
- npm
- Lockfile: present (`package-lock.json`)
- No `.nvmrc` / `.node-version` - Node version not pinned

## Frameworks

**Core:**
- Phaser `^3.90.0` - 2D game engine. Game config and scene registration in `src/main.ts` (canvas 960x540, `Phaser.AUTO` renderer, `Phaser.Scale.FIT` + center). Scene flow: `BootScene` → `AuthScene` → `LobbyScene` → `PlacementScene` → `LoadoutScene` → `GameScene`.

**Backend SDK:**
- `@supabase/supabase-js` `^2.99.3` - Auth, Postgres data access, and Realtime channels. Client created in `src/lib/supabase.ts`. See INTEGRATIONS.md.

**Testing:**
- Not detected - no test runner (Jest/Vitest), config, or `*.test.*` / `*.spec.*` files present.

**Build/Dev:**
- Vite `^8.0.1` - dev server and production bundler
- TypeScript compiler (`tsc`) - type-checks before bundling in the `build` script

## Key Dependencies

**Critical (runtime, `dependencies`):**
- `phaser` `^3.90.0` - Game engine; foundation of all rendering and scene logic
- `@supabase/supabase-js` `^2.99.3` - All multiplayer, auth, and persistence

**Tooling-only (declared as `dependencies`, used by `src/tools/`):**
- `@napi-rs/canvas` `^0.1.97` - Native canvas used to compose spritesheets in `src/tools/generateSpritesheets.ts` (96px frames; 4 idle + 6 walk = 10 frames per sheet)
- `sharp` `^0.34.5` - Image processing (SVG→PNG, silhouettes/circles) in `src/tools/generateTokens.ts`

Note: `@napi-rs/canvas` and `sharp` are Node-native libraries used by offline scripts, not by the browser game. They are listed under `dependencies` rather than `devDependencies`.

**Dev dependencies:**
- `typescript` `~5.9.3`
- `vite` `^8.0.1`
- `ts-node` `^10.9.2` - runs the TS asset-generation tools in ESM mode
- `@types/node` `^25.5.0`

## Configuration

**TypeScript (`tsconfig.json`):**
- `target` ES2023, `module` ESNext, `lib` ES2023 + DOM + DOM.Iterable
- `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`, `moduleDetection: "force"`
- `noEmit: true` (Vite handles emit; tsc is type-check only)
- `types: ["vite/client"]` - provides typing for `import.meta.env`
- Strictness: `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`
- `include: ["src"]`
- No separate `tsconfig.node.json` for the tooling scripts

**Vite:**
- No `vite.config.*` file present - project uses Vite defaults. Entry is `index.html` → `/src/main.ts`.

**Environment:**
- `.env.local` present (git-ignored via `*.local` in `.gitignore`). Holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see INTEGRATIONS.md). Values not documented here.

**Editor/agent config:**
- `.cursorrules`, `.claude/` present at repo root

## Scripts (`package.json`)

```bash
npm run dev               # vite (dev server)
npm run build             # tsc && vite build (type-check then bundle)
npm run preview           # vite preview (serve built dist/)
npm run generate:tokens   # ts-node --esm src/tools/generateTokens.ts
npm run generate:sprites  # ts-node --esm src/tools/generateSpritesheets.ts
```

## Platform Requirements

**Development:**
- Node.js + npm (for Vite dev server and `ts-node` asset tooling)
- A Supabase project providing the URL + anon key in `.env.local`

**Production:**
- Static hosting of the Vite `dist/` build output (`dist/` is present and git-ignored). No server runtime required beyond the Supabase backend. No CI/CD or deployment config detected in-repo.

---

*Stack analysis: 2026-06-12*
