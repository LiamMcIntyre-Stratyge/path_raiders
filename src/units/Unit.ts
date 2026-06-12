/**
 * The old `Unit extends Phaser.GameObjects.Container` class was split in Plan 03
 * (D-02): its data half became the pure `SimUnit` struct in `src/sim/`, and its
 * Phaser render half became `src/units/UnitView.ts`. The two combat constants it
 * used to own now live canonically in the sim (`src/sim/types.ts`), since the
 * sim cannot import this Phaser-bound module.
 *
 * This file remains only as a thin re-export so any lingering importer of
 * `COMBAT_RANGE`/`BASE_REACH_DMG` keeps compiling. New code should import these
 * from `src/sim/types.ts` directly.
 */
export { COMBAT_RANGE, BASE_REACH_DMG } from '../sim/types'
