import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

// Keys come from `supabase status -o env` in CI — NEVER imported from src/
const URL = process.env.SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY! // CI env ONLY — never in src/

// Welcome grant is one unit cost (D-02 / D-04). Authoritative copy lives in the SQL RPC.
const WELCOME_GRANT = 100

// Service-role admin client: provisioning/backfill runs outside any user session,
// so auth.uid() is NULL and provision_account takes an explicit p_user_id.
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

async function makeAuthUser(tag: string): Promise<string> {
  const email = `tmig_${tag}_${Date.now()}@example.test`
  const { data } = await admin.auth.admin.createUser({
    email,
    password: 'pw-123456',
    email_confirm: true,
  })
  return data.user!.id
}

beforeAll(() => {
  // Per-test fixtures are created inline (each test provisions a distinct user),
  // so no shared setup is required here.
})

describe('account provisioning + v1.0 backfill (RED until Plan 02)', () => {
  // ACCT-04: provision_account is idempotent — twice → one wallet row, welcome grant once, balance=100.
  it('provision_account is idempotent: one wallet row, welcome grant once (ACCT-04)', async () => {
    const uid = await makeAuthUser('idem')
    await admin.from('profiles').insert({ id: uid, username: `mig_idem_${Date.now()}` })

    await admin.rpc('provision_account', { p_user_id: uid })
    await admin.rpc('provision_account', { p_user_id: uid })

    const { data: wallets } = await admin.from('wallet').select('balance').eq('owner', uid)
    expect(wallets ?? []).toHaveLength(1) // exactly one wallet row
    expect(wallets![0].balance).toBe(WELCOME_GRANT) // welcome grant credited exactly once
  })

  // ACCT-04: existing player with unlocked_units → backfill grants wallet=100, seeds
  // inventory with 'thorn_beast', leaves wins/losses unchanged.
  it('backfills existing player wallet + inventory while preserving W/L (ACCT-04)', async () => {
    const uid = await makeAuthUser('existing')
    await admin.from('profiles').insert({
      id: uid,
      username: `mig_existing_${Date.now()}`,
      wins: 5,
      losses: 2,
      unlocked_units: ['thorn_beast'],
    })

    await admin.rpc('provision_account', { p_user_id: uid })

    const { data: wallet } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', uid)
      .single()
    expect(wallet!.balance).toBe(WELCOME_GRANT) // welcome grant, no back-pay (D-10)

    const { data: inv } = await admin
      .from('inventory')
      .select('unit_id')
      .eq('owner', uid)
    expect((inv ?? []).map(r => r.unit_id)).toContain('thorn_beast') // earned unit kept free (D-09)

    const { data: prof } = await admin
      .from('profiles')
      .select('wins, losses')
      .eq('id', uid)
      .single()
    expect(prof!.wins).toBe(5) // lifetime stats preserved (D-11)
    expect(prof!.losses).toBe(2)
  })

  // ACCT-04: brand-new account (no prior units) → wallet + welcome grant, empty inventory.
  it('provisions a new account with welcome grant and empty inventory (ACCT-04)', async () => {
    const uid = await makeAuthUser('new')
    await admin.from('profiles').insert({
      id: uid,
      username: `mig_new_${Date.now()}`,
      unlocked_units: [],
    })

    await admin.rpc('provision_account', { p_user_id: uid })

    const { data: wallet } = await admin
      .from('wallet')
      .select('balance')
      .eq('owner', uid)
      .single()
    expect(wallet!.balance).toBe(WELCOME_GRANT) // welcome grant on fresh account

    const { data: inv } = await admin.from('inventory').select('unit_id').eq('owner', uid)
    expect(inv ?? []).toHaveLength(0) // no prior units → empty inventory
  })
})
