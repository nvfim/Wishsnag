import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests load the real unpacked extension (dist-e2e, built with `npm run build:e2e`,
 * which only adds host access to the local fixture server) into Chromium.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { trace: 'off', viewport: { width: 1280, height: 860 } },
});
