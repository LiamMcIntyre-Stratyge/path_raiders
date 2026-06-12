# Phase 9: Backend Foundations & Integrity - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the Supabase security boundary **committed, reviewable, and enforced**, give every
player a **stable real authenticated identity**, ensure **no privileged secret ships in
the client bundle**, and stand up a **Vitest harness that runs in CI** — plus a thin
`src/lib/api/` services seam so scenes stop writing authoritative tables directly. This
is a de-risking foundation phase: **no new gameplay**, behavior-preserving except for the
auth-gating change below.

**In scope:** committed `supabase/migrations` SQL (wallet end-to-end + bare RLS shells +
tightened `profiles` RLS), email-only authenticated identity (delete the `'guest'`
literal), GitHub Actions CI (tsc + Vitest + bundle secret-scan), first pure-function +
RLS tests, thin `src/lib/api/` seam for tables touched today.

**Out of scope (later phases):** full economy/inventory/upgrade/match/queue table columns
and RPCs (phases 11–14), the fuller services layer + sim extraction (Phase 10), v1.0
profile data migration (Phase 11 / ACCT-04), matchmaking, progression, battle authority.
</domain>

<requirements_change>
## ⚠️ Requirements Change — MUST be reconciled before/at planning

**Decision D-04 (email-only identity) OVERRIDES two locked items:**

- **FND-02** currently reads: *"Every player — including guests — gets a persistent real
  account identity (Supabase anonymous auth → stable UUID)…"* → **Reword to:** *"Every
  player gets a persistent real authenticated identity via email/password sign-in; there
  is no anonymous/guest play; the collision-prone `'guest'` literal is removed."*
- **ROADMAP.md Phase 9 Success Criterion #2** currently mandates anonymous auth. →
  **Reword to:** *"Every player gets a stable real account UUID via authenticated
  email/password sign-in (no anonymous auth); the literal `'guest'` id is deleted."*

**Action for downstream:** The planner should plan to the reworded criterion (no anonymous
auth). Recommend updating `.planning/REQUIREMENTS.md` (FND-02) and `.planning/ROADMAP.md`
(Phase 9 Goal + SC#2) to match — via `/gsd:phase` edit or a docs commit — so the
verifier doesn't fail Phase 9 against the stale anon-auth criterion. The `supabase-js`
version bump (2.99 → 2.108) previously motivated by anonymous auth is **no longer needed
for that reason** in Phase 9 (private channels remain a Phase 14 concern).
</requirements_change>

<decisions>
## Implementation Decisions

### Schema scope — minimal slice (proves the pattern, locks nothing prematurely)
- **D-01:** Phase 9 commits a **minimal** authoritative-schema slice, not the full v2.0
  table set. Goal is to PROVE the read-via-RLS / write-via-RPC pattern, not to lock
  economy/column shapes before phases 11–14 are discussed.
- **D-02:** **Wallet is the full end-to-end exemplar:** `wallet` table + RLS
  (client reads only its own row, **cannot** write authoritative columns) + a
  `SECURITY DEFINER` credit RPC as the sole writer + the forged-write rejection test.
  This is the reference pattern every later authoritative table copies.
- **D-03:** `inventory`, `upgrades`, `match_results` are created as **bare RLS-protected
  shells** (id + owner + RLS read-own/no-client-write; rich columns deferred to their
  owning phases). This satisfies SC#1's literal "these tables exist with RLS" while
  keeping their shapes unlocked. `profiles` RLS is **tightened** (UPDATE/INSERT gated to
  `auth.uid() = id`; currency/stat columns not client-writable).

### Identity & auth — email-only (see Requirements Change above)
- **D-04:** **Email-only authenticated identity. Anonymous auth is dropped.** All play is
  gated behind email/password sign-in (the existing `AuthScene` is the sole entry point).
- **D-05:** The literal `'guest'` id is **deleted outright** — multiplayer, economy, and
  stats all require a real authenticated UUID. Current `gameState.userId ?? 'guest'`
  fallbacks (`LobbyScene.ts:341/425`, `GameScene.ts:607`) are removed/replaced with a
  real UUID precondition.
- **D-06:** **Practice mode also requires sign-in** (it can still run locally/offline with
  no persistence and no rewards, but is attributed to a real account — no unauthenticated
  code path remains).

### Services-layer boundary — thin seam only (Phase 10 owns the full refactor)
- **D-07:** Phase 9 creates `src/lib/api/` wrapping **only the tables/RPCs scenes touch
  today**: a profile/account client (replaces direct `profiles` reads/writes in
  `AuthScene` + `GameScene`), a rooms client (`LobbyScene`), and the new wallet client
  (the credit RPC). Scenes stop calling `supabase.from()` for these.
- **D-08:** The **fuller** services layer (matchmaking, progression, matchClient, session)
  and the sim extraction are **Phase 10's job**, extending this same seam — Phase 9 does
  not pre-build clients for tables/RPCs that don't exist yet.

### CI & secret guard
- **D-09:** **GitHub Actions** (`.github/workflows`) runs `tsc` + Vitest + the secret-scan
  on every push/PR, failing the build on any failure (remote is already GitHub; gives
  PR-level gating before Vercel deploy).
- **D-10:** Secret-leak guard = **custom grep over the built `dist/` bundle** for
  service-role JWT patterns / known secret markers, exiting non-zero if found. Targeted at
  FND-03's exact threat (privileged key bundled), no heavy new deps.
- **D-11:** The "**forged write is rejected**" RLS test (SC#1) runs against a **real local
  Supabase via the Supabase CLI** (`supabase start`) in CI: apply migrations, assert a
  client-auth'd forged write to `wallet` is denied by RLS. Adds the Supabase CLI to CI.
- **D-12:** First Vitest tests: **pathfinder** pure functions (`findPath`, `isWalkable`,
  `canBreakWall`) green to establish the coverage seam (FND-04), plus the RLS forged-write
  test from D-11.

### Claude's Discretion
- **Anon-key rotation:** `.env.local` is **already untracked and not in git history**
  (verified at discussion time; `*.local` is gitignored). FND-03's "untracked + key
  rotated" is therefore largely already satisfied. Treat rotation as an **optional
  precaution, not phase work** — Claude may skip it. (The user must perform any rotation
  in the Supabase dashboard; Claude cannot.)
- Exact migration file layout, RPC signatures, mulberry32/seed details (n/a here),
  GitHub Actions YAML structure, and the precise grep pattern for the secret scan are
  Claude's to choose at plan time.
- `service_role` key (if used by any future server function) must live **only** in CI /
  Edge Function secrets — never a `VITE_*` var, never imported by `src/`.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Security boundary, schema & economy patterns
- `.planning/research/PITFALLS.md` — supplies the exact SQL shapes: atomic guarded
  `UPDATE … WHERE … RETURNING`, `CHECK (gold >= 0)`, `INSERT … ON CONFLICT DO NOTHING`
  idempotency, RLS `auth.uid() = id`, `service_role` containment, `FOR UPDATE SKIP
  LOCKED`. See esp. Pitfalls 6 (RLS), 7 (service_role leak), 3–5 (economy), and the
  Pitfall-to-Phase table.
- `.planning/research/SUMMARY.md` §"Key Architecture Decision" (Option A confirmed),
  §"Implications for Roadmap" → Phase 0 (Foundations) deliverables.
- `.planning/codebase/CONCERNS.md` — current security exposure: client-authoritative
  writes (`recordResult`), unverified RLS, the `'guest'` literal, 0% test coverage,
  `.env.local` history note (now resolved — re-verify).

### Current Supabase wiring & code to change
- `.planning/codebase/INTEGRATIONS.md` — full map of `profiles`/`rooms` table usage,
  the single `src/lib/supabase.ts` client, auth flows in `AuthScene`, and exact
  file:line write sites scenes use today.
- `.planning/codebase/TESTING.md` — confirms zero tests; recommends Vitest; lists
  highest-value first targets (pathfinder, map builders, Unit math).
- `src/lib/supabase.ts`, `src/scenes/AuthScene.ts`, `src/scenes/LobbyScene.ts`,
  `src/scenes/GameScene.ts`, `src/lib/gameState.ts`, `src/lib/pathfinder.ts`,
  `package.json`, `.gitignore` — primary files this phase edits.

### Phase / requirements anchors
- `.planning/ROADMAP.md` §"Phase 9" — goal + 5 success criteria (note SC#2 reword above).
- `.planning/REQUIREMENTS.md` — FND-01…FND-05 (note FND-02 reword above).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/supabase.ts` — the single shared `createClient` instance; the new `src/lib/api/`
  clients wrap this rather than replacing it.
- `AuthScene.ts` email/password flows (signIn, signUp, session restore, reset) — already
  built; becomes the sole entry point under D-04/D-05. No new auth UI needed for Phase 9.
- `src/lib/pathfinder.ts` — pure, deterministic; the FND-04 first-tests target (D-12).

### Established Patterns
- Scenes currently call `supabase.from('profiles'|'rooms')` directly (e.g.
  `GameScene.ts:611-639`, `LobbyScene.ts:338-429`, `AuthScene.ts:631/869`). FND-05 / D-07
  replaces these direct calls with `src/lib/api/` client calls.
- `gameState.userId ?? 'guest'` fallback pattern (`LobbyScene.ts:341/425`,
  `GameScene.ts:607`) — the `'guest'` branch is removed (D-05); `userId` becomes a required
  real UUID precondition.
- Project is Vite + ESM + strict TS → Vitest needs near-zero config (per TESTING.md).

### Integration Points
- New `wallet` table + credit RPC connect to the profile/account model; the wallet client
  in `src/lib/api/` is consumed later by Phase 11 economy work.
- GitHub Actions CI is net-new (`.github/workflows`); no `vercel.json` exists — CI is the
  gate, Vercel remains deploy-only.
- New `supabase/` directory (migrations) is net-new — greenfield, no existing migrations.
</code_context>

<specifics>
## Specific Ideas

- Wallet is deliberately the **exemplar** authoritative table because it is the first
  real authority move in Phase 11 (economy) — building it now gives later phases a working
  copy-paste pattern (RLS read-own + `SECURITY DEFINER` sole-writer RPC + forged-write
  test).
- The user is explicit that **email sign-in is the only identity path** — no try-before-
  signup, no guest progress to preserve. This simplifies the account model versus the
  research's assumed anonymous-auth foundation.
</specifics>

<deferred>
## Deferred Ideas

- **Anonymous/guest auth + guest→permanent account linking** — explicitly rejected for
  v2.0 (D-04). If reconsidered later, it must be designed into the identity model from the
  start; record as a possible v2.x revisit, not a Phase 9 item.
- **Full v2.0 schema** (inventory/upgrades/matches/match_reports/matchmaking_queue rich
  columns + RPCs) — phases 11–14.
- **Fuller `src/lib/api/` services layer + `src/sim/` extraction** — Phase 10.
- **v1.0 profile data migration (ACCT-04)** — Phase 11.
- **Precautionary anon-key rotation** — optional ops task for the user (not phase work).

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</deferred>

---

*Phase: 9-Backend Foundations & Integrity*
*Context gathered: 2026-06-12*
