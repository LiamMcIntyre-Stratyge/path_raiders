---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Persistent Game Foundations
status: executing
stopped_at: Phase 11 (accounts-economy) COMPLETE — RLS suite 18/18 green in CI; GoTrue signup outage fixed; Task 4 in-app verification passed. Ready for Phase 12.
last_updated: "2026-06-13"
last_activity: 2026-06-13 -- Phase 11 closed: fixed remote GoTrue 500 (auth.users handle_new_user trigger NOT-NULL username abort), RLS 18/18 green, Task 4 earn→spend/XSS verified live
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 16
  completed_plans: 16
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-12)

**Core value:** The realtime lane battle is the heart of the game; every meta-system (accounts, economy, progression, matchmaking) exists to make that loop matter over time.
**Current focus:** Phase 11 (accounts-economy) — ✅ COMPLETE & VERIFIED. Next: Phase 12 (progression-upgrades).

## Current Position

Phase: 11 (accounts-economy) — ✅ COMPLETE (all verifications passed)
Plan: 5 of 5 done (11-01…11-05). 11-04 RLS suite 18/18 GREEN in CI; 11-05 Task 4 (in-app earn→spend + XSS) verified live against the hosted project.
Status: Remote GoTrue signup outage fixed (hardened `handle_new_user` trigger fn, migration 20260613070000); RLS suite refactored off the broken GoTrue admin API to SQL-seeded users + minted JWTs (18/18 green); economy loop verified end-to-end on live (signup→100, unlock→0/insufficient, settle +50/+15), XSS escaping confirmed. Build green (tsc + vite build).
Last activity: 2026-06-13 -- Phase 11 closed

Progress: [█████░░░░░] 50% (Phases 9, 10 & 11 complete; next Phase 12)

Open follow-ups (non-blocking, by design):

- RLS integration test (test/rls/wallet-rls.test.ts) live-runs in CI on first push (no local Docker in dev).
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

Last session: 2026-06-13
Stopped at: **Phase 11 (accounts-economy) executed** — all 5 plans authored and committed (waves 1-4),
build green (tsc + vite build). 11-01 (esc helper + unit tests GREEN + RLS scaffolds), 11-02 (accounts/economy
migration — pushed to remote by user), 11-03 (typed API seam; client-authoritative unlock retired), 11-04
(RLS suite assertions authored), 11-05 (scene wiring: opponentId/walletBalance, reportMatchResult, esc XSS,
provision_account on signup, ProfileScene). **Two verifications remain, both blocked on the remote
`auth.users` createUser DB error** (see Blockers): 11-04 full RLS suite GREEN, and 11-05 Task 4 in-app
earn→spend/XSS verify.
**Next:** (1) fix remote createUser (Supabase MCP get_logs/execute_sql on the auth.users trigger), then
(2) run `npx vitest run --project rls` GREEN (env mapped from .env.local), then (3) `npm run dev` Task-4 in-app
verify, then (4) /gsd:verify-work 11. Also rename VITE__SUPABASE_SERVICE_ROLE_KEY → non-VITE_ (security).
Resume file (P11 context): .planning/phases/11-accounts-economy/11-CONTEXT.md

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
