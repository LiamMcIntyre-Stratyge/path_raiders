import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHmac, randomUUID } from 'node:crypto'

// Keys come from `supabase status -o env` in CI — NEVER imported from src/
export const URL = process.env.SUPABASE_URL!
export const ANON = process.env.SUPABASE_ANON_KEY!
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY! // CI env ONLY — never in src/

// The local/CI stack signs JWTs with this symmetric secret. `supabase status -o env`
// exports it; fall back to the well-known local default so a bare `supabase start` works.
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ??
  process.env.JWT_SECRET ??
  'super-secret-jwt-token-with-at-least-32-characters-long'

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

// Mint an HS256 access token PostgREST accepts as a signed-in `authenticated` user.
// This replaces the GoTrue admin API (admin.auth.admin.createUser + signInWithPassword),
// which is unavailable in our target environments. With this token attached, auth.uid()
// inside the SECURITY DEFINER RPCs and the RLS policies resolves to `sub` — exactly as a
// real session would, so RLS is genuinely exercised (not bypassed).
export function mintToken(sub: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64url(
    JSON.stringify({
      sub,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'supabase',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signingInput = `${header}.${payload}`
  const sig = createHmac('sha256', JWT_SECRET).update(signingInput).digest('base64url')
  return `${signingInput}.${sig}`
}

// Admin/service-role client for fixtures and re-reads.
// persistSession: false prevents the shared jsdom localStorage from contaminating
// the service-role credentials with a user's session (Pitfall 4).
export function makeAdmin(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false } })
}

// Seed an auth.users row (via the local-only test_create_user RPC) and return an ANON
// client pinned to that user's minted token. The returned client behaves like a logged-in
// user for all PostgREST/RPC calls. No GoTrue session is created, so getUser() is NOT
// available — callers use the returned `id` instead of user.auth.getUser().
export async function seedUser(
  admin: SupabaseClient,
  tag: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const id = randomUUID()
  const email = `${tag}_${Date.now()}@example.test`
  const { error } = await admin.rpc('test_create_user', { p_id: id, p_email: email })
  if (error) throw new Error(`test_create_user(${tag}) failed: ${error.message}`)
  const token = mintToken(id)
  // Use the `accessToken` option, NOT global.headers.Authorization: supabase-js's
  // fetchWithAuth resolves the Authorization header from _getAccessToken() on every
  // request, which (with no GoTrue session) overrides a global header with the anon key.
  // _getAccessToken() returns accessToken() verbatim, so our minted `authenticated`
  // token is sent and auth.uid() resolves to `id`. (client.auth.* must not be used.)
  const client = createClient(URL, ANON, {
    accessToken: async () => token,
  })
  return { id, client }
}
