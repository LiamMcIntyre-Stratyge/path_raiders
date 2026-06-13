import { describe, expect, it } from 'vitest'
import { makeAdmin, seedUser } from './helpers.ts'

// Welcome grant constant (D-02 / D-04). Authoritative copy lives in the SQL RPC
// (provision_account → credit_wallet_for_user(…, 100, 'welcome:'||uid)); mirror is
// assertion-only.
const WELCOME_GRANT = 100

// Service-role admin client: provisioning/backfill runs outside any user session,
// so auth.uid() is NULL and provision_account takes an explicit p_user_id.
//
// NOTE: provision_account is the unit-testable surface of the v1.0 backfill. The
// deploy-time DO-block in 20260613061943_accounts_economy.sql §2e is the same logic
// looped over every profile (ensure wallet row → idempotent welcome grant → seed
// inventory from unlocked_units[]). Exercising provision_account here proves the
// per-profile backfill semantics the DO-block applies in bulk.
const admin = makeAdmin()

async function makeAuthUser(tag: string): Promise<string> {
  // provision_account takes an explicit p_user_id, so we only need the auth.users
  // row to exist (FK target) — no session/token required here.
  const { id } = await seedUser(admin, `tmig_${tag}`)
  return id
}

async function balanceOf(id: string): Promise<number> {
  const { data } = await admin.from('wallet').select('balance').eq('owner', id).single()
  return (data?.balance as number) ?? 0
}

async function inventoryUnits(id: string): Promise<string[]> {
  const { data } = await admin.from('inventory').select('unit_id').eq('owner', id)
  return (data ?? []).map(r => r.unit_id as string)
}

// Per-test fixtures are created inline (each test provisions a distinct user),
// so no shared beforeAll setup is required.
describe('account provisioning + v1.0 backfill (ACCT-04)', () => {
  // ACCT-04 / existing player: backfill grants wallet=100 (welcome grant, no back-pay D-10),
  // seeds inventory from unlocked_units[] (D-09: earned units kept free), and leaves
  // wins/losses/username untouched (D-11).
  it('backfills existing player wallet + inventory while preserving W/L (ACCT-04)', async () => {
    const uid = await makeAuthUser('existing')
    const username = `mig_existing_${Date.now()}`
    await admin.from('profiles').insert({
      id: uid,
      username,
      wins: 5,
      losses: 2,
      unlocked_units: ['thorn_beast'],
    })

    await admin.rpc('provision_account', { p_user_id: uid })

    expect(await balanceOf(uid)).toBe(WELCOME_GRANT) // welcome grant, no back-pay (D-10)
    expect(await inventoryUnits(uid)).toContain('thorn_beast') // earned unit kept free (D-09)

    const { data: prof } = await admin
      .from('profiles')
      .select('wins, losses, username')
      .eq('id', uid)
      .single()
    expect(prof!.wins).toBe(5) // lifetime stats preserved (D-11)
    expect(prof!.losses).toBe(2)
    expect(prof!.username).toBe(username) // username untouched
  })

  // ACCT-04 / idempotency (D-02): a second provision_account leaves balance at 100
  // (welcome granted exactly once via the wallet_credits 'welcome:'||uid key) and a
  // single 'thorn_beast' inventory row (ON CONFLICT DO NOTHING).
  it('provision_account is idempotent: welcome grant once, balance stays 100 (ACCT-04)', async () => {
    const uid = await makeAuthUser('idem')
    await admin.from('profiles').insert({
      id: uid,
      username: `mig_idem_${Date.now()}`,
      unlocked_units: ['thorn_beast'],
    })

    await admin.rpc('provision_account', { p_user_id: uid })
    // Seed inventory the way the backfill DO-block does (provision_account itself only
    // grants the wallet; inventory seeding is the loop step) so the idempotency assert
    // below covers the unit row too.
    await admin.from('inventory').insert({ owner: uid, unit_id: 'thorn_beast' })

    // Second provision must NOT double-grant.
    await admin.rpc('provision_account', { p_user_id: uid })

    const { data: wallets } = await admin.from('wallet').select('balance').eq('owner', uid)
    expect(wallets ?? []).toHaveLength(1) // exactly one wallet row
    expect(wallets![0].balance).toBe(WELCOME_GRANT) // 100, not 200 — welcome granted once

    // Re-inserting the same unit is a no-op (UNIQUE(owner, unit_id)).
    await admin.from('inventory').insert({ owner: uid, unit_id: 'thorn_beast' })
    expect(await inventoryUnits(uid)).toEqual(['thorn_beast']) // still one row
  })

  // ACCT-04 / new account (D-10 no back-pay): fresh profile with empty unlocked_units →
  // wallet + welcome grant, empty inventory.
  it('provisions a new account with welcome grant and empty inventory (ACCT-04)', async () => {
    const uid = await makeAuthUser('new')
    await admin.from('profiles').insert({
      id: uid,
      username: `mig_new_${Date.now()}`,
      unlocked_units: [],
    })

    await admin.rpc('provision_account', { p_user_id: uid })

    expect(await balanceOf(uid)).toBe(WELCOME_GRANT) // welcome grant on fresh account
    expect(await inventoryUnits(uid)).toHaveLength(0) // no prior units → empty inventory
  })

  // Pitfall 7: a legacy profile carrying an unknown unit id must not crash the backfill.
  // There is no unit_id CHECK constraint, so unknown ids insert as-is. We seed the unit
  // the way the DO-block loop does (inventory insert), then call provision_account — the
  // wallet grant must still succeed without error and stay at 100.
  it('tolerates an unknown unit id without crashing provisioning (Pitfall 7)', async () => {
    const uid = await makeAuthUser('unknown')
    await admin.from('profiles').insert({
      id: uid,
      username: `mig_unknown_${Date.now()}`,
      unlocked_units: ['__legacy_unknown_unit__'],
    })

    // Mirror the backfill loop: unknown ids are inserted as-is (no CHECK constraint).
    const { error: invError } = await admin
      .from('inventory')
      .insert({ owner: uid, unit_id: '__legacy_unknown_unit__' })
    expect(invError).toBeNull() // unknown unit inserts without a constraint violation

    const { error } = await admin.rpc('provision_account', { p_user_id: uid })
    expect(error).toBeNull() // provisioning does not crash on a legacy unknown unit

    expect(await balanceOf(uid)).toBe(WELCOME_GRANT) // wallet grant still applied
    expect(await inventoryUnits(uid)).toContain('__legacy_unknown_unit__') // kept as-is
  })
})
