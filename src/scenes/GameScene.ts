import Phaser from 'phaser'
import gameState from '../lib/gameState'
import { supabase } from '../lib/supabase'
import { recordMatchResult } from '../lib/api/account'
import { UNITS } from '../units/UnitData'
import { UnitView } from '../units/UnitView'
import { resolveSide } from '../lib/sideHelper'
import { drawTowers as renderTowers, fac } from '../towers/TowerView'
import { createWorld } from '../sim/world'
import { step } from '../sim/step'
import type { SimWorld, SimInput } from '../sim/types'
import { audio } from '../lib/audio'
import type { Faction, OverlayType, MapDef } from '../types'
import {
  MAPS, COLS, ROWS, CELL, WORLD_W, WORLD_H,
  BASE_SLOTS, HOST_ROWS, GUEST_ROWS,
  slotWorldX,
  TERRAIN_COLOR, OVERLAY_COLOR,
} from '../maps/MapData'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─── Wall HP (max-HP table — used only for the wall HP-bar render) ─────────────
const WALL_MAX_HP: Partial<Record<string, number>> = {
  wall: 250, break_mach: 200, break_plant: 200, break_wiz: 200,
}
const WALL_OVERLAYS = new Set(['wall', 'break_mach', 'break_plant', 'break_wiz'])

// ─── Layout constants ─────────────────────────────────────────────────────────
const MAP_ZOOM    = 0.85
const TOP_BAR_H   = 50
const BTM_BAR_H   = 70
const CANVAS_H    = 540
const VIEWPORT_H  = CANVAS_H - TOP_BAR_H - BTM_BAR_H   // 420

// ─── Scene data ───────────────────────────────────────────────────────────────
interface GameSceneData {
  roomId?: string
  role?: 'host' | 'guest'
  playerFaction?: Faction
  mapId?: number
  hostSlot?: number | null
  guestSlot?: number | null
}

// ─── Faction display ──────────────────────────────────────────────────────────
// FC color table + fac() lookup now live in src/towers/TowerView (single source).
const FAC_ICON: Record<string, string>  = { machines: '&#9881;', plants: '&#127807;', wizards: '&#10024;' }
const UNIT_ICON: Record<string, string> = {
  scout_drone: '&#129302;', assault_bot: '&#9881;',
  vine_crawler: '&#127807;', thorn_beast: '&#128027;',
  apprentice_mage: '&#10024;', elementalist: '&#129497;',
}

// ─── GameScene ────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  // HUD DOM
  private hud!: HTMLDivElement
  private goldEl!: HTMLSpanElement
  private timerEl!: HTMLElement
  private hostHPEl!: HTMLElement
  private guestHPEl!: HTMLElement

  // Sim world — single source of truth for live battle state (D-12)
  private world!: SimWorld

  // Render reconcile + input queue + per-attack audio monitor (D-03)
  private unitViews = new Map<string, UnitView>()
  private pendingInputs: SimInput[] = []
  private prevAttackCds = new Map<string, number>()

  private paused   = false
  private gameOver = false

  // Selected deploy unit
  private selectedUnit: string | null = null

  // Map
  private mapDef: MapDef | null = null
  private hostSlot  = 0
  private guestSlot = 0
  private isPractice = false

  // Wall graphics layer (redrawn on wall change)
  private wallGfx!: Phaser.GameObjects.Graphics
  // Multiplayer channel
  private channel: RealtimeChannel | null = null

  constructor() { super({ key: 'GameScene' }) }

  init(data: GameSceneData) {
    if (data?.roomId)        gameState.roomId        = data.roomId
    if (data?.role)          gameState.role          = data.role
    if (data?.playerFaction) gameState.playerFaction = data.playerFaction

    // Map
    const mapId = data?.mapId ?? gameState.mapId ?? 1
    this.mapDef = MAPS.find(m => m.id === mapId) ?? MAPS[0]
    gameState.mapId = this.mapDef.id

    // Slots
    this.hostSlot  = data?.hostSlot  ?? gameState.hostSlot  ?? 1
    this.guestSlot = data?.guestSlot ?? gameState.guestSlot ?? 1
    gameState.hostSlot  = this.hostSlot
    gameState.guestSlot = this.guestSlot

    this.isPractice = gameState.roomId?.startsWith('practice-') ?? false
    this.paused     = false
    this.gameOver   = false
    this.unitViews  = new Map()
    this.pendingInputs = []
    this.prevAttackCds = new Map()
    this.channel    = null

    // ── Build the sim world (single source of truth, D-12) ──────────────────
    const role = gameState.role ?? 'host'
    const pFac = gameState.playerFaction ?? 'machines'
    const { hostFaction, guestFaction } = resolveSide(role, pFac)
    this.world = createWorld({
      gold:         gameState.gold,
      hostSlot:     this.hostSlot,
      guestSlot:    this.guestSlot,
      mapBase:      this.mapDef!.base,
      mapOver:      this.mapDef!.over,
      isPractice:   this.isPractice,
      hostFaction,
      guestFaction,
    })
  }

  create() {
    // ── Camera ────────────────────────────────────────────────────────────────
    const cam = this.cameras.main
    cam.setViewport(0, TOP_BAR_H, 960, VIEWPORT_H)
    cam.setBounds(0, 0, WORLD_W, WORLD_H)
    cam.setZoom(MAP_ZOOM)
    cam.centerOn(WORLD_W / 2, WORLD_H / 2)

    // ── Draw world ────────────────────────────────────────────────────────────
    this.drawMapGrid()
    this.drawBasePlacements()
    {
      const role = gameState.role ?? 'host'
      const pFac = gameState.playerFaction ?? 'machines'
      const { hostFaction, guestFaction } = resolveSide(role, pFac)
      renderTowers(this, this.world.towers, hostFaction, guestFaction)
    }
    this.wallGfx = this.add.graphics().setDepth(4)
    this.drawWallOverlays()

    // ── Input ─────────────────────────────────────────────────────────────────
    this.setupInput()

    // ── HUD ───────────────────────────────────────────────────────────────────
    this.buildHUD()
    this.setupChannel()

    this.events.on('shutdown', () => { this.destroyHUD(); this.teardownChannel() })
    this.events.on('destroy',  () => { this.destroyHUD(); this.teardownChannel() })
  }

  // ─── Map rendering ──────────────────────────────────────────────────────────

  private drawMapGrid() {
    if (!this.mapDef) return
    const g = this.add.graphics()
    g.setDepth(0)

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const terrain = this.mapDef.base[r][c]
        const overlay = this.mapDef.over[r][c]
        const tc = TERRAIN_COLOR[terrain]

        const px = c * CELL
        const py = r * CELL

        // Base terrain fill
        g.fillStyle(tc.bg, 1)
        g.fillRect(px, py, CELL, CELL)

        // Overlay tint (walls drawn separately in wallGfx so they can break)
        if (overlay && overlay !== null && !WALL_OVERLAYS.has(overlay)) {
          const oc = OVERLAY_COLOR[overlay as Exclude<typeof overlay, null>]
          if (oc) {
            g.fillStyle(oc.bg, 0.7)
            g.fillRect(px, py, CELL, CELL)
            // Border for overlay
            g.lineStyle(1, oc.border, 0.8)
            g.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2)
          }
        }

        // Cell border
        g.lineStyle(1, tc.border, 0.4)
        g.strokeRect(px, py, CELL, CELL)
      }
    }
  }

  private drawBasePlacements() {
    if (!this.mapDef) return
    const g = this.add.graphics()
    g.setDepth(2)

    const role = gameState.role ?? 'host'
    const pFac = gameState.playerFaction ?? 'machines'
    const { hostFaction: hostFac, guestFaction: guestFac } = resolveSide(role, pFac)

    const hc = fac(hostFac)
    const gc = fac(guestFac)

    // Draw host base zone (bottom: rows 14-15)
    for (let r = HOST_ROWS[0]; r <= HOST_ROWS[1]; r++) {
      for (let c = BASE_SLOTS[this.hostSlot].cols[0]; c <= BASE_SLOTS[this.hostSlot].cols[1]; c++) {
        const px = c * CELL
        const py = r * CELL
        g.fillStyle(hc.fill, 0.55)
        g.fillRect(px, py, CELL, CELL)
        g.lineStyle(2, hc.bd, 0.9)
        g.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2)
      }
    }

    // Draw guest base zone (top: rows 0-1)
    for (let r = GUEST_ROWS[0]; r <= GUEST_ROWS[1]; r++) {
      for (let c = BASE_SLOTS[this.guestSlot].cols[0]; c <= BASE_SLOTS[this.guestSlot].cols[1]; c++) {
        const px = c * CELL
        const py = r * CELL
        g.fillStyle(gc.fill, 0.55)
        g.fillRect(px, py, CELL, CELL)
        g.lineStyle(2, gc.bd, 0.9)
        g.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2)
      }
    }

    // Labels
    const hostLabel  = role === 'host' ? 'YOU' : 'ENEMY'
    const guestLabel = role === 'guest' ? 'YOU' : 'ENEMY'

    const hx = slotWorldX(this.hostSlot)
    const gy = slotWorldX(this.guestSlot)

    this.add.text(hx, HOST_ROWS[0] * CELL + CELL, hostLabel, {
      fontFamily: 'Courier New, monospace', fontSize: '10px', color: '#ffffff', align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(5)

    this.add.text(gy, GUEST_ROWS[1] * CELL, guestLabel, {
      fontFamily: 'Courier New, monospace', fontSize: '10px', color: '#ffffff', align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(5)
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private setupInput() {
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.selectedUnit) {
        this.tryDeployAt(p.worldX, p.worldY)
      }
    })
  }

  // ─── Deploy ─────────────────────────────────────────────────────────────────

  private tryDeployAt(wx: number, _wy: number) {
    // Determine nearest base slot from worldX click
    let nearestSlot = 0
    let nearestDist = Infinity
    for (let i = 0; i < 3; i++) {
      const sx = slotWorldX(i)
      const dist = Math.abs(wx - sx)
      if (dist < nearestDist) {
        nearestDist = dist
        nearestSlot = i
      }
    }

    const def = UNITS.find((u) => u.id === this.selectedUnit)
    if (!def) return
    if (this.world.gold < def.cost) return

    // Gold lives on the sim world now (D-12); deduct there and refresh HUD.
    this.world.gold -= def.cost
    if (this.goldEl) this.goldEl.textContent = String(this.world.gold)
    this.updateSlotAffordability()

    const role = gameState.role ?? 'host'

    // Queue a deploy intent; the sim spawns the unit on the next step (D-04).
    this.pendingInputs.push({ type: 'deploy', unitId: def.id, slot: nearestSlot, role })
    audio.playDeploy()

    // Broadcast to opponent — wire protocol preserved byte-for-byte
    if (!this.isPractice && this.channel) {
      void this.channel.send({
        type: 'broadcast', event: 'deploy',
        payload: { unitId: def.id, slot: nearestSlot, role: role as string },
      })
    }

    // Deselect
    this.selectedUnit = null
    this.hud?.querySelectorAll('.dslot').forEach((e) => e.classList.remove('selected'))
  }

  // ─── Update — drive the sim (D-03/D-04) ───────────────────────────────────────

  update(_t: number, dt: number) {
    if (this.paused || this.world.over) return

    // 1. Advance the sim one tick (D-08): drain queued inputs, run step().
    const inputs = this.pendingInputs.splice(0)
    const events = step(this.world, inputs, dt, Math.random)

    // 2. Reconcile unit views by SimUnit.id (D-03 — never by array position).
    this.reconcileUnits()

    // 3. Per-attack audio (preserves the old updateUnits audio.playHit() — SC#1).
    //    Continuous-state read of attackCd, NOT a sim event: when a unit's
    //    cooldown fires it resets attackCd upward to attackRate, so curr > prev.
    const live = [...this.world.hostUnits, ...this.world.guestUnits]
    const liveIds = new Set<string>()
    for (const u of live) {
      liveIds.add(u.id)
      const prev = this.prevAttackCds.get(u.id)
      if (prev !== undefined && u.attackCd > prev) audio.playHit()
      this.prevAttackCds.set(u.id, u.attackCd)
    }
    for (const id of this.prevAttackCds.keys()) {
      if (!liveIds.has(id)) this.prevAttackCds.delete(id)
    }

    // 4. Discrete events → SFX / animation / camera / network (D-03/D-04).
    let gameOverWinner: 'host' | 'guest' | 'tie' | null = null
    for (const ev of events) {
      switch (ev.type) {
        case 'unit_died':
          // Death animation handled by reconcile when the id leaves the live set.
          break
        case 'wall_break':
          this.drawWallOverlays()
          audio.playWallBreak()
          this.cameras.main.shake(180, 0.009)
          if (!this.isPractice && this.channel) {
            void this.channel.send({ type: 'broadcast', event: 'wall_break', payload: { row: ev.row, col: ev.col } })
          }
          break
        case 'base_hit':
          if (this.hostHPEl && ev.side === 'host')  this.hostHPEl.textContent  = `${ev.newHp} / 1000`
          if (this.guestHPEl && ev.side === 'guest') this.guestHPEl.textContent = `${ev.newHp} / 1000`
          this.flashBaseHit()
          if (!this.isPractice && this.channel) {
            void this.channel.send({ type: 'broadcast', event: 'base_hp', payload: { side: ev.side, hp: ev.newHp } })
          }
          break
        case 'game_over':
          gameOverWinner = ev.winner
          break
      }
    }

    // game_over handled once (Risk 5): world.over is already set by the sim.
    if (gameOverWinner) this.triggerGameOver(gameOverWinner)

    // 5. HUD reads live state directly off the world each frame.
    if (this.goldEl)  this.goldEl.textContent = String(this.world.gold)
    if (this.timerEl) {
      const m = Math.floor(this.world.timeLeft / 60)
      const s = Math.floor(this.world.timeLeft % 60)
      this.timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    if (this.hostHPEl)  this.hostHPEl.textContent  = `${this.world.hostBaseHp} / 1000`
    if (this.guestHPEl) this.guestHPEl.textContent = `${this.world.guestBaseHp} / 1000`
    this.updateSlotAffordability()
  }

  /**
   * Reconcile UnitViews against the sim's live units by id (D-03): create+popIn
   * for new ids, syncFrom for existing, playDeathAnimation+delete for vanished
   * ids. Reconcile by SimUnit.id, NEVER by array position (order changes on prune).
   */
  private reconcileUnits() {
    const liveIds = new Set<string>()
    for (const u of [...this.world.hostUnits, ...this.world.guestUnits]) {
      liveIds.add(u.id)
      let view = this.unitViews.get(u.id)
      if (!view) {
        const def = UNITS.find(d => d.id === u.defId)
        if (!def) continue
        view = new UnitView(this, u.id, def, u.laneSlot, u.dir)
        this.unitViews.set(u.id, view)
        view.popIn()
      }
      view.syncFrom(u)
    }
    for (const [id, view] of this.unitViews) {
      if (!liveIds.has(id)) {
        view.playDeathAnimation()
        this.unitViews.delete(id)
      }
    }
  }

  private flashBaseHit() {
    audio.playBaseHit()
    this.cameras.main.shake(220, 0.018)
    const flash = this.add.graphics().setDepth(200).setScrollFactor(0)
    flash.fillStyle(0xff2222, 0.35)
    flash.fillRect(0, 0, 960, 540)
    this.tweens.add({
      targets: flash, alpha: 0, duration: 350,
      onComplete: () => flash.destroy(),
    })
  }

  // ─── Game Over ──────────────────────────────────────────────────────────────

  private triggerGameOver(winner: 'host' | 'guest' | 'tie') {
    if (this.gameOver) return
    this.gameOver = true
    this.world.over = true
    this.scene.pause()
    if (!this.isPractice && this.channel) {
      void this.channel.send({ type: 'broadcast', event: 'game_over', payload: { winner } })
    }

    const role      = gameState.role ?? 'host'
    const playerWon = winner === role
    const isTie     = winner === 'tie'

    if (playerWon)    audio.playVictory()
    else if (!isTie)  audio.playDefeat()

    if (!this.isPractice) {
      void this.recordResult(playerWon ? 'win' : isTie ? 'tie' : 'loss')
    }

    this.showResultOverlay(playerWon, isTie, winner)
  }

  private async recordResult(result: 'win' | 'loss' | 'tie') {
    if (!gameState.userId) return
    const payload = await recordMatchResult(gameState.userId, result)
    if (!payload) return

    gameState.wins          = payload.wins
    gameState.losses        = payload.losses
    gameState.unlockedUnits = payload.unlockedUnits

    if (payload.newlyUnlocked.length > 0) this.showUnlockNotification(payload.newlyUnlocked)
  }

  private showUnlockNotification(units: string[]) {
    const names = units.map(id => UNITS.find(u => u.id === id)?.name ?? id).join(', ')
    const el = document.createElement('div')
    el.id = 'gh-unlock'
    el.innerHTML = `
<style>
@keyframes unlock-in{from{opacity:0;transform:translateY(30px) scale(0.85)}to{opacity:1;transform:translateY(0) scale(1)}}
#gh-unlock{
  position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
  background:linear-gradient(135deg,#1a0e00,#2a1800);
  border:2px solid #f0c050;border-radius:14px;
  padding:16px 28px;text-align:center;z-index:9999;
  animation:unlock-in 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
  box-shadow:0 0 30px #f0c05066;
}
#gh-unlock .ul-title{font-family:'Lilita One',cursive;font-size:15px;color:#f0c050;letter-spacing:3px;margin-bottom:6px;}
#gh-unlock .ul-names{font-family:monospace;font-size:12px;color:#e8d8a0;letter-spacing:1px;}
</style>
<div class="ul-title">&#9733; UNIT UNLOCKED &#9733;</div>
<div class="ul-names">${names}</div>`
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 4000)
  }

  private showResultOverlay(won: boolean, tie: boolean, _winner: 'host' | 'guest' | 'tie') {
    const mapName = this.mapDef?.name ?? ''
    const role    = gameState.role ?? 'host'
    const myHP    = role === 'host' ? this.world.hostBaseHp  : this.world.guestBaseHp
    const oppHP   = role === 'host' ? this.world.guestBaseHp : this.world.hostBaseHp

    let title: string, subtitle: string, glowColor: string, bgGrad: string
    if (tie) {
      title     = 'DRAW'
      subtitle  = 'Both bases survived — the battle ends in a tie.'
      glowColor = '#9090ff'
      bgGrad    = 'linear-gradient(160deg,#2a2a4a,#1a1a2e)'
    } else if (won) {
      title     = 'VICTORY!'
      subtitle  = 'The enemy base has fallen. Glory to your faction!'
      glowColor = '#f0c050'
      bgGrad    = 'linear-gradient(160deg,#3a2808,#1a0800)'
    } else {
      title     = 'DEFEATED'
      subtitle  = 'Your base was destroyed. Rally and fight again!'
      glowColor = '#d04040'
      bgGrad    = 'linear-gradient(160deg,#3a0808,#1a0000)'
    }

    const overlay = document.createElement('div')
    overlay.id    = 'gh-result'
    overlay.innerHTML = `
<style>
#gh-result{
  position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,0.72);backdrop-filter:blur(3px);
  font-family:'Nunito','Lilita One',sans-serif;
}
#gh-res-box{
  background:${bgGrad};border:3px solid ${glowColor};border-radius:18px;
  box-shadow:0 0 40px ${glowColor}55,0 6px 30px rgba(0,0,0,0.7);
  padding:36px 48px;text-align:center;min-width:320px;max-width:480px;
  animation:resIn .4s cubic-bezier(.34,1.56,.64,1) both;
}
@keyframes resIn{from{transform:scale(.6) translateY(40px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
#gh-res-title{
  font-family:'Lilita One',cursive;font-size:52px;letter-spacing:3px;
  color:${glowColor};text-shadow:0 0 20px ${glowColor}99,2px 2px 0 rgba(0,0,0,0.5);
  margin-bottom:8px;
}
#gh-res-sub{font-size:13px;color:rgba(255,255,255,0.65);margin-bottom:20px;letter-spacing:.5px;}
#gh-res-map{font-family:'Courier New',monospace;font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:2px;margin-bottom:24px;}
#gh-res-stats{
  display:flex;justify-content:center;gap:24px;margin-bottom:28px;
}
.res-stat{background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:10px 18px;}
.rs-label{font-size:8px;color:rgba(255,255,255,0.4);letter-spacing:2px;margin-bottom:4px;}
.rs-val{font-family:'Lilita One',cursive;font-size:18px;color:#fff;}
#gh-res-btns{display:flex;gap:12px;justify-content:center;}
.res-btn{
  font-family:'Lilita One',cursive;font-size:13px;padding:10px 24px;border-radius:10px;
  border:2px solid;cursor:pointer;letter-spacing:.5px;box-shadow:0 4px 0 rgba(0,0,0,0.4);
  transition:transform .1s,box-shadow .1s;
}
.res-btn:hover{transform:translateY(-2px);box-shadow:0 6px 0 rgba(0,0,0,0.4);}
.res-btn:active{transform:translateY(2px);box-shadow:0 2px 0 rgba(0,0,0,0.4);}
#res-btn-again{background:linear-gradient(180deg,#f0c050,#c08020);border-color:#ffe090;color:#3a1800;}
#res-btn-lobby{background:linear-gradient(180deg,#4060a0,#203060);border-color:#8090d0;color:#ddeeff;}
</style>
<div id="gh-res-box">
  <div id="gh-res-title">${title}</div>
  <div id="gh-res-sub">${subtitle}</div>
  <div id="gh-res-map">&#128506; ${mapName.toUpperCase()}</div>
  <div id="gh-res-stats">
    <div class="res-stat">
      <div class="rs-label">YOUR BASE</div>
      <div class="rs-val" style="color:${won && !tie ? '#44ee44' : tie ? '#aaaaff' : '#ee4444'}">${myHP}</div>
    </div>
    <div class="res-stat">
      <div class="rs-label">ENEMY BASE</div>
      <div class="rs-val">${oppHP}</div>
    </div>
  </div>
  <div id="gh-res-btns">
    <button class="res-btn" id="res-btn-again">&#9654; PLAY AGAIN</button>
    <button class="res-btn" id="res-btn-lobby">&#8592; LOBBY</button>
  </div>
</div>`

    document.body.appendChild(overlay)

    document.getElementById('res-btn-again')?.addEventListener('click', () => {
      overlay.remove()
      this.scene.stop()
      this.scene.start('PlacementScene', {
        roomId:         gameState.roomId,
        role:           gameState.role,
        playerFaction:  gameState.playerFaction,
        mapId:          Math.floor(Math.random() * 10),
      })
    })

    document.getElementById('res-btn-lobby')?.addEventListener('click', () => {
      overlay.remove()
      this.scene.stop()
      this.scene.start('LobbyScene')
    })
  }

  // ─── Wall overlay rendering (read off the sim world) ─────────────────────────

  private drawWallOverlays() {
    if (!this.wallGfx) return
    this.wallGfx.clear()
    const over = this.world.mutableOver
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ov = over[r][c]
        if (!ov || !WALL_OVERLAYS.has(ov)) continue
        const oc = OVERLAY_COLOR[ov as Exclude<OverlayType, null>]
        if (!oc) continue
        const px = c * CELL, py = r * CELL
        this.wallGfx.fillStyle(oc.bg, 0.9)
        this.wallGfx.fillRect(px, py, CELL, CELL)
        this.wallGfx.lineStyle(2, oc.border, 1)
        this.wallGfx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2)
      }
    }
    // HP bars for damaged walls
    for (const [key, hp] of this.world.wallHP) {
      const [r, c] = key.split(',').map(Number)
      const ov = over[r][c]
      const maxHp = ov ? WALL_MAX_HP[ov] : undefined
      if (!maxHp || hp >= maxHp) continue
      const pct = hp / maxHp
      const px = c * CELL + 2, py = r * CELL + CELL - 9
      const w = CELL - 4, h = 5
      this.wallGfx.fillStyle(0x000000, 0.8)
      this.wallGfx.fillRect(px - 1, py - 1, w + 2, h + 2)
      const color = pct > 0.6 ? 0x44dd44 : pct > 0.3 ? 0xddaa22 : 0xdd3322
      this.wallGfx.fillStyle(color)
      this.wallGfx.fillRect(px, py, Math.round(w * pct), h)
    }
  }

  // ─── Multiplayer channel (wire protocol preserved byte-for-byte, D-04) ────────

  private setupChannel() {
    if (!gameState.roomId || gameState.roomId.startsWith('practice-')) return
    this.channel = supabase
      .channel(`game:${gameState.roomId}`)
      .on('broadcast', { event: 'deploy' }, ({ payload }) => {
        const p = payload as { unitId: string; slot: number; role: string }
        // Map the remote deploy into a sim input; the sim spawns it next step.
        this.pendingInputs.push({ type: 'deploy', unitId: p.unitId, slot: p.slot, role: p.role as 'host' | 'guest' })
      })
      .on('broadcast', { event: 'wall_break' }, ({ payload }) => {
        const p = payload as { row: number; col: number }
        // Apply the opponent's wall break via a sim input (no rebroadcast — the
        // sim emits a wall_break event which the scene renders; this matches the
        // old breakWall(...,false) no-rebroadcast path because received breaks
        // come from the channel, not local combat).
        if (this.world.wallHP.has(`${p.row},${p.col}`)) {
          this.pendingInputs.push({ type: 'wall_break', row: p.row, col: p.col })
        }
      })
      .on('broadcast', { event: 'base_hp' }, ({ payload }) => {
        const p = payload as { side: 'host' | 'guest'; hp: number }
        // Trust-and-overwrite preserved exactly as v1.0 (T-10-03-01): write the
        // sim world directly (D-12 — gameState no longer carries base HP).
        if (p.side === 'host') {
          this.world.hostBaseHp = p.hp
          if (this.hostHPEl) this.hostHPEl.textContent = `${p.hp} / 1000`
          if (p.hp <= 0) this.triggerGameOver('guest')
        } else {
          this.world.guestBaseHp = p.hp
          if (this.guestHPEl) this.guestHPEl.textContent = `${p.hp} / 1000`
          if (p.hp <= 0) this.triggerGameOver('host')
        }
      })
      .on('broadcast', { event: 'game_over' }, ({ payload }) => {
        const p = payload as { winner: 'host' | 'guest' | 'tie' }
        this.triggerGameOver(p.winner)
      })
      .subscribe()
  }

  private teardownChannel() {
    if (this.channel) {
      void supabase.removeChannel(this.channel)
      this.channel = null
    }
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────

  private buildHUD() {
    const faction  = gameState.playerFaction ?? 'machines'
    const fIcon    = FAC_ICON[faction]  ?? '&#9876;'
    const fName    = faction.replace('_', ' ').toUpperCase()
    const username = gameState.username ?? 'PLAYER'
    const role     = gameState.role ?? 'host'
    const mapName  = this.mapDef?.name ?? 'MAP'

    // Use player's chosen loadout; fall back to all unlocked faction units
    const loadoutIds = gameState.loadout.length > 0
      ? gameState.loadout
      : UNITS.filter(u => u.faction === faction && gameState.unlockedUnits.includes(u.id)).map(u => u.id)
    const deployable = loadoutIds
      .map(id => UNITS.find(u => u.id === id))
      .filter((u): u is NonNullable<typeof u> => !!u)
    const slotsHTML  = deployable.map((u) => {
      const icon = UNIT_ICON[u.id] ?? '?'
      return `
        <div class="dslot"
          data-uid="${u.id}" data-cost="${u.cost}"
          title="${u.name} — ${u.cost}g">
          <div class="ds-icon">${icon}</div>
          <div class="ds-cost">${u.cost}g</div>
        </div>`
    }).join('')

    const myBaseSide = role === 'host' ? 'host' : 'guest'

    this.hud = document.createElement('div')
    this.hud.id = 'game-hud'
    this.hud.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap');
#game-hud{position:fixed;inset:0;pointer-events:none;font-family:'Nunito','Lilita One',sans-serif;z-index:50;}

/* ── Top bar ─────────────────────────────────────────────────────────────── */
#gh-top{
  pointer-events:auto;
  height:${TOP_BAR_H}px;
  background:linear-gradient(180deg,#c8a050 0%,#a07030 40%,#8a5a20 100%);
  border-bottom:3px solid #5a3a1a;padding:6px 14px;
  display:flex;align-items:center;justify-content:space-between;
  box-shadow:0 2px 10px rgba(0,0,0,0.55);position:relative;
}
#gh-top::after{content:'';position:absolute;bottom:-6px;left:0;right:0;height:3px;background:linear-gradient(90deg,#5a3a1a,#8a6030,#5a3a1a);}
.gh-logo{font-size:14px;font-weight:900;color:#fff;text-shadow:2px 2px 0 #5a3000,-1px -1px 0 #ff8800;letter-spacing:1px;font-family:'Lilita One',cursive;}
.gh-mapname{font-family:'Courier New',monospace;font-size:9px;color:#ffe0a0;letter-spacing:2px;}
#gh-center{display:flex;gap:8px;align-items:center;}
#gh-timer{background:linear-gradient(180deg,#4080e0,#2050b0);border:2px solid #80b0ff;border-radius:10px;padding:4px 14px;font-family:'Lilita One',cursive;font-size:16px;color:#fff;text-shadow:1px 1px 0 #003;min-width:72px;text-align:center;}
.gh-res{display:flex;gap:8px;align-items:center;}
.gh-pill{display:flex;align-items:center;gap:5px;background:rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.2);border-radius:20px;padding:3px 12px 3px 5px;font-family:'Lilita One',cursive;font-size:14px;color:#fff;text-shadow:1px 1px 0 #333;}
.gh-ri{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;}
.ri-g{background:#f0a000;}
#gh-back{pointer-events:auto;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 10px;font-size:10px;color:rgba(255,255,255,0.4);cursor:pointer;letter-spacing:1px;font-family:'Courier New',monospace;}
#gh-back:hover{color:rgba(255,255,255,0.75);border-color:rgba(255,255,255,0.3);}

/* ── Base HP bars ─────────────────────────────────────────────────────────── */
#gh-basehp{
  pointer-events:none;
  position:absolute;top:${TOP_BAR_H + 4}px;left:0;right:0;
  display:flex;justify-content:space-between;padding:4px 14px;
}
.gh-barhp{
  background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.15);
  border-radius:8px;padding:3px 10px;font-family:'Lilita One',cursive;font-size:10px;
  display:flex;align-items:center;gap:8px;
}
.bh-label{font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.5);}
.bh-val{color:#ffe080;}

/* ── Action bar ───────────────────────────────────────────────────────────── */
#gh-action{
  pointer-events:auto;position:absolute;bottom:0;left:0;right:0;
  height:${BTM_BAR_H}px;
  background:linear-gradient(180deg,#8a6030 0%,#6a4020 100%);
  border-top:3px solid #c09050;padding:6px 14px;
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  box-shadow:0 -2px 10px rgba(0,0,0,0.55);
}
.gh-badge{background:linear-gradient(180deg,#4a80c0,#2050a0);border:2px solid #80b0ff;border-radius:12px;padding:5px 10px;display:flex;align-items:center;gap:6px;box-shadow:0 3px 0 #102050;min-width:80px;}
.gh-bi{font-size:18px;}.gh-bn{font-family:'Lilita One',cursive;font-size:10px;color:#fff;text-shadow:1px 1px 0 #003;}.gh-bs{font-size:8px;color:#a0c0ff;}
.gh-slots{display:flex;gap:5px;align-items:center;}
.dslot{width:50px;height:52px;border-radius:10px;background:linear-gradient(180deg,#5a4010,#3a2808);border:2px solid #c09050;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;box-shadow:0 3px 0 #1a0800;transition:border-color .15s,transform .12s;position:relative;}
.dslot:hover:not(.locked){border-color:#ffe080;transform:translateY(-2px);}
.dslot.locked{opacity:0.4;cursor:not-allowed;}
.dslot.selected{border-color:#ffe080;box-shadow:0 0 14px rgba(255,220,80,0.55);}
.dslot.cant-afford .ds-cost{color:#ff7070;}
.ds-icon{font-size:20px;line-height:1;}.ds-cost{font-family:'Lilita One',cursive;font-size:9px;color:#ffe080;text-shadow:1px 1px 0 #500;}
.gh-hint{font-family:'Courier New',monospace;font-size:8px;color:rgba(255,255,255,0.35);text-align:center;margin-top:2px;letter-spacing:1px;}
.gh-rbtns{display:flex;flex-direction:column;gap:4px;}
.gh-btn{font-family:'Lilita One',cursive;font-size:10px;padding:5px 12px;border-radius:8px;border:2px solid;cursor:pointer;text-align:center;box-shadow:0 3px 0 rgba(0,0,0,0.4);letter-spacing:.5px;}
.gh-pause{background:linear-gradient(180deg,#606070,#404050);border-color:#9090a0;color:#ddd;}
</style>

<div id="gh-top">
  <div>
    <div class="gh-logo">PATH RAIDERS</div>
    <div class="gh-mapname">${mapName}</div>
  </div>
  <div id="gh-center">
    <div id="gh-timer">03:00</div>
  </div>
  <div class="gh-res">
    <div class="gh-pill"><div class="gh-ri ri-g">&#128176;</div><span id="gh-gold">${this.world.gold}</span></div>
    <button id="gh-back">&#8592; LOBBY</button>
  </div>
</div>

<div id="gh-basehp">
  <div class="gh-barhp">
    <span class="bh-label">${myBaseSide === 'host' ? 'YOUR BASE' : 'ENEMY BASE'}</span>
    <span class="bh-val" id="gh-hp-host">1000 / 1000</span>
  </div>
  <div class="gh-barhp">
    <span class="bh-val" id="gh-hp-guest">1000 / 1000</span>
    <span class="bh-label">${myBaseSide === 'guest' ? 'YOUR BASE' : 'ENEMY BASE'}</span>
  </div>
</div>

<div id="gh-action">
  <div class="gh-badge">
    <div class="gh-bi">${fIcon}</div>
    <div>
      <div class="gh-bn">${fName}</div>
      <div class="gh-bs">${username}</div>
    </div>
  </div>
  <div>
    <div class="gh-slots" id="gh-slots">${slotsHTML}</div>
    <div class="gh-hint">SELECT UNIT &#8594; TAP MAP TO DEPLOY</div>
  </div>
  <div class="gh-rbtns">
    <button class="gh-btn gh-pause" id="gh-pause">&#9646;&#9646; PAUSE</button>
  </div>
</div>`

    document.body.appendChild(this.hud)

    this.goldEl   = document.getElementById('gh-gold')     as HTMLSpanElement
    this.timerEl  = document.getElementById('gh-timer')    as HTMLElement
    this.hostHPEl  = document.getElementById('gh-hp-host') as HTMLElement
    this.guestHPEl = document.getElementById('gh-hp-guest') as HTMLElement

    // Deploy slot interactions
    this.hud.querySelectorAll<HTMLElement>('.dslot:not(.locked)').forEach((el) => {
      el.addEventListener('click', () =>
        this.onDeployTap(el.dataset.uid ?? '', Number(el.dataset.cost ?? 0), el)
      )
    })

    // Pause toggle
    document.getElementById('gh-pause')?.addEventListener('click', () => {
      this.paused = !this.paused
      const btn = document.getElementById('gh-pause')!
      if (this.paused) {
        this.scene.pause()
        btn.textContent = '&#9654; RESUME'
      } else {
        this.scene.resume()
        btn.innerHTML = '&#9646;&#9646; PAUSE'
      }
    })

    // Back to lobby
    document.getElementById('gh-back')?.addEventListener('click', () => {
      this.scene.start('LobbyScene')
    })

    this.updateSlotAffordability()
  }

  private onDeployTap(unitId: string, cost: number, el: HTMLElement) {
    if (this.world.gold < cost) return
    if (this.selectedUnit === unitId) {
      this.selectedUnit = null
      this.hud.querySelectorAll('.dslot').forEach((e) => e.classList.remove('selected'))
    } else {
      this.selectedUnit = unitId
      this.hud.querySelectorAll('.dslot').forEach((e) => e.classList.remove('selected'))
      el.classList.add('selected')
    }
  }

  private updateSlotAffordability() {
    this.hud?.querySelectorAll<HTMLElement>('.dslot:not(.locked)').forEach((el) => {
      el.classList.toggle('cant-afford', this.world.gold < Number(el.dataset.cost ?? 0))
    })
  }

  private destroyHUD() {
    this.hud?.remove()
    document.getElementById('gh-result')?.remove()
  }
}
