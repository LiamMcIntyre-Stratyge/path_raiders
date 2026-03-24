import Phaser from 'phaser'
import gameState from '../lib/gameState'
import { UNITS } from '../units/UnitData'
import { Unit, COMBAT_RANGE, BASE_REACH_DMG } from '../units/Unit'
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

export const LANE_X0  = 175   // lane playfield start
export const LANE_X1  = 2385  // lane playfield end

const TOWER_XH = 155
const TOWER_XG = 2405
const BASE_CXH = 80
const BASE_CXG = 2480
const BASE_W   = 95
const BASE_H   = 460

const ZOOM  = 0.75
const VIS_W = 960 / ZOOM   // 1280

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

// ─── Tower definition ─────────────────────────────────────────────────────────
interface TowerDef {
  cx: number; cy: number; laneIdx: number
  isHostSide: boolean   // true → attacks guestUnits; false → attacks hostUnits
  range: number; dmg: number
  cd: number; maxCd: number
}

// ─── Block definition ─────────────────────────────────────────────────────────
interface BlockDef { laneIdx: number; x: number; hp: number; maxHp: number }

// ─── Scene data ───────────────────────────────────────────────────────────────
interface GameSceneData {
  roomId?: string; role?: 'host' | 'guest'; playerFaction?: Faction
}

// ─── GameScene ────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  // HUD DOM
  private hud!: HTMLDivElement
  private goldEl!: HTMLSpanElement
  private timerEl!: HTMLElement
  private hostHPEl!: HTMLElement
  private guestHPEl!: HTMLElement

  // Resource / round state
  private gold      = 200
  private timeLeft  = 180
  private goldAccum = 0
  private paused    = false

  // Base HP
  private hostBaseHP  = 1000
  private guestBaseHP = 1000

  // Units
  private hostUnits:  Unit[] = []
  private guestUnits: Unit[] = []

  // Towers
  private towers: TowerDef[] = []

  // Blockages
  private blocks: BlockDef[] = []

  // AI spawner (practice mode only)
  private aiTimer    = 0
  private aiInterval = 6000  // ms between AI unit spawns

  // Camera drag
  private dragging  = false
  private dragMoved = false
  private dragX0    = 0
  private scrollX0  = 0

  // Selected deploy unit
  private selectedUnit: string | null = null

  constructor() { super({ key: 'GameScene' }) }

  init(data: GameSceneData) {
    if (data?.roomId)        gameState.roomId        = data.roomId
    if (data?.role)          gameState.role          = data.role
    if (data?.playerFaction) gameState.playerFaction = data.playerFaction
    this.gold       = gameState.gold
    this.timeLeft   = 180
    this.paused     = false
    this.hostBaseHP = 1000
    this.guestBaseHP= 1000
    this.hostUnits  = []
    this.guestUnits = []
    this.towers     = []
    this.blocks     = []
    this.aiTimer    = 0
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

    // ── Towers ────────────────────────────────────────────────────────────────
    for (let i = 0; i < LANES.length; i++) {
      const cy = LANES[i].y + LANE_H / 2
      // Host-side tower → shoots guestUnits
      this.towers.push({ cx: TOWER_XH, cy, laneIdx: i, isHostSide: true,  range: 280, dmg: 28, cd: 0, maxCd: 1400 })
      // Guest-side tower → shoots hostUnits
      this.towers.push({ cx: TOWER_XG, cy, laneIdx: i, isHostSide: false, range: 280, dmg: 28, cd: 0, maxCd: 1400 })
    }

    // ── Draw static world ─────────────────────────────────────────────────────
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

    // Grass base + banding
    g.fillStyle(GRASS)
    g.fillRect(0, 0, WORLD_W, WORLD_H)
    g.fillStyle(GRASS_D, 0.22)
    for (let y = 0; y < WORLD_H; y += 28) g.fillRect(0, y, WORLD_W, 14)

    // Lanes
    const lw = LANE_X1 - LANE_X0
    for (const lane of LANES) {
      g.fillStyle(LANE_SH);  g.fillRect(LANE_X0, lane.y,     lw, LANE_H)
      g.fillStyle(LANE_MID); g.fillRect(LANE_X0, lane.y + 4, lw, LANE_H - 8)
      g.fillStyle(LANE_HL, 0.75); g.fillRect(LANE_X0, lane.y + 4, lw, 4)
      // Arrows
      g.fillStyle(0xffffff, 0.2)
      for (let ax = LANE_X0 + 320; ax < LANE_X1 - 200; ax += 480) {
        const my = lane.y + LANE_H / 2
        g.fillTriangle(ax + 14, my, ax - 6, my - 9, ax - 6, my + 9)
        g.fillRect(ax - 20, my - 3, 26, 6)
      }
      this.add.text(LANE_X0 + 10, lane.y + 7, `LANE ${lane.id}`, {
        fontFamily: 'Courier New, monospace', fontSize: '11px', color: '#ffffff',
      }).setAlpha(0.4)
    }

    // Faction assignments
    const pFac   = gameState.playerFaction ?? 'machines'
    const oppFac = this.opponentFaction(pFac)
    const hostFac  = gameState.role === 'guest' ? oppFac : pFac
    const guestFac = gameState.role === 'guest' ? pFac   : oppFac

    // Bases
    this.drawBase(g, BASE_CXH, WORLD_H / 2, hostFac,  gameState.role === 'host' ? 'YOU' : 'ENEMY')
    this.drawBase(g, BASE_CXG, WORLD_H / 2, guestFac, gameState.role === 'guest'? 'YOU' : 'ENEMY')

    // Towers
    for (const lane of LANES) {
      this.drawTower(g, TOWER_XH, lane.y + LANE_H / 2, hostFac)
      this.drawTower(g, TOWER_XG, lane.y + LANE_H / 2, guestFac)
    }

    // Blockages (static for now; Phase 6 will make them destructible)
    for (const bk of this.blocks) {
      const lane = LANES[bk.laneIdx]
      this.drawBlockage(g, bk.x, lane.y + LANE_H / 2, bk.hp, bk.maxHp)
    }
  }

  private drawBase(g: Phaser.GameObjects.Graphics, cx: number, cy: number, faction: string, label: string) {
    const c = fac(faction); const x = cx - BASE_W / 2; const y = cy - BASE_H / 2
    g.fillStyle(0x000000, 0.45); g.fillRect(x + 7, y + 7, BASE_W, BASE_H)
    g.fillStyle(c.fill);         g.fillRect(x, y, BASE_W, BASE_H)
    g.fillStyle(c.lite, 0.42);   g.fillRect(x, y, BASE_W, BASE_H * 0.35)
    g.lineStyle(3, c.bd, 1);     g.strokeRect(x, y, BASE_W, BASE_H)
    g.fillStyle(c.bd)
    for (let i = 0; i < 5; i++) g.fillRect(x + 5 + i * 17, y - 12, 11, 14)
    g.fillStyle(0x000000, 0.4)
    for (let row = 0; row < 3; row++) g.fillRect(cx - 10, y + 30 + row * 60, 20, 10)
    this.add.text(cx, cy - 110, label,             { fontFamily: 'Courier New, monospace', fontSize: '13px', color: '#ffffff' }).setOrigin(0.5)
    this.add.text(cx, cy - 90,  faction.toUpperCase(), { fontFamily: 'Courier New, monospace', fontSize: '10px', color: '#aaaaaa' }).setOrigin(0.5)
  }

  private drawTower(g: Phaser.GameObjects.Graphics, cx: number, cy: number, faction: string) {
    const c = fac(faction); const tw = 32; const th = 42
    const x = cx - tw / 2; const y = cy - th / 2
    g.fillStyle(0x000000, 0.4); g.fillRect(x + 4, y + 4, tw, th)
    g.fillStyle(c.fill);        g.fillRect(x, y, tw, th)
    g.fillStyle(c.lite, 0.4);   g.fillRect(x, y, tw, th * 0.45)
    g.lineStyle(2, c.bd, 1);    g.strokeRect(x, y, tw, th)
    g.fillStyle(c.bd)
    for (let i = 0; i < 3; i++) g.fillRect(x + 3 + i * 10, y - 7, 7, 9)
  }

  private drawBlockage(g: Phaser.GameObjects.Graphics, cx: number, cy: number, hp: number, maxHp: number) {
    const w = 34; const h = 34; const x = cx - w / 2; const y = cy - h / 2
    g.fillStyle(0x000000, 0.4); g.fillRect(x + 4, y + 4, w, h)
    g.fillStyle(BLK_F);         g.fillRect(x, y, w, h)
    g.fillStyle(0xffffff, 0.1); g.fillRect(x, y, w, h * 0.4)
    g.lineStyle(2, BLK_B, 1);   g.strokeRect(x, y, w, h)
    const bw = 34; const bh = 4; const bx = cx - bw / 2; const by = cy + h / 2 + 4
    g.fillStyle(0x000000, 0.6); g.fillRect(bx, by, bw, bh)
    g.fillStyle(hp / maxHp > 0.5 ? 0x50d050 : 0xd05020)
    g.fillRect(bx, by, Math.round(bw * hp / maxHp), bh)
    this.add.text(cx, by + bh + 2, `${hp}`, { fontFamily: 'Courier New, monospace', fontSize: '9px', color: '#dddddd' }).setOrigin(0.5, 0)
  }

  private opponentFaction(pFac: string): Faction {
    if (pFac === 'machines') return 'plants'
    if (pFac === 'plants')   return 'wizards'
    return 'machines'
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private setupInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging  = true
      this.dragMoved = false
      this.dragX0    = p.x
      this.scrollX0  = this.cameras.main.scrollX
    })

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return
      const dx = p.x - this.dragX0
      if (Math.abs(dx) > 8) this.dragMoved = true
      this.cameras.main.scrollX = this.scrollX0 - dx / ZOOM
    })

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragMoved && this.selectedUnit) {
        this.tryDeployAt(p.worldX, p.worldY)
      }
      this.dragging  = false
      this.dragMoved = false
    })
  }

  // ─── Deploy ─────────────────────────────────────────────────────────────────

  private tryDeployAt(_wx: number, wy: number) {
    const laneIdx = LANES.findIndex((l) => wy >= l.y && wy <= l.y + LANE_H)
    if (laneIdx === -1) return

    const def = UNITS.find((u) => u.id === this.selectedUnit)
    if (!def) return
    if (this.gold < def.cost) return

    // Deduct gold
    this.gold     -= def.cost
    gameState.gold = this.gold
    if (this.goldEl) this.goldEl.textContent = String(this.gold)
    this.updateSlotAffordability()

    // Spawn
    const role   = gameState.role ?? 'host'
    const dir: 1 | -1 = role === 'host' ? 1 : -1
    const spawnX = role === 'host' ? LANE_X0 : LANE_X1
    const spawnY = LANES[laneIdx].y + LANE_H / 2

    const unit = new Unit(this, spawnX, spawnY, def, laneIdx, dir)
    if (role === 'host') this.hostUnits.push(unit)
    else                 this.guestUnits.push(unit)

    // Deselect slot
    this.selectedUnit = null
    this.hud?.querySelectorAll('.dslot').forEach((e) => e.classList.remove('selected'))
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  update(_t: number, dt: number) {
    if (this.paused) return

    this.updateGold(dt)
    this.updateTimer(dt)
    this.updateAI(dt)
    this.updateUnits(dt)
    this.updateTowers(dt)

    // Prune destroyed containers
    this.hostUnits  = this.hostUnits.filter((u) => u.active && !u.isDead())
    this.guestUnits = this.guestUnits.filter((u) => u.active && !u.isDead())
  }

  private updateGold(dt: number) {
    this.goldAccum += dt
    if (this.goldAccum >= 2000) {
      this.goldAccum -= 2000
      this.gold = Math.min(this.gold + 10, 9999)
      gameState.gold = this.gold
      if (this.goldEl) this.goldEl.textContent = String(this.gold)
      this.updateSlotAffordability()
    }
  }

  private updateTimer(dt: number) {
    this.timeLeft = Math.max(0, this.timeLeft - dt / 1000)
    if (this.timerEl) {
      const m = Math.floor(this.timeLeft / 60)
      const s = Math.floor(this.timeLeft % 60)
      this.timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
  }

  private updateAI(dt: number) {
    // Only run AI in practice mode
    if (!gameState.roomId?.startsWith('practice-')) return

    this.aiTimer += dt
    if (this.aiTimer < this.aiInterval) return
    this.aiTimer = 0

    const pFac   = gameState.playerFaction ?? 'machines'
    const oppFac = this.opponentFaction(pFac)
    const oppPool = UNITS.filter((u) => u.faction === oppFac)
    const def     = oppPool[Math.floor(Math.random() * oppPool.length)]
    const laneIdx = Math.floor(Math.random() * LANES.length)

    const role   = gameState.role ?? 'host'
    const dir: 1 | -1 = role === 'host' ? -1 : 1
    const spawnX = role === 'host' ? LANE_X1 : LANE_X0
    const spawnY = LANES[laneIdx].y + LANE_H / 2

    const unit = new Unit(this, spawnX, spawnY, def, laneIdx, dir)
    if (role === 'host') this.guestUnits.push(unit)
    else                 this.hostUnits.push(unit)
  }

  private updateUnits(dt: number) {
    const processUnits = (movers: Unit[], enemies: Unit[]) => {
      for (const unit of movers) {
        if (!unit.active || unit.isDead()) continue

        // Find nearest opposing unit in same lane within combat range ahead
        const blocker = enemies
          .filter((e) =>
            e.active && !e.isDead() &&
            e.laneIdx === unit.laneIdx &&
            (unit.dir === 1
              ? e.x > unit.x - 10 && e.x - unit.x < COMBAT_RANGE
              : unit.x > e.x - 10 && unit.x - e.x < COMBAT_RANGE),
          )
          .sort((a, b) =>
            Math.abs(a.x - unit.x) - Math.abs(b.x - unit.x),
          )[0]

        if (blocker) {
          // Attack blocker
          unit.attackCd -= dt
          if (unit.attackCd <= 0) {
            unit.attackCd = unit.attackRate
            blocker.takeDamage(unit.def.dmg)
          }
        } else {
          // Check blockage collision (units stop at blockages too)
          const hitBlock = this.blocks.find(
            (bk) =>
              bk.hp > 0 &&
              bk.laneIdx === unit.laneIdx &&
              (unit.dir === 1
                ? bk.x > unit.x && bk.x - unit.x < COMBAT_RANGE
                : unit.x > bk.x && unit.x - bk.x < COMBAT_RANGE),
          )
          if (hitBlock) {
            unit.attackCd -= dt
            if (unit.attackCd <= 0) {
              unit.attackCd = unit.attackRate
              hitBlock.hp = Math.max(0, hitBlock.hp - unit.def.dmg)
            }
          } else {
            // Advance — check if unit reached the enemy base
            unit.advance(dt)
            if (unit.dir === 1 && unit.x >= LANE_X1) {
              this.damageBase('guest', BASE_REACH_DMG)
              unit.takeDamage(9999)
            } else if (unit.dir === -1 && unit.x <= LANE_X0) {
              this.damageBase('host', BASE_REACH_DMG)
              unit.takeDamage(9999)
            }
          }
        }
      }
    }

    processUnits(this.hostUnits,  this.guestUnits)
    processUnits(this.guestUnits, this.hostUnits)
  }

  private updateTowers(dt: number) {
    for (const tower of this.towers) {
      tower.cd = Math.max(0, tower.cd - dt)
      if (tower.cd > 0) continue

      const targets = tower.isHostSide ? this.guestUnits : this.hostUnits
      const inRange  = targets
        .filter((u) =>
          u.active && !u.isDead() &&
          u.laneIdx === tower.laneIdx &&
          Math.abs(u.x - tower.cx) <= tower.range,
        )
        .sort((a, b) => Math.abs(a.x - tower.cx) - Math.abs(b.x - tower.cx))

      if (inRange.length === 0) continue
      inRange[0].takeDamage(tower.dmg)
      tower.cd = tower.maxCd
    }
  }

  private damageBase(side: 'host' | 'guest', amount: number) {
    if (side === 'host') {
      this.hostBaseHP = Math.max(0, this.hostBaseHP - amount)
      gameState.hostBaseHp = this.hostBaseHP
      if (this.hostHPEl) this.hostHPEl.textContent = `${this.hostBaseHP} / 1000`
    } else {
      this.guestBaseHP = Math.max(0, this.guestBaseHP - amount)
      gameState.guestBaseHp = this.guestBaseHP
      if (this.guestHPEl) this.guestHPEl.textContent = `${this.guestBaseHP} / 1000`
    }
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────

  private buildHUD() {
    const faction  = gameState.playerFaction ?? 'machines'
    const fIcon    = FAC_ICON[faction]  ?? '⚔️'
    const fName    = faction.replace('_', ' ').toUpperCase()
    const username = gameState.username ?? 'PLAYER'
    const role     = gameState.role ?? 'host'

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

    // Determine which base HP the player cares about
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
  background:linear-gradient(180deg,#c8a050 0%,#a07030 40%,#8a5a20 100%);
  border-bottom:3px solid #5a3a1a;padding:6px 14px;
  display:flex;align-items:center;justify-content:space-between;
  box-shadow:0 2px 10px rgba(0,0,0,0.55);position:relative;
}
#gh-top::after{content:'';position:absolute;bottom:-6px;left:0;right:0;height:3px;background:linear-gradient(90deg,#5a3a1a,#8a6030,#5a3a1a);}
.gh-logo{font-size:16px;font-weight:900;color:#fff;text-shadow:2px 2px 0 #5a3000,-1px -1px 0 #ff8800;letter-spacing:1px;font-family:'Lilita One',cursive;}
#gh-center{display:flex;gap:8px;align-items:center;}
.gh-wave{background:linear-gradient(180deg,#e05020,#a02800);border:2px solid #ff6040;border-radius:10px;padding:4px 12px;font-family:'Lilita One',cursive;font-size:13px;color:#fff;text-shadow:1px 1px 0 #500;text-align:center;}
.gh-wave small{font-size:9px;display:block;color:#ffb090;letter-spacing:1px;}
#gh-timer{background:linear-gradient(180deg,#4080e0,#2050b0);border:2px solid #80b0ff;border-radius:10px;padding:4px 14px;font-family:'Lilita One',cursive;font-size:16px;color:#fff;text-shadow:1px 1px 0 #003;min-width:72px;text-align:center;}
.gh-res{display:flex;gap:8px;align-items:center;}
.gh-pill{display:flex;align-items:center;gap:5px;background:rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.2);border-radius:20px;padding:3px 12px 3px 5px;font-family:'Lilita One',cursive;font-size:14px;color:#fff;text-shadow:1px 1px 0 #333;}
.gh-ri{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;}
.ri-g{background:#f0a000;}.ri-d{background:#40c0a0;}
#gh-back{pointer-events:auto;position:absolute;top:50%;right:14px;transform:translateY(-50%);background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 10px;font-size:10px;color:rgba(255,255,255,0.4);cursor:pointer;letter-spacing:1px;font-family:'Courier New',monospace;}
#gh-back:hover{color:rgba(255,255,255,0.75);border-color:rgba(255,255,255,0.3);}

/* ── Base HP bars ─────────────────────────────────────────────────────────── */
#gh-basehp{
  pointer-events:none;
  position:absolute;top:52px;left:0;right:0;
  display:flex;justify-content:space-between;padding:6px 14px;
}
.gh-barhp{
  background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.15);
  border-radius:8px;padding:4px 12px;font-family:'Lilita One',cursive;font-size:11px;
  display:flex;align-items:center;gap:8px;
}
.bh-label{font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.5);}
.bh-val{color:#ffe080;}

/* ── Action bar ───────────────────────────────────────────────────────────── */
#gh-action{
  pointer-events:auto;position:absolute;bottom:0;left:0;right:0;
  background:linear-gradient(180deg,#8a6030 0%,#6a4020 100%);
  border-top:3px solid #c09050;padding:8px 14px;
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  box-shadow:0 -2px 10px rgba(0,0,0,0.55);
}
.gh-badge{background:linear-gradient(180deg,#4a80c0,#2050a0);border:2px solid #80b0ff;border-radius:12px;padding:6px 10px;display:flex;align-items:center;gap:6px;box-shadow:0 3px 0 #102050;min-width:88px;}
.gh-bi{font-size:22px;}.gh-bn{font-family:'Lilita One',cursive;font-size:11px;color:#fff;text-shadow:1px 1px 0 #003;}.gh-bs{font-size:9px;color:#a0c0ff;}
.gh-slots{display:flex;gap:6px;align-items:center;}
.dslot{width:52px;height:56px;border-radius:10px;background:linear-gradient(180deg,#5a4010,#3a2808);border:2px solid #c09050;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;box-shadow:0 3px 0 #1a0800;transition:border-color .15s,transform .12s;position:relative;}
.dslot:hover:not(.locked){border-color:#ffe080;transform:translateY(-2px);}
.dslot.locked{opacity:0.4;cursor:not-allowed;}
.dslot.selected{border-color:#ffe080;box-shadow:0 0 14px rgba(255,220,80,0.55);}
.dslot.cant-afford .ds-cost{color:#ff7070;}
.ds-icon{font-size:22px;line-height:1;}.ds-cost{font-family:'Lilita One',cursive;font-size:9px;color:#ffe080;text-shadow:1px 1px 0 #500;}
.gh-hint{font-family:'Courier New',monospace;font-size:9px;color:rgba(255,255,255,0.35);text-align:center;margin-top:3px;letter-spacing:1px;}
.gh-rbtns{display:flex;flex-direction:column;gap:5px;}
.gh-btn{font-family:'Lilita One',cursive;font-size:11px;padding:7px 14px;border-radius:8px;border:2px solid;cursor:pointer;text-align:center;box-shadow:0 3px 0 rgba(0,0,0,0.4);letter-spacing:.5px;}
.gh-spell{background:linear-gradient(180deg,#9050d0,#6020a0);border-color:#d090ff;color:#fff;text-shadow:1px 1px 0 #300;}
.gh-pause{background:linear-gradient(180deg,#606070,#404050);border-color:#9090a0;color:#ddd;}
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

<div id="gh-basehp">
  <div class="gh-barhp">
    <span class="bh-label">${myBaseSide === 'host' ? 'YOUR BASE' : 'ENEMY BASE'}</span>
    <span class="bh-val" id="gh-hp-left">1000 / 1000</span>
  </div>
  <div class="gh-barhp">
    <span class="bh-val" id="gh-hp-right">1000 / 1000</span>
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
    <div class="gh-hint">SELECT UNIT → TAP LANE TO DEPLOY</div>
  </div>
  <div class="gh-rbtns">
    <button class="gh-btn gh-spell">⚡ SPELL</button>
    <button class="gh-btn gh-pause" id="gh-pause">⏸ PAUSE</button>
  </div>
</div>`

    document.body.appendChild(this.hud)

    this.goldEl   = document.getElementById('gh-gold')   as HTMLSpanElement
    this.timerEl  = document.getElementById('gh-timer')  as HTMLElement
    // Host base is on the left side of the screen, guest on the right
    this.hostHPEl  = document.getElementById('gh-hp-left')  as HTMLElement
    this.guestHPEl = document.getElementById('gh-hp-right') as HTMLElement

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

    this.updateSlotAffordability()
  }

  private onDeployTap(unitId: string, cost: number, el: HTMLElement) {
    if (this.gold < cost) return
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
      el.classList.toggle('cant-afford', this.gold < Number(el.dataset.cost ?? 0))
    })
  }

  private destroyHUD() { this.hud?.remove() }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
