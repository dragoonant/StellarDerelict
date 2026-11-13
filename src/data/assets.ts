// The asset manifest (spec 30 and 60): generated figures, props, sounds, music and voice. Everything starts disabled or
// absent; the game falls back to procedural figures and silence for anything not enabled or not on disk.
import assetsJson from './assets.json'
import type { Role } from './types'

export interface ModelEntry {
  slug: string
  kind: 'warden' | 'stalker' | 'prop'
  /** Warden models only: the squad role that uses it */
  role?: Role
  /** under public/assets/ */
  file: string
  enabled: boolean
  /** figure height in inches; the board scales it with WORLD_PER_INCH */
  heightIn: number
  /** extra rotation about Y in degrees to make a generated model face +Z */
  yaw: number
  /** the full generation prompt: shared body plus the per-figure line */
  prompt: string
}

/** Event types the sound map understands, plus the three non-engine sources. */
export interface SoundEntry {
  id: string
  /** variants under public/assets/ */
  files: string[]
  /** flipped on by tools/audio/gen-audio.mjs once the files exist; the game requests nothing that is not enabled */
  enabled: boolean
  /** an engine Event type, or 'ui' | 'timer' | 'always' */
  event: string
  /** a refinement of the event, for example `kind:warden` (see src/client/audio/soundMap.ts) */
  when?: string
  gain: number
  bus: 'sfx'
  seconds: number
  prompt: string
  negative?: string
  loop?: boolean
}

export type MusicState = 'calm' | 'tense' | 'battle' | 'alarm' | 'victory' | 'defeat' | 'title'

export interface MusicEntry {
  state: MusicState
  enabled: boolean
  file: string
  seconds: number
  bpm: number
  prompt: string
}

export interface VoiceEntry {
  id: string
  /** a Warden id, or 'carrier' for whoever holds the core */
  speaker: string
  enabled: boolean
  event: string
  when?: string
  text: string
  file: string
  voiceDesign: string
}

export interface AssetManifest {
  models: ModelEntry[]
  sounds: SoundEntry[]
  music: MusicEntry[]
  voice: VoiceEntry[]
}

export const assets = assetsJson as unknown as AssetManifest

export const MODEL_SLUGS: readonly string[] = assets.models.map((m) => m.slug)

export function modelEntry(slug: string): ModelEntry | undefined {
  return assets.models.find((m) => m.slug === slug)
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Stalkers pick a, b or c by a stable hash of the unit id. */
export function stalkerSlug(unitId: string): string {
  return `stalker-${'abc'[fnv1a(unitId) % 3]}`
}

/** Which model a Warden uses; `nth` is its position among the squad's `warden`-role members (rifle-a, then rifle-b). */
export function wardenSlug(role: Role, nth: number): string {
  if (role === 'sergeant') return 'warden-sergeant'
  if (role === 'scorcher') return 'warden-scorcher'
  if (role === 'tech') return 'warden-tech'
  return nth % 2 === 0 ? 'warden-rifle-a' : 'warden-rifle-b'
}
