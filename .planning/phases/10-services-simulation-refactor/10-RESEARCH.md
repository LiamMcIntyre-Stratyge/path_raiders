# Phase 10: Services & Simulation Refactor — Research

**Researched:** 2026-06-12
**Domain:** TypeScript simulation extraction, Phaser scene decoupling, Vitest characterization testing
**Confidence:** HIGH (all findings verified against live source code)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sim purity & boundary (keystone)**
- D-01: `src/sim/` is a pure, framework-agnostic module — plain TypeScript state (`world` struct with entity arrays) and a `step(world, inputs, dt, rng)` function that mutates/advances state and returns discrete events. Zero Phaser imports, zero Supabase imports. `GameScene` becomes a thin renderer that drives the sim each frame. Suggested shape: `src/sim/world.ts` (state), `src/sim/step.ts` (tick), `src/sim/combat.ts` (attack resolution), `src/sim/types.ts` (`SimUnit`, `SimTower`).
- D-02: Split `Unit.ts` — today `Unit extends Phaser.GameObjects.Container` holding both data and rendering. Separate a plain `SimUnit` struct (id, x, y, hp, waypoints, wpIdx, dir, laneSlot, attackCd, …) in `src/sim/` from a `UnitView` (Phaser Container / sprite + HP graphics) keyed by id in `src/units/`. The sim struct is the source of truth; the view renders it.
- D-03: Renderer sync = reconcile + events. Each frame the renderer diffs the sim entity list by id (create/move/remove views, update HP bars) for continuous state, AND consumes discrete events the sim emits (death, wall_break, base_hit) for one-shots (SFX, death animations, screen shake).
- D-04: Sim is transport-free; the scene owns networking. The sim consumes `inputs` (local + remote deploys as plain intents) and emits events; the scene/networking layer maps events ↔ Supabase broadcasts. The same wire protocol is preserved (`deploy`, `wall_break`, `base_hp`, `game_over`) — behavior-preserving, and it sets up Phase 14's report submission. The sim never imports `supabase`.

**Determinism groundwork — seams now, switch in Phase 14**
- D-05: Build determinism seams now without changing outcomes. Do NOT activate determinism in this phase.
- D-06: Inject `rng` as a dependency into the sim (`step(world, inputs, dt, rng = Math.random)`). The only sim RNG today is practice-AI spawning (`GameScene.updateAI` at `:434/:437`); combat has no RNG.
- D-07: Add a deterministic id-tiebreak to the nearest-target sort (units `:477`, towers `:535`): `sort((a,b) => dist(a)-dist(b) || (a.id < b.id ? -1 : 1))`. Flagged intentional micro behavior-change for exact distance ties only.
- D-08: Keep variable `dt` (preserve today's feel exactly) but route all of it through the single `step(world, inputs, dt, rng)` entry point.

**Towers module shape**
- D-09: Mirror the new split abstraction: `src/towers/TowerData.ts` (static stats) + `src/towers/TowerView.ts` (Phaser rendering) + tower targeting/firing logic in `src/sim/` as `SimTower` structs.
- D-10: `TowerData` is a flat static table now (range `6*CELL`, dmg `25`, cd `1400`ms). Do NOT model per-level upgrade scaling.
- D-11: Centralize the duplicated side/faction-resolution helper (currently at `:243-247/:296-300/:318`). Extract one pure helper `resolveSide(role) -> { hostFaction, guestFaction, dir }`.

**gameState reduction**
- D-12: Sim world is the source of truth for live battle state — `hostBaseHp`, `guestBaseHp`, `gold` (and units/towers/walls) become fields on the sim `world`. The HUD reads them from the sim each frame. `gameState` no longer carries live battle values.
- D-13: Persistent profile fields = read-through cache via the existing seam. `userId`, `username`, `unlockedUnits`, `wins`, `losses` are hydrated into `gameState` from `src/lib/api/account`.
- D-14: Single slimmed `gameState` object holds session context (`roomId`, `role`, `faction`, `mapId`, `hostSlot`, `guestSlot`) + the read-through profile cache. Documented as a cache, not the mutated source of truth for battle.

**Verification strategy**
- D-15: Characterization snapshot + targeted unit tests in the Phase 9 Vitest harness.
- D-16: Parity gate vs old behavior = the existing manual two-session playtest. Frame-identical automated diff is not practical.
- D-17: Test scenario coverage (all four selected): (a) unit movement along waypoints; (b) combat — two units fight, lower-HP dies (nearest-target w/ new id tiebreak, cooldowns, takeDamage/death); (c) win by base-reach AND by timer expiry; (d) wall-break detour integrating `pathfinder.ts`.

### Claude's Discretion
- Exact file/module layout within `src/sim/`, `src/units/`, `src/towers/`; the precise `world`/`SimUnit`/`SimTower` field sets; the event type taxonomy; the renderer's reconcile implementation; snapshot serialization format; and how `inputs` are modelled.
- Whether to extract HUD/overlay HTML builders into separate modules in this phase is optional/Claude's call.

### Deferred Ideas (OUT OF SCOPE)
- Fixed-timestep loop, seeded-RNG activation, host/guest lockstep, signed match reports → Phase 14.
- Tower & unit upgrade levels + server-side balance config → Phase 12.
- Moving result/economy writes server-side → Phase 11 / Phase 14.
- Extracting HUD/overlay inline HTML/CSS into modules — optional/out of named scope.
- O(n²) combat scan optimization (spatial buckets) — not required for behavior-preserving extraction.
- Automated old-vs-new behavior diff — rejected as impractical (D-16).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BATTLE-02 | The battle loop is extracted from `GameScene` into a standalone, unit-tested simulation module (`src/sim/`). | All 8 focus questions answered with line-level anchors. Confirmed: pure extraction is feasible with no wire-protocol change. Unit test harness (Vitest) already exists from Phase 9. |
</phase_requirements>

---

## Summary

Phase 10 extracts the battle simulation from `GameScene.ts` (currently ~1100 lines mixing rendering, physics, networking, and persistence) into a pure TypeScript `src/sim/` module with zero Phaser and zero Supabase imports. The extraction is behavior-preserving except for one flagged micro-change: a deterministic id-tiebreak in nearest-target sorts (D-07).

The code has been read in full. The extraction seam is well-defined: `update(_t, dt)` calls five private methods (`updateGold`, `updateTimer`, `updateAI`, `updateUnits`, `updateTowers`), all of which operate purely on GameScene instance fields. The sim `world` replaces those fields; `step(world, inputs, dt, rng)` replaces those five calls. The renderer reconciles views against the returned world state and plays discrete events.

The Phase 9 Vitest harness (`test/unit/`, `vitest.config.ts`, `tsconfig.test.json`) is already in place and the four D-17 test scenarios map cleanly to pure-function calls on the new sim module. No new test infrastructure is needed — only new test files under `test/unit/sim/`.

**Primary recommendation:** Extract incrementally — towers first (smallest, most isolated), then the sim world struct + unit logic, then wire `GameScene` to the sim, then slim `gameState`, then write tests. Each step is independently verifiable.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Battle physics (movement, combat, wall-break, base reach) | `src/sim/` (pure TS) | — | Zero-dependency; testable without Phaser or network |
| Practice-AI spawning (RNG) | `src/sim/step.ts` | — | `rng` is injected; AI is part of the tick |
| Gold accumulation + timer | `src/sim/step.ts` | — | Pure math on world fields |
| Entity rendering (sprites, HP bars, animations) | `GameScene` / `UnitView` / `TowerView` | — | Phaser Container lifecycle; cannot be pure |
| Network I/O (broadcast send/receive) | `GameScene` | — | Supabase imports forbidden in sim |
| Persistence (recordResult, profile reads) | `src/lib/api/account` | `gameState` cache | Phase 9 seam; sim is persistence-free |
| Session/match context | `gameState` (slimmed) | — | Shared singleton read by HUD and scene transitions |
| Live battle state (base HP, gold, units, towers, walls) | `src/sim/world` | — | Moves off `gameState` onto sim world |

---

## Standard Stack

### Core (no new packages required)

This phase is a pure refactor — it creates new files but installs zero new dependencies.

| Library | Current Version | Purpose | Status |
|---------|----------------|---------|--------|
| TypeScript | ~5.9.3 | All new `src/sim/` modules | Already installed |
| Vitest | ^4.1.8 | Sim unit tests (D-15/D-17) | Already installed (Phase 9) |
| Phaser 3 | ^3.90.0 | `UnitView`, `TowerView` (render only) | Already installed |

**No npm install step for this phase.**

---

## Package Legitimacy Audit

> No new external packages are installed in this phase. This section is intentionally empty.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  GameScene.update(dt)   [Phaser tick — thin renderer]           │
│                                                                  │
│  1. Collect inputs        inputs: DeployIntent[]                 │
│      (local + broadcast)  ─────────────────────────►           │
│                           ┌──────────────────────────┐          │
│  2. Advance sim           │  step(world, inputs,     │          │
│      step() ────────────► │       dt, rng)           │          │
│                           │  src/sim/step.ts         │          │
│                           │  ├── updateGold          │          │
│                           │  ├── updateTimer         │          │
│                           │  ├── spawnAI (rng)       │          │
│                           │  ├── processUnits        │          │
│                           │  │   src/sim/combat.ts   │          │
│                           │  └── processTowers       │          │
│                           └──────────┬───────────────┘          │
│                                      │ returns SimEvent[]        │
│  3. Reconcile views    ◄─────────────┘                           │
│      diff world.units by id                                      │
│      create/move/destroy UnitView                                │
│      update HP bars                                              │
│                                                                  │
│  4. Play events                                                   │
│      death → kill animation (UnitView)                           │
│      wall_break → audio + camera shake + path recompute          │
│      base_hit → audio + camera shake + HUD update                │
│      game_over → triggerGameOver                                 │
│                                                                  │
│  5. Broadcast outgoing events to Supabase channel                │
│      (wall_break, base_hp, game_over — same wire protocol)       │
└─────────────────────────────────────────────────────────────────┘

External inputs:
  Supabase broadcast 'deploy'     → DeployIntent pushed into inputs queue
  Supabase broadcast 'wall_break' → WallBreakIntent pushed into inputs queue
  Supabase broadcast 'base_hp'    → BaseHpIntent pushed (or direct state override)
  Supabase broadcast 'game_over'  → GameOverIntent
```

### Recommended Project Structure After Phase 10

```
src/
├── sim/
│   ├── types.ts        # SimUnit, SimTower, SimWorld, SimEvent, DeployIntent
│   ├── world.ts        # createWorld(), world field definitions, SimEvent type
│   ├── step.ts         # step(world, inputs, dt, rng) — the single tick entry point
│   └── combat.ts       # attack resolution, takeDamage, nearest-target logic
├── units/
│   ├── UnitData.ts     # unchanged — static UNITS definitions
│   ├── UnitView.ts     # NEW — Phaser Container subclass, keyed by SimUnit.id
│   └── Unit.ts         # DELETED or kept as thin re-export during migration
├── towers/
│   ├── TowerData.ts    # NEW — TOWER_RANGE, TOWER_DMG, TOWER_CD flat constants
│   └── TowerView.ts    # NEW — Phaser Graphics render for a tower position
├── lib/
│   ├── gameState.ts    # SLIMMED — session + profile cache only (no battle fields)
│   ├── api/
│   │   ├── account.ts  # unchanged (Phase 9 seam)
│   │   ├── rooms.ts    # unchanged
│   │   └── wallet.ts   # unchanged
│   ├── supabase.ts     # unchanged
│   ├── pathfinder.ts   # unchanged — sim calls this directly
│   └── audio.ts        # unchanged — GameScene calls this on sim events
├── scenes/
│   └── GameScene.ts    # THINNED — renderer + network + input only
└── types/
    └── index.ts        # GameStateType updated (battle fields removed)
test/
└── unit/
    └── sim/
        ├── movement.test.ts      # D-17 (a): waypoint stepping
        ├── combat.test.ts        # D-17 (b): two units fight, lower-HP dies
        ├── win.test.ts           # D-17 (c): base-reach + timer-expiry
        ├── wall-break.test.ts    # D-17 (d): detour + pathfinder integration
        └── snapshot.test.ts     # D-15: characterization snapshot regression
```

### Pattern 1: SimUnit struct (pure data, no Phaser)

The current `Unit` class mixes data and rendering. The split is:

**Sim fields (move to `SimUnit` in `src/sim/types.ts`):**
```typescript
// [VERIFIED: read from src/units/Unit.ts]
interface SimUnit {
  id: string             // add: stable id for reconcile (UUID or counter)
  defId: string          // maps to UNITS entry (replaces carrying full def)
  faction: string        // copied from def at spawn
  x: number
  y: number
  hp: number
  maxHp: number
  dir: 1 | -1
  laneSlot: number       // 0 | 1 | 2
  attackCd: number       // ms countdown
  attackRate: number     // copied from def (default 900ms)
  speedPx: number        // copied from def
  dmg: number            // copied from def
  waypoints: { x: number; y: number }[]
  wpIdx: number
  wallTarget: [number, number] | null   // [row, col]
  dead: boolean
}
```

**View fields (stay in `UnitView` in `src/units/UnitView.ts`):**
- `Phaser.GameObjects.Container` inheritance
- Sprite image (token), HP graphics object
- `flashHit()`, `popIn()`, kill animation (`tweens.add`, explosion burst)
- `drawHP()` graphics calls
- `scene.add.existing(this)`, depth, tint

**Reconcile pattern (GameScene, each frame):**
```typescript
// [ASSUMED] — pattern derived from D-03, no existing reconcile code
function reconcileUnits(
  world: SimWorld,
  views: Map<string, UnitView>,
  scene: Phaser.Scene,
) {
  const liveIds = new Set<string>()
  for (const u of [...world.hostUnits, ...world.guestUnits]) {
    liveIds.add(u.id)
    let view = views.get(u.id)
    if (!view) {
      view = new UnitView(scene, u.x, u.y, UNITS.find(d => d.id === u.defId)!, u.laneSlot, u.dir)
      views.set(u.id, view)
    }
    view.syncFrom(u)  // update position, hp bar
  }
  for (const [id, view] of views) {
    if (!liveIds.has(id)) {
      view.playDeathAnimation()  // then destroy
      views.delete(id)
    }
  }
}
```

### Pattern 2: SimEvent taxonomy

Events the sim emits that the renderer/network must consume:

```typescript
// [ASSUMED] — derived from tracing all side-effect call sites in GameScene
type SimEvent =
  | { type: 'unit_died';    unitId: string; x: number; y: number; faction: string }
  | { type: 'wall_break';   row: number; col: number }
  | { type: 'base_hit';     side: 'host' | 'guest'; newHp: number }
  | { type: 'game_over';    winner: 'host' | 'guest' | 'tie' }
```

**Where each event is currently fired (verified from GameScene.ts source):**

| Event | Current code location | Action taken |
|-------|----------------------|--------------|
| `unit_died` | `Unit.kill()` called inside `takeDamage` | Move to sim; `dead=true` flag returned in SimUnit |
| `wall_break` | `GameScene.breakWall(:779)` | Sim mutates `world.mutableOver`, emits event |
| `base_hit` | `GameScene.damageBase(:546/:556)` | Sim decrements `world.hostBaseHp/guestBaseHp`, emits event |
| `game_over` | `GameScene.triggerGameOver(:585)` | Sim sets `world.over = true`, emits event |

### Pattern 3: `step()` function structure

```typescript
// [ASSUMED] — derived from reading the five updateX() methods in GameScene
function step(
  world: SimWorld,
  inputs: SimInput[],
  dt: number,
  rng: () => number = Math.random,
): SimEvent[] {
  const events: SimEvent[] = []

  // 1. Apply inputs (deploys from local + remote)
  for (const input of inputs) {
    if (input.type === 'deploy') spawnUnit(world, input)
    else if (input.type === 'wall_break') applyWallBreak(world, input.row, input.col)
  }

  // 2. Gold accumulation (updateGold :400-408)
  world.goldAccum += dt
  while (world.goldAccum >= 2000) {
    world.goldAccum -= 2000
    world.gold = Math.min(world.gold + 10, 9999)
  }

  // 3. Timer (updateTimer :411-423)
  world.timeLeft = Math.max(0, world.timeLeft - dt / 1000)
  if (world.timeLeft <= 0 && !world.over) {
    const winner = world.hostBaseHp > world.guestBaseHp ? 'host'
                 : world.guestBaseHp > world.hostBaseHp ? 'guest' : 'tie'
    world.over = true
    events.push({ type: 'game_over', winner })
  }

  // 4. AI spawn (updateAI :425-450)
  if (world.isPractice) {
    world.aiTimer += dt
    if (world.aiTimer >= world.aiInterval) {
      world.aiTimer = 0
      spawnAI(world, rng, events)
    }
  }

  // 5. Units (updateUnits :453-523)
  processUnits(world, events, dt)

  // 6. Towers (updateTowers :526-543)
  processTowers(world, events, dt)

  // 7. Prune dead units
  world.hostUnits  = world.hostUnits.filter(u => !u.dead)
  world.guestUnits = world.guestUnits.filter(u => !u.dead)

  return events
}
```

### Pattern 4: `SimWorld` struct fields

Fields moving FROM GameScene private members / gameState ONTO the world:

```typescript
// [VERIFIED: read from GameScene.ts fields :66-113 and gameState.ts]
interface SimWorld {
  // From GameScene private fields
  gold: number             // was: this.gold + gameState.gold (D-12 removes from gameState)
  goldAccum: number        // was: this.goldAccum
  timeLeft: number         // was: this.timeLeft
  hostBaseHp: number       // was: this.hostBaseHP + gameState.hostBaseHp
  guestBaseHp: number      // was: this.guestBaseHP + gameState.guestBaseHp
  hostUnits: SimUnit[]     // was: this.hostUnits (Unit[])
  guestUnits: SimUnit[]    // was: this.guestUnits (Unit[])
  towers: SimTower[]       // was: this.towers (TowerDef[])
  mutableOver: (OverlayType)[][]  // was: this.mutableOver
  wallHP: Map<string, number>     // was: this.wallHP
  over: boolean            // was: this.gameOver
  // Practice mode flag (for AI spawner)
  isPractice: boolean
  aiTimer: number          // was: this.aiTimer
  aiInterval: number       // was: this.aiInterval
  // Config (from init — slot/map context needed for pathfinding)
  hostSlot: number
  guestSlot: number
  mapBase: TerrainType[][]
  // Phase 14 seam: rng and tick counter (unused in Phase 10)
  tickCount: number        // increment each step() call — Phase 14 seam
}
```

### Pattern 5: Inputs model

```typescript
// [ASSUMED] — derived from broadcast handlers at :830-866
type SimInput =
  | { type: 'deploy';     unitId: string; slot: number; role: 'host' | 'guest' }
  | { type: 'wall_break'; row: number; col: number }
  // base_hp and game_over are OUTPUTS (events), not inputs;
  // the scene applies them directly to world rather than routing through step().
  // In Phase 14, base_hp becomes a derived event rather than a broadcast.
```

### Pattern 6: gameState after slimming (D-12/D-14)

**REMOVE from `GameStateType`:**
- `hostBaseHp: number` — moves to `world.hostBaseHp`
- `guestBaseHp: number` — moves to `world.guestBaseHp`
- `gold: number` — moves to `world.gold`
- `gameMode: 'topdown' | 'portrait'` — unused in current battle code [VERIFIED: never read in GameScene.ts]

**KEEP in `GameStateType`:**
- `userId`, `username` — session identity
- `playerFaction` — session context
- `unlockedUnits`, `loadout` — profile cache (hydrated from api/account)
- `wins`, `losses` — profile cache (written back after recordResult)
- `roomId`, `role` — session context
- `mapId`, `hostSlot`, `guestSlot` — session context (passed to GameScene.init)

### Anti-Patterns to Avoid

- **Writing to gameState inside the sim:** `step()` must never touch `gameState`. The scene reads `world` after `step()` returns and updates `gameState` selectively (only if cross-scene persistence is needed — but battle fields no longer need it).
- **Importing Phaser in `src/sim/`:** Creates Phaser dependency in Node-land test runner. All Phaser types must stay in `src/units/UnitView.ts`, `src/towers/TowerView.ts`, and `src/scenes/GameScene.ts`.
- **Importing supabase in `src/sim/`:** Verified: the supabase client is currently imported at GameScene.ts:2. The sim must never import it.
- **Reconcile by array position:** The renderer must reconcile by `SimUnit.id`, not by position in `hostUnits[]`. Array order changes when units die and are pruned.
- **Mutating world.mutableOver from the renderer:** Only `step()` should mutate world state. The renderer is read-only.
- **Using `Unit.takeDamage` to trigger death animation from inside sim:** `takeDamage` in the current `Unit` class directly spawns Phaser tweens (`:117-144`). The sim must return a `unit_died` event; the renderer plays the animation.
- **Losing the `wallTarget` guard:** The current `updateUnits` checks `unit.wallTarget` first, before combat scan. This order is load-bearing — a unit targeting a wall should not also engage in combat that frame. Preserve this in `processUnits`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grid pathfinding | Custom BFS in sim | `src/lib/pathfinder.ts` (`findPath`) | Already pure/deterministic, Phase 9 tested |
| Unit test runner | Custom test harness | Vitest (already configured) | Phase 9 harness: `test/unit/`, `vitest.config.ts`, `tsconfig.test.json` |
| Snapshot serialization | Custom JSON differ | `expect(x).toMatchSnapshot()` built into Vitest | Standard; snapshots stored in `__snapshots__/` |
| Faction-to-color mapping | Inline repeat | `FC` lookup table already in `GameScene.ts:51` (move to `TowerView.ts`) | Already defined |
| Id generation | Timestamp collision hack | Simple monotonic counter per world (`world.nextId++`) | Deterministic, no UUID lib needed |

**Key insight:** The sim needs zero new packages. Every dependency it has is either already in `src/lib/` (pathfinder) or is plain TypeScript arithmetic.

---

## Focus Question Answers

### Q1: Extraction seam — `GameScene.update` data flow

**Verified from source (GameScene.ts:386-398):**

```
update(_t, dt) {
  if (paused || gameOver) return          // guard
  updateGold(dt)   → this.gold, this.goldAccum, gameState.gold, DOM
  updateTimer(dt)  → this.timeLeft, DOM, → triggerGameOver if expired
  updateAI(dt)     → this.aiTimer, Math.random(), new Unit(), this.guestUnits/hostUnits
  updateUnits(dt)  → wallHP, mutableOver, unit.{x,y,hp,attackCd,waypoints,wpIdx,wallTarget}
                     → damageBase(), audio.playHit(), audio.playWallHit()
  updateTowers(dt) → tower.cd, unit.takeDamage(), audio.playHit()
  prune dead units
}
```

**Cleanest lift:** Replace the five method calls with `const events = step(this.world, this.pendingInputs, dt, Math.random)`, then loop `events` for renderer side-effects. `this.pendingInputs` is drained each frame.

### Q2: Unit field split — verified from `Unit.ts`

**Pure sim state (all readable without Phaser):**
- `def.id`, `def.faction`, `def.hp`, `def.dmg`, `def.speedPx`, `def.cost` → flatten into SimUnit
- `laneSlot` (readonly)
- `dir` (readonly)
- `hp`, `maxHp`
- `attackCd`, `attackRate` (default 900ms)
- `waypoints[]`, `wpIdx`
- `wallTarget: [number, number] | null`
- `dead: boolean` (currently `private` — must be promoted to a flag the sim owns)

**Phaser view state (cannot test without Phaser):**
- `Phaser.GameObjects.Container` superclass, `scene`, `add(img)`, `add(hpGfx)`, `setDepth(10)`
- `hpGfx: Phaser.GameObjects.Graphics` — the HP bar drawing (`drawHP()`)
- `flashHit()` — tint + `delayedCall`
- `popIn()` — `tweens.add` scale animation
- `kill()` private — explosion Graphics + tween + `destroy()`
- `setWaypoints` is pure logic, can move to sim
- `moveStep(dt)` is pure position math, can move to sim (`step` → `moveUnit(u, dt)`)
- `isAtGoal()` is pure, can move to sim
- `isDead()` is pure, can move to sim

### Q3: Events taxonomy — verified by tracing call sites

Every one-shot in GameScene that the renderer/network needs:

| Event | Trigger in current code | Line | Renderer action | Network action |
|-------|------------------------|------|-----------------|----------------|
| `unit_died` | `Unit.takeDamage → kill()` | `:87-91` | Death animation + destroy view | None |
| `wall_break` | `breakWall()` | `:779` | `drawWallOverlays()`, camera shake, audio, path recompute | Broadcast `wall_break` if not practice |
| `base_hit` | `damageBase()` | `:546/:556` | Camera shake, audio, HUD update | Broadcast `base_hp` |
| `game_over` | `triggerGameOver()` | `:585` | `showResultOverlay()`, audio | Broadcast `game_over` if not practice; call `recordResult` |

No other one-shot events exist. Gold and timer are continuous state (HUD polls `world.gold`, `world.timeLeft`).

### Q4: Network preservation — wire protocol byte-preserved

**Current wire events (verified from `setupChannel` at :827-866):**

| Broadcast event | Payload shape | Direction | Current trigger |
|-----------------|---------------|-----------|-----------------|
| `deploy` | `{ unitId, slot, role }` | both → both | After local deploy (:371) |
| `wall_break` | `{ row, col }` | local → opponent | After `breakWall` (:787) |
| `base_hp` | `{ side, hp }` | local → opponent | After `damageBase` (:565-568) |
| `game_over` | `{ winner }` | local → opponent | After `triggerGameOver` (:589-591) |

**After extraction:**
- `deploy` broadcasts map to `DeployIntent` pushed into `pendingInputs` queue; both local and received deploys flow through `step()` as inputs
- `wall_break` received: push `WallBreakIntent` into inputs queue; `step()` applies it (or handle directly as world mutation outside step — simpler for Phase 10)
- `base_hp` received: the opponent's `base_hp` is trust-and-overwrite today (:848-859). Phase 10 preserves this: when the scene receives `base_hp`, it directly sets `world.hostBaseHp` / `world.guestBaseHp`. The sim does NOT broadcast base_hp for the opponent's base — only local base damage is broadcast.
- `game_over` received: triggers `triggerGameOver` directly in scene (no sim input needed)

The sim never imports supabase. The scene reads sim events and calls `channel.send()`.

### Q5: gameState reduction — what moves where

**GameState fields that become `world` fields (D-12):**

| Field in `gameState` today | Destination | Notes |
|---------------------------|-------------|-------|
| `hostBaseHp: number` | `world.hostBaseHp` | Initialized to 1000 in `createWorld()` |
| `guestBaseHp: number` | `world.guestBaseHp` | Same |
| `gold: number` | `world.gold` | Currently set in `init()` from gameState.gold |

**GameState fields that STAY (D-14, session + profile cache):**

| Field | Category | Notes |
|-------|----------|-------|
| `userId` | session identity | Required for `recordResult` |
| `username` | profile cache | HUD display |
| `playerFaction` | session | Passed from LoadoutScene |
| `unlockedUnits` | profile cache | HUD deploy slots |
| `loadout` | session | HUD deploy slots |
| `wins`, `losses` | profile cache | Written back by `recordResult` |
| `roomId` | session | Network / practice mode check |
| `role` | session | 'host' \| 'guest' |
| `mapId`, `hostSlot`, `guestSlot` | session | Needed by GameScene.init and post-game "Play Again" |

**Field being REMOVED (not session, not profile cache, not battle world):**
- `gameMode: 'topdown' | 'portrait'` — never read in `GameScene.ts`, not needed [VERIFIED]

**`GameScene.init` handoff preservation:** The current `init(data)` copies `data.roomId/role/playerFaction` into `gameState` and resolves `mapId`/slots from data or gameState fallback (`:117-145`). After slimming, `init()` continues to do this — it also calls `createWorld({ hostSlot, guestSlot, mapBase, isPractice })` to initialize the sim world. The HUD reads `world.gold` (and `world.timeLeft`, `world.hostBaseHp`, `world.guestBaseHp`) each frame instead of `this.gold` / `gameState.hostBaseHp`.

### Q6: Determinism seams (RNG injection + id tiebreak)

**Where `rng` plugs in today (verified from `updateAI` at :425-450):**
- Line 435: `oppPool[Math.floor(Math.random() * oppPool.length)]` — unit type selection
- Line 438: `Math.floor(Math.random() * 3)` — slot selection

Both are in `updateAI`, which becomes `spawnAI(world, rng, events)` in the sim. Combat has no RNG anywhere. No other `Math.random()` calls exist in the battle loop [VERIFIED by reading all of GameScene.ts].

**Where the id-tiebreak goes (D-07):**
- `updateUnits` nearest-enemy sort at `:476-478`:
  ```typescript
  // BEFORE:
  .sort((a, b) => Math.hypot(a.x-unit.x, a.y-unit.y) - Math.hypot(b.x-unit.x, b.y-unit.y))
  // AFTER (D-07):
  .sort((a, b) => {
    const da = Math.hypot(a.x-unit.x, a.y-unit.y)
    const db = Math.hypot(b.x-unit.x, b.y-unit.y)
    return da - db || (a.id < b.id ? -1 : 1)
  })
  ```
- `updateTowers` nearest-enemy sort at `:532-538`: same change applied to `SimUnit.id`

### Q7: Testability — driving the sim from Vitest

The sim is pure TypeScript (no Phaser, no Supabase) running in Vitest's `node` environment. Tests create a `SimWorld` directly, call `step(world, inputs, dt, rng)`, and assert on the returned events and updated world fields.

**Test infrastructure already in place (verified):**
- `vitest.config.ts`: `test/unit/` project with `environment: 'node'`
- `tsconfig.test.json`: extends `tsconfig.json`, adds `vitest/globals`, includes `test/`
- `test/unit/pathfinder.test.ts`: pattern example for world construction (makeBase/makeOver helpers)

**D-17 scenario implementations:**

**(a) Unit movement along waypoints:**
```typescript
// Create a world with one unit, one waypoint, advance dt until arrived
const world = createWorld({ ... })
const unitId = spawnUnit(world, { ... })
const events = step(world, [], 16, () => 0)
// assert world.hostUnits[0].x/y moved toward waypoint
```

**(b) Combat — two units fight, lower-HP dies:**
```typescript
// Spawn two units facing each other, within COMBAT_RANGE (52px), no waypoints remaining
// Advance steps until one dies
// Assert unit_died event emitted with correct unitId
```

**(c) Win by base-reach AND by timer expiry:**
```typescript
// base-reach: unit at wpIdx >= waypoints.length → assert base_hit event + game_over
// timer: set world.timeLeft = 1, step(world, [], 2000), assert game_over winner matches HP comparison
```

**(d) Wall-break detour (pathfinder integration):**
```typescript
// Spawn unit with a wall in its path; step until wallTarget is set,
// then step until breakWall event emitted; assert mutableOver updated and path recomputed
// This reuses the makeBase/makeOver helpers already in test/unit/pathfinder.test.ts
```

**Characterization snapshot (D-15):**
Run a scripted 10-second battle (fixed dt=16ms, fixed rng=()=>0.5, known deploys) and snapshot the final world state. Any future refactor that changes the snapshot requires intentional update (`vitest --update-snapshots`).

```typescript
expect(finalWorldSnapshot).toMatchSnapshot()
```

Snapshot format: `JSON.stringify(world, replacer)` where `replacer` serializes `Map<string,number>` as sorted arrays (for stability).

### Q8: Risks and landmines

**Risk 1: Order-of-operations in `processUnits`**
The current `updateUnits` processes `hostUnits` first (`:522`), then `guestUnits`. Both arrays are passed to the same closure, but the combat scan reads from live `enemies` arrays. If a host unit kills a guest unit, the guest unit is still present in `guestUnits[]` during that same frame's pass over `guestUnits` (because pruning happens after both passes). This is the current behavior. After extraction, `step()` must reproduce this exactly: prune AFTER both `processUnits(hostUnits, guestUnits)` and `processUnits(guestUnits, hostUnits)` calls.

**Risk 2: `wallTarget` is both sim state and a check-before-combat guard**
`unit.wallTarget` guards the entire frame for that unit — when set, neither combat nor movement happens. This is an important priority order. In `SimUnit`, `wallTarget` is sim state. The check order in `processUnits` must be preserved: wall attack → combat scan → path movement.

**Risk 3: `damageBase` + broadcast coupling**
`damageBase` currently both decrements HP AND calls `broadcastBaseHP`. After extraction, the sim emits a `base_hit` event; the scene calls broadcast in response. The opponent's `base_hp` broadcast (received via channel) currently directly overwrites `this.hostBaseHP` (:849). Phase 10 changes this to overwrite `world.hostBaseHp` instead. This is safe — same semantic, different field owner.

**Risk 4: `gameState.gold` written in `tryDeployAt`**
Currently `:354`: `gameState.gold = this.gold`. After D-12, gold lives on `world.gold`, and `gameState.gold` is removed. The deploy path must deduct from `world.gold` instead. The HUD affordability check (`updateSlotAffordability`) reads `this.gold` — it should instead read `world.gold`. Two places must change together.

**Risk 5: `triggerGameOver` idempotency guard**
`triggerGameOver` guards with `if (this.gameOver) return`. The sim's equivalent is `if (world.over) return`. The renderer must not call `recordResult` twice. After extraction, the renderer checks `events.some(e => e.type === 'game_over')` and calls `recordResult` once.

**Risk 6: Phaser `unit.active` check in unit processing**
Current `:456`: `if (!unit.active || unit.isDead()) continue`. `active` is a Phaser property set to `false` when a `Container` is destroyed. In the sim, `SimUnit.dead` replaces this. The `active` check is defensive — in practice a dead unit sets `dead=true` and is pruned after the frame. The sim's equivalent is just `if (u.dead) continue`.

**Risk 7: `recomputeUnitPath` called from within `processUnits`**
Walls can break mid-frame, triggering `recomputeUnitPath` for ALL units (`:789-790`). In the sim, `breakWall` (called from within the unit-processing loop via `damageWall`) must accumulate path-recompute requests and apply them after the unit loop, not inline. Otherwise a unit processed later in the same frame gets a freshly-recomputed path, while units processed earlier did not. The current GameScene has this same behavior — it calls `recomputeUnitPath` immediately — but it's low-risk because wall-breaks are rare. The safest extraction preserves the current behavior (immediate recompute).

**Recommended extraction sequence (lowest risk at each step):**

1. **Extract towers module first** (D-09/D-10): `TowerData.ts` + `TowerView.ts`. Replace the `TowerDef` interface and inline tower creation with `TowerData` constants. The `this.towers` array becomes `SimTower[]` objects. Towers are the simplest entity — stationary, no pathfinding, no state besides `cd`. Run `tsc` after.

2. **Extract `resolveSide` helper** (D-11): Single pure function, eliminates duplicate code at `:244-248`, `:296-301`, `:318`. Pure refactor, no behavior change.

3. **Define `SimUnit`/`SimWorld` types and `createWorld()`** without wiring up `step()` yet. Confirm TypeScript compiles.

4. **Extract `combat.ts`** (attack resolution, `takeDamage`, nearest-target sort with tiebreak). Write D-17 (b) combat test first — test-first validates the extraction.

5. **Extract movement + path logic** into sim: `moveUnit()`, `isAtGoal()`, `setWaypoints()`. Write D-17 (a) movement test.

6. **Extract `step.ts`** combining gold/timer/AI/units/towers. Wire `GameScene.update` to call `step()`. At this point `GameScene` keeps `UnitView` reconcile and event-to-SFX/network mapping.

7. **Write D-17 (c) and (d) tests** (win conditions, wall-break detour).

8. **Slim `gameState`** — remove `hostBaseHp`, `guestBaseHp`, `gold`; update `GameStateType` in `types/index.ts`. Update all reads/writes. Run `tsc`.

9. **Characterization snapshot** — run a scripted battle, save snapshot.

10. **Manual playtest** (D-16 parity gate).

---

## Common Pitfalls

### Pitfall 1: Breaking `this.gold` / `gameState.gold` two-way sync
**What goes wrong:** `tryDeployAt` currently writes both `this.gold -= def.cost` AND `gameState.gold = this.gold`. If D-12 removes `gameState.gold` but `tryDeployAt` still references it (or vice versa), TypeScript will catch it only if the field is actually removed from `GameStateType`. Keep `tsc` running during refactor.
**Prevention:** Remove `gold` from `GameStateType` simultaneously with adding it to `SimWorld`. The compile error surfaces every write site.

### Pitfall 2: Snapshot instability from non-deterministic Map iteration
**What goes wrong:** `world.wallHP` is a `Map<string, number>`. `JSON.stringify(world)` serializes Maps as `{}` (empty). `Array.from(world.wallHP.entries()).sort()` produces a stable snapshot. Use a custom replacer for `JSON.stringify` or convert to sorted array in the snapshot helper.
**Prevention:** Write a `serializeWorld()` helper in the snapshot test that normalizes non-deterministic structures.

### Pitfall 3: `unit.active` check not replaced
**What goes wrong:** Vitest runs in Node.js. `SimUnit` has no `active` property; Phaser's `active` is not set. If any `processUnits` path still reads `u.active`, it will be `undefined` and evaluate to `false`, skipping live units.
**Prevention:** Replace every `unit.active` check with `!u.dead` in the sim. The `active` check was defensive for Phaser container destruction — not needed once `dead` is the canonical flag.

### Pitfall 4: Reconcile creates duplicate `UnitView` objects
**What goes wrong:** If `reconcileUnits` is called before the sim prunes dead units (because `step()` is called and returns events, but the caller then reconciles before reading the prune results), a unit that died may still appear in `world.hostUnits` (before the `filter` that prunes it). The `unit_died` event is the authoritative signal; the reconcile should remove the view when it sees `unit_died`, not when the unit disappears from the array. Both mechanisms should be correct; the `unit_died` event drives the death animation.
**Prevention:** Design the reconcile to check both the event list AND the world array. A unit in neither the array nor with a pending `unit_died` event should not have a view created.

### Pitfall 5: `opponentFaction` helper called in `updateAI` but exported as `private`
**What goes wrong:** `opponentFaction` is currently a private method on `GameScene`. When `updateAI` logic moves to `spawnAI(world, rng)`, it needs faction resolution. After D-11 extracts `resolveSide`, the AI spawner will call it — but `resolveSide` needs to know the player role, which comes from `gameState`. The sim must not import `gameState`. Solution: pass `hostFaction` and `guestFaction` as fields on `SimWorld` (derived at world creation from `gameState`). The AI spawner reads `world.guestFaction` to pick opponent units.
**Prevention:** Include `hostFaction`, `guestFaction` in `SimWorld` (set at `createWorld()` time from `gameState.playerFaction` + `resolveSide`).

---

## Code Examples

### `updateUnits` — full annotated extraction source

```typescript
// [VERIFIED: GameScene.ts:453-523]
private updateUnits(dt: number) {
  const processUnits = (movers: Unit[], enemies: Unit[]) => {
    for (const unit of movers) {
      if (!unit.active || unit.isDead()) continue  // → if (u.dead) continue

      // Priority 1: wall attack
      if (unit.wallTarget) {
        const [wr, wc] = unit.wallTarget
        if (!this.wallHP.has(`${wr},${wc}`)) {
          unit.wallTarget = null
          this.recomputeUnitPath(unit)
        } else {
          unit.attackCd -= dt
          if (unit.attackCd <= 0) {
            unit.attackCd = unit.attackRate
            this.damageWall(wr, wc, unit.def.dmg)  // → emits wall_break event
            audio.playWallHit()  // → scene plays on wall_break event
          }
        }
        continue
      }

      // Priority 2: unit combat
      const blocker = enemies
        .filter(e => e.active && !e.isDead() && Math.hypot(e.x - unit.x, e.y - unit.y) < COMBAT_RANGE)
        .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))[0]
        // ADD D-07 tiebreak here ↑

      if (blocker) {
        unit.attackCd -= dt
        if (unit.attackCd <= 0) {
          unit.attackCd = unit.attackRate
          blocker.takeDamage(unit.def.dmg)  // → sim sets blocker.hp, blocker.dead; if dead, push unit_died event
          audio.playHit()  // → scene plays on each attack tick (NOT tied to unit_died event)
        }
        continue
      }

      // Priority 3: path movement
      if (unit.isAtGoal()) {
        if (unit.waypoints.length === 0) {
          this.recomputeUnitPath(unit)  // → retry next frame, same logic
          continue
        }
        // Reached enemy base
        const side = unit.dir === -1 ? 'guest' : 'host'
        this.damageBase(side, BASE_REACH_DMG)  // → push base_hit event (+ possible game_over)
        unit.takeDamage(9999)  // → kill self
        continue
      }

      // Wall-check on next waypoint
      const wp = unit.waypoints[unit.wpIdx]
      const wpR = Math.floor(wp.y / CELL)
      const wpC = Math.floor(wp.x / CELL)
      const ov = this.mutableOver[wpR]?.[wpC]
      if (ov && WALL_OVERLAYS.has(ov)) {
        if (canBreakWall(ov as OverlayType, unit.def.faction)) {
          unit.wallTarget = [wpR, wpC]
        }
        continue
      }

      const arrived = unit.moveStep(dt)  // → pure position math; moves to sim
      if (arrived) unit.wpIdx++
    }
  }

  processUnits(this.hostUnits, this.guestUnits)  // host units attack guest
  processUnits(this.guestUnits, this.hostUnits)  // guest units attack host
}
```

### `updateTowers` — full annotated extraction source

```typescript
// [VERIFIED: GameScene.ts:526-543]
private updateTowers(dt: number) {
  for (const tower of this.towers) {
    tower.cd = Math.max(0, tower.cd - dt)
    if (tower.cd > 0) continue

    const targets = tower.isHostSide ? this.guestUnits : this.hostUnits
    const inRange = targets
      .filter(u => u.active && !u.isDead() &&
        Math.hypot(u.x - tower.cx, u.y - tower.cy) <= tower.range)
      .sort((a, b) =>
        Math.hypot(a.x - tower.cx, a.y - tower.cy) -
        Math.hypot(b.x - tower.cx, b.y - tower.cy))  // ADD D-07 tiebreak here

    if (inRange.length === 0) continue
    inRange[0].takeDamage(tower.dmg)  // → sim sets hp; if dead, push unit_died event
    tower.cd = tower.maxCd  // → reset cooldown on SimTower.cd
  }
}
```

### `TowerDef` inline definition (to become `TowerData.ts`)

```typescript
// [VERIFIED: GameScene.ts:168-179 — the inline TowerDef values to centralize]
const TOWER_RANGE = 6 * CELL   // 216px
const TOWER_DMG   = 25
const TOWER_CD    = 1400       // ms

// 6 towers: 3 slots × 2 sides
// hostTowerY  = 13.5 * CELL   // between rows 13-14, attacks guestUnits
// guestTowerY = 1.5 * CELL    // between rows 1-2, attacks hostUnits
```

### Duplicated faction/side mapping (D-11 — to centralize)

```typescript
// [VERIFIED: these three blocks are identical except for variable names]
// GameScene.ts:244-248 (drawBasePlacements):
const role = gameState.role ?? 'host'
const pFac   = gameState.playerFaction ?? 'machines'
const oppFac = this.opponentFaction(pFac)
const hostFac  = role === 'guest' ? oppFac : pFac
const guestFac = role === 'guest' ? pFac   : oppFac

// GameScene.ts:297-301 (drawTowers):
const role    = gameState.role ?? 'host'
const pFac    = gameState.playerFaction ?? 'machines'
const oppFac  = this.opponentFaction(pFac)
// ... same logic

// GameScene.ts:318 (opponentFaction):
private opponentFaction(pFac: string): Faction {
  if (pFac === 'machines') return 'plants'
  if (pFac === 'plants')   return 'wizards'
  return 'machines'
}

// TARGET: extract to src/lib/sideHelper.ts or as a pure function:
export function resolveSide(role: 'host' | 'guest', playerFaction: Faction) {
  const opponent = (f: Faction): Faction =>
    f === 'machines' ? 'plants' : f === 'plants' ? 'wizards' : 'machines'
  const opp = opponent(playerFaction)
  return {
    hostFaction:  role === 'guest' ? opp : playerFaction,
    guestFaction: role === 'guest' ? playerFaction : opp,
    dir: (role === 'host' ? -1 : 1) as 1 | -1,
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zero automated tests | Vitest harness with `test/unit/` + `test/rls/` projects | Phase 9 (2026-06-12) | Sim unit tests drop directly into `test/unit/sim/` — no new config |
| Direct `supabase.from()` in scenes | Typed `src/lib/api/` seam (account, rooms, wallet) | Phase 9 (2026-06-12) | `gameState` persistent fields read through seam; `recordResult` already uses `api/account` |
| `Unit` as Phaser Container holding both data and rendering | Split into `SimUnit` (pure) + `UnitView` (Phaser) | This phase | Enables Node-land testing of all combat/movement logic |
| `TowerDef` inline in `GameScene` | `TowerData.ts` + `TowerView.ts` + `SimTower` | This phase | Fills the empty `src/towers/` directory; consistent with Unit abstraction |
| `gameState` as source of truth for battle values | `SimWorld` as source of truth; `gameState` slimmed to session cache | This phase | Removes `hostBaseHp`, `guestBaseHp`, `gold` from cross-scene singleton |

**Deprecated/outdated:**
- `Unit extends Phaser.GameObjects.Container`: the render-data coupling is the reason the sim cannot be tested in Node today. Phase 10 resolves this.
- `gameMode: 'topdown' | 'portrait'` in `GameStateType`: never read in any scene code [VERIFIED]. Should be removed during the `GameStateType` cleanup pass.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The reconcile-by-id pattern (pattern example code) is the intended approach | Code Examples / Pattern 1 | Lower — D-03 explicitly specifies reconcile by id |
| A2 | `inputs` model (DeployIntent, WallBreakIntent) — specific type structure | Architecture Patterns / Pattern 5 | Low — any equivalent schema achieves the same effect |
| A3 | `resolveSide` helper is best located in `src/lib/` (could also be `src/sim/`) | Architecture Patterns / Pattern 6 | Low — location doesn't affect behavior |
| A4 | `hostFaction`/`guestFaction` should be fields on `SimWorld` (to avoid importing gameState in AI spawner) | Focus Q5 / Pitfall 5 | Medium — alternative is passing them as parameters to `spawnAI`; both valid |
| A5 | `audio.playHit()` is called per-attack (every frame an attack lands), not only on `unit_died` | Q3 Events taxonomy | Low — verified by tracing: audio.playHit() is in the combat cooldown branch (:484), not in takeDamage |

**If this table is empty:** Not empty — 5 assumptions logged.

---

## Open Questions

1. **`UnitView` identifier: class field or new param?**
   - What we know: `SimUnit.id` is a new field (doesn't exist on current `Unit`). The view registry is `Map<string, UnitView>`.
   - What's unclear: Whether `id` is a UUID, an integer counter, or something else. The planner should choose.
   - Recommendation: Simple monotonic integer counter (`world.nextId++` in `createWorld`) is deterministic and zero-overhead. Pass it as a constructor param to `SimUnit`.

2. **Where does `audio.playHit()` live after extraction?**
   - What we know: Currently called at GameScene.ts:484 (attack lands) and GameScene.ts:469 (wall hit). These are inside the unit-processing loop, which moves to the sim. But the sim cannot import `audio`.
   - What's unclear: Should the sim emit a distinct `unit_attacked` event per hit (many per frame), or should the scene track attack events separately?
   - Recommendation: Keep audio calls in the scene by having the scene monitor `world.hostUnits`/`guestUnits` for `attackCd` resets each frame (continuous state read), rather than emitting a `unit_attacked` event per hit. The `base_hit` and `wall_break` events are sufficient for the named events; attack sounds are high-frequency continuous-state feedback.

3. **Snapshot update workflow for the team**
   - What we know: Vitest snapshot files are committed to git under `__snapshots__/`. The characterization snapshot captures the world state after a scripted battle.
   - What's unclear: The project has a single dev (the user). Whether snapshot drift is treated as a blocking failure or a warning.
   - Recommendation: Treat snapshot failure as blocking (the default Vitest behavior). Document that `vitest --update-snapshots` is the intentional re-lock command.

---

## Environment Availability

> No external tools or services are required to implement this phase beyond what Phase 9 already installed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vitest (test runner) | Verified via Phase 9 CI | ≥ 18 (inferred from vite^8) | — |
| Vitest | D-15/D-17 tests | Confirmed in package.json | ^4.1.8 | — |
| TypeScript | All new sim modules | Confirmed in package.json | ~5.9.3 | — |
| Phaser 3 | `UnitView`, `TowerView` | Confirmed in package.json | ^3.90.0 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 |
| Config file | `vitest.config.ts` (root) — `test/unit/` project, `environment: 'node'` |
| Quick run command | `npx vitest run --project unit` |
| Full suite command | `npx vitest run` (all projects) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BATTLE-02-a | Unit moves along waypoints (D-17a) | unit | `npx vitest run --project unit test/unit/sim/movement.test.ts` | ❌ Wave 0 |
| BATTLE-02-b | Two units fight; lower-HP dies; id-tiebreak is stable (D-17b) | unit | `npx vitest run --project unit test/unit/sim/combat.test.ts` | ❌ Wave 0 |
| BATTLE-02-c | Win by base-reach; win by timer expiry (D-17c) | unit | `npx vitest run --project unit test/unit/sim/win.test.ts` | ❌ Wave 0 |
| BATTLE-02-d | Wall-break detour via pathfinder (D-17d) | unit | `npx vitest run --project unit test/unit/sim/wall-break.test.ts` | ❌ Wave 0 |
| BATTLE-02-snap | Characterization snapshot locks scripted-battle outcome (D-15) | snapshot | `npx vitest run --project unit test/unit/sim/snapshot.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --project unit`
- **Per wave merge:** `npx vitest run` (all projects)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/unit/sim/movement.test.ts` — covers BATTLE-02-a
- [ ] `test/unit/sim/combat.test.ts` — covers BATTLE-02-b
- [ ] `test/unit/sim/win.test.ts` — covers BATTLE-02-c
- [ ] `test/unit/sim/wall-break.test.ts` — covers BATTLE-02-d
- [ ] `test/unit/sim/snapshot.test.ts` — covers BATTLE-02-snap

*(No framework install needed — Vitest is already configured. No shared-fixture gaps — test/unit/pathfinder.test.ts provides the `makeBase`/`makeOver` pattern to replicate.)*

---

## Security Domain

> `security_enforcement` not explicitly set to false — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Phase 10 touches no auth code |
| V3 Session Management | No | Session fields stay in `gameState`; this phase only reads them |
| V4 Access Control | No | No new RLS or authorization logic |
| V5 Input Validation | Yes (low) | Broadcast payloads are cast with `as` today (`:835-862`). Phase 10 inherits this; no new injection surface created. |
| V6 Cryptography | No | No new crypto |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious `base_hp` broadcast (opponent sends hp=0) | Tampering | Inherited from Phase 9 architecture; not Phase 10's scope (Phase 14 adds server validation). Phase 10 preserves existing trust-and-overwrite behavior. |
| `username` in HUD innerHTML unescaped | Information disclosure / XSS | Flagged in CONCERNS.md (`:1031`). Phase 10 may touch the HUD only for gold/timer/base HP reads from `world`. Do not expand the innerHTML template in this phase. |

---

## Sources

### Primary (HIGH confidence)

All findings below are verified by direct read of the source files in this session:

- `src/scenes/GameScene.ts` (full read: lines 1-1071) — battle loop, tower defs, faction helpers, broadcast handlers, HUD
- `src/units/Unit.ts` (full read: lines 1-156) — field set, method implementations
- `src/units/UnitData.ts` (full read) — static table structure (TowerData.ts mirror)
- `src/lib/gameState.ts` (full read) — full GameStateType object
- `src/lib/pathfinder.ts` (full read) — pure BFS, `isWalkable`, `canBreakWall`, `findPath`
- `src/types/index.ts` (full read) — `GameStateType`, `UnitDefinition`, `MapDef`, `TerrainType`, `OverlayType`
- `src/lib/api/account.ts` (full read) — Phase 9 seam; `recordMatchResult` signature
- `vitest.config.ts` (full read) — test project config: `test/unit/` node env, `test/rls/` jsdom env
- `tsconfig.json`, `tsconfig.test.json` (full read) — TS compiler options, test type coverage
- `test/unit/pathfinder.test.ts` (full read) — makeBase/makeOver helpers, describe/it pattern
- `package.json` (full read) — installed versions, scripts
- `.planning/phases/10-services-simulation-refactor/10-CONTEXT.md` (full read) — 17 locked decisions

### Secondary (MEDIUM confidence)

- `.planning/codebase/ARCHITECTURE.md` — system overview, GameScene.update tick breakdown description
- `.planning/codebase/CONCERNS.md` — debt items this phase touches
- `.planning/codebase/TESTING.md` — test coverage state, Vitest recommendation
- `.planning/phases/09-backend-foundations-integrity/09-CONTEXT.md` — D-07/D-08: api/ seam scope

### Tertiary

None — all claims were verified against live source.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Extraction seam | HIGH | Full GameScene.ts read; every field and call site mapped |
| SimUnit/SimWorld field sets | HIGH | Verified against Unit.ts and GameScene instance fields |
| Events taxonomy | HIGH | Every `audio.*`, `broadcast`, `triggerGameOver`, `showResult*` call traced |
| Wire protocol preservation | HIGH | `setupChannel` handlers read in full |
| gameState reduction | HIGH | All `gameState.*` write sites traced in GameScene.ts |
| Test infrastructure | HIGH | vitest.config.ts + tsconfig.test.json + existing test read |
| Extraction sequencing | MEDIUM | Reasoning-based; any sequence that compiles at each step works |

**Research date:** 2026-06-12
**Valid until:** 2026-09-12 (stable codebase; no fast-moving dependencies)
