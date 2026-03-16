import { defineConfig } from '@playwright/test';

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const port = Number(process.env.PLAYWRIGHT_SMOKE_PORT || '41731');
const baseURL = externalBaseURL || `http://127.0.0.1:${port}`;
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results/smoke';
const traceMode = process.env.PLAYWRIGHT_TRACE_MODE || 'retain-on-failure';
const videoMode = process.env.PLAYWRIGHT_VIDEO_MODE || 'retain-on-failure';
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

export default defineConfig({
  testDir: './tests/smoke',
  outputDir,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    headless: true,
    trace: traceMode as 'off' | 'on' | 'retain-on-failure' | 'on-first-retry',
    screenshot: 'only-on-failure',
    video: videoMode as 'off' | 'on' | 'retain-on-failure' | 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: `npm run build && node scripts/start-smoke-server.mjs --port ${port}`,
          url: `${baseURL}/api/session`,
          reuseExistingServer: false,
          timeout: 180_000,
        },
      }),
});
