-- Baseline migration: reproduce the live v1.0 profiles + rooms schema for CI (A3).
-- Uses CREATE TABLE IF NOT EXISTS so this is non-destructive against an existing live DB
-- (safe to push via `supabase db push`).
-- NOTE: profiles RLS is NOT enabled here — that is Task 3 (foundations migration) so
-- the diff is reviewable as a distinct tightening step.

-- profiles: per-user account state and progression
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text,
  faction         text,
  unlocked_units  text[],
  wins            integer not null default 0,
  losses          integer not null default 0
);

-- rooms: multiplayer matchmaking lobby rows
create table if not exists public.rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text,
  host_id         text,
  guest_id        text,
  host_faction    text,
  guest_faction   text,
  state           text
);
