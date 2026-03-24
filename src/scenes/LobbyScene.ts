import Phaser from 'phaser'
import { supabase } from '../lib/supabase'
import gameState from '../lib/gameState'
import type { Faction } from '../types'
import type { RealtimeChannel } from '@supabase/supabase-js'

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

// ─── Faction display data ─────────────────────────────────────────────────────
const FACTION_META: Record<Faction, { icon: string; color: string; label: string }> = {
  machines: { icon: '🤖', color: T.blue, label: 'MACHINES' },
  plants: { icon: '🌿', color: T.green, label: 'PLANTS' },
  wizards: { icon: '🧙', color: T.purple, label: 'WIZARDS' },
}

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
      <pattern id="hexgrid2" x="0" y="0" width="52" height="60" patternUnits="userSpaceOnUse">
        <polygon points="26,2 50,15 50,45 26,58 2,45 2,15" fill="none" stroke="${T.gold}" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hexgrid2)"/>
  </svg>`

  return stars + hex
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ─── LobbyScene ───────────────────────────────────────────────────────────────
export class LobbyScene extends Phaser.Scene {
  private overlay!: HTMLDivElement
  private realtimeChannel: RealtimeChannel | null = null

  constructor() {
    super({ key: 'LobbyScene' })
  }

  create() {
    this.overlay = document.createElement('div')
    this.overlay.className = 'pr-overlay'
    document.body.appendChild(this.overlay)

    this.events.on('shutdown', () => this.cleanup())
    this.events.on('destroy', () => this.cleanup())

    this.showLobby()
  }

  private cleanup() {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel)
      this.realtimeChannel = null
    }
    this.overlay?.remove()
  }

  // ── Main Lobby ─────────────────────────────────────────────────────────────
  private showLobby() {
    const faction = gameState.playerFaction ?? 'machines'
    const fm = FACTION_META[faction]
    const username = gameState.username ?? 'COMMANDER'

    const gameModes = [
      { id: '1v1', label: '1v1 RANKED', icon: '⚔', color: T.gold, desc: 'Solo ranked match · ELO rating' },
      { id: 'coop', label: 'CO-OP RAID', icon: '🛡', color: T.blue, desc: '2v2 cooperative raid · Team up' },
      { id: '3way', label: '3-WAY WAR', icon: '🔺', color: T.red, desc: 'Three commanders · Last base standing' },
      { id: 'surv', label: 'SURVIVAL', icon: '💀', color: T.purple, desc: 'Endless wave defence · High score' },
    ]

    const modeCards = gameModes.map(m => `
      <div class="pr-card" id="mode-${m.id}" style="cursor:pointer;border-left:3px solid ${m.color};padding:14px 16px;display:flex;align-items:center;gap:14px;"
           onclick="document.getElementById('lobby-play-mode').dataset.mode='${m.id}';document.getElementById('lobby-play-mode').click();">
        <span style="font-size:22px;">${m.icon}</span>
        <div>
          <div style="font-family:${T.mono};font-size:11px;color:${m.color};letter-spacing:2px;margin-bottom:3px;">${m.label}</div>
          <div style="font-size:11px;color:${T.textDim};">${m.desc}</div>
        </div>
      </div>
    `).join('')

    this.overlay.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;">
        ${starField()}

        <!-- Top bar -->
        <div style="position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-bottom:1px solid ${T.borderMid};background:${T.bgDeep}80;">
          <div style="display:flex;align-items:center;gap:12px;">
            <!-- Faction avatar -->
            <div style="position:relative;width:44px;height:44px;border-radius:50%;background:${T.bgCard};border:2px solid ${fm.color};display:flex;align-items:center;justify-content:center;font-size:20px;">
              ${fm.icon}
              <div style="position:absolute;bottom:-4px;right:-4px;background:${T.gold};color:${T.bgDeep};font-family:${T.mono};font-size:9px;font-weight:700;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;">1</div>
            </div>
            <div>
              <div style="font-family:${T.font};font-size:15px;color:${T.text};font-weight:600;">${username}</div>
              <div style="font-family:${T.mono};font-size:9px;color:${fm.color};letter-spacing:2px;">${fm.label}</div>
            </div>
          </div>

          <!-- Resources -->
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:20px;padding:6px 14px;display:flex;align-items:center;gap:6px;">
              <span style="color:#6af;">💎</span>
              <span style="font-family:${T.mono};font-size:12px;color:${T.text};">0</span>
            </div>
            <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:20px;padding:6px 14px;display:flex;align-items:center;gap:6px;">
              <span style="color:${T.gold};">⬡</span>
              <span style="font-family:${T.mono};font-size:12px;color:${T.text};">${gameState.gold}</span>
            </div>
            <div style="background:${T.bgCard};border:1px solid ${T.borderMid};border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;" id="lobby-settings">⚙</div>
          </div>
        </div>

        <!-- Body -->
        <div style="position:relative;z-index:1;flex:1;display:flex;gap:0;overflow:hidden;">

          <!-- Left column: stats + play -->
          <div style="width:260px;border-right:1px solid ${T.borderMid};padding:20px 20px;display:flex;flex-direction:column;gap:20px;overflow-y:auto;">

            <!-- Quick stats -->
            <div>
              <div style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:3px;margin-bottom:10px;">QUICK STATS</div>
              <div style="display:flex;gap:8px;">
                <div class="pr-stat-chip" style="flex:1;">
                  <div style="font-family:${T.mono};font-size:16px;color:${T.gold};font-weight:700;">0</div>
                  <div style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:1px;margin-top:3px;">TROPHIES</div>
                </div>
                <div class="pr-stat-chip" style="flex:1;">
                  <div style="font-family:${T.mono};font-size:16px;color:${T.green};font-weight:700;">—</div>
                  <div style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:1px;margin-top:3px;">WIN RATE</div>
                </div>
                <div class="pr-stat-chip" style="flex:1;">
                  <div style="font-family:${T.mono};font-size:16px;color:${T.blue};font-weight:700;">0</div>
                  <div style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:1px;margin-top:3px;">STREAK</div>
                </div>
              </div>
            </div>

            <!-- PLAY button -->
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:10px 0;">
              <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;">
                <!-- Ping rings -->
                <div style="position:absolute;width:110px;height:110px;border-radius:50%;border:2px solid ${T.gold};animation:ping 1.8s ease-out infinite;"></div>
                <div style="position:absolute;width:110px;height:110px;border-radius:50%;border:2px solid ${T.gold};animation:ping 1.8s ease-out 0.6s infinite;"></div>
                <!-- Button -->
                <button id="lobby-play-mode" data-mode=""
                  style="position:relative;width:110px;height:110px;border-radius:50%;background:linear-gradient(135deg,${T.bgPanel},${T.bgCard});border:2px solid ${T.gold};cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;transition:filter 0.15s;"
                  onmouseover="this.style.filter='brightness(1.2)'" onmouseout="this.style.filter=''">
                  <span style="font-size:28px;">⚔</span>
                  <span style="font-family:${T.mono};font-size:10px;color:${T.gold};letter-spacing:3px;">PLAY</span>
                </button>
              </div>
              <div style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:2px;">TAP TO FIND A MATCH</div>
            </div>

          </div>

          <!-- Right column: game modes -->
          <div style="flex:1;padding:20px 24px;overflow-y:auto;">
            <div style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:3px;margin-bottom:14px;">GAME MODES</div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${modeCards}
            </div>

            <!-- Signed in as -->
            <div style="margin-top:24px;padding-top:16px;border-top:1px solid ${T.borderMid};display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:${T.mono};font-size:9px;color:${T.textDim};letter-spacing:1px;">
                ${gameState.userId ? `SIGNED IN · ${gameState.userId.slice(0, 8)}...` : 'PLAYING AS GUEST'}
              </span>
              <button class="pr-btn-ghost" id="lobby-signout" style="font-size:9px;letter-spacing:1px;">SIGN OUT</button>
            </div>
          </div>
        </div>
      </div>
    `

    ;(document.getElementById('lobby-play-mode') as HTMLButtonElement).onclick = () => {
      this.showRoomCode()
    }

    ;(document.getElementById('lobby-settings') as HTMLDivElement).onclick = () => {
      // Settings stub — future phase
    }

    ;(document.getElementById('lobby-signout') as HTMLButtonElement).onclick = async () => {
      await supabase.auth.signOut()
      gameState.userId = null
      gameState.username = null
      gameState.playerFaction = null
      this.scene.start('AuthScene')
    }
  }

  // ── Room Code screen ───────────────────────────────────────────────────────
  private showRoomCode() {
    this.overlay.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
        ${starField()}
        <div style="position:relative;z-index:1;width:500px;animation:fadeSlideUp 0.4s ease both;">

          <!-- Title -->
          <div style="text-align:center;margin-bottom:28px;">
            <div style="font-family:${T.mono};font-size:10px;color:${T.textDim};letter-spacing:4px;margin-bottom:6px;">MULTIPLAYER</div>
            <div style="font-family:'Palatino Linotype',Palatino,serif;font-size:28px;color:${T.gold};letter-spacing:2px;">FIND A MATCH</div>
          </div>

          <!-- Two option panels -->
          <div style="display:flex;gap:16px;margin-bottom:20px;">

            <!-- Create Room -->
            <div class="pr-card" style="flex:1;text-align:center;padding:24px 20px;">
              <div style="font-size:32px;margin-bottom:10px;">🏰</div>
              <div style="font-family:${T.mono};font-size:11px;color:${T.gold};letter-spacing:2px;margin-bottom:8px;">CREATE ROOM</div>
              <div style="font-size:12px;color:${T.textDim};line-height:1.5;margin-bottom:16px;">Generate a room code and share it with a friend to start a match.</div>
              <button class="pr-btn pr-btn-gold" id="rc-create">CREATE ROOM</button>
            </div>

            <!-- Join Room -->
            <div class="pr-card" style="flex:1;text-align:center;padding:24px 20px;">
              <div style="font-size:32px;margin-bottom:10px;">🚪</div>
              <div style="font-family:${T.mono};font-size:11px;color:${T.blue};letter-spacing:2px;margin-bottom:8px;">JOIN ROOM</div>
              <div style="font-size:12px;color:${T.textDim};line-height:1.5;margin-bottom:12px;">Enter a 6-character room code to join an existing match.</div>
              <input class="pr-input" id="rc-code-input" type="text" placeholder="XXXXXX" maxlength="6"
                style="text-align:center;text-transform:uppercase;letter-spacing:6px;font-size:18px;padding-left:14px;margin-bottom:10px;"/>
              <button class="pr-btn" style="background:${T.blue};color:#fff;font-family:${T.mono};font-size:12px;letter-spacing:2px;" id="rc-join">JOIN GAME</button>
            </div>
          </div>

          <div class="pr-err" id="rc-err" style="text-align:center;"></div>

          <div style="text-align:center;">
            <button class="pr-btn-ghost" id="rc-back">← Back to Lobby</button>
          </div>

          <!-- Create room result (hidden initially) -->
          <div id="rc-created-panel" style="display:none;margin-top:16px;background:${T.bgCard};border:1px solid ${T.borderGold};border-radius:12px;padding:24px;text-align:center;">
            <div style="font-family:${T.mono};font-size:10px;color:${T.textDim};letter-spacing:3px;margin-bottom:10px;">YOUR ROOM CODE</div>
            <div id="rc-display-code" style="font-family:${T.mono};font-size:42px;color:${T.gold};letter-spacing:10px;margin-bottom:10px;"></div>
            <div style="font-size:12px;color:${T.textDim};margin-bottom:16px;">Share this code with your opponent. Waiting for them to join...</div>
            <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
              <div style="width:10px;height:10px;border-radius:50%;background:${T.green};animation:pulse 1.2s ease-in-out infinite;"></div>
              <span style="font-family:${T.mono};font-size:10px;color:${T.textMid};letter-spacing:2px;">WAITING FOR OPPONENT</span>
            </div>
          </div>
        </div>
      </div>
    `

    const errEl = document.getElementById('rc-err') as HTMLDivElement
    const setErr = (msg: string) => { errEl.textContent = msg }

    ;(document.getElementById('rc-back') as HTMLButtonElement).onclick = () => {
      this.cleanupChannel()
      this.showLobby()
    }

    // Force uppercase on code input
    const codeInput = document.getElementById('rc-code-input') as HTMLInputElement
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    })

    // ── Create Room ──────────────────────────────────────────────────────────
    ;(document.getElementById('rc-create') as HTMLButtonElement).onclick = async () => {
      setErr('')
      const btn = document.getElementById('rc-create') as HTMLButtonElement
      btn.textContent = 'CREATING...'
      btn.disabled = true

      const code = generateRoomCode()
      const faction = gameState.playerFaction ?? 'machines'

      const { data: room, error } = await supabase
        .from('rooms')
        .insert({
          host_id: gameState.userId ?? 'guest',
          host_faction: faction,
          code,
          state: 'waiting',
        })
        .select()
        .single()

      if (error) {
        setErr('FAILED TO CREATE ROOM — TRY AGAIN')
        btn.textContent = 'CREATE ROOM'
        btn.disabled = false
        return
      }

      const roomId = room.id
      gameState.roomId = roomId
      gameState.role = 'host'

      // Show the code
      const panel = document.getElementById('rc-created-panel') as HTMLDivElement
      const codeDisplay = document.getElementById('rc-display-code') as HTMLDivElement
      panel.style.display = 'block'
      codeDisplay.textContent = code
      btn.style.display = 'none'

      // Subscribe to realtime on this room row
      this.cleanupChannel()
      this.realtimeChannel = supabase
        .channel(`room-${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            const updated = payload.new as { guest_id?: string; guest_faction?: string; state?: string }
            if (updated.guest_id) {
              // Guest has joined — transition to game
              gameState.playerFaction = faction
              this.cleanupChannel()
              this.scene.start('GameScene', {
                roomId,
                role: 'host',
                playerFaction: faction,
              })
            }
          }
        )
        .subscribe()
    }

    // ── Join Room ────────────────────────────────────────────────────────────
    ;(document.getElementById('rc-join') as HTMLButtonElement).onclick = async () => {
      setErr('')
      const code = codeInput.value.trim().toUpperCase()
      if (code.length !== 6) { setErr('ENTER A 6-CHARACTER CODE'); return }

      const btn = document.getElementById('rc-join') as HTMLButtonElement
      btn.textContent = 'JOINING...'
      btn.disabled = true

      const { data: room, error } = await supabase
        .from('rooms')
        .select()
        .eq('code', code)
        .eq('state', 'waiting')
        .single()

      if (error || !room) {
        setErr('ROOM NOT FOUND OR ALREADY STARTED')
        btn.textContent = 'JOIN GAME'
        btn.disabled = false
        return
      }

      const faction = gameState.playerFaction ?? 'machines'
      const { error: updateErr } = await supabase
        .from('rooms')
        .update({
          guest_id: gameState.userId ?? 'guest',
          guest_faction: faction,
          state: 'active',
        })
        .eq('id', room.id)

      if (updateErr) {
        setErr('FAILED TO JOIN ROOM — TRY AGAIN')
        btn.textContent = 'JOIN GAME'
        btn.disabled = false
        return
      }

      gameState.roomId = room.id
      gameState.role = 'guest'
      gameState.playerFaction = faction

      this.cleanupChannel()
      this.scene.start('GameScene', {
        roomId: room.id,
        role: 'guest',
        playerFaction: faction,
      })
    }
  }

  private cleanupChannel() {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel)
      this.realtimeChannel = null
    }
  }
}
