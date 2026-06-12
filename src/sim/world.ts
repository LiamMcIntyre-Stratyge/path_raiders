import type { SimUnit, SimWorld, SimEvent, SimInput } from './types'
import type { OverlayType, TerrainType } from '../types'
import {
  COLS,
  ROWS,
  CELL,
  BASE_SLOTS,
  HOST_ROWS,
  GUEST_ROWS,
  slotWorldX,
  hostSpawnY,
  guestSpawnY,
} from '../maps/MapData'
import { TOWER_RANGE, TOWER_DMG, TOWER_CD } from '../towers/TowerData'
import { UNITS } from '../units/UnitData'
import { findPath, type Cell } from '../lib/pathfinder'

// ─── Wall HP ───────────────────────────────────────────────────────────────
// Lifted verbatim from GameScene.ts:22-25 — the sim owns wall HP now (D-12).
const WALL_MAX_HP: Partial<Record<string, number>> = {
  wall: 250,
  break_mach: 200,
  break_plant: 200,
  break_wiz: 200,
}
const WALL_OVERLAYS = new Set(['wall', 'break_mach', 'break_plant', 'break_wiz'])

// Starting gold for a fresh battle world (GameScene.create default). Exported so
// pre-battle UI (e.g. the lobby resources HUD) can show it without reaching into
// gameState — live gold lives on SimWorld once a battle starts (D-12).
export const STARTING_GOLD = 200

export interface CreateWorldOptions {
  gold?: number
  hostSlot: number
  guestSlot: number
  mapBase: TerrainType[][]
  mapOver: OverlayType[][]
  isPractice: boolean
  hostFaction: string
  guestFaction: string
}

/**
 * Factory (NOT a singleton — tests instantiate a fresh world per scenario).
 *
 * Mirrors GameScene.create() :154-174 exactly: clones mapOver into a mutable
 * grid, seeds wallHP from WALL_OVERLAYS, builds the 6 towers (3 slots × 2
 * sides), and initializes battle state. The wallHP seed block is byte-identical
 * to GameScene.create() :155-162; the tower build is byte-identical to :166-174.
 */
export function createWorld(opts: CreateWorldOptions): SimWorld {
  // Mutable overlay + wall HP (GameScene.create :154-162)
  const mutableOver = opts.mapOver.map((row) => [...row])
  const wallHP = new Map<string, number>()
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ov = mutableOver[r][c]
      if (ov && WALL_OVERLAYS.has(ov)) {
        wallHP.set(`${r},${c}`, WALL_MAX_HP[ov] ?? 200)
      }
    }
  }

  // Towers (GameScene.create :166-174): 3 slots × 2 sides
  const towers: SimWorld['towers'] = []
  for (let s = 0; s < 3; s++) {
    const cx = slotWorldX(s)
    // Host-side tower: between rows 13-14, attacks guest units (moving down)
    const hostTowerY = 13.5 * CELL
    towers.push({
      cx,
      cy: hostTowerY,
      slotIdx: s,
      isHostSide: true,
      range: TOWER_RANGE,
      dmg: TOWER_DMG,
      cd: 0,
      maxCd: TOWER_CD,
    })
    // Guest-side tower: between rows 1-2, attacks host units (moving up)
    const guestTowerY = 1.5 * CELL
    towers.push({
      cx,
      cy: guestTowerY,
      slotIdx: s,
      isHostSide: false,
      range: TOWER_RANGE,
      dmg: TOWER_DMG,
      cd: 0,
      maxCd: TOWER_CD,
    })
  }

  return {
    gold: opts.gold ?? STARTING_GOLD,
    goldAccum: 0,
    timeLeft: 180,
    hostBaseHp: 1000,
    guestBaseHp: 1000,
    hostUnits: [],
    guestUnits: [],
    towers,
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

/**
 * Computes the waypoint list for a unit toward the enemy base, mirroring
 * GameScene.assignPath :714-726. Pure — reads mapBase + mutableOver off the
 * world and calls the (already pure, Phase 9-tested) pathfinder.
 */
export function assignPath(world: SimWorld, unit: SimUnit): void {
  const startR = Math.max(0, Math.min(ROWS - 1, Math.floor(unit.y / CELL)))
  const startC = Math.max(0, Math.min(COLS - 1, Math.floor(unit.x / CELL)))
  const targetSlot = unit.dir === -1 ? world.guestSlot : world.hostSlot
  const targetRows = unit.dir === -1 ? GUEST_ROWS : HOST_ROWS
  const goals: Cell[] = []
  for (let r = targetRows[0]; r <= targetRows[1]; r++)
    for (let c = BASE_SLOTS[targetSlot].cols[0]; c <= BASE_SLOTS[targetSlot].cols[1]; c++)
      goals.push([r, c])
  const cellPath = findPath(startR, startC, goals, world.mapBase, world.mutableOver, unit.faction)
  unit.waypoints = cellPath.map(([r, c]) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 }))
  unit.wpIdx = 0
  unit.wallTarget = null
}

/**
 * Spawns a unit from a deploy intent, mirroring GameScene.tryDeployAt spawn
 * geometry (:324-334). Resolves dir/spawn coords from the role, builds a fresh
 * SimUnit copying stats from its UnitDefinition, computes its initial path, and
 * pushes it onto the correct army.
 *
 * The `events` param is accepted for symmetry with the rest of the sim API
 * (spawning emits no events today, but keeping the signature stable means the
 * step() call site does not change if spawning ever needs to emit).
 */
export function spawnUnit(
  world: SimWorld,
  input: { unitId: string; slot: number; role: 'host' | 'guest' },
  _events: SimEvent[],
): SimUnit | null {
  const def = UNITS.find((u) => u.id === input.unitId)
  if (!def) return null

  const dir: 1 | -1 = input.role === 'host' ? -1 : 1 // host moves UP (-1), guest DOWN (+1)
  const spawnX = slotWorldX(input.slot)
  const spawnY = input.role === 'host' ? hostSpawnY() : guestSpawnY()

  const unit: SimUnit = {
    id: String(world.nextId++),
    defId: def.id,
    faction: def.faction,
    x: spawnX,
    y: spawnY,
    hp: def.hp,
    maxHp: def.hp,
    dir,
    laneSlot: input.slot,
    attackCd: 0,
    attackRate: 900,
    speedPx: def.speedPx,
    dmg: def.dmg,
    waypoints: [],
    wpIdx: 0,
    wallTarget: null,
    dead: false,
  }

  assignPath(world, unit)

  if (input.role === 'host') world.hostUnits.push(unit)
  else world.guestUnits.push(unit)

  return unit
}

// Re-export the SimInput type for convenience at deploy call sites.
export type { SimInput }
