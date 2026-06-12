# Milestones

## v1.0 Prototype — Shipped

Realtime 1v1 lane-battle prototype. Proved the core game loop end-to-end.

**Delivered (phases 0–8):**
- GSD init + project scaffold (Phaser 3 + TS + Vite)
- Sprite / art pipeline
- Supabase auth & onboarding
- Realtime lobby / match join
- Pre-battle placement with multiplayer sync
- Core battle scene: 2 lanes, deployable units, auto-attacking towers, base HP, win/lose
- 6 units across 3 factions + loadout selection
- Grid map system (10 maps) with base placement
- Pathfinding, wall HP, lane-blockage detours
- Audio & visual effects

**Known debt carried into v2.0:** client-authoritative game state (trust/desync risk),
no automated tests, `GameScene.ts` monolith (~1100 lines). See `.planning/codebase/CONCERNS.md`.

## v2.0 Persistent Game Foundations — In Progress

Started 2026-06-12. Turn the prototype into a server-authoritative, account-based game
with economy, progression, and matchmaking — foundation for the hybrid PvP + async-raid
vision. See `.planning/PROJECT.md` for the current milestone definition.
