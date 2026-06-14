-- Progression & Upgrades migration (Phase 12)
--   Adds the `upgrades` levels store and the `upgrade_spend` SECURITY DEFINER RPC.
--
-- Architecture:
--   - upgrades table: (user_id, scope, target_id, level) — stores levels NOT stats (PROG-04 / D-15).
--     Absence of a row = level 1 (D-15). RLS: select-own only; all client writes denied (Pitfall 6).
--   - upgrade_spend RPC: server-derived cost (never client-supplied, D-03/PROG-04), atomic guarded
--     deduct, ownership check for scope='unit' (D-16), level-transition upsert with concurrency
--     guard (GET DIAGNOSTICS, Landmine #3), revoke/grant footer.
--
-- Server constants (embedded in SQL only, never client-supplied — D-03/PROG-04):
--   Unit upgrade costs:  L2=75  L3=150  L4=300  L5=600
--   Tower upgrade costs: L2=100 L3=200  L4=400  L5=800
--
-- Note: public.upgrades is already granted to authenticated+service_role in
--   20260613062000_table_grants.sql (that file runs after 20260613062000 < 20260614000000).

-- ============================================================
-- SCHEMA: upgrades table + RLS
-- ============================================================

create table public.upgrades (
  user_id   uuid not null references auth.users (id) on delete cascade,
  scope     text not null check (scope in ('unit', 'tower')),
  target_id text not null,
  level     int  not null default 1 check (level >= 1),
  primary key (user_id, scope, target_id)
);

alter table public.upgrades enable row level security;

-- Select own rows only; NO client write policy (deny-by-default, Pitfall 6).
-- Direct INSERT/UPDATE/DELETE from the client is denied by RLS (zero client write policies).
create policy upgrades_select_own
  on public.upgrades for select
  using (auth.uid() = user_id);

-- ============================================================
-- RPC: upgrade_spend — server-authoritative level-transition spend
-- ============================================================
--
-- Mirrors spend_unlock (lines 152-198 of 20260613061943_accounts_economy.sql) with three
-- structural differences:
--   1. Ownership check for scope='unit' against public.inventory (D-16).
--   2. Level-transition upsert instead of one-time insert, with a WHERE-level guard (Landmine #2).
--   3. GET DIAGNOSTICS row_count check that rolls back wallet deduct on concurrent race (Landmine #3).
--
-- Trust boundary: client supplies only (p_scope, p_target_id); server derives cost from embedded
-- CASE constants. The client never supplies an amount (D-03/PROG-04/T-12-01).

create function public.upgrade_spend(p_scope text, p_target_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner     uuid    := auth.uid();
  v_cur_level int;
  v_new_level int;
  v_cost      bigint;
  v_bal       bigint;
  v_rows      bigint := 0;
begin
  -- Auth null-guard (T-12-06 / mirrors spend_unlock lines 163-165)
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  -- Validate scope (fail-fast before any table reads)
  if p_scope not in ('unit', 'tower') then
    raise exception 'invalid scope %', p_scope;
  end if;

  -- D-16 / T-12-02: for scope='unit', verify the caller owns the unit in inventory.
  -- Ownership check is BEFORE the deduct (Landmine #1: correct order).
  -- Note: inventory uses columns (owner, unit_id) NOT (user_id, ...).
  if p_scope = 'unit' then
    if not exists (
      select 1 from public.inventory
      where owner = v_owner and unit_id = p_target_id
    ) then
      return jsonb_build_object('ok', false, 'reason', 'not_owned');
    end if;

    -- T-12-03: server-side whitelist of the 6 known unit ids (unknown target rejected).
    if p_target_id not in (
      'scout_drone', 'assault_bot', 'vine_crawler',
      'thorn_beast', 'apprentice_mage', 'elementalist'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'unknown_target');
    end if;
  end if;

  -- T-12-03: tower scope must target 'tower_power' (D-01: single track).
  if p_scope = 'tower' then
    if p_target_id <> 'tower_power' then
      return jsonb_build_object('ok', false, 'reason', 'unknown_target');
    end if;
  end if;

  -- Read current level. Absence of row = level 1 (D-15).
  select coalesce(
    (select level from public.upgrades
     where user_id = v_owner and scope = p_scope and target_id = p_target_id),
    1
  ) into v_cur_level;

  v_new_level := v_cur_level + 1;

  -- D-10: enforce max level 5 (T-12-04 partial — level-skip prevention).
  if v_new_level > 5 then
    return jsonb_build_object('ok', false, 'reason', 'max_level');
  end if;

  -- Server-derived cost — CASE constants embedded in SQL only; client never supplies amount
  -- (D-03 / PROG-04 / T-12-01). Cost curve escalates per D-09 matching plan-01 UPGRADE_COSTS
  -- display mirror: unit {2:75,3:150,4:300,5:600} tower {2:100,3:200,4:400,5:800}.
  v_cost := case
    when p_scope = 'unit' then
      case v_new_level
        when 2 then 75
        when 3 then 150
        when 4 then 300
        when 5 then 600
        else null
      end
    when p_scope = 'tower' then
      case v_new_level
        when 2 then 100
        when 3 then 200
        when 4 then 400
        when 5 then 800
        else null
      end
    else null
  end;

  if v_cost is null then
    raise exception 'cannot derive cost for scope=% level=%', p_scope, v_new_level;
  end if;

  -- Atomic guarded deduct — verbatim from spend_unlock lines 178-186 (Pitfall 5).
  -- CHECK(balance >= 0) on the wallet table is the backstop.
  update public.wallet
     set balance = balance - v_cost
   where owner = v_owner and balance >= v_cost
   returning balance into v_bal;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_funds');
  end if;

  -- Level-transition upsert with concurrency guard (Landmine #2 / T-12-04).
  -- ON CONFLICT DO UPDATE only fires when the current DB level still equals v_cur_level,
  -- ensuring exactly-once level advance even under concurrent retries.
  insert into public.upgrades (user_id, scope, target_id, level)
  values (v_owner, p_scope, p_target_id, v_new_level)
  on conflict (user_id, scope, target_id) do update
    set level = v_new_level
    where public.upgrades.level = v_cur_level;

  -- GET DIAGNOSTICS gate (Landmine #3): if a concurrent call already advanced the level,
  -- the WHERE-guard above is a silent no-op (row_count = 0). Raising an exception here
  -- rolls back the wallet deduct in the same PL/pgSQL transaction — mirrors report_match_result
  -- lines 271-273. The client must retry.
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'concurrent upgrade detected — retry';
  end if;

  return jsonb_build_object(
    'ok',         true,
    'new_level',  v_new_level,
    'new_balance', v_bal,
    'scope',      p_scope,
    'target_id',  p_target_id
  );
end;
$$;

-- Revoke from public (no anonymous access); grant to authenticated only.
revoke all on function public.upgrade_spend(text, text) from public;
grant  execute on function public.upgrade_spend(text, text) to authenticated;
