# Phase 11: Accounts & Economy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 11-Accounts & Economy
**Areas discussed:** Economy balance, Reward trust pre-P14, v1.0 migration, Profile & display name

---

## Economy balance

### Q1 — Reward shape

| Option | Description | Selected |
|--------|-------------|----------|
| Win/loss split | Fixed win amount, smaller fixed loss amount. Simple, predictable, balanceable. | ✓ |
| Flat per match | Same amount win or lose. Simplest, but no win incentive. | |
| Performance-scaled | Base + bonus for base HP destroyed / speed / survivors. Engaging but hard to bound pre-P14. | |

**User's choice:** Win/loss split

### Q2 — Starting balance

| Option | Description | Selected |
|--------|-------------|----------|
| Zero start | Start at 0, earn everything. Cleanest integrity. | |
| Small welcome grant | Enough for ~one unit immediately; idempotent, once. Better first-session feel. | ✓ |

**User's choice:** Small welcome grant

### Q3 — Unit cost

| Option | Description | Selected |
|--------|-------------|----------|
| Flat — all same | All three units cost the same. | |
| Tiered by power | Price reflects strength; needs a trusted power ranking. | |
| You decide | Claude sets costs at plan time relative to reward rate + welcome grant. | ✓ |

**User's choice:** You decide (Claude discretion)

### Q4 — Pacing target

| Option | Description | Selected |
|--------|-------------|----------|
| Fast (~3-5 wins) | First unlock within a short session; high early momentum. | ✓ |
| Medium (~8-12 wins) | Couple of sessions; momentum vs earning balance. | |
| Slow (~15-20+ wins) | Scarce, earned; more grind, churn risk. | |

**User's choice:** Fast (~3-5 wins per further unit)
**Notes:** Reconciled with welcome grant — grant ≈ one unit's cost (first unlock near-immediate), each further unit ~3-5 wins. Exact numbers tuned at plan time.

---

## Reward trust pre-P14

### Q1 — Trust posture

| Option | Description | Selected |
|--------|-------------|----------|
| Grant now, bounded | Ship the full earn loop with server-side bounds; harden in P14. | ✓ |
| Wallet+spend only | Defer reward-granting (ECON-01/02) to P14; ship wallet/spend/profile/migration now. | |
| You decide | Let research/planning recommend. | |

**User's choice:** Grant now, bounded

### Q2 — Result source / trust when both clients report

| Option | Description | Selected |
|--------|-------------|----------|
| Both must agree | Settle rewards only when both reports agree on winner; mismatch flagged/void. Strongest interim defense. | ✓ |
| Winner-claim + caps | Trust either client's report but apply hard caps + idempotency. Simpler, weaker. | |
| You decide | Let planning pick to fit P13/P14 shape. | |

**User's choice:** Both must agree

### Q3 — Lone report (disconnect/rage-quit before reporting)

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to P13 | P11 settles only on agreement; abandonment/forfeit owned by P13 lifecycle. | ✓ |
| Minimal timeout grant | Settle lone reporter's win after a window; pulls a slice of P13 forward. | |
| You decide | Let planning decide. | |

**User's choice:** Defer to P13
**Notes:** Accepted consequence — a pre-report disconnect yields no reward in P11. Scope-intersection flagged: P11 now adds reward-settlement columns to `match_results` (Phase 9 had deferred rich columns to P14).

---

## v1.0 migration (ACCT-04)

### Q1 — Already-unlocked units

| Option | Description | Selected |
|--------|-------------|----------|
| Keep them free | Grant old `unlocked_units[]` as owned at no cost. Never strand earned progress. | ✓ |
| Refund as currency | Wipe unlocks, grant equivalent currency to re-buy. Feels like a takeaway. | |

**User's choice:** Keep them free

### Q2 — Back-pay for past play

| Option | Description | Selected |
|--------|-------------|----------|
| Welcome grant only | Same one-time grant as new accounts; no retroactive currency. | ✓ |
| Back-pay from wins | Currency scaled to past wins; rewards loyalty but distorts fresh economy. | |
| You decide | Claude picks at plan time. | |

**User's choice:** Welcome grant only
**Notes:** Kept units + preserved wins/losses already represent player history. `wins`/`losses`/`username` carry forward (no data loss).

---

## Profile & display name (ACCT-02/03)

### Q1 — Name editing

| Option | Description | Selected |
|--------|-------------|----------|
| Editable | Change display name from profile; needs server update path + validation. | |
| Fixed at signup | Set once at onboarding; no rename in P11. Simpler. | ✓ |

**User's choice:** Fixed at signup
**Notes:** Still must escape `username` on display (user-set, goes into `innerHTML` at `GameScene.ts:1031`) — XSS hardening item.

### Q2 — Profile data surface (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Lifetime W/L | Wins/losses from profiles. | ✓ |
| Currency balance | Wallet balance via services layer. | ✓ |
| Rank placeholder | Placeholder slot; real rank wired in P13. | ✓ |
| Owned units | Unlocked/owned units from inventory; profile doubles as roster. | ✓ |

**User's choice:** All four

---

## Claude's Discretion

- Exact economy numbers: win reward, loss reward, welcome-grant size, three unit costs (tuned to welcome ≈ one unit, further units ~3-5 wins).
- Unit pricing flat vs lightly tiered (default flat).
- Migration mechanism (one-time SQL backfill vs lazy-on-login), RPC signatures, exact `match_results` reward-settlement column shape, wallet/inventory schema details — following the Phase 9 wallet pattern.

## Deferred Ideas

- Editable display name / rename flow → later profile/social phase.
- Performance-scaled rewards → possible later economy-tuning pass.
- Retroactive back-pay / loyalty currency → rejected (clean economy).
- Daily / first-win-of-day bonuses → not in milestone scope.
- Disconnect/abandonment reward, forfeit policy, timeout sweeps → P13 lifecycle.
- Real rank/trophy rating → P13.
- Signed, validated, fully bounds-checked match report → P14.
