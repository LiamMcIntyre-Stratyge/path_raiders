import { supabase } from '../supabase'

// ── reportMatchResult ─────────────────────────────────────────────────────────
// Routes through the report_match_result SECURITY DEFINER RPC. The client sends
// only the match id and the claimed winner's UUID — never an amount (ECON-02).
// The server records the per-player report and settles when both players agree.
export async function reportMatchResult(
  matchId: string,
  claimedWinnerId: string
): Promise<{
  status: 'pending' | 'settled' | 'already_settled' | 'void'
  error: string | null
}> {
  const { data, error } = await supabase.rpc('report_match_result', {
    p_match_id: matchId,
    p_claimed_winner: claimedWinnerId,
  })
  if (error) return { status: 'pending', error: error.message }
  return {
    status: (data as { status: string }).status as
      | 'pending'
      | 'settled'
      | 'already_settled'
      | 'void',
    error: null,
  }
}
