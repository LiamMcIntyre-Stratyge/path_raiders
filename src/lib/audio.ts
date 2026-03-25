// Procedural audio via Web Audio API — no asset files needed

class AudioManager {
  private _ctx: AudioContext | null = null

  private get ctx(): AudioContext {
    if (!this._ctx) this._ctx = new AudioContext()
    if (this._ctx.state === 'suspended') void this._ctx.resume()
    return this._ctx
  }

  // ── Sound generators ────────────────────────────────────────────────────────

  playDeploy() {
    try {
      const ctx = this.ctx, t = ctx.currentTime
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(700, t)
      osc.frequency.exponentialRampToValueAtTime(350, t + 0.13)
      gain.gain.setValueAtTime(0.22, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
      osc.start(t); osc.stop(t + 0.13)
    } catch { /* audio blocked */ }
  }

  playHit() {
    try {
      const ctx = this.ctx, t = ctx.currentTime
      const len  = Math.floor(ctx.sampleRate * 0.04)
      const buf  = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
      const src    = ctx.createBufferSource()
      const filter = ctx.createBiquadFilter()
      const gain   = ctx.createGain()
      src.buffer = buf
      filter.type = 'bandpass'; filter.frequency.value = 1400; filter.Q.value = 0.6
      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.3, t)
      src.start(t)
    } catch { /* audio blocked */ }
  }

  playWallHit() {
    try {
      const ctx = this.ctx, t = ctx.currentTime
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(160, t)
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.09)
      osc.connect(gain); gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.18, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
      osc.start(t); osc.stop(t + 0.09)
    } catch { /* audio blocked */ }
  }

  playWallBreak() {
    try {
      const ctx = this.ctx, t = ctx.currentTime
      const len  = Math.floor(ctx.sampleRate * 0.35)
      const buf  = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.2)
      const src    = ctx.createBufferSource()
      const filter = ctx.createBiquadFilter()
      const gain   = ctx.createGain()
      src.buffer = buf
      filter.type = 'lowpass'; filter.frequency.value = 900
      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.55, t)
      src.start(t)
    } catch { /* audio blocked */ }
  }

  playBaseHit() {
    try {
      const ctx = this.ctx, t = ctx.currentTime
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(90, t)
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.35)
      osc.connect(gain); gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.65, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      osc.start(t); osc.stop(t + 0.35)
    } catch { /* audio blocked */ }
  }

  playVictory() {
    try {
      const ctx   = this.ctx
      const notes = [523, 659, 784, 1047]   // C E G C
      notes.forEach((freq, i) => {
        const t    = ctx.currentTime + i * 0.13
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = freq
        osc.connect(gain); gain.connect(ctx.destination)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
        osc.start(t); osc.stop(t + 0.45)
      })
    } catch { /* audio blocked */ }
  }

  playDefeat() {
    try {
      const ctx   = this.ctx
      const notes = [392, 311, 247]          // G Eb B (descending minor)
      notes.forEach((freq, i) => {
        const t    = ctx.currentTime + i * 0.2
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, t)
        osc.frequency.exponentialRampToValueAtTime(freq * 0.75, t + 0.3)
        osc.connect(gain); gain.connect(ctx.destination)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.22, t + 0.04)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
        osc.start(t); osc.stop(t + 0.45)
      })
    } catch { /* audio blocked */ }
  }
}

export const audio = new AudioManager()
