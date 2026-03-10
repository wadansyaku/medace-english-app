import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_SMOKE_PORT || '41731');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command: `npm run build && node scripts/start-smoke-server.mjs --port ${port}`,
    url: `${baseURL}/api/session`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
