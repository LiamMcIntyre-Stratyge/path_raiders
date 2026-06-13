import { describe, expect, it } from 'vitest'

// NOTE: These constants are DISPLAY-ONLY mirrors of the authoritative values that
// live server-side in the SQL RPCs (Plan 02: spend_unlock / report_match_result /
// provision_account). The UI must NEVER trust these for actual deduction or grant —
// they exist only to assert the economy's internal consistency (D-04) and to give
// the UI cosmetic labels (D-07: the client never supplies an amount).
const WIN_REWARD = 50
const LOSS_REWARD = 15
const WELCOME_GRANT = 100
const UNIT_COST = 100

describe('economy constants', () => {
  it('WIN_REWARD is positive', () => {
    expect(WIN_REWARD).toBeGreaterThan(0)
  })

  it('LOSS_REWARD is positive', () => {
    expect(LOSS_REWARD).toBeGreaterThan(0)
  })

  it('LOSS_REWARD < WIN_REWARD (winning is incentivised)', () => {
    expect(LOSS_REWARD).toBeLessThan(WIN_REWARD)
  })

  it('WELCOME_GRANT equals one unit cost (D-02: first unlock immediate)', () => {
    expect(WELCOME_GRANT).toBe(UNIT_COST)
  })

  it('further units affordable in 2-5 wins (D-03: fast pacing)', () => {
    const winsNeeded = Math.ceil(UNIT_COST / WIN_REWARD)
    expect(winsNeeded).toBeGreaterThanOrEqual(2)
    expect(winsNeeded).toBeLessThanOrEqual(5)
  })
})
