import Phaser from 'phaser'
import type { UnitDefinition } from '../types'

const HP_W = 44
const HP_H = 5
const HP_Y = -36  // above token centre

export const COMBAT_RANGE = 58   // world px — units stop and fight when this close
export const BASE_REACH_DMG = 60 // damage dealt to a base when a unit reaches it

export class Unit extends Phaser.GameObjects.Container {
  readonly def: UnitDefinition
  readonly laneIdx: number
  readonly dir: 1 | -1   // 1 = rightward (host units), -1 = leftward (guest units)

  hp: number
  readonly maxHp: number

  private hpGfx!: Phaser.GameObjects.Graphics
  private dead = false

  attackCd = 0                     // ms remaining before next attack
  readonly attackRate = 900        // ms per attack cycle

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    def: UnitDefinition,
    laneIdx: number,
    dir: 1 | -1,
  ) {
    super(scene, x, y)
    this.def      = def
    this.laneIdx  = laneIdx
    this.dir      = dir
    this.hp       = def.hp
    this.maxHp    = def.hp

    // Token image
    const img = scene.add.image(0, 0, `${def.id}_token`)
    img.setDisplaySize(52, 52)
    if (dir === -1) img.setFlipX(true)
    this.add(img)

    // HP bar (child of container, so it moves with the unit)
    this.hpGfx = scene.add.graphics()
    this.add(this.hpGfx)
    this.drawHP()

    scene.add.existing(this)
    this.setDepth(10)
  }

  /** Move forward by one frame's worth of travel. */
  advance(dt: number) {
    this.x += this.def.speedPx * this.dir * (dt / 1000)
  }

  /**
   * Deal damage to this unit.
   * Returns true if the unit died from this hit.
   */
  takeDamage(amount: number): boolean {
    if (this.dead) return false
    this.hp = Math.max(0, this.hp - amount)
    this.drawHP()
    if (this.hp <= 0) {
      this.kill()
      return true
    }
    return false
  }

  isDead() { return this.dead }

  private kill() {
    this.dead = true
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 300,
      onComplete: () => { if (this.scene) this.destroy() },
    })
  }

  private drawHP() {
    this.hpGfx.clear()
    const x = -HP_W / 2, y = HP_Y
    // Dark background
    this.hpGfx.fillStyle(0x000000, 0.75)
    this.hpGfx.fillRect(x - 1, y - 1, HP_W + 2, HP_H + 2)
    // Colour fill
    const pct   = this.hp / this.maxHp
    const color = pct > 0.6 ? 0x44dd44 : pct > 0.3 ? 0xddaa22 : 0xdd3322
    this.hpGfx.fillStyle(color)
    this.hpGfx.fillRect(x, y, Math.round(HP_W * pct), HP_H)
  }
}
