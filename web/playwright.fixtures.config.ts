import { defineConfig, devices } from '@playwright/test'

// T-6: the server-less demo. `vite preview` serves dist-demo/ (built with VITE_DATA=fixtures) at /demo/; no Go server runs.
const port = Number(process.env.E2E_FIXTURES_PORT ?? 5220)

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/fixtures-mode.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: './test-results-fixtures',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure', timezoneId: 'Asia/Kolkata', locale: 'en-US' },
  webServer: {
    command: `VITE_DATA=fixtures pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/demo/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
