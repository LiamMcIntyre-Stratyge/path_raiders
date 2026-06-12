import { describe, expect, it } from 'vitest'
import { step } from '../../../src/sim/step'
import type { SimEvent } from '../../../src/sim/types'
import { makeWorld, spawnTestUnit } from './_helpers'

// D-17 (c): win conditions — by timer expiry AND by base-reach.
// The timer winner is decided by the hostBaseHp vs guestBaseHp comparison
// (host>guest→host, guest>host→guest, equal→tie). A base-reaching unit deals
// BASE_REACH_DMG (60) to the enemy base; when a base hits 0 a game_over fires.

describe('win by timer expiry (D-17c)', () => {
  it('emits game_over when the timer crosses 0 (tie when base HP is equal)', () => {
    const world = makeWorld()
    world.timeLeft = 0.001 // just above 0 → one 16ms step pushes it to 0

    const events = step(world, [], 16, () => 0)

    const over = events.find((e) => e.type === 'game_over')
    expect(over).toBeDefined()
    // Both bases start at 1000 → tie
    expect(over && over.type === 'game_over' && over.winner).toBe('tie')
    expect(world.over).toBe(true)
  })

  it('declares host the winner on timer expiry when host base HP is higher', () => {
    const world = makeWorld()
    world.timeLeft = 0.001
    world.guestBaseHp = 500 // host (1000) > guest (500) → host wins

    const events = step(world, [], 16, () => 0)

    const over = events.find((e) => e.type === 'game_over')
    expect(over && over.type === 'game_over' && over.winner).toBe('host')
  })

  it('declares guest the winner on timer expiry when guest base HP is higher', () => {
    const world = makeWorld()
    world.timeLeft = 0.001
    world.hostBaseHp = 400 // guest (1000) > host (400) → guest wins

    const events = step(world, [], 16, () => 0)

    const over = events.find((e) => e.type === 'game_over')
    expect(over && over.type === 'game_over' && over.winner).toBe('guest')
  })

  it('does NOT re-emit game_over once the world is already over', () => {
    const world = makeWorld()
    world.timeLeft = 0.001
    step(world, [], 16, () => 0) // first crossing → game_over

    const events = step(world, [], 16, () => 0) // already over
    expect(events.some((e) => e.type === 'game_over')).toBe(false)
  })
})

describe('win by base-reach (D-17c)', () => {
  it('a unit at its exhausted final waypoint emits base_hit on the enemy base', () => {
    const world = makeWorld()
    world.towers = [] // isolate from tower fire

    // Host unit (dir -1 → damages the GUEST base) that has consumed all its
    // waypoints (isAtGoal true) but still has a non-empty waypoint list — the
    // "legitimately reached the enemy base" branch (combat.ts :148-159).
    const unit = spawnTestUnit(world, {
      army: 'host',
      x: 100,
      y: 60,
      waypoints: [{ x: 100, y: 60 }],
    })
    unit.wpIdx = unit.waypoints.length // wpIdx >= length → isAtGoal

    const events = step(world, [], 16, () => 0)

    const hit = events.find((e) => e.type === 'base_hit')
    expect(hit).toBeDefined()
    expect(hit && hit.type === 'base_hit' && hit.side).toBe('guest')
    // Guest base took BASE_REACH_DMG = 60
    expect(world.guestBaseHp).toBe(940)
    // The unit self-destructs on reaching the base (takeDamage 9999)
    expect(unit.dead).toBe(true)
  })

  it('emits game_over with the attacking side as winner when the enemy base falls', () => {
    const world = makeWorld()
    world.towers = []
    world.guestBaseHp = 60 // one base-reach (60 dmg) finishes it

    const unit = spawnTestUnit(world, {
      army: 'host',
      x: 100,
      y: 60,
      waypoints: [{ x: 100, y: 60 }],
    })
    unit.wpIdx = unit.waypoints.length

    let over: SimEvent | undefined
    for (let i = 0; i < 5 && !over; i++) {
      const events = step(world, [], 16, () => 0)
      over = events.find((e) => e.type === 'game_over')
    }

    expect(over).toBeDefined()
    // Host destroyed the guest base → host wins
    expect(over && over.type === 'game_over' && over.winner).toBe('host')
    expect(world.guestBaseHp).toBe(0)
    expect(world.over).toBe(true)
  })
})
