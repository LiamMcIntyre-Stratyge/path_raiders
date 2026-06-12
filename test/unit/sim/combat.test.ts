import { describe, expect, it } from 'vitest'
import { step } from '../../../src/sim/step'
import type { SimEvent } from '../../../src/sim/types'
import { makeWorld, spawnTestUnit } from './_helpers'

// D-17 (b): combat — two units fight, lower-HP dies. Plus the D-07 id-tiebreak
// determinism case and the wallTarget-priority guard.

describe('combat (D-17b)', () => {
  it('lower-HP unit dies first and emits a unit_died event with its id', () => {
    const world = makeWorld()
    world.towers = [] // isolate unit-vs-unit combat from tower fire
    // Two enemies 30px apart (within COMBAT_RANGE = 52), no waypoints → they fight.
    // Host hits for 45/attack; guest hits for 45/attack. Guest has less HP → dies first.
    const host = spawnTestUnit(world, { army: 'host', x: 100, y: 200, hp: 200, dmg: 45 })
    const guest = spawnTestUnit(world, { army: 'guest', x: 130, y: 200, hp: 90, dmg: 45 })

    let died: SimEvent | undefined
    for (let i = 0; i < 50 && !died; i++) {
      const events = step(world, [], 100, () => 0)
      died = events.find((e) => e.type === 'unit_died')
    }

    expect(died).toBeDefined()
    expect(died && died.type === 'unit_died' && died.unitId).toBe(guest.id)
    expect(guest.dead).toBe(true)
    expect(host.dead).toBe(false)
  })

  it('an attack lands on the first cooldown tick (attackCd starts at 0)', () => {
    const world = makeWorld()
    world.towers = [] // isolate unit combat from tower fire
    const host = spawnTestUnit(world, { army: 'host', x: 100, y: 200, hp: 200, dmg: 45 })
    const guest = spawnTestUnit(world, { army: 'guest', x: 130, y: 200, hp: 200, dmg: 45 })

    step(world, [], 16, () => 0)

    // Both started at attackCd 0 → both fired this frame, each took 45.
    expect(guest.hp).toBe(155)
    expect(host.hp).toBe(155)
  })
})

describe('D-07 id-tiebreak determinism', () => {
  it('targets the lower string-id enemy when two are equidistant', () => {
    // Build the scenario twice and assert the same enemy is hit both runs.
    function run(): { firstId: string; hitId: string } {
      const world = makeWorld()
      world.towers = [] // isolate the attacker's target choice from tower fire
      const attacker = spawnTestUnit(world, { army: 'host', x: 100, y: 200, hp: 500, dmg: 45 })
      // Two guests at identical distance (30px) on opposite sides of the attacker.
      const a = spawnTestUnit(world, { army: 'guest', x: 130, y: 200, hp: 500, dmg: 0 })
      const b = spawnTestUnit(world, { army: 'guest', x: 70, y: 200, hp: 500, dmg: 0 })
      void attacker
      step(world, [], 16, () => 0)
      // The one that took damage is the chosen target.
      const lowerId = a.id < b.id ? a : b
      const hit = a.hp < 500 ? a : b.hp < 500 ? b : null
      return { firstId: lowerId.id, hitId: hit ? hit.id : '' }
    }

    const r1 = run()
    const r2 = run()
    // Deterministic across runs
    expect(r1.hitId).toBe(r2.hitId)
    // And it is the lower-id enemy that gets hit
    expect(r1.hitId).toBe(r1.firstId)
    expect(r1.hitId).not.toBe('')
  })
})

describe('wallTarget priority guard', () => {
  it('a unit with wallTarget attacks the wall and does NOT scan combat or move', () => {
    const world = makeWorld()
    // Seed a breakable wall at (5,5) so wallHP.has() is true.
    world.wallHP.set('5,5', 200)
    world.mutableOver[5][5] = 'wall'

    // Host unit sitting on the wall target, with an enemy adjacent AND a waypoint.
    const host = spawnTestUnit(world, {
      army: 'host',
      x: 5 * 36 + 18,
      y: 6 * 36 + 18,
      hp: 200,
      dmg: 50,
      faction: 'machines',
      waypoints: [{ x: 5 * 36 + 18, y: 5 * 36 + 18 }],
    })
    host.wallTarget = [5, 5]
    const startX = host.x
    const startY = host.y

    // Adjacent enemy that would be in combat range if the guard were absent.
    const enemy = spawnTestUnit(world, {
      army: 'guest',
      x: host.x + 20,
      y: host.y,
      hp: 200,
      dmg: 0,
    })

    step(world, [], 16, () => 0)

    // Wall took damage (the unit attacked the wall)
    expect(world.wallHP.get('5,5')).toBe(150)
    // The enemy was NOT scanned/damaged (guard skipped combat)
    expect(enemy.hp).toBe(200)
    // The unit did NOT move (guard skipped movement)
    expect(host.x).toBe(startX)
    expect(host.y).toBe(startY)
  })
})
