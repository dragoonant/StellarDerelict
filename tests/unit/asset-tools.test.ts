// The pure parts of the GPU-PC scripts: prompt lint, concept jobs, idempotent plans, ffmpeg arguments, measurement.
// Nothing here needs a studio, ffmpeg, sharp or a generated file.
import { describe, expect, it } from 'vitest'
import { assets } from '../../src/data'
import { bannedWords, lintManifest, lintPrompt } from '../../tools/figures/lint-prompts.mjs'
import { REFERENCE_LINE, buildConceptJob, contactSheetHtml, makePicks, makeUnits, planConcepts } from '../../tools/figures/lib.mjs'
import { buildMusicJob, buildSfxJob, buildVoiceJob, convertArgs, knownIds, planAudio, withEnabled } from '../../tools/audio/lib.mjs'
import { main as genAudio, parseArgv } from '../../tools/audio/gen-audio.mjs'
import { analyse, crestFlag, silenceBounds, SR } from '../../tools/audio/measure-lib.mjs'
import { classifyStatus, jobFileNames } from '../../tools/lib/studio.mjs'
import { glbJson, isOptimized, triCount } from '../../tools/models/lib.mjs'
import { makeBoxGlb } from './glb'

describe('FIG-1 prompt lint', () => {
  it('passes the manifest', () => {
    expect(lintManifest(assets)).toEqual([])
  })
  it('catches every banned word, in any case and plural, but not look-alikes', () => {
    for (const w of bannedWords()) {
      expect(lintPrompt(`a figure, ${w.toUpperCase()}, armour`), w).toContain(w)
      if (!w.includes(' ')) expect(lintPrompt(`prefix${w}`), `${w} inside a longer word`).toEqual([])
    }
    expect(lintPrompt('a study, a toyshop, stand-in, cuter')).toEqual([])
    expect(bannedWords().length).toBeGreaterThan(20)
  })
  it('every Warden and stalker prompt states measurements, and props stay wordless', () => {
    for (const m of assets.models) {
      expect(m.prompt, m.slug).toMatch(/wordless/)
      if (m.kind === 'warden') expect(m.prompt).toContain('2.8 head-heights')
    }
  })
})

describe('FIG-2 concept jobs and plan', () => {
  const ref = 'data:image/jpeg;base64,AAAA'
  it('figures edit the reference; props are plain text-to-image', () => {
    const w = buildConceptJob(assets.models.find((m) => m.slug === 'warden-sergeant')!, ref)
    expect(w).toMatchObject({ model: 'klein', mode: 'edit', batch: 4, aspect: '2:3', image: ref })
    expect(w.prompt.startsWith(REFERENCE_LINE)).toBe(true)
    const p = buildConceptJob(assets.models.find((m) => m.slug === 'terminal')!)
    expect(p.mode).toBeUndefined()
    expect(p.image).toBeUndefined()
    expect(() => buildConceptJob(assets.models.find((m) => m.slug === 'warden-tech')!)).toThrow(/reference/)
  })
  it('refuses a prompt with a banned word', () => {
    const bad = { ...assets.models[0]!, prompt: `${bannedWords()[7]} figure` }
    expect(() => buildConceptJob(bad, ref)).toThrow(/banned/)
  })
  it('is deterministic per slug', () => {
    const m = assets.models[3]!
    expect(buildConceptJob(m, ref).seed).toBe(buildConceptJob(m, ref).seed)
  })
  it('skips picked slugs and slugs with candidates, honours only and force', () => {
    expect(planConcepts(assets, {}, {}, () => false)).toHaveLength(11)
    expect(planConcepts(assets, {}, { 'warden-tech': 'x.png' }, (s) => s === 'core').map((m) => m.slug)).not.toContain('warden-tech')
    expect(planConcepts(assets, {}, {}, (s) => s === 'core').map((m) => m.slug)).not.toContain('core')
    expect(planConcepts(assets, { only: new Set(['core']), force: true }, { core: 1 }, () => true).map((m) => m.slug)).toEqual(['core'])
    expect(planConcepts(assets, { only: new Set(['stalker-a']) }, {}, () => false)).toHaveLength(1)
  })
  it('writes Hunyuan inputs from the manifest', () => {
    const u = makeUnits(assets)
    expect(Object.keys(u)).toHaveLength(11)
    expect(u['warden-sergeant']).toMatchObject({ height: 1.6 })
    expect(u['warden-sergeant']!.prompt).toBe(assets.models[0]!.prompt)
    expect(makePicks({ a: 5, b: 'art/x.png', c: '/abs/y.png' }, '/root')).toEqual({ a: 5, b: '/root/art/x.png', c: '/abs/y.png' })
  })
  it('builds an HTML contact sheet with labels and escapes', () => {
    const h = contactSheetHtml('Wardens <x>', [{ slug: 'warden-tech', images: ['warden-tech/1.png'] }])
    expect(h).toContain('warden-tech #1')
    expect(h).toContain('Wardens &lt;x&gt;')
  })
})

describe('AUD-8 audio generator plan', () => {
  it('posts the documented fields', () => {
    expect(buildSfxJob(assets.sounds.find((s) => s.id === 'repeater-shot')!)).toMatchObject({ mode: 'sfx', batch: 3, seconds: 2, steps: 50, guidance: 5 })
    expect(buildSfxJob(assets.sounds.find((s) => s.id === 'ui-select')!).seconds).toBe(1)
    expect(buildMusicJob(assets.music.find((m) => m.state === 'battle')!)).toMatchObject({ mode: 'music', lyrics: '[Instrumental]', duration: 120, bpm: 132, batch: 1 })
    expect(buildVoiceJob(assets.voice[0]!)).toMatchObject({ mode: 'voice', model: 'qwen-design', language: 'English' })
    expect(buildVoiceJob(assets.voice[0]!).instruct).toBe(assets.voice[0]!.voiceDesign)
  })
  it('plans every entry when nothing exists, and nothing when everything does', () => {
    const all = planAudio(assets, {}, () => false)
    expect(all).toHaveLength(assets.sounds.length + assets.music.length + assets.voice.length)
    expect(planAudio(assets, {}, () => true)).toEqual([])
    expect(planAudio(assets, { force: true }, () => true)).toHaveLength(all.length)
  })
  it('re-runs only what is missing, and filters by kind and id', () => {
    const have = new Set(['audio/sfx/repeater-shot-1.mp3', 'audio/sfx/repeater-shot-2.mp3'])
    const j = planAudio(assets, { only: new Set(['repeater-shot']) }, (f) => have.has(f))
    expect(j).toHaveLength(1)
    expect(j[0]!.missing).toEqual(['audio/sfx/repeater-shot-3.mp3'])
    expect(planAudio(assets, { kind: 'music' }, () => false)).toHaveLength(7)
    expect(planAudio(assets, { kind: 'voice', only: new Set(['venn-moved']) }, () => false)).toHaveLength(1)
  })
  it('flips enabled only for the ids named', () => {
    const m = withEnabled(assets as never, new Set(['calm', 'venn-moved', 'ping']))
    expect(m.music.filter((e: { enabled: boolean }) => e.enabled)).toHaveLength(1)
    expect(m.voice.filter((e: { enabled: boolean }) => e.enabled)).toHaveLength(1)
    expect(m.sounds.filter((e: { enabled: boolean }) => e.enabled)).toHaveLength(1)
    expect(assets.sounds.every((s) => !s.enabled)).toBe(true) // the original is not mutated
  })
  it('converts with ffmpeg: mono mp3 for effects, radio band for voice, stereo for music', () => {
    expect(convertArgs('sfx', 'a.flac', 'a.mp3')).toContain('libmp3lame')
    expect(convertArgs('voice', 'a.wav', 'a.mp3').join(' ')).toMatch(/highpass.*acompressor/)
    expect(convertArgs('music', 'a.flac', 'a.mp3')[convertArgs('music', 'a.flac', 'a.mp3').indexOf('-ac') + 1]).toBe('2')
  })
  it('rejects unknown ids and kinds on the command line', () => {
    expect(() => parseArgv(['--only', 'nope'], assets as never)).toThrow(/unknown/)
    expect(() => parseArgv(['--kind', 'x'], assets as never)).toThrow(/kind/)
    expect(parseArgv(['--only', 'calm,ping'], assets as never).only).toEqual(new Set(['calm', 'ping']))
    expect(knownIds(assets as never).has('sting-win')).toBe(true)
  })
  it('--dry-run prints the jobs and touches no network', async () => {
    const out: string[] = []
    const code = await genAudio(['--dry-run', '--only', 'ping'], { log: (m: string) => out.push(m), err: (m: string) => out.push(m) })
    expect(code).toBe(0)
    expect(out.join('\n')).toMatch(/POST http:\/\/localhost:7890\/api\/jobs/)
  })
})

describe('AUD-9 measurement', () => {
  const sine = (db: number, n = SR): Float32Array => Float32Array.from({ length: n }, (_, i) => 10 ** (db / 20) * Math.sin((2 * Math.PI * 1000 * i) / SR))
  it('measures a -20 dBFS sine: peak, rms, loudness, crest', () => {
    const m = analyse(sine(-20))
    expect(m.peakDb).toBeCloseTo(-20, 1)
    expect(m.rmsDb).toBeCloseTo(-23, 0)
    expect(m.lufs).toBeGreaterThan(-24)
    expect(m.lufs).toBeLessThan(-22)
    expect(m.crest).toBeCloseTo(Math.SQRT2, 1)
  })
  it('finds leading and trailing silence', () => {
    const x = new Float32Array(SR)
    x.set(sine(-10, 4800), 9600)
    const b = silenceBounds(x)!
    expect(b.start).toBeGreaterThanOrEqual(9600)
    expect(b.start).toBeLessThan(9700)
    expect(b.end).toBeLessThanOrEqual(14400)
    expect(silenceBounds(new Float32Array(100))).toBeNull()
  })
  it('flags a flat gunshot but not a punchy one, nor other sounds', () => {
    expect(crestFlag('repeater-shot', 2)).toMatch(/crest/)
    expect(crestFlag('repeater-shot-2', 9)).toBeNull()
    expect(crestFlag('ambience', 2)).toBeNull()
  })
})

describe('GEN-1 studio helpers and the model optimiser', () => {
  it('classifies job states and lists files from several response shapes', () => {
    expect(classifyStatus({ status: 'Done' })).toBe('done')
    expect(classifyStatus({ state: 'failed' })).toBe('failed')
    expect(classifyStatus({ status: 'running' })).toBe('pending')
    expect(jobFileNames({ audios: ['audio_0.flac', 'audio_1.flac'] })).toEqual(['audio_0.flac', 'audio_1.flac'])
    expect(jobFileNames({ images: [{ name: 'a/b.png' }] })).toEqual(['b.png'])
    expect(jobFileNames({}, ['voice.wav'])).toEqual(['voice.wav'])
  })
  it('reads a GLB and tells an optimised one from a raw one', () => {
    const glb = Buffer.from(makeBoxGlb(1, 1, 1))
    expect(glbJson(glb)).not.toBeNull()
    expect(triCount(glbJson(glb))).toBe(12)
    expect(isOptimized(glb)).toBe(false)
    expect(glbJson(Buffer.from('not a glb at all, really not'))).toBeNull()
  })
})
