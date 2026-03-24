import Phaser from 'phaser'
import gameState from '../lib/gameState'
import { UNITS } from '../units/UnitData'
import { Unit, COMBAT_RANGE, BASE_REACH_DMG } from '../units/Unit'
import type { Faction } from '../types'
import {
  MAPS, COLS, ROWS, CELL, WORLD_W, WORLD_H,
  BASE_SLOTS, HOST_ROWS, GUEST_ROWS,
  slotWorldX, hostSpawnY, guestSpawnY,
  TERRAIN_COLOR, OVERLAY_COLOR,
} from '../maps/MapData'
import type { MapDef } from '../types'

// ─── Layout constants ─────────────────────────────────────────────────────────
const MAP_ZOOM    = 0.85
const TOP_BAR_H   = 50
const BTM_BAR_H   = 70
const CANVAS_H    = 540
const VIEWPORT_H  = CANVAS_H - TOP_BAR_H - BTM_BAR_H   // 420

// ─── Tower definition ─────────────────────────────────────────────────────────
interface TowerDef {
  cx: number; cy: number
  slotIdx: number
  isHostSide: boolean   // true → attacks guestUnits; false → attacks hostUnits
  range: number; dmg: number
  cd: number; maxCd: number
}

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
const FC: Record<string, { fill: number; lite: number; bd: number }> = {
  machines: { fill: 0x1a5090, lite: 0x3a80c0, bd: 0x70b0ff },
  plants:   { fill: 0x1a6018, lite: 0x3a9030, bd: 0x70d050 },
  wizards:  { fill: 0x501080, lite: 0x8030c0, bd: 0xb060ff },
}
const fac = (f: string) => FC[f] ?? FC.machines

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

  // AI spawner (practice mode only)
  private aiTimer    = 0
  private aiInterval = 6000  // ms between AI unit spawns

  // Selected deploy unit
  private selectedUnit: string | null = null

  // Map
  private mapDef: MapDef | null = null
  private hostSlot  = 0
  private guestSlot = 0

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

    this.gold       = gameState.gold
    this.timeLeft   = 180
    this.paused     = false
    this.hostBaseHP = 1000
    this.guestBaseHP= 1000
    this.hostUnits  = []
    this.guestUnits = []
    this.towers     = []
    this.aiTimer    = 0
  }

  create() {
    // ── Camera ────────────────────────────────────────────────────────────────
    const cam = this.cameras.main
    cam.setViewport(0, TOP_BAR_H, 960, VIEWPORT_H)
    cam.setBounds(0, 0, WORLD_W, WORLD_H)
    cam.setZoom(MAP_ZOOM)
    cam.centerOn(WORLD_W / 2, WORLD_H / 2)

    // ── Setup towers ──────────────────────────────────────────────────────────
    const TOWER_RANGE = 6 * CELL   // 216px
    const TOWER_DMG   = 25
    const TOWER_CD    = 1400

    for (let s = 0; s < 3; s++) {
      const cx = slotWorldX(s)
      // Host-side tower: between rows 13-14, attacks guest units (moving down)
      const hostTowerY = (13.5) * CELL
      this.towers.push({ cx, cy: hostTowerY, slotIdx: s, isHostSide: true,  range: TOWER_RANGE, dmg: TOWER_DMG, cd: 0, maxCd: TOWER_CD })
      // Guest-side tower: between rows 1-2, attacks host units (moving up)
      const guestTowerY = (1.5) * CELL
      this.towers.push({ cx, cy: guestTowerY, slotIdx: s, isHostSide: false, range: TOWER_RANGE, dmg: TOWER_DMG, cd: 0, maxCd: TOWER_CD })
    }

    // ── Draw world ────────────────────────────────────────────────────────────
    this.drawMapGrid()
    this.drawBasePlacements()
    this.drawTowers()

    // ── Input ─────────────────────────────────────────────────────────────────
    this.setupInput()

    // ── HUD ───────────────────────────────────────────────────────────────────
    this.buildHUD()

    this.events.on('shutdown', () => this.destroyHUD())
    this.events.on('destroy',  () => this.destroyHUD())
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

        // Overlay tint
        if (overlay && overlay !== null) {
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
    const pFac   = gameState.playerFaction ?? 'machines'
    const oppFac = this.opponentFaction(pFac)
    const hostFac  = role === 'guest' ? oppFac : pFac
    const guestFac = role === 'guest' ? pFac   : oppFac

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

  private drawTowers() {
    const g = this.add.graphics()
    g.setDepth(3)

    const role    = gameState.role ?? 'host'
    const pFac    = gameState.playerFaction ?? 'machines'
    const oppFac  = this.opponentFaction(pFac)
    const hostFac  = role === 'guest' ? oppFac : pFac
    const guestFac = role === 'guest' ? pFac   : oppFac

    for (const tower of this.towers) {
      const faction = tower.isHostSide ? hostFac : guestFac
      const c = fac(faction)
      const tw = 28, th = 28
      const x = tower.cx - tw / 2
      const y = tower.cy - th / 2
      g.fillStyle(0x000000, 0.4); g.fillRect(x + 3, y + 3, tw, th)
      g.fillStyle(c.fill, 1);     g.fillRect(x, y, tw, th)
      g.fillStyle(c.lite, 0.4);   g.fillRect(x, y, tw, th * 0.45)
      g.lineStyle(2, c.bd, 1);    g.strokeRect(x, y, tw, th)
      // Battlements
      g.fillStyle(c.bd, 1)
      for (let i = 0; i < 3; i++) g.fillRect(x + 2 + i * 9, y - 6, 6, 8)
    }
  }

  private opponentFaction(pFac: string): Faction {
    if (pFac === 'machines') return 'plants'
    if (pFac === 'plants')   return 'wizards'
    return 'machines'
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
    if (this.gold < def.cost) return

    this.gold     -= def.cost
    gameState.gold = this.gold
    if (this.goldEl) this.goldEl.textContent = String(this.gold)
    this.updateSlotAffordability()

    const role   = gameState.role ?? 'host'
    const dir: 1 | -1 = role === 'host' ? -1 : 1  // host moves UP (-1), guest moves DOWN (+1)
    const spawnX = slotWorldX(nearestSlot)
    const spawnY = role === 'host' ? hostSpawnY() : guestSpawnY()

    const unit = new Unit(this, spawnX, spawnY, def, nearestSlot, dir)
    if (role === 'host') this.hostUnits.push(unit)
    else                 this.guestUnits.push(unit)

    // Deselect
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
    if (!gameState.roomId?.startsWith('practice-')) return

    this.aiTimer += dt
    if (this.aiTimer < this.aiInterval) return
    this.aiTimer = 0

    const pFac   = gameState.playerFaction ?? 'machines'
    const oppFac = this.opponentFaction(pFac)
    const oppPool = UNITS.filter((u) => u.faction === oppFac)
    const def     = oppPool[Math.floor(Math.random() * oppPool.length)]

    // AI spawns from a random slot
    const slotIdx = Math.floor(Math.random() * 3)

    const role   = gameState.role ?? 'host'
    // AI is the opponent: if player is host (dir=-1), AI is guest (dir=+1)
    const aiDir: 1 | -1 = role === 'host' ? 1 : -1
    const spawnX = slotWorldX(slotIdx)
    const spawnY = role === 'host' ? guestSpawnY() : hostSpawnY()

    const unit = new Unit(this, spawnX, spawnY, def, slotIdx, aiDir)
    if (role === 'host') this.guestUnits.push(unit)
    else                 this.hostUnits.push(unit)
  }

  private updateUnits(dt: number) {
    const processUnits = (movers: Unit[], enemies: Unit[]) => {
      for (const unit of movers) {
        if (!unit.active || unit.isDead()) continue

        // Find nearest opposing unit in same slot within combat range on Y axis
        const blocker = enemies
          .filter((e) =>
            e.active && !e.isDead() &&
            e.laneSlot === unit.laneSlot &&
            (unit.dir === -1
              // host unit moving up: enemy must be above (lower y) and within range
              ? e.y < unit.y && unit.y - e.y < COMBAT_RANGE
              // guest unit moving down: enemy must be below (higher y) and within range
              : e.y > unit.y && e.y - unit.y < COMBAT_RANGE),
          )
          .sort((a, b) => Math.abs(a.y - unit.y) - Math.abs(b.y - unit.y))[0]

        if (blocker) {
          unit.attackCd -= dt
          if (unit.attackCd <= 0) {
            unit.attackCd = unit.attackRate
            blocker.takeDamage(unit.def.dmg)
          }
        } else {
          // Advance — check if unit reached the enemy base
          unit.advance(dt)

          // Host unit (dir=-1, moving up) reaches guest base when y <= row 1 * CELL
          if (unit.dir === -1 && unit.y <= GUEST_ROWS[1] * CELL) {
            this.damageBase('guest', BASE_REACH_DMG)
            unit.takeDamage(9999)
          }
          // Guest unit (dir=+1, moving down) reaches host base when y >= row 14 * CELL
          else if (unit.dir === 1 && unit.y >= HOST_ROWS[0] * CELL) {
            this.damageBase('host', BASE_REACH_DMG)
            unit.takeDamage(9999)
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

      // Host-side tower attacks guest units; guest-side tower attacks host units
      const targets = tower.isHostSide ? this.guestUnits : this.hostUnits
      const inRange  = targets
        .filter((u) =>
          u.active && !u.isDead() &&
          u.laneSlot === tower.slotIdx &&
          Math.abs(u.y - tower.cy) <= tower.range,
        )
        .sort((a, b) => Math.abs(a.y - tower.cy) - Math.abs(b.y - tower.cy))

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
    const fIcon    = FAC_ICON[faction]  ?? '&#9876;'
    const fName    = faction.replace('_', ' ').toUpperCase()
    const username = gameState.username ?? 'PLAYER'
    const role     = gameState.role ?? 'host'
    const mapName  = this.mapDef?.name ?? 'MAP'

    const deployable = UNITS.filter((u) => u.faction === faction)
    const slotsHTML  = deployable.map((u) => {
      const icon   = UNIT_ICON[u.id] ?? '?'
      const locked = !gameState.unlockedUnits.includes(u.id)
      return `
        <div class="dslot${locked ? ' locked' : ''}"
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
    <div class="gh-pill"><div class="gh-ri ri-g">&#128176;</div><span id="gh-gold">${this.gold}</span></div>
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
