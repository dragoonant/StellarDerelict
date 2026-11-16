// The asset manifest (specs 30, 60 and 70): generated figures, props, 2D art, sounds, music and voice. Everything starts
// disabled or absent; the game falls back to procedural figures, flat plates and silence for anything not enabled.
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
  /** triangle budget (spec 30); tools/models/optimize.mjs simplifies a GLB above it */
  maxTris?: number
  /** the full generation prompt: shared body plus the per-figure line */
  prompt: string
}

export type ImageKind = 'texture' | 'portrait' | 'plate' | 'decal'

/** One generated image (spec 70). `use` says where the client shows it; nothing reads an image that is not enabled. */
export interface ImageEntry {
  id: string
  kind: ImageKind
  /** under public/assets/ */
  file: string
  /** flipped on by tools/art/gen-art.mjs --pick once the file is published */
  enabled: boolean
  aspect: string
  /** published width and height in pixels */
  size: [number, number]
  /** floor | wall | wall-fire | ceiling | door | duct | unit:<id> | model:<slug> | title | mission:<id> | debrief:<seat>-<win|loss> | scar:<burn|kill> | dress:<claw|debris> */
  use: string
  /** board textures: how often this variant is drawn against the others of its use (default 1); damaged plates are rarer */
  weight?: number
  /** portraits: the model slug whose picked concept is attached to the image-edit job */
  ref?: string
  /** which candidate was published, and the seed of the job that made it */
  pick?: number
  seed?: number
  prompt: string
}

export interface ArtProvider {
  provider: 'flux-studio'
  model: string
  candidates: number
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
  /** how literally the sound-effect model follows the prompt (0-1; the generator's default is 0.4) */
  promptInfluence?: number
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
  /** a Warden id, or 'comms' for the briefing narration */
  speaker: string
  enabled: boolean
  /** an engine Event type, or 'briefing' (played when the Briefing screen opens; `when` is the mission id) */
  event: string
  /** `carrier` for the core-carrier lines, a mission id for a briefing */
  when?: string
  text: string
  file: string
  /** the voice description the speaker's voice was designed from (the voices table is canonical) */
  voiceDesign: string
  /** an Eleven v3 audio tag spoken before the line, for example "[urgent]" */
  delivery?: string
}

/** One designed voice per speaker, saved in the ElevenLabs account; the generator speaks every line of a speaker with it. */
export interface VoiceProfile {
  voiceId: string
  name: string
  model: string
  design: string
}

export interface AudioProvider {
  provider: 'elevenlabs'
  models: { sfx: string; music: string; tts: string; design: string }
}

export interface AssetManifest {
  models: ModelEntry[]
  art: ArtProvider
  images: ImageEntry[]
  audio: AudioProvider
  voices: Record<string, VoiceProfile>
  sounds: SoundEntry[]
  music: MusicEntry[]
  voice: VoiceEntry[]
}

export const assets = assetsJson as unknown as AssetManifest

export const MODEL_SLUGS: readonly string[] = assets.models.map((m) => m.slug)

export function modelEntry(slug: string): ModelEntry | undefined {
  return assets.models.find((m) => m.slug === slug)
}

/** Enabled images whose `use` is exactly `use`, in manifest order (variants of one surface share a use). */
export function imagesFor(use: string): ImageEntry[] {
  return assets.images.filter((im) => im.enabled && im.use === use)
}

export function imageEntry(id: string): ImageEntry | undefined {
  return assets.images.find((im) => im.id === id)
}

/** A stable small integer for a board square, for picking a texture variant and a quarter turn. */
export function tileHash(x: number, y: number): number {
  return fnv1a(`${x},${y}`)
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
