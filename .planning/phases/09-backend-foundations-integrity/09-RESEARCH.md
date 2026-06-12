# Phase 9: Backend Foundations & Integrity - Research

**Researched:** 2026-06-12
**Domain:** Supabase security boundary (committed migrations + RLS + SECURITY DEFINER RPC), email-only auth identity, secret-in-bundle prevention, Vitest+CI harness, thin `src/lib/api/` seam — on a Vite + ESM + strict-TS + Phaser 3 codebase.
**Confidence:** HIGH on stack versions, RLS/SECURITY DEFINER SQL shapes, Vitest setup, and the secret-scan; HIGH-MEDIUM on the Supabase-CLI-in-CI workflow (verified against official docs + setup-cli action, with one important deviation from the docs' default flow noted below).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Phase 9 commits a **minimal** authoritative-schema slice, not the full v2.0 table set. Goal is to PROVE the read-via-RLS / write-via-RPC pattern, not to lock economy/column shapes before phases 11–14.
- **D-02:** **Wallet is the full end-to-end exemplar:** `wallet` table + RLS (client reads only its own row, **cannot** write authoritative columns) + a `SECURITY DEFINER` credit RPC as the sole writer + the forged-write rejection test. Reference pattern every later authoritative table copies.
- **D-03:** `inventory`, `upgrades`, `match_results` are created as **bare RLS-protected shells** (id + owner + RLS read-own/no-client-write; rich columns deferred to their owning phases). `profiles` RLS is **tightened** (UPDATE/INSERT gated to `auth.uid() = id`; currency/stat columns not client-writable).
- **D-04:** **Email-only authenticated identity. Anonymous auth is dropped.** All play gated behind email/password sign-in (existing `AuthScene` is the sole entry point).
- **D-05:** The literal `'guest'` id is **deleted outright**. Current `gameState.userId ?? 'guest'` fallbacks (`LobbyScene.ts:341/425`, `GameScene.ts:607`) removed/replaced with a real-UUID precondition.
- **D-06:** **Practice mode also requires sign-in** (can still run locally/offline with no persistence/rewards, but attributed to a real account — no unauthenticated code path remains).
- **D-07:** Phase 9 creates `src/lib/api/` wrapping **only the tables/RPCs scenes touch today**: a profile/account client (replaces direct `profiles` reads/writes in `AuthScene` + `GameScene`), a rooms client (`LobbyScene`), and the new wallet client (the credit RPC). Scenes stop calling `supabase.from()` for these.
- **D-08:** The **fuller** services layer (matchmaking, progression, matchClient, session) and the sim extraction are **Phase 10's job**. Phase 9 does not pre-build clients for tables/RPCs that don't exist yet.
- **D-09:** **GitHub Actions** (`.github/workflows`) runs `tsc` + Vitest + the secret-scan on every push/PR, failing the build on any failure.
- **D-10:** Secret-leak guard = **custom grep over the built `dist/` bundle** for service-role JWT patterns / known secret markers, exiting non-zero if found. No heavy new deps.
- **D-11:** The "**forged write is rejected**" RLS test runs against a **real local Supabase via the Supabase CLI** (`supabase start`) in CI: apply migrations, assert a client-auth'd forged write to `wallet` is denied by RLS.
- **D-12:** First Vitest tests: **pathfinder** pure functions (`findPath`, `isWalkable`, `canBreakWall`) green (FND-04), plus the RLS forged-write test from D-11.

### Claude's Discretion
- **Anon-key rotation:** `.env.local` is **already untracked and not in git history** — **VERIFIED THIS SESSION** (`git ls-files .env.local` empty; `git log -- .env.local` empty; `*.local` is gitignored). FND-03's "untracked + key rotated" is therefore largely already satisfied. Rotation is an **optional precaution, not phase work** — Claude may skip it; only the user can rotate in the Supabase dashboard.
- Exact migration file layout, RPC signatures, GitHub Actions YAML structure, and the precise grep pattern for the secret scan are Claude's to choose at plan time.
- `service_role` key (if ever used) must live **only** in CI / Edge Function secrets — never a `VITE_*` var, never imported by `src/`.

### Deferred Ideas (OUT OF SCOPE)
- Anonymous/guest auth + guest→permanent account linking (rejected for v2.0).
- Full v2.0 schema (inventory/upgrades/matches/queue rich columns + RPCs) — phases 11–14.
- Fuller `src/lib/api/` services layer + `src/sim/` extraction — Phase 10.
- v1.0 profile data migration (ACCT-04) — Phase 11.
- Precautionary anon-key rotation — optional ops task for the user.
- `supabase-js` 2.99 → 2.108 bump — **NOT needed in Phase 9** (was motivated by anon-auth private channels, a Phase 14 concern).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **FND-01** | Authoritative tables (wallet, inventory, upgrades, match results) defined as committed Postgres migrations with RLS; clients read own rows, never write authoritative ones. | "Standard Stack" (Supabase CLI / migration layout) + "Code Examples: wallet + RLS migration" + "bare RLS shell" pattern. Wallet is the full exemplar (D-02); the other three are RLS shells (D-03). |
| **FND-02** | Every player gets a persistent real authenticated identity via email/password; no anonymous/guest play; `'guest'` literal removed. | "Email-Only Identity Refactor" pattern; exact code sites (`gameState.userId`, `LobbyScene.ts:341/425`, `GameScene.ts:607`); session-gating in `AuthScene.checkSession`. |
| **FND-03** | No privileged credentials in client bundle; service-role key server-side; `.env.local` gitignored; CI/scan guard fails build on bundled secret. | "Bundle Secret-Scan" pattern (grep `dist/` for service-role JWT `role":"service_role"` / `sb_secret_` markers, exit non-zero). `.env.local` already untracked (verified). |
| **FND-04** | Vitest harness runs extracted sim/economy logic in CI, replacing zero coverage. | "Vitest in Vite+strict-TS+Phaser" pattern; pathfinder pure-fn tests as first target; CI job structure. |
| **FND-05** | Scenes access persistent data only through a typed `src/lib/api/` layer — no scene writes authoritative tables directly. | "Thin `src/lib/api/` Seam" pattern; exact current `supabase.from()` call sites to replace (profile/account, rooms, wallet). |
</phase_requirements>

---

## Summary

Phase 9 is a de-risking foundation phase with **five independent-ish deliverables** that mostly do not depend on each other and can be planned as parallel-ish waves: (1) the committed `supabase/migrations` SQL with RLS — wallet end-to-end + three RLS shells + tightened `profiles`; (2) the email-only identity refactor that deletes `'guest'`; (3) the bundle secret-scan; (4) the Vitest harness; (5) the thin `src/lib/api/` seam. The single genuinely novel/risky piece is standing up a **real local Supabase stack inside GitHub Actions** to run the RLS forged-write test — everything else is well-trodden.

The security spine is the **"read via RLS, write via SECURITY DEFINER RPC"** pattern: the `wallet` table has RLS that lets a client `SELECT` only its own row and grants **no** `INSERT`/`UPDATE`/`DELETE` to client roles at all; the only way the balance changes is through a `SECURITY DEFINER` `credit_wallet` function that runs as its owner (bypassing RLS), hardened with `set search_path = ''` and fully-qualified table names, with `EXECUTE` granted only to the appropriate role. The forged-write test authenticates a real test user with the anon key and asserts a direct `UPDATE wallet SET balance = …` does **not** change the row. This exact shape is copy-pasted by every authoritative table in phases 11–14, so getting it right and reviewable now is the whole point.

**Primary recommendation:** Use the Supabase CLI (`supabase init`/`start`/`db reset`) for greenfield timestamped migrations; commit them under `supabase/migrations/`. In CI, run two Vitest **projects** — a fast `unit` project (node env, pathfinder, no network) and a separate `integration`/`rls` project (jsdom env, runs only after `supabase start` + `supabase db reset` brings up the local stack with migrations applied). Keep `supabase-js` pinned at 2.99.3. Do **not** add the `service_role` key to any `VITE_*` var; the RLS test reads the local service-role key from `supabase status` output (CI env), never from `src/`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Authoritative state (wallet balance, future currency/stats) | **Database (Postgres + RLS + SECURITY DEFINER RPC)** | — | RLS is the trust boundary; the anon key is public. Writes must be impossible from the client tier. |
| Authoritative writes (credit balance) | **Database (SECURITY DEFINER function)** | API/Edge (later) | Function runs as owner, bypasses RLS, is the sole writer. Client only *invokes* it via anon key under its own auth. |
| Identity / auth | **Supabase Auth (server)** | Client (`AuthScene` UI) | `auth.uid()` from the verified JWT is the only trusted identity; client-held `gameState.userId` is a convenience mirror, never authority. |
| Persistent-data access | **API seam (`src/lib/api/`)** | Client scenes | Scenes must not hold `supabase.from()` calls for authoritative tables; the seam is the single typed chokepoint (FND-05). |
| In-match simulation (combat, gold, base HP) | **Client** | — | Unchanged in Phase 9 — server-authority for *battle results* is Phase 14, not here. Phase 9 changes only the persistence boundary. |
| Secret containment | **Build/CI** | — | Vite inlines `VITE_*` into the bundle; the only enforcement that a privileged key never ships is a build-output scan in CI. |

---

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | **2.99.3 (keep pinned)** [VERIFIED: npm — latest is 2.108.1, but D defers the bump] | Client SDK; auth + PostgREST + RPC `.rpc()` | Already the project's single client. No new feature in Phase 9 needs the bump. |
| `supabase` (CLI) | **^2.106.0** [VERIFIED: npm registry 2026-06-12] | `init`/`start`/`db reset`/`migration new`; runs the local Postgres+Auth+PostgREST stack | Official tool for committed migrations + local stack in CI. Greenfield `supabase/` dir. |
| `vitest` | **^4.1.8** [VERIFIED: npm registry 2026-06-12] | Test runner; reuses Vite config; near-zero setup | Project is already Vite+ESM+TS; Vitest is the blessed pairing. |
| `supabase/setup-cli` (GH Action) | **`@v2`** (action latest 2.1.1) [CITED: github.com/supabase/setup-cli] | Installs the Supabase CLI on the GH runner | Official action; pins CLI via `with: version:`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vitest/coverage-v8` | **^4.1.8** [VERIFIED: npm 2026-06-12] | Coverage reporting | Optional for Phase 9; only if a coverage gate is wanted. Matches `vitest` major. |
| `jsdom` | latest 3.x | Test env for the RLS/integration project (provides `localStorage` that supabase-js auth touches) | **Required** for the Supabase-integration Vitest project (see Pitfall 4). Pure pathfinder tests do **not** need it. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest RLS test (supabase-js client) | `supabase test db` (pgTAP SQL) | pgTAP is the docs' default and runs *inside* Postgres, but D-11/D-12 explicitly want the forged-write test as a **supabase-js client** assertion in Vitest (proves the *client* path is denied, not just SQL policy). Keep Vitest; do **not** switch to pgTAP. |
| Custom `grep` secret-scan | `gitleaks` / `trufflehog` action | D-10 explicitly wants a custom grep over `dist/`, "no heavy new deps." A pre-built scanner is overkill and scans source not the built bundle. Keep the grep. |
| `setup-cli` action | `npx supabase ...` | `npx supabase` auto-downloads an unverified package each run; the official action is pinned and cached. Use the action. |
| Service-role key for the RLS test's *forged write* | anon key + signed-in test user | The forged write **must** use the anon key under a real user session (that's the threat being proven). The service-role client is used only for *fixtures/cleanup*, never for the forged-write assertion. |

**Installation:**
```bash
npm install -D vitest@^4 jsdom @vitest/coverage-v8@^4
# Supabase CLI: installed in CI via supabase/setup-cli@v2 (do NOT add to package.json deps);
# locally the dev installs it via their package manager or `supabase` binary.
```

**Version verification (run 2026-06-12):** `npm view @supabase/supabase-js version` → 2.108.1 (latest); project pins ^2.99.3 — **no bump**. `npm view vitest version` → 4.1.8. `npm view supabase version` → 2.106.0. `setup-cli` action latest tag 2.1.1, pin as `@v2`.

---

## Package Legitimacy Audit

> slopcheck was not available in this environment (`pip install slopcheck` not run; no network-package install attempted). Packages below are verified against the **correct ecosystem registry (npm)** by direct `npm view`, but per the package-name provenance rule they are tagged `[ASSUMED]` for legitimacy until a `checkpoint:human-verify` confirms — these are all extremely well-known, high-download, source-backed packages, so risk is low.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@supabase/supabase-js` | npm | mature | very high | github.com/supabase/supabase-js | n/a (unavailable) | Already a dependency — Approved |
| `vitest` | npm | mature | very high | github.com/vitest-dev/vitest | n/a | Approved [ASSUMED] |
| `@vitest/coverage-v8` | npm | mature | very high | github.com/vitest-dev/vitest | n/a | Approved (optional) [ASSUMED] |
| `jsdom` | npm | mature | very high | github.com/jsdom/jsdom | n/a | Approved [ASSUMED] |
| `supabase` (CLI) | npm | mature | high | github.com/supabase/cli | n/a | CI-only via action — Approved [ASSUMED] |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.
**Planner action:** Because slopcheck was unavailable, gate the *first install* of new devDeps (`vitest`, `jsdom`, `@vitest/coverage-v8`) behind one `checkpoint:human-verify` task. These are household-name packages; the checkpoint is a formality.

---

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────────┐
   Player (browser) ──────│  AuthScene (email/password sign-in ONLY)     │
                          │   - no anonymous path, no 'guest' literal    │
                          └───────────────┬─────────────────────────────┘
                                          │ verified JWT → gameState.userId (real UUID)
                                          ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  Scenes (Lobby / Game / Placement / Loadout)                          │
   │   NEVER call supabase.from() for authoritative tables (FND-05)        │
   └───────────────┬───────────────────────────────────────────────────────┘
                   │ typed calls only
                   ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  src/lib/api/   (thin seam — Phase 9 scope only)                      │
   │   accountClient  → profiles read/own-write                            │
   │   roomsClient    → rooms create/join                                  │
   │   walletClient   → read own balance (SELECT) + credit RPC (.rpc())    │
   └───────────────┬───────────────────────────────────────────────────────┘
                   │ supabase-js (ANON key, under user's JWT)
                   ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  Supabase (Postgres)                                                  │
   │   RLS GATE: auth.uid() = id                                           │
   │   ┌────────────┐   reads(own)    ┌───────────────────────────────┐   │
   │   │  wallet    │◄────────────────│ client SELECT own row only    │   │
   │   │  (RLS,     │   NO client     └───────────────────────────────┘   │
   │   │  no client │   INSERT/UPDATE/DELETE                              │
   │   │  writes)   │◄────writes────  credit_wallet()  [SECURITY DEFINER] │
   │   └────────────┘                 (sole writer; search_path='';        │
   │                                   atomic UPDATE…WHERE…RETURNING;       │
   │                                   idempotent ON CONFLICT)              │
   │   profiles (RLS tightened: UPDATE/INSERT gated auth.uid()=id;          │
   │             currency/stat cols not client-writable)                    │
   │   inventory / upgrades / match_results (bare RLS shells: id+owner)     │
   └──────────────────────────────────────────────────────────────────────┘

   service_role key: lives ONLY in CI env / Edge Function secrets.
   Build output (dist/) scanned in CI → must not contain a service-role JWT.
```

### Recommended Project Structure (net-new in Phase 9)
```
supabase/
├── config.toml                       # from `supabase init`
└── migrations/
    └── <timestamp>_foundations.sql   # wallet+RLS+credit RPC, profiles tighten, RLS shells
                                       # (one migration is fine for greenfield; see "Migration File Layout")
src/lib/api/
├── account.ts                        # profiles read/own-write (replaces AuthScene + GameScene direct calls)
├── rooms.ts                          # rooms create/join (replaces LobbyScene direct calls)
└── wallet.ts                         # read own balance + credit RPC wrapper
vitest.config.ts                      # two projects: unit (node) + rls (jsdom)
test/
├── unit/pathfinder.test.ts           # FND-04 first tests
└── rls/wallet-rls.test.ts            # D-11 forged-write rejection
.github/workflows/ci.yml              # tsc + vitest + secret-scan + supabase local stack
scripts/scan-bundle.sh               # (or .mjs) grep dist/ for service-role markers
.env.test.local                       # local-stack anon URL/key for the rls project (gitignored via *.local)
```

### Pattern 1: Read-via-RLS / Write-via-SECURITY-DEFINER-RPC (the exemplar)
**What:** The authoritative table grants clients **only** `SELECT` (scoped to their own row by RLS). It grants clients **no** write privilege. All mutation flows through a `SECURITY DEFINER` function that runs as its owner (bypassing RLS) and is the sole writer.
**When to use:** Every authoritative table from Phase 11 onward copies this. Phase 9 proves it with `wallet`.
**Key rules (each is a landmine if missed):**
- `set search_path = ''` on the function + fully-qualify every table (`public.wallet`) — prevents search-path injection where a caller shadows `wallet` with a malicious object. [CITED: supabase.com/docs/guides/database/functions]
- `revoke all on function ... from public; grant execute ... to authenticated;` — don't leave the RPC callable by `anon`/`public` unless intended.
- The function does an **atomic guarded** `UPDATE … WHERE … RETURNING` (Pitfall 5 shape) and is **idempotent** (Pitfall 4: `INSERT … ON CONFLICT DO NOTHING`-style) so a retry credits once.
- RLS must be **enabled** on the table AND there must be **no** permissive client write policy. RLS-on with no INSERT/UPDATE policy = all client writes denied by default (correct).

### Pattern 2: Bare RLS Shell (inventory / upgrades / match_results)
**What:** `create table … (id uuid pk default gen_random_uuid(), owner uuid references auth.users not null …); alter table … enable row level security;` + a single `select` policy `using (auth.uid() = owner)` and **no** write policy. Rich columns deferred to the owning phase.
**When to use:** Satisfies SC#1's literal "these tables exist with RLS" (D-03) without locking column shapes prematurely.

### Pattern 3: Thin `src/lib/api/` Seam
**What:** Each client module wraps the shared `supabase` singleton and exposes typed functions; scenes import the client, not `supabase.from()`.
```ts
// src/lib/api/wallet.ts
import { supabase } from '../supabase'

export async function getBalance(userId: string): Promise<number | null> {
  const { data } = await supabase
    .from('wallet').select('balance').eq('owner', userId).single<{ balance: number }>()
  return data?.balance ?? null
}

export async function creditWallet(amount: number, idemKey: string) {
  // sole-writer RPC — never a direct UPDATE
  return supabase.rpc('credit_wallet', { p_amount: amount, p_idempotency_key: idemKey })
}
```
**Convention note:** Project uses **no semicolons (ASI), single quotes, 2-space indent, `import type` for types** (`verbatimModuleSyntax: true`), named exports, extensionless relative imports. Match exactly.

### Anti-Patterns to Avoid
- **`USING (true)` policies** or **RLS disabled** on any table → the whole boundary is a no-op (Pitfall 6).
- **Direct client `UPDATE` of `wallet.balance`** anywhere → the RPC is the only writer.
- **`service_role` in a `VITE_*` var or any `src/` import** → Vite inlines it into the bundle (Pitfall 7). The RLS test gets the service-role key from the CI env / `supabase status`, in `test/`, never `src/`.
- **Trusting `gameState.userId` as authority** — it's a client mirror; the DB trusts only `auth.uid()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authoritative balance writes | Client-side `select balance; update balance` | `SECURITY DEFINER` RPC w/ atomic `UPDATE…WHERE…RETURNING` | Lost-update/negative-balance races + RLS bypass (Pitfalls 4–6). |
| Local Postgres + Auth + PostgREST for CI tests | Hand-rolled docker-compose | Supabase CLI `supabase start` | The CLI ships the exact same stack as prod; `db reset` applies migrations identically. |
| Migration ordering/timestamps | Manual SQL files numbered by hand | `supabase migration new <name>` | Generates the canonical `<UTC-timestamp>_name.sql` ordering the CLI applies lexicographically. |
| Test runner config | Custom ts-node + assert harness | Vitest (reuses Vite config) | Near-zero config; native ESM + strict TS; the project is already Vite. |
| Test env localStorage for supabase-js auth | Polyfilling `localStorage` in node | `environment: 'jsdom'` on the RLS project | supabase-js auth touches `localStorage`; jsdom provides it (Pitfall 4). |

**Key insight:** In this domain the database *is* the security architecture. Anything that moves authority into TypeScript (client or even a naive server read-modify-write) reintroduces the exact exploit class v2.0 exists to kill. The RPC+RLS+constraint triad is non-negotiable and well-supported by Postgres primitives — hand-rolling around it is strictly worse.

---

## Common Pitfalls

### Pitfall 1: RLS-denied write returns SUCCESS with zero rows — not an error
**What goes wrong:** A test (or app code) asserts `expect(error).toBeTruthy()` after a forged `UPDATE`/`SELECT`. But with RLS, a denied **UPDATE** returns `{ error: null }` and simply affects **0 rows**; a denied **SELECT** returns `{ error: null, data: [] }` (empty). No error is thrown.
**Why it happens:** PostgREST/RLS filters rows silently; it doesn't raise on "no matching rows you may write."
**How to avoid:** The forged-write test must assert the **row did not change** — re-`SELECT` (as service role) the balance and assert it's unchanged, and/or assert the update's returned `data` is empty. Never assert on `error`.
**Warning signs:** A "passing" RLS test that never actually re-reads the row.

### Pitfall 2: `service_role` key leaking into `dist/`
**What goes wrong:** Tempted to do a privileged write from code, someone adds `VITE_SUPABASE_SERVICE_ROLE_KEY`; Vite inlines every `VITE_*` var into the bundle → total RLS bypass shipped to every client.
**How to avoid:** Service-role key lives only in CI secrets / Edge Function env. The CI **bundle scan** is the backstop: grep `dist/**/*.js` for service-role JWT markers and fail non-zero. Privileged writes go through the `SECURITY DEFINER` RPC invoked with the **anon** key.
**Warning signs:** any `service_role` / `VITE_*SERVICE*` string under `src/`.

### Pitfall 3: `SECURITY DEFINER` without `set search_path = ''`
**What goes wrong:** A definer function with a mutable search_path can be tricked into calling a caller-planted `wallet` object (privilege escalation). Supabase's own linter flags this ("Function Search Path Mutable").
**How to avoid:** `... language plpgsql security definer set search_path = '' as $$ ... public.wallet ... $$;` — empty search_path + fully-qualified names everywhere. [CITED: supabase.com/docs/guides/database/functions]

### Pitfall 4: supabase-js auth needs `localStorage`; service & user clients share a session in jsdom
**What goes wrong:** In node, supabase-js auth has no `localStorage`; in jsdom, **both** a user client and a service-role client share the same jsdom storage, so signing in a test user silently strips the service client's privileges.
**How to avoid:** (a) Run the RLS project with `environment: 'jsdom'`. (b) Construct the **service-role client with `auth: { persistSession: false }`** so it never picks up the user session. (c) Run RLS tests **sequentially** (not parallel) — concurrent sign-ins + FK constraints conflict. Use a Vitest project with `fileParallelism: false` / `pool: 'forks'` single-thread, or `test.sequential`. [CITED: index.garden/supabase-vitest]
**Warning signs:** intermittent "row level security" failures that flip with test order; service-role fixtures suddenly denied.

### Pitfall 5: CI runs the RLS test before the stack is up / migrations applied
**What goes wrong:** `vitest run` starts before `supabase start` finishes or before `supabase db reset` applies migrations → connection refused or "relation wallet does not exist."
**How to avoid:** In the CI job, order steps: `setup-cli` → `supabase start` (blocks until healthy) → `supabase db reset` (applies all `migrations/`) → export keys via `supabase status -o env` → `vitest run --project rls`. The `unit` project (pathfinder) needs none of this and can run in a separate, faster job/step with no Supabase.
**Warning signs:** flaky "ECONNREFUSED" / "relation does not exist" only in CI.

### Pitfall 6: The docs default to `supabase test db` (pgTAP) — that's NOT this phase's test path
**What goes wrong:** Following the Supabase CI doc verbatim wires `supabase test db` (pgTAP SQL tests). D-11/D-12 want the forged-write proven as a **supabase-js client** assertion in **Vitest**, against the running local stack.
**How to avoid:** Use the docs only for the *stack-up* steps (`start` + `db reset`); run the assertion with `vitest run`, pointing the test's supabase-js client at the local stack URL/keys from `supabase status -o env`.

### Pitfall 7: Deleting `'guest'` breaks offline practice if not gated correctly
**What goes wrong:** Removing `gameState.userId ?? 'guest'` and making `userId` required can null-deref at `LobbyScene.ts:341/425` / `GameScene.ts:607` if any code path reaches them unauthenticated.
**How to avoid:** Make sign-in a hard precondition: `AuthScene` is the sole entry; `checkSession()` already populates `gameState.userId` from `session.user.id`. After D-04/D-06, **no scene is reachable without a session** — add an assertion/guard (`if (!gameState.userId) return to AuthScene`) at scene-entry rather than papering with `'guest'`. Practice mode still runs locally (no DB writes) but only *after* a real session exists. `GameScene.recordResult` (line 607) keeps its `if (!gameState.userId) return` guard but that branch is now unreachable, not a guest fallback. **Note:** the `rooms` table's `host_id`/`guest_id` columns are *named* guest/host (roles) — do not confuse the **role** `'guest'` with the deleted **identity literal** `'guest'`; only the identity literal goes.

### Pitfall 8: `types: ["vite/client"]` only, no vitest globals
**What goes wrong:** `tsconfig` has `"types": ["vite/client"]`; using Vitest globals (`describe`/`it`/`expect`) without import or without adding `"vitest/globals"` triggers `tsc`/`noUnusedLocals` style errors, and the CI `tsc` step fails.
**How to avoid:** Either import `{ describe, it, expect }` explicitly (cleanest, matches the no-magic-globals feel) **or** add `"vitest/globals"` to `tsconfig` types + `globals: true` in vitest config. Prefer explicit imports to avoid widening the prod `tsc` types. Ensure test files are either included by `tsc` (and pass strict) or excluded — decide deliberately so CI `tsc` stays green.

---

## Code Examples

### Wallet table + RLS + credit RPC (the exemplar migration)
```sql
-- Source pattern: PITFALLS.md (Pitfalls 4–6) + supabase.com/docs/guides/database/functions
-- supabase/migrations/<timestamp>_foundations.sql

create table public.wallet (
  owner   uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 0,
  constraint wallet_balance_nonneg check (balance >= 0)
);

alter table public.wallet enable row level security;

-- Client may read ONLY its own row. No INSERT/UPDATE/DELETE policy → all client writes denied.
create policy wallet_select_own
  on public.wallet for select
  using (auth.uid() = owner);

-- Idempotency ledger so a retried credit pays once (ECON-04 shape, proven here).
create table public.wallet_credits (
  idempotency_key text primary key,
  owner  uuid not null references auth.users (id) on delete cascade,
  amount bigint not null,
  created_at timestamptz not null default now()
);
alter table public.wallet_credits enable row level security;  -- no client policies → no client access

-- SOLE WRITER. SECURITY DEFINER + hardened search_path + fully-qualified names.
create function public.credit_wallet(p_amount bigint, p_idempotency_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner   uuid := auth.uid();
  v_balance bigint;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- idempotent: first writer wins; retries are no-ops
  insert into public.wallet_credits (idempotency_key, owner, amount)
  values (p_idempotency_key, v_owner, p_amount)
  on conflict (idempotency_key) do nothing;

  if not found then
    -- already credited under this key → return current balance unchanged
    select balance into v_balance from public.wallet where owner = v_owner;
    return v_balance;
  end if;

  -- ensure a row exists, then atomic guarded increment
  insert into public.wallet (owner, balance) values (v_owner, 0)
    on conflict (owner) do nothing;

  update public.wallet
     set balance = balance + p_amount
   where owner = v_owner
   returning balance into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.credit_wallet(bigint, text) from public;
grant  execute on function public.credit_wallet(bigint, text) to authenticated;
```

### Tighten `profiles` RLS (D-03)
```sql
-- profiles already exists from v1.0; tighten it, do NOT recreate (would strand data — see Open Questions).
alter table public.profiles enable row level security;

-- own-row read (keep public-ish read only if a feature needs it; default to own)
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
-- currency/stat columns (wins/losses/unlocked_units) are tightened in their owning phase (11);
-- Phase 9 only guarantees no cross-account writes. recordResult's direct stat write moves
-- behind src/lib/api/ (FND-05) but remains client-trusted until Phase 11/14.
```

### Bare RLS shells (D-03)
```sql
create table public.inventory     (id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id) on delete cascade);
create table public.upgrades      (id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id) on delete cascade);
create table public.match_results (id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id) on delete cascade);
alter table public.inventory     enable row level security;
alter table public.upgrades      enable row level security;
alter table public.match_results enable row level security;
create policy inventory_select_own     on public.inventory     for select using (auth.uid() = owner);
create policy upgrades_select_own      on public.upgrades      for select using (auth.uid() = owner);
create policy match_results_select_own on public.match_results for select using (auth.uid() = owner);
-- no write policies → no client writes
```

### Vitest config — two projects (unit fast / rls integration)
```ts
// vitest.config.ts
// Source: vitest.dev/guide/projects + index.garden/supabase-vitest gotchas
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // fast, pure, no network — pathfinder etc. (FND-04 first tests)
        test: { name: 'unit', environment: 'node', include: ['test/unit/**/*.test.ts'] },
      },
      {
        // RLS forged-write — needs a running local Supabase stack + jsdom for supabase-js auth
        test: {
          name: 'rls',
          environment: 'jsdom',
          include: ['test/rls/**/*.test.ts'],
          fileParallelism: false,   // run sequentially (Pitfall 4)
        },
      },
    ],
  },
})
```

### Forged-write RLS test (D-11) — assert row UNCHANGED, not error
```ts
// test/rls/wallet-rls.test.ts
import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.SUPABASE_URL!                 // from `supabase status -o env` in CI
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY! // CI env ONLY — never in src/

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } }) // fixtures/cleanup
let user: ReturnType<typeof createClient>

beforeAll(async () => {
  const email = `t_${Date.now()}@example.test`
  await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true })
  user = createClient(URL, ANON, { auth: { persistSession: true } })
  await user.auth.signInWithPassword({ email, password: 'pw-123456' })
  await user.rpc('credit_wallet', { p_amount: 100, p_idempotency_key: 'seed' }) // legit credit via RPC
})

it('rejects a forged direct UPDATE to wallet.balance', async () => {
  const { error } = await user.from('wallet').update({ balance: 999999 }).neq('owner', '00000000-0000-0000-0000-000000000000')
  expect(error).toBeNull()                       // RLS does NOT error — it silently affects 0 rows (Pitfall 1)
  const { data: u } = await user.auth.getUser()
  const { data } = await admin.from('wallet').select('balance').eq('owner', u.user!.id).single()
  expect(data!.balance).toBe(100)                // unchanged → forged write was denied
})

it('credits are idempotent', async () => {
  const { data: u } = await user.auth.getUser()
  await user.rpc('credit_wallet', { p_amount: 50, p_idempotency_key: 'k1' })
  await user.rpc('credit_wallet', { p_amount: 50, p_idempotency_key: 'k1' }) // retry
  const { data } = await admin.from('wallet').select('balance').eq('owner', u.user!.id).single()
  expect(data!.balance).toBe(150) // 100 seed + 50 once, not twice
})
```

### Bundle secret-scan (D-10)
```bash
# scripts/scan-bundle.sh — fail the build if a privileged secret is bundled (FND-03)
set -euo pipefail
DIST="dist"
# service-role JWTs decode to a payload containing "role":"service_role"; new keys use sb_secret_ prefix
PATTERNS='role"[[:space:]]*:[[:space:]]*"service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role'
if grep -REn --include='*.js' --include='*.html' "$PATTERNS" "$DIST"; then
  echo "::error::privileged secret marker found in built bundle"; exit 1
fi
echo "bundle secret-scan clean"
```
> Note: a service-role JWT's *literal* token won't contain the plaintext `"role":"service_role"` (it's base64 inside the JWT), so also scan for the **base64 fragment** of `{"role":"service_role"` and the modern `sb_secret_` key prefix. The strongest catch is the new opaque key format `sb_secret_…`. Plan should plant a fake secret in a test build to prove the scan fails (negative test).

### GitHub Actions CI (D-09/D-11) — skeleton
```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  typecheck-unit-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run --project unit
      - run: npm run build            # produces dist/ (needs VITE_ vars; use dummy anon values in CI)
      - run: bash scripts/scan-bundle.sh
  rls:
    runs-on: ubuntu-latest            # ubuntu runners have Docker preinstalled (required by supabase start)
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - uses: supabase/setup-cli@v2
        with: { version: 2.106.0 }
      - run: supabase start          # boots local Postgres+Auth+PostgREST (Docker)
      - run: supabase db reset        # applies supabase/migrations/*
      - run: supabase status -o env >> "$GITHUB_ENV"   # exports SUPABASE_URL/ANON/SERVICE_ROLE keys
      - run: npx vitest run --project rls
```
> Docker note: GitHub-hosted **ubuntu** runners have Docker preinstalled — `supabase start` works out of the box. Windows/macOS hosted runners do **not** reliably, so pin `runs-on: ubuntu-latest` for the `rls` job. `supabase status -o env` emits `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (verify exact var names in the CLI version; map them in the workflow). [CITED: supabase.com/docs/guides/local-development/testing/overview]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long JWT anon/service keys | New `sb_publishable_…` / `sb_secret_…` API keys (legacy JWT keys still work) | Supabase rolled out 2025 | Secret-scan should match **both** the legacy service-role JWT payload *and* the `sb_secret_` prefix. |
| `npx supabase ...` in CI | `supabase/setup-cli@v2` pinned action | current | Avoids re-downloading an unverified package each run. |
| Vitest `workspace` file | Vitest **`projects`** field in config (workspace deprecated) | Vitest 3+ | Use `test.projects`, not a separate `vitest.workspace.ts`. |
| pgTAP `supabase test db` as the only RLS test path | supabase-js client assertion in Vitest against local stack | per D-11/D-12 | Proves the *client* path is denied, not just SQL policy. |

**Deprecated/outdated:**
- supabase-js anonymous auth as the identity foundation: **explicitly dropped** (D-04). Don't plan it.
- The earlier research assumption that `.env.local` was committed: **stale** — verified untracked this session.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `supabase status -o env` exports vars named `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (exact names vary by CLI version). | CI skeleton | CI step can't find keys; fix is a one-line var rename — verify with `supabase status -o env` at plan/impl time. |
| A2 | New devDep packages (`vitest`, `jsdom`, `@vitest/coverage-v8`) are legitimate (slopcheck unavailable). | Package Audit | Low — household names; gate first install behind a checkpoint. |
| A3 | `profiles` table already exists in the live DB from v1.0 with columns `id, username, faction, unlocked_units, wins, losses`. | profiles tighten | If the migration `create table`s instead of `alter`s, it conflicts with the live table. Use `alter`/idempotent guards; confirm live schema. |
| A4 | ubuntu-hosted GH runner Docker is sufficient for `supabase start` with no extra setup. | CI skeleton | If a future runner image drops Docker, add a Docker setup step. HIGH confidence it's fine today. |
| A5 | A service-role JWT does not contain plaintext `"role":"service_role"` (it's base64), so the scan must also match the base64 fragment / `sb_secret_`. | Secret-scan | If the regex only matches plaintext, a leaked JWT slips through. Plan a *planted-secret negative test* to prove the scan catches a real key shape. |

---

## Open Questions

1. **Does the live `profiles` table need to be reconciled with committed migrations now, or is its current schema captured as a baseline migration?**
   - What we know: `profiles` exists in prod (v1.0); there are no migration files in the repo (greenfield `supabase/`).
   - What's unclear: whether Phase 9 should `supabase db pull` a baseline of the existing schema first, then add the foundations migration on top — so `supabase db reset` in CI reproduces prod faithfully.
   - Recommendation: **Yes** — first migration should baseline existing tables (`rooms`, `profiles`) via `supabase db pull` (or a hand-written baseline) so the local CI stack matches prod and `db reset` doesn't fail on missing `profiles`. Then the foundations migration adds wallet/RLS/shells/tightening. Flag for the planner; affects A3.

2. **Exact secret-key shapes to scan for** — does this Supabase project use legacy JWT keys or the new `sb_publishable_`/`sb_secret_` format?
   - Recommendation: scan for **all** of: `sb_secret_`, base64 fragment of `"role":"service_role"`, and the literal `SUPABASE_SERVICE_ROLE_KEY`. Confirm the project's key format from the Supabase dashboard at impl time. The anon/publishable key is *expected* in the bundle and must **not** be flagged.

3. **Should test files be in the `tsc --noEmit` include set?** Adding `test/**` to `tsc` catches type errors but requires Vitest types; excluding them keeps prod `tsc` lean.
   - Recommendation: keep prod `tsconfig` `include: ["src"]` as-is; add a `tsconfig.test.json` (or `vitest` typecheck) for test files so CI `tsc` over `src` stays unchanged and tests are still type-checked separately. Minor; planner's call.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + npm | All build/test | ✓ (project builds today) | per CI `node 20` | — |
| Docker (CI runner) | `supabase start` (RLS job) | ✓ on `ubuntu-latest` GH runners | preinstalled | Pin job to ubuntu; do not use win/mac hosted for this job |
| Supabase CLI | migrations + local stack | ✗ locally (install needed); ✓ in CI via setup-cli@v2 | 2.106.0 | `supabase/setup-cli@v2` in CI |
| Vitest / jsdom | test harness | ✗ (net-new devDeps) | 4.1.8 / latest | — (must install) |
| `.env.local` (anon URL+key) | dev build | ✓ present, untracked | — | CI build uses dummy `VITE_` values for the bundle scan |

**Missing dependencies with no fallback:** none blocking — all are installable (`vitest`, `jsdom`, Supabase CLI). The only environment-sensitive piece is Docker for `supabase start`, satisfied by `ubuntu-latest`.

**Missing dependencies with fallback:** Supabase CLI locally → use `setup-cli@v2` in CI; developers install the CLI binary per their OS.

---

## Validation Architecture

> nyquist_validation is enabled (config.json). This section defines what must be tested to prove Phase 9 works.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 (+ jsdom for the RLS project) |
| Config file | `vitest.config.ts` — **Wave 0** (does not exist yet) |
| Quick run command | `npx vitest run --project unit` (pathfinder; no network) |
| Full suite command | `npx vitest run` (unit + rls; rls needs local Supabase up) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-01 | Wallet RLS: client cannot forge a balance write | integration (RLS) | `npx vitest run --project rls` (`test/rls/wallet-rls.test.ts`) | ❌ Wave 0 |
| FND-01 | credit RPC is idempotent (retry credits once) | integration (RLS) | same file, idempotency case | ❌ Wave 0 |
| FND-01 | RLS shells exist + deny client writes (inventory/upgrades/match_results) | integration (RLS) | optional extra cases | ❌ Wave 0 |
| FND-02 | No `'guest'` literal remains; `userId` required UUID | unit/static | grep assertion in CI + `tsc` (type narrows `userId`) | ❌ Wave 0 |
| FND-03 | Built bundle contains no service-role secret | build-scan | `bash scripts/scan-bundle.sh` (+ planted-secret negative test) | ❌ Wave 0 |
| FND-04 | pathfinder pure fns correct (`findPath`/`isWalkable`/`canBreakWall`) | unit | `npx vitest run --project unit` (`test/unit/pathfinder.test.ts`) | ❌ Wave 0 |
| FND-05 | Scenes hold no direct `supabase.from()` for authoritative tables | static | grep assertion in CI (no `supabase.from('profiles'|'rooms'|'wallet')` in `src/scenes/`) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --project unit` (sub-second; pathfinder).
- **Per wave merge:** full suite incl. RLS against a local `supabase start` stack.
- **Phase gate:** CI green (tsc + unit + rls + bundle-scan) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.ts` — two projects (unit/node, rls/jsdom)
- [ ] `test/unit/pathfinder.test.ts` — covers FND-04
- [ ] `test/rls/wallet-rls.test.ts` — covers FND-01 (forged-write + idempotency)
- [ ] `scripts/scan-bundle.sh` (+ planted-secret negative test) — covers FND-03
- [ ] `.github/workflows/ci.yml` — tsc + unit + build+scan + rls jobs
- [ ] `supabase/` (`init`) + first migration — required before any RLS test can run
- [ ] Framework install: `npm install -D vitest@^4 jsdom @vitest/coverage-v8@^4`

---

## Security Domain

> security_enforcement is not disabled in config → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth email/password (existing `AuthScene`); identity = verified JWT `auth.uid()`, never client `gameState.userId`. |
| V3 Session Management | yes | supabase-js session (getSession/refresh); test clients use `persistSession` deliberately (Pitfall 4). |
| V4 Access Control | **yes (core)** | RLS `auth.uid() = owner/id`; deny-by-default (RLS on, no client write policy); `SECURITY DEFINER` sole-writer RPC with `EXECUTE` granted only to `authenticated`. |
| V5 Input Validation | yes | RPC validates `p_amount > 0`, authenticated caller; idempotency key uniqueness. |
| V6 Cryptography | yes (key handling) | Never bundle the service-role key; CI bundle scan; rely on platform key handling — never hand-roll. |
| V14 Configuration | yes | Committed migrations make the security boundary reviewable in PRs; secret never in `VITE_*`. |

### Known Threat Patterns for Supabase + Phaser client
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged balance/stat write from modified client | Tampering / Elevation | RLS denies client writes; only `SECURITY DEFINER` RPC mutates (proven by D-11 test). |
| Cross-account read/write (read/edit another user's row) | Information Disclosure / Tampering | RLS `using/with check (auth.uid() = owner)` on every table. |
| service_role key shipped in bundle → full RLS bypass | Elevation of Privilege | Key only in CI/Edge secrets; CI bundle scan fails build (FND-03). |
| search_path injection on the definer RPC | Elevation of Privilege | `set search_path = ''` + fully-qualified names (Pitfall 3). |
| Replay/double-credit | Tampering | Idempotency ledger + `ON CONFLICT DO NOTHING` (Pitfall 4 / ECON-04 shape). |
| Collision via `'guest'` literal identity | Spoofing | Delete `'guest'`; require real authenticated UUID (FND-02). |

---

## Sources

### Primary (HIGH confidence)
- Codebase (read this session): `src/lib/supabase.ts`, `src/lib/gameState.ts`, `src/lib/pathfinder.ts`, `src/scenes/LobbyScene.ts` (338–439), `src/scenes/GameScene.ts` (600–644), `src/scenes/AuthScene.ts` (260–289), `src/types/index.ts`, `tsconfig.json`, `package.json`, `.gitignore`, `.cursorrules`; `git ls-files/log .env.local` (verified untracked, no history).
- `.planning/research/PITFALLS.md` — RLS/SECURITY DEFINER/atomic-update/idempotency/service_role SQL shapes (Pitfalls 4–7).
- `.planning/codebase/{INTEGRATIONS,CONCERNS,TESTING,CONVENTIONS,STRUCTURE}.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` (Phase 9), `.planning/STATE.md`.
- npm registry (verified 2026-06-12): `@supabase/supabase-js` 2.108.1 (latest; project keeps 2.99.3), `vitest`/`@vitest/coverage-v8` 4.1.8, `supabase` CLI 2.106.0.
- Supabase docs: Database Functions (search_path hardening, grant execute) — https://supabase.com/docs/guides/database/functions ; Row Level Security — https://supabase.com/docs/guides/database/postgres/row-level-security ; Securing your API / hardening — https://supabase.com/docs/guides/database/hardening-data-api ; Local testing overview — https://supabase.com/docs/guides/local-development/testing/overview ; CI testing — https://supabase.com/docs/guides/deployment/ci/testing
- `supabase/setup-cli` action (latest 2.1.1, pin `@v2`) — https://github.com/supabase/setup-cli

### Secondary (MEDIUM confidence)
- Vitest config / projects / environment — https://vitest.dev/config/ , https://vitest.dev/guide/projects , https://vitest.dev/guide/environment
- RLS-with-Vitest gotchas (persistSession, shared jsdom session, sequential runs) — https://index.garden/supabase-vitest/ ; https://dev.to/davepar/testing-supabase-row-level-security-4h32

### Tertiary (LOW confidence — verify at impl time)
- Exact `supabase status -o env` variable names (A1) — confirm against the pinned CLI version.

---

## Metadata

**Confidence breakdown:**
- Standard stack / versions: HIGH — verified against npm registry this session.
- RLS + SECURITY DEFINER SQL shapes: HIGH — official Supabase docs + PITFALLS.md, cross-confirmed.
- Vitest setup + RLS-test gotchas: HIGH — official docs + a stack-specific post-mortem; the "denied write returns 0 rows not error" behavior is the key correctness item.
- Supabase-CLI-in-CI workflow: HIGH-MEDIUM — official CI/testing docs + setup-cli action; one deliberate deviation (Vitest assertion vs `supabase test db`) and one var-name assumption (A1) flagged.
- Email-only refactor: HIGH — exact code sites read this session; `'guest'` literal vs role-`'guest'` distinction noted.

**Research date:** 2026-06-12
**Valid until:** ~2026-07-12 (stable domain; Supabase CLI + Vitest move fast — re-verify versions and `supabase status -o env` var names if planning slips past a month).
