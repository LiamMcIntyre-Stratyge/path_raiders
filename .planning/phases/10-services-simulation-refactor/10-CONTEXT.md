# Phase 10: Services & Simulation Refactor - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Decouple scenes from the `GameScene` monolith by extracting the battle loop into a
**standalone, framework-agnostic `src/sim/` simulation module**, promote towers into a
dedicated module consistent with the (newly split) Unit abstraction, and reduce
`gameState` to a session/battle read-through cache — **with no change to observable
gameplay**. This is a behavior-preserving de-risking refactor (BATTLE-02) that sets up
Phase 14's determinism/authority work.

**In scope (the four ROADMAP success criteria):**
1. Extract the battle loop from `GameScene` into a standalone `src/sim/` module — same
   battle, no player-visible behavior change.
2. Unit tests in the Phase 9 Vitest harness covering core combat / movement / win
   resolution (plus a characterization snapshot — see D-17).
3. Reduce `gameState` to a session/battle read-through cache; persistent fields read
   through the `src/lib/api/` services layer (the Phase 9 seam); live battle state moves
   into the sim world.
4. Promote towers out of the inline `GameScene` `TowerDef`/array into a dedicated module
   consistent with the Unit abstraction.

**Out of scope (later phases):**
- Fixed-timestep loop, seeded RNG *activation*, host/guest lockstep, signed match reports
  → **Phase 14** (this phase only builds the *seams*).
- Tower/unit upgrade levels and the server-side balance config → **Phase 12** (PROG-01/02).
- Server-authoritative result/economy writes (moving `recordResult` off the client) →
  **Phase 11 / Phase 14**. The write path stays as Phase 9 left it (through the seam).
- Any new gameplay, units, maps, or UI.
</domain>

<decisions>
## Implementation Decisions

### Sim purity & boundary (keystone)
- **D-01:** `src/sim/` is a **pure, framework-agnostic module** — plain TypeScript state
  (`world` struct with entity arrays) and a `step(world, inputs, dt, rng)` function that
  mutates/advances state and returns discrete **events**. **Zero Phaser imports, zero
  Supabase imports.** `GameScene` becomes a thin renderer that drives the sim each frame.
  Suggested shape: `src/sim/world.ts` (state), `src/sim/step.ts` (tick), `src/sim/combat.ts`
  (attack resolution), `src/sim/types.ts` (`SimUnit`, `SimTower`).
- **D-02:** **Split `Unit.ts`** — today `Unit extends Phaser.GameObjects.Container` holding
  both data and rendering. Separate a plain **`SimUnit` struct** (id, x, y, hp, waypoints,
  wpIdx, dir, laneSlot, attackCd, …) in `src/sim/` from a **`UnitView`** (Phaser Container /
  sprite + HP graphics) keyed by id in `src/units/`. The sim struct is the source of truth;
  the view renders it.
- **D-03:** **Renderer sync = reconcile + events.** Each frame the renderer diffs the sim
  entity list by id (create/move/remove views, update HP bars) for continuous state, AND
  consumes discrete events the sim emits (death, wall_break, base_hit) for one-shots
  (SFX, death animations, screen shake).
- **D-04:** **Sim is transport-free; the scene owns networking.** The sim consumes
  `inputs` (local + remote deploys as plain intents) and emits events; the scene/networking
  layer maps events ↔ Supabase broadcasts. The **same wire protocol is preserved**
  (`deploy`, `wall_break`, `base_hp`, `game_over`) — behavior-preserving, and it sets up
  Phase 14's report submission. The sim never imports `supabase`.

### Determinism groundwork — seams now, switch in Phase 14
- **D-05:** **Stance: build determinism *seams* now without changing outcomes.** Structure
  the extraction so Phase 14's determinism is a small diff. Do NOT activate determinism
  (no fixed timestep, no seeded play) in this phase — that risks violating SC#1.
- **D-06:** **Inject `rng`** as a dependency into the sim (`step(world, inputs, dt, rng = Math.random)`).
  The only sim RNG today is **practice-AI spawning** (`GameScene.updateAI` `:434/:437`);
  combat has no RNG. Behavior identical now; Phase 14 passes a seeded `mulberry32`.
- **D-07:** **Add a deterministic id-tiebreak** to the nearest-target sort (units `:477`,
  towers `:535`): `sort((a,b) => dist(a)-dist(b) || (a.id < b.id ? -1 : 1))`. This is a
  **flagged, intentional micro behavior-change** that only affects exact (sub-pixel)
  distance ties — effectively invisible — and makes target selection order-stable/testable.
- **D-08:** **Keep variable `dt`** (preserve today's feel exactly) but route all of it
  through the single `step(world, inputs, dt, rng)` entry point so a fixed-timestep
  accumulator drops in cleanly in Phase 14. No timestep change this phase.

### Towers module shape
- **D-09:** **Mirror the *new* split abstraction** (not the old Phaser-Container Unit):
  `src/towers/TowerData.ts` (static stats, mirrors `UnitData.ts`) + `src/towers/TowerView.ts`
  (Phaser rendering, mirrors `UnitView`) + **tower targeting/firing logic in `src/sim/`**
  as `SimTower` structs (towers are part of combat).
- **D-10:** **`TowerData` is a flat static table now** (today's values: range `6*CELL`,
  dmg `25`, cd `1400`ms). Do **not** model per-level upgrade scaling — that's PROG-02 /
  Phase 12. Avoids pulling economy decisions forward.
- **D-11:** **Centralize the duplicated side/faction-resolution helper** (currently
  reimplemented in `drawTowers` / `drawBasePlacements` / `updateAI`, per CONCERNS). Extract
  one pure helper (e.g. `resolveSide(role) -> { hostFaction, guestFaction, dir }`). Pure
  refactor, no behavior change; removes a divergence risk while we're touching this code.

### gameState reduction
- **D-12:** **Sim world is the source of truth for live battle state** — `hostBaseHp`,
  `guestBaseHp`, `gold` (and units/towers/walls) become fields on the sim `world`. The HUD
  reads them from the sim each frame. `gameState` **no longer carries live battle values**
  (it may cache a final result for the post-match screen).
- **D-13:** **Persistent profile fields = read-through cache via the existing seam.**
  `userId`, `username`, `unlockedUnits`, `wins`, `losses` are hydrated into `gameState`
  from `src/lib/api/account` (the Phase 9 seam). Keep the current write path
  (`recordResult` via the seam) **behavior-preserving** — do NOT move wins/unlock writes
  server-side (Phase 11/14 owns authority).
- **D-14:** **Single slimmed `gameState` object** (no over-splitting). After the refactor
  `gameState` holds session context (`roomId`, `role`, `faction`, `mapId`, `hostSlot`,
  `guestSlot`) + the read-through profile cache. Documented/treated as a cache, not the
  mutated source of truth for battle.

### Verification strategy
- **D-15:** **Characterization snapshot + targeted unit tests** in the Phase 9 Vitest
  harness. Drive the pure sim through scripted scenarios (fixed `dt` sequence, injected
  `rng`, scripted deploys), snapshot the resulting trace as a **regression lock**, AND
  assert specific pinned outcomes. Feasible precisely because the sim is pure (D-01).
- **D-16:** **Parity gate vs old behavior = the existing manual two-session playtest.** A
  frame-identical automated diff vs the old `GameScene` is not practical (Phaser
  entanglement + variable dt), so "no player-visible behavior change" is confirmed by the
  manual host+guest playthrough (the project's current verification method per TESTING.md).
  Unit tests are the *forward* regression net, not the old-vs-new proof. State this
  explicitly for the verifier/UAT.
- **D-17:** **Test scenario coverage** (all four selected): (a) unit movement along
  waypoints; (b) combat — two units fight, lower-HP dies (nearest-target w/ new id
  tiebreak, cooldowns, takeDamage/death); (c) win by base-reach AND by timer expiry;
  (d) wall-break detour integrating `pathfinder.ts` (already unit-tested in Phase 9).

### Claude's Discretion
- Exact file/module layout within `src/sim/`, `src/units/`, `src/towers/`; the precise
  `world`/`SimUnit`/`SimTower` field sets; the event type taxonomy; the renderer's
  reconcile implementation; snapshot serialization format; and how `inputs` are modelled
  are Claude's to choose at plan/implement time, consistent with D-01…D-17.
- Whether to extract HUD/overlay HTML builders into separate modules **in this phase** is
  optional/Claude's call — the inline-HTML anti-pattern (CONCERNS) is real, but the phase's
  named target is the sim/towers/state extraction, not the HUD. Keep any HUD touch
  behavior-preserving and minimal if done at all.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase / requirements anchors
- `.planning/ROADMAP.md` §"Phase 10: Services & Simulation Refactor" — goal + the 4 success
  criteria (the fixed scope anchor).
- `.planning/REQUIREMENTS.md` — **BATTLE-02** (the sole requirement this phase satisfies),
  plus **BATTLE-01/03/04** (Phase 14) for forward-awareness of what the determinism seams
  feed into.

### Architecture & current battle-loop code to extract
- `.planning/codebase/ARCHITECTURE.md` — system overview, the `GameScene.update` tick
  breakdown (gold/timer/AI/units/towers), the Unit/Tower/Map abstractions, the
  multiplayer/realtime sync model, and the two named anti-patterns (inline tower def;
  large multi-responsibility GameScene).
- `.planning/codebase/STRUCTURE.md` — directory layout; note empty `src/towers/` (to be
  populated) and where new modules belong.
- `.planning/codebase/CONCERNS.md` — the exact debt this phase touches: monolithic
  GameScene, duplicated faction/side mapping (`:243-247/:296-300/:318`), O(n²) combat
  scanning, independent-simulation desync, the magic-number balance values, and the
  recently-fixed instant-death pathfinding fragility.
- `.planning/codebase/TESTING.md` — confirms Vitest as the harness and lists the
  highest-value pure-logic test targets (pathfinder, map builders, Unit math).

### Prior-phase decisions this phase extends
- `.planning/phases/09-backend-foundations-integrity/09-CONTEXT.md` — esp. **D-07/D-08**:
  the thin `src/lib/api/` seam (account/rooms/wallet) already exists and Phase 9 explicitly
  deferred "the fuller services layer + sim extraction" to **this phase**. `gameState`
  persistent reads already route through `api/account` after Phase 9.

### Primary source files this phase edits
- `src/scenes/GameScene.ts` — battle loop to extract (update `:385`, updateUnits `:452`,
  updateTowers `:525`, towers `:31/:171`, broadcast handlers `:856`, recordResult `:606`).
- `src/units/Unit.ts` — split into `SimUnit` + `UnitView`.
- `src/units/UnitData.ts` — pattern reference for `TowerData.ts`.
- `src/lib/gameState.ts` — slim to session + profile cache.
- `src/lib/pathfinder.ts` — consumed by the sim; already unit-tested (Phase 9).
- `src/types/index.ts` — `GameStateType` and shared contracts.
- `src/towers/` (empty) — new `TowerData.ts` + `TowerView.ts`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 9 `src/lib/api/` seam** (account/rooms/wallet): the sim/state refactor extends
  this — persistent fields read through `api/account`, no new client persistence work.
- **Phase 9 Vitest harness**: the test home for D-15/D-17; `pathfinder.ts` is already
  covered there (reused by the wall-break detour scenario).
- **`UnitData.ts`**: the structural template `TowerData.ts` mirrors.
- **`pathfinder.ts`**: pure/deterministic already — the sim calls it for movement/detours.

### Established Patterns
- Scenes are linear Phaser states with a `gameState` singleton + `init(data)` handoff;
  `GameScene.init` already reconciles passed `data` vs `gameState` then writes back —
  the slimmed cache (D-12/D-14) must preserve that handoff.
- Battle state currently lives as private `GameScene` fields mirrored into both `gameState`
  and the Supabase channel — D-12 makes the **sim world** the single source instead.
- Strict TS + Vite + ESM → Vitest needs near-zero config (per TESTING.md).

### Integration Points
- Sim ↔ renderer: `GameScene.update(dt)` → `step(world, inputs, dt, rng)` → reconcile +
  play events (D-03).
- Sim ↔ network: scene maps Supabase broadcasts to sim `inputs` and sim events to
  broadcasts, preserving the existing channels/events (D-04).
- Sim ↔ persistence: only via the HUD/result read-through cache (`api/account`); the sim
  itself is persistence-free.
</code_context>

<specifics>
## Specific Ideas

- The pure-sim + injected-`rng` + single-`step` shape (D-01/D-06/D-08) is deliberately the
  **Phase 14-ready** shape: Phase 14 swaps `Math.random` → `mulberry32(seed)` and wraps the
  step call in a fixed-timestep accumulator at the *same call sites*, then submits the
  signed report — without re-architecting.
- The id-tiebreak (D-07) is the one knowingly-accepted micro behavior change; everything
  else is strictly behavior-preserving, gated by the manual two-session playtest (D-16).
- Towers' *logic* in the sim but *data+view* in `src/towers/` (D-09) is the exact mirror of
  the unit split — "consistent with the Unit abstraction" means the **new** split, not the
  old Container.
</specifics>

<deferred>
## Deferred Ideas

- **Fixed-timestep loop, seeded-RNG activation, host/guest lockstep, signed match reports**
  → **Phase 14** (BATTLE-01/03/04). This phase builds only the seams (D-05…D-08, D-04).
- **Tower & unit upgrade levels + server-side balance config** → **Phase 12** (PROG-01/02).
  `TowerData` stays flat now (D-10).
- **Moving result/economy writes server-side** (retiring client `recordResult` authority)
  → **Phase 11 / Phase 14**. Write path stays as Phase 9 left it (D-13).
- **Extracting HUD/overlay inline HTML/CSS into modules** (CONCERNS anti-pattern) —
  optional/out of the named scope; only if behavior-preserving and minimal (Discretion).
- **O(n²) combat scan optimization** (spatial buckets) — a real perf concern in CONCERNS,
  but not required for a behavior-preserving extraction; revisit if/when load demands it.
- **Automated old-vs-new behavior diff** — considered and rejected as impractical for this
  phase (D-16); manual playtest is the parity gate.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</deferred>

---

*Phase: 10-Services & Simulation Refactor*
*Context gathered: 2026-06-12*
