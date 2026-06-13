import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeAdmin, seedUser } from './helpers.ts'

// Admin/service-role client for fixtures and re-reads.
const admin = makeAdmin()
let user: SupabaseClient
let userId: string

beforeAll(async () => {
  // Seeded user UUID + minted-token client (replaces admin.auth.admin.createUser —
  // the GoTrue admin API is unavailable in our target environments).
  ;({ id: userId, client: user } = await seedUser(admin, 't'))
  // Seed a legit balance of 100 via the SECURITY DEFINER RPC (the only authorised writer).
  // wallet_credits.idempotency_key is a GLOBAL primary key, so keys are namespaced by the
  // (random) user id — otherwise a literal like 'seed' collides across test files and the
  // second credit no-ops.
  await user.rpc('credit_wallet', { p_amount: 100, p_idempotency_key: `seed:${userId}` })
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
    const { data } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', userId)
      .single()
    expect(data!.balance).toBe(100) // UNCHANGED — forged write was denied by RLS
  })

  it('credits are idempotent (same key credits once, not twice)', async () => {
    // First call: credits 50 under this user's 'k1' key
    await user.rpc('credit_wallet', { p_amount: 50, p_idempotency_key: `k1:${userId}` })
    // Retry with the same key — idempotency ledger rejects the duplicate
    await user.rpc('credit_wallet', { p_amount: 50, p_idempotency_key: `k1:${userId}` })
    // Re-read as service-role: should be 100 (seed) + 50 (once), not 200
    const { data } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', userId)
      .single()
    expect(data!.balance).toBe(150) // 100 seed + 50 once, not twice
  })

  it('client cannot INSERT a row directly into wallet', async () => {
    // RLS has no INSERT policy → denied silently (0 rows affected)
    const { error } = await user
      .from('wallet')
      .insert({ owner: userId, balance: 99999 })
    // PostgREST may return a policy violation error or null — either way the row should not change
    // Verify via re-read as service-role
    const { data } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', userId)
      .single()
    // balance stays at 150 (previous tests) regardless of error/null
    expect(data!.balance).toBe(150)
    void error // not asserted — RLS may or may not surface an error for INSERT
  })
})
