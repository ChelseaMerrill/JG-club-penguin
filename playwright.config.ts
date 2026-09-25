import { defineConfig, devices } from '@playwright/test';

// e2e/deployed-auth.spec.ts runs against a deployed URL and must not boot a
// local server for that run (it also test.skip()s itself without this var).
const deployUrl = process.env.DEPLOY_URL;

const SHARED_TEST_USER_SPECS = [
  '**/presence-two-browsers.spec.ts',
  '**/chat-two-browsers.spec.ts',
  '**/movement-sync.spec.ts',
  '**/snowball-hit.spec.ts',
];

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'playwright-output',
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: deployUrl ?? 'http://localhost:4173',
  },
  // The specs that sign in the shared test users A/B (#43): run concurrently,
  // they'd race each other's Presence roster and Room state, so they get
  // their own single-worker project instead of `chromium`'s parallel workers.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: SHARED_TEST_USER_SPECS,
    },
    {
      name: 'realtime-shared-users',
      use: { ...devices['Desktop Chrome'] },
      testMatch: SHARED_TEST_USER_SPECS,
      workers: 1,
    },
  ],
  webServer: deployUrl
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        env: { VITE_E2E_HOOKS: 'true' },
        url: 'http://localhost:4173',
        // Always build fresh so the smoke never tests a stale dist/.
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
