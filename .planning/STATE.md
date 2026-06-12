---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Persistent Game Foundations
status: executing
stopped_at: Completed 10-04-PLAN.md (slimmed gameState to a session/profile read-through cache; removed hostBaseHp/guestBaseHp/gold/gameMode; sim world is the sole battle source of truth)
last_updated: "2026-06-12T13:09:01Z"
last_activity: 2026-06-12 -- Phase 10 Plan 04 executed
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 16
  completed_plans: 10
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-12)

**Core value:** The realtime lane battle is the heart of the game; every meta-system (accounts, economy, progression, matchmaking) exists to make that loop matter over time.
**Current focus:** Phase 10 — services-simulation-refactor

## Current Position

Phase: 10 (services-simulation-refactor) — IN PROGRESS
Plan: 4 of 5 executed (10-01, 10-02, 10-03, 10-04 complete)
Status: Ready to execute 10-05
Last activity: 2026-06-12 -- Phase 10 Plan 04 executed

Progress: [██░░░░░░░░] 25% (Phase 9 complete; Phase 10 4/5 plans)

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

### Blockers

- None.

### Todos

- None yet.

### Research flags (at plan time)

- Phase 14 (Battle Authority / determinism pass) — highest-risk; run research-phase flag.
- Phase 13 (Matchmaking) — focused pass on atomic MMR pairing under load + lifecycle/timeout design.

## Milestone History

- v1.0 Prototype — realtime 1v1 lane-battle prototype (phases 0–8): scaffold, art pipeline, auth, lobby, placement, core battle, units/towers, maps/pathfinding, polish. Shipped as the foundation for v2.0.

## Session Continuity

Last session: 2026-06-12
Stopped at: Completed 10-04-PLAN.md (gameState reduction — D-12/D-13/D-14: removed
hostBaseHp/guestBaseHp/gold/dead gameMode from GameStateType + the singleton; gameState is now
a documented session + read-through profile cache; the sim SimWorld is the sole source of truth
for live battle state; recordResult write path unchanged). ROADMAP SC#3 complete.
Phase 10 Plan 04 of 5 done. **Next: execute 10-05** (win + wall-break + characterization-snapshot
tests — D-15/D-17 — plus the manual two-session parity gate, D-16: the last gate before
"no player-visible change" is confirmed). Phase 11 (already context-gathered) still depends on
Phase 10's read-through gameState + the recordResult-authority handoff (P10 D-13).
Resume file (execution): .planning/phases/10-services-simulation-refactor/10-05-PLAN.md
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
