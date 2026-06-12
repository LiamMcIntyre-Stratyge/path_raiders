-- Foundations migration: wallet exemplar + idempotency ledger + credit RPC
--   + bare RLS shells (inventory/upgrades/match_results) + tightened profiles RLS (D-01/D-02/D-03)
-- This is the read-via-RLS / write-via-SECURITY-DEFINER-RPC exemplar every
-- authoritative table in phases 11-14 copies.

-- ============================================================
-- 1. wallet table + RLS (read-own / no client writes)
-- ============================================================

create table public.wallet (
  owner   uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 0,
  constraint wallet_balance_nonneg check (balance >= 0)
);

alter table public.wallet enable row level security;

-- Client may read ONLY its own row. No INSERT/UPDATE/DELETE policy -> all client writes denied.
create policy wallet_select_own
  on public.wallet for select
  using (auth.uid() = owner);

-- ============================================================
-- 2. wallet_credits idempotency ledger (no client policies -> no client access)
-- ============================================================

create table public.wallet_credits (
  idempotency_key text primary key,
  owner           uuid not null references auth.users (id) on delete cascade,
  amount          bigint not null,
  created_at      timestamptz not null default now()
);

alter table public.wallet_credits enable row level security;
-- No client policies: no client access to this table.

-- ============================================================
-- 3. credit_wallet RPC: SOLE WRITER (SECURITY DEFINER + hardened search_path)
-- ============================================================

create function public.credit_wallet(p_amount bigint, p_idempotency_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner   uuid := auth.uid();
  v_balance bigint;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- idempotent: first writer wins; retries are no-ops
  insert into public.wallet_credits (idempotency_key, owner, amount)
  values (p_idempotency_key, v_owner, p_amount)
  on conflict (idempotency_key) do nothing;

  if not found then
    -- already credited under this key -> return current balance unchanged
    select balance into v_balance from public.wallet where owner = v_owner;
    return v_balance;
  end if;

  -- ensure a row exists, then atomic guarded increment
  insert into public.wallet (owner, balance) values (v_owner, 0)
    on conflict (owner) do nothing;

  update public.wallet
     set balance = balance + p_amount
   where owner = v_owner
   returning balance into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.credit_wallet(bigint, text) from public;
grant  execute on function public.credit_wallet(bigint, text) to authenticated;

-- ============================================================
-- 4. Bare RLS shells: inventory / upgrades / match_results (D-03)
-- ============================================================

create table public.inventory (
  id    uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade
);

create table public.upgrades (
  id    uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade
);

create table public.match_results (
  id    uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade
);

alter table public.inventory     enable row level security;
alter table public.upgrades      enable row level security;
alter table public.match_results enable row level security;

create policy inventory_select_own
  on public.inventory for select
  using (auth.uid() = owner);

create policy upgrades_select_own
  on public.upgrades for select
  using (auth.uid() = owner);

create policy match_results_select_own
  on public.match_results for select
  using (auth.uid() = owner);
-- No write policies -> no client writes on any shell table.

-- ============================================================
-- 5. Tighten profiles RLS (D-03) -- ALTER only, never recreate (A3)
-- ============================================================

alter table public.profiles enable row level security;

-- Guard against duplicate-policy errors on db reset over the baseline.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
      on public.profiles for select
      using (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
      on public.profiles for insert
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles for update
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end;
$$;
-- currency/stat columns (wins/losses/unlocked_units) tightened in their owning phase (11).
-- Phase 9 guarantees only no cross-account writes.
