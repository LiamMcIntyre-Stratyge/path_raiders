import Phaser from 'phaser'
import type { UnitDefinition } from '../types'

const HP_W = 40
const HP_H = 5
const HP_Y = -32

export const COMBAT_RANGE  = 52   // world px — stop and fight when this close
export const BASE_REACH_DMG = 60

export class Unit extends Phaser.GameObjects.Container {
  readonly def: UnitDefinition
  readonly laneSlot: number   // 0 | 1 | 2 (spawn slot)
  readonly dir: 1 | -1        // +1 = moving down (guest), -1 = moving up (host)

  hp: number
  readonly maxHp: number

  private hpGfx!: Phaser.GameObjects.Graphics
  private dead = false

  attackCd   = 0
  readonly attackRate = 900

  // ── Pathfinding ─────────────────────────────────────────────────────────────
  waypoints: { x: number; y: number }[] = []
  wpIdx = 0
  wallTarget: [number, number] | null = null  // [row, col] of wall being attacked

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
    if (dir === 1) img.setFlipY(true)
    this.add(img)

    this.hpGfx = scene.add.graphics()
    this.add(this.hpGfx)
    this.drawHP()

    scene.add.existing(this)
    this.setDepth(10)
  }

  // Set a new waypoint list and reset position
  setWaypoints(wps: { x: number; y: number }[]) {
    this.waypoints = wps
    this.wpIdx = 0
    this.wallTarget = null
  }

  // Move one step toward waypoints[wpIdx]. Returns true when arrived at that waypoint.
  moveStep(dt: number): boolean {
    if (this.wpIdx >= this.waypoints.length) return false
    const target = this.waypoints[this.wpIdx]
    const dx = target.x - this.x
    const dy = target.y - this.y
    const dist = Math.hypot(dx, dy)
    const step = this.def.speedPx * dt / 1000
    if (dist <= step) {
      this.x = target.x
      this.y = target.y
      return true
    }
    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
    return false
  }

  isAtGoal(): boolean {
    return this.wpIdx >= this.waypoints.length
  }

  takeDamage(amount: number): boolean {
    if (this.dead) return false
    this.hp = Math.max(0, this.hp - amount)
    this.drawHP()
    if (this.hp <= 0) { this.kill(); return true }
    this.flashHit()
    return false
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

  isDead() { return this.dead }

  private kill() {
    this.dead = true
    // Explosion burst
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
