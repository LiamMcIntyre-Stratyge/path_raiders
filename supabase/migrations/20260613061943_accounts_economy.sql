-- Accounts & Economy migration (Phase 11)
--   Fills the Phase 9 bare inventory/match_results shells, adds match_settlements,
--   and creates the four SECURITY DEFINER economy RPCs + the idempotent v1.0 backfill.
--
-- This file is the first real authority move on the economy: every currency/ownership
-- write becomes a SECURITY DEFINER RPC; RLS denies all direct client writes. It copies the
-- live Phase 9 credit_wallet exemplar (security definer + search_path='' + auth.uid()
-- null-guard + fully-qualified public.* refs + revoke/grant footer) verbatim.
--
-- Server constants (D-04, embedded in SQL only, never client-supplied):
--   WIN_REWARD = 50  LOSS_REWARD = 15  WELCOME_GRANT = 100  unit cost = 100
-- Idempotency keys: 'welcome:'||uid  ·  'match:'||match_id||':win'  ·  'match:'||match_id||':loss'

-- ============================================================
-- TASK 1: SCHEMA
-- ============================================================

-- ------------------------------------------------------------
-- 1a. inventory: fill out the Phase 9 bare shell (id, owner only)
--     Add unit_id + UNIQUE(owner, unit_id) so spend_unlock is idempotent and
--     ownership is server truth (ECON-05/ECON-03). Keep the Phase 9 select_own
--     RLS; add NO INSERT/UPDATE/DELETE client policy (deny-by-default, Pitfall 6).
-- ------------------------------------------------------------

alter table public.inventory
  add column if not exists unit_id text not null default '';

-- Unique ownership: one row per (owner, unit) -> makes unlock idempotent.
alter table public.inventory
  add constraint inventory_owner_unit unique (owner, unit_id);
-- Existing inventory_select_own RLS policy (Phase 9) is sufficient.
-- No client write policy added -> all direct client writes denied (Pitfall 6).

-- ------------------------------------------------------------
-- 1b. match_results: reshape the bare Phase 9 shell (id, owner only) into the
--     two-row per-player report ledger keyed by (match_id, reporter_id).
--     RLS select-own-reports only; no client write policy (ECON-02, Pitfall 6).
-- ------------------------------------------------------------

-- Drop the bare-shell owner column + its select_own policy (incompatible shape).
drop policy if exists match_results_select_own on public.match_results;

alter table public.match_results drop constraint if exists match_results_pkey;
alter table public.match_results drop column if exists id;
alter table public.match_results drop column if exists owner;

alter table public.match_results
  add column if not exists match_id       uuid not null,
  add column if not exists reporter_id    uuid not null references auth.users (id) on delete cascade,
  add column if not exists claimed_winner uuid not null,
  add column if not exists reported_at    timestamptz not null default now();

-- UNIQUE per player per match -> idempotent report (D-07).
alter table public.match_results
  add constraint match_results_pkey primary key (match_id, reporter_id);

-- P14 will ADD (non-destructive): signed_report text, deploy_log jsonb,
-- seed bigint, report_hash text -- each player's signed claim.

-- Replace the RLS select policy: a reporter may read only its own report rows.
create policy match_results_select_own
  on public.match_results for select
  using (auth.uid() = reporter_id);
-- No client INSERT/UPDATE/DELETE policy -> all direct client writes denied.

-- ------------------------------------------------------------
-- 1c. match_settlements: new authoritative settlement record, one row per match_id.
--     RLS select-as-winner-or-loser only; no client write policy (ECON-04, Pitfall 6).
-- ------------------------------------------------------------

create table public.match_settlements (
  match_id    uuid primary key,
  winner_id   uuid references auth.users (id) on delete cascade,
  loser_id    uuid references auth.users (id) on delete cascade,
  settled     boolean not null default false,
  voided      boolean not null default false,
  settled_at  timestamptz,
  win_amount  bigint,
  loss_amount bigint
);

-- P14 will ADD (non-destructive): validated boolean default false, bounds_result jsonb.

alter table public.match_settlements enable row level security;

create policy match_settlements_select_party
  on public.match_settlements for select
  using (auth.uid() = winner_id or auth.uid() = loser_id);
-- No client INSERT/UPDATE/DELETE policy -> all direct client writes denied.

-- ============================================================
-- TASK 2: SECURITY DEFINER RPCs + v1.0 BACKFILL
-- ============================================================

-- ------------------------------------------------------------
-- 2a. credit_wallet_for_user: INTERNAL definer-only credit by explicit user id.
--     Used for cross-user / no-session credits (settlement, backfill) where
--     auth.uid() is the caller/NULL, not the recipient (Pitfall 1).
--     REVOKE ALL FROM public; NOT granted to authenticated/anon -> only callable
--     by other SECURITY DEFINER functions / the owner (T-11-07 / A4).
-- ------------------------------------------------------------

create function public.credit_wallet_for_user(p_user_id uuid, p_amount bigint, p_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- idempotent: first writer wins; retries are no-ops (keyed by p_key)
  insert into public.wallet_credits (idempotency_key, owner, amount)
  values (p_key, p_user_id, p_amount)
  on conflict (idempotency_key) do nothing;

  if not found then
    -- already credited under this key -> return current balance unchanged
    select balance into v_balance from public.wallet where owner = p_user_id;
    return v_balance;
  end if;

  -- ensure a row exists, then atomic increment
  insert into public.wallet (owner, balance) values (p_user_id, 0)
    on conflict (owner) do nothing;

  update public.wallet
     set balance = balance + p_amount
   where owner = p_user_id
   returning balance into v_balance;

  return v_balance;
end;
$$;

-- INTERNAL ONLY: revoke from public, do NOT grant to authenticated/anon.
revoke all on function public.credit_wallet_for_user(uuid, bigint, text) from public;

-- ------------------------------------------------------------
-- 2b. spend_unlock: atomic server-derived deduct + idempotent inventory insert.
--     Server-derived cost (never client-supplied, Pitfall 3); atomic guarded
--     UPDATE WHERE balance >= cost (Pitfall 5); CHECK(balance>=0) is the backstop.
-- ------------------------------------------------------------

create function public.spend_unlock(p_unit_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_cost  bigint;
  v_bal   bigint;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  -- Server-derived cost (never client-supplied) -- Pitfall 3
  v_cost := case p_unit_id
    when 'assault_bot'  then 100   -- D-04 unit soft-currency cost
    when 'thorn_beast'  then 100
    when 'elementalist' then 100
    else null
  end;
  if v_cost is null then
    raise exception 'unknown unit %', p_unit_id;
  end if;

  -- Atomic guarded deduct -- Pitfall 5: UPDATE ... WHERE balance >= cost
  update public.wallet
     set balance = balance - v_cost
   where owner = v_owner and balance >= v_cost
   returning balance into v_bal;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_funds');
  end if;

  -- Idempotent inventory insert -- Pitfall 4: ON CONFLICT DO NOTHING
  insert into public.inventory (owner, unit_id)
  values (v_owner, p_unit_id)
  on conflict (owner, unit_id) do nothing;

  return jsonb_build_object('ok', true, 'new_balance', v_bal, 'unit_id', p_unit_id);
end;
$$;

revoke all on function public.spend_unlock(text) from public;
grant  execute on function public.spend_unlock(text) to authenticated;

-- ------------------------------------------------------------
-- 2c. report_match_result: both-agree settlement, idempotent per match_id.
--     First report -> pending (D-08). Disagreement -> void, no payout (D-06).
--     Agreement -> settle exactly once (GET DIAGNOSTICS gate, Pitfall 2) and
--     credit both via credit_wallet_for_user with server-constant rewards
--     (WIN_REWARD=50 / LOSS_REWARD=15, D-04, Pitfall 1/3/4). Winner/loser are
--     identified by p_claimed_winner UUID, never via auth.uid() role proxy (Pitfall 3).
-- ------------------------------------------------------------

create function public.report_match_result(p_match_id uuid, p_claimed_winner uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter  uuid := auth.uid();
  v_other_row public.match_results%rowtype;
  v_winner_id uuid;
  v_loser_id  uuid;
  v_inserted  bigint := 0;
begin
  if v_reporter is null then
    raise exception 'not authenticated';
  end if;

  -- Record this player's report (idempotent per player per match -- D-07).
  insert into public.match_results (match_id, reporter_id, claimed_winner)
  values (p_match_id, v_reporter, p_claimed_winner)
  on conflict (match_id, reporter_id) do nothing;

  -- Look for the other player's report.
  select * into v_other_row
  from public.match_results
  where match_id = p_match_id
    and reporter_id <> v_reporter
  limit 1;

  if not found then
    -- First report only -- awaiting opponent (D-08, no payout).
    return jsonb_build_object('status', 'pending');
  end if;

  -- Both reports exist: check agreement.
  if v_other_row.claimed_winner <> p_claimed_winner then
    -- Mismatch -> void, no payout (D-06).
    insert into public.match_settlements
      (match_id, settled, voided, settled_at, win_amount, loss_amount)
    values
      (p_match_id, false, true, now(), 0, 0)
    on conflict (match_id) do nothing;
    return jsonb_build_object('status', 'void', 'reason', 'mismatch');
  end if;

  -- Agreement -- identify winner as the agreed UUID, loser as the OTHER reporter
  -- (never via auth.uid() role proxy -- Pitfall 3).
  v_winner_id := p_claimed_winner;
  v_loser_id  := case when v_reporter = v_winner_id
                      then v_other_row.reporter_id
                      else v_reporter end;

  -- Settle exactly once (D-07: idempotent settlement, Pitfall 4).
  insert into public.match_settlements
    (match_id, winner_id, loser_id, settled, voided, settled_at, win_amount, loss_amount)
  values
    (p_match_id, v_winner_id, v_loser_id, true, false, now(), 50, 15)
    -- WIN_REWARD=50, LOSS_REWARD=15 -- server constants only (D-04).
  on conflict (match_id) do nothing;

  -- Distinguish "I inserted" from "already settled" -- Pitfall 2 (GET DIAGNOSTICS,
  -- because ON CONFLICT DO NOTHING leaves FOUND = false on a fresh insert too).
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- Already settled (second call by same player, or concurrent race) -- idempotent.
    return jsonb_build_object('status', 'already_settled');
  end if;

  -- Credit both players via the internal definer-only function. Each credit is
  -- itself idempotent via its wallet_credits key; the settlement insert above is
  -- the single-settlement gate (Pitfall 1/4).
  perform public.credit_wallet_for_user(v_winner_id, 50, 'match:' || p_match_id || ':win');
  perform public.credit_wallet_for_user(v_loser_id, 15, 'match:' || p_match_id || ':loss');

  return jsonb_build_object('status', 'settled', 'winner_id', v_winner_id);
end;
$$;

revoke all on function public.report_match_result(uuid, uuid) from public;
grant  execute on function public.report_match_result(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 2d. provision_account: idempotent wallet + welcome grant (D-02/D-10).
--     Called at new-account signup (AuthScene) and by the backfill block.
-- ------------------------------------------------------------

create function public.provision_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  -- Ensure a wallet row exists.
  insert into public.wallet (owner, balance)
  values (p_user_id, 0)
  on conflict (owner) do nothing;

  -- Welcome grant -- idempotent via wallet_credits (D-02/D-10).
  perform public.credit_wallet_for_user(p_user_id, 100, 'welcome:' || p_user_id);
end;
$$;

revoke all on function public.provision_account(uuid) from public;
grant  execute on function public.provision_account(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2e. v1.0 backfill (ACCT-04): provision wallet + welcome grant + inventory from
--     unlocked_units[] for every existing profile. Idempotent (ON CONFLICT guards),
--     safe to re-run. wins/losses/username are untouched -- already in profiles (D-11).
--     No unit_id CHECK constraint -- unknown legacy ids are inserted as-is (Pitfall 7).
-- ------------------------------------------------------------

do $$
declare
  r      record;
  v_unit text;
begin
  for r in
    select id, unlocked_units
    from public.profiles
    where id not in (select owner from public.wallet)
       or id not in (select distinct owner from public.inventory)
  loop
    -- 1. Ensure wallet row exists.
    insert into public.wallet (owner, balance) values (r.id, 0)
    on conflict (owner) do nothing;

    -- 2. Welcome grant (idempotent, D-10 no back-pay).
    perform public.credit_wallet_for_user(r.id, 100, 'welcome:' || r.id);

    -- 3. Seed inventory from unlocked_units[] (D-09: keep earned units free).
    if r.unlocked_units is not null then
      foreach v_unit in array r.unlocked_units loop
        insert into public.inventory (owner, unit_id) values (r.id, v_unit)
        on conflict (owner, unit_id) do nothing;
      end loop;
    end if;
  end loop;
end;
$$;
