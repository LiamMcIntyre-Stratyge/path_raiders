import { MAX_UNIT_LEVEL } from '../../units/UnitData'
import { MAX_TOWER_LEVEL } from '../../towers/TowerData'

const KNOWN_UNIT_IDS = new Set([
  'scout_drone',
  'assault_bot',
  'vine_crawler',
  'thorn_beast',
  'apprentice_mage',
  'elementalist',
])

/**
 * Clamps received opponent level maps to safe ranges before feeding the sim (D-12).
 *
 * - Unit levels clamped to [1, MAX_UNIT_LEVEL]; unknown unit ids dropped silently
 *   (resolver defaults to level 1 for missing keys).
 * - Tower level clamped to [1, MAX_TOWER_LEVEL].
 * - Non-integer inputs are floored (Math.floor).
 * - No network I/O, no imports of Supabase or Phaser (sim-purity rule, P10 D-01).
 */
export function clampLevels(
  rawUnitLevels: Record<string, number>,
  rawTowerLevel: number,
): { unitLevels: Record<string, number>; towerLevel: number } {
  const unitLevels: Record<string, number> = {}
  for (const [id, level] of Object.entries(rawUnitLevels)) {
    if (KNOWN_UNIT_IDS.has(id)) {
      unitLevels[id] = Math.max(1, Math.min(MAX_UNIT_LEVEL, Math.floor(level)))
    }
    // Unknown unit ids are silently dropped → resolver defaults to level 1
  }
  return {
    unitLevels,
    towerLevel: Math.max(1, Math.min(MAX_TOWER_LEVEL, Math.floor(rawTowerLevel))),
  }
}
