import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

// Keys come from `supabase status -o env` in CI — NEVER imported from src/
const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY! // CI env ONLY — never in src/

// Server-derived reward constants (authoritative copies live in the SQL RPC — D-04).
const WIN_REWARD = 50
const LOSS_REWARD = 15

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
let userA: ReturnType<typeof createClient>
let userB: ReturnType<typeof createClient>
let aId: string
let bId: string

// Fresh uuid generator so each test settles a distinct match.
function newMatchId(): string {
  return crypto.randomUUID()
}

async function balanceOf(id: string): Promise<number> {
  const { data } = await admin.from('wallet').select('balance').eq('owner', id).single()
  return (data?.balance as number) ?? 0
}

beforeAll(async () => {
  // User A
  const emailA = `ta_${Date.now()}@example.test`
  await admin.auth.admin.createUser({ email: emailA, password: 'pw-123456', email_confirm: true })
  userA = createClient(URL, ANON, { auth: { persistSession: false } })
  await userA.auth.signInWithPassword({ email: emailA, password: 'pw-123456' })
  const { data: ua } = await userA.auth.getUser()
  aId = ua.user!.id

  // User B
  const emailB = `tb_${Date.now()}@example.test`
  await admin.auth.admin.createUser({ email: emailB, password: 'pw-123456', email_confirm: true })
  userB = createClient(URL, ANON, { auth: { persistSession: false } })
  await userB.auth.signInWithPassword({ email: emailB, password: 'pw-123456' })
  const { data: ub } = await userB.auth.getUser()
  bId = ub.user!.id
})

describe('settlement idempotency + both-agree (RED until Plan 02)', () => {
  // ECON-01: both agree → winner credited WIN_REWARD, loser credited LOSS_REWARD.
  it('credits WIN_REWARD to winner and LOSS_REWARD to loser when both agree (ECON-01)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)
    const bBefore = await balanceOf(bId)

    await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    const second = await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect((second.data as { status: string }).status).toBe('settled')

    expect(await balanceOf(aId)).toBe(aBefore + WIN_REWARD) // A won
    expect(await balanceOf(bId)).toBe(bBefore + LOSS_REWARD) // B lost
  })

  // ECON-04: double-submit the same match_id credits exactly once.
  it('double-submit of same match_id credits exactly once (ECON-04)', async () => {
    const matchId = newMatchId()
    await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    const aAfterSettle = await balanceOf(aId)

    // A submits again for the same match — must not re-credit.
    await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect(await balanceOf(aId)).toBe(aAfterSettle) // unchanged — credited once
  })

  // ECON-04: re-submit after settled → already_settled, balance unchanged.
  it('re-submit after settled returns already_settled with unchanged balance (ECON-04)', async () => {
    const matchId = newMatchId()
    await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    const aAfterSettle = await balanceOf(aId)

    const resub = await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect((resub.data as { status: string }).status).toBe('already_settled')
    expect(await balanceOf(aId)).toBe(aAfterSettle) // balance unchanged
  })

  // ECON-04: concurrent second-reporters settle exactly once; winner credited exactly WIN_REWARD.
  it('concurrent second-reporters settle exactly once (ECON-04)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)

    // Both fire concurrently — only one settlement row may be written.
    await Promise.all([
      userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId }),
      userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId }),
    ])
    expect(await balanceOf(aId)).toBe(aBefore + WIN_REWARD) // credited exactly once, not twice

    const { data: settlements } = await admin
      .from('match_settlements')
      .select('match_id')
      .eq('match_id', matchId)
    expect(settlements ?? []).toHaveLength(1) // exactly one settlement row
  })

  // ECON-04: mismatch (A says A, B says B) → voided=true, neither credited.
  it('mismatch is voided and pays nobody (ECON-04)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)
    const bBefore = await balanceOf(bId)

    await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    const second = await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: bId })
    expect((second.data as { status: string }).status).toBe('void')

    const { data: settlement } = await admin
      .from('match_settlements')
      .select('voided')
      .eq('match_id', matchId)
      .single()
    expect(settlement!.voided).toBe(true)

    expect(await balanceOf(aId)).toBe(aBefore) // neither credited
    expect(await balanceOf(bId)).toBe(bBefore)
  })

  // D-08 / ECON-04: lone report → status pending, no settlement row, no credit.
  it('lone report stays pending with no settlement and no credit (D-08/ECON-04)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)

    const only = await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect((only.data as { status: string }).status).toBe('pending')

    const { data: settlements } = await admin
      .from('match_settlements')
      .select('match_id')
      .eq('match_id', matchId)
    expect(settlements ?? []).toHaveLength(0) // no settlement row yet
    expect(await balanceOf(aId)).toBe(aBefore) // no credit on a lone report
  })

  // ECON-02: client cannot supply a reward amount — the RPC signature only accepts
  // p_match_id + p_claimed_winner; the reward is server-derived.
  it('reward is server-derived: client cannot supply an amount (ECON-02)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)

    // Even if a malicious client passes an extra p_amount, the RPC must ignore it
    // and credit the fixed server constant WIN_REWARD.
    await userA.rpc('report_match_result', {
      p_match_id: matchId,
      p_claimed_winner: aId,
      p_amount: 999999,
    } as unknown as { p_match_id: string; p_claimed_winner: string })
    await userB.rpc('report_match_result', {
      p_match_id: matchId,
      p_claimed_winner: aId,
      p_amount: 999999,
    } as unknown as { p_match_id: string; p_claimed_winner: string })

    expect(await balanceOf(aId)).toBe(aBefore + WIN_REWARD) // server constant, not client value
  })
})
