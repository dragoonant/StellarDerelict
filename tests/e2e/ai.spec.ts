import { expect, test } from '@playwright/test'
import { playOut, sweepText, toBriefing, watchErrors } from './helpers'

const bot = (page: import('@playwright/test').Page) => page.evaluate(() => window.__sd!.bot())

test('M4: the Briefing Difficulty reaches the bot; Continue and the Debrief name it; a Veteran mission plays on with the worker', async ({ page }) => {
  const errors = watchErrors(page)
  const warnings: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'warning' && /Molt AI worker/.test(m.text())) warnings.push(m.text())
  })
  await page.goto('./?speed=instant&seed=7')
  await toBriefing(page)
  const group = page.getByRole('group', { name: 'Difficulty' })
  await expect(group.getByRole('button')).toHaveCount(3)
  await expect(group.getByRole('button', { name: 'Regular' })).toHaveAttribute('aria-pressed', 'true')
  await group.getByRole('button', { name: 'Veteran' }).click()
  await expect(group.getByRole('button', { name: 'Veteran' })).toHaveAttribute('aria-pressed', 'true')
  await sweepText(page)
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)

  // the tier is in the mission's setup (and so in the save) and is what the bot plays
  expect((await bot(page)).tier).toBe('veteran')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stellar-derelict-save') ?? '{}').setup)
  expect(saved.options).toEqual({ difficulty: 'veteran' })

  // a few full rounds: the Warden side by the scripted policy, the Molt side by the AI
  await page.evaluate(async () => {
    const sd = window.__sd!
    for (let i = 0; i < 400 && sd.state()!.round < 4; i++) {
      await sd.idle()
      const a = sd.wardenAction()
      if (a) sd.dispatch(a)
    }
  })
  const mid = await bot(page)
  expect(await page.evaluate(() => window.__sd!.state()!.round)).toBeGreaterThanOrEqual(4)
  expect(mid.decisions).toBeGreaterThan(5)
  // the worker is in use, or (where the browser has none) the one-warning main-thread fallback is
  expect(['worker', 'main']).toContain(mid.mode)
  if (mid.mode === 'main') expect(warnings).toHaveLength(1)
  else expect(warnings).toHaveLength(0)
  test.info().annotations.push({ type: 'molt-ai-mode', description: `${mid.mode}${mid.reason ? ` (${mid.reason})` : ''}` })

  // reopen: Continue names the difficulty and keeps the tier
  await page.reload()
  const cont = page.getByRole('button', { name: /^continue/i })
  await expect(cont).toContainText('Veteran difficulty')
  await cont.click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission')
  expect((await bot(page)).tier).toBe('veteran')

  // play it out: the Debrief shows the difficulty
  await playOut(page)
  await expect(page.locator('[data-screen="debrief"]')).toBeVisible()
  await expect(page.locator('[data-screen="debrief"]')).toContainText('Difficulty')
  await expect(page.locator('[data-screen="debrief"]')).toContainText('Veteran')
  await sweepText(page)
  expect(errors).toEqual([])
})

test('M4: ?bot=recruit and ?bot=regular override the saved choice; ?bot=random keeps the random bot', async ({ browser }) => {
  for (const tier of ['recruit', 'regular', 'random']) {
    // a fresh context each time: no save from the last mission to ask about
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const errors = watchErrors(page)
    await page.goto(`./?speed=instant&seed=9&bot=${tier}`)
    await toBriefing(page)
    await page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Veteran' }).click()
    await page.getByRole('button', { name: /cut in/i }).click()
    await page.waitForFunction(() => window.__sd?.ui().screen === 'mission')
    // the URL beats the Briefing's choice
    expect((await bot(page)).tier).toBe(tier)
    expect(errors).toEqual([])
    await ctx.close()
  }
})
