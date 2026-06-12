---
phase: 9
slug: 09-backend-foundations-integrity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 09-RESEARCH.md §"Validation Architecture". Task IDs are filled in by the planner.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (+ jsdom for the RLS project) |
| **Config file** | `vitest.config.ts` — **Wave 0** (does not exist yet) |
| **Quick run command** | `npx vitest run --project unit` (pathfinder; no network) |
| **Full suite command** | `npx vitest run` (unit + rls; rls needs local Supabase up via `supabase start`) |
| **Estimated runtime** | unit ~1s; full (with local Supabase) ~30–60s |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project unit` (sub-second; pathfinder).
- **After every plan wave:** Run full suite incl. RLS against a local `supabase start` stack.
- **Before `/gsd:verify-work`:** CI green (tsc + unit + rls + bundle-scan) — full suite must pass.
- **Max feedback latency:** ~2s for unit; RLS gated at wave merge.

---

## Per-Task Verification Map

> Requirement→test map from research. Plan/Wave/Task-ID columns populated by the planner once PLAN.md files exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | FND-01 | T-forged-write | RLS denies a client forging a wallet balance write (re-read row as service-role, assert unchanged) | integration (RLS) | `npx vitest run --project rls` (`test/rls/wallet-rls.test.ts`) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-01 | T-double-credit | credit RPC is idempotent (retry credits once) | integration (RLS) | same file, idempotency case | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-01 | T-cross-account | RLS shells deny client writes (inventory/upgrades/match_results) | integration (RLS) | optional extra cases | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-02 | T-guest-collision | No `'guest'` identity literal remains; `userId` is a required UUID | unit/static | grep assertion in CI + `tsc` (type narrows `userId`) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-03 | T-secret-bundled | Built bundle contains no service-role secret (+ planted-secret negative test) | build-scan | `bash scripts/scan-bundle.sh` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-04 | — | pathfinder pure fns correct (`findPath`/`isWalkable`/`canBreakWall`) | unit | `npx vitest run --project unit` (`test/unit/pathfinder.test.ts`) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-05 | T-direct-write | Scenes hold no direct `supabase.from()` for authoritative tables | static | grep assertion in CI (no `supabase.from('profiles'\|'rooms'\|'wallet')` in `src/scenes/`) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — two projects (unit/node, rls/jsdom)
- [ ] `test/unit/pathfinder.test.ts` — stubs for FND-04
- [ ] `test/rls/wallet-rls.test.ts` — stubs for FND-01 (forged-write + idempotency)
- [ ] `scripts/scan-bundle.sh` (+ planted-secret negative test) — FND-03
- [ ] `.github/workflows/ci.yml` — tsc + unit + build+scan + rls jobs
- [ ] `supabase/` (`supabase init`) + first migration — required before any RLS test can run
- [ ] Framework install: `npm install -D vitest@^4 jsdom @vitest/coverage-v8@^4`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Anon-key rotation in Supabase dashboard | FND-03 (optional) | Claude cannot access the Supabase dashboard; `.env.local` already untracked with no git history, so rotation is an optional precaution, not phase work | User optionally rotates the anon key in the Supabase dashboard |

*All required phase behaviors have automated verification; the only manual item is the optional anon-key rotation.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s (unit)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
