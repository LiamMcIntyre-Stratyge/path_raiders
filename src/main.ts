import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { AuthScene } from './scenes/AuthScene'
import './style.css'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: '#1a3a2a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, AuthScene],
}

new Phaser.Game(config)
