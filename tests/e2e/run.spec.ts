// The boarding run (spec 10 section 15) and the Missions screen through the client: a won first mission hands the survivors to
// the next Briefing; the run survives a reload between missions; the Debrief tallies the run.
import { expect, test } from '@playwright/test'
import { playOut, sweepText, toBriefing, toRunBriefing, watchErrors } from './helpers'

const RUN_KEY = 'stellar-derelict-run'

test('MISSIONS: the Missions screen lists the three cuts with their own objective words, and a picked mission briefs and starts', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&seed=51')
  await page.getByRole('button', { name: /^single mission/i }).click()
  const cards = page.locator('[data-mission]')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toContainText('Dead Reckoning')
  await expect(cards.nth(1)).toContainText('Cold Berth')
  await expect(cards.nth(2)).toContainText('Last Light')
  await expect(cards.nth(1)).toContainText('manifest drive')
  await sweepText(page)
  await page.locator('[data-mission="cold-berth"]').click()
  await page.locator('[data-act="brief"]').click()
  await expect(page.locator('[data-screen="briefing"] h2')).toHaveText('Cold Berth')
  await expect(page.locator('[data-screen="briefing"]')).toContainText('manifest drive')
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  expect(await page.evaluate(() => window.__sd!.ui().mission)).toBe('cold-berth')
  await expect(page.locator('.hud-objective')).toContainText('berth control room')
  // the inspector and the log use the mission's words too
  await expect(page.getByTestId('log')).toContainText('west airlock')
  expect(errors).toEqual([])
})

test('R-1..R-4 through the client: a boarding run carries the survivors into Cold Berth and remembers itself across a reload', async ({ page }) => {
  const errors = watchErrors(page)
  // the random Molt loses to the squad AI every time (spec 10 section 13b), so this seed wins mission 1
  await page.goto('./?speed=instant&bot=random&seed=61')
  await toRunBriefing(page)
  await expect(page.locator('[data-screen="briefing"] .eyebrow')).toContainText('mission 1 of 3')
  await expect(page.locator('[data-screen="briefing"] h2')).toHaveText('Dead Reckoning')
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  const ui = await page.evaluate(() => window.__sd!.ui())
  expect(ui.run?.index).toBe(0)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stellar-derelict-save') ?? '{}'))
  expect(saved.setup.options.roster).toHaveLength(5)
  expect(saved.ui.run.missions).toHaveLength(3)

  await playOut(page)
  await expect(page.locator('[data-screen="debrief"]')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.debrief h2')).toHaveText(/navigation core recovered/i)
  const survivors = await page.evaluate(() => window.__sd!.state()!.units.filter((u) => u.kind === 'warden' && u.alive).length)
  expect(survivors).toBeGreaterThanOrEqual(2)
  await expect(page.getByTestId('run-line')).toContainText('1 of 3 missions done')
  await expect(page.getByTestId('run-line')).toContainText(`${survivors} Wardens board Cold Berth`)
  await expect(page.locator('.debrief')).toContainText('Repeater fire')
  await expect(page.locator('.debrief')).toContainText('Contacts resolved')
  await sweepText(page)
  // the run is parked in storage between missions and the mission save is gone (KB rule 22)
  expect(await page.evaluate(() => localStorage.getItem('stellar-derelict-save'))).toBeNull()
  const parked = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), RUN_KEY)
  expect(parked.index).toBe(1)
  expect(parked.roster).toHaveLength(survivors)

  // reload: the title offers to continue the run, and the next Briefing fields only the survivors
  await page.reload()
  const cont = page.getByRole('button', { name: /continue the boarding run/i })
  await expect(cont).toBeVisible()
  await expect(cont).toContainText('1 of 3 missions done')
  await expect(cont).toContainText('Next: Cold Berth')
  await cont.click()
  await expect(page.locator('[data-screen="briefing"] .eyebrow')).toContainText('mission 2 of 3')
  await expect(page.locator('[data-screen="briefing"] h2')).toHaveText('Cold Berth')
  await expect(page.getByRole('list', { name: /squad roster/i }).locator('li')).toHaveCount(survivors)
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  expect(await page.evaluate(() => window.__sd!.ui().mission)).toBe('cold-berth')
  const ws = await page.evaluate(() => window.__sd!.state()!.units.filter((u) => u.kind === 'warden'))
  expect(ws).toHaveLength(survivors)
  expect(ws.every((u) => u.kind === 'warden' && !u.breached)).toBe(true)
  expect(errors).toEqual([])
})

test('R-3: a lost mission ends the run; the Debrief says so and the title offers no run to continue', async ({ page }) => {
  await page.goto('./?speed=instant&seed=62&bot=veteran')
  await toRunBriefing(page)
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  // the squad stands still and ends every phase: the swarm wins by the clock or by the squad
  await page.evaluate(async () => {
    const sd = window.__sd!
    for (let i = 0; i < 400; i++) {
      await sd.idle()
      if (sd.state()!.result) return
      sd.dispatch({ type: 'endPhase' })
    }
  })
  await expect(page.locator('[data-screen="debrief"]')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.debrief')).toHaveAttribute('data-run', 'lost')
  await expect(page.getByTestId('run-line')).toContainText('Boarding run over')
  await expect(page.locator('[data-act="next-mission"]')).toHaveCount(0)
  await page.locator('[data-act="to-title"]').click()
  await expect(page.getByRole('button', { name: /continue the boarding run/i })).toHaveCount(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), RUN_KEY)).toBeNull()
  // a single mission still briefs normally afterwards
  await toBriefing(page, 'last-light')
  await expect(page.locator('[data-screen="briefing"] h2')).toHaveText('Last Light')
})
