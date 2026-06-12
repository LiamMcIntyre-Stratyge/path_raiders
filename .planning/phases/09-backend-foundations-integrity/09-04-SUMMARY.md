---
phase: 09-backend-foundations-integrity
plan: 04
subsystem: identity / auth gate
tags: [identity, auth, security, FND-02, D-04, D-05, D-06]
dependency_graph:
  requires: [09-03]
  provides: [authenticated-identity-enforcement]
  affects: [src/scenes/LobbyScene.ts, src/types/index.ts]
tech_stack:
  added: []
  patterns: [scene-entry guard, precondition guard, null-check redirect]
key_files:
  modified:
    - src/scenes/LobbyScene.ts
    - src/types/index.ts
decisions:
  - "Added scene-entry guard in LobbyScene.create() — earliest redirect point before any DOM is created"
  - "Four separate guards (create, practice, join, scene-entry) rather than one top-level flag — defense-in-depth pattern"
  - "Replaced 'PLAYING AS GUEST' with 'NOT SIGNED IN' text — retains the null-state UI branch without using the identity literal"
metrics:
  duration_minutes: 15
  completed: "2026-06-12"
  tasks_completed: 3
  files_modified: 2
---

# Phase 09 Plan 04: Email-Only Identity Enforcement Summary

Removed the `'guest'` identity literal (fake-user spoofing pattern) from every play entry point and documented the required-UUID invariant — closing threat T-09-guest-collision and T-09-unauth-path (FND-02, D-04/D-05/D-06). Role references (`role: 'guest'`, `guest_id`, `guest_faction`) are fully preserved.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Gate LobbyScene play entry on real userId | e848e7a | src/scenes/LobbyScene.ts |
| 2 | Confirm GameScene guard + sweep identity literals | (no changes needed) | src/scenes/GameScene.ts |
| 3 | Document required-UUID invariant in types + phase sweep | d6a1523 | src/types/index.ts |

## Must-Haves Status

| Must-Have | Status |
|-----------|--------|
| No `?? 'guest'` identity literal in scenes or gameState | PASS |
| No `'PLAYING AS GUEST'` string | PASS |
| `if (!gameState.userId)` guard at every play entry | PASS — 4 guards in LobbyScene |
| `role: 'host' \| 'guest' \| null` union preserved | PASS |
| GameScene `if (!gameState.userId) return` defensive guard retained | PASS |
| `npx tsc --noEmit` passes | PASS |

## What Changed

### LobbyScene.ts

Four `if (!gameState.userId) { this.scene.start('AuthScene'); return }` guards added:

1. **`create()` scene-entry guard** — earliest possible redirect; fires before any DOM is created, ensuring LobbyScene cannot run unauthenticated.
2. **Practice mode handler** — gates solo practice on a real session (D-06).
3. **Create-room handler** — guards before `createRoom({ hostId: gameState.userId, ... })` (removed `?? 'guest'` fallback).
4. **Join-room handler** — guards before `joinRoom(id, { guestId: gameState.userId, ... })` (removed `?? 'guest'` fallback).

`'PLAYING AS GUEST'` label replaced with `'NOT SIGNED IN'` — keeps a null-state text branch without using the identity literal (per plan: dead branch, but defensive text retained).

### src/types/index.ts

Added inline comment on `GameStateType.userId` documenting the invariant:
```
userId: string | null  // null only before sign-in; required real UUID at every play entry (FND-02, D-05)
```
No type widening. `role: 'host' | 'guest' | null` union unchanged.

### GameScene.ts (Task 2 — no changes)

The `if (!gameState.userId) return` guard at `recordResult()` was already present from 09-03 work. Phase-wide sweep confirmed no identity-literal `'guest'` assignments exist — only role union usages (`side === 'guest'`, `role === 'guest'`, type annotations). No modifications needed.

## Deviations from Plan

### Minor Deviation: 'PLAYING AS GUEST' handling

The plan said to "render the signed-in label unconditionally, or keep a defensive redirect." The ternary at line 204 was replaced with `'NOT SIGNED IN'` text rather than removing the conditional entirely. This preserves a minimal null-state UI indicator while eliminating the identity literal, consistent with the plan's "defensive redirect" intent.

The scene-entry guard in `create()` means this text is never visible in normal flow — but it remains as defensive UI in case of unexpected state.

No other deviations. Plan executed exactly as written.

## Threat Mitigations

| Threat ID | Status |
|-----------|--------|
| T-09-guest-collision | MITIGATED — `'guest'` identity literal removed; real UUID required at all write call sites |
| T-09-unauth-path | MITIGATED — scene-entry guard + per-handler guards; no unauthenticated code path to game scenes |
| T-09-role-confusion | AVOIDED — `role: 'guest'` union, `guest_id`, `guest_faction` preserved throughout |

## Known Stubs

None — all guards redirect to real AuthScene. No placeholder data flows to UI rendering.

## Self-Check

Files exist:
- src/scenes/LobbyScene.ts: FOUND
- src/types/index.ts: FOUND

Commits exist:
- e848e7a: FOUND
- d6a1523: FOUND

## Self-Check: PASSED
