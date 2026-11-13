#!/usr/bin/env node
// Measure every generated audio file listed in the manifest (needs ffmpeg on PATH): peak, RMS, loudness estimate and crest
// factor, trim leading and trailing silence from one-shot sounds and voice lines, level every file to its kind's loudness
// target (measure-lib TARGET_LUFS, with a limiter), and write public/assets/audio/measure.json (sounds.html shows it).
// Flags gunshot-class sounds with a crest factor under 8 and near-silent files (failed generations: re-roll them).
//   node tools/audio/measure-audio.mjs [--dry-run] [--no-trim] [--no-normalize] [--only id,id]
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, UsageError, isMain, list, parseFlags } from '../lib/studio.mjs'
import { PUBLIC_ASSETS } from './lib.mjs'
import { SR, analyse, crestFlag, normalizeGainDb, silenceBounds, silentFlag } from './measure-lib.mjs'

const MANIFEST = path.join(REPO_ROOT, 'src', 'data', 'assets.json')
const round = (n, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null)

/**
 * Decode at the file's own channel count (ffmpeg's channel rematrixing uses -3 dB coefficients, so both its mono downmix
 * and its stereo upmix misread by about 3 dB): the loudness runs on the channel average, the peak on each channel.
 */
function channelsOf(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  const n = Number((r.stdout ?? '').trim())
  return Number.isInteger(n) && n > 0 ? n : 1
}

function decode(file) {
  const ch = channelsOf(file)
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}`)
  const b = r.stdout
  const frame = 4 * ch
  const all = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % frame)))
  const mono = new Float32Array(all.length / ch)
  let peak = 0
  for (let i = 0; i < mono.length; i++) {
    let sum = 0
    for (let c = 0; c < ch; c++) {
      const v = all[i * ch + c]
      sum += v
      const a = Math.abs(v)
      if (a > peak) peak = a
    }
    mono[i] = sum / ch
  }
  mono.peak = peak
  return mono
}

/** analyse() on the mono mix, with the peak and crest taken from the channels themselves. */
function measure(samples) {
  const m = analyse(samples)
  const peak = samples.peak ?? 0
  const rms = 10 ** (m.rmsDb / 20)
  return { ...m, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, crest: rms > 0 ? peak / rms : 0 }
}

/** Windows briefly locks a file a server or scanner has just opened: retry the swap a few times. */
function swap(tmp, file) {
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file)
      return
    } catch (e) {
      if (i >= 10 || !(e && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES'))) throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
    }
  }
}

function gain(file, db) {
  const tmp = file.replace(/\.mp3$/, '.gain.mp3')
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-af', `volume=${db}dB,alimiter=limit=0.89:attack=5:release=50:level=false` /* level=false: the default auto-level would lift the signal back to the ceiling */, '-c:a', 'libmp3lame', '-q:a', '3', tmp])
  if (r.status !== 0) throw new Error(`ffmpeg could not adjust ${file}`)
  swap(tmp, file)
}

function trim(file, bounds, total) {
  const pad = Math.round(0.01 * SR) // keep 10 ms either side
  const s = Math.max(0, bounds.start - pad)
  const e = Math.min(total, bounds.end + pad * 3)
  const tmp = file.replace(/\.mp3$/, '.trim.mp3')
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-ss', (s / SR).toFixed(4), '-t', ((e - s) / SR).toFixed(4), '-c:a', 'libmp3lame', '-q:a', '3', tmp])
  if (r.status !== 0) throw new Error(`ffmpeg could not trim ${file}`)
  swap(tmp, file)
  return { start: s, end: e }
}

export async function main(argv, io = { log: console.log, err: console.error }) {
  let v
  try {
    v = parseFlags(argv, { 'dry-run': { type: 'boolean' }, 'no-trim': { type: 'boolean' }, 'no-normalize': { type: 'boolean' }, only: { type: 'string' }, help: { type: 'boolean' } })
  } catch (e) {
    if (e instanceof UsageError) return (io.err(`error: ${e.message}`), 2)
    throw e
  }
  if (v.help) return (io.log('Usage: node tools/audio/measure-audio.mjs [--dry-run] [--no-trim] [--no-normalize] [--only id,id]'), 0)
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    io.err('error: ffmpeg is not on PATH (winget install Gyan.FFmpeg).')
    return 2
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const only = v.only ? new Set(list(v.only)) : null
  const items = [
    ...manifest.sounds.flatMap((s) => s.files.map((f) => ({ id: s.id, file: f, trim: !s.loop, kind: s.loop ? 'loop' : 'sfx' }))),
    ...manifest.music.map((m) => ({ id: m.state, file: m.file, trim: false, kind: 'music' })),
    ...manifest.voice.map((x) => ({ id: x.id, file: x.file, trim: true, kind: 'voice' })),
  ].filter((i) => !only || only.has(i.id))
  const files = {}
  const flags = []
  let found = 0
  for (const it of items) {
    const abs = path.join(PUBLIC_ASSETS, it.file)
    if (!existsSync(abs)) continue
    found++
    let samples = decode(abs)
    const b = silenceBounds(samples)
    let trimmedMs = 0
    if (b && it.trim && v['no-trim'] !== true && v['dry-run'] !== true && (b.start > 0.03 * SR || samples.length - b.end > 0.1 * SR)) {
      const t = trim(abs, b, samples.length)
      trimmedMs = Math.round(((samples.length - (t.end - t.start)) / SR) * 1000)
      samples = decode(abs)
    }
    let m = measure(samples)
    let gainDb = 0
    if (v['no-normalize'] !== true && v['dry-run'] !== true) {
      gainDb = normalizeGainDb(it.kind, m.lufs, m.peakDb, it.id)
      // a file that is already at its target but peaks over -0.5 dBFS (ACE-Step music does) still goes through the limiter
      if (gainDb !== 0 || m.peakDb > -0.5) {
        gain(abs, gainDb)
        m = measure(decode(abs))
      }
    }
    files[it.file] = { peakDb: round(m.peakDb), rmsDb: round(m.rmsDb), lufs: round(m.lufs), crest: round(m.crest), seconds: round(m.seconds, 2), trimmedMs, gainDb }
    const flag = crestFlag(it.id, m.crest)
    if (flag) flags.push(flag)
    const quiet = silentFlag(it.id, m.lufs)
    if (quiet) flags.push(quiet)
    io.log(`${it.file.padEnd(38)} peak ${files[it.file].peakDb} dB  lufs ${files[it.file].lufs}  crest ${files[it.file].crest}${trimmedMs ? `  trimmed ${trimmedMs} ms` : ''}${gainDb ? `  gain ${gainDb > 0 ? '+' : ''}${gainDb} dB` : ''}`)
  }
  for (const f of flags) io.err(`FLAG ${f}`)
  io.log(`${found} of ${items.length} file(s) measured${found === 0 ? ' (nothing generated yet)' : ''}.`)
  if (v['dry-run'] !== true && found > 0) {
    writeFileSync(path.join(PUBLIC_ASSETS, 'audio', 'measure.json'), JSON.stringify({ generatedAt: new Date().toISOString(), flags, files }, null, 2) + '\n')
    io.log('wrote public/assets/audio/measure.json')
  }
  return 0
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => { process.exitCode = c })
