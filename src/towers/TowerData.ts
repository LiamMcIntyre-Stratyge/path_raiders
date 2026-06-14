import { CELL } from '../maps/MapData'

/**
 * Flat static tower stat table (D-09 / D-10).
 *
 * Mirrors the `src/units/UnitData.ts` style: a plain data module with no Phaser
 * and no Supabase imports — only the `CELL` geometry constant from MapData.
 *
 * Values lifted verbatim from the former inline GameScene tower constants
 * (GameScene.ts:168-170). Per D-10, this is a flat table with NO per-level
 * upgrade scaling — that is deferred to PROG-02 / Phase 12.
 */
export const TOWER_RANGE = 6 * CELL // 216px
export const TOWER_DMG = 25
export const TOWER_CD = 1400 // ms

export interface TowerDefinition {
  range: number
  dmg: number
  maxCd: number
}

export const TOWER_DEF: TowerDefinition = {
  range: TOWER_RANGE,
  dmg: TOWER_DMG,
  maxCd: TOWER_CD,
}

export const BALANCE_VERSION = 1 // D-07: cache-key seam for future server-driven config

export interface TowerLevelStats {
  dmg: number
  range: number   // authored per D-06 even though only dmg scales today (D-02)
  maxCd: number   // authored per D-06; always equals TOWER_CD this phase
}

export const MAX_TOWER_LEVEL = 5 // D-10

// Per-level tower stats. Index = level - 1.
// INVARIANT: TOWER_LEVELS[0].dmg === TOWER_DMG (level-1-invariant test must pass).
// D-06: range/cd authored per level for uniform shape even though only dmg scales.
export const TOWER_LEVELS: TowerLevelStats[] = [
  { dmg: 25, range: TOWER_RANGE, maxCd: TOWER_CD }, // level 1 = base (invariant)
  { dmg: 32, range: TOWER_RANGE, maxCd: TOWER_CD }, // level 2
  { dmg: 41, range: TOWER_RANGE, maxCd: TOWER_CD }, // level 3
  { dmg: 52, range: TOWER_RANGE, maxCd: TOWER_CD }, // level 4
  { dmg: 65, range: TOWER_RANGE, maxCd: TOWER_CD }, // level 5
]

/**
 * Resolves tower stats for the given level, clamping out-of-range values.
 * Level 0 and below → level 1; level > MAX_TOWER_LEVEL → MAX_TOWER_LEVEL.
 */
export function resolveTowerStats(level: number): TowerLevelStats {
  const idx = Math.max(0, Math.min(level - 1, TOWER_LEVELS.length - 1))
  return TOWER_LEVELS[idx]
}
