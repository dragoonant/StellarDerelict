// Screenshots for the M3 check-in: node tools/shoot-m3.mjs [outDir]. Builds nothing: run `npm run build` first.
// Starts `vite preview` itself on PW_PORT (default 5347) and stops it again.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'tools/out'
mkdirSync(out, { recursive: true })
const port = Number(process.env.PW_PORT ?? 5347)
const url = `http://localhost:${port}/`
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
const stop = () => srv.kill()
process.on('exit', stop)
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(url)).ok) break } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250))
}
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath: exe, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

async function playTo(page, wantRound) {
  // a few real Warden-policy turns, so pings, seen corridors and a selected Warden are on screen
  for (let guard = 0; guard < 400; guard++) {
    await page.evaluate(() => window.__sd.idle())
    const s = await page.evaluate(() => ({ r: window.__sd.state().round, w: window.__sd.state().toAct, res: window.__sd.state().result }))
    if (s.res || s.r >= wantRound) return
    await page.evaluate(() => { const a = window.__sd.wardenAction(); if (a) window.__sd.dispatch(a) })
  }
}

try {
  const desk = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  await desk.goto(`${url}?speed=instant&seed=7`)
  await desk.waitForTimeout(1500)
  await desk.screenshot({ path: `${out}/m3-title.png` })
  await desk.getByRole('button', { name: /board the halcyon/i }).click()
  await desk.waitForTimeout(1500)
  await desk.screenshot({ path: `${out}/m3-briefing.png` })
  await desk.getByRole('button', { name: /cut in/i }).click()
  await desk.waitForFunction(() => window.__sd?.ui().screen === 'mission')
  await desk.waitForTimeout(1500)
  await playTo(desk, 3)
  await desk.locator('.trace').first().click()
  await desk.waitForTimeout(400)
  await desk.waitForTimeout(2500)
  await desk.screenshot({ path: `${out}/m3-mission.png` })
  // the whole deck from above
  await desk.evaluate(() => window.__sd.setView({ x: 0, z: 0, zoom: 0.0 }))
  await desk.waitForTimeout(1200)
  await desk.screenshot({ path: `${out}/m3-mission-wide.png` })
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await ph.goto(`${url}?speed=instant&seed=7`)
  await ph.getByRole('button', { name: /board the halcyon/i }).click()
  await ph.getByRole('button', { name: /cut in/i }).click()
  await ph.waitForFunction(() => window.__sd?.ui().screen === 'mission')
  await ph.waitForTimeout(1500)
  await playTo(ph, 3)
  await ph.locator('.trace').nth(1).tap()
  await ph.waitForTimeout(400)
  await ph.waitForTimeout(2500)
  await ph.screenshot({ path: `${out}/m3-mission-phone.png` })
  // a finished mission for the debrief
  const deb = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  await deb.goto(`${url}?speed=instant&seed=4&bot=random`)
  await deb.getByRole('button', { name: /board the halcyon/i }).click()
  await deb.getByRole('button', { name: /cut in/i }).click()
  await deb.waitForFunction(() => window.__sd?.ui().screen === 'mission')
  await playTo(deb, 99)
  await deb.waitForFunction(() => window.__sd.ui().screen === 'debrief', null, { timeout: 60000 })
  await deb.waitForTimeout(500)
  await deb.screenshot({ path: `${out}/m3-debrief.png` })
} finally {
  await browser.close()
  stop()
}
