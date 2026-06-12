import { supabase } from '../supabase'
import type { Faction } from '../../types'

// ─── Profile shapes ───────────────────────────────────────────────────────────
export interface Profile {
  username: string | null
  faction: Faction | null
  unlocked_units: string[]
  wins: number
  losses: number
}

export interface MatchResultPayload {
  wins: number
  losses: number
  unlockedUnits: string[]
  newlyUnlocked: string[]
}

// Win-milestone thresholds (mirrors GameScene unlock logic)
const THRESHOLDS: Array<{ wins: number; unit: string }> = [
  { wins: 2, unit: 'assault_bot' },
  { wins: 3, unit: 'thorn_beast' },
  { wins: 5, unit: 'elementalist' },
]

// ── getProfile ────────────────────────────────────────────────────────────────
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, faction, unlocked_units, wins, losses')
    .eq('id', userId)
    .single<Profile>()
  if (error || !data) return null
  return data
}

// ── upsertProfile ─────────────────────────────────────────────────────────────
export async function upsertProfile(profile: {
  id: string
  username: string
  faction: Faction
  unlockedUnits: string[]
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').upsert({
    id: profile.id,
    username: profile.username,
    faction: profile.faction,
    unlocked_units: profile.unlockedUnits,
  })
  return { error: error?.message ?? null }
}

// ── recordMatchResult ─────────────────────────────────────────────────────────
// Reads the current profile, computes new stats + unlocks, writes back.
// Returns the updated state including newly-unlocked units for notification.
export async function recordMatchResult(
  userId: string,
  result: 'win' | 'loss' | 'tie'
): Promise<MatchResultPayload | null> {
  const col = result === 'win' ? 'wins' : result === 'loss' ? 'losses' : null
  if (!col) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('wins, losses, unlocked_units')
    .eq('id', userId)
    .single<{ wins: number; losses: number; unlocked_units: string[] }>()
  if (error || !data) return null

  const newWins   = (data.wins   ?? 0) + (col === 'wins'   ? 1 : 0)
  const newLosses = (data.losses ?? 0) + (col === 'losses' ? 1 : 0)
  const unlocked  = new Set(data.unlocked_units ?? [])

  const newlyUnlocked: string[] = []
  for (const { wins, unit } of THRESHOLDS) {
    if (newWins >= wins && !unlocked.has(unit)) {
      unlocked.add(unit)
      newlyUnlocked.push(unit)
    }
  }

  await supabase
    .from('profiles')
    .update({ [col]: (data[col as 'wins' | 'losses'] ?? 0) + 1, unlocked_units: [...unlocked] })
    .eq('id', userId)

  return {
    wins: newWins,
    losses: newLosses,
    unlockedUnits: [...unlocked],
    newlyUnlocked,
  }
}
