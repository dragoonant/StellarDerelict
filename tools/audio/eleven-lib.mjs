// Pure parts of the ElevenLabs generator (unit-tested): request bodies from the manifest, the idempotent per-file plan, the
// credit estimate, voice design and adoption bodies. Nothing here touches the network, the disk or the key.
// Measured on the Starter plan, 2026-11-15: a sound effect costs 10 credits a second, music 12.5 credits a second, speech
// one credit a character (tags included), a voice design about the length of its preview text; the sound-effect model
// takes 0.5–30 s, music 3–600 s.
import path from 'node:path'
import { REPO_ROOT } from '../lib/studio.mjs'

export const API = 'https://api.elevenlabs.io'
export const RAW_DIR = path.join(REPO_ROOT, 'tools', 'out', 'audio', 'eleven')
export const OUTPUT_FORMAT = 'mp3_44100_128'
export const MODELS = { sfx: 'eleven_text_to_sound_v2', music: 'music_v1', tts: 'eleven_v3', design: 'eleven_ttv_v3' }
export const CREDITS = { sfxPerSecond: 10, musicPerSecond: 12.5, ttsPerChar: 1 }
export const SFX_SECONDS = [0.5, 30]
export const MUSIC_MS = [3000, 600000]
export const KINDS = ['sfx', 'music', 'voice']

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const q = `?output_format=${OUTPUT_FORMAT}`

/** One sound-effect request per file: the model returns one take, so variants are separate requests. */
export function sfxRequest(s) {
  const body = {
    text: s.prompt,
    duration_seconds: clamp(Number(s.seconds), SFX_SECONDS[0], SFX_SECONDS[1]),
    prompt_influence: s.promptInfluence ?? 0.4,
    model_id: MODELS.sfx,
  }
  if (s.loop) body.loop = true
  return { route: `/v1/sound-generation${q}`, body }
}

export function musicRequest(m) {
  return {
    route: `/v1/music${q}`,
    body: {
      prompt: `${m.prompt}. Instrumental only, no vocals, no lyrics, written to loop seamlessly.`,
      music_length_ms: clamp(Math.round(Number(m.seconds) * 1000), MUSIC_MS[0], MUSIC_MS[1]),
      model_id: MODELS.music,
      force_instrumental: true,
    },
  }
}

/** The spoken text: an optional delivery tag (Eleven v3 audio tags such as "[urgent]") before the line. */
export const spokenText = (v) => (v.delivery ? `${v.delivery} ${v.text}` : v.text)

export function voiceRequest(v, voices) {
  const voice = voices?.[v.speaker]
  if (!voice?.voiceId) throw new Error(`no voice for speaker ${v.speaker}: design and adopt one first (--design ${v.speaker})`)
  return {
    route: `/v1/text-to-speech/${encodeURIComponent(voice.voiceId)}${q}`,
    body: {
      text: spokenText(v),
      model_id: voice.model ?? MODELS.tts,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true },
    },
  }
}

export function estimateCredits(kind, entry) {
  if (kind === 'sfx') return Math.ceil(clamp(Number(entry.seconds), SFX_SECONDS[0], SFX_SECONDS[1]) * CREDITS.sfxPerSecond)
  if (kind === 'music') return Math.ceil(clamp(Number(entry.seconds), MUSIC_MS[0] / 1000, MUSIC_MS[1] / 1000) * CREDITS.musicPerSecond)
  return Math.ceil(spokenText(entry).length * CREDITS.ttsPerChar)
}

/**
 * The files still to generate, one job per file. `exists(relPath)` says whether the public file is already there; `only` is a
 * Set of ids (sound id, music state, voice id) or null; `kind` is sfx|music|voice or null; `force` regenerates existing files.
 */
export function planEleven(manifest, { only = null, kind = null, force = false } = {}, exists = () => false) {
  const jobs = []
  const add = (k, id, file, request, estimate) => {
    if (kind && kind !== k) return
    if (only && !only.has(id)) return
    if (!force && exists(file)) return
    jobs.push({ kind: k, id, file, request, estimate })
  }
  for (const s of manifest.sounds) for (const f of s.files) add('sfx', s.id, f, sfxRequest(s), estimateCredits('sfx', s))
  for (const m of manifest.music) add('music', m.state, m.file, musicRequest(m), estimateCredits('music', m))
  for (const v of manifest.voice) {
    let request
    try {
      request = voiceRequest(v, manifest.voices)
    } catch (e) {
      request = { error: e instanceof Error ? e.message : String(e) }
    }
    add('voice', v.id, v.file, request, estimateCredits('voice', v))
  }
  return jobs
}

export const totalEstimate = (jobs) => jobs.reduce((n, j) => n + j.estimate, 0)

/** Ids a user may name with --only. */
export function knownIds(manifest) {
  return new Set([...manifest.sounds.map((s) => s.id), ...manifest.music.map((m) => m.state), ...manifest.voice.map((v) => v.id)])
}

/** A voice-design request for a speaker: the description from the voices table, the preview text from the speaker's own lines. */
export function designRequest(speaker, manifest) {
  const voice = manifest.voices?.[speaker]
  if (!voice?.design) throw new Error(`speaker ${speaker} has no design in the voices table`)
  const lines = manifest.voice.filter((v) => v.speaker === speaker).map((v) => v.text)
  let text = lines.join(' ')
  while (text.length < 100) text = `${text} ${lines.join(' ')}`.trim()
  return { route: '/v1/text-to-voice/design', body: { voice_description: voice.design, text: text.slice(0, 1000), model_id: MODELS.design, output_format: OUTPUT_FORMAT } }
}

/** Saves a designed preview as a voice in the account. */
export function adoptRequest(speaker, manifest, generatedVoiceId) {
  const voice = manifest.voices?.[speaker]
  if (!voice?.design) throw new Error(`speaker ${speaker} has no design in the voices table`)
  return { route: '/v1/text-to-voice', body: { voice_name: voice.name ?? `Stellar Derelict ${speaker}`, voice_description: voice.design, generated_voice_id: generatedVoiceId, labels: { project: 'stellar-derelict' } } }
}

/** A copy of the manifest with one speaker's voice id recorded. */
export function withVoiceId(manifest, speaker, voiceId) {
  return { ...manifest, voices: { ...manifest.voices, [speaker]: { ...manifest.voices?.[speaker], voiceId } } }
}

/** How long to wait before retrying a failed request, or null to give up. 429 waits for the server's Retry-After. */
export function retryDelayMs(status, attempt, retryAfterHeader = null) {
  if (attempt >= 3) return null
  if (status === 429) return Math.max(1000, Number(retryAfterHeader ?? 0) * 1000 || 5000)
  if (status >= 500) return 2000 * attempt
  return null
}
