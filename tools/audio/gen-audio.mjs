#!/usr/bin/env node
// Generate the game's sounds, music and voice lines with the local Audio Studio (port 7890) from src/data/assets.json.
// Runs on the owner's GPU PC only. One GPU job at a time. Idempotent: an entry whose files all exist is skipped.
//   node tools/audio/gen-audio.mjs [--dry-run] [--only id,id] [--kind sfx|music|voice] [--force] [--reroll n] [--base url]
//   node tools/audio/gen-audio.mjs --enable [--only ...] [--kind ...]   flip `enabled` for entries whose files exist (after listening)
// Downloads FLAC/WAV to tools/out/audio/raw, converts to mp3 with ffmpeg (voice gets a radio band), writes public/assets/<file>.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, UsageError, http, isMain, list, parseFlags, runJob } from '../lib/studio.mjs'
import { DEFAULT_BASE, KINDS, PUBLIC_ASSETS, RAW_DIR, convertArgs, knownIds, planAudio, withEnabled } from './lib.mjs'

const MANIFEST = path.join(REPO_ROOT, 'src', 'data', 'assets.json')
const HELP = `Usage: node tools/audio/gen-audio.mjs [options]
  --dry-run          print the jobs that would be posted; no network
  --only <id,id>     sound ids, music states or voice ids
  --kind <k>         sfx | music | voice
  --force            regenerate even if the files exist
  --reroll <n>       with --force: offset every seed by n for another take (n = 1, 2, ...)
  --enable           mark entries enabled in src/data/assets.json when all their files exist (no generation)
  --base <url>       studio address (default ${DEFAULT_BASE})
  --timeout <sec>    per job (default 900)
  --help`

export function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' })
  return r.status === 0
}

export function parseArgv(argv, manifest) {
  const v = parseFlags(argv, {
    'dry-run': { type: 'boolean' },
    only: { type: 'string' },
    kind: { type: 'string' },
    force: { type: 'boolean' },
    reroll: { type: 'string' },
    enable: { type: 'boolean' },
    base: { type: 'string' },
    timeout: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  })
  if (v.kind !== undefined && !KINDS.includes(v.kind)) throw new UsageError(`--kind must be one of ${KINDS.join(', ')}`)
  const reroll = v.reroll === undefined ? 0 : Number(v.reroll)
  if (!Number.isInteger(reroll) || reroll < 0) throw new UsageError('--reroll takes a whole number of takes (1, 2, ...)')
  if (reroll > 0 && v.force !== true) throw new UsageError('--reroll only makes sense with --force')
  let only = null
  if (v.only !== undefined) {
    only = new Set(list(v.only))
    const known = knownIds(manifest)
    const bad = [...only].filter((i) => !known.has(i))
    if (!only.size || bad.length) throw new UsageError(`unknown id(s): ${bad.join(', ') || '(none given)'}`)
  }
  return {
    help: v.help === true,
    dryRun: v['dry-run'] === true,
    force: v.force === true,
    reroll,
    enable: v.enable === true,
    kind: v.kind ?? null,
    only,
    base: String(v.base ?? process.env.AUDIO_STUDIO_URL ?? DEFAULT_BASE).replace(/\/+$/, ''),
    timeoutMs: Number(v.timeout ?? 900) * 1000,
  }
}

export async function main(argv, io = { log: console.log, err: console.error }) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  let o
  try {
    o = parseArgv(argv, manifest)
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`error: ${e.message}\n${HELP}`)
      return 2
    }
    throw e
  }
  if (o.help) {
    io.log(HELP)
    return 0
  }
  const exists = (rel) => existsSync(path.join(PUBLIC_ASSETS, rel))

  if (o.enable) {
    const jobs = planAudio(manifest, { only: o.only, kind: o.kind, force: false }, exists).map((j) => j.id)
    const all = planAudio(manifest, { only: o.only, kind: o.kind, force: true }, exists)
    const ready = new Set(all.filter((j) => !jobs.includes(j.id)).map((j) => j.id))
    writeFileSync(MANIFEST, JSON.stringify(withEnabled(manifest, ready), null, 2) + '\n')
    io.log(`enabled ${ready.size} entr${ready.size === 1 ? 'y' : 'ies'} whose files exist; ${jobs.length} still missing files.`)
    return 0
  }

  const jobs = planAudio(manifest, { only: o.only, kind: o.kind, force: o.force, reroll: o.reroll }, exists)
  io.log(`${jobs.length} job(s) to run${o.force ? ` (force${o.reroll ? `, take ${o.reroll + 1}` : ''})` : ''}; entries whose files exist are skipped.`)
  for (const j of jobs) {
    io.log(`  ${j.kind.padEnd(5)} ${j.id.padEnd(22)} -> ${j.files.join(', ')}`)
    if (o.dryRun) io.log(`        POST ${o.base}/api/jobs ${JSON.stringify(j.body)}`)
  }
  if (o.dryRun) {
    io.log(`dry run: nothing was sent. ffmpeg ${hasFfmpeg() ? 'is' : 'is NOT'} on PATH.`)
    return 0
  }
  if (!jobs.length) return 0

  try {
    const st = await http(o.base, 'GET', '/api/status', { timeoutMs: 10000 })
    io.log(`Audio Studio status: ${JSON.stringify(st).slice(0, 200)}`)
  } catch (e) {
    io.err(`error: the Audio Studio is not answering at ${o.base} (${e instanceof Error ? e.message : e}).`)
    io.err('Start it on the PC (port 7890; see docs/knowledge-base/local-ai-studios.md) or pass --base <url>.')
    return 2
  }
  const ffmpeg = hasFfmpeg()
  if (!ffmpeg) io.err('warning: ffmpeg is not on PATH. Raw FLAC/WAV files are kept in tools/out/audio/raw; convert them to the manifest mp3 names later (winget install Gyan.FFmpeg).')
  mkdirSync(RAW_DIR, { recursive: true })

  let failed = 0
  try {
    announce(io, jobs.length)
    for (const [n, j] of jobs.entries()) {
      io.log(`[${n + 1}/${jobs.length}] ${j.kind} ${j.id}`)
      try {
        const want = j.kind === 'sfx' ? j.files.length : 1
        const r = await runJob(o.base, j.body, { want, timeoutMs: o.timeoutMs, fallbackNames: Array.from({ length: want }, (_, i) => (j.kind === 'voice' ? 'voice.wav' : `audio_${i}.flac`)) })
        r.files.forEach((f, i) => {
          const rel = j.files[i]
          if (!rel || !j.missing.includes(rel)) return
          const ext = path.extname(f.name) || (j.kind === 'voice' ? '.wav' : '.flac')
          const raw = path.join(RAW_DIR, `${path.basename(rel, '.mp3')}${ext}`)
          writeFileSync(raw, f.data)
          const out = path.join(PUBLIC_ASSETS, rel)
          mkdirSync(path.dirname(out), { recursive: true })
          if (!ffmpeg) return
          const c = spawnSync('ffmpeg', convertArgs(j.kind, raw, out), { encoding: 'utf8' })
          if (c.status !== 0) throw new Error(`ffmpeg failed for ${rel}: ${(c.stderr ?? '').slice(0, 200)}`)
        })
        io.log(`    done in ${Math.round(r.seconds)} s`)
      } catch (e) {
        failed++
        io.err(`    FAILED ${j.id}: ${e instanceof Error ? e.message : e}`)
        if (failed >= 2) {
          io.err('two failures: stopping so the GPU is not hammered; run again, finished entries are skipped.')
          break
        }
      }
    }
  } finally {
    await http(o.base, 'POST', '/api/backend/free', { body: {}, timeoutMs: 15000 }).then(
      () => io.log('freed the studio backend.'),
      () => io.err('warning: could not free the backend; stop the studio when you are done.'),
    )
  }
  io.log('Next: npm run audio:measure, then listen on sounds.html, then node tools/audio/gen-audio.mjs --enable')
  return failed ? 1 : 0
}

function announce(io, n) {
  io.log(`GPU WORK STARTS: ${n} job(s), one at a time. Announce it to the owner first; stop the studio when done.`)
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => { process.exitCode = c })
