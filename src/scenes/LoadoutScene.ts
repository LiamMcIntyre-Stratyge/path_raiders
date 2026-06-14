import Phaser from 'phaser'
import gameState from '../lib/gameState'
import { UNITS, resolveUnitStats } from '../units/UnitData'

const MAX_SLOTS = 3

interface LaunchParams {
  roomId: string
  role: 'host' | 'guest'
  playerFaction: string
  mapId: number
  hostSlot: number
  guestSlot: number
  // P12: per-side level maps (optional; absent = all level 1, D-15)
  hostUnitLevels?: Record<string, number>
  guestUnitLevels?: Record<string, number>
  hostTowerLevel?: number
  guestTowerLevel?: number
}

const FAC_COLOR: Record<string, string> = {
  machines: '#60A5FA',
  plants:   '#4ADE80',
  wizards:  '#C084FC',
}

const UNIT_ICON: Record<string, string> = {
  scout_drone:     '🤖',
  assault_bot:     '🦾',
  vine_crawler:    '🌿',
  thorn_beast:     '🌵',
  apprentice_mage: '🔮',
  elementalist:    '✨',
}

export class LoadoutScene extends Phaser.Scene {
  private overlay!: HTMLDivElement
  private params!: LaunchParams
  private selected: Set<string> = new Set()

  constructor() { super({ key: 'LoadoutScene' }) }

  init(data: LaunchParams) {
    this.params   = data
    this.selected = new Set()
  }

  create() {
    this.overlay    = document.createElement('div')
    this.overlay.id = 'loadout-overlay'
    document.body.appendChild(this.overlay)
    this.events.on('shutdown', () => this.overlay?.remove())
    this.events.on('destroy',  () => this.overlay?.remove())
    this.buildUI()
  }

  // ─── UI ──────────────────────────────────────────────────────────────────────

  private buildUI() {
    const faction   = gameState.playerFaction ?? 'machines'
    const facColor  = FAC_COLOR[faction] ?? '#c8b87a'
    const factionUnits = UNITS.filter(u => u.faction === faction)

    // Pre-select all unlocked units (up to MAX_SLOTS)
    for (const u of factionUnits) {
      if (gameState.unlockedUnits.includes(u.id) && this.selected.size < MAX_SLOTS) {
        this.selected.add(u.id)
      }
    }

    this.overlay.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap');
#loadout-overlay{
  position:fixed;inset:0;background:#07090f;
  font-family:'Nunito',sans-serif;color:#c8b87a;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  z-index:200;gap:18px;padding:20px;overflow:auto;
}
.lo-title{font-family:'Lilita One',cursive;font-size:22px;color:${facColor};letter-spacing:3px;text-shadow:0 0 20px ${facColor}44;text-align:center;}
.lo-sub{font-family:'Courier New',monospace;font-size:10px;color:#3a4a2a;letter-spacing:3px;text-align:center;margin-top:-10px;}
.lo-hint{font-family:'Courier New',monospace;font-size:9px;color:#4a5a3a;letter-spacing:2px;text-align:center;}
#lo-counter{font-family:'Lilita One',cursive;font-size:13px;color:${facColor};letter-spacing:2px;text-align:center;}
.lo-cards{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:520px;}
.lo-card{
  width:140px;border-radius:14px;
  background:rgba(0,0,0,0.45);border:2px solid #2a3428;
  display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:14px 10px 10px;cursor:pointer;transition:all 0.18s;position:relative;
}
.lo-card:hover:not(.lo-locked){border-color:${facColor}88;transform:translateY(-3px);}
.lo-card.lo-selected{
  border-color:${facColor};
  box-shadow:0 0 18px ${facColor}44;
  background:rgba(0,0,0,0.65);
}
.lo-card.lo-locked{opacity:0.38;cursor:not-allowed;}
.lo-lock{position:absolute;top:6px;right:8px;font-size:11px;color:#666;}
.lo-check{
  position:absolute;top:6px;left:8px;
  width:16px;height:16px;border-radius:50%;
  background:${facColor};display:flex;align-items:center;justify-content:center;
  font-size:10px;color:#07090f;font-weight:900;
  opacity:0;transition:opacity 0.15s;
}
.lo-card.lo-selected .lo-check{opacity:1;}
.lo-icon{font-size:32px;line-height:1;}
.lo-name{font-family:'Lilita One',cursive;font-size:12px;color:#e8d8a0;letter-spacing:1px;text-align:center;}
.lo-tier{font-family:'Courier New',monospace;font-size:8px;color:${facColor}99;letter-spacing:2px;}
.lo-stats{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;width:100%;margin-top:4px;}
.lo-stat{font-family:'Courier New',monospace;font-size:8px;color:#5a7a5a;letter-spacing:1px;}
.lo-stat span{color:#c8b87a;}
.lo-cost{font-family:'Lilita One',cursive;font-size:11px;color:#f0c050;margin-top:2px;}
.lo-unlock-hint{font-family:'Courier New',monospace;font-size:8px;color:#4a3a2a;text-align:center;margin-top:2px;letter-spacing:1px;}
#lo-confirm{
  padding:13px 52px;border-radius:12px;
  background:linear-gradient(135deg,#8a6518,#d4a030);
  border:2px solid #f0c050;color:#07090f;
  font-family:'Lilita One',cursive;font-size:15px;letter-spacing:3px;cursor:pointer;
  box-shadow:0 4px 0 #4a3008;transition:opacity 0.2s,filter 0.15s;
}
#lo-confirm:not(:disabled):hover{filter:brightness(1.1);}
#lo-confirm:disabled{opacity:0.35;cursor:not-allowed;}
</style>

<div class="lo-title">&#9876; CHOOSE YOUR UNITS &#9876;</div>
<div class="lo-sub">SELECT UP TO ${MAX_SLOTS} UNITS FOR BATTLE</div>
<div id="lo-counter"></div>

<div class="lo-cards" id="lo-cards">
${factionUnits.map(u => {
  const locked  = !gameState.unlockedUnits.includes(u.id)
  const sel     = this.selected.has(u.id)
  const unWins  = u.id === 'assault_bot' ? 2 : u.id === 'thorn_beast' ? 3 : u.id === 'elementalist' ? 5 : 0
  // P12: resolve effective stats from the player's level (Pitfall 6 fix)
  const ownRole  = this.params?.role ?? gameState.role ?? 'host'
  const ownMap   = ownRole === 'host' ? this.params?.hostUnitLevels : this.params?.guestUnitLevels
  const unitLvl  = ownMap?.[u.id] ?? 1
  const stats    = resolveUnitStats(u.id, unitLvl)
  return `
  <div class="lo-card${sel ? ' lo-selected' : ''}${locked ? ' lo-locked' : ''}" data-uid="${u.id}">
    <div class="lo-check">✓</div>
    ${locked ? `<div class="lo-lock">🔒</div>` : ''}
    <div class="lo-icon">${UNIT_ICON[u.id] ?? '?'}</div>
    <div class="lo-name">${u.name}</div>
    <div class="lo-tier">TIER ${u.tier}</div>
    <div class="lo-stats">
      <div class="lo-stat">HP <span>${stats.hp}</span></div>
      <div class="lo-stat">DMG <span>${stats.dmg}</span></div>
      <div class="lo-stat">SPD <span>${u.speed}</span></div>
      <div class="lo-stat">COST <span>${u.cost}g</span></div>
    </div>
    ${locked ? `<div class="lo-unlock-hint">UNLOCK AT ${unWins}W</div>` : ''}
  </div>`
}).join('')}
</div>

<button id="lo-confirm">DEPLOY</button>
<div class="lo-hint">YOUR UNITS WILL APPEAR IN THE ACTION BAR</div>`

    this.updateCounter()

    // Card click handlers
    document.querySelectorAll<HTMLElement>('.lo-card:not(.lo-locked)').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.uid!
        if (this.selected.has(uid)) {
          this.selected.delete(uid)
          el.classList.remove('lo-selected')
        } else {
          if (this.selected.size >= MAX_SLOTS) return
          this.selected.add(uid)
          el.classList.add('lo-selected')
        }
        this.updateCounter()
      })
    })

    document.getElementById('lo-confirm')!.addEventListener('click', () => {
      if (this.selected.size === 0) return
      gameState.loadout = [...this.selected]
      this.scene.start('GameScene', this.params)
    })
  }

  private updateCounter() {
    const n    = this.selected.size
    const el   = document.getElementById('lo-counter')
    const btn  = document.getElementById('lo-confirm') as HTMLButtonElement | null
    if (el)  el.textContent  = `${n} / ${MAX_SLOTS} SELECTED`
    if (btn) btn.disabled = n === 0
  }
}
