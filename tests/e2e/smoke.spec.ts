import { expect, test } from '@playwright/test'
import { playOut, sweepText, toBriefing, toMission, watchErrors, SAVE_KEY } from './helpers'

test('smoke: title, briefing, mission with real clicks on the board', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&seed=21')
  await expect(page.locator('h1')).toContainText('Stellar')
  await expect(page.getByText('An original game by evilgouki')).toBeVisible()
  await sweepText(page)
  await toBriefing(page)
  await expect(page.getByRole('list', { name: /squad roster/i }).locator('li')).toHaveCount(5)
  await sweepText(page)
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  await page.waitForTimeout(500)
  // mission start is saved before anything else happens
  expect(await page.evaluate((k) => localStorage.getItem(k) !== null, SAVE_KEY)).toBe(true)

  const unitAt = (id: string) => page.evaluate((u) => (window.__sd!.state()!.units.find((x) => x.id === u) as { at: number[] }).at, id)
  const tap = async (x: number, y: number) => {
    const p = await page.evaluate(([a, b]) => window.__sd!.project(a!, b!), [x, y])
    expect(p).not.toBeNull()
    // the point must be on the board, not under a HUD panel
    expect(await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName, [p!.x, p!.y])).toBe('CANVAS')
    await page.mouse.click(p!.x, p!.y)
  }

  // select a Warden by tapping its tile
  await tap(3, 14)
  await expect.poll(() => page.evaluate(() => window.__sd!.ui().selected)).toBe('brandt')
  // move forward by tapping the highlighted square ahead
  await tap(4, 14)
  await expect.poll(() => unitAt('brandt')).toEqual([4, 14])
  // open the airlock door with the action bar
  await page.locator('[data-act="door"]').click()
  await expect.poll(() => page.evaluate(() => window.__sd!.state()!.doors['5,14']!.open)).toBe(true)
  await sweepText(page)

  // end the phase: the squad still has AP, so it asks once
  await page.locator('[data-act="end-phase"]').click()
  await expect(page.getByTestId('end-confirm')).toBeVisible()
  await page.locator('[data-act="end-confirm"]').click()
  await page.evaluate(() => window.__sd!.idle())
  await expect.poll(() => page.evaluate(() => ({ r: window.__sd!.state()!.round, t: window.__sd!.state()!.toAct }))).toEqual({ r: 2, t: 'warden' })
  await expect(page.getByTestId('log')).toContainText('Molt phase')
  await sweepText(page)

  // KB rule 8: no native tooltips
  expect(await page.evaluate(() => document.querySelectorAll('[title]').length)).toBe(0)
  expect(await page.evaluate(() => document.querySelectorAll('svg title').length)).toBe(0)
  expect(errors).toEqual([])
})

test('a full mission plays to a result through the client and ends on the Debrief; no save is left', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&bot=random&seed=4')
  await toMission(page)
  await playOut(page)
  await expect(page.locator('[data-screen="debrief"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.debrief h2')).toHaveText(/core recovered|signal lost/i)
  await sweepText(page)
  // KB rule 22: a finished mission clears the save
  expect(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).toBeNull()
  await page.reload()
  await expect(page.getByRole('button', { name: /^continue/i })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('KB rule 8: no title attributes, no SVG title, on every screen', async ({ page }) => {
  await page.goto('./?speed=instant&seed=5')
  const count = () => page.evaluate(() => document.querySelectorAll('[title]').length + document.querySelectorAll('svg title').length)
  expect(await count()).toBe(0)
  await page.getByRole('button', { name: /how to play/i }).click()
  await expect(page.getByRole('dialog', { name: /how to play/i })).toContainText('per browser'.replace('per browser', 'in this browser only'))
  expect(await count()).toBe(0)
  await page.getByRole('button', { name: /^close/i }).click()
  await page.getByRole('button', { name: /settings/i }).click()
  expect(await count()).toBe(0)
  await page.getByRole('button', { name: /^close/i }).click()
  await toMission(page)
  await page.locator('[data-unit="venn"]').click()
  expect(await count()).toBe(0)
  await page.locator('[data-act="menu"]').click()
  expect(await count()).toBe(0)
})
