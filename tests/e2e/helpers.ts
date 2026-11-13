import { existsSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

export const SAVE_KEY = 'stellar-derelict-save'

const CONTAINER_CHROMIUM = '/opt/pw-browsers/chromium'
export const launchArgs = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
export const executablePath = existsSync(CONTAINER_CHROMIUM) ? CONTAINER_CHROMIUM : undefined

/** Console and page errors, minus the network noise of Google Fonts being unreachable in a sandbox. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

export async function toBriefing(page: Page): Promise<void> {
  await page.getByRole('button', { name: /board the halcyon drift/i }).click()
  await expect(page.locator('[data-screen="briefing"]')).toBeVisible()
}

/** Title, briefing, CUT IN; resolves once the board is up and the camera answers. */
export async function toMission(page: Page): Promise<void> {
  await toBriefing(page)
  await page.getByRole('button', { name: /cut in/i }).click()
  await page.waitForFunction(() => window.__sd?.ui().screen === 'mission' && window.__sd.camera() !== null)
  await page.waitForTimeout(400)
}

export async function sweepText(page: Page): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText)
  for (const bad of ['undefined', 'NaN', 'null', '[object']) expect(text, `page text contains ${bad}`).not.toContain(bad)
}

/** Drive the Warden side with the scripted policy until the game has a result (or the action cap). */
export async function playOut(page: Page, cap = 4000): Promise<void> {
  await page.evaluate(async (max) => {
    const sd = window.__sd!
    for (let i = 0; i < max; i++) {
      await sd.idle()
      if (sd.state()!.result) return
      const a = sd.wardenAction()
      if (!a) continue
      sd.dispatch(a)
    }
  }, cap)
}
