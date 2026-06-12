# Architecture Research

**Domain:** Realtime PvP strategy game — migrating client-authoritative Phaser + Supabase to server-authoritative meta-systems (accounts, economy, progression, matchmaking)
**Researched:** 2026-06-12
**Confidence:** HIGH (Supabase authority primitives verified against official docs; integration shape derived from the mapped codebase)

## Executive Framing

This is a **subsequent milestone** layered onto a working v1.0 prototype. The non-negotiable
constraint is *no full rewrite*. The existing scene flow
(`BootScene → AuthScene → LobbyScene → PlacementScene → LoadoutScene → GameScene`) stays.
What changes is **where truth lives** and **what the scenes are allowed to do directly**.

Two distinct authority problems are conflated in the milestone and must be separated, because
they have very different cost/risk profiles:

1. **Meta-state authority (accounts, wallet, owned units, upgrades, match results).**
   This is *cheap and high-value* to move server-side. It does not touch the 60fps battle loop.
   It is a database + RLS + Edge Function problem. **Do this first.**

2. **Battle-simulation authority (combat resolution, gold, base HP tick).**
   This is *expensive and risky* — it means a server tick or deterministic lockstep, and it
   rewrites the hot path in `GameScene`. **Do this last, and only as far as validation needs.**

The key insight: **you do not need a server-authoritative battle simulation to get
server-authoritative economy and progression.** You need server-authoritative *result
acceptance*. The battle can stay client-simulated as long as the **outcome is validated and
the rewards are computed server-side** from a tamper-resistant match record. That decoupling
is what de-risks the whole milestone.

## Standard Architecture

### Authority Boundary (the core decision)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PHASER CLIENT (render + input only)                 │
│                                                                        │
│  Scenes:  Auth · Lobby · Placement · Loadout · Game                    │
│    │  read meta-state, render it, capture input                        │
│    │  run LOCAL battle sim for responsiveness (prediction)             │
│    ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  src/lib/ services layer  (NEW — the meta/persistence layer)    │   │
│  │  session · profile · wallet · inventory · progression ·         │   │
│  │  matchmaking · matchClient    (thin clients over Supabase)      │   │
│  └───────────────┬──────────────────────────────────────────────┘    │
└──────────────────┼─────────────────────────────────────────────────────┘
                   │  JWT-authenticated calls only
        ┌──────────┴───────────┬─────────────────────┬──────────────────┐
        ▼                      ▼                     ▼                  ▼
┌───────────────┐   ┌────────────────────┐  ┌────────────────┐ ┌──────────────┐
│ Supabase Auth │   │  Edge Functions     │  │ Postgres + RLS │ │  Realtime    │
│ (identity,    │   │  / Postgres RPC     │  │ (SOURCE OF     │ │  (private    │
│  JWT, uid)    │   │  (SERVER LOGIC:     │  │  TRUTH for     │ │  channels,   │
│               │   │  result validation, │  │  meta-state)   │ │  RLS-gated)  │
│               │   │  reward calc,       │  │                │ │              │
│               │   │  matchmaking pop,   │  │  players ·     │ │  match sync  │
│               │   │  spend/unlock txns) │  │  wallet ·      │ │  + presence  │
│               │   │                     │  │  inventory ·   │ │              │
│               │   │  uses service_role  │  │  matches ·     │ │              │
│               │   │  → bypasses RLS,    │  │  queue         │ │              │
│               │   │  is the ONLY writer │  │                │ │              │
│               │   │  of money/unlocks   │  │                │ │              │
└───────────────┘   └────────────────────┘  └────────────────┘ └──────────────┘
```

**The rule that makes this work:**

> The client may **read** meta-state (via RLS-protected SELECT) and **render** it.
> The client may **never write** wallet, inventory, upgrade levels, or match results directly.
> All economy/progression mutations go through an **Edge Function / RPC** that runs with
> `service_role` (or a `SECURITY DEFINER` Postgres function), is the sole writer to those
> tables, and recomputes values server-side from validated inputs.

This directly retires the HIGH-severity concern in `CONCERNS.md`: today `recordResult`
(`GameScene.ts:606`) writes `wins`/`losses`/`unlocked_units` straight to `profiles` from the
client, and gold is local-only. After this migration the client cannot touch any of it.

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Supabase Auth | Player identity, JWT issuance, `auth.uid()`. Replace literal `'guest'` with **anonymous auth** so every player has a real UUID | Existing; add `signInAnonymously()` for guests |
| Postgres tables | **Source of truth** for all meta-state. RLS = read boundary | New migrations in `supabase/migrations/` |
| RLS policies | Enforce *read* scope (`auth.uid() = user_id`) and *block all client writes* to money/inventory/result tables | SQL policies, committed to repo |
| Edge Functions / RPC | **Server logic** — the only writers of wallet/inventory/upgrades/results. Validate match outcomes, compute rewards atomically, pop matchmaking queue | Deno Edge Functions (`supabase/functions/`) and/or `SECURITY DEFINER` SQL RPCs |
| Realtime (private channels) | In-match action transport between the two clients. Gate join via RLS on `realtime.messages` so only the two match participants can subscribe | Existing channels, upgraded to `private: true` |
| `src/lib/` services layer | Thin typed clients the scenes consume. Hide Supabase wiring; expose `wallet.get()`, `inventory.unlock()`, `matchmaking.enqueue()`, `matchClient.submitResult()` | NEW modules, extends existing `src/lib/` |
| Phaser scenes | Render meta-state + run battle sim locally for feel. **Stop owning persistence.** | MODIFIED (thinned, not rewritten) |
| Battle authority (later) | Validate/reconcile the client-run battle. Two viable levels (see Build Order Phase D) | NEW, deferred |

### Why Edge Functions + RPC, not a dedicated game server

A standalone authoritative game-server (Node + websockets, e.g. Colyseus) is the textbook
answer for server-authoritative realtime games, but it is the **wrong first step here**:

- It contradicts the "no rewrite / stay on Supabase" key decision in `PROJECT.md`.
- It adds an always-on stateful service to deploy/scale/monitor — large new ops surface.
- Meta-state (the high-value 80%) needs **transactions, not a tick loop** — Postgres/RPC nails it.

Edge Functions (stateless, JWT-validated, `service_role`-capable, regionally distributed —
confirmed in Supabase docs) cover **everything except a continuous authoritative tick**. The
only thing they can't do is run a 30Hz server simulation. So defer the question "do we need a
server tick?" until Phase D, and answer it with the cheapest mechanism that closes the actual
cheat vectors (result validation), escalating to a real game-server **only if** competitive
integrity later demands it. Flag for the roadmap: a dedicated game-server is a *possible future
milestone*, explicitly out of scope for v2.0.

## Recommended Project Structure

```
supabase/                          # NEW — backend made reviewable (closes CONCERNS RLS gap)
├── migrations/                    # versioned SQL: tables + RLS policies
│   ├── 0001_players_profiles.sql
│   ├── 0002_wallet_inventory.sql
│   ├── 0003_progression.sql
│   ├── 0004_matches_queue.sql
│   └── 0005_rls_policies.sql
└── functions/                     # Deno Edge Functions (server logic / sole writers)
    ├── submit-match-result/       # validate outcome → compute + write rewards (atomic)
    ├── matchmake/                 # pop queue, pair players, create match row
    └── unlock-unit/               # spend currency → grant unit (atomic txn)

src/
├── lib/                           # MODIFIED — promote from "singletons" to a services layer
│   ├── supabase.ts                # unchanged client
│   ├── gameState.ts               # SHRINKS → live battle/session cache only, NOT truth
│   ├── api/                       # NEW — typed thin clients over Supabase
│   │   ├── session.ts             # auth (+ anonymous), current uid, JWT lifecycle
│   │   ├── profile.ts             # read profile/stats
│   │   ├── wallet.ts              # read balance (write = via Edge Fn only)
│   │   ├── inventory.ts           # read owned units; unlock() calls unlock-unit fn
│   │   ├── progression.ts         # read upgrade levels; upgrade() calls Edge Fn
│   │   ├── matchmaking.ts         # enqueue/dequeue/poll; calls matchmake fn
│   │   └── matchClient.ts         # in-match realtime + submitResult() → Edge Fn
│   ├── pathfinder.ts              # unchanged
│   └── audio.ts                   # unchanged
├── sim/                           # NEW — battle simulation EXTRACTED from GameScene
│   ├── BattleSim.ts               # pure-ish tick: units, towers, walls, gold, baseHP
│   ├── combat.ts                  # combat resolution (testable)
│   └── snapshot.ts                # serialize match outcome → result payload for server
├── towers/                        # FILL the empty dir — Tower.ts + TowerData.ts (existing debt)
├── scenes/                        # MODIFIED — thinned; consume lib/api + sim/
│   └── GameScene.ts               # orchestrates BattleSim + renders; no persistence
├── units/  maps/  types/          # mostly unchanged; types/ gains DB row contracts
```

### Structure Rationale

- **`supabase/` committed to repo:** directly closes the MEDIUM "RLS posture unverified" concern.
  The security boundary becomes reviewable SQL, not an unknown dashboard state.
- **`src/lib/api/`:** the scenes already import `src/lib/` singletons; making `lib/` a proper
  services layer is the *smallest* structural change that decouples scenes from Supabase wiring.
  Scenes go from "call `supabase.from('profiles').update(...)`" to "call `wallet.get()`".
- **`src/sim/`:** extracting the battle loop out of the 1100-line `GameScene` is a prerequisite
  for *any* battle-authority work (Phase D) and pays down the monolith debt. A pure-ish sim is
  also unit-testable (closes the "zero tests" concern) and is what you'd later run server-side
  or in lockstep.
- **`gameState.ts` shrinks:** today it conflates session identity, *persistent* progression, and
  *live* battle values. Persistent fields (`unlockedUnits`, `wins`, `losses`, `gold`-as-currency)
  move to server truth read via `lib/api`. `gameState` keeps only ephemeral per-session/per-match
  cache (`roomId`, `role`, `mapId`, live `hostBaseHp`/`guestBaseHp`, in-match `gold`).

## Data Model (Postgres)

All tables keyed off `auth.uid()`. RLS column noted per table.

```sql
-- 0001: identity & profile -------------------------------------------------
players (
  id           uuid primary key references auth.users(id),  -- = auth.uid()
  created_at   timestamptz default now(),
  is_anonymous boolean default false                          -- guest vs full account
)
profiles (
  user_id      uuid primary key references players(id),
  username     text unique not null,
  faction_pref text,                                          -- machines|plants|wizards
  wins         int default 0,
  losses       int default 0,
  elo          int default 1000,                              -- lobby already advertises ELO
  updated_at   timestamptz default now()
)

-- 0002: economy -------------------------------------------------------------
wallets (
  user_id      uuid primary key references players(id),
  soft_balance bigint default 0 not null check (soft_balance >= 0)  -- battle-earned gold
  -- (premium/hard currency column can be added later; out of scope now)
)
wallet_ledger (                       -- append-only audit; never UPDATE/DELETE
  id           bigserial primary key,
  user_id      uuid references players(id),
  delta        bigint not null,       -- +earn / -spend
  reason       text not null,         -- 'match_reward' | 'unlock:assault_bot' | 'upgrade:...'
  match_id     uuid references matches(id),  -- nullable
  created_at   timestamptz default now()
)
inventory (                           -- owned units (replaces unlocked_units array)
  user_id      uuid references players(id),
  unit_id      text not null,         -- 'assault_bot' etc (matches UnitData ids)
  acquired_at  timestamptz default now(),
  primary key (user_id, unit_id)
)

-- 0003: progression ---------------------------------------------------------
upgrades (
  user_id      uuid references players(id),
  scope        text not null,         -- 'unit' | 'faction' | 'tower'
  target_id    text not null,         -- e.g. 'scout_drone', 'machines'
  level        int default 1 not null check (level >= 1),
  primary key (user_id, scope, target_id)
)

-- 0004: matches & matchmaking ----------------------------------------------
matches (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid references players(id),
  guest_id      uuid references players(id),
  map_id        int not null,                  -- persisted → fixes map-sync race
  state         text not null,                 -- 'pending'|'active'|'reported'|'settled'|'disputed'
  host_faction  text, guest_faction text,
  winner_id     uuid references players(id),   -- written server-side only
  host_seed     bigint, guest_seed bigint,     -- shared RNG seed for determinism (Phase D)
  created_at    timestamptz default now(),
  settled_at    timestamptz
)
match_reports (                       -- each client's claimed outcome; server compares
  match_id      uuid references matches(id),
  reporter_id   uuid references players(id),
  claimed_winner uuid,
  result_hash   text,                 -- hash of final sim snapshot (cheat detection)
  reported_at   timestamptz default now(),
  primary key (match_id, reporter_id)
)
matchmaking_queue (
  user_id       uuid primary key references players(id),
  faction       text,
  elo           int,
  mode          text default '1v1',
  enqueued_at   timestamptz default now()
)
```

### Where RLS Applies (the integrity boundary)

| Table | Client SELECT | Client INSERT/UPDATE/DELETE | Written by |
|-------|---------------|------------------------------|-----------|
| `players`, `profiles` | own row (`auth.uid() = user_id`); profiles maybe public-read for opponent name | **profiles: own row, but ONLY non-authoritative columns** (username/faction_pref). `wins/losses/elo` blocked from client | Edge Fn for stats |
| `wallets` | own row only | **DENIED entirely** | Edge Fn (`service_role`) |
| `wallet_ledger` | own rows, read-only | **DENIED entirely** (append-only via fn) | Edge Fn |
| `inventory` | own rows | **DENIED entirely** | `unlock-unit` Edge Fn |
| `upgrades` | own rows | **DENIED entirely** | `upgrade` Edge Fn |
| `matches` | rows where `host_id` or `guest_id = auth.uid()` | INSERT denied (created by `matchmake` fn); UPDATE denied | `matchmake` + `submit-match-result` fns |
| `match_reports` | own report + opponent's for own match | **INSERT own report allowed** (this is the client's claim) | client INSERT, server reads |
| `matchmaking_queue` | own row | INSERT/DELETE own row allowed (enqueue/leave); but pairing done by fn | client enqueue, fn pairs |
| `realtime.messages` | — | RLS policy: only `host_id`/`guest_id` of the match may read/write the `match:<id>` topic | Realtime gate |

The pattern: **clients can SELECT their own data and can INSERT only their *claims*
(queue entry, match report). They can never write authoritative balances/inventory/results.**
Authoritative writes are funneled through `SECURITY DEFINER` RPCs / Edge Functions running as
`service_role`, which are the single writers and enforce invariants (balance ≥ 0, can't unlock
twice, reward matches a validated result).

## Data Flow: battle → validation → economy → progression → profile

```
1. MATCHMAKE
   client → matchmaking.enqueue()         → INSERT matchmaking_queue (RLS: own row)
   Edge Fn `matchmake` (cron/invoke)      → pairs two rows, DELETEs them,
                                            INSERTs matches{state:'pending', map_id, seeds}
   both clients ← Realtime/poll matches    → advance to PlacementScene (map_id authoritative)

2. PLAY (battle runs CLIENT-SIDE as today, but instrumented)
   GameScene runs BattleSim locally for both players (prediction/feel preserved)
   in-match deploys/wall-breaks sync over PRIVATE Realtime channel match:<id>
   (RLS-gated: only the two participants can join)

3. REPORT (each client submits its claimed outcome)
   on game over: matchClient.submitResult()
     → INSERT match_reports{ claimed_winner, result_hash }  (RLS: own report only)

4. VALIDATE + SETTLE (server is the arbiter here)
   Edge Fn `submit-match-result` (or triggered when both reports land):
     a. compare both match_reports
        - agree            → accept winner
        - disagree/missing → mark match 'disputed' (later: replay/seed re-sim), no rewards
     b. (Phase D) optionally re-simulate from seeds+inputs to verify result_hash
     c. ATOMIC transaction (service_role):
        - UPDATE matches{ winner_id, state:'settled' }
        - UPDATE profiles{ wins/losses/elo }          ← server-only
        - INSERT wallet_ledger{ +match_reward }        ← server-only
        - UPDATE wallets{ soft_balance += reward }     ← server-only
        - (unlock thresholds evaluated server-side; grant inventory if crossed)

5. SPEND (economy → progression, fully server-authoritative)
   client → inventory.unlock('assault_bot') / progression.upgrade('scout_drone')
     → Edge Fn validates: enough balance? not already owned? valid target?
     → ATOMIC: wallets -= cost ; wallet_ledger INSERT ; inventory/upgrades INSERT/UPDATE
   client ← refetch wallet + inventory → re-render LoadoutScene

6. PROFILE READ (everywhere)
   scenes read via lib/api (profile.get(), wallet.get(), inventory.list())
   gameState caches for the session; truth is always re-fetchable from Postgres
```

Today's flow (`recordResult` writing `profiles` directly, gold local-only, unlock thresholds
hardcoded in two scenes) collapses into **step 4 server-side**, where it can't be forged.

## Architectural Patterns

### Pattern 1: Server-as-sole-writer (RLS read / RPC write)

**What:** Clients read state through RLS-scoped SELECTs but mutate *only* through Edge
Functions / `SECURITY DEFINER` RPCs that run as `service_role`. Authoritative tables have **no
client-write RLS policy at all**.
**When:** All economy/progression/result writes.
**Trade-offs:** + Single auditable mutation path, impossible to forge balances, atomic.
− Slightly more latency than a direct write; every mutation is a function you must author and
deploy. Worth it: it is the entire point of the milestone.

```ts
// src/lib/api/inventory.ts
export async function unlock(unitId: string) {
  const { data, error } = await supabase.functions.invoke('unlock-unit', { body: { unitId } })
  if (error) throw error
  return data            // server already debited wallet + granted inventory atomically
}
```

### Pattern 2: Optimistic local sim + authoritative settlement (don't move the tick yet)

**What:** Keep the battle running client-side for 60fps responsiveness, but treat the result as
a *claim* that the server validates against the opponent's claim (and later a seed re-sim). The
server, not the client, decides rewards.
**When:** v2.0 battle integrity — the affordable middle ground between "trust the client" (today)
and "full server tick" (expensive).
**Trade-offs:** + No realtime hot-path rewrite; closes the worst cheat vectors (forged rewards,
forged unlocks). − Two colluding clients could still agree on a false result; a lone cheater is
caught by report disagreement. Good enough for v2.0; escalate in a future milestone if ranked
needs it.

### Pattern 3: Deterministic sim with shared seed (enables real validation later)

**What:** `BattleSim` is fully deterministic given (map, both loadouts, shared seed, ordered
input log). Both clients run the identical sim; the server *can* re-run it from the recorded
inputs to verify `result_hash`.
**When:** Phase D, when result validation needs teeth, or when moving toward lockstep.
**Trade-offs:** + Cheap server validation (replay, not live tick); fixes the desync concern
(both clients deterministic → no divergence). − Requires removing nondeterminism from the sim
(the O(n²) `filter`/`sort`/`Math.hypot` nearest-enemy logic must be made order-stable; floating
point must be controlled). This is why `src/sim/` extraction (Phase A) must precede it.

## Anti-Patterns

### Anti-Pattern 1: Big-bang server-authoritative rewrite

**What people do:** Stand up a Node game-server, move the tick server-side, rebuild matchmaking
and economy all at once.
**Why it's wrong:** Violates the milestone's "no rewrite" constraint, blocks all value behind one
huge risky change, and the realtime tick is the *hardest* part — front-loading it maximizes risk.
**Do this instead:** Ship meta-authority (accounts/economy/progression) on the existing client
sim first; move battle authority last and only as far as validation requires.

### Anti-Pattern 2: Letting `gameState` keep being the source of truth

**What people do:** Keep reading/writing `unlockedUnits`, `gold`, `wins` from the
`gameState` singleton and "sync" it to Supabase.
**Why it's wrong:** It re-creates the trust problem — the client mutates truth then pushes it.
**Do this instead:** `gameState` becomes a *read-through cache* of server truth for the session;
the server is canonical. Persistent fields leave `gameState` for `lib/api`.

### Anti-Pattern 3: Trusting Realtime broadcasts as authoritative

**What people do:** Accept opponent `base_hp`/`game_over` broadcasts as fact (today's model).
**Why it's wrong:** Any modified client forges a win (documented HIGH concern).
**Do this instead:** Broadcasts are *presentation sync only*; the binding result comes from the
server settling `match_reports`. Use **private** channels so only participants can even send.

## Integration Points

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Scene ↔ meta-state | `src/lib/api/*` typed clients | scenes never touch `supabase.from()` for authoritative tables |
| `lib/api` ↔ truth | RLS SELECT (read) + Edge Fn invoke (write) | the authority boundary |
| Client ↔ client (in match) | private Realtime channel `match:<id>` | RLS on `realtime.messages` restricts to participants |
| GameScene ↔ BattleSim | method calls + snapshot | sim extracted to `src/sim/`, scene renders it |
| Edge Fn ↔ Postgres | `service_role` / `SECURITY DEFINER` | sole writer of money/inventory/results |
| Guest identity | `supabase.auth.signInAnonymously()` | replaces literal `'guest'`; every player gets a real uid |

## Build Order (dependency- and risk-ordered)

Ordered so each phase ships independent value and the riskiest change (battle authority) comes
last on top of the safest possible foundation.

**Phase 0 — Backend foundation made reviewable (prerequisite, low risk)**
- Add `supabase/migrations/` with the schema above; commit RLS policies.
- Add anonymous auth so guests get real UUIDs (fixes `'guest'` collision concern).
- Add Vitest; first tests target `pathfinder.ts` (the bug-prone module).
- *De-risks:* makes the security boundary reviewable before any logic depends on it.

**Phase A — Extract the services layer + the sim (refactor, no behavior change)**
- Introduce `src/lib/api/*`; route existing reads/writes through it (still client-trusted for now).
- Extract battle loop from `GameScene` into `src/sim/BattleSim.ts`; fill `src/towers/`.
- Shrink `gameState` to session/battle cache.
- *De-risks:* decouples scenes from Supabase and from the monolith *before* changing authority,
  so later phases are small diffs, not rewrites. Pure sim becomes testable.

**Phase B — Server-authoritative accounts + economy (first real authority move)**
- Move profile stats, wallet, inventory to server truth; add `unlock-unit` Edge Fn.
- Remove client writes to `profiles.unlocked_units`/`wins`; `LoadoutScene` reads inventory.
- *De-risks:* proves the read-RLS / write-via-fn pattern on non-realtime surface area first.

**Phase C — Progression + matchmaking (build on the proven pattern)**
- Add `upgrades` + `upgrade` Edge Fn; matchmaking queue + `matchmake` fn; `matches` row drives
  Placement (persisted `map_id` fixes the map-sync race concerns).
- Real lobby replaces room-code-only flow; ELO column starts being read.

**Phase D — Battle authority / result validation (highest risk, last)**
- Make `BattleSim` deterministic (shared seed; order-stable combat — also fixes desync + O(n²)).
- Clients submit `match_reports`; `submit-match-result` Edge Fn compares + settles rewards
  server-side (Pattern 2). Optional seed re-sim for verification (Pattern 3).
- Private Realtime channels for in-match sync.
- *Escalation hatch (future milestone, out of scope):* if collusion/ranked integrity demands it,
  promote validation to a dedicated authoritative game-server. The deterministic sim from this
  phase is exactly what that server would run.

## Scaling Considerations

| Scale | Adjustments |
|-------|-------------|
| 0–1k players | Edge Functions + Postgres + Realtime as designed; no game-server needed |
| 1k–100k | Index `matchmaking_queue(elo, mode)`; move `matchmake` to scheduled/queue-drain; cache hot profile reads; partition `wallet_ledger` by month |
| 100k+ / ranked | Consider dedicated authoritative game-server for live validation; Realtime sharding; read replicas for leaderboards (deferred per PROJECT scope) |

### Scaling Priorities
1. **First bottleneck:** matchmaking pairing under load → make `matchmake` a queue-drainer, not per-request.
2. **Second bottleneck:** `submit-match-result` contention on hot rows → keep ledger append-only, settle in a single transaction per match.

## Sources

- [Edge Functions Architecture | Supabase Docs](https://supabase.com/docs/guides/functions/architecture) — regionally distributed, stateless, JWT-aware (HIGH)
- [Securing Edge Functions | Supabase Docs](https://supabase.com/docs/guides/functions/auth) — `verify_jwt`, session JWT on Authorization header (HIGH)
- [Realtime Authorization | Supabase Docs](https://supabase.com/docs/guides/realtime/authorization) — RLS on `realtime.messages`, private channels, policy caching (HIGH)
- [Supabase Realtime: Broadcast and Presence Authorization](https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization) — gating channel join/send via RLS (MEDIUM)
- [Realtime | Supabase Docs](https://supabase.com/docs/guides/realtime) — broadcast vs postgres_changes transport (HIGH)
- Codebase map: `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `CONCERNS.md`; `src/lib/gameState.ts`, `src/lib/supabase.ts`, `src/main.ts` (HIGH — primary integration evidence)

---
*Architecture research for: server-authoritative meta-systems on Phaser + Supabase*
*Researched: 2026-06-12*
