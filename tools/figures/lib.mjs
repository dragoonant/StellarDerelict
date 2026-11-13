// Pure parts of the figure tooling (unit-tested): concept jobs for Flux Studio, the skip logic, the Hunyuan input files
// and the HTML contact sheet. Prompts always come from src/data/assets.json (models[].prompt) and pass the lint first.
import path from 'node:path'
import { REPO_ROOT } from '../lib/studio.mjs'
import { lintPrompt } from './lint-prompts.mjs'

export const FLUX_BASE = 'http://localhost:7880'
export const CONCEPT_DIR = path.join(REPO_ROOT, 'art', 'concepts')
export const REFERENCE = path.join(REPO_ROOT, 'art', 'figure-style-reference.jpg')
export const CANDIDATES = 4

export const REFERENCE_LINE = 'Use the attached photo as the reference: the same proportions and finish as the reference photo. '

export function seedOf(slug) {
  let h = 2166136261
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h % 2147483647
}

/** Which faction sheet a model belongs to. */
export const factionOf = (m) => (m.kind === 'warden' ? 'wardens' : m.kind === 'stalker' ? 'molt' : 'props')

/**
 * The POST /api/jobs body for one model. Figures use image edit mode with the style reference attached (data URL);
 * props use plain text-to-image. The edit-mode field names are not documented in the KB (it says only "also image edit mode"):
 * check them against flux-studio/server.js on the PC (`--dry-run` prints the body) and adjust here if they differ.
 */
export function buildConceptJob(m, referenceDataUrl) {
  const figure = m.kind !== 'prop'
  const prompt = figure ? REFERENCE_LINE + m.prompt : m.prompt
  const bad = lintPrompt(prompt)
  if (bad.length) throw new Error(`${m.slug}: banned word(s) in the prompt: ${bad.join(', ')}`)
  const body = { model: 'klein', prompt, aspect: figure ? '2:3' : '1:1', megapixels: 1, batch: CANDIDATES, seed: seedOf(m.slug) }
  if (figure) {
    if (!referenceDataUrl) throw new Error(`${m.slug}: the style reference image is required for figures`)
    Object.assign(body, { mode: 'edit', image: referenceDataUrl, images: [referenceDataUrl] })
  }
  return body
}

/** Slugs to generate: not picked, no candidates on disk yet (unless force), and in `only` when given. */
export function planConcepts(manifest, { only = null, force = false } = {}, picks = {}, hasCandidates = () => false) {
  return manifest.models.filter((m) => {
    if (only && !only.has(m.slug)) return false
    if (!force && picks[m.slug] !== undefined) return false
    if (!force && hasCandidates(m.slug)) return false
    return true
  })
}

const BASE_MM = { warden: 25, stalker: 32, prop: 0 }

/** units.json for the Hunyuan stages: { slug: { prompt, height (inches), base (mm) } }. */
export function makeUnits(manifest) {
  const out = {}
  for (const m of manifest.models) out[m.slug] = { prompt: m.prompt, height: m.heightIn, base: BASE_MM[m.kind] ?? 0 }
  return out
}

/** picks.json: { slug: seed | absolute image path }. `picks` maps slug to a path relative to the repo or already absolute. */
export function makePicks(picks, root = REPO_ROOT) {
  const out = {}
  for (const [slug, p] of Object.entries(picks)) out[slug] = typeof p === 'number' ? p : path.isAbsolute(p) ? p : path.resolve(root, p)
  return out
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** A labelled contact sheet as one HTML page: a row per slug, one cell per candidate image (paths relative to the page). */
export function contactSheetHtml(title, rows) {
  const body = rows
    .map((r) => `<section><h2>${esc(r.slug)}</h2><div class="row">${r.images.map((f, i) => `<figure><img src="${esc(f)}" alt="${esc(r.slug)} candidate ${i + 1}"><figcaption>${esc(r.slug)} #${i + 1}</figcaption></figure>`).join('')}</div></section>`)
    .join('\n')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(title)}</title><style>body{background:#05090b;color:#cfeee9;font:13px monospace;margin:16px}h1,h2{color:#3fe0c8;font-weight:600}.row{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0}img{height:360px;border:1px solid #12343a}figcaption{color:#1c6b63}</style><h1>${esc(title)}</h1>\n${body}\n</html>\n`
}
