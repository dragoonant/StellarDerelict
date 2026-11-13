#!/usr/bin/env node
// Concept images from the local Flux Studio (port 7880, FLUX.2 klein): 4 candidates per model slug that has no pick yet.
// Figures: image-edit job with art/figure-style-reference.jpg attached. Props: plain text-to-image. Writes art/concepts/<slug>/
// and a labelled contact sheet per faction (PNG when `sharp` is installed, otherwise an HTML page).
//   node tools/figures/gen-concepts.mjs [--dry-run] [--only slug,slug] [--force] [--base url]
// Pick one per slug into art/concepts/picks.json ({ "warden-sergeant": "art/concepts/warden-sergeant/2.png", ... }).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, UsageError, http, isMain, list, parseFlags, runJob } from '../lib/studio.mjs'
import { CANDIDATES, CONCEPT_DIR, FLUX_BASE, REFERENCE, buildConceptJob, contactSheetHtml, factionOf, planConcepts } from './lib.mjs'
import { lintManifest, loadManifest } from './lint-prompts.mjs'

const HELP = `Usage: node tools/figures/gen-concepts.mjs [--dry-run] [--only slug,slug] [--force] [--base url] [--timeout sec]`
const PICKS = path.join(CONCEPT_DIR, 'picks.json')

const candidatesOf = (slug) => {
  const dir = path.join(CONCEPT_DIR, slug)
  return existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort() : []
}

async function contactSheets(manifest, io) {
  let sharp = null
  try {
    sharp = (await import('sharp')).default
  } catch {
    /* HTML sheets */
  }
  const groups = {}
  for (const m of manifest.models) {
    const imgs = candidatesOf(m.slug)
    if (imgs.length) (groups[factionOf(m)] ??= []).push({ slug: m.slug, images: imgs.map((f) => `${m.slug}/${f}`) })
  }
  for (const [faction, rows] of Object.entries(groups)) {
    if (sharp) {
      try {
        const W = 256
        const H = 384
        const L = 22
        const cols = Math.max(...rows.map((r) => r.images.length))
        const layers = []
        for (const [y, r] of rows.entries())
          for (const [x, f] of r.images.entries()) {
            const img = await sharp(path.join(CONCEPT_DIR, f)).resize(W, H, { fit: 'contain', background: '#05090b' }).png().toBuffer()
            layers.push({ input: img, left: x * W, top: y * (H + L) + L })
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${L}"><rect width="100%" height="100%" fill="#0a1418"/><text x="6" y="15" font-family="monospace" font-size="12" fill="#3fe0c8">${r.slug} #${x + 1}</text></svg>`
            layers.push({ input: Buffer.from(svg), left: x * W, top: y * (H + L) })
          }
        const out = path.join(CONCEPT_DIR, `contact-${faction}.png`)
        await sharp({ create: { width: cols * W, height: rows.length * (H + L), channels: 3, background: '#05090b' } }).composite(layers).png().toFile(out)
        io.log(`contact sheet: ${path.relative(REPO_ROOT, out)}`)
        continue
      } catch (e) {
        io.err(`sharp contact sheet failed (${e instanceof Error ? e.message : e}); writing HTML instead`)
      }
    }
    const out = path.join(CONCEPT_DIR, `contact-${faction}.html`)
    writeFileSync(out, contactSheetHtml(`Concepts: ${faction}`, rows))
    io.log(`contact sheet: ${path.relative(REPO_ROOT, out)}`)
  }
}

export async function main(argv, io = { log: console.log, err: console.error }) {
  const manifest = loadManifest()
  let v
  try {
    v = parseFlags(argv, { 'dry-run': { type: 'boolean' }, only: { type: 'string' }, force: { type: 'boolean' }, base: { type: 'string' }, timeout: { type: 'string' }, help: { type: 'boolean' } })
    if (v.only !== undefined) {
      const bad = list(v.only).filter((s) => !manifest.models.some((m) => m.slug === s))
      if (bad.length) throw new UsageError(`unknown slug(s): ${bad.join(', ')}`)
    }
  } catch (e) {
    if (e instanceof UsageError) return (io.err(`error: ${e.message}\n${HELP}`), 2)
    throw e
  }
  if (v.help) return (io.log(HELP), 0)
  const lint = lintManifest(manifest)
  if (lint.length) {
    for (const b of lint) io.err(`prompt lint: ${b.slug} contains a banned word (${b.word})`)
    return 1
  }
  const base = String(v.base ?? process.env.FLUX_STUDIO_URL ?? FLUX_BASE).replace(/\/+$/, '')
  const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, 'utf8')) : {}
  const only = v.only ? new Set(list(v.only)) : null
  const todo = planConcepts(manifest, { only, force: v.force === true }, picks, (s) => candidatesOf(s).length > 0)
  io.log(`${todo.length} slug(s) to render (${CANDIDATES} candidates each); picked or already rendered slugs are skipped.`)
  const needRef = todo.some((m) => m.kind !== 'prop')
  const ref = needRef && existsSync(REFERENCE) ? `data:image/jpeg;base64,${readFileSync(REFERENCE).toString('base64')}` : needRef ? 'data:image/jpeg;base64,<art/figure-style-reference.jpg missing>' : undefined
  for (const m of todo) {
    const body = buildConceptJob(m, ref)
    const show = { ...body, ...(body.image ? { image: '<data URL of the style reference>', images: ['<data URL>'] } : {}) }
    io.log(`  ${m.slug.padEnd(16)} ${m.kind === 'prop' ? 'text-to-image' : 'image edit'} seed ${body.seed}`)
    if (v['dry-run']) io.log(`        POST ${base}/api/jobs ${JSON.stringify(show)}`)
  }
  if (v['dry-run']) return (io.log(`dry run: nothing was sent to ${base}.`), 0)
  if (needRef && !existsSync(REFERENCE)) return (io.err('error: art/figure-style-reference.jpg is missing.'), 2)
  if (!todo.length) {
    await contactSheets(manifest, io)
    return 0
  }
  try {
    await http(base, 'GET', '/api/jobs', { timeoutMs: 10000 })
  } catch (e) {
    io.err(`error: Flux Studio is not answering at ${base} (${e instanceof Error ? e.message : e}). Start it on the PC (port 7880).`)
    return 2
  }
  let failed = 0
  try {
    await http(base, 'POST', '/api/settings', { body: { freeAfter: false } }) // keep the model loaded for the batch
    io.log('GPU WORK STARTS: announce it to the owner; one GPU job at a time.')
    for (const [n, m] of todo.entries()) {
      io.log(`[${n + 1}/${todo.length}] ${m.slug}`)
      try {
        const r = await runJob(base, buildConceptJob(m, ref), { want: CANDIDATES, timeoutMs: Number(v.timeout ?? 600) * 1000 })
        const dir = path.join(CONCEPT_DIR, m.slug)
        mkdirSync(dir, { recursive: true })
        r.files.forEach((f, i) => writeFileSync(path.join(dir, `${i + 1}${path.extname(f.name) || '.png'}`), f.data))
        io.log(`    ${r.files.length} image(s) in ${Math.round(r.seconds)} s`)
      } catch (e) {
        failed++
        io.err(`    FAILED ${m.slug}: ${e instanceof Error ? e.message : e}`)
        if (failed >= 2) break
      }
    }
  } finally {
    await http(base, 'POST', '/api/settings', { body: { freeAfter: true } }).catch(() => io.err('warning: could not restore freeAfter; free the model in Flux Studio.'))
  }
  await contactSheets(manifest, io)
  io.log('Next: review the first image of each faction against the reference (helmet 33-38% of height, about 2.8 head-heights), then write art/concepts/picks.json.')
  return failed ? 1 : 0
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => { process.exitCode = c })
