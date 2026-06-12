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
