import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

// Keys come from `supabase status -o env` in CI — NEVER imported from src/
const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY! // CI env ONLY — never in src/

// Admin/service-role client for fixtures and re-reads.
// persistSession: false prevents the shared jsdom localStorage from contaminating
// the service-role credentials with the signed-in user's session (Pitfall 4).
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
let user: ReturnType<typeof createClient>

beforeAll(async () => {
  const email = `t_${Date.now()}@example.test`
  await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true })
  user = createClient(URL, ANON, { auth: { persistSession: true } })
  await user.auth.signInWithPassword({ email, password: 'pw-123456' })
  // Seed a legit balance of 100 via the SECURITY DEFINER RPC (the only authorised writer)
  await user.rpc('credit_wallet', { p_amount: 100, p_idempotency_key: 'seed' })
})

describe('wallet RLS', () => {
  it('rejects a forged direct UPDATE to wallet.balance', async () => {
    // Attempt a client-side forged write — RLS denies it silently (Pitfall 1):
    // the UPDATE returns { error: null } but affects 0 rows. Do NOT assert on error.
    const { error } = await user
      .from('wallet')
      .update({ balance: 999999 })
      .neq('owner', '00000000-0000-0000-0000-000000000000')
    expect(error).toBeNull() // RLS silently blocks — no error raised (Pitfall 1)

    // Re-read the row AS SERVICE-ROLE to prove the forged write had no effect.
    const { data: u } = await user.auth.getUser()
    const { data } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', u.user!.id)
      .single()
    expect(data!.balance).toBe(100) // UNCHANGED — forged write was denied by RLS
  })

  it('credits are idempotent (same key credits once, not twice)', async () => {
    const { data: u } = await user.auth.getUser()
    // First call: credits 50 under key 'k1'
    await user.rpc('credit_wallet', { p_amount: 50, p_idempotency_key: 'k1' })
    // Retry with the same key — idempotency ledger rejects the duplicate
    await user.rpc('credit_wallet', { p_amount: 50, p_idempotency_key: 'k1' })
    // Re-read as service-role: should be 100 (seed) + 50 (once), not 200
    const { data } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', u.user!.id)
      .single()
    expect(data!.balance).toBe(150) // 100 seed + 50 once, not twice
  })

  it('client cannot INSERT a row directly into wallet', async () => {
    const { data: u } = await user.auth.getUser()
    // RLS has no INSERT policy → denied silently (0 rows affected)
    const { error } = await user
      .from('wallet')
      .insert({ owner: u.user!.id, balance: 99999 })
    // PostgREST may return a policy violation error or null — either way the row should not change
    // Verify via re-read as service-role
    const { data } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', u.user!.id)
      .single()
    // balance stays at 150 (previous tests) regardless of error/null
    expect(data!.balance).toBe(150)
    void error // not asserted — RLS may or may not surface an error for INSERT
  })
})
