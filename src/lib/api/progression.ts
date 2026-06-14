import { supabase } from '../supabase'

// ── OwnLevels ─────────────────────────────────────────────────────────────────
// Returned by getOwnLevels. Missing entries mean level 1 (absence = level 1, D-15).
export interface OwnLevels {
  unitLevels: Record<string, number> // defId → level; absent key = level 1
  towerLevel: number
}

// ── getOwnLevels ──────────────────────────────────────────────────────────────
// Reads the caller's persisted upgrade levels from the upgrades table (RLS read-own).
// An absence of a row for a given (scope, target_id) is NOT an error — it means level 1
// (D-15). On any error or empty result the safe fallback is all-level-1 (empty maps).
export async function getOwnLevels(userId: string): Promise<OwnLevels> {
  const { data, error } = await supabase
    .from('upgrades')
    .select('scope, target_id, level')
    .eq('user_id', userId)
    .returns<{ scope: string; target_id: string; level: number }[]>()

  if (error || !data) return { unitLevels: {}, towerLevel: 1 }

  const unitLevels: Record<string, number> = {}
  let towerLevel = 1

  for (const row of data) {
    if (row.scope === 'unit') {
      unitLevels[row.target_id] = row.level
    }
    if (row.scope === 'tower' && row.target_id === 'tower_power') {
      towerLevel = row.level
    }
  }

  return { unitLevels, towerLevel }
}

// ── upgradeSpend ──────────────────────────────────────────────────────────────
// Routes through the upgrade_spend SECURITY DEFINER RPC — the server derives the cost
// and enforces ownership, level-transition, and concurrency guards (PROG-04 / D-03).
// The client never supplies an amount; only (scope, targetId) are passed.
//
// On success: { ok: true, newLevel, newBalance, error: null }
// On rejection: { ok: false, reason, error: null }   (insufficient_funds / not_owned / max_level / unknown_target)
// On network/RPC error: { ok: false, error: error.message }
export async function upgradeSpend(
  scope: 'unit' | 'tower',
  targetId: string,
): Promise<{
  ok: boolean
  reason?: string
  newLevel?: number
  newBalance?: number
  error: string | null
}> {
  const { data, error } = await supabase.rpc('upgrade_spend', {
    p_scope: scope,
    p_target_id: targetId,
  })

  if (error) return { ok: false, error: error.message }

  const result = data as {
    ok: boolean
    reason?: string
    new_level?: number
    new_balance?: number
  }

  return {
    ok: result.ok,
    reason: result.reason,
    newLevel: result.new_level,
    newBalance: result.new_balance,
    error: null,
  }
}
