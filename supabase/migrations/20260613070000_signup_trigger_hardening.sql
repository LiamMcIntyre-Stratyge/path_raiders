-- Harden the signup trigger so a new auth.users insert can never 500 (GoTrue outage fix).
--
-- The hosted DB has an `on_auth_user_created` trigger on auth.users that runs
-- public.handle_new_user() to bootstrap a profiles row + wallet/welcome grant. That trigger
-- + function existed only on the live DB (never in this repo's migrations). Its body
-- inserted profiles(id, username) with the username taken verbatim from signup metadata —
-- but the app calls signUp({ email, password }) WITHOUT metadata, so it inserted a NULL
-- username, and profiles.username is NOT NULL on the live DB. That aborted the auth.users
-- insert and returned `500: Database error creating new user` for EVERY signup (both the
-- GoTrue admin createUser and the public signUp endpoint). An earlier incarnation referenced
-- an unqualified `profiles` under search_path='' and failed with
-- `relation "profiles" does not exist` — the same outage, different symptom.
--
-- Fix: coalesce a non-null username fallback (the app's upsertProfile overwrites it with the
-- real name immediately after signup) and guard BOTH side effects so a failure raises a
-- warning instead of aborting the signup transaction. Signup is now resilient regardless of
-- signup metadata or any downstream constraint. This migration brings the live hot-fix under
-- version control: `create or replace function` replaces the body the live trigger runs.
--
-- NOTE: the `on_auth_user_created` trigger on auth.users already exists on the live DB
-- (created out-of-band, not via migrations) and is left untouched. This migration
-- deliberately does NOT (re)create it: auth.users is owned by supabase_auth_admin, and the
-- local/CI stack's `postgres` cannot suppress the trigger during the RLS suite's auth.users
-- seeding (session_replication_role is superuser-only). Capturing just the function keeps
-- the fix under version control and CI green; on the live DB the existing trigger picks up
-- the replaced body, and the app provisions accounts explicitly regardless.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Bootstrap a profiles row. profiles.username is NOT NULL on the live DB, so coalesce a
  -- placeholder when signup carries no username; the app's upsertProfile sets the real one.
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

  -- Wallet + welcome grant. The app also calls provision_account explicitly after signup,
  -- so this is a belt-and-suspenders safety net — guarded so it can never 500 the signup.
  begin
    perform public.provision_account(new.id);
  exception when others then
    raise warning 'handle_new_user: provision_account failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
