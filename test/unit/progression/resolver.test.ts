import { describe, it, expect } from 'vitest'
import {
  UNITS,
  UNIT_LEVELS,
  MAX_UNIT_LEVEL,
  resolveUnitStats,
  BALANCE_VERSION as UNIT_BALANCE_VERSION,
  UPGRADE_COSTS,
} from '../../../src/units/UnitData'
import {
  TOWER_LEVELS,
  MAX_TOWER_LEVEL,
  resolveTowerStats,
  TOWER_DMG,
  TOWER_RANGE,
  TOWER_CD,
  BALANCE_VERSION as TOWER_BALANCE_VERSION,
} from '../../../src/towers/TowerData'

describe('resolver level-1 invariant', () => {
  for (const u of UNITS) {
    it(`resolveUnitStats(${u.id}, 1) equals flat UNITS baseline`, () => {
      const resolved = resolveUnitStats(u.id, 1)
      expect(resolved.hp).toBe(u.hp)
      expect(resolved.dmg).toBe(u.dmg)
    })
  }

  it('resolveTowerStats(1).dmg equals flat TOWER_DMG', () => {
    expect(resolveTowerStats(1).dmg).toBe(TOWER_DMG)
  })

  it('resolveTowerStats(1).range equals flat TOWER_RANGE', () => {
    expect(resolveTowerStats(1).range).toBe(TOWER_RANGE)
  })

  it('resolveTowerStats(1).maxCd equals flat TOWER_CD', () => {
    expect(resolveTowerStats(1).maxCd).toBe(TOWER_CD)
  })
})

describe('resolver array lengths', () => {
  it('UNIT_LEVELS has exactly MAX_UNIT_LEVEL entries for every unit id', () => {
    for (const u of UNITS) {
      expect(UNIT_LEVELS[u.id]).toBeDefined()
      expect(UNIT_LEVELS[u.id]).toHaveLength(MAX_UNIT_LEVEL)
    }
  })

  it('TOWER_LEVELS has exactly MAX_TOWER_LEVEL entries', () => {
    expect(TOWER_LEVELS).toHaveLength(MAX_TOWER_LEVEL)
  })
})

describe('resolver out-of-range level clamping', () => {
  it('resolveUnitStats(scout_drone, 0) deep-equals level 1', () => {
    expect(resolveUnitStats('scout_drone', 0)).toEqual(resolveUnitStats('scout_drone', 1))
  })

  it('resolveUnitStats(scout_drone, 999) deep-equals MAX_UNIT_LEVEL', () => {
    expect(resolveUnitStats('scout_drone', 999)).toEqual(
      resolveUnitStats('scout_drone', MAX_UNIT_LEVEL),
    )
  })

  it('resolveTowerStats(0) deep-equals level 1', () => {
    expect(resolveTowerStats(0)).toEqual(resolveTowerStats(1))
  })

  it('resolveTowerStats(999) deep-equals MAX_TOWER_LEVEL', () => {
    expect(resolveTowerStats(999)).toEqual(resolveTowerStats(MAX_TOWER_LEVEL))
  })
})

describe('resolver unknown unit id fallback', () => {
  it('resolveUnitStats with unknown id returns a safe default (no crash)', () => {
    const result = resolveUnitStats('unknown_id', 3)
    expect(typeof result.hp).toBe('number')
    expect(typeof result.dmg).toBe('number')
    expect(result.hp).toBeGreaterThan(0)
    expect(result.dmg).toBeGreaterThan(0)
  })
})

describe('BALANCE_VERSION and UPGRADE_COSTS (D-07 / D-13)', () => {
  it('BALANCE_VERSION is 1 on both data modules', () => {
    expect(UNIT_BALANCE_VERSION).toBe(1)
    expect(TOWER_BALANCE_VERSION).toBe(1)
  })

  it('UPGRADE_COSTS.unit has entries for levels 2–5', () => {
    expect(UPGRADE_COSTS.unit[2]).toBe(75)
    expect(UPGRADE_COSTS.unit[3]).toBe(150)
    expect(UPGRADE_COSTS.unit[4]).toBe(300)
    expect(UPGRADE_COSTS.unit[5]).toBe(600)
  })

  it('UPGRADE_COSTS.tower has entries for levels 2–5', () => {
    expect(UPGRADE_COSTS.tower[2]).toBe(100)
    expect(UPGRADE_COSTS.tower[3]).toBe(200)
    expect(UPGRADE_COSTS.tower[4]).toBe(400)
    expect(UPGRADE_COSTS.tower[5]).toBe(800)
  })

  it('unit upgrade costs escalate (each level costs more than the previous)', () => {
    const unitCosts = [2, 3, 4, 5].map((l) => UPGRADE_COSTS.unit[l])
    for (let i = 1; i < unitCosts.length; i++) {
      expect(unitCosts[i]).toBeGreaterThan(unitCosts[i - 1])
    }
  })
})
