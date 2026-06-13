# Phase 12: Progression & Upgrades - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 12-Progression & Upgrades
**Areas discussed:** Tower/faction power scope, Stat scaling model, Depth & cost curve, Opponent-level sync & authority

---

## Tower/faction power scope

### How many tracks (PROG-02)?
| Option | Description | Selected |
|--------|-------------|----------|
| One combined "faction power" track | Single per-faction track; what it buffs decided separately | |
| Two tracks: towers + faction | Separate tower-power and faction-power, leveled independently | |
| Towers only | PROG-02 is purely a tower-power track; per-unit upgrades cover unit power | ✓ |

**User's choice:** Towers only.
**Notes:** "Faction" just describes whose towers; avoids overlap with PROG-01 unit upgrades.

### What does tower power buff?
| Option | Description | Selected |
|--------|-------------|----------|
| Damage per shot | More dmg per hit (base 25) | ✓ |
| Fire rate (cooldown) | Shorter cooldown (base 1400ms) | |
| Range | Larger attack radius (base 216px) | |

**User's choice:** Damage per shot.
**Notes:** Planner flag — tower upgrade levels should live in the same static config shape as
unit stages: a `TOWER_LEVELS` table in `TowerData.ts` with range/dmg/cd per level. Phase 10
left it flat specifically so Phase 12 extends it to a levels array without a schema change.
The planner should reference that prepared extension point explicitly.

---

## Stat scaling model

### Where does the level→stat mapping live? (PROG-04 'effects')
| Option | Description | Selected |
|--------|-------------|----------|
| Client static tables now; server source-of-record for levels+costs | Effects in UnitData/TowerData, trusted until P14 | ✓ |
| Server config table, client fetches effects too | Full PROG-04 literal; heavier fetch/cache path | |
| Server config table, generate client tables from it | Build-step generated; adds tooling | |

**User's choice:** Client static tables now; server is source-of-record for levels + derives costs.
**Notes:** Planner flag — add a `BALANCE_VERSION` constant to `TowerData.ts` and `UnitData.ts`;
becomes the cache key when config eventually moves server-driven. Free now, saves a retrofit.

### Shape of a level's stat increase?
| Option | Description | Selected |
|--------|-------------|----------|
| Additive flat per level (+X) | Fixed amount per level | |
| Percentage per level (+Y%) | Proportional/compounding | |
| Hand-authored per-level values | Each level individually authored in the array | ✓ |

**User's choice:** Hand-authored per-level values.

### Which unit stats scale?
| Option | Description | Selected |
|--------|-------------|----------|
| HP | Survivability scales | ✓ |
| Damage | Damage-per-hit scales | ✓ |
| Move speed | speedPx scales | |
| Attack rate | Shorter cooldown per level | |

**User's choice:** HP + Damage. (Towers: Damage only, per earlier.)

---

## Depth & cost curve

### Role relative to P11's fast unlock economy?
| Option | Description | Selected |
|--------|-------------|----------|
| Long-tail depth sink (grindier than unlocks) | Unlocks = breadth fast, upgrades = depth slow | ✓ |
| Also fast, like unlocks | Cheap/quick, momentum-first | |
| Flat / shallow for now | Few levels, prove the mechanic | |

**User's choice:** Long-tail depth sink → implies escalating cost curve.

### Max-level ceiling?
| Option | Description | Selected |
|--------|-------------|----------|
| ~5 levels | Short legible ladder, extendable later | ✓ |
| ~10 levels | Longer grind, more to author/balance | |
| You decide | Claude picks 5–8 | |

**User's choice:** ~5 levels.

---

## Opponent-level sync & authority

### How does each client learn opponent levels? (PROG-03)
| Option | Description | Selected |
|--------|-------------|----------|
| Exchange over the realtime channel at match start | Trust-based, reuses placement/loadout handshake, harden P14 | ✓ |
| Server RPC returns both players' levels | More authoritative now; overlaps P13 match record | |
| You decide | Default to channel exchange | |

**User's choice:** Exchange over the realtime channel at match start.

### Interim guard on opponent-supplied levels?
| Option | Description | Selected |
|--------|-------------|----------|
| Clamp to valid range, no server check | Clamp to [1, MAX] and known tracks; ownership check → P14 | ✓ |
| Clamp + log mismatches for P14 | Same + breadcrumb logging | |
| No guard — trust raw | Simplest; risks broken stats | |

**User's choice:** Clamp to valid range, no server check.

---

## Wrap-up

After all four areas: user selected **"I'm ready for context"** — smaller plan-time defaults
(upgrade RPC mirrors `spend_unlock`; own-to-upgrade rule; absence-of-row = level 1; provided
upgrade-screen design wired to data) accepted as stated.

## Claude's Discretion

- Exact per-level stat values and per-level costs (within ~5 levels, escalating curve).
- Upgrade RPC signature and whether one parameterised RPC or a small set.
- `upgrades` table column details (following the research ARCHITECTURE.md proposal).

## Deferred Ideas

- Live server-driven balance config (seam prepared via BALANCE_VERSION + levels-not-stats).
- Server-side level/ownership validation → P14.
- Separate faction-power / base-HP tracks → set aside (towers-only).
- Move-speed / attack-rate / range scaling → set aside.
- Level ceiling past ~5 / deeper curves → append to array later.
- New upgrade *types* (abilities, evolutions, tiers) → out of milestone scope.
