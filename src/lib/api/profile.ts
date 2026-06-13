import { supabase } from '../supabase'
import { getBalance } from './wallet'

// ── FullProfile ───────────────────────────────────────────────────────────────
// Aggregated profile view for the profile screen (ACCT-03, D-13): lifetime W/L
// from profiles, balance from wallet, owned units from inventory, plus a rank
// placeholder (real rank is P13).
export interface FullProfile {
  username: string | null
  wins: number
  losses: number
  balance: number
  ownedUnitIds: string[]
  rankPlaceholder: string // always 'UNRANKED' until P13
}

// ── getProfileFull ────────────────────────────────────────────────────────────
// Reads profiles + wallet + inventory in parallel via the typed seam (FND-05).
// Returns null only if the profile query fails; balance/units degrade to defaults.
export async function getProfileFull(userId: string): Promise<FullProfile | null> {
  const [profileResult, balanceResult, inventoryResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, wins, losses')
      .eq('id', userId)
      .single<{ username: string | null; wins: number; losses: number }>(),
    getBalance(userId),
    supabase
      .from('inventory')
      .select('unit_id')
      .eq('owner', userId)
      .returns<{ unit_id: string }[]>(),
  ])
  if (profileResult.error || !profileResult.data) return null
  return {
    username: profileResult.data.username,
    wins: profileResult.data.wins,
    losses: profileResult.data.losses,
    balance: balanceResult ?? 0,
    ownedUnitIds: (inventoryResult.data ?? []).map((r) => r.unit_id),
    rankPlaceholder: 'UNRANKED',
  }
}
