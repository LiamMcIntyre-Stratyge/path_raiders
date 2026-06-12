import { supabase } from '../supabase'

// ── getBalance ────────────────────────────────────────────────────────────────
export async function getBalance(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('wallet')
    .select('balance')
    .eq('owner', userId)
    .single<{ balance: number }>()
  if (error || !data) return null
  return data.balance ?? null
}

// ── creditWallet ──────────────────────────────────────────────────────────────
// Routes through the credit_wallet SECURITY DEFINER RPC — never a direct UPDATE.
export async function creditWallet(
  amount: bigint | number,
  idemKey: string
): Promise<{ newBalance: bigint | number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('credit_wallet', {
    p_amount: amount,
    p_idempotency_key: idemKey,
  })
  if (error) return { newBalance: null, error: error.message }
  return { newBalance: data as bigint | number | null, error: null }
}
