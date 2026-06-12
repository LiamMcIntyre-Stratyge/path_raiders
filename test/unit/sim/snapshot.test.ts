import { describe, expect, it } from 'vitest'
import { step } from '../../../src/sim/step'
import type { SimInput, SimWorld } from '../../../src/sim/types'
import { makeWorld } from './_helpers'

// D-15: characterization snapshot — a deterministic scripted ~10s battle whose
// final world state is locked as a forward regression net. Any unintended change
// to the sim's combat/movement/timer math shifts the serialized trace and fails
// this test. To intentionally re-lock after a deliberate sim change, run:
//   npx vitest run --update-snapshots
//
// Determinism inputs (RESEARCH.md D-15 / Pitfall 2):
//   - fixed rng `() => 0.5` (only the practice-AI spawner reads it; off here)
//   - fixed dt of 16ms, ~625 steps (~10s)
//   - a scripted, documented deploy sequence at fixed tick offsets
//
// world.wallHP is a Map → JSON.stringify drops it. Serialize via a replacer that
// converts any Map to a sorted entries array so the trace is stable and ordered.
function serializeWorld(world: SimWorld): string {
  return JSON.stringify(
    world,
    (_key, val) => (val instanceof Map ? Array.from(val.entries()).sort() : val),
    0,
  )
}

describe('characterization snapshot (D-15)', () => {
  it('locks a deterministic 10s scripted battle trace', () => {
    // All-path base so units always have a route; no walls → wallHP stays empty.
    const world = makeWorld()
    const fixedRng = () => 0.5

    // Scripted deploys: a host scout at tick 10, a guest vine-crawler at tick 20,
    // a second host scout at tick 120. Fixed unit ids + slots → fully reproducible.
    const scripted: Record<number, SimInput[]> = {
      10: [{ type: 'deploy', unitId: 'scout_drone', slot: 0, role: 'host' }],
      20: [{ type: 'deploy', unitId: 'vine_crawler', slot: 0, role: 'guest' }],
      120: [{ type: 'deploy', unitId: 'scout_drone', slot: 1, role: 'host' }],
    }

    const DT = 16
    const STEPS = 625 // 625 * 16ms = 10000ms
    for (let tick = 0; tick < STEPS; tick++) {
      const inputs = scripted[tick] ?? []
      step(world, inputs, DT, fixedRng)
    }

    expect(serializeWorld(world)).toMatchSnapshot()
  })
})
