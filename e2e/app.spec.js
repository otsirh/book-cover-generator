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
  const problems = /** @type {string[]} */ (/** @type {any} */ (page).__problems);
  // A 404 page load is logged as a console error by some browsers; that test expects it.
  const expected = info.title.includes('404') ? problems.filter((p) => !/404|Not Found/i.test(p)) : problems;
  expect(expected).toEqual([]);
});

/**
 * The SVG an <img> shows, or '' while it has none yet. For expect.poll, which retries until it has one.
 * @param {Page} page @param {string} selector
 */
async function svgSoon(page, selector) {
  const src = (await page.locator(selector).getAttribute('src')) ?? '';
  return src.startsWith('data:image/svg+xml') ? decodeURIComponent(src.slice(src.indexOf(',') + 1)) : '';
}

/**
 * The SVG an <img> shows; fails if it shows none, so checks for what is absent can't pass vacuously.
 * @param {Page} page @param {string} selector
 */
async function svgOf(page, selector) {
  await expect(page.locator(selector)).toHaveAttribute('src', /^data:image\/svg\+xml/);
  return svgSoon(page, selector);
}

/** @param {Page} page */
const ready = (page) => expect(page.locator('#preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);

/** @param {Page} page @param {string} style */
const selected = (page, style) =>
  expect(page.locator(`.tile[data-style="${style}"]`)).toHaveAttribute('aria-pressed', 'true');

test('renders a cover and every style in the rail', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const tiles = page.locator('.tile');
  await expect(tiles).toHaveCount(34);
  for (const tile of await tiles.all()) {
    await tile.scrollIntoViewIfNeeded();
    await expect(tile.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  }
});

test('typing updates the preview, the rail and the URL', async ({ page }) => {
  await page.goto('/#style=minimal&seed=a');
  await page.locator('#title').fill('Salt and Static');
  await page.locator('#author').fill('J. R. Okafor');
  await page.locator('#subtitle').fill('Stories');
  await expect.poll(() => svgSoon(page, '#preview')).toContain('Salt and Static: Stories by J. R. Okafor');
  await expect(page).toHaveURL(/title=Salt\+and\+Static.*subtitle=Stories/);
  await expect(page.locator('#preview')).toHaveAttribute('alt', /Salt and Static.*J\. R\. Okafor/);
  const tile = page.locator('.tile[data-style="swiss"]');
  await tile.scrollIntoViewIfNeeded();
  // Thumbnails render lazily once visible; wait for it, then for the new title.
  await expect(tile.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect.poll(() => svgSoon(page, '.tile[data-style="swiss"] img')).toContain('Salt and Static');
});

test('a shared link restores the design', async ({ page }) => {
  await page.goto(
    '/#title=Shared&author=Someone&subtitle=A+Novel&style=noir&palette=noir&seed=abc&format=square&texture=1',
  );
  await selected(page, 'noir');
  await expect(page.locator('#style-name')).toHaveText('Noir');
  await expect(page.locator('#seed')).toHaveValue('abc');
  await expect(page.locator('#subtitle')).toHaveValue('A Novel');
  await expect(page.locator('#texture')).toBeChecked();
  await expect(page.locator('[data-format="square"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-palette="noir"]')).toHaveAttribute('aria-pressed', 'true');
  const svg = await svgOf(page, '#preview');
  expect(svg).toContain('width="600" height="600"');
  expect(svg).toContain('feTurbulence');
});

test('an empty variation in a shared link stays "from the title"', async ({ page }) => {
  await page.goto('/#title=Same+Every+Time&author=A&style=minimal&palette=auto&seed=&format=paperback');
  await expect(page.locator('#seed')).toHaveValue('');
  await expect(page.locator('#meta')).toContainText('variation from the title');
});

test('a hostile format in a shared link falls back safely', async ({ page }) => {
  await page.goto('/#format=constructor&seed=x');
  await ready(page);
  await expect(page.locator('[data-format="paperback"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a shared square link has the right shape', async ({ page }) => {
  await page.goto('/#format=square&seed=x');
  expect(await page.evaluate(() => document.documentElement.dataset.coverFormat)).toBe('square');
  // offsetWidth/Height ignore the decorative 3D tilt.
  const [w, hgt] = await page
    .locator('#book')
    .evaluate((el) => [/** @type {HTMLElement} */ (el).offsetWidth, /** @type {HTMLElement} */ (el).offsetHeight]);
  expect(Math.abs(w - hgt)).toBeLessThanOrEqual(1);
});

test('editing the URL updates the design', async ({ page }) => {
  await page.goto('/#style=swiss&seed=one');
  await selected(page, 'swiss');
  await page.evaluate(() => {
    location.hash = 'style=orbit&seed=two';
  });
  await selected(page, 'orbit');
  await expect(page.locator('#seed')).toHaveValue('two');
});

test('undo, redo and the browser back button step through designs', async ({ page }) => {
  await page.goto('/#style=minimal&seed=s1&palette=auto');
  await expect(page.locator('#undo')).toBeDisabled();
  await page.locator('.tile[data-style="retro"]').click();
  await selected(page, 'retro');
  await page.locator('[data-palette="mint"]').click();
  await expect(page.locator('#meta')).toContainText('Mint');
  await page.locator('#undo').click();
  await expect(page.locator('#meta')).not.toContainText('Mint');
  await selected(page, 'retro');
  await page.locator('#undo').click();
  await selected(page, 'minimal');
  await expect(page.locator('#undo')).toBeDisabled();
  await page.locator('#redo').click();
  await selected(page, 'retro');
  await page.locator('body').press('Shift+KeyZ');
  await expect(page.locator('#meta')).toContainText('Mint');
  await page.locator('body').press('KeyZ');
  await expect(page.locator('#meta')).not.toContainText('Mint');
  await page.goBack();
  await selected(page, 'minimal');
});

test('undo reverts the subtitle and the texture too', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=u');
  await page.locator('label.switch').click();
  await expect(page.locator('#texture')).toBeChecked();
  await page.locator('#undo').click();
  await expect(page.locator('#texture')).not.toBeChecked();
  expect(await svgOf(page, '#preview')).not.toContain('feTurbulence');
  await page.locator('#subtitle').fill('Gone Soon');
  await expect.poll(() => svgSoon(page, '#preview')).toContain('Gone Soon');
  await page.locator('#subtitle').blur();
  await page.locator('#undo').click();
  await expect(page.locator('#subtitle')).toHaveValue('');
});

test('history survives a reload, and redo never leaves the app', async ({ page }) => {
  await page.goto('/#style=minimal&seed=r');
  await page.locator('.tile[data-style="swiss"]').click();
  await page.locator('.tile[data-style="bauhaus"]').click();
  await page.reload();
  await selected(page, 'bauhaus');
  await expect(page.locator('#undo')).toBeEnabled();
  await page.locator('#undo').click();
  await selected(page, 'swiss');
  await expect(page.locator('#redo')).toBeEnabled();
  await page.locator('#redo').click();
  await selected(page, 'bauhaus');
  await expect(page.locator('#redo')).toBeDisabled();
  await page.locator('body').press('Shift+KeyZ');
  await page.locator('body').press('KeyY');
  await selected(page, 'bauhaus');
  expect(new URL(page.url()).pathname).toBe('/');
});

test('a burst of typing is one undo step', async ({ page }) => {
  await page.goto('/#title=Before&style=minimal&seed=t');
  await page.locator('#title').fill('');
  await page.locator('#title').pressSequentially('After', { delay: 20 });
  await expect.poll(() => svgSoon(page, '#preview')).toContain('After');
  await page.locator('#undo').click();
  await expect(page.locator('#title')).toHaveValue('Before');
});

test('a click right after typing keeps both as separate undo steps', async ({ page }) => {
  await page.goto('/#title=Before&style=minimal&seed=t');
  await page.locator('#title').fill('');
  await page.locator('#title').pressSequentially('After', { delay: 10 });
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await page.locator('#undo').click();
  await selected(page, 'minimal');
  await expect(page.locator('#title')).toHaveValue('After');
  await page.locator('#undo').click();
  await expect(page.locator('#title')).toHaveValue('Before');
  await page.locator('#redo').click();
  await expect(page.locator('#title')).toHaveValue('After');
});

test('clicking the current choice adds no undo step', async ({ page }) => {
  await page.goto('/#style=minimal&palette=mint&seed=n');
  await page.locator('.tile[data-style="retro"]').click();
  await page.locator('.tile[data-style="retro"]').click();
  await page.locator('[data-palette="mint"]').click();
  await page.locator('#undo').click();
  await selected(page, 'minimal');
});

test('a partial share link opens the same cover every time', async ({ page }) => {
  await page.goto('/#title=Dune&style=minimal');
  await expect(page.locator('#author')).toHaveValue('');
  await expect(page.locator('#seed')).toHaveValue('');
  const first = await svgOf(page, '#preview');
  await page.goto('about:blank');
  await page.goto('/#title=Dune');
  const style = await page.locator('.tile[aria-pressed="true"]').getAttribute('data-style');
  await page.goto('about:blank');
  await page.goto('/#title=Dune');
  await expect(page.locator('.tile[aria-pressed="true"]')).toHaveAttribute('data-style', style ?? '');
  // A fresh load, not a fragment change on the page already open.
  await page.goto('about:blank');
  await page.goto('/#title=Dune&style=minimal');
  expect(await svgOf(page, '#preview')).toBe(first);
});

test('locks keep the style and palette when randomizing', async ({ page }) => {
  await page.goto('/#style=bauhaus&palette=riso&seed=fixed');
  await page.locator('#lock-style').click();
  await page.locator('#lock-palette').click();
  await expect(page.locator('#lock-style')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#randomize').click();
  await expect(page.locator('#seed')).not.toHaveValue('fixed');
  await selected(page, 'bauhaus');
  await expect(page.locator('[data-palette="riso"]')).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard shortcuts: R, arrows and brackets, but not while typing', async ({ page }) => {
  await page.goto('/#style=minimal&palette=parchment&seed=fixed');
  await page.locator('#title').focus();
  await page.keyboard.press('KeyR');
  await expect(page.locator('#seed')).toHaveValue('fixed');
  await page.locator('#title').blur();
  await page.locator('body').press('ArrowRight');
  await expect(page.locator('#style-name')).not.toHaveText('Minimal');
  await page.locator('body').press('ArrowLeft');
  await expect(page.locator('#style-name')).toHaveText('Minimal');
  await page.locator('body').press('BracketRight');
  await expect(page.locator('[data-palette="parchment"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('body').press('KeyR');
  await expect(page.locator('#seed')).not.toHaveValue('fixed');
});

test('shortcuts follow the printed key, on any keyboard layout', async ({ page }) => {
  await page.goto('/#style=minimal&seed=k');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  // AZERTY: the key printed "z" sits where QWERTY has "w".
  await page.evaluate(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyW', bubbles: true })),
  );
  await selected(page, 'minimal');
  // Russian layout: "к" on the R key falls back to the key position.
  await page.evaluate(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'к', code: 'KeyR', bubbles: true })),
  );
  await expect(page.locator('#seed')).not.toHaveValue('k');
});

test('arrow keys scroll a focused code sample instead of changing the style', async ({ page }) => {
  await page.goto('/#style=minimal&seed=a');
  await page.locator('pre').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#style-name')).toHaveText('Minimal');
});

test('a fragment that is not a design keeps the design, and Undo skips its entry', async ({ page }) => {
  await page.goto('/#title=T&subtitle=A+Novel&style=minimal&seed=s&texture=1');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await page.evaluate(() => {
    location.hash = 'usage';
  });
  await expect(page).toHaveURL(/subtitle=A\+Novel.*style=swiss.*texture=1/);
  await expect(page.locator('#subtitle')).toHaveValue('A Novel');
  await expect(page.locator('#texture')).toBeChecked();
  await page.locator('.tile[data-style="bauhaus"]').click();
  await page.locator('#undo').click();
  await selected(page, 'swiss');
  // The entry left by #usage shows the same design, so this one press goes back to Minimal.
  await page.locator('#undo').click();
  await selected(page, 'minimal');
  await page.locator('#redo').click();
  await selected(page, 'swiss');
  await page.locator('#redo').click();
  await selected(page, 'bauhaus');
});

test('a quick double Undo steps twice and never leaves the app', async ({ page }) => {
  await page.goto('about:blank');
  await page.goto('/#title=T&style=minimal&seed=d');
  await page.locator('.tile[data-style="swiss"]').click();
  await page.locator('.tile[data-style="bauhaus"]').click();
  await page.locator('#undo').dblclick();
  await selected(page, 'minimal');
  // At the first entry: a double click must not go back to the page before.
  await page.locator('.tile[data-style="swiss"]').click();
  await page.locator('#undo').dblclick();
  await selected(page, 'minimal');
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe('/');
  await selected(page, 'minimal');
});

test('Undo never scrolls the page to where it was when that design was made', async ({ page }) => {
  await page.goto('/#style=minimal&palette=mint&seed=s');
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.locator('body').press('BracketRight');
  await expect(page.locator('[data-palette="mint"]')).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('body').press('KeyZ');
  await expect(page.locator('[data-palette="mint"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('opening a section link in a new tab scrolls to that section', async ({ page }) => {
  await page.goto('/#usage');
  await expect(page.locator('#usage')).toBeInViewport();
  await expect(page).toHaveURL(/title=/);
});

test('shortcuts work while the texture switch has focus', async ({ page }) => {
  await page.goto('/#style=minimal&seed=t');
  await page.locator('#texture').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#style-name')).not.toHaveText('Minimal');
});

test('modifier clicks on section links are left to the browser', async ({ page }) => {
  await page.goto('/#style=minimal&seed=m');
  const prevented = await page.evaluate(() => {
    const link = /** @type {HTMLElement} */ (document.querySelector('header a[href="#usage"]'));
    /** @type {boolean[]} */
    const seen = [];
    const record = (/** @type {Event} */ e) => {
      seen.push(e.defaultPrevented);
      e.preventDefault();
    };
    window.addEventListener('click', record);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    window.removeEventListener('click', record);
    return seen;
  });
  expect(prevented).toEqual([false, false, true]);
});

test('the rail renders a few tiles ahead of its scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('/#style=minimal&seed=r');
  const below = await page.evaluate(() => {
    const rail = /** @type {HTMLElement} */ (document.getElementById('styles'));
    const bottom = rail.getBoundingClientRect().bottom;
    const tile = [...document.querySelectorAll('.tile')].find((t) => t.getBoundingClientRect().top > bottom);
    return tile ? /** @type {HTMLElement} */ (tile).dataset.style : null;
  });
  expect(below).toBeTruthy();
  await expect(page.locator(`.tile[data-style="${below}"] img`)).toHaveAttribute('src', /^data:image\/svg\+xml/);
});

test('the Variation field follows Back even while it has focus', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=xyz');
  const seed = page.locator('#seed');
  await seed.fill('abc');
  await expect(page).toHaveURL(/seed=abc/);
  await page.goBack();
  await expect(page).toHaveURL(/seed=xyz/);
  await expect(seed).toBeFocused();
  await expect(seed).toHaveValue('xyz');
  // A trailing space while typing stays in the field.
  await seed.pressSequentially(' ');
  await expect(seed).toHaveValue('xyz ');
});

test("the browser's back shortcuts and mouse button save the last keystrokes first", async ({ page }) => {
  await page.goto('/#title=Before&style=minimal&seed=t');
  const title = page.locator('#title');
  /** @type {[string, () => Promise<void>][]} */
  const triggers = [
    [
      'Alt+←',
      () =>
        title.evaluate((el) =>
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })),
        ),
    ],
    [
      'mouse back',
      () =>
        page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 3, bubbles: true }))),
    ],
  ];
  for (const [name, trigger] of triggers) {
    await title.fill('');
    await title.pressSequentially(name === 'Alt+←' ? 'Hello' : 'World');
    await trigger();
    await page.goBack();
    await page.goForward();
    await expect(title, name).toHaveValue(name === 'Alt+←' ? 'Hello' : 'World');
  }
});

test('coming back from another page and reloading never enables a stale Redo', async ({ page }) => {
  await page.goto('/#style=minimal&seed=m');
  await page.locator('.tile[data-style="swiss"]').click();
  await page.locator('.tile[data-style="bauhaus"]').click();
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  await selected(page, 'minimal');
  await page.goto('about:blank');
  await page.goBack();
  await selected(page, 'minimal');
  await page.reload();
  await selected(page, 'minimal');
  await expect(page.locator('#redo')).toBeDisabled();
});

test('a hand-edited URL is rewritten to hold the whole design', async ({ page }) => {
  await page.goto('/#title=Neon+Tide&author=Kai&style=retro&palette=synth&seed=one&format=ebook');
  await page.evaluate(() => {
    location.hash = 'style=orbit&seed=two';
  });
  await selected(page, 'orbit');
  await expect(page).toHaveURL(/title=Neon\+Tide.*palette=synth.*seed=two.*format=ebook/);
});

test('the rail says when every style picks its own palette', async ({ page }) => {
  await page.goto('/#style=minimal&palette=auto&seed=a');
  await expect(page.locator('#rail-note')).toContainText('palette picked for it');
  await page.locator('[data-palette="mint"]').click();
  await expect(page.locator('#rail-note')).toContainText('In Mint');
});

test('a kept design from another version keeps its look and can be removed', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      const old = [
        { title: 'Old', author: 'A', style: 'retired-style', palette: 'mint', seed: 'k', format: 'paperback' },
      ];
      localStorage.setItem('book-cover-generator:kept', JSON.stringify(old));
    }
  });
  await page.goto('/#title=Now&style=minimal&seed=n');
  await expect(page.locator('#kept-list li')).toHaveCount(1);
  const before = await svgOf(page, '.kept-open img');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await page.locator('#title').fill('Changed');
  await page.locator('#title').blur();
  await page.reload();
  expect(await svgOf(page, '.kept-open img')).toBe(before);
  await page.locator('.kept-remove').click();
  await expect(page.locator('#kept')).toBeHidden();
});

test('kept designs are saved, restored and removed', async ({ page }) => {
  await page.goto('/#title=Keeper&style=artdeco&palette=midnight&seed=k');
  await expect(page.locator('#kept')).toBeHidden();
  await page.locator('#keep').click();
  await expect(page.locator('#kept-list li')).toHaveCount(1);
  const thumb = await svgOf(page, '.kept-open img');
  expect(thumb).toContain('Keeper');
  await page.locator('.tile[data-style="pixel"]').click();
  await selected(page, 'pixel');
  await page.locator('#keep').click();
  await expect(page.locator('#kept-list li')).toHaveCount(2);
  expect(await svgOf(page, '#kept-list li:nth-child(2) img')).toBe(thumb);
  await page.locator('.kept-remove').first().click();
  await page.reload();
  await expect(page.locator('#kept-list li')).toHaveCount(1);
  await page.locator('.kept-open').first().click();
  await selected(page, 'artdeco');
  await page.locator('.kept-remove').first().click();
  await expect(page.locator('#kept')).toBeHidden();
});

/** @param {Buffer} buf */
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

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
  await page.locator('[data-scale="2"]').click();
  await expect(page.locator('#png-size')).toHaveText('1200 × 1800 px');

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

test('file names are cut between whole characters and never end in a separator', async ({ page }) => {
  for (const [title, name] of [
    ['a' + '𠮷'.repeat(70), 'a' + '𠮷'.repeat(59)],
    ['a'.repeat(59) + ' b', 'a'.repeat(59)],
  ]) {
    await page.goto(`/#title=${encodeURIComponent(title)}&style=minimal&seed=f`);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#dl-svg').click()]);
    expect(download.suggestedFilename()).toBe(`${name}-minimal.svg`);
    await page.goto('about:blank');
  }
});

test('size hints match the format', async ({ page }) => {
  await page.goto('/#format=ebook&seed=x');
  await page.locator('[data-scale="2"]').click();
  await expect(page.locator('#size-hint')).toContainText('choose 3×');
  await page.locator('[data-scale="3"]').click();
  await expect(page.locator('#size-hint')).toContainText('Meets Kindle');
});

test('copies the SVG and a link to the design', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium lets tests read the clipboard');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#title=Clipboard&style=minimal&seed=c1');
  await page.locator('#copy-svg').click();
  await expect(page.locator('#toast')).toContainText('copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^<svg[\s\S]*Clipboard[\s\S]*<\/svg>$/);
  await page.locator('#copy-link').click();
  await expect(page.locator('#toast')).toContainText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#title=Clipboard.*style=minimal.*seed=c1/);
});

test('screen readers hear style changes but not typing', async ({ page }) => {
  await page.goto('/#style=minimal&palette=mint&seed=a');
  await ready(page);
  await page.locator('#title').fill('Something else');
  await expect(page.locator('#announce')).toHaveText('');
  await page.locator('.tile[data-style="noir"]').click();
  await expect(page.locator('#announce')).toHaveText('Style: Noir. Palette: Mint.');
});

test('typing never triggers announcements, even when the palette follows the title', async ({ page }) => {
  await page.goto('/#style=minimal&palette=auto&seed=');
  await ready(page);
  await page.locator('#title').pressSequentially('A title that changes the palette', { delay: 5 });
  await expect(page.locator('#announce')).toHaveText('');
});

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/#title=Access&style=artdeco&seed=a');
    await ready(page);
    await page.locator('#keep').click();
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
  for (const path of ['/og.png', '/icons/icon-192.png']) {
    expect((await request.get(path)).headers()['cross-origin-resource-policy'], path).toBe('cross-origin');
  }
});

test('unknown pages get the 404 page', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('shelf');
  await page.locator('a.primary').click();
  await ready(page);
});

test('fits a phone screen, keeps the preview pinned and shows the action bar @mobile', async ({ page }) => {
  await page.goto('/#title=Phone&style=bigtype&seed=m');
  await ready(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('#m-randomize')).toBeVisible();
  await page.locator('#dice-seed').scrollIntoViewIfNeeded();
  await expect(page.locator('#preview')).toBeInViewport();
  await page.locator('#m-randomize').click();
  await expect(page.locator('#seed')).not.toHaveValue('m');
});

test('the phone download button shows that it is busy @mobile', async ({ page }) => {
  await page.goto('/#title=Busy&style=minimal&seed=b');
  await expect(page.locator('#m-download')).toBeVisible();
  const [download, busy] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => {
      const button = /** @type {HTMLButtonElement} */ (document.getElementById('m-download'));
      button.click();
      return button.disabled && button.getAttribute('aria-busy') === 'true';
    }),
  ]);
  expect(busy).toBe(true);
  expect(download.suggestedFilename()).toBe('busy-minimal.png');
  await expect(page.locator('#m-download')).toBeEnabled();
});

test('long values in a shared link are clipped and never overflow @mobile', async ({ page }) => {
  await page.goto(`/#seed=${'x'.repeat(300)}&title=${'T'.repeat(500)}`);
  await expect(page.locator('#seed')).toHaveValue('x'.repeat(40));
  await expect(page.locator('#title')).toHaveValue('T'.repeat(200));
  // Clipped to maxlength in UTF-16 units, between whole characters.
  const family = '👨\u200D👩\u200D👧\u200D👦';
  await page.goto('about:blank');
  await page.goto(`/#title=${encodeURIComponent(family.repeat(30))}`);
  await expect(page.locator('#title')).toHaveValue(family.repeat(18));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
