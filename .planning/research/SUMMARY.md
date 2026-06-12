# Project Research Summary

**Project:** Path Raiders -- Milestone v2.0 (Persistent Game Foundations)
**Domain:** Competitive realtime 1v1 lane-battler -- migrating client-authoritative Phaser 3 + Supabase to server-trusted accounts, economy, progression, and matchmaking
**Researched:** 2026-06-12
**Confidence:** HIGH on building blocks (Supabase limits, schema/RLS patterns, genre features, pitfalls); MEDIUM on the one judgement call -- the realtime authority model (see Key Architecture Decision)

## Executive Summary

Path Raiders v2.0 turns a working v1.0 realtime prototype into an account-based game where a single battle matters over time. This is a **foundational slice**, not the full game -- the goal is the minimum persistent systems (identity, one soft currency, deterministic unlocks, real matchmaking, server-trusted results) that make the loop durable, with async raids, seasons, clans, leaderboards, and monetization all deliberately deferred. The genre (Clash Royale / Clash of Clans class) has years of feature accretion; almost all of it is anti-feature for a foundation. The disciplined move is one currency, deterministic (non-gacha) unlocks, unlock-only progression first, and hidden-MMR pairing -- defer the visible ladder and per-unit levels to v2.x.

The architecture insight that de-risks the whole milestone: **you do not need a server-authoritative battle simulation to get a server-authoritative economy.** You need server-authoritative result acceptance. The high-value 80% (wallet, inventory, upgrades, match results) is a Postgres + RLS + Edge Function/RPC problem -- clients read their own rows but can never write money/unlocks/results; all mutations flow through SECURITY DEFINER RPCs / Edge Functions that are the sole writers and recompute every value server-side. The battle can keep running client-side as long as its outcome is submitted as a claim, compared against the opponent claim, bounds-checked, and settled server-side. A determinism pass (fixed timestep + seeded PRNG + stable entity ids + order-stable combat) is the prerequisite that makes that validation possible -- and keeps the door open to full lockstep or a dedicated game-server later without reworking the schema.

The dominant risks are economic and concurrency-shaped, not graphical: client-trusted rewards (today the recordResult path writes wins/unlocks straight from the client), non-idempotent reward grants (double-pay on retry), lost-update races on currency, matchmaking double-joins, ghost/abandoned matches, and -- the live, already-present danger -- unverified RLS plus a committed .env.local/anon key. Every one has a known, cheap prevention (atomic guarded UPDATE, unique match_id + ON CONFLICT DO NOTHING, FOR UPDATE SKIP LOCKED, server now(), committed RLS migrations, service-role key kept server-side only). The single decision the user must consciously confirm is the realtime authority model, detailed below.

## Key Findings

### Recommended Stack

The existing stack (Phaser 3.90 + TS ~5.9 + Vite 8 + Supabase + Vercel/Capacitor) is fixed. What v2.0 adds is small and mostly inside Supabase: committed Postgres migrations with tightened RLS, SECURITY DEFINER DB functions / Deno Edge Functions as the sole writers of money/unlocks/results, anonymous auth (kills the literal guest-id collision), private Realtime channels for in-match sync, a matchmaking_queue table paired with an atomic matchmaker, plus Vitest and the Supabase CLI to make the backend reviewable and testable (the repo currently has zero tests and no migration files). A minor supabase-js bump (2.99 -> 2.108.x) unlocks anonymous auth + private-channel authorization.

The one genuinely new infrastructure candidate is **Colyseus** (a dedicated authoritative Node game-server), which STACK.md recommends and ARCHITECTURE.md/PITFALLS.md recommend deferring -- reconciled in the Key Architecture Decision section.

**Core technologies (additions):**
- **Postgres + RLS + SECURITY DEFINER RPCs / Edge Functions** -- sole authoritative writers of wallet, inventory, upgrades, results; clients read own rows, never write the authoritative ones. HIGH.
- **Supabase Edge Functions (Deno)** -- discrete authoritative writes (reward grant, unlock, matchmake-pop, result validation). Excellent for request/response; **cannot** host a per-tick game loop (~2s CPU cap, ~400ms cold/~125ms hot, stateless isolates). HIGH.
- **Anonymous auth + private Realtime channels** (supabase-js 2.108.x) -- real UUID per guest; in-match sync gated by RLS to the two participants. HIGH.
- **matchmaking_queue table + atomic matchmaker** (SELECT ... FOR UPDATE SKIP LOCKED) -- keep the existing 6-char code-join for friends; add a Quick Match queue. HIGH.
- **Vitest + Supabase CLI** -- test the extracted pure sim + economy/RLS; commit supabase/migrations SQL so the security boundary is reviewable. HIGH.
- **Colyseus (colyseus/core 0.17.x / colyseus.js 0.16.x)** -- deferred upgrade path for realtime authority; not adopted in v2.0 under the recommendation below. See Key Architecture Decision.

### Expected Features

The MVP is the smallest set where a battle persistently matters; the deep genre meta is explicitly deferred.

**Must have (table stakes):**
- **Server-trusted battle outcome** -- the keystone; without it currency/progression are forgeable. HIGH cost, P1.
- **Persistent account + profile** (identity, display name, lifetime W/L) -- extend existing profiles. LOW.
- **Single persistent soft currency earned per battle** -- distinct from in-match gold (reusing in-match gold is a named trap). LOW-MED.
- **Deterministic unit unlocks** -- spend currency to unlock the 3 non-starter units (Assault Bot, Thorn Beast, Elementalist). LOW.
- **Server-authoritative persistence of currency + unlocks + record.** MED.
- **Basic matchmaking queue** (a Battle button finds an opponent) -- FIFO acceptable to start. MED-HIGH.
- **Post-match summary** integrating reward/progress (UI designs owned by user -- integrate, do not design).
- **Keep room-code friend challenge** as the social/test path (already built).

**Should have (competitive -- most deferrable to v2.x):**
- **Hidden MMR + skill-based pairing** (bounded range expanding with queue time) -- biggest retention lever; upgrade the FIFO queue.
- **Visible rank/trophy number** -- motivation surface once MMR exists.
- **Per-unit upgrade levels / faction+tower progression** -- depth, but a balance/power-creep sink; unlock-only first.
- **Match history list** -- retention polish.

**Defer (v2.x and later milestones -- deliberate non-goals):**
- Async base-building & raids (the long-term core -- separate milestone).
- Seasons / battle pass, clans/guilds, global leaderboards/ranked ladder.
- Hard currency / IAP, gacha/loot chests, cosmetics/skins.
- Engagement-optimized (rigged) matchmaking -- honest fairness is the strategy at this stage.

### Architecture Approach

No rewrite. The scene flow (Boot -> Auth -> Lobby -> Placement -> Loadout -> Game) stays; what changes is **where truth lives** and **what scenes may do directly**. Separate the two authority problems: meta-state authority (accounts/wallet/inventory/upgrades/results) is cheap, high-value, transactional -- do it first; battle-simulation authority is expensive and risky -- do it last and only as far as validation needs. gameState shrinks from source-of-truth to a session/battle read-through cache; persistent fields move to server truth read via a new src/lib/api/ services layer. The battle loop extracts from the 1100-line GameScene into a pure-ish src/sim/BattleSim.ts, which is both unit-testable and exactly what a future server or lockstep would run.

**Major components:**
1. **supabase/migrations + RLS** -- committed SQL schema (players, profiles, wallets, wallet_ledger, inventory, upgrades, matches, match_reports, matchmaking_queue) making the security boundary reviewable.
2. **Edge Functions / SECURITY DEFINER RPCs** -- sole writers of money/inventory/results; validate outcomes, compute rewards atomically, pop the queue, settle matches.
3. **src/lib/api services layer** -- thin typed clients (session, profile, wallet, inventory, progression, matchmaking, matchClient) so scenes never touch supabase.from() for authoritative tables.
4. **src/sim/BattleSim.ts** -- battle loop extracted from GameScene; pure, testable, deterministic-ready.
5. **Private Realtime channels** -- in-match presentation sync only (untrusted; never authoritative).

### Critical Pitfalls

1. **Treating Edge Functions as a per-tick game server** -- they cannot hold a 30-60Hz loop (stateless isolates, ~2s CPU/req). Use them for discrete result-validation/reward/matchmake RPCs; pick the right authority granularity (result validation for v2.0), not moving update() server-side.
2. **Assuming the sim is deterministic (it is not)** -- dt-scaled movement, unstable Math.hypot target sort, unseeded Math.random(), two independent sims papered over by base_hp broadcasts. Do an explicit determinism pass (fixed timestep + seeded PRNG + stable entity ids + order-stable combat) before any validation/lockstep claim. Single highest-risk technical item -- flag for deeper research.
3. **Client-trusted economy rewards** -- currency must be server-derived from a validated match record, never client-supplied. Any RPC param named amount/gold/reward is a red flag; balance numbers live in a server-side config table.
4. **Non-idempotent grants + lost-update races** -- unique match_id + INSERT ... ON CONFLICT DO NOTHING in one transaction (retry credits once); atomic UPDATE ... WHERE gold >= cost + CHECK (gold >= 0) (no double-spend/negatives).
5. **Live RLS / key exposure (already present) + matchmaking races + ghost matches** -- commit RLS migrations, keep service_role server-only (CI bundle scan), git rm --cached .env.local + rotate; match atomically with FOR UPDATE SKIP LOCKED; give matches a server-stamped lifecycle (queued->active->completed/abandoned) with now()-based timeouts and a pg_cron sweep.

## Key Architecture Decision

**This is the one decision to consciously confirm before roadmapping.** The research deliberately contains a tension: STACK.md recommends adopting Colyseus now; ARCHITECTURE.md and PITFALLS.md recommend staying Supabase-only for v2.0. Both are well-argued -- they optimize for different things. Reconciled below.

### The question

How does v2.0 establish authority over the realtime battle so that economy/progression are trustworthy?

### Option A -- Supabase-only result validation (RECOMMENDED for v2.0)

Clients keep running the battle locally (60fps feel preserved). On match end, each client submits its claimed outcome (winner, final base HP, gold earned, duration, deploy log + seed) as a match_report. An Edge Function / RPC compares both reports, bounds-checks the result server-side, and only then settles rewards/stats/elo atomically. A determinism pass (fixed timestep, seeded PRNG, stable ids, order-stable combat) is a prerequisite sub-phase -- it makes server re-derivation/plausibility-checking possible and is exactly the work a future lockstep/dedicated server would need.

| Pros | Cons |
|------|------|
| Honors the no-rewrite / stay-on-Supabase decision in PROJECT.md | Two colluding clients could still agree on a false result (a lone cheater is caught by report disagreement) |
| Zero new always-on infrastructure to deploy/scale/monitor | Mid-match cheating is audited after, not prevented live |
| Kills the worst exploits today (forged win reports, fabricated base_hp=0, infinite currency) | Determinism pass is real work (but needed for Option B anyway) |
| Lowest risk; ships meta-value incrementally; sim becomes testable | Not sufficient for ranked integrity later (acceptable -- ranked is out of scope) |
| Determinism pass keeps the upgrade path to B fully open | |

### Option B -- Dedicated Colyseus game-server alongside Supabase (the upgrade path)

A small Node service runs each match as a Colyseus Room owning the authoritative tick (units, towers, gold, base HP, win/loss). Clients send intents and render server state. On match end the room writes results via Supabase (service-role, server-side). Determinism is not required -- one server simulation is the single truth.

| Pros | Cons |
|------|------|
| One authoritative sim -> eliminates the entire desync bug class | Adds a stateful Node service to deploy/scale/monitor (new ops surface) |
| Cheating is structurally hard -- client sends intents only, cannot fabricate state | Small recurring hosting cost (~5-15 USD/mo) |
| Ships rooms/matchmaking/state-sync/reconnection out of the box | Battle logic must be extracted from GameScene into shared/server TS (desirable refactor regardless) |
| Determinism not required; TS end-to-end | Two realtime systems coexist (Colyseus WS + Supabase Realtime); contradicts the no-new-infra posture |

### Recommendation

**Adopt Option A (Supabase-only result validation) for v2.0**, with the determinism pass as a prerequisite and Colyseus documented as the explicit upgrade path. For a small team building a foundation, A retires the documented trust/desync debt at the lowest risk, ships meta-value incrementally, and keeps every door open. Promote to B (Colyseus) only when realtime authority becomes the actual bottleneck -- i.e. when ranked play or collusion resistance is on the table (a future milestone, explicitly out of scope now). Because the Option A determinism pass produces exactly the deterministic sim a Colyseus room would run, choosing A now does not throw away work if B is needed later.

> If the team wants maximal cheat-resistance from day one and is comfortable operating one more service, B is defensible -- but it front-loads the hardest, riskiest change against a foundation milestone whose value is mostly non-realtime (accounts/economy/progression). **Confirm A vs B before the roadmapper structures the battle-authority phase.**

## Implications for Roadmap

Research converges cleanly on a dependency- and risk-ordered build: make the backend reviewable, refactor seams, then move authority on the cheap surface first, and tackle battle authority last. Suggested phases:

### Phase 0: Foundations -- backend made reviewable and safe
**Rationale:** The live RLS/key exposure is a present risk; everything downstream trusts this boundary. Must precede any economy work.
**Delivers:** supabase/migrations (schema + RLS), anonymous auth (real guest UUIDs), service_role kept server-only + CI bundle scan, .env.local untracked + key rotated, Vitest wired with first pathfinder tests.
**Avoids:** Pitfall 6 (RLS misconfig), 7 (service-role leakage), committed-env exposure, 0% test coverage.

### Phase A: Extract services layer + sim (refactor, no behavior change)
**Rationale:** Decouple scenes from Supabase wiring and from the GameScene monolith before changing authority, so later phases are small diffs.
**Delivers:** src/lib/api typed clients; battle loop extracted to src/sim/BattleSim.ts; gameState shrunk to session cache; src/towers filled.
**Implements:** services-layer + pure-sim components from ARCHITECTURE.md. Pure sim becomes unit-testable.

### Phase B: Server-authoritative accounts + economy
**Rationale:** First real authority move, on the safest (non-realtime) surface -- proves the read-RLS / write-via-RPC pattern.
**Delivers:** profile stats + wallet + inventory as server truth; unlock-unit Edge Fn; remove client writes to profiles.unlocked_units/wins; LoadoutScene reads inventory; migrate existing v1.0 profiles rows forward.
**Addresses:** account/profile, soft currency, deterministic unlocks (FEATURES P1).
**Avoids:** Pitfall 3 (client-trusted rewards), 4 (idempotency), 5 (balance races), 10 (level-based storage + existing-player migration).

### Phase C: Progression + matchmaking
**Rationale:** Build on the now-proven authority pattern; matchmaking needs trustworthy results (built next).
**Delivers:** upgrades + upgrade Edge Fn (level-based storage, server-side balance config); matchmaking_queue + atomic matchmake fn (FIFO start); match lifecycle state machine with server now() + abandonment sweep; keep room-code friend path.
**Addresses:** matchmaking queue, faction/unit progression (FEATURES P1/P2).
**Avoids:** Pitfall 8 (matchmaking races), 9 (ghost/abandoned matches), 10 (irreversible curves).

### Phase D: Battle authority / result validation (highest risk, last)
**Rationale:** The keystone trust fix, built on the safest possible foundation. Riskiest change deferred to the end.
**Delivers:** determinism pass (fixed timestep + seeded PRNG + stable ids + order-stable combat); clients submit match_reports; submit-match-result Edge Fn compares + settles atomically; private Realtime channels for in-match sync. **Escalation hatch:** the deterministic sim is exactly what a future Colyseus server would run (Option B).
**Addresses:** server-trusted battle outcome (FEATURES keystone P1).
**Avoids:** Pitfall 1 (wrong authority granularity), 2 (determinism debt).

### Phase Ordering Rationale
- **Dependencies:** economy requires accounts; trustworthy economy requires server-trusted results; MMR requires trusted results. But meta-authority does not require battle-sim authority -- so authority moves on the cheap surface (B) before the expensive one (D).
- **Risk:** the hardest, highest-uncertainty change (battle determinism + validation) is sequenced last on top of a reviewable, tested, decoupled base -- never a big-bang rewrite.
- **Architecture grouping:** Foundations + Phase A are pure de-risking refactors that make every later diff small; B and C share one proven RLS-read/RPC-write pattern.

### Research Flags
Phases likely needing deeper research during planning:
- **Phase D (battle authority / determinism pass):** highest-risk technical item -- requires removing four documented sources of nondeterminism and designing the validation payload/bounds. Run the research-phase flag. Also flag here if reconnect-into-match enters scope (lifecycle/heartbeat design).
- **Phase C (matchmaking, if MMR added this milestone):** atomic pairing under load + lifecycle/timeout design warrant a focused pass; FIFO start is well-understood, MMR less so.

Phases with standard patterns (skip research-phase):
- **Phase 0 / B:** well-documented Supabase RLS + SECURITY DEFINER RPC + idempotent/atomic spend patterns; PITFALLS.md already supplies the exact SQL shapes.
- **Phase A:** internal refactor, no external unknowns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (building blocks) / MEDIUM (authority model) | Supabase limits, versions, RLS patterns verified against official docs; Colyseus-vs-Supabase is the reconciled judgement call |
| Features | HIGH | Genre conventions (Clash Royale/CoC) verified against current sources; aggressive, well-justified deferral |
| Architecture | HIGH | Supabase authority primitives from official docs; integration shape derived from the mapped codebase |
| Pitfalls | HIGH | Supabase limits + economy/matchmaking patterns verified against docs and multiple post-mortems |

**Overall confidence:** HIGH -- with one decision (realtime authority model) requiring explicit user confirmation.

### Gaps to Address
- **Authority model (A vs B):** the one consciously-confirm decision. Recommendation is A; confirm before roadmapping Phase D.
- **Determinism feasibility:** the existing sim float/Math.hypot/dt nondeterminism is the largest unknown -- validate early in Phase D planning (research-phase) that order-stable + fixed-timestep + seeded PRNG yields reproducible outcomes in a unit test before committing to report-comparison validation.
- **v1.0 player migration:** confirm a forward migration for existing profiles (wins/unlocked_units) so prototype accounts are not stranded -- design in Phase B.
- **Realtime quota headroom:** Free=200 / Pro=500 concurrent connections per org; budget channel reuse + deterministic teardown before any launch spike.
- **Reconnect-into-match:** decide if in scope; if so it expands Phase C/D lifecycle work materially.

## Sources

### Primary (HIGH confidence)
- Supabase docs -- Edge Functions architecture/limits (~2s CPU/req, ~400ms cold/~125ms hot), Realtime authorization and limits (200/500 concurrent), anonymous auth, API key migration.
- Context7 + npm (Jun 2026) -- colyseus/core 0.17.x, colyseus.js 0.16.x, supabase-js 2.108.x.
- Postgres concurrency -- FOR UPDATE SKIP LOCKED, atomic guarded UPDATE, READ COMMITTED anomalies.
- Game-economy security post-mortems -- server-derived currency, idempotency, replay/double-claim prevention.
- Clash Royale / Clash of Clans current progression and MMR conventions (Supercell + community guides, May-Jun 2026).
- Codebase map -- .planning/codebase ARCHITECTURE/CONCERNS/STRUCTURE/TESTING, src/lib/gameState.ts, src/units/UnitData.ts, commit 8f10196.

### Secondary (MEDIUM confidence)
- Colyseus hosting cost comparisons (Railway/Render/Fly, 2026) -- pricing varies by usage.
- MMR/skill-based-matchmaking blog sources -- bounded range expansion convention.

---
*Research completed: 2026-06-12*
*Ready for roadmap: yes*
