# Phase 12: Progression & Upgrades - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Players spend the **persistent soft currency** (from Phase 11's `wallet`) to raise
**per-unit levels** (PROG-01) and a **tower power** level (PROG-02). Levels **persist
between matches**, are stored as **levels — never denormalized stats** (PROG-04), and at
battle time **both participants' unit and tower stats are computed from their levels**
(PROG-03). Upgrade **costs are server-derived** in a `SECURITY DEFINER` RPC; **effects**
(the level→stat tables) live in client static config this phase, with a clean seam to
move them server-side later. This is the **depth layer** on top of Phase 11's breadth
(unlocks): unlocks get you the roster fast, upgrades are the long-tail power sink.

**In scope:** per-unit upgrade levels for all 6 units (PROG-01); a single tower-power
level track (PROG-02); a server-side `upgrades` levels store + server-derived-cost spend
RPC (PROG-04); level→stat resolution wired into the sim so both armies render at correct
stats (PROG-03); opponent-level exchange over the existing realtime handshake; integrating
the provided upgrade-screen design (UI hint: yes).

**Out of scope (later phases):** real server-side validation that a player actually owns a
claimed level (P14 battle authority + signed report); matchmaking / match record / rank
(P13); live server-driven balance-config fetch (seam prepared, not built); new unit tiers,
abilities, or upgrade *types* beyond stat levels; net-new UI/UX & character art (user-owned
in Claude designs — this phase integrates).

</domain>

<decisions>
## Implementation Decisions

### Tower / faction power scope (PROG-02)
- **D-01:** **Towers only — one track.** PROG-02 is a single tower-power track; "faction"
  just describes whose towers. There is **no separate faction-power track** and unit power
  is covered entirely by the per-unit upgrades (PROG-01), so the two tracks never overlap.
- **D-02:** **Tower power buffs damage per shot only.** Range (216px) and cooldown (1400ms)
  stay fixed; each tower level raises dmg from the base 25. (Towers are non-destructible
  auto-attackers — no HP to scale.)

### Stat scaling model (PROG-03 / PROG-04)
- **D-03:** **Effects live in client static tables now; server is source-of-record for
  levels and costs.** The level→stat mapping lives in `src/units/UnitData.ts` and
  `src/towers/TowerData.ts` (extending Phase 10's flat tables into per-level arrays). The
  server (`upgrades` table) holds the **authoritative level**; the upgrade RPC **derives
  cost server-side**. Effects are **trusted client-side until P14** hardens battle
  authority — the same "trust now, harden P14" posture as Phase 11's interim reward grant
  (P11 D-05/06). PROG-04's "retuned safely" is satisfied by storing **levels not stats**
  (research Pitfall 10): retuning the table re-derives every player's stats with no data
  migration.
- **D-04:** **Hand-authored per-level values.** Each level's stats are individually
  authored in the per-level array (not a formula) — max tuning control, and free since we
  store an array anyway.
- **D-05:** **Units scale HP + Damage; towers scale Damage.** Move speed (`speedPx`) and
  attack rate (flat 900ms) stay fixed for units.
- **D-06 (planner flag):** Phase 10 deliberately left `TowerData.ts` as a flat single-level
  table (`TOWER_DEF`) **specifically so Phase 12 can extend it to a `TOWER_LEVELS` per-level
  array (dmg/range/cd per level) without a schema change.** Same shape applies to units.
  The plan MUST reference this prepared extension point explicitly so the executor knows the
  seam exists. (Author `range`/`cd` per level too even though only `dmg` scales today — keeps
  the table shape uniform and future-proof.)
- **D-07 (planner flag):** Add a `BALANCE_VERSION` constant to `TowerData.ts` and
  `UnitData.ts` now. When config eventually moves server-driven, that constant becomes the
  cache key. Costs nothing now, avoids a retrofit later.

### Progression depth & cost curve
- **D-08:** **Upgrades are the long-tail depth sink.** Phase 11 unlocks stay fast (breadth);
  upgrades are the slow-burn power-progression that gives the economy legs over many matches.
- **D-09:** **Escalating cost curve.** Early levels cheap/quick, later levels meaningfully
  expensive — the mechanism that makes upgrades feel like a long-tail against the fast unlock
  economy.
- **D-10:** **~5 levels max per track.** Short, legible, hand-authorable ladder; extendable
  later by appending to the per-level array (no schema change, per D-06).

### Opponent-level sync & interim authority (PROG-03)
- **D-11:** **Each client reads its OWN levels server-side, then exchanges them over the
  existing realtime channel at match start** (placement/loadout handshake, alongside the
  faction/units already synced). Required because the sim runs on each client and spawns
  *both* armies locally (`createWorld` + `spawnUnit`), so each client needs the opponent's
  levels to compute the opponent's stats. Trust-based, consistent with battle being
  client-authoritative until P14, reuses live wiring. **P14 hardens it.**
- **D-12:** **Interim guard = clamp only.** Received opponent levels are clamped to
  `[1, MAX_LEVEL]` and to known tracks (unknown unit ids / out-of-range → level 1) before
  feeding the sim, so a malformed payload can't crash or produce absurd stats. Genuine "does
  the opponent actually own that level" verification is **explicitly deferred to P14** — no
  server ownership check this phase.

### Claude's Discretion
- **D-13:** **Exact per-level stat values and cost numbers** — within the ~5-level ceiling
  (D-10) and the escalating-curve intent (D-09), author the HP/Damage-per-level (units),
  Damage-per-level (towers), and the cost at each level. Tune so early levels are cheap
  against the P11 economy and the top level is a genuine long-tail goal.
- **D-14:** **Upgrade RPC shape** — mirror the live Phase 11 `spend_unlock` exemplar:
  `SECURITY DEFINER`, `search_path=''`, `auth.uid()` null-guard, server-derived cost, atomic
  guarded deduct (`UPDATE wallet SET balance = balance - cost WHERE owner = uid AND balance >= cost`),
  `CHECK (balance >= 0)` backstop. Upgrade is a **level transition**, not a one-time grant:
  guard that the new level is exactly `current + 1` (or upsert the `upgrades` row with a
  `level = level + 1` increment) so it's safe under retry/concurrency. `revoke all from public;
  grant execute to authenticated`.
- **D-15:** **`upgrades` table shape** — follow the research ARCHITECTURE.md proposal:
  `upgrades(user_id, scope text /* 'unit' | 'tower' */, target_id text, level int default 1
  check (level >= 1), primary key (user_id, scope, target_id))`. RLS: select-own only, **no
  client write policy** (deny-by-default, Pitfall 6). **Absence of a row = level 1** — new
  and v1.0-migrated accounts need no backfill; the default IS level 1.
- **D-16:** **Must own a unit to upgrade it.** Starters are owned by default; non-starters
  require the Phase 11 unlock first. The upgrade RPC should reject upgrading an unowned unit.
- **D-17:** Whether the upgrade write is one RPC parameterised by `(scope, target_id)` or a
  small set of RPCs is Claude's to choose at plan time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The economy/RPC exemplar this phase copies (live Phase 11 code)
- `supabase/migrations/20260613061943_accounts_economy.sql` — the **`spend_unlock` RPC**
  (server-derived cost, atomic guarded deduct, `ON CONFLICT DO NOTHING` idempotent insert,
  revoke/grant footer) is the **copy-paste exemplar** for the upgrade-spend RPC (D-14). Also
  shows the `wallet`/`inventory` RLS shapes and `credit_wallet_for_user` internal pattern.
- `.planning/phases/11-accounts-economy/11-CONTEXT.md` — D-05/D-06 (the "trust now, harden
  P14" interim-authority posture this phase reuses for level exchange); the wallet/spend/RLS
  decisions; the `src/lib/api/` seam P12 extends with a `progression`/`upgrades` client.

### Progression schema & data-flow design (the levels-not-stats model)
- `.planning/research/ARCHITECTURE.md` — §"0003: progression" defines the proposed
  `upgrades(user_id, scope, target_id, level)` table (D-15); the RLS table (`upgrades`:
  own-rows SELECT, writes DENIED → upgrade fn); §"Data Flow … progression" (SPEND step 5).
- `.planning/research/PITFALLS.md` §"Pitfall 10" — **store `level`, not derived absolute
  stats**, so balance can be retuned without nerf-rage or risky migrations (PROG-04 / D-03).
  Also the idempotency/atomic-spend pitfalls (4/5) that govern the upgrade RPC.

### The sim stat-injection points this phase extends (Phase 10 code)
- `src/sim/world.ts` — `createWorld()` (towers built with flat `TOWER_DEF`, lines ~65-93)
  and `spawnUnit()` (unit stats copied from `UNITS` def, lines ~150-181). **These are where
  level-derived stats must enter.** `createWorld` will need per-side tower level; `spawnUnit`
  will need the deploying side's unit level. The sim must stay free of Supabase/gameState
  imports (P10 D-01) — levels are passed *in* via `CreateWorldOptions` / the deploy input,
  not fetched inside the sim.
- `src/sim/types.ts` — `SimUnit` (hp/maxHp/dmg copied at spawn), `SimTower` (dmg/range/maxCd),
  `CreateWorldOptions` shape, and `SimInput` `deploy` intent — all candidates to carry level
  or level-derived stats.
- `src/units/UnitData.ts` — flat `UNITS[]` table to extend with per-level HP/Damage arrays
  (D-03/D-05) + `BALANCE_VERSION` (D-07).
- `src/towers/TowerData.ts` — flat `TOWER_DEF` to extend into `TOWER_LEVELS` per-level array
  (D-02/D-06) + `BALANCE_VERSION` (D-07). The file header already names PROG-02/Phase 12 as
  the intended extender.

### Realtime exchange wiring (where opponent levels travel — D-11)
- `.planning/codebase/INTEGRATIONS.md` — the existing realtime channel + placement/loadout
  handshake (faction/units already synced); `src/scenes/PlacementScene.ts` and the Supabase
  broadcast protocol P10 preserved byte-for-byte. Level exchange piggybacks here.
- `.planning/phases/10-services-simulation-refactor/10-CONTEXT.md` — D-04/D-12 (sim deploy
  inputs from broadcasts; slimmed read-through `gameState` cache that P11/P12 hydrate),
  D-13 (client `recordResult` retired in P11 — P12 builds on the post-P11 state).

### Phase / requirements anchors
- `.planning/ROADMAP.md` §"Phase 12" — goal + 4 success criteria (UI hint: yes).
- `.planning/REQUIREMENTS.md` — PROG-01…04.
- `src/lib/api/` (`inventory.ts`, `wallet.ts`, `profile.ts`, `settlement.ts`) — the typed
  services seam (FND-05); P12 adds an `upgrades`/progression client here. Scenes never call
  `supabase.from()` for authoritative tables.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 11 `spend_unlock` RPC** (live in `20260613061943_accounts_economy.sql`) — the
  exact pattern for the upgrade-spend RPC: server-derived cost, atomic `WHERE balance >= cost`
  deduct, RLS deny-direct-writes, revoke/grant footer (D-14).
- **Phase 11 `wallet` table + balance** — the currency the upgrade RPC spends from.
- **`src/lib/api/` services seam** (P9/P11) — extend with a progression/`upgrades` client
  (read own levels, call upgrade RPC). Only path scenes use to touch authoritative tables.
- **Phase 10 flat stat tables (`UnitData.UNITS`, `TowerData.TOWER_DEF`)** — extension points
  deliberately left flat for this phase (D-06). Extend in place to per-level arrays.
- **Phase 10 pure sim (`createWorld`/`spawnUnit`)** — the single place battle stats are
  assigned; level-derived stats enter here (kept Supabase/gameState-free per P10 D-01).
- **Existing realtime placement/loadout handshake** — opponent level exchange piggybacks on
  the channel that already syncs faction/units (D-11).
- **Phase 9/11 Vitest + CI harness** — home for the idempotency / concurrent-upgrade /
  unowned-unit-reject / clamp-out-of-range tests this phase needs.

### Established Patterns
- Authoritative writes go through `SECURITY DEFINER` RPCs under the player's own auth; RLS
  denies direct client writes to currency/ownership/level columns (P9 D-02, Pitfall 6).
- Atomic single-statement balance mutation + `CHECK (balance >= 0)` for spend (Pitfall 5).
- **Store levels, not stats** (Pitfall 10) — the `upgrades` row holds `level`; stats are
  always re-derived from level + the (versioned) effect tables.
- Sim is transport- and session-free; everything it needs is passed in at `createWorld`/
  input time (P10 D-01, Pitfall 5).
- Scenes never call `supabase.from()` for authoritative tables (FND-05) — services seam only.

### Integration Points
- **New `upgrades` table** (`user_id, scope, target_id, level`) + **upgrade-spend RPC** —
  the schema/authority core (D-14/D-15).
- **Level→stat resolution into the sim** — `createWorld` takes per-side tower level;
  `spawnUnit` takes the deploying side's unit level; `SimInput.deploy` and/or
  `CreateWorldOptions` carry levels (or pre-resolved stats). This is the PROG-03 wiring.
- **Opponent-level exchange** — own levels read via the services seam at match start, sent
  over the existing channel; received levels **clamped** (D-12) before feeding the sim.
- **Upgrade screen (provided design)** — binds to: current level per track, next-level cost
  (server-derived/displayed), HP/Damage stat-delta preview, and a spend button → upgrade RPC;
  reflects new balance + new level on success. UI is user-owned; this phase wires data.
- **Profile/roster** — owned units already shown (P11 D-13); levels are a natural addition to
  that view if the provided design includes them.

### Dependency status (as of 2026-06-13)
- **Phase 9 — COMPLETE.** Backend boundary, RLS, services seam, Vitest+CI.
- **Phase 10 — COMPLETE.** Pure sim, flat stat tables (the prepared seams), slimmed
  `gameState`, realtime protocol preserved.
- **Phase 11 — context gathered; schema + RPCs written (`20260613061943_accounts_economy.sql`),
  live apply deferred to the execute orchestrator.** P12 depends on the P11 `wallet`/spend
  pattern and `src/lib/api/` clients. **Plan/execute Phase 11 before Phase 12.**

</code_context>

<specifics>
## Specific Ideas

- The interim authority model (D-11/D-12) is a **deliberate scaled-down preview of P14**, the
  twin of Phase 11's reward model: trust the client now (clamped against the dumb failure
  modes), leave a clean seam, and let P14 add the real validation (signed report / authoritative
  loadout that proves a player owns the levels they fight with).
- The user wants a clear **breadth-vs-depth split**: Phase 11 unlocks are *fast* (get the
  roster), Phase 12 upgrades are the *long-tail* power sink (D-08). Don't let the upgrade curve
  feel as quick as unlocks.
- Forward-looking seams the user explicitly asked for, even though they cost nothing now:
  uniform per-level table shape with `range`/`cd` authored for towers (D-06) and a
  `BALANCE_VERSION` cache-key constant (D-07) — both there to make the eventual server-driven
  config move a non-event.

</specifics>

<deferred>
## Deferred Ideas

- **Live server-driven balance config** (fetch effects from a server table, retune with no
  client redeploy) — seam prepared (D-03/D-07: `BALANCE_VERSION`, levels-not-stats) but not
  built this phase; a later balancing/ops pass.
- **Server-side level validation** (proving the opponent actually owns the levels they fight
  with) — **P14** battle authority + signed match report; P12 ships clamp-only interim guard.
- **Separate faction-power and base-HP upgrade tracks** — considered and set aside (D-01);
  towers-only this phase. Faction/base power could be a later progression-expansion phase.
- **Move-speed / attack-rate / range scaling** — set aside (D-02/D-05) to keep the curve
  legible; a possible later tuning lever.
- **Raising the level ceiling past ~5 / deeper curves** — extendable later by appending to
  the per-level array (D-10), no schema change.
- **New upgrade *types*** (abilities, evolutions, new tiers) beyond stat levels — out of
  this milestone's foundation scope.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 12-Progression & Upgrades*
*Context gathered: 2026-06-13*
