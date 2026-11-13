// Pure parts of the audio generator: job bodies from the manifest, the idempotent plan, ffmpeg arguments. Unit-tested.
// Request fields follow docs/knowledge-base/local-ai-studios.md ("Audio Studio job parameters").
import path from 'node:path'
import { REPO_ROOT } from '../lib/studio.mjs'

export const DEFAULT_BASE = 'http://localhost:7890'
export const PUBLIC_ASSETS = path.join(REPO_ROOT, 'public', 'assets')
export const RAW_DIR = path.join(REPO_ROOT, 'tools', 'out', 'audio', 'raw')
export const KINDS = ['sfx', 'music', 'voice']

/** A stable seed from an id, so a re-run reproduces the same take (the seed is recorded in the request). */
export function seedOf(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h % 2147483647
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function buildSfxJob(s) {
  return {
    mode: 'sfx',
    prompt: s.prompt,
    negative: s.negative ?? 'music, voices, speech',
    seconds: clamp(Math.ceil(s.seconds), 1, 47),
    steps: 50,
    guidance: 5,
    batch: clamp(s.files.length, 1, 4),
    seed: seedOf(s.id),
  }
}

export function buildMusicJob(m) {
  return {
    mode: 'music',
    prompt: m.prompt,
    lyrics: '[Instrumental]',
    duration: clamp(Math.round(m.seconds), 10, 240),
    steps: 8,
    bpm: clamp(Math.round(m.bpm), 10, 300),
    key: m.key ?? 'C minor',
    timesig: '4',
    batch: 1,
    seed: seedOf(`music-${m.state}`),
  }
}

export function buildVoiceJob(v) {
  return {
    mode: 'voice',
    model: 'qwen-design',
    text: v.text,
    language: 'English',
    instruct: v.voiceDesign,
    temperature: 0.8,
    seed: seedOf(v.id),
  }
}

/**
 * The jobs still to run. `exists(relPath)` says whether a public file is already there. An entry is skipped when every one of its
 * files exists (unless `force`). `only` is a Set of ids (sound id, music state, voice id) or null; `kind` is sfx|music|voice or null.
 */
export function planAudio(manifest, { only = null, kind = null, force = false } = {}, exists = () => false) {
  const jobs = []
  const add = (k, id, body, files, extra = {}) => {
    if (kind && kind !== k) return
    if (only && !only.has(id)) return
    const missing = files.filter((f) => !exists(f))
    if (!force && missing.length === 0) return
    jobs.push({ kind: k, id, body, files, missing: force ? files : missing, ...extra })
  }
  for (const s of manifest.sounds) add('sfx', s.id, buildSfxJob(s), s.files, { loop: !!s.loop })
  for (const m of manifest.music) add('music', m.state, buildMusicJob(m), [m.file])
  for (const v of manifest.voice) add('voice', v.id, buildVoiceJob(v), [v.file])
  return jobs
}

/** Ids a user may name with --only. */
export function knownIds(manifest) {
  return new Set([...manifest.sounds.map((s) => s.id), ...manifest.music.map((m) => m.state), ...manifest.voice.map((v) => v.id)])
}

const VOICE_RADIO = 'highpass=f=250,lowpass=f=3800,acompressor=threshold=-18dB:ratio=4:attack=5:release=60,alimiter=limit=0.9'

/** ffmpeg arguments that turn a downloaded FLAC/WAV into the manifest's mp3. Voice gets the radio band and compression. */
export function convertArgs(kind, input, output) {
  const a = ['-y', '-hide_banner', '-loglevel', 'error', '-i', input]
  if (kind === 'voice') a.push('-af', VOICE_RADIO)
  a.push('-ac', kind === 'music' ? '2' : '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', kind === 'music' ? '2' : '3', output)
  return a
}

/** Return a copy of the manifest with `enabled` set for the entries named (by sound id, music state or voice id). */
export function withEnabled(manifest, ids, value = true) {
  const set = (list) => list.map((e) => ((e.id ?? e.state) && ids.has(e.id ?? e.state) ? { ...e, enabled: value } : e))
  return { ...manifest, sounds: set(manifest.sounds), music: set(manifest.music), voice: set(manifest.voice) }
}
