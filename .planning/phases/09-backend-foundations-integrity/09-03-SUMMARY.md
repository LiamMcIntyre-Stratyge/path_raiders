---
phase: 09-backend-foundations-integrity
plan: "03"
subsystem: api-seam
tags: [api, refactor, scenes, profiles, rooms, wallet, rpc]
dependency_graph:
  requires: ["09-02"]
  provides: ["src/lib/api/account.ts", "src/lib/api/rooms.ts", "src/lib/api/wallet.ts"]
  affects: ["src/scenes/AuthScene.ts", "src/scenes/GameScene.ts", "src/scenes/LobbyScene.ts"]
tech_stack:
  added: ["src/lib/api/ module layer"]
  patterns: ["thin api seam", "typed chokepoint", "RPC wrapper over SECURITY DEFINER fn"]
key_files:
  created:
    - src/lib/api/account.ts
    - src/lib/api/rooms.ts
    - src/lib/api/wallet.ts
  modified:
    - src/scenes/AuthScene.ts
    - src/scenes/GameScene.ts
    - src/scenes/LobbyScene.ts
decisions:
  - "account.recordMatchResult lifts win-milestone unlock thresholds (2/3/5) verbatim from GameScene so the scene becomes a thin caller"
  - "wallet.creditWallet routes exclusively through supabase.rpc('credit_wallet') — no .from('wallet').update path exposed in the seam"
  - "supabase.auth.* and realtime channel calls preserved in scenes unchanged — only .from() table calls moved"
  - "gameState.userId ?? 'guest' fallbacks left intact in LobbyScene per plan 03 boundary — removal is plan 04"
metrics:
  duration: "25min"
  completed: "2026-06-12"
  tasks: 3
  files_created: 3
  files_modified: 3
---

# Phase 9 Plan 3: API Seam (account, rooms, wallet) Summary

**One-liner:** Thin typed `src/lib/api/` seam wraps all profiles/rooms/wallet table calls; scenes now reach persistent data only through account.ts, rooms.ts, and wallet.ts with creditWallet going through the `credit_wallet` SECURITY DEFINER RPC.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create three api client modules | de4d79c | src/lib/api/{account,rooms,wallet}.ts |
| 2 | Route AuthScene + GameScene profile calls | eefb2e2 | src/scenes/{AuthScene,GameScene}.ts |
| 3 | Route LobbyScene room calls | a8e6ef2 | src/scenes/LobbyScene.ts |

## What Was Built

### src/lib/api/account.ts
- `getProfile(userId)` — fetches username, faction, unlocked_units, wins, losses or null
- `upsertProfile({ id, username, faction, unlockedUnits })` — single typed upsert
- `recordMatchResult(userId, result)` — encapsulates the read-then-update + win-milestone unlock logic (thresholds: 2→assault_bot, 3→thorn_beast, 5→elementalist), returns `{ wins, losses, unlockedUnits, newlyUnlocked }`

### src/lib/api/rooms.ts
- `createRoom({ hostId, hostFaction, code })` — inserts waiting room, returns `{ room, error }`
- `findRoomByCode(code)` — selects by code + state='waiting', returns row or null
- `joinRoom(roomId, { guestId, guestFaction })` — updates row to active, returns `{ error }`

### src/lib/api/wallet.ts
- `getBalance(userId)` — reads own balance row, returns number|null
- `creditWallet(amount, idemKey)` — calls `supabase.rpc('credit_wallet', { p_amount, p_idempotency_key })`; NO `.from('wallet').update` path

### Scene refactors
- **AuthScene**: 4 call sites replaced — checkSession (getProfile), loadProfileAndRoute (getProfile), showRegister step 2 signup (upsertProfile), showOnboard (upsertProfile). `supabase.auth.*` and forgot-password flows untouched.
- **GameScene**: `recordResult` body replaced with single `recordMatchResult()` call; unlock threshold logic removed from scene (now lives only in account.ts).
- **LobbyScene**: 3 call sites replaced — createRoom insert, findRoomByCode select, joinRoom update. Realtime `supabase.channel`/`removeChannel` subscription preserved in scene.

## Must-Haves Verification

| Check | Status |
|-------|--------|
| `src/lib/api/{account,rooms,wallet}.ts` exist with named exports | PASS |
| No `supabase.from('profiles')` in any scene | PASS |
| No `supabase.from('rooms')` in any scene | PASS |
| `wallet.ts` calls `rpc('credit_wallet', ...)` | PASS |
| `wallet.ts` contains NO `.from('wallet').update` | PASS |
| All three api files import singleton from `'../supabase'` | PASS |
| `npx tsc --noEmit` passes | PASS |
| `supabase.auth.*` calls remain in AuthScene | PASS |
| Realtime channel block remains in LobbyScene | PASS |

## Deviations from Plan

None — plan executed exactly as written. The realtime channel in LobbyScene uses `supabase\n        .channel(...)` (line-wrapped chain) rather than `supabase.channel(...)` on one line; this is pre-existing code style, not a deviation, and the subscription is fully preserved.

## Known Stubs

None introduced by this plan. The `gameState.userId ?? 'guest'` fallbacks in LobbyScene are intentional carry-over per plan boundary (plan 04 removes them).

## Threat Surface Scan

No new network endpoints or auth paths introduced. The seam only reorganizes existing call sites behind typed functions; it does not change the Supabase access patterns (same anon key, same RLS policies, same RPC). No new threat surface.

## Self-Check: PASSED

- `src/lib/api/account.ts` — exists
- `src/lib/api/rooms.ts` — exists
- `src/lib/api/wallet.ts` — exists
- Commits de4d79c, eefb2e2, a8e6ef2 — all present in git log
- `npx tsc --noEmit` — passes (verified post-task 3)
