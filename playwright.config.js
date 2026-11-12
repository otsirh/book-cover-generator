import { defineConfig, devices } from '@playwright/test';

// BASE_URL=https://covers.otsirh.dev npm run test:e2e   checks production instead of a local build.
const BASE_URL = process.env.BASE_URL;
const CI = Boolean(process.env.CI);
// Locally, use the installed Google Chrome instead of downloading Chromium.
const chrome = CI ? {} : { channel: 'chrome' };

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL ?? 'http://127.0.0.1:41730',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...chrome }, grepInvert: /@mobile/ },
    { name: 'firefox', use: devices['Desktop Firefox'], grepInvert: /@mobile/ },
    { name: 'webkit', use: devices['Desktop Safari'], grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...chrome }, grep: /@mobile/ },
  ],
  webServer: BASE_URL
    ? undefined
    : {
        // Its own port, so a running `npm run dev` (port 4173, source tree) or another local server is never mistaken for the build.
        command: 'npm run build && node scripts/serve.js 41730 dist',
        url: 'http://127.0.0.1:41730',
        // Never reuse one: a server left on the port would serve an old build.
        reuseExistingServer: false,
      },
});
