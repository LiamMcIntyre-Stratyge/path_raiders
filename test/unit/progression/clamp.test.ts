import { describe, it, expect } from 'vitest'
import { clampLevels } from '../../../src/lib/progression/clamp'

describe('clampLevels guard (D-12)', () => {
  it('clamps unit level above MAX to MAX (5)', () => {
    const result = clampLevels({ scout_drone: 999 }, 9)
    expect(result.unitLevels.scout_drone).toBe(5)
    expect(result.towerLevel).toBe(5)
  })

  it('clamps unit level below 1 to 1', () => {
    const result = clampLevels({ scout_drone: -5 }, 0)
    expect(result.unitLevels.scout_drone).toBe(1)
    expect(result.towerLevel).toBe(1)
  })

  it('drops unknown unit ids silently', () => {
    const result = clampLevels({ unknown_unit: 3 }, 2)
    expect(Object.keys(result.unitLevels)).not.toContain('unknown_unit')
    expect(result.towerLevel).toBe(2)
  })

  it('clamps tower level above MAX to MAX (5)', () => {
    const result = clampLevels({}, 999)
    expect(result.towerLevel).toBe(5)
  })

  it('clamps tower level below 1 to 1', () => {
    const result = clampLevels({}, -1)
    expect(result.towerLevel).toBe(1)
  })

  it('passes valid unit and tower levels through unchanged', () => {
    const result = clampLevels({ scout_drone: 3, vine_crawler: 2 }, 4)
    expect(result.unitLevels.scout_drone).toBe(3)
    expect(result.unitLevels.vine_crawler).toBe(2)
    expect(result.towerLevel).toBe(4)
  })

  it('floors non-integer unit levels', () => {
    const result = clampLevels({ scout_drone: 2.9 }, 1)
    expect(result.unitLevels.scout_drone).toBe(2)
  })

  it('floors non-integer tower level', () => {
    const result = clampLevels({}, 3.7)
    expect(result.towerLevel).toBe(3)
  })

  it('handles all 6 known unit ids without dropping any', () => {
    const input = {
      scout_drone: 2,
      assault_bot: 3,
      vine_crawler: 4,
      thorn_beast: 5,
      apprentice_mage: 1,
      elementalist: 2,
    }
    const result = clampLevels(input, 1)
    expect(Object.keys(result.unitLevels)).toHaveLength(6)
    expect(result.unitLevels.thorn_beast).toBe(5)
    expect(result.unitLevels.elementalist).toBe(2)
  })

  it('drops unknown id even when mixed with known ids', () => {
    const result = clampLevels({ scout_drone: 3, unknown_unit: 3 }, 2)
    expect(Object.keys(result.unitLevels)).toContain('scout_drone')
    expect(Object.keys(result.unitLevels)).not.toContain('unknown_unit')
  })

  it('returns empty unitLevels for empty input', () => {
    const result = clampLevels({}, 1)
    expect(Object.keys(result.unitLevels)).toHaveLength(0)
    expect(result.towerLevel).toBe(1)
  })
})
