import { defineConfig, devices } from '@playwright/test'

const URL = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: '.',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  use: { baseURL: URL },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: { command: 'npx serve@14.2.8 dist -l tcp://127.0.0.1:4173', url: URL, reuseExistingServer: true, cwd: '../..' },
})
