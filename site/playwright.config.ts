import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/docs',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: { command: 'pnpm preview', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})
