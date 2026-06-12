import { describe, expect, it } from 'vitest'
import { step } from '../../../src/sim/step'
import { makeWorld, spawnTestUnit } from './_helpers'

// D-17 (a): unit movement along waypoints.
// CELL = 36; a cell-center waypoint for (row, col) is (col*36+18, row*36+18).

describe('unit movement (D-17a)', () => {
  it('advances toward its single waypoint each step', () => {
    const world = makeWorld()
    // Place a host unit at (100, 300) with one waypoint straight up at (100, 100).
    const unit = spawnTestUnit(world, {
      army: 'host',
      x: 100,
      y: 300,
      speedPx: 90,
      waypoints: [{ x: 100, y: 100 }],
    })
    const startY = unit.y

    step(world, [], 1000, () => 0) // 1s at 90px/s => 90px

    // Moved toward the waypoint (upward = decreasing y)
    expect(unit.y).toBeLessThan(startY)
    // Exactly speedPx * dt/1000 along the straight vertical line
    expect(unit.y).toBeCloseTo(startY - 90, 5)
    expect(unit.x).toBeCloseTo(100, 5)
    // Has not yet arrived (200px away, moved 90)
    expect(unit.wpIdx).toBe(0)
  })

  it('increments wpIdx when it arrives at the waypoint', () => {
    const world = makeWorld()
    const unit = spawnTestUnit(world, {
      army: 'host',
      x: 100,
      y: 200,
      speedPx: 90,
      waypoints: [{ x: 100, y: 150 }], // 50px away
    })

    // 1s at 90px/s overshoots the 50px gap → snaps to waypoint, wpIdx++
    step(world, [], 1000, () => 0)

    expect(unit.x).toBeCloseTo(100, 5)
    expect(unit.y).toBeCloseTo(150, 5)
    expect(unit.wpIdx).toBe(1)
  })

  it('walks a multi-waypoint path in order across several steps', () => {
    const world = makeWorld()
    const unit = spawnTestUnit(world, {
      army: 'host',
      x: 100,
      y: 300,
      speedPx: 100,
      waypoints: [
        { x: 100, y: 200 },
        { x: 200, y: 200 },
      ],
    })

    // Step 1: 100px up → arrives at first waypoint
    step(world, [], 1000, () => 0)
    expect(unit.wpIdx).toBe(1)
    expect(unit.y).toBeCloseTo(200, 5)

    // Step 2: 100px right → arrives at second waypoint
    step(world, [], 1000, () => 0)
    expect(unit.wpIdx).toBe(2)
    expect(unit.x).toBeCloseTo(200, 5)
  })
})
