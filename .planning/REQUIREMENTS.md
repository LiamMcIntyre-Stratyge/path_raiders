# Requirements — Milestone v2.0: Persistent Game Foundations

**Authority model (confirmed):** Option A — Supabase-only result validation. Clients
simulate; the server re-derives/bounds-checks a submitted match report before settling
rewards, progression, and rating. Colyseus is the documented upgrade path, out of scope now.

**Scope note:** This milestone includes the P1 foundation *and* the four competitive
"should-have" systems (hidden MMR, per-unit upgrades, visible rank, match history) the
user pulled into scope. UI/UX and character art are owned by the user (Claude designs);
requirements below are systems/logic, and UI tasks mean *integrating* those designs.

---

## v2.0 Requirements

### Backend Foundations & Integrity (FND)
- [ ] **FND-01**: Authoritative tables (wallet, inventory, upgrades, match results) are defined as committed Postgres migrations with Row Level Security so clients can read their own rows but never write authoritative ones.
- [ ] **FND-02**: Every player — including guests — gets a persistent real account identity (Supabase anonymous auth → stable UUID), replacing collision-prone guest ids.
- [ ] **FND-03**: No privileged credentials ship in the client bundle (service-role key stays server-side; `.env.local` is gitignored; a CI/scan guard fails the build if a secret is bundled).
- [ ] **FND-04**: A test harness (Vitest) runs the extracted simulation and economy logic, executable in CI, replacing today's zero automated coverage.
- [ ] **FND-05**: Scenes access persistent data only through a typed services/API layer (`src/lib/api/`) — no scene writes directly to authoritative tables.

### Accounts & Profiles (ACCT)
- [ ] **ACCT-01**: A player's account and progress persist across logout and app restart.
- [ ] **ACCT-02**: A player can set and view a display name on their profile.
- [ ] **ACCT-03**: A player can view their lifetime stats (wins/losses, currency balance, rank) on their profile.
- [ ] **ACCT-04**: Existing v1.0 accounts (wins, unlocked units) are migrated forward with no data loss.

### Economy & Unlocks (ECON)
- [ ] **ECON-01**: A player earns a persistent soft currency for completing a battle, distinct from in-match gold.
- [ ] **ECON-02**: Currency rewards are computed and granted server-side from a validated match result, never client-supplied.
- [ ] **ECON-03**: A player can spend currency to unlock the three non-starter units (Assault Bot, Thorn Beast, Elementalist).
- [ ] **ECON-04**: Currency grants are idempotent and balances can never go negative or be double-spent (server-enforced atomic writes).
- [ ] **ECON-05**: A player's wallet balance and owned units are server truth — readable by the client, never client-writable.

### Progression & Upgrades (PROG)
- [ ] **PROG-01**: A player can spend currency to upgrade individual units to higher levels that persist between matches.
- [ ] **PROG-02**: A player can upgrade tower / faction power that persists between matches.
- [ ] **PROG-03**: Unit and tower stats used in battle reflect the player's persisted upgrade levels for both participants.
- [ ] **PROG-04**: Upgrade costs and effects come from a server-side balance config (not client-editable), and progression is stored as levels (not denormalized stats) so balance can be changed safely.

### Matchmaking & Lobbies (MM)
- [ ] **MM-01**: A player can press a Quick Match button and be matched with an opponent automatically.
- [ ] **MM-02**: Matchmaking pairs players by a hidden skill rating (MMR) within a range that widens the longer they wait.
- [ ] **MM-03**: A player can still challenge a friend directly via a room code (existing path preserved).
- [ ] **MM-04**: Matchmaking is race-safe — no double-joins, no players matched to two opponents, no ghost matches (atomic queue pop).
- [ ] **MM-05**: Each match has a server-tracked lifecycle (queued → active → completed/abandoned) with server-side timeouts that clean up abandoned matches.

### Ranking (RANK)
- [ ] **RANK-01**: A player has a visible rank/trophy rating, derived server-side from match results, that rises on wins and falls on losses.
- [ ] **RANK-02**: A player can see their current rank/rating on their profile and post-match summary.

### Battle Authority — Result Validation (BATTLE)
- [ ] **BATTLE-01**: The battle simulation is deterministic (fixed timestep, seeded RNG, stable entity ordering) so identical inputs produce identical outcomes.
- [ ] **BATTLE-02**: The battle loop is extracted from `GameScene` into a standalone, unit-tested simulation module (`src/sim/`).
- [ ] **BATTLE-03**: On match end, each client submits a signed match report (winner, final base HP, duration, deploy log, seed).
- [ ] **BATTLE-04**: The server validates and bounds-checks submitted reports and only then settles result, rewards, progression, and rating; mismatched or implausible reports are rejected.

### Match History (HIST)
- [ ] **HIST-01**: A player can view a list of their recent matches showing opponent, result, and rewards earned.

---

## Future Requirements (deferred to v2.x)
- Reconnect-into-match (resume an in-progress battle after a drop) — lifecycle-heavy; revisit once Phase 13/14 lifecycle exists.
- Global leaderboards / ranked ladder / seasons — needs RANK to be live and stable first.
- Engagement-tuned matchmaking — start with honest fairness.

## Out of Scope (this milestone — with reasons)
- **Async base-building & raids on offline players** — the long-term core, but a separate game model; deferred to its own milestone once these foundations exist.
- **Clans / guilds / social graph** — depth that depends on a stable account/identity layer; later milestone.
- **Hard currency / IAP / gacha / cosmetics** — monetization, not foundation; deliberately excluded.
- **Net-new UI/UX design & character art** — owned by the user in Claude designs; this milestone integrates designs, it does not create them.
- **Dedicated Colyseus game-server** — viable upgrade path (research Option B), unnecessary while Option A retires the trust/desync debt at lower risk.

---

## Traceability

Every v2.0 requirement maps to exactly one phase. Coverage: 30/30.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 9 — Backend Foundations & Integrity | Pending |
| FND-02 | Phase 9 — Backend Foundations & Integrity | Pending |
| FND-03 | Phase 9 — Backend Foundations & Integrity | Pending |
| FND-04 | Phase 9 — Backend Foundations & Integrity | Pending |
| FND-05 | Phase 9 — Backend Foundations & Integrity | Pending |
| BATTLE-02 | Phase 10 — Services & Simulation Refactor | Pending |
| ACCT-01 | Phase 11 — Accounts & Economy | Pending |
| ACCT-02 | Phase 11 — Accounts & Economy | Pending |
| ACCT-03 | Phase 11 — Accounts & Economy | Pending |
| ACCT-04 | Phase 11 — Accounts & Economy | Pending |
| ECON-01 | Phase 11 — Accounts & Economy | Pending |
| ECON-02 | Phase 11 — Accounts & Economy | Pending |
| ECON-03 | Phase 11 — Accounts & Economy | Pending |
| ECON-04 | Phase 11 — Accounts & Economy | Pending |
| ECON-05 | Phase 11 — Accounts & Economy | Pending |
| PROG-01 | Phase 12 — Progression & Upgrades | Pending |
| PROG-02 | Phase 12 — Progression & Upgrades | Pending |
| PROG-03 | Phase 12 — Progression & Upgrades | Pending |
| PROG-04 | Phase 12 — Progression & Upgrades | Pending |
| MM-01 | Phase 13 — Matchmaking & Ranking | Pending |
| MM-02 | Phase 13 — Matchmaking & Ranking | Pending |
| MM-03 | Phase 13 — Matchmaking & Ranking | Pending |
| MM-04 | Phase 13 — Matchmaking & Ranking | Pending |
| MM-05 | Phase 13 — Matchmaking & Ranking | Pending |
| RANK-01 | Phase 13 — Matchmaking & Ranking | Pending |
| RANK-02 | Phase 13 — Matchmaking & Ranking | Pending |
| HIST-01 | Phase 13 — Matchmaking & Ranking | Pending |
| BATTLE-01 | Phase 14 — Battle Authority & Result Validation | Pending |
| BATTLE-03 | Phase 14 — Battle Authority & Result Validation | Pending |
| BATTLE-04 | Phase 14 — Battle Authority & Result Validation | Pending |

---
*Defined: 2026-06-12 for milestone v2.0*
*Traceability mapped: 2026-06-12*
