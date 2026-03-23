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
}
