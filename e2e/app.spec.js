import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

/** @typedef {import('@playwright/test').Page} Page */

/** Fail any test that logs a console error or throws (this also catches CSP violations). */
test.beforeEach(async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  /** @type {any} */ (page).__problems = problems;
});
test.afterEach(async ({ page }, info) => {
  const problems = /** @type {any} */ (page).__problems;
  // A 404 page load is logged as a console error by some browsers; that test expects it.
  const expected = info.title.includes('404')
    ? problems.filter((/** @type {string} */ p) => !/404|Not Found/i.test(p))
    : problems;
  expect(expected).toEqual([]);
});

/** @param {Page} page @param {string} selector */
async function svgOf(page, selector) {
  const src = (await page.locator(selector).getAttribute('src')) ?? '';
  expect(src).toMatch(/^data:image\/svg\+xml/);
  return decodeURIComponent(src.slice(src.indexOf(',') + 1));
}

test('renders a cover and every gallery style', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  const tiles = page.locator('.tile');
  await expect(tiles).toHaveCount(27);
  for (const tile of await tiles.all()) {
    await tile.scrollIntoViewIfNeeded();
    await expect(tile.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  }
});

test('typing a title updates the preview, gallery and URL', async ({ page }) => {
  await page.goto('/');
  await page.locator('#title').fill('Salt and Static');
  await page.locator('#author').fill('J. R. Okafor');
  await expect.poll(() => svgOf(page, '#preview')).toContain('Salt and Static');
  await expect(page).toHaveURL(/title=Salt\+and\+Static/);
  await expect(page.locator('#preview')).toHaveAttribute('alt', /Salt and Static.*J\. R\. Okafor/);
  const tile = page.locator('.tile').first();
  await tile.scrollIntoViewIfNeeded();
  await expect.poll(() => svgOf(page, '.tile >> nth=0 >> img')).toContain('Salt and Static');
});

test('a shared link restores the design', async ({ page }) => {
  await page.goto('/#title=Shared&author=Someone&style=noir&palette=noir&seed=abc&format=square');
  await expect(page.locator('#style')).toHaveValue('noir');
  await expect(page.locator('#seed')).toHaveValue('abc');
  await expect(page.locator('[data-format="square"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-palette="noir"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await svgOf(page, '#preview')).toContain('width="600" height="600"');
});

test('an empty seed in a shared link stays "from title"', async ({ page }) => {
  await page.goto('/#title=Same+Every+Time&author=A&style=minimal&palette=auto&seed=&format=paperback');
  await expect(page.locator('#seed')).toHaveValue('');
  await expect(page.locator('#meta')).toContainText('seed from title');
});

test('a hostile format in a shared link falls back safely', async ({ page }) => {
  await page.goto('/#format=constructor&seed=x');
  await expect(page.locator('#preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(page.locator('[data-format="paperback"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a shared square link has the right shape', async ({ page }) => {
  await page.goto('/#format=square&seed=x');
  expect(await page.evaluate(() => document.documentElement.dataset.coverFormat)).toBe('square');
  // offsetWidth/Height ignore the decorative 3D tilt.
  const [w, hgt] = await page.locator('#book').evaluate((el) => [el.offsetWidth, el.offsetHeight]);
  expect(Math.abs(w - hgt)).toBeLessThanOrEqual(1);
});

test('screen readers hear style changes but not typing', async ({ page }) => {
  await page.goto('/#style=minimal&palette=mint&seed=a');
  await expect(page.locator('#preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await page.locator('#title').fill('Something else');
  await expect(page.locator('#announce')).toHaveText('');
  await page.locator('#style').selectOption('noir');
  await expect(page.locator('#announce')).toHaveText('Style: Noir. Palette: Mint.');
});

test('typing never triggers announcements, even when the palette follows the title', async ({ page }) => {
  await page.goto('/#style=minimal&palette=auto&seed=');
  await expect(page.locator('#preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await page.locator('#title').pressSequentially('A title that changes the palette', { delay: 5 });
  await expect(page.locator('#announce')).toHaveText('');
});

test('editing the URL hash updates the design', async ({ page }) => {
  await page.goto('/#style=swiss&seed=one');
  await expect(page.locator('#style')).toHaveValue('swiss');
  await page.evaluate(() => {
    location.hash = 'style=orbit&seed=two';
  });
  await expect(page.locator('#style')).toHaveValue('orbit');
  await expect(page.locator('#seed')).toHaveValue('two');
});

test('style, palette, seed and randomize controls', async ({ page }) => {
  await page.goto('/#style=minimal&seed=s1&palette=auto');
  await page.locator('#style').selectOption('retro');
  await expect(page.locator('.tile[data-style="retro"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-palette="mint"]').click();
  await expect(page.locator('#meta')).toContainText('Mint');
  await page.locator('#dice-seed').click();
  await expect(page.locator('#seed')).not.toHaveValue('s1');
  const tile = page.locator('.tile[data-style="mosaic"]');
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await expect(page.locator('#style')).toHaveValue('mosaic');
  const before = await page.locator('#seed').inputValue();
  await page.locator('#randomize').click();
  await expect(page.locator('#seed')).not.toHaveValue(before);
});

test('the R shortcut randomizes, but not while typing', async ({ page }) => {
  await page.goto('/#seed=fixed');
  await page.locator('#title').focus();
  await page.keyboard.press('r');
  await expect(page.locator('#seed')).toHaveValue('fixed');
  await page.locator('#title').blur();
  await page.locator('body').press('r');
  await expect(page.locator('#seed')).not.toHaveValue('fixed');
});

/** @param {Buffer} buf */
function pngSize(buf) {
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

/** @param {Buffer} buf  Width and height from the first JPEG start-of-frame marker. */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}

test('downloads SVG, PNG and JPEG at the chosen size', async ({ page }) => {
  await page.goto('/#title=Export+Test&author=Probe&style=aurora&palette=blush&seed=e1&format=paperback');
  await page.locator('#scale').selectOption('2');

  const grab = async (/** @type {string} */ button) => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
    return { name: download.suggestedFilename(), data: await readFile(/** @type {string} */ (await download.path())) };
  };

  const s = await grab('#dl-svg');
  expect(s.name).toBe('export-test-aurora.svg');
  expect(s.data.toString('utf8')).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="900"/);

  const png = await grab('#dl-png');
  expect(png.name).toBe('export-test-aurora.png');
  expect(png.data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(pngSize(png.data)).toEqual([1200, 1800]);
  await expect(page.locator('#toast')).toContainText('1200 × 1800');

  const jpg = await grab('#dl-jpeg');
  expect(jpg.name).toBe('export-test-aurora.jpg');
  expect(jpg.data.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  expect(jpegSize(jpg.data)).toEqual([1200, 1800]);
});

test('copies the SVG to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium lets tests read the clipboard');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#title=Clipboard&style=minimal&seed=c1');
  await page.locator('#copy-svg').click();
  await expect(page.locator('#toast')).toContainText('copied');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toMatch(/^<svg[\s\S]*Clipboard[\s\S]*<\/svg>$/);
});

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await page.locator('.tile').first().scrollIntoViewIfNeeded();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('serves security headers', async ({ request }) => {
  const res = await request.get('/');
  const headers = res.headers();
  expect(headers['content-security-policy']).toContain("default-src 'none'");
  expect(headers['content-security-policy']).toContain("require-trusted-types-for 'script'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['strict-transport-security']).toContain('max-age=');
  const lib = await request.get('/src/index.js');
  expect(lib.headers()['access-control-allow-origin']).toBe('*');
  expect(lib.headers()['cross-origin-resource-policy']).toBe('cross-origin');
});

test('unknown pages get the 404 page', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('shelf');
  await page.locator('a.primary').click();
  await expect(page.locator('#preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);
});

test('long values in a shared link are clipped and never overflow @mobile', async ({ page }) => {
  await page.goto(`/#seed=${'x'.repeat(300)}&title=${'T'.repeat(500)}`);
  await expect(page.locator('#seed')).toHaveValue('x'.repeat(40));
  await expect(page.locator('#title')).toHaveValue('T'.repeat(200));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('fits a phone screen without sideways scrolling @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('#preview')).toBeInViewport();
});
