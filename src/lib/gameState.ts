import type { GameStateType } from '../types'

/**
 * Session + read-through profile cache (D-14) — NOT the live battle source.
 *
 * Live battle state (gold, base HP, units, towers, walls) lives on the sim
 * `SimWorld`, which is the single source of truth (D-12). This singleton only
 * caches the player's session context and persistent profile fields, which are
 * hydrated from the `src/lib/api/account` seam (D-13, write path unchanged).
 */
const gameState: GameStateType = {
  userId: null,
  username: null,
  playerFaction: null,
  unlockedUnits: ['scout_drone', 'vine_crawler', 'apprentice_mage'],
  loadout: [],
  wins: 0,
  losses: 0,
  roomId: null,
  role: null,
  opponentId: null,    // hydrated from rooms.host_id / rooms.guest_id at LobbyScene join
  walletBalance: 0,    // refreshed from getBalance after match settlement
  mapId: null,
  hostSlot: null,
  guestSlot: null,
}

export default gameState
