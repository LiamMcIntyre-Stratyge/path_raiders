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
let userId: string

// A balance==cost scenario uses the soft-currency unit cost (100 per D-04).
const UNIT_COST = 100

beforeAll(async () => {
  const email = `tinv_${Date.now()}@example.test`
  await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true })
  user = createClient(URL, ANON, { auth: { persistSession: true } })
  await user.auth.signInWithPassword({ email, password: 'pw-123456' })
  const { data: u } = await user.auth.getUser()
  userId = u.user!.id
  // Seed a legit balance of 100 (== one unit cost) via the SECURITY DEFINER RPC
  await user.rpc('credit_wallet', { p_amount: UNIT_COST, p_idempotency_key: 'seed' })
})

describe('inventory RLS + spend_unlock (RED until Plan 02)', () => {
  // ECON-05: Forged unlock — direct client INSERT must leave 0 rows (RLS deny-by-default).
  it('rejects a forged direct INSERT into inventory (ECON-05)', async () => {
    await user.from('inventory').insert({ owner: userId, unit_id: 'assault_bot' })
    // RLS may surface an error or silently affect 0 rows — re-read AS SERVICE-ROLE to prove no row.
    const { data } = await admin
      .from('inventory')
      .select('unit_id')
      .eq('owner', userId)
      .eq('unit_id', 'assault_bot')
    expect(data ?? []).toHaveLength(0) // forged INSERT denied by RLS — no inventory row
  })

  // ECON-03: spend_unlock with sufficient balance deducts cost + inserts one inventory row.
  it('spend_unlock deducts cost and inserts one inventory row at sufficient balance (ECON-03)', async () => {
    const { data } = await user.rpc('spend_unlock', { p_unit_id: 'assault_bot' })
    expect((data as { ok: boolean }).ok).toBe(true)

    const { data: wallet } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', userId)
      .single()
    expect(wallet!.balance).toBe(0) // 100 seed - 100 cost

    const { data: rows } = await admin
      .from('inventory')
      .select('unit_id')
      .eq('owner', userId)
      .eq('unit_id', 'assault_bot')
    expect(rows ?? []).toHaveLength(1) // exactly one ownership row
  })

  // ECON-03: insufficient balance → { ok:false, reason:'insufficient_funds' }, balance unchanged.
  it('spend_unlock returns insufficient_funds when balance < cost (ECON-03)', async () => {
    // After the previous test balance is 0; seed it back to 50 (< 100 cost).
    await user.rpc('credit_wallet', { p_amount: 50, p_idempotency_key: 'topup-50' })
    const { data: before } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', userId)
      .single()
    expect(before!.balance).toBe(50)

    const { data } = await user.rpc('spend_unlock', { p_unit_id: 'thorn_beast' })
    expect((data as { ok: boolean; reason: string }).ok).toBe(false)
    expect((data as { ok: boolean; reason: string }).reason).toBe('insufficient_funds')

    const { data: after } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', userId)
      .single()
    expect(after!.balance).toBe(50) // unchanged — no deduction on insufficient funds
  })

  // ECON-04: concurrent double-tap spend at balance==cost → deducted exactly once,
  // never negative, exactly one inventory row, second call insufficient_funds.
  it('concurrent spend_unlock deducts exactly once and never goes negative (ECON-04)', async () => {
    const email = `tinv2_${Date.now()}@example.test`
    await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true })
    const u2 = createClient(URL, ANON, { auth: { persistSession: false } })
    await u2.auth.signInWithPassword({ email, password: 'pw-123456' })
    const { data: who } = await u2.auth.getUser()
    const u2Id = who.user!.id
    // Seed exactly one unit cost so only one of two concurrent calls can succeed.
    await u2.rpc('credit_wallet', { p_amount: UNIT_COST, p_idempotency_key: 'seed2' })

    const results = await Promise.all([
      u2.rpc('spend_unlock', { p_unit_id: 'elementalist' }),
      u2.rpc('spend_unlock', { p_unit_id: 'elementalist' }),
    ])
    const oks = results.map(r => (r.data as { ok: boolean } | null)?.ok)
    expect(oks.filter(Boolean)).toHaveLength(1) // exactly one succeeded

    const { data: wallet } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', u2Id)
      .single()
    expect(wallet!.balance).toBe(0) // deducted exactly once
    expect(wallet!.balance).toBeGreaterThanOrEqual(0) // never negative (CHECK backstop)

    const { data: rows } = await admin
      .from('inventory')
      .select('unit_id')
      .eq('owner', u2Id)
      .eq('unit_id', 'elementalist')
    expect(rows ?? []).toHaveLength(1) // one ownership row despite two taps
  })
})
