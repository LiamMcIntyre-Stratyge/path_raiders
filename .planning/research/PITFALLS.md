# Pitfalls Research

**Domain:** Migrating a client-authoritative realtime lane-battler (Phaser 3 + Supabase) to server-authoritative + adding economy / progression / matchmaking
**Researched:** 2026-06-12
**Confidence:** HIGH on Supabase-specific limits and economy/matchmaking patterns (verified against Supabase docs + multiple post-mortem sources); MEDIUM on the specific server-auth architecture recommendation (judgement call grounded in measured Edge Function cold-start latency).

> Phase names used below map to the v2.0 target systems in `PROJECT.md`: **Accounts**, **Economy**, **Progression**, **Matchmaking**, **Server-Auth Migration**. A pitfall may also map to a cross-cutting **Foundations** phase (RLS/schema/tests) that should land before the others.

---

## Critical Pitfalls

### Pitfall 1: Treating Edge Functions as a per-tick game server

**What goes wrong:**
The natural instinct for "server-authoritative" is to move the `GameScene.update()` simulation loop server-side and have the server tick combat every frame. On Supabase this means Edge Functions (Deno), and they are the wrong tool for a per-tick realtime sim. Measured Edge Function latency is ~400ms cold median / ~125ms hot median per invocation (Supabase internal metrics), and functions are short-lived stateless V8 isolates — they cannot hold a 30–60 Hz simulation loop in memory across requests. A 180-second battle at even 10 Hz would be ~1,800 invocations per match.

**Why it happens:**
"Server-authoritative" gets conflated with "run the whole sim on the server." Teams reach for the backend primitive they have (Edge Functions) without checking that its latency/execution model fits a realtime loop.

**How to avoid:**
Pick the right authority granularity for THIS game. Three viable models, in increasing cost:
1. **Authoritative result validation (recommended for v2.0):** clients still simulate the battle, but the *outcome* (winner, final base HP, gold earned, duration, deploy log) is submitted to an Edge Function / Postgres RPC that re-derives and bounds-checks the result before writing currency/stats. Cheap, fits Edge Functions, kills the worst exploits (`recordResult('win')`, fabricated `base_hp: 0`).
2. **Authoritative deterministic lockstep:** both clients run an identical deterministic sim from a shared seed + tick; the server (or one elected host) is the seed/tick authority and validates a replay. Requires fixing determinism first (see Pitfall 2). Medium cost.
3. **True server sim:** a dedicated long-running Node/Deno game-server process (NOT an Edge Function) on Fly.io / a VM, holding state in memory, Supabase used only for persistence. High cost — defer past v2.0.

Decide this explicitly in the Server-Auth Migration phase before any code. For v2.0's "foundation" scope, model 1 is the right call; design the result-submission payload (deploy events + RNG seed + tick count) so you can *upgrade* to model 2 later without reworking the schema.

**Warning signs:**
A phase plan that says "move GameScene.update server-side"; Edge Functions invoked inside a `setInterval`; latency budgets that assume sub-50ms round trips to Supabase.

**Phase to address:** Server-Auth Migration (architecture decision, day one).

---

### Pitfall 2: Assuming the existing simulation is deterministic (it is not)

**What goes wrong:**
Any plan that relies on "both clients run the same sim" or "the server re-runs the battle to validate" assumes determinism. The current code is non-deterministic in at least four ways documented in CONCERNS/ARCHITECTURE: (a) combat target selection uses `filter`+`sort` by `Math.hypot` with no documented stable tiebreak; (b) movement integrates against Phaser's variable `dt` (frame-rate dependent), not a fixed timestep; (c) practice AI and likely deploy/RNG use unseeded `Math.random()` (e.g. `Math.floor(Math.random()*10)` map pick); (d) host and guest already run *independent* sims that only paper over divergence via `base_hp` last-writer-wins broadcasts. Two machines, two frame rates, two RNG streams → guaranteed drift.

**Why it happens:**
The prototype never needed determinism — divergence was hidden by overwriting base HP. Determinism debt is invisible until you try to validate or reconcile.

**How to avoid:**
Before lockstep/replay validation is even on the table, do a **determinism pass** as an explicit deliverable:
- Convert the sim to a **fixed timestep** (accumulator pattern; e.g. 30 Hz logic ticks decoupled from render). `dt`-scaled movement/combat must go.
- Replace all gameplay `Math.random()` with a **seeded PRNG** (e.g. mulberry32) seeded from a server-issued match seed; never use `Date.now()` or `Math.random()` for anything that affects outcome.
- Give every entity a stable id and make target selection deterministic (sort by `(distance, entityId)`, never just distance).
- Avoid floating-point divergence across machines where possible (integer or fixed-point for positions/HP if you go full lockstep).
For v2.0's result-validation model (Pitfall 1, option 1) you don't need *full* cross-machine determinism, but you DO need the server to re-derive plausibility bounds, which requires seeded RNG and a recorded deploy log.

**Warning signs:**
`* dt` in movement/combat math; `Math.random()` anywhere in `GameScene`/`Unit`; no entity ids; "it desyncs sometimes" treated as a networking bug rather than a determinism bug.

**Phase to address:** Server-Auth Migration (determinism pass is a prerequisite sub-phase). Flag this phase as **needing deeper research** — it is the single highest-risk technical item in v2.0.

---

### Pitfall 3: Client-trusted economy rewards (gold, stats, unlocks)

**What goes wrong:**
Currency, wins/losses, and unlocks are written directly from the client today (`recordResult` writes to `profiles`; gold is local-only). If the migration keeps any client-supplied "I earned N gold / I won" path, the economy is born exploitable: a modified client grants itself unlimited currency, fabricates wins to unlock units, and inflates stats. This is the #1 cause of game-economy collapse — economic exploits sink more games than code bugs.

**Why it happens:**
The existing write path is reused "to save time," and the reward amount is computed where the battle is computed (the client).

**How to avoid:**
- **Currency is server-derived, never client-supplied.** The reward for a match is computed server-side (Edge Function / Postgres RPC) from a validated match record — clients send *what happened* (within bounds), never *how much I get*.
- Balance changes (gold/XP per win) must be a server-side config/table, not a client constant.
- Combine with idempotency (Pitfall 4) and atomic balance updates (Pitfall 5).

**Warning signs:**
Any RPC parameter named `amount`, `gold`, `reward`, `xp` supplied by the client; client code that increments `gold`/`wins` then upserts the profile; reward constants living in `UnitData.ts` / scene files.

**Phase to address:** Economy (and remove the legacy client write path in Server-Auth Migration). Verification: attempt to call the reward RPC with a forged amount/win and confirm it is rejected.

---

### Pitfall 4: Non-idempotent reward grants (replay / double-claim)

**What goes wrong:**
Even with server-side reward computation, if a match-result submission can be sent twice (client retry, double-tap "claim", network retry, or a malicious replay), the player is paid twice. Same applies to "first win of the day" bonuses, unlock grants, and any quest reward. This is the classic duplicate-reward / replay attack.

**Why it happens:**
Realtime/HTTP retries are normal; the happy path "insert reward, add gold" runs again on retry. No nonce or unique constraint.

**How to avoid:**
- Make every grant **idempotent**: a `match_results` row keyed by a unique `match_id` (the room/match UUID) with a `UNIQUE` constraint; the reward RPC does `INSERT ... ON CONFLICT DO NOTHING` and only credits currency when the insert actually created the row — all in one transaction.
- For periodic bonuses, key idempotency on `(player_id, bonus_type, period_bucket)`.
- Never call an external/side-effecting step before the state write inside the grant transaction (recursive-call/reentrancy-style duplication).

**Warning signs:**
Reward logic with no `UNIQUE` constraint or nonce; "claim" that can fire twice; ability to POST the same match result repeatedly and see the balance climb.

**Phase to address:** Economy. Verification: submit the same match result 5× → currency credited exactly once.

---

### Pitfall 5: Negative-balance and lost-update races on currency

**What goes wrong:**
Two concurrent spends (double-tap "unlock unit", two devices) both read balance=100, both write balance-50, and the player buys two 50-gold items for 50 total — or worse, goes negative. Read-modify-write on a balance column under READ COMMITTED loses updates.

**Why it happens:**
The intuitive `select balance; if enough then update balance = balance - cost` has a window between read and write. Supabase/Postgres default isolation (READ COMMITTED) does not protect this pattern.

**How to avoid:**
- Do balance mutation **atomically in the database**: `UPDATE profiles SET gold = gold - $cost WHERE id = $id AND gold >= $cost RETURNING gold;` and treat zero rows affected as "insufficient funds." The `AND gold >= cost` guard + single-statement update prevents negatives and lost updates without explicit locking.
- For multi-row spends, wrap in a transaction with `SELECT ... FOR UPDATE` on the balance row, or use `REPEATABLE READ`.
- Add a `CHECK (gold >= 0)` constraint as a backstop so a negative balance is a hard DB error, not silent corruption.

**Warning signs:**
Spend logic that reads then writes balance in separate statements; no `CHECK (gold >= 0)`; balances observed going negative or items "free" under rapid taps.

**Phase to address:** Economy. Verification: fire concurrent spend requests; confirm exactly one succeeds and balance never goes negative.

---

### Pitfall 6: RLS misconfiguration exposing writes (the live, already-present risk)

**What goes wrong:**
CONCERNS flags that RLS posture is *unverified* and the client does unrestricted `insert/update/select` on `rooms` and `profiles`. If policies are permissive (or RLS is off), any authenticated user can overwrite another player's `wins`/`gold`/`unlocked_units`, read every profile, or tamper with any room. Adding currency on top of an unsecured `profiles` table just makes the exploit lucrative.

**Why it happens:**
Supabase tables default to no rows visible *only if RLS is enabled*; teams disable RLS during prototyping ("just make it work") and never re-enable, or write a blanket `USING (true)` policy. There are no migration/policy files in the repo, so the boundary is invisible and unreviewable.

**How to avoid:**
- **Commit the schema + RLS policies as SQL migrations** (`supabase/migrations/`) so the security boundary is reviewable in PRs. This is a Foundations deliverable that must precede Economy/Progression.
- `profiles`: `SELECT` may be public-ish, but `UPDATE`/`INSERT` restricted to `auth.uid() = id`; **currency/stat columns must NOT be client-writable at all** — gate them behind `SECURITY DEFINER` RPCs / Edge Functions so RLS denies direct client writes.
- `rooms`/matchmaking tables: writes restricted to participants.
- Treat the anon key as public (it is) — RLS, not the key, is the boundary.

**Warning signs:**
RLS disabled on any gameplay table; `USING (true)` policies; client code that updates `gold`/`wins` directly; no SQL migration files in the repo.

**Phase to address:** Foundations (before Economy). Also rotate the committed anon key and `git rm --cached .env.local` per CONCERNS. Verification: as user A, attempt to UPDATE user B's profile and to write currency columns directly → both denied.

---

### Pitfall 7: service_role key leakage into the client bundle

**What goes wrong:**
Server-authoritative work tempts adding the `service_role` key (which bypasses RLS entirely) to make privileged writes. If it lands in any `VITE_*` env var, client import, or the Capacitor app bundle, the entire database is wide open — RLS is moot. Given `.env.local` is already committed (CONCERNS), the habit risk is real.

**Why it happens:**
"I need to write currency from code" → grab the powerful key → it ends up bundled because Vite inlines `VITE_*` vars and Capacitor ships the JS.

**How to avoid:**
- `service_role` key lives **only** in Edge Function secrets / server env — never in a `VITE_` var, never imported by `src/`.
- All privileged writes go through Edge Functions or `SECURITY DEFINER` RPCs that the client invokes with the *anon* key under its own auth.
- Add a build-time guard / lint rule that fails if `service_role` appears in the client bundle.

**Warning signs:**
`VITE_SUPABASE_SERVICE_ROLE_KEY`; `service_role` string anywhere under `src/`; an Edge Function URL not used but a service key present client-side.

**Phase to address:** Foundations / Server-Auth Migration. Verification: grep the production bundle for the service-role JWT; must be absent.

---

### Pitfall 8: Matchmaking queue race conditions (double-join, ghost matches)

**What goes wrong:**
Real matchmaking replaces the room-code flow. The naive "find a waiting opponent: `SELECT first waiting row; UPDATE it to me`" has a race between SELECT and UPDATE — two players grab the same opponent (double-join), or one player gets matched into two games (ghost match). At small scale it's rare; under a launch spike it's a steady stream of broken matches.

**Why it happens:**
The SELECT-then-UPDATE pattern has a window where another worker grabs the same row; default READ COMMITTED doesn't serialize it.

**How to avoid:**
- Match atomically in Postgres with **`SELECT ... FOR UPDATE SKIP LOCKED`** inside a `SECURITY DEFINER` function: lock one waiting opponent row, claim it, flip both to `matched` in one transaction. SKIP LOCKED guarantees two concurrent matchers get *different* rows — purpose-built for this.
- Enforce "one active match per player" with a partial unique index / state check so a player cannot be in two matches.
- Make the matchmaker the single writer of match assignment; clients never self-assign opponents.

**Warning signs:**
Matchmaking implemented as separate `select()` then `update()` PostgREST calls from the client; no `FOR UPDATE SKIP LOCKED`; players occasionally land in mismatched/empty games (echoes the existing placement map-sync race in CONCERNS).

**Phase to address:** Matchmaking. Verification: spawn N concurrent queue joins in a test; assert no player double-matched and no opponent claimed twice.

---

### Pitfall 9: Abandoned / ghost matches with no lifecycle (timeouts, reconnect, draws)

**What goes wrong:**
A player disconnects mid-match (closes tab, loses signal). With no server lifecycle, the match row sits `active` forever, the opponent is stuck, no result is recorded, and (post-economy) reward/rating is undefined. The current code already has no disconnect handling and no match timeout — and the recently-fixed bug (`8f10196`) shows how easily an "instant" edge case corrupts a match.

**Why it happens:**
The prototype assumed both players stay connected; there's no server clock, no heartbeat, no authoritative match-end.

**How to avoid:**
- Give matches an explicit **server-side lifecycle and state machine**: `queued → active → completed/abandoned`, with a server-stamped `started_at`/`deadline`. Use `now()` in the DB, never a client timestamp (clients lie / clocks skew).
- Define abandonment policy up front: heartbeat (Realtime presence) + a timeout sweep (scheduled function / `pg_cron`) that resolves stale matches to a forfeit or void result.
- Decide reward/rating treatment for abandons before building Economy/Progression so it isn't retrofitted.

**Warning signs:**
Match end determined solely by a client `game_over` broadcast; no `deadline`/heartbeat column; no job that cleans up stale `active` rows; reliance on client timestamps for match timing.

**Phase to address:** Matchmaking (lifecycle) + Server-Auth Migration (authoritative match-end). Flag as **needs deeper research** if reconnect-into-match is in scope.

---

### Pitfall 10: Irreversible progression / balance curves and pay-to-win foundations

**What goes wrong:**
Progression (unit/faction/tower upgrades, persistent power) hard-coded with an aggressive curve, or stored as a derived absolute (e.g. persisting `attack = 137` rather than `level = 5`), is extremely hard to rebalance after launch without either nerfing players (rage) or running risky data migrations. If currency that buys power is also buyable for money later, an unbounded power-vs-spend curve bakes pay-to-win into the schema.

**Why it happens:**
Numbers feel permanent and get inlined (the codebase already scatters balance magic numbers); the first curve that "feels right" ships and players build expectations on it.

**How to avoid:**
- Store progression as **levels/inputs**, never as computed combat stats. Derive stats from `level` via a server-side balance table you can edit without touching player rows.
- Keep all balance numbers (costs, XP curve, per-level deltas, unlock thresholds — currently duplicated across `GameScene`/`LoadoutScene`/`UnitData`) in one server-readable config so rebalancing is a config change, not a migration. Consolidating the duplicated unlock thresholds (CONCERNS) is the on-ramp.
- Cap max power and keep the power-vs-investment curve flattening (diminishing returns) so a future paid-currency layer can't create unbounded P2W.
- Write a forward migration for the *existing* prototype players' `wins`/`unlocked_units` into the new account/progression schema (don't strand v1.0 accounts).

**Warning signs:**
Persisting absolute stats instead of levels; balance numbers inlined in scenes; no migration plan for current `profiles` rows; upgrade cost/power curves with no defined cap.

**Phase to address:** Progression (curve design + level-based storage); Accounts (migrate existing profile rows). Verification: change a balance number and confirm all players' effective stats shift with no per-row migration.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse client `recordResult` write path for currency | No backend work | Trivially exploitable economy; full rewrite once cheating appears | Never (this is THE thing v2.0 exists to fix) |
| Skip RLS / `USING(true)` to "unblock" dev | Fast iteration | Any user edits any balance; silent until exploited | Only on a throwaway branch, never merged |
| Store progression as absolute combat stats | Simple read path | Cannot rebalance without mass migration | Never for persistent power |
| Keep `dt`-scaled, unseeded sim and "fix desync later" | Ship the prototype | Blocks all server-auth validation; determinism retrofit touches every sim file | Only while v2.0 server-auth is out of scope (it is in scope now) |
| Match via client SELECT-then-UPDATE on `rooms` | Reuse existing flow | Double-joins/ghost matches under load | MVP single-region low concurrency only, with a fast-follow to atomic matchmaking |
| Balance numbers inlined in scenes | No config plumbing | Every rebalance is a code deploy; values drift between scenes | Never once economy depends on them |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase Edge Functions | Using them for a per-tick game loop | Use for short request/response: result validation, reward grant, matchmaking RPC. ~400ms cold / ~125ms hot per call. |
| Supabase Realtime broadcast | Trusting peer broadcasts as authoritative (current model) | Broadcasts are untrusted peer intent; authority lives in DB/RPC. Validate server-side. |
| Supabase Postgres (PostgREST) | Client SELECT-then-UPDATE for spend/match (race window) | Single atomic `UPDATE ... WHERE guard` or `FOR UPDATE SKIP LOCKED` in a `SECURITY DEFINER` function. |
| Supabase Auth | Keeping the literal `'guest'` id (CONCERNS) once money/stats exist | Anonymous auth → real UUID per guest, or gate ranked/economy behind sign-in. |
| Time / timestamps | Trusting client `Date.now()` for match timing, cooldowns, daily bonuses | Use Postgres `now()` server-side for all economy/match timing. |
| `service_role` key | Adding it to a `VITE_` var for "server" writes | Server-only secret; privileged writes via Edge Function / `SECURITY DEFINER` RPC. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Realtime concurrent-connection quota | WebSocket errors: "too many total concurrent connections", "too many channel joins per second" | Free = 200, Pro = 500 concurrent connections per *org* (overage $10/1k). Budget connections; reuse one channel per match; clean up channels on scene shutdown (already a documented leak risk). | Free at ~200 simultaneous players; Pro at ~500 |
| Channel-join storms | Errors on rapid scene transitions; "too many channels joined for a single connection" | One client connection, minimal channels; tear down `room-`/`placement:`/`game:` channels deterministically; centralize channel-name builders (CONCERNS). | Spiky lobby/placement churn at launch |
| Edge Function cold starts on the match path | First match action after idle takes ~400ms | Keep functions warm only matters at scale; design UX so reward/match RPCs are not on a tight realtime path; show optimistic UI. | Low-traffic periods / first request per hour window |
| O(n²) combat scan (existing) moved server-side unchanged | Edge Function CPU/timeout if it re-simulates large armies | If server re-derives outcomes, validate bounds cheaply (totals/seed/log replay) rather than full per-frame re-sim; fix spatial scan if true server sim is ever built. | Large armies / many concurrent validations |
| Realtime message overage | $2.50 / 1M messages beyond quota | Don't broadcast per-frame state; broadcast intents/events only. | High deploy frequency × many concurrent matches |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Client supplies reward amount / win flag | Infinite currency, fake unlocks | Server derives reward from validated match; client sends events, not amounts |
| No idempotency on grants | Replay/double-claim duplicates currency | Unique `match_id` + `ON CONFLICT DO NOTHING` in one transaction |
| Read-modify-write balance | Lost updates, negative balance | Atomic `UPDATE ... WHERE gold >= cost` + `CHECK (gold >= 0)` |
| Permissive/absent RLS on `profiles`/`rooms` | Any user edits any balance/stat | RLS migrations in repo; currency columns non-client-writable; `auth.uid() = id` |
| `service_role` key in client bundle | Total RLS bypass / full DB compromise | Server-only secret; bundle scan in CI |
| Committed anon key + project URL (existing) | Can't rotate without code change; history leak | `git rm --cached .env.local`, rotate key, rely on RLS |
| Trusting client timestamps | Cooldown/daily-bonus bypass, time fraud | Use DB `now()` for all time-based economy logic |
| `username` interpolated into `innerHTML` (existing, GameScene:1031) | Stored XSS once usernames are user-set | Escape user-sourced strings before `innerHTML` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Server validation adds latency with no feedback | Game feels laggy/broken after a win | Optimistic UI (show provisional reward), reconcile silently; only surface a correction if validation rejects |
| Abandoned-match policy invisible to players | Players rage when a disconnect voids progress / no result | Communicate forfeit/void rules; show "opponent disconnected — match resolved" |
| Hard currency reset / unlock loss during migration | v1.0 players lose their unlocked units/wins | Migrate existing `profiles` forward; never strand earned progress |
| Advertised-but-unbuilt modes (existing: Ranked/Co-op/3-Way) | Misleading; players queue into nothing | Disable/label unbuilt modes until matchmaking backs them |

## "Looks Done But Isn't" Checklist

- [ ] **Server-authoritative results:** Often missing — the *old* client write path (`recordResult`, local gold) is still reachable. Verify the legacy path is removed/blocked, not just bypassed.
- [ ] **RLS:** Often missing — policies exist but currency/stat columns are still client-writable. Verify a direct client UPDATE to `gold`/`wins` is denied.
- [ ] **Idempotent rewards:** Often missing — happy path works, retry double-pays. Verify submitting the same match twice credits once.
- [ ] **Concurrent spend safety:** Often missing — single-user flow works, double-tap buys two items / goes negative. Verify concurrent spends.
- [ ] **Determinism:** Often missing — sim "works" on one machine but still uses `dt` + `Math.random()`. Verify fixed timestep + seeded RNG before any validation/lockstep claim.
- [ ] **Matchmaking atomicity:** Often missing — works with 2 testers, races under load. Verify with concurrent queue joins.
- [ ] **Match lifecycle:** Often missing — happy game ends fine, disconnect leaves a ghost match. Verify a closed-tab disconnect resolves the match.
- [ ] **Existing-player migration:** Often missing — new schema works for new accounts, strands v1.0 `profiles`. Verify an existing prototype account loads with its unlocks/wins.
- [ ] **Tests exist at all:** Currently 0% automated (TESTING.md). Verify Vitest is wired and pathfinder + economy/matchmaking RPCs have tests before declaring any phase done.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Exploited economy in production | HIGH | Audit `match_results`/transaction log for anomalies (wealth vs. baseline, duplicate ids, negatives); claw back / reset affected balances; patch the trusted path; add idempotency + atomic spend retroactively |
| RLS found permissive after launch | HIGH | Lock down policies immediately; audit for unauthorized profile edits; rotate keys; move currency writes behind RPCs |
| service_role key leaked | CRITICAL | Rotate the service_role key immediately (invalidates leaked one); audit logs for abuse; rebuild bundle without it; add CI scan |
| Desync/non-determinism discovered late | HIGH | Fall back to result-validation model (Pitfall 1, option 1) instead of lockstep; do the determinism pass as its own phase before retrying lockstep |
| Bad balance curve shipped | MEDIUM (if level-based) / HIGH (if absolute stats) | If levels stored: edit balance table, ship config. If absolute stats stored: data migration + player communication — the reason to store levels |
| Ghost/abandoned matches piling up | MEDIUM | Add `pg_cron` sweep to void stale `active` matches; add heartbeat/timeout; backfill resolution for stuck rows |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 6 RLS misconfig / 7 service_role leak / committed env | Foundations (precedes Economy) | Cross-account UPDATE denied; service_role absent from bundle; `.env.local` untracked + key rotated |
| 2 Determinism debt | Server-Auth Migration (determinism sub-phase — deeper research) | Fixed timestep + seeded RNG; identical inputs → identical outcome in a unit test |
| 1 Wrong server-auth granularity | Server-Auth Migration (architecture decision, day one) | Chosen model documented; reward/result derived server-side, not in an Edge Function tick loop |
| 3 Client-trusted rewards | Economy (+ remove legacy path in Migration) | Forged reward/win RPC rejected |
| 4 Non-idempotent grants | Economy | Same match submitted 5× credits once |
| 5 Balance races / negatives | Economy | Concurrent spends: one succeeds, never negative |
| 8 Matchmaking races | Matchmaking | Concurrent joins: no double-match, no opponent claimed twice |
| 9 Abandoned matches / client time | Matchmaking + Migration (deeper research if reconnect in scope) | Disconnect resolves match; all timing uses DB `now()` |
| 10 Irreversible curves / P2W / migration | Progression (curves) + Accounts (migrate v1.0 rows) | Balance change shifts all players via config, no per-row migration; existing accounts load with unlocks |
| Realtime quota / channel limits | Matchmaking + Migration (scaling) | Channels torn down on shutdown; connection budget within plan tier |
| 0% test coverage (cross-cutting) | Foundations | Vitest wired; pathfinder + economy/matchmaking RPC tests pass in CI |

## Sources

- Supabase Realtime limits & quota (concurrent connections: Free 200 / Pro 500 per org; channel-join + connection error messages; message/connection overage pricing): https://supabase.com/docs/guides/realtime/limits , https://supabase.com/docs/guides/realtime/pricing , https://supabase.com/docs/guides/troubleshooting/realtime-concurrent-peak-connections-quota-jdDqcp
- Supabase Edge Functions architecture & measured latency (~400ms cold / ~125ms hot median; short-lived V8 isolates; "don't use for latency-critical user-facing paths"): https://supabase.com/docs/guides/functions/architecture , https://supabase.com/docs/guides/functions
- Game economy exploits / server-authoritative currency / idempotency / replay & duplicate-reward prevention / wealth-anomaly detection: https://stagefoursecurity.com/blog/2025/05/13/securing-in-game-economies/ , https://chainscorelabs.com/blog/security-post-mortems-hacks-and-exploits/nft-and-gaming-exploits/why-economic-exploits-will-sink-more-games-than-code-bugs
- Postgres matchmaking/queue race conditions (`FOR UPDATE SKIP LOCKED`, READ COMMITTED anomalies, REPEATABLE READ): https://www.dbpro.app/blog/postgresql-skip-locked , https://oneuptime.com/blog/post/2026-01-25-postgresql-race-conditions/view , https://on-systems.tech/blog/128-preventing-read-committed-sql-concurrency-errors/
- Codebase-specific grounding: `.planning/codebase/CONCERNS.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/TESTING.md`, `.planning/PROJECT.md`, commit `8f10196`.

---
*Pitfalls research for: server-auth migration + economy/progression/matchmaking on Phaser 3 + Supabase*
*Researched: 2026-06-12*
