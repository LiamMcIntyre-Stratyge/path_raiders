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
