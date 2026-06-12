# Phase 11: Accounts & Economy - Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 14 new/modified files
**Analogs found:** 13 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/<ts>_accounts_economy.sql` | migration | CRUD + batch | `supabase/migrations/20260612085249_foundations.sql` | exact |
| `src/lib/api/inventory.ts` | service | request-response | `src/lib/api/wallet.ts` | exact |
| `src/lib/api/settlement.ts` | service | request-response | `src/lib/api/wallet.ts` (creditWallet pattern) | role-match |
| `src/lib/api/profile.ts` | service | request-response | `src/lib/api/account.ts` (getProfile pattern) | exact |
| `src/lib/escapeHtml.ts` | utility | transform | none in codebase | no analog |
| `src/lib/api/account.ts` | service | request-response | itself (edit: delete symbols) | self |
| `src/lib/gameState.ts` | store | — | itself (edit: add field) | self |
| `src/types/index.ts` | model | — | itself (edit: add field) | self |
| `src/units/UnitData.ts` | model | — | itself (no edit required — IDs confirmed) | self |
| `src/scenes/GameScene.ts` | component | event-driven | itself (edit: remove + replace method) | self |
| `src/scenes/AuthScene.ts` | component | request-response | itself (edit: add RPC call after signUp) | self |
| `src/scenes/LobbyScene.ts` | component | request-response | itself (edit: escape username) | self |
| `test/rls/inventory-rls.test.ts` | test | request-response | `test/rls/wallet-rls.test.ts` | exact |
| `test/rls/settlement-idempotency.test.ts` | test | request-response | `test/rls/wallet-rls.test.ts` | role-match |
| `test/rls/migration.test.ts` | test | request-response | `test/rls/wallet-rls.test.ts` | role-match |
| `test/unit/escape.test.ts` | test | transform | `test/unit/pathfinder.test.ts` | role-match |
| `test/unit/economy.test.ts` | test | transform | `test/unit/pathfinder.test.ts` | role-match |

---

## Pattern Assignments

### `supabase/migrations/<timestamp>_accounts_economy.sql` (migration, CRUD + batch)

**Analog:** `supabase/migrations/20260612085249_foundations.sql`

**SQL structural pattern — every SECURITY DEFINER RPC** (lines 41-83):
```sql
create function public.<fn_name>(<params>)
returns <type>
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_bal   bigint;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  -- idempotent: first writer wins; retries are no-ops
  insert into public.<table> (...)
  values (...)
  on conflict (...) do nothing;

  if not found then
    -- already done — return current state
    ...
    return ...;
  end if;

  -- atomic guarded mutation
  update public.<table>
     set <col> = <col> + <amount>
   where owner = v_owner [and <guard>]
   returning <col> into v_bal;

  return v_bal;
end;
$$;

revoke all on function public.<fn_name>(<params>) from public;
grant  execute on function public.<fn_name>(<params>) to authenticated;
```

**RLS table creation pattern** (lines 10-22 and 104-119):
```sql
create table public.<tablename> (
  owner uuid [primary key | not null] references auth.users (id) on delete cascade,
  ...
  constraint <tablename>_<col>_<check> check (<col> >= 0)   -- if numeric
);

alter table public.<tablename> enable row level security;

create policy <tablename>_select_own
  on public.<tablename> for select
  using (auth.uid() = owner);
-- No INSERT/UPDATE/DELETE policy → all client writes denied.
```

**Idempotency guard pattern** (lines 59-67 of `credit_wallet`):
```sql
insert into public.wallet_credits (idempotency_key, owner, amount)
values (p_idempotency_key, v_owner, p_amount)
on conflict (idempotency_key) do nothing;

if not found then
  -- already credited under this key → return current balance unchanged
  select balance into v_balance from public.wallet where owner = v_owner;
  return v_balance;
end if;
```

**Bare-shell ALTER pattern** for filling out Phase 9 shells (the `inventory` table):
```sql
-- Add columns to existing bare shell — use ADD COLUMN IF NOT EXISTS
alter table public.inventory
  add column if not exists unit_id text not null default '';

alter table public.inventory
  add constraint if not exists inventory_owner_unit unique (owner, unit_id);
-- Existing select_own RLS policy is sufficient — no client write policy added.
```

**DO $$ backfill block pattern** (idempotent, runs at migration time):
```sql
do $$
declare
  r record;
begin
  for r in
    select id, unlocked_units
    from public.profiles
    where id not in (select owner from public.wallet)
  loop
    insert into public.wallet (owner, balance)
    values (r.id, 0)
    on conflict (owner) do nothing;

    -- ... further idempotent inserts
  end loop;
end;
$$;
```

**Key constants to embed in RPCs (D-04, server-side only):**

| Constant | Value |
|----------|-------|
| WIN_REWARD | 50 |
| LOSS_REWARD | 15 |
| WELCOME_GRANT | 100 |
| Unit soft-currency cost (assault_bot, thorn_beast, elementalist) | 100 each |

**wallet_credits idempotency key conventions** (carry-forward from Phase 9):
- Welcome grant: `'welcome:' || p_user_id`
- Match win: `'match:' || p_match_id || ':win'`
- Match loss: `'match:' || p_match_id || ':loss'`

**`match_results` table columns** — replaces the bare Phase 9 shell (the shell has only `id uuid pk` + `owner uuid not null`):
- Drop the bare shell's `owner` column; use `reporter_id` keyed by `(match_id, reporter_id)` composite PK
- RLS: `SELECT` where `reporter_id = auth.uid()`. No client writes.

**`match_settlements` table** — new, one row per match:
- `match_id uuid PRIMARY KEY`; `winner_id`, `loser_id` uuid refs; `settled bool`, `voided bool`, `settled_at timestamptz`, `win_amount bigint`, `loss_amount bigint`
- RLS: `SELECT` where `winner_id = auth.uid() OR loser_id = auth.uid()`. No client writes.

---

### `src/lib/api/inventory.ts` (service, request-response)

**Analog:** `src/lib/api/wallet.ts` (all 27 lines)

**Imports pattern** (wallet.ts lines 1):
```typescript
import { supabase } from '../supabase'
```

**Read pattern — getBalance as model for getOwnedUnits** (wallet.ts lines 4-12):
```typescript
export async function getBalance(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('wallet')
    .select('balance')
    .eq('owner', userId)
    .single<{ balance: number }>()
  if (error || !data) return null
  return data.balance ?? null
}
```

**RPC invocation pattern — creditWallet as model for spendUnlock** (wallet.ts lines 16-26):
```typescript
export async function creditWallet(
  amount: bigint | number,
  idemKey: string
): Promise<{ newBalance: bigint | number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('credit_wallet', {
    p_amount: amount,
    p_idempotency_key: idemKey,
  })
  if (error) return { newBalance: null, error: error.message }
  return { newBalance: data as bigint | number | null, error: null }
}
```

**New `getOwnedUnits` follows getBalance pattern:** query `inventory` table, `.eq('owner', userId)`, return `string[]`.

**New `spendUnlock` follows creditWallet pattern:** `supabase.rpc('spend_unlock', { p_unit_id })`, return `{ ok: boolean; reason?: string; newBalance?: number; unitId?: string; error: string | null }`.

---

### `src/lib/api/settlement.ts` (service, request-response)

**Analog:** `src/lib/api/wallet.ts` (creditWallet pattern, lines 14-26)

**RPC invocation pattern** (wallet.ts lines 20-25):
```typescript
const { data, error } = await supabase.rpc('credit_wallet', {
  p_amount: amount,
  p_idempotency_key: idemKey,
})
if (error) return { newBalance: null, error: error.message }
return { newBalance: data as bigint | number | null, error: null }
```

**New `reportMatchResult` follows this exactly:**
```typescript
import { supabase } from '../supabase'

export async function reportMatchResult(
  matchId: string,
  claimedWinnerId: string
): Promise<{ status: 'pending' | 'settled' | 'already_settled' | 'void'; error: string | null }> {
  const { data, error } = await supabase.rpc('report_match_result', {
    p_match_id: matchId,
    p_claimed_winner: claimedWinnerId,
  })
  if (error) return { status: 'pending', error: error.message }
  return { status: (data as { status: string }).status as 'pending' | 'settled' | 'already_settled' | 'void', error: null }
}
```

---

### `src/lib/api/profile.ts` (service, request-response)

**Analog:** `src/lib/api/account.ts` (getProfile pattern, lines 28-36)

**Existing getProfile pattern to extend** (account.ts lines 28-36):
```typescript
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, faction, unlocked_units, wins, losses')
    .eq('id', userId)
    .single<Profile>()
  if (error || !data) return null
  return data
}
```

**New `getProfileFull` aggregates three queries in parallel** (pattern from RESEARCH.md lines 731-750):
```typescript
import { supabase } from '../supabase'
import { getBalance } from './wallet'

export interface FullProfile {
  username: string | null
  wins: number
  losses: number
  balance: number
  ownedUnitIds: string[]
  rankPlaceholder: string  // always 'UNRANKED' until P13
}

export async function getProfileFull(userId: string): Promise<FullProfile | null> {
  const [profileResult, balanceResult, inventoryResult] = await Promise.all([
    supabase.from('profiles').select('username, wins, losses').eq('id', userId).single<{
      username: string | null; wins: number; losses: number
    }>(),
    getBalance(userId),
    supabase.from('inventory').select('unit_id').eq('owner', userId)
      .returns<{ unit_id: string }[]>(),
  ])
  if (profileResult.error || !profileResult.data) return null
  return {
    username: profileResult.data.username,
    wins: profileResult.data.wins,
    losses: profileResult.data.losses,
    balance: balanceResult ?? 0,
    ownedUnitIds: (inventoryResult.data ?? []).map(r => r.unit_id),
    rankPlaceholder: 'UNRANKED',
  }
}
```

---

### `src/lib/escapeHtml.ts` (utility, transform)

**No codebase analog.** See RESEARCH.md Pattern (lines 575-583). Implement directly:
```typescript
// src/lib/escapeHtml.ts
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

---

### `src/lib/api/account.ts` — edit (service, request-response)

**File is its own analog.** Current content read in full (95 lines).

**Symbols to DELETE entirely:**

1. `MatchResultPayload` interface (lines 13-18):
```typescript
export interface MatchResultPayload {
  wins: number
  losses: number
  unlockedUnits: string[]
  newlyUnlocked: string[]
}
```

2. `THRESHOLDS` const (lines 21-25):
```typescript
const THRESHOLDS: Array<{ wins: number; unit: string }> = [
  { wins: 2, unit: 'assault_bot' },
  { wins: 3, unit: 'thorn_beast' },
  { wins: 5, unit: 'elementalist' },
]
```

3. `recordMatchResult` function (lines 57-94) — entire function.

4. Import on line 2: `import type { Faction } from '../../types'` — keep only if `upsertProfile` still uses `Faction` (it does, so keep).

**Symbols to KEEP:** `Profile` interface (lines 5-11), `getProfile` function (lines 28-36), `upsertProfile` function (lines 39-52).

**Symbol to ADD:** `getProfile` already exists and is kept. No new symbols needed in account.ts — new profile aggregation lives in `src/lib/api/profile.ts`.

---

### `src/lib/gameState.ts` — edit (store)

**Current content** (lines 1-21, read in full):
```typescript
import type { GameStateType } from '../types'

const gameState: GameStateType = {
  userId: null,
  username: null,
  playerFaction: null,
  unlockedUnits: ['scout_drone', 'vine_crawler', 'apprentice_mage'],
  loadout: [],
  wins: 0,
  losses: 0,
  roomId: null,
  role: null,
  hostBaseHp: 1000,
  guestBaseHp: 1000,
  gold: 200,
  gameMode: 'topdown',
  mapId: null,
  hostSlot: null,
  guestSlot: null,
}

export default gameState
```

**Field to ADD:** `opponentId: string | null` — insert after `role`:
```typescript
  role: null,
  opponentId: null,    // <-- ADD: hydrated from rooms.guest_id / rooms.host_id at LobbyScene join
```

The `GameStateType` in `src/types/index.ts` must also gain `opponentId: string | null` at the same relative position.

---

### `src/types/index.ts` — edit (model)

**Current `GameStateType`** (lines 18-35, read in full). Add after `role`:
```typescript
  role: 'host' | 'guest' | null
  opponentId: string | null   // <-- ADD: opponent's UUID, null until room joined
```

---

### `src/scenes/GameScene.ts` — edit (component, event-driven)

**File is its own analog.** Targeted excerpts read.

**Import to CHANGE** (line 4 — current):
```typescript
import { recordMatchResult } from '../lib/api/account'
```
Replace with:
```typescript
import { reportMatchResult } from '../lib/api/settlement'
import { getBalance } from '../lib/api/wallet'
import { esc } from '../lib/escapeHtml'
```

**Block to REMOVE — `recordResult` method** (lines 607-617, current):
```typescript
private async recordResult(result: 'win' | 'loss' | 'tie') {
  if (!gameState.userId) return
  const payload = await recordMatchResult(gameState.userId, result)
  if (!payload) return

  gameState.wins          = payload.wins
  gameState.losses        = payload.losses
  gameState.unlockedUnits = payload.unlockedUnits

  if (payload.newlyUnlocked.length > 0) this.showUnlockNotification(payload.newlyUnlocked)
}
```

**Block to REMOVE — `showUnlockNotification` method** (lines 619-641, current):
```typescript
private showUnlockNotification(units: string[]) {
  const names = units.map(id => UNITS.find(u => u.id === id)?.name ?? id).join(', ')
  const el = document.createElement('div')
  el.id = 'gh-unlock'
  el.innerHTML = `...` // full method
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 4000)
}
```

**Call site to REPLACE** (line 601, current):
```typescript
void this.recordResult(playerWon ? 'win' : isTie ? 'tie' : 'loss')
```
Replace with (following RESEARCH.md lines 755-778):
```typescript
if (!gameState.roomId?.startsWith('practice-')) {
  void this.submitMatchReport(playerWon, winner)
}
```

**New method to ADD** after `showResultOverlay`:
```typescript
private async submitMatchReport(playerWon: boolean, winner: 'host' | 'guest' | 'tie') {
  if (!gameState.userId || !gameState.roomId || winner === 'tie') return
  const weAreWinner = (winner === gameState.role)
  const winnerId = weAreWinner ? gameState.userId : (gameState.opponentId ?? gameState.userId)
  await reportMatchResult(gameState.roomId, winnerId)
  const newBalance = await getBalance(gameState.userId)
  if (newBalance !== null) gameState.walletBalance = newBalance
}
```

**XSS fix — line 882 (current)**:
```typescript
const username = gameState.username ?? 'PLAYER'
```
Replace with:
```typescript
const username = esc(gameState.username ?? 'PLAYER')
```
After this, `${username}` at line 1002 inside `this.hud.innerHTML` is already safe — no further change needed at that line.

---

### `src/scenes/AuthScene.ts` — edit (component, request-response)

**File is its own analog.** Key signup block at lines 615-636 (read in full).

**Current signup flow** (lines 615-636):
```typescript
const { data, error } = await supabase.auth.signUp({
  email: step1Data!.email,
  password: step1Data!.pass,
})
if (error) { setErr(error.message.toUpperCase()); btn.textContent = '⚔ JOIN THE RAID'; btn.disabled = false; return }

const userId = data.user?.id
if (!userId) { setErr('SIGNUP FAILED — TRY AGAIN'); btn.textContent = '⚔ JOIN THE RAID'; btn.disabled = false; return }

const { error: profileErrMsg } = await upsertProfile({ ... })
if (profileErrMsg) { setErr('PROFILE CREATION FAILED'); ... return }

gameState.userId = userId
// ... then scene.start('LobbyScene')
```

**Addition: call `provision_account` RPC after `upsertProfile` succeeds:**
Insert after the `upsertProfile` success check, before setting `gameState.userId`:
```typescript
// Call provision_account to create wallet + welcome grant (idempotent, safe on retry)
await supabase.rpc('provision_account', { p_user_id: userId })
// Non-fatal: if this fails, the SQL backfill migration will provision on deploy
```

**Same addition applies at the onboard path** (lines 862-874 — the existing-account onboard flow that calls `upsertProfile` a second time): add the same `provision_account` RPC call after `upsertProfile` succeeds.

---

### `src/scenes/LobbyScene.ts` — edit (component, request-response)

**File is its own analog.** Username XSS site at lines 100 and 133.

**Import to ADD** (after existing imports, currently lines 1-6):
```typescript
import { esc } from '../lib/escapeHtml'
```

**Line 100 (current)**:
```typescript
const username = gameState.username ?? 'COMMANDER'
```
Replace with:
```typescript
const username = esc(gameState.username ?? 'COMMANDER')
```
After this, `${username}` at line 133 inside `this.overlay.innerHTML` is already safe.

**opponentId hydration addition** — at the room join/create point in LobbyScene where `gameState.roomId` and `gameState.role` are set, also set:
```typescript
// When host creates room:
gameState.opponentId = null  // set to room.guest_id when guest joins (via realtime)

// When guest joins room:
gameState.opponentId = room.host_id  // the host's UUID is known at join time

// For host: hydrate opponentId from realtime room update when guest joins:
gameState.opponentId = updatedRoom.guest_id ?? null
```

---

### `test/rls/inventory-rls.test.ts` (test, request-response)

**Analog:** `test/rls/wallet-rls.test.ts` (all 76 lines — exact structural match)

**Harness setup pattern** (wallet-rls.test.ts lines 1-22):
```typescript
import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!  // CI env ONLY — never in src/

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
let user: ReturnType<typeof createClient>

beforeAll(async () => {
  const email = `t_${Date.now()}@example.test`
  await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true })
  user = createClient(URL, ANON, { auth: { persistSession: true } })
  await user.auth.signInWithPassword({ email, password: 'pw-123456' })
  // Seed a legit balance of 100 via the SECURITY DEFINER RPC
  await user.rpc('credit_wallet', { p_amount: 100, p_idempotency_key: 'seed' })
})
```

**Forged-write assertion pattern** (wallet-rls.test.ts lines 25-42):
```typescript
it('rejects a forged direct UPDATE to wallet.balance', async () => {
  const { error } = await user
    .from('wallet')
    .update({ balance: 999999 })
    .neq('owner', '00000000-0000-0000-0000-000000000000')
  expect(error).toBeNull()  // RLS silently blocks — no error raised

  const { data: u } = await user.auth.getUser()
  const { data } = await admin
    .from('wallet')
    .select('balance')
    .eq('owner', u.user!.id)
    .single()
  expect(data!.balance).toBe(100)  // UNCHANGED — forged write was denied by RLS
})
```

**Copy this pattern** for `inventory-rls.test.ts`:
- `beforeAll`: create user, seed wallet with 100 via `credit_wallet` RPC
- Test: forged INSERT to `inventory` — `user.from('inventory').insert({ owner: uid, unit_id: 'assault_bot' })` — re-read as admin, assert 0 rows
- Test: `spend_unlock('assault_bot')` with sufficient balance — assert inventory row exists + balance deducted
- Test: `spend_unlock('assault_bot')` with insufficient balance — assert `{ ok: false, reason: 'insufficient_funds' }`
- Test: two concurrent `spend_unlock` calls — `Promise.all([user.rpc(...), user.rpc(...)])` — assert balance deducted exactly once

---

### `test/rls/settlement-idempotency.test.ts` (test, request-response)

**Analog:** `test/rls/wallet-rls.test.ts` (harness setup pattern)

**Two-user setup extension** — needs two users (the wallet-rls test uses one; this test needs two):
```typescript
let userA: ReturnType<typeof createClient>
let userB: ReturnType<typeof createClient>

beforeAll(async () => {
  // Create user A
  const emailA = `ta_${Date.now()}@example.test`
  await admin.auth.admin.createUser({ email: emailA, password: 'pw-123456', email_confirm: true })
  userA = createClient(URL, ANON, { auth: { persistSession: false } })
  await userA.auth.signInWithPassword({ email: emailA, password: 'pw-123456' })

  // Create user B
  const emailB = `tb_${Date.now()}@example.test`
  await admin.auth.admin.createUser({ email: emailB, password: 'pw-123456', email_confirm: true })
  userB = createClient(URL, ANON, { auth: { persistSession: false } })
  await userB.auth.signInWithPassword({ email: emailB, password: 'pw-123456' })
})
```

**Idempotency test pattern** (adapted from wallet-rls.test.ts lines 44-57):
```typescript
it('credits are idempotent (same match_id credits once)', async () => {
  // ... both players report same winner, then A reports again
  // Assert balance credited exactly once (WIN_REWARD = 50)
})
```

---

### `test/rls/migration.test.ts` (test, request-response)

**Analog:** `test/rls/wallet-rls.test.ts` (harness setup pattern)

**migration.test.ts pattern:** Insert a `profiles` row via service-role admin, call `provision_account` RPC, then assert:
- wallet row exists with balance = WELCOME_GRANT (100)
- inventory rows match the seeded `unlocked_units[]`
- calling `provision_account` a second time does not double the balance

---

### `test/unit/escape.test.ts` (test, transform)

**Analog:** `test/unit/pathfinder.test.ts` (structure: describe/it blocks, pure function assertions)

**Imports pattern** (pathfinder.test.ts lines 1-3):
```typescript
import { describe, expect, it } from 'vitest'
import { <function> } from '../../src/lib/<module>'
```

**Pure assertion structure** (pathfinder.test.ts lines 42-50):
```typescript
describe('<function>', () => {
  it('<condition>', () => {
    expect(<fn>(input)).toBe(expected)
  })
})
```

**escape.test.ts structure:**
```typescript
import { describe, expect, it } from 'vitest'
import { esc } from '../../src/lib/escapeHtml'

describe('esc', () => {
  it('escapes < and >', () => { expect(esc('<b>')).toBe('&lt;b&gt;') })
  it('escapes &', () => { expect(esc('a & b')).toBe('a &amp; b') })
  it('escapes "', () => { expect(esc('"val"')).toBe('&quot;val&quot;') })
  it("escapes '", () => { expect(esc("it's")).toBe('it&#39;s') })
  it('returns plain strings unchanged', () => { expect(esc('hello')).toBe('hello') })
  it('escapes an XSS payload', () => {
    expect(esc('<script>alert(1)</script>')).not.toContain('<')
  })
})
```

---

### `test/unit/economy.test.ts` (test, transform)

**Analog:** `test/unit/pathfinder.test.ts` (pure assertions, no network)

**Structure:**
```typescript
import { describe, expect, it } from 'vitest'

// Constants live in SQL — mirror them here as display-only assertions
const WIN_REWARD = 50
const LOSS_REWARD = 15
const WELCOME_GRANT = 100
const UNIT_COST = 100

describe('economy constants', () => {
  it('WIN_REWARD is positive', () => { expect(WIN_REWARD).toBeGreaterThan(0) })
  it('LOSS_REWARD is positive', () => { expect(LOSS_REWARD).toBeGreaterThan(0) })
  it('LOSS_REWARD < WIN_REWARD (winning is incentivised)', () => { expect(LOSS_REWARD).toBeLessThan(WIN_REWARD) })
  it('WELCOME_GRANT equals one unit cost (D-02)', () => { expect(WELCOME_GRANT).toBe(UNIT_COST) })
  it('further units affordable in 3-5 wins (D-03)', () => {
    const winsNeeded = Math.ceil(UNIT_COST / WIN_REWARD)
    expect(winsNeeded).toBeGreaterThanOrEqual(2)
    expect(winsNeeded).toBeLessThanOrEqual(5)
  })
})
```

---

## Shared Patterns

### SECURITY DEFINER RPC Shape
**Source:** `supabase/migrations/20260612085249_foundations.sql` lines 41-83 (`credit_wallet`)
**Apply to:** All three new RPCs — `spend_unlock`, `report_match_result`, `provision_account` (+ `credit_wallet_for_user`)

The invariant checklist every new RPC must satisfy:
1. `security definer` keyword
2. `set search_path = ''` (hardened — prevents search-path injection)
3. All table refs are fully qualified: `public.<table>` (not just `<table>`)
4. `v_owner := auth.uid()` + `if v_owner is null then raise exception 'not authenticated'; end if;`
5. `revoke all on function ... from public; grant execute ... to authenticated;` at the bottom

### RLS Deny-by-Default Pattern
**Source:** `supabase/migrations/20260612085249_foundations.sql` lines 10-22 (wallet) and 104-119 (shells)
**Apply to:** `match_results`, `match_settlements`, `inventory` (write policies) — no INSERT/UPDATE/DELETE policy = deny by default

### `ON CONFLICT DO NOTHING` Idempotency
**Source:** `supabase/migrations/20260612085249_foundations.sql` lines 59-67 (credit_wallet idempotency ledger)
**Apply to:** Every insert in every new RPC — welcome grant, inventory seeding, settlement row creation

Critical nuance: `ON CONFLICT DO NOTHING` after INSERT sets `FOUND = false` even on a fresh insert in some contexts. For the `match_settlements` settlement gate, use `GET DIAGNOSTICS v_count = ROW_COUNT` to distinguish "inserted" from "already existed". The `credit_wallet` exemplar uses `IF NOT FOUND` after `wallet_credits` insert (works there due to the subsequent UPDATE RETURNING). Use `GET DIAGNOSTICS` for any case where the INSERT outcome needs to be distinguished from a conflict.

### Supabase RPC Client Pattern
**Source:** `src/lib/api/wallet.ts` lines 16-26 (`creditWallet`)
**Apply to:** `spendUnlock` in `inventory.ts`, `reportMatchResult` in `settlement.ts`
```typescript
const { data, error } = await supabase.rpc('<rpc_name>', { p_param: value })
if (error) return { ..., error: error.message }
return { ..., error: null }
```

### Supabase Table Query Pattern
**Source:** `src/lib/api/wallet.ts` lines 4-12 (`getBalance`) and `src/lib/api/account.ts` lines 28-36 (`getProfile`)
**Apply to:** `getOwnedUnits` in `inventory.ts`, `getProfileFull` in `profile.ts`
```typescript
const { data, error } = await supabase
  .from('<table>')
  .select('<columns>')
  .eq('<col>', value)
  .single<T>()          // or .returns<T[]>() for arrays
if (error || !data) return null
return data.<field>
```

### RLS Test Harness Setup
**Source:** `test/rls/wallet-rls.test.ts` lines 1-22
**Apply to:** All three new RLS test files (`inventory-rls.test.ts`, `settlement-idempotency.test.ts`, `migration.test.ts`)

Key details:
- `admin` client uses `SERVICE` key with `persistSession: false` (prevents session contamination)
- `user` client uses `ANON` key with `persistSession: true`
- Keys from `process.env.*` only — never from `src/`
- `fileParallelism: false` in vitest config (already set in `vitest.config.ts` line 16)

### Scene Import Pattern
**Source:** `src/scenes/GameScene.ts` lines 1-16, `src/scenes/LobbyScene.ts` lines 1-6
**Apply to:** Any new service import in GameScene or LobbyScene
```typescript
import { <fn> } from '../lib/api/<module>'  // relative path from scenes/ to lib/api/
import { esc } from '../lib/escapeHtml'      // relative path from scenes/ to lib/
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/escapeHtml.ts` | utility | transform | No HTML escape utility exists anywhere in the codebase. The RESEARCH.md pattern (five `.replace()` calls) is the complete implementation — no codebase search needed. |

---

## Key Confirmed Facts (for planner read_first lists)

These were verified by direct file reads in this session:

1. **`src/lib/gameState.ts` does NOT have `opponentId`** — must be added (assumption A1 confirmed: it is not present).

2. **`src/types/index.ts` `GameStateType` does NOT have `opponentId`** — must be added alongside gameState.ts edit.

3. **`src/lib/api/account.ts` `THRESHOLDS` is at lines 21-25; `recordMatchResult` is at lines 57-94** — exact deletion targets.

4. **`src/scenes/GameScene.ts` call site is at line 601**: `void this.recordResult(playerWon ? 'win' : isTie ? 'tie' : 'loss')` inside the `if (!gameState.roomId?.startsWith('practice-'))` guard — the guard already exists, so only the inner call needs replacing.

5. **`GameScene.ts` line 882**: `const username = gameState.username ?? 'PLAYER'` — wrap with `esc(...)`.

6. **`GameScene.ts` line 1002**: `<div class="gh-bs">${username}</div>` — already safe after line 882 fix.

7. **`LobbyScene.ts` line 100**: `const username = gameState.username ?? 'COMMANDER'` — wrap with `esc(...)`.

8. **`LobbyScene.ts` line 133**: `${username}` inside `this.overlay.innerHTML` — already safe after line 100 fix.

9. **`UnitData.ts` unit IDs confirmed**: `'assault_bot'`, `'thorn_beast'`, `'elementalist'` are the exact ID strings for the three non-starter units. `starter: false` on all three. In-match gold costs are `120` each (not the soft-currency cost — those are 100 each per D-04).

10. **`AuthScene.ts` has TWO signup paths that call `upsertProfile`**: line 624 (new account signup) and line 862 (existing-account onboard). Both need a `provision_account` RPC call added after success.

11. **Phase 9 `inventory` bare shell** has only `id uuid pk` + `owner uuid not null` — no `unit_id` column yet. The migration must `ALTER TABLE ... ADD COLUMN IF NOT EXISTS unit_id text NOT NULL DEFAULT ''` and add the `UNIQUE (owner, unit_id)` constraint.

12. **Phase 9 `match_results` bare shell** has `id uuid pk` + `owner uuid not null` — this schema conflicts with the Phase 11 two-row design. The migration must drop the bare shell columns and replace with the `(match_id, reporter_id)` composite PK shape. Use `ALTER TABLE ... DROP COLUMN owner; ALTER TABLE ... ADD COLUMN match_id uuid NOT NULL; ALTER TABLE ... ADD COLUMN reporter_id uuid NOT NULL REFERENCES auth.users(id); ALTER TABLE ... ADD COLUMN claimed_winner uuid NOT NULL; ALTER TABLE ... ADD COLUMN reported_at timestamptz NOT NULL DEFAULT now(); ALTER TABLE ... ADD PRIMARY KEY (match_id, reporter_id);` — or drop and recreate if cleaner. Also update the RLS policy from `auth.uid() = owner` to `auth.uid() = reporter_id`.

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `src/lib/api/`, `src/scenes/`, `src/lib/`, `src/types/`, `src/units/`, `test/rls/`, `test/unit/`
**Files scanned:** 14 source files read directly
**Pattern extraction date:** 2026-06-12
