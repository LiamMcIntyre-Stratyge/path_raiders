-- Auth signup trigger: auto-provision profile + wallet on user creation.
--
-- WHY THIS EXISTS / INCIDENT CAPTURE
-- The `on_auth_user_created` trigger and `handle_new_user()` function were originally
-- created out-of-band (Supabase Dashboard), so they lived only in the remote DB and not
-- in version control. An earlier version of the function inserted `public.profiles.username`
-- directly from `new.raw_user_meta_data->>'username'`. The app's email signup does NOT send
-- a username in user metadata (it calls upsertProfile separately right after signup), so the
-- value was NULL. `profiles.username` is NOT NULL, so the insert raised
--   `23502 null value in column "username" ... violates not-null constraint`
-- which aborted the auth.users transaction and surfaced to clients as
--   `500: Database error creating new user` (and the same on /signup).
-- This blocked ALL real signups and the admin createUser path used by the RLS test suite.
--
-- THE FIX (captured here as the source of truth; already applied live 2026-06-13)
--   1. COALESCE a guaranteed non-null username fallback (`commander_<short-id>`); the app's
--      upsertProfile overwrites it with the real display name immediately after signup.
--   2. Wrap BOTH the profiles insert and the provision_account call in
--      `exception when others then raise warning` blocks, so a failure in profile/wallet
--      provisioning can NEVER abort the auth.users insert again (defense in depth — a future
--      schema change can't reintroduce a signup-blocking 500).
--
-- Idempotent: safe to re-run. provision_account is defined in 20260613061943_accounts_economy.sql.

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $function$
begin
  -- Ensure a profiles row exists. Coalesce a non-null username (profiles.username is
  -- NOT NULL) — the app's upsertProfile overwrites it with the real name right after
  -- signup. Guarded so a profiles failure can never abort the auth.users insert (500).
  begin
    insert into public.profiles (id, username)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'commander_' || left(new.id::text, 8))
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user: profiles insert failed for %: %', new.id, sqlerrm;
  end;

  -- Wallet + welcome grant. Guarded — the app also calls provision_account explicitly.
  begin
    perform public.provision_account(new.id);
  exception when others then
    raise warning 'handle_new_user: provision_account failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
