#!/usr/bin/env node
// Write units.json and picks.json (no BOM) for the Hunyuan stages from the manifest and art/concepts/picks.json.
//   node tools/figures/make-hunyuan-inputs.mjs [--out dir]      default out: tools/out/hunyuan
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, isMain, parseFlags } from '../lib/studio.mjs'
import { CONCEPT_DIR, makePicks, makeUnits } from './lib.mjs'
import { loadManifest } from './lint-prompts.mjs'

export function main(argv, io = { log: console.log, err: console.error }) {
  const v = parseFlags(argv, { out: { type: 'string' } })
  const out = path.resolve(String(v.out ?? path.join(REPO_ROOT, 'tools', 'out', 'hunyuan')))
  const manifest = loadManifest()
  const picksFile = path.join(CONCEPT_DIR, 'picks.json')
  const picks = existsSync(picksFile) ? JSON.parse(readFileSync(picksFile, 'utf8')) : {}
  mkdirSync(out, { recursive: true })
  // JSON.stringify never adds a byte-order mark, which PowerShell 5.1 Out-File would
  writeFileSync(path.join(out, 'units.json'), JSON.stringify(makeUnits(manifest), null, 2) + '\n')
  writeFileSync(path.join(out, 'picks.json'), JSON.stringify(makePicks(picks), null, 2) + '\n')
  const missing = manifest.models.filter((m) => picks[m.slug] === undefined).map((m) => m.slug)
  io.log(`wrote ${path.join(out, 'units.json')} (${manifest.models.length} entries) and picks.json (${Object.keys(picks).length} picks)`)
  if (missing.length) io.log(`no pick yet for: ${missing.join(', ')}`)
  return 0
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2))
