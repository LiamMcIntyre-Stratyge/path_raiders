import { supabase } from '../supabase'

// ── getOwnedUnits ─────────────────────────────────────────────────────────────
// Reads the caller's owned unit IDs from the inventory table (RLS read-own).
export async function getOwnedUnits(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select('unit_id')
    .eq('owner', userId)
    .returns<{ unit_id: string }[]>()
  if (error || !data) return []
  return data.map((r) => r.unit_id)
}

// ── spendUnlock ───────────────────────────────────────────────────────────────
// Routes through the spend_unlock SECURITY DEFINER RPC — the server derives the
// cost (ECON-02/ECON-03); the client never supplies an amount.
export async function spendUnlock(
  unitId: string
): Promise<{
  ok: boolean
  reason?: string
  newBalance?: number
  unitId?: string
  error: string | null
}> {
  const { data, error } = await supabase.rpc('spend_unlock', {
    p_unit_id: unitId,
  })
  if (error) return { ok: false, error: error.message }
  const result = data as {
    ok: boolean
    reason?: string
    new_balance?: number
    unit_id?: string
  }
  return {
    ok: result.ok,
    reason: result.reason,
    newBalance: result.new_balance,
    unitId: result.unit_id,
    error: null,
  }
}
