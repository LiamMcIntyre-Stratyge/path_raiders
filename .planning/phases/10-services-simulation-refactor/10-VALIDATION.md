---
phase: 10
slug: services-simulation-refactor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (Phase 9 harness) |
| **Config file** | `vitest.config.ts` + `tsconfig.test.json` |
| **Quick run command** | `npx vitest run test/unit/sim` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/unit/sim`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | BATTLE-02 | — | N/A (behavior-preserving refactor) | unit | `npx vitest run test/unit/sim` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner: populate one row per task; the pure-sim scenarios (D-15/D-17) — movement, combat death, win-by-base-reach, win-by-timer, wall-break detour, characterization snapshot — are the automated forward regression net.*

---

## Wave 0 Requirements

- [ ] `test/unit/sim/` — directory + scenario harness for the pure sim
- [ ] Characterization snapshot fixture (scripted dt/rng/deploys → trace lock, per D-15)

*Existing Phase 9 vitest infrastructure (config, tsconfig.test.json, pathfinder tests) covers harness setup — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "No player-visible behavior change" parity gate | BATTLE-02 | Frame-identical automated diff vs old GameScene is impractical (Phaser entanglement + variable dt) — D-16 | Manual host+guest two-session playtest per TESTING.md; confirm same battle outcomes/feel |

*Unit tests are the forward regression net, not the old-vs-new proof (D-16).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
