import Phaser from 'phaser'
import type { UnitDefinition } from '../types'
import type { SimUnit } from '../sim/types'

const HP_W = 40
const HP_H = 5
const HP_Y = -32

/**
 * The Phaser render-half of a unit (D-02). Holds NO simulation state — all
 * battle data (hp, cooldowns, pathing, movement) lives on the
 * `SimUnit` struct in `src/sim/`. A UnitView is keyed by `SimUnit.id` and the
 * scene reconciles views by id each frame (D-03), calling `syncFrom(u)` for
 * live units and `playDeathAnimation()` when a unit's id vanishes from the
 * world's live set.
 */
export class UnitView extends Phaser.GameObjects.Container {
  readonly id: string
  readonly def: UnitDefinition
  readonly laneSlot: number
  readonly dir: 1 | -1

  private hpGfx!: Phaser.GameObjects.Graphics
  private _lastHp = -1

  constructor(
    scene: Phaser.Scene,
    id: string,
    def: UnitDefinition,
    laneSlot: number,
    dir: 1 | -1,
  ) {
    // Initial position is set by the first syncFrom(); start at origin.
    super(scene, 0, 0)
    this.id       = id
    this.def      = def
    this.laneSlot = laneSlot
    this.dir      = dir

    const img = scene.add.image(0, 0, `${def.id}_token`)
    img.setDisplaySize(36, 36)
    if (dir === 1) img.setFlipY(true)
    this.add(img)

    this.hpGfx = scene.add.graphics()
    this.add(this.hpGfx)
    this.drawHP(def.hp, def.hp)

    scene.add.existing(this)
    this.setDepth(10)
  }

  /**
   * Continuous reconcile (D-03): copy the SimUnit's position into the Phaser
   * Container and redraw the HP bar only when hp changed (flash on damage).
   */
  syncFrom(u: SimUnit) {
    this.x = u.x
    this.y = u.y
    if (u.hp !== this._lastHp) {
      if (this._lastHp >= 0 && u.hp < this._lastHp) this.flashHit()
      this._lastHp = u.hp
      this.drawHP(u.hp, u.maxHp)
    }
  }

  flashHit() {
    const img = this.list[0] as Phaser.GameObjects.Image
    if (!img) return
    img.setTint(0xff4444)
    this.scene.time.delayedCall(120, () => { if (img.scene) img.clearTint() })
  }

  // Pop-in animation on deploy
  popIn() {
    this.setScale(0)
    this.scene.tweens.add({
      targets: this, scaleX: 1, scaleY: 1,
      duration: 220, ease: 'Back.Out',
    })
  }

  /**
   * The death one-shot (D-03), driven by the unit_died event / reconcile prune.
   * Renamed from the old private `kill()` (Unit.ts:114-144): explosion burst +
   * fade/scale tween, then destroy.
   */
  playDeathAnimation() {
    const g = this.scene.add.graphics().setDepth(20)
    const ox = this.x, oy = this.y
    const faction = this.def.faction
    const burst   = faction === 'machines' ? 0x4499ff
                  : faction === 'plants'   ? 0x44dd66
                  :                          0xaa55ff
    this.scene.tweens.add({
      targets: { r: 4, alpha: 0.9 },
      r: 28, alpha: 0,
      duration: 260,
      ease: 'Quad.Out',
      onUpdate: (_tw, obj: { r: number; alpha: number }) => {
        g.clear()
        g.fillStyle(burst, obj.alpha)
        g.fillCircle(ox, oy, obj.r)
        g.fillStyle(0xffffff, obj.alpha * 0.6)
        g.fillCircle(ox, oy, obj.r * 0.45)
      },
      onComplete: () => { g.destroy() },
    })
    // Fade + scale out the unit
    this.scene.tweens.add({
      targets: this,
      alpha: 0, scaleX: 1.4, scaleY: 1.4,
      duration: 230,
      onComplete: () => { if (this.scene) this.destroy() },
    })
  }

  private drawHP(hp: number, maxHp: number) {
    this.hpGfx.clear()
    const x = -HP_W / 2, y = HP_Y
    this.hpGfx.fillStyle(0x000000, 0.75)
    this.hpGfx.fillRect(x - 1, y - 1, HP_W + 2, HP_H + 2)
    const pct   = hp / maxHp
    const color = pct > 0.6 ? 0x44dd44 : pct > 0.3 ? 0xddaa22 : 0xdd3322
    this.hpGfx.fillStyle(color)
    this.hpGfx.fillRect(x, y, Math.round(HP_W * pct), HP_H)
  }
}
