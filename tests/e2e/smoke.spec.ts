import { expect, test } from '@playwright/test'

test('the title opens with no console errors and no sideways scroll on a phone', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('h1')).toContainText('Stellar')
  await page.getByRole('button', { name: /board the halcyon drift/i }).click()
  await expect(page.getByRole('status')).not.toBeEmpty()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // KB rule 24: a long press never selects text.
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none')
  await page.locator('.title__note').click({ clickCount: 3 })
  expect(await page.evaluate(() => String(getSelection()))).toBe('')
  expect(errors.filter((e) => !/fonts\.g|ERR_|Failed to load resource/.test(e))).toEqual([])
})
