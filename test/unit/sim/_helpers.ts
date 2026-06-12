import { createWorld } from '../../../src/sim/world'
import type { SimUnit, SimWorld } from '../../../src/sim/types'
import type { TerrainType, OverlayType } from '../../../src/types'

// The pathfinder + MapData use COLS=22, ROWS=16. All hand-built grids must match
// those dimensions so BFS bounds-checks work. Replicates the pathfinder test scaffold.
export const ROWS = 16
export const COLS = 22

export function makeBase(fill: TerrainType = 'open'): TerrainType[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill) as TerrainType[])
}

export function makeOver(fill: OverlayType = null): OverlayType[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill) as OverlayType[])
}

// Paint a single overlay cell (returns the grid for chaining)
export function paintOver(grid: OverlayType[][], r: number, c: number, ov: OverlayType): OverlayType[][] {
  grid[r][c] = ov
  return grid
}

/**
 * Build a minimal world for combat/movement scenarios. Defaults to an all-path
 * base (so units can move anywhere) with no overlays, practice off.
 */
export function makeWorld(over: ReturnType<typeof makeOver> = makeOver(), base = makeBase('path')): SimWorld {
  return createWorld({
    hostSlot: 1,
    guestSlot: 1,
    mapBase: base,
    mapOver: over,
    isPractice: false,
    hostFaction: 'machines',
    guestFaction: 'plants',
  })
}

/**
 * Spawn a test unit directly with explicit position/stats, bypassing the deploy
 * geometry so combat/movement cases can place units precisely. Pushes onto the
 * correct army based on `dir`/`army` and assigns a monotonic id.
 */
export function spawnTestUnit(
  world: SimWorld,
  opts: {
    army: 'host' | 'guest'
    x: number
    y: number
    hp?: number
    dmg?: number
    speedPx?: number
    dir?: 1 | -1
    faction?: string
    defId?: string
    waypoints?: { x: number; y: number }[]
    attackRate?: number
  },
): SimUnit {
  const dir: 1 | -1 = opts.dir ?? (opts.army === 'host' ? -1 : 1)
  const hp = opts.hp ?? 100
  const unit: SimUnit = {
    id: String(world.nextId++),
    defId: opts.defId ?? 'scout_drone',
    faction: opts.faction ?? (opts.army === 'host' ? 'machines' : 'plants'),
    x: opts.x,
    y: opts.y,
    hp,
    maxHp: hp,
    dir,
    laneSlot: 1,
    attackCd: 0,
    attackRate: opts.attackRate ?? 900,
    speedPx: opts.speedPx ?? 90,
    dmg: opts.dmg ?? 45,
    waypoints: opts.waypoints ?? [],
    wpIdx: 0,
    wallTarget: null,
    dead: false,
  }
  if (opts.army === 'host') world.hostUnits.push(unit)
  else world.guestUnits.push(unit)
  return unit
}
