import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeAdmin, seedUser } from './helpers.ts'

// Server-derived reward constants (D-04). The authoritative copies live in the
// report_match_result SQL RPC (… values (…, 50, 15)); these mirrors are assertion-only.
const WIN_REWARD = 50
const LOSS_REWARD = 15

// report_match_result return shapes (from 20260613061943_accounts_economy.sql §2c):
//   first report only     -> { status: 'pending' }
//   disagreement          -> { status: 'void', reason: 'mismatch' }
//   agreement, settled now -> { status: 'settled', winner_id }
//   already settled        -> { status: 'already_settled' }
type ReportResult = { status: string; reason?: string; winner_id?: string }

// Cast supabase-js's loosely-typed rpc data through `unknown` first — matches the
// wallet-rls.test.ts baseline (avoids introducing a NEW typecheck error class).
function asReport(data: unknown): ReportResult {
  return data as unknown as ReportResult
}

const admin = makeAdmin()
let userA: SupabaseClient
let userB: SupabaseClient
let aId: string
let bId: string

// Fresh uuid per test so each test settles a distinct, independent match.
function newMatchId(): string {
  return crypto.randomUUID()
}

async function balanceOf(id: string): Promise<number> {
  const { data } = await admin.from('wallet').select('balance').eq('owner', id).single()
  return (data?.balance as number) ?? 0
}

async function settlementRows(matchId: string): Promise<unknown[]> {
  const { data } = await admin
    .from('match_settlements')
    .select('match_id')
    .eq('match_id', matchId)
  return data ?? []
}

beforeAll(async () => {
  // Two independent seeded users, each with its own minted-token ANON client
  // (replaces admin.auth.admin.createUser — the GoTrue admin API is unavailable).
  ;({ id: aId, client: userA } = await seedUser(admin, 'ta'))
  ;({ id: bId, client: userB } = await seedUser(admin, 'tb'))
})

describe('settlement idempotency + both-agree (ECON-01/02/04, D-06/D-08)', () => {
  // ECON-01: both agree → winner credited WIN_REWARD (50), loser credited LOSS_REWARD (15),
  // one settled settlement row.
  it('credits WIN_REWARD to winner and LOSS_REWARD to loser when both agree (ECON-01)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)
    const bBefore = await balanceOf(bId)

    await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    const second = await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect(asReport(second.data).status).toBe('settled')

    expect(await balanceOf(aId)).toBe(aBefore + WIN_REWARD) // A won → +50
    expect(await balanceOf(bId)).toBe(bBefore + LOSS_REWARD) // B lost → +15
    expect(await settlementRows(matchId)).toHaveLength(1) // exactly one settlement row
  })

  // ECON-04 double-submit: A reports the SAME match_id twice BEFORE B reports.
  // Both A-reports are idempotent per (match_id, reporter_id) → still pending, no credit.
  // Then B agrees → credited exactly once: A ends +50 (not +100).
  it('double-submit by one player before the opponent stays pending, then credits once (ECON-04)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)
    const bBefore = await balanceOf(bId)

    // A reports twice before B reports — second report is a no-op (idempotent per player).
    const first = await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect(asReport(first.data).status).toBe('pending')
    const dup = await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect(asReport(dup.data).status).toBe('pending') // still pending — no opponent yet

    // No payout has occurred while only A has reported.
    expect(await balanceOf(aId)).toBe(aBefore)
    expect(await balanceOf(bId)).toBe(bBefore)
    expect(await settlementRows(matchId)).toHaveLength(0)

    // B agrees → settle exactly once. A credited the single WIN_REWARD, not double.
    const settle = await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect(asReport(settle.data).status).toBe('settled')
    expect(await balanceOf(aId)).toBe(aBefore + WIN_REWARD) // +50 exactly, not +100
    expect(await balanceOf(bId)).toBe(bBefore + LOSS_REWARD)
  })

  // ECON-04: re-submit after settled → already_settled, balances unchanged.
  it('re-submit after settled returns already_settled with unchanged balances (ECON-04)', async () => {
    const matchId = newMatchId()
    await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    const aAfterSettle = await balanceOf(aId)
    const bAfterSettle = await balanceOf(bId)

    const resub = await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect(asReport(resub.data).status).toBe('already_settled')
    expect(await balanceOf(aId)).toBe(aAfterSettle) // unchanged
    expect(await balanceOf(bId)).toBe(bAfterSettle)
  })

  // ECON-04 / Pitfall 4: concurrent second-reporters settle exactly once. The GET DIAGNOSTICS
  // gate + ON CONFLICT (match_id) DO NOTHING means only one of the racing reports settles.
  it('concurrent second-reporters settle exactly once; winner credited exactly WIN_REWARD (ECON-04)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)
    const bBefore = await balanceOf(bId)

    // Both fire concurrently as the settling pair — only one settlement row may be written.
    await Promise.all([
      userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId }),
      userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId }),
    ])
    expect(await balanceOf(aId)).toBe(aBefore + WIN_REWARD) // credited exactly 50, not 100
    expect(await balanceOf(bId)).toBe(bBefore + LOSS_REWARD)
    expect(await settlementRows(matchId)).toHaveLength(1) // exactly one settlement row
  })

  // D-06 / ECON-04: mismatch (A says A won, B says B won) → voided=true, neither credited.
  it('mismatch is voided and pays nobody (D-06)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)
    const bBefore = await balanceOf(bId)

    await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    const second = await userB.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: bId })
    expect(asReport(second.data).status).toBe('void')

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
  it('lone report stays pending with no settlement and no credit (D-08)', async () => {
    const matchId = newMatchId()
    const aBefore = await balanceOf(aId)

    const only = await userA.rpc('report_match_result', { p_match_id: matchId, p_claimed_winner: aId })
    expect(asReport(only.data).status).toBe('pending')

    expect(await settlementRows(matchId)).toHaveLength(0) // no settlement row yet
    expect(await balanceOf(aId)).toBe(aBefore) // no credit on a lone report
  })

  // ECON-02: reward is server-derived — a client cannot supply the credited amount. The
  // RPC signature is (p_match_id, p_claimed_winner) only; there is no amount parameter, so
  // a forged p_amount can never override the server constants (50 / 15).
  it('reward is server-derived: a client cannot supply the credited amount (ECON-02)', async () => {
    const forgedMatch = newMatchId()
    const aBefore = await balanceOf(aId)
    const bBefore = await balanceOf(bId)

    // A client that tries to pass p_amount is rejected: PostgREST resolves the function by
    // its argument names and there is no overload taking p_amount, so the call never runs
    // (the client can't inject a reward amount at all).
    const forged = await userA.rpc('report_match_result', {
      p_match_id: forgedMatch,
      p_claimed_winner: aId,
      p_amount: 999999,
    } as unknown as { p_match_id: string; p_claimed_winner: string })
    expect(forged.error).not.toBeNull() // unknown extra arg rejected
    expect(await settlementRows(forgedMatch)).toHaveLength(0) // nothing settled
    expect(await balanceOf(aId)).toBe(aBefore) // nobody credited
    expect(await balanceOf(bId)).toBe(bBefore)

    // A normal settlement (no client amount) credits exactly the server constants.
    const cleanMatch = newMatchId()
    await userA.rpc('report_match_result', { p_match_id: cleanMatch, p_claimed_winner: aId })
    await userB.rpc('report_match_result', { p_match_id: cleanMatch, p_claimed_winner: aId })
    expect(await balanceOf(aId)).toBe(aBefore + WIN_REWARD) // server constant 50, not 999999
    expect(await balanceOf(bId)).toBe(bBefore + LOSS_REWARD) // server constant 15
  })
})
