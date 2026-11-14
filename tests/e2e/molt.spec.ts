// The Molt seat (spec 50 "The Molt seat"): the person places arrivals, creeps contacts, reveals and strikes; the squad AI plays
// the Wardens; the Molt view carries the stalker counts; no boarding clock.
import { expect, test } from '@playwright/test'
import { sweepText, toBriefing, watchErrors } from './helpers'

type U = { id: string; kind: string; at: number[]; ap: number; stalkers?: number }
const units = (page: import('@playwright/test').Page) => page.evaluate(() => window.__sd!.presented()!.units as unknown as U[])
const state = (page: import('@playwright/test').Page) => page.evaluate(() => ({ round: window.__sd!.state()!.round, toAct: window.__sd!.state()!.toAct, pending: window.__sd!.state()!.pending, result: window.__sd!.state()!.result }))

test('MOLT-1..4: a Molt-seat mission: the squad AI moves first, arrivals are placed by tapping ducts, contacts creep, reveal and strike', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&seed=41')
  await toBriefing(page, 'dead-reckoning', 'molt')
  // the Briefing says who you are and hides the squad's clock and difficulty
  await expect(page.locator('[data-screen="briefing"]')).toContainText('You play the Molt')
  await expect(page.getByRole('group', { name: 'Difficulty' })).toHaveCount(0)
  await sweepText(page)
  await page.getByRole('button', { name: /let them in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  expect(await page.evaluate(() => window.__sd!.ui().seat)).toBe('molt')
  // the setup carries the seat, so the save reopens on the same side
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stellar-derelict-save') ?? '{}').setup)
  expect(saved.options.seat).toBe('molt')
  await expect(page.locator('.hud')).toHaveAttribute('data-seat', 'molt')
  await expect(page.locator('.clock__phase')).toContainText('YOU ARE THE MOLT')
  await expect(page.getByTestId('timer')).toHaveCount(0)
  await expect(page.locator('[data-act="visor"]')).toHaveCount(0)

  // the Warden phase is the AI's: it ends on its own and the Molt phase opens with a pending arrival
  await page.evaluate(() => window.__sd!.idle())
  await expect.poll(() => state(page).then((s) => s.toAct)).toBe('molt')
  const s1 = await state(page)
  expect(s1.round).toBe(1)
  expect(s1.pending).not.toBeNull()
  await expect(page.locator('.hud-objective')).toContainText('tap an open duct')
  await expect(page.locator('[data-act="end-phase"]')).toBeDisabled()

  // the Molt view shows what each contact hides (E-7)
  const pings = (await units(page)).filter((u) => u.kind === 'ping')
  expect(pings.length).toBeGreaterThan(0)
  for (const p of pings) expect(typeof p.stalkers).toBe('number')
  await expect(page.locator('.trace--molt').first()).toContainText(/hides \d/)

  // place every arrival by tapping an open duct (the camera is centred on the tile first: a duct in a corner of the deck
  // can sit under the clock or the log at the opening view)
  const tap = async (x: number, y: number) => {
    await page.evaluate(([a, b]) => window.__sd!.centre(a!, b!), [x, y])
    await page.waitForTimeout(450)
    const p = await page.evaluate(([a, b]) => window.__sd!.project(a!, b!), [x, y])
    expect(p).not.toBeNull()
    expect(await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName, [p!.x, p!.y])).toBe('CANVAS')
    await page.mouse.click(p!.x, p!.y)
  }
  for (let i = 0; i < 4; i++) {
    const st = await state(page)
    if (!st.pending) break
    const legal = await page.evaluate(() => window.__sd!.legal())
    const arrive = legal.find((a) => a.type === 'arrive') as { duct: [number, number] } | undefined
    expect(arrive).toBeDefined()
    const before = (await units(page)).length
    await tap(arrive!.duct[0], arrive!.duct[1])
    await expect.poll(() => units(page).then((u) => u.length)).toBe(before + 1)
  }
  expect((await state(page)).pending).toBeNull()
  await expect(page.locator('[data-act="end-phase"]')).toBeEnabled()

  // select a contact from its card and reveal it (P-5: a contact that has spent no AP may reveal for 0 AP)
  const cards = page.locator('.trace--molt')
  const first = (await cards.nth(0).getAttribute('data-unit')) ?? ''
  await cards.nth(0).click()
  await expect.poll(() => page.evaluate(() => window.__sd!.ui().selected)).toBe(first)
  await expect(page.locator('[data-act="reveal"]')).toBeVisible()
  await expect(page.locator('[data-act="reveal"]')).toContainText(/\d stalkers? with full AP/)
  const stalkersBefore = (await units(page)).filter((u) => u.kind === 'stalker').length
  await page.locator('[data-act="reveal"]').click()
  await expect.poll(() => units(page).then((u) => u.filter((x) => x.kind === 'stalker').length)).toBeGreaterThan(stalkersBefore)
  await expect.poll(() => units(page).then((u) => u.some((x) => x.id === first))).toBe(false)
  // select another contact and creep it one square by tapping a lit square; having moved, it may no longer reveal (P-5)
  const other = (await units(page)).find((u) => u.kind === 'ping')
  expect(other).toBeDefined()
  await page.locator(`.trace--molt[data-unit="${other!.id}"]`).click()
  await expect.poll(() => page.evaluate(() => window.__sd!.ui().selected)).toBe(other!.id)
  const legal = await page.evaluate(() => window.__sd!.legal())
  const mv = legal.find((a) => a.type === 'move' && (a as { unit: string }).unit === other!.id) as { to: [number, number] } | undefined
  if (mv) {
    await tap(mv.to[0], mv.to[1])
    await expect.poll(() => units(page).then((u) => u.find((x) => x.id === other!.id)?.at)).toEqual(mv.to)
    await expect(page.locator('[data-act="reveal"]')).toHaveCount(0)
  }
  await sweepText(page)

  // end the phase: contacts with AP left are asked about once; the squad AI then plays round 2 and hands back
  await page.locator('[data-act="end-phase"]').click()
  await expect(page.getByTestId('end-confirm')).toContainText('contacts still have action points')
  await page.locator('[data-act="end-confirm"]').click()
  await page.evaluate(() => window.__sd!.idle())
  await expect.poll(() => state(page).then((s) => `${s.round}:${s.toAct}`)).toBe('2:molt')
  await expect(page.getByTestId('log')).toContainText('ROUND 02 - Warden phase')

  // KB rule 8 holds on this seat too
  expect(await page.evaluate(() => document.querySelectorAll('[title]').length + document.querySelectorAll('svg title').length)).toBe(0)
  expect(errors).toEqual([])
})

test('MOLT-5: a Molt-seat mission plays out against the squad AI and the Debrief speaks for the hull', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&seed=42')
  await toBriefing(page, 'dead-reckoning', 'molt')
  await page.getByRole('button', { name: /let them in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  // the Molt side: every pending arrival on the first open duct, then end the phase (the squad AI does the rest)
  await page.evaluate(async () => {
    const sd = window.__sd!
    for (let i = 0; i < 3000; i++) {
      await sd.idle()
      const s = sd.state()!
      if (s.result) return
      if (s.toAct !== 'molt') continue
      const legal = sd.legal()
      const arrive = legal.find((a) => a.type === 'arrive')
      if (arrive) sd.dispatch(arrive)
      else {
        // walk every stalker at a Warden, strike when adjacent, otherwise end
        const melee = legal.find((a) => a.type === 'melee')
        const reveal = legal.find((a) => a.type === 'reveal')
        sd.dispatch(melee ?? reveal ?? { type: 'endPhase' })
      }
    }
  })
  await expect(page.locator('[data-screen="debrief"]')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.debrief h2')).toHaveText(/the hull keeps its own|prey escaped/i)
  await expect(page.locator('.debrief')).toContainText('Side')
  await expect(page.locator('.debrief')).toContainText('Molt')
  await expect(page.locator('.debrief')).toContainText('Repeater fire')
  await sweepText(page)
  expect(errors).toEqual([])
})
