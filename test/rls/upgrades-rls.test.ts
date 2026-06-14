// Wave-0 RED scaffold — PROG-01/02/04 upgrade_spend RPC + upgrades table RLS.
// This suite is RED until plan 02 creates:
//   - The `upgrades` table (user_id, scope, target_id, level, primary key)
//   - The `upgrade_spend(p_scope, p_target_id)` SECURITY DEFINER RPC
//   - RLS: select-own only, no client write policy (deny-by-default, Pitfall 6)
// Plan 02 turns this GREEN.

import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeAdmin, seedUser } from './helpers.ts'

// Admin/service-role client for fixtures and re-reads.
const admin = makeAdmin()
let user: SupabaseClient
let userId: string

// Display-only cost mirrors. Authoritative values live in upgrade_spend SQL RPC (D-03).
const UNIT_UPGRADE_COST_L2 = 75
const TOWER_UPGRADE_COST_L2 = 100

// upgrade_spend return shapes (from plan-02 SQL RPC schema):
//   success → { ok: true,  new_level: number, new_balance: number }
//   denied  → { ok: false, reason: string }
type UpgradeOk = { ok: true; new_level: number; new_balance: number }
type UpgradeDenied = { ok: false; reason: string }
type UpgradeResult = UpgradeOk | UpgradeDenied

function asUpgrade(data: unknown): UpgradeResult {
  return data as unknown as UpgradeResult
}

async function balanceOf(id: string): Promise<number> {
  const { data } = await admin.from('wallet').select('balance').eq('owner', id).single()
  return (data?.balance as number) ?? 0
}

/** Returns the level for a (user_id, scope, target_id) row, defaulting to 1 if absent (D-15). */
async function levelOf(id: string, scope: string, targetId: string): Promise<number> {
  const { data } = await admin
    .from('upgrades')
    .select('level')
    .eq('user_id', id)
    .eq('scope', scope)
    .eq('target_id', targetId)
    .single()
  return (data?.level as number) ?? 1 // absent row = level 1 (D-15)
}

beforeAll(async () => {
  ;({ id: userId, client: user } = await seedUser(admin, 'tupg'))
  // Seed wallet via RPC (never direct write — Pitfall 1). Key namespaced by userId.
  await user.rpc('credit_wallet', { p_amount: 1000, p_idempotency_key: `seed-upg:${userId}` })
  // Seed inventory: scout_drone is a starter — insert ownership so unit-upgrade tests have something to own.
  await admin.from('inventory').insert({ owner: userId, unit_id: 'scout_drone' })
})

describe('upgrades RLS + upgrade_spend (PROG-01/02/04)', () => {
  // RLS deny-by-default: no client write policy means direct INSERT must be denied.
  it('rejects forged direct INSERT into upgrades (RLS deny-write)', async () => {
    await user.from('upgrades').insert({
      user_id: userId,
      scope: 'unit',
      target_id: 'scout_drone',
      level: 3,
    })
    // Admin re-read confirms no row exists (forged INSERT denied by RLS)
    const level = await levelOf(userId, 'unit', 'scout_drone')
    expect(level).toBe(1) // absent row = level 1 (D-15); forged INSERT had no effect
  })

  // PROG-01: owned unit upgrade deducts cost + increments level
  it('upgrade_spend for owned unit deducts cost and increments level (PROG-01)', async () => {
    const balanceBefore = await balanceOf(userId)
    const levelBefore = await levelOf(userId, 'unit', 'scout_drone')

    const { data } = await user.rpc('upgrade_spend', {
      p_scope: 'unit',
      p_target_id: 'scout_drone',
    })
    const res = asUpgrade(data)
    expect(res.ok).toBe(true)
    expect((res as UpgradeOk).new_level).toBe(levelBefore + 1)
    expect((res as UpgradeOk).new_balance).toBe(balanceBefore - UNIT_UPGRADE_COST_L2)

    expect(await balanceOf(userId)).toBe(balanceBefore - UNIT_UPGRADE_COST_L2)
    expect(await levelOf(userId, 'unit', 'scout_drone')).toBe(levelBefore + 1)
  })

  // PROG-01: insufficient_funds → denied, balance unchanged, level unchanged
  it('upgrade_spend returns insufficient_funds when balance < cost (PROG-01)', async () => {
    // Create a fresh user with 0 balance to reliably trigger insufficient_funds
    const { id: poorId, client: poorUser } = await seedUser(admin, 'tupg-poor')
    await admin.from('inventory').insert({ owner: poorId, unit_id: 'scout_drone' })
    // No credit → balance is 0

    const { data } = await poorUser.rpc('upgrade_spend', {
      p_scope: 'unit',
      p_target_id: 'scout_drone',
    })
    const res = asUpgrade(data)
    expect(res.ok).toBe(false)
    expect((res as UpgradeDenied).reason).toBe('insufficient_funds')
    expect(await balanceOf(poorId)).toBe(0) // unchanged
    expect(await levelOf(poorId, 'unit', 'scout_drone')).toBe(1) // unchanged
  })

  // D-16: must own unit to upgrade it
  it('upgrade_spend rejects unowned unit (D-16)', async () => {
    const { id: u2Id, client: u2 } = await seedUser(admin, 'tupg-unowned')
    await u2.rpc('credit_wallet', { p_amount: 1000, p_idempotency_key: `seed-unowned:${u2Id}` })
    // Do NOT insert inventory row — assault_bot is NOT a starter, not owned

    const { data } = await u2.rpc('upgrade_spend', {
      p_scope: 'unit',
      p_target_id: 'assault_bot',
    })
    const res = asUpgrade(data)
    expect(res.ok).toBe(false)
    // Reason may be 'unowned' or similar — the RPC must reject it
    expect(res.ok).not.toBe(true)
  })

  // Reject unknown unit id
  it('upgrade_spend rejects unknown unit id', async () => {
    const { data } = await user.rpc('upgrade_spend', {
      p_scope: 'unit',
      p_target_id: 'does_not_exist',
    })
    const res = asUpgrade(data)
    expect(res.ok).toBe(false)
  })

  // Reject upgrade beyond max level (5 → 6 must fail)
  it('upgrade_spend rejects at max level (level 5 → 6)', async () => {
    // Create a user at max level via admin direct write (bypassing RPC for setup purposes)
    const { id: maxId, client: maxUser } = await seedUser(admin, 'tupg-maxlvl')
    await maxUser.rpc('credit_wallet', { p_amount: 5000, p_idempotency_key: `seed-max:${maxId}` })
    await admin.from('inventory').insert({ owner: maxId, unit_id: 'scout_drone' })
    // Insert upgrades row at level 5 directly as admin to simulate max level
    await admin.from('upgrades').insert({
      user_id: maxId,
      scope: 'unit',
      target_id: 'scout_drone',
      level: 5,
    })

    const { data } = await maxUser.rpc('upgrade_spend', {
      p_scope: 'unit',
      p_target_id: 'scout_drone',
    })
    const res = asUpgrade(data)
    expect(res.ok).toBe(false)
  })

  // PROG-04: concurrent upgrade deducts exactly once
  it('concurrent upgrade_spend deducts exactly once (PROG-04 concurrency)', async () => {
    const { id: concId, client: concUser } = await seedUser(admin, 'tupg-conc')
    // Seed exactly one upgrade cost so only one concurrent call can succeed
    await concUser.rpc('credit_wallet', {
      p_amount: UNIT_UPGRADE_COST_L2,
      p_idempotency_key: `seed-conc:${concId}`,
    })
    await admin.from('inventory').insert({ owner: concId, unit_id: 'vine_crawler' })

    const results = await Promise.all([
      concUser.rpc('upgrade_spend', { p_scope: 'unit', p_target_id: 'vine_crawler' }),
      concUser.rpc('upgrade_spend', { p_scope: 'unit', p_target_id: 'vine_crawler' }),
    ])
    const oks = results.map((r) => asUpgrade(r.data)?.ok)
    expect(oks.filter(Boolean)).toHaveLength(1) // exactly one succeeded

    const balance = await balanceOf(concId)
    expect(balance).toBe(0) // deducted exactly once
    expect(balance).toBeGreaterThanOrEqual(0) // never negative
    expect(await levelOf(concId, 'unit', 'vine_crawler')).toBe(2) // incremented exactly once
  })

  // PROG-02: scope='tower' with target_id='tower_power' increments tower_power level
  it('upgrade_spend for scope=tower increments tower_power level (PROG-02)', async () => {
    const { id: towerId, client: towerUser } = await seedUser(admin, 'tupg-tower')
    await towerUser.rpc('credit_wallet', {
      p_amount: TOWER_UPGRADE_COST_L2,
      p_idempotency_key: `seed-tower:${towerId}`,
    })

    const { data } = await towerUser.rpc('upgrade_spend', {
      p_scope: 'tower',
      p_target_id: 'tower_power',
    })
    const res = asUpgrade(data)
    expect(res.ok).toBe(true)
    expect((res as UpgradeOk).new_level).toBe(2)
    expect(await levelOf(towerId, 'tower', 'tower_power')).toBe(2)
  })
})
