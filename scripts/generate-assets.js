// Regenerates public/og.png, the PNG app icons in public/icons/ and docs/preview.png.
//   npm run assets
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4180;
const PAGE = `http://127.0.0.1:${PORT}/scripts/assets.html`;

/** @param {string} url */
async function waitForServer(url, timeout = 10_000) {
  const until = Date.now() + timeout;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > until) throw new Error(`The dev server did not start: ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** @param {import('@playwright/test').Browser} browser */
async function render(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(PAGE);
  await page.waitForFunction(() => '__assets' in window);
  const icons = /** @type {Record<string, string>} */ (await page.evaluate(() => /** @type {any} */ (window).__assets));
  for (const [name, url] of Object.entries(icons)) {
    writeFileSync(`public/icons/${name}`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`public/icons/${name}`);
  }
  await page.screenshot({ path: 'public/og.png' });
  console.log('public/og.png');

  const montage = await browser.newPage({ viewport: { width: 1400, height: 700 }, deviceScaleFactor: 1 });
  await montage.goto(`http://127.0.0.1:${PORT}/scripts/preview.html`);
  await montage.waitForFunction(() => '__ready' in window);
  await montage.screenshot({ path: 'docs/preview.png', fullPage: true });
  console.log('docs/preview.png');
}

const server = spawn(process.execPath, ['scripts/serve.js', String(PORT), '.'], { stdio: 'ignore' });
try {
  await waitForServer(PAGE);
  const browser = await chromium
    .launch({ channel: process.env.CI ? undefined : 'chrome' })
    .catch(() => chromium.launch());
  try {
    await render(browser);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
