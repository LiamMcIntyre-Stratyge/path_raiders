---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Persistent Game Foundations
status: executing
stopped_at: **Phase 12 (progression-upgrades) implemented** — all 4 plans coded; 12-01 & 12-03 fully complete; 12-02 & 12-04 await blocking human checkpoints (remote migration push + two-client verify),
last_updated: "2026-06-14T06:28:29.000Z"
last_activity: 2026-06-14 -- Phase 12 implemented (2 blocking checkpoints pending)
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 20
  completed_plans: 18
  percent: 90
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-12)

**Core value:** The realtime lane battle is the heart of the game; every meta-system (accounts, economy, progression, matchmaking) exists to make that loop matter over time.
**Current focus:** Phase 12 (progression-upgrades) — implemented; 2 blocking checkpoints pending (remote migration push + two-client verify)

## Current Position

Phase: 12 (progression-upgrades) — ◆ IMPLEMENTED, 2 blocking checkpoints pending
Plan: 4 of 4 coded (12-01…12-04). 12-01 (per-level tables/resolvers/clampLevels + RED scaffolds) and 12-03 (sim level injection) FULLY COMPLETE. 12-02 Tasks 1-2 (upgrades migration SQL + progression.ts seam) done — Task 3 (push migration to remote + upgrades-rls GREEN) is a BLOCKING checkpoint. 12-04 Tasks 1-2 (PlacementScene level exchange/clamp, LoadoutScene resolved-stat display, new UpgradeScene, scene wiring) done — Task 3 (two-client parity + upgrade-screen in-app verify) is a BLOCKING checkpoint.
Status: Code complete; awaiting user action on the 2 checkpoints below

Progress: [█████████░] 90% (Phases 9 & 10 complete; Phase 11 implemented-verifying; Phase 12 implemented, 2 checkpoints pending)

Build/test state: prod `tsc --noEmit` clean; `npm run build` passes; unit suite 94/94 GREEN. RLS suite NOT run (blocked — see below).

### Phase 12 blocking checkpoints (require user action, in order)

1. **12-02 Task 3 — push progression migration + RLS GREEN** (resume-signal: type `"applied"`):
   - Ensure P11 migration `20260613061943_accounts_economy.sql` is live on remote first (wallet/inventory must exist).
   - Resolve the remote `auth.users` createUser 500 blocker (still open — see Blockers) — it gates the RLS suite's `seedUser`.
   - `SUPABASE_ACCESS_TOKEN` exported → `supabase db push` → `supabase migration list` shows `20260614000000_progression` → `npx vitest run --project rls -- upgrades-rls` GREEN.
2. **12-04 Task 3 — two-client parity + upgrade-screen verify** (resume-signal: type `"approved"`), gated on checkpoint 1 being live:
   - `npm run dev`; Lobby → settings gear → Upgrades screen; upgrade a unit + the tower track; confirm balance deduct, level increment, delta preview, persistence after reload; non-owned shows "UNLOCK FIRST" (D-16), level-5 shows "MAX LEVEL" (D-10).
   - Two clients with different levels → multiplayer match → each sees own effective stats in Loadout; each renders OPPONENT at opponent's clamped levels; both agree on result (PROG-03 parity).

Open follow-ups (carried from Phase 11, non-blocking):

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

- **Remote `auth.users` createUser fails** (`500 unexpected_failure: "Database error creating new user"`) on the linked Supabase project (obcwvyaqdihdhcldewpe). Blocks 11-04 (full RLS suite GREEN) and 11-05 Task 4 (in-app earn→spend/XSS verify). Almost certainly a dashboard-created `on auth.users` trigger/function that raises (no such trigger in migrations). Diagnose via Supabase MCP `get_logs`(auth) + `execute_sql` on pg_trigger, or paste the trigger body. NOT an email-confirmation issue (tests use admin createUser email_confirm:true).
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
Stopped at: **Phase 12 (progression-upgrades) implemented** — all 4 plans coded & committed on `main` (sequential,
no worktrees; gsd-sdk query layer unavailable here → executors used plain git + gsd-tools.cjs). 12-01 (per-level
UNIT_LEVELS/TOWER_LEVELS tables, resolveUnitStats/resolveTowerStats, clampLevels D-12, RED scaffolds) FULLY
COMPLETE; 12-03 (sim level injection — createWorld/spawnUnit/spawnAI resolve from per-side level maps, sim-levels
GREEN, level-1 invariant preserved, sim purity intact) FULLY COMPLETE; 12-02 Tasks 1-2 (upgrades table +
upgrade_spend SECURITY DEFINER RPC migration, progression.ts seam) done; 12-04 Tasks 1-2 (PlacementScene level
exchange/clamp, LoadoutScene resolved-stat display, new UpgradeScene, Lobby gear wiring) done. Build green:
tsc clean, vite build passes, unit 94/94 GREEN.
**Two BLOCKING checkpoints remain** (see "Phase 12 blocking checkpoints" above): (1) 12-02 T3 push migration to
remote + upgrades-rls GREEN — still gated on the open remote `auth.users` createUser 500 blocker; (2) 12-04 T3
two-client parity + upgrade-screen in-app verify — gated on (1) being live.
**Next:** (1) resolve remote createUser 500 (Supabase MCP get_logs/execute_sql on the auth.users trigger — shared
blocker with P11), (2) `supabase db push` the P12 migration (after confirming P11 migration is live), (3)
`npx vitest run --project rls -- upgrades-rls` GREEN → reply `"applied"`, (4) `npm run dev` two-client verify →
reply `"approved"`, (5) /gsd:verify-work 12. Also still open from P11: rename VITE__SUPABASE_SERVICE_ROLE_KEY →
non-VITE_ (security), and P11's own two pending verifications.
Resume file (P12 context): .planning/phases/12-progression-upgrades/12-CONTEXT.md

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
| Phase 12 P02 | ~4min | 2 of 3 (T3 blocking) | 2 files |
| Phase 12 P04 | ~9min | 2 of 3 (T3 blocking) | 4 files |
