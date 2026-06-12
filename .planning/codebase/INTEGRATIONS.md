# External Integrations

**Analysis Date:** 2026-06-12

## Overview

The only external backend is **Supabase**, used for three things: authentication, Postgres data persistence, and Realtime multiplayer. A single shared client is created in `src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

SDK: `@supabase/supabase-js` `^2.99.3`. The `supabase` export is imported across the scenes.

## APIs & External Services

**Supabase (single provider — auth + database + realtime):**
- SDK/Client: `@supabase/supabase-js`, instantiated in `src/lib/supabase.ts`
- Auth credentials: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon/public key, safe for client)

No other third-party APIs, payment providers, or analytics SDKs detected.

## Data Storage

**Database:** Supabase Postgres (`public` schema). Accessed via the PostgREST query builder (`supabase.from(...)`). Two tables are used:

**`profiles`** - per-user account state and progression
- Columns referenced: `id`, `wins`, `losses`, `unlocked_units` (text[]), plus profile fields written on signup
- `src/scenes/AuthScene.ts:273` - read profile after session restore
- `src/scenes/AuthScene.ts:478` - read profile on login
- `src/scenes/AuthScene.ts:631`, `:869` - `upsert` profile (signup / profile setup)
- `src/scenes/GameScene.ts:611-615` - read `wins, losses, unlocked_units` at game end
- `src/scenes/GameScene.ts:636-639` - `update` win/loss counts and unlocked units. Win-milestone unlocks: 2 wins → `assault_bot`, 3 → `thorn_beast`, 5 → `elementalist`

**`rooms`** - multiplayer matchmaking lobby rows
- Columns referenced: `id`, `code` (6-char join code), `host_id`, `guest_id`, `host_faction`, `guest_faction`, `state` (`waiting` | `active`)
- `src/scenes/LobbyScene.ts:338-347` - `insert` a room (host creates), `state: 'waiting'`
- `src/scenes/LobbyScene.ts:407-412` - `select` room by `code` + `state='waiting'` (guest looks up)
- `src/scenes/LobbyScene.ts:422-429` - `update` room with `guest_id`, `guest_faction`, `state='active'` (guest joins)

**File Storage:** Not used. Sprite/token assets are generated offline by `src/tools/` and shipped as static files under `public/assets/`.

**Caching:** None.

## Authentication & Identity

**Provider:** Supabase Auth (email/password), all in `src/scenes/AuthScene.ts`.

Flows implemented:
- Session restore: `supabase.auth.getSession()` (`AuthScene.ts:265`)
- Sign in: `supabase.auth.signInWithPassword({ email, password })` (`AuthScene.ts:452`)
- Sign up: `supabase.auth.signUp({ ... })` (`AuthScene.ts:622`), followed by `profiles` upsert
- Sign out: `supabase.auth.signOut()` (`src/scenes/LobbyScene.ts:221`)
- Password reset request: `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })` (`AuthScene.ts:686`) with a 6-digit code UI
- Password update: `supabase.auth.updateUser({ password })` (`AuthScene.ts:790`)

The authenticated user id is stored in app state (`gameState.userId`) and used as `host_id` / `guest_id` and the `profiles.id` key. A `'guest'` fallback id is used when no user is signed in (`LobbyScene.ts:341`, `:425`).

## Realtime / Multiplayer

Supabase Realtime is the multiplayer transport. Two distinct mechanisms are used:

**1. Postgres-changes subscription (lobby join handshake)** — `src/scenes/LobbyScene.ts:369-394`
- Channel `room-${roomId}` listens for `postgres_changes` `UPDATE` on `public.rooms` filtered by `id=eq.${roomId}`
- When `guest_id` appears, the host transitions both players into `PlacementScene`
- Cleanup via `supabase.removeChannel(...)` (`LobbyScene.ts:86-88`, `:453-455`)

**2. Broadcast channels (in-match state sync)** — peer-to-peer messages over a named channel; no DB writes

`PlacementScene` — channel `placement:${gameState.roomId}` (`src/scenes/PlacementScene.ts:194-228`)
- `map_sync` - host broadcasts authoritative map on `SUBSCRIBED`
- `slot_pick` - players broadcast chosen base slot

`GameScene` — channel `game:${gameState.roomId}` (`src/scenes/GameScene.ts:858-895`)
- `deploy` - unit deployment (`GameScene.ts:372`)
- `base_hp` - base HP updates (`broadcastBaseHP`, `GameScene.ts:564-566`)
- `wall_break` - wall destruction (`GameScene.ts:816`)
- `game_over` - winner declaration (`GameScene.ts:589`)
- Broadcasts are skipped for practice rooms (`gameState.roomId?.startsWith('practice-')`), so single-player practice runs without a live channel.

Channel handles are stored on each scene (`this.channel` / `this.realtimeChannel`, typed `RealtimeChannel`) and torn down with `supabase.removeChannel(...)` on scene shutdown.

## Monitoring & Observability

**Error Tracking:** None (no Sentry/etc.). Errors are surfaced inline in the UI (e.g. `setErr(...)` in scenes) and via `console`.

**Logs:** `console` only.

## CI/CD & Deployment

**Hosting:** Not configured in-repo. Output is a static Vite `dist/` bundle suitable for any static host.

**CI Pipeline:** None detected (no `.github/workflows`, no other CI config).

## Environment Configuration

**Required env vars (Vite `VITE_`-prefixed, exposed to client):**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon/public key

**Secrets location:**
- `.env.local` at repo root (git-ignored via `*.local`). Actual values are intentionally not reproduced here. The anon key is a public client key by design; no service-role key should be present in client env.

## Webhooks & Callbacks

**Incoming:** None.

**Outgoing:** None, aside from the password-reset email redirect target `window.location.origin` passed to `resetPasswordForEmail` (`AuthScene.ts:687`).

---

*Integration audit: 2026-06-12*
