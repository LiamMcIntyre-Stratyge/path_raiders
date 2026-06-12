import type { Faction } from '../types'

/**
 * Returns the opponent faction in the fixed cycle:
 * machines → plants → wizards → machines.
 *
 * Pure helper lifted from the former GameScene.opponentFaction private method
 * (D-11). Zero Phaser / Supabase / gameState imports — depends only on the
 * Faction type.
 */
export function opponentFaction(f: Faction): Faction {
  if (f === 'machines') return 'plants'
  if (f === 'plants') return 'wizards'
  return 'machines'
}

/**
 * Resolves which faction owns the host side vs the guest side and which world
 * direction the local player's units travel, given the player's role and chosen
 * faction (D-11).
 *
 * Behavior is byte-identical to the three duplicated inline blocks formerly in
 * GameScene.drawBasePlacements / drawTowers / updateAI:
 *   hostFaction  = role === 'guest' ? opponent : playerFaction
 *   guestFaction = role === 'guest' ? playerFaction : opponent
 *   dir          = role === 'host' ? -1 : 1   (host moves UP)
 *
 * Pure: takes already-resolved non-null args. Callers keep the
 * gameState.role/playerFaction fallback defaults ('host' / 'machines').
 */
export function resolveSide(
  role: 'host' | 'guest',
  playerFaction: Faction,
): { hostFaction: Faction; guestFaction: Faction; dir: 1 | -1 } {
  const opp = opponentFaction(playerFaction)
  return {
    hostFaction: role === 'guest' ? opp : playerFaction,
    guestFaction: role === 'guest' ? playerFaction : opp,
    dir: (role === 'host' ? -1 : 1) as 1 | -1,
  }
}
