# Phase 12: Progression & Upgrades - Research

**Researched:** 2026-06-13
**Domain:** Per-unit and tower-power progression levels; server-side upgrade RPC; sim stat-injection; realtime level exchange
**Confidence:** HIGH — all findings grounded in live codebase reads; no third-party library unknowns

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Towers only — one track (no separate faction track; unit power via per-unit upgrades).
- D-02: Tower power buffs damage per shot only. Range (216px) and cooldown (1400ms) stay fixed.
- D-03: Effects live in client static tables; server is source-of-record for levels and costs.
- D-04: Hand-authored per-level values (not a formula).
- D-05: Units scale HP + Damage; towers scale Damage only. speedPx and attackRate stay fixed.
- D-06: TowerData.ts was deliberately left flat (TOWER_DEF) for P12 to extend to TOWER_LEVELS per-level array. Same shape for units. Author range/cd per level too for uniform shape even though only dmg scales.
- D-07: Add BALANCE_VERSION constant to TowerData.ts and UnitData.ts now.
- D-08: Upgrades are the long-tail depth sink (breadth = P11 unlocks; depth = P12 upgrades).
- D-09: Escalating cost curve — early levels cheap, later levels meaningfully expensive.
- D-10: ~5 levels max per track.
- D-11: Each client reads its OWN levels server-side, exchanges them over the existing realtime channel at match start. Sim runs on each client and spawns BOTH armies locally.
- D-12: Interim guard = clamp received opponent levels to [1, MAX_LEVEL] and known tracks before feeding the sim. No server ownership check (deferred to P14).
- D-14: Upgrade RPC mirrors spend_unlock: SECURITY DEFINER, search_path='', auth.uid() null-guard, server-derived cost, atomic guarded deduct, CHECK(balance>=0), revoke/grant footer. Guard new level = current+1.
- D-15: upgrades(user_id, scope text, target_id text, level int default 1 check(level>=1), primary key(user_id, scope, target_id)). RLS select-own only, NO client write policy. Absence of row = level 1.
- D-16: Must OWN a unit to upgrade it (starters owned by default; non-starters need P11 unlock).
- D-17: Whether one parameterised RPC or a small set is Claude's discretion.

### Claude's Discretion
- D-13: Exact per-level stat values and cost numbers (within ~5-level ceiling, escalating curve).
- D-17: RPC count/shape (one parameterised vs small set).

### Deferred Ideas (OUT OF SCOPE)
- Live server-driven balance config fetch (BALANCE_VERSION seam prepared, not built).
- Server-side level validation / opponent ownership proof (P14).
- Separate faction-power / base-HP upgrade tracks.
- Move-speed / attack-rate / range scaling.
- Raising level ceiling past ~5.
- New upgrade types (abilities, evolutions, new tiers).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROG-01 | A player can spend currency to upgrade individual units to higher levels that persist between matches. | upgrades table (D-15) + upgrade_spend RPC (D-14) + services seam (src/lib/api/progression.ts) |
| PROG-02 | A player can upgrade tower / faction power that persists between matches. | Same upgrades table with scope='tower', target_id='tower_power'; same RPC with tower track cost constants |
| PROG-03 | Unit and tower stats used in battle reflect the player's persisted upgrade levels for both participants. | Per-level tables in UnitData/TowerData + resolveUnitStats/resolveTowerStats + CreateWorldOptions carrying per-side level maps + opponent level exchange (D-11/D-12) |
| PROG-04 | Upgrade costs and effects come from a server-side balance config (not client-editable), and progression is stored as levels (not denormalized stats) so balance can be changed safely. | Costs embedded in SECURITY DEFINER RPC SQL only (never client-supplied); levels stored in upgrades table; stats re-derived from level + client static tables each session |
</phase_requirements>

---

## Summary

Phase 12 layers a levels-based progression system onto Phase 11's economy. There are three largely independent integration surfaces: (1) the database/RPC layer (upgrades table + upgrade_spend RPC), (2) the stat-resolution layer (per-level arrays in UnitData/TowerData + resolver functions), and (3) the sim-injection layer (threading levels through CreateWorldOptions and spawnUnit into the pure sim). A fourth cross-cutting concern is the realtime level exchange that glues (1) to (3) at match start.

The key architectural insight — confirmed by reading all canonical refs — is that the sim receives **pre-resolved stats** (not raw levels). The resolver runs in the scene/services layer before createWorld is called; the pure sim (`src/sim/`) never imports anything about levels, upgrades, or Supabase (P10 D-01). This keeps the sim clean and makes the resolver independently testable.

The upgrade RPC is a direct structural copy of the live `spend_unlock` RPC in `20260613061943_accounts_economy.sql`. The only additions are: (a) a level-transition guard (`new_level = current_level + 1`), (b) an ownership check against the inventory table, and (c) an upsert to the upgrades table instead of a one-time insert to inventory.

**Primary recommendation:** Treat the three surfaces as separate tasks with a clear handshake contract defined first: `resolveUnitStats(unitId, level) → { hp, dmg }` and `resolveTowerStats(level) → { dmg, range, maxCd }` are the seam. Everything else composes around those two pure functions.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Spend currency to upgrade a level | API/Backend (SECURITY DEFINER RPC) | — | Atomic wallet deduct + upgrades upsert must be server-authoritative; client never writes authoritative tables |
| Read own upgrade levels | API/Backend (RLS SELECT) via services seam | Client cache in gameState | RLS select-own; scenes use src/lib/api/progression.ts, never supabase.from() directly |
| Level → stat resolution | Client Static (UnitData/TowerData per-level arrays + resolver fn) | — | Effects client-side until P14; resolver is pure and testable; server holds levels only |
| Sim stat injection | Browser/Client (createWorld + spawnUnit call sites in GameScene) | — | Sim is pure; pre-resolved stats passed in via CreateWorldOptions and deploy input |
| Opponent level exchange | Browser/Client (PlacementScene broadcast channel) | — | Reuses existing placement:${roomId} channel; piggybacks on slot_pick pattern |
| Clamp guard on received levels | Browser/Client (PlacementScene receive handler) | — | D-12: clamp to [1, MAX_LEVEL], unknown ids → level 1, before feeding createWorld |
| Upgrade screen data binding | Browser/Client (UpgradeScene / scene to be added) | API/Backend (read current level + balance) | UI integrates provided design; data flows from progression.ts service |

---

## Standard Stack

No new external packages are introduced in this phase. All work is within existing stack.

### Core (existing, all in use)
| Library | Version | Purpose | Role in P12 |
|---------|---------|---------|-------------|
| @supabase/supabase-js | ^2.99.3 | Supabase client | RPC calls (upgrade_spend), RLS reads (own levels) |
| Phaser | 3.x | Game engine | Scene hosting; PlacementScene channel wiring |
| TypeScript | 5.x | Language | Resolver types, per-level array shapes |
| Vitest | latest | Test runner | Pure resolver tests + RLS upgrade tests |

### Supporting (no new installs)
| Component | Purpose | P12 Role |
|-----------|---------|---------|
| `supabase/migrations/` | SQL migration files | New upgrades table + upgrade_spend RPC |
| `src/lib/api/` | Services seam | New progression.ts client |
| `src/sim/types.ts` + `world.ts` | Sim contracts | Extended CreateWorldOptions; spawnUnit stat injection |
| `src/units/UnitData.ts` | Unit stat source | Extended to per-level arrays |
| `src/towers/TowerData.ts` | Tower stat source | Extended to per-level array |

**Installation:** No new packages needed. [VERIFIED: live codebase — package.json unchanged]

---

## Package Legitimacy Audit

No external packages are introduced in this phase. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │ UPGRADE FLOW (PROG-01/02/04)                                         │
 │                                                                       │
 │  UpgradeScene                                                         │
 │    │ user taps "Upgrade" button                                       │
 │    ▼                                                                  │
 │  progression.ts::upgradeSpend(scope, targetId)                       │
 │    │ supabase.rpc('upgrade_spend', { p_scope, p_target_id })         │
 │    ▼                                                                  │
 │  [SERVER] upgrade_spend RPC (SECURITY DEFINER)                       │
 │    ├─ auth.uid() null-guard                                           │
 │    ├─ if scope='unit': check inventory (D-16 own-to-upgrade)         │
 │    ├─ derive cost from server constants (scope + level → cost)       │
 │    ├─ atomic UPDATE wallet WHERE balance >= cost                      │
 │    ├─ if not found → insufficient_funds                               │
 │    └─ UPSERT upgrades SET level = level + 1 WHERE new_level = old+1 │
 │    ▼                                                                  │
 │  UpgradeScene refreshes balance + current level via progression.ts   │
 └─────────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────────┐
 │ MATCH-START LEVEL EXCHANGE (PROG-03 / D-11)                          │
 │                                                                       │
 │  PlacementScene (on SUBSCRIBED)                                       │
 │    ├─ progression.ts::getOwnLevels(userId)                           │
 │    │    → SELECT from upgrades WHERE user_id = auth.uid()            │
 │    ├─ broadcast 'loadout' payload: { slot, levels: OwnLevelMap }     │
 │    ▼                                                                  │
 │  PlacementScene (on 'loadout' receive)                                │
 │    ├─ clampLevels(payload.levels) → ClamppedLevelMap (D-12)          │
 │    └─ store as opponentLevels                                         │
 │                                                                       │
 │  launchGame() → GameScene.init()                                      │
 │    └─ passes { hostLevels, guestLevels } into CreateWorldOptions      │
 └─────────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────────┐
 │ SIM STAT INJECTION (PROG-03 / D-03)                                  │
 │                                                                       │
 │  createWorld(opts: CreateWorldOptions)                                │
 │    └─ opts.hostTowerLevel + opts.guestTowerLevel                     │
 │         → resolveTowerStats(level) → { dmg, range, maxCd }          │
 │         → tower.dmg = resolved.dmg (towers built in createWorld)     │
 │                                                                       │
 │  spawnUnit(world, { unitId, slot, role, level }, events)             │
 │    └─ opts.level (per-deploy carry)                                  │
 │         → resolveUnitStats(unitId, level) → { hp, dmg }             │
 │         → unit.hp = resolved.hp; unit.maxHp = resolved.hp           │
 │              unit.dmg = resolved.dmg                                  │
 └─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure Changes

```
src/
├── units/
│   └── UnitData.ts          # ADD: UNIT_LEVELS, resolveUnitStats(), BALANCE_VERSION
├── towers/
│   └── TowerData.ts          # ADD: TOWER_LEVELS, resolveTowerStats(), BALANCE_VERSION
├── sim/
│   ├── types.ts              # EXTEND: CreateWorldOptions (hostTowerLevel, guestTowerLevel)
│   │                         #         SimInput 'deploy' carries optional level field
│   └── world.ts              # EXTEND: createWorld uses resolveTowerStats; spawnUnit uses resolveUnitStats
└── lib/
    └── api/
        └── progression.ts    # NEW: getOwnLevels(), upgradeSpend()
supabase/
└── migrations/
    └── 20260613XXXXXX_progression.sql  # NEW: upgrades table + RLS + upgrade_spend RPC
src/scenes/
├── PlacementScene.ts         # EXTEND: broadcast own levels; receive + clamp opponent levels
├── GameScene.ts              # EXTEND: pass resolved levels into createWorld
└── UpgradeScene.ts (or similar)  # NEW: integrate provided upgrade screen design
```

---

## Focus Area 1: Sim Stat-Injection (PROG-03 / SC#3)

### Current State (read from source)

`src/sim/world.ts` `createWorld()` (lines 65-93) builds 6 towers by importing three flat constants directly:
```typescript
import { TOWER_RANGE, TOWER_DMG, TOWER_CD } from '../towers/TowerData'
// ...
towers.push({ cx, cy, slotIdx, isHostSide: true, range: TOWER_RANGE, dmg: TOWER_DMG, cd: 0, maxCd: TOWER_CD })
```

`spawnUnit()` (lines 150-188) builds units by copying from the flat `UNITS` array:
```typescript
const def = UNITS.find((u) => u.id === input.unitId)
// ...
hp: def.hp, maxHp: def.hp, dmg: def.dmg, speedPx: def.speedPx, attackRate: 900
```

The `SimInput` deploy type (types.ts line 107):
```typescript
{ type: 'deploy'; unitId: string; slot: number; role: 'host' | 'guest' }
```

`CreateWorldOptions` (world.ts lines 33-42): carries `hostSlot`, `guestSlot`, `mapBase`, `mapOver`, `isPractice`, `hostFaction`, `guestFaction` — no level fields yet.

### Concrete Injection Contract (RECOMMENDED)

**Option A — Level maps in CreateWorldOptions + deploy input carries level:**

Extend `CreateWorldOptions`:
```typescript
export interface CreateWorldOptions {
  gold?: number
  hostSlot: number
  guestSlot: number
  mapBase: TerrainType[][]
  mapOver: OverlayType[][]
  isPractice: boolean
  hostFaction: string
  guestFaction: string
  // P12 additions:
  hostTowerLevel?: number        // defaults to 1 (absent row = level 1, D-15)
  guestTowerLevel?: number       // defaults to 1
  hostUnitLevels?: Record<string, number>   // defId → level; missing key = level 1
  guestUnitLevels?: Record<string, number>  // defId → level; missing key = level 1
}
```

Extend `SimInput` deploy:
```typescript
| { type: 'deploy'; unitId: string; slot: number; role: 'host' | 'guest'; level?: number }
```

**Why this works:** `createWorld` has access to both sides' tower levels to build the 6 towers. `spawnUnit` receives the level inline with the deploy intent — this is the correct seam because a deploy intent already knows the role (which determines which side's levels apply) and the unitId.

**Why NOT pre-resolve in createWorld:** Unit stats cannot be pre-resolved in createWorld because units are spawned lazily on `deploy` inputs throughout the match; there is no "roster of which units will be deployed" at world-creation time.

**Practice / AI-spawn path:** `spawnAI()` in `src/sim/step.ts` (lines 17-45) creates AI units inline, NOT through `spawnUnit()`. It directly constructs the `SimUnit` struct and pushes to `world.guestUnits`. The AI path must also read from `guestUnitLevels` — either by calling `resolveUnitStats` directly or by having `spawnAI` accept a level resolver parameter. Since `spawnAI` is private and called from `step()`, the cleanest fix is: `step()` receives the resolver (or a pre-built level map from `world`) and `spawnAI` uses it. Alternatively, store `hostUnitLevels`/`guestUnitLevels` on `SimWorld` so any function that spawns units can access them.

**Recommendation — Store level maps on SimWorld:**

Add to `SimWorld`:
```typescript
hostUnitLevels: Record<string, number>   // defId → level; {} = all level 1
guestUnitLevels: Record<string, number>
hostTowerLevel: number
guestTowerLevel: number
```

`createWorld` copies these from `CreateWorldOptions` (defaulting to `{}` / `1`). Then both `spawnUnit` and `spawnAI` read from `world.hostUnitLevels` / `world.guestUnitLevels` via `resolveUnitStats`. `createWorld` uses `world.hostTowerLevel` / `world.guestTowerLevel` via `resolveTowerStats` when building the 6 towers.

This approach keeps the resolver calls in one place, avoids threading extra parameters through every function, and stores the level maps where they belong — on the live battle state alongside the rest of the world, which the `step` function already has access to.

**Landmine — AI-spawn stat correctness:** The current `spawnAI` (step.ts lines 17-45) hardcodes `hp: def.hp` and `dmg: def.dmg`. Without the P12 extension, the AI will always spawn at level 1 stats even if the player is the guest and the world has `guestUnitLevels`. This is only relevant for practice mode (the AI is always the guest), and practice mode uses `guestFaction` = the AI's faction. The fix is: in practice mode, `guestUnitLevels` is left as `{}` (level 1 everywhere) so the AI always fights at base stats, which is the intended design — players don't upgrade AI opponents.

### Resolver Function Contract

Define in `src/units/UnitData.ts`:
```typescript
export function resolveUnitStats(unitId: string, level: number): { hp: number; dmg: number } {
  const levelData = UNIT_LEVELS[unitId]
  if (!levelData) {
    // fallback: unknown id — return base from flat UNITS (D-12 spirit)
    const def = UNITS.find(u => u.id === unitId)
    return { hp: def?.hp ?? 100, dmg: def?.dmg ?? 40 }
  }
  const idx = Math.max(0, Math.min(level - 1, levelData.length - 1))
  return { hp: levelData[idx].hp, dmg: levelData[idx].dmg }
}
```

Define in `src/towers/TowerData.ts`:
```typescript
export function resolveTowerStats(level: number): { dmg: number; range: number; maxCd: number } {
  const idx = Math.max(0, Math.min(level - 1, TOWER_LEVELS.length - 1))
  return TOWER_LEVELS[idx]
}
```

**Level-1 invariant:** `resolveUnitStats(id, 1).hp === UNITS.find(u=>u.id===id)!.hp` (and same for dmg). This must be enforced by test. The resolver uses `level - 1` as the array index, so `UNIT_LEVELS[id][0]` MUST match the current flat `UNITS` values (hp, dmg). If TowerData's `TOWER_LEVELS[0].dmg` does not equal current `TOWER_DMG = 25`, all deployed towers in existing games get a stat change — a silent regression.

---

## Focus Area 2: Per-Level Table Shape (D-03/D-04/D-06)

### Current Flat Tables (confirmed from source)

**UnitData.ts** — 6 units:
| id | hp | dmg | speedPx |
|----|----|-----|---------|
| scout_drone | 120 | 45 | 90 |
| assault_bot | 280 | 90 | 60 |
| vine_crawler | 100 | 40 | 100 |
| thorn_beast | 260 | 95 | 55 |
| apprentice_mage | 90 | 55 | 80 |
| elementalist | 240 | 105 | 58 |

**TowerData.ts** — flat constants: `TOWER_DMG = 25`, `TOWER_RANGE = 6*CELL = 216px`, `TOWER_CD = 1400ms`

### Recommended Extended Shape

**UnitData.ts additions:**

```typescript
export const BALANCE_VERSION = 1  // D-07: cache-key seam for future server-driven config

// Per-level stat arrays. Index = level - 1. speedPx and attackRate are fixed (D-05).
// Level 1 values MUST match the flat UNITS array (level-1-invariant test).
export interface UnitLevelStats {
  hp: number
  dmg: number
}
export const MAX_UNIT_LEVEL = 5  // D-10: ~5 levels max

export const UNIT_LEVELS: Record<string, UnitLevelStats[]> = {
  scout_drone: [
    { hp: 120, dmg: 45 },  // level 1 = base (invariant)
    { hp: 150, dmg: 55 },  // level 2
    { hp: 185, dmg: 67 },  // level 3
    { hp: 225, dmg: 82 },  // level 4
    { hp: 275, dmg: 100 }, // level 5 (long-tail goal)
  ],
  assault_bot: [
    { hp: 280, dmg: 90 },
    { hp: 340, dmg: 108 },
    { hp: 410, dmg: 130 },
    { hp: 490, dmg: 156 },
    { hp: 580, dmg: 188 },
  ],
  vine_crawler: [
    { hp: 100, dmg: 40 },
    { hp: 125, dmg: 49 },
    { hp: 155, dmg: 60 },
    { hp: 190, dmg: 73 },
    { hp: 230, dmg: 88 },
  ],
  thorn_beast: [
    { hp: 260, dmg: 95 },
    { hp: 315, dmg: 114 },
    { hp: 380, dmg: 137 },
    { hp: 455, dmg: 165 },
    { hp: 540, dmg: 198 },
  ],
  apprentice_mage: [
    { hp: 90, dmg: 55 },
    { hp: 112, dmg: 67 },
    { hp: 138, dmg: 81 },
    { hp: 168, dmg: 97 },
    { hp: 202, dmg: 116 },
  ],
  elementalist: [
    { hp: 240, dmg: 105 },
    { hp: 292, dmg: 126 },
    { hp: 352, dmg: 151 },
    { hp: 420, dmg: 181 },
    { hp: 500, dmg: 218 },
  ],
}
```

Note: exact numbers are D-13 (Claude's discretion). The above are placeholder values using ~20% per level scaling as a starting point. The planner should treat these as the proposed values; executor tuning is acceptable within the escalating-curve intent (D-09). The key invariant: level-1 values MUST equal the current flat UNITS values.

**TowerData.ts additions:**

```typescript
export const BALANCE_VERSION = 1  // D-07

// Per-level tower stats. D-06: author range/cd per level even though only dmg scales today.
// Level 1 dmg MUST equal current TOWER_DMG = 25 (level-1-invariant test).
export interface TowerLevelStats {
  dmg: number
  range: number  // authored but fixed (D-02): always TOWER_RANGE
  maxCd: number  // authored but fixed (D-02): always TOWER_CD
}
export const MAX_TOWER_LEVEL = 5  // D-10

export const TOWER_LEVELS: TowerLevelStats[] = [
  { dmg: 25, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 1 = base
  { dmg: 32, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 2
  { dmg: 41, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 3
  { dmg: 52, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 4
  { dmg: 65, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 5
]
```

### BALANCE_VERSION Placement (D-07)

Export `BALANCE_VERSION = 1` as a `const` from both files. No consumer needs it this phase; it exists as the cache-key seam. When server-driven config eventually arrives, a client that has `BALANCE_VERSION` in its local tables can check it against the server's version to decide whether to refetch. [ASSUMED] — future seam, no server implementation yet.

---

## Focus Area 3: Upgrades Table + RPC (D-14/D-15/D-16)

### Migration Shape

The new migration (e.g. `20260613XXXXXX_progression.sql`) contains two parts: schema and RPC.

**Table:**
```sql
create table public.upgrades (
  user_id   uuid not null references auth.users (id) on delete cascade,
  scope     text not null check (scope in ('unit', 'tower')),
  target_id text not null,
  level     int  not null default 1 check (level >= 1),
  primary key (user_id, scope, target_id)
);

alter table public.upgrades enable row level security;

-- RLS: select own rows only; NO client write policy (deny-by-default, Pitfall 6)
create policy upgrades_select_own
  on public.upgrades for select
  using (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE client policy → all direct client writes denied.
```

Note: `scope check ('unit', 'tower')` is a useful guard. Target for units = the unit's `id` string (e.g. `'scout_drone'`); target for towers = `'tower_power'` (a single track, D-01).

**Absence of row = level 1 (D-15):** The RLS SELECT will return 0 rows for a user who has never upgraded. The client-side `getOwnLevels` must treat a missing row as level 1. No backfill needed — this is a new table and new accounts start with no rows (no need to insert default rows at provision_account time).

### RPC: upgrade_spend

Mirrors `spend_unlock` from `20260613061943_accounts_economy.sql` (lines 152-198) with three structural differences:
1. **Level-transition guard** instead of a one-time insert: the upgrades row is upserted with `level = level + 1`, but only after confirming the current level is `target_level - 1`.
2. **Ownership check** for scope='unit' (D-16).
3. **Server-derived cost** from a cost-per-level table embedded in the RPC SQL.

```sql
create function public.upgrade_spend(p_scope text, p_target_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner    uuid := auth.uid();
  v_cur_level int;
  v_new_level int;
  v_cost     bigint;
  v_bal      bigint;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  -- Validate scope
  if p_scope not in ('unit', 'tower') then
    raise exception 'invalid scope %', p_scope;
  end if;

  -- D-16: for scope='unit', verify the caller owns the unit in inventory
  if p_scope = 'unit' then
    if not exists (
      select 1 from public.inventory
      where owner = v_owner and unit_id = p_target_id
    ) then
      return jsonb_build_object('ok', false, 'reason', 'not_owned');
    end if;

    -- Validate known unit target (server-side whitelist, never trust client strings)
    if p_target_id not in (
      'scout_drone','assault_bot','vine_crawler','thorn_beast','apprentice_mage','elementalist'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'unknown_target');
    end if;
  end if;

  if p_scope = 'tower' then
    if p_target_id <> 'tower_power' then
      return jsonb_build_object('ok', false, 'reason', 'unknown_target');
    end if;
  end if;

  -- Read current level (absent row = level 1, D-15)
  select coalesce(
    (select level from public.upgrades
     where user_id = v_owner and scope = p_scope and target_id = p_target_id),
    1
  ) into v_cur_level;

  v_new_level := v_cur_level + 1;

  -- Enforce max level (5 per D-10)
  if v_new_level > 5 then
    return jsonb_build_object('ok', false, 'reason', 'max_level');
  end if;

  -- Server-derived cost (D-03/D-04: embedded constants, never client-supplied)
  -- Cost curve: escalating per D-09 (exact values are D-13 Claude's discretion)
  v_cost := case
    -- Unit upgrade costs (same curve regardless of unit to keep it simple for now)
    when p_scope = 'unit' then
      case v_new_level
        when 2 then 75
        when 3 then 150
        when 4 then 300
        when 5 then 600
        else null
      end
    -- Tower upgrade costs (slightly higher, one track = meaningful investment)
    when p_scope = 'tower' then
      case v_new_level
        when 2 then 100
        when 3 then 200
        when 4 then 400
        when 5 then 800
        else null
      end
    else null
  end;

  if v_cost is null then
    raise exception 'cannot derive cost for scope=% level=%', p_scope, v_new_level;
  end if;

  -- Atomic guarded deduct (Pitfall 5: UPDATE ... WHERE balance >= cost)
  update public.wallet
     set balance = balance - v_cost
   where owner = v_owner and balance >= v_cost
   returning balance into v_bal;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_funds');
  end if;

  -- Level transition: upsert the upgrades row
  -- ON CONFLICT: only increment if current level still equals v_cur_level (idempotency/concurrency safety)
  insert into public.upgrades (user_id, scope, target_id, level)
  values (v_owner, p_scope, p_target_id, v_new_level)
  on conflict (user_id, scope, target_id) do update
    set level = v_new_level
    where public.upgrades.level = v_cur_level;  -- guard: safe under retry/concurrency

  -- Note: if WHERE clause prevented the update (concurrent level-up already applied),
  -- the wallet deduct already happened. This is the one tricky case — see Landmine #3 below.

  return jsonb_build_object(
    'ok', true,
    'new_level', v_new_level,
    'new_balance', v_bal,
    'scope', p_scope,
    'target_id', p_target_id
  );
end;
$$;

revoke all on function public.upgrade_spend(text, text) from public;
grant  execute on function public.upgrade_spend(text, text) to authenticated;
```

### PROG-04 "Server-Side Balance Config" Tension

PROG-04 says "upgrade costs and effects come from a server-side balance config (not client-editable)." The CONTEXT.md resolution (D-03) is:
- **Costs**: embedded in the SQL RPC as `CASE` constants (identical pattern to `spend_unlock`'s embedded `WIN_REWARD`/`LOSS_REWARD`/unit costs). These are server-authoritative and client-uneditable — PROG-04 satisfied for costs.
- **Effects**: live in client static tables (UnitData/TowerData per-level arrays). This is explicitly a "trust now, harden P14" interim. PROG-04's "stored as levels not stats" clause is satisfied — the `upgrades` table stores levels, not absolute HP/dmg values. Balance can be changed by redeploying the client with updated arrays; no data migration needed. This is the same trust posture as Phase 11.

This is not a contradiction — PROG-04's intent (safe retuning without data migration) is fully satisfied by the levels-not-stats storage. The literal "server-side balance config" for effects is deferred with a clean seam (BALANCE_VERSION).

### Landmine #1: Ownership Check Ordering

The RPC checks ownership (D-16) before attempting the deduct. If the ownership check is placed after the deduct, a user who doesn't own a unit would have their balance deducted before getting an error. The order in the RPC above is correct: ownership check → cost derivation → deduct → upsert.

### Landmine #2: Absent-Row Level Read Under Concurrency

Reading `coalesce((select level ...), 1)` in a separate SELECT before the update creates a window where two concurrent calls both read level=1 and both attempt to set level=2. The `ON CONFLICT DO UPDATE ... WHERE upgrades.level = v_cur_level` guard closes this: only one of the two concurrent calls can match `WHERE level = 1` after the UPSERT, so only one succeeds in the upgrade. However, both will have already deducted from the wallet. This is the same double-spend risk as in `spend_unlock` except at the level boundary.

**Mitigation:** Lock the upgrades row first with `SELECT ... FOR UPDATE` before the deduct, or use `INSERT INTO upgrades ... ON CONFLICT DO UPDATE SET level = level + 1 WHERE upgrades.level < 5 RETURNING level` inside a single statement. The cleanest approach: read-and-lock the current level inside the function with `SELECT level FROM upgrades WHERE ... FOR UPDATE` (lock the row if it exists), then proceed. If the row doesn't exist, use `INSERT INTO upgrades ... ON CONFLICT DO NOTHING` then re-read. This is more complex; for Phase 12's trust-based interim model, the `WHERE upgrades.level = v_cur_level` guard is acceptable — a duplicate payment is unlikely under normal use, and P14 hardens everything.

### Landmine #3: Wallet Deduct Before Upsert Guard Fails

If the `ON CONFLICT DO UPDATE WHERE level = v_cur_level` silently fails (because a concurrent call already advanced the level), the wallet deduction has already happened. The function currently returns `ok: false` only when the `not found` on the wallet update triggers. If the wallet update succeeds but the upsert guard fails silently, the function returns `ok: true, new_level: v_new_level` but the level in the DB wasn't actually incremented. The client would see a success, read the unchanged level, and be confused.

**Detection:** After the upsert, re-read the actual level and compare. If it doesn't match `v_new_level`, the concurrent call won — return `ok: false, reason: 'concurrent_upgrade'` and roll back the wallet deduct. Since `search_path=''` and `SECURITY DEFINER`, a BEGIN/ROLLBACK inside the PL/pgSQL block is needed. Alternative: wrap the entire sequence in a transaction with `FOR UPDATE` on the wallet row (Postgres SECURITY DEFINER functions run in autocommit by default but PL/pgSQL is transactional). The simpler approach for Phase 12: add a `GET DIAGNOSTICS v_rows = row_count` after the upsert and if `v_rows = 0`, roll back and return insufficient/concurrent error. This mirrors the `GET DIAGNOSTICS` pattern already used in `report_match_result` (migration line 271-273).

---

## Focus Area 4: Realtime Level Exchange (D-11/D-12)

### Current PlacementScene Channel (confirmed from source)

`PlacementScene.ts` uses channel `placement:${gameState.roomId}` with two broadcast events:
- `map_sync`: host broadcasts `{ mapId: number }` on SUBSCRIBED; guest updates map.
- `slot_pick`: both broadcast `{ role: string; slot: number }`; both sides store `opponentSlot` and `checkBothReady()`.

`launchGame()` (line 246-259) transitions to `LoadoutScene` passing `{ roomId, role, playerFaction, mapId, hostSlot, guestSlot }`.

`LoadoutScene` then transitions to `GameScene`. `GameScene` calls `createWorld`.

### Recommended Level Exchange Design

**New broadcast event:** `loadout` (or extend `slot_pick` — better to add a new event to avoid breaking the P10-preserved wire protocol).

**Payload shape:**
```typescript
interface LoadoutPayload {
  role: 'host' | 'guest'
  slot: number                           // existing slot_pick data (now combined)
  unitLevels: Record<string, number>     // defId → level; only non-1 entries needed
  towerLevel: number                     // 1..5
}
```

Combining `slot` and `unitLevels` in one broadcast reduces the number of round-trips. The slot_pick event is currently sent separately; merging them is fine since the existing `checkBothReady` logic can fire on the combined `loadout` event.

**Wire protocol constraint (P10 D-04):** The `game:${roomId}` channel (deploy/wall_break/base_hp/game_over) is byte-preserved. The `placement:${roomId}` channel adds new events — this is additive and safe. Old clients would receive unknown events and ignore them (broadcast `.on` handlers are event-name-specific).

**Clamp guard (D-12):**
```typescript
const KNOWN_UNIT_IDS = new Set(['scout_drone','assault_bot','vine_crawler','thorn_beast','apprentice_mage','elementalist'])
const MAX_LEVEL = 5

function clampLevels(raw: Record<string, number>, towerLevel: number): {
  unitLevels: Record<string, number>,
  towerLevel: number
} {
  const unitLevels: Record<string, number> = {}
  for (const [id, level] of Object.entries(raw)) {
    if (KNOWN_UNIT_IDS.has(id)) {
      unitLevels[id] = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
    }
    // Unknown unit ids are silently dropped → resolver defaults to level 1
  }
  return {
    unitLevels,
    towerLevel: Math.max(1, Math.min(MAX_LEVEL, Math.floor(towerLevel)))
  }
}
```

**Data flow summary:**
1. PlacementScene subscribes to `placement:${roomId}`.
2. On SUBSCRIBED (for both host and guest): call `progression.getOwnLevels(userId)` → returns `{ unitLevels, towerLevel }`.
3. Broadcast `loadout` payload with `{ role, slot, unitLevels, towerLevel }`.
4. On receive `loadout` from opponent: clamp with `clampLevels()`, store as `opponentUnitLevels` / `opponentTowerLevel`.
5. `checkBothReady()` now waits for both `myConfirmed` AND `opponentLevels` received (not just `opponentSlot`).
6. `launchGame()` passes `{ hostUnitLevels, guestUnitLevels, hostTowerLevel, guestTowerLevel }` to LoadoutScene → GameScene → `createWorld`.

**Practice mode:** No channel in practice mode. Own levels are read at match start; `guestUnitLevels = {}` and `guestTowerLevel = 1` (AI always at base stats, as intended).

### Progression API Client (`src/lib/api/progression.ts`)

Following the patterns in `wallet.ts` and `inventory.ts`:

```typescript
import { supabase } from '../supabase'

export interface OwnLevels {
  unitLevels: Record<string, number>   // defId → level; missing = 1
  towerLevel: number
}

export async function getOwnLevels(userId: string): Promise<OwnLevels> {
  const { data, error } = await supabase
    .from('upgrades')
    .select('scope, target_id, level')
    .eq('user_id', userId)
    .returns<{ scope: string; target_id: string; level: number }[]>()
  if (error || !data) return { unitLevels: {}, towerLevel: 1 }

  const unitLevels: Record<string, number> = {}
  let towerLevel = 1
  for (const row of data) {
    if (row.scope === 'unit') unitLevels[row.target_id] = row.level
    if (row.scope === 'tower' && row.target_id === 'tower_power') towerLevel = row.level
  }
  return { unitLevels, towerLevel }
}

export async function upgradeSpend(
  scope: 'unit' | 'tower',
  targetId: string
): Promise<{
  ok: boolean
  reason?: string
  newLevel?: number
  newBalance?: number
  error: string | null
}> {
  const { data, error } = await supabase.rpc('upgrade_spend', {
    p_scope: scope,
    p_target_id: targetId,
  })
  if (error) return { ok: false, error: error.message }
  const result = data as { ok: boolean; reason?: string; new_level?: number; new_balance?: number }
  return {
    ok: result.ok,
    reason: result.reason,
    newLevel: result.new_level,
    newBalance: result.new_balance,
    error: null,
  }
}
```

---

## Focus Area 5: Upgrade Screen UI Data-Binding

The upgrade screen design is user-provided. This section covers only the data surface.

### Data the upgrade screen needs per track:

**Per-unit upgrade card:**
- Current level: from `getOwnLevels().unitLevels[unitId] ?? 1`
- Is unit owned: from `getOwnedUnits()` (already exists in `inventory.ts`)
- Current stats: `resolveUnitStats(unitId, currentLevel)` → `{ hp, dmg }`
- Next-level stats: `resolveUnitStats(unitId, currentLevel + 1)` → shows delta preview (HP +X, DMG +X)
- Next-level cost: displayed from the client-side cost mirror (or could be embedded in UnitData alongside stats — see Note)
- At max level: disable upgrade button; no next cost shown
- Wallet balance: from `getBalance()` in `wallet.ts`
- Spend button: calls `upgradeSpend('unit', unitId)` → on success refresh balance + level

**Tower power upgrade card:**
- Current level: from `getOwnLevels().towerLevel ?? 1`
- Current tower dmg: `resolveTowerStats(currentLevel).dmg`
- Next-level dmg delta: `resolveTowerStats(currentLevel + 1).dmg - current`
- Next-level cost: from client-side cost mirror (see Note)
- At max level: disable upgrade button

**Note on displaying costs client-side:** PROG-04 says costs come from "server-side balance config" — meaning the client must not be the source of truth for cost computation (that lives in the RPC). However, to *display* the next-level cost to the player before they tap the button, the client needs the cost values. Options:
1. Mirror the cost curve as read-only display constants in `UnitData.ts` / `TowerData.ts` (parallel to the economy.test.ts pattern which mirrors server constants for display/assertion only).
2. Call `upgradeSpend` with a dry-run flag (not in current RPC design).
3. Add a separate `get_upgrade_cost(scope, target_id)` RPC that returns the next cost without spending.

Option 1 is the simplest and mirrors the established economy.test.ts pattern. The costs are still server-authoritative (the RPC refuses to use client-supplied amounts); the client mirroring them for display is not a security issue. This is D-13 Claude's discretion territory — the planner should choose Option 1 and add a display-only `UPGRADE_COSTS` constant.

### Success/Error flow:
1. User taps upgrade button.
2. Disable button immediately (optimistic "processing").
3. Call `upgradeSpend(scope, targetId)`.
4. On `ok: true`: update displayed level + balance, re-enable button (or disable if now at max).
5. On `ok: false, reason: 'insufficient_funds'`: show balance error, re-enable.
6. On `ok: false, reason: 'max_level'`: should not occur if button was properly disabled — show error as defensive fallback.
7. On network error: show error, re-enable button.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic wallet deduct + level increment | Custom two-step SELECT then UPDATE | Single `UPDATE wallet WHERE balance >= cost` + `ON CONFLICT DO UPDATE WHERE level = v_cur_level` in one SECURITY DEFINER function | Pitfall 5: read-modify-write has a race window; the P11 RPC exemplar already solves this |
| Level storage as derived stats | Storing `{ hp: 185, dmg: 67 }` in the DB | Store `level: 3` and re-derive from static table | Pitfall 10: stats in DB = risky migrations on every rebalance |
| Client-side cost validation | Re-implementing cost table in TypeScript for spend authorization | Server-embedded CASE constants in upgrade_spend | Pitfall 3: any client constant can be modified; the RPC is the authority |
| Opponent level trust without clamping | Directly feeding received level values into createWorld | `clampLevels()` before passing to resolver | D-12: malformed payload can crash or produce absurd stats (e.g. level=999 → array out-of-bounds on UNIT_LEVELS) |
| Custom level exchange protocol | New Supabase channel for level sync | Piggyback on existing `placement:${roomId}` | Reusing the existing channel avoids new subscription overhead and aligns with P10 wire-preservation |

---

## Common Pitfalls

### Pitfall 1: Level-1 Invariant Broken by Array Authoring Error
**What goes wrong:** The author writes `UNIT_LEVELS['scout_drone'][0] = { hp: 130, dmg: 50 }` (slightly higher than the flat `hp: 120, dmg: 45`). All scout drones in all matches now silently fight at level-2-ish stats, even for players who never upgraded. No error is thrown.
**Why it happens:** The per-level array replaces the flat values but level-1 must equal the flat values or it's a behavior change.
**How to avoid:** A unit test asserts `resolveUnitStats(id, 1).hp === UNITS.find(u=>u.id===id)!.hp` for all 6 unit IDs, and `resolveTowerStats(1).dmg === TOWER_DMG`.
**Warning signs:** "Units feel stronger than before" reports after P12 ships with no explicit buff decision.

### Pitfall 2: spawnAI Bypasses the Resolver
**What goes wrong:** `spawnAI` in `step.ts` hardcodes `hp: def.hp, dmg: def.dmg` from the flat `UNITS` array. If the `UNITS` flat array is not updated (or is deleted in favour of UNIT_LEVELS), AI units spawn at wrong stats. Worse, if a future change removes the flat `UNITS` array, `spawnAI` breaks silently.
**How to avoid:** `spawnAI` must call `resolveUnitStats(def.id, world.guestUnitLevels[def.id] ?? 1)` for its `hp` and `dmg` fields. In practice mode `guestUnitLevels` is always `{}` so AI spawns at level 1, but the call is uniform.
**Warning signs:** AI units in practice appear stronger/weaker than expected after P12.

### Pitfall 3: Clamp Not Applied Before createWorld
**What goes wrong:** Received opponent levels are passed directly to `createWorld` without clamping. A malicious or corrupted payload sends `level: 9999` for a unit. `resolveUnitStats('scout_drone', 9999)` calls `UNIT_LEVELS['scout_drone'][9998]` which is `undefined`; `undefined.hp` throws a runtime error and the match crashes.
**How to avoid:** `clampLevels()` is called in the PlacementScene receive handler, before storing. Always call `Math.max(1, Math.min(MAX_LEVEL, ...))` on every incoming level value.
**Warning signs:** Match crashes after receiving levels from opponent.

### Pitfall 4: getOwnLevels Called After launchGame
**What goes wrong:** `getOwnLevels()` is async. If it's called inside `launchGame()` or `GameScene.create()`, there's a race — the scene might start before the async fetch resolves, and `createWorld` runs with undefined levels.
**How to avoid:** Call `getOwnLevels()` in PlacementScene on SUBSCRIBED (before slot confirmation), store the result synchronously, and pass it through `launchGame()` → GameScene init as static data. The scene-start data handshake is synchronous; levels must be resolved before the transition.
**Warning signs:** `createWorld` called with undefined `hostUnitLevels`.

### Pitfall 5: Wire Protocol Breaking Change
**What goes wrong:** Replacing `slot_pick` with a new `loadout` event, or renaming event keys, breaks the `slot_pick` receiver on one side if clients are at different versions mid-session.
**How to avoid:** Add the `loadout` event as a NEW event name alongside (not replacing) the existing `slot_pick` event, or send `slot` and `loadout` fields in one message with backward-compatible null checks. For P12 both clients deploy together so this is less critical, but a clean additive approach avoids surprises.

### Pitfall 6: Stale LoadoutScene Stat Display
**What goes wrong:** `LoadoutScene.ts` currently displays `u.hp` and `u.dmg` from the flat `UNITS` array directly in its HTML (lines 138-141). After P12, unit cards in LoadoutScene show base stats regardless of the player's upgrade level, which is misleading.
**How to avoid:** LoadoutScene should call `resolveUnitStats(u.id, ownLevels[u.id] ?? 1)` to display the player's effective stats. This is a separate task from the upgrade screen, but must be flagged.

### Pitfall 7: upgrade_spend Returns ok:true But Level Not Incremented (Concurrent Race)
**What goes wrong:** Two concurrent calls to `upgrade_spend('unit','scout_drone')`: both read level=1, both deduct from wallet, but only one's ON CONFLICT DO UPDATE passes the `WHERE level = 1` guard. The second call's upsert is silently a no-op. The function returns `ok: true, new_level: 2` to the second caller but the DB still shows level 1. The client sees a "success" but the level didn't change.
**How to avoid:** Add a re-read after the upsert: `SELECT level INTO v_actual_level FROM public.upgrades WHERE ...`. If `v_actual_level <> v_new_level`, the concurrent guard fired — raise an exception (which PL/pgSQL will rollback, returning the wallet deduct) or return `ok: false, reason: 'concurrent_upgrade'`. The `GET DIAGNOSTICS` pattern from `report_match_result` (lines 271-273) is the established approach.

---

## Code Examples

### Level-1 Invariant Test

```typescript
// test/unit/progression/resolver.test.ts
import { describe, it, expect } from 'vitest'
import { UNITS } from '../../../src/units/UnitData'
import { resolveUnitStats, UNIT_LEVELS, MAX_UNIT_LEVEL } from '../../../src/units/UnitData'
import { resolveTowerStats, TOWER_LEVELS, MAX_TOWER_LEVEL } from '../../../src/towers/TowerData'
import { TOWER_DMG } from '../../../src/towers/TowerData'

describe('resolver level-1 invariant', () => {
  for (const u of UNITS) {
    it(`resolveUnitStats(${u.id}, 1) equals flat UNITS baseline`, () => {
      const resolved = resolveUnitStats(u.id, 1)
      expect(resolved.hp).toBe(u.hp)
      expect(resolved.dmg).toBe(u.dmg)
    })
  }

  it('resolveTowerStats(1) dmg equals flat TOWER_DMG', () => {
    expect(resolveTowerStats(1).dmg).toBe(TOWER_DMG)
  })
})

describe('resolver clamps out-of-range levels', () => {
  it('level 0 returns level-1 stats', () => {
    const r0 = resolveUnitStats('scout_drone', 0)
    const r1 = resolveUnitStats('scout_drone', 1)
    expect(r0).toEqual(r1)
  })

  it('level > MAX returns level-MAX stats', () => {
    const rMax = resolveUnitStats('scout_drone', MAX_UNIT_LEVEL)
    const rOver = resolveUnitStats('scout_drone', 999)
    expect(rOver).toEqual(rMax)
  })
})

describe('resolver per-level arrays coverage', () => {
  it('all 6 units have exactly MAX_UNIT_LEVEL entries', () => {
    for (const u of UNITS) {
      expect(UNIT_LEVELS[u.id]).toHaveLength(MAX_UNIT_LEVEL)
    }
  })

  it('TOWER_LEVELS has exactly MAX_TOWER_LEVEL entries', () => {
    expect(TOWER_LEVELS).toHaveLength(MAX_TOWER_LEVEL)
  })
})
```

### Clamp Guard Test

```typescript
// test/unit/progression/clamp.test.ts
import { describe, it, expect } from 'vitest'
import { clampLevels } from '../../../src/scenes/PlacementScene'  // or wherever exported

describe('clampLevels guard (D-12)', () => {
  it('clamps level above MAX to MAX', () => {
    const result = clampLevels({ scout_drone: 999 }, 9)
    expect(result.unitLevels.scout_drone).toBe(5)
    expect(result.towerLevel).toBe(5)
  })

  it('clamps level below 1 to 1', () => {
    const result = clampLevels({ scout_drone: -5 }, 0)
    expect(result.unitLevels.scout_drone).toBe(1)
    expect(result.towerLevel).toBe(1)
  })

  it('drops unknown unit ids (no crash, default to 1 via resolver)', () => {
    const result = clampLevels({ unknown_unit: 3 }, 2)
    expect(result.unitLevels['unknown_unit']).toBeUndefined()
  })

  it('passes valid levels through unchanged', () => {
    const result = clampLevels({ scout_drone: 3, vine_crawler: 2 }, 4)
    expect(result.unitLevels.scout_drone).toBe(3)
    expect(result.unitLevels.vine_crawler).toBe(2)
    expect(result.towerLevel).toBe(4)
  })
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat TOWER_DMG/RANGE/CD constants | TOWER_LEVELS per-level array | P12 (this phase) | Enables tower stat scaling without schema changes |
| Flat UNITS[].hp / UNITS[].dmg | UNIT_LEVELS per-level arrays + resolver | P12 (this phase) | Enables per-unit upgrade progression |
| No upgrades table | upgrades(user_id, scope, target_id, level) | P12 (this phase) | Server source-of-record for levels |
| No level exchange at match start | loadout broadcast in PlacementScene | P12 (this phase) | Both sides fight at correct stats (PROG-03) |

**Deliberately NOT changed this phase:**
- `attackRate: 900` hardcoded in `spawnUnit` — fixed per D-05
- `speedPx: def.speedPx` from flat UNITS — fixed per D-05 (speed stays flat)
- `TOWER_RANGE` and `TOWER_CD` — authored in TOWER_LEVELS but always equal to the base constants (D-02)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `attackRate: 900` is hardcoded directly in `spawnUnit` (not read from def) | Focus Area 1 | If attackRate were ever read from def, the level-1-invariant test for attackRate would be needed — minor |
| A2 | Practice mode has no level exchange channel and AI always fights at base stats | Focus Area 4 | If AI were supposed to scale with player level, the practice path needs a different design |
| A3 | The `clampLevels` helper can be exported from PlacementScene for unit testing | Focus Area 4 / Validation | If it's inline (not exported), tests would need to duplicate the function or test indirectly |
| A4 | Proposed cost curve (75/150/300/600 for units; 100/200/400/800 for towers) is illustrative for D-13 | Focus Area 3 | Exact numbers are Claude's discretion; the planner should author final values tuned against the P11 economy (WIN_REWARD=50, LOSS_REWARD=15, starting balance 100) |
| A5 | BALANCE_VERSION will be a simple integer constant (not a semver string or hash) | Focus Area 2 | Future server-driven config may need a richer version format — low risk for P12 |

---

## Open Questions (RESOLVED)

> All three were resolved during planning (Phase 12 plans 01–04): (1) cost display → display-only
> `UPGRADE_COSTS` mirror in plan 01; (2) LoadoutScene stat display → plan 04 task 2; (3) launchGame
> level data-flow → threaded through plans 01–04. Retained below for rationale.

1. **Cost display: client mirror vs separate RPC** — RESOLVED (display-only mirror, plan 01)
   - What we know: the upgrade screen must show next-level cost before the user taps spend.
   - What's unclear: D-13 leaves cost design to Claude, but D-03 says "server-side balance config."
   - Recommendation: Mirror as display-only constants in a separate `UPGRADE_COSTS` object in UnitData/TowerData (same pattern as economy.test.ts mirrors WIN_REWARD). Clearly document as "display mirror, not authority." This is the simplest and follows the established P11 pattern.

2. **LoadoutScene stat display update**
   - What we know: LoadoutScene shows `u.hp` / `u.dmg` from flat UNITS (line 138-141).
   - What's unclear: Whether the upgrade screen is a separate scene/overlay or integrated into LoadoutScene.
   - Recommendation: Update LoadoutScene stats to use `resolveUnitStats` with own levels. This is a secondary task that should be included in the plan even if the upgrade screen is a separate scene, because mismatched stat display creates player confusion.

3. **launchGame transition: how many data points travel through scene init**
   - What we know: PlacementScene currently passes `{ roomId, role, playerFaction, mapId, hostSlot, guestSlot }` to LoadoutScene.
   - What's unclear: Does LoadoutScene need the levels too (for stat display), or only GameScene?
   - Recommendation: Pass levels all the way through: PlacementScene → LoadoutScene → GameScene. Alternatively, LoadoutScene fetches them independently. Passing through is simpler and keeps all async work in PlacementScene.

---

## Environment Availability

Step 2.6: SKIPPED — This phase is entirely client TypeScript + SQL migrations. No new external CLI tools, databases, or runtimes are required beyond the existing Supabase project and Node/npm already in use.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already configured in `vitest.config.ts`) |
| Config file | `vitest.config.ts` — two projects: `unit` (node) and `rls` (jsdom) |
| Quick run command | `npx vitest run --project unit` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROG-01 | upgrade_spend RPC deducts wallet + increments unit level | rls | `npx vitest run --project rls -- upgrades-rls` | No — Wave 0 |
| PROG-01 | upgrade_spend rejects insufficient funds | rls | `npx vitest run --project rls -- upgrades-rls` | No — Wave 0 |
| PROG-01 | upgrade_spend rejects unowned unit (D-16) | rls | `npx vitest run --project rls -- upgrades-rls` | No — Wave 0 |
| PROG-01 | upgrade_spend rejects unknown unit id | rls | `npx vitest run --project rls -- upgrades-rls` | No — Wave 0 |
| PROG-01 | upgrade_spend is idempotent under concurrent calls (one succeeds) | rls | `npx vitest run --project rls -- upgrades-rls` | No — Wave 0 |
| PROG-01 | upgrade_spend rejects level skip (level 1 → 3 not allowed) | rls | `npx vitest run --project rls -- upgrades-rls` | No — Wave 0 |
| PROG-01 | upgrade_spend rejects at max level (level 5 → 6) | rls | `npx vitest run --project rls -- upgrades-rls` | No — Wave 0 |
| PROG-01 | direct client INSERT/UPDATE on upgrades table is denied by RLS | rls | `npx vitest run --project rls -- upgrades-rls` | No — Wave 0 |
| PROG-01/02 | absence of upgrades row = level 1 (getOwnLevels default) | unit | `npx vitest run --project unit -- progression` | No — Wave 0 |
| PROG-02 | upgrade_spend for scope='tower', target_id='tower_power' works | rls | `npx vitest run --project rls -- upgrades-rls` | No — Wave 0 |
| PROG-03 | resolveUnitStats(id, 1) === flat UNITS baseline (level-1 invariant) | unit | `npx vitest run --project unit -- resolver` | No — Wave 0 |
| PROG-03 | resolveTowerStats(1).dmg === TOWER_DMG (level-1 invariant) | unit | `npx vitest run --project unit -- resolver` | No — Wave 0 |
| PROG-03 | resolver clamps out-of-range level inputs (0, 999) | unit | `npx vitest run --project unit -- resolver` | No — Wave 0 |
| PROG-03 | clampLevels guard: level > MAX → MAX; level < 1 → 1; unknown id dropped | unit | `npx vitest run --project unit -- clamp` | No — Wave 0 |
| PROG-03 | createWorld with hostTowerLevel=3 → host towers have level-3 dmg | unit | `npx vitest run --project unit -- sim-levels` | No — Wave 0 |
| PROG-03 | spawnUnit with level=2 → unit.hp/dmg match resolveUnitStats(id,2) | unit | `npx vitest run --project unit -- sim-levels` | No — Wave 0 |
| PROG-04 | upgrade costs NOT client-derivable (RPC embeds, client mirror display-only) | unit | `npx vitest run --project unit -- progression` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --project unit`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/unit/progression/resolver.test.ts` — covers PROG-03 resolver invariants and clamp
- [ ] `test/unit/progression/clamp.test.ts` — covers PROG-03 clampLevels guard (D-12)
- [ ] `test/unit/progression/sim-levels.test.ts` — covers PROG-03 createWorld + spawnUnit stat injection
- [ ] `test/rls/upgrades-rls.test.ts` — covers PROG-01/02/04 RPC atomic deduct, own-to-upgrade, idempotency, level-skip reject, max-level reject, RLS deny-direct-write
- [ ] Framework install: None — Vitest already configured. Test files only.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `auth.uid()` null-guard in every SECURITY DEFINER RPC |
| V3 Session Management | no | Existing session handling unchanged |
| V4 Access Control | yes | RLS deny-default on upgrades table; upgrade_spend checks unit ownership before spending |
| V5 Input Validation | yes | Server-side whitelist of valid unit ids + scope values in upgrade_spend; client clampLevels for opponent data |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client claims higher level than it has for a match | Spoofing / Tampering | D-12 clamp guard (P12 interim); P14 server-side ownership verification |
| Client forces upgrade to non-owned unit | Tampering | D-16 ownership check in upgrade_spend against inventory table |
| Client supplies upgrade cost amount | Tampering | Server-embedded CASE constants; client never passes amount to RPC |
| Concurrent double-tap upgrade (skip a level, spend once) | Tampering | `ON CONFLICT DO UPDATE WHERE upgrades.level = v_cur_level` guard + GET DIAGNOSTICS re-read |
| Direct client write to upgrades table | Tampering | RLS: no INSERT/UPDATE/DELETE policy on upgrades (deny-by-default, Pitfall 6) |
| Client sends level 999 as opponent level | Denial of Service / Tampering | clampLevels() clamps to MAX_LEVEL before resolver; resolver also clamps internally |

---

## Sources

### Primary (HIGH confidence)
- `src/sim/types.ts` — live source: SimUnit, SimTower, SimWorld, CreateWorldOptions, SimInput signatures
- `src/sim/world.ts` — live source: createWorld() tower build at lines 65-93; spawnUnit() at lines 150-188
- `src/sim/step.ts` — live source: spawnAI() at lines 17-45 (the AI-spawn landmine)
- `src/units/UnitData.ts` — live source: 6 unit definitions with exact hp/dmg/speedPx values
- `src/towers/TowerData.ts` — live source: flat TOWER_DEF with TOWER_DMG=25, TOWER_RANGE=216px, TOWER_CD=1400
- `supabase/migrations/20260613061943_accounts_economy.sql` — live source: spend_unlock RPC (lines 152-198) as the copy-paste exemplar; GET DIAGNOSTICS pattern (line 271-273)
- `src/scenes/PlacementScene.ts` — live source: channel setup (lines 190-228), broadcast events, launchGame() (lines 246-259)
- `src/lib/api/wallet.ts`, `inventory.ts`, `settlement.ts` — live source: services seam patterns
- `vitest.config.ts` — live source: two-project setup (unit/rls), file patterns, jsdom/node environments
- `test/rls/helpers.ts` — live source: seedUser/mintToken/makeAdmin patterns for RLS test authoring
- `test/rls/inventory-rls.test.ts` — live source: spend_unlock test structure to replicate for upgrade_spend

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — §"0003: progression" upgrades table proposal; RLS table shapes
- `.planning/research/PITFALLS.md` — Pitfall 10 (levels not stats), Pitfall 4/5 (idempotency/atomic spend), Pitfall 6 (RLS deny-default)
- `.planning/phases/10-services-simulation-refactor/10-CONTEXT.md` — D-01 (sim purity), D-04 (transport-free sim), wire protocol preservation
- `.planning/phases/11-accounts-economy/11-CONTEXT.md` — D-05/D-06 (trust-now-harden-P14 posture), services seam extension
- `.planning/phases/12-progression-upgrades/12-CONTEXT.md` — all locked decisions (D-01 through D-17)

---

## Metadata

**Confidence breakdown:**
- Sim stat-injection contract: HIGH — based on reading all actual source signatures
- Per-level table shape: HIGH for structure; ASSUMED for exact stat values (D-13)
- Upgrade RPC: HIGH for structure (mirrors live spend_unlock exactly); ASSUMED for cost numbers (D-13)
- Realtime exchange: HIGH — based on reading actual PlacementScene channel setup
- Test surface: HIGH — based on reading live test harness patterns

**Research date:** 2026-06-13
**Valid until:** 2026-07-13 (stable domain — no third-party library changes expected)

---

## RESEARCH COMPLETE

**Phase:** 12 - Progression & Upgrades
**Confidence:** HIGH

### Key Findings

1. **Sim injection point is clear:** `createWorld` needs `hostTowerLevel`/`guestTowerLevel` added to `CreateWorldOptions`; `spawnUnit`'s `SimInput` needs an optional `level` field; `spawnAI` in `step.ts` is the critical landmine — it bypasses `spawnUnit` and must also call `resolveUnitStats` (or read from `SimWorld.guestUnitLevels`). Storing level maps on `SimWorld` is the cleanest solution.

2. **Resolver contract is the central seam:** Two pure functions — `resolveUnitStats(unitId, level) → { hp, dmg }` and `resolveTowerStats(level) → { dmg, range, maxCd }` — are the handshake between the static tables, the sim injection, and the upgrade screen. Level-1 invariant must be enforced by test (not just convention).

3. **upgrade_spend RPC mirrors spend_unlock exactly** with three additions: level-transition guard (`ON CONFLICT DO UPDATE WHERE level = v_cur_level`), ownership check (D-16), and `max_level` guard. The Landmine #3 (wallet deducted but upsert guard fires silently) is the most subtle concurrency risk and should use `GET DIAGNOSTICS` row_count re-read, mirroring the pattern from `report_match_result` line 271.

4. **Level exchange piggybacks on PlacementScene's existing channel** as a new `loadout` event (additive, not replacing `slot_pick`). The clamp guard must fire at the receive handler, before passing levels to `launchGame()`. `getOwnLevels()` must be called async on SUBSCRIBED, before the user confirms their slot, so results are ready by launch time.

5. **7 unit-test files and 1 RLS test file are Wave 0 gaps** — all progression tests are new. The resolver tests are pure (fast, no network), the RLS upgrade tests follow the exact pattern of `inventory-rls.test.ts` against the live `upgrade_spend` RPC.

6. **LoadoutScene stat display (lines 138-141) is a secondary task** — it still shows flat UNITS stats, which will be stale after P12. Should be updated to use `resolveUnitStats` with own levels, or at minimum flagged.

### File Created
`.planning/phases/12-progression-upgrades/12-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Sim stat-injection | HIGH | All signatures read from live source |
| Per-level table shape | HIGH (structure) / ASSUMED (values) | Structure grounded in source; values are D-13 discretion |
| Upgrade RPC | HIGH | Direct structural copy of live spend_unlock |
| Realtime exchange | HIGH | PlacementScene channel wiring read from source |
| Test surface | HIGH | Live test harness patterns read from source |
| Exact cost curve | ASSUMED | D-13 discretion — placeholder values provided |

### Open Questions
1. Exact cost curve numbers (D-13 — Claude's discretion at plan time, informed by P11 economy: WIN=50, LOSS=15, starting balance 100).
2. Whether upgrade screen is a new scene or overlaid on an existing scene (user-owned design — planner routes data binding).
3. Whether `clampLevels` is exported from PlacementScene or extracted to a pure utility module for testability.

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
