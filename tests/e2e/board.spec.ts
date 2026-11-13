import { expect, test } from '@playwright/test'
import { toMission, watchErrors } from './helpers'

test('KB rule 25: a tap on the tile behind a standing figure reaches that tile; a tap on a Warden tile selects it', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?speed=instant&seed=22')
  await toMission(page)
  // look east along the airlock row, so the square ahead of Brandt (4,14) is drawn behind her figure
  await page.evaluate(() => window.__sd!.setView({ az: -Math.PI / 2, zoom: 0.4 }))
  await page.waitForTimeout(600)
  const g = await page.evaluate(() => {
    const sd = window.__sd!
    return { base: sd.project(3, 14, 0)!, top: sd.project(3, 14, 1.0)!, target: sd.project(4, 14, 0)! }
  })
  // the tile centre lies on the screen span of the figure: the figure is drawn over it
  expect(Math.abs(g.target.x - g.base.x)).toBeLessThan(14)
  expect(g.target.y).toBeLessThan(g.base.y)
  expect(g.target.y).toBeGreaterThan(g.top.y)
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName, [g.target.x, g.target.y])).toBe('CANVAS')
  // a tap on the Warden's own tile selects her
  await page.mouse.click(g.base.x, g.base.y)
  await expect.poll(() => page.evaluate(() => window.__sd!.ui().selected)).toBe('brandt')
  // a tap on the tile behind her performs that tile's action (a move)
  await page.mouse.click(g.target.x, g.target.y)
  await expect
    .poll(() => page.evaluate(() => (window.__sd!.state()!.units.find((u) => u.id === 'brandt') as { at: number[] }).at))
    .toEqual([4, 14])
  // a tap on a Warden tile behind another figure selects that Warden (Okafor at 3,13 lies behind Brandt from the south)
  await page.evaluate(() => window.__sd!.setView({ az: 0, zoom: 0.4 }))
  await page.waitForTimeout(600)
  const ok = await page.evaluate(() => window.__sd!.project(3, 13, 0)!)
  await page.mouse.click(ok.x, ok.y)
  await expect.poll(() => page.evaluate(() => window.__sd!.ui().selected)).toBe('okafor')
  expect(errors).toEqual([])
})

test('mouse: left drag pans on a fresh profile, middle drag pans, then the left button only picks, right drag rotates', async ({ page }) => {
  await page.goto('./?speed=instant&seed=23')
  await toMission(page)
  const cam = () => page.evaluate(() => window.__sd!.camera()!)
  const drag = async (button: 'left' | 'middle' | 'right', dx: number, dy: number) => {
    await page.mouse.move(640, 330)
    await page.mouse.down({ button })
    for (let i = 1; i <= 8; i++) await page.mouse.move(640 + (dx * i) / 8, 330 + (dy * i) / 8)
    await page.mouse.up({ button })
    // let the release inertia and the eased moves finish (software GL runs a few frames a second)
    let last = await cam()
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(350)
      const c = await cam()
      const moved = Math.hypot(c.tx - last.tx, c.tz - last.tz) + Math.abs(c.az - last.az) + Math.abs(c.zoom - last.zoom)
      last = c
      if (moved < 0.0005) break
    }
  }
  let a = await cam()
  await drag('left', 120, 0)
  let b = await cam()
  expect(Math.hypot(b.tx - a.tx, b.tz - a.tz)).toBeGreaterThan(0.2)
  a = b
  await drag('middle', -120, 0)
  b = await cam()
  expect(Math.hypot(b.tx - a.tx, b.tz - a.tz)).toBeGreaterThan(0.2)
  expect(await page.evaluate(() => localStorage.getItem('stellar-derelict-mouse'))).toBe('1')
  a = b
  await drag('left', 120, 60)
  b = await cam()
  expect(Math.hypot(b.tx - a.tx, b.tz - a.tz)).toBeLessThan(0.01)
  a = b
  await drag('right', 150, 0)
  b = await cam()
  expect(Math.abs(b.az - a.az)).toBeGreaterThan(0.2)
  // the wheel zooms toward the cursor
  a = b
  await page.mouse.move(640, 330)
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(900)
  for (let i = 0; i < 40; i++) {
    const c = await cam()
    await page.waitForTimeout(350)
    if (Math.abs((await cam()).zoom - c.zoom) < 0.0005) break
  }
  b = await cam()
  expect(b.zoom).toBeGreaterThan(a.zoom)
})

test('KB rule 24 at 390x844: no text selection, no sideways scroll on title, briefing and mission', async ({ page }) => {
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./?speed=instant&seed=24')
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth)
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none')
  expect(await fits()).toBe(true)
  await page.getByRole('button', { name: /board the halcyon drift/i }).click()
  expect(await fits()).toBe(true)
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  await page.waitForTimeout(600)
  expect(await fits()).toBe(true)
  await page.locator('.clock__round').click({ clickCount: 3 })
  expect(await page.evaluate(() => String(getSelection()))).toBe('')
  await page.locator('.hud-objective').click({ clickCount: 3 })
  expect(await page.evaluate(() => String(getSelection()))).toBe('')
  // the comms log is a bottom sheet behind a button on a phone
  await expect(page.locator('.log:not(.log--sheet)')).toBeHidden()
  await page.locator('[data-act="comms"]').click()
  await expect(page.locator('.log--sheet')).toBeVisible()
  expect(await fits()).toBe(true)
  expect(errors).toEqual([])
})
