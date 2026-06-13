# Roadmap: Path Raiders

## Milestones

- ✅ **v1.0 Prototype** - Phases 0-8 (shipped) — realtime 1v1 lane-battle loop proven end-to-end
- 🚧 **v2.0 Persistent Game Foundations** - Phases 9-14 (in progress)

## Overview

v2.0 turns the working v1.0 client-authoritative prototype into a server-trusted,
account-based game with economy, progression, matchmaking, and ranking. The build is
ordered by dependency and risk: first make the Supabase backend reviewable and safe
(committed migrations, RLS, real identity, no leaked secrets, a test harness), then
decouple scenes from the backend and extract the battle loop into a pure simulation
module so every later change is a small diff. With those de-risking refactors done,
authority moves on the cheap, non-realtime surface first — accounts and economy, then
progression — proving the read-via-RLS / write-via-RPC pattern. Matchmaking and ranking
build on trustworthy-by-design persistence (FIFO upgraded to hidden-MMR pairing, plus a
visible trophy rating and match history). The highest-risk change — battle-result
authority via a determinism pass and server-side report validation — is sequenced last,
on top of a tested, decoupled base, never as a big-bang rewrite. The authority model is
Supabase-only result validation (Option A); a dedicated Colyseus game-server is the
documented future upgrade path and is out of scope here. UI/UX and character art are
owned by the user (Claude designs); phases integrate provided designs, they do not design
UI from scratch.

## Phases

**Phase Numbering:**

- Integer phases (9, 10, 11): Planned milestone work (continues from v1.0's Phase 8)
- Decimal phases (e.g. 11.1): Urgent insertions (marked INSERTED)

- [x] **Phase 9: Backend Foundations & Integrity** - Committed migrations, RLS, real identity, secret-leak guard, and a test harness — make the backend reviewable and safe (completed 2026-06-12)
- [x] **Phase 10: Services & Simulation Refactor** - Extract a typed services layer and a pure `src/sim/` battle module; behavior-preserving de-risking refactor (completed 2026-06-13)
- [ ] **Phase 11: Accounts & Economy** - Server-truth accounts, profiles, wallet, and unit unlocks; first real authority move on the safe non-realtime surface
- [ ] **Phase 12: Progression & Upgrades** - Server-side level-based unit/tower upgrades that persist and feed back into battle stats
- [ ] **Phase 13: Matchmaking & Ranking** - Quick Match with hidden-MMR pairing, race-safe match lifecycle, visible trophy rank, and match history
- [ ] **Phase 14: Battle Authority & Result Validation** - Determinism pass plus server-validated match reports settling rewards, progression, and rating

## Phase Details

### Phase 9: Backend Foundations & Integrity

**Goal**: The Supabase security boundary is committed, reviewable, and enforced, every player has a stable real identity via authenticated email/password sign-in (no anonymous auth), no privileged secret ships in the bundle, and a test harness runs in CI.
**Depends on**: Nothing (first phase of v2.0; builds on v1.0 Phase 8)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05
**Success Criteria** (what must be TRUE):

  1. The schema for authoritative tables (wallet, inventory, upgrades, match results) exists as committed `supabase/migrations` SQL with RLS so a client can read its own rows but cannot write authoritative ones (verifiable by an RLS test that a forged write is rejected).
  2. Every player gets a stable real account UUID via authenticated email/password sign-in (no anonymous auth); the literal `'guest'` id is deleted.
  3. No privileged credential is present in the built client bundle, `.env.local` is untracked (and the anon key rotated), and a CI/scan guard fails the build if a secret is bundled.
  4. A Vitest harness runs in CI with the first pure-function tests (pathfinder) green, establishing the coverage seam later phases extend.
  5. Scenes reach persistent data only through a typed `src/lib/api/` services layer — no scene issues a direct write to an authoritative table.

**Plans**: 6 plans

  - [x] 09-01-PLAN.md — Vitest harness (two projects) + pathfinder unit tests (FND-04)
  - [x] 09-02-PLAN.md — supabase/migrations: baseline + wallet exemplar + RLS shells + profiles tighten (FND-01)
  - [x] 09-03-PLAN.md — thin src/lib/api/ seam (account/rooms/wallet) replacing direct scene table calls (FND-05)
  - [x] 09-04-PLAN.md — email-only identity: delete the 'guest' literal, require real UUID at play entry (FND-02)
  - [x] 09-05-PLAN.md — RLS forged-write/idempotency test + bundle secret-scan + CI workflow (FND-01/03/05)
  - [x] 09-06-PLAN.md — [BLOCKING] push committed migrations to the live Supabase project (FND-01)

### Phase 10: Services & Simulation Refactor

**Goal**: Scenes are decoupled from Supabase wiring and from the `GameScene` monolith, and the battle loop lives in a standalone, unit-tested `src/sim/` module — all with no change to observable gameplay.
**Depends on**: Phase 9
**Requirements**: BATTLE-02
**Success Criteria** (what must be TRUE):

  1. The battle loop is extracted from `GameScene` into a standalone `src/sim/` simulation module that runs the same battle with no player-visible behavior change.
  2. The extracted simulation has unit tests in the Phase 9 harness covering core combat/movement/win resolution.
  3. `gameState` is reduced to a session/battle read-through cache, with persistent fields read through the `src/lib/api/` services layer rather than mutated ad hoc.
  4. Towers are promoted out of the inline `GameScene` definition into a dedicated module consistent with the `Unit` abstraction.

**Plans**: 5 plans

  - [x] 10-01-PLAN.md — Promote towers into src/towers/ (TowerData flat table + TowerView) + centralize resolveSide helper (D-09/D-10/D-11)
  - [x] 10-02-PLAN.md — Pure src/sim/ core: types + createWorld + combat (test-first, D-07 tiebreak) + step() single tick entry with injected rng (D-01/D-06/D-08)
  - [x] 10-03-PLAN.md — Wire GameScene to the sim: UnitView split, id-reconcile, event mapping, wire protocol preserved (D-02/D-03/D-04)
  - [x] 10-04-PLAN.md — Slim gameState to a session/profile read-through cache; sim world is the battle source of truth (D-12/D-13/D-14)
  - [x] 10-05-PLAN.md — Win + wall-break + characterization-snapshot tests (D-15/D-17) + manual two-session parity gate (D-16)

### Phase 11: Accounts & Economy

**Goal**: Accounts, profiles, wallet, and unit ownership are server truth — earned and spent through server-side authoritative writes — and existing v1.0 accounts are migrated forward with no loss.
**Depends on**: Phase 10
**Requirements**: ACCT-01, ACCT-02, ACCT-03, ACCT-04, ECON-01, ECON-02, ECON-03, ECON-04, ECON-05
**Success Criteria** (what must be TRUE):

  1. A player's account, display name, lifetime stats (wins/losses, balance, rank placeholder), and owned units persist across logout and app restart, and can be viewed on the profile (integrating provided designs).
  2. A player earns a persistent soft currency for completing a battle — distinct from in-match gold — computed and granted server-side from a match result, never client-supplied.
  3. A player can spend currency to unlock the three non-starter units (Assault Bot, Thorn Beast, Elementalist), and the wallet balance and owned units are readable but never client-writable.
  4. Currency grants are idempotent and balances can never go negative or be double-spent (server-enforced atomic writes; retry credits once).
  5. Existing v1.0 `profiles` rows (wins, unlocked units) are migrated forward into the new model with no data loss.

**Plans**: 5 plans
- [ ] 11-01-PLAN.md — Wave 0: esc() XSS helper + economy unit tests + RED RLS/settlement/migration scaffolds
- [ ] 11-02-PLAN.md — Authoritative schema: inventory/match_results reshape, match_settlements, 4 SECURITY DEFINER RPCs, v1.0 backfill + [BLOCKING] schema apply
- [ ] 11-03-PLAN.md — Services seam: inventory/settlement/profile clients; retire client-authoritative unlock from account.ts
- [ ] 11-04-PLAN.md — RLS proof: GREEN idempotency/concurrency/forged-grant/mismatch/migration tests against live schema
- [ ] 11-05-PLAN.md — Scene wiring: retire recordResult, submit match report, escape username, provision_account, profile + spend-to-unlock
**UI hint**: yes

### Phase 12: Progression & Upgrades

**Goal**: Players spend currency to upgrade individual units and tower/faction power as persisted levels, and battle stats for both participants reflect those levels — all driven by a server-side balance config.
**Depends on**: Phase 11
**Requirements**: PROG-01, PROG-02, PROG-03, PROG-04
**Success Criteria** (what must be TRUE):

  1. A player can spend currency to upgrade individual units to higher levels that persist between matches.
  2. A player can upgrade tower / faction power that persists between matches.
  3. Unit and tower stats used in battle reflect the persisted upgrade levels of both participants, not just the local player.
  4. Upgrade costs and effects come from a server-side balance config (not client-editable), and progression is stored as levels (not denormalized stats) so balance can be retuned safely.

**Plans**: TBD
**UI hint**: yes

### Phase 13: Matchmaking & Ranking

**Goal**: A player can press Quick Match and be paired by hidden skill rating through a race-safe, server-tracked match lifecycle, see a visible trophy rank that moves with results, and review recent matches — while the room-code friend path is preserved.
**Depends on**: Phase 12
**Requirements**: MM-01, MM-02, MM-03, MM-04, MM-05, RANK-01, RANK-02, HIST-01
**Success Criteria** (what must be TRUE):

  1. A player can press Quick Match and be matched automatically with an opponent, paired by a hidden MMR within a range that widens the longer they wait, while still being able to challenge a friend via room code.
  2. Matchmaking is race-safe (atomic queue pop): no double-joins, no player matched to two opponents, no ghost matches.
  3. Each match has a server-tracked lifecycle (queued → active → completed/abandoned) with server-side timeouts that clean up abandoned matches.
  4. A player has a visible rank/trophy rating derived server-side from match results that rises on wins and falls on losses, shown on the profile and post-match summary (integrating provided designs).
  5. A player can view a list of recent matches showing opponent, result, and rewards earned.

**Plans**: TBD
**UI hint**: yes
**Research flag**: Matchmaking — atomic MMR pairing under load and lifecycle/timeout design warrant a focused research pass at plan time (FIFO is well understood; bounded-range MMR expansion less so).

### Phase 14: Battle Authority & Result Validation

**Goal**: Match outcomes become server-trusted: a deterministic simulation lets each client submit a signed match report, and the server validates and bounds-checks reports before settling result, rewards, progression, and rating.
**Depends on**: Phase 13
**Requirements**: BATTLE-01, BATTLE-03, BATTLE-04
**Success Criteria** (what must be TRUE):

  1. The battle simulation is deterministic — fixed timestep, seeded RNG, stable entity ordering — so identical inputs produce identical outcomes, proven by a reproducibility unit test.
  2. On match end, each client submits a signed match report (winner, final base HP, duration, deploy log, seed).
  3. The server validates and bounds-checks submitted reports and only then settles result, rewards, progression, and rating; mismatched or implausible reports are rejected.
  4. Forged win reports, fabricated base HP, and infinite-currency claims from a lone modified client are caught and rejected (the worst v1.0 trust exploits are closed).

**Plans**: TBD
**Research flag**: Highest-risk phase — run the research-phase flag at plan time. Requires removing the four documented sources of nondeterminism (dt-scaled movement, unstable target sort, unseeded RNG, independent sims) and designing the validation payload/bounds. Validate in planning that order-stable + fixed-timestep + seeded PRNG yields reproducible outcomes in a unit test before committing to report-comparison.

## Progress

**Execution Order:**
Phases execute in numeric order: 9 → 10 → 11 → 12 → 13 → 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 9. Backend Foundations & Integrity | v2.0 | 6/6 | Complete   | 2026-06-12 |
| 10. Services & Simulation Refactor | v2.0 | 1/5 | In progress | - |
| 11. Accounts & Economy | v2.0 | 0/TBD | Not started | - |
| 12. Progression & Upgrades | v2.0 | 0/TBD | Not started | - |
| 13. Matchmaking & Ranking | v2.0 | 0/TBD | Not started | - |
| 14. Battle Authority & Result Validation | v2.0 | 0/TBD | Not started | - |
