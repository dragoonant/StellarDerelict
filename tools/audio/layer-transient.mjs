#!/usr/bin/env node
// Layer a short noise transient onto the start of a one-shot sound whose crest factor stays under the gunshot gate however
// many takes are rolled (spec 60: gunshots need a crest factor of at least 8). Not idempotent: run it once per take, then
// `npm run audio:measure` again.
//   node tools/audio/layer-transient.mjs --only repeater-hit[,id] [--ms 12] [--level 0.9] [--body 0.4] [--dry-run]
// The body (the generated sound) is attenuated by --body so the transient stands clear of it; the measure pass then levels
// gunshot-class ids by peak, which keeps the crest.
import { spawnSync } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, UsageError, isMain, list, parseFlags } from '../lib/studio.mjs'
import { PUBLIC_ASSETS, knownIds } from './lib.mjs'
import { readFileSync } from 'node:fs'

const MANIFEST = path.join(REPO_ROOT, 'src', 'data', 'assets.json')

/** ffmpeg arguments: a white-noise burst of `ms` milliseconds, faded out, mixed over the first samples of `input`. */
export function transientArgs(input, output, ms = 12, level = 0.9, body = 0.4) {
  const d = (ms / 1000).toFixed(3)
  return [
    '-y', '-v', 'error', '-i', input, '-f', 'lavfi', '-i', `anoisesrc=d=${d}:c=white:r=44100:a=1`,
    '-filter_complex', `[0:a]volume=${body}[b];[1:a]afade=t=out:st=0:d=${d},volume=${level}[t];[b][t]amix=inputs=2:duration=first:normalize=0:dropout_transition=0[a]`,
    '-map', '[a]', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '3', output,
  ]
}

export async function main(argv, io = { log: console.log, err: console.error }) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  let v
  try {
    v = parseFlags(argv, { only: { type: 'string' }, ms: { type: 'string' }, level: { type: 'string' }, body: { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' } })
    if (v.help) return (io.log('Usage: node tools/audio/layer-transient.mjs --only id,id [--ms 12] [--level 0.9] [--body 0.4] [--dry-run]'), 0)
    if (!v.only) throw new UsageError('--only is required (sound ids)')
    const known = knownIds(manifest)
    const bad = list(v.only).filter((i) => !known.has(i))
    if (bad.length) throw new UsageError(`unknown id(s): ${bad.join(', ')}`)
  } catch (e) {
    if (e instanceof UsageError) return (io.err(`error: ${e.message}`), 2)
    throw e
  }
  const only = new Set(list(v.only))
  const ms = Number(v.ms ?? 12)
  const level = Number(v.level ?? 0.9)
  const body = Number(v.body ?? 0.4)
  let n = 0
  for (const s of manifest.sounds.filter((s) => only.has(s.id))) {
    for (const rel of s.files) {
      const abs = path.join(PUBLIC_ASSETS, rel)
      if (!existsSync(abs)) {
        io.log(`${rel}: not generated, skipped`)
        continue
      }
      const tmp = abs.replace(/\.mp3$/, '.layer.mp3')
      io.log(`${rel}: ${ms} ms transient at ${level} over the body at ${body}${v['dry-run'] ? ' (dry run)' : ''}`)
      if (v['dry-run']) continue
      const r = spawnSync('ffmpeg', transientArgs(abs, tmp, ms, level, body), { encoding: 'utf8' })
      if (r.status !== 0) return (io.err(`ffmpeg failed for ${rel}: ${(r.stderr ?? '').slice(0, 200)}`), 1)
      renameSync(tmp, abs)
      n++
    }
  }
  io.log(`${n} file(s) layered. Next: npm run audio:measure`)
  return 0
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => { process.exitCode = c })
