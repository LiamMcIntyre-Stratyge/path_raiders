# Path Raiders — Project Context

## Overview
Path Raiders is a hybrid tower-defence / base-attack strategy game for web and mobile.
Three factions — Machines, Raven Plants, and Wizards — battle across multi-lane maps
with deployable units, auto-attacking towers, and destructible bases.

## Tech Stack
- Engine: Phaser 3 + TypeScript
- Bundler: Vite (vanilla-ts template)
- Backend: Supabase (auth + realtime + DB)
- Deploy: Vercel (web) + Capacitor (mobile)


## Game World
- World size: 2560 × 720px
- Lane 1: y=200 (top lane)
- Lane 2: y=520 (bottom lane)
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

## Milestone
v1.0 Prototype — 1 map, 2 lanes, 6 units, 1v1 realtime, deployed to Vercel

## Phases
0. GSD init ✅
1. Project setup ✅
2. Art pipeline
3. Auth & onboarding
4. Core game scene
5. Units & towers
6. Win/lose & HUD
7. Multiplayer
8. Polish & deploy
