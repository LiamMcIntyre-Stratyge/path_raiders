export type Faction = 'machines' | 'plants' | 'wizards'
export type UnitSpeed = 'Fast' | 'Medium' | 'Slow'

export interface UnitDefinition {
  id: string
  name: string
  faction: Faction
  tier: number
  hp: number
  dmg: number
  speed: UnitSpeed
  speedPx: number
  cost: number
  tokenColor: string
  starter: boolean
}

export interface GameStateType {
  userId: string | null
  username: string | null
  playerFaction: Faction | null
  unlockedUnits: string[]
  roomId: string | null
  role: 'host' | 'guest' | null
  hostBaseHp: number
  guestBaseHp: number
  gold: number
  gameMode: 'topdown' | 'portrait'
  mapId: number | null
  hostSlot: number | null   // 0 | 1 | 2
  guestSlot: number | null  // 0 | 1 | 2
}

export type TerrainType = 'open'|'path'|'forest'|'rock'|'water'|'lava'|'sand'|'ruins'|'cross'|'bridge'
export type OverlayType = 'tunnel'|'dead_end'|'wall'|'break_mach'|'break_plant'|'break_wiz'|'base_zone'|null

export interface MapDef {
  id: number
  name: string
  faction: string
  factionColor: string
  paths: number
  desc: string
  base: TerrainType[][]
  over: (OverlayType)[][]
}
