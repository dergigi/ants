import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 45_000,
  },
  use: {
    baseURL: 'http://localhost:7473',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:7473',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
