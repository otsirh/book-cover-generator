// Regenerates public/og.png and the PNG app icons in public/icons/.
//   npm run assets
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4180;
const server = spawn(process.execPath, ['scripts/serve.js', String(PORT), '.'], { stdio: 'ignore' });
try {
  await new Promise((r) => setTimeout(r, 400));
  const browser = await chromium
    .launch({ channel: process.env.CI ? undefined : 'chrome' })
    .catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/scripts/assets.html`);
  await page.waitForFunction(() => '__assets' in window);
  const icons = /** @type {Record<string, string>} */ (await page.evaluate(() => /** @type {any} */ (window).__assets));
  for (const [name, url] of Object.entries(icons)) {
    writeFileSync(`public/icons/${name}`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`public/icons/${name}`);
  }
  await page.screenshot({ path: 'public/og.png' });
  console.log('public/og.png');
  await browser.close();
} finally {
  server.kill();
}
