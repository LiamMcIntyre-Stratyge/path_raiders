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

/**
 * Session + read-through profile cache (D-14).
 *
 * NOT the source of truth for live battle state — gold, base HP and all other
 * mutable battle values live on the sim `SimWorld` (D-12). The persistent
 * profile fields below (userId, username, unlockedUnits, wins, losses) are
 * hydrated from the `src/lib/api/account` seam; the recordResult write path
 * stays unchanged this phase (D-13). The remaining fields are session context
 * (roomId/role/playerFaction/mapId/slots) carried across the scene handoff.
 */
export interface GameStateType {
  userId: string | null  // null only before sign-in; required real UUID at every play entry (FND-02, D-05)
  username: string | null
  playerFaction: Faction | null
  unlockedUnits: string[]
  loadout: string[]
  wins: number
  losses: number
  roomId: string | null
  role: 'host' | 'guest' | null
  opponentId: string | null   // opponent's UUID, null until room joined; hydrated from rooms.host_id/guest_id (ACCT-01)
  walletBalance: number       // soft-currency balance cache; refreshed from getBalance after settlement (ECON-02)
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
