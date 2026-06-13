import Phaser from 'phaser'
import gameState from '../lib/gameState'
import { esc } from '../lib/escapeHtml'
import { getProfileFull, type FullProfile } from '../lib/api/profile'
import { spendUnlock } from '../lib/api/inventory'
import { UNITS } from '../units/UnitData'

// The three non-starter units that can be unlocked via spend-to-unlock (ECON-03).
// Cost label below is COSMETIC only — the server derives the real cost (D-07).
const UNLOCKABLE_IDS = ['assault_bot', 'thorn_beast', 'elementalist'] as const
const UNIT_COST_LABEL = 100 // display only; spend_unlock RPC is authoritative

// ─── ProfileScene ───────────────────────────────────────────────────────────────
// Profile + roster surface (ACCT-02/03, D-13). Binds getProfileFull → username,
// W/L, balance, owned units, rank placeholder, and wires spend-to-unlock for the
// three non-starter units. Visual design is user-owned (CONTEXT) — this scene
// wires data/behavior; the markup below is a functional placeholder.
export class ProfileScene extends Phaser.Scene {
  private overlay!: HTMLDivElement
  private profile: FullProfile | null = null

  constructor() {
    super({ key: 'ProfileScene' })
  }

  create() {
    if (!gameState.userId) { this.scene.start('AuthScene'); return }

    this.overlay = document.createElement('div')
    this.overlay.className = 'pr-overlay'
    document.body.appendChild(this.overlay)

    this.events.on('shutdown', () => this.cleanup())
    this.events.on('destroy', () => this.cleanup())

    this.renderLoading()
    void this.loadAndRender()
  }

  private cleanup() {
    this.overlay?.remove()
  }

  private renderLoading() {
    this.overlay.innerHTML =
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#d4a030;font-family:monospace;letter-spacing:2px;">LOADING PROFILE…</div>`
  }

  private async loadAndRender() {
    this.profile = await getProfileFull(gameState.userId!)
    if (this.profile) gameState.walletBalance = this.profile.balance
    this.render()
  }

  private render() {
    const p = this.profile
    if (!p) {
      this.overlay.innerHTML =
        `<div style="position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;color:#c0281e;font-family:monospace;">
          <div>PROFILE UNAVAILABLE</div>
          <button id="pf-back" style="padding:8px 18px;cursor:pointer;">BACK TO LOBBY</button>
        </div>`
      this.wireBack()
      return
    }

    const username = esc(p.username ?? 'COMMANDER')
    const owned = new Set(p.ownedUnitIds)

    const unlockRows = UNLOCKABLE_IDS.map((id) => {
      const def = UNITS.find((u) => u.id === id)
      const name = esc(def?.name ?? id)
      if (owned.has(id)) {
        return `<div class="pf-unit" data-owned="1" style="display:flex;justify-content:space-between;padding:8px 12px;border:1px solid #2a3b1a;border-radius:8px;color:#86EFAC;">
          <span>${name}</span><span>OWNED</span>
        </div>`
      }
      return `<div class="pf-unit" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid #3a3018;border-radius:8px;color:#e8d8a0;">
        <span>${name}</span>
        <button class="pf-unlock" data-unit="${id}" style="cursor:pointer;padding:5px 12px;">UNLOCK · ${UNIT_COST_LABEL}</button>
      </div>`
    }).join('')

    this.overlay.innerHTML = `
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;gap:14px;padding:32px;max-width:520px;margin:0 auto;color:#e8d8a0;font-family:monospace;overflow:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:20px;color:#f0c050;letter-spacing:2px;">${username}</div>
          <div style="font-size:11px;color:#8a6518;letter-spacing:2px;">${esc(p.rankPlaceholder)}</div>
        </div>
        <div style="display:flex;gap:16px;font-size:13px;">
          <div>WINS <b style="color:#86EFAC;">${p.wins}</b></div>
          <div>LOSSES <b style="color:#c0281e;">${p.losses}</b></div>
          <div>BALANCE <b style="color:#d4a030;">${p.balance}</b></div>
        </div>
        <div style="font-size:11px;color:#8a6518;letter-spacing:2px;margin-top:8px;">UNLOCK UNITS</div>
        <div id="pf-unlocks" style="display:flex;flex-direction:column;gap:8px;">${unlockRows}</div>
        <div id="pf-msg" style="min-height:16px;font-size:11px;color:#c0281e;"></div>
        <button id="pf-back" style="margin-top:auto;padding:8px 18px;cursor:pointer;align-self:flex-start;">BACK TO LOBBY</button>
      </div>`

    this.wireBack()
    this.wireUnlocks()
  }

  private wireBack() {
    const back = document.getElementById('pf-back') as HTMLButtonElement | null
    if (back) back.onclick = () => this.scene.start('LobbyScene')
  }

  private wireUnlocks() {
    const buttons = Array.from(
      this.overlay.querySelectorAll<HTMLButtonElement>('.pf-unlock')
    )
    const msg = document.getElementById('pf-msg') as HTMLDivElement | null
    for (const btn of buttons) {
      btn.onclick = async () => {
        const unitId = btn.dataset.unit
        if (!unitId) return
        btn.disabled = true
        btn.textContent = 'UNLOCKING…'
        if (msg) msg.textContent = ''

        const result = await spendUnlock(unitId)
        if (result.ok) {
          // Server is authoritative — refresh owned list + balance from truth.
          if (typeof result.newBalance === 'number') gameState.walletBalance = result.newBalance
          await this.loadAndRender()
          return
        }

        // Non-blocking failure surface (ECON-03).
        if (msg) {
          msg.textContent =
            result.reason === 'insufficient_funds'
              ? 'INSUFFICIENT FUNDS'
              : (result.error ?? 'UNLOCK FAILED').toUpperCase()
        }
        btn.disabled = false
        btn.textContent = `UNLOCK · ${UNIT_COST_LABEL}`
      }
    }
  }
}
