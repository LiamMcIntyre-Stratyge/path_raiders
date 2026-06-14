import Phaser from 'phaser'
import gameState from '../lib/gameState'
import { getOwnLevels } from '../lib/api/progression'
import { upgradeSpend } from '../lib/api/progression'
import { getBalance } from '../lib/api/wallet'
import { getOwnedUnits } from '../lib/api/inventory'
import {
  UNITS,
  resolveUnitStats,
  UPGRADE_COSTS,
  MAX_UNIT_LEVEL,
} from '../units/UnitData'
import {
  resolveTowerStats,
  MAX_TOWER_LEVEL,
} from '../towers/TowerData'

// ─── UpgradeScene ────────────────────────────────────────────────────────────
// Binds the upgrade screen design to the progression service (PROG-01/02).
// Data: getOwnLevels → current levels; getBalance → balance; getOwnedUnits → ownership.
// Spend: upgradeSpend(scope, targetId) → ok/reason/newLevel/newBalance.
// Visual design is user-provided; this scene wires data/behavior only.

export class UpgradeScene extends Phaser.Scene {
  private overlay!: HTMLDivElement

  constructor() {
    super({ key: 'UpgradeScene' })
  }

  create() {
    if (!gameState.userId) { this.scene.start('AuthScene'); return }

    this.overlay = document.createElement('div')
    this.overlay.id = 'upgrade-overlay'
    document.body.appendChild(this.overlay)

    this.events.on('shutdown', () => this.overlay?.remove())
    this.events.on('destroy',  () => this.overlay?.remove())

    this.renderLoading()
    void this.loadAndRender()
  }

  private renderLoading() {
    this.overlay.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap');
#upgrade-overlay{
  position:fixed;inset:0;background:#07090f;
  font-family:'Nunito',sans-serif;color:#c8b87a;
  display:flex;align-items:center;justify-content:center;
  z-index:200;
}
</style>
<div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:3px;color:#d4a030;">LOADING UPGRADES...</div>`
  }

  private async loadAndRender() {
    const userId = gameState.userId!

    const [ownLevels, balance, ownedUnits] = await Promise.all([
      getOwnLevels(userId),
      getBalance(userId),
      getOwnedUnits(userId),
    ])

    const ownedSet = new Set(ownedUnits)
    const displayBalance = balance ?? gameState.walletBalance ?? 0

    this.render(ownLevels.unitLevels, ownLevels.towerLevel, displayBalance, ownedSet)
  }

  private render(
    unitLevels: Record<string, number>,
    towerLevel: number,
    balance: number,
    ownedSet: Set<string>,
  ) {
    // Build unit upgrade cards (one per unit across all factions)
    const unitCards = UNITS.map(u => {
      const curLevel  = unitLevels[u.id] ?? 1
      const isOwned   = ownedSet.has(u.id)
      const isMaxUnit = curLevel >= MAX_UNIT_LEVEL
      const curStats  = resolveUnitStats(u.id, curLevel)
      const nxtStats  = isMaxUnit ? null : resolveUnitStats(u.id, curLevel + 1)
      const nextCost  = isMaxUnit ? null : (UPGRADE_COSTS.unit[curLevel + 1] ?? null)
      const canAfford = nextCost !== null && balance >= nextCost
      // Non-starters must be owned (D-16); starters (starter:true) are always upgradable
      const isLocked  = !isOwned

      const hpDelta  = nxtStats ? nxtStats.hp  - curStats.hp  : 0
      const dmgDelta = nxtStats ? nxtStats.dmg - curStats.dmg : 0

      return `
<div class="upg-card${isLocked ? ' upg-locked' : ''}" data-uid="${u.id}" data-scope="unit" data-level="${curLevel}" data-max="${isMaxUnit ? '1' : '0'}">
  <div class="upg-card-header">
    <span class="upg-unit-name">${u.name}</span>
    <span class="upg-level">LV ${curLevel}</span>
  </div>
  <div class="upg-stats-row">
    <span class="upg-stat">HP <b>${curStats.hp}</b>${nxtStats ? ` <span class="upg-delta">+${hpDelta}</span>` : ''}</span>
    <span class="upg-stat">DMG <b>${curStats.dmg}</b>${nxtStats ? ` <span class="upg-delta">+${dmgDelta}</span>` : ''}</span>
  </div>
  ${isLocked
    ? `<div class="upg-lock-hint">UNLOCK FIRST</div>`
    : isMaxUnit
      ? `<div class="upg-maxed">MAX LEVEL</div>`
      : `<button class="upg-btn${canAfford ? '' : ' upg-btn-broke'}" data-scope="unit" data-targetid="${u.id}">
           UPGRADE <span class="upg-cost">${nextCost}</span>
         </button>`
  }
</div>`
    }).join('')

    // Tower track card
    const isTowerMax  = towerLevel >= MAX_TOWER_LEVEL
    const towerStats  = resolveTowerStats(towerLevel)
    const nxtTower    = isTowerMax ? null : resolveTowerStats(towerLevel + 1)
    const towerCost   = isTowerMax ? null : (UPGRADE_COSTS.tower[towerLevel + 1] ?? null)
    const towerAfford = towerCost !== null && balance >= towerCost
    const dmgTDelta   = nxtTower ? nxtTower.dmg - towerStats.dmg : 0

    const towerCard = `
<div class="upg-card upg-tower-card" data-uid="tower_power" data-scope="tower" data-level="${towerLevel}" data-max="${isTowerMax ? '1' : '0'}">
  <div class="upg-card-header">
    <span class="upg-unit-name">TOWER POWER</span>
    <span class="upg-level">LV ${towerLevel}</span>
  </div>
  <div class="upg-stats-row">
    <span class="upg-stat">DMG <b>${towerStats.dmg}</b>${nxtTower ? ` <span class="upg-delta">+${dmgTDelta}</span>` : ''}</span>
  </div>
  ${isTowerMax
    ? `<div class="upg-maxed">MAX LEVEL</div>`
    : `<button class="upg-btn${towerAfford ? '' : ' upg-btn-broke'}" data-scope="tower" data-targetid="tower_power">
         UPGRADE <span class="upg-cost">${towerCost}</span>
       </button>`
  }
</div>`

    this.overlay.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap');
#upgrade-overlay{
  position:fixed;inset:0;background:#07090f;
  font-family:'Nunito',sans-serif;color:#c8b87a;
  display:flex;flex-direction:column;z-index:200;overflow:hidden;
}
.upg-topbar{
  display:flex;align-items:center;justify-content:space-between;
  padding:12px 20px;border-bottom:2px solid #2a3428;
  background:#0d1219;flex-shrink:0;
}
.upg-title{font-family:'Lilita One',cursive;font-size:18px;color:#d4a030;letter-spacing:3px;}
.upg-balance{font-family:'Courier New',monospace;font-size:12px;color:#f0c050;letter-spacing:2px;}
.upg-back{
  padding:7px 18px;border-radius:8px;
  background:rgba(0,0,0,0.4);border:2px solid #3a4a2a;
  color:#8a9a6a;font-family:'Lilita One',cursive;font-size:11px;
  letter-spacing:1px;cursor:pointer;
}
.upg-back:hover{border-color:#6a8a5a;color:#c8b87a;}
.upg-body{flex:1;overflow-y:auto;padding:20px;}
.upg-section-label{
  font-family:'Courier New',monospace;font-size:9px;color:#4a5a3a;
  letter-spacing:3px;margin-bottom:12px;
}
.upg-grid{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:28px;}
.upg-card{
  width:160px;border-radius:12px;background:#0d1219;border:2px solid #2a3428;
  padding:14px 12px;display:flex;flex-direction:column;gap:8px;
}
.upg-tower-card{width:200px;}
.upg-locked{opacity:0.45;}
.upg-card-header{display:flex;justify-content:space-between;align-items:center;}
.upg-unit-name{font-family:'Lilita One',cursive;font-size:11px;color:#e8d8a0;letter-spacing:1px;}
.upg-level{font-family:'Courier New',monospace;font-size:10px;color:#d4a030;letter-spacing:1px;}
.upg-stats-row{display:flex;gap:10px;flex-wrap:wrap;}
.upg-stat{font-family:'Courier New',monospace;font-size:9px;color:#5a7a5a;letter-spacing:1px;}
.upg-stat b{color:#c8b87a;}
.upg-delta{color:#4adf7a;font-size:9px;}
.upg-btn{
  padding:7px 10px;border-radius:8px;
  background:linear-gradient(135deg,#8a6518,#d4a030);
  border:2px solid #f0c050;color:#07090f;
  font-family:'Lilita One',cursive;font-size:10px;letter-spacing:1px;cursor:pointer;
  box-shadow:0 3px 0 #4a3008;transition:filter 0.15s,opacity 0.15s;
}
.upg-btn:hover:not(:disabled){filter:brightness(1.1);}
.upg-btn:disabled{opacity:0.45;cursor:not-allowed;box-shadow:none;}
.upg-btn-broke{opacity:0.6;background:linear-gradient(135deg,#3a3028,#5a4a28);border-color:#7a6a38;color:#8a7a58;}
.upg-cost{font-size:9px;opacity:0.85;}
.upg-maxed{font-family:'Courier New',monospace;font-size:9px;color:#d4a030;letter-spacing:2px;text-align:center;}
.upg-lock-hint{font-family:'Courier New',monospace;font-size:9px;color:#4a3a2a;text-align:center;letter-spacing:1px;}
.upg-msg{
  min-height:18px;font-family:'Courier New',monospace;font-size:10px;
  color:#c0281e;letter-spacing:1px;padding:4px 0;
}
</style>

<div class="upg-topbar">
  <div class="upg-title">UPGRADES</div>
  <div class="upg-balance" id="upg-balance">BALANCE: ${balance}</div>
  <button class="upg-back" id="upg-back">BACK</button>
</div>

<div class="upg-body">
  <div id="upg-msg" class="upg-msg"></div>

  <div class="upg-section-label">TOWER POWER</div>
  <div class="upg-grid">${towerCard}</div>

  <div class="upg-section-label">UNIT UPGRADES</div>
  <div class="upg-grid">${unitCards}</div>
</div>`

    // Wire back button
    document.getElementById('upg-back')?.addEventListener('click', () => {
      this.scene.start('LobbyScene')
    })

    // Wire spend buttons
    const msgEl = document.getElementById('upg-msg')
    const balanceEl = document.getElementById('upg-balance')

    this.overlay.querySelectorAll<HTMLButtonElement>('.upg-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scope    = btn.dataset.scope as 'unit' | 'tower'
        const targetId = btn.dataset.targetid!
        if (!scope || !targetId) return

        // Optimistic disable
        btn.disabled = true
        if (msgEl) msgEl.textContent = ''

        const result = await upgradeSpend(scope, targetId)

        if (result.ok) {
          // Update balance display
          if (typeof result.newBalance === 'number') {
            gameState.walletBalance = result.newBalance
            if (balanceEl) balanceEl.textContent = `BALANCE: ${result.newBalance}`
          }
          // Reload full screen to reflect the new level
          const newUserId = gameState.userId
          if (newUserId) {
            const [ownLevels, bal, ownedUnits] = await Promise.all([
              getOwnLevels(newUserId),
              getBalance(newUserId),
              getOwnedUnits(newUserId),
            ])
            this.render(ownLevels.unitLevels, ownLevels.towerLevel, bal ?? 0, new Set(ownedUnits))
          }
          return
        }

        // Handle failure
        if (msgEl) {
          if (result.reason === 'insufficient_funds') {
            msgEl.textContent = 'INSUFFICIENT FUNDS'
          } else if (result.reason === 'max_level') {
            msgEl.textContent = 'ALREADY AT MAX LEVEL'
          } else if (result.reason === 'not_owned') {
            msgEl.textContent = 'UNIT NOT OWNED — UNLOCK FIRST'
          } else {
            msgEl.textContent = (result.error ?? result.reason ?? 'UPGRADE FAILED').toUpperCase()
          }
        }
        btn.disabled = false
      })
    })
  }
}
