// M5 plumbing: the model store, the fit, and the procedural fallback rules (KB rule 26).
import { existsSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Box3, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { assets, stalkerSlug, wardenSlug } from '../../src/data'
import { ModelFigure } from '../../src/client/models/Model'
import { MAX_FOOTPRINT, ModelStore, WORLD_PER_INCH } from '../../src/client/models/store'
import { makeBoxGlb } from './glb'

const glb = (): ArrayBuffer => makeBoxGlb(0.5, 2, 0.4)
const fixture = readFileSync(new URL('../fixtures/fixture-figure.glb', import.meta.url))
const only = (...slugs: string[]) => (m: { slug: string }) => slugs.includes(m.slug)
const stand = createElement('b', { 'data-standin': '1' })

describe('manifest defaults', () => {
  it('every enabled model, sound, music and voice entry has its file under public/assets', () => {
    const onDisk = (file: string): boolean => existsSync(new URL(`../../public/assets/${file}`, import.meta.url))
    for (const m of assets.models.filter((m) => m.enabled)) expect(onDisk(m.file), m.slug).toBe(true)
    for (const s of assets.sounds.filter((s) => s.enabled)) for (const f of s.files) expect(onDisk(f), s.id).toBe(true)
    for (const m of assets.music.filter((m) => m.enabled)) expect(onDisk(m.file), m.state).toBe(true)
    for (const v of assets.voice.filter((v) => v.enabled)) expect(onDisk(v.file), v.id).toBe(true)
  })
  it('maps roles and stalker ids to stable slugs', () => {
    expect(wardenSlug('sergeant', 0)).toBe('warden-sergeant')
    expect(wardenSlug('warden', 0)).toBe('warden-rifle-a')
    expect(wardenSlug('warden', 1)).toBe('warden-rifle-b')
    expect(wardenSlug('scorcher', 0)).toBe('warden-scorcher')
    expect(wardenSlug('tech', 0)).toBe('warden-tech')
    expect(stalkerSlug('s12')).toBe(stalkerSlug('s12'))
    expect(new Set(Array.from({ length: 60 }, (_, i) => stalkerSlug(`s${i}`))).size).toBe(3)
  })
})

describe('MODEL-1 an enabled model loads and is scaled to its height', () => {
  it('fits a 2-high box to 1.6 in', async () => {
    const store = new ModelStore(async () => glb(), only('warden-sergeant'))
    expect(store.snapshot().total).toBe(1)
    expect(store.snapshot().ready).toBe(false)
    const rec = await store.load('warden-sergeant')
    expect(rec.status).toBe('ready')
    expect(rec.height).toBeCloseTo(1.6 * WORLD_PER_INCH, 5)
    const box = new Box3().setFromObject(rec.proto!)
    expect(box.min.y).toBeCloseTo(0, 5)
    expect(box.max.y).toBeCloseTo(1.6 * WORLD_PER_INCH, 5)
    expect(store.snapshot()).toMatchObject({ loaded: 1, total: 1, ready: true })
  })
  it('loads the committed fixture file too', async () => {
    const store = new ModelStore(async () => fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer, only('stalker-a'))
    const rec = await store.load('stalker-a')
    expect(rec.status).toBe('ready')
    expect(rec.tris).toBe(12)
  })
  it('never makes a model wider than a square', async () => {
    const store = new ModelStore(async () => makeBoxGlb(4, 1, 1), only('warden-sergeant'))
    const rec = await store.load('warden-sergeant')
    const size = new Box3().setFromObject(rec.proto!).getSize(new Vector3())
    expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(MAX_FOOTPRINT + 1e-6)
  })
  it('turns generated +z models to the game forward (-z), plus the manifest yaw', async () => {
    const store = new ModelStore(async () => glb(), only('warden-sergeant'))
    const rec = await store.load('warden-sergeant')
    expect(rec.proto!.rotation.y).toBeCloseTo(Math.PI, 5)
  })
})

describe('MODEL-2 a disabled slug renders the procedural figure and requests nothing', () => {
  it('draws the stand-in and never fetches', () => {
    const fetchBytes = vi.fn(async () => glb())
    const store = new ModelStore(fetchBytes, only('warden-sergeant'))
    const html = renderToStaticMarkup(createElement(ModelFigure, { slug: 'warden-rifle-a', fallback: stand, store }))
    expect(html).toContain('data-standin')
    expect(fetchBytes).not.toHaveBeenCalled()
  })
  it('an unconfigured default store (nothing enabled) is ready at once', () => {
    const store = new ModelStore(async () => glb(), () => false)
    expect(store.snapshot()).toMatchObject({ total: 0, ready: true })
  })
})

describe('MODEL-3 an enabled but missing file falls back and records the failure', () => {
  it('warns once, lists the failure, settles the progress and shows the stand-in', async () => {
    const warn = vi.fn()
    const store = new ModelStore(async () => Promise.reject(new Error('HTTP 404')), only('warden-tech'), warn)
    store.preloadEnabled()
    const rec = await store.load('warden-tech')
    expect(rec.status).toBe('failed')
    expect(warn).toHaveBeenCalledTimes(1)
    const snap = store.snapshot()
    expect(snap.failed).toEqual([{ slug: 'warden-tech', reason: 'HTTP 404' }])
    expect(snap.ready).toBe(true)
    const html = renderToStaticMarkup(createElement(ModelFigure, { slug: 'warden-tech', fallback: stand, store }))
    expect(html).toContain('data-standin')
  })
  it('shows the model, not the stand-in, once it is loaded', async () => {
    const store = new ModelStore(async () => glb(), only('warden-tech'))
    await store.load('warden-tech')
    const html = renderToStaticMarkup(createElement(ModelFigure, { slug: 'warden-tech', fallback: stand, store }))
    expect(html).not.toContain('data-standin')
  })
  it('a garbage file is a failure, not a crash', async () => {
    const store = new ModelStore(async () => new TextEncoder().encode('<!doctype html>').buffer as ArrayBuffer, only('terminal'), () => undefined)
    expect((await store.load('terminal')).status).toBe('failed')
  })
})
