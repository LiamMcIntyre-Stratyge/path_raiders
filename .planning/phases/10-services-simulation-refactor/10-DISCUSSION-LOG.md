# Phase 10: Services & Simulation Refactor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 10-Services & Simulation Refactor
**Areas discussed:** Sim purity boundary, Determinism groundwork, Towers module shape, gameState reduction scope, Verification strategy

---

## Sim purity boundary

### Sim shape
| Option | Description | Selected |
|--------|-------------|----------|
| Pure sim, thin renderer | Framework-agnostic `src/sim/`: plain state, `step(state, inputs, dt)`, zero Phaser. GameScene syncs sprites from state. | ✓ |
| Extracted helpers, still Phaser-coupled | Move update logic to `src/sim/` but functions still operate on Phaser Unit Containers. Smaller diff, weaker determinism foundation. | |
| You decide / not sure | Recommend based on codebase + Phase 14 needs. | |

### Unit split
| Option | Description | Selected |
|--------|-------------|----------|
| Split: sim entity + sprite view | Plain `SimUnit` struct in sim + separate `UnitView` Phaser Container keyed by id. Fully testable. | ✓ |
| Keep Unit as view, mirror data in sim | Unit.ts stays the Container; sim holds parallel data. Less churn, two sources of state. | |
| You decide | — | |

### Render sync
| Option | Description | Selected |
|--------|-------------|----------|
| Reconcile state + events for one-shots | Renderer diffs sim entity list each frame; sim emits discrete events (death/wall_break) for SFX/animations. | ✓ |
| Events-only | Sim emits an event for every change; renderer purely event-driven. | |
| You decide | — | |

### Net boundary
| Option | Description | Selected |
|--------|-------------|----------|
| Sim is transport-free; scene owns networking | Sim consumes `inputs`, emits events; scene maps events↔Supabase broadcasts. Same wire protocol preserved. | ✓ |
| Keep broadcast calls inline for now | Leave networking woven into the update path; extract only combat/movement math. | |
| You decide | — | |

**User's choice:** Pure sim / thin renderer; split Unit into SimUnit + UnitView; reconcile + events; transport-free sim.
**Notes:** This area was chosen as the keystone — its outcomes shaped towers (D-09) and gameState (D-12).

---

## Determinism groundwork

### Det stance
| Option | Description | Selected |
|--------|-------------|----------|
| Build seams now, flip switch in Phase 14 | Structure for determinism (inject RNG, explicit dt/tick, intentional ordering) without changing outcomes now. | ✓ |
| Strict preserve, zero determinism work | Extract exactly as-is; Phase 14 does 100% of the untangling. | |
| You decide | — | |

### RNG seam
| Option | Description | Selected |
|--------|-------------|----------|
| Inject `rng()` dependency now | Sim takes `rng = Math.random`; identical today, seeded in Phase 14. Only sim RNG is practice-AI spawning. | ✓ |
| Leave Math.random inline | Keep inline; Phase 14 introduces the seam. | |
| You decide | — | |

### Stable sort
| Option | Description | Selected |
|--------|-------------|----------|
| Add id tiebreak now | Tiebreak equal-distance targets by id. Tie-only micro behavior change, order-stable + testable. | ✓ |
| Preserve current unstable sort | Zero behavior change; stable ordering deferred to Phase 14. | |
| You decide | — | |

### Timestep
| Option | Description | Selected |
|--------|-------------|----------|
| Keep variable dt, single explicit step signature | Preserve feel exactly; route dt through one `step(...)` so a fixed-timestep accumulator drops in later. | ✓ |
| Introduce fixed timestep now | Implement accumulator now; strongest setup but risks changing feel/outcomes. | |
| You decide | — | |

**User's choice:** Seams now, switch in Phase 14 — inject rng, id tiebreak (flagged micro-change), variable dt through one step signature; no fixed timestep yet.
**Notes:** Grounded in a grep confirming sim RNG is practice-AI only (`:434/:437`), combat has no RNG, and the unstable sort is at `:477`/`:535`.

---

## Towers module shape

### Tower shape
| Option | Description | Selected |
|--------|-------------|----------|
| Mirror the new split: data + view, logic in sim | `TowerData.ts` + `TowerView.ts` + `SimTower` logic in sim. Consistent with the unit split. | ✓ |
| Phaser Tower class like the OLD Unit.ts | Container holding data+render+logic together; inconsistent with the pure sim. | |
| You decide | — | |

### Tower data
| Option | Description | Selected |
|--------|-------------|----------|
| Static table now, levels deferred to Phase 12 | Flat TowerData (today's values); no per-level scaling — that's PROG-02. | ✓ |
| Add a level-ready shape now | Anticipate upgrade levels; pulls Phase 12 design forward. | |
| You decide | — | |

### Side helper
| Option | Description | Selected |
|--------|-------------|----------|
| Centralize the side/faction helper | Extract the one shared `resolveSide` helper; pure refactor, removes divergence risk in CONCERNS. | ✓ |
| Leave it — minimal touch | Extract towers mechanically only; leave duplication. | |
| You decide | — | |

**User's choice:** Mirror the new split; flat static TowerData; centralize the side/faction helper.
**Notes:** "Consistent with the Unit abstraction" interpreted as the *new* split, not the old Phaser Container.

---

## gameState reduction scope

### Battle state
| Option | Description | Selected |
|--------|-------------|----------|
| Sim world is source of truth; gameState stops holding live battle values | baseHp/gold move to sim world; HUD reads from sim; gameState may cache final result. | ✓ |
| Keep battle values mirrored in gameState too | Sim owns them but also writes back each frame; keeps the ad-hoc dual-write. | |
| You decide | — | |

### Persist scope
| Option | Description | Selected |
|--------|-------------|----------|
| Read-through cache via existing seam; defer authority to Phase 11 | gameState caches profile fields hydrated from `api/account`; keep current write path; no server-side authority moves. | ✓ |
| Start moving writes server-side now | Convert wins/unlock persistence to RPCs; pulls Phase 11/14 work forward, risks behavior change. | |
| You decide | — | |

### State shape
| Option | Description | Selected |
|--------|-------------|----------|
| Sim owns battle; gameState = session + profile cache, one object | No over-engineering; single documented cache object. | ✓ |
| Split into separate sessionState + profileState modules | Stricter boundaries, more files/churn. | |
| You decide | — | |

**User's choice:** Sim world owns live battle state; gameState = read-through profile cache + session context in one slimmed object; no new authority work.
**Notes:** Noted Phase 9 already routes profile reads/writes through `api/account` (D-07), so Phase 10's main gameState work is getting live battle state out.

---

## Verification strategy

### Test approach
| Option | Description | Selected |
|--------|-------------|----------|
| Characterization snapshot + targeted unit tests | Scripted scenarios (fixed dt, seeded rng, scripted deploys) → snapshot trace as regression lock + pinned-outcome unit tests. | ✓ |
| Targeted unit tests only | Just SC#2's literal combat/movement/win tests; no snapshot harness. | |
| You decide | — | |

### Parity gate
| Option | Description | Selected |
|--------|-------------|----------|
| Manual two-session playtest is the parity gate; tests are the regression net | Accept frame-identical diff isn't practical; confirm parity via manual host+guest playthrough. | ✓ |
| Attempt an automated old-vs-new comparison | Instrument old GameScene to emit a trace and diff; high effort, brittle. | |
| You decide | — | |

### Test scope (multi-select)
| Option | Description | Selected |
|--------|-------------|----------|
| Unit movement along waypoints | moveStep + path following to goal. | ✓ |
| Combat: two units fight, lower-HP dies | Nearest-target (new id tiebreak), cooldowns, takeDamage/death. | ✓ |
| Win by base-reach and by timer | BASE_REACH_DMG → base HP 0 → win; timer expiry → higher HP wins. | ✓ |
| Wall-break detour (pathfinding integration) | Unit re-routes on wall break / lane blockage; integrates pathfinder.ts. | ✓ |

**User's choice:** Snapshot + targeted unit tests; manual playtest as parity gate; all four test scenarios.
**Notes:** Snapshot harness is feasible precisely because the sim is pure (D-01) and can be driven with fixed dt + injected rng even before Phase 14's fixed-timestep switch.

---

## Claude's Discretion

- Exact module/file layout within `src/sim/`, `src/units/`, `src/towers/`; the precise
  `world`/`SimUnit`/`SimTower` field sets; event taxonomy; reconcile implementation;
  snapshot serialization; `inputs` modelling.
- Whether to extract the inline HUD/overlay HTML into modules in this phase (optional;
  only if behavior-preserving and minimal — the named target is sim/towers/state).

## Deferred Ideas

- Fixed-timestep loop, seeded-RNG activation, host/guest lockstep, signed match reports → Phase 14.
- Tower/unit upgrade levels + server-side balance config → Phase 12.
- Moving result/economy writes server-side (retire client `recordResult` authority) → Phase 11/14.
- HUD/overlay inline-HTML extraction → optional / out of named scope.
- O(n²) combat-scan optimization (spatial buckets) → not required for behavior-preserving extraction.
- Automated old-vs-new behavior diff → considered and rejected as impractical.
