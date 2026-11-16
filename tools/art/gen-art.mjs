#!/usr/bin/env node
// 2D art from the local Flux Studio (port 7880, FLUX.2 klein), spec 70: deck and wall textures, portraits, key art and decals
// from src/data/assets.json images[]. Candidates and contact sheets go to tools/out/art/ (gitignored); a pick is published to
// public/assets/art/<id>.webp and recorded in the manifest with its seed, so the shipped file can be rendered again.
//   node tools/art/gen-art.mjs [--dry-run] [--only id,id] [--kind texture|portrait|plate|decal] [--force] [--reroll n]
//   node tools/art/gen-art.mjs --sheets                 rebuild the contact sheets from what is on disk
//   node tools/art/gen-art.mjs --pick id:2,id:4         publish candidate n of each id and record the pick
//   node tools/art/gen-art.mjs --publish                publish every recorded pick again (after a recipe change)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, UsageError, http, isMain, list, parseFlags, runJob } from '../lib/studio.mjs'
import { loadManifest } from '../figures/lint-prompts.mjs'
import { CANDIDATE_DIR, CONCEPT_PICKS, FLUX_BASE, KINDS, PUBLISH_DIR, alphaFromLuma, buildArtJob, knownImageIds, lintImages, luma, planArt, publishRecipe, withPick } from './lib.mjs'

const HELP = `Usage: node tools/art/gen-art.mjs [--dry-run] [--only id,id] [--kind ${KINDS.join('|')}] [--force] [--reroll n] [--base url] [--timeout sec]
       node tools/art/gen-art.mjs --sheets | --pick id:n,id:n | --publish`
const MANIFEST = path.join(REPO_ROOT, 'src', 'data', 'assets.json')

const candidatesOf = (id) => {
  const dir = path.join(CANDIDATE_DIR, id)
  return existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.(png|jpe?g|webp)$/i.test(f)).sort() : []
}
const jobOf = (id) => {
  const f = path.join(CANDIDATE_DIR, id, 'job.json')
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}
const saveManifest = (m) => writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n')

async function contactSheets(manifest, io) {
  const sharp = (await import('sharp')).default
  mkdirSync(CANDIDATE_DIR, { recursive: true })
  for (const kind of KINDS) {
    const rows = manifest.images.filter((im) => im.kind === kind && candidatesOf(im.id).length)
    if (!rows.length) continue
    const W = kind === 'plate' ? 448 : 256
    const H = kind === 'plate' ? 252 : rows.some((r) => r.aspect === '2:3') ? 384 : 256
    const L = 20
    const cols = Math.max(...rows.map((r) => candidatesOf(r.id).length))
    const layers = []
    for (const [y, r] of rows.entries())
      for (const [x, f] of candidatesOf(r.id).entries()) {
        const img = await sharp(path.join(CANDIDATE_DIR, r.id, f)).resize(W, H, { fit: 'contain', background: '#05090b' }).png().toBuffer()
        layers.push({ input: img, left: x * W, top: y * (H + L) + L })
        const mark = r.pick === x + 1 ? ' PICK' : ''
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${L}"><rect width="100%" height="100%" fill="#0a1418"/><text x="6" y="14" font-family="monospace" font-size="12" fill="${mark ? '#ffb347' : '#3fe0c8'}">${r.id} #${x + 1}${mark}</text></svg>`
        layers.push({ input: Buffer.from(svg), left: x * W, top: y * (H + L) })
      }
    const out = path.join(CANDIDATE_DIR, `contact-${kind}.jpg`)
    await sharp({ create: { width: cols * W, height: rows.length * (H + L), channels: 3, background: '#05090b' } }).composite(layers).jpeg({ quality: 86 }).toFile(out)
    io.log(`contact sheet: ${path.relative(REPO_ROOT, out)}`)
  }
}

/** Candidate file -> the shipped WebP (publishRecipe in lib.mjs). */
async function publish(image, pick, io) {
  const sharp = (await import('sharp')).default
  const src = path.join(CANDIDATE_DIR, image.id, candidatesOf(image.id)[pick - 1] ?? '')
  if (!existsSync(src) || pick < 1) throw new Error(`${image.id}: candidate ${pick} is not on disk (render it first)`)
  const r = publishRecipe(image)
  const out = path.join(PUBLISH_DIR, image.file)
  mkdirSync(path.dirname(out), { recursive: true })
  let s = sharp(src).resize(r.width, r.height, { fit: 'cover', position: 'centre' })
  if (r.grey) s = s.greyscale()
  if (r.normalise) s = s.normalise()
  if (r.recomb) s = s.removeAlpha().recomb(r.recomb)
  if (r.mean) {
    // level the brightness to the shared mean: one multiply on every channel, clipped at white (the colour stays)
    const levelled = await s.removeAlpha().png().toBuffer()
    const st = await sharp(levelled).stats()
    const ch = (i) => (st.channels[i] ?? st.channels[0]).mean
    const mean = luma(ch(0), ch(1), ch(2)) / 255
    s = sharp(levelled).linear(Math.min(2.5, r.mean / Math.max(0.05, mean)), 0)
  }
  if (r.alphaFromDarkness) {
    const { data, info } = await s.removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const rgba = Buffer.alloc(info.width * info.height * 4)
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      const l = luma(data[i], data[i + 1], data[i + 2])
      rgba[j] = data[i]
      rgba[j + 1] = data[i + 1]
      rgba[j + 2] = data[i + 2]
      rgba[j + 3] = alphaFromLuma(l)
    }
    s = sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  }
  const info = await s.webp({ quality: r.quality, effort: 5 }).toFile(out)
  io.log(`    published ${image.file} (${Math.round(info.size / 1024)} KB)`)
}

export function parsePicks(text, manifest) {
  const ids = knownImageIds(manifest)
  return list(text).map((t) => {
    const [id, n] = t.split(':')
    if (!ids.has(id) || !/^[1-9]\d*$/.test(n ?? '')) throw new UsageError(`--pick wants id:n pairs of known image ids (got ${t})`)
    return { id, pick: Number(n) }
  })
}

export async function main(argv, io = { log: console.log, err: console.error }) {
  let manifest = loadManifest()
  let v
  let picks = []
  try {
    v = parseFlags(argv, { 'dry-run': { type: 'boolean' }, only: { type: 'string' }, kind: { type: 'string' }, force: { type: 'boolean' }, reroll: { type: 'string' }, base: { type: 'string' }, timeout: { type: 'string' }, sheets: { type: 'boolean' }, pick: { type: 'string' }, publish: { type: 'boolean' }, help: { type: 'boolean' } })
    if (v.only !== undefined) {
      const ids = knownImageIds(manifest)
      const bad = list(v.only).filter((s) => !ids.has(s))
      if (bad.length) throw new UsageError(`unknown image id(s): ${bad.join(', ')}`)
    }
    if (v.kind !== undefined && !KINDS.includes(v.kind)) throw new UsageError(`--kind is one of ${KINDS.join(', ')}`)
    if (v.reroll !== undefined && !/^\d+$/.test(v.reroll)) throw new UsageError('--reroll wants a whole number')
    if (v.pick !== undefined) picks = parsePicks(v.pick, manifest)
  } catch (e) {
    if (e instanceof UsageError) return (io.err(`error: ${e.message}\n${HELP}`), 2)
    throw e
  }
  if (v.help) return (io.log(HELP), 0)
  const lint = lintImages(manifest)
  if (lint.length) {
    for (const b of lint) io.err(`prompt lint: ${b.slug} contains a banned word (${b.word})`)
    return 1
  }
  if (v.sheets) return (await contactSheets(manifest, io), 0)
  if (picks.length || v.publish) {
    const todo = picks.length ? picks : manifest.images.filter((im) => im.pick !== undefined).map((im) => ({ id: im.id, pick: im.pick }))
    for (const { id, pick } of todo) {
      const image = manifest.images.find((im) => im.id === id)
      try {
        await publish(image, pick, io)
      } catch (e) {
        io.err(`error: ${e instanceof Error ? e.message : e}`)
        return 1
      }
      const seed = jobOf(id)?.seed ?? image.seed
      manifest = withPick(manifest, id, pick, seed)
    }
    saveManifest(manifest)
    await contactSheets(manifest, io)
    io.log(`${todo.length} image(s) published and recorded in src/data/assets.json.`)
    return 0
  }

  const base = String(v.base ?? process.env.FLUX_STUDIO_URL ?? FLUX_BASE).replace(/\/+$/, '')
  const n = manifest.art?.candidates ?? 4
  const reroll = Number(v.reroll ?? 0)
  const todo = planArt(manifest, { only: v.only ? new Set(list(v.only)) : null, kind: v.kind ?? null, force: v.force === true || reroll > 0 }, (id) => candidatesOf(id).length > 0)
  io.log(`${todo.length} image(s) to render (${n} candidates each); ids with candidates on disk are skipped without --force.`)
  const conceptPicks = existsSync(CONCEPT_PICKS) ? JSON.parse(readFileSync(CONCEPT_PICKS, 'utf8')) : {}
  const refOf = (im) => {
    if (im.ref === undefined) return undefined
    const p = conceptPicks[im.ref]
    const file = p ? path.resolve(REPO_ROOT, p) : ''
    if (!p || !existsSync(file)) return v['dry-run'] ? 'data:image/png;base64,<missing>' : undefined
    return `data:image/${/\.jpe?g$/i.test(file) ? 'jpeg' : 'png'};base64,${readFileSync(file).toString('base64')}`
  }
  const jobs = []
  for (const im of todo) {
    let body
    try {
      body = buildArtJob(im, { candidates: n, reroll, refDataUrl: refOf(im) })
    } catch (e) {
      io.err(`error: ${e instanceof Error ? e.message : e}`)
      return 2
    }
    jobs.push({ im, body })
    io.log(`  ${im.id.padEnd(24)} ${im.kind.padEnd(8)} ${body.mode === 'edit' ? `edit of ${im.ref}` : 'text-to-image'} ${im.aspect} seed ${body.seed}`)
    if (v['dry-run']) io.log(`        POST ${base}/api/jobs ${JSON.stringify({ ...body, ...(body.images ? { images: ['<data URL of the picked concept>'] } : {}) })}`)
  }
  if (v['dry-run']) return (io.log(`dry run: nothing was sent to ${base}.`), 0)
  if (!jobs.length) return (await contactSheets(manifest, io), 0)
  try {
    await http(base, 'GET', '/api/jobs', { timeoutMs: 10000 })
  } catch (e) {
    io.err(`error: Flux Studio is not answering at ${base} (${e instanceof Error ? e.message : e}). Start it on the PC (port 7880).`)
    return 2
  }
  let failed = 0
  try {
    await http(base, 'POST', '/api/settings', { body: { freeAfter: false } }) // keep the model loaded for the batch
    io.log('GPU WORK STARTS: one GPU job at a time.')
    for (const [i, { im, body }] of jobs.entries()) {
      io.log(`[${i + 1}/${jobs.length}] ${im.id}`)
      try {
        const r = await runJob(base, body, { want: n, timeoutMs: Number(v.timeout ?? 600) * 1000 })
        const dir = path.join(CANDIDATE_DIR, im.id)
        mkdirSync(dir, { recursive: true })
        r.files.forEach((f, k) => writeFileSync(path.join(dir, `${k + 1}${path.extname(f.name) || '.png'}`), f.data))
        writeFileSync(path.join(dir, 'job.json'), JSON.stringify({ id: im.id, seed: body.seed, reroll, aspect: body.aspect, megapixels: body.megapixels, mode: body.mode ?? 't2i', prompt: body.prompt }, null, 2) + '\n')
        io.log(`    ${r.files.length} image(s) in ${Math.round(r.seconds)} s`)
      } catch (e) {
        failed++
        io.err(`    FAILED ${im.id}: ${e instanceof Error ? e.message : e}`)
        if (failed >= 3) break
      }
    }
  } finally {
    await http(base, 'POST', '/api/settings', { body: { freeAfter: true } }).catch(() => io.err('warning: could not restore freeAfter; free the model in Flux Studio.'))
  }
  await contactSheets(manifest, io)
  io.log('Next: look at tools/out/art/contact-<kind>.jpg, then --pick id:n for each keeper.')
  return failed ? 1 : 0
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => { process.exitCode = c })
