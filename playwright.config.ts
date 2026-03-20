import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:7473',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:7473',
    reuseExistingServer: true,
  },
});
