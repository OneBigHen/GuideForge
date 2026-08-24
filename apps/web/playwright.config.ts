import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The scene suite opens WebGL contexts; keep browser workers within the
  // renderer budget so actionability checks remain deterministic.
  workers: process.env.CI ? 1 : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ipad',
      use: { ...devices['iPad Pro 11'] },
    },
    {
      name: 'iphone',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter @guideforge/web build && pnpm --filter @guideforge/web preview',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
