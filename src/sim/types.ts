import type { OverlayType, TerrainType } from '../types'

/**
 * Pure simulation type contracts (D-01).
 *
 * Zero Phaser, zero Supabase, zero gameState imports — the sole runtime-free
 * import allowed is the `OverlayType`/`TerrainType` shape from `../types`. These
 * structs are the source of truth for live battle state; the Phaser views in
 * `src/units/UnitView.ts` / `src/towers/TowerView.ts` render against them (D-02/D-03).
 */

// ─── Combat constants (relocated from src/units/Unit.ts so the sim owns them) ──
// Unit.ts imports Phaser, so the sim cannot import it. These two values are the
// only combat constants the battle loop needs; they live here as the canonical
// source and Unit.ts can re-import them once it is split (Plan 03).
export const COMBAT_RANGE = 52 // world px — stop and fight when this close
export const BASE_REACH_DMG = 60

/**
 * A unit in the simulation. Lifts the data half of `src/units/Unit.ts`
 * (the Phaser Container render half stays in UnitView). 18 fields.
 */
export interface SimUnit {
  id: string // monotonic counter: String(world.nextId++)
  defId: string // key into UNITS[]
  faction: string // copied from UnitDefinition at spawn
  x: number
  y: number
  hp: number
  maxHp: number
  dir: 1 | -1 // +1 = moving down (guest), -1 = moving up (host)
  laneSlot: number // 0 | 1 | 2 (spawn slot)
  attackCd: number // ms countdown
  attackRate: number // copied from def (default 900ms)
  speedPx: number // copied from def
  dmg: number // copied from def
  waypoints: { x: number; y: number }[]
  wpIdx: number
  wallTarget: [number, number] | null // [row, col] of wall being attacked
  dead: boolean
}

/**
 * A tower in the simulation. Static stats come from src/towers/TowerData.ts;
 * live mutable state (cd) lives here. 8 fields.
 */
export interface SimTower {
  cx: number
  cy: number
  slotIdx: number
  isHostSide: boolean // true → attacks guestUnits; false → attacks hostUnits
  range: number
  dmg: number
  cd: number
  maxCd: number
}

/**
 * The full live battle state (D-12). Replaces the GameScene private fields and
 * the battle-value fields formerly on gameState.
 */
export interface SimWorld {
  // Battle state (D-12: moves OFF gameState)
  gold: number
  goldAccum: number
  timeLeft: number
  hostBaseHp: number
  guestBaseHp: number
  hostUnits: SimUnit[]
  guestUnits: SimUnit[]
  towers: SimTower[]
  mutableOver: OverlayType[][]
  wallHP: Map<string, number>
  over: boolean
  // Practice AI
  isPractice: boolean
  aiTimer: number
  aiInterval: number
  // Session context the sim needs (pathfinding + AI faction resolution).
  // Preset at createWorld() so the sim never imports gameState (Pitfall 5).
  hostFaction: string
  guestFaction: string
  hostSlot: number
  guestSlot: number
  mapBase: TerrainType[][]
  // Phase 14 seam
  nextId: number // monotonic id counter
  tickCount: number // increments each step() call
  // P12: level maps. Missing key = level 1 (D-15: absence of row = level 1).
  // Stored on world so both spawnUnit and spawnAI can call resolveUnitStats
  // without threading extra params (RESEARCH.md Focus Area 1 recommendation).
  hostUnitLevels: Record<string, number>
  guestUnitLevels: Record<string, number>
  hostTowerLevel: number
  guestTowerLevel: number
}

/**
 * Discrete one-shot events the sim emits each tick. The scene consumes these
 * for SFX / animations / network broadcasts (D-03/D-04). Continuous state
 * (gold, timeLeft, hp) is read directly off the world, NOT via events.
 */
export type SimEvent =
  | { type: 'unit_died'; unitId: string; x: number; y: number; faction: string }
  | { type: 'wall_break'; row: number; col: number }
  | { type: 'base_hit'; side: 'host' | 'guest'; newHp: number }
  | { type: 'game_over'; winner: 'host' | 'guest' | 'tie' }

/**
 * Plain intents fed into the sim each tick (D-04). The scene maps local taps
 * and Supabase broadcasts into these; the sim is transport-free.
 */
export type SimInput =
  | { type: 'deploy'; unitId: string; slot: number; role: 'host' | 'guest'; level?: number }
  | { type: 'wall_break'; row: number; col: number }
