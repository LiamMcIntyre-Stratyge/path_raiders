# Stack Research — Path Raiders v2.0 (Server-Authoritative + Accounts/Economy/Progression/Matchmaking)

**Domain:** Realtime 1v1 lane-battler — adding server-authoritative netcode, persistent accounts, currency economy, progression, and matchmaking on top of an existing Supabase + Phaser 3 stack.
**Researched:** 2026-06-12
**Confidence:** HIGH on the building-block facts (versions, Supabase limits, Colyseus capabilities); MEDIUM on the authority-model recommendation (it is a judgement call, but well-supported by the constraints below).

> **Scope discipline:** The existing stack — Phaser 3.90 + TypeScript ~5.9, Vite 8, Supabase (auth/realtime/Postgres), Vercel + Capacitor — is **fixed** and not re-researched. This document covers ONLY the additions/changes the v2.0 systems require.

---

## TL;DR Recommendation

1. **Authority model: dedicated authoritative Node game-server (Colyseus) alongside Supabase** — Supabase Edge Functions **cannot** run a realtime game tick (2s CPU cap per request, no persistent stateful WebSocket loop). Colyseus is the lowest-effort path to a real authoritative simulation for a small team. Supabase remains the system of record for accounts/economy/progression and the auth provider.
2. **Economy/progression authority: Postgres + RLS + `SECURITY DEFINER` database functions / Edge Functions** — never let the client write currency, unlocks, or match results directly. The client calls RPCs that validate and mutate; RLS makes the tables read-only-ish from the client.
3. **Matchmaking: a `matchmaking_queue` table + an Edge Function (or the Colyseus matchmaker)** — keep it simple. Supabase Realtime **Broadcast (private channels)** + **Presence** for lobby/queue UI state; **never** for authoritative results.
4. **Determinism: not required if Colyseus is the single authority.** Only adopt deterministic lockstep if you reject a dedicated server. The server simulating once and broadcasting state removes the desync class of bugs entirely (see `codebase/CONCERNS.md` "Multiplayer desync").

---

## The Core Decision: Authority Model

The current game is client-authoritative — each client simulates independently and trusts the opponent's broadcasts (`base_hp`, `game_over`, `deploy`). `codebase/CONCERNS.md` documents the consequences: trivially cheatable (`recordResult('win')`, broadcast `base_hp: 0`), and the two simulations diverge because combat is resolved twice. v2.0 must fix this. Three models were evaluated.

### (a) Supabase Edge Functions / Postgres as authority + deterministic client sim + server validation

**How it would work:** Clients run the sim; periodically (or at match end) the server re-validates inputs deterministically or sanity-checks results before writing economy/stats.

| Pros | Cons |
|------|------|
| No new infrastructure — stays 100% Supabase | **Edge Functions cannot host a live game loop.** Hard limits: **2s CPU time per request**, max wall-clock per worker, no long-lived stateful tick. (Supabase docs, verified.) |
| Cheap | Full deterministic re-validation requires **bitwise-deterministic** TS sim (fixed-point math, seeded RNG, no `Date.now()`/`Math.random()` in sim) — large, fragile rewrite of `GameScene` |
| | Realtime relay still has no arbiter mid-match; cheating during the match isn't prevented, only audited after |

**Verdict: Reject for the live battle.** Edge Functions are excellent for *discrete authoritative writes* (claim rewards, apply upgrade, resolve queue) but cannot be the realtime arbiter. The determinism tax is high and buys you only post-hoc validation.

### (b) Dedicated authoritative Node game-server (Colyseus) alongside Supabase — **RECOMMENDED**

**How it would work:** A small Node service runs **Colyseus**. Each match is a Colyseus `Room` that owns the authoritative simulation (units, towers, gold, base HP, combat resolution, win/loss) on a fixed server tick. Clients send *intents* (deploy unit, pick slot) and render server state pushed via Colyseus's binary delta state sync. On match end the room calls Supabase (via the **service-role key, server-side only**) to write results/economy/progression through validated RPCs. Supabase stays the auth provider — the client passes its Supabase JWT to Colyseus, which verifies it.

| Pros | Cons |
|------|------|
| **One authoritative simulation** → eliminates the entire desync bug class in `CONCERNS.md` (combat resolved once, server-owned) | Adds a stateful Node service to operate (one more thing to deploy/monitor) — but a single small node covers many concurrent 1v1 rooms |
| Cheating becomes structurally hard — client cannot fabricate HP/gold/results; it sends intents only | A small monthly hosting cost (~$5–15/mo, see below) |
| Colyseus ships **rooms, matchmaking, state sync (binary deltas), reconnection, presence** out of the box — most of what a "real matchmaking + lobbies" milestone needs | Server sim logic must be **extracted from `GameScene` into shared/server TS** — but this is desirable refactoring anyway (GameScene is a 1100-line monolith per `CONCERNS.md`) |
| TypeScript end-to-end; shares unit/map data modules with the client | WebSocket transport differs from Supabase Realtime channels (two realtime systems coexist — acceptable, they have different jobs) |
| Determinism **not required** — server is the only truth | |

**Verdict: Recommended.** For a small team this is the highest-leverage option: it directly retires the documented desync + trust debt, and it provides matchmaking/lobby/room primitives so you don't hand-roll them on Supabase. Colyseus is mature, TS-native, and the simulation logic you must write is logic you'd write anyway.

### (c) Host-authoritative with server reconciliation

**How it would work:** One client (the host) is authoritative; the guest sends intents to the host and reconciles to host state. Supabase Realtime relays.

| Pros | Cons |
|------|------|
| No dedicated server; reuses Supabase relay | Host can still cheat (host *is* the authority) — only fixes desync, **not** the trust problem `CONCERNS.md` flags |
| Smaller change than (b) | Host advantage/latency asymmetry; host disconnect kills the match |
| | Economy/results still must be re-validated server-side anyway, so you don't escape needing Supabase-side authority |

**Verdict: Reject.** It solves desync but not cheating, and the v2.0 goal explicitly is to "pay down the client-authoritative trust debt." Half-measure.

### Recommendation

**Adopt (b) Colyseus as the realtime authority + Supabase as system-of-record and auth.** Use (a)'s Edge Functions/RPCs for the *non-realtime* authoritative writes (economy, unlocks, progression, queue resolution). This split plays each tool to its strength.

> If the team is adamantly opposed to running any server, fall back to (a) with **discrete server-validated writes only** (no live arbiter): keep realtime broadcast relay, but move *all* result/economy/stat writes behind Edge Function RPCs with server-side sanity checks, and accept that mid-match cheating is audited-not-prevented. Document this as a known limitation gating ranked play.

---

## Recommended Stack

### Core Technologies (NEW)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Colyseus** (`colyseus` / `@colyseus/core`) | `@colyseus/core` **0.17.x** (0.17.43, Jun 2026); meta pkg `colyseus` 0.17.x | Authoritative Node game server: rooms, matchmaking, server-tick simulation, binary state sync, reconnection | Mature TS-native authoritative-multiplayer framework; provides exactly the room/matchmaking/state-sync primitives this milestone needs. Avoids hand-rolling netcode. **HIGH** |
| **colyseus.js** (client SDK) | **0.16.x** (0.16.22) | Browser client to connect Phaser to Colyseus rooms, receive state deltas, send intents | Official client SDK; pairs with the server. Note the client (0.16) and server (0.17) track separate version lines — match per Colyseus compat table. **HIGH** |
| **@colyseus/schema** | **4.0.x** (4.0.24, Jun 2026) | Binary delta-encoded state serialization used by Colyseus rooms | Transitive via Colyseus; defines authoritative room state synced to clients efficiently. **HIGH** |
| **Supabase Edge Functions** (Deno runtime) | Platform feature (Deno 2-based runtime, 2026) | Authoritative *discrete* writes: claim match rewards, apply upgrades, resolve matchmaking, server-to-server hooks | Edge Functions hold the **service-role key server-side**, so they can do privileged validated writes the client must never do. Good for transactional economy ops, **not** for a game loop (2s CPU/request cap). **HIGH** |
| **@supabase/supabase-js** | **2.108.x** (2.108.1, Jun 2026) — upgrade from current 2.99 | Client SDK; add **Anonymous Sign-In** (`signInAnonymously`) + **private Realtime channels** (Broadcast/Presence authorization) | Newer minor adds/stabilizes anonymous auth (fixes the `'guest'` literal-id problem in `CONCERNS.md`) and private-channel authorization. Minor bump, low risk. **HIGH** |

### Supporting Libraries (NEW, server-side)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/supabase-js` (on the Colyseus server) | 2.108.x | Server-side client using **service-role key** to write results/economy after a match | Inside Colyseus room `onLeave`/match-end. Service-role bypasses RLS — keep this key **only** on the server, never in client/Vite env. |
| `jose` or Supabase's JWT verify helper | latest | Verify the client's Supabase JWT when it joins a Colyseus room | So Colyseus trusts a real authenticated user id, not a client-asserted one. |
| `zod` | latest 3.x | Validate intent payloads on the server (deploy events, loadout) and Edge Function request bodies | Replaces the unchecked `as`-cast broadcast payloads called out in `CONCERNS.md`. |

### Supporting Libraries (CONDITIONAL — only if you choose model (a)/lockstep, NOT needed with Colyseus)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `seedrandom` (or a tiny custom PRNG) | 3.x | Seeded deterministic RNG shared host/guest | **Only** if doing deterministic lockstep/replay validation. Not needed if Colyseus is the single authority. |
| Fixed-point / integer math discipline | — | Avoid float non-determinism across machines | Same — lockstep only. The server-authority model sidesteps this entirely. |

### Development Tools (NEW)

| Tool | Purpose | Notes |
|------|---------|-------|
| **Supabase CLI** (`supabase` local dev) | Manage Postgres migrations, RLS policies, Edge Functions in-repo | Directly addresses `CONCERNS.md` "RLS posture unverified / no migration files." Commit `supabase/migrations/*.sql` so the security boundary is reviewable. |
| **Vitest** | Test the extracted pure simulation + economy/RLS logic | `CONCERNS.md` flags zero tests; once sim logic leaves `GameScene` it becomes unit-testable (server sim, pathfinder, economy rules). Vite-native. |
| A small PaaS for the Colyseus node | Host the authoritative server | See hosting table below. |

---

## Supabase Building Blocks — How to Use Each

| Building block | Use it for | Do NOT use it for |
|----------------|-----------|-------------------|
| **Postgres + RLS** | Source of truth for `profiles`, `currency`/`wallet`, `unlocks`, `unit_upgrades`, `match_history`. RLS: client may `SELECT` own rows; **no client `UPDATE`/`INSERT`** on currency/unlocks. | Trusting client writes (the current `recordResult` direct-write is the exact anti-pattern to remove). |
| **Database Functions (`SECURITY DEFINER`) / triggers** | Atomic economy ops: `spend_currency()`, `apply_upgrade()`, `grant_match_reward()` — validate balance/ownership inside Postgres so it can't be bypassed. Triggers to derive `wins/losses`. | Long-running logic. |
| **Edge Functions (Deno)** | Authoritative HTTP RPCs the client calls: claim rewards, purchase/upgrade, **resolve matchmaking**, server-to-server callbacks from Colyseus. Can hold service-role key. | A realtime game tick (2s CPU cap; no persistent socket loop). Background tasks cap 150s free / 400s paid — fine for jobs, not for matches. |
| **Realtime — Broadcast (private channels)** | Lobby chat, "opponent found", ready-up state, queue UI updates. Now supports **private channels with RLS authorization** on `realtime.messages`, and `realtime.broadcast_changes()` to broadcast from DB triggers. | Authoritative game/economy state. It's an unverified relay by nature. |
| **Realtime — Presence** | Who's online, who's in the queue/lobby, online-status for the future async-raid vision. | Match authority or anything a client can lie about and matter. |
| **Realtime — Postgres Changes** | The existing room-join handshake works; fine to keep for lobby row updates, or migrate the whole lobby into Colyseus. | Carrying high-frequency in-match state (use Colyseus state sync). |
| **Anonymous Auth (`signInAnonymously`)** | Mint a real UUID for guest players → fixes the `'guest'` collision bug in `CONCERNS.md`; later "link identity" to convert to a permanent account. | — (recommend captcha to limit abuse, per Supabase docs). |
| **API keys** | Migrate to new **publishable (`sb_publishable_…`) / secret (`sb_secret_…`)** keys — legacy anon/service keys deprecate end of 2026. Keep secret/service-role key server-side only. | Putting any secret/service key in `VITE_`-prefixed env (it ships to the browser). |

### Matchmaking approaches that fit (pick the simplest that meets the need)

1. **Queue table + Edge Function (recommended start).** Client `INSERT`s into `matchmaking_queue` (rating, faction, region, status). A periodically-invoked or trigger-driven Edge Function pairs two compatible rows atomically (`SELECT ... FOR UPDATE SKIP LOCKED`), creates a Colyseus room (or `rooms` row), and notifies both via a **private Broadcast channel** or Postgres-changes on their queue row. Simple, debuggable, fully server-authoritative pairing.
2. **Colyseus built-in matchmaker.** Colyseus has `joinOrCreate`/`filterBy`/reserved seats. If the lobby moves into Colyseus anyway, let Colyseus do matchmaking and skip the queue table. Fewer moving parts once you're committed to Colyseus.
3. **Presence-based ad-hoc** (lowest effort, weakest control): players see each other via Presence and self-pair. Fine for casual "join friend" (the current code-join flow), not for ranked.

> Recommended: keep the existing **6-char code join** (friends) via the `rooms` table, and add **(1) queue-table matchmaking** for "Quick Match." Move to **(2)** only if you consolidate the lobby into Colyseus.

---

## Determinism Considerations (only relevant if you reject Colyseus)

If — and only if — you choose model (a) lockstep/replay-validation instead of a dedicated server, the TS/Phaser sim must become **bitwise-deterministic**:

- **Fixed timestep:** simulate at a constant tick (e.g. `1/30` or `1/60`); never feed `delta`/`Date.now()` into sim math. Current `GameScene.update(dt)` uses real `dt` — would need a fixed-step accumulator.
- **Seeded RNG:** replace any `Math.random()` (e.g. map pick, AI) in the sim path with a shared-seed PRNG (`seedrandom`); identical call order on both clients.
- **Float hazard:** `Math.hypot` distance combat and float positions can diverge across machines/CPUs. Lockstep would push toward fixed-point/integer math — a significant rewrite of `Unit`/combat.
- **Inputs-only networking:** broadcast intents + tick number, not state.

**This is exactly the cost the Colyseus recommendation avoids.** With a single server simulation there is one source of truth and float determinism across machines is irrelevant. Treat this section as the "if you go the hard way" appendix.

---

## Installation

```bash
# --- Server (new Node service, separate package or workspace) ---
npm install colyseus @colyseus/core @colyseus/schema
npm install @supabase/supabase-js   # service-role client, server-side only
npm install zod jose

# --- Client (existing Phaser app) ---
npm install colyseus.js
npm install @supabase/supabase-js@^2.108.1   # upgrade from 2.99 for anon auth + private channels

# --- Dev tooling ---
npm install -D vitest
npm install -D supabase   # Supabase CLI for migrations + RLS + Edge Functions in-repo

# Conditional — ONLY if you choose deterministic lockstep instead of Colyseus:
# npm install seedrandom @types/seedrandom
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Colyseus** (authoritative server) | **geckos.io** (WebRTC/UDP authoritative server) | If you need unreliable/low-latency UDP for fast-twitch sync. A lane-battler with discrete deploys does **not** — TCP/WebSocket state sync is fine, and Colyseus is higher-level. |
| Colyseus | **Nakama** (Heroic Labs) | If you wanted an all-in-one backend (auth+storage+matchmaking+RT) to *replace* Supabase. You already have Supabase; adding Nakama duplicates auth/DB. Overkill. |
| Colyseus | **Bare `ws`/`socket.io` authoritative server** | If you want zero framework and full control. More code (rooms, state sync, matchmaking, reconnection all hand-rolled) — wrong trade for a small team. |
| Edge Functions + RPC for economy | **Direct client writes with strict RLS** | RLS can gate *who* writes a row but not enforce *game rules* (e.g. "reward = f(match outcome)"). Use RPC/DB functions so the rule, not just the row owner, is enforced. |
| Queue table + Edge Function matchmaking | Colyseus built-in matchmaker | When the lobby fully lives in Colyseus; then skip the queue table. |
| Self-host Colyseus on Railway/Render/Fly | **Colyseus Cloud** ($15/mo) | If you want managed auto-scaling/regions and will pay for zero-ops. For a single small node, a generic PaaS is cheaper to start. |

### Colyseus hosting options (single small node covers many 1v1 rooms)

| Option | ~Cost (2026) | Notes |
|--------|--------------|-------|
| **Railway** | $5/mo Hobby (+usage credit) | Cheapest for a small always-on node; good DX. **Recommended start.** |
| **Render** | $7/mo (warm) or free (cold-start) | Avoid cold-start tier for a game server. |
| **Fly.io** | ~$2–25/mo | Regional placement; pricing variable post-free-tier. |
| **Colyseus Cloud** | from $15/mo | Managed, auto-scale, 32 regions — when you want zero ops. |

---

## What NOT to Add (explicit)

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Edge Functions as the realtime game arbiter** | 2s CPU/request cap; no persistent stateful tick loop; not a socket server | Colyseus room running the server tick |
| **Nakama / PlayFab / a second BaaS** | Duplicates Supabase auth+DB+RT you already run | Extend Supabase; add only Colyseus for the realtime authority |
| **geckos.io / raw UDP / WebRTC datachannels** | Unreliable-transport complexity unjustified for discrete-deploy lane combat | Colyseus over WebSocket |
| **Deterministic lockstep + fixed-point math rewrite** | Huge, fragile rewrite of `Unit`/combat to dodge a problem the server already solves | Single server-authoritative sim (Colyseus) |
| **Redis / external session store (now)** | A single Colyseus node holds room state in memory; premature for current scale | Add Colyseus's `@colyseus/redis-driver` **later**, only when scaling to multiple nodes |
| **A new ORM (Prisma/Drizzle) on the client** | Supabase PostgREST + RPC already covers data access; adds weight to the browser bundle | `supabase-js` query builder + RPCs; ORM optionally on the *server* only if desired |
| **Trusting client broadcasts for results/economy** (current model) | The documented cheat surface in `CONCERNS.md` | Server-owned state + Edge Function/DB-function RPCs |
| **Service-role / secret key in `VITE_` env** | Ships to the browser; total compromise | Keep secret key on Colyseus server / Edge Functions only |
| **State-replication broadcast of full sim over Supabase Realtime** | High-frequency state over an unverified relay = bandwidth + desync + cheat | Colyseus binary delta state sync |

---

## Integration Points With the Existing Stack

- **Auth stays Supabase.** Client authenticates with Supabase (add `signInAnonymously` for guests → kills the `'guest'` literal-id bug). Client passes its Supabase **access token** to Colyseus `client.join(room, { token })`; the room verifies the JWT (`jose`/Supabase verify) before seating the player.
- **`gameState` singleton** (`src/lib/gameState.ts`) becomes a *view* of server state for the battle (HP, gold) rather than the authority. Persistent fields (`unlockedUnits`, `wins`, `losses`, currency) are hydrated from Supabase on login and only changed via RPCs.
- **`GameScene` battle logic** is the source for the **server room's** simulation: extract units/towers/combat/gold/timer/pathfinder into shared TS consumed by the Colyseus room. The client `GameScene` becomes render + input + intent-send + state-apply. (This also fixes the 1100-line monolith debt in `CONCERNS.md`.)
- **`rooms` table / lobby:** keep code-join via `rooms` for friends; the host/guest handshake can either stay on Postgres-changes or move into Colyseus rooms. Quick-Match uses the new `matchmaking_queue` + Edge Function.
- **New Postgres schema** (commit as `supabase/migrations/`): `wallet`/`currency`, `unlocks`, `unit_upgrades`, `match_history`, `matchmaking_queue`, plus tightened RLS on `profiles` (`auth.uid() = id`). This directly closes the "RLS posture unverified" and "no migration files" concerns.
- **Deploy:** Vercel keeps serving the static client; **add one new deploy target** (Railway/Render/Fly) for the Colyseus node. Capacitor mobile connects to the same Colyseus WSS endpoint.

---

## Version Compatibility

| Package | Version | Notes |
|---------|---------|-------|
| `@colyseus/core` (server) | 0.17.x | Server line. Pair with `colyseus.js` 0.16.x per Colyseus's official client/server compatibility table — they version independently; verify the exact pair at install time. |
| `colyseus.js` (client) | 0.16.x | — |
| `@colyseus/schema` | 4.0.x | Transitive; used by 0.17 server. |
| `@supabase/supabase-js` | 2.108.x | Upgrade from current 2.99; minor, low risk. Provides anon auth + private channel authorization. |
| Supabase API keys | publishable/secret (`sb_*`) | Migrate before legacy anon/service keys deprecate (end of 2026). |
| Node (Colyseus host) | LTS (20/22) | Pin via `.nvmrc` on the server package — repo currently pins no Node version (`STACK.md`). |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Edge Functions can't host a game tick (2s CPU cap) | **HIGH** | Supabase official limits docs |
| Colyseus is the right authoritative-server fit + versions | **HIGH** | Context7 + npm (Jun 2026 releases) |
| Supabase private channels / Presence / anon auth / `sb_*` keys | **HIGH** | Supabase official docs + changelog |
| supabase-js 2.108.x current | **HIGH** | npm (Jun 2026) |
| Authority-model recommendation (Colyseus over a/c) | **MEDIUM** | Judgement call, but strongly supported by the documented constraints and `CONCERNS.md` debt |
| Hosting costs | **MEDIUM** | 2026 comparison articles (secondary sources), prices vary by usage |
| Determinism appendix | **HIGH** (as guidance) | Gaffer On Games + standard lockstep practice |

## Sources

- `/colyseus/docs`, `/colyseus/colyseus`, `/colyseus/schema` (Context7) — authoritative-server capabilities, rooms, matchmaking, schema
- npmjs.com — `@colyseus/core` 0.17.43, `colyseus.js` 0.16.22, `@colyseus/schema` 4.0.24, `@supabase/supabase-js` 2.108.1 (all Jun 2026) — HIGH
- supabase.com/docs/guides/functions/limits + /background-tasks — 2s CPU/request, 150s/400s background caps — HIGH
- supabase.com/docs/guides/realtime/{broadcast,authorization} — private channels, `realtime.broadcast_changes()`, Presence — HIGH
- supabase.com/docs/guides/auth/auth-anonymous — `signInAnonymously`, captcha, identity linking — HIGH
- supabase.com/changelog — legacy API key deprecation (publishable/secret keys) — HIGH
- gafferongames.com "Deterministic Lockstep"; daydreamsoft/snapnet articles — determinism requirements — HIGH (guidance)
- colyseus.io/pricing + Railway/Render/Fly 2026 comparison articles — hosting costs — MEDIUM

---
*Stack research for: server-authoritative realtime lane-battler on Supabase + Colyseus*
*Researched: 2026-06-12*
