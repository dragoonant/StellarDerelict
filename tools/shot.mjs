import { chromium } from '@playwright/test'
const [url, out, w = '1280', h = '720'] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: (await import('node:fs')).existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 })
await p.goto(url); await p.waitForTimeout(2500)
await p.screenshot({ path: out }); await b.close()
