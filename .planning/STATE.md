---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Persistent Game Foundations
status: executing
stopped_at: Phase 12 (progression-upgrades) COMPLETE — 4/4 plans; upgrade_spend migration live + RPC verified; two-client parity + upgrade-screen in-app verify approved 2026-06-14. Next: Phase 13 (matchmaking-ranking).
last_updated: "2026-06-14"
last_activity: 2026-06-14 -- Phase 12 closed: 12-04 two-client parity + upgrade-screen verified live (approved); all 4 plans complete
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 20
  completed_plans: 20
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-12)

**Core value:** The realtime lane battle is the heart of the game; every meta-system (accounts, economy, progression, matchmaking) exists to make that loop matter over time.
**Current focus:** Phase 12 (progression-upgrades) — ✅ COMPLETE & VERIFIED. Next: Phase 13 (matchmaking-ranking).

## Current Position

Phase: 12 (progression-upgrades) — ✅ COMPLETE (all 4 plans; two-client verify approved)
Plan: 4 of 4 done (12-01…12-04). 12-01 (per-level UNIT_LEVELS/TOWER_LEVELS tables, resolveUnitStats/resolveTowerStats, clampLevels D-12, RED scaffolds); 12-03 (sim level injection — createWorld/spawnUnit/spawnAI resolve from per-side level maps, sim-levels GREEN, level-1 invariant + sim purity preserved); 12-02 (upgrades table + upgrade_spend SECURITY DEFINER RPC + progression.ts seam) — migration applied live (history 20260614000000), RPC proven via REST (deduct/increment, insufficient_funds, deny-direct-write 42501, deny UPDATE 0-rows, select-own); 12-04 (PlacementScene level exchange/clamp, LoadoutScene resolved-stat display, new UpgradeScene, Lobby gear wiring) — two-client parity + upgrade-screen in-app verify APPROVED 2026-06-14.
Status: Phase complete. tsc clean, vite build passes, unit suite 94/94 GREEN. `upgrade_spend` live; the four PROG requirements (PROG-01/02/03/04) delivered.
Last activity: 2026-06-14 -- Phase 12 closed (12-04 verified)

Progress: [██████░░░░] 67% (Phases 9, 10, 11 & 12 complete; next Phase 13 — matchmaking & ranking)

Suggested next: `/gsd:verify-work 12` (goal-backward phase verification) before starting Phase 13, or proceed to Phase 13 planning.

Open follow-ups (non-blocking, by design):

- Mock test accounts on the live project: `commander.alpha@example.test` / `commander.bravo@example.test` (pw `PathRaiders!1`) — created for the 12-04 two-client verify; delete when no longer needed.
- The starter-unit ownership gap surfaced during verify: `upgrade_spend` checks `public.inventory`, but signup only grants a wallet (starters live in `profiles.unlocked_units`, not inventory) — confirm whether signup should seed starter inventory.
- Live prod deploy confirmed via user "pushed" sign-off; optional final Dashboard audit for auditability.

## Context

### Decisions

- v2.0 is a foundational slice: accounts, economy, progression, matchmaking, server-auth — not the whole game.
- Authority model = Option A (Supabase-only result validation). Dedicated Colyseus game-server is out of scope (documented upgrade path only).
- Phases ordered by dependency + risk: backend integrity → services/sim refactor → accounts+economy → progression → matchmaking+ranking → battle authority (highest risk, last).
- The four competitive "should-have" systems (hidden MMR, per-unit/tower upgrades, visible rank, match history) pulled into scope.
- UI/UX and characters owned by user in Claude designs; GSD milestone integrates them, does not design them.
- [Phase ?]: 09-01: Explicit vitest imports (no globals) to keep prod tsc scope clean; separate tsconfig.test.json for test type-checking; hand-built ROWS×COLS grids for deterministic pathfinder tests
- [Phase ?]: Typed src/lib/api/ seam (account/rooms/wallet) wraps all scene table calls; wallet writes route exclusively through credit_wallet RPC
- [Phase ?]: Added scene-entry guard + per-handler guards in LobbyScene; 'guest' identity literal removed phase-wide; role union preserved (FND-02, D-04/D-05/D-06)
- [Phase 10-01]: Towers split into src/towers/ TowerData (flat static stats, no scaling — D-10) + TowerView (Phaser render — D-09), mirroring the Unit data/view abstraction
- [Phase 10-01]: Side/faction resolution centralized into one pure src/lib/sideHelper.ts (resolveSide + opponentFaction); FC color table de-duplicated into TowerView (D-11)
- [Phase 10-02]: Pure src/sim/ core (types/world/combat/step) — zero Phaser/Supabase/gameState imports (D-01); single step(world, inputs, dt, rng=Math.random) tick entry (D-08); injected rng with the only sim RNG being practice-AI spawning (D-06); D-07 id-tiebreak on both nearest-target sorts
- [Phase 10-02]: COMBAT_RANGE/BASE_REACH_DMG relocated into src/sim/types.ts (Unit.ts imports Phaser; sim owns the constants now). createWorld() is a factory, not a singleton, so Vitest instantiates fresh worlds per scenario
- [Phase 10-03]: Unit.ts split into src/units/UnitView.ts (Phaser render-half keyed by SimUnit.id: syncFrom + playDeathAnimation) — D-02; Unit.ts reduced to a constant re-export
- [Phase 10-03]: GameScene drives the sim — update() = drain inputs → step(world,inputs,dt,Math.random) → reconcile views by id → event mapping; five updateX methods deleted (D-03/D-08)
- [Phase 10-03]: Per-attack audio.playHit() preserved scene-side via a prevAttackCds attackCd-reset monitor (continuous-state read, not a sim event) — keeps src/sim audio-free (SC#1)
- [Phase 10-03]: Supabase wire protocol preserved byte-for-byte (deploy/wall_break/base_hp/game_over); received deploy/wall_break → sim inputs; received base_hp overwrites world HP directly (D-04/D-12)
- [Phase 10-04]: gameState reduced to a session + read-through profile cache (D-14) — removed hostBaseHp/guestBaseHp/gold/dead gameMode from GameStateType + the singleton; the sim SimWorld is the sole source of truth for live battle state (D-12); recordResult/recordMatchResult write path unchanged (D-13)
- [Phase 10-04]: STARTING_GOLD exported from src/sim/world.ts as the single gold-default source; createWorld + LobbyScene HUD consume it; GameScene.init no longer seeds world gold from gameState.gold (no cross-scene gold persistence)
- [Phase 11]: Economy is server-authoritative via SECURITY DEFINER RPCs (spend_unlock, report_match_result, provision_account, credit_wallet_for_user) with search_path='' + RLS deny-by-default on wallet/inventory/match_results/match_settlements; constants embedded in SQL only (WIN_REWARD=50/LOSS_REWARD=15/WELCOME_GRANT=100/unit cost=100)
- [Phase 11]: Settlement requires BOTH players' reports to agree (idempotent per match_id via match_settlements ON CONFLICT + GET DIAGNOSTICS); mismatch→void, lone→pending; winner identified by claimed_winner UUID, never auth.uid() (mutual collusion = accepted interim risk D-05, hardened in P14)
- [Phase 11-05]: Client recordResult/win-milestone unlock RETIRED (P10 D-13 handoff) — GameScene submits a winner claim via reportMatchResult after game_over; winner derived from sim role→UUID, skips settlement if opponentId not a valid UUID (no forged self-win on loss); username esc()-escaped at GameScene+LobbyScene innerHTML sites (stored-XSS closed, D-14); ProfileScene data/behavior wired to getProfileFull+spendUnlock (visual design user-owned)
- [Phase 11]: Migration applied to REMOTE Supabase via `supabase db push` (user decision — no local Docker); RLS suite runs against the cloud DB (env mapped from .env.local for local runs, CI injects directly)
- [Phase 12]: Progression stores LEVELS not stats — `upgrades(user_id, scope, target_id, level)` + per-level stat tables (UNIT_LEVELS/TOWER_LEVELS) resolved by `resolveUnitStats`/`resolveTowerStats`; level-1 invariant = flat baseline, so omitting all levels reproduces the exact pre-P12 battle (no behavior change for existing callers). `clampLevels` (D-12) guards opponent-supplied levels client-side; server-side level-ownership deferred to P14 (accepted interim risk, mirrors P11 D-05)
- [Phase 12]: `upgrade_spend(p_scope, p_target_id)` SECURITY DEFINER RPC = the authority core (mirrors spend_unlock): server-embedded cost CASE (unit 75/150/300/600, tower 100/200/400/800 — client never supplies amount, PROG-04/D-03), ownership check vs inventory for scope=unit (D-16), atomic guarded deduct, level-transition upsert + GET DIAGNOSTICS concurrency guard (Landmines #1-3), max-level 5 (D-10). RLS select-own only, zero client write policies (deny-by-default); scenes read/spend only via `src/lib/api/progression.ts` (FND-05)
- [Phase 12]: signup `handle_new_user` trigger is captured FUNCTION-ONLY in migrations (20260613070000) — the trigger itself stays out-of-band on the live DB so CI's `test_create_user` seeds bare users (no auto-provision) and the RLS suite's zero-balance/bare-profile assumptions hold; the app provisions explicitly via provision_account regardless
- [Phase 12 audit-fix 2026-06-14]: `20260613062000_table_grants.sql` must NOT grant `public.upgrades` — that table is created later by `20260614000000_progression.sql` (which grants it self-containedly); listing it in table_grants broke fresh-DB `supabase db reset` ("relation does not exist", grants apply in timestamp order)

### Blockers

- ~~**Remote `auth.users` createUser fails**~~ — **RESOLVED 2026-06-13.** Confirmed via Supabase MCP `get_logs`(auth): a dashboard-created `on_auth_user_created` trigger ran `handle_new_user`, which inserted `profiles(id, username)` from signup metadata; app signups carry no metadata → `NULL` into `NOT NULL profiles.username` → `auth.users` insert aborted → 500. Fixed by hardening `handle_new_user` (coalesce username fallback + guard both side effects), applied live and captured in migration `20260613070000_signup_trigger_hardening.sql`. RLS suite was independently refactored off the GoTrue admin API (SQL-seeded users + minted JWTs); 18/18 green in CI.
- **Security follow-up (.env.local):** service-role key is stored as `VITE__SUPABASE_SERVICE_ROLE_KEY` — `VITE_` prefix means Vite would bundle the secret into the client if any `src/` reads it. Rename to a non-`VITE_` name; confirm no `src/` reference. Vitest also doesn't auto-load `.env.local`; RLS env (`SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY`) must be exported (CI) or mapped for local runs.

### Todos

- None yet.

### Research flags (at plan time)

- Phase 14 (Battle Authority / determinism pass) — highest-risk; run research-phase flag.
- Phase 13 (Matchmaking) — focused pass on atomic MMR pairing under load + lifecycle/timeout design.

## Milestone History

- v1.0 Prototype — realtime 1v1 lane-battle prototype (phases 0–8): scaffold, art pipeline, auth, lobby, placement, core battle, units/towers, maps/pathfinding, polish. Shipped as the foundation for v2.0.

## Session Continuity

Last session: 2026-06-14
Stopped at: **Phase 12 (progression-upgrades) implemented** — all 4 plans coded & committed on `main`. 12-01
(per-level UNIT_LEVELS/TOWER_LEVELS tables, resolvers, clampLevels D-12, RED scaffolds; tests GREEN) ✅; 12-03
(sim level injection — createWorld/spawnUnit/spawnAI resolve from per-side level maps; sim-levels GREEN; level-1
invariant + sim purity intact) ✅; 12-02 (upgrades table + upgrade_spend RPC migration + progression.ts seam) ✅
— migration applied live to remote (history 20260614000000) and RPC verified via REST with a real user JWT
(deduct/increment, insufficient_funds, deny-direct-write 42501, deny UPDATE 0-rows, select-own); 12-04
(PlacementScene level exchange/clamp, LoadoutScene resolved-stat display, new UpgradeScene, Lobby gear wiring) —
Tasks 1-2 done. Build green: tsc clean, vite build passes, unit 94/94 GREEN.
**Phase 12 CLOSED 2026-06-14** — 12-04 Task 3 (two-client parity + upgrade-screen in-app verify) approved by the
user against the live DB (mock accounts alpha/bravo; bravo pre-upgraded so opponent-level parity was visible).
All four PROG requirements delivered. **Audit-fix 2026-06-14:** diagnosed the RLS suite is CI/local-stack-only by
design (`test_create_user` is remote-absent by A3/A4 containment — cannot run locally against remote); fixed a
migration ordering bug (removed `public.upgrades` from `table_grants` — created later by the progression migration,
which grants it).
**Next:** (1) optional `/gsd:verify-work 12` (goal-backward phase verification) for the record; (2) start Phase 13
(matchmaking & ranking) — needs a focused research pass on atomic MMR pairing under load + match lifecycle/timeout
design (see Research flags). Still open from P11: rename VITE__SUPABASE_SERVICE_ROLE_KEY → non-VITE_ (security).
Cleanup: delete mock accounts commander.alpha/bravo@example.test when done testing.
Resume file (P13 context): plan Phase 13 next (no CONTEXT yet).

✓ Resolved 2026-06-12: Reworded REQUIREMENTS.md (FND-02) + ROADMAP.md (Phase 9 Goal/SC#2)
to the email-only identity criterion (D-04, no anonymous auth) before planning Phase 9, so
the verifier checks against the email-only criterion.

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 09 P01 | 15min | 3 tasks | 4 files |
| Phase 09-backend-foundations-integrity P02 | 25 | - tasks | - files |
| Phase 09 P03 | 25 | 3 tasks | 6 files |
| Phase 09-backend-foundations-integrity P04 | 15 | 3 tasks | 2 files |
| Phase 10 P01 | 4min | 3 tasks | 4 files |
| Phase 10 P02 | 7min | 3 tasks | 7 files |
| Phase 10 P03 | 5min | 2 tasks | 3 files |
| Phase 10 P04 | 6min | 2 tasks | 5 files |
| Phase 10 P05 | ~2min | 3 tasks (2 auto + D-16 gate) | 4 files |
| Phase 12 P01 | ~7min | 3 tasks (TDD) | 7 files |
| Phase 12 P03 | ~12min | 2 tasks | 3 files |
| Phase 12 P02 | ~4min | 2 of 3 (T3 = live push, done via MCP) | 2 files |
| Phase 12 P04 | ~9min | 2 of 3 (T3 = two-client verify, pending) | 4 files |
