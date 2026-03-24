import Phaser from 'phaser'
import gameState from '../lib/gameState'
import { UNITS } from '../units/UnitData'
import type { Faction } from '../types'

// ─── World layout ─────────────────────────────────────────────────────────────
export const WORLD_W  = 2560
export const WORLD_H  = 720
export const LANE_H   = 60

export const LANES = [
  { id: 'A', y: 150 },
  { id: 'B', y: 330 },
  { id: 'C', y: 510 },
] as const

export const LANE_X0  = 175   // lane playfield start (after host base + towers)
export const LANE_X1  = 2385  // lane playfield end   (before guest base + towers)

const TOWER_XH = 155          // host-side tower centre X
const TOWER_XG = 2405         // guest-side tower centre X
const BASE_CXH = 80           // host base centre X
const BASE_CXG = 2480         // guest base centre X
const BASE_W   = 95
const BASE_H   = 460

const ZOOM  = 0.75
const VIS_W = 960 / ZOOM      // 1280 — visible world width at this zoom

// ─── Palette ──────────────────────────────────────────────────────────────────
const GRASS   = 0x2d5a1b
const GRASS_D = 0x255018
const LANE_SH = 0xb07830
const LANE_MID= 0xc09040
const LANE_HL = 0xd4a855
const BLK_F   = 0x786858
const BLK_B   = 0xb0a070

const FC: Record<string, { fill: number; lite: number; bd: number }> = {
  machines: { fill: 0x1a5090, lite: 0x3a80c0, bd: 0x70b0ff },
  plants:   { fill: 0x1a6018, lite: 0x3a9030, bd: 0x70d050 },
  wizards:  { fill: 0x501080, lite: 0x8030c0, bd: 0xb060ff },
}
const fac = (f: string) => FC[f] ?? FC.machines

// ─── Icon maps ────────────────────────────────────────────────────────────────
const FAC_ICON: Record<string, string>  = { machines: '⚙️', plants: '🌿', wizards: '✨' }
const UNIT_ICON: Record<string, string> = {
  scout_drone: '🤖', assault_bot: '⚙️',
  vine_crawler: '🌱', thorn_beast: '🐛',
  apprentice_mage: '✨', elementalist: '🧙',
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GameSceneData {
  roomId?: string
  role?: 'host' | 'guest'
  playerFaction?: Faction
}

interface BlockDef {
  laneIdx: number
  x: number
  hp: number
  maxHp: number
}

// ─── Scene ────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  // HUD DOM
  private hud!: HTMLDivElement
  private goldEl!: HTMLSpanElement
  private timerEl!: HTMLElement

  // Game state
  private gold      = 200
  private timeLeft  = 180
  private goldAccum = 0
  private paused    = false

  // Camera drag
  private dragging  = false
  private dragX0    = 0
  private scrollX0  = 0

  // Blockages (extended in Phase 5)
  private blocks: BlockDef[] = []

  // Selected deploy unit
  private selectedUnit: string | null = null

  constructor() { super({ key: 'GameScene' }) }

  init(data: GameSceneData) {
    if (data?.roomId)        gameState.roomId        = data.roomId
    if (data?.role)          gameState.role          = data.role
    if (data?.playerFaction) gameState.playerFaction = data.playerFaction
    this.gold     = gameState.gold
    this.timeLeft = 180
    this.paused   = false
  }

  create() {
    // ── Camera ────────────────────────────────────────────────────────────────
    const cam = this.cameras.main
    cam.setBounds(0, 0, WORLD_W, WORLD_H)
    cam.setZoom(ZOOM)
    cam.scrollY = 0
    cam.scrollX = (gameState.role === 'guest') ? WORLD_W - VIS_W : 0

    // ── Blockages ─────────────────────────────────────────────────────────────
    this.blocks = [
      { laneIdx: 0, x: lerp(LANE_X0, LANE_X1, 0.25), hp: 45, maxHp: 45 },
      { laneIdx: 0, x: lerp(LANE_X0, LANE_X1, 0.58), hp: 80, maxHp: 80 },
      { laneIdx: 1, x: lerp(LANE_X0, LANE_X1, 0.42), hp: 60, maxHp: 60 },
      { laneIdx: 2, x: lerp(LANE_X0, LANE_X1, 0.21), hp: 30, maxHp: 30 },
      { laneIdx: 2, x: lerp(LANE_X0, LANE_X1, 0.62), hp: 70, maxHp: 70 },
    ]

    // ── Draw world ────────────────────────────────────────────────────────────
    this.drawWorld()

    // ── Input ─────────────────────────────────────────────────────────────────
    this.setupInput()

    // ── HUD ───────────────────────────────────────────────────────────────────
    this.buildHUD()

    this.events.on('shutdown', () => this.destroyHUD())
    this.events.on('destroy',  () => this.destroyHUD())
  }

  // ─── World drawing ──────────────────────────────────────────────────────────

  private drawWorld() {
    const g = this.add.graphics()

    // Grass base
    g.fillStyle(GRASS)
    g.fillRect(0, 0, WORLD_W, WORLD_H)

    // Subtle horizontal banding
    g.fillStyle(GRASS_D, 0.22)
    for (let y = 0; y < WORLD_H; y += 28) {
      g.fillRect(0, y, WORLD_W, 14)
    }

    // ── Lanes ─────────────────────────────────────────────────────────────────
    const lw = LANE_X1 - LANE_X0
    for (const lane of LANES) {
      // Shadow edge
      g.fillStyle(LANE_SH)
      g.fillRect(LANE_X0, lane.y, lw, LANE_H)
      // Main body
      g.fillStyle(LANE_MID)
      g.fillRect(LANE_X0, lane.y + 4, lw, LANE_H - 8)
      // Top highlight strip
      g.fillStyle(LANE_HL, 0.75)
      g.fillRect(LANE_X0, lane.y + 4, lw, 4)

      // Direction arrows (host→guest direction = rightward)
      g.fillStyle(0xffffff, 0.2)
      for (let ax = LANE_X0 + 320; ax < LANE_X1 - 200; ax += 480) {
        const my = lane.y + LANE_H / 2
        g.fillTriangle(ax + 14, my, ax - 6, my - 9, ax - 6, my + 9)
        g.fillRect(ax - 20, my - 3, 26, 6)
      }

      // Lane label
      this.add.text(LANE_X0 + 10, lane.y + 7, `LANE ${lane.id}`, {
        fontFamily: 'Courier New, monospace',
        fontSize: '11px',
        color: '#ffffff',
      }).setAlpha(0.4)
    }

    // ── Determine each base faction ───────────────────────────────────────────
    const pFac   = gameState.playerFaction ?? 'machines'
    const oppFac = this.opponentFaction(pFac)
    const hostFac  = (gameState.role === 'guest') ? oppFac : pFac
    const guestFac = (gameState.role === 'guest') ? pFac   : oppFac

    // ── Bases ─────────────────────────────────────────────────────────────────
    this.drawBase(g, BASE_CXH, WORLD_H / 2, hostFac,
      gameState.role === 'host' ? 'YOU' : 'ENEMY')
    this.drawBase(g, BASE_CXG, WORLD_H / 2, guestFac,
      gameState.role === 'guest' ? 'YOU' : 'ENEMY')

    // ── Towers ────────────────────────────────────────────────────────────────
    for (const lane of LANES) {
      this.drawTower(g, TOWER_XH, lane.y + LANE_H / 2, hostFac)
      this.drawTower(g, TOWER_XG, lane.y + LANE_H / 2, guestFac)
    }

    // ── Blockages ─────────────────────────────────────────────────────────────
    for (const bk of this.blocks) {
      const lane = LANES[bk.laneIdx]
      this.drawBlockage(g, bk.x, lane.y + LANE_H / 2, bk.hp, bk.maxHp)
    }

    // ── Base HP labels (static — Phase 6 makes them dynamic) ─────────────────
    const hpY = WORLD_H / 2 + BASE_H / 2 + 20
    this.drawHPLabel(BASE_CXH, hpY, gameState.hostBaseHp,  1000)
    this.drawHPLabel(BASE_CXG, hpY, gameState.guestBaseHp, 1000)
  }

  private drawBase(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
    faction: string,
    label: string,
  ) {
    const c  = fac(faction)
    const x  = cx - BASE_W / 2
    const y  = cy - BASE_H / 2

    // Drop shadow
    g.fillStyle(0x000000, 0.45)
    g.fillRect(x + 7, y + 7, BASE_W, BASE_H)

    // Body
    g.fillStyle(c.fill)
    g.fillRect(x, y, BASE_W, BASE_H)

    // Upper lighter band
    g.fillStyle(c.lite, 0.42)
    g.fillRect(x, y, BASE_W, BASE_H * 0.35)

    // Border
    g.lineStyle(3, c.bd, 1)
    g.strokeRect(x, y, BASE_W, BASE_H)

    // Crenellations
    g.fillStyle(c.bd)
    for (let i = 0; i < 5; i++) {
      g.fillRect(x + 5 + i * 17, y - 12, 11, 14)
    }

    // Diagonal window slits
    g.fillStyle(0x000000, 0.4)
    for (let row = 0; row < 3; row++) {
      const wy = y + 30 + row * 60
      g.fillRect(cx - 10, wy, 20, 10)
    }

    // Labels
    this.add.text(cx, cy - 110, label, {
      fontFamily: 'Courier New, monospace',
      fontSize: '13px',
      color: '#ffffff',
    }).setOrigin(0.5)
    this.add.text(cx, cy - 90, faction.toUpperCase(), {
      fontFamily: 'Courier New, monospace',
      fontSize: '10px',
      color: '#aaaaaa',
    }).setOrigin(0.5)
  }

  private drawTower(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
    faction: string,
  ) {
    const c  = fac(faction)
    const tw = 32, th = 42
    const x  = cx - tw / 2, y = cy - th / 2

    g.fillStyle(0x000000, 0.4)
    g.fillRect(x + 4, y + 4, tw, th)

    g.fillStyle(c.fill)
    g.fillRect(x, y, tw, th)

    g.fillStyle(c.lite, 0.4)
    g.fillRect(x, y, tw, th * 0.45)

    g.lineStyle(2, c.bd, 1)
    g.strokeRect(x, y, tw, th)

    // Mini crenellations
    g.fillStyle(c.bd)
    for (let i = 0; i < 3; i++) {
      g.fillRect(x + 3 + i * 10, y - 7, 7, 9)
    }
  }

  private drawBlockage(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
    hp: number, maxHp: number,
  ) {
    const w = 34, h = 34
    const x = cx - w / 2, y = cy - h / 2

    g.fillStyle(0x000000, 0.4)
    g.fillRect(x + 4, y + 4, w, h)

    g.fillStyle(BLK_F)
    g.fillRect(x, y, w, h)

    g.fillStyle(0xffffff, 0.1)
    g.fillRect(x, y, w, h * 0.4)

    g.lineStyle(2, BLK_B, 1)
    g.strokeRect(x, y, w, h)

    // HP bar below
    const bw = 34, bh = 4
    const bx = cx - bw / 2, by = cy + h / 2 + 4
    g.fillStyle(0x000000, 0.6)
    g.fillRect(bx, by, bw, bh)
    g.fillStyle(hp / maxHp > 0.5 ? 0x50d050 : 0xd05020)
    g.fillRect(bx, by, Math.round(bw * hp / maxHp), bh)

    this.add.text(cx, by + bh + 2, `${hp}`, {
      fontFamily: 'Courier New, monospace',
      fontSize: '9px',
      color: '#dddddd',
    }).setOrigin(0.5, 0)
  }

  private drawHPLabel(cx: number, y: number, hp: number, max: number) {
    this.add.text(cx, y, `${hp} / ${max}`, {
      fontFamily: 'Courier New, monospace',
      fontSize: '11px',
      color: '#ffffaa',
      backgroundColor: '#00000099',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0)
  }

  private opponentFaction(playerFaction: string): Faction {
    if (playerFaction === 'machines') return 'plants'
    if (playerFaction === 'plants')   return 'wizards'
    return 'machines'
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private setupInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true
      this.dragX0   = p.x
      this.scrollX0 = this.cameras.main.scrollX
    })

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return
      const dx = p.x - this.dragX0
      this.cameras.main.scrollX = this.scrollX0 - dx / ZOOM
    })

    this.input.on('pointerup', () => {
      this.dragging = false
    })
  }

  // ─── Update loop ────────────────────────────────────────────────────────────

  update(_t: number, dt: number) {
    // Passive gold: +10 every 2 s
    this.goldAccum += dt
    if (this.goldAccum >= 2000) {
      this.goldAccum -= 2000
      this.gold = Math.min(this.gold + 10, 9999)
      gameState.gold = this.gold
      if (this.goldEl) this.goldEl.textContent = String(this.gold)
    }

    // Countdown timer
    this.timeLeft = Math.max(0, this.timeLeft - dt / 1000)
    if (this.timerEl) {
      const m = Math.floor(this.timeLeft / 60)
      const s = Math.floor(this.timeLeft % 60)
      this.timerEl.textContent =
        `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────

  private buildHUD() {
    const faction  = gameState.playerFaction ?? 'machines'
    const fIcon    = FAC_ICON[faction]  ?? '⚔️'
    const fName    = faction.replace('_', ' ').toUpperCase()
    const username = gameState.username ?? 'PLAYER'

    const deployable = UNITS.filter((u) => u.faction === faction)
    const slotsHTML  = deployable.map((u) => {
      const icon   = UNIT_ICON[u.id] ?? '❓'
      const locked = !gameState.unlockedUnits.includes(u.id)
      return `
        <div class="dslot${locked ? ' locked' : ''}"
          data-uid="${u.id}" data-cost="${u.cost}"
          title="${u.name} — ${u.cost}g">
          <div class="ds-icon">${icon}</div>
          <div class="ds-cost">${u.cost}g</div>
        </div>`
    }).join('')

    this.hud = document.createElement('div')
    this.hud.id = 'game-hud'
    this.hud.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap');
#game-hud{
  position:fixed;inset:0;pointer-events:none;
  font-family:'Nunito','Lilita One',sans-serif;z-index:50;
}
/* ── Top bar ─────────────────────────────────────────────────────── */
#gh-top{
  pointer-events:auto;
  background:linear-gradient(180deg,#c8a050 0%,#a07030 40%,#8a5a20 100%);
  border-bottom:3px solid #5a3a1a;
  padding:6px 14px;
  display:flex;align-items:center;justify-content:space-between;
  box-shadow:0 2px 10px rgba(0,0,0,0.55);
  position:relative;
}
#gh-top::after{
  content:'';position:absolute;bottom:-6px;left:0;right:0;
  height:3px;background:linear-gradient(90deg,#5a3a1a,#8a6030,#5a3a1a);
}
.gh-logo{
  font-size:16px;font-weight:900;color:#fff;
  text-shadow:2px 2px 0 #5a3000,-1px -1px 0 #ff8800;letter-spacing:1px;
  font-family:'Lilita One',cursive;
}
#gh-center{display:flex;gap:8px;align-items:center;}
.gh-wave{
  background:linear-gradient(180deg,#e05020,#a02800);border:2px solid #ff6040;
  border-radius:10px;padding:4px 12px;
  font-family:'Lilita One',cursive;font-size:13px;color:#fff;
  text-shadow:1px 1px 0 #500;text-align:center;
}
.gh-wave small{font-size:9px;display:block;color:#ffb090;letter-spacing:1px;}
#gh-timer{
  background:linear-gradient(180deg,#4080e0,#2050b0);border:2px solid #80b0ff;
  border-radius:10px;padding:4px 14px;
  font-family:'Lilita One',cursive;font-size:16px;color:#fff;
  text-shadow:1px 1px 0 #003;min-width:72px;text-align:center;
}
.gh-res{display:flex;gap:8px;align-items:center;}
.gh-pill{
  display:flex;align-items:center;gap:5px;
  background:rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.2);
  border-radius:20px;padding:3px 12px 3px 5px;
  font-family:'Lilita One',cursive;font-size:14px;color:#fff;
  text-shadow:1px 1px 0 #333;
}
.gh-ri{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;}
.ri-g{background:#f0a000;} .ri-d{background:#40c0a0;}
/* ── Action bar ──────────────────────────────────────────────────── */
#gh-action{
  pointer-events:auto;
  position:absolute;bottom:0;left:0;right:0;
  background:linear-gradient(180deg,#8a6030 0%,#6a4020 100%);
  border-top:3px solid #c09050;
  padding:8px 14px;
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  box-shadow:0 -2px 10px rgba(0,0,0,0.55);
}
.gh-badge{
  background:linear-gradient(180deg,#4a80c0,#2050a0);border:2px solid #80b0ff;
  border-radius:12px;padding:6px 10px;display:flex;align-items:center;gap:6px;
  box-shadow:0 3px 0 #102050;min-width:88px;
}
.gh-bi{font-size:22px;} .gh-bn{font-family:'Lilita One',cursive;font-size:11px;color:#fff;text-shadow:1px 1px 0 #003;}
.gh-bs{font-size:9px;color:#a0c0ff;}
.gh-slots{display:flex;gap:6px;align-items:center;}
.dslot{
  width:52px;height:56px;border-radius:10px;
  background:linear-gradient(180deg,#5a4010,#3a2808);border:2px solid #c09050;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  cursor:pointer;box-shadow:0 3px 0 #1a0800;
  transition:border-color .15s,transform .12s;position:relative;
}
.dslot:hover:not(.locked){border-color:#ffe080;transform:translateY(-2px);}
.dslot.locked{opacity:0.4;cursor:not-allowed;}
.dslot.selected{border-color:#ffe080;box-shadow:0 0 14px rgba(255,220,80,0.55);}
.dslot.cant-afford .ds-cost{color:#ff7070;}
.ds-icon{font-size:22px;line-height:1;} .ds-cost{font-family:'Lilita One',cursive;font-size:9px;color:#ffe080;text-shadow:1px 1px 0 #500;}
.gh-rbtns{display:flex;flex-direction:column;gap:5px;}
.gh-btn{
  font-family:'Lilita One',cursive;font-size:11px;padding:7px 14px;
  border-radius:8px;border:2px solid;cursor:pointer;text-align:center;
  box-shadow:0 3px 0 rgba(0,0,0,0.4);letter-spacing:.5px;
}
.gh-spell{background:linear-gradient(180deg,#9050d0,#6020a0);border-color:#d090ff;color:#fff;text-shadow:1px 1px 0 #300;}
.gh-pause{background:linear-gradient(180deg,#606070,#404050);border-color:#9090a0;color:#ddd;}
/* ── Back (dev) ───────────────────────────────────────────────────── */
#gh-back{
  pointer-events:auto;
  position:absolute;top:50%;right:14px;transform:translateY(-50%);
  background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.15);
  border-radius:6px;padding:4px 10px;font-size:10px;
  color:rgba(255,255,255,0.4);cursor:pointer;letter-spacing:1px;
  font-family:'Courier New',monospace;
}
#gh-back:hover{color:rgba(255,255,255,0.75);border-color:rgba(255,255,255,0.35);}
</style>

<div id="gh-top">
  <div class="gh-logo">PATH RAIDERS</div>
  <div id="gh-center">
    <div class="gh-wave">WAVE 1<small>OF 10</small></div>
    <div id="gh-timer">03:00</div>
  </div>
  <div class="gh-res">
    <div class="gh-pill"><div class="gh-ri ri-g">💰</div><span id="gh-gold">200</span></div>
    <div class="gh-pill"><div class="gh-ri ri-d">💎</div>0</div>
    <button id="gh-back">← LOBBY</button>
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
  <div class="gh-slots" id="gh-slots">${slotsHTML}</div>
  <div class="gh-rbtns">
    <button class="gh-btn gh-spell">⚡ SPELL</button>
    <button class="gh-btn gh-pause" id="gh-pause">⏸ PAUSE</button>
  </div>
</div>`

    document.body.appendChild(this.hud)

    // Cache live elements
    this.goldEl  = document.getElementById('gh-gold')  as HTMLSpanElement
    this.timerEl = document.getElementById('gh-timer') as HTMLElement

    // Deploy slot clicks
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
        btn.textContent = '▶ RESUME'
      } else {
        this.scene.resume()
        btn.textContent = '⏸ PAUSE'
      }
    })

    // Back to lobby
    document.getElementById('gh-back')?.addEventListener('click', () => {
      this.scene.start('LobbyScene')
    })

    // Keep slot affordability styling in sync
    this.updateSlotAffordability()
  }

  private onDeployTap(unitId: string, cost: number, el: HTMLElement) {
    if (this.gold < cost) return

    if (this.selectedUnit === unitId) {
      // Deselect
      this.selectedUnit = null
      this.hud.querySelectorAll('.dslot').forEach((e) => e.classList.remove('selected'))
    } else {
      // Select
      this.selectedUnit = unitId
      this.hud.querySelectorAll('.dslot').forEach((e) => e.classList.remove('selected'))
      el.classList.add('selected')
    }
    // Phase 5: pointer click on a lane will spawn the selected unit
  }

  private updateSlotAffordability() {
    this.hud?.querySelectorAll<HTMLElement>('.dslot:not(.locked)').forEach((el) => {
      const cost = Number(el.dataset.cost ?? 0)
      el.classList.toggle('cant-afford', this.gold < cost)
    })
  }

  private destroyHUD() {
    this.hud?.remove()
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
