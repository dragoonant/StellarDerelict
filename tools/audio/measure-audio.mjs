#!/usr/bin/env node
// Measure every generated audio file listed in the manifest (needs ffmpeg on PATH): peak, RMS, loudness estimate and crest
// factor, trim leading and trailing silence from one-shot sounds and voice lines, and write public/assets/audio/measure.json
// (sounds.html shows it). Flags gunshot-class sounds with a crest factor under 8.
//   node tools/audio/measure-audio.mjs [--dry-run] [--no-trim] [--only id,id]
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, UsageError, isMain, list, parseFlags } from '../lib/studio.mjs'
import { PUBLIC_ASSETS } from './lib.mjs'
import { SR, analyse, crestFlag, silenceBounds } from './measure-lib.mjs'

const MANIFEST = path.join(REPO_ROOT, 'src', 'data', 'assets.json')
const round = (n, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null)

function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}`)
  const b = r.stdout
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)))
}

function trim(file, bounds, total) {
  const pad = Math.round(0.01 * SR) // keep 10 ms either side
  const s = Math.max(0, bounds.start - pad)
  const e = Math.min(total, bounds.end + pad * 3)
  const tmp = file.replace(/\.mp3$/, '.trim.mp3')
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-ss', (s / SR).toFixed(4), '-t', ((e - s) / SR).toFixed(4), '-c:a', 'libmp3lame', '-q:a', '3', tmp])
  if (r.status !== 0) throw new Error(`ffmpeg could not trim ${file}`)
  renameSync(tmp, file)
  return { start: s, end: e }
}

export async function main(argv, io = { log: console.log, err: console.error }) {
  let v
  try {
    v = parseFlags(argv, { 'dry-run': { type: 'boolean' }, 'no-trim': { type: 'boolean' }, only: { type: 'string' }, help: { type: 'boolean' } })
  } catch (e) {
    if (e instanceof UsageError) return (io.err(`error: ${e.message}`), 2)
    throw e
  }
  if (v.help) return (io.log('Usage: node tools/audio/measure-audio.mjs [--dry-run] [--no-trim] [--only id,id]'), 0)
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    io.err('error: ffmpeg is not on PATH (winget install Gyan.FFmpeg).')
    return 2
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const only = v.only ? new Set(list(v.only)) : null
  const items = [
    ...manifest.sounds.flatMap((s) => s.files.map((f) => ({ id: s.id, file: f, trim: !s.loop }))),
    ...manifest.music.map((m) => ({ id: m.state, file: m.file, trim: false })),
    ...manifest.voice.map((x) => ({ id: x.id, file: x.file, trim: true })),
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
    const m = analyse(samples)
    files[it.file] = { peakDb: round(m.peakDb), rmsDb: round(m.rmsDb), lufs: round(m.lufs), crest: round(m.crest), seconds: round(m.seconds, 2), trimmedMs }
    const flag = crestFlag(it.id, m.crest)
    if (flag) flags.push(flag)
    io.log(`${it.file.padEnd(38)} peak ${files[it.file].peakDb} dB  lufs ${files[it.file].lufs}  crest ${files[it.file].crest}${trimmedMs ? `  trimmed ${trimmedMs} ms` : ''}`)
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
