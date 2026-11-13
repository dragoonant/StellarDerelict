import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executablePath, launchArgs, SAVE_KEY, toMission, watchErrors } from './helpers'

const BASE = `http://localhost:${Number(process.env.PW_PORT ?? 5347)}/`

async function open(dir: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await chromium.launchPersistentContext(dir, { executablePath, args: launchArgs, viewport: { width: 1280, height: 720 } })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  return { ctx, page }
}

const snapshot = (page: Page) =>
  page.evaluate(() => {
    const s = window.__sd!.state()!
    return { round: s.round, phase: s.phase, toAct: s.toAct, units: s.units, core: s.core, doors: s.doors, actions: window.__sd!.ui().actions, log: window.__sd!.ui().log }
  })

test('KB rule 22: autosave, close, reopen, CONTINUE restores the same spot; the bot carries on in its turn', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sd-profile-'))
  try {
    let { ctx, page } = await open(dir)
    const errors = watchErrors(page)
    await page.goto(`${BASE}?speed=instant&bot=random&seed=31`)
    await toMission(page)
    // a few real actions: move, open the door, end the phase, then more in round 2
    const d = (a: object) => page.evaluate((x) => window.__sd!.dispatch(x as never), a)
    expect(await d({ type: 'move', unit: 'brandt', to: [4, 14] })).toBe(true)
    expect(await d({ type: 'door', unit: 'brandt', door: [5, 14] })).toBe(true)
    expect(await d({ type: 'endPhase' })).toBe(true)
    await page.evaluate(() => window.__sd!.idle())
    expect(await d({ type: 'turn', unit: 'venn', facing: 'N' })).toBe(true)
    const before = await snapshot(page)
    expect(before.round).toBe(2)
    expect(before.actions).toBeGreaterThan(4)
    await ctx.close()

    ;({ ctx, page } = await open(dir))
    await page.goto(`${BASE}?speed=instant&bot=random`)
    const cont = page.getByRole('button', { name: /^continue/i })
    await expect(cont).toBeVisible()
    // CONTINUE names what it reopens
    await expect(cont).toContainText('Dead Reckoning')
    await expect(cont).toContainText('round 02 of 16')
    await expect(cont).toContainText('Warden phase')
    await expect(cont).toContainText('5 of 5 Wardens alive')
    await expect(cont).toContainText('core still in the archive')
    await expect(cont).toContainText('saved')
    await cont.click()
    await page.waitForFunction(() => window.__sd?.ui().screen === 'mission')
    const after = await snapshot(page)
    expect(after).toEqual(before)
    // play on: the reopened game accepts actions and saves again
    expect(await d({ type: 'turn', unit: 'venn', facing: 'E' })).toBe(true)
    expect((await snapshot(page)).actions).toBe(before.actions + 1)

    // close in the Molt phase (Normal speed keeps the bot busy), reopen, and the bot carries on
    await page.evaluate(() => window.__sd!.speed('normal'))
    expect(await d({ type: 'endPhase' })).toBe(true)
    expect(await page.evaluate(() => window.__sd!.state()!.toAct)).toBe('molt')
    await ctx.close()
    ;({ ctx, page } = await open(dir))
    await page.goto(`${BASE}?speed=instant&bot=random`)
    await expect(page.getByRole('button', { name: /^continue/i })).toContainText('Molt phase')
    await page.getByRole('button', { name: /^continue/i }).click()
    await page.waitForFunction(() => window.__sd?.ui().screen === 'mission')
    await page.evaluate(() => window.__sd!.idle())
    await expect.poll(() => page.evaluate(() => ({ r: window.__sd!.state()!.round, t: window.__sd!.state()!.toAct }))).toEqual({ r: 3, t: 'warden' })
    expect(errors).toEqual([])
    await ctx.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('KB rule 22: a new mission over a save asks once; Keep leaves it, Replace goes on', async ({ page }) => {
  await page.goto('./?speed=instant&seed=32')
  await toMission(page)
  await page.locator('[data-act="menu"]').click()
  await page.locator('[data-act="to-title"]').click()
  await expect(page.getByRole('button', { name: /^continue/i })).toBeVisible()
  await page.getByRole('button', { name: /board the halcyon drift/i }).click()
  const ask = page.getByRole('alertdialog', { name: /replace the saved mission/i })
  await expect(ask).toContainText('replaces the saved one')
  await ask.getByRole('button', { name: /keep it/i }).click()
  await expect(page.locator('[data-screen="briefing"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^continue/i })).toBeVisible()
  await page.getByRole('button', { name: /board the halcyon drift/i }).click()
  await page.getByRole('button', { name: /replace it/i }).click()
  await expect(page.locator('[data-screen="briefing"]')).toBeVisible()
})

test('KB rule 22: a corrupt or foreign save is reported with its reason and can be discarded', async ({ page }) => {
  await page.goto('./?speed=instant')
  await page.evaluate((k) => localStorage.setItem(k, '{not json'), SAVE_KEY)
  await page.reload()
  const alert = page.getByRole('alert').filter({ hasText: /cannot be opened/i })
  await expect(alert).toContainText('not valid JSON')
  await expect(page.getByRole('button', { name: /^continue/i })).toHaveCount(0)
  await page.getByRole('button', { name: /discard the saved mission/i }).click()
  await expect(page.getByRole('alert').filter({ hasText: /cannot be opened/i })).toHaveCount(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).toBeNull()
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ game: 'another-game', version: 1 })), SAVE_KEY)
  await page.reload()
  await expect(page.getByRole('alert').filter({ hasText: /different game/i })).toBeVisible()
})

test('KB rule 22: a browser that refuses storage shows a line in the UI', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('denied')
    }
  })
  await page.goto('./?speed=instant&seed=33')
  await toMission(page)
  await expect(page.getByRole('alert').filter({ hasText: /refused to store/i })).toBeVisible()
})

test('terminal prompt names what it decides and lists the engine options', async ({ page }) => {
  await page.goto('./?speed=instant&bot=random&seed=34')
  await toMission(page)
  const d = (a: object) => page.evaluate((x) => window.__sd!.dispatch(x as never), a)
  for (const a of [
    { type: 'move', unit: 'brandt', to: [4, 14] },
    { type: 'door', unit: 'brandt', door: [5, 14] },
    { type: 'move', unit: 'brandt', to: [5, 14] },
    { type: 'move', unit: 'brandt', to: [6, 14] },
    { type: 'endPhase' },
  ])
    expect(await d(a)).toBe(true)
  await page.evaluate(() => window.__sd!.idle())
  for (const a of [
    { type: 'move', unit: 'brandt', to: [7, 14] },
    { type: 'move', unit: 'brandt', to: [8, 14] },
    { type: 'turn', unit: 'brandt', facing: 'N' },
  ])
    expect(await d(a)).toBe(true)
  await page.locator('[data-unit="brandt"]').click()
  await page.locator('[data-act="terminal"]').click()
  const prompt = page.getByTestId('terminal-prompt')
  await expect(prompt).toContainText('Flank bulkheads')
  await expect(prompt).toContainText('seal or unseal which door?')
  await expect(prompt.locator('button[data-op="seal"]').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(prompt).toHaveCount(0)
})

test('K-1 timer: Standard drains the bar and ends the phase at zero; Off has no bar', async ({ page }) => {
  await page.goto('./?speed=instant&timer=4&seed=35')
  await toMission(page)
  await expect(page.getByTestId('timer')).toBeVisible()
  const t0 = await page.evaluate(() => window.__sd!.ui().timerLeft)
  await page.waitForTimeout(1200)
  expect(await page.evaluate(() => window.__sd!.ui().timerLeft)).toBeLessThan(t0 - 0.5)
  // at zero the phase ends on its own: the Molt move and round 2 begins
  await expect.poll(() => page.evaluate(() => window.__sd!.state()!.round), { timeout: 20_000 }).toBe(2)
  await expect(page.getByTestId('log')).toContainText('boarding clock runs out')

  await page.evaluate(() => window.__sd!.idle())
  await page.locator('[data-act="menu"]').click()
  await page.getByRole('group', { name: /boarding clock/i }).getByRole('button', { name: /^off$/i }).click()
  await page.getByRole('button', { name: /^resume/i }).click()
  await expect(page.getByTestId('timer')).toHaveCount(0)
})
