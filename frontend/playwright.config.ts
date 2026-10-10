import { defineConfig } from '@playwright/test';

/**
 * Responsive checks (tests/responsive.spec.ts) against a running demo app with the seeded logins:
 *   npm run build && DEMO_PAYMENTS=true ALLOW_DEMO_SEED=true PORT=8099 npm start   (repo root)
 *   npm run test:responsive                                                        (frontend/)
 * BASE_URL points it elsewhere (e.g. the Vite dev server). Uses the installed Chrome, so no browser download.
 */
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  workers: 2,
  reporter: [['list']],
  globalSetup: './tests/global-setup.ts',
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:8099', channel: 'chrome', headless: true },
});
