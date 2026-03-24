import Phaser from 'phaser'
import type { UnitDefinition } from '../types'

const HP_W = 40
const HP_H = 5
const HP_Y = -32

export const COMBAT_RANGE  = 52   // world px — stop and fight when this close (y-axis)
export const BASE_REACH_DMG = 60

export class Unit extends Phaser.GameObjects.Container {
  readonly def: UnitDefinition
  readonly laneSlot: number   // 0 | 1 | 2 (which base slot column)
  readonly dir: 1 | -1        // +1 = moving down (guest), -1 = moving up (host)

  hp: number
  readonly maxHp: number

  private hpGfx!: Phaser.GameObjects.Graphics
  private dead = false

  attackCd   = 0
  readonly attackRate = 900

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    def: UnitDefinition,
    laneSlot: number,
    dir: 1 | -1,
  ) {
    super(scene, x, y)
    this.def      = def
    this.laneSlot = laneSlot
    this.dir      = dir
    this.hp       = def.hp
    this.maxHp    = def.hp

    const img = scene.add.image(0, 0, `${def.id}_token`)
    img.setDisplaySize(36, 36)
    // Flip vertically for guest units moving down
    if (dir === 1) img.setFlipY(true)
    this.add(img)

    this.hpGfx = scene.add.graphics()
    this.add(this.hpGfx)
    this.drawHP()

    scene.add.existing(this)
    this.setDepth(10)
  }

  advance(dt: number) {
    this.y += this.def.speedPx * this.dir * (dt / 1000)
  }

  takeDamage(amount: number): boolean {
    if (this.dead) return false
    this.hp = Math.max(0, this.hp - amount)
    this.drawHP()
    if (this.hp <= 0) { this.kill(); return true }
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
      duration: 280,
      onComplete: () => { if (this.scene) this.destroy() },
    })
  }

  private drawHP() {
    this.hpGfx.clear()
    const x = -HP_W / 2, y = HP_Y
    this.hpGfx.fillStyle(0x000000, 0.75)
    this.hpGfx.fillRect(x - 1, y - 1, HP_W + 2, HP_H + 2)
    const pct   = this.hp / this.maxHp
    const color = pct > 0.6 ? 0x44dd44 : pct > 0.3 ? 0xddaa22 : 0xdd3322
    this.hpGfx.fillStyle(color)
    this.hpGfx.fillRect(x, y, Math.round(HP_W * pct), HP_H)
  }
}
