import Phaser from 'phaser'
import { supabase } from '../lib/supabase'
import gameState from '../lib/gameState'
import { MAPS, COLS, ROWS, BASE_SLOTS, TERRAIN_COLOR, OVERLAY_COLOR } from '../maps/MapData'
import type { MapDef } from '../types'
import type { RealtimeChannel } from '@supabase/supabase-js'

const SLOT_COLORS = ['#4a9adf', '#f0c050', '#4adf7a']
const SLOT_LABELS = ['LEFT', 'CENTER', 'RIGHT']
const MINI = 22

interface PlacementData {
  roomId?: string
  role?: 'host' | 'guest'
  playerFaction?: string
  mapId?: number
}

export class PlacementScene extends Phaser.Scene {
  private overlay!: HTMLDivElement
  private map!: MapDef
  private chosenSlot:   number | null = null
  private opponentSlot: number | null = null
  private myConfirmed  = false
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private channel: RealtimeChannel | null = null

  constructor() { super({ key: 'PlacementScene' }) }

  init(data: PlacementData) {
    if (data?.roomId)        gameState.roomId        = data.roomId
    if (data?.role)          gameState.role          = data.role as 'host' | 'guest'
    if (data?.playerFaction) gameState.playerFaction = data.playerFaction as any
    const mapId = data?.mapId ?? Math.floor(Math.random() * MAPS.length)
    this.map = MAPS.find(m => m.id === mapId) ?? MAPS[0]
    gameState.mapId = this.map.id
    this.chosenSlot   = null
    this.opponentSlot = null
    this.myConfirmed  = false
    this.channel      = null
  }

  create() {
    this.overlay = document.createElement('div')
    this.overlay.id = 'placement-overlay'
    document.body.appendChild(this.overlay)

    this.events.on('shutdown', () => { this.destroyOverlay(); this.teardownChannel() })
    this.events.on('destroy',  () => { this.destroyOverlay(); this.teardownChannel() })

    this.buildUI()
  }

  // ─── UI ──────────────────────────────────────────────────────────────────────

  private buildUI() {
    const role       = gameState.role ?? 'host'
    const isPractice = gameState.roomId?.startsWith('practice-') ?? false

    this.overlay.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap');
#placement-overlay{
  position:fixed;inset:0;
  background:#07090f;
  font-family:'Nunito',sans-serif;
  color:#c8b87a;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  z-index:200;gap:16px;padding:16px;overflow:auto;
}
.pl-title{font-family:'Lilita One',cursive;font-size:22px;color:#d4a030;letter-spacing:3px;text-shadow:0 0 20px #d4a03044;text-align:center;}
.pl-sub{font-family:'Courier New',monospace;font-size:10px;color:#5a6a4a;letter-spacing:3px;text-align:center;margin-top:-8px;}
.pl-map-name{font-family:'Lilita One',cursive;font-size:14px;color:#c8a040;letter-spacing:2px;text-align:center;}
.pl-map-desc{font-size:11px;color:#5a6a4a;text-align:center;max-width:440px;line-height:1.5;}
#pl-grid-wrap{
  position:relative;border:2px solid #2a3428;border-radius:8px;
  overflow:hidden;box-shadow:0 0 30px rgba(0,0,0,0.6);
}
.pl-slots{display:flex;gap:10px;justify-content:center;}
.pl-slot{
  width:90px;height:64px;border-radius:10px;border:2px solid;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  transition:all 0.2s;background:rgba(0,0,0,0.4);font-family:'Lilita One',cursive;
}
.pl-slot:hover{filter:brightness(1.3);transform:translateY(-2px);}
.pl-slot.chosen{box-shadow:0 0 16px currentColor;}
.pl-slot-num{font-size:18px;}.pl-slot-lbl{font-size:9px;letter-spacing:2px;}
.pl-confirm{
  padding:12px 48px;border-radius:10px;
  background:linear-gradient(135deg,#8a6518,#d4a030);
  border:2px solid #f0c050;color:#07090f;
  font-family:'Lilita One',cursive;font-size:15px;letter-spacing:3px;cursor:pointer;
  box-shadow:0 4px 0 #4a3008;opacity:0.4;pointer-events:none;transition:opacity 0.2s;
}
.pl-confirm.ready{opacity:1;pointer-events:auto;}
.pl-confirm.ready:hover{filter:brightness(1.1);}
.pl-confirm.waiting{
  opacity:0.7;pointer-events:none;
  background:linear-gradient(135deg,#203050,#305080);
  border-color:#6090c0;color:#90c0ff;letter-spacing:2px;font-size:11px;
}
.pl-hint{font-family:'Courier New',monospace;font-size:9px;color:#3a4a2a;letter-spacing:2px;text-align:center;}
.pl-status{
  font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;text-align:center;
  color:#5a9a5a;min-height:16px;
}
</style>

<div class="pl-title">&#9876; BASE PLACEMENT &#9876;</div>
<div class="pl-sub">CHOOSE YOUR STARTING POSITION</div>
<div class="pl-map-name" id="pl-map-name">${this.map.name}</div>
<div class="pl-map-desc" id="pl-map-desc">${this.map.desc}</div>

<div id="pl-grid-wrap">
  <canvas id="pl-canvas" width="${COLS * MINI}" height="${ROWS * MINI}"></canvas>
</div>

<div class="pl-slots" id="pl-slots">
  ${[0, 1, 2].map(i => `
    <div class="pl-slot" id="pl-slot-${i}" data-slot="${i}"
      style="border-color:${SLOT_COLORS[i]};color:${SLOT_COLORS[i]};">
      <div class="pl-slot-num">${i + 1}</div>
      <div class="pl-slot-lbl">${SLOT_LABELS[i]}</div>
    </div>`).join('')}
</div>

<button class="pl-confirm" id="pl-confirm">START BATTLE</button>
<div class="pl-status" id="pl-status"></div>
<div class="pl-hint">
  ${role === 'host' ? '&#9650; YOUR BASE IS AT THE BOTTOM  &#9650;' : '&#9660; YOUR BASE IS AT THE TOP &#9660;'}
</div>`

    this.canvas = document.getElementById('pl-canvas') as HTMLCanvasElement
    this.ctx    = this.canvas.getContext('2d')!
    this.drawMiniMap()

    // Slot click handlers
    for (let i = 0; i < 3; i++) {
      document.getElementById(`pl-slot-${i}`)!.addEventListener('click', () => {
        if (this.myConfirmed) return
        this.chosenSlot = i
        document.querySelectorAll('.pl-slot').forEach((el, j) => el.classList.toggle('chosen', j === i))
        this.drawMiniMap()
        document.getElementById('pl-confirm')!.classList.add('ready')
      })
    }

    // Confirm handler
    document.getElementById('pl-confirm')!.addEventListener('click', () => {
      if (this.chosenSlot === null || this.myConfirmed) return
      this.myConfirmed = true

      const role = gameState.role ?? 'host'
      if (role === 'host') {
        gameState.hostSlot = this.chosenSlot
        if (isPractice) gameState.guestSlot = Math.floor(Math.random() * 3)
      } else {
        gameState.guestSlot = this.chosenSlot
      }

      if (isPractice) {
        this.launchGame()
        return
      }

      // Multiplayer: broadcast slot and wait for opponent
      const btn = document.getElementById('pl-confirm')!
      btn.classList.remove('ready')
      btn.classList.add('waiting')
      btn.textContent = 'WAITING FOR OPPONENT...'
      this.setStatus('Slot locked in. Waiting for opponent...')

      if (this.channel) {
        void this.channel.send({
          type: 'broadcast', event: 'slot_pick',
          payload: { role, slot: this.chosenSlot },
        })
      }

      this.checkBothReady()
    })

    // Multiplayer channel
    if (!isPractice) this.setupChannel()
  }

  // ─── Channel ─────────────────────────────────────────────────────────────────

  private setupChannel() {
    if (!gameState.roomId) return
    const role = gameState.role ?? 'host'

    this.channel = supabase
      .channel(`placement:${gameState.roomId}`)
      .on('broadcast', { event: 'map_sync' }, ({ payload }) => {
        if (role !== 'guest') return
        const p = payload as { mapId: number }
        const newMap = MAPS.find(m => m.id === p.mapId)
        if (newMap && newMap.id !== this.map.id) {
          this.map = newMap
          gameState.mapId = newMap.id
          const nameEl = document.getElementById('pl-map-name')
          const descEl = document.getElementById('pl-map-desc')
          if (nameEl) nameEl.textContent = newMap.name
          if (descEl) descEl.textContent = newMap.desc
          this.drawMiniMap()
        }
      })
      .on('broadcast', { event: 'slot_pick' }, ({ payload }) => {
        const p = payload as { role: string; slot: number }
        if (p.role === gameState.role) return  // own echo, ignore
        this.opponentSlot = p.slot
        this.setStatus(`Opponent locked in slot ${p.slot + 1}. ${this.myConfirmed ? 'Launching...' : 'Waiting for you...'}`)
        this.drawMiniMap()
        this.checkBothReady()
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        // Host broadcasts the authoritative map
        if (role === 'host') {
          void this.channel!.send({
            type: 'broadcast', event: 'map_sync',
            payload: { mapId: this.map.id },
          })
        }
      })
  }

  private teardownChannel() {
    if (this.channel) {
      void supabase.removeChannel(this.channel)
      this.channel = null
    }
  }

  // ─── Game launch ─────────────────────────────────────────────────────────────

  private checkBothReady() {
    if (!this.myConfirmed || this.opponentSlot === null) return
    this.setStatus('Both ready — launching!')
    // Small delay so both players see the status
    setTimeout(() => this.launchGame(), 600)
  }

  private launchGame() {
    const role      = gameState.role ?? 'host'
    const hostSlot  = role === 'host' ? this.chosenSlot! : this.opponentSlot!
    const guestSlot = role === 'guest' ? this.chosenSlot! : (this.opponentSlot ?? Math.floor(Math.random() * 3))
    gameState.hostSlot  = hostSlot
    gameState.guestSlot = guestSlot
    this.scene.start('GameScene', {
      roomId:        gameState.roomId,
      role:          gameState.role,
      playerFaction: gameState.playerFaction,
      mapId:         this.map.id,
      hostSlot,
      guestSlot,
    })
  }

  // ─── Mini map ─────────────────────────────────────────────────────────────────

  private drawMiniMap() {
    const ctx  = this.ctx
    const map  = this.map
    const role = gameState.role ?? 'host'

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const terrain = map.base[r][c]
        const overlay = map.over[r][c]
        const tc = TERRAIN_COLOR[terrain]

        ctx.fillStyle = `#${tc.bg.toString(16).padStart(6, '0')}`
        ctx.fillRect(c * MINI, r * MINI, MINI, MINI)

        if (overlay === 'base_zone') {
          const slotIdx    = BASE_SLOTS.findIndex(s => s.cols.includes(c))
          const isGuestRow = r <= 1
          const isHostRow  = r >= 14
          if (isGuestRow || isHostRow) {
            const color        = slotIdx >= 0 ? SLOT_COLORS[slotIdx] : '#ffffff'
            const playerIsHost = role === 'host'
            const isMyRow      = (playerIsHost && isHostRow) || (!playerIsHost && isGuestRow)
            const isOppRow     = (playerIsHost && isGuestRow) || (!playerIsHost && isHostRow)

            // Dim base fill
            ctx.fillStyle = color + '33'
            ctx.fillRect(c * MINI, r * MINI, MINI, MINI)

            // Highlight my chosen slot
            if (isMyRow && slotIdx === this.chosenSlot) {
              ctx.fillStyle = color + 'bb'
              ctx.fillRect(c * MINI, r * MINI, MINI, MINI)
              ctx.strokeStyle = color
              ctx.lineWidth = 2
              ctx.strokeRect(c * MINI + 1, r * MINI + 1, MINI - 2, MINI - 2)
            }
            // Show opponent's chosen slot (dimmer, dashed feel via separate border)
            if (isOppRow && slotIdx === this.opponentSlot) {
              ctx.fillStyle = color + '55'
              ctx.fillRect(c * MINI, r * MINI, MINI, MINI)
              ctx.strokeStyle = color + '99'
              ctx.lineWidth = 2
              ctx.setLineDash([3, 3])
              ctx.strokeRect(c * MINI + 1, r * MINI + 1, MINI - 2, MINI - 2)
              ctx.setLineDash([])
            }
          }
        } else if (overlay && overlay !== null) {
          const oc = OVERLAY_COLOR[overlay as Exclude<typeof overlay, null>]
          if (oc) {
            ctx.fillStyle = `#${oc.bg.toString(16).padStart(6, '0')}aa`
            ctx.fillRect(c * MINI, r * MINI, MINI, MINI)
          }
        }

        ctx.strokeStyle = `#${tc.border.toString(16).padStart(6, '0')}66`
        ctx.lineWidth = 0.5
        ctx.strokeRect(c * MINI, r * MINI, MINI, MINI)
      }
    }

    // YOU / ENEMY labels
    const playerRow = role === 'host' ? 14 : 0
    const enemyRow  = role === 'host' ? 0  : 14
    ctx.font = `bold ${MINI * 0.6}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff88'
    ctx.fillText('YOU',   11 * MINI, (playerRow + 0.75) * MINI)
    ctx.fillText('ENEMY', 11 * MINI, (enemyRow  + 0.75) * MINI)
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private setStatus(msg: string) {
    const el = document.getElementById('pl-status')
    if (el) el.textContent = msg
  }

  private destroyOverlay() { this.overlay?.remove() }
}
