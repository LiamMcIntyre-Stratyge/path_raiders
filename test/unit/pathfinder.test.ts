import { describe, expect, it } from 'vitest'
import { findPath, isWalkable, canBreakWall } from '../../src/lib/pathfinder'
import type { TerrainType, OverlayType } from '../../src/types'

// ─── Grid helpers ───────────────────────────────────────────────────────────

// The pathfinder imports COLS=22, ROWS=16 from src/maps/MapData.
// All hand-built grids must match those dimensions so BFS bounds-checks work.
const ROWS = 16
const COLS = 22

function makeBase(fill: TerrainType = 'open'): TerrainType[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill) as TerrainType[])
}

function makeOver(fill: OverlayType = null): OverlayType[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill) as OverlayType[])
}

// Paint a single cell on a grid (returns the same grid for chaining)
function paintBase(grid: TerrainType[][], r: number, c: number, t: TerrainType): TerrainType[][] {
  grid[r][c] = t
  return grid
}

function paintOver(grid: OverlayType[][], r: number, c: number, ov: OverlayType): OverlayType[][] {
  grid[r][c] = ov
  return grid
}

// Assert every consecutive pair in the path is exactly 4-adjacent
function assertAdjacent(path: [number, number][]): void {
  for (let i = 1; i < path.length; i++) {
    const dr = Math.abs(path[i][0] - path[i - 1][0])
    const dc = Math.abs(path[i][1] - path[i - 1][1])
    expect(dr + dc).toBe(1)
  }
}

// ─── isWalkable ───────────────────────────────────────────────────────────

describe('isWalkable', () => {
  it('returns false for a wall overlay regardless of terrain', () => {
    const base = makeBase('path')
    const over = paintOver(makeOver(), 5, 5, 'wall')
    expect(isWalkable(5, 5, base, over)).toBe(false)
  })

  it('returns false for break_mach overlay', () => {
    const base = makeBase('path')
    const over = paintOver(makeOver(), 5, 5, 'break_mach')
    expect(isWalkable(5, 5, base, over)).toBe(false)
  })

  it('returns false for break_plant overlay', () => {
    const base = makeBase('path')
    const over = paintOver(makeOver(), 5, 5, 'break_plant')
    expect(isWalkable(5, 5, base, over)).toBe(false)
  })

  it('returns false for break_wiz overlay', () => {
    const base = makeBase('path')
    const over = paintOver(makeOver(), 5, 5, 'break_wiz')
    expect(isWalkable(5, 5, base, over)).toBe(false)
  })

  it('returns true for a cell in base row 0 regardless of terrain', () => {
    const base = makeBase('open')    // 'open' is not in WALKABLE_TERRAIN
    const over = makeOver()          // no overlay
    expect(isWalkable(0, 5, base, over)).toBe(true)
  })

  it('returns true for a cell in base row 1 regardless of terrain', () => {
    const base = makeBase('rock')
    const over = makeOver()
    expect(isWalkable(1, 10, base, over)).toBe(true)
  })

  it('returns true for a cell in base row 14 regardless of terrain', () => {
    const base = makeBase('water')
    const over = makeOver()
    expect(isWalkable(14, 3, base, over)).toBe(true)
  })

  it('returns true for a cell in base row 15 regardless of terrain', () => {
    const base = makeBase('lava')
    const over = makeOver()
    expect(isWalkable(15, 21, base, over)).toBe(true)
  })

  it('returns true for a base_zone overlay even on non-walkable terrain', () => {
    const base = makeBase('open')    // non-walkable terrain
    const over = paintOver(makeOver(), 7, 4, 'base_zone')
    expect(isWalkable(7, 4, base, over)).toBe(true)
  })

  it('returns true for path terrain with no overlay', () => {
    const base = paintBase(makeBase('open'), 5, 5, 'path')
    const over = makeOver()
    expect(isWalkable(5, 5, base, over)).toBe(true)
  })

  it('returns true for bridge terrain with no overlay', () => {
    const base = paintBase(makeBase('open'), 5, 5, 'bridge')
    const over = makeOver()
    expect(isWalkable(5, 5, base, over)).toBe(true)
  })

  it('returns true for cross terrain with no overlay', () => {
    const base = paintBase(makeBase('open'), 5, 5, 'cross')
    const over = makeOver()
    expect(isWalkable(5, 5, base, over)).toBe(true)
  })

  it('returns false for open terrain with no overlay in a non-base row', () => {
    const base = makeBase('open')
    const over = makeOver()
    // row 7 is not a base row; 'open' is not in WALKABLE_TERRAIN
    expect(isWalkable(7, 5, base, over)).toBe(false)
  })

  it('returns false for rock terrain with no overlay in a non-base row', () => {
    const base = makeBase('rock')
    const over = makeOver()
    expect(isWalkable(8, 8, base, over)).toBe(false)
  })
})

// ─── canBreakWall ────────────────────────────────────────────────────────────

describe('canBreakWall', () => {
  it('wall overlay returns true for machines faction', () => {
    expect(canBreakWall('wall', 'machines')).toBe(true)
  })

  it('wall overlay returns true for plants faction', () => {
    expect(canBreakWall('wall', 'plants')).toBe(true)
  })

  it('wall overlay returns true for wizards faction', () => {
    expect(canBreakWall('wall', 'wizards')).toBe(true)
  })

  it('break_mach returns true only for machines', () => {
    expect(canBreakWall('break_mach', 'machines')).toBe(true)
    expect(canBreakWall('break_mach', 'plants')).toBe(false)
    expect(canBreakWall('break_mach', 'wizards')).toBe(false)
  })

  it('break_plant returns true only for plants', () => {
    expect(canBreakWall('break_plant', 'plants')).toBe(true)
    expect(canBreakWall('break_plant', 'machines')).toBe(false)
    expect(canBreakWall('break_plant', 'wizards')).toBe(false)
  })

  it('break_wiz returns true only for wizards', () => {
    expect(canBreakWall('break_wiz', 'wizards')).toBe(true)
    expect(canBreakWall('break_wiz', 'machines')).toBe(false)
    expect(canBreakWall('break_wiz', 'plants')).toBe(false)
  })

  it('null overlay returns false for all factions', () => {
    expect(canBreakWall(null, 'machines')).toBe(false)
    expect(canBreakWall(null, 'plants')).toBe(false)
    expect(canBreakWall(null, 'wizards')).toBe(false)
  })

  it('base_zone overlay returns false (not a breakable wall)', () => {
    expect(canBreakWall('base_zone', 'machines')).toBe(false)
  })

  it('tunnel overlay returns false', () => {
    expect(canBreakWall('tunnel', 'machines')).toBe(false)
  })
})

// ─── findPath ────────────────────────────────────────────────────────────────

describe('findPath', () => {
  // Build a grid with a straight horizontal corridor of 'path' cells at row 5,
  // columns 2..10. All other cells are 'open' (not walkable) with no overlay.
  // Base rows (0,1,14,15) are also walkable, but the path we test is in row 5.
  function makeCorridorGrids() {
    const base = makeBase('open')
    const over = makeOver()
    for (let c = 2; c <= 10; c++) {
      base[5][c] = 'path'
    }
    return { base, over }
  }

  it('returns a non-empty path through an open corridor', () => {
    const { base, over } = makeCorridorGrids()
    const path = findPath(5, 2, [[5, 10]], base, over, 'machines')
    expect(path.length).toBeGreaterThan(0)
    // The last cell in the path must be the goal
    const last = path[path.length - 1]
    expect(last[0]).toBe(5)
    expect(last[1]).toBe(10)
  })

  it('every step in the corridor path is 4-adjacent', () => {
    const { base, over } = makeCorridorGrids()
    const path = findPath(5, 2, [[5, 10]], base, over, 'machines')
    assertAdjacent(path)
  })

  it('returns [] when the goal is fully walled off with no breakables', () => {
    // Use a corridor of 'path' but block every approach to the goal with break_plant
    // overlays. 'machines' cannot break break_plant cells (canBreakWall returns false),
    // so the goal at (5,10) is unreachable for the 'machines' faction.
    const base = makeBase('open')
    const over = makeOver()
    // Open the corridor up to col 6 only
    for (let c = 2; c <= 6; c++) {
      base[5][c] = 'path'
    }
    // The goal column 10 is isolated in 'open' terrain; col 7 is the barrier
    paintOver(over, 5, 7, 'break_plant')  // machines can't break this
    // Ensure no base-row detour by also placing the goal off any base row
    // (goal is at row 5, which is not a base row)
    const path = findPath(5, 2, [[5, 10]], base, over, 'machines')
    expect(path).toEqual([])
  })

  it('reaches a goal behind a faction-specific breakable wall for the matching faction', () => {
    // Row 5 is 'path' from col 2..10.  Col 7 is a break_mach barrier.
    // Goal is at (5, 10).  Start at (5, 2).
    // Phase 1 BFS (isWalkable only) cannot pass through (5,7).
    // Phase 2 BFS allows canBreakWall, so machines can pass.
    const base = makeBase('open')
    const over = makeOver()
    for (let c = 2; c <= 10; c++) {
      base[5][c] = 'path'
    }
    // Block the corridor with a machines-only breakable wall
    paintOver(over, 5, 7, 'break_mach')
    // Surround everything else so there is no detour (non-path cells are 'open')
    const path = findPath(5, 2, [[5, 10]], base, over, 'machines')
    expect(path.length).toBeGreaterThan(0)
    const last = path[path.length - 1]
    expect(last[0]).toBe(5)
    expect(last[1]).toBe(10)
  })

  it('returns [] for a goal behind a break_mach wall for a non-matching faction', () => {
    const base = makeBase('open')
    const over = makeOver()
    for (let c = 2; c <= 10; c++) {
      base[5][c] = 'path'
    }
    paintOver(over, 5, 7, 'break_mach')
    // 'plants' cannot break a break_mach wall → unreachable
    const path = findPath(5, 2, [[5, 10]], base, over, 'plants')
    expect(path).toEqual([])
  })

  it('finds the goal when offered multiple goals and one is reachable', () => {
    const { base, over } = makeCorridorGrids()
    // Two goals: (5,10) reachable, (9,15) unreachable (off path in open terrain)
    const path = findPath(5, 2, [[9, 15], [5, 10]], base, over, 'machines')
    expect(path.length).toBeGreaterThan(0)
    const last = path[path.length - 1]
    expect(last[0]).toBe(5)
    expect(last[1]).toBe(10)
  })

  it('returns [] when there are no reachable goals', () => {
    const base = makeBase('open')  // entirely non-walkable mid-rows
    const over = makeOver()
    // Start is on row 0 (base row, walkable), but goal is interior 'open' terrain
    const path = findPath(0, 2, [[8, 8]], base, over, 'machines')
    expect(path).toEqual([])
  })

  it('path from a breakable-wall route is 4-adjacent step-by-step', () => {
    const base = makeBase('open')
    const over = makeOver()
    for (let c = 2; c <= 10; c++) {
      base[5][c] = 'path'
    }
    paintOver(over, 5, 7, 'break_mach')
    const path = findPath(5, 2, [[5, 10]], base, over, 'machines')
    assertAdjacent(path)
  })
})
