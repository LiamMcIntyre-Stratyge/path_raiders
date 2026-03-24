import Phaser from 'phaser'
import gameState from '../lib/gameState'
import type { Faction } from '../types'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg: '#07090f',
  bgCard: '#0d1219',
  bgDeep: '#050709',
  gold: '#d4a030',
  goldDim: '#8a6518',
  goldLight: '#f0c050',
  borderMid: '#2a3428',
  text: '#c8b87a',
  textDim: '#5a6a4a',
  textMid: '#8a9a6a',
  font: "'Palatino Linotype', Palatino, serif",
  mono: "'Courier New', monospace",
}

interface GameSceneData {
  roomId: string
  role: 'host' | 'guest'
  playerFaction: Faction
}

// ─── GameScene stub ───────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  private overlay!: HTMLDivElement

  constructor() {
    super({ key: 'GameScene' })
  }

  init(data: GameSceneData) {
    if (data.roomId) gameState.roomId = data.roomId
    if (data.role) gameState.role = data.role
    if (data.playerFaction) gameState.playerFaction = data.playerFaction
  }

  create() {
    this.overlay = document.createElement('div')
    this.overlay.style.cssText = `
      position:fixed;inset:0;
      background:${T.bg};
      display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px;
      font-family:${T.font};
      color:${T.text};
      z-index:100;
    `
    document.body.appendChild(this.overlay)

    this.events.on('shutdown', () => this.removeOverlay())
    this.events.on('destroy', () => this.removeOverlay())

    const role = gameState.role ?? 'host'
    const faction = gameState.playerFaction ?? 'machines'
    const roomId = gameState.roomId ?? '—'

    this.overlay.innerHTML = `
      <div style="text-align:center;animation:fadeIn 0.6s ease both;" id="game-stub">

        <!-- Animated crest -->
        <div style="font-size:48px;margin-bottom:16px;animation:pulse 2s ease-in-out infinite;">⚔</div>

        <!-- Title -->
        <div style="font-family:${T.mono};font-size:10px;color:${T.textDim};letter-spacing:4px;margin-bottom:8px;">PATH RAIDERS</div>
        <div style="font-family:${T.font};font-size:36px;font-weight:700;
          background:linear-gradient(135deg,${T.goldDim},${T.goldLight},${T.gold});
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          letter-spacing:2px;margin-bottom:6px;">GAME STARTING...</div>
        <div style="font-family:${T.mono};font-size:10px;color:${T.textMid};letter-spacing:3px;margin-bottom:32px;">PHASE 4 COMING SOON</div>

        <!-- Match info chips -->
        <div style="display:flex;gap:12px;justify-content:center;margin-bottom:32px;">
          <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:20px;padding:8px 16px;">
            <span style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:2px;">ROOM &nbsp;</span>
            <span style="font-family:${T.mono};font-size:12px;color:${T.gold};letter-spacing:2px;">${roomId.slice(0, 8)}</span>
          </div>
          <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:20px;padding:8px 16px;">
            <span style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:2px;">ROLE &nbsp;</span>
            <span style="font-family:${T.mono};font-size:12px;color:${T.gold};letter-spacing:2px;">${role.toUpperCase()}</span>
          </div>
          <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:20px;padding:8px 16px;">
            <span style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:2px;">FACTION &nbsp;</span>
            <span style="font-family:${T.mono};font-size:12px;color:${T.gold};letter-spacing:2px;">${faction.toUpperCase()}</span>
          </div>
        </div>

        <!-- Loading bar -->
        <div style="width:280px;background:${T.bgDeep};border:1px solid ${T.borderMid};border-radius:4px;height:4px;overflow:hidden;margin:0 auto 24px;">
          <div style="height:100%;background:linear-gradient(90deg,${T.goldDim},${T.gold});border-radius:4px;animation:shimmer 1.5s ease-in-out infinite;width:60%;"></div>
        </div>

        <button id="gs-back"
          style="background:transparent;border:1px solid ${T.borderMid};border-radius:8px;color:${T.textMid};
          font-family:${T.mono};font-size:11px;letter-spacing:2px;padding:10px 20px;cursor:pointer;
          transition:border-color 0.2s,color 0.2s;"
          onmouseover="this.style.borderColor='${T.goldDim}';this.style.color='${T.text}'"
          onmouseout="this.style.borderColor='${T.borderMid}';this.style.color='${T.textMid}'">
          ← BACK TO LOBBY
        </button>
      </div>
    `

    ;(document.getElementById('gs-back') as HTMLButtonElement).onclick = () => {
      this.scene.start('LobbyScene')
    }
  }

  private removeOverlay() {
    this.overlay?.remove()
  }
}
