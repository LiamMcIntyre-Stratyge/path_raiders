import { describe, expect, it } from 'vitest'
import { step } from '../../../src/sim/step'
import type { SimEvent } from '../../../src/sim/types'
import { makeBase, makeOver, makeWorld, paintOver, spawnTestUnit } from './_helpers'

// D-17 (d): wall-break detour through the pathfinder. A machines unit whose next
// waypoint is a `break_mach` wall sets wallTarget (priority 1), grinds the wall
// to 0 over repeated attacks, then a `wall_break` event clears the overlay and
// assignPath() recomputes a detour so the unit resumes toward the enemy base.
//
// CELL = 36; a cell-center waypoint for (row, col) is (col*36+18, row*36+18).
// break_mach starts at 200 HP (WALL_MAX_HP); a default scout deals 45/attack.

const CELL = 36
const cellCenter = (r: number, c: number) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 })

// All-path base so the pathfinder can always find a route (and a detour after the
// break). The single break_mach cell sits on the unit's lane.
function makeWallWorld() {
  const base = makeBase('path')
  const over = paintOver(makeOver(), 8, 5, 'break_mach')
  return makeWorld(over, base)
}

describe('wall-break detour (D-17d)', () => {
  it('sets wallTarget when the next waypoint is a breakable wall for its faction', () => {
    const world = makeWallWorld()
    world.towers = []

    const wall = cellCenter(8, 5)
    // Host machines unit sitting AT the wall cell with that cell as its current
    // waypoint → the priority-3 wall check fires and sets wallTarget.
    const unit = spawnTestUnit(world, {
      army: 'host',
      x: wall.x,
      y: wall.y,
      faction: 'machines',
      waypoints: [wall],
    })

    step(world, [], 16, () => 0)

    expect(unit.wallTarget).toEqual([8, 5])
    // The wall is registered and still standing at this point.
    expect(world.wallHP.has('8,5')).toBe(true)
  })

  it('emits wall_break, clears mutableOver, and detours the unit once the wall falls', () => {
    const world = makeWallWorld()
    world.towers = []

    const wall = cellCenter(8, 5)
    const unit = spawnTestUnit(world, {
      army: 'host',
      x: wall.x,
      y: wall.y,
      faction: 'machines',
      dmg: 45,
      attackRate: 900,
      waypoints: [wall],
    })

    // Wall has 200 HP; 45 dmg/attack with attackRate 900ms. Stepping at dt=900
    // lands one attack per step → ceil(200/45) = 5 attacks to break it.
    let broke: SimEvent | undefined
    for (let i = 0; i < 30 && !broke; i++) {
      const events = step(world, [], 900, () => 0)
      broke = events.find((e) => e.type === 'wall_break')
    }

    // wall_break event for the right cell
    expect(broke).toBeDefined()
    expect(broke && broke.type === 'wall_break' && broke.row).toBe(8)
    expect(broke && broke.type === 'wall_break' && broke.col).toBe(5)
    // Overlay cleared + wall HP entry removed
    expect(world.mutableOver[8][5]).toBeNull()
    expect(world.wallHP.has('8,5')).toBe(false)
    // wallTarget released and a fresh detour path assigned (assignPath resets it)
    expect(unit.wallTarget).toBeNull()
    expect(unit.dead).toBe(false)
    expect(unit.waypoints.length).toBeGreaterThan(0)

    // The unit now advances along the recomputed path (it is no longer pinned to
    // the wall cell).
    const beforeX = unit.x
    const beforeY = unit.y
    for (let i = 0; i < 10; i++) step(world, [], 900, () => 0)
    expect(unit.x !== beforeX || unit.y !== beforeY).toBe(true)
  })
})
