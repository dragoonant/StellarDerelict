// Spec 70: the generated 2D art. The manifest's images, the pure parts of the Flux tooling, and the scars the fight leaves
// on the deck. Nothing here needs the studio, sharp or a generated file.
import { describe, expect, it } from 'vitest'
import { assets, getMission, imageEntry, imagesFor, listMissions, tileHash } from '../../src/data'
import type { Event, Pos } from '../../src/engine'
import { SCAR_CAP, addScars, scarsOf, type Scar } from '../../src/client/board/scars'
import { lintManifest } from '../../tools/figures/lint-prompts.mjs'
import { ASPECTS, KINDS, TEXTURE_MEAN, alphaFromLuma, buildArtJob, knownImageIds, lintImages, planArt, publishRecipe, seedFor, withPick } from '../../tools/art/lib.mjs'
import { main as genArt, parsePicks } from '../../tools/art/gen-art.mjs'

const image = (id: string) => imageEntry(id)!
const collect = () => {
  const out: string[] = []
  const errs: string[] = []
  return { out, errs, io: { log: (m: string) => void out.push(m), err: (m: string) => void errs.push(m) } }
}

describe('ART-1 the image manifest', () => {
  it('names every image after its file, with a known kind, aspect and size', () => {
    expect(assets.images.length).toBeGreaterThanOrEqual(28)
    expect(new Set(assets.images.map((im) => im.id)).size).toBe(assets.images.length)
    for (const im of assets.images) {
      expect(im.file, im.id).toBe(`art/${im.id}.webp`)
      expect(KINDS, im.id).toContain(im.kind)
      expect(ASPECTS, im.id).toContain(im.aspect)
      expect(im.size.length, im.id).toBe(2)
      expect(im.prompt.length, im.id).toBeGreaterThan(40)
    }
  })
  it('passes the prompt lint, and every prompt asks for a picture without lettering', () => {
    expect(lintImages(assets)).toEqual([])
    expect(lintManifest(assets)).toEqual([])
    for (const im of assets.images) expect(im.prompt, im.id).toMatch(/wordless/)
  })
  it('records the pick and the seed of everything it ships', () => {
    for (const im of assets.images.filter((x) => x.enabled)) {
      expect(Number.isInteger(im.pick), im.id).toBe(true)
      expect(Number.isInteger(im.seed), im.id).toBe(true)
    }
  })
  it('makes each portrait from the concept of the model it shows', () => {
    for (const im of assets.images.filter((x) => x.kind === 'portrait')) {
      expect(assets.models.some((m) => m.slug === im.ref), im.id).toBe(true)
      if (im.use.startsWith('model:')) expect(im.use.slice(6), im.id).toBe(im.ref)
    }
    for (const im of assets.images.filter((x) => x.kind !== 'portrait')) expect(im.ref, im.id).toBeUndefined()
  })
})

describe('ART-2 coverage', () => {
  const uses = new Set(assets.images.map((im) => im.use))
  it('has a face for every squad member and every stalker model', () => {
    for (const q of getMission('dead-reckoning')!.squad) expect(uses.has(`unit:${q.id}`), q.id).toBe(true)
    for (const m of assets.models.filter((x) => x.kind === 'stalker')) expect(uses.has(`model:${m.slug}`), m.slug).toBe(true)
  })
  it('has a still for the title, every mission and each of the four endings', () => {
    expect(uses.has('title')).toBe(true)
    for (const m of listMissions()) expect(uses.has(`mission:${m.id}`), m.id).toBe(true)
    for (const u of ['debrief:warden-win', 'debrief:warden-loss', 'debrief:molt-win', 'debrief:molt-loss']) expect(uses.has(u), u).toBe(true)
  })
  it('has a texture for every board surface and a decal for both scars', () => {
    for (const u of ['floor', 'wall', 'ceiling', 'door', 'duct', 'scar:burn', 'scar:kill']) expect(uses.has(u), u).toBe(true)
    expect(assets.images.filter((im) => im.use === 'floor').length).toBeGreaterThanOrEqual(4)
  })
  it('imagesFor returns the enabled images of a use in manifest order', () => {
    const floor = imagesFor('floor')
    expect(floor.map((im) => im.id)).toEqual(assets.images.filter((im) => im.use === 'floor' && im.enabled).map((im) => im.id))
    expect(imagesFor('nowhere')).toEqual([])
  })
})

describe('ART-3 a square keeps its plate', () => {
  it('tileHash is stable and spreads squares over the variants and the four turns', () => {
    expect(tileHash(3, 7)).toBe(tileHash(3, 7))
    const variants = new Set<number>()
    const turns = new Set<number>()
    for (let y = 0; y < 19; y++)
      for (let x = 0; x < 29; x++) {
        variants.add(tileHash(x, y) % 4)
        turns.add((tileHash(x, y) >>> 4) % 4)
      }
    expect(variants.size).toBe(4)
    expect(turns.size).toBe(4)
  })
})

describe('ART-6 scars', () => {
  const dead = (kind: 'warden' | 'stalker' | 'ping', at: Pos): Event => ({ type: 'destroyed', unit: 'u', kind, at, by: 'x' })
  const burst = (squares: Pos[]): Event => ({ type: 'scorched', unit: 'riedel', at: squares[0]!, burst: squares, rolls: [] })
  it('a destroyed stalker leaves a splash; a Warden or an unresolved contact leaves none', () => {
    expect(scarsOf([dead('stalker', [4, 5])], [])).toMatchObject([{ kind: 'kill', at: [4, 5] }])
    expect(scarsOf([dead('warden', [4, 5]), dead('ping', [6, 5])], [])).toEqual([])
  })
  it('a fire that burns out leaves a mark on every square that was burning', () => {
    expect(scarsOf([{ type: 'burnCleared' }], [[2, 2], [3, 2]]).map((s) => [s.kind, ...s.at])).toEqual([['burn', 2, 2], ['burn', 3, 2]])
    // a burst and its burn-out inside one run of events (instant speed): the squares come from the burst
    expect(scarsOf([burst([[7, 1], [8, 1]]), { type: 'burnCleared' }], []).map((s) => s.at)).toEqual([[7, 1], [8, 1]])
    // nothing is marked while it still burns
    expect(scarsOf([burst([[7, 1]])], [])).toEqual([])
    expect(scarsOf([{ type: 'burnCleared' }, { type: 'burnCleared' }], [[1, 1]]).length).toBe(1)
  })
  it('a square holds one burn mark and at most two splashes, and the deck keeps the newest marks', () => {
    let have: Scar[] = []
    have = addScars(have, scarsOf([{ type: 'burnCleared' }], [[2, 2]]), 1)
    have = addScars(have, scarsOf([{ type: 'burnCleared' }], [[2, 2]]), 2)
    expect(have.length).toBe(1)
    for (let i = 0; i < 4; i++) have = addScars(have, scarsOf([dead('stalker', [5, 5])], []), 10 + i)
    expect(have.filter((s) => s.kind === 'kill').length).toBe(2)
    expect(new Set(have.map((s) => s.id)).size).toBe(have.length)
    const many: Omit<Scar, 'id'>[] = Array.from({ length: SCAR_CAP + 20 }, (_, i) => ({ at: [i, 0] as Pos, kind: 'kill' as const, n: i }))
    const capped = addScars([], many, 100)
    expect(capped.length).toBe(SCAR_CAP)
    expect(capped[capped.length - 1]!.at).toEqual([SCAR_CAP + 19, 0])
  })
})

describe('ART-8 the Flux tooling', () => {
  it('builds a text-to-image job from the manifest prompt, plates at two megapixels', () => {
    const tex = buildArtJob(image('deck-plate-a'))
    expect(tex).toMatchObject({ model: 'klein', aspect: '1:1', megapixels: 1, batch: 4, prompt: image('deck-plate-a').prompt })
    expect(tex.mode).toBeUndefined()
    expect(buildArtJob(image('title-wreck'))).toMatchObject({ aspect: '16:9', megapixels: 2 })
    expect(buildArtJob(image('wall-panel-a'), { candidates: 2 })).toMatchObject({ aspect: '2:3', batch: 2 })
  })
  it('makes a portrait an image edit of the picked concept, and refuses without it', () => {
    const job = buildArtJob(image('portrait-venn'), { refDataUrl: 'data:image/png;base64,AAAA' })
    expect(job).toMatchObject({ mode: 'edit', images: ['data:image/png;base64,AAAA'] })
    expect(() => buildArtJob(image('portrait-venn'))).toThrow(/picked concept of warden-sergeant/)
  })
  it('refuses a banned word and an unknown aspect before anything is sent', () => {
    const word = ['cu', 'te'].join('')
    expect(() => buildArtJob({ ...image('deck-plate-a'), prompt: `a ${word} plate` })).toThrow(/banned word/)
    expect(() => buildArtJob({ ...image('deck-plate-a'), aspect: '5:4' })).toThrow(/unknown aspect/)
  })
  it('renders the recorded seed again, and another seed for a re-roll', () => {
    const im = image('deck-plate-a')
    expect(buildArtJob(im).seed).toBe(im.seed)
    expect(seedFor({ ...im, seed: undefined })).toBe(seedFor({ ...im, seed: undefined }))
    expect(seedFor(im, 1)).not.toBe(seedFor(im, 0))
    expect(seedFor(im, 2)).not.toBe(seedFor(im, 1))
  })
  it('plans only what has no candidates, unless forced, and honours --only and --kind', () => {
    const none = () => false
    const all = () => true
    expect(planArt(assets, {}, none).length).toBe(assets.images.length)
    expect(planArt(assets, {}, all)).toEqual([])
    expect(planArt(assets, { force: true }, all).length).toBe(assets.images.length)
    expect(planArt(assets, { only: new Set(['scorch-mark']) }, none).map((im) => im.id)).toEqual(['scorch-mark'])
    expect(planArt(assets, { kind: 'decal' }, none).every((im) => im.kind === 'decal')).toBe(true)
  })
  it('publishes each kind its own way: grey levelled textures, colour stills, decals with alpha from darkness', () => {
    expect(publishRecipe(image('deck-plate-a'))).toMatchObject({ width: 512, height: 512, grey: true, normalise: true, mean: TEXTURE_MEAN, alphaFromDarkness: false })
    expect(publishRecipe(image('wall-panel-a'))).toMatchObject({ width: 512, height: 768 })
    expect(publishRecipe(image('title-wreck'))).toMatchObject({ width: 1600, height: 900, grey: false, alphaFromDarkness: false })
    expect(publishRecipe(image('scorch-mark'))).toMatchObject({ grey: false, alphaFromDarkness: true })
    expect(alphaFromLuma(255)).toBe(0)
    expect(alphaFromLuma(240)).toBe(0)
    expect(alphaFromLuma(0)).toBe(255)
    expect(alphaFromLuma(60)).toBe(255)
    expect(alphaFromLuma(150)).toBeGreaterThan(alphaFromLuma(200))
  })
  it('records a pick without touching the other images', () => {
    const m = withPick(assets, 'scorch-mark', 3, 42)
    expect(m.images.find((im) => im.id === 'scorch-mark')).toMatchObject({ pick: 3, seed: 42, enabled: true })
    expect(m.images.filter((im) => im.id !== 'scorch-mark')).toEqual(assets.images.filter((im) => im.id !== 'scorch-mark'))
    expect(knownImageIds(assets).has('title-wreck')).toBe(true)
  })
  it('reads --pick as id:n pairs of known ids', () => {
    expect(parsePicks('title-wreck:2, scorch-mark:1', assets)).toEqual([{ id: 'title-wreck', pick: 2 }, { id: 'scorch-mark', pick: 1 }])
    expect(() => parsePicks('nope:1', assets)).toThrow(/known image ids/)
    expect(() => parsePicks('title-wreck:0', assets)).toThrow()
  })
  it('a dry run of everything prints one job per image and sends nothing', async () => {
    const c = collect()
    expect(await genArt(['--dry-run', '--force', '--base', 'http://127.0.0.1:9'], c.io)).toBe(0)
    expect(c.out.filter((l) => l.includes('POST http://127.0.0.1:9/api/jobs')).length).toBe(assets.images.length)
    expect(c.out[c.out.length - 1]).toMatch(/dry run: nothing was sent/)
    expect(c.out.join(' ')).not.toMatch(/base64,[A-Za-z0-9+/]{40}/)
    expect(c.errs).toEqual([])
  })
  it('rejects unknown ids, kinds and malformed picks with a usage error', async () => {
    for (const argv of [['--only', 'nope'], ['--kind', 'poster'], ['--pick', 'nope:1'], ['--reroll', 'x'], ['--bogus']]) {
      const c = collect()
      expect(await genArt(argv, c.io), argv.join(' ')).toBe(2)
      expect(c.errs.join(' ')).toMatch(/Usage:/)
    }
  })
})
