-- TEST-ONLY seed (loaded by `supabase db reset` via [db.seed] sql_paths; NEVER applied by
-- `supabase db push`, so it can never reach the live/remote database — A3/A4 containment).
--
-- The RLS integration suite needs rows in auth.users because every authoritative table
-- (wallet, inventory, match_results, match_settlements, profiles) FKs to auth.users(id).
-- The hosted GoTrue admin API (admin.auth.admin.createUser) is unavailable in our target
-- environments (supabase_auth_admin lacks the grants), so the tests can no longer mint real
-- users that way. This SECURITY DEFINER helper lets the service-role test client insert the
-- minimal auth.users row directly. It is local/CI-only and granted to service_role only.
--
-- Only long-stable auth.users columns are referenced. Every NOT NULL column we omit
-- (is_sso_user, is_anonymous) carries a DEFAULT, so a minimal insert is valid. We never log
-- in through GoTrue (the suite mints its own JWTs), so password/token columns are irrelevant.

create or replace function public.test_create_user(p_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    p_id,
    'authenticated',
    'authenticated',
    p_email,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
  on conflict (id) do nothing;
end;
$$;

-- Callable only by the service-role test client (the admin fixture), never anon/authenticated.
revoke all on function public.test_create_user(uuid, text) from public;
grant execute on function public.test_create_user(uuid, text) to service_role;
