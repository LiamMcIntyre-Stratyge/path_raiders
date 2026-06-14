import type { UnitDefinition } from '../types'

export const UNITS: UnitDefinition[] = [
  {
    id: 'scout_drone',
    name: 'Scout Drone',
    faction: 'machines',
    tier: 1,
    hp: 120,
    dmg: 45,
    speed: 'Fast',
    speedPx: 90,
    cost: 50,
    tokenColor: '#93C5FD',
    starter: true,
  },
  {
    id: 'assault_bot',
    name: 'Assault Bot',
    faction: 'machines',
    tier: 2,
    hp: 280,
    dmg: 90,
    speed: 'Medium',
    speedPx: 60,
    cost: 120,
    tokenColor: '#60A5FA',
    starter: false,
  },
  {
    id: 'vine_crawler',
    name: 'Vine Crawler',
    faction: 'plants',
    tier: 1,
    hp: 100,
    dmg: 40,
    speed: 'Fast',
    speedPx: 100,
    cost: 50,
    tokenColor: '#86EFAC',
    starter: true,
  },
  {
    id: 'thorn_beast',
    name: 'Thorn Beast',
    faction: 'plants',
    tier: 2,
    hp: 260,
    dmg: 95,
    speed: 'Medium',
    speedPx: 55,
    cost: 120,
    tokenColor: '#4ADE80',
    starter: false,
  },
  {
    id: 'apprentice_mage',
    name: 'Apprentice Mage',
    faction: 'wizards',
    tier: 1,
    hp: 90,
    dmg: 55,
    speed: 'Medium',
    speedPx: 80,
    cost: 50,
    tokenColor: '#D8B4FE',
    starter: true,
  },
  {
    id: 'elementalist',
    name: 'Elementalist',
    faction: 'wizards',
    tier: 2,
    hp: 240,
    dmg: 105,
    speed: 'Medium',
    speedPx: 58,
    cost: 120,
    tokenColor: '#C084FC',
    starter: false,
  },
]

export const UNIT_FACTION: Record<string, string> = Object.fromEntries(
  UNITS.map((u) => [u.id, u.faction])
)

export const BALANCE_VERSION = 1 // D-07: cache-key seam for future server-driven config

export interface UnitLevelStats {
  hp: number
  dmg: number
  // speedPx and attackRate are fixed (D-05); not in this table
}

export const MAX_UNIT_LEVEL = 5 // D-10

// Per-level stat arrays. Index = level - 1. speedPx/attackRate stay flat (D-05).
// INVARIANT: UNIT_LEVELS[id][0].hp === UNITS.find(u=>u.id===id)!.hp for all ids.
export const UNIT_LEVELS: Record<string, UnitLevelStats[]> = {
  scout_drone:     [ { hp: 120, dmg: 45 },  { hp: 150, dmg: 55 },  { hp: 185, dmg: 67 },  { hp: 225, dmg: 82 },  { hp: 275, dmg: 100 } ],
  assault_bot:     [ { hp: 280, dmg: 90 },  { hp: 340, dmg: 108 }, { hp: 410, dmg: 130 }, { hp: 490, dmg: 156 }, { hp: 580, dmg: 188 } ],
  vine_crawler:    [ { hp: 100, dmg: 40 },  { hp: 125, dmg: 49 },  { hp: 155, dmg: 60 },  { hp: 190, dmg: 73 },  { hp: 230, dmg: 88 } ],
  thorn_beast:     [ { hp: 260, dmg: 95 },  { hp: 315, dmg: 114 }, { hp: 380, dmg: 137 }, { hp: 455, dmg: 165 }, { hp: 540, dmg: 198 } ],
  apprentice_mage: [ { hp: 90,  dmg: 55 },  { hp: 112, dmg: 67 },  { hp: 138, dmg: 81 },  { hp: 168, dmg: 97 },  { hp: 202, dmg: 116 } ],
  elementalist:    [ { hp: 240, dmg: 105 }, { hp: 292, dmg: 126 }, { hp: 352, dmg: 151 }, { hp: 420, dmg: 181 }, { hp: 500, dmg: 218 } ],
}

/**
 * Resolves unit stats for the given id and level, clamping out-of-range values.
 * Unknown ids fall back to the flat UNITS baseline (no crash, D-12 spirit).
 * Level 0 and below → level 1; level > MAX_UNIT_LEVEL → MAX_UNIT_LEVEL.
 */
export function resolveUnitStats(unitId: string, level: number): UnitLevelStats {
  const levelData = UNIT_LEVELS[unitId]
  if (!levelData) {
    // Unknown id: fall back to flat UNITS baseline (no crash)
    const def = UNITS.find((u) => u.id === unitId)
    return { hp: def?.hp ?? 100, dmg: def?.dmg ?? 40 }
  }
  const idx = Math.max(0, Math.min(level - 1, levelData.length - 1))
  return levelData[idx]
}

// Display-only cost mirror. Authoritative source is the upgrade_spend SQL RPC.
// Pattern: identical to economy.test.ts mirroring WIN_REWARD/UNIT_COST (display-only,
// never supply to RPC, D-03). Used by UpgradeScene to show next-level cost before tap.
export const UPGRADE_COSTS: Record<'unit' | 'tower', Record<number, number>> = {
  unit:  { 2: 75,  3: 150, 4: 300, 5: 600 },
  tower: { 2: 100, 3: 200, 4: 400, 5: 800 },
}
