// The Web Audio runtime: one context, three buses (sfx, music, voice), music ducked 6 dB under voice, a 1.5 s music
// crossfade, an ambience loop. The context is created on the first user gesture and resumed from touchend / pointerup /
// click for the whole session (iOS, KB gotchas). Entries that are not `enabled` in the manifest are never requested, so a
// checkout with no generated files makes no requests, errors or logs. A failed file is skipped silently and remembered.
import { assets, type MusicState } from '../../data'
import { BufferCache } from './bufferCache'
import { VariantRotator, VoiceGate } from './limits'
import { AMBIENCE } from './soundMap'
import { loadAudioSettings, storeAudioSettings, type AudioSettings } from './settings'

const DUCK_GAIN = 0.5 // -6 dB
const FADE_S = 1.5
/** A sound whose buffer was still loading is dropped if it would start later than this. */
const STALE_MS = 1200

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
/** `?audio=all` plays every manifest entry whose file exists (sounds.html); `?audio=none` keeps the game silent whatever the manifest says. */
const ALL = params.get('audio') === 'all'
const NONE = params.get('audio') === 'none'
const url = (file: string): string => import.meta.env.BASE_URL + 'assets/' + file

const soundById = new Map(assets.sounds.map((s) => [s.id, s]))
const voiceById = new Map(assets.voice.map((v) => [v.id, v]))
const musicByState = new Map(assets.music.map((m) => [m.state, m]))

class Engine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private bus: Record<'sfx' | 'music' | 'voice', GainNode> | null = null
  private duck: GainNode | null = null
  private cache: BufferCache<AudioBuffer> | null = null
  private settings: AudioSettings = loadAudioSettings()
  private readonly listeners = new Set<() => void>()
  private readonly rot = new VariantRotator()
  private readonly gate = new VoiceGate(2000)
  private music: { state: MusicState; src: AudioBufferSourceNode; gain: GainNode } | null = null
  private wantMusic: MusicState | null = null
  private ambience: AudioBufferSourceNode | null = null
  private wantAmbience = false
  private voiceEnd = 0
  private installed = false
  /** diagnostics for sounds.html and tests: ids that played */
  readonly played: string[] = []

  /** Any enabled entry at all? With none, the engine never touches Web Audio. */
  anyEnabled(): boolean {
    if (NONE) return false
    return ALL || assets.sounds.some((s) => s.enabled) || assets.music.some((m) => m.enabled) || assets.voice.some((v) => v.enabled)
  }
  private on(e: { enabled: boolean }): boolean {
    if (NONE) return false
    return ALL || e.enabled
  }

  install(): void {
    if (this.installed || typeof window === 'undefined') return
    this.installed = true
    const kick = (): void => this.unlock()
    for (const t of ['touchend', 'pointerup', 'click', 'keydown'] as const) window.addEventListener(t, kick, { capture: true, passive: true })
  }

  private unlock(): void {
    if (!this.anyEnabled()) return
    const C = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined
    if (!C) return
    try {
      if (!this.ctx) {
        const ctx = new C()
        this.ctx = ctx
        const master = ctx.createGain()
        master.connect(ctx.destination)
        const duck = ctx.createGain()
        duck.connect(master)
        const mk = (dest: AudioNode): GainNode => {
          const g = ctx.createGain()
          g.connect(dest)
          return g
        }
        this.master = master
        this.duck = duck
        this.bus = { sfx: mk(master), music: mk(duck), voice: mk(master) }
        this.cache = new BufferCache<AudioBuffer>(
          async (u) => {
            const r = await fetch(u)
            const type = r.headers.get('content-type') ?? ''
            if (!r.ok || type.includes('text/html')) throw new Error('missing')
            return r.arrayBuffer()
          },
          (b) => ctx.decodeAudioData(b),
        )
        this.applySettings()
      }
      const ctx = this.ctx
      if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined)
      this.resumeWanted()
    } catch {
      /* no audio on this device: stay silent */
    }
  }

  private resumeWanted(): void {
    if (this.wantMusic) this.setMusic(this.wantMusic, true)
    if (this.wantAmbience) this.startAmbience()
  }

  private running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !!this.bus
  }

  // ------------------------------------------------------------------ settings
  getSettings(): AudioSettings {
    return this.settings
  }
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  setSettings(p: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...p }
    storeAudioSettings(this.settings)
    this.applySettings()
    this.listeners.forEach((f) => f())
  }
  private applySettings(): void {
    const ctx = this.ctx
    if (!ctx || !this.bus || !this.master) return
    const t = ctx.currentTime
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.03)
    this.bus.sfx.gain.setTargetAtTime(this.settings.sfx, t, 0.03)
    this.bus.music.gain.setTargetAtTime(this.settings.music, t, 0.03)
    this.bus.voice.gain.setTargetAtTime(this.settings.voice, t, 0.03)
  }

  // ------------------------------------------------------------------ playback
  private async buffer(file: string): Promise<AudioBuffer | null> {
    return this.cache ? this.cache.get(url(file)) : null
  }

  playSfx(id: string): void {
    const s = soundById.get(id)
    if (!s || !this.on(s) || !this.running()) return
    const file = s.files[this.rot.next(id, s.files.length)]
    if (!file) return
    const asked = performance.now()
    void this.buffer(file).then((buf) => {
      if (!buf || !this.ctx || !this.bus || performance.now() - asked > STALE_MS) return
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      const g = this.ctx.createGain()
      g.gain.value = s.gain
      src.connect(g).connect(this.bus.sfx)
      src.start()
      this.played.push(id)
    })
  }

  playVoice(id: string): void {
    const v = voiceById.get(id)
    if (!v || !this.on(v) || !this.running()) return
    const now = performance.now()
    if (!this.gate.canPlay(now)) return
    // reserve the slot at once so two requests in one beat cannot both pass the gate while the file loads
    this.gate.start(now, 1500)
    void this.buffer(v.file).then((buf) => {
      if (!buf || !this.ctx || !this.bus || !this.duck) {
        this.gate.release()
        return
      }
      const t = performance.now()
      this.gate.start(t, buf.duration * 1000)
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.connect(this.bus.voice)
      const c = this.ctx.currentTime
      this.duck.gain.cancelScheduledValues(c)
      this.duck.gain.setTargetAtTime(DUCK_GAIN, c, 0.05)
      this.voiceEnd = t + buf.duration * 1000
      src.onended = (): void => {
        if (!this.ctx || !this.duck || performance.now() < this.voiceEnd - 50) return
        this.duck.gain.setTargetAtTime(1, this.ctx.currentTime, 0.4)
      }
      src.start()
      this.played.push(id)
    })
  }

  setMusic(state: MusicState | null, force = false): void {
    if (!force && state === (this.music?.state ?? this.wantMusic)) return
    this.wantMusic = state
    if (!this.running() || !this.ctx || !this.bus) return
    const ctx = this.ctx
    const old = this.music
    const entry = state ? musicByState.get(state) : undefined
    const fadeOld = (): void => {
      if (!old) return
      old.gain.gain.cancelScheduledValues(ctx.currentTime)
      old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime)
      old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_S)
      old.src.stop(ctx.currentTime + FADE_S + 0.05)
    }
    if (!state || !entry || !this.on(entry)) {
      fadeOld()
      this.music = null
      return
    }
    if (old && old.state === state) return
    void this.buffer(entry.file).then((buf) => {
      if (this.wantMusic !== state || !this.ctx || !this.bus) return
      if (!buf) {
        fadeOld()
        this.music = null
        return
      }
      fadeOld()
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, ctx.currentTime)
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_S)
      src.connect(g).connect(this.bus.music)
      src.start()
      this.music = { state, src, gain: g }
    })
  }

  startAmbience(): void {
    this.wantAmbience = true
    const s = soundById.get(AMBIENCE)
    if (!s || !this.on(s) || !this.running() || this.ambience || !this.ctx || !this.bus) return
    const file = s.files[0]
    if (!file) return
    void this.buffer(file).then((buf) => {
      if (!buf || !this.wantAmbience || this.ambience || !this.ctx || !this.bus) return
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const g = this.ctx.createGain()
      g.gain.value = s.gain
      src.connect(g).connect(this.bus.sfx)
      src.start()
      this.ambience = src
    })
  }
  stopAmbience(): void {
    this.wantAmbience = false
    try {
      this.ambience?.stop()
    } catch {
      /* already stopped */
    }
    this.ambience = null
  }

  /** Test and diagnostics hook. */
  failures(): string[] {
    return this.cache?.failures() ?? []
  }
}

export const audioEngine = new Engine()
