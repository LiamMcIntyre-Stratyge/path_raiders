import Phaser from 'phaser'
import { supabase } from '../lib/supabase'
import gameState from '../lib/gameState'
import type { Faction } from '../types'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg: '#07090f',
  bgCard: '#0d1219',
  bgPanel: '#111820',
  bgDeep: '#050709',
  gold: '#d4a030',
  goldDim: '#8a6518',
  goldGlow: '#d4a03040',
  goldLight: '#f0c050',
  red: '#c0281e',
  blue: '#2a6adf',
  green: '#2aaf5a',
  purple: '#8a30df',
  border: '#1a2418',
  borderGold: '#d4a03055',
  borderMid: '#2a3428',
  text: '#c8b87a',
  textDim: '#5a6a4a',
  textMid: '#8a9a6a',
  font: "'Palatino Linotype', Palatino, serif",
  mono: "'Courier New', monospace",
}

// ─── Style injection (once) ───────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('pr-styles')) return
  const style = document.createElement('style')
  style.id = 'pr-styles'
  style.textContent = `
    @keyframes twinkle{0%,100%{opacity:0}50%{opacity:0.7}}
    @keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}
    @keyframes fadeSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes ping{0%{transform:scale(1);opacity:0.8}70%,100%{transform:scale(2.2);opacity:0}}
    @keyframes shimmer{0%,100%{opacity:0.4}50%{opacity:1}}
    @keyframes barFill{from{width:0%}to{width:100%}}
    @keyframes spin{to{transform:rotate(360deg)}}

    *{box-sizing:border-box;margin:0;padding:0}

    .pr-overlay{
      position:fixed;inset:0;
      background:${T.bg};
      display:flex;align-items:center;justify-content:center;
      font-family:${T.font};
      color:${T.text};
      z-index:100;
      overflow:hidden;
    }

    .pr-input{
      width:100%;
      background:${T.bgDeep};
      border:1px solid ${T.borderMid};
      border-radius:6px;
      color:${T.text};
      font-family:${T.font};
      font-size:15px;
      padding:11px 14px 11px 42px;
      outline:none;
      transition:border-color 0.2s;
    }
    .pr-input:focus{border-color:${T.goldDim};}
    .pr-input::placeholder{color:${T.textDim};}

    .pr-input-wrap{
      position:relative;
      width:100%;
      margin-bottom:14px;
    }
    .pr-input-icon{
      position:absolute;
      left:13px;top:50%;
      transform:translateY(-50%);
      color:${T.goldDim};
      font-size:15px;
      pointer-events:none;
    }

    .pr-btn{
      width:100%;
      padding:13px;
      border:none;
      border-radius:8px;
      font-family:${T.mono};
      font-size:13px;
      font-weight:700;
      letter-spacing:2px;
      cursor:pointer;
      transition:filter 0.15s, transform 0.1s;
    }
    .pr-btn:hover{filter:brightness(1.15);}
    .pr-btn:active{transform:scale(0.97);}
    .pr-btn-gold{background:linear-gradient(135deg,${T.goldDim},${T.gold});color:${T.bgDeep};}
    .pr-btn-outline{background:transparent;border:1px solid ${T.borderMid};color:${T.textMid};}
    .pr-btn-ghost{background:transparent;border:none;color:${T.textDim};font-size:12px;letter-spacing:1px;cursor:pointer;padding:6px;}
    .pr-btn-ghost:hover{color:${T.text};}

    .pr-card{
      background:${T.bgCard};
      border:1px solid ${T.borderMid};
      border-radius:10px;
      padding:16px;
      transition:border-color 0.2s;
    }
    .pr-card:hover{border-color:${T.borderGold};}
    .pr-card.selected{border-color:${T.gold};background:${T.bgPanel};}

    .pr-err{
      color:${T.red};
      font-family:${T.mono};
      font-size:11px;
      letter-spacing:1px;
      min-height:18px;
      margin-bottom:10px;
    }

    .pr-link{
      color:${T.goldDim};
      font-family:${T.mono};
      font-size:11px;
      letter-spacing:1px;
      cursor:pointer;
      background:none;
      border:none;
      text-decoration:underline;
    }
    .pr-link:hover{color:${T.gold};}

    .pr-divider{
      display:flex;align-items:center;gap:10px;
      color:${T.textDim};
      font-family:${T.mono};
      font-size:10px;
      letter-spacing:2px;
      margin:14px 0;
    }
    .pr-divider::before,.pr-divider::after{
      content:'';flex:1;
      height:1px;background:${T.borderMid};
    }

    .pr-code-box{
      width:44px;height:54px;
      background:${T.bgDeep};
      border:2px solid ${T.borderMid};
      border-radius:8px;
      font-family:${T.mono};
      font-size:22px;
      color:${T.gold};
      text-align:center;
      outline:none;
      caret-color:${T.gold};
    }
    .pr-code-box:focus{border-color:${T.gold};}

    .pr-faction-card{
      flex:1;
      background:${T.bgCard};
      border:2px solid ${T.borderMid};
      border-radius:10px;
      padding:14px 10px;
      text-align:center;
      cursor:pointer;
      transition:border-color 0.2s, background 0.2s;
    }
    .pr-faction-card:hover{border-color:${T.borderGold};}
    .pr-faction-card.selected-machines{border-color:#2a6adf;background:#0d1626;}
    .pr-faction-card.selected-plants{border-color:#2aaf5a;background:#0d1a12;}
    .pr-faction-card.selected-wizards{border-color:#8a30df;background:#160d26;}

    .pr-stat-chip{
      background:${T.bgCard};
      border:1px solid ${T.borderMid};
      border-radius:8px;
      padding:8px 14px;
      text-align:center;
    }

    .pr-anim-fadein{animation:fadeIn 0.4s ease both;}
    .pr-anim-slideup{animation:fadeSlideUp 0.4s ease both;}
  `
  document.head.appendChild(style)
}

// ─── Star field helper ────────────────────────────────────────────────────────
function starField(): string {
  const stars = Array.from({ length: 30 }, () => {
    const x = Math.random() * 100
    const y = Math.random() * 100
    const delay = (Math.random() * 4).toFixed(2)
    const dur = (2 + Math.random() * 3).toFixed(2)
    const size = Math.random() > 0.7 ? 3 : 2
    return `<div style="position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:${T.gold};animation:twinkle ${dur}s ${delay}s infinite ease-in-out;"></div>`
  }).join('')

  const hex = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.04" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="hexgrid" x="0" y="0" width="52" height="60" patternUnits="userSpaceOnUse">
        <polygon points="26,2 50,15 50,45 26,58 2,45 2,15" fill="none" stroke="${T.gold}" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hexgrid)"/>
  </svg>`

  return stars + hex
}

// ─── Logo component ───────────────────────────────────────────────────────────
function logo(size: 'sm' | 'md' | 'lg' = 'md'): string {
  const sizes = {
    sm: { sub: 9, title: 28, tag: 9 },
    md: { sub: 10, title: 40, tag: 10 },
    lg: { sub: 12, title: 58, tag: 11 },
  }
  const s = sizes[size]
  return `
    <div style="text-align:center;line-height:1.3;">
      <div style="font-family:${T.mono};font-size:${s.sub}px;color:${T.goldDim};letter-spacing:8px;margin-bottom:6px;">— PATH RAIDERS —</div>
      <div style="font-family:${T.font};font-size:${s.title}px;font-weight:700;letter-spacing:3px;
        background:linear-gradient(135deg,${T.goldDim},${T.goldLight},${T.gold});
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
        line-height:1.1;">PATH RAIDERS</div>
      <div style="font-family:${T.mono};font-size:${s.tag}px;color:${T.textDim};letter-spacing:4px;margin-top:6px;">CONQUER · RAID · DOMINATE</div>
    </div>
  `
}

// ─── AuthScene ────────────────────────────────────────────────────────────────
export class AuthScene extends Phaser.Scene {
  private overlay!: HTMLDivElement
  private sessionResolved = false
  private sessionData: { userId: string; username: string | null; faction: Faction | null } | null = null

  constructor() {
    super({ key: 'AuthScene' })
  }

  create() {
    injectStyles()
    this.overlay = document.createElement('div')
    this.overlay.className = 'pr-overlay'
    document.body.appendChild(this.overlay)

    this.events.on('shutdown', () => this.removeOverlay())
    this.events.on('destroy', () => this.removeOverlay())

    this.showSplash()
    this.checkSession()
  }

  private removeOverlay() {
    this.overlay?.remove()
  }

  // ── Session check ──────────────────────────────────────────────────────────
  private async checkSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        this.sessionResolved = true
        this.sessionData = null
        return
      }
      const userId = session.user.id
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, faction, unlocked_units')
        .eq('id', userId)
        .single()

      this.sessionData = {
        userId,
        username: profile?.username ?? null,
        faction: (profile?.faction as Faction) ?? null,
      }
      gameState.userId = userId
      gameState.username = profile?.username ?? null
      gameState.playerFaction = (profile?.faction as Faction) ?? null
      gameState.unlockedUnits = profile?.unlocked_units ?? ['scout_drone', 'vine_crawler']
    } catch {
      this.sessionData = null
    }
    this.sessionResolved = true
  }

  private async routeAfterAuth() {
    if (!this.sessionData) { this.showWelcome(); return }
    if (!this.sessionData.username) { this.showOnboard(); return }
    this.scene.start('LobbyScene')
  }

  // ── Splash screen ──────────────────────────────────────────────────────────
  private showSplash() {
    const labels = ['LOADING ASSETS...', 'PREPARING BATTLEFIELD...', 'ARMING UNITS...', 'READY']
    this.overlay.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:32px;">
        ${starField()}
        <div style="position:relative;z-index:1;animation:fadeIn 0.6s ease both;">
          ${logo('lg')}
        </div>
        <div style="position:relative;z-index:1;width:320px;">
          <div style="font-family:${T.mono};font-size:11px;color:${T.textMid};letter-spacing:3px;text-align:center;margin-bottom:12px;" id="splash-label">LOADING ASSETS...</div>
          <div style="background:${T.bgDeep};border:1px solid ${T.borderMid};border-radius:4px;height:4px;overflow:hidden;">
            <div id="splash-bar" style="height:100%;width:0%;background:linear-gradient(90deg,${T.goldDim},${T.gold});border-radius:4px;transition:width 0.1s linear;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;">
            <span style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:2px;">PATH RAIDERS v0.1</span>
            <span id="splash-pct" style="font-family:${T.mono};font-size:9px;color:${T.goldDim};letter-spacing:2px;">0%</span>
          </div>
        </div>
      </div>
    `

    const bar = document.getElementById('splash-bar') as HTMLDivElement
    const labelEl = document.getElementById('splash-label') as HTMLDivElement
    const pctEl = document.getElementById('splash-pct') as HTMLSpanElement

    let pct = 0
    const totalMs = 2200
    const interval = 40
    const step = (interval / totalMs) * 100

    const ticker = setInterval(() => {
      pct = Math.min(100, pct + step + Math.random() * step * 0.5)
      bar.style.width = `${pct}%`
      pctEl.textContent = `${Math.floor(pct)}%`

      if (pct >= 25 && pct < 50) labelEl.textContent = labels[1]
      else if (pct >= 50 && pct < 90) labelEl.textContent = labels[2]
      else if (pct >= 90) labelEl.textContent = labels[3]

      if (pct >= 100) {
        clearInterval(ticker)
        // Wait for session check, then route
        const done = () => {
          if (this.sessionResolved) { this.routeAfterAuth(); return }
          setTimeout(done, 100)
        }
        setTimeout(done, 300)
      }
    }, interval)
  }

  // ── Welcome screen ─────────────────────────────────────────────────────────
  private showWelcome() {
    const features = [
      { icon: '🏗', title: 'BUILD', desc: 'Place towers and spawn units to defend your base' },
      { icon: '⚔', title: 'RAID', desc: 'Send waves to destroy the enemy commander' },
      { icon: '🗺', title: 'EXPLORE', desc: 'Unlock new factions, units, and battlefield modes' },
    ]

    const featureCards = features.map(f => `
      <div class="pr-card" style="flex:1;text-align:center;padding:18px 12px;">
        <div style="font-size:24px;margin-bottom:8px;">${f.icon}</div>
        <div style="font-family:${T.mono};font-size:11px;color:${T.gold};letter-spacing:2px;margin-bottom:6px;">${f.title}</div>
        <div style="font-size:12px;color:${T.textDim};line-height:1.5;">${f.desc}</div>
      </div>
    `).join('')

    this.overlay.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
        ${starField()}
        <div style="position:relative;z-index:1;width:440px;animation:fadeSlideUp 0.5s ease both;">
          <div style="margin-bottom:32px;">${logo('lg')}</div>
          <div style="display:flex;gap:12px;margin-bottom:32px;">
            ${featureCards}
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button class="pr-btn pr-btn-gold" id="w-signin">⚔ &nbsp;SIGN IN</button>
            <button class="pr-btn pr-btn-outline" id="w-register">CREATE ACCOUNT</button>
            <button class="pr-btn-ghost" style="text-align:center;" id="w-guest">Continue as Guest</button>
          </div>
        </div>
      </div>
    `
    ;(document.getElementById('w-signin') as HTMLButtonElement).onclick = () => this.showLogin()
    ;(document.getElementById('w-register') as HTMLButtonElement).onclick = () => this.showRegister()
    ;(document.getElementById('w-guest') as HTMLButtonElement).onclick = () => {
      gameState.userId = null
      gameState.username = 'Guest'
      gameState.playerFaction = 'machines'
      this.scene.start('LobbyScene')
    }
  }

  // ── Login screen ───────────────────────────────────────────────────────────
  private showLogin() {
    this.overlay.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
        ${starField()}
        <div style="position:relative;z-index:1;width:380px;animation:fadeSlideUp 0.4s ease both;">
          <div style="margin-bottom:24px;">${logo('sm')}</div>
          <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:12px;padding:28px;">
            <div style="font-family:${T.mono};font-size:11px;color:${T.textMid};letter-spacing:3px;margin-bottom:20px;text-align:center;">SIGN IN TO YOUR ACCOUNT</div>

            <div class="pr-input-wrap">
              <span class="pr-input-icon">✉</span>
              <input class="pr-input" id="l-email" type="email" placeholder="Email address" autocomplete="email"/>
            </div>
            <div class="pr-input-wrap">
              <span class="pr-input-icon">🔑</span>
              <input class="pr-input" id="l-pass" type="password" placeholder="Password" autocomplete="current-password"/>
            </div>

            <div class="pr-err" id="l-err"></div>

            <button class="pr-btn pr-btn-gold" id="l-submit" style="margin-bottom:14px;">ENTER THE FIELD</button>

            <div class="pr-divider">OR CONTINUE WITH</div>

            <div style="display:flex;gap:10px;margin-bottom:16px;">
              <button class="pr-btn pr-btn-outline" id="l-google" style="font-size:11px;letter-spacing:1px;">G &nbsp;Google</button>
              <button class="pr-btn pr-btn-outline" id="l-apple" style="font-size:11px;letter-spacing:1px;"> Apple</button>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;">
              <button class="pr-link" id="l-forgot">Forgot password?</button>
              <button class="pr-link" id="l-toreg">Create account</button>
            </div>
          </div>

          <div style="text-align:center;margin-top:16px;">
            <button class="pr-btn-ghost" id="l-back">← Back</button>
          </div>
        </div>
      </div>
    `

    const errEl = document.getElementById('l-err') as HTMLDivElement
    const setErr = (msg: string) => { errEl.textContent = msg }

    ;(document.getElementById('l-submit') as HTMLButtonElement).onclick = async () => {
      const email = (document.getElementById('l-email') as HTMLInputElement).value.trim()
      const pass = (document.getElementById('l-pass') as HTMLInputElement).value
      setErr('')
      if (!email) { setErr('EMAIL REQUIRED'); return }
      if (!pass) { setErr('PASSWORD REQUIRED'); return }

      const btn = document.getElementById('l-submit') as HTMLButtonElement
      btn.textContent = 'SIGNING IN...'
      btn.disabled = true

      const { error, data } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (error) { setErr(error.message.toUpperCase()); btn.textContent = 'ENTER THE FIELD'; btn.disabled = false; return }

      gameState.userId = data.user?.id ?? null
      await this.loadProfileAndRoute()
    }

    ;(document.getElementById('l-google') as HTMLButtonElement).onclick = () => {
      setErr('GOOGLE AUTH COMING SOON')
    }
    ;(document.getElementById('l-apple') as HTMLButtonElement).onclick = () => {
      setErr('APPLE AUTH COMING SOON')
    }
    ;(document.getElementById('l-forgot') as HTMLButtonElement).onclick = () => this.showForgot()
    ;(document.getElementById('l-toreg') as HTMLButtonElement).onclick = () => this.showRegister()
    ;(document.getElementById('l-back') as HTMLButtonElement).onclick = () => this.showWelcome()

    // Allow Enter key
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') (document.getElementById('l-submit') as HTMLButtonElement).click() }
    document.getElementById('l-email')!.addEventListener('keydown', onKey)
    document.getElementById('l-pass')!.addEventListener('keydown', onKey)
  }

  private async loadProfileAndRoute() {
    if (!gameState.userId) { this.showWelcome(); return }
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, faction, unlocked_units')
      .eq('id', gameState.userId)
      .single()

    gameState.username = profile?.username ?? null
    gameState.playerFaction = (profile?.faction as Faction) ?? null
    gameState.unlockedUnits = profile?.unlocked_units ?? ['scout_drone', 'vine_crawler']

    if (!gameState.username) { this.showOnboard(); return }
    this.scene.start('LobbyScene')
  }

  // ── Register screen ────────────────────────────────────────────────────────
  private showRegister(step = 1, step1Data?: { name: string; email: string; pass: string }) {
    if (step === 1) {
      this.overlay.innerHTML = `
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
          ${starField()}
          <div style="position:relative;z-index:1;width:400px;animation:fadeSlideUp 0.4s ease both;">
            <div style="margin-bottom:20px;">${logo('sm')}</div>
            <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:12px;padding:28px;">

              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <div style="font-family:${T.mono};font-size:11px;color:${T.textMid};letter-spacing:3px;">CREATE ACCOUNT</div>
                <div style="display:flex;gap:6px;">
                  <div style="width:24px;height:4px;border-radius:2px;background:${T.gold};"></div>
                  <div style="width:24px;height:4px;border-radius:2px;background:${T.borderMid};"></div>
                </div>
              </div>

              <div class="pr-input-wrap">
                <span class="pr-input-icon">⚔</span>
                <input class="pr-input" id="r-name" type="text" placeholder="Commander name (3-20 chars)" maxlength="20"/>
              </div>
              <div class="pr-input-wrap">
                <span class="pr-input-icon">✉</span>
                <input class="pr-input" id="r-email" type="email" placeholder="Email address" autocomplete="email"/>
              </div>
              <div class="pr-input-wrap">
                <span class="pr-input-icon">🔑</span>
                <input class="pr-input" id="r-pass" type="password" placeholder="Password (min 8 chars)" autocomplete="new-password"/>
              </div>
              <div class="pr-input-wrap">
                <span class="pr-input-icon">🔒</span>
                <input class="pr-input" id="r-confirm" type="password" placeholder="Confirm password"/>
              </div>

              <div class="pr-err" id="r-err"></div>
              <button class="pr-btn pr-btn-gold" id="r-next">NEXT: CHOOSE FACTION →</button>
            </div>
            <div style="text-align:center;margin-top:16px;display:flex;justify-content:center;gap:20px;">
              <button class="pr-btn-ghost" id="r-back">← Back</button>
              <button class="pr-link" id="r-tologin">Already have an account?</button>
            </div>
          </div>
        </div>
      `

      const errEl = document.getElementById('r-err') as HTMLDivElement
      const setErr = (msg: string) => { errEl.textContent = msg }

      ;(document.getElementById('r-next') as HTMLButtonElement).onclick = () => {
        const name = (document.getElementById('r-name') as HTMLInputElement).value.trim()
        const email = (document.getElementById('r-email') as HTMLInputElement).value.trim()
        const pass = (document.getElementById('r-pass') as HTMLInputElement).value
        const confirm = (document.getElementById('r-confirm') as HTMLInputElement).value
        setErr('')
        if (name.length < 3) { setErr('NAME MUST BE AT LEAST 3 CHARACTERS'); return }
        if (!/^[a-zA-Z0-9_]+$/.test(name)) { setErr('NAME: LETTERS, NUMBERS, UNDERSCORE ONLY'); return }
        if (!email) { setErr('EMAIL REQUIRED'); return }
        if (pass.length < 8) { setErr('PASSWORD MIN 8 CHARACTERS'); return }
        if (pass !== confirm) { setErr('PASSWORDS DO NOT MATCH'); return }
        this.showRegister(2, { name, email, pass })
      }
      ;(document.getElementById('r-back') as HTMLButtonElement).onclick = () => this.showWelcome()
      ;(document.getElementById('r-tologin') as HTMLButtonElement).onclick = () => this.showLogin()

    } else {
      // Step 2 — faction picker
      let selectedFaction: Faction | null = null

      const factionCards = (
        [
          { id: 'machines', label: 'MACHINES', icon: '🤖', color: T.blue, desc: 'Steel discipline. Superior firepower.' },
          { id: 'plants', label: 'PLANTS', icon: '🌿', color: T.green, desc: 'Relentless growth. Nature reclaims all.' },
          { id: 'wizards', label: 'WIZARDS', icon: '🧙', color: T.purple, desc: 'Ancient sorcery. Unbounded power.' },
        ] as const
      ).map(f => `
        <div class="pr-faction-card" id="fc-${f.id}" onclick="(function(){
          document.querySelectorAll('.pr-faction-card').forEach(el=>el.className='pr-faction-card');
          document.getElementById('fc-${f.id}').className='pr-faction-card selected-${f.id}';
          document.getElementById('r-faction-val').value='${f.id}';
        })()">
          <div style="font-size:28px;margin-bottom:8px;">${f.icon}</div>
          <div style="font-family:${T.mono};font-size:11px;color:${f.color};letter-spacing:2px;margin-bottom:6px;">${f.label}</div>
          <div style="font-size:11px;color:${T.textDim};line-height:1.4;">${f.desc}</div>
        </div>
      `).join('')

      this.overlay.innerHTML = `
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
          ${starField()}
          <div style="position:relative;z-index:1;width:480px;animation:fadeSlideUp 0.4s ease both;">
            <div style="margin-bottom:20px;">${logo('sm')}</div>
            <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:12px;padding:28px;">

              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <div style="font-family:${T.mono};font-size:11px;color:${T.textMid};letter-spacing:3px;">CHOOSE YOUR FACTION</div>
                <div style="display:flex;gap:6px;">
                  <div style="width:24px;height:4px;border-radius:2px;background:${T.goldDim};"></div>
                  <div style="width:24px;height:4px;border-radius:2px;background:${T.gold};"></div>
                </div>
              </div>

              <div style="display:flex;gap:12px;margin-bottom:20px;">
                ${factionCards}
              </div>
              <input type="hidden" id="r-faction-val" value=""/>

              <div class="pr-err" id="r2-err"></div>
              <button class="pr-btn pr-btn-gold" id="r-join">⚔ &nbsp;JOIN THE RAID</button>
            </div>
            <div style="text-align:center;margin-top:16px;">
              <button class="pr-btn-ghost" id="r2-back">← Back to Details</button>
            </div>
          </div>
        </div>
      `

      const errEl = document.getElementById('r2-err') as HTMLDivElement
      const setErr = (msg: string) => { errEl.textContent = msg }

      ;(document.getElementById('r-join') as HTMLButtonElement).onclick = async () => {
        const factionVal = (document.getElementById('r-faction-val') as HTMLInputElement).value as Faction
        if (!factionVal) { setErr('SELECT A FACTION TO CONTINUE'); return }
        selectedFaction = factionVal

        const btn = document.getElementById('r-join') as HTMLButtonElement
        btn.textContent = 'JOINING...'
        btn.disabled = true

        const { data, error } = await supabase.auth.signUp({
          email: step1Data!.email,
          password: step1Data!.pass,
        })
        if (error) { setErr(error.message.toUpperCase()); btn.textContent = '⚔ JOIN THE RAID'; btn.disabled = false; return }

        const userId = data.user?.id
        if (!userId) { setErr('SIGNUP FAILED — TRY AGAIN'); btn.textContent = '⚔ JOIN THE RAID'; btn.disabled = false; return }

        const { error: profileErr } = await supabase.from('profiles').upsert({
          id: userId,
          username: step1Data!.name,
          faction: selectedFaction,
          unlocked_units: ['scout_drone', 'vine_crawler'],
        })
        if (profileErr) { setErr('PROFILE CREATION FAILED'); btn.textContent = '⚔ JOIN THE RAID'; btn.disabled = false; return }

        gameState.userId = userId
        gameState.username = step1Data!.name
        gameState.playerFaction = selectedFaction
        gameState.unlockedUnits = ['scout_drone', 'vine_crawler']
        this.scene.start('LobbyScene')
      }

      ;(document.getElementById('r2-back') as HTMLButtonElement).onclick = () => this.showRegister(1, step1Data)
    }
  }

  // ── Forgot password screen ─────────────────────────────────────────────────
  private showForgot(step = 1, resetEmail?: string) {
    if (step === 1) {
      this.overlay.innerHTML = `
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
          ${starField()}
          <div style="position:relative;z-index:1;width:380px;animation:fadeSlideUp 0.4s ease both;">
            <div style="margin-bottom:20px;">${logo('sm')}</div>
            <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:12px;padding:28px;">
              <div style="font-family:${T.mono};font-size:11px;color:${T.textMid};letter-spacing:3px;margin-bottom:8px;text-align:center;">RESET PASSWORD</div>
              <div style="font-size:12px;color:${T.textDim};text-align:center;margin-bottom:20px;line-height:1.6;">Enter your email and we'll send you a 6-digit code to reset your password.</div>

              <div class="pr-input-wrap">
                <span class="pr-input-icon">✉</span>
                <input class="pr-input" id="f-email" type="email" placeholder="Your email address"/>
              </div>
              <div class="pr-err" id="f-err"></div>
              <button class="pr-btn pr-btn-gold" id="f-send">SEND CODE</button>
            </div>
            <div style="text-align:center;margin-top:16px;">
              <button class="pr-btn-ghost" id="f-back">← Back to Sign In</button>
            </div>
          </div>
        </div>
      `

      const errEl = document.getElementById('f-err') as HTMLDivElement
      const setErr = (msg: string) => { errEl.textContent = msg }

      ;(document.getElementById('f-send') as HTMLButtonElement).onclick = async () => {
        const email = (document.getElementById('f-email') as HTMLInputElement).value.trim()
        if (!email) { setErr('EMAIL REQUIRED'); return }
        const btn = document.getElementById('f-send') as HTMLButtonElement
        btn.textContent = 'SENDING...'
        btn.disabled = true

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) { setErr(error.message.toUpperCase()); btn.textContent = 'SEND CODE'; btn.disabled = false; return }
        this.showForgot(2, email)
      }
      ;(document.getElementById('f-back') as HTMLButtonElement).onclick = () => this.showLogin()

    } else if (step === 2) {
      // 6 digit code entry
      const codeInputs = Array.from({ length: 6 }, (_, i) =>
        `<input class="pr-code-box" id="code-${i}" maxlength="1" type="text" inputmode="numeric"/>`
      ).join('')

      this.overlay.innerHTML = `
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
          ${starField()}
          <div style="position:relative;z-index:1;width:380px;animation:fadeSlideUp 0.4s ease both;">
            <div style="margin-bottom:20px;">${logo('sm')}</div>
            <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:12px;padding:28px;">
              <div style="font-family:${T.mono};font-size:11px;color:${T.textMid};letter-spacing:3px;margin-bottom:8px;text-align:center;">ENTER VERIFICATION CODE</div>
              <div style="font-size:12px;color:${T.textDim};text-align:center;margin-bottom:20px;line-height:1.6;">Code sent to <span style="color:${T.text};">${resetEmail}</span></div>

              <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;">
                ${codeInputs}
              </div>
              <div class="pr-err" id="f2-err"></div>
              <button class="pr-btn pr-btn-gold" id="f-verify">VERIFY CODE</button>
            </div>
            <div style="text-align:center;margin-top:16px;">
              <button class="pr-btn-ghost" id="f2-back">← Back</button>
            </div>
          </div>
        </div>
      `

      // Auto-advance between code boxes
      for (let i = 0; i < 6; i++) {
        const el = document.getElementById(`code-${i}`) as HTMLInputElement
        el.addEventListener('input', () => {
          if (el.value.length === 1 && i < 5) {
            ;(document.getElementById(`code-${i + 1}`) as HTMLInputElement).focus()
          }
        })
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !el.value && i > 0) {
            ;(document.getElementById(`code-${i - 1}`) as HTMLInputElement).focus()
          }
        })
      }

      const errEl = document.getElementById('f2-err') as HTMLDivElement
      const setErr = (msg: string) => { errEl.textContent = msg }

      ;(document.getElementById('f-verify') as HTMLButtonElement).onclick = () => {
        const code = Array.from({ length: 6 }, (_, i) =>
          (document.getElementById(`code-${i}`) as HTMLInputElement).value
        ).join('')
        if (code.length < 6) { setErr('ENTER ALL 6 DIGITS'); return }
        this.showForgot(3, resetEmail)
      }
      ;(document.getElementById('f2-back') as HTMLButtonElement).onclick = () => this.showForgot(1)

    } else {
      // Step 3 — new password
      this.overlay.innerHTML = `
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
          ${starField()}
          <div style="position:relative;z-index:1;width:380px;animation:fadeSlideUp 0.4s ease both;">
            <div style="margin-bottom:20px;">${logo('sm')}</div>
            <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:12px;padding:28px;">
              <div style="font-family:${T.mono};font-size:11px;color:${T.textMid};letter-spacing:3px;margin-bottom:20px;text-align:center;">SET NEW PASSWORD</div>

              <div class="pr-input-wrap">
                <span class="pr-input-icon">🔑</span>
                <input class="pr-input" id="np-pass" type="password" placeholder="New password (min 8 chars)"/>
              </div>
              <div class="pr-input-wrap">
                <span class="pr-input-icon">🔒</span>
                <input class="pr-input" id="np-confirm" type="password" placeholder="Confirm new password"/>
              </div>
              <div class="pr-err" id="np-err"></div>
              <button class="pr-btn pr-btn-gold" id="np-save">SAVE NEW PASSWORD</button>
            </div>
            <div style="text-align:center;margin-top:16px;">
              <button class="pr-btn-ghost" id="np-back">← Back</button>
            </div>
          </div>
        </div>
      `

      const errEl = document.getElementById('np-err') as HTMLDivElement
      const setErr = (msg: string) => { errEl.textContent = msg }

      ;(document.getElementById('np-save') as HTMLButtonElement).onclick = async () => {
        const pass = (document.getElementById('np-pass') as HTMLInputElement).value
        const confirm = (document.getElementById('np-confirm') as HTMLInputElement).value
        if (pass.length < 8) { setErr('PASSWORD MIN 8 CHARACTERS'); return }
        if (pass !== confirm) { setErr('PASSWORDS DO NOT MATCH'); return }

        const btn = document.getElementById('np-save') as HTMLButtonElement
        btn.textContent = 'SAVING...'
        btn.disabled = true

        const { error } = await supabase.auth.updateUser({ password: pass })
        if (error) { setErr(error.message.toUpperCase()); btn.textContent = 'SAVE NEW PASSWORD'; btn.disabled = false; return }
        this.showLogin()
      }
      ;(document.getElementById('np-back') as HTMLButtonElement).onclick = () => this.showForgot(2, resetEmail)
    }
  }

  // ── Onboard screen (session exists but no username) ────────────────────────
  private showOnboard() {
    let selectedFaction: Faction | null = null

    const factionCards = (
      [
        { id: 'machines', label: 'MACHINES', icon: '🤖', color: T.blue, desc: 'Steel and circuits.' },
        { id: 'plants', label: 'PLANTS', icon: '🌿', color: T.green, desc: 'Nature unbounded.' },
        { id: 'wizards', label: 'WIZARDS', icon: '🧙', color: T.purple, desc: 'Ancient sorcery.' },
      ] as const
    ).map(f => `
      <div class="pr-faction-card" id="ob-fc-${f.id}" onclick="(function(){
        document.querySelectorAll('.pr-faction-card').forEach(el=>el.className='pr-faction-card');
        document.getElementById('ob-fc-${f.id}').className='pr-faction-card selected-${f.id}';
        document.getElementById('ob-faction-val').value='${f.id}';
      })()">
        <div style="font-size:24px;margin-bottom:6px;">${f.icon}</div>
        <div style="font-family:${T.mono};font-size:10px;color:${f.color};letter-spacing:2px;margin-bottom:4px;">${f.label}</div>
        <div style="font-size:11px;color:${T.textDim};">${f.desc}</div>
      </div>
    `).join('')

    this.overlay.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
        ${starField()}
        <div style="position:relative;z-index:1;width:460px;animation:fadeSlideUp 0.4s ease both;">
          <div style="margin-bottom:24px;">${logo('md')}</div>
          <div style="background:${T.bgCard};border:1px solid ${T.borderGold};border-radius:12px;padding:30px;">
            <div style="font-family:${T.mono};font-size:11px;color:${T.gold};letter-spacing:3px;margin-bottom:6px;text-align:center;">WELCOME, COMMANDER</div>
            <div style="font-size:13px;color:${T.textDim};text-align:center;margin-bottom:24px;">Complete your profile to enter the battlefield.</div>

            <div style="margin-bottom:20px;">
              <div style="font-family:${T.mono};font-size:10px;color:${T.textMid};letter-spacing:2px;margin-bottom:8px;">COMMANDER NAME</div>
              <div class="pr-input-wrap" style="margin-bottom:0;">
                <span class="pr-input-icon">⚔</span>
                <input class="pr-input" id="ob-name" type="text" placeholder="3-20 chars, letters/numbers/underscore" maxlength="20"/>
              </div>
            </div>

            <div style="margin-bottom:20px;">
              <div style="font-family:${T.mono};font-size:10px;color:${T.textMid};letter-spacing:2px;margin-bottom:8px;">CHOOSE FACTION</div>
              <div style="display:flex;gap:10px;">
                ${factionCards}
              </div>
              <input type="hidden" id="ob-faction-val" value=""/>
            </div>

            <div class="pr-err" id="ob-err"></div>
            <button class="pr-btn pr-btn-gold" id="ob-confirm">ENTER THE BATTLEFIELD ⚔</button>
          </div>
        </div>
      </div>
    `

    const errEl = document.getElementById('ob-err') as HTMLDivElement
    const setErr = (msg: string) => { errEl.textContent = msg }

    ;(document.getElementById('ob-confirm') as HTMLButtonElement).onclick = async () => {
      const name = (document.getElementById('ob-name') as HTMLInputElement).value.trim()
      const factionVal = (document.getElementById('ob-faction-val') as HTMLInputElement).value as Faction
      setErr('')
      if (name.length < 3) { setErr('NAME MUST BE AT LEAST 3 CHARACTERS'); return }
      if (name.length > 20) { setErr('NAME MAX 20 CHARACTERS'); return }
      if (!/^[a-zA-Z0-9_]+$/.test(name)) { setErr('NAME: LETTERS, NUMBERS, UNDERSCORE ONLY'); return }
      if (!factionVal) { setErr('SELECT A FACTION TO CONTINUE'); return }
      selectedFaction = factionVal

      const btn = document.getElementById('ob-confirm') as HTMLButtonElement
      btn.textContent = 'SAVING...'
      btn.disabled = true

      const { error } = await supabase.from('profiles').upsert({
        id: gameState.userId,
        username: name,
        faction: selectedFaction,
        unlocked_units: ['scout_drone', 'vine_crawler'],
      })

      if (error) { setErr('SAVE FAILED — TRY AGAIN'); btn.textContent = 'ENTER THE BATTLEFIELD ⚔'; btn.disabled = false; return }

      gameState.username = name
      gameState.playerFaction = selectedFaction
      gameState.unlockedUnits = ['scout_drone', 'vine_crawler']
      this.scene.start('LobbyScene')
    }
  }
}
