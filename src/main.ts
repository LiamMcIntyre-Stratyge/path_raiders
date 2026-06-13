import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { AuthScene } from './scenes/AuthScene'
import { LobbyScene } from './scenes/LobbyScene'
import { PlacementScene } from './scenes/PlacementScene'
import { LoadoutScene } from './scenes/LoadoutScene'
import { GameScene } from './scenes/GameScene'
import { ProfileScene } from './scenes/ProfileScene'
import './style.css'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: '#07090f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, AuthScene, LobbyScene, PlacementScene, LoadoutScene, GameScene, ProfileScene],
}

new Phaser.Game(config)
