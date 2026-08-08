import { defineConfig, devices } from '@playwright/test';

/** Smoke E2E contra staging o contra el stack local (docs/02 §7). */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command: 'pnpm --dir ../.. dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
