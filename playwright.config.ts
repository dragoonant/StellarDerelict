import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// PW_PORT lets a run avoid a port another project or worktree already holds.
const PORT = Number(process.env.PW_PORT ?? 5347)
const BASE_URL = `http://localhost:${PORT}/`

// Cloud containers ship Chromium here; CI installs its own.
const CONTAINER_CHROMIUM = '/opt/pw-browsers/chromium'
const executablePath = existsSync(CONTAINER_CHROMIUM) ? CONTAINER_CHROMIUM : undefined

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  // The board renders in software GL under headless Chromium, so run one test at a time.
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: 'list',
  use: { baseURL: BASE_URL, trace: 'off' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
          ...(executablePath ? { executablePath } : {}),
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
