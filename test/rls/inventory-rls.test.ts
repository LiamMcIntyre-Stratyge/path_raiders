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

// Server-derived soft-currency unit cost (D-04). The authoritative copy lives in the
// spend_unlock SQL RPC (case p_unit_id ... then 100); this mirror is assertion-only.
const UNIT_COST = 100

// spend_unlock return shape (from 20260613061943_accounts_economy.sql §2b):
//   success      -> { ok: true,  new_balance: bigint, unit_id: text }
//   below cost   -> { ok: false, reason: 'insufficient_funds' }
type SpendOk = { ok: true; new_balance: number; unit_id: string }
type SpendDenied = { ok: false; reason: string }
type SpendResult = SpendOk | SpendDenied

// Cast supabase-js's loosely-typed rpc data through `unknown` first — the untyped
// client returns `null | unknown`, matching the wallet-rls.test.ts baseline pattern
// (avoids introducing a NEW typecheck error class).
function asSpend(data: unknown): SpendResult {
  return data as unknown as SpendResult
}

async function balanceOf(id: string): Promise<number> {
  const { data } = await admin.from('wallet').select('balance').eq('owner', id).single()
  return (data?.balance as number) ?? 0
}

async function inventoryRows(id: string, unitId: string): Promise<string[]> {
  const { data } = await admin
    .from('inventory')
    .select('unit_id')
    .eq('owner', id)
    .eq('unit_id', unitId)
  return (data ?? []).map(r => r.unit_id as string)
}

beforeAll(async () => {
  const email = `tinv_${Date.now()}@example.test`
  await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true })
  user = createClient(URL, ANON, { auth: { persistSession: true } })
  await user.auth.signInWithPassword({ email, password: 'pw-123456' })
  const { data: u } = await user.auth.getUser()
  userId = u.user!.id
  // Seed a legit balance of 100 (== one unit cost) via the SECURITY DEFINER RPC —
  // the only authorised writer of wallet.balance (Pitfall 1).
  await user.rpc('credit_wallet', { p_amount: UNIT_COST, p_idempotency_key: 'seed' })
})

describe('inventory RLS + spend_unlock (ECON-03/04/05)', () => {
  // ECON-05: Forged unlock — a direct client INSERT into inventory must leave 0 rows.
  // RLS adds NO client write policy on inventory (deny-by-default, Pitfall 6), so the
  // forged INSERT either errors or silently affects 0 rows. We re-read AS SERVICE-ROLE
  // to prove no row was created regardless of which.
  it('rejects a forged direct INSERT into inventory (ECON-05)', async () => {
    await user.from('inventory').insert({ owner: userId, unit_id: 'assault_bot' })
    expect(await inventoryRows(userId, 'assault_bot')).toHaveLength(0) // forged INSERT denied by RLS
  })

  // ECON-03: spend_unlock at sufficient balance deducts EXACTLY the server cost,
  // returns { ok:true, new_balance:0, unit_id }, and inserts exactly one ownership row.
  it('spend_unlock deducts the server cost and inserts one inventory row (ECON-03)', async () => {
    const { data } = await user.rpc('spend_unlock', { p_unit_id: 'assault_bot' })
    const res = asSpend(data)
    expect(res.ok).toBe(true)
    // Assert the RPC's own return shape carries the new balance and the unit it granted.
    expect((res as SpendOk).new_balance).toBe(0) // 100 seed − 100 cost, reported by the RPC
    expect((res as SpendOk).unit_id).toBe('assault_bot')

    // Admin read-back confirms the authoritative wallet + inventory state.
    expect(await balanceOf(userId)).toBe(0) // 100 seed − 100 cost
    expect(await inventoryRows(userId, 'assault_bot')).toHaveLength(1) // exactly one ownership row
  })

  // ECON-03: insufficient balance → { ok:false, reason:'insufficient_funds' }, balance UNCHANGED.
  // Reseed to exactly 50 (< 100 cost) and target a valid-but-unowned unit (thorn_beast, cost 100)
  // so the deny is driven by funds, not an unknown-unit exception.
  it('spend_unlock returns insufficient_funds when balance < cost and does not deduct (ECON-03)', async () => {
    // After the previous test balance is 0; top up to 50 (< 100 cost).
    await user.rpc('credit_wallet', { p_amount: 50, p_idempotency_key: 'topup-50' })
    expect(await balanceOf(userId)).toBe(50)

    const { data } = await user.rpc('spend_unlock', { p_unit_id: 'thorn_beast' })
    const res = asSpend(data)
    expect(res.ok).toBe(false)
    expect((res as SpendDenied).reason).toBe('insufficient_funds')

    expect(await balanceOf(userId)).toBe(50) // unchanged — no deduction on insufficient funds
    expect(await inventoryRows(userId, 'thorn_beast')).toHaveLength(0) // no ownership granted
  })

  // ECON-04 / Pitfall 5: concurrent double-tap spend at balance==cost. The atomic guarded
  // UPDATE ... WHERE balance >= cost means only ONE of two concurrent calls can succeed.
  // Result: deducted exactly once, balance ends at 0 (never negative), exactly one inventory row.
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
    const oks = results.map(r => asSpend(r.data)?.ok)
    expect(oks.filter(Boolean)).toHaveLength(1) // exactly one succeeded

    const balance = await balanceOf(u2Id)
    expect(balance).toBe(0) // deducted exactly once
    expect(balance).toBeGreaterThanOrEqual(0) // never negative (CHECK backstop)

    expect(await inventoryRows(u2Id, 'elementalist')).toHaveLength(1) // one ownership row despite two taps
  })
})
