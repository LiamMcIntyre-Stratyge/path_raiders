import Phaser from 'phaser'
import { UNITS } from '../units/UnitData'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    UNITS.forEach((unit) => {
      // Spritesheet atlas for animations
      this.load.atlas(
        unit.id,
        `assets/spritesheets/${unit.id}.png`,
        `assets/spritesheets/${unit.id}.json`
      )
      // Birds-eye token for gameplay
      this.load.image(`${unit.id}_token`, `assets/tokens/${unit.id}_token.png`)
    })
  }

  create() {
    UNITS.forEach((unit) => {
      // Idle animation: 4 frames, 6fps, looping
      this.anims.create({
        key: `${unit.id}_idle`,
        frames: [0, 1, 2, 3].map((i) => ({
          key: unit.id,
          frame: `idle_${i}`,
        })),
        frameRate: 6,
        repeat: -1,
      })

      // Walk animation: 6 frames, 10fps, looping
      this.anims.create({
        key: `${unit.id}_walk`,
        frames: [0, 1, 2, 3, 4, 5].map((i) => ({
          key: unit.id,
          frame: `walk_${i}`,
        })),
        frameRate: 10,
        repeat: -1,
      })
    })

    this.scene.start('AuthScene')
  }
}
