# Path Raiders — Project Context

## What This Is

Path Raiders is a hybrid tower-defence / base-attack strategy game for web and mobile.
Three factions — Machines, Raven Plants, and Wizards — battle across multi-lane maps
with deployable units, auto-attacking towers, and destructible bases.

The **v1.0 prototype** proved the core realtime 1v1 lane-battle loop. The long-term
vision is a **hybrid game**: live PvP battles *and* async base-building/raids on offline
players, with the persistence, economy, and progression depth of a Clash-of-Clans-class
title.

## Core Value

The realtime lane battle is the heart of the game — deploy units and towers, exploit
lane blockages and pathing, and destroy the enemy base before they destroy yours. Every
meta-system (accounts, economy, progression, matchmaking) exists to make that loop
matter over time.

## Tech Stack

- Engine: Phaser 3 + TypeScript
- Bundler: Vite (vanilla-ts template)
- Backend: Supabase (auth + realtime + Postgres DB)
- Deploy: Vercel (web) + Capacitor (mobile)

See `.planning/codebase/STACK.md` and `INTEGRATIONS.md` for the full mapped stack.

## Game World

- World size: 2560 × 720px
- Lane 1: y=200 (top lane), Lane 2: y=520 (bottom lane)
- Host base (left): x=60, attacks right
- Guest base (right): x=2380, attacks left
- Blockage on Lane 1 at x=1080 forces detour to Lane 2

## Factions & Units

| Faction  | Unit            | Tier | Starter |
|----------|-----------------|------|---------|
| Machines | Scout Drone     | T1   | Yes     |
| Machines | Assault Bot     | T2   | No      |
| Plants   | Vine Crawler    | T1   | Yes     |
| Plants   | Thorn Beast     | T2   | No      |
| Wizards  | Apprentice Mage | T1   | No      |
| Wizards  | Elementalist    | T2   | No      |

## Current Milestone: v2.0 Persistent Game Foundations

**Goal:** Turn the v1.0 realtime prototype into a server-authoritative, account-based
game with economy, progression, and matchmaking — the foundation for the long-term
hybrid PvP + async-raid vision.

**Target systems:**
- **Accounts & profiles** — persistent player identity, stats, profile
- **Economy & unlocks** — currency earned from battles, spent to unlock units/upgrades
- **Progression & upgrades** — level up units / factions / towers; persistent power between matches
- **Matchmaking & server-authoritative backend** — real matchmaking + lobbies, with authoritative
  game state moved server-side (pays down the client-authoritative trust/desync debt)

**Working in parallel (owned by user, outside GSD):**
- Characters and UI/UX are being designed separately in Claude designs. This milestone
  focuses on systems / backend / game logic; UI phases here mean *integrating those
  designs*, not designing UI from scratch.

## Requirements

### Validated (shipped in v1.0 prototype)

- ✓ Phaser 3 + TS + Vite scaffold and sprite/art pipeline — existing
- ✓ Supabase email/password auth (`AuthScene`) — existing
- ✓ Realtime lobby / match join (`LobbyScene`) — existing
- ✓ Pre-battle placement phase with multiplayer sync (`PlacementScene`) — existing
- ✓ Core realtime battle: 2 lanes, deployable units, auto-attacking towers, base HP, win/lose (`GameScene`) — existing
- ✓ 6 units across 3 factions, loadout selection (`LoadoutScene`, `UnitData`) — existing
- ✓ Grid map system with 10 maps and base placement — existing
- ✓ Pathfinding, wall HP, lane-blockage detours — existing
- ✓ Audio and visual effects pass — existing

### Active (v2.0 — hypotheses until shipped & validated)

- [ ] Persistent player accounts & profiles (identity, stats, match history)
- [ ] Currency economy — earn from battles, spend to unlock content
- [ ] Unit / faction / tower progression & upgrades that persist between matches
- [ ] Real matchmaking + lobbies
- [ ] Server-authoritative game state (validation against cheating / desync)

### Out of Scope (this milestone)

- Async base-building & raids on offline players — core of the long-term vision, deferred to a later milestone once foundations exist
- Clans / guilds / social graph — deferred
- Leaderboards, seasons, ranked ladders — deferred
- Net-new UI/UX design — owned by user in Claude designs; this milestone integrates, not designs

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v2.0 = foundational slice, not the whole game | "Fully functioning" is huge; build the systems everything else needs first | — Pending |
| Long-term loop is hybrid (realtime PvP + async raids) | User vision; realtime PvP stays the core, async raids layer on later | — Pending |
| Migrate client-authoritative → server-authoritative | Current model is trust-based and desync-prone (see `codebase/CONCERNS.md`); persistence/economy require an authoritative source of truth | — Pending |
| Backend stays Supabase | Already integrated for auth/realtime/DB; extend with Postgres schema + likely Edge Functions for server logic | — Pending |
| UI/UX & characters owned by user (Claude designs) | User is designing these in parallel; GSD milestone focuses on systems and wires designs in | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-12 — milestone v2.0 started*
