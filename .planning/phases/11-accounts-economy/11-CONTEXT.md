# Phase 11: Accounts & Economy - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Make **accounts, profiles, wallet, and unit ownership server truth**. A persistent soft
currency (distinct from in-match gold) is **earned server-side from a match result** and
**spent server-side** to unlock the three non-starter units (Assault Bot, Thorn Beast,
Elementalist). Existing v1.0 `profiles` rows are **migrated forward with no data loss**.
This is the **first real authority move** on the safe, non-realtime surface — it fills out
Phase 9's `wallet` exemplar (RLS read-own + `SECURITY DEFINER` sole-writer RPC + forged-write
test) into the live economy and gives the Phase 9 `inventory` shell its real ownership columns.

**In scope:** accounts/profiles persistence (ACCT-01); display name + lifetime stats on a
profile screen (ACCT-02/03, integrating provided designs); wallet credit/spend RPCs with
atomic + idempotent guarantees (ECON-04/05); battle reward grant — win/loss split, granted
server-side from an **agreed** match result with interim bounds (ECON-01/02); spend-to-unlock
the 3 non-starter units (ECON-03); one-time welcome grant; v1.0 migration (ACCT-04).

**Out of scope (later phases):** progression / per-unit & tower upgrades (P12); matchmaking,
match lifecycle/abandonment handling, real rank, match history (P13); the determinism pass +
signed/validated match report and full report bounds-checking (P14). Net-new UI/UX & character
art (user-owned in Claude designs — this phase integrates provided designs).

</domain>

<decisions>
## Implementation Decisions

### Economy balance — earn rate, costs, starting balance
- **D-01:** **Reward = win/loss split.** A completed battle grants a fixed soft-currency
  amount for a win and a smaller fixed amount for a loss. Predictable, easy to balance and
  explain; losers still progress but winning is incentivised. (Exact numbers = D-04 discretion.)
- **D-02:** **New accounts get a small one-time welcome grant**, sized at roughly **one unit's
  cost** so the first unlock is essentially immediate. The grant MUST be idempotent — credited
  exactly once at account creation/migration, never re-granted on retry.
- **D-03:** **Pacing target = fast.** After the welcome unlock, each *further* unit should be
  affordable in roughly **3–5 wins** on the win/loss split. This is the anchor for tuning the
  reward amounts and unit costs together.

### Reward trust before Phase 14 (interim authority posture)
- **D-05:** **Grant rewards now, bounded.** Phase 11 ships the full earn loop rather than
  deferring it — but with explicit server-side bounds, knowing the cryptographically validated
  signed match report is P14's job. The interim grant is deliberately imperfect and will be
  **hardened in P14**, not reworked.
- **D-06:** **Both clients must agree to settle.** Each player submits the match outcome; the
  reward RPC records the result keyed by `match_id` and **settles rewards only when both reports
  agree on the winner**. A mismatch is flagged/void (no payout). This is a lightweight preview of
  P14's report-comparison model and reuses the `match_id` idempotency key.
- **D-07:** **Settlement is idempotent and capped.** Exactly one settlement per `match_id`
  (`INSERT … ON CONFLICT DO NOTHING`-style); reward amounts are server-derived and bounded by
  sane caps; the client never supplies an amount.
- **D-08:** **Lone-report / disconnect case is deferred to P13.** If only one report arrives
  (opponent disconnects/rage-quits before reporting), Phase 11 does **not** settle — it pays out
  only on agreement. Timeout sweeps, forfeit policy, and abandonment-grant are owned by P13's
  match lifecycle. (Accepted consequence: in P11 a pre-report disconnect yields no reward.)

### v1.0 migration (ACCT-04)
- **D-09:** **Keep already-unlocked units free.** Any unit in a v1.0 player's old
  `unlocked_units[]` (earned at the 2/3/5-win milestones) is granted as **owned** in the new
  inventory at no currency cost — never strand earned progress.
- **D-10:** **No back-pay.** Returning v1.0 players receive the **same one-time welcome grant**
  as new accounts — no retroactive currency scaled to past wins. Avoids injecting a large lump
  into a brand-new economy; their kept units already represent their history.
- **D-11:** **Preserve lifetime stats.** `wins`, `losses`, and `username` carry forward
  unchanged (ACCT-03 surfaces them; SC#5 "no data loss"). The legacy **win-milestone unlock
  logic** at `GameScene.ts:623-639` is **removed** — unlocks are now currency-spend only.

### Profile & display name (ACCT-02 / ACCT-03)
- **D-12:** **Display name is fixed at signup.** No rename path in Phase 11 — the existing
  onboard/signup flow remains the only place a name is set. (Editable name is a deferred idea.)
- **D-13:** **Profile binds to:** lifetime **W/L**, **currency balance** (from `wallet` via the
  services layer), a **rank placeholder** (real rank is P13's `RANK`), and **owned units** (from
  the new inventory — profile doubles as a roster view). UI itself is the user's provided design;
  this phase wires data to it.
- **D-14 (hardening):** **Escape `username` on display.** It is user-set and currently
  interpolated into `innerHTML` at `GameScene.ts:1031` (and rendered in Lobby) — escape it
  wherever shown to close the stored-XSS pitfall, even though the name is now fixed at signup.

### Claude's Discretion
- **D-04:** **Exact economy numbers** — win reward, loss reward, welcome-grant size, and the
  three unit costs — are Claude's to set at plan time, tuned so D-02 (welcome ≈ one unit) and
  D-03 (further units ~3–5 wins) hold together. Unit pricing may be flat or lightly tiered;
  default to flat unless a clear power gap justifies otherwise (all three are T2 non-starters).
- Migration mechanism (one-time SQL backfill over existing rows vs lazy-on-login provisioning),
  RPC signatures, the exact `match_results` reward-settlement columns, and the wallet/inventory
  schema details are Claude's to choose at plan time, following the Phase 9 wallet pattern.
- `service_role` (if any privileged path needs it) stays server-only — never a `VITE_*` var,
  never imported by `src/` (carry-forward from Phase 9 D / FND-03).

### ⚠️ Scope intersection flag (for the planner)
- Phase 9's CONTEXT deferred the **rich `match_results` columns to its owning phase (assumed
  P14)**. D-05/D-06 now require Phase 11 to add **reward-settlement columns** to `match_results`
  (per-player report keyed by `match_id`, winner agreement, settled flag). Phase 11 builds the
  *reward-settlement* slice; P14 layers the *signed/validated* report + bounds-check on top.
  Design the P11 columns so P14 extends them rather than reworking them.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Economy, RLS & schema patterns (the locked SQL shapes)
- `.planning/research/PITFALLS.md` — esp. **Pitfall 3** (client-trusted rewards → server-derived),
  **Pitfall 4** (idempotent grants — `UNIQUE match_id` + `ON CONFLICT DO NOTHING`),
  **Pitfall 5** (atomic spend `UPDATE … WHERE balance >= cost` + `CHECK (>= 0)`),
  **Pitfall 6** (RLS read-own / non-client-writable currency columns), **Pitfall 10**
  (migrate v1.0 rows forward; levels not absolute stats — relevant to P12 but informs the
  account model), and the "Looks Done But Isn't" checklist (idempotency / concurrent-spend /
  existing-player-migration tests).
- `.planning/research/SUMMARY.md` §"Key Architecture Decision" (Option A — Supabase-only result
  validation) and §"Implications for Roadmap".

### Phase 9 foundation this phase extends (the exemplar to copy)
- `.planning/phases/09-backend-foundations-integrity/09-CONTEXT.md` — D-02 (wallet exemplar:
  RLS read-own + `SECURITY DEFINER` credit RPC + forged-write test), D-03 (`inventory` /
  `match_results` bare RLS shells to be filled in here), D-07/D-08 (thin `src/lib/api/` seam;
  wallet client consumed by P11), email-only identity (D-04/05).
- `.planning/phases/09-backend-foundations-integrity/09-RESEARCH.md` — backend integrity
  research underpinning the migration/RPC shapes.

### Current Supabase wiring & code to change
- `.planning/codebase/INTEGRATIONS.md` — `profiles` (`id`, `wins`, `losses`, `unlocked_units[]`,
  `username`) and `rooms` table usage, the single `src/lib/supabase.ts` client, auth/onboard
  flows in `AuthScene`, and exact file:line write sites.
- `.planning/codebase/CONCERNS.md` — client-authoritative `recordResult`, unverified RLS, the
  win-milestone unlock write, 0% test coverage, the `username`→`innerHTML` XSS note.
- Primary files this phase edits: `src/scenes/GameScene.ts` (remove win-milestone unlock at
  `:623-639`; reward submission; escape `username` at `:1031`), `src/scenes/AuthScene.ts`
  (profile read/onboard), `src/scenes/LobbyScene.ts` (profile/name display), `src/lib/gameState.ts`,
  `src/units/UnitData.ts`, `src/types/index.ts`, plus new `supabase/migrations/*` and
  `src/lib/api/*` (wallet/inventory/profile clients extending the Phase 9 seam).

### Phase / requirements anchors
- `.planning/ROADMAP.md` §"Phase 11" — goal + 5 success criteria (note SC#1 "rank placeholder").
- `.planning/REQUIREMENTS.md` — ACCT-01…04, ECON-01…05.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 9 `wallet` table + credit RPC + forged-write test** (once Phase 9 executes) — the
  copy-paste exemplar for the spend RPC and the `inventory` ownership columns.
- **`src/lib/api/` seam** (Phase 9 D-07) — the wallet/profile clients exist as the only path
  scenes use; Phase 11 extends them with spend, inventory, reward-submission, and migration reads.
- **`AuthScene` onboard/signup flow** — already sets `username`; remains the sole name-setter
  under D-12 (no new rename UI).
- **`profiles` columns** — `wins`, `losses`, `unlocked_units[]`, `username` already exist and
  carry forward (D-09/D-11).

### Established Patterns
- Authoritative writes go through `SECURITY DEFINER` RPCs invoked with the anon key under the
  player's own auth; RLS denies direct client writes to currency/ownership columns (Phase 9 D-02,
  Pitfall 6). Phase 11's spend, reward-settlement, and welcome-grant all follow this.
- Atomic single-statement balance mutation + `CHECK (>= 0)` for spend; `match_id`-keyed
  `ON CONFLICT DO NOTHING` for idempotent grants (Pitfalls 4/5 — locked shapes).
- Scenes never call `supabase.from()` for authoritative tables (FND-05) — services layer only.

### Integration Points
- New **reward-settlement columns on `match_results`** (per-player report + winner agreement +
  settled flag, keyed by `match_id`) — the P11/P14 seam (see scope-intersection flag). In P11
  the `match_id` is the existing room/match UUID (no matchmaking yet; room-code path unchanged).
- New **spend RPC** + **inventory** ownership rows wire the wallet to unit unlocks (ECON-03).
- **Migration** provisions a `wallet` row (+ welcome grant), inventory rows from old
  `unlocked_units[]`, and preserves `wins`/`losses`/`username` for every existing account.
- **Profile screen** (provided design) binds to W/L + wallet balance + rank placeholder +
  owned units (D-13).

</code_context>

<specifics>
## Specific Ideas

- The interim trust model (D-05/D-06) is intentionally a **scaled-down preview of Phase 14**:
  "both clients submit, settle only on agreement, idempotent per `match_id`." This lets the full
  earn-and-spend loop ship in P11 while leaving a clean upgrade seam — P14 adds signing, base-HP/
  seed/deploy-log bounds, and rejection of implausible reports on top of the same row shape.
- The user wants the unlock economy to feel **fast and momentum-first**: welcome grant ≈ first
  unit immediately, the rest within a session or two. Tuning should favour early roster access
  over scarcity/grind (depth comes later via P12 progression).

</specifics>

<deferred>
## Deferred Ideas

- **Editable display name / rename flow** — out of scope for P11 (name fixed at signup, D-12);
  revisit in a later profile/social phase.
- **Performance-scaled rewards** (base-HP-destroyed / speed / survivors bonus) — considered and
  set aside in favour of the simpler win/loss split (D-01); a possible later economy-tuning pass.
- **Retroactive back-pay / loyalty currency for veterans** — explicitly rejected (D-10) to keep
  the fresh economy clean.
- **Daily / first-win-of-day bonuses** — not in this milestone's scope (economy foundation only).
- **Disconnect / abandonment reward & forfeit policy, timeout sweeps** — P13 match lifecycle
  (D-08); P11 settles only on mutual agreement.
- **Real rank/trophy rating** — P13 (`RANK-01/02`); P11 shows only a placeholder slot (D-13).
- **Signed, validated, fully bounds-checked match report** — P14 (`BATTLE-03/04`); P11 ships the
  interim agreement-based grant (D-05).

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 11-Accounts & Economy*
*Context gathered: 2026-06-12*
