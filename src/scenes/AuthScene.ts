import Phaser from 'phaser'

export class AuthScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AuthScene' })
  }

  create() {
    this.add.text(100, 100, 'Path Raiders — Auth (Phase 3)', {
      color: '#ffffff',
      fontSize: '24px',
    })
  }
}
