import { expect, test } from '@playwright/test'
import { toMission, watchErrors } from './helpers'

type Unit = { id: string; at: number[]; facing: string; alive?: boolean; kind: string }
const unitOf = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((u) => window.__sd!.state()!.units.find((x) => x.id === u) as unknown as Unit, id)

test('VISOR-1..4: C rides the selected Warden; arrows and keys act from the visor; a drag looks without acting; Esc returns', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&seed=22')
  await toMission(page)

  // a Warden with a square ahead to step into
  let who = ''
  for (const card of await page.locator('.trace').all()) {
    await card.click()
    if ((await page.locator('[data-act="forward"]').count()) > 0) {
      who = (await card.getAttribute('data-unit')) ?? ''
      break
    }
  }
  expect(who).not.toBe('')

  await page.keyboard.press('c')
  await expect(page.getByTestId('visor')).toBeVisible()
  await expect(page.locator('[data-act="visor"]')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => window.__sd!.visor().blend)).toBe(1)
  expect((await page.evaluate(() => window.__sd!.visor())).unit).toBe(who)

  // the camera is at the Warden's visor: eye height, on its square
  const at0 = (await unitOf(page, who)).at
  const cam = await page.evaluate(() => window.__sd!.camera()!)
  expect(cam.y).toBeCloseTo(0.92, 2)
  const sq = await page.evaluate(([x, y]) => window.__sd!.project(x!, y!, 0.92), at0)
  expect(sq).not.toBeNull()
  // the comms log folds away and the heading tape reads a bearing
  await expect(page.getByTestId('log')).toBeHidden()
  await expect(page.getByTestId('visor-heading')).toHaveText(/^\d{3} (N|E|S|W)$/)

  // a drag looks around and is not a tap: nothing is acted on or deselected
  const actions0 = await page.evaluate(() => window.__sd!.ui().actions)
  await page.mouse.move(640, 300)
  await page.mouse.down()
  await page.mouse.move(520, 280, { steps: 6 })
  await page.mouse.up()
  const look = (await page.evaluate(() => window.__sd!.visor())).look
  expect(look.yaw).toBeGreaterThan(0.2)
  expect(look.pitch).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.__sd!.ui().actions)).toBe(actions0)
  expect(await page.evaluate(() => window.__sd!.ui().selected)).toBe(who)

  // the up arrow steps forward; the camera follows; the right arrow turns
  await page.keyboard.press('ArrowUp')
  await expect.poll(async () => (await unitOf(page, who)).at).not.toEqual(at0)
  const at1 = (await unitOf(page, who)).at
  await expect
    .poll(async () => {
      const c = await page.evaluate(() => window.__sd!.camera()!)
      const p = await page.evaluate(([x, y]) => window.__sd!.project(x!, y!, 0), at1)
      return Boolean(p) && Math.abs(c.y - 0.92) < 0.01
    })
    .toBe(true)
  const f0 = (await unitOf(page, who)).facing
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await unitOf(page, who)).facing).not.toBe(f0)

  // another Warden by number: the visor moves to that helmet
  const other = await page.evaluate((w) => window.__sd!.state()!.units.find((u) => u.kind === 'warden' && u.id !== w)!.id, who)
  await page.locator(`[data-unit="${other}"]`).click()
  await expect.poll(() => page.evaluate(() => window.__sd!.visor().unit)).toBe(other)

  // Esc goes back to the map; the map takes input again
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('visor')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__sd!.visor().blend)).toBe(0)
  expect((await page.evaluate(() => window.__sd!.camera()!)).y).toBeGreaterThan(3)
  await expect(page.getByTestId('log')).toBeVisible()
  expect(errors).toEqual([])
})

test('VISOR-5: with Fire armed in the visor the nearest bracket locks, shows the engine odds, and Fire again shoots it', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&seed=7&timer=999')
  await toMission(page)
  const shooter = await page.evaluate(async () => {
    const sd = window.__sd!
    for (let i = 0; i < 3000; i++) {
      await sd.idle()
      if (sd.state()!.result) return null
      if (sd.state()!.toAct === 'warden') {
        const f = sd.legal().find((a) => a.type === 'fire')
        if (f && 'unit' in f) return f.unit
      }
      const a = sd.wardenAction()
      if (a) sd.dispatch(a)
    }
    return null
  })
  expect(shooter).not.toBeNull()
  await page.locator(`[data-unit="${shooter}"]`).click()
  await page.keyboard.press('c')
  await expect.poll(() => page.evaluate(() => window.__sd!.visor().blend)).toBe(1)
  await page.keyboard.press('f')
  // the bracket itself has no box (its frame is drawn around a point); its odds label is what shows
  await expect(page.locator('.visor__target span').first()).toBeVisible()
  await expect(page.locator('.visor__target.lock')).toHaveCount(1)
  await expect(page.locator('.visor__target.lock span')).toHaveText(/^\d+% KILL$/)
  const lock = await page.evaluate(() => window.__sd!.visor().lock)
  expect(lock).not.toBeNull()
  const n = await page.evaluate(() => window.__sd!.ui().actions)
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => window.__sd!.ui().actions)).toBe(n + 1)
  // the action taken is the Fire at the locked target (the save holds the action list)
  const taken = await page.evaluate(() => JSON.parse(localStorage.getItem('stellar-derelict-save') ?? '{}').actions?.at(-1))
  expect(taken).toMatchObject({ type: 'fire', unit: shooter, target: lock })
  expect(await page.evaluate(() => window.__sd!.ui().armed)).toBeNull()
  expect(errors).toEqual([])
})

test('TOP DOWN: the button and H bring the camera back to north up, looking straight down, from the map and from the visor', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&seed=22')
  await toMission(page)
  // turned two and a bit turns round and tipped low
  await page.evaluate(() => window.__sd!.setView({ az: 2.3 + Math.PI * 4, tilt: -0.6 }))
  const before = await page.evaluate(() => window.__sd!.camera()!)
  await page.locator('[data-act="top-down"]').click()
  await expect.poll(() => page.evaluate(() => window.__sd!.camera()!.tilt)).toBeCloseTo(0.7, 2)
  const c = await page.evaluate(() => window.__sd!.camera()!)
  // north up by the nearest whole turn (no spinning), same spot and zoom, camera nearly overhead
  expect(Math.abs(c.az - Math.PI * 4)).toBeLessThan(0.01)
  expect(c.tx).toBeCloseTo(before.tx, 3)
  expect(c.tz).toBeCloseTo(before.tz, 3)
  expect(c.zoom).toBeCloseTo(before.zoom, 3)
  expect(Math.hypot(c.x - c.tx, c.z - c.tz)).toBeLessThan(c.y * 0.1)

  // from the visor: H leaves it and lands overhead above that Warden
  await page.locator('.trace').first().click()
  await page.keyboard.press('c')
  await expect.poll(() => page.evaluate(() => window.__sd!.visor().blend)).toBe(1)
  await page.evaluate(() => window.__sd!.setView({ az: 1.1 }))
  await page.keyboard.press('h')
  await expect(page.getByTestId('visor')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__sd!.visor().blend)).toBe(0)
  const v = await page.evaluate(() => window.__sd!.camera()!)
  expect(v.tilt).toBeCloseTo(0.7, 2)
  expect(Math.abs(Math.sin(v.az))).toBeLessThan(0.01)
  expect(Math.cos(v.az)).toBeGreaterThan(0.99)
  expect(errors).toEqual([])
})
