import type { GameStateType } from '../types'

const gameState: GameStateType = {
  userId: null,
  username: null,
  playerFaction: null,
  unlockedUnits: ['scout_drone', 'vine_crawler'],
  roomId: null,
  role: null,
  hostBaseHp: 1000,
  guestBaseHp: 1000,
  gold: 200,
  gameMode: 'topdown',
}

export default gameState
