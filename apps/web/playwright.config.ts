import { defineConfig, devices } from '@playwright/test';

// Runs against a production build, not the dev server: the whole point is
// catching what a real visitor gets, and dev serves unbundled ES modules
// (no lazy-chunk splitting, no minification) that behave differently enough
// to hide the thing being checked for. `npm run check` builds first, so this
// only reuses that dist/ locally; `webServer` rebuilds itself if it's stale
// or missing (e.g. `npm run test:e2e` on its own).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Points at whatever Chromium build is actually on disk rather than
        // the revision this @playwright/test version would otherwise try to
        // download on its own — see the repo's dev environment notes.
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
      },
    },
  ],
});
