# Codebase Concerns

**Analysis Date:** 2026-06-12

This document captures technical debt, bugs, security exposure, performance bottlenecks, and fragile areas for Path Raiders (Phaser 3 + TypeScript + Supabase). File paths are repo-relative and link directly to the source.

---

## Security Considerations

**`.env.local` is committed to git (HIGH):**
- Risk: `.env.local` is tracked in the repository (`git ls-files .env.local` returns it) despite `.gitignore` containing `*.local`. The file holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The Supabase anon key is a public client key by design, but committing it removes the ability to rotate via env without a code change and leaks the project URL/key into git history.
- Files: `.env.local`, `.gitignore`, `src/lib/supabase.ts`
- Current mitigation: None. `.gitignore` *should* exclude it but the file was committed before the rule took effect (git keeps tracking already-tracked files).
- Recommendations: `git rm --cached .env.local`, confirm `.gitignore` excludes it, rotate the Supabase anon key, and verify Row Level Security (RLS) is the real boundary (the anon key alone must never grant privileged writes).

**Client-authoritative game state — no server validation (HIGH):**
- Risk: All combat, gold, base HP, win/loss, and unit deployment are computed on the client. The "opponent" only receives `broadcast` events (`deploy`, `base_hp`, `wall_break`, `game_over`) over a Supabase Realtime channel; there is no server arbiter. Each client trusts the other's broadcasts verbatim.
- Files: `src/scenes/GameScene.ts:564` (`broadcastBaseHP`), `src/scenes/GameScene.ts:856` (`setupChannel`), `src/scenes/GameScene.ts:370` (deploy broadcast), `src/scenes/GameScene.ts:606` (`recordResult`)
- Attack surface: A modified client can broadcast `base_hp` of 0 for the opponent (`event: 'base_hp'` → instant `triggerGameOver`), spawn unlimited free units (gold is local-only), or call `recordResult('win')` to inflate `wins`/`losses` and unlock units. `recordResult` writes directly to the `profiles` table from the client.
- Recommendations: Move authoritative simulation (or at least result validation and stat writes) server-side (Supabase Edge Function / RPC with RLS). Treat all broadcasts as untrusted input. This is acceptable for a friends-only practice build but blocks any ranked/competitive mode (the lobby already advertises "1v1 RANKED · ELO rating" at `src/scenes/LobbyScene.ts:100`).

**Guest identity uses literal string `'guest'` (MEDIUM):**
- Risk: Unauthenticated players write `host_id: 'guest'` / `guest_id: 'guest'` into the `rooms` table (`gameState.userId ?? 'guest'`). Multiple concurrent guests collide on the same identifier, and `recordResult` early-returns when `userId` is null so guest results are silently dropped.
- Files: `src/scenes/LobbyScene.ts:341`, `src/scenes/LobbyScene.ts:425`, `src/scenes/GameScene.ts:607`
- Recommendations: Use Supabase anonymous auth to mint a real UUID per guest, or gate multiplayer behind sign-in.

**Supabase RLS posture is unverified (MEDIUM):**
- Risk: The client performs unrestricted `insert`/`update`/`select` on `rooms` and `profiles` (`src/scenes/LobbyScene.ts:338`, `src/scenes/GameScene.ts:636`, `src/scenes/AuthScene.ts:631`). If RLS is permissive, any user can read/modify any room or profile (e.g., overwrite another player's `wins`/`unlocked_units`).
- Files: `src/scenes/LobbyScene.ts`, `src/scenes/GameScene.ts:611-639`, `src/scenes/AuthScene.ts:631`, `src/scenes/AuthScene.ts:869`
- Current mitigation: Unknown — no SQL/migration/policy files exist in the repo to confirm RLS policies.
- Recommendations: Commit the Supabase schema + RLS policies into the repo (e.g., `supabase/migrations/`) so the security boundary is reviewable. Restrict `profiles` writes to `auth.uid() = id`.

---

## Tech Debt

**Large monolithic scene files:**
- Issue: `src/scenes/GameScene.ts` is 1100 lines and `src/scenes/AuthScene.ts` is 884 lines, mixing simulation, multiplayer transport, and large inline HTML/CSS template strings (the result overlay, HUD, and unlock toast are all built via `innerHTML` with embedded `<style>` blocks).
- Files: `src/scenes/GameScene.ts:648` (`showUnlockNotification`), `src/scenes/GameScene.ts:672` (`showResultOverlay`), `src/scenes/GameScene.ts:907` (`buildHUD`)
- Impact: Hard to test, hard to restyle, and DOM/Phaser concerns are entangled. XSS-style injection risk is low (values are app-controlled) but `username` from `profiles` is interpolated into `innerHTML` unescaped at `src/scenes/GameScene.ts:1031`.
- Fix approach: Extract HUD/overlay builders into dedicated modules; escape any user-sourced string before `innerHTML`.

**Duplicated faction/role mapping logic:**
- Issue: `opponentFaction`, host/guest faction resolution, and the `role === 'guest'` swap are reimplemented in `drawBasePlacements`, `drawTowers`, and `updateAI`.
- Files: `src/scenes/GameScene.ts:243-247`, `src/scenes/GameScene.ts:296-300`, `src/scenes/GameScene.ts:318` (`opponentFaction`)
- Impact: Divergence risk when faction rules change.
- Fix approach: Centralize faction/side resolution in one helper (or `src/lib/gameState.ts`).

**`as any` cast on faction assignment:**
- Issue: `gameState.playerFaction = data.playerFaction as any` bypasses the `Faction` union type.
- Files: `src/scenes/PlacementScene.ts:34`
- Fix approach: Type `PlacementData.playerFaction` as `Faction`.

**Unimplemented game modes advertised in UI:**
- Issue: The lobby shows 1v1 Ranked, Co-op Raid, 3-Way War, and Survival as selectable cards, but every mode routes to the same room-code/practice flow. Settings button is a no-op stub.
- Files: `src/scenes/LobbyScene.ts:99-104`, `src/scenes/LobbyScene.ts:212-218` (`lobby-settings` stub: "Settings stub — future phase")
- Impact: Misleading UX; modes do nothing distinct.
- Fix approach: Disable/label unbuilt modes, or implement matchmaking behind them.

**Unlock-threshold logic duplicated across scenes:**
- Issue: Win-count → unit thresholds (assault_bot@2, thorn_beast@3, elementalist@5) are hardcoded in two places.
- Files: `src/scenes/GameScene.ts:623-627`, `src/scenes/LoadoutScene.ts:129`
- Fix approach: Define thresholds once in `src/units/UnitData.ts` and import.

---

## Known Bugs / Fragile Areas

**Recently fixed: units dying instantly on disconnected base slots:**
- Status: Fixed in commit `8f10196`. Root cause was BFS isolation of base_zone cells at slots 0/2 surrounded by non-walkable terrain → `findPath` returned `[]` → `isAtGoal()` was `0 >= 0 === true` on frame 1 → instant base damage + death.
- Files: `src/lib/pathfinder.ts:9` (`BASE_ROWS` now always traversable), `src/scenes/GameScene.ts:490-495` (empty-waypoints guard)
- Residual fragility: The fix makes **all** of rows 0,1,14,15 freely walkable regardless of terrain (`isWalkable` returns `true` for any cell in `BASE_ROWS`). This bypasses walls/water/lava on those rows and could let units cross the full board width through the base corridor in unintended ways. Verify no map places blocking terrain on edge rows expecting it to block.

**Empty-path units silently retry forever:**
- Issue: When `findPath` returns `[]`, the unit calls `recomputeUnitPath` every frame (`src/scenes/GameScene.ts:491-494`). If the goal is genuinely unreachable (e.g., fully walled with no breakable wall for that faction), the unit idles indefinitely, consuming gold and never resolving. No timeout/fallback.
- Files: `src/scenes/GameScene.ts:490`, `src/lib/pathfinder.ts:45`
- Fix approach: Cap retries, then either despawn or force a base-reach fallback.

**Multiplayer desync — independent simulations:**
- Issue: Host and guest each run their own `update()` loop. Towers, AI-free combat resolution, gold, and timer all run locally and are never reconciled. Only deploys, wall-breaks, base HP, and game-over are broadcast. Combat outcomes (which unit dies when two armies meet) are computed independently on each client and will diverge; `base_hp` broadcasts paper over the divergence by overwriting the receiver's value.
- Files: `src/scenes/GameScene.ts:385` (`update`), `src/scenes/GameScene.ts:452` (`updateUnits`), `src/scenes/GameScene.ts:525` (`updateTowers`)
- Impact: The two players can see materially different battles; the authoritative-looking `base_hp` race can flip a result. Last-writer-wins on `base_hp` (both sides send) can also cause HP to bounce.
- Fix approach: Single authority for combat, or deterministic lockstep with a shared seed/tick.

**Placement map-sync race:**
- Issue: Host broadcasts the authoritative `mapId` only inside the channel `subscribe` callback (`src/scenes/PlacementScene.ts:218-227`). If the guest subscribes after the host's broadcast fires, the guest keeps its locally-randomized map (`init` picks `Math.floor(Math.random() * MAPS.length)`), causing host and guest to play different maps. There is no re-request or ack.
- Files: `src/scenes/PlacementScene.ts:35`, `src/scenes/PlacementScene.ts:196-209`, `src/scenes/PlacementScene.ts:218`
- Fix approach: Have the guest request the map on subscribe, or persist `map_id` on the `rooms` row and read it.

**"Play Again" re-randomizes map without sync:**
- Issue: The result overlay's "Play Again" restarts `PlacementScene` with `mapId: Math.floor(Math.random() * 10)` computed independently per client, so a rematch can start on mismatched maps.
- Files: `src/scenes/GameScene.ts:765`, `src/scenes/PlacementScene.ts:249`
- Fix approach: Host-authoritative rematch map, broadcast before launch.

**Channel naming inconsistency across scenes:**
- Issue: Channels use `room-${roomId}` (Lobby), `placement:${roomId}` (Placement), and `game:${roomId}` (Game). Harmless today but easy to mistype; no shared constant.
- Files: `src/scenes/LobbyScene.ts:370`, `src/scenes/PlacementScene.ts:195`, `src/scenes/GameScene.ts:859`
- Fix approach: Centralize channel name builders.

---

## Performance Bottlenecks

**O(n²) combat scanning every frame:**
- Problem: `updateUnits` runs, for every unit, a `filter` + `sort` over all enemy units using `Math.hypot` (`src/scenes/GameScene.ts:475-477`). `updateTowers` does the same per tower (`src/scenes/GameScene.ts:532-537`). With 6 towers and large armies this is repeated per frame.
- Files: `src/scenes/GameScene.ts:452`, `src/scenes/GameScene.ts:525`
- Cause: Full pairwise distance scans + sort to pick nearest.
- Improvement path: Spatial partitioning (grid buckets) or a single nearest-pass without sorting; cache distances.

**Full wall layer redraw on every wall hit:**
- Problem: `damageWall` calls `drawWallOverlays`, which clears and redraws every wall cell across the entire `ROWS × COLS` grid plus all HP bars, on each hit tick.
- Files: `src/scenes/GameScene.ts:798-804`, `src/scenes/GameScene.ts:822`
- Improvement path: Redraw only the affected cell, or throttle.

**Path recomputation storm on wall break:**
- Problem: `breakWall` calls `recomputeUnitPath` (full BFS) for *every* unit on the board on each break (`src/scenes/GameScene.ts:818-819`), and `assignPath` rebuilds the goal cell list each time.
- Files: `src/scenes/GameScene.ts:808`, `src/scenes/GameScene.ts:778`
- Improvement path: Recompute lazily (only when a unit's current path crosses the broken cell) or debounce.

---

## Test Coverage Gaps

**No automated tests anywhere (HIGH):**
- What's not tested: There are zero `*.test.*` / `*.spec.*` files and no test runner in `package.json` (only `dev`/`build`/`preview` + sprite generators).
- Files: `package.json` (no test script/dep), entire `src/` tree
- Highest-risk untested logic: `src/lib/pathfinder.ts` (BFS + two-phase wall fallback — directly caused the `8f10196` instant-death bug), `src/scenes/GameScene.ts` combat/gold/win resolution, and the placement/map-sync handshake.
- Recommendation: Add Vitest (already using Vite). Start with pure-function unit tests for `pathfinder.ts` (`findPath`, `isWalkable`, `canBreakWall`) and `UnitData`/threshold logic, then integration tests for broadcast handlers.

---

## Hardcoded Values

**Magic numbers scattered through gameplay:**
- Issue: Base HP `1000`, gold start `200`, round time `180`s, gold tick `+10/2000ms` cap `9999`, `BASE_REACH_DMG = 60`, `COMBAT_RANGE = 52`, tower range/dmg/cd (`6*CELL`/`25`/`1400`), wall HP (`250`/`200`), AI interval `6000ms`, and `Math.random() * 10` map selection are inlined.
- Files: `src/scenes/GameScene.ts:74-92`, `src/scenes/GameScene.ts:167-169`, `src/scenes/GameScene.ts:18-19`, `src/units/Unit.ts:8-9`, `src/scenes/LobbyScene.ts:318`
- Note: `Math.random() * 10` assumes exactly 10 maps; `init` elsewhere uses `MAPS.length`. If `MAPS` shrinks, the lobby/result paths can pick an out-of-range id and silently fall back to `MAPS[0]`.
- Impact: Balance tuning requires editing scene internals; inconsistent map-count assumptions.
- Fix approach: Extract a `BALANCE`/`config` module; derive map index from `MAPS.length` everywhere.

---

## Dependencies at Risk

**Heavy native build deps in app dependency tree:**
- Risk: `@napi-rs/canvas` and `sharp` are listed under `dependencies` (not `devDependencies`) but are only used by the offline sprite/token generators in `src/tools/`. They pull native binaries and bloat installs/deploys.
- Files: `package.json`, `src/tools/generateSpritesheets.ts`, `src/tools/generateTokens.ts`
- Fix approach: Move `@napi-rs/canvas` and `sharp` to `devDependencies`.

**Pre-release major versions pinned:**
- Risk: `vite ^8.0.1` and `@types/node ^25.5.0` are unusually high/bleeding-edge majors; ecosystem plugin compatibility may be unstable.
- Files: `package.json`
- Fix approach: Verify these resolve to intended stable releases; pin if churn is observed.

---

## Dev Artifacts (Untracked / Informational)

**`SPRITE_PIPELINE.md` and `public/dev-preview.html`:**
- `SPRITE_PIPELINE.md` (root) documents the token/spritesheet generation workflow — a dev-only doc, currently untracked.
- `public/dev-preview.html` (~34 KB) is a standalone dev preview page. Because it lives in `public/`, Vite will copy it into the production build and it will be publicly servable at `/dev-preview.html` unless removed.
- Files: `SPRITE_PIPELINE.md`, `public/dev-preview.html`
- Recommendation: Decide whether to commit `SPRITE_PIPELINE.md` to `docs/`, and move `dev-preview.html` out of `public/` (or exclude from build) so it is not shipped to production.

---

## Uncommitted / Untracked Working-Tree State

At analysis time the working tree has modified-but-uncommitted changes and one new untracked scene. This is unreviewed, unmerged work that other GSD phases should not assume is final.

**Modified (uncommitted):**
- `src/lib/gameState.ts` (+loadout/slot/map fields), `src/main.ts` (+LoadoutScene registration), `src/scenes/AuthScene.ts`, `src/scenes/GameScene.ts` (largest delta, +76 lines), `src/scenes/LobbyScene.ts`, `src/scenes/PlacementScene.ts`, `src/types/index.ts`, `src/units/UnitData.ts`
- Diff summary: 8 files, +93/-28 lines (`git diff --stat`).

**Untracked (new):**
- `src/scenes/LoadoutScene.ts` (183 lines) — referenced by `src/main.ts` and launched from `PlacementScene`, but never committed. If `main.ts` changes are staged without this file, the build breaks.

**Line-ending churn:** Git reports LF→CRLF conversion warnings on most edited files. Inconsistent line endings will produce noisy diffs.
- Recommendation: Commit `LoadoutScene.ts` together with its `main.ts`/`PlacementScene.ts` wiring as one coherent change, and add a `.gitattributes` with `* text=auto eol=lf` to normalize line endings.

---

*Concerns audit: 2026-06-12*
