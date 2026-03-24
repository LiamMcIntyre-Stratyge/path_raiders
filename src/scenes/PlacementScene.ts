import Phaser from 'phaser'
import gameState from '../lib/gameState'
import { MAPS, COLS, ROWS, BASE_SLOTS, TERRAIN_COLOR, OVERLAY_COLOR } from '../maps/MapData'
import type { MapDef } from '../types'

const SLOT_COLORS = ['#4a9adf', '#f0c050', '#4adf7a']  // left=blue, center=gold, right=green
const SLOT_LABELS = ['LEFT', 'CENTER', 'RIGHT']

interface PlacementData {
  roomId?: string
  role?: 'host' | 'guest'
  playerFaction?: string
  mapId?: number
}

export class PlacementScene extends Phaser.Scene {
  private overlay!: HTMLDivElement
  private map!: MapDef
  private chosenSlot: number | null = null
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D

  constructor() { super({ key: 'PlacementScene' }) }

  init(data: PlacementData) {
    if (data?.roomId)        gameState.roomId        = data.roomId
    if (data?.role)          gameState.role          = data.role as 'host'|'guest'
    if (data?.playerFaction) gameState.playerFaction = data.playerFaction as any
    // Pick map
    const mapId = data?.mapId ?? Math.floor(Math.random() * MAPS.length)
    this.map = MAPS[mapId] ?? MAPS[0]
    gameState.mapId = this.map.id
    this.chosenSlot = null
  }

  create() {
    this.overlay = document.createElement('div')
    this.overlay.id = 'placement-overlay'
    document.body.appendChild(this.overlay)

    this.events.on('shutdown', () => this.destroyOverlay())
    this.events.on('destroy',  () => this.destroyOverlay())

    this.buildUI()
  }

  private buildUI() {
    const role     = gameState.role ?? 'host'
    const isPractice = gameState.roomId?.startsWith('practice-') ?? false

    // Mini cell size for preview (fit ~22 cols in ~500px)
    const MINI = 22

    this.overlay.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap');
#placement-overlay{
  position:fixed;inset:0;
  background:#07090f;
  font-family:'Nunito',sans-serif;
  color:#c8b87a;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  z-index:200;
  gap:16px;
  padding:16px;
  overflow:auto;
}
.pl-title{font-family:'Lilita One',cursive;font-size:22px;color:#d4a030;letter-spacing:3px;text-shadow:0 0 20px #d4a03044;text-align:center;}
.pl-sub{font-family:'Courier New',monospace;font-size:10px;color:#5a6a4a;letter-spacing:3px;text-align:center;margin-top:-8px;}
.pl-map-name{font-family:'Lilita One',cursive;font-size:14px;color:#c8a040;letter-spacing:2px;text-align:center;}
.pl-map-desc{font-size:11px;color:#5a6a4a;text-align:center;max-width:440px;line-height:1.5;}

/* grid canvas wrapper */
#pl-grid-wrap{
  position:relative;
  border:2px solid #2a3428;
  border-radius:8px;
  overflow:hidden;
  box-shadow:0 0 30px rgba(0,0,0,0.6);
}

/* base slot buttons */
.pl-slots{display:flex;gap:10px;justify-content:center;}
.pl-slot{
  width:90px;height:64px;border-radius:10px;
  border:2px solid;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  transition:all 0.2s;background:rgba(0,0,0,0.4);
  font-family:'Lilita One',cursive;
}
.pl-slot:hover{filter:brightness(1.3);transform:translateY(-2px);}
.pl-slot.chosen{box-shadow:0 0 16px currentColor;}
.pl-slot-num{font-size:18px;}
.pl-slot-lbl{font-size:9px;letter-spacing:2px;}

.pl-confirm{
  padding:12px 48px;border-radius:10px;
  background:linear-gradient(135deg,#8a6518,#d4a030);
  border:2px solid #f0c050;
  color:#07090f;font-family:'Lilita One',cursive;font-size:15px;
  letter-spacing:3px;cursor:pointer;
  box-shadow:0 4px 0 #4a3008;
  opacity:0.4;pointer-events:none;
  transition:opacity 0.2s;
}
.pl-confirm.ready{opacity:1;pointer-events:auto;}
.pl-confirm.ready:hover{filter:brightness(1.1);}

.pl-hint{font-family:'Courier New',monospace;font-size:9px;color:#3a4a2a;letter-spacing:2px;text-align:center;}
</style>

<div class="pl-title">&#9876; BASE PLACEMENT &#9876;</div>
<div class="pl-sub">CHOOSE YOUR STARTING POSITION</div>
<div class="pl-map-name">${this.map.name}</div>
<div class="pl-map-desc">${this.map.desc}</div>

<div id="pl-grid-wrap">
  <canvas id="pl-canvas" width="${COLS * MINI}" height="${ROWS * MINI}"></canvas>
</div>

<div class="pl-slots" id="pl-slots">
  ${[0,1,2].map(i => `
    <div class="pl-slot" id="pl-slot-${i}" data-slot="${i}"
      style="border-color:${SLOT_COLORS[i]};color:${SLOT_COLORS[i]};">
      <div class="pl-slot-num">${i+1}</div>
      <div class="pl-slot-lbl">${SLOT_LABELS[i]}</div>
    </div>`).join('')}
</div>

<button class="pl-confirm" id="pl-confirm">START BATTLE</button>
<div class="pl-hint">
  ${role === 'host' ? '&#9650; YOUR BASE IS AT THE BOTTOM  &#9650;' : '&#9660; YOUR BASE IS AT THE TOP &#9660;'}
</div>`

    // Draw mini map grid
    this.canvas = document.getElementById('pl-canvas') as HTMLCanvasElement
    this.ctx    = this.canvas.getContext('2d')!
    this.drawMiniMap(MINI)

    // Slot click handlers
    for (let i = 0; i < 3; i++) {
      document.getElementById(`pl-slot-${i}`)!.addEventListener('click', () => {
        this.chosenSlot = i
        document.querySelectorAll('.pl-slot').forEach((el, j) => {
          el.classList.toggle('chosen', j === i)
        })
        // Redraw grid with chosen slot highlighted
        this.drawMiniMap(MINI)
        // Enable confirm button
        const btn = document.getElementById('pl-confirm') as HTMLButtonElement
        btn.classList.add('ready')
      })
    }

    // Confirm
    document.getElementById('pl-confirm')!.addEventListener('click', () => {
      if (this.chosenSlot === null) return
      const role = gameState.role ?? 'host'

      if (role === 'host') {
        gameState.hostSlot = this.chosenSlot
        // Practice mode: AI picks guest slot
        if (isPractice) {
          gameState.guestSlot = Math.floor(Math.random() * 3)
        }
      } else {
        gameState.guestSlot = this.chosenSlot
      }

      this.scene.start('GameScene', {
        roomId: gameState.roomId,
        role: gameState.role,
        playerFaction: gameState.playerFaction,
        mapId: this.map.id,
        hostSlot: gameState.hostSlot,
        guestSlot: gameState.guestSlot,
      })
    })
  }

  private drawMiniMap(MINI: number) {
    const ctx  = this.ctx
    const map  = this.map
    const role = gameState.role ?? 'host'

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const terrain  = map.base[r][c]
        const overlay  = map.over[r][c]
        const tc = TERRAIN_COLOR[terrain]

        // Base terrain
        ctx.fillStyle = `#${tc.bg.toString(16).padStart(6,'0')}`
        ctx.fillRect(c * MINI, r * MINI, MINI, MINI)

        // Overlay tint
        if (overlay === 'base_zone') {
          // Determine which slot this base_zone cell belongs to
          const slotIdx = BASE_SLOTS.findIndex(s => s.cols.includes(c))
          const isGuestRow = r <= 1
          const isHostRow  = r >= 14
          if (isGuestRow || isHostRow) {
            // Color based on slot
            const color = slotIdx >= 0 ? SLOT_COLORS[slotIdx] : '#ffffff'
            ctx.fillStyle = color + '44'
            ctx.fillRect(c * MINI, r * MINI, MINI, MINI)

            // Highlight chosen slot
            const playerIsHost = role === 'host'
            const isMySlot = (playerIsHost && isHostRow) || (!playerIsHost && isGuestRow)
            if (isMySlot && slotIdx === this.chosenSlot) {
              ctx.fillStyle = color + 'aa'
              ctx.fillRect(c * MINI, r * MINI, MINI, MINI)
              ctx.strokeStyle = color
              ctx.lineWidth = 2
              ctx.strokeRect(c * MINI + 1, r * MINI + 1, MINI - 2, MINI - 2)
            }
          }
        } else if (overlay && overlay !== null) {
          const oc = OVERLAY_COLOR[overlay as Exclude<typeof overlay, null>]
          if (oc) {
            ctx.fillStyle = `#${oc.bg.toString(16).padStart(6,'0')}aa`
            ctx.fillRect(c * MINI, r * MINI, MINI, MINI)
          }
        }

        // Cell border
        ctx.strokeStyle = `#${tc.border.toString(16).padStart(6,'0')}66`
        ctx.lineWidth = 0.5
        ctx.strokeRect(c * MINI, r * MINI, MINI, MINI)
      }
    }

    // Draw "YOU" label over player's base zone
    const playerRow = role === 'host' ? 14 : 0
    const enemyRow  = role === 'host' ? 0  : 14
    ctx.font = `bold ${MINI * 0.6}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff88'
    ctx.fillText('YOU', 11 * MINI, (playerRow + 0.75) * MINI)
    ctx.fillText('ENEMY', 11 * MINI, (enemyRow  + 0.75) * MINI)
  }

  private destroyOverlay() { this.overlay?.remove() }
}
