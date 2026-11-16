// Pure parts of the 2D art tooling (unit-tested, spec 70): Flux Studio jobs for the manifest's images[], the skip logic,
// and the publish recipe per kind. Prompts always come from src/data/assets.json (images[].prompt) and pass the lint first.
import path from 'node:path'
import { REPO_ROOT } from '../lib/studio.mjs'
import { lintPrompt } from '../figures/lint-prompts.mjs'
import { seedOf } from '../figures/lib.mjs'

export const FLUX_BASE = 'http://localhost:7880'
/** candidates and contact sheets (gitignored: only the published picks are committed) */
export const CANDIDATE_DIR = path.join(REPO_ROOT, 'tools', 'out', 'art')
export const PUBLISH_DIR = path.join(REPO_ROOT, 'public', 'assets')
export const CONCEPT_PICKS = path.join(REPO_ROOT, 'art', 'concepts', 'picks.json')
export const KINDS = ['texture', 'portrait', 'plate', 'decal']
export const ASPECTS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9']

/** The seed of take `reroll` of an image (take 0 is the id's own hash, so a first run is reproducible from the manifest). */
export const seedFor = (image, reroll = 0) => (image.seed !== undefined && reroll === 0 ? image.seed : (seedOf(image.id) + reroll * 7919) % 2147483647)

/**
 * The POST /api/jobs body for one image. Portraits are an image-edit job with the picked concept of `ref` attached (a data
 * URL), so the bust is the figure that stands on the board; everything else is text-to-image. Plates render at 2 MP.
 */
export function buildArtJob(image, { candidates = 4, reroll = 0, refDataUrl } = {}) {
  const bad = lintPrompt(image.prompt)
  if (bad.length) throw new Error(`${image.id}: banned word(s) in the prompt: ${bad.join(', ')}`)
  if (!ASPECTS.includes(image.aspect)) throw new Error(`${image.id}: unknown aspect ${image.aspect}`)
  const body = { model: 'klein', prompt: image.prompt, aspect: image.aspect, megapixels: image.kind === 'plate' ? 2 : 1, batch: candidates, seed: seedFor(image, reroll) }
  if (image.ref !== undefined) {
    if (!refDataUrl) throw new Error(`${image.id}: the picked concept of ${image.ref} is required (art/concepts/picks.json)`)
    Object.assign(body, { mode: 'edit', images: [refDataUrl] })
  }
  return body
}

/** Images to render: in `only` / `kind` when given, and without candidates on disk unless forced. */
export function planArt(manifest, { only = null, kind = null, force = false } = {}, hasCandidates = () => false) {
  return (manifest.images ?? []).filter((im) => {
    if (only && !only.has(im.id)) return false
    if (kind && im.kind !== kind) return false
    if (!force && hasCandidates(im.id)) return false
    return true
  })
}

/** Every board texture is levelled to this mean (0..1), so one tint gain in the client suits them all. */
export const TEXTURE_MEAN = 0.5

/**
 * How a picked candidate becomes the shipped file (tools/art/gen-art.mjs runs it with sharp):
 * - texture: greyscale, stretched to the full range, levelled to TEXTURE_MEAN, resized; the board multiplies it with the
 *   state colours (it is read as plain numbers, not as sRGB)
 * - portrait and plate: cover-cropped to the size, colour kept
 * - decal: greyscale, alpha taken from darkness (white paper becomes clear), trimmed to the mark
 */
export function publishRecipe(image) {
  const [width, height] = image.size
  if (image.kind === 'texture') return { width, height, grey: true, normalise: true, mean: TEXTURE_MEAN, alphaFromDarkness: false, quality: 82 }
  if (image.kind === 'decal') return { width, height, grey: false, normalise: false, alphaFromDarkness: true, quality: 84 }
  return { width, height, grey: false, normalise: false, alphaFromDarkness: false, quality: image.kind === 'plate' ? 78 : 84 }
}

/** Alpha for a decal pixel from its luminance (0..255): paper white is clear, anything under `black` is solid. */
export function alphaFromLuma(l, white = 236, black = 70) {
  if (l >= white) return 0
  if (l <= black) return 255
  return Math.round((255 * (white - l)) / (white - black))
}

/** The manifest with a pick recorded: `{ pick, seed }` on the image, and `enabled` once its file is published. */
export function withPick(manifest, id, pick, seed, enabled = true) {
  return { ...manifest, images: manifest.images.map((im) => (im.id === id ? { ...im, pick, seed, enabled } : im)) }
}

export const knownImageIds = (manifest) => new Set((manifest.images ?? []).map((im) => im.id))

export function lintImages(manifest) {
  const bad = []
  for (const im of manifest.images ?? []) for (const word of lintPrompt(im.prompt)) bad.push({ slug: im.id, word })
  return bad
}
