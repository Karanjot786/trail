import { defineConfig, devices } from '@playwright/test'

// Plan T-1. The Go server (with the embedded dashboard build) is started by e2e/global-setup.ts.
const port = Number(process.env.E2E_PORT ?? 8120)

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/fixtures-mode.spec.ts'], // runs under playwright.fixtures.config.ts
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: './test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    storageState: 'test-results/.auth.json',
    trace: 'retain-on-failure',
    timezoneId: 'Asia/Kolkata',
    locale: 'en-US',
  },
  projects: [
    { name: 'chromium', grepInvert: /@phone/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', grepInvert: /@phone/, use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
      // Phone-only checks are tagged @phone; the desktop projects skip them (and the reverse).
      grep: /@phone/,
    },
  ],
})
