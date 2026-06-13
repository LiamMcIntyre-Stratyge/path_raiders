-- Explicit table privileges for the authoritative economy tables (phase 9/11).
--
-- These tables follow the read-via-RLS / write-via-SECURITY-DEFINER-RPC model: RLS is
-- the access gate, which means the API roles must HOLD the underlying table privileges
-- so that a forged client write is denied by RLS (silently, 0 rows) rather than by a
-- missing GRANT (a 42501 error). Likewise service_role admin re-reads need table
-- privileges — service_role bypasses RLS but still requires the grant.
--
-- On hosted Supabase these privileges come from the project's default privileges. The
-- local/CI stack does not apply them to these tables (migrations run as supabase_admin,
-- outside `ALTER DEFAULT PRIVILEGES FOR ROLE postgres`), so without this migration the
-- RLS suite fails with `permission denied for table wallet/inventory`. GRANT is
-- idempotent, so re-granting where the privilege already exists is a harmless no-op.

grant all on table
  public.profiles,
  public.wallet,
  public.wallet_credits,
  public.inventory,
  public.upgrades,
  public.match_results,
  public.match_settlements
to authenticated, service_role;
