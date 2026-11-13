// Mix settings: three bus sliders and a mute, saved under `stellar-derelict-audio` (every storage call in try/catch).
export const AUDIO_KEY = 'stellar-derelict-audio'

export interface AudioSettings {
  sfx: number
  music: number
  voice: number
  muted: boolean
}

export const DEFAULT_AUDIO: AudioSettings = { sfx: 0.9, music: 0.6, voice: 0.9, muted: false }

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d)

export function parseAudioSettings(raw: string | null | undefined): AudioSettings {
  if (!raw) return { ...DEFAULT_AUDIO }
  try {
    const o = JSON.parse(raw) as Partial<AudioSettings> | null
    if (!o || typeof o !== 'object') return { ...DEFAULT_AUDIO }
    return { sfx: clamp01(o.sfx, DEFAULT_AUDIO.sfx), music: clamp01(o.music, DEFAULT_AUDIO.music), voice: clamp01(o.voice, DEFAULT_AUDIO.voice), muted: o.muted === true }
  } catch {
    return { ...DEFAULT_AUDIO }
  }
}

export function loadAudioSettings(): AudioSettings {
  try {
    return parseAudioSettings(localStorage.getItem(AUDIO_KEY))
  } catch {
    return { ...DEFAULT_AUDIO }
  }
}

export function storeAudioSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(s))
  } catch {
    /* a convenience */
  }
}
