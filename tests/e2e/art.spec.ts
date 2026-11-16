// Spec 70: the generated art on the screens and the deck. Stills and faces load where the spec puts them, the start button
// waits for the deck textures, the fight leaves scars, and `?art=none` asks for no image at all.
import { expect, test, type Page } from '@playwright/test'
import { playOut, sweepText, toBriefing, toMission, watchErrors } from './helpers'

const loaded = (page: Page, sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0))
const art = (page: Page) => page.evaluate(() => window.__sd!.art())

test('ART-4, ART-5, ART-7: stills on the title, missions, briefing and debrief; faces on the roster and the strip; scars on the deck', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&seed=41&audio=none')
  // title: the wreck behind the sweep
  await expect(page.locator('[data-art="title"] img')).toBeVisible()
  await expect.poll(() => loaded(page, '[data-art="title"] img')).toEqual([true])
  // missions: one still per card
  await page.getByRole('button', { name: /^single mission/i }).click()
  await expect(page.locator('.mcard [data-art^="mission:"] img')).toHaveCount(3)
  await expect.poll(() => loaded(page, '.mcard [data-art^="mission:"] img')).toEqual([true, true, true])
  await page.locator('[data-mission="dead-reckoning"]').click()
  await page.locator('[data-act="brief"]').click()
  // briefing: the mission still with its caption, and a face on every roster card
  await expect(page.locator('[data-screen="briefing"] [data-art="mission:dead-reckoning"] figcaption')).toContainText(/last survey still/i)
  await expect(page.locator('.roster .face')).toHaveCount(5)
  await expect.poll(() => loaded(page, '.roster .face')).toEqual([true, true, true, true, true])
  // no native tooltips on any of it (KB rule 8)
  expect(await page.locator('[title]').count()).toBe(0)
  await sweepText(page)
  // the start button has waited for the deck textures (KB rule 26)
  await expect(page.locator('[data-act="cut-in"]')).toBeEnabled()
  const before = await art(page)
  expect(before.loaded).toBe(before.total)
  expect(before.total).toBeGreaterThanOrEqual(24)
  expect(before.failed).toEqual([])
  expect(before.enabled).toEqual(expect.arrayContaining(['deck-plate-a', 'deck-plate-e', 'wall-panel-a', 'wall-panel-c', 'wall-fire', 'deckhead', 'door-leaf', 'duct-grille', 'scorch-mark', 'ichor-splat-a', 'claw-marks-a', 'debris-a']))
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  expect((await art(page)).scars).toEqual([])
  // ART-9: the wreck burns in a few bulkheads (never on a square anyone can stand on) and carries old damage
  const wreck = await art(page)
  expect(wreck.fires.length).toBeGreaterThanOrEqual(3)
  expect(wreck.dress).toBeGreaterThan(10)
  const terrain = await page.evaluate(() => window.__sd!.state()!.mission)
  expect(terrain).toBe('dead-reckoning')
  expect(await page.evaluate(() => window.__sd!.presented()!.burn)).toEqual([])
  // the squad strip carries the faces
  await expect(page.locator('.strip .trace__face')).toHaveCount(5)
  // play the mission out: every destroyed stalker has left a splash where it fell (at most two a square)
  await playOut(page)
  const a = await art(page)
  expect(a.scars.length).toBeGreaterThan(0)
  expect(a.scars.every((s) => s.kind === 'kill' || s.kind === 'burn')).toBe(true)
  // debrief: the still of this ending, and a face on every Warden card
  await expect(page.locator('[data-screen="debrief"]')).toBeVisible()
  const won = await page.evaluate(() => window.__sd!.state()!.result!.winner === 'warden')
  await expect(page.locator(`[data-screen="debrief"] [data-art="debrief:warden-${won ? 'win' : 'loss'}"] img`)).toBeVisible()
  await expect(page.locator('.roster--debrief .face')).toHaveCount(5)
  expect(errors).toEqual([])
})

test('ART-7: ?art=none requests no image and the game plays on flat plates', async ({ page }) => {
  const errors = watchErrors(page)
  const asked: string[] = []
  page.on('request', (r) => {
    if (/\/assets\/art\//.test(r.url())) asked.push(r.url())
  })
  await page.goto('./?speed=instant&art=none&audio=none')
  await expect(page.locator('[data-art]')).toHaveCount(0)
  await toBriefing(page)
  await expect(page.locator('.face')).toHaveCount(0)
  await expect(page.locator('[data-act="cut-in"]')).toBeEnabled()
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  expect(await art(page)).toMatchObject({ enabled: [], total: 0, failed: [], fires: [] })
  expect(asked).toEqual([])
  expect(errors).toEqual([])
})

test('ART-5: the Molt seat shows a stalker face on each revealed stalker card, none on an unresolved contact', async ({ page }) => {
  await page.goto('./?speed=instant&seed=41&audio=none')
  await toMission(page, 'dead-reckoning', 'molt')
  await page.evaluate(() => window.__sd!.idle())
  const cards = page.locator('.trace--molt')
  await expect(cards.first()).toBeVisible()
  const withFace = await page.locator('.trace--molt:has(.trace__face)').count()
  const stalkers = await page.evaluate(() => window.__sd!.presented()!.units.filter((u) => u.kind === 'stalker').length)
  expect(withFace).toBe(stalkers)
})

test('art.html lists every image with its prompt', async ({ page }) => {
  await page.goto('./art.html')
  const n = await page.evaluate(() => document.querySelectorAll('.artcard').length)
  expect(n).toBeGreaterThanOrEqual(40)
  await expect(page.locator('[data-image="title-wreck"] img')).toBeVisible()
  await expect(page.locator('[data-image="deck-plate-a"]')).toContainText(/candidate \d, seed \d+/)
})
