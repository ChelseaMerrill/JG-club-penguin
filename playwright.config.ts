import { defineConfig, devices } from '@playwright/test';

// e2e/deployed-auth.spec.ts runs against a deployed URL and must not boot a
// local server for that run (it also test.skip()s itself without this var).
const deployUrl = process.env.DEPLOY_URL;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'playwright-output',
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: deployUrl ?? 'http://localhost:4173',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: deployUrl
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        // Always build fresh so the smoke never tests a stale dist/.
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
