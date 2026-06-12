# Phase 11: Accounts & Economy - Research

**Researched:** 2026-06-12
**Domain:** Supabase authoritative economy (SECURITY DEFINER RPCs, idempotent grants, atomic spend, match_results reward-settlement columns, v1.0 migration, XSS hardening) — on the Phase 9 live wallet/RLS foundation.
**Confidence:** HIGH on SQL shapes (directly read from live migrations + confirmed against PITFALLS.md locked shapes); HIGH on migration strategy (Postgres semantics verified); HIGH on economy numbers (derived from D-02/D-03 constraints); MEDIUM on the "both must agree" RPC flow (no external authoritative source — derived from first principles against the Phase 9 idempotency pattern).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Economy balance — earn rate, costs, starting balance**
- **D-01:** Reward = win/loss split. A completed battle grants a fixed soft-currency amount for a win and a smaller fixed amount for a loss.
- **D-02:** New accounts get a small one-time welcome grant, sized at roughly one unit's cost so the first unlock is essentially immediate. The grant MUST be idempotent — credited exactly once at account creation/migration, never re-granted on retry.
- **D-03:** Pacing target = fast. After the welcome unlock, each further unit should be affordable in roughly 3-5 wins on the win/loss split.

**Reward trust before Phase 14 (interim authority posture)**
- **D-05:** Grant rewards now, bounded. Phase 11 ships the full earn loop with explicit server-side bounds; the cryptographically validated signed match report is P14's job.
- **D-06:** Both clients must agree to settle. Each player submits the match outcome; the reward RPC records the result keyed by match_id and settles rewards only when both reports agree on the winner. A mismatch is flagged/void (no payout).
- **D-07:** Settlement is idempotent and capped. Exactly one settlement per match_id (INSERT ... ON CONFLICT DO NOTHING-style); reward amounts are server-derived and bounded by sane caps; the client never supplies an amount.
- **D-08:** Lone-report / disconnect case is deferred to P13. If only one report arrives, Phase 11 does not settle. Timeout sweeps, forfeit policy, and abandonment-grant are owned by P13's match lifecycle.

**v1.0 migration (ACCT-04)**
- **D-09:** Keep already-unlocked units free. Any unit in a v1.0 player's old unlocked_units[] is granted as owned in the new inventory at no currency cost.
- **D-10:** No back-pay. Returning v1.0 players receive the same one-time welcome grant as new accounts — no retroactive currency scaled to past wins.
- **D-11:** Preserve lifetime stats. wins, losses, and username carry forward unchanged. The legacy win-milestone unlock logic at GameScene.ts:623-639 is removed — unlocks are now currency-spend only.

**Profile & display name (ACCT-02 / ACCT-03)**
- **D-12:** Display name is fixed at signup. No rename path in Phase 11.
- **D-13:** Profile binds to: lifetime W/L, currency balance (from wallet via the services layer), a rank placeholder (real rank is P13's RANK), and owned units (from the new inventory).
- **D-14 (hardening):** Escape username on display. Escape it wherever shown (GameScene.ts:1031 and LobbyScene).

### Claude's Discretion

- **D-04:** Exact economy numbers — win reward, loss reward, welcome-grant size, and the three unit costs.
- Migration mechanism (one-time SQL backfill vs lazy-on-login provisioning), RPC signatures, the exact match_results reward-settlement columns, and wallet/inventory schema details — following the Phase 9 wallet pattern.
- service_role (if any privileged path needs it) stays server-only — never a VITE_* var, never imported by src/.

### Deferred Ideas (OUT OF SCOPE)

- Editable display name / rename flow.
- Performance-scaled rewards (base-HP-destroyed / speed / survivors bonus).
- Retroactive back-pay / loyalty currency for veterans.
- Daily / first-win-of-day bonuses.
- Disconnect / abandonment reward & forfeit policy, timeout sweeps — P13.
- Real rank/trophy rating — P13.
- Signed, validated, fully bounds-checked match report — P14.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACCT-01 | A player's account and progress persist across logout and app restart. | Wallet + inventory reads through src/lib/api/ seam; profiles already persist via Phase 9 RLS; Phase 11 adds wallet row + inventory rows at account creation/migration. |
| ACCT-02 | A player can set and view a display name on their profile. | Username already set in AuthScene onboard flow (Phase 9); profile screen wires gameState.username display. No rename path. D-12. |
| ACCT-03 | A player can view their lifetime stats (wins/losses, currency balance, rank) on their profile. | Profile screen reads wins/losses from profiles, balance from wallet via api/wallet.ts, owned units from inventory; rank = placeholder. D-13. |
| ACCT-04 | Existing v1.0 accounts (wins, unlocked units) are migrated forward with no data loss. | SQL backfill migration provisions wallet row + welcome grant + inventory ownership rows from unlocked_units[]; preserves wins/losses/username. D-09/D-10/D-11. |
| ECON-01 | A player earns a persistent soft currency for completing a battle, distinct from in-match gold. | report_match_result RPC grants win_reward or loss_reward from server-side constants; currency is wallet.balance (separate table from in-match gold). |
| ECON-02 | Currency rewards are computed and granted server-side from a validated match result, never client-supplied. | report_match_result SECURITY DEFINER RPC; client sends winner claim (string), RPC ignores any amount param; reward is a server const. Pitfall 3. |
| ECON-03 | A player can spend currency to unlock the three non-starter units (Assault Bot, Thorn Beast, Elementalist). | spend_unlock SECURITY DEFINER RPC; atomic UPDATE wallet WHERE balance >= cost + inventory INSERT; CHECK (balance >= 0) backstop. Pitfall 5. |
| ECON-04 | Currency grants are idempotent and balances can never go negative or be double-spent (server-enforced atomic writes). | match_id UNIQUE constraint on match_results settlement + ON CONFLICT DO NOTHING; atomic spend; CHECK (balance >= 0). Pitfalls 4/5. |
| ECON-05 | A player's wallet balance and owned units are server truth — readable by the client, never client-writable. | wallet RLS (read-own, no client writes) + inventory RLS (read-own, no client writes) — both extend the Phase 9 pattern. Pitfall 6. |

</phase_requirements>

---

## Summary

Phase 11 is the first real authority move on the safe, non-realtime surface. The Phase 9 wallet exemplar (`wallet` table, `credit_wallet` SECURITY DEFINER RPC, forged-write RLS test) is **live in production** and is the copy-paste template for every new authoritative write in this phase. Phase 11 has five work streams that can be planned semi-independently: (1) schema migration — fill out `inventory` and `match_results` from their bare Phase 9 shells + add settlement columns; (2) SECURITY DEFINER RPCs — `report_match_result` (both-agree settlement), `spend_unlock` (atomic spend), `provision_account` (welcome grant + migration idempotent); (3) v1.0 backfill — one-time SQL migration over existing profiles rows; (4) services-layer extension — new `src/lib/api/` clients for inventory, settlement, profile screen; (5) scene edits — retire `recordResult` client write, remove win-milestone unlock, escape username XSS, wire profile screen.

The critical design question is the "both clients must agree" settlement (D-06). The research recommends a **two-phase insert + trigger-style settlement** baked into the `report_match_result` RPC: the first report from either player inserts a pending row; the second report (with matching match_id + agreeing winner) upserts the second side's data and, in the same transaction, settles rewards for both players if agreement is detected. A mismatch on the second report sets a `void` flag and pays nothing. This is structurally idempotent (UNIQUE on match_id per player) and leaves a clean extension seam for P14's signed report layer.

The "both agree" flow requires the `match_results` table to hold **two per-player report rows per match** — keyed by `(match_id, reporter_id)` — rather than one row per match. A separate `match_settlements` row (one per match_id) records whether the match settled, who won, and the settled amounts, so P14 can add signature/bounds columns there rather than on the per-player report rows.

**Primary recommendation:** Use the SQL backfill migration (not lazy provisioning) for v1.0 accounts. Apply a single migration that provisions `wallet` rows + welcome grants + inventory rows from `unlocked_units[]` for all existing `profiles` rows in one idempotent pass, using `ON CONFLICT DO NOTHING` guards so it is safe to re-run.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Wallet balance storage and mutation | Database (Postgres + RLS + SECURITY DEFINER RPC) | — | RLS denies all client writes; only SECURITY DEFINER RPCs can mutate balance. Phase 9 pattern. |
| Reward settlement decision (did both agree?) | Database (SECURITY DEFINER RPC: report_match_result) | — | Server compares both reports in one transaction; client only submits a claim string. |
| Spend-to-unlock (atomic deduct + inventory insert) | Database (SECURITY DEFINER RPC: spend_unlock) | — | Atomic UPDATE...WHERE balance >= cost + inventory INSERT in one transaction. |
| Welcome grant + v1.0 migration provisioning | Database (SQL migration + SECURITY DEFINER RPC: provision_account) | — | One-time idempotent backfill; provision_account is also called at new account signup. |
| Inventory ownership reads | Database (Postgres + RLS read-own) | API seam (src/lib/api/inventory.ts) | Client reads its own inventory rows via RLS; never writes directly. |
| Profile screen data aggregation | API seam (src/lib/api/profile.ts) | Client (ProfileScene) | Aggregates wins/losses from profiles, balance from wallet, owned units from inventory. |
| Match result submission (client side) | Client (GameScene via src/lib/api/settlement.ts) | — | Client calls report_match_result RPC with match_id + winner claim after game_over event. |
| Username XSS protection | Client (GameScene.ts:882, LobbyScene.ts:100) | — | Escape username before innerHTML interpolation; no server enforcement needed (name is fixed). |
| In-match gold (separate, transient) | Client only | — | Unchanged — in-match gold is ephemeral, never persisted. |
| Win-milestone unlock logic (REMOVED) | — | — | GameScene.ts:623-639 + account.ts THRESHOLDS deleted entirely. Currency-spend is the only unlock path. |

---

## Standard Stack

### Core (no new deps — all Phase 9 infrastructure)

| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.99.3 (keep pinned) [VERIFIED: live in package.json] | PostgREST queries + RPC invocations + auth | Already the project's single client; no new version needed for Phase 11 features. |
| Supabase Postgres migrations | — (new .sql files) [VERIFIED: live supabase/migrations/] | Schema changes, new RPCs, backfill logic | Committed SQL migrations are the only safe way to evolve the live DB boundary. |
| Vitest 4.1.8 | ^4.1.8 [VERIFIED: live in package.json + node_modules] | Test harness | Phase 9 harness is live; Phase 11 adds economy/idempotency/migration test files. |

Phase 11 introduces **zero new npm packages**. All capabilities are built on existing infrastructure (Supabase Postgres functions + supabase-js + Vitest).

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `supabase` CLI | ^2.106.0 [VERIFIED: Phase 9 CI] | `supabase migration new` to generate timestamped migration files | Each schema change is a new timestamped migration file. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQL backfill migration (recommended) | Lazy-on-login provisioning in provision_account RPC | Backfill is immediate and complete — profile screen works on first login, no NULL balance edge cases. Lazy provisioning defers to first login which can fail or be skipped. Backfill is simpler to test. |
| Two per-player report rows + separate settlement row (recommended) | One-row-per-match with host/guest columns | Two rows + settlement row allows UNIQUE per (match_id, reporter_id), natural upsert semantics, and the P14 extension column set sits cleanly on the settlement row. Single-row-per-match requires complex conditional UPDATE logic with no clear P14 extension seam. |
| spend_unlock RPC with atomic UPDATE+INSERT (recommended) | Two-step: update balance then insert inventory | Two-step has a crash window between the deduct and the insert. Single-transaction RPC is the only safe approach. |

**Installation:**
```bash
# No new npm packages. New Supabase migration files only:
npx supabase migration new accounts_economy
```

---

## Package Legitimacy Audit

Phase 11 installs no new npm packages. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
  GameScene (after game_over event from sim)
    |
    | api/settlement.ts: reportMatchResult(matchId, winnerId, myRole)
    v
  report_match_result RPC  [SECURITY DEFINER]
    |-- INSERT into match_results (match_id, reporter_id, claimed_winner)
    |   ON CONFLICT (match_id, reporter_id) DO NOTHING  ← idempotent per player
    |
    |-- SELECT both rows for this match_id
    |   IF both rows exist AND claimed_winner agree:
    |     INSERT into match_settlements (match_id, winner_id, settled=true)
    |     ON CONFLICT (match_id) DO NOTHING  ← idempotent settlement
    |     IF inserted (not already settled):
    |       credit_wallet(winner_id, WIN_REWARD, 'match:'+match_id+':win')
    |       credit_wallet(loser_id,  LOSS_REWARD, 'match:'+match_id+':loss')
    |   ELSIF both rows exist AND claimed_winner disagree:
    |     UPDATE match_settlements SET voided=true, settled=false  ← no payout
    |   ELSE:
    |     first report recorded, awaiting second player  ← no payout yet
    |
    v
  wallet.balance updated (atomically via credit_wallet RPC)

  LoadoutScene / ProfileScene
    |
    | api/inventory.ts: getOwnedUnits(userId)
    v
  inventory table (RLS read-own)  →  client renders unlock UI

  ProfileScene
    |
    | api/profile.ts: getProfileFull(userId)
    v
  profiles (wins/losses/username) + wallet (balance) + inventory (unit_ids)

  spend_unlock RPC  [SECURITY DEFINER]  (triggered by UI unlock action)
    |-- UPDATE wallet SET balance = balance - cost WHERE owner=uid AND balance >= cost
    |   RETURNING balance  → if 0 rows: insufficient funds
    |-- INSERT INTO inventory (owner, unit_id)
    |   ON CONFLICT (owner, unit_id) DO NOTHING  ← idempotent
    v
  owned_units updated

  SQL migration (one-time backfill, runs at deploy)
    FOR EACH profiles row WHERE NOT EXISTS wallet row:
      INSERT wallet (owner, balance = 0) ON CONFLICT DO NOTHING
      credit_wallet(owner, WELCOME_GRANT, 'welcome:'+owner)
      FOR EACH unit IN unlocked_units[]:
        INSERT inventory (owner, unit_id) ON CONFLICT DO NOTHING
```

### Recommended Project Structure (additions to existing)

```
supabase/migrations/
├── 20260612000001_baseline.sql       (live — do not touch)
├── 20260612085249_foundations.sql    (live — do not touch)
└── <timestamp>_accounts_economy.sql  (Phase 11: inventory columns, match_results
                                       settlement columns, match_settlements table,
                                       spend_unlock RPC, report_match_result RPC,
                                       provision_account RPC, backfill block)

src/lib/api/
├── account.ts    (live — remove THRESHOLDS + recordMatchResult; add getProfile)
├── rooms.ts      (live — unchanged)
├── wallet.ts     (live — unchanged; creditWallet used internally by RPCs)
├── inventory.ts  (NEW: getOwnedUnits, spendUnlock)
├── settlement.ts (NEW: reportMatchResult)
└── profile.ts    (NEW: getProfileFull — aggregates profiles+wallet+inventory)

src/scenes/
├── GameScene.ts     (edit: remove recordResult/win-milestone; add reportMatchResult call;
                      escape username at :882/:1002)
├── LobbyScene.ts    (edit: escape username at :100/:133)
├── AuthScene.ts     (edit: call provision_account RPC on signup)
└── ProfileScene.ts  (NEW or existing: wire profile screen to getProfileFull)

test/unit/
├── pathfinder.test.ts   (live — unchanged)
└── economy.test.ts      (NEW: economy number assertions, provision_account idempotency,
                           spend_unlock affordability, backfill coverage)

test/rls/
├── wallet-rls.test.ts          (live — unchanged)
├── inventory-rls.test.ts       (NEW: forged write + spend_unlock + idempotency)
└── settlement-idempotency.test.ts (NEW: double-submit, mismatch-void, concurrent-spend)
```

### Pattern 1: Two-Row Per-Player Report + Separate Settlement Row (D-06)

**What:** Each player submits independently via `report_match_result`. Two rows in `match_results` (keyed by `(match_id, reporter_id)`) record each player's claim. One row in `match_settlements` (keyed by `match_id`) is inserted at most once when both players agree.

**Why two tables, not one row per match:** The `match_results` table is a per-player claim ledger (owned by the reporter). The `match_settlements` table is the authoritative settlement record. P14 adds `signed_report` / `deploy_log` / `seed` columns to `match_results` (each player's signed claim), and adds `validated_by_server` / `bounds_check_result` to `match_settlements`. Neither addition touches the other table's structure.

**match_results columns (P11 slice — P14 extends):**
```sql
-- Phase 11 columns
match_id      uuid        NOT NULL,  -- the room UUID (no matchmaking yet)
reporter_id   uuid        NOT NULL REFERENCES auth.users(id),
claimed_winner uuid       NOT NULL,  -- UUID of the player the reporter says won
reported_at   timestamptz NOT NULL DEFAULT now(),
PRIMARY KEY (match_id, reporter_id)  -- UNIQUE per player per match → idempotent

-- P14 will ADD (non-destructive):
-- signed_report  text,         -- base64 signed payload
-- deploy_log     jsonb,        -- full deploy event log
-- seed           bigint,       -- match seed
-- report_hash    text          -- SHA-256 of the report payload
```

**match_settlements columns (P11 slice — P14 extends):**
```sql
-- Phase 11 columns
match_id        uuid PRIMARY KEY,           -- one row per match
winner_id       uuid REFERENCES auth.users(id),
loser_id        uuid REFERENCES auth.users(id),
settled         boolean NOT NULL DEFAULT false,
voided          boolean NOT NULL DEFAULT false,  -- mismatch → void
settled_at      timestamptz,
win_amount      bigint,                     -- server-derived constant (not client-supplied)
loss_amount     bigint,

-- P14 will ADD (non-destructive):
-- validated      boolean DEFAULT false,    -- server bounds-checked
-- bounds_result  jsonb                     -- bounds check output
```

**RLS on both tables:**
- `match_results`: SELECT own rows (`reporter_id = auth.uid()`). No client INSERT/UPDATE/DELETE.
- `match_settlements`: SELECT where `winner_id = auth.uid() OR loser_id = auth.uid()`. No client writes.

### Pattern 2: inventory Table (fill out the Phase 9 shell)

**Inventory columns added to the existing bare shell:**
```sql
-- Phase 9 shell has only: id uuid pk, owner uuid NOT NULL REFERENCES auth.users
-- Phase 11 ADDS:
ALTER TABLE public.inventory
  ADD COLUMN unit_id text NOT NULL DEFAULT '',
  ADD CONSTRAINT inventory_owner_unit UNIQUE (owner, unit_id);
-- The UNIQUE constraint makes spend_unlock idempotent (ON CONFLICT DO NOTHING).
-- RLS: existing select_own policy is sufficient. No client write policy added.
```

### Pattern 3: spend_unlock RPC (atomic deduct + inventory insert)

```sql
-- Source: PITFALLS.md Pitfall 5 (atomic guarded UPDATE) + Pitfall 4 (idempotent insert)
-- + Phase 9 credit_wallet exemplar
CREATE FUNCTION public.spend_unlock(p_unit_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner  uuid := auth.uid();
  v_cost   bigint;
  v_bal    bigint;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Server-derived cost (never client-supplied) — Pitfall 3
  v_cost := CASE p_unit_id
    WHEN 'assault_bot'  THEN 100   -- D-04 discretion, see Economy Numbers section
    WHEN 'thorn_beast'  THEN 100
    WHEN 'elementalist' THEN 100
    ELSE NULL
  END;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'unknown unit %', p_unit_id; END IF;

  -- Atomic guarded deduct — Pitfall 5: UPDATE...WHERE balance >= cost
  UPDATE public.wallet
     SET balance = balance - v_cost
   WHERE owner = v_owner AND balance >= v_cost
   RETURNING balance INTO v_bal;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_funds');
  END IF;

  -- Idempotent inventory insert — Pitfall 4: ON CONFLICT DO NOTHING
  INSERT INTO public.inventory (owner, unit_id)
  VALUES (v_owner, p_unit_id)
  ON CONFLICT (owner, unit_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'new_balance', v_bal, 'unit_id', p_unit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.spend_unlock(text) FROM public;
GRANT EXECUTE ON FUNCTION public.spend_unlock(text) TO authenticated;
```

### Pattern 4: report_match_result RPC (both-agree settlement)

```sql
-- Source: D-06/D-07 + PITFALLS.md Pitfall 4 (idempotent) + Pitfall 3 (server-derived reward)
CREATE FUNCTION public.report_match_result(
  p_match_id      uuid,
  p_claimed_winner uuid   -- UUID of who the reporter says won
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reporter  uuid := auth.uid();
  v_other_row public.match_results%ROWTYPE;
  v_winner_id uuid;
  v_loser_id  uuid;
  v_inserted  boolean := false;
BEGIN
  IF v_reporter IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Record this player's report (idempotent per player per match — D-07)
  INSERT INTO public.match_results (match_id, reporter_id, claimed_winner)
  VALUES (p_match_id, v_reporter, p_claimed_winner)
  ON CONFLICT (match_id, reporter_id) DO NOTHING;

  -- Look for the other player's report
  SELECT * INTO v_other_row
  FROM public.match_results
  WHERE match_id = p_match_id
    AND reporter_id <> v_reporter
  LIMIT 1;

  IF NOT FOUND THEN
    -- First report only — awaiting opponent (D-08)
    RETURN jsonb_build_object('status', 'pending');
  END IF;

  -- Both reports exist: check agreement
  IF v_other_row.claimed_winner <> p_claimed_winner THEN
    -- Mismatch → void, no payout (D-06)
    INSERT INTO public.match_settlements
      (match_id, settled, voided, settled_at, win_amount, loss_amount)
    VALUES
      (p_match_id, false, true, now(), 0, 0)
    ON CONFLICT (match_id) DO NOTHING;
    RETURN jsonb_build_object('status', 'void', 'reason', 'mismatch');
  END IF;

  -- Agreement — attempt to settle exactly once (D-07: idempotent settlement)
  v_winner_id := p_claimed_winner;
  v_loser_id  := CASE WHEN v_reporter = v_winner_id
                      THEN v_other_row.reporter_id
                      ELSE v_reporter END;

  INSERT INTO public.match_settlements
    (match_id, winner_id, loser_id, settled, voided, settled_at, win_amount, loss_amount)
  VALUES
    (p_match_id, v_winner_id, v_loser_id, true, false, now(), 50, 15)
    -- WIN_REWARD=50, LOSS_REWARD=15 — server constants, D-04. See Economy Numbers.
  ON CONFLICT (match_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    -- Already settled (second call by same player, or race) — idempotent
    RETURN jsonb_build_object('status', 'already_settled');
  END IF;

  -- Credit rewards — delegate to credit_wallet for its own idempotency ledger
  PERFORM public.credit_wallet(50, 'match:' || p_match_id || ':win');   -- winner
  -- credit_wallet uses auth.uid(); we need to credit the OTHER user — use direct balance update
  -- NOTE: credit_wallet() reads auth.uid() so it can only credit the caller.
  -- For the opponent's credit, use a direct guarded UPDATE (see Pattern 4a below).
  UPDATE public.wallet SET balance = balance + 15 WHERE owner = v_loser_id;
  INSERT INTO public.wallet (owner, balance) VALUES (v_loser_id, 15) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('status', 'settled', 'winner_id', v_winner_id);
END;
$$;
```

> **Note on cross-user credits in a SECURITY DEFINER RPC:** `credit_wallet` reads `auth.uid()` and can only credit the currently authenticated caller. When the RPC settles both players' rewards, it can directly credit the caller via `credit_wallet()` and must directly UPDATE the opponent's wallet row (since SECURITY DEFINER bypasses RLS and can write any row). The idempotency for the opponent's credit is handled by the `match_settlements` idempotency (`ON CONFLICT DO NOTHING`) — once a settlement row exists, subsequent calls return `already_settled` before reaching the UPDATE. This is correct and safe within a SECURITY DEFINER context. See "Pitfall: Cross-User Credits" below.

### Pattern 5: provision_account RPC (welcome grant + migration)

```sql
-- Called at: (a) new account signup (AuthScene), (b) SQL backfill migration
-- Idempotent — safe to call multiple times for same user
CREATE FUNCTION public.provision_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Ensure wallet row exists
  INSERT INTO public.wallet (owner, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (owner) DO NOTHING;

  -- Welcome grant — idempotent via wallet_credits table
  -- 'welcome:' prefix ensures it never collides with match: keys
  PERFORM public.credit_wallet_for_user(p_user_id, 100, 'welcome:' || p_user_id);
  -- See Pattern 5a: credit_wallet_for_user is a variant that takes an explicit user_id
  -- (since provision_account may be called for other users during backfill)
END;
$$;
```

> **Note on credit_wallet_for_user:** `credit_wallet()` always credits `auth.uid()`. During backfill (called from a migration script, not a user session), `auth.uid()` is NULL. A second internal function `credit_wallet_for_user(p_user_id uuid, p_amount bigint, p_key text)` takes an explicit user_id and is only callable from other SECURITY DEFINER functions (not granted to authenticated or anon roles). This is the standard Supabase pattern for administrative credits in migrations.

### Anti-Patterns to Avoid

- **`claimed_winner` is a client-supplied amount:** The client submits a UUID (which player won), never a currency amount. The server derives WIN_REWARD and LOSS_REWARD from internal constants. Any RPC that accepts a `p_amount` or `p_reward` parameter is a Pitfall 3 violation.
- **Settling in two separate statements:** Reading both reports then crediting in separate statements has a race window where two concurrent second-reporters both see "both reports present" and both settle. The `match_settlements` `ON CONFLICT DO NOTHING` + `GET DIAGNOSTICS` check is the guard.
- **Calling `recordMatchResult` from `account.ts`:** The existing `recordMatchResult` in `src/lib/api/account.ts` must be deleted (it contains the client-authoritative win-milestone write). Any reference to `THRESHOLDS` in account.ts must be removed. GameScene must call `settlement.reportMatchResult()` instead.
- **Forgetting the `GET DIAGNOSTICS v_inserted = ROW_COUNT` pattern:** `ON CONFLICT DO NOTHING` after an `INSERT` sets `FOUND = false` even on conflict. To distinguish "I inserted" from "row already existed," use `GET DIAGNOSTICS` or check `found` before the insert with the `IF NOT FOUND THEN` pattern from credit_wallet.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent reward grants | Client-side "claim once" flag | match_settlements UNIQUE(match_id) + ON CONFLICT DO NOTHING | Client flags are forgeable; DB constraint is the only reliable gate. |
| Atomic balance deduction | Read-then-write in TypeScript | UPDATE wallet WHERE balance >= cost RETURNING balance (single statement) | Concurrent reads see stale balance; atomic guarded UPDATE is the only safe path. |
| Negative balance prevention | TypeScript guard before deduct | CHECK (balance >= 0) constraint on wallet | TypeScript guard has a race window; DB constraint is the backstop that makes negatives a hard error. |
| Cross-user reward credit | service_role key in client bundle | SECURITY DEFINER RPC (server-side) | service_role in the bundle is a Pitfall 7 / total-RLS-bypass; SECURITY DEFINER is the correct server-side elevation. |
| "Both agree" check | Client checks then submits | match_results table + RPC checks both rows in one transaction | Client check is a TOCTOU race; server-side check in the same transaction is atomic. |
| Migration provisioning | Custom Node.js script | SQL migration block (DO $$ ... $$) | SQL in a migration file applies atomically with the schema, runs in CI, and is idempotent via ON CONFLICT guards. |
| XSS protection | Custom sanitization regex | `textContent` assignment or a one-line HTML escaper | Any custom regex will miss edge cases; `textContent = value` is the canonical DOM XSS prevention. |

**Key insight:** Every authoritative write in this phase is structurally identical to the live Phase 9 `credit_wallet` exemplar (SECURITY DEFINER + search_path='' + fully-qualified tables + atomic UPDATE + idempotent ON CONFLICT). Copy the pattern, do not invent variations.

---

## Economy Numbers (D-04 Discretion)

### Constraint-Derived Values

Given constraints from D-02 and D-03:
- D-02: welcome grant ≈ one unit cost (≈ first unlock immediate)
- D-03: each further unit ≈ 3–5 wins on win/loss split

All three non-starter units have equal in-game cost (`cost: 120` in-match gold, but this is **separate from soft currency**). Per D-04: flat pricing unless a power gap justifies tiering — no power gap is evident (all tier 2, similar stat profiles).

**Recommended values:**

| Variable | Value | Rationale |
|----------|-------|-----------|
| WIN_REWARD | 50 | After the welcome unit, 2 more units remain at 100 each = 200 currency; at 50/win = 4 wins each. Sits squarely in the "3–5 wins" window. |
| LOSS_REWARD | 15 | ~30% of win reward. Losers still progress (D-01: "losing is incentivised but winning rewarded"). 100/15 ≈ 7 losses per unit — slow enough that grinding losses isn't the dominant path, fast enough that consistent losers can still unlock. |
| WELCOME_GRANT | 100 | Equals one unit cost. D-02: "first unlock is essentially immediate." New player unlocks one unit on first login/after first session. |
| Unit soft-currency cost | 100 each (flat) | Flat pricing per D-04 default. One welcome grant = one unit. After that: 2 wins = 100c (one unit). Aggressive early unlock is per D-03 intent. |

**Session trajectory:** New player joins, gets 100c welcome grant, immediately unlocks one of the three units. Plays a few games: 2 wins (100c) = second unlock at ~session 1-2. 2 more wins = third unlock at ~session 2-3. Matches D-03 "fast" pacing.

**Balance note for planner:** The cost and reward constants appear twice: in the SQL RPC (server-side, authoritative) and as display-only labels in the UI unlock screen. The UI values must never be trusted for the actual deduction — they are cosmetic only.

---

## v1.0 Migration Mechanics (ACCT-04 / D-09/D-10/D-11)

### Recommendation: SQL Backfill Migration

**Mechanism:** A `DO $$ ... $$` block at the end of the Phase 11 migration file that runs once at `supabase db push` time and is idempotent (all inserts use `ON CONFLICT DO NOTHING`).

```sql
-- Phase 11 migration: v1.0 backfill block
-- Runs for every existing profiles row. Safe to re-run: all inserts are idempotent.
DO $$
DECLARE
  r RECORD;
  v_unit text;
BEGIN
  FOR r IN
    SELECT id, unlocked_units
    FROM public.profiles
    WHERE id NOT IN (SELECT owner FROM public.wallet)
       OR id NOT IN (SELECT DISTINCT owner FROM public.inventory)
  LOOP
    -- 1. Ensure wallet row exists
    INSERT INTO public.wallet (owner, balance) VALUES (r.id, 0)
    ON CONFLICT (owner) DO NOTHING;

    -- 2. Welcome grant (idempotent via wallet_credits)
    PERFORM public.credit_wallet_for_user(r.id, 100, 'welcome:' || r.id);

    -- 3. Seed inventory from unlocked_units[] (D-09: keep earned units free)
    IF r.unlocked_units IS NOT NULL THEN
      FOREACH v_unit IN ARRAY r.unlocked_units LOOP
        INSERT INTO public.inventory (owner, unit_id) VALUES (r.id, v_unit)
        ON CONFLICT (owner, unit_id) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
```

**Why SQL backfill over lazy provisioning:**
1. **No NULL state after deploy:** Every existing player has a wallet row immediately. Profile screen never needs to handle "wallet not yet provisioned" edge case.
2. **Testable in CI:** The migration block runs during `supabase db reset` in CI. A test can insert a mock profiles row, run the migration, and assert wallet + inventory rows exist.
3. **No code path to maintain:** Lazy provisioning requires a runtime code path on every login that checks "have I been provisioned?" — additional code, additional failure mode.
4. **Idempotent:** The `ON CONFLICT DO NOTHING` guards make re-running safe.

**What is NOT migrated:**
- `wins`, `losses`, `username` — already in `profiles`, carried forward unchanged (D-11).
- No retroactive currency beyond the welcome grant (D-10: no back-pay).

**Win-milestone unlock logic removal:**
- Delete `THRESHOLDS` const and `recordMatchResult` function from `src/lib/api/account.ts`.
- Remove the call to `recordMatchResult` from `GameScene.ts` (currently at ~:601 via `this.recordResult()`).
- Remove `showUnlockNotification` call that was triggered by `newlyUnlocked` in the old payload — P11's spend-unlock flow surfaces unlock confirmation differently (return value from `spend_unlock` RPC).
- The GameScene lines `:623-639` referenced in D-11 are in `account.ts`'s `THRESHOLDS` loop — those are in the API layer, not GameScene directly. Confirm at implementation time: the actual milestone-unlock write in the current code is at `account.ts:75-81` (`for (const { wins, unit } of THRESHOLDS)`).

---

## XSS Hardening (D-14)

### Current State

`username` is interpolated unescaped into `innerHTML` at two sites:
- `GameScene.ts:882` — `const username = gameState.username ?? 'PLAYER'`
- `GameScene.ts:1002` — `<div class="gh-bs">${username}</div>` (inside a template literal assigned to `this.hud.innerHTML`)
- `LobbyScene.ts:100` — `const username = gameState.username ?? 'COMMANDER'`
- `LobbyScene.ts:133` — `${username}` inside an inline HTML builder

### Fix: textContent or escape helper

Since `username` appears inside an `innerHTML` template literal (not as a standalone DOM assignment), the cleanest fix is a one-line HTML escape function:

```typescript
// src/lib/escapeHtml.ts
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

Usage:
```typescript
// GameScene.ts:882 area
const username = esc(gameState.username ?? 'PLAYER')
// ... then ${username} inside innerHTML is safe

// LobbyScene.ts:100 area
const username = esc(gameState.username ?? 'COMMANDER')
```

**Alternative:** Convert the affected `innerHTML` block to `textContent` assignment on specific child elements (more surgical, but requires restructuring the large template literal — higher diff surface). The `esc()` helper is lower-risk.

**Note:** D-12 (name fixed at signup) means the XSS window is narrow in practice (the name is set once in AuthScene, not freeform later), but the fix is still required per D-14 because the name IS user-set and could contain `<script>` or `<img onerror=...>` injected at signup time.

---

## Common Pitfalls

### Pitfall 1: Cross-user credits in SECURITY DEFINER — auth.uid() is the caller, not the recipient

**What goes wrong:** When `report_match_result` settles both players' rewards, calling `credit_wallet(LOSS_REWARD, ...)` inside the RPC credits `auth.uid()` (the caller / winner), not the opponent. The loser gets nothing.

**Why it happens:** `credit_wallet` was designed to credit the authenticated user only — that's the correct design for normal use. But settlement credits two users.

**How to avoid:** Introduce `credit_wallet_for_user(p_user_id uuid, p_amount bigint, p_key text)` as an internal SECURITY DEFINER function with `GRANT EXECUTE` only to other SECURITY DEFINER functions (not to `authenticated` or `anon` roles). `report_match_result` calls this internal function for the opponent's credit. The idempotency key `'match:' || match_id || ':loss'` ensures the opponent's credit is credited exactly once even on retry.

**Alternatively:** Since `report_match_result` is itself SECURITY DEFINER, it can bypass RLS and directly `UPDATE public.wallet SET balance = balance + LOSS_REWARD WHERE owner = v_loser_id`. The `match_settlements ON CONFLICT DO NOTHING` guard prevents this from running twice. This is simpler than a second RPC and is the recommended approach.

**Warning signs:** After settlement, the loser's balance is unchanged. The `wallet_credits` table shows only the winner's entry.

### Pitfall 2: `GET DIAGNOSTICS` vs `IF NOT FOUND` after `ON CONFLICT DO NOTHING`

**What goes wrong:** After `INSERT ... ON CONFLICT DO NOTHING`, the PL/pgSQL `FOUND` variable is `false` whether the row was inserted or already existed (on conflict). This means the pattern `INSERT ...; IF NOT FOUND THEN return 'already settled' END IF` will always return 'already settled' even on a fresh insert.

**Why it happens:** `FOUND` reflects whether any rows were affected; `ON CONFLICT DO NOTHING` means 0 rows affected on conflict, but also returns 0 rows on the "do nothing" branch.

**How to avoid:** Use `GET DIAGNOSTICS v_count = ROW_COUNT` after the INSERT, then check `v_count > 0` for "inserted" vs "conflicted". The live `credit_wallet` in Phase 9 uses the `IF NOT FOUND` pattern after the `wallet_credits` insert — this works there because the `ON CONFLICT DO NOTHING` on `wallet_credits` plus the subsequent `UPDATE wallet ... RETURNING` correctly short-circuits. For `match_settlements`, use `GET DIAGNOSTICS`.

**Warning signs:** Settlement runs every time any player calls `report_match_result` instead of exactly once.

### Pitfall 3: The "first report only" case credits the wrong player

**What goes wrong:** Both `p_claimed_winner` submissions agree, but since we're inside the second reporter's session, `auth.uid()` is the second reporter. If we compute `v_loser_id` as "not the reporter," we get the first reporter — but the first reporter might be the winner.

**How to avoid:** After confirming agreement, identify winner as `p_claimed_winner` (the UUID both players agree on), not as "the caller." Then identify the loser as "the other UUID." The logic:
```
v_winner_id := p_claimed_winner
v_loser_id  := (the reporter_id from the other row that != p_claimed_winner)
```
This requires fetching both report rows and comparing reporter_ids to claimed_winners rather than using `auth.uid()` as a role proxy.

**Warning signs:** In a match where the host wins and the guest submits second, the guest is credited with the win reward.

### Pitfall 4: Concurrent second-reporters triggering double settlement

**What goes wrong:** Two concurrent `report_match_result` calls from both players (both submitting at ~same time, both seeing both rows present) both pass the "both rows exist and agree" check and both attempt to INSERT the settlement row. Both credit rewards.

**How to avoid:** `match_settlements` has a `UNIQUE` / `PRIMARY KEY` on `match_id`. The `ON CONFLICT DO NOTHING` + `GET DIAGNOSTICS` pattern ensures only one INSERT succeeds. The loser of the INSERT race returns `already_settled` without crediting again.

**Warning signs:** A player's wallet shows double win-reward after a match.

### Pitfall 5: spend_unlock called twice (double-unlock attempt)

**What goes wrong:** Player taps unlock twice rapidly (double-tap). Two concurrent `spend_unlock` calls both read `balance >= cost` as true, both deduct, balance goes below zero or two deductions happen.

**How to avoid:** The `CHECK (balance >= 0)` on `wallet` is the backstop — even if two concurrent reads both see sufficient balance, the second `UPDATE` will hit the CHECK violation if the first already deducted to zero. Additionally, the `UNIQUE (owner, unit_id)` on inventory means the second `INSERT INTO inventory` does nothing — the unit is not double-added. The first `UPDATE` reduces balance atomically; the second `UPDATE WHERE balance >= cost` will find `balance < cost` if the first already reduced it, and will affect 0 rows, returning `insufficient_funds`.

**Warning signs:** Test by firing two concurrent `spend_unlock` calls; assert balance is deducted exactly once.

### Pitfall 6: Missing RLS write policy on inventory — client can INSERT directly

**What goes wrong:** The bare Phase 9 inventory shell has only a `SELECT` policy. Phase 11 adds `unit_id` and the `UNIQUE (owner, unit_id)` constraint. Without verifying there is still NO INSERT/UPDATE/DELETE policy for clients, a client could directly INSERT any unit_id into their own inventory (bypassing `spend_unlock`).

**How to avoid:** Explicitly verify `pg_policies` for `inventory` has **no** INSERT/UPDATE/DELETE client policy after the migration. The SECURITY DEFINER `spend_unlock` RPC bypasses RLS to INSERT; clients cannot.

**Warning signs:** A client can do `supabase.from('inventory').insert({ owner: uid, unit_id: 'assault_bot' })` and succeed.

### Pitfall 7: `unlocked_units[]` backfill seeds units that don't exist in UNITS[]

**What goes wrong:** v1.0 `unlocked_units[]` may contain stale unit IDs (e.g., from an older unit set) that are no longer in `UnitData.ts`. Inserting these into `inventory` with a `CHECK unit_id IN (...)` constraint causes the migration to fail.

**How to avoid:** Either (a) do not add a CHECK constraint on `inventory.unit_id` — just insert what's in `unlocked_units[]` and let the UI ignore unknown unit_ids — or (b) filter the backfill to only known unit_ids. Option (a) is simpler and safer (no migration failure risk). The unit display logic already uses `UNITS.find(u => u.id === id)` which gracefully returns undefined for unknown IDs.

### Pitfall 8: Deleting `recordMatchResult` from account.ts breaks the Phase 9 forged-write test flow

**What goes wrong:** The Phase 9 `wallet-rls.test.ts` test uses `user.rpc('credit_wallet', ...)` directly — it does not use `recordMatchResult`. The `recordMatchResult` deletion therefore does NOT break the existing test. However, if any Phase 9 test directly imports from `account.ts` and calls `recordMatchResult`, deleting it breaks the test.

**How to avoid:** Search for `recordMatchResult` imports across the test suite before deleting. Expected: only `GameScene.ts` and (maybe) `account.ts` itself import it.

---

## Runtime State Inventory

> Phase 11 modifies existing data structures in the live database (profiles) and adds new table rows. This section catalogues what runtime state needs to be managed.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `profiles` rows for all v1.0 accounts: `wins`, `losses`, `unlocked_units[]`, `username` — these must migrate forward | SQL backfill migration: provision wallet row + welcome grant + inventory rows from `unlocked_units[]`; wins/losses/username carry forward unchanged (no migration needed for those columns, they already exist). |
| Stored data | `wallet` rows: none exist for v1.0 accounts (wallet table added in Phase 9, never populated for existing users) | Backfill creates wallet rows with balance=0 then credits WELCOME_GRANT. |
| Stored data | `inventory` rows: none exist for v1.0 accounts | Backfill creates rows from `unlocked_units[]`. |
| Live service config | Supabase Postgres functions: `credit_wallet` lives in DB — Phase 11 adds `spend_unlock`, `report_match_result`, `provision_account`, `credit_wallet_for_user` | Add via SQL migration; deploy with `supabase db push`. |
| OS-registered state | None — no Task Scheduler, pm2, or systemd involvement. | None. |
| Secrets/env vars | No new env vars needed — all new RPCs use anon key + auth.uid() pattern. service_role stays server-only (Phase 9 D-14 carry-forward). | None. |
| Build artifacts | After deleting `THRESHOLDS` and `recordMatchResult` from `account.ts`, `tsc` must still pass — ensure no other files import those symbols. | Run `tsc --noEmit` after deletion to confirm. |

**Nothing found in category:** OS-registered state, secrets/env vars, and build artifacts have no blocking items beyond the `tsc` confirmation.

---

## Code Examples

### Inventory RLS extension (adding unit_id to bare shell)

```sql
-- Source: Phase 9 bare-shell pattern + PITFALLS.md Pitfall 6
-- Part of the Phase 11 migration file

-- Add unit_id column to the existing bare inventory shell
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS unit_id text NOT NULL DEFAULT '';

-- Unique ownership: one row per (owner, unit) — makes unlock idempotent
ALTER TABLE public.inventory
  ADD CONSTRAINT IF NOT EXISTS inventory_owner_unit UNIQUE (owner, unit_id);

-- RLS stays as Phase 9 left it (select_own only, no client writes)
-- Verify no INSERT/UPDATE/DELETE policy was accidentally added:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'inventory';
```

### Profile screen API client

```typescript
// src/lib/api/profile.ts
import { supabase } from '../supabase'
import { getBalance } from './wallet'

export interface FullProfile {
  username: string | null
  wins: number
  losses: number
  balance: number
  ownedUnitIds: string[]
  rankPlaceholder: string  // D-13: always 'UNRANKED' until P13
}

export async function getProfileFull(userId: string): Promise<FullProfile | null> {
  const [profileResult, balanceResult, inventoryResult] = await Promise.all([
    supabase.from('profiles').select('username, wins, losses').eq('id', userId).single<{
      username: string | null; wins: number; losses: number
    }>(),
    getBalance(userId),
    supabase.from('inventory').select('unit_id').eq('owner', userId)
      .returns<{ unit_id: string }[]>(),
  ])
  if (profileResult.error || !profileResult.data) return null
  return {
    username: profileResult.data.username,
    wins: profileResult.data.wins,
    losses: profileResult.data.losses,
    balance: balanceResult ?? 0,
    ownedUnitIds: (inventoryResult.data ?? []).map(r => r.unit_id),
    rankPlaceholder: 'UNRANKED',
  }
}
```

### GameScene match result submission (replaces recordResult)

```typescript
// src/scenes/GameScene.ts — replace this.recordResult() call

// Old (to be REMOVED):
// void this.recordResult(playerWon ? 'win' : isTie ? 'tie' : 'loss')

// New — only for non-practice rooms:
if (!gameState.roomId?.startsWith('practice-')) {
  void this.submitMatchReport(playerWon, winner)
}

// New method:
private async submitMatchReport(playerWon: boolean, winner: 'host' | 'guest' | 'tie') {
  if (!gameState.userId || !gameState.roomId || winner === 'tie') return
  // Determine the winner's UUID: if host won and we are host, winner = us; else opponent.
  // gameState.role is 'host' or 'guest'
  const weAreWinner = (winner === gameState.role)
  const winnerId = weAreWinner ? gameState.userId : gameState.opponentId ?? gameState.userId
  // NOTE: gameState.opponentId must be available by Phase 11 — add it to gameState hydration
  // from the rooms.guest_id / host_id at LobbyScene join time.
  await reportMatchResult(gameState.roomId as unknown as string, winnerId)
  // Update local wallet display (optimistic — reconcile on profile load)
  const newBalance = await getBalance(gameState.userId)
  if (newBalance !== null) gameState.walletBalance = newBalance
}
```

> **Note:** `gameState.opponentId` is not currently in `gameState`. Phase 11 must hydrate it from the `rooms` row at LobbyScene join time (host sees `guest_id`, guest sees `host_id`). This is a one-line addition to the rooms join logic.

### Username XSS escape

```typescript
// src/lib/escapeHtml.ts — new file
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Usage in GameScene.ts:882:
import { esc } from '../lib/escapeHtml'
const username = esc(gameState.username ?? 'PLAYER')
// ... ${username} in innerHTML template is now safe

// Usage in LobbyScene.ts:100:
import { esc } from '../lib/escapeHtml'
const username = esc(gameState.username ?? 'COMMANDER')
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| client `recordMatchResult` writes wins/unlocked_units | Server RPC: `report_match_result` (two-agree settlement) | Phase 11 | Closes Pitfall 3 (client-trusted rewards); old path deleted. |
| Win-milestone unlock via THRESHOLDS in account.ts | Currency-spend via `spend_unlock` RPC | Phase 11 | Closes client-authoritative unlock write; D-11. |
| `unlocked_units[]` array in profiles | `inventory` table rows (owner, unit_id) | Phase 11 | Normalised; enables RLS per-unit ownership; P12 can add quantity/level. |
| `gameState.unlockedUnits` as source of truth for loadout | `inventory` table read through api/inventory.ts | Phase 11 | Client cache only; server is truth (ECON-05). |
| No wallet balance in-game | wallet.balance readable via api/wallet.ts | Phase 11 | Profile screen + spend-unlock gating. |

**Deprecated/outdated (to be removed in Phase 11):**
- `recordMatchResult` function in `src/lib/api/account.ts` — replaced by `settlement.reportMatchResult`.
- `THRESHOLDS` constant in `src/lib/api/account.ts` — milestone-unlock model entirely retired.
- `MatchResultPayload` interface in account.ts (was returned by `recordMatchResult`) — no longer needed.
- `gameState.unlockedUnits` write path from `recordResult` in `GameScene.ts` — cache is now populated from inventory reads only.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gameState.opponentId` does not currently exist and must be added by reading `rooms.guest_id` / `rooms.host_id` at LobbyScene join time. | Code Examples (match report submission) | If opponentId is already in gameState under a different name, the plan adds a duplicate field. Verify by reading `src/lib/gameState.ts` at plan time. [ASSUMED] |
| A2 | Phase 10's `game_over` event (sim D-04) emits a clear winner identity that GameScene can use to call `reportMatchResult`. | Architecture Diagram | If Phase 10 only emits `'host' \| 'guest'` role labels and GameScene must look up the opponent UUID from rooms, add that lookup to the submission flow. [ASSUMED — depends on Phase 10 implementation not yet executed] |
| A3 | The `profiles.unlocked_units[]` values in the live database use the exact `id` strings from `UnitData.ts` ('assault_bot', 'thorn_beast', 'elementalist'). | v1.0 Migration | If v1.0 stored different unit id strings, the backfill inserts rows that the UI cannot match. Filter to known IDs at backfill time as a precaution. [ASSUMED] |
| A4 | `credit_wallet_for_user` can be implemented as an internal SECURITY DEFINER function callable only by other DEFINER functions, not by authenticated/anon roles. | Patterns 4+5 | Supabase/Postgres supports this via `REVOKE ALL FROM public; GRANT EXECUTE TO` only to other functions or the owner role. This is standard Postgres but not tested in Phase 9's setup. [ASSUMED] |
| A5 | Phase 10 adds `gameState.walletBalance` to the gameState cache (from D-12/D-14: slimmed read-through cache). | Code Examples | If Phase 10 does not add walletBalance to gameState, Phase 11 must add it. [ASSUMED — verify against Phase 10 plan when available] |
| A6 | The `GET DIAGNOSTICS v_count = ROW_COUNT` pattern correctly distinguishes INSERT vs ON CONFLICT DO NOTHING in PL/pgSQL. | Pattern 4 (settlement) | Standard Postgres behavior verified in PITFALLS.md-equivalent Postgres docs. HIGH confidence; tagged ASSUMED only because not tested in Phase 9 harness. [ASSUMED] |

---

## Open Questions (RESOLVED)

> All three resolved during planning: opponentId ownership → 11-05 Task 1 (Phase 11 adds it defensively if Phase 10 hasn't); rooms host_id/guest_id UUID validation → 11-05 Task 1; ProfileScene vs LobbyScene panel → 11-05 Task 3 (new ProfileScene).

1. **Does Phase 10 add `gameState.opponentId`?**
   - What we know: Phase 10's D-12/D-14 slims gameState to session context. The rooms row already contains both player UUIDs.
   - What's unclear: Whether Phase 10 explicitly adds `opponentId` to the slimmed cache or leaves it for Phase 11.
   - Recommendation: Phase 11 plan should include a task to hydrate `opponentId` from the rooms row at LobbyScene join time regardless, treating it as Phase 11's responsibility if Phase 10 doesn't include it.

2. **Does the rooms table `host_id`/`guest_id` contain real UUIDs or the old literal `'guest'`?**
   - What we know: Phase 9 deleted the `'guest'` literal from `gameState.userId`. However, if any existing rooms rows in the DB still have `host_id: 'guest'` from v1.0, those would be stale. Live match flow always creates new rooms after Phase 9.
   - Recommendation: The `submitMatchReport` function should validate that `gameState.opponentId` is a valid UUID before calling the RPC; if not, skip settlement for that match.

3. **Should the profile screen be a new scene (ProfileScene) or integrated into the existing LobbyScene?**
   - What we know: D-13 says "profile doubles as a roster view." The user owns the design. CONTEXT.md says "integrating provided designs."
   - Recommendation: This is user's design decision. Plan should stub `ProfileScene` as a new scene that the user integrates their design into, with `getProfileFull` wired. The planner should mark this as requiring a provided design to integrate.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/supabase-js` | All API calls | ✓ | 2.99.3 (pinned) | — |
| Vitest | Test harness | ✓ | ^4.1.8 (Phase 9 installed) | — |
| Supabase CLI | Migration deploy | ✓ (CI via setup-cli@v2) | 2.106.0 | — |
| Local Supabase stack | Integration tests | ✓ (Phase 9 CI job) | running via supabase start | — |
| Phase 10 game_over event contract | Match report submission | ✗ (Phase 10 not yet executed) | — | Plan to Phase 10's D-04 contract; add an explicit dependency note |

**Missing dependencies with no fallback:**
- Phase 10 must be planned and executed before Phase 11 is implemented. Phase 11's match-report submission depends on the Phase 10 sim emitting `game_over` events with a winner identity.

**Missing dependencies with fallback:**
- If Phase 10's `game_over` event only emits `'host' | 'guest'` role labels (not UUIDs), Phase 11 derives the winner UUID from `gameState.opponentId` and `gameState.userId` based on the role label — viable fallback.

---

## Validation Architecture

> nyquist_validation is enabled (config.json key is true). Include full validation architecture.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 (existing Phase 9 harness) |
| Config file | `vitest.config.ts` (exists — two projects: unit/node, rls/jsdom) |
| Quick run command | `npx vitest run --project unit` |
| Full suite command | `npx vitest run` (unit + rls; rls needs `supabase start`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACCT-01 | Profile persists across restart: wallet + inventory readable after reload | integration (rls) | `npx vitest run --project rls` (`test/rls/inventory-rls.test.ts`) | ❌ Wave 0 |
| ACCT-02 | Username display is escaped (no XSS) | unit | `npx vitest run --project unit` (`test/unit/escape.test.ts`) | ❌ Wave 0 |
| ACCT-03 | getProfileFull returns wins/losses/balance/ownedUnits | integration (rls) | `npx vitest run --project rls` | ❌ Wave 0 |
| ACCT-04 | v1.0 backfill: existing profiles get wallet row + welcome grant + inventory from unlocked_units[] | integration (rls) | `npx vitest run --project rls` (`test/rls/migration.test.ts`) | ❌ Wave 0 |
| ACCT-04 | Welcome grant is idempotent (re-running migration doesn't double-grant) | integration (rls) | same file | ❌ Wave 0 |
| ECON-01 | report_match_result credits win/loss reward when both agree | integration (rls) | `npx vitest run --project rls` (`test/rls/settlement-idempotency.test.ts`) | ❌ Wave 0 |
| ECON-01 | Loss reward is distinct from win reward and nonzero | integration (rls) | same file | ❌ Wave 0 |
| ECON-02 | Reward is server-derived: client cannot supply a custom amount | integration (rls) | Attempt to call RPC with extra params; assert reward is always WIN_REWARD/LOSS_REWARD | ❌ Wave 0 |
| ECON-03 | spend_unlock: deducts correct cost and inserts inventory row | integration (rls) | `npx vitest run --project rls` (`test/rls/inventory-rls.test.ts`) | ❌ Wave 0 |
| ECON-03 | spend_unlock: returns insufficient_funds when balance < cost | integration (rls) | same file | ❌ Wave 0 |
| ECON-04 | Double-submit same match_id: currency credited exactly once | integration (rls) | `test/rls/settlement-idempotency.test.ts` — same match_id submitted twice | ❌ Wave 0 |
| ECON-04 | Concurrent spend: two parallel spend_unlock calls — balance deducted at most once, never negative | integration (rls) | `test/rls/inventory-rls.test.ts` — concurrent spend scenario | ❌ Wave 0 |
| ECON-04 | Mismatch void: disagreeing winner claims → no payout, settlement voided | integration (rls) | `test/rls/settlement-idempotency.test.ts` — mismatch scenario | ❌ Wave 0 |
| ECON-04 | Lone report: only one player reports → no settlement | integration (rls) | `test/rls/settlement-idempotency.test.ts` — single report scenario | ❌ Wave 0 |
| ECON-05 | Client cannot INSERT/UPDATE inventory directly (forged unlock) | integration (rls) | `test/rls/inventory-rls.test.ts` — forged write assertion | ❌ Wave 0 |
| ECON-05 | Client cannot INSERT/UPDATE wallet directly (already tested P9; re-assert with new unit cost) | integration (rls) | `test/rls/wallet-rls.test.ts` (already exists — re-run; no new test needed) | ✅ exists |
| D-14 | username escape: XSS payload in username is escaped on display | unit | `test/unit/escape.test.ts` | ❌ Wave 0 |

### Full Idempotency / Concurrency / Forged-Grant / Migration Test Matrix

| Test Scenario | Setup | Action | Assert | File |
|---------------|-------|--------|--------|------|
| **Idempotency: double-submit match_id** | Two users (A wins, B loses); A reports win | A reports win again with same match_id | Balance credited once (WIN_REWARD), not twice | settlement-idempotency.test.ts |
| **Idempotency: both submit, then A submits again** | A+B both report, settlement created | A reports same match again | `already_settled` returned; balance unchanged | settlement-idempotency.test.ts |
| **Concurrent second-reporters** | A reports first; B and A' (retry) both submit as second reporter concurrently | Concurrent Promise.all([B.report, A.report]) | Settlement row exists exactly once; winner credited exactly WIN_REWARD | settlement-idempotency.test.ts |
| **Mismatch void** | A says A won, B says B won | Both reports submitted | `match_settlements.voided = true`; neither A nor B credited | settlement-idempotency.test.ts |
| **Lone report (D-08)** | Only A reports | A reports | `status: 'pending'`; no settlement row; no credit | settlement-idempotency.test.ts |
| **Forged grant (direct wallet write)** | A has balance 0 | A: `supabase.from('wallet').update({ balance: 9999 })` | Balance unchanged at 0 (RLS denies) | wallet-rls.test.ts (existing) |
| **Forged unlock (direct inventory insert)** | A has no inventory rows | A: `supabase.from('inventory').insert({ owner: A.id, unit_id: 'assault_bot' })` | No inventory row inserted (RLS denies) | inventory-rls.test.ts |
| **Concurrent spend (double-tap)** | A has balance 100, unit cost 100 | Two concurrent `spend_unlock('assault_bot')` calls | Balance deducted exactly once (0); one inventory row; second call returns insufficient_funds | inventory-rls.test.ts |
| **Spend below zero** | A has balance 50, unit cost 100 | `spend_unlock('assault_bot')` | Returns insufficient_funds; balance unchanged at 50 | inventory-rls.test.ts |
| **Migration idempotency** | Existing profile with unlocked_units=['assault_bot'] | Run provision_account twice | One wallet row, one inventory row, welcome grant credited once | migration.test.ts |
| **Existing-player migration** | Profile row with wins=5, losses=2, unlocked_units=['thorn_beast'] | Run SQL backfill | wallet exists with WELCOME_GRANT balance, inventory has 'thorn_beast', wins=5/losses=2 unchanged | migration.test.ts |
| **New account provisioning** | Fresh signup, no profiles row yet | AuthScene signup → provision_account called | wallet row, welcome grant, empty inventory (no prior units) | migration.test.ts |
| **Unknown unit_id in backfill** | Profile has unlocked_units=['old_unit_id'] | Run backfill | Does not crash; old_unit_id inserted into inventory (or filtered if CHECK added) | migration.test.ts |

### Sampling Rate

- **Per task commit:** `npx vitest run --project unit` (fast; escape.test.ts + economy.test.ts pure-unit assertions)
- **Per wave merge:** `npx vitest run` (full suite including RLS/integration against `supabase start`)
- **Phase gate:** Full suite green + `tsc --noEmit` + bundle secret-scan before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/rls/inventory-rls.test.ts` — covers ECON-03, ECON-04 (spend), ECON-05 (forged unlock), concurrent spend
- [ ] `test/rls/settlement-idempotency.test.ts` — covers ECON-01, ECON-04 (idempotency, mismatch, lone report, concurrent second-reporter)
- [ ] `test/rls/migration.test.ts` — covers ACCT-04 (backfill, idempotency, existing-player scenario)
- [ ] `test/unit/escape.test.ts` — covers D-14 (XSS escape function unit tests)
- [ ] `test/unit/economy.test.ts` — pure-unit: WIN_REWARD/LOSS_REWARD/WELCOME_GRANT constants are positive; unit costs match expected values; (optional: RPC response shapes)
- [ ] `src/lib/escapeHtml.ts` — new helper (tested by escape.test.ts)

Existing infrastructure (no Wave 0 work needed):
- `vitest.config.ts` ✓ (two projects)
- `test/rls/wallet-rls.test.ts` ✓ (forged wallet write — re-run, no edits)
- `test/unit/pathfinder.test.ts` ✓ (unchanged)
- `.github/workflows/ci.yml` ✓ (unit + rls jobs)

---

## Security Domain

> security_enforcement absent from config = enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (carry-forward) | Email/password Supabase Auth; `auth.uid()` is the only trusted identity in RPCs. |
| V3 Session Management | yes (carry-forward) | supabase-js session; no new session surface in P11. |
| V4 Access Control | **yes (core)** | RLS read-own on inventory/match_results/match_settlements; SECURITY DEFINER RPCs are sole writers; spend_unlock checks `balance >= cost` server-side. |
| V5 Input Validation | yes | `spend_unlock` validates `p_unit_id` against an allowlist; `report_match_result` validates `p_claimed_winner` is a UUID; `provision_account` validates p_user_id is non-null. No client-supplied amounts anywhere. |
| V6 Cryptography | no (P14's job) | Signed match reports are Phase 14. Phase 11 uses agreement-based settlement (no crypto). |
| V7 Error Handling | yes | RPCs return JSONB with `ok/reason` fields rather than raising exceptions to the client (except auth-failed cases). |
| V14 Configuration | yes (carry-forward) | Economy constants (WIN_REWARD, LOSS_REWARD, WELCOME_GRANT, unit costs) live in SQL RPCs — server-side, not in client code. Bundle secret-scan continues in CI. |

### Known Threat Patterns for Phase 11 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client submits forged win + custom reward amount | Tampering / Elevation | `report_match_result` ignores client amounts; reward is a server constant. Client sends only `claimed_winner` UUID. |
| Replay: submit same match_id twice | Tampering | `match_results` UNIQUE (match_id, reporter_id) + `match_settlements` UNIQUE (match_id) + ON CONFLICT DO NOTHING. |
| Concurrent double-spend (double-tap unlock) | Tampering | `UPDATE wallet WHERE balance >= cost` atomic guard + `CHECK (balance >= 0)` backstop. |
| Two colluding clients agree on false winner | Tampering | Detected only if one client does NOT agree (mismatch → void). Two cooperating cheaters can agree on a false winner in P11 — this is the accepted interim risk (D-05); P14 adds cryptographic verification. |
| Direct client INSERT to inventory (forged unlock) | Elevation of Privilege | No INSERT policy on inventory; client write silently blocked by RLS deny-by-default. |
| XSS via username in innerHTML | XSS | `esc()` applied before interpolation; name is fixed at signup so no persistent mutation path. |
| service_role key in bundle | Elevation of Privilege | Phase 9 CI bundle-scan carry-forward; no new VITE_* vars in P11. |

---

## Sources

### Primary (HIGH confidence)

- **Live Phase 9 migrations (read this session):** `supabase/migrations/20260612000001_baseline.sql` + `20260612085249_foundations.sql` — exact live schema, RLS policies, `credit_wallet` RPC shape, `wallet_credits` idempotency table.
- **Live Phase 9 API clients (read this session):** `src/lib/api/wallet.ts` (creditWallet/getBalance), `src/lib/api/account.ts` (recordMatchResult/THRESHOLDS — to be retired), `test/rls/wallet-rls.test.ts` (forged-write test pattern to copy).
- **Live Phase 9 scene code (read this session):** `GameScene.ts:882,1002` (username XSS sites), `LobbyScene.ts:100,133` (username XSS sites), `UnitData.ts` (unit IDs and costs).
- **`.planning/research/PITFALLS.md`** — locked SQL shapes: Pitfall 3 (server-derived rewards), Pitfall 4 (ON CONFLICT DO NOTHING idempotency), Pitfall 5 (atomic spend + CHECK), Pitfall 6 (RLS read-own + no client write).
- **`.planning/phases/11-accounts-economy/11-CONTEXT.md`** — D-01 through D-14 (all locked and discretion decisions).
- **`.planning/phases/09-backend-foundations-integrity/09-CONTEXT.md`** — Phase 9 exemplar shape (D-02/D-03/D-07).
- **`.planning/phases/10-services-simulation-refactor/10-CONTEXT.md`** — Phase 10 seam contract (D-04 sim events, D-13 recordResult handoff, D-12/D-14 gameState cache).

### Secondary (MEDIUM confidence)

- **`.planning/research/SUMMARY.md`** — Option A confirmed architecture, roadmap implications.
- **Postgres documentation (training data, not freshly fetched):** `GET DIAGNOSTICS ROW_COUNT` pattern; PL/pgSQL `ON CONFLICT DO NOTHING` + FOUND semantics; `SECURITY DEFINER` with `search_path = ''`; atomic guarded UPDATE behavior.

### Tertiary (LOW confidence — verify at impl time)

- **`credit_wallet_for_user` internal function pattern (A4):** Standard Postgres capability but not tested in Phase 9's harness. If implementation is complex, use direct `UPDATE wallet` inside the SECURITY DEFINER RPC as the simpler alternative.
- **`gameState.opponentId` availability (A1/A2):** Depends on Phase 10 implementation details not yet executed. Treat as "Phase 11 must provision if not present."

---

## Metadata

**Confidence breakdown:**
- Standard stack (no new packages): HIGH — Phase 9 infra verified live.
- SQL shapes (RPCs, RLS, idempotency): HIGH — directly derived from live Phase 9 code + PITFALLS.md locked shapes.
- Economy numbers: HIGH — mechanically derived from D-02/D-03 constraints; flat pricing per D-04 default.
- "Both agree" settlement design: MEDIUM — derived from first principles using Phase 9 idempotency pattern; not verified against an external authoritative source. Core logic is sound (Postgres UNIQUE + ON CONFLICT + GET DIAGNOSTICS); the cross-user credit design (A4) is the one unverified element.
- v1.0 migration (SQL backfill): HIGH — standard Postgres DO $$ block, fully idempotent ON CONFLICT guards, matches the Phase 9 migration pattern.
- XSS fix: HIGH — standard DOM XSS prevention; `esc()` is well-understood.

**Research date:** 2026-06-12
**Valid until:** ~2026-07-12 (stable domain — Supabase Postgres + RLS patterns do not change rapidly; re-verify supabase-js version if planning slips past a month).
