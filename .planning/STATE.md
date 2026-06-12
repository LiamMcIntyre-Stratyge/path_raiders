---
milestone: v2.0
milestone_name: Persistent Game Foundations
status: planning
progress:
  phases_total: 0
  phases_done: 0
  plans_total: 0
  plans_done: 0
---

# Project State

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-12 — Milestone v2.0 started

## Context

### Decisions
- v2.0 is a foundational slice: accounts, economy, progression, matchmaking, server-auth — not the whole game.
- Long-term loop is hybrid (realtime PvP + async raids); async raids deferred to a later milestone.
- Migrating from client-authoritative to server-authoritative game state.
- Backend stays Supabase (Postgres + realtime + likely Edge Functions).
- UI/UX and characters owned by user in Claude designs; GSD milestone integrates them.

### Blockers
- None.

### Todos
- None yet.

## Milestone History
- v1.0 Prototype — realtime 1v1 lane-battle prototype (phases 0–8): scaffold, art pipeline, auth, lobby, placement, core battle, units/towers, maps/pathfinding, polish. Shipped as the foundation for v2.0.
