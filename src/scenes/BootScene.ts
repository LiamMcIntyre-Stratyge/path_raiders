import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // Assets will be loaded here in Phase 2 once spritesheets are generated
  }

  create() {
    this.scene.start('AuthScene')
  }
}
