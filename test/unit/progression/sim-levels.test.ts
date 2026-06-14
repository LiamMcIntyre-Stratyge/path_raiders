// Wave-0 RED scaffold — PROG-03 sim level injection.
// This suite is RED until plan 03 wires per-side level fields into createWorld/spawnUnit.
// Plan 03 turns this GREEN by:
//   1. Adding hostTowerLevel/guestTowerLevel/hostUnitLevels/guestUnitLevels to CreateWorldOptions
//   2. Calling resolveTowerStats(opts.hostTowerLevel ?? 1) in createWorld for tower builds
//   3. Calling resolveUnitStats from world.hostUnitLevels/guestUnitLevels in spawnUnit

import { describe, it, expect } from 'vitest'
import { createWorld, spawnUnit } from '../../../src/sim/world'
import { makeBase, makeOver } from '../sim/_helpers'
import { TOWER_LEVELS, TOWER_DMG } from '../../../src/towers/TowerData'
import { resolveUnitStats } from '../../../src/units/UnitData'

/**
 * Extended makeWorld for P12 PROG-03 level injection — passes level fields through
 * to createWorld. These optional fields are added in plan 03.
 */
function makeWorldWithLevels(opts: {
  hostTowerLevel?: number
  guestTowerLevel?: number
  hostUnitLevels?: Record<string, number>
  guestUnitLevels?: Record<string, number>
}) {
  // @ts-expect-error -- hostTowerLevel/guestTowerLevel/hostUnitLevels/guestUnitLevels
  // are plan-03 additions to CreateWorldOptions; this scaffold is intentionally RED
  return createWorld({
    hostSlot: 1,
    guestSlot: 1,
    mapBase: makeBase('path'),
    mapOver: makeOver(),
    isPractice: false,
    hostFaction: 'machines',
    guestFaction: 'plants',
    ...opts,
  })
}

describe('sim level injection (PROG-03)', () => {
  it('createWorld with hostTowerLevel=3 → host towers carry level-3 dmg', () => {
    const world = makeWorldWithLevels({ hostTowerLevel: 3 })
    const hostTowers = world.towers.filter((t) => t.isHostSide)
    // All host towers should have level-3 dmg (TOWER_LEVELS index = level - 1)
    expect(hostTowers[0].dmg).toBe(TOWER_LEVELS[2].dmg) // index = level-1
    expect(hostTowers[0].dmg).toBeGreaterThan(TOWER_DMG) // level-3 > base
  })

  it('createWorld without hostTowerLevel → host towers carry base dmg (level 1)', () => {
    const world = makeWorldWithLevels({})
    const hostTowers = world.towers.filter((t) => t.isHostSide)
    expect(hostTowers[0].dmg).toBe(TOWER_DMG) // base dmg = level 1
  })

  it('spawnUnit at level 2 → unit hp/dmg match resolveUnitStats(id, 2)', () => {
    const world = makeWorldWithLevels({ hostUnitLevels: { scout_drone: 2 } })
    const expected = resolveUnitStats('scout_drone', 2)

    const events: unknown[] = []
    spawnUnit(world, { type: 'deploy', unitId: 'scout_drone', slot: 0, role: 'host' }, () => events.push({}))

    const unit = world.hostUnits[0]
    expect(unit).toBeDefined()
    expect(unit.hp).toBe(expected.hp)
    expect(unit.dmg).toBe(expected.dmg)
  })

  it('spawnUnit without level map → unit uses level-1 stats (flat UNITS baseline)', () => {
    const world = makeWorldWithLevels({})
    const expected = resolveUnitStats('scout_drone', 1)

    const events: unknown[] = []
    spawnUnit(world, { type: 'deploy', unitId: 'scout_drone', slot: 0, role: 'host' }, () => events.push({}))

    const unit = world.hostUnits[0]
    expect(unit).toBeDefined()
    expect(unit.hp).toBe(expected.hp)
    expect(unit.dmg).toBe(expected.dmg)
  })

  it('guestTowerLevel=5 → guest towers carry level-5 dmg', () => {
    const world = makeWorldWithLevels({ guestTowerLevel: 5 })
    const guestTowers = world.towers.filter((t) => !t.isHostSide)
    expect(guestTowers[0].dmg).toBe(TOWER_LEVELS[4].dmg) // index = level-1 = 4
  })
})
