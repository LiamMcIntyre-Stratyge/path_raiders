# Phase 9: Backend Foundations & Integrity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 9-Backend Foundations & Integrity
**Areas discussed:** Schema scope, Guest identity model, Services-layer boundary, CI & secret guard

---

## Schema scope

### Q1: How much of the v2.0 authoritative schema should Phase 9 define?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal slice | Tighten profiles RLS + one authoritative table end-to-end to prove the read-RLS/write-RPC pattern; later phases add their own tables | ✓ |
| Full schema now | Commit the entire v2.0 table set with RLS in one foundational migration | |
| You decide | Claude picks the split at plan time | |

### Q2: How to handle the four authoritative tables named in SC#1?

| Option | Description | Selected |
|--------|-------------|----------|
| Wallet exemplar + bare shells | Wallet full end-to-end (table + RLS + SECURITY DEFINER RPC + forged-write test); inventory/upgrades/match_results as bare RLS shells | ✓ |
| Wallet exemplar only | Only wallet exists; others created in their owning phases (narrows SC#1) | |
| You decide | Pick exemplar + shell strategy at plan time | |

**User's choice:** Minimal slice; wallet exemplar + bare RLS shells.
**Notes:** Keeps economy/column shapes unlocked for phases 11–14 while satisfying SC#1's "tables exist with RLS" literally.

---

## Guest identity model

### Q1: How should anonymous guests relate to permanent (email) accounts?

| Option | Description | Selected |
|--------|-------------|----------|
| Upgrade & keep progress | Guest plays on anon UUID, later links to email keeping same UUID + progress (recommended) | |
| Separate, no linking | Anon and email are distinct identities; guest who signs up starts fresh | |
| Email-only, no guests | Drop anonymous play; gate everything behind email sign-in | ✓ |

### Q2: What replaces unauthenticated entry paths (the 'guest' id, 'practice-' rooms)?

| Option | Description | Selected |
|--------|-------------|----------|
| Gate everything behind sign-in | AuthScene is sole entry; delete 'guest' id; practice requires sign-in | ✓ |
| Sign-in for online, local practice open | Multiplayer/economy require sign-in; logged-out offline practice stays | |
| Let me explain | User describes their own flow | |

**User's choice:** Email-only, no guests; gate everything behind sign-in.
**Notes:** ⚠️ Overrides FND-02 and Phase 9 SC#2 (both mandate anonymous auth). Captured in CONTEXT.md `<requirements_change>`; REQUIREMENTS.md + ROADMAP.md to be reworded. The `supabase-js` bump for anon auth is no longer needed for that reason.

---

## Services-layer boundary

### Q1: How much of src/lib/api/ should Phase 9 build to satisfy FND-05?

| Option | Description | Selected |
|--------|-------------|----------|
| Thin seam, tables touched today | Wrap only profile/account, rooms, and the new wallet client; full layer in Phase 10 | ✓ |
| Full typed services layer now | Stand up session/profile/wallet/inventory/progression/matchmaking/matchClient now | |
| You decide | Pick the seam boundary at plan time | |

**User's choice:** Thin seam — tables touched today only.
**Notes:** Avoids double-building against Phase 10's stated services + sim refactor scope; Phase 10 extends the same seam.

---

## CI & secret guard

### Q1: Where should the test + secret-scan guard run?

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions | .github/workflows runs tsc + Vitest + secret-scan on push/PR | ✓ |
| Vercel build step | Fold checks into Vercel build command | |
| npm script only (pre-commit) | Local verify + optional git hook, no hosted CI | |

### Q2: How should the secret-leak guard detect a bundled credential?

| Option | Description | Selected |
|--------|-------------|----------|
| Custom grep over dist/ | Grep built bundle for service-role JWT patterns, fail if found | ✓ |
| gitleaks | Repo/diff-wide secret scanner | |
| Both | gitleaks + dist/ grep | |

### Q3: How should the 'forged write is rejected' RLS test execute?

| Option | Description | Selected |
|--------|-------------|----------|
| Real local Supabase via CLI | supabase start in CI; apply migrations; assert forged write denied | ✓ |
| Mock / unit-level | Stub the client; don't run real RLS | |
| You decide | Choose harness at plan time | |

**User's choice:** GitHub Actions; custom dist/ grep; real local Supabase via CLI.
**Notes:** dist/ grep is targeted at FND-03's exact threat. Real-Supabase RLS test is the only way to truly verify SC#1. Anon-key rotation found unnecessary (.env.local untracked + not in git history) — optional precaution only.

---

## Claude's Discretion

- Anon-key rotation (optional precaution; user-performed in Supabase dashboard if at all).
- Migration file layout, RPC signatures, GitHub Actions YAML, exact secret-scan grep pattern.

## Deferred Ideas

- Anonymous/guest auth + guest→permanent linking (rejected for v2.0; possible v2.x revisit).
- Full v2.0 schema (inventory/upgrades/matches/queue rich columns + RPCs) — phases 11–14.
- Fuller src/lib/api/ services layer + src/sim/ extraction — Phase 10.
- v1.0 profile data migration (ACCT-04) — Phase 11.
