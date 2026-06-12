# Phase 10: Services & Simulation Refactor - Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 13 (8 new, 5 edited)
**Analogs found:** 13 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/sim/types.ts` | model | transform | `src/types/index.ts` (interface declarations) | role-match |
| `src/sim/world.ts` | model | CRUD | `src/lib/gameState.ts` (singleton init) | role-match |
| `src/sim/step.ts` | service | event-driven | `GameScene.updateGold/updateTimer/updateAI/updateUnits/updateTowers` | exact (extraction) |
| `src/sim/combat.ts` | service | event-driven | `GameScene.updateUnits` + `GameScene.updateTowers` | exact (extraction) |
| `src/units/UnitView.ts` | component | request-response | `src/units/Unit.ts` (Phaser render half) | exact (split) |
| `src/towers/TowerData.ts` | model | CRUD | `src/units/UnitData.ts` | exact |
| `src/towers/TowerView.ts` | component | request-response | `GameScene.drawTowers()` (lines 293-317) | exact (extraction) |
| `test/unit/sim/movement.test.ts` | test | — | `test/unit/pathfinder.test.ts` | exact |
| `test/unit/sim/combat.test.ts` | test | — | `test/unit/pathfinder.test.ts` | exact |
| `test/unit/sim/win.test.ts` | test | — | `test/unit/pathfinder.test.ts` | exact |
| `test/unit/sim/wall-break.test.ts` | test | — | `test/unit/pathfinder.test.ts` | exact |
| `test/unit/sim/snapshot.test.ts` | test | — | `test/unit/pathfinder.test.ts` | exact |
| `src/units/Unit.ts` | component | request-response | self (split/reduce to pure sim data + re-export) | — |
| `src/scenes/GameScene.ts` | component | event-driven | self (thin down to renderer + network + input) | — |
| `src/lib/gameState.ts` | model | CRUD | self (slim to session + profile cache) | — |
| `src/types/index.ts` | model | — | self (remove battle fields from GameStateType) | — |

---

## Pattern Assignments

### `src/sim/types.ts` (model, transform)

**Analog:** `src/types/index.ts`

**Imports pattern** (`src/types/index.ts` lines 1-1, no imports — pure type declarations):
```typescript
// types/index.ts exports only types — no runtime imports
export type Faction = 'machines' | 'plants' | 'wizards'
export type UnitSpeed = 'Fast' | 'Medium' | 'Slow'
export interface UnitDefinition { ... }
```

**Core pattern — sim types follow the same pure-declaration style:**
```typescript
// src/sim/types.ts — zero imports, zero Phaser, zero Supabase
import type { OverlayType, TerrainType } from '../types'

export interface SimUnit {
  id: string             // monotonic counter: world.nextId++
  defId: string          // key into UNITS[]
  faction: string        // copied from UnitDefinition at spawn
  x: number
  y: number
  hp: number
  maxHp: number
  dir: 1 | -1
  laneSlot: number       // 0 | 1 | 2
  attackCd: number
  attackRate: number     // default 900ms (from Unit.ts line 23)
  speedPx: number
  dmg: number
  waypoints: { x: number; y: number }[]
  wpIdx: number
  wallTarget: [number, number] | null
  dead: boolean
}

export interface SimTower {
  cx: number; cy: number
  slotIdx: number
  isHostSide: boolean
  range: number; dmg: number
  cd: number; maxCd: number
}

export interface SimWorld {
  // Battle state (D-12: moves OFF gameState)
  gold: number
  goldAccum: number
  timeLeft: number
  hostBaseHp: number
  guestBaseHp: number
  hostUnits: SimUnit[]
  guestUnits: SimUnit[]
  towers: SimTower[]
  mutableOver: (OverlayType)[][]
  wallHP: Map<string, number>
  over: boolean
  // Practice AI
  isPractice: boolean
  aiTimer: number
  aiInterval: number
  // Session context needed by sim (pathfinding, AI faction)
  hostFaction: string
  guestFaction: string
  hostSlot: number
  guestSlot: number
  mapBase: TerrainType[][]
  // Phase 14 seam
  nextId: number         // monotonic id counter
  tickCount: number      // increments each step() call
}

export type SimEvent =
  | { type: 'unit_died';  unitId: string; x: number; y: number; faction: string }
  | { type: 'wall_break'; row: number; col: number }
  | { type: 'base_hit';   side: 'host' | 'guest'; newHp: number }
  | { type: 'game_over';  winner: 'host' | 'guest' | 'tie' }

export type SimInput =
  | { type: 'deploy';     unitId: string; slot: number; role: 'host' | 'guest' }
  | { type: 'wall_break'; row: number; col: number }
```

**No analog for SimWorld/SimEvent — shapes derived directly from D-01/D-03/Q3 in RESEARCH.md.**

---

### `src/sim/world.ts` (model, CRUD)

**Analog:** `src/lib/gameState.ts` (lines 1-22)

**Imports pattern** (`src/lib/gameState.ts` lines 1-1):
```typescript
import type { GameStateType } from '../types'
```

**Singleton init pattern** (`src/lib/gameState.ts` lines 3-22):
```typescript
const gameState: GameStateType = {
  userId: null,
  username: null,
  playerFaction: null,
  unlockedUnits: ['scout_drone', 'vine_crawler', 'apprentice_mage'],
  loadout: [],
  wins: 0,
  losses: 0,
  roomId: null,
  role: null,
  hostBaseHp: 1000,
  guestBaseHp: 1000,
  gold: 200,
  gameMode: 'topdown',
  mapId: null,
  hostSlot: null,
  guestSlot: null,
}
export default gameState
```

**Core pattern — `world.ts` exports a factory function, not a singleton (sim can run multiple instances in tests):**
```typescript
// src/sim/world.ts
import type { SimWorld } from './types'
import type { TerrainType, OverlayType } from '../types'
import { MAPS, COLS, ROWS, CELL } from '../maps/MapData'

const WALL_MAX_HP: Partial<Record<string, number>> = {
  wall: 250, break_mach: 200, break_plant: 200, break_wiz: 200,
}
const WALL_OVERLAYS = new Set(['wall', 'break_mach', 'break_plant', 'break_wiz'])

export interface CreateWorldOptions {
  gold?: number
  hostSlot: number
  guestSlot: number
  mapBase: TerrainType[][]
  mapOver: (OverlayType)[][]
  isPractice: boolean
  hostFaction: string
  guestFaction: string
}

export function createWorld(opts: CreateWorldOptions): SimWorld {
  // Init wallHP from mutableOver
  const mutableOver = opts.mapOver.map(row => [...row])
  const wallHP = new Map<string, number>()
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ov = mutableOver[r][c]
      if (ov && WALL_OVERLAYS.has(ov)) {
        wallHP.set(`${r},${c}`, WALL_MAX_HP[ov] ?? 200)
      }
    }
  }
  return {
    gold: opts.gold ?? 200,
    goldAccum: 0,
    timeLeft: 180,
    hostBaseHp: 1000,
    guestBaseHp: 1000,
    hostUnits: [],
    guestUnits: [],
    towers: [],
    mutableOver,
    wallHP,
    over: false,
    isPractice: opts.isPractice,
    aiTimer: 0,
    aiInterval: 6000,
    hostFaction: opts.hostFaction,
    guestFaction: opts.guestFaction,
    hostSlot: opts.hostSlot,
    guestSlot: opts.guestSlot,
    mapBase: opts.mapBase,
    nextId: 1,
    tickCount: 0,
  }
}
```

**Key difference from gameState analog:** `createWorld()` is a factory, not a module-level singleton. Tests call it fresh for each scenario. The `wallHP` init block mirrors `GameScene.create()` lines 157-165 exactly.

---

### `src/sim/step.ts` (service, event-driven)

**Analog:** `GameScene.ts` — `update()` lines 386-398 and the five `updateX()` methods it calls

**Extraction seam — current GameScene.update** (`GameScene.ts` lines 386-398):
```typescript
update(_t: number, dt: number) {
  if (this.paused || this.gameOver) return

  this.updateGold(dt)
  this.updateTimer(dt)
  this.updateAI(dt)
  this.updateUnits(dt)
  this.updateTowers(dt)

  // Prune destroyed containers
  this.hostUnits  = this.hostUnits.filter((u) => u.active && !u.isDead())
  this.guestUnits = this.guestUnits.filter((u) => u.active && !u.isDead())
}
```

**updateGold source** (`GameScene.ts` lines 400-409):
```typescript
private updateGold(dt: number) {
  this.goldAccum += dt
  if (this.goldAccum >= 2000) {
    this.goldAccum -= 2000
    this.gold = Math.min(this.gold + 10, 9999)
    gameState.gold = this.gold          // DELETE in sim — world.gold is the source
    if (this.goldEl) this.goldEl.textContent = String(this.gold)  // DELETE — renderer reads world
    this.updateSlotAffordability()      // DELETE — renderer handles affordability
  }
}
```

**updateTimer source** (`GameScene.ts` lines 411-423):
```typescript
private updateTimer(dt: number) {
  this.timeLeft = Math.max(0, this.timeLeft - dt / 1000)
  // timer DOM update → renderer reads world.timeLeft each frame
  if (this.timeLeft <= 0) {
    if (this.hostBaseHP > this.guestBaseHP)      this.triggerGameOver('host')
    else if (this.guestBaseHP > this.hostBaseHP) this.triggerGameOver('guest')
    else                                          this.triggerGameOver('tie')
  }
}
```

**updateAI source** (`GameScene.ts` lines 425-451) — two RNG calls (the only sim RNG):
```typescript
private updateAI(dt: number) {
  if (!gameState.roomId?.startsWith('practice-')) return
  this.aiTimer += dt
  if (this.aiTimer < this.aiInterval) return
  this.aiTimer = 0

  const pFac   = gameState.playerFaction ?? 'machines'
  const oppFac = this.opponentFaction(pFac)
  const oppPool = UNITS.filter((u) => u.faction === oppFac)
  const def     = oppPool[Math.floor(Math.random() * oppPool.length)]  // rng call 1
  const slotIdx = Math.floor(Math.random() * 3)                        // rng call 2

  const role   = gameState.role ?? 'host'
  const aiDir: 1 | -1 = role === 'host' ? 1 : -1
  // ... spawn unit
}
```

**Core step() pattern to produce:**
```typescript
// src/sim/step.ts
import type { SimWorld, SimEvent, SimInput } from './types'
import { processUnits, processTowers } from './combat'
import { UNITS } from '../units/UnitData'
import { slotWorldX, hostSpawnY, guestSpawnY } from '../maps/MapData'

export function step(
  world: SimWorld,
  inputs: SimInput[],
  dt: number,
  rng: () => number = Math.random,
): SimEvent[] {
  const events: SimEvent[] = []

  // 1. Apply inputs
  for (const input of inputs) {
    if (input.type === 'deploy') spawnUnit(world, input, events)
  }

  // 2. Gold (updateGold :400-408 — strip DOM/gameState writes)
  world.goldAccum += dt
  while (world.goldAccum >= 2000) {
    world.goldAccum -= 2000
    world.gold = Math.min(world.gold + 10, 9999)
  }

  // 3. Timer (updateTimer :411-423 — strip DOM writes)
  world.timeLeft = Math.max(0, world.timeLeft - dt / 1000)
  if (world.timeLeft <= 0 && !world.over) {
    const winner = world.hostBaseHp > world.guestBaseHp ? 'host'
                 : world.guestBaseHp > world.hostBaseHp ? 'guest' : 'tie'
    world.over = true
    events.push({ type: 'game_over', winner })
  }

  // 4. AI spawn (updateAI :425-450 — inject rng, read world factions)
  if (world.isPractice && !world.over) {
    world.aiTimer += dt
    if (world.aiTimer >= world.aiInterval) {
      world.aiTimer = 0
      spawnAI(world, rng, events)
    }
  }

  // 5. Units (updateUnits :453-523 — extracted to combat.ts)
  if (!world.over) {
    processUnits(world, events, dt)
  }

  // 6. Towers (updateTowers :526-543 — extracted to combat.ts)
  if (!world.over) {
    processTowers(world, events, dt)
  }

  // 7. Prune dead (mirrors :396-397 — u.active replaced with !u.dead)
  world.hostUnits  = world.hostUnits.filter(u => !u.dead)
  world.guestUnits = world.guestUnits.filter(u => !u.dead)

  world.tickCount++
  return events
}
```

---

### `src/sim/combat.ts` (service, event-driven)

**Analog:** `GameScene.updateUnits` (lines 453-524) and `GameScene.updateTowers` (lines 526-543)

**updateUnits full source** (`GameScene.ts` lines 453-524):
```typescript
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
            this.damageWall(wr, wc, unit.def.dmg)  // → mutate wallHP; push wall_break event when hp<=0
            audio.playWallHit()  // → DELETE (scene plays on wall_break event)
          }
        }
        continue
      }

      // Priority 2: unit combat (NEAREST-TARGET sort — add D-07 id tiebreak)
      const blocker = enemies
        .filter(e => e.active && !e.isDead() && Math.hypot(e.x - unit.x, e.y - unit.y) < COMBAT_RANGE)
        .sort((a, b) => Math.hypot(a.x-unit.x, a.y-unit.y) - Math.hypot(b.x-unit.x, b.y-unit.y))[0]
        // D-07: .sort((a,b) => { const da=Math.hypot(a.x-unit.x,a.y-unit.y); const db=...; return da-db || (a.id<b.id?-1:1) })

      if (blocker) {
        unit.attackCd -= dt
        if (unit.attackCd <= 0) {
          unit.attackCd = unit.attackRate
          blocker.takeDamage(unit.def.dmg)  // → sim: blocker.hp -= dmg; if hp<=0 set blocker.dead=true; push unit_died
          audio.playHit()  // → DELETE (scene plays audio on each attack regardless)
        }
        continue
      }

      // Priority 3: path movement
      if (unit.isAtGoal()) {
        if (unit.waypoints.length === 0) {
          this.recomputeUnitPath(unit)  // → call findPath, set unit.waypoints
          continue
        }
        // Reached enemy base
        const side = unit.dir === -1 ? 'guest' : 'host'
        this.damageBase(side, BASE_REACH_DMG)  // → decrement world.hostBaseHp/guestBaseHp; push base_hit; push game_over if 0
        unit.takeDamage(9999)  // → unit.dead = true; push unit_died
        continue
      }

      // Wall-check on next waypoint
      const wp  = unit.waypoints[unit.wpIdx]
      const wpR = Math.floor(wp.y / CELL)
      const wpC = Math.floor(wp.x / CELL)
      const ov  = this.mutableOver[wpR]?.[wpC]
      if (ov && WALL_OVERLAYS.has(ov)) {
        if (canBreakWall(ov as OverlayType, unit.def.faction)) {
          unit.wallTarget = [wpR, wpC]
        }
        continue
      }

      const arrived = unit.moveStep(dt)  // → pure position math; stays in sim
      if (arrived) unit.wpIdx++
    }
  }

  processUnits(this.hostUnits, this.guestUnits)  // ORDER PRESERVED: host first
  processUnits(this.guestUnits, this.hostUnits)  // guest second — prune AFTER both
}
```

**updateTowers full source** (`GameScene.ts` lines 526-543):
```typescript
private updateTowers(dt: number) {
  for (const tower of this.towers) {
    tower.cd = Math.max(0, tower.cd - dt)
    if (tower.cd > 0) continue

    const targets = tower.isHostSide ? this.guestUnits : this.hostUnits
    const inRange  = targets
      .filter((u) => u.active && !u.isDead() &&     // → !u.dead
        Math.hypot(u.x - tower.cx, u.y - tower.cy) <= tower.range)
      .sort((a, b) =>
        Math.hypot(a.x - tower.cx, a.y - tower.cy) -
        Math.hypot(b.x - tower.cx, b.y - tower.cy))
        // D-07: add || (a.id < b.id ? -1 : 1) tiebreak

    if (inRange.length === 0) continue
    inRange[0].takeDamage(tower.dmg)   // → sim: target.hp -= dmg; push unit_died if dead
    tower.cd = tower.maxCd
  }
}
```

**D-07 id-tiebreak pattern — apply to BOTH sorts:**
```typescript
// BEFORE (GameScene.ts :478, :536-538)
.sort((a, b) => Math.hypot(a.x-unit.x, a.y-unit.y) - Math.hypot(b.x-unit.x, b.y-unit.y))

// AFTER (D-07 — flagged intentional micro behavior-change)
.sort((a, b) => {
  const da = Math.hypot(a.x - unit.x, a.y - unit.y)
  const db = Math.hypot(b.x - unit.x, b.y - unit.y)
  return da - db || (a.id < b.id ? -1 : 1)
})
```

**Critical: processing order** — `processUnits(hostUnits, guestUnits)` THEN `processUnits(guestUnits, hostUnits)`. Pruning happens AFTER both calls in `step()`, not inside combat. This exactly replicates the current behavior where a unit killed early in the frame is still present for the second call.

**Unit movement — pure math extracted from `Unit.moveStep`** (`Unit.ts` lines 66-81):
```typescript
// moveStep(dt) — pure, moves directly to sim as moveUnit(u, dt)
moveStep(dt: number): boolean {
  if (this.wpIdx >= this.waypoints.length) return false
  const target = this.waypoints[this.wpIdx]
  const dx = target.x - this.x
  const dy = target.y - this.y
  const dist = Math.hypot(dx, dy)
  const step = this.def.speedPx * dt / 1000
  if (dist <= step) {
    this.x = target.x; this.y = target.y; return true
  }
  this.x += (dx / dist) * step
  this.y += (dy / dist) * step
  return false
}
```

---

### `src/units/UnitView.ts` (component, request-response)

**Analog:** `src/units/Unit.ts` (Phaser render half — lines 1-56, 95-155)

**Full Unit.ts imports and class header** (lines 1-11):
```typescript
import Phaser from 'phaser'
import type { UnitDefinition } from '../types'

const HP_W = 40
const HP_H = 5
const HP_Y = -32

export const COMBAT_RANGE  = 52   // world px
export const BASE_REACH_DMG = 60

export class Unit extends Phaser.GameObjects.Container {
```

**Constructor pattern — Phaser Container setup** (`Unit.ts` lines 30-56):
```typescript
constructor(
  scene: Phaser.Scene,
  x: number,
  y: number,
  def: UnitDefinition,
  laneSlot: number,
  dir: 1 | -1,
) {
  super(scene, x, y)
  this.def      = def
  this.laneSlot = laneSlot
  this.dir      = dir
  this.hp       = def.hp
  this.maxHp    = def.hp

  const img = scene.add.image(0, 0, `${def.id}_token`)
  img.setDisplaySize(36, 36)
  if (dir === 1) img.setFlipY(true)
  this.add(img)

  this.hpGfx = scene.add.graphics()
  this.add(this.hpGfx)
  this.drawHP()

  scene.add.existing(this)
  this.setDepth(10)
}
```

**UnitView becomes a Phaser Container keyed by SimUnit.id.** The constructor takes `(scene, id, def, laneSlot, dir)` and exposes `syncFrom(u: SimUnit)` for continuous reconcile and `playDeathAnimation()` for the unit_died event.

**View methods that stay in UnitView** (`Unit.ts` lines 95-155):
```typescript
// flashHit() — lines 96-101: tint + delayedCall
flashHit() {
  const img = this.list[0] as Phaser.GameObjects.Image
  if (!img) return
  img.setTint(0xff4444)
  this.scene.time.delayedCall(120, () => { if (img.scene) img.clearTint() })
}

// popIn() — lines 103-110: spawn scale animation
popIn() {
  this.setScale(0)
  this.scene.tweens.add({
    targets: this, scaleX: 1, scaleY: 1,
    duration: 220, ease: 'Back.Out',
  })
}

// kill() → playDeathAnimation() — lines 114-144: explosion + fade tween
private kill() {
  this.dead = true
  const g = this.scene.add.graphics().setDepth(20)
  const ox = this.x, oy = this.y
  const burst = faction === 'machines' ? 0x4499ff
              : faction === 'plants'   ? 0x44dd66
              :                          0xaa55ff
  this.scene.tweens.add({ ... }) // explosion graphics
  this.scene.tweens.add({ targets: this, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 230,
    onComplete: () => { if (this.scene) this.destroy() } })
}

// drawHP() — lines 146-155: HP bar graphics
private drawHP() {
  this.hpGfx.clear()
  const x = -HP_W / 2, y = HP_Y
  this.hpGfx.fillStyle(0x000000, 0.75)
  this.hpGfx.fillRect(x - 1, y - 1, HP_W + 2, HP_H + 2)
  const pct   = this.hp / this.maxHp
  const color = pct > 0.6 ? 0x44dd44 : pct > 0.3 ? 0xddaa22 : 0xdd3322
  this.hpGfx.fillStyle(color)
  this.hpGfx.fillRect(x, y, Math.round(HP_W * pct), HP_H)
}
```

**New `syncFrom` method (D-03 reconcile pattern):**
```typescript
syncFrom(u: SimUnit) {
  this.x = u.x
  this.y = u.y
  // Redraw HP bar only when hp changed (UnitView tracks last hp)
  if (u.hp !== this._lastHp) {
    this._lastHp = u.hp
    this.drawHP(u.hp, u.maxHp)
  }
}
```

---

### `src/towers/TowerData.ts` (model, CRUD)

**Analog:** `src/units/UnitData.ts` (lines 1-87) — D-09/D-10 explicit mirror

**UnitData.ts full pattern:**
```typescript
// src/units/UnitData.ts
import type { UnitDefinition } from '../types'

export const UNITS: UnitDefinition[] = [
  {
    id: 'scout_drone',
    name: 'Scout Drone',
    faction: 'machines',
    tier: 1,
    hp: 120,
    dmg: 45,
    speed: 'Fast',
    speedPx: 90,
    cost: 50,
    tokenColor: '#93C5FD',
    starter: true,
  },
  // ... more entries
]

export const UNIT_FACTION: Record<string, string> = Object.fromEntries(
  UNITS.map((u) => [u.id, u.faction])
)
```

**TowerData.ts mirrors this shape — flat static table (D-10, no per-level scaling):**
```typescript
// src/towers/TowerData.ts
import { CELL } from '../maps/MapData'

// Values lifted from GameScene.ts lines 168-179 (the inline TowerDef constants)
export const TOWER_RANGE = 6 * CELL   // 216px
export const TOWER_DMG   = 25
export const TOWER_CD    = 1400       // ms

export interface TowerDefinition {
  range: number
  dmg: number
  maxCd: number
}

export const TOWER_DEF: TowerDefinition = {
  range: TOWER_RANGE,
  dmg:   TOWER_DMG,
  maxCd: TOWER_CD,
}
```

**Key pattern: TowerData exports only constants — no Phaser imports, no Supabase imports.** SimTower structs in `src/sim/types.ts` hold live mutable state (cd, isHostSide, cx, cy). TowerData is the static definition source, exactly as UnitData holds the static unit definitions.

---

### `src/towers/TowerView.ts` (component, request-response)

**Analog:** `GameScene.drawTowers()` (lines 293-317) for the draw logic; `src/units/UnitView.ts` for the class structure

**drawTowers source to extract** (`GameScene.ts` lines 293-317):
```typescript
private drawTowers() {
  const g = this.add.graphics()
  g.setDepth(3)

  const role    = gameState.role ?? 'host'
  const pFac    = gameState.playerFaction ?? 'machines'
  const oppFac  = this.opponentFaction(pFac)
  const hostFac  = role === 'guest' ? oppFac : pFac
  const guestFac = role === 'guest' ? pFac   : oppFac

  for (const tower of this.towers) {
    const faction = tower.isHostSide ? hostFac : guestFac
    const c = fac(faction)   // FC lookup: { fill, lite, bd }
    const tw = 28, th = 28
    const x = tower.cx - tw / 2
    const y = tower.cy - th / 2
    g.fillStyle(0x000000, 0.4); g.fillRect(x + 3, y + 3, tw, th)   // shadow
    g.fillStyle(c.fill, 1);     g.fillRect(x, y, tw, th)             // body
    g.fillStyle(c.lite, 0.4);   g.fillRect(x, y, tw, th * 0.45)      // highlight
    g.lineStyle(2, c.bd, 1);    g.strokeRect(x, y, tw, th)           // border
    // Battlements
    g.fillStyle(c.bd, 1)
    for (let i = 0; i < 3; i++) g.fillRect(x + 2 + i * 9, y - 6, 6, 8)
  }
}
```

**FC color lookup table** (`GameScene.ts` lines 51-56 — move to TowerView.ts or a shared colors module):
```typescript
const FC: Record<string, { fill: number; lite: number; bd: number }> = {
  machines: { fill: 0x1a5090, lite: 0x3a80c0, bd: 0x70b0ff },
  plants:   { fill: 0x1a6018, lite: 0x3a9030, bd: 0x70d050 },
  wizards:  { fill: 0x501080, lite: 0x8030c0, bd: 0xb060ff },
}
const fac = (f: string) => FC[f] ?? FC.machines
```

**TowerView is a static draw (towers do not animate).** It is a standalone `Phaser.GameObjects.Graphics` instance drawn once at `create()` time. No `syncFrom()` needed — towers have no position or HP to update. The only update needed is if a tower fires (flash effect — not in current code, deferred).

---

### Test files under `test/unit/sim/` (test, —)

**Analog:** `test/unit/pathfinder.test.ts` (lines 1-286) — the exact pattern to replicate

**Full test file import block** (`test/unit/pathfinder.test.ts` lines 1-4):
```typescript
import { describe, expect, it } from 'vitest'
import { findPath, isWalkable, canBreakWall } from '../../src/lib/pathfinder'
import type { TerrainType, OverlayType } from '../../src/types'
```

**Grid helper pattern** (`test/unit/pathfinder.test.ts` lines 6-29) — replicate as world helpers:
```typescript
const ROWS = 16
const COLS = 22

function makeBase(fill: TerrainType = 'open'): TerrainType[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill) as TerrainType[])
}

function makeOver(fill: OverlayType = null): OverlayType[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill) as OverlayType[])
}

function paintBase(grid: TerrainType[][], r: number, c: number, t: TerrainType): TerrainType[][] {
  grid[r][c] = t; return grid
}
function paintOver(grid: OverlayType[][], r: number, c: number, ov: OverlayType): OverlayType[][] {
  grid[r][c] = ov; return grid
}
```

**describe/it pattern** (`test/unit/pathfinder.test.ts` lines 42-47):
```typescript
describe('isWalkable', () => {
  it('returns false for a wall overlay regardless of terrain', () => {
    const base = makeBase('path')
    const over = paintOver(makeOver(), 5, 5, 'wall')
    expect(isWalkable(5, 5, base, over)).toBe(false)
  })
```

**Sim test helper pattern to build (mirrors makeBase/makeOver):**
```typescript
// In test/unit/sim helpers — replicate the pathfinder test scaffold
import { describe, expect, it } from 'vitest'
import { createWorld } from '../../../src/sim/world'
import { step } from '../../../src/sim/step'
import type { SimInput } from '../../../src/sim/types'
import type { TerrainType, OverlayType } from '../../../src/types'

const ROWS = 16, COLS = 22

function makeBase(fill: TerrainType = 'open'): TerrainType[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill) as TerrainType[])
}
function makeOver(fill: OverlayType = null): OverlayType[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill) as OverlayType[])
}
```

**D-17 scenario stubs** (patterns derived from RESEARCH.md Q7):
```typescript
// (a) movement.test.ts
describe('unit movement', () => {
  it('moves toward first waypoint each step', () => {
    const world = createWorld({ ..., isPractice: false })
    // spawnUnit into world.hostUnits
    const events = step(world, [], 16, () => 0)
    expect(world.hostUnits[0].x).toBeGreaterThan(startX)  // or less, depending on dir
  })
})

// (b) combat.test.ts
describe('combat', () => {
  it('lower-HP unit dies first; unit_died event emitted', () => {
    const world = createWorld({ ... })
    // spawn two units within COMBAT_RANGE, facing each other
    let events: SimEvent[] = []
    while (!events.some(e => e.type === 'unit_died')) {
      events = step(world, [], 16, () => 0)
    }
    expect(events.find(e => e.type === 'unit_died')?.unitId).toBe(lowerHpId)
  })

  it('id-tiebreak is deterministic for equal-distance enemies', () => {
    // spawn two enemies at identical distance; assert same target chosen each run
  })
})

// (c) win.test.ts
describe('win conditions', () => {
  it('emits game_over when timer expires', () => {
    const world = createWorld({ ... })
    world.timeLeft = 0.001
    const events = step(world, [], 16, () => 0)
    expect(events.some(e => e.type === 'game_over')).toBe(true)
  })

  it('emits game_over when unit reaches enemy base', () => {
    // unit at wpIdx >= waypoints.length → base_hit + game_over (if hp drops to 0)
  })
})

// (d) wall-break.test.ts — reuses makeBase/makeOver from pathfinder pattern
describe('wall-break detour', () => {
  it('unit sets wallTarget when waypoint is a breakable wall', () => { ... })
  it('emits wall_break event when wall hp reaches 0', () => { ... })
})

// snapshot.test.ts
describe('characterization snapshot', () => {
  it('10-second scripted battle matches snapshot', () => {
    const world = createWorld({ ... })
    const fixedRng = () => 0.5
    for (let t = 0; t < 10000; t += 16) {
      step(world, [], 16, fixedRng)
    }
    // wallHP is a Map — serialize as sorted array for stability
    const snapshot = JSON.stringify(world, (key, val) =>
      val instanceof Map ? Array.from(val.entries()).sort() : val
    )
    expect(snapshot).toMatchSnapshot()
  })
})
```

---

### `src/scenes/GameScene.ts` (edit — thin renderer)

**Analog:** self — the existing file is the source; extracting sim logic out of it

**GameScene.init handoff — preserved as-is** (`GameScene.ts` lines 117-145):
```typescript
init(data: GameSceneData) {
  if (data?.roomId)        gameState.roomId        = data.roomId
  if (data?.role)          gameState.role          = data.role
  if (data?.playerFaction) gameState.playerFaction = data.playerFaction

  const mapId = data?.mapId ?? gameState.mapId ?? 1
  this.mapDef = MAPS.find(m => m.id === mapId) ?? MAPS[0]
  gameState.mapId = this.mapDef.id

  this.hostSlot  = data?.hostSlot  ?? gameState.hostSlot  ?? 1
  this.guestSlot = data?.guestSlot ?? gameState.guestSlot ?? 1
  gameState.hostSlot  = this.hostSlot
  gameState.guestSlot = this.guestSlot

  // After D-12: also initialize the sim world here
  // this.world = createWorld({ hostSlot, guestSlot, mapBase, mapOver, isPractice, hostFaction, guestFaction })
}
```

**update() becomes the render loop** (replaces the five updateX calls):
```typescript
// After extraction — update() drives step() and reconciles
update(_t: number, dt: number) {
  if (this.paused || this.world.over) return

  const inputs = this.pendingInputs.splice(0)          // drain queue
  const events = step(this.world, inputs, dt, Math.random)

  // Reconcile views by id (D-03)
  reconcileUnits(this.world, this.unitViews, this)

  // Play discrete events
  for (const ev of events) {
    if (ev.type === 'unit_died')  { /* death animation already handled in reconcile */ }
    if (ev.type === 'wall_break') { this.drawWallOverlays(); audio.playWallBreak(); this.cameras.main.shake(180, 0.009) }
    if (ev.type === 'base_hit')   { this.flashBaseHit() }
    if (ev.type === 'game_over')  { this.triggerGameOver(ev.winner) }
  }

  // Broadcast outgoing events (D-04 — same wire protocol)
  this.broadcastEvents(events)

  // Update HUD (reads world state directly)
  if (this.goldEl)    this.goldEl.textContent = String(this.world.gold)
  if (this.timerEl)   { /* format world.timeLeft */ }
  if (this.hostHPEl)  this.hostHPEl.textContent = `${this.world.hostBaseHp} / 1000`
  if (this.guestHPEl) this.guestHPEl.textContent = `${this.world.guestBaseHp} / 1000`
  this.updateSlotAffordability()
}
```

**Broadcast handler — base_hp now writes to world** (`GameScene.ts` lines 848-860 — change target after D-12):
```typescript
// BEFORE:
this.hostBaseHP = p.hp
gameState.hostBaseHp = p.hp       // DELETE after D-12

// AFTER:
this.world.hostBaseHp = p.hp      // write to world, not gameState
```

---

### `src/lib/gameState.ts` (edit — slim to session + cache)

**Analog:** self — trimming existing fields

**Current full gameState object** (`src/lib/gameState.ts` lines 3-20):
```typescript
const gameState: GameStateType = {
  userId: null,
  username: null,
  playerFaction: null,
  unlockedUnits: ['scout_drone', 'vine_crawler', 'apprentice_mage'],
  loadout: [],
  wins: 0,
  losses: 0,
  roomId: null,
  role: null,
  hostBaseHp: 1000,    // DELETE (moves to world.hostBaseHp)
  guestBaseHp: 1000,   // DELETE (moves to world.guestBaseHp)
  gold: 200,           // DELETE (moves to world.gold)
  gameMode: 'topdown', // DELETE (never read in GameScene.ts — VERIFIED in RESEARCH.md)
  mapId: null,
  hostSlot: null,
  guestSlot: null,
}
```

**After D-12/D-14 — four fields removed:**
```typescript
const gameState: GameStateType = {
  userId: null,
  username: null,
  playerFaction: null,
  unlockedUnits: ['scout_drone', 'vine_crawler', 'apprentice_mage'],
  loadout: [],
  wins: 0,
  losses: 0,
  roomId: null,
  role: null,
  // hostBaseHp, guestBaseHp, gold, gameMode REMOVED
  mapId: null,
  hostSlot: null,
  guestSlot: null,
}
```

---

### `src/types/index.ts` (edit — remove battle fields from GameStateType)

**Analog:** self

**Current `GameStateType`** (`src/types/index.ts` lines 18-35):
```typescript
export interface GameStateType {
  userId: string | null
  username: string | null
  playerFaction: Faction | null
  unlockedUnits: string[]
  loadout: string[]
  wins: number
  losses: number
  roomId: string | null
  role: 'host' | 'guest' | null
  hostBaseHp: number      // DELETE (moves to SimWorld)
  guestBaseHp: number     // DELETE (moves to SimWorld)
  gold: number            // DELETE (moves to SimWorld)
  gameMode: 'topdown' | 'portrait'  // DELETE (never read — VERIFIED)
  mapId: number | null
  hostSlot: number | null
  guestSlot: number | null
}
```

**Removal is the compile-time enforcement** — TypeScript surfaces every write site when these fields are removed. Per RESEARCH.md Pitfall 1: remove from `GameStateType` simultaneously with adding to `SimWorld`; the compile error surfaces every write site.

---

## Shared Patterns

### D-11: resolveSide helper (duplicated in 3 places → one pure function)

**Source of duplication:** `GameScene.ts` lines 244-248, 297-301, 319-323

**Three identical blocks to replace** (`GameScene.ts` lines 244-248):
```typescript
const role = gameState.role ?? 'host'
const pFac   = gameState.playerFaction ?? 'machines'
const oppFac = this.opponentFaction(pFac)
const hostFac  = role === 'guest' ? oppFac : pFac
const guestFac = role === 'guest' ? pFac   : oppFac
```

**`opponentFaction` private method** (`GameScene.ts` lines 319-323):
```typescript
private opponentFaction(pFac: string): Faction {
  if (pFac === 'machines') return 'plants'
  if (pFac === 'plants')   return 'wizards'
  return 'machines'
}
```

**Target: extract to `src/lib/sideHelper.ts` (pure, no imports):**
```typescript
// src/lib/sideHelper.ts
import type { Faction } from '../types'

export function opponentFaction(f: Faction): Faction {
  if (f === 'machines') return 'plants'
  if (f === 'plants')   return 'wizards'
  return 'machines'
}

export function resolveSide(
  role: 'host' | 'guest',
  playerFaction: Faction,
): { hostFaction: Faction; guestFaction: Faction; dir: 1 | -1 } {
  const opp = opponentFaction(playerFaction)
  return {
    hostFaction:  role === 'guest' ? opp : playerFaction,
    guestFaction: role === 'guest' ? playerFaction : opp,
    dir: (role === 'host' ? -1 : 1) as 1 | -1,
  }
}
```

**Apply to:** `GameScene.drawBasePlacements()`, `GameScene.drawTowers()`, `GameScene.updateAI()` (all 3 duplication sites), and `TowerView.ts` constructor call site.

### Sim purity guard (D-01/D-04)

**Apply to ALL files under `src/sim/`:**

- Zero Phaser imports — every Phaser type that currently lives in the battle loop stays in `GameScene`, `UnitView`, `TowerView`
- Zero Supabase imports — the supabase import at `GameScene.ts:3` (`import { supabase } from '../lib/supabase'`) never touches `src/sim/`
- Test in `vitest.config.ts` `unit` project runs in `environment: 'node'` — Phaser imports will throw immediately in this environment, providing automatic enforcement

### Reconcile pattern (D-03)

**Source:** RESEARCH.md Pattern 1 (derived from D-03); no existing reconcile code in codebase

**Apply to:** `GameScene.update()` — the reconcile loop that replaces the five `updateX()` method calls:
```typescript
function reconcileUnits(
  world: SimWorld,
  views: Map<string, UnitView>,
  scene: Phaser.Scene,
): void {
  const liveIds = new Set<string>()
  for (const u of [...world.hostUnits, ...world.guestUnits]) {
    liveIds.add(u.id)
    let view = views.get(u.id)
    if (!view) {
      const def = UNITS.find(d => d.id === u.defId)!
      view = new UnitView(scene, u.id, def, u.laneSlot, u.dir)
      views.set(u.id, view)
      view.popIn()
    }
    view.syncFrom(u)
  }
  for (const [id, view] of views) {
    if (!liveIds.has(id)) {
      view.playDeathAnimation()
      views.delete(id)
    }
  }
}
```

**Key: reconcile by `SimUnit.id`, never by array position** — array order changes when units die and are pruned.

### Vitest test structure (D-15/D-17)

**Source:** `test/unit/pathfinder.test.ts` (the exact scaffold to replicate for sim tests)

**Apply to:** All 5 new files under `test/unit/sim/`

**Config already covers sim tests** (`vitest.config.ts` lines 7-9):
```typescript
{
  test: { name: 'unit', environment: 'node', include: ['test/unit/**/*.test.ts'] },
}
```

No new vitest config needed — `test/unit/sim/*.test.ts` is automatically included.

**Run command:** `npx vitest run --project unit`

---

## No Analog Found

All files have close analogs. No items in this section.

---

## Anti-Pattern Index (from RESEARCH.md — reference for planner)

| Anti-pattern | Location in source | Prevention |
|---|---|---|
| `unit.active` check (Phaser-only property) | `GameScene.ts:456, :534` | Replace every `u.active` with `!u.dead` in sim |
| Processing order: prune before both passes | `GameScene.ts:396-397` | Prune `dead` units AFTER `processUnits(host,guest)` AND `processUnits(guest,host)` |
| `wallTarget` guard skips both combat AND movement | `GameScene.ts:459` | In `combat.ts`: wall attack → combat scan → movement (this order is load-bearing) |
| `damageBase` + broadcast coupling | `GameScene.ts:546-568` | Sim emits `base_hit` event; scene broadcasts in response |
| `gameState.gold` two-way sync | `GameScene.ts:354-355, :405` | Remove `gold` from `GameStateType` simultaneously with adding to `SimWorld` |
| `triggerGameOver` double-call | `GameScene.ts:585` | Renderer checks `events.some(e => e.type === 'game_over')` once; `world.over` guards the sim side |
| Map snapshot instability | `world.wallHP: Map<string,number>` | Serialize as `Array.from(wallHP.entries()).sort()` in snapshot test |

---

## Metadata

**Analog search scope:** `src/scenes/`, `src/units/`, `src/lib/`, `src/types/`, `test/unit/`
**Files read:** 11 source files (GameScene.ts, Unit.ts, UnitData.ts, gameState.ts, types/index.ts, lib/api/account.ts, lib/pathfinder.ts, vitest.config.ts, test/unit/pathfinder.test.ts)
**Pattern extraction date:** 2026-06-12
