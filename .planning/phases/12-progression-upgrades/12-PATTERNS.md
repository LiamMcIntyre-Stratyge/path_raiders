# Phase 12: Progression & Upgrades - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 12 new/modified files
**Analogs found:** 12 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/*_progression.sql` | migration | CRUD | `supabase/migrations/20260613061943_accounts_economy.sql` | exact |
| `src/towers/TowerData.ts` | config | transform | `src/units/UnitData.ts` (same flat-to-per-level extension) | exact |
| `src/units/UnitData.ts` | config | transform | `src/towers/TowerData.ts` (parallel extension) | exact |
| `src/sim/types.ts` | model | request-response | self (extend existing struct definitions in-file) | exact |
| `src/sim/world.ts` | service | request-response | self (`createWorld`/`spawnUnit` already exist) | exact |
| `src/sim/step.ts` | service | event-driven | self (`spawnAI` already exists at lines 17-45) | exact |
| `src/lib/api/progression.ts` | service | request-response | `src/lib/api/inventory.ts` + `wallet.ts` | exact |
| `src/scenes/PlacementScene.ts` | controller | event-driven | self (channel at lines 190-228; launchGame at lines 246-259) | exact |
| `src/lib/progression/clamp.ts` | utility | transform | `src/lib/sideHelper.ts` | exact |
| `src/scenes/LoadoutScene.ts` | component | request-response | self (card template lines 130-144) | exact |
| `test/unit/progression/*.test.ts` | test | — | `test/unit/sim/movement.test.ts` + `test/unit/economy.test.ts` | exact |
| `test/rls/upgrades-rls.test.ts` | test | — | `test/rls/inventory-rls.test.ts` | exact |

---

## Pattern Assignments

### `supabase/migrations/*_progression.sql` (migration, CRUD)

**Analog:** `supabase/migrations/20260613061943_accounts_economy.sql`

**Why it is the closest analog:** D-14 and CONTEXT.md both mandate this file as the literal copy-paste template. The `spend_unlock` RPC (lines 152-198 of that file) is the structural exemplar for `upgrade_spend`. Three additions differentiate it: a level-transition guard, an ownership check for `scope='unit'`, and an upsert to `upgrades` instead of a one-time insert to `inventory`.

**Table + RLS pattern** (analog: lines 24-64, `inventory` reshape block):
```sql
create table public.upgrades (
  user_id   uuid not null references auth.users (id) on delete cascade,
  scope     text not null check (scope in ('unit', 'tower')),
  target_id text not null,
  level     int  not null default 1 check (level >= 1),
  primary key (user_id, scope, target_id)
);

alter table public.upgrades enable row level security;

-- Select own rows only; NO client write policy (deny-by-default, Pitfall 6)
create policy upgrades_select_own
  on public.upgrades for select
  using (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE client policy → direct writes denied.
```

**RPC skeleton — SECURITY DEFINER header + declare block** (analog: lines 152-162 of `spend_unlock`):
```sql
create function public.upgrade_spend(p_scope text, p_target_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner     uuid    := auth.uid();
  v_cur_level int;
  v_new_level int;
  v_cost      bigint;
  v_bal       bigint;
  v_rows      bigint := 0;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
```

**Auth null-guard** (analog: lines 163-165 of `spend_unlock`):
```sql
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
```

**Server-derived cost via CASE** (analog: lines 167-176 of `spend_unlock` — unit id CASE → cost):
```sql
  -- Cost is embedded server-side; client NEVER supplies an amount (D-03, Pitfall 3)
  v_cost := case
    when p_scope = 'unit' then
      case v_new_level
        when 2 then 75
        when 3 then 150
        when 4 then 300
        when 5 then 600
        else null
      end
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
```

**Atomic guarded deduct** (analog: lines 178-186 of `spend_unlock` — verbatim copy):
```sql
  update public.wallet
     set balance = balance - v_cost
   where owner = v_owner and balance >= v_cost
   returning balance into v_bal;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_funds');
  end if;
```

**Level upsert + GET DIAGNOSTICS guard** (analog: `report_match_result` lines 271-273 for the `GET DIAGNOSTICS` pattern; `spend_unlock` lines 188-193 for `ON CONFLICT DO NOTHING`):
```sql
  insert into public.upgrades (user_id, scope, target_id, level)
  values (v_owner, p_scope, p_target_id, v_new_level)
  on conflict (user_id, scope, target_id) do update
    set level = v_new_level
    where public.upgrades.level = v_cur_level;  -- guard: safe under concurrent retry

  -- Detect silent no-op (concurrent race won): mirrors report_match_result lines 271-273
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'concurrent upgrade detected — retry';
  end if;
```

**Revoke/grant footer** (analog: lines 197-198 of `spend_unlock` — verbatim):
```sql
revoke all on function public.upgrade_spend(text, text) from public;
grant  execute on function public.upgrade_spend(text, text) to authenticated;
```

---

### `src/towers/TowerData.ts` (config, transform)

**Analog:** `src/units/UnitData.ts` (parallel flat-export style); also self — the file comment explicitly names Phase 12 as the intended extender.

**Why it is the closest analog:** Both files are pure data modules with no Phaser/Supabase imports. `TowerData.ts` currently exports three flat constants + one `TowerDefinition` struct; the extension adds `TOWER_LEVELS`, `TowerLevelStats`, `MAX_TOWER_LEVEL`, `BALANCE_VERSION`, and `resolveTowerStats`. The style mirrors `UnitData.ts`'s export pattern exactly.

**Current imports block** (lines 1-1 of `TowerData.ts`):
```typescript
import { CELL } from '../maps/MapData'
```
No new imports are added.

**Existing constants to preserve** (lines 13-15 — must not change, level-1 invariant depends on them):
```typescript
export const TOWER_RANGE = 6 * CELL // 216px
export const TOWER_DMG = 25
export const TOWER_CD = 1400 // ms
```

**New additions to append after existing exports:**
```typescript
export const BALANCE_VERSION = 1  // D-07: cache-key seam for future server-driven config

export interface TowerLevelStats {
  dmg: number
  range: number   // authored per D-06 even though only dmg scales today (D-02)
  maxCd: number   // authored per D-06; always equals TOWER_CD this phase
}

export const MAX_TOWER_LEVEL = 5  // D-10

// Per-level tower stats. Index = level - 1.
// INVARIANT: TOWER_LEVELS[0].dmg === TOWER_DMG (level-1-invariant test must pass).
// D-06: range/cd authored per level for uniform shape even though only dmg scales.
export const TOWER_LEVELS: TowerLevelStats[] = [
  { dmg: 25, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 1 = base (invariant)
  { dmg: 32, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 2
  { dmg: 41, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 3
  { dmg: 52, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 4
  { dmg: 65, range: TOWER_RANGE, maxCd: TOWER_CD },  // level 5
]

export function resolveTowerStats(level: number): TowerLevelStats {
  const idx = Math.max(0, Math.min(level - 1, TOWER_LEVELS.length - 1))
  return TOWER_LEVELS[idx]
}
```

---

### `src/units/UnitData.ts` (config, transform)

**Analog:** `src/towers/TowerData.ts` (parallel extension); `test/unit/economy.test.ts` for the display-cost mirror pattern.

**Why it is the closest analog:** The file is a pure data module with no imports other than `UnitDefinition` from `../types`. The extension adds `UNIT_LEVELS`, `UnitLevelStats`, `MAX_UNIT_LEVEL`, `BALANCE_VERSION`, and `resolveUnitStats` — parallel to the `TowerData.ts` additions.

**Current imports block** (line 1 of `UnitData.ts`):
```typescript
import type { UnitDefinition } from '../types'
```
No new imports are added.

**Existing UNITS export** (lines 3-82 — must not change; level-1 invariant locks these values):
The flat `UNITS` array stays. `resolveUnitStats` must return values equal to `def.hp`/`def.dmg` when `level === 1`.

**New additions to append after `UNIT_FACTION` export:**
```typescript
export const BALANCE_VERSION = 1  // D-07: cache-key seam for future server-driven config

export interface UnitLevelStats {
  hp: number
  dmg: number
  // speedPx and attackRate are fixed (D-05); not in this table
}

export const MAX_UNIT_LEVEL = 5  // D-10

// Per-level stat arrays. Index = level - 1. speedPx/attackRate stay flat (D-05).
// INVARIANT: UNIT_LEVELS[id][0].hp === UNITS.find(u=>u.id===id)!.hp for all ids.
export const UNIT_LEVELS: Record<string, UnitLevelStats[]> = {
  scout_drone:      [ { hp: 120, dmg: 45 }, { hp: 150, dmg: 55 }, { hp: 185, dmg: 67 }, { hp: 225, dmg: 82 }, { hp: 275, dmg: 100 } ],
  assault_bot:      [ { hp: 280, dmg: 90 }, { hp: 340, dmg: 108 }, { hp: 410, dmg: 130 }, { hp: 490, dmg: 156 }, { hp: 580, dmg: 188 } ],
  vine_crawler:     [ { hp: 100, dmg: 40 }, { hp: 125, dmg: 49 }, { hp: 155, dmg: 60 }, { hp: 190, dmg: 73 }, { hp: 230, dmg: 88 } ],
  thorn_beast:      [ { hp: 260, dmg: 95 }, { hp: 315, dmg: 114 }, { hp: 380, dmg: 137 }, { hp: 455, dmg: 165 }, { hp: 540, dmg: 198 } ],
  apprentice_mage:  [ { hp: 90, dmg: 55 },  { hp: 112, dmg: 67 }, { hp: 138, dmg: 81 }, { hp: 168, dmg: 97 }, { hp: 202, dmg: 116 } ],
  elementalist:     [ { hp: 240, dmg: 105 }, { hp: 292, dmg: 126 }, { hp: 352, dmg: 151 }, { hp: 420, dmg: 181 }, { hp: 500, dmg: 218 } ],
}

export function resolveUnitStats(unitId: string, level: number): UnitLevelStats {
  const levelData = UNIT_LEVELS[unitId]
  if (!levelData) {
    // Unknown id: fall back to flat UNITS baseline (D-12 spirit — no crash)
    const def = UNITS.find((u) => u.id === unitId)
    return { hp: def?.hp ?? 100, dmg: def?.dmg ?? 40 }
  }
  const idx = Math.max(0, Math.min(level - 1, levelData.length - 1))
  return levelData[idx]
}

// Display-only cost mirror. Authoritative source is the upgrade_spend SQL RPC.
// Pattern: identical to economy.test.ts mirroring WIN_REWARD/UNIT_COST (display-only,
// never supply to RPC, D-03). Used by UpgradeScene to show next-level cost before tap.
export const UPGRADE_COSTS: Record<'unit' | 'tower', Record<number, number>> = {
  unit:  { 2: 75,  3: 150, 4: 300, 5: 600 },
  tower: { 2: 100, 3: 200, 4: 400, 5: 800 },
}
```

---

### `src/sim/types.ts` (model, request-response)

**Analog:** Self — the existing struct definitions in `src/sim/types.ts` (lines 62-108).

**Why it is the closest analog:** All P12 type extensions are in-file additions to existing interfaces (`SimWorld`, `CreateWorldOptions`, `SimInput`). The style (inline comments, JSDoc, minimal interface shape) is the pattern to follow exactly.

**Existing `CreateWorldOptions`** (lines 33-42 of `world.ts` — the interface lives there, not in types.ts — see note):

Note: `CreateWorldOptions` is defined in `src/sim/world.ts` at line 33, not in `types.ts`. Extend it there.

**`SimWorld` additions** (after line 88, before closing `}`):
```typescript
  // P12: level maps. Missing key = level 1 (D-15: absence of row = level 1).
  // Stored on world so both spawnUnit and spawnAI can call resolveUnitStats
  // without threading extra params (RESEARCH.md Focus Area 1 recommendation).
  hostUnitLevels: Record<string, number>
  guestUnitLevels: Record<string, number>
  hostTowerLevel: number
  guestTowerLevel: number
```

**`SimInput` extension** (replace line 107):
```typescript
export type SimInput =
  | { type: 'deploy'; unitId: string; slot: number; role: 'host' | 'guest'; level?: number }
  | { type: 'wall_break'; row: number; col: number }
```

The `level?` field on `deploy` is the wire for per-deploy level carry. It is optional so existing callers (tests, practice) need no change — absent level is treated as `world.hostUnitLevels[unitId] ?? 1` by `spawnUnit`.

---

### `src/sim/world.ts` (service, request-response)

**Analog:** Self (the current `createWorld` and `spawnUnit` implementations).

**`CreateWorldOptions` additions** (after line 42, before closing `}`):
```typescript
  // P12 additions: per-side level maps (defaults keep all units/towers at level 1)
  hostTowerLevel?: number          // absent = 1
  guestTowerLevel?: number         // absent = 1
  hostUnitLevels?: Record<string, number>   // defId → level; missing key = 1
  guestUnitLevels?: Record<string, number>  // defId → level; missing key = 1
```

**Import additions** (after line 14):
```typescript
import { resolveTowerStats } from '../towers/TowerData'
import { resolveUnitStats } from '../units/UnitData'
```

**Tower build change** (replace lines 65-93 `TOWER_RANGE/DMG/CD` references — existing import `TOWER_RANGE, TOWER_DMG, TOWER_CD` stays for backward compat with any other callers):
```typescript
  // Towers: resolve stats from per-side tower level (P12 — PROG-03)
  const hostTowerStats = resolveTowerStats(opts.hostTowerLevel ?? 1)
  const guestTowerStats = resolveTowerStats(opts.guestTowerLevel ?? 1)
  for (let s = 0; s < 3; s++) {
    const cx = slotWorldX(s)
    towers.push({ cx, cy: 13.5 * CELL, slotIdx: s, isHostSide: true,
      range: hostTowerStats.range, dmg: hostTowerStats.dmg, cd: 0, maxCd: hostTowerStats.maxCd })
    towers.push({ cx, cy: 1.5 * CELL,  slotIdx: s, isHostSide: false,
      range: guestTowerStats.range, dmg: guestTowerStats.dmg, cd: 0, maxCd: guestTowerStats.maxCd })
  }
```

**`createWorld` return object additions** (after `tickCount: 0` in the return, line ~117):
```typescript
    hostUnitLevels:  opts.hostUnitLevels  ?? {},
    guestUnitLevels: opts.guestUnitLevels ?? {},
    hostTowerLevel:  opts.hostTowerLevel  ?? 1,
    guestTowerLevel: opts.guestTowerLevel ?? 1,
```

**`spawnUnit` hp/dmg assignment change** (replace lines 168-169 and 176):
```typescript
  // Resolve stats from the world's level map for this side (P12 — PROG-03)
  const levelMap = input.role === 'host' ? world.hostUnitLevels : world.guestUnitLevels
  const unitLevel = levelMap[input.unitId] ?? 1
  const stats = resolveUnitStats(input.unitId, unitLevel)
  // ...inside the unit literal:
  hp: stats.hp,
  maxHp: stats.hp,
  dmg: stats.dmg,
  // speedPx and attackRate stay flat (D-05):
  speedPx: def.speedPx,
  attackRate: 900,
```

---

### `src/sim/step.ts` (service, event-driven)

**Analog:** Self — `spawnAI` function at lines 17-45 is the only target.

**Why this is the landmine:** `spawnAI` directly constructs a `SimUnit` with `hp: def.hp, dmg: def.dmg` (lines 30-31, 36-37) bypassing `spawnUnit`. It must call `resolveUnitStats` using `world.guestUnitLevels` (AI is always guest in practice mode; `guestUnitLevels` is `{}` in practice so AI always spawns at level 1 — the intended behavior per RESEARCH.md Focus Area 1).

**Current pattern to replace** (lines 24-44 — the unit literal inside `spawnAI`):
```typescript
  // CURRENT (to be replaced):
  hp: def.hp,
  maxHp: def.hp,
  dmg: def.dmg,
```

**Replacement pattern:**
```typescript
  // Import addition at top of step.ts:
  import { resolveUnitStats } from '../units/UnitData'

  // Inside spawnAI, before building the unit literal:
  const aiLevel = world.guestUnitLevels[def.id] ?? 1  // always 1 in practice (guestUnitLevels={})
  const aiStats = resolveUnitStats(def.id, aiLevel)

  // In the unit literal:
  hp: aiStats.hp,
  maxHp: aiStats.hp,
  dmg: aiStats.dmg,
```

No other changes to `step.ts`. The `step()` function signature stays identical.

---

### `src/lib/api/progression.ts` (service, request-response) — NEW

**Analog:** `src/lib/api/inventory.ts` (RLS read → plain array) + `src/lib/api/wallet.ts` (RPC call pattern).

**Why they are the closest analogs:** `inventory.ts` shows the `supabase.from().select().eq().returns<T[]>()` RLS-read pattern with `if (error || !data) return []` fallback. `wallet.ts` shows the `supabase.rpc()` call with `if (error) return { ..., error: error.message }` wrapping. `progression.ts` combines both.

**Imports pattern** (analog: `inventory.ts` line 1, `wallet.ts` line 1):
```typescript
import { supabase } from '../supabase'
```

**`getOwnLevels` — RLS read pattern** (analog: `inventory.ts` lines 5-13):
```typescript
export interface OwnLevels {
  unitLevels: Record<string, number>   // defId → level; absent = 1 (D-15)
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
```

**`upgradeSpend` — RPC call pattern** (analog: `inventory.ts` lines 18-44, `spendUnlock`):
```typescript
export async function upgradeSpend(
  scope: 'unit' | 'tower',
  targetId: string,
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

### `src/scenes/PlacementScene.ts` (controller, event-driven)

**Analog:** Self — `setupChannel` (lines 190-228) and `launchGame` (lines 246-259) are the direct extension points.

**New broadcast event — `loadout`** (additive, does not replace `slot_pick` per Pitfall 5):

Extend `setupChannel`'s `.subscribe()` block (analog: lines 218-227 SUBSCRIBED handler):
```typescript
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        // Existing map_sync host broadcast stays unchanged
        if (role === 'host') {
          void this.channel!.send({ type: 'broadcast', event: 'map_sync',
            payload: { mapId: this.map.id } })
        }
        // P12: read own levels and broadcast alongside slot (D-11)
        const userId = (await supabase.auth.getUser()).data.user?.id
        if (userId) {
          const levels = await getOwnLevels(userId)
          this.ownLevels = levels   // store for launchGame
          void this.channel!.send({
            type: 'broadcast', event: 'loadout',
            payload: { role, unitLevels: levels.unitLevels, towerLevel: levels.towerLevel },
          })
        }
      })
```

Add `loadout` receiver (analog: lines 210-217 `slot_pick` receiver shape):
```typescript
      .on('broadcast', { event: 'loadout' }, ({ payload }) => {
        const p = payload as { role: string; unitLevels: Record<string, number>; towerLevel: number }
        if (p.role === gameState.role) return  // own echo, ignore
        const clamped = clampLevels(p.unitLevels, p.towerLevel)
        this.opponentUnitLevels = clamped.unitLevels
        this.opponentTowerLevel = clamped.towerLevel
        this.checkBothReady()
      })
```

**New private fields on the class** (analog: lines 22-27 existing private fields):
```typescript
  private ownLevels: OwnLevels = { unitLevels: {}, towerLevel: 1 }
  private opponentUnitLevels: Record<string, number> = {}
  private opponentTowerLevel = 1
```

**`checkBothReady` — add levels guard** (analog: line 240):
```typescript
  private checkBothReady() {
    // P12: also require opponent levels received before launching (D-11)
    if (!this.myConfirmed || this.opponentSlot === null) return
    // In multiplayer, wait for the loadout broadcast too
    if (!gameState.roomId?.startsWith('practice-') && this.opponentTowerLevel === 0) return
    this.setStatus('Both ready — launching!')
    setTimeout(() => this.launchGame(), 600)
  }
```

**`launchGame` — pass levels into scene data** (analog: lines 246-259, extend the `scene.start` payload):
```typescript
  private launchGame() {
    const role      = gameState.role ?? 'host'
    const hostSlot  = role === 'host' ? this.chosenSlot! : this.opponentSlot!
    const guestSlot = role === 'guest' ? this.chosenSlot! : (this.opponentSlot ?? Math.floor(Math.random() * 3))
    const hostUnitLevels  = role === 'host' ? this.ownLevels.unitLevels  : this.opponentUnitLevels
    const guestUnitLevels = role === 'guest' ? this.ownLevels.unitLevels : this.opponentUnitLevels
    const hostTowerLevel  = role === 'host' ? this.ownLevels.towerLevel  : this.opponentTowerLevel
    const guestTowerLevel = role === 'guest' ? this.ownLevels.towerLevel : this.opponentTowerLevel
    gameState.hostSlot  = hostSlot
    gameState.guestSlot = guestSlot
    this.scene.start('LoadoutScene', {
      roomId: gameState.roomId, role: gameState.role, playerFaction: gameState.playerFaction,
      mapId: this.map.id, hostSlot, guestSlot,
      hostUnitLevels, guestUnitLevels, hostTowerLevel, guestTowerLevel,
    })
  }
```

**Practice mode** (no channel): call `getOwnLevels` before `launchGame()` in the confirm handler's practice branch, set `this.ownLevels`, and leave `opponentUnitLevels = {}` / `opponentTowerLevel = 1` (AI always base stats — intentional, RESEARCH.md Focus Area 1).

---

### `src/lib/progression/clamp.ts` (utility, transform) — NEW

**Analog:** `src/lib/sideHelper.ts` — a pure function module with zero Phaser/Supabase imports, exported named functions, zero side effects, JSDoc comment.

**Why it is the closest analog:** `sideHelper.ts` is the established pattern for pure utility extraction in this codebase: single-responsibility, pure (no imports beyond types), directly testable. `clampLevels` follows identical structure.

**Full pattern** (mirror `sideHelper.ts` style exactly):
```typescript
import { MAX_UNIT_LEVEL } from '../units/UnitData'
import { MAX_TOWER_LEVEL } from '../towers/TowerData'

const KNOWN_UNIT_IDS = new Set([
  'scout_drone', 'assault_bot', 'vine_crawler',
  'thorn_beast', 'apprentice_mage', 'elementalist',
])

/**
 * Clamps received opponent level maps to safe ranges before feeding the sim (D-12).
 *
 * - Unit levels clamped to [1, MAX_UNIT_LEVEL]; unknown unit ids dropped silently
 *   (resolver defaults to level 1 for missing keys).
 * - Tower level clamped to [1, MAX_TOWER_LEVEL].
 * - No network I/O, no imports of Supabase or Phaser (sim-purity rule, P10 D-01).
 */
export function clampLevels(
  rawUnitLevels: Record<string, number>,
  rawTowerLevel: number,
): { unitLevels: Record<string, number>; towerLevel: number } {
  const unitLevels: Record<string, number> = {}
  for (const [id, level] of Object.entries(rawUnitLevels)) {
    if (KNOWN_UNIT_IDS.has(id)) {
      unitLevels[id] = Math.max(1, Math.min(MAX_UNIT_LEVEL, Math.floor(level)))
    }
    // Unknown unit ids are silently dropped → resolver defaults to level 1
  }
  return {
    unitLevels,
    towerLevel: Math.max(1, Math.min(MAX_TOWER_LEVEL, Math.floor(rawTowerLevel))),
  }
}
```

---

### `src/scenes/LoadoutScene.ts` (component, request-response)

**Analog:** Self — card template lines 130-144 where `u.hp` / `u.dmg` appear.

**Only change:** In the card template method (wherever the `.lo-stat` HP/DMG divs are rendered, currently lines 137-139), replace flat `u.hp` / `u.dmg` with resolved stats.

**Current pattern** (lines 137-138):
```typescript
      <div class="lo-stat">HP <span>${u.hp}</span></div>
      <div class="lo-stat">DMG <span>${u.dmg}</span></div>
```

**Replacement pattern:**
```typescript
// LoadoutScene needs ownLevels passed in via scene init data (see launchGame extension above)
// Resolve before rendering:
const stats = resolveUnitStats(u.id, this.params.hostUnitLevels?.[u.id] ?? 1)
// In the template:
      <div class="lo-stat">HP <span>${stats.hp}</span></div>
      <div class="lo-stat">DMG <span>${stats.dmg}</span></div>
```

The import to add:
```typescript
import { resolveUnitStats } from '../units/UnitData'
```

---

### `test/unit/progression/resolver.test.ts` (test) — NEW

**Analog:** `test/unit/economy.test.ts` (display-constant assertions), `test/unit/sim/movement.test.ts` (sim behavior assertions), `test/unit/sim/_helpers.ts` (world factory).

**Why they are the closest analogs:** `economy.test.ts` shows the pattern for mirrored-constant assertion tests (no network, pure logic). `movement.test.ts` shows the `describe`/`it`/`expect` structure with imports from `../../../src/`.

**Imports pattern** (analog: `economy.test.ts` lines 1-2, `movement.test.ts` lines 1-3):
```typescript
import { describe, it, expect } from 'vitest'
import { UNITS } from '../../../src/units/UnitData'
import { resolveUnitStats, UNIT_LEVELS, MAX_UNIT_LEVEL } from '../../../src/units/UnitData'
import { resolveTowerStats, TOWER_LEVELS, MAX_TOWER_LEVEL } from '../../../src/towers/TowerData'
import { TOWER_DMG } from '../../../src/towers/TowerData'
```

**Level-1 invariant test suite structure** (analog: `economy.test.ts` describe/it nesting):
```typescript
describe('resolver level-1 invariant', () => {
  for (const u of UNITS) {
    it(`resolveUnitStats(${u.id}, 1) equals flat UNITS baseline`, () => {
      const resolved = resolveUnitStats(u.id, 1)
      expect(resolved.hp).toBe(u.hp)
      expect(resolved.dmg).toBe(u.dmg)
    })
  }
  it('resolveTowerStats(1).dmg equals flat TOWER_DMG', () => {
    expect(resolveTowerStats(1).dmg).toBe(TOWER_DMG)
  })
})
```

---

### `test/unit/progression/clamp.test.ts` (test) — NEW

**Analog:** `test/unit/economy.test.ts` (pure assertion pattern, no world needed).

**Pattern:**
```typescript
import { describe, it, expect } from 'vitest'
import { clampLevels } from '../../../src/lib/progression/clamp'

describe('clampLevels guard (D-12)', () => {
  it('clamps unit level above MAX to MAX', () => { ... })
  it('clamps unit level below 1 to 1', () => { ... })
  it('drops unknown unit ids', () => { ... })
  it('clamps tower level above MAX to MAX', () => { ... })
  it('passes valid levels through unchanged', () => { ... })
})
```

---

### `test/unit/progression/sim-levels.test.ts` (test) — NEW

**Analog:** `test/unit/sim/movement.test.ts` and `test/unit/sim/_helpers.ts` (world factory + step call).

**Pattern** (analog: `movement.test.ts` lines 1-25, `_helpers.ts` `makeWorld`):
```typescript
import { describe, it, expect } from 'vitest'
import { makeWorld } from '../sim/_helpers'
import { createWorld } from '../../../src/sim/world'
import { makeBase, makeOver } from '../sim/_helpers'
import { spawnUnit } from '../../../src/sim/world'
import { TOWER_LEVELS, TOWER_DMG } from '../../../src/towers/TowerData'
import { resolveUnitStats } from '../../../src/units/UnitData'

// Extended makeWorld for P12 — pass level fields through
function makeWorldWithLevels(opts: { hostTowerLevel?: number; guestTowerLevel?: number;
  hostUnitLevels?: Record<string, number>; guestUnitLevels?: Record<string, number> }) {
  return createWorld({
    hostSlot: 1, guestSlot: 1,
    mapBase: makeBase('path'), mapOver: makeOver(),
    isPractice: false, hostFaction: 'machines', guestFaction: 'plants',
    ...opts,
  })
}

describe('sim level injection (PROG-03)', () => {
  it('createWorld with hostTowerLevel=3 → host towers have level-3 dmg', () => {
    const world = makeWorldWithLevels({ hostTowerLevel: 3 })
    const hostTowers = world.towers.filter(t => t.isHostSide)
    expect(hostTowers[0].dmg).toBe(TOWER_LEVELS[2].dmg)  // index = level-1
    expect(hostTowers[0].dmg).toBeGreaterThan(TOWER_DMG)
  })
  it('spawnUnit with level=2 → unit hp/dmg match resolveUnitStats(id,2)', () => { ... })
})
```

---

### `test/rls/upgrades-rls.test.ts` (test) — NEW

**Analog:** `test/rls/inventory-rls.test.ts` — replicate its structure verbatim for `upgrade_spend`.

**Why it is the closest analog:** The file is the direct structural template. Same helpers (`seedUser`, `makeAdmin`, `mintToken`), same RLS-verification approach (admin re-reads after client calls), same concurrency test (`Promise.all`), same insufficient-funds pattern.

**Imports and setup block** (analog: `inventory-rls.test.ts` lines 1-48 — replicate exactly, substituting table/RPC names):
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeAdmin, seedUser } from './helpers.ts'

const admin = makeAdmin()
let user: SupabaseClient
let userId: string

// Display-only mirrors. Authoritative values live in upgrade_spend SQL RPC (D-03).
const UNIT_UPGRADE_COST_L2  = 75
const TOWER_UPGRADE_COST_L2 = 100

type UpgradeOk     = { ok: true;  new_level: number; new_balance: number }
type UpgradeDenied = { ok: false; reason: string }
type UpgradeResult = UpgradeOk | UpgradeDenied

function asUpgrade(data: unknown): UpgradeResult {
  return data as unknown as UpgradeResult
}

async function balanceOf(id: string): Promise<number> {
  const { data } = await admin.from('wallet').select('balance').eq('owner', id).single()
  return (data?.balance as number) ?? 0
}

async function levelOf(id: string, scope: string, targetId: string): Promise<number> {
  const { data } = await admin.from('upgrades')
    .select('level').eq('user_id', id).eq('scope', scope).eq('target_id', targetId).single()
  return (data?.level as number) ?? 1  // absent row = level 1 (D-15)
}

beforeAll(async () => {
  ;({ id: userId, client: user } = await seedUser(admin, 'tupg'))
  // Seed wallet via RPC (never direct write — Pitfall 1)
  await user.rpc('credit_wallet', { p_amount: 1000, p_idempotency_key: `seed-upg:${userId}` })
  // Seed inventory: scout_drone is a starter so add it to inventory for scope='unit' tests
  await admin.from('inventory').insert({ owner: userId, unit_id: 'scout_drone' })
})
```

**Core test suite structure** (analog: `inventory-rls.test.ts` lines 50-113 — same describe/it shape):
```typescript
describe('upgrades RLS + upgrade_spend (PROG-01/02/04)', () => {
  it('rejects forged direct INSERT into upgrades (RLS deny-write)', async () => { ... })
  it('upgrade_spend for owned unit deducts cost and increments level (PROG-01)', async () => { ... })
  it('upgrade_spend returns insufficient_funds when balance < cost (PROG-01)', async () => { ... })
  it('upgrade_spend rejects unowned unit (D-16)', async () => { ... })
  it('upgrade_spend rejects unknown unit id', async () => { ... })
  it('upgrade_spend rejects at max level (level 5 → 6)', async () => { ... })
  it('concurrent upgrade_spend deducts exactly once (PROG-04 concurrency)', async () => { ... })  // pattern from inventory-rls lines 95-112
  it('upgrade_spend for scope=tower increments tower_power level (PROG-02)', async () => { ... })
})
```

---

## Shared Patterns

### SECURITY DEFINER RPC Header
**Source:** `supabase/migrations/20260613061943_accounts_economy.sql` lines 152-165
**Apply to:** `supabase/migrations/*_progression.sql` — all new RPCs
```sql
create function public.<fn_name>(...)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
```

### Revoke/Grant Footer
**Source:** `supabase/migrations/20260613061943_accounts_economy.sql` lines 197-198
**Apply to:** Every new RPC in `*_progression.sql`
```sql
revoke all on function public.<fn_name>(...) from public;
grant  execute on function public.<fn_name>(...) to authenticated;
```

### Atomic Guarded Wallet Deduct
**Source:** `supabase/migrations/20260613061943_accounts_economy.sql` lines 178-186
**Apply to:** `upgrade_spend` RPC — verbatim
```sql
update public.wallet
   set balance = balance - v_cost
 where owner = v_owner and balance >= v_cost
 returning balance into v_bal;

if not found then
  return jsonb_build_object('ok', false, 'reason', 'insufficient_funds');
end if;
```

### GET DIAGNOSTICS Idempotency Gate
**Source:** `supabase/migrations/20260613061943_accounts_economy.sql` lines 271-273 (`report_match_result`)
**Apply to:** After the `ON CONFLICT DO UPDATE WHERE level = v_cur_level` upsert in `upgrade_spend`
```sql
get diagnostics v_rows = row_count;
if v_rows = 0 then
  raise exception 'concurrent upgrade detected — retry';
end if;
```

### Services Seam — RPC Call Pattern
**Source:** `src/lib/api/inventory.ts` lines 18-44
**Apply to:** `src/lib/api/progression.ts` — `upgradeSpend` function
```typescript
const { data, error } = await supabase.rpc('rpc_name', { param: value })
if (error) return { ok: false, error: error.message }
const result = data as { ok: boolean; reason?: string; ... }
return { ok: result.ok, reason: result.reason, ..., error: null }
```

### Services Seam — RLS Read Pattern
**Source:** `src/lib/api/inventory.ts` lines 5-13
**Apply to:** `src/lib/api/progression.ts` — `getOwnLevels` function
```typescript
const { data, error } = await supabase
  .from('table')
  .select('col1, col2')
  .eq('owner_col', userId)
  .returns<T[]>()
if (error || !data) return fallback
```

### Pure Resolver / Utility Module
**Source:** `src/lib/sideHelper.ts` (entire file)
**Apply to:** `src/lib/progression/clamp.ts` and the resolver functions added to `UnitData.ts`/`TowerData.ts`
- Zero Phaser/Supabase imports
- Named function exports only
- JSDoc on each exported function
- Consumed by both scene code and unit tests without mocking

### RLS Test File Structure
**Source:** `test/rls/inventory-rls.test.ts` lines 1-113 (entire file)
**Apply to:** `test/rls/upgrades-rls.test.ts` — replicate structure:
- `makeAdmin()` at module level
- `seedUser(admin, 'tag')` in `beforeAll` via RPC credit (never direct write)
- Admin re-read functions for balance + table state (`balanceOf`, `levelOf`)
- `asUpgrade(data: unknown)` cast helper (mirrors `asSpend`)
- `Promise.all` for concurrency test (mirrors lines 100-104)

### Sim-Purity Rule
**Source:** `src/sim/types.ts` lines 1-10 (doc comment), `src/sim/world.ts` lines 1-16 (imports)
**Apply to:** ALL files under `src/sim/` and `src/lib/progression/`
```
// ZERO Phaser, ZERO Supabase, ZERO gameState imports allowed in src/sim/ files.
// Only ../types (OverlayType/TerrainType), ../maps/MapData, ../towers/TowerData,
// ../units/UnitData, and ../lib/pathfinder are permitted.
```

---

## No Analog Found

All files have clear analogs. No file in this phase requires falling back to RESEARCH.md patterns alone — every pattern has a live codebase exemplar.

---

## Metadata

**Analog search scope:** `src/sim/`, `src/lib/api/`, `src/lib/`, `src/towers/`, `src/units/`, `src/scenes/`, `test/rls/`, `test/unit/`, `supabase/migrations/`
**Files scanned:** 18 source files read directly
**Pattern extraction date:** 2026-06-14
