#!/usr/bin/env node
// Generate the game's sounds, music and voice lines with ElevenLabs from src/data/assets.json (spec 60). Needs ffmpeg on PATH
// and the key in ELEVENLABS_API_KEY (never on disk in the repo). Idempotent: a file that exists is skipped.
//   node tools/audio/gen-eleven.mjs [--dry-run] [--only id,id] [--kind sfx|music|voice] [--force] [--budget credits]
//   node tools/audio/gen-eleven.mjs --design venn[,sato]     three previews per speaker into tools/out/audio/eleven/design/
//   node tools/audio/gen-eleven.mjs --adopt venn:0            save that preview as a voice and record its id in the manifest
//   node tools/audio/gen-eleven.mjs --enable [--only ...]     flip `enabled` for entries whose files all exist (after listening)
// Every response's `character-cost` header is logged and summed; the run stops before a job that would pass --budget.
import { spawnSync } from 'node:child_process'
import { setDefaultResultOrder } from 'node:dns'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, UsageError, isMain, list, parseFlags, sleep } from '../lib/studio.mjs'
import { PUBLIC_ASSETS, convertArgs, withEnabled } from './lib.mjs'
import { API, KINDS, RAW_DIR, adoptRequest, designRequest, knownIds, planEleven, retryDelayMs, totalEstimate, withVoiceId } from './eleven-lib.mjs'

// Node's fetch tries the API's IPv6 address first and times out on networks without a working IPv6 route (seen 2026-11-15); curl falls back on its own.
setDefaultResultOrder('ipv4first')

const MANIFEST = path.join(REPO_ROOT, 'src', 'data', 'assets.json')
const HELP = `Usage: node tools/audio/gen-eleven.mjs [options]   (ELEVENLABS_API_KEY in the environment)
  --dry-run          print the jobs and the credit estimate; no network
  --only <id,id>     sound ids, music states or voice ids
  --kind <k>         sfx | music | voice
  --force            regenerate even if the files exist
  --budget <n>       stop before a job that would take the run past n credits
  --design <sp,sp>   design voices for these speakers (three previews each, no account change)
  --adopt <sp:n>     save preview n of a designed speaker as a voice; records the id in the manifest
  --enable           mark entries enabled in src/data/assets.json when all their files exist (no generation)
  --help`

export function parseArgv(argv, manifest) {
  const v = parseFlags(argv, {
    'dry-run': { type: 'boolean' },
    only: { type: 'string' },
    kind: { type: 'string' },
    force: { type: 'boolean' },
    budget: { type: 'string' },
    design: { type: 'string' },
    adopt: { type: 'string' },
    enable: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  })
  if (v.kind !== undefined && !KINDS.includes(v.kind)) throw new UsageError(`--kind must be one of ${KINDS.join(', ')}`)
  const budget = v.budget === undefined ? Infinity : Number(v.budget)
  if (!(budget > 0)) throw new UsageError('--budget takes a positive number of credits')
  let only = null
  if (v.only !== undefined) {
    only = new Set(list(v.only))
    const known = knownIds(manifest)
    const bad = [...only].filter((i) => !known.has(i))
    if (!only.size || bad.length) throw new UsageError(`unknown id(s): ${bad.join(', ') || '(none given)'}`)
  }
  const speakers = Object.keys(manifest.voices ?? {})
  const design = v.design === undefined ? null : list(v.design)
  if (design) for (const s of design) if (!speakers.includes(s)) throw new UsageError(`unknown speaker ${s} (voices table: ${speakers.join(', ')})`)
  let adopt = null
  if (v.adopt !== undefined) {
    const [sp, n] = String(v.adopt).split(':')
    if (!speakers.includes(sp ?? '') || !/^\d$/.test(n ?? '')) throw new UsageError('--adopt takes speaker:previewIndex, for example venn:0')
    adopt = { speaker: sp, index: Number(n) }
  }
  return { help: v.help === true, dryRun: v['dry-run'] === true, force: v.force === true, budget, kind: v.kind ?? null, only, design, adopt, enable: v.enable === true }
}

const hasFfmpeg = () => spawnSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' }).status === 0

/** POST with retries (429 waits for Retry-After, 5xx backs off twice); returns the bytes and the cost header. */
async function post(key, route, body, { timeoutMs = 300000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + route, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.ok) {
      const cost = Number(res.headers.get('character-cost') ?? 0)
      const type = res.headers.get('content-type') ?? ''
      return type.includes('json') ? { json: await res.json(), cost } : { bytes: Buffer.from(await res.arrayBuffer()), cost }
    }
    const text = await res.text().catch(() => '')
    const delay = retryDelayMs(res.status, attempt, res.headers.get('retry-after'))
    if (delay === null) throw new Error(`POST ${route} -> HTTP ${res.status} ${text.slice(0, 300)}`)
    await sleep(delay)
  }
}

async function remainingCredits(key) {
  const r = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`subscription check failed: HTTP ${r.status}`)
  const s = await r.json()
  return { left: Number(s.character_limit) - Number(s.character_count), tier: s.tier, resetUnix: s.next_character_count_reset_unix }
}

export async function main(argv, io = { log: console.log, err: console.error }, env = process.env) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  let o
  try {
    o = parseArgv(argv, manifest)
  } catch (e) {
    if (e instanceof UsageError) return (io.err(`error: ${e.message}\n${HELP}`), 2)
    throw e
  }
  if (o.help) return (io.log(HELP), 0)
  const exists = (rel) => existsSync(path.join(PUBLIC_ASSETS, rel))

  if (o.enable) {
    const missing = new Set(planEleven(manifest, { only: o.only, kind: o.kind }, exists).map((j) => j.id))
    const all = new Set(planEleven(manifest, { only: o.only, kind: o.kind, force: true }, exists).map((j) => j.id))
    const ready = new Set([...all].filter((id) => !missing.has(id)))
    writeFileSync(MANIFEST, JSON.stringify(withEnabled(manifest, ready), null, 2) + '\n')
    io.log(`enabled ${ready.size} entr${ready.size === 1 ? 'y' : 'ies'} whose files exist; ${missing.size} still missing files.`)
    return 0
  }

  const key = env.ELEVENLABS_API_KEY
  const needKey = () => {
    if (!key) {
      io.err('error: ELEVENLABS_API_KEY is not set. Put the key in the environment for this command only; never in a file in the repo.')
      return false
    }
    return true
  }

  if (o.design) {
    if (!needKey()) return 2
    const dir = path.join(RAW_DIR, 'design')
    mkdirSync(dir, { recursive: true })
    let spent = 0
    for (const sp of o.design) {
      const req = designRequest(sp, manifest)
      io.log(`designing ${sp}: "${req.body.voice_description.slice(0, 80)}..."`)
      const r = await post(key, req.route, req.body)
      spent += r.cost
      const previews = r.json?.previews ?? []
      writeFileSync(path.join(dir, `${sp}.json`), JSON.stringify({ speaker: sp, previews: previews.map((p) => ({ generated_voice_id: p.generated_voice_id, duration_secs: p.duration_secs })) }, null, 2))
      previews.forEach((p, i) => {
        writeFileSync(path.join(dir, `${sp}-${i}.mp3`), Buffer.from(p.audio_base_64, 'base64'))
        io.log(`  preview ${i}: ${path.join(dir, `${sp}-${i}.mp3`)} (${Math.round(p.duration_secs ?? 0)} s)`)
      })
    }
    io.log(`${spent} credits. Listen, then: node tools/audio/gen-eleven.mjs --adopt <speaker>:<n>`)
    return 0
  }

  if (o.adopt) {
    if (!needKey()) return 2
    const file = path.join(RAW_DIR, 'design', `${o.adopt.speaker}.json`)
    if (!existsSync(file)) return (io.err(`error: no design for ${o.adopt.speaker}; run --design ${o.adopt.speaker} first`), 2)
    const d = JSON.parse(readFileSync(file, 'utf8'))
    const gid = d.previews?.[o.adopt.index]?.generated_voice_id
    if (!gid) return (io.err(`error: ${o.adopt.speaker} has no preview ${o.adopt.index}`), 2)
    const req = adoptRequest(o.adopt.speaker, manifest, gid)
    const r = await post(key, req.route, req.body)
    const voiceId = r.json?.voice_id
    if (!voiceId) return (io.err(`error: no voice id in the reply: ${JSON.stringify(r.json).slice(0, 200)}`), 1)
    writeFileSync(MANIFEST, JSON.stringify(withVoiceId(manifest, o.adopt.speaker, voiceId), null, 2) + '\n')
    io.log(`${o.adopt.speaker} -> voice ${voiceId} (saved to the account as "${req.body.voice_name}"; recorded in the manifest)`)
    return 0
  }

  const jobs = planEleven(manifest, { only: o.only, kind: o.kind, force: o.force }, exists)
  const estimate = totalEstimate(jobs)
  io.log(`${jobs.length} file(s) to generate${o.force ? ' (force)' : ''}, about ${estimate} credits; files that exist are skipped.`)
  for (const j of jobs) {
    io.log(`  ${j.kind.padEnd(5)} ${j.id.padEnd(26)} -> ${j.file}  ~${j.estimate}`)
    if (o.dryRun) io.log(`        POST ${j.request.route ?? ''} ${JSON.stringify(j.request.body ?? j.request.error)}`)
  }
  if (o.dryRun) return (io.log(`dry run: nothing was sent. ffmpeg ${hasFfmpeg() ? 'is' : 'is NOT'} on PATH.`), 0)
  if (!jobs.length) return 0
  const broken = jobs.filter((j) => j.request.error)
  if (broken.length) return (io.err(`error: ${broken.map((j) => `${j.id}: ${j.request.error}`).join('; ')}`), 2)
  if (!needKey()) return 2
  if (!hasFfmpeg()) return (io.err('error: ffmpeg is not on PATH (winget install Gyan.FFmpeg).'), 2)

  // the balance check is advice, not a gate: a hiccup here must not stop a run the jobs themselves would survive
  const acct = await remainingCredits(key).catch((e) => (io.err(`warning: could not read the balance (${e instanceof Error ? e.message : e})`), null))
  if (acct) {
    io.log(`ElevenLabs ${acct.tier}: ${acct.left} credits left this period; budget for this run ${Number.isFinite(o.budget) ? o.budget : 'unlimited'}.`)
    if (acct.left < estimate) io.err(`warning: the estimate (${estimate}) is more than the credits left (${acct.left}); the run stops when a request is refused.`)
  }
  mkdirSync(RAW_DIR, { recursive: true })

  let spent = 0
  let failed = 0
  let done = 0
  const t0 = Date.now()
  for (const [n, j] of jobs.entries()) {
    if (spent + j.estimate > o.budget) {
      io.err(`budget: ${spent} spent, ${j.id} would take about ${j.estimate} more; stopping. Run again to continue.`)
      break
    }
    io.log(`[${n + 1}/${jobs.length}] ${j.kind} ${j.id} -> ${j.file}`)
    try {
      const r = await post(key, j.request.route, j.request.body)
      if (!r.bytes?.length) throw new Error('empty reply')
      spent += r.cost
      const raw = path.join(RAW_DIR, path.basename(j.file))
      writeFileSync(raw, r.bytes)
      const out = path.join(PUBLIC_ASSETS, j.file)
      mkdirSync(path.dirname(out), { recursive: true })
      const c = spawnSync('ffmpeg', convertArgs(j.kind, raw, out), { encoding: 'utf8' })
      if (c.status !== 0) throw new Error(`ffmpeg failed: ${(c.stderr ?? '').slice(0, 200)}`)
      done++
      io.log(`    ${r.cost} credits (${spent} so far)`)
    } catch (e) {
      failed++
      io.err(`    FAILED ${j.id}: ${e instanceof Error ? e.message : e}`)
      if (failed >= 3) {
        io.err('three failures: stopping. Run again; finished files are skipped.')
        break
      }
    }
  }
  io.log(`${done} file(s) generated, ${failed} failed, ${spent} credits, ${Math.round((Date.now() - t0) / 1000)} s.`)
  io.log('Next: npm run audio:measure, then listen on sounds.html, then node tools/audio/gen-eleven.mjs --enable')
  return failed ? 1 : 0
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => { process.exitCode = c })
