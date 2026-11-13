// M5/M6 plumbing: with nothing enabled the game requests no model or audio file; with `?models=fixture` every model slug is
// served a small fixture GLB, the start button waits for the loads, and the figures' meshes are in the scene.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { toBriefing, toMission, watchErrors } from './helpers'

const FIXTURE = readFileSync(new URL('../fixtures/fixture-figure.glb', import.meta.url))

test('?models=none&audio=none: no model or audio request, procedural figures, silence', async ({ page }) => {
  const errors = watchErrors(page)
  const asked: string[] = []
  page.on('request', (r) => {
    if (/\/assets\/(models|audio)\//.test(r.url())) asked.push(r.url())
  })
  const logs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') logs.push(m.text())
  })
  await page.goto('/?models=none&audio=none')
  await toMission(page)
  const m = await page.evaluate(() => window.__sd!.models())
  expect(m).toMatchObject({ total: 0, loaded: 0, enabled: [], failed: [], mounted: {} })
  expect(await page.evaluate(() => window.__sd!.audio())).toMatchObject({ enabled: false, played: [], failed: [] })
  expect(asked).toEqual([])
  expect(errors).toEqual([])
  expect(logs.filter((l) => !/fonts\.g|ERR_|Failed to load resource|THREE.Clock/.test(l))).toEqual([])
})

test('?models=fixture: the start button waits for the loads and the models are in the scene', async ({ page }) => {
  const errors = watchErrors(page)
  await page.route('**/assets/models/*.glb', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: FIXTURE })
  })
  await page.goto('/?models=fixture')
  await toBriefing(page)
  const start = page.locator('[data-act="cut-in"]')
  await expect(start).toBeDisabled()
  await expect(start).toHaveText(/Loading models \d+\/11/)
  await expect(start).toBeEnabled({ timeout: 30_000 })
  await expect(start).toHaveText(/cut in/i)
  expect(await page.evaluate(() => window.__sd!.models())).toMatchObject({ loaded: 11, total: 11, failed: [] })
  await start.click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  await page.waitForFunction(() => (window.__sd!.models().mounted['warden-sergeant'] ?? 0) >= 1)
  const mounted = await page.evaluate(() => window.__sd!.models().mounted)
  for (const slug of ['warden-sergeant', 'warden-rifle-a', 'warden-rifle-b', 'warden-scorcher', 'warden-tech', 'console']) expect(mounted[slug], slug).toBe(1)
  // the figures are not pickable: tapping a tile still resolves on the tile
  expect(errors).toEqual([])
})

test('?models=warden-tech with the file missing: falls back, one warning, a line in Settings', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text())
  })
  await page.route('**/assets/models/warden-tech.glb', (route) => route.fulfill({ status: 404, body: 'no' }))
  await page.goto('/?models=warden-tech')
  await expect(page.getByRole('button', { name: /board the halcyon drift/i })).toBeEnabled()
  await page.getByRole('button', { name: /settings/i }).click()
  await expect(page.getByRole('status')).toContainText('warden-tech')
  expect(warnings.filter((w) => w.includes('warden-tech'))).toHaveLength(1)
  await page.getByRole('button', { name: /close/i }).click()
  await toMission(page)
  expect(await page.evaluate(() => window.__sd!.models().failed)).toEqual(['warden-tech'])
})
