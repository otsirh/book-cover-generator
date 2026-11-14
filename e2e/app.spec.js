import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { platform } from 'node:process';
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
  await expect(tiles).toHaveCount(39);
  for (const tile of await tiles.all()) {
    // (Scrolled from the page, not waiting for the tile to hold still over two frames: WebKit on
    // Linux CI paints a rail of SVG images at a frame or two a second.)
    await tile.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
    await expect(tile.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/, { timeout: 10_000 });
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

test('editing the URL updates the design, as a step Undo takes back', async ({ page }) => {
  await page.goto('/#style=swiss&seed=one');
  await selected(page, 'swiss');
  await page.evaluate(() => {
    location.hash = 'style=orbit&seed=two';
  });
  await selected(page, 'orbit');
  await expect(page.locator('#seed')).toHaveValue('two');
  await page.locator('#undo').click();
  await selected(page, 'swiss');
  await expect(page.locator('#seed')).toHaveValue('one');
});

test('undo and redo step through designs: buttons, Z, and Control or Command with Z', async ({ page }) => {
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
  // As in other apps, with Control or Command; these work with single-key shortcuts off, too.
  await page.locator('#shortcuts-toggle').click();
  await page.locator('body').press('Control+KeyZ');
  await selected(page, 'minimal');
  await page.locator('body').press('Meta+Shift+KeyZ');
  await selected(page, 'retro');
  await page.locator('body').press('Control+KeyY');
  await expect(page.locator('#meta')).toContainText('Mint');
  // In a text field they undo the typing, as the browser does, not the design.
  // (Ours would leave a step to redo; the field's own undo is typing, a new step.)
  await page.locator('#title').fill('Typed');
  await page.locator('#title').press('Control+KeyZ');
  await expect(page.locator('#redo')).toBeDisabled();
});

test('Back leaves the app, however many changes were made', async ({ page }) => {
  await page.goto('about:blank');
  await page.goto('/#title=T&style=minimal&seed=b');
  const entries = await page.evaluate(() => history.length);
  for (const style of ['swiss', 'bauhaus', 'retro']) {
    await page.locator(`.tile[data-style="${style}"]`).click();
    await selected(page, style);
  }
  await page.locator('#title').fill('Typed');
  await expect(page).toHaveURL(/title=Typed&.*style=retro/);
  // Each change rewrites the app's one entry: there are no more to go back through.
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await page.goBack();
  expect(page.url()).toBe('about:blank');
  // Forward comes back to the design as it was left, with its steps.
  await page.goForward();
  await expect(page.locator('#title')).toHaveValue('Typed');
  await page.locator('#undo').click();
  await expect(page.locator('#title')).toHaveValue('T');
  await selected(page, 'retro');
});

test('undo reverts the subtitle and the texture too', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=u');
  await page.locator('label.switch:has(#texture)').click();
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

test('the steps survive a reload, and redo never leaves the app', async ({ page }) => {
  await page.goto('/#style=minimal&seed=r');
  await page.locator('.tile[data-style="swiss"]').click();
  await page.locator('.tile[data-style="bauhaus"]').click();
  await selected(page, 'bauhaus');
  await page.reload();
  await selected(page, 'bauhaus');
  await expect(page.locator('#undo')).toBeEnabled();
  await page.locator('#undo').click();
  await selected(page, 'swiss');
  await expect(page.locator('#redo')).toBeEnabled();
  await page.reload();
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

test('a link opened in the tab is a new step after the design you had', async ({ page }) => {
  await page.goto('/#title=Mine&style=minimal&seed=m');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  // Another link, loaded in this tab (as pasting it in the address bar does).
  await page.goto('/?title=Theirs&author=A&style=retro&palette=synth&seed=x&format=paperback');
  await selected(page, 'retro');
  await page.locator('#undo').click();
  await selected(page, 'swiss');
  await expect(page.locator('#title')).toHaveValue('Mine');
  await page.locator('#undo').click();
  await selected(page, 'minimal');
});

test('typing in another field starts a new undo step', async ({ page }) => {
  await page.goto('/#title=Before&author=Old&style=minimal&seed=t');
  await page.locator('#title').fill('After');
  await page.locator('#author').fill('New');
  await expect(page).toHaveURL(/title=After&author=New/);
  await page.locator('#undo').click();
  await expect(page.locator('#author')).toHaveValue('Old');
  await expect(page.locator('#title')).toHaveValue('After');
  await page.locator('#undo').click();
  await expect(page.locator('#title')).toHaveValue('Before');
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

test('single-key shortcuts can be turned off, and stay off', async ({ page }) => {
  await page.goto('/#style=minimal&seed=keys');
  const toggle = page.locator('#shortcuts-toggle');
  await toggle.click();
  await expect(toggle).toHaveText('Turn on shortcuts');
  await expect(page.locator('#randomize')).not.toHaveAttribute('aria-keyshortcuts');
  await page.locator('body').press('KeyR');
  await page.locator('body').press('ArrowRight');
  await expect(page.locator('#seed')).toHaveValue('keys');
  await expect(page.locator('#style-name')).toHaveText('Minimal');
  await page.reload();
  await expect(toggle).toHaveText('Turn on shortcuts');
  await toggle.click();
  await expect(page.locator('#randomize')).toHaveAttribute('aria-keyshortcuts', 'R');
  await page.locator('body').press('KeyR');
  await expect(page.locator('#seed')).not.toHaveValue('keys');
});

test('accented letters and dead keys never trigger shortcuts by position', async ({ page }) => {
  await page.goto('/#style=minimal&seed=k');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  for (const [key, code] of [
    ['à', 'KeyZ'], // BÉPO
    ['Dead', 'KeyY'],
    ['ı', 'KeyR'], // Turkish-F
  ]) {
    await page.evaluate(
      ([k, c]) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: c, bubbles: true })),
      [key, code],
    );
  }
  await page.waitForTimeout(200);
  await selected(page, 'swiss');
  await expect(page.locator('#seed')).toHaveValue('k');
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

test('a fragment that is not a design keeps the design, and adds no step', async ({ page }) => {
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
  await page.locator('#undo').click();
  await selected(page, 'minimal');
  await page.locator('#redo').click();
  await selected(page, 'swiss');
  await page.locator('#redo').click();
  await selected(page, 'bauhaus');
});

test('loading the same URL again (Enter in the address bar) adds no Undo step', async ({ page }) => {
  await page.goto('about:blank');
  await page.goto('/#title=Again&author=A&subtitle=&style=minimal&palette=mint&seed=s&format=paperback&texture=0');
  await expect(page.locator('#undo')).toBeDisabled();
  await page.evaluate(() => {
    location.href = location.href; // eslint-disable-line no-self-assign
  });
  await page.waitForTimeout(300);
  await expect(page.locator('#undo')).toBeDisabled();
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  for (let i = 0; i < 3; i++) {
    await page.locator('body').press('KeyZ');
    await page.waitForTimeout(200);
  }
  expect(new URL(page.url()).pathname).toBe('/');
  await selected(page, 'minimal');
  await expect(page.locator('#undo')).toBeDisabled();
});

test('a long typing session slows its history writes, inside browser rate limits', async ({ page }) => {
  // (30 s of the page's time, each step drawing its frames: slow on a busy machine.)
  test.slow();
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/#title=&style=minimal&seed=r');
  await ready(page);
  // From here only the test moves time, so a busy machine can't add any.
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await page.evaluate(() => {
    let count = 0;
    const real = history.replaceState.bind(history);
    history.replaceState = (...args) => {
      count += 1;
      return real(...args);
    };
    /** @type {any} */ (window).__writes = () => count;
    document.getElementById('title')?.focus();
  });
  // 30 s of steady typing: a key every 250 ms. (Typed from the page: a key from the test waits
  // for a frame, and a paused clock draws none.)
  for (let i = 0; i < 120; i++) {
    await page.evaluate(
      (ch) => {
        const title = /** @type {HTMLTextAreaElement} */ (document.getElementById('title'));
        title.value += ch;
        title.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
      },
      String.fromCharCode(97 + (i % 26)),
    );
    await page.clock.runFor(250);
  }
  const total = await page.evaluate(() => /** @type {any} */ (window).__writes());
  expect(total).toBeGreaterThan(10);
  expect(total).toBeLessThan(70);
});

test('a URL write the browser refuses or ignores is tried again', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=q');
  // Rate-limited browsers throw (Safari), or drop the write without a word (Chrome).
  for (const how of ['throw', 'drop']) {
    await page.evaluate((mode) => {
      const real = history.replaceState.bind(history);
      let refuse = true;
      history.replaceState = (...args) => {
        if (!refuse) return real(...args);
        refuse = false;
        if (mode === 'throw') throw new DOMException('Too many calls', 'SecurityError');
      };
    }, how);
    const style = how === 'throw' ? 'swiss' : 'bauhaus';
    await page.locator(`.tile[data-style="${style}"]`).click();
    await selected(page, style);
    await expect(page, how).toHaveURL(new RegExp(`style=${style}`), { timeout: 3000 });
  }
});

test('a change made before an Undo lands comes after the Undo, not before it', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=r');
  for (const style of ['typographic', 'swiss']) {
    await page.locator(`.tile[data-style="${style}"]`).click();
    await selected(page, style);
  }
  // In one task, so the click comes before the Undo's popstate.
  await page.evaluate(() => {
    /** @type {HTMLElement} */ (document.querySelector('#undo')).click();
    /** @type {HTMLElement} */ (document.querySelector('.tile[data-style="bauhaus"]')).click();
  });
  await selected(page, 'bauhaus');
  await page.waitForTimeout(300);
  await selected(page, 'bauhaus');
  await expect(page.locator('#redo')).toBeDisabled();
  await page.locator('#undo').click();
  await selected(page, 'typographic');
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

test('a section link moves keyboard focus to its section', async ({ page }) => {
  await page.goto('/#style=minimal&seed=l');
  await page.locator('header a[href="#usage"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#usage')).toBeFocused();
  await expect(page.locator('#usage')).toBeInViewport();
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
  // (Tiles are drawn a few per frame, and WebKit on Linux CI paints a frame or two a second.)
  await expect(page.locator(`.tile[data-style="${below}"] img`)).toHaveAttribute('src', /^data:image\/svg\+xml/, {
    timeout: 15_000,
  });
});

test('the Variation field follows an edited URL even while it has focus', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=xyz');
  const seed = page.locator('#seed');
  await seed.fill('abc');
  await expect(page).toHaveURL(/seed=abc/);
  await page.evaluate(() => {
    location.hash = 'seed=xyz';
  });
  await expect(seed).toBeFocused();
  await expect(seed).toHaveValue('xyz');
  // A trailing space while typing stays in the field.
  await seed.pressSequentially(' ');
  await expect(seed).toHaveValue('xyz ');
});

test('the last keystrokes are in the URL when the page is left or reloaded', async ({ page }) => {
  await page.goto('/#title=Before&style=minimal&seed=t');
  const title = page.locator('#title');
  await title.fill('');
  await title.pressSequentially('Hello there', { delay: 5 });
  // (At once: the reload begins at an address a keystroke or more behind, and the page may write a
  // newer one as it goes.)
  await page.reload();
  await expect(title).toHaveValue('Hello there');
});

test('coming back from another page and reloading keeps Undo and Redo', async ({ page }) => {
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
  await expect(page.locator('#undo')).toBeDisabled();
  await page.locator('#redo').click();
  await selected(page, 'swiss');
  expect(new URL(page.url()).pathname).toBe('/');
});

test('a link pasted into an open tab opens exactly that design', async ({ page }) => {
  await page.goto('/#title=Plain&author=A&style=noir&palette=noir&seed=abc&format=paperback');
  // Copy link and the URL name every key, even an empty subtitle and texture off.
  await expect(page).toHaveURL(/subtitle=&.*texture=0/);
  const link = new URL(page.url()).hash;
  await page.goto('/#title=Busy&author=B&subtitle=A+Novel&style=retro&palette=synth&seed=x&format=ebook&texture=1');
  await expect(page.locator('#texture')).toBeChecked();
  await page.evaluate((hash) => {
    location.hash = hash;
  }, link);
  await selected(page, 'noir');
  await expect(page.locator('#subtitle')).toHaveValue('');
  await expect(page.locator('#texture')).not.toBeChecked();
  // (Noir has its own grain; the texture's grain is the one with this id.)
  await expect.poll(() => svgSoon(page, '#preview')).toContain('Plain');
  expect(await svgOf(page, '#preview')).not.toContain('texture-dark');
});

test('Undo after a hand-edited URL never steps off the app', async ({ page }) => {
  await page.goto('about:blank');
  await page.goto('/#title=T&style=minimal&seed=e');
  for (const style of ['swiss', 'bauhaus', 'retro']) {
    await page.locator(`.tile[data-style="${style}"]`).click();
    await selected(page, style);
  }
  await page.locator('#undo').click();
  await selected(page, 'bauhaus');
  await page.locator('#undo').click();
  await selected(page, 'swiss');
  // Editing the URL now drops retro and bauhaus: the steps are minimal, swiss, orbit.
  await page.evaluate(() => {
    location.hash = 'style=orbit&seed=e2';
  });
  await selected(page, 'orbit');
  await expect(page.locator('#redo')).toBeDisabled();
  for (let i = 0; i < 6; i++) await page.locator('body').press('KeyZ');
  expect(new URL(page.url()).pathname).toBe('/');
  await selected(page, 'minimal');
  await expect(page.locator('#undo')).toBeDisabled();
});

test('a download keeps keyboard focus on its button', async ({ page }) => {
  await page.goto('/#title=Focus&style=topographic&seed=f');
  await page.locator('[data-scale="4"]').click();
  const button = page.locator('#download');
  await button.focus();
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe('focus-topographic.png');
  await expect(button).not.toHaveAttribute('aria-busy');
  await expect(button).toBeFocused();
});

test('Copy link falls back when the clipboard API refuses', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the copy command needs Chromium in automation');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
    });
  });
  await page.goto('/#title=Fallback&style=minimal&seed=c');
  await page.locator('#copy-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('Link copied');
  // The fallback selects a hidden textarea; focus comes back to the button.
  await expect(page.locator('#copy-link')).toBeFocused();
});

test('a whole link with an unknown style opens the same cover in an open tab as in a new one', async ({ page }) => {
  const link =
    '#title=Shared&author=Someone&subtitle=&style=futurestyle&palette=noir&seed=abc&format=paperback&texture=0';
  await page.goto(`/${link}`);
  const fresh = (await page.locator('.tile[aria-pressed="true"]').getAttribute('data-style')) ?? '';
  await page.goto('about:blank');
  await page.goto('/#title=Busy&author=B&subtitle=&style=retro&palette=synth&seed=x&format=ebook&texture=0');
  await selected(page, 'retro');
  await page.evaluate((hash) => {
    location.hash = hash;
  }, link);
  await expect(page.locator('#title')).toHaveValue('Shared');
  await selected(page, fresh);
});

test('a title typed on two lines keeps its line break, in the field, the link and the cover', async ({ page }) => {
  await page.goto('/#title=Line%0ABreak&style=minimal&seed=n');
  await expect(page.locator('#title')).toHaveValue('Line\nBreak');
  await page.locator('#title').focus();
  await page.locator('#title').evaluate((el) => {
    const input = /** @type {HTMLTextAreaElement} */ (el);
    input.setSelectionRange(input.value.length, input.value.length);
  });
  await page.keyboard.type('s');
  await expect(page).toHaveURL(/title=Line%0ABreaks/);
  // Enter starts another line.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Again');
  await expect(page.locator('#title')).toHaveValue('Line\nBreaks\nAgain');
  await expect(page).toHaveURL(/title=Line%0ABreaks%0AAgain/);
  await expect.poll(() => svgSoon(page, '#preview')).toContain('<title>Line Breaks Again</title>');
  expect(await svgOf(page, '#preview')).toMatch(/>Line<\/text>/);
  await expect(page.locator('#preview')).toHaveAttribute('alt', /“Line Breaks Again”/);
  // Other fields still take one line.
  await page.goto('about:blank');
  await page.goto('/#title=T&author=A%0AB&style=minimal&seed=n');
  await expect(page.locator('#author')).toHaveValue('A B');
});

test('a link from before 1.2.0 pasted into an open tab opens that design', async ({ page }) => {
  await page.goto('/#title=Busy&author=B&subtitle=A+Novel&style=retro&palette=synth&seed=x&format=ebook&texture=1');
  await expect(page.locator('#texture')).toBeChecked();
  await page.evaluate(() => {
    location.hash = 'title=Old&author=Link&style=noir&palette=noir&seed=s&format=paperback';
  });
  await selected(page, 'noir');
  await expect(page.locator('#subtitle')).toHaveValue('');
  await expect(page.locator('#texture')).not.toBeChecked();
});

test('an unknown texture value in an edited URL is ignored', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=u&texture=1');
  await page.evaluate(() => {
    location.hash = 'texture=yes&seed=u2';
  });
  await expect(page.locator('#seed')).toHaveValue('u2');
  await expect(page.locator('#texture')).toBeChecked();
});

test('a hand-edited URL is rewritten to hold the whole design', async ({ page }) => {
  await page.goto(
    '/#title=Neon+Tide&author=Kai&subtitle=A+Novel&style=retro&palette=synth&seed=one&format=ebook&texture=1',
  );
  await page.evaluate(() => {
    location.hash = 'style=orbit&seed=two';
  });
  await selected(page, 'orbit');
  await expect(page).toHaveURL(/title=Neon\+Tide.*subtitle=A\+Novel.*palette=synth.*seed=two.*format=ebook&texture=1/);
  await expect(page.locator('#subtitle')).toHaveValue('A Novel');
  await expect(page.locator('#texture')).toBeChecked();
});

test("a typing burst's entry keeps up while typing, so the toolbar's Back loses little", async ({ page }) => {
  await page.goto('/#title=Before&style=minimal&seed=t');
  const title = page.locator('#title');
  await title.fill('');
  // Keystrokes spread over more than the write interval, with no quiet gap.
  await title.pressSequentially('Hello world', { delay: 60 });
  const saved = await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('title') ?? '');
  // Some of the burst is already in the URL (the entry), not only after a pause.
  expect(saved.length).toBeGreaterThan(3);
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
  await expect(page.locator('#kept-list li')).toHaveCount(0);
  await expect(page.locator('#kept-empty')).toBeVisible();
});

test('removing a kept design keeps keyboard focus in the tray', async ({ page }) => {
  await page.goto('/#title=One&style=minimal&seed=k1');
  await page.locator('#keep').click();
  await page.locator('.tile[data-style="swiss"]').click();
  await page.locator('#keep').click();
  await expect(page.locator('#kept-list li')).toHaveCount(2);
  await page.locator('.kept-remove').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#kept-list li')).toHaveCount(1);
  await expect(page.locator('.kept-remove')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#kept-list li')).toHaveCount(0);
  await expect(page.locator('#keep')).toBeFocused();
});

test('the variations strip offers six other variations; a click picks one, Undo goes back', async ({ page }) => {
  await page.goto('/#title=Strip&author=A&style=bauhaus&palette=riso&seed=v1');
  const buttons = page.locator('#variations button');
  await expect(buttons).toHaveCount(6);
  for (const img of await page.locator('#variations img').all()) {
    await expect(img).toHaveAttribute('src', /^data:image\/svg\+xml/);
  }
  const label = (await buttons.nth(2).getAttribute('aria-label')) ?? '';
  const seed = label.replace('Variation ', '');
  expect(seed).toMatch(/^[0-9a-z]{4,6}$/);
  await buttons.nth(2).click();
  await expect(page.locator('#seed')).toHaveValue(seed);
  await selected(page, 'bauhaus');
  await page.locator('#undo').click();
  await expect(page.locator('#seed')).toHaveValue('v1');
  // The same design always offers the same six.
  await expect(buttons.nth(2)).toHaveAttribute('aria-label', label);
});

test('family links in the rail jump to that family', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#style=minimal&seed=r');
  await expect(page.locator('.rail-jump')).toHaveCount(6);
  await page.locator('.rail-jump', { hasText: 'Pattern' }).click();
  await expect(page.locator('.tile[data-style="mosaic"]')).toBeInViewport();
  // The family's heading lands below the rail's pinned header, not under it.
  await page.locator('.rail-jump', { hasText: 'Scenic' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const heading = [...document.querySelectorAll('.rail-group h3')].find((h) => h.textContent === 'Scenic');
        const head = document.querySelector('.rail-head');
        return (heading?.getBoundingClientRect().top ?? 0) - (head?.getBoundingClientRect().bottom ?? 0);
      }),
    )
    .toBeGreaterThanOrEqual(0);
});

/**
 * The files in a ZIP archive (stored, as the app makes them), by name.
 * @param {Buffer} zip
 */
function unzip(zip) {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  let at = zip.readUInt32LE(end + 16);
  for (let k = 0; k < zip.readUInt16LE(end + 10); k++) {
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26);
    files.set(zip.toString('utf8', at + 46, at + 46 + nameLength), zip.subarray(start, start + size));
    at += 46 + nameLength;
  }
  return files;
}

test('kept designs show their style, and Download all saves them in one ZIP', async ({ page }) => {
  await page.goto('/#title=One&style=minimal&seed=k1');
  await page.locator('#keep').click();
  await page.locator('.tile[data-style="swiss"]').click();
  await page.locator('#keep').click();
  // The same title and style twice: the names must still differ.
  await page.locator('#dice-seed').click();
  await page.locator('#keep').click();
  await expect(page.locator('.kept-label')).toHaveText(['Swiss', 'Swiss', 'Minimal']);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#kept-all').click()]);
  expect(download.suggestedFilename()).toBe('kept-covers.zip');
  const files = unzip(await readFile(/** @type {string} */ (await download.path())));
  expect([...files.keys()].sort()).toEqual(['one-minimal.png', 'one-swiss-2.png', 'one-swiss.png']);
  for (const png of files.values()) {
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(pngSize(png)).toEqual([1200, 1800]);
  }
  await expect(page.locator('#toast')).toContainText('Saved 3 PNGs');
  await expect(page.locator('#kept-all')).toHaveText('Download all');
});

test('on a laptop screen Randomize is in view at once, and the cover stays in view while scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#title=The+Lighthouse+Keeper&style=artdeco&palette=midnight&seed=a1');
  await expect(page.locator('#randomize')).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 250));
  await expect(page.locator('#preview')).toBeInViewport({ ratio: 0.9 });
});

test('the tools under the preview: never covered by it while it stays in view, and after it on phones', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#title=Tools&style=artdeco&seed=t');
  await ready(page);
  // Keep a few designs: the tools grow, and the preview still stays in view beside the controls.
  for (let i = 0; i < 3; i++) {
    await page.locator('#keep').click();
    await page.locator('#dice-seed').click();
  }
  await expect(page.locator('#kept-list li')).toHaveCount(3);
  for (const y of [0, 400, 800, 2000]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const [stage, tools] = await Promise.all([
      page.locator('.stage').boundingBox(),
      page.locator('.stage-tools').boundingBox(),
    ]);
    expect(stage && tools && stage.y + stage.height <= tools.y + 0.5, `scrolled to ${y}`).toBe(true);
  }
  // Their buttons can be pressed (nothing lies over them).
  await page.locator('#print summary').click();
  await expect(page.locator('#print')).toHaveAttribute('open', '');
  // On a tablet the styles come below, full width: the controls, kept in view, never lie over them.
  await page.setViewportSize({ width: 900, height: 768 });
  await page.evaluate(() =>
    window.scrollTo(0, (document.querySelector('.rail')?.getBoundingClientRect().top ?? 0) + window.scrollY + 100),
  );
  const [controls, styles] = await Promise.all([
    page.locator('.controls').boundingBox(),
    page.locator('.rail').boundingBox(),
  ]);
  expect(controls && styles && controls.y + controls.height <= styles.y + 0.5).toBe(true);
  // On a phone: after the preview and the export buttons, not above them.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const top = async (/** @type {string} */ selector) => (await page.locator(selector).boundingBox())?.y ?? NaN;
  expect(await top('#print summary')).toBeGreaterThan(await top('.export'));
  expect(await top('#many summary')).toBeGreaterThan(await top('#preview'));
});

test('keyboard focus: kept on a variant chip when the style changes, and clear of the pinned preview on a phone', async ({
  page,
}) => {
  await page.goto('/#title=Probe&style=minimal&seed=s');
  await ready(page);
  // The title field is named by its label alone (its hint describes it).
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible();
  await page.locator('#style-variants button[data-value=""]').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.locator('.tile[aria-pressed="true"]').getAttribute('data-style')).not.toBe('minimal');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  // On a phone, a field reached by Shift+Tab scrolls clear of the pinned preview.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#texture').focus();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab');
    // (Polled: the app may scroll it clear on the next frame.)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement;
          const r = el?.getBoundingClientRect();
          const p = document.querySelector('.preview-wrap')?.getBoundingClientRect();
          if (!r || !p || !r.height || el === document.body) return 'clear';
          return r.top >= p.bottom - 1 || r.bottom <= p.top ? 'clear' : `#${el?.id || el?.tagName} under the preview`;
        }),
      )
      .toBe('clear');
  }
});

test('the toast never covers the export buttons, and stays while the pointer is over it', async ({ page }) => {
  // Beside the cover (at the top, so the toast is at the bottom), and under it (the toast at the top).
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/#title=Toast&style=minimal&seed=t');
    await ready(page);
    for (const y of [0, 600]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.locator('#dice-seed').click();
      await page.locator('#keep').click();
      const toast = page.locator('#toast');
      await expect(toast).toHaveClass(/show/);
      const box = await toast.boundingBox();
      const exports = await page.locator('.export').boundingBox();
      const apart =
        box &&
        exports &&
        (box.y + box.height <= exports.y ||
          box.y >= exports.y + exports.height ||
          box.x + box.width <= exports.x ||
          box.x >= exports.x + exports.width);
      expect(apart, `${width} × ${height}, scrolled to ${y}`).toBe(true);
    }
  }
  // Long enough to read, and longer while the pointer rests on it.
  await page.clock.install();
  await page.goto('/#title=Toast&style=minimal&seed=t');
  await ready(page);
  await page.locator('#keep').click();
  const toast = page.locator('#toast');
  await page.clock.runFor(3000);
  await expect(toast).toHaveClass(/show/);
  await toast.hover();
  await page.clock.runFor(10_000);
  await expect(toast).toHaveClass(/show/);
  await page.mouse.move(0, 0);
  await page.clock.runFor(4000);
  await expect(toast).not.toHaveClass(/show/);
});

test('kept designs are saved, restored and removed', async ({ page }) => {
  await page.goto('/#title=Keeper&style=artdeco&palette=midnight&seed=k');
  await expect(page.locator('#kept-empty')).toBeVisible();
  await expect(page.locator('#kept-all')).toBeHidden();
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
  await expect(page.locator('#kept-list li')).toHaveCount(0);
  await expect(page.locator('#kept-empty')).toBeVisible();
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

  const png = await grab('#download');
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
  await page.goto('/#title=x&style=minimal&seed=f');
  for (const [title, name] of [
    ['ガラスの街', 'ガラスの街'],
    ['Война и мир', 'война-и-мир'],
    ['Ζορμπάς', 'ζορμπάς'],
    ['हिन्दी कहानी', 'हिन्दी-कहानी'],
    ['Café Society', 'cafe-society'],
    ['a' + '𠮷'.repeat(70), 'a' + '𠮷'.repeat(59)],
    ['a'.repeat(59) + ' b', 'a'.repeat(59)],
  ]) {
    // Typed into the open page (one load, not five: downloads are slow in WebKit).
    await page.locator('#title').fill(title);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#dl-svg').click()]);
    // (Compared in NFC: WebKit on macOS reports file names decomposed.)
    expect(download.suggestedFilename().normalize('NFC')).toBe(`${name}-minimal.svg`);
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
  // The link holds the design in its query (so a link preview can show it)…
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/\?title=Clipboard.*style=minimal.*seed=c1/);
  // …and opens it, with the design moved to the #fragment, where the app keeps it.
  await page.goto(link);
  await ready(page);
  await expect(page).toHaveURL(/\/#title=Clipboard.*style=minimal.*seed=c1/);
  expect(await svgOf(page, '#preview')).toContain('Clipboard');
});

test('a design’s link shows that design in link previews, a PNG the site draws', async ({ page, request }) => {
  const query = 'title=Dune&author=Frank+Herbert&style=retro&seed=s';
  const html = await (await request.get(`/?${query}`)).text();
  const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
  // (The design's own link, as the app writes it, as a card.)
  const card = new URL(/** @type {string} */ (image));
  expect(card.pathname).toBe('/api/mockup.png');
  expect(Object.fromEntries(card.searchParams)).toMatchObject({
    title: 'Dune',
    author: 'Frank Herbert',
    style: 'retro',
    seed: 's',
    kind: 'card',
    preview: '1',
  });
  const png = await request.get(
    new URL(/** @type {string} */ (image)).pathname + new URL(/** @type {string} */ (image)).search,
  );
  expect(png.status()).toBe(200);
  expect(png.headers()['content-type']).toBe('image/png');
  // The PNG's header: a 1200 × 630 card.
  const bytes = await png.body();
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
  // The page itself is the app, which opens the design.
  await page.goto(`/?${query}`);
  await ready(page);
  await expect(page.locator('#title')).toHaveValue('Dune');
  expect(await svgOf(page, '#preview')).toContain('Dune');
});

test('copies an image link: the site’s HTTP API draws the same cover', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium lets tests read the clipboard');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // (A pin left from another style, scene.forest, isn't in the image link.)
  await page.goto(
    '/#title=Glass%0ACity&author=A&style=crest&variant=emblem.sun-scene.forest&palette=custom-0b132b-f8f9fa-ff6b6b&seed=s&format=ebook&texture=1',
  );
  await ready(page);
  await page.locator('#copy-image-link').click();
  await expect(page.locator('#toast')).toContainText('Embed link copied');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/api\/cover\.svg\?title=Glass%0ACity&/);
  expect(link).not.toContain('scene.forest');
  const res = await page.request.get(link);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe(await svgOf(page, '#preview'));
});

test('screen readers hear style changes but not typing', async ({ page }) => {
  await page.goto('/#style=minimal&palette=mint&seed=a');
  await ready(page);
  await page.locator('#title').fill('Something else');
  await expect(page.locator('#announce')).toHaveText('');
  await page.locator('.tile[data-style="noir"]').click();
  await expect(page.locator('#announce')).toHaveText('Style: Noir. Palette: Mint.');
});

test('an announcement is read again when the region still holds the same text', async ({ page }) => {
  for (const [from, to] of [
    ['Alpha', 'Bravo'],
    ['Delta', 'Echo'],
    ['Kilo', 'Lima'],
    ['Oscar', 'Papa'],
  ]) {
    await page.goto(`/#title=${from}&style=minimal&palette=auto&seed=`);
    await page.locator('.tile[data-style="swiss"]').click();
    const region = page.locator('#announce');
    await expect(region).toContainText('Swiss');
    const first = (await region.textContent()) ?? '';
    const before = await page.locator('#palette-name').textContent();
    await page.locator('#title').fill(to);
    await page.locator('#title').blur();
    // Only a case where typing changed the automatic palette shows the problem.
    if ((await page.locator('#palette-name').textContent()) === before) continue;
    await page.locator('#undo').click();
    await expect(page.locator('#title')).toHaveValue(from);
    // (Compared exactly: toHaveText would normalise away the no-break space that marks the change.)
    await expect.poll(() => region.evaluate((el) => el.textContent)).not.toBe(first);
    expect(((await region.textContent()) ?? '').trim()).toBe(first.trim());
    return;
  }
  throw new Error('No title pair changed the automatic palette');
});

test('typing never triggers announcements, even when the palette follows the title', async ({ page }) => {
  await page.goto('/#style=minimal&palette=auto&seed=');
  await ready(page);
  await page.locator('#title').pressSequentially('A title that changes the palette', { delay: 5 });
  await expect(page.locator('#announce')).toHaveText('');
});

test('your own colours start from the palette on the cover, and Custom brings them back', async ({ page }) => {
  await page.goto('/#title=Colours&style=minimal&palette=mint&seed=c');
  await expect(page.locator('#custom-colors')).toBeHidden();
  await page.locator('[data-palette="custom"]').click();
  await expect(page.locator('#custom-colors')).toBeVisible();
  await expect(page.locator('#color-bg')).toHaveValue('#e4f1ea');
  await expect(page).toHaveURL(/palette=custom-e4f1ea-12332b-2a9d8f-e76f51-f4a261/);
  await expect(page.locator('[data-palette="custom"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#palette-name')).toHaveText('Custom');
  await expect(page.locator('#rail-note')).toContainText('In your colours');
  await page.locator('#color-bg').fill('#0b132b');
  await expect.poll(() => svgSoon(page, '#preview')).toContain('#0b132b');
  await expect(page.locator('#contrast-note')).toContainText('Text on background');
  await page.locator('[data-palette="sky"]').click();
  await expect(page.locator('#custom-colors')).toBeHidden();
  await page.locator('[data-palette="custom"]').click();
  await expect(page.locator('#color-bg')).toHaveValue('#0b132b');
  // Undo steps back through the colour change as one step.
  await page.locator('#undo').click();
  await expect(page.locator('[data-palette="sky"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#undo').click();
  await expect(page.locator('#color-bg')).toHaveValue('#0b132b');
  await page.locator('#undo').click();
  await expect(page.locator('#color-bg')).toHaveValue('#e4f1ea');
});

test('a link with your own colours opens them; one with bad colours is ignored', async ({ page }) => {
  await page.goto('/#title=Link&style=swiss&seed=l&palette=custom-101010-FAFAFA-ff0066-00ccff');
  await expect(page.locator('#custom-colors')).toBeVisible();
  await expect(page.locator('#color-ink')).toHaveValue('#fafafa');
  await expect(page.locator('#color-a2')).toHaveValue('#00ccff');
  // Two accents given: the third repeats the first.
  await expect(page.locator('#color-a3')).toHaveValue('#ff0066');
  expect(await svgOf(page, '#preview')).toContain('#101010');
  await page.goto('about:blank');
  await page.goto('/#title=Link&style=swiss&seed=l&palette=custom-zzzzzz-fafafa-ff0066');
  await expect(page.locator('[data-palette="auto"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#custom-colors')).toBeHidden();
});

test('a custom size: presets, typing, and an export size of its own', async ({ page }) => {
  await page.goto('/#title=Size&style=minimal&seed=s');
  await expect(page.locator('#custom-size')).toBeHidden();
  await page.locator('[data-format="custom"]').click();
  await expect(page.locator('#custom-size')).toBeVisible();
  await expect(page).toHaveURL(/format=1600x2560/);
  await expect(page.locator('#size-preset')).toHaveValue('1600x2560');
  // 1× is the size asked for.
  await expect(page.locator('#png-size')).toHaveText('1600 × 2560 px');
  expect(await svgOf(page, '#preview')).toContain('width="1600" height="2560"');
  await page.locator('#size-preset').selectOption('1800x2700');
  await expect(page.locator('#size-w')).toHaveValue('1800');
  await expect(page.locator('#size-hint')).toHaveText('6 × 9 in at 300 dpi.');
  await page.locator('#size-h').fill('3000');
  await expect(page).toHaveURL(/format=1800x3000/);
  await expect(page.locator('#size-preset')).toHaveValue('');
  // A size the library can't make is put back when the field is left.
  await page.locator('#size-w').fill('10');
  await page.locator('#size-w').blur();
  await expect(page.locator('#size-w')).toHaveValue('1800');
  // (Something gone wrong: an alert, there until dismissed.)
  await expect(page.locator('#alert')).toHaveClass(/show/);
  await expect(page.locator('#alert-text')).toContainText('50 to 10,000 px');
  await page.locator('#alert-close').click();
  await expect(page.locator('#alert')).not.toHaveClass(/show/);
  // Scales past 10,000 px are off.
  await expect(page.locator('[data-scale="4"]')).toHaveAttribute('aria-disabled', 'true');
  // (Dispatched: Playwright won't click a button marked disabled.)
  await page.locator('[data-scale="4"]').dispatchEvent('click');
  await expect(page.locator('#png-size')).toHaveText('1800 × 3000 px');
  await page.locator('[data-scale="2"]').click();
  await expect(page.locator('#png-size')).toHaveText('3600 × 6000 px');
  const [w, hgt] = await page
    .locator('#book')
    .evaluate((el) => [/** @type {HTMLElement} */ (el).offsetWidth, /** @type {HTMLElement} */ (el).offsetHeight]);
  expect(Math.abs(w / hgt - 0.6)).toBeLessThan(0.01);
  // The presets keep their own export size.
  await page.locator('[data-format="ebook"]').click();
  await expect(page.locator('#png-size')).toHaveText('1200 × 1920 px');
  await expect(page.locator('#custom-size')).toBeHidden();
  await page.locator('#undo').click();
  await expect(page.locator('#size-h')).toHaveValue('3000');
});

test('a shared link with a custom size has its shape from the start; an impossible one falls back', async ({
  page,
}) => {
  await page.goto('/#format=1650x2550&seed=x');
  const coverWidth = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cover-w').trim());
  expect(await coverWidth()).toBe('1650');
  await expect(page.locator('[data-format="custom"]')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('about:blank');
  await page.goto('/#format=20000x100&seed=x');
  await expect(page.locator('[data-format="paperback"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await coverWidth()).toBe('2');
});

test('downloads WebP, and PNG and JPEG files say 300 dpi', async ({ page, browserName }) => {
  await page.goto('/#title=Dots&style=minimal&palette=mint&seed=d');
  const grab = async (/** @type {string} */ button) => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
    return { name: download.suggestedFilename(), data: await readFile(/** @type {string} */ (await download.path())) };
  };
  const png = await grab('#download');
  // A pHYs chunk right after the header: 11811 pixels per metre.
  expect(png.data.toString('latin1', 37, 41)).toBe('pHYs');
  expect(png.data.readUInt32BE(41)).toBe(11811);
  const jpg = await grab('#dl-jpeg');
  expect(jpg.data.toString('latin1', 6, 11)).toBe('JFIF\0');
  expect(jpg.data[13]).toBe(1);
  expect(jpg.data.readUInt16BE(14)).toBe(300);
  // Firefox opens a downloaded WebP in a tab, which Playwright reports as a page, not a download.
  if (browserName === 'firefox') return;
  const webp = await grab('#dl-webp');
  if (webp.name.endsWith('.png')) {
    // Safari can't encode WebP: it says so, and the file is a PNG named as one.
    expect(browserName).toBe('webkit');
    await expect(page.locator('#toast')).toContainText('can’t make WebP');
  } else {
    expect(webp.name).toBe('dots-minimal.webp');
    expect(webp.data.toString('latin1', 8, 12)).toBe('WEBP');
  }
});

test('copies the cover as an image', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium lets tests read the clipboard');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#title=Picture&style=minimal&seed=p');
  await expect(page.locator('#copy-image')).toBeVisible();
  await page.locator('#copy-image').click();
  // (Drawing a 1200 × 1800 PNG on a busy two-core runner can take a few seconds.)
  await expect(page.locator('#toast')).toContainText('Image copied · 1200 × 1800 px', { timeout: 15_000 });
  const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => [...item.types]));
  expect(types).toContain('image/png');
});

test('kept designs export to a file and import back', async ({ page }) => {
  await page.goto('/#title=Exported&style=noir&palette=noir&seed=x');
  await page.locator('#keep').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#kept-export').click()]);
  expect(download.suggestedFilename()).toBe('kept-designs.json');
  const data = JSON.parse(await readFile(/** @type {string} */ (await download.path()), 'utf8'));
  expect(data.designs).toHaveLength(1);
  expect(data.designs[0]).toMatchObject({ title: 'Exported', style: 'noir', palette: 'noir', seed: 'x' });
  expect(data.designs[0].svg).toMatch(/^<svg [\s\S]*Exported[\s\S]*<\/svg>$/);
  // Into a tray holding something else: new designs come first, ones kept already and junk are skipped.
  await page.locator('.kept-remove').click();
  await page.locator('.tile[data-style="swiss"]').click();
  await page.locator('#keep').click();
  const designs = [...data.designs, data.designs[0], { nonsense: true }, 7];
  const file = {
    name: 'kept-designs.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...data, designs })),
  };
  await page.locator('#kept-file').setInputFiles(file);
  await expect(page.locator('#toast')).toContainText('Imported 1 design');
  await expect(page.locator('.kept-label')).toHaveText(['Noir', 'Swiss']);
  await page.locator('#kept-file').setInputFiles(file);
  await expect(page.locator('#toast')).toContainText('Nothing new');
  await page
    .locator('#kept-file')
    .setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await expect(page.locator('#alert-text')).toContainText('no kept designs');
  // Nor is a list of things that aren't designs "kept already".
  await page.locator('#alert-close').click();
  await page
    .locator('#kept-file')
    .setInputFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('[{"foo":1}]') });
  await expect(page.locator('#alert')).toHaveClass(/show/);
  await expect(page.locator('#alert-text')).toContainText('That file has no kept designs in it');
});

test('a kept design shows the cover as it was kept, and says when this version draws it differently', async ({
  page,
}) => {
  const snapshot =
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><title>As kept</title><rect width="600" height="900" fill="#123456"/></svg>';
  await page.addInitScript((svg) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const kept = { title: 'Kept', style: 'minimal', palette: 'mint', seed: 'k', format: 'paperback', svg };
    localStorage.setItem('book-cover-generator:kept', JSON.stringify([kept]));
  }, snapshot);
  await page.goto('/#title=Now&style=swiss&seed=n');
  expect(await svgOf(page, '.kept-open img')).toBe(snapshot);
  await page.locator('.kept-open').click();
  await selected(page, 'minimal');
  await expect(page.locator('#toast')).toContainText('draws it a little differently');
  // It is kept (the star says so): removed and kept again, the tray shows the drawing kept now.
  await expect(page.locator('#keep')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#keep').click();
  await expect(page.locator('#kept-list li')).toHaveCount(0);
  await page.locator('#keep').click();
  await expect.poll(() => svgOf(page, '.kept-open img')).not.toBe(snapshot);
  expect(await svgOf(page, '.kept-open img')).toBe(await svgOf(page, '#preview'));
});

test('a kept design drawn the same but for its ids opens without a warning', async ({ page }) => {
  await page.goto('/#title=Kept&series=Book%20Two&badge=New&style=minimal&seed=k');
  await ready(page);
  await page.locator('#keep').click();
  await expect(page.locator('.kept-open')).toHaveCount(1);
  // As an older version kept it: the same drawing, its ids named another way.
  await page.evaluate(() => {
    const key = 'book-cover-generator:kept';
    const list = JSON.parse(localStorage.getItem(key) ?? '[]');
    list[0].svg = list[0].svg.replace(/\bbc[0-9a-z]+-/g, 'bcold1-');
    localStorage.setItem(key, JSON.stringify(list));
  });
  await page.goto('about:blank');
  await page.goto('/#title=Now&style=swiss&seed=n');
  await ready(page);
  await page.locator('.kept-open').click();
  await selected(page, 'minimal');
  await expect(page.locator('#title')).toHaveValue('Kept');
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
});

test('links name the version that made them, and an older one says it may look different', async ({ page }) => {
  await page.goto('/#title=Now&style=minimal&seed=v');
  await expect(page).toHaveURL(/texture=0&v=\d+\.\d+\.\d+$/);
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.goto('about:blank');
  await page.goto('/#title=Old&author=A&style=noir&palette=noir&seed=s&format=paperback&v=1.0.0');
  await expect(page.locator('#toast')).toContainText('Made with version 1.0.0');
  await selected(page, 'noir');
  // Pasted into the open tab, too.
  await page.evaluate(() => {
    location.hash = 'title=Older&author=A&style=swiss&palette=noir&seed=s&format=paperback&v=0.9.0';
  });
  await selected(page, 'swiss');
  await expect(page.locator('#toast')).toContainText('Made with version 0.9.0');
});

test('Store size shows the cover as small as a store lists it', async ({ page }) => {
  await page.goto('/#title=Small&style=bigtype&seed=t');
  await ready(page);
  const toggle = page.locator('#thumb-toggle');
  const height = (/** @type {string} */ id) =>
    page.locator(id).evaluate((el) => /** @type {HTMLElement} */ (el).offsetHeight);
  const frame = await height('#book');
  const download = await page.locator('#download').boundingBox();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await height('#preview')).toBe(120);
  // The frame keeps its size, so nothing under it moves.
  expect(await height('#book')).toBe(frame);
  expect(await page.locator('#download').boundingBox()).toEqual(download);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await height('#preview')).toBe(frame);
});

test('when storage is full, the oldest kept designs give up their SVG first, and Keep says so', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      // (Snapshots of the designs' size, 600 × 900: one of another size isn't kept.)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" data-x="${'a'.repeat(6000)}"></svg>`;
      const old = ['A', 'B', 'C', 'D'].map((title) => ({ title, style: 'minimal', seed: title, svg }));
      localStorage.setItem('book-cover-generator:kept', JSON.stringify(old));
    }
    // A small quota: four old snapshots and a new one don't fit, two do.
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'book-cover-generator:kept' && value.length > 20_000) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return real.call(this, key, value);
    };
  });
  await page.goto('/#title=New&style=minimal&seed=n');
  await expect(page.locator('#kept-list li')).toHaveCount(4);
  await page.locator('#keep').click();
  await expect(page.locator('#toast')).toContainText('Storage is full');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('book-cover-generator:kept') ?? '[]'));
  expect(stored.map((/** @type {{ title: string }} */ k) => k.title)).toEqual(['New', 'A', 'B', 'C', 'D']);
  // The newest keep theirs.
  expect(stored[0].svg).toMatch(/^<svg [\s\S]*New/);
  expect(stored.at(-1).svg).toBeUndefined();
});

test('a variation clicked before its thumbnail is drawn never clears the variation', async ({ page }) => {
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () =>
      /** @type {HTMLElement | null} */ (document.querySelector('.variation'))?.click(),
    ),
  );
  await page.goto('/#title=T&style=minimal&seed=keep');
  await ready(page);
  // (Either the click came too early and did nothing, or the thumbnail was drawn and it applied that.)
  await expect(page.locator('#seed')).not.toHaveValue('');
  await expect(page.locator('#meta')).not.toContainText('from the title');
});

test('a style’s variants can be pinned, links hold them, and another style starts afresh', async ({ page }) => {
  await page.goto('/#title=Skyline&style=silhouette&seed=v');
  const box = page.locator('#style-variants');
  await expect(box).toBeVisible();
  await expect(box.locator('[data-variant="scene"][data-value=""]')).toHaveAttribute('aria-pressed', 'true');
  // Auto outlines what the variation picked.
  const picked = (await box.locator('.chip.picked').getAttribute('data-value')) ?? '';
  expect(['city', 'forest']).toContain(picked);
  const other = picked === 'city' ? 'forest' : 'city';
  const before = await svgOf(page, '#preview');
  await box.locator(`[data-value="${other}"]`).click();
  await expect(page).toHaveURL(new RegExp(`style=silhouette&variant=scene\\.${other}&`));
  await expect(box.locator(`[data-value="${other}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => svgSoon(page, '#preview')).not.toBe(before);
  await page.locator('#undo').click();
  await expect(box.locator('[data-value=""]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).not.toHaveURL(/variant=/);
  await page.locator('#redo').click();
  await expect(box.locator(`[data-value="${other}"]`)).toHaveAttribute('aria-pressed', 'true');
  // Another style: none pinned, and its own choices.
  await page.locator('.tile[data-style="minimal"]').click();
  await selected(page, 'minimal');
  await expect(page).not.toHaveURL(/variant=/);
  await expect(box.locator('[data-variant="align"]')).toHaveText(['Auto', 'Centred', 'Left']);
  await page.locator('.tile[data-style="swiss"]').click();
  await expect(box).toBeHidden();
  // A link names its pins; ones another style has are ignored.
  await page.goto('about:blank');
  await page.goto('/#title=T&style=minimal&variant=align.start-scene.forest&seed=l');
  await expect(box.locator('[data-variant="align"][data-value="start"]')).toHaveAttribute('aria-pressed', 'true');
  const left = await svgOf(page, '#preview');
  await box.locator('[data-variant="align"][data-value="middle"]').click();
  await expect.poll(() => svgSoon(page, '#preview')).not.toBe(left);
});

test('a title font and case of your own: in the link, kept across styles, and in the rail', async ({ page }) => {
  await page.goto('/#title=The+Lighthouse+Keeper&style=minimal&seed=t');
  await expect(page.locator('[data-case=""]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#title-font').selectOption('didone');
  await expect(page).toHaveURL(/style=minimal&font=didone&/);
  await expect.poll(() => svgSoon(page, '#preview')).toContain('font-family="Didot,');
  await page.locator('[data-case="upper"]').click();
  await expect(page).toHaveURL(/font=didone&case=upper&/);
  await expect.poll(() => svgSoon(page, '#preview')).toContain('LIGHTHOUSE');
  // Another style keeps them, and so do the rail's thumbnails.
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await expect(page).toHaveURL(/font=didone&case=upper/);
  await expect.poll(() => svgSoon(page, '.tile[data-style="bigtype"] img')).toContain('font-family="Didot,');
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  await expect(page.locator('[data-case=""]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#title-font')).toHaveValue('didone');
  // Styles with lettering of their own say so.
  await page.locator('.tile[data-style="typewriter"]').click();
  await expect(page.locator('#type-note')).toBeVisible();
});

test('a series line and a credit: typed in, on the cover and in the link', async ({ page }) => {
  await page.goto('/#title=The+Lighthouse+Keeper&style=minimal&seed=s');
  await expect(page.locator('#more-text')).not.toHaveAttribute('open');
  await page.locator('#more-text summary').click();
  await page.locator('#series').fill('Book Two of the Ember Cycle');
  await page.locator('#credit').fill('Translated by Edith Grossman');
  await expect.poll(() => svgSoon(page, '#preview')).toContain('BOOK TWO OF THE EMBER CYCLE');
  expect(await svgOf(page, '#preview')).toContain('Translated by Edith Grossman');
  await expect(page).toHaveURL(/series=Book\+Two\+of\+the\+Ember\+Cycle&credit=Translated\+by\+Edith\+Grossman/);
  await page.locator('#badge').fill('Bestseller');
  await expect.poll(() => svgSoon(page, '#preview')).toContain('aria-label="Bestseller"');
  await expect(page).toHaveURL(/badge=Bestseller/);
  // Closed, it stays closed while you work.
  await page.locator('#more-text summary').click();
  await expect(page.locator('#more-text')).not.toHaveAttribute('open');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await page.locator('#title').fill('Another Title');
  await expect(page.locator('#more-text')).not.toHaveAttribute('open');
  // Undo brings back what was typed there: the section opens to show it.
  await page.locator('#more-text summary').click();
  await page.locator('#series').fill('');
  await page.locator('#series').blur();
  await page.locator('#more-text summary').click();
  await expect(page.locator('#more-text')).not.toHaveAttribute('open');
  await page.locator('#undo').click();
  await expect(page.locator('#more-text')).toHaveAttribute('open');
  // A link with them opens the section that holds them.
  const link = new URL(page.url()).hash;
  await page.goto('about:blank');
  await page.goto(`/${link}`);
  await expect(page.locator('#more-text')).toHaveAttribute('open');
  await expect(page.locator('#series')).toHaveValue('Book Two of the Ember Cycle');
});

test('mockups: a preview, a line for cards, and a PNG at the mockup’s size', async ({ page }) => {
  await page.goto('/#title=Mock&author=Up&style=artdeco&seed=m');
  await expect(page.locator('#mockup-preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(page.locator('#mockup-text')).toBeHidden();
  await page.locator('#mockup-kind').selectOption('card');
  await expect(page.locator('#mockup-text')).toBeVisible();
  await page.locator('#mockup-text').fill('Out now');
  await expect.poll(() => svgSoon(page, '#mockup-preview')).toContain('Out now');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#dl-mockup').click()]);
  expect(download.suggestedFilename()).toBe('mock-card.png');
  const png = await readFile(/** @type {string} */ (await download.path()));
  expect(pngSize(png)).toEqual([1200, 630]);
  await expect(page.locator('#toast')).toContainText('1200 × 630');
  // Product shots are twice the mockup's own size.
  await page.locator('#mockup-kind').selectOption('book');
  const [book] = await Promise.all([page.waitForEvent('download'), page.locator('#dl-mockup').click()]);
  expect(book.suggestedFilename()).toBe('mock-book.png');
  const [w] = pngSize(await readFile(/** @type {string} */ (await book.path())));
  expect(w).toBeGreaterThan(1200);
});

test('many covers: a list in, a preview, and a ZIP of one design for every book', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&palette=mint&seed=series');
  await page.locator('#many summary').click();
  await page.locator('#many-list').fill('Dune | Frank Herbert\nFish & Chips | Ana | A Novel\nThird');
  await expect(page.locator('#many-count')).toHaveText('3 books');
  await expect(page.locator('#many-preview img')).toHaveCount(3);
  await expect.poll(() => svgSoon(page, '#many-preview li:nth-child(2) img')).toContain('Fish &amp; Chips');
  // The preview follows the design.
  await page.locator('.tile[data-style="swiss"]').click();
  await expect.poll(() => svgSoon(page, '#many-preview li:first-child img')).toContain('Dune');
  await page.locator('#many-format').selectOption('svg');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#many-download').click()]);
  expect(download.suggestedFilename()).toBe('covers.zip');
  const files = unzip(await readFile(/** @type {string} */ (await download.path())));
  expect([...files.keys()]).toEqual(['1-dune.svg', '2-fish-chips.svg', '3-third.svg']);
  // One design: the same palette for every book (mint), unless each gets its own.
  for (const svg of files.values()) expect(svg.toString()).toContain('#e4f1ea');
  await expect(page.locator('#toast')).toContainText('Saved 3 covers');
  await page.locator('label.switch:has(#many-palettes)').click();
  const [again] = await Promise.all([page.waitForEvent('download'), page.locator('#many-download').click()]);
  const varied = [...unzip(await readFile(/** @type {string} */ (await again.path()))).values()].map((b) =>
    b.toString(),
  );
  expect(varied.filter((svg) => svg.includes('#e4f1ea'))).toHaveLength(1);
  // A book that can't be made is left out and reported, in the panel; the rest are saved.
  await expect(page.locator('#many-failed')).toBeHidden();
  await page.locator('#many-list').fill('title,style\nGood,swiss\nBad,nope');
  await expect(page.locator('#many-count')).toHaveText('2 books');
  const [partial] = await Promise.all([page.waitForEvent('download'), page.locator('#many-download').click()]);
  expect([...unzip(await readFile(/** @type {string} */ (await partial.path()))).keys()]).toEqual(['1-good.svg']);
  await expect(page.locator('#toast')).toContainText('1 couldn’t be made');
  await expect(page.locator('#many-failed-list li')).toHaveText([/^2\. Bad: .*nope/]);
  // None: no file, and an alert says so.
  await page.locator('#many-list').fill('title,style\nBad,nope');
  await page.locator('#many-download').click();
  await expect(page.locator('#alert-text')).toContainText('None of the books could be made');
});

test('a paperback for print: the whole cover, sized from the trim and pages, as a PDF', async ({ page }) => {
  await page.goto('/#title=The%20Lighthouse%20Keeper&author=Mara%20Ellison&style=artdeco&seed=p');
  await ready(page);
  await page.locator('#print summary').click();
  await expect(page.locator('#print-size')).toHaveText('Whole cover 12.926 × 9.25 in, spine 0.676 in');
  await page.locator('#print-trim').selectOption('5.5x8.5');
  await page.locator('#print-paper').selectOption('cream');
  await page.locator('#print-pages').fill('240');
  await page.locator('#print-hook').fill('Some lights are kept burning.');
  await page
    .locator('#print-blurb')
    .fill('When the lamp goes dark, Ada rows out.\n\nWhat she finds will change everything.');
  await page.locator('#print-imprint').fill('Harbour Press');
  // The back's colour: a swatch of the cover's palette.
  await expect(page.locator('#print-back [data-key="bg"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#print-back [data-key="ink"]').click();
  await expect(page.locator('#print-back [data-key="ink"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#print-back [data-key="bg"]')).toHaveAttribute('aria-pressed', 'false');
  // 2 × 5.5 + 240 × 0.0025 + 2 × 0.125 = 11.85 wide; 8.5 + 0.25 = 8.75 high.
  await expect(page.locator('#print-size')).toHaveText('Whole cover 11.85 × 8.75 in, spine 0.6 in');
  const preview = await svgSoon(page, '#print-preview');
  expect(preview).toContain('Some lights are kept burning.');
  expect(preview).toContain('stroke-dasharray');
  // The preview follows the design.
  await page.locator('.tile[data-style="swiss"]').click();
  await expect.poll(() => svgSoon(page, '#print-preview')).not.toBe(preview);
  // Under 80 pages, the spine stays blank, and the panel says why.
  await page.locator('#print-pages').fill('60');
  await expect(page.locator('#print-size')).toContainText('(no spine text: under 80 pages)');
  await page.locator('#print-pages').fill('10');
  await expect(page.locator('#print-size')).toContainText('pages must be a whole number from 24 to 776 on cream paper');
  await expect(page.locator('#print-preview')).not.toHaveAttribute('src');
  await expect(page.locator('#print-pages')).toHaveAttribute('aria-invalid', 'true');
  // The field's range follows the paper (standard colour takes 72 to 600 pages).
  await page.locator('#print-paper').selectOption('color');
  await expect(page.locator('#print-pages')).toHaveAttribute('min', '72');
  await expect(page.locator('#print-pages')).toHaveAttribute('max', '600');
  // ...and the trim: 8.5 × 11 in takes at most 590 pages on white paper.
  await page.locator('#print-paper').selectOption('white');
  await page.locator('#print-trim').selectOption('8.5x11');
  await expect(page.locator('#print-pages')).toHaveAttribute('max', '590');
  await page.locator('#print-trim').selectOption('5.5x8.5');
  await expect(page.locator('#print-pages')).toHaveAttribute('max', '828');
  await page.locator('#print-paper').selectOption('cream');
  await page.locator('#print-pages').fill('240');
  await expect(page.locator('#print-pages')).not.toHaveAttribute('aria-invalid');
  // The PDF: one page, the whole cover at 300 dpi, its trim box an eighth of an inch in.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#print-pdf').click()]);
  expect(download.suggestedFilename()).toBe('the-lighthouse-keeper-paperback-5.5x8.5.pdf');
  const pdf = (await readFile(/** @type {string} */ (await download.path()))).toString('latin1');
  expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
  expect(pdf.endsWith('%%EOF\n')).toBe(true);
  expect(pdf).toContain('/MediaBox [0 0 853.2 630] /BleedBox [0 0 853.2 630] /TrimBox [9 9 844.2 621]');
  expect(pdf).toMatch(/\/Width 3555 \/Height 2625 \/ColorSpace \/DeviceRGB/);
  await expect(page.locator('#toast')).toContainText('Saved the print PDF · 11.85 × 8.75 in at 300 dpi');
  // The settings stay for the next visit (in this browser).
  await page.reload();
  await ready(page);
  await page.locator('#print summary').click();
  await expect(page.locator('#print-trim')).toHaveValue('5.5x8.5');
  await expect(page.locator('#print-blurb')).toHaveValue(
    'When the lamp goes dark, Ada rows out.\n\nWhat she finds will change everything.',
  );
  await expect(page.locator('#print-back [data-key="ink"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the spine keeps 1/16 in clear of the ink of accents and tails, in this browser’s fonts', async ({ page }) => {
  await page.goto('/#title=Ink&style=minimal&seed=s');
  await ready(page);
  const rows = await page.evaluate(async () => {
    const { createPrintCover } = await import('/src/index.js');
    const ctx = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
    const out = [];
    for (const [title, font] of [
      ['Été à Paris', undefined],
      ['Ça Ira', 'serif'],
      ['Quiet Days', 'serif'],
      ['The Lighthouse Keeper', undefined],
      ['Fahrenheit 451', 'serif'],
      ['Jade', 'garamond'],
      ['[Redacted]', undefined],
    ]) {
      const print = createPrintCover({ title, author: 'Ann Lee', font, seed: 's', style: 'minimal' }, { pages: 120 });
      // (Read from the markup: the page's Trusted Types policy rightly refuses DOMParser.)
      const spine = /rotate\(90\)">([\s\S]*?)<\/g><\/g>/.exec(print.svg)?.[1] ?? '';
      const half = (print.inches.spine * 96) / 2 - 6;
      for (const [, attrs, y, text] of spine.matchAll(/<g ([^>]*)><text x="[^"]*" y="([^"]+)">([^<]*)<\/text>/g)) {
        const attr = (/** @type {string} */ name) =>
          (new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1] ?? '').replaceAll('&apos;', "'").replaceAll('&quot;', '"');
        ctx.font = `${attr('font-weight') || 400} ${attr('font-size')}px ${attr('font-family')}`;
        const m = ctx.measureText(text);
        out.push({
          line: text,
          top: Number(y) - m.actualBoundingBoxAscent,
          bottom: Number(y) + m.actualBoundingBoxDescent,
          half,
        });
      }
    }
    return out;
  });
  expect(rows.length).toBe(14);
  for (const { line, top, bottom, half } of rows) {
    expect(top, `${line}: ink top`).toBeGreaterThanOrEqual(-half - 0.5);
    expect(bottom, `${line}: ink bottom`).toBeLessThanOrEqual(half + 0.5);
  }
});

test('a print cover too large for one canvas is drawn in strips', async ({ page }) => {
  await page.goto('/#title=Strips&style=minimal&seed=s');
  await ready(page);
  const result = await page.evaluate(async () => {
    const { createPrintCover } = await import('/src/index.js');
    const { svgToPdf } = await import('/src/browser.js');
    // (A "$&" in the title, which a string replacement would read as a pattern.)
    const print = createPrintCover({ title: 'Rock$&Roll', style: 'minimal', seed: 's' }, { pages: 100, trim: '5x8' });
    const blob = await svgToPdf(print.svg, { dpi: 100, maxPixels: 300_000, bleed: 0.125 });
    // What would make a malformed PDF, or a page of the wrong size, is refused.
    /** @param {string} svg @param {object} opts */
    const refused = (svg, opts) =>
      svgToPdf(svg, opts).then(
        () => 'made',
        (err) => String(err.message),
      );
    const errors = await Promise.all([
      refused(print.svg, { bleed: Number.NaN }),
      refused(print.svg, { bleed: 5 }),
      refused('<svg xmlns="http://www.w3.org/2000/svg" width="330mm" height="235mm" viewBox="0 0 330 235"/>', {}),
    ]);
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    return {
      type: blob.type,
      errors,
      images: [...text.matchAll(/\/Subtype \/Image \/Width (\d+) \/Height (\d+)/g)].map((m) => [
        Number(m[1]),
        Number(m[2]),
      ]),
    };
  });
  expect(result.type).toBe('application/pdf');
  expect(result.errors[0]).toMatch(/bleed must be a number of inches/);
  expect(result.errors[1]).toMatch(/bleed must be a number of inches/);
  expect(result.errors[2]).toMatch(/width is in mm; give it in px/);
  // In strips, an SVG whose viewBox isn't the shape of its size is drawn as it is whole: each strip
  // is the part of the whole page it covers (here, a square centred on a 2:1 page).
  const red = await page.evaluate(async () => {
    const { svgToPdf } = await import('/src/browser.js');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ff0000"/></svg>';
    /** Where the red is across the PDF's page, its images side by side. @param {Blob} blob */
    const span = async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const text = new TextDecoder('latin1').decode(bytes);
      const images = [...text.matchAll(/\/Width (\d+) \/Height (\d+)[^>]*\/Length (\d+) >>\nstream\n/g)].map((m) => {
        const start = /** @type {number} */ (m.index) + m[0].length;
        return { w: Number(m[1]), h: Number(m[2]), jpeg: bytes.slice(start, start + Number(m[3])) };
      });
      const canvas = document.createElement('canvas');
      canvas.width = images.reduce((sum, im) => sum + im.w, 0);
      canvas.height = images[0].h;
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      let x = 0;
      for (const im of images) {
        ctx.drawImage(await createImageBitmap(new Blob([im.jpeg], { type: 'image/jpeg' })), x, 0);
        x += im.w;
      }
      const row = ctx.getImageData(0, canvas.height >> 1, canvas.width, 1).data;
      const reds = [];
      for (let i = 0; i < canvas.width; i++) if (row[i * 4] > 200 && row[i * 4 + 1] < 80) reds.push(i);
      return { strips: images.length, from: reds[0], to: reds[reds.length - 1] };
    };
    return {
      whole: await span(await svgToPdf(svg, { dpi: 100 })),
      strips: await span(await svgToPdf(svg, { dpi: 100, maxPixels: 156_000 })),
    };
  });
  expect(red.strips.strips).toBeGreaterThan(1);
  expect(Math.abs(red.strips.from - red.whole.from)).toBeLessThanOrEqual(2);
  expect(Math.abs(red.strips.to - red.whole.to)).toBeLessThanOrEqual(2);
  expect(Math.abs(red.whole.from - 250)).toBeLessThanOrEqual(2);
  // 10.475 × 8.25 in at 100 dpi is 1048 × 825 px: three strips of at most 300,000 px, side by side.
  expect(result.images.length).toBe(3);
  expect(result.images.reduce((sum, [w]) => sum + w, 0)).toBe(1048);
  for (const [w, h] of result.images) expect(w * h).toBeLessThanOrEqual(300_000);
  expect(result.images.every(([, h]) => h === 825)).toBe(true);
});

test('a genre filters the rail, and Randomize and the arrows stay in it', async ({ page }) => {
  await page.goto('/#title=Night&style=minimal&seed=g');
  await page.locator('#genre').selectOption('horror');
  const visible = page.locator('.tile:not([hidden])');
  const shown = () => visible.evaluateAll((tiles) => tiles.map((t) => /** @type {HTMLElement} */ (t).dataset.style));
  // The horror styles, and the selected style, which shows in or out of the genre.
  await expect(visible).toHaveCount(4);
  expect((await shown()).sort()).toEqual(['hollow', 'minimal', 'noir', 'silhouette']);
  const horror = ['hollow', 'noir', 'silhouette'];
  for (let i = 0; i < 3; i++) {
    await page.locator('#randomize').click();
    await expect.poll(() => page.locator('.tile[aria-pressed="true"]').getAttribute('data-style')).not.toBe('minimal');
    expect(horror).toContain(await page.locator('.tile[aria-pressed="true"]').getAttribute('data-style'));
  }
  await expect(visible).toHaveCount(3);
  // Families without a horror style are hidden, with their links.
  await expect(page.locator('.rail-jump:not([hidden])')).toHaveCount(2);
  await page.locator('body').press('ArrowRight');
  expect(horror).toContain(await page.locator('.tile[aria-pressed="true"]').getAttribute('data-style'));
  // A style picked from elsewhere shows in the rail even outside the genre.
  await page.evaluate(() => {
    location.hash = 'title=Night&style=minimal&seed=g';
  });
  await expect(page.locator('.tile[data-style="minimal"]')).toBeVisible();
  await expect(visible).toHaveCount(4);
  // The choice is remembered, and All genres shows every style again.
  await page.reload();
  await expect(page.locator('#genre')).toHaveValue('horror');
  await page.locator('#genre').selectOption('');
  await expect(visible).toHaveCount(39);
});

test('a book’s genre in a list picks a style that suits it, unless the design’s does', async ({ page }) => {
  await page.goto('/#title=x&style=bauhaus&seed=g&palette=mint');
  await page.locator('#many summary').click();
  // Bauhaus suits children's books but not horror: only the horror row changes style.
  await page.locator('#many-list').fill('title,genre\nNight,horror\nNight,\nNight,children');
  await expect(page.locator('#many-preview img')).toHaveCount(3);
  // (svgOf waits for each to be drawn: the list draws a few a frame.)
  const [horror, plain, children] = await Promise.all(
    [1, 2, 3].map((i) => svgOf(page, `#many-preview li:nth-child(${i}) img`)),
  );
  expect(horror).not.toBe(plain);
  expect(children).toBe(plain);
});

test('with no link, the first cover is in the genre chosen last time', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('book-cover-generator:genre', 'horror'));
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#genre')).toHaveValue('horror');
  const style = await page.locator('.tile[aria-pressed="true"]').getAttribute('data-style');
  expect(['hollow', 'noir', 'silhouette']).toContain(style);
});

test('a focused tile that leaves the genre hands focus to the selected one', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('book-cover-generator:genre', 'horror'));
  await page.goto('/#title=Night&style=minimal&seed=f');
  await page.locator('.tile[data-style="minimal"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tile[data-style="minimal"]')).toBeHidden();
  await expect(page.locator('.tile[aria-pressed="true"]')).toBeFocused();
});

test('a link may name the style, palette and font as the menus do, as the HTTP API reads it', async ({ page }) => {
  await page.goto('/#title=Named&style=Art%20Deco&palette=Deep%20Sea&font=Old%20style&seed=n');
  await selected(page, 'artdeco');
  await expect(page.locator('#title-font')).toHaveValue('garamond');
  await expect(page.locator('#meta')).toContainText('Deep Sea');
  // Pins, case and texture as the HTTP API reads them too.
  await page.evaluate(() => {
    location.hash = 'title=Named&style=Silhouette&variant=Scene.Forest&case=Upper&texture=true&palette=random&seed=n';
  });
  await selected(page, 'silhouette');
  await expect(page.locator('#style-variants [data-value="forest"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-case="upper"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#texture')).toBeChecked();
});

test('the first paint takes a link’s format as the app does: the last given, trimmed', async ({ page }) => {
  await page.goto('/#title=Shape&style=minimal&format=paperback&format=%20square&seed=f');
  expect(await page.evaluate(() => document.documentElement.dataset.coverFormat)).toBe('square');
  await page.goto('about:blank');
  // A size the library can't make isn't painted (the app keeps its own).
  await page.goto('/#title=Shape&style=minimal&format=10x90&seed=f');
  expect(await page.evaluate(() => document.documentElement.dataset.coverFormat ?? '')).not.toBe('custom');
});

test.describe('on an iPhone', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  test('export scales stay within what its canvas can draw', async ({ page }) => {
    // 1800 × 2700 is 4.9 MP: 2× would be 19.4, over the iPhone's 16.7.
    await page.goto('/#title=Print&style=minimal&format=1800x2700&seed=p');
    await expect(page.locator('[data-scale="2"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-scale="1"]')).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test('<book-cover> draws a cover on a page from its attributes', async ({ page }) => {
  // (On the app's page, whose CSP allows no inline styles and requires Trusted Types.)
  await page.goto('/#title=Host&style=minimal&seed=h');
  const result = await page.evaluate(async () => {
    await import('/src/element.js');
    const el = /** @type {import('../src/element.js').BookCover} */ (document.createElement('book-cover'));
    el.setAttribute('cover-title', 'Dune');
    el.setAttribute('author', 'Frank Herbert');
    el.setAttribute('cover-style', 'Art Deco');
    el.setAttribute('seed', 'e');
    el.style.width = '300px';
    const drawn = new Promise((resolve) => el.addEventListener('cover', resolve, { once: true }));
    document.body.append(el);
    await drawn;
    const img = /** @type {HTMLImageElement} */ (el.shadowRoot?.querySelector('img'));
    await img.decode();
    const box = img.getBoundingClientRect();
    const first = {
      style: el.cover?.style,
      alt: img.alt,
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
    // An attribute changed draws again; one that can't make a cover says so.
    el.setAttribute('cover-title', 'Arrakis');
    await new Promise((resolve) => el.addEventListener('cover', resolve, { once: true }));
    const retitled = img.alt;
    const failed = new Promise((resolve) =>
      el.addEventListener('cover-error', (e) => resolve(String(/** @type {CustomEvent} */ (e).detail)), { once: true }),
    );
    el.setAttribute('cover-style', 'nope');
    return { first, retitled, error: await failed, src: img.getAttribute('src') };
  });
  expect(result.first).toEqual({ style: 'artdeco', alt: 'Cover: Dune by Frank Herbert', width: 300, height: 450 });
  // An element on the page before its class is defined (as a page's HTML is) draws once when
  // upgraded; texture="0", as links write it, is off.
  const upgraded = await page.evaluate(async () => {
    const { BookCover } = await import('/src/element.js');
    const late = document.createElement('book-cover-late');
    late.setAttribute('cover-title', 'Late');
    late.setAttribute('lang', 'zh-Hant');
    late.setAttribute('texture', '0');
    let drawn = 0;
    late.addEventListener('cover', () => (drawn += 1));
    document.body.append(late);
    customElements.define('book-cover-late', class extends BookCover {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Moved elsewhere on the page, with the same attributes: not drawn again.
    document.body.prepend(late);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { drawn, texture: /** @type {any} */ (late).options().texture, lang: /** @type {any} */ (late).cover.lang };
  });
  expect(upgraded).toEqual({ drawn: 1, texture: false, lang: 'zh-Hant' });
  expect(result.retitled).toBe('Cover: Arrakis by Frank Herbert');
  expect(result.error).toContain('Unknown style "nope"');
  expect(result.src).toBeNull();
});

test('Many covers previews thumbnails, and the page never grows wider than the window', async ({ page }) => {
  // (A custom size draws every cover at 1800 × 2700: still thumbnails.)
  for (const [width, format] of [
    [1440, 'paperback'],
    [1024, '1800x2700'],
    [390, '1800x2700'],
  ]) {
    await page.setViewportSize({ width: Number(width), height: 900 });
    await page.goto('about:blank');
    await page.goto(`/#title=T&style=minimal&seed=m&format=${format}`);
    await page.locator('#many summary').click();
    await page.locator('#many-list').fill('Dune | Frank Herbert\nFish | Ana\nThird\nFourth | X');
    await expect(page.locator('#many-preview img')).toHaveCount(4);
    await expect(page.locator('#many-preview li:nth-child(4) img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
    const [list, thumb] = await Promise.all([
      page.locator('#many-preview').boundingBox(),
      page.locator('#many-preview li:nth-child(4) img').boundingBox(),
    ]);
    expect(thumb && list && thumb.x + thumb.width <= list.x + list.width + 0.5, `${width}`).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${width}`).toBeLessThanOrEqual(0);
  }
});

test('K and the star keep the design; pressed again, it is removed, with an Undo', async ({ page }) => {
  await page.goto('/#title=Starred&style=minimal&seed=k');
  await ready(page);
  const star = page.locator('#keep');
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await page.locator('body').press('KeyK');
  await expect(page.locator('#kept-list li')).toHaveCount(1);
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  // Another design is not kept; back to this one, it is.
  await page.locator('.tile[data-style="swiss"]').click();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#undo').click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await star.click();
  await expect(page.locator('#kept-list li')).toHaveCount(0);
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#toast')).toContainText('Removed');
  await page.locator('#toast button', { hasText: 'Undo' }).click();
  await expect(page.locator('#kept-list li')).toHaveCount(1);
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  // The tray's remove button offers it back too.
  await page.locator('.kept-remove').click();
  await expect(page.locator('#kept-list li')).toHaveCount(0);
  await page.locator('#toast button', { hasText: 'Undo' }).click();
  await expect(page.locator('#kept-list li')).toHaveCount(1);
  // With single-key shortcuts off, K is a letter like any other.
  await page.locator('#shortcuts-toggle').click();
  await page.locator('body').press('KeyK');
  await expect(page.locator('#kept-list li')).toHaveCount(1);
});

test('the main download is JPEG for an eBook, which KDP takes, and PNG otherwise', async ({ page }) => {
  await page.goto('/#title=Kindle&style=minimal&seed=e&format=ebook');
  await expect(page.locator('#download')).toContainText('Download JPEG');
  await expect(page.locator('#dl-jpeg')).toBeHidden();
  await expect(page.locator('#dl-png')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  expect(download.suggestedFilename()).toBe('kindle-minimal.jpg');
  await page.locator('[data-format="paperback"]').click();
  await expect(page.locator('#download')).toContainText('Download PNG');
  await expect(page.locator('#dl-png')).toBeHidden();
  await expect(page.locator('#dl-jpeg')).toBeVisible();
});

test('Browse brings the style into view in the rail, without scrolling the page away', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#title=Browse&style=memphis&seed=b');
  await ready(page);
  await page.locator('#style-name').click();
  const tile = page.locator('.tile[data-style="memphis"]');
  await expect(tile).toBeFocused();
  await expect(tile).toBeInViewport({ ratio: 1 });
  // The page moves only as far as the rail, longer than the window here, needs to show it.
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(150);
  await expect(page.locator('#preview')).toBeInViewport({ ratio: 0.9 });
  // A style at the top of the rail: the page doesn't move at all.
  await page.evaluate(() => {
    location.hash = 'title=Browse&style=swiss&seed=b';
  });
  await selected(page, 'swiss');
  await page.evaluate(() => window.scrollTo(0, 0));
  // (Clicked from the page: Playwright's own click would scroll to it first.)
  await page.evaluate(() => document.getElementById('style-name')?.click());
  await expect(page.locator('.tile[data-style="swiss"]')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('on a laptop the cover, every export and the variations are in view together', async ({ page }) => {
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/#title=In+View&style=artdeco&seed=v');
    await ready(page);
    await expect(page.locator('#download'), `${width}`).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#dl-svg'), `${width}`).toBeInViewport({ ratio: 1 });
    // Scrolled through the controls, the whole stage stays in view.
    await page.evaluate(() => window.scrollTo(0, 400));
    for (const id of ['#book', '#download', '#copy-link', '#variations']) {
      await expect(page.locator(id), `${width}: ${id}`).toBeInViewport({ ratio: 1 });
    }
  }
});

test('Format comes right after the text, with a way to the back and spine', async ({ page }) => {
  await page.goto('/#title=Paper&style=minimal&seed=p');
  const top = async (/** @type {string} */ selector) => (await page.locator(selector).boundingBox())?.y ?? NaN;
  expect(await top('#format')).toBeLessThan(await top('#randomize'));
  expect(await top('#format')).toBeGreaterThan(await top('#subtitle'));
  await page.locator('#print-link').click();
  await expect(page.locator('#print')).toHaveAttribute('open', '');
  await expect(page.locator('#print summary')).toBeFocused();
  await expect(page.locator('#print-preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  // An eBook has no back to print.
  await page.locator('[data-format="ebook"]').click();
  await expect(page.locator('#print-link')).toBeHidden();
});

test('a first visit opens a sample book in a style and palette that suit it, its title ready to replace', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const title = await page.locator('#title').inputValue();
  const style = await page.locator('.tile[aria-pressed="true"]').getAttribute('data-style');
  // (Some of the pairs; the README's sheet has them all.)
  /** @type {Record<string, string>} */
  const pairs = {
    'The Lighthouse Keeper': 'artdeco',
    'Signal Lost': 'thriller',
    'Neon Tide': 'bigtype',
    'Hollow Season': 'silhouette',
    'Midnight Arithmetic': 'blueprint',
  };
  if (pairs[title]) expect(style).toBe(pairs[title]);
  // A palette picked for it, not left to chance.
  await expect(page.locator('[data-palette="auto"]')).toHaveAttribute('aria-pressed', 'false');
  // The first focus selects the sample title, so typing replaces it.
  await page.locator('#title').click();
  await page.keyboard.type('Mine');
  await expect(page.locator('#title')).toHaveValue('Mine');
  // Not on a link's own title.
  await page.goto('about:blank');
  await page.goto('/#title=Linked&style=minimal&seed=l');
  await page.locator('#title').click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(page.locator('#title')).toHaveValue('Linked!');
});

test('errors look different, are announced at once and stay until dismissed', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#title=E&style=minimal&seed=e&format=1600x2560');
  await page.locator('#size-w').fill('5');
  await page.locator('#size-w').blur();
  const alert = page.locator('#alert');
  await expect(alert).toHaveClass(/show/);
  await expect(page.getByRole('alert')).toContainText('Sizes go from 50');
  await page.clock.runFor(30_000);
  await expect(alert).toHaveClass(/show/);
  await page.keyboard.press('Escape');
  await expect(alert).not.toHaveClass(/show/);
  await expect(page.locator('#alert-close')).toBeHidden();
});

test('the gallery draws every style, and a click opens the generator in it', async ({ page }) => {
  // (Without its slash, sent to it with the query, as production does.)
  await page.goto('/gallery?from=test');
  await expect(page).toHaveURL(/\/gallery\/\?from=test$/);
  const covers = page.locator('book-cover');
  await expect(covers).toHaveCount(39);
  const drawn = () =>
    covers.evaluateAll((els) => els.filter((el) => el.shadowRoot?.querySelector('img')?.getAttribute('src')).length);
  // Drawn as they come into view (loading="lazy"): the first are, the last only once scrolled to.
  await expect.poll(drawn).toBeGreaterThan(0);
  expect(await drawn()).toBeLessThan(39);
  for (let i = 0; i < 39; i += 4) await covers.nth(i).scrollIntoViewIfNeeded();
  await covers.last().scrollIntoViewIfNeeded();
  await expect.poll(drawn).toBe(39);
  // Each style with a book of its own (not seven titles shared by all).
  const titles = await covers.evaluateAll((els) => els.map((el) => el.getAttribute('cover-title')));
  expect(new Set(titles).size).toBe(39);
  // The families, named as in the app, with links to each.
  await expect(page.locator('.gallery-group h2')).toContainText(['Typographic', 'Themed']);
  await expect(page.locator('.gallery-families a')).toHaveCount(6);
  await page.locator('a', { has: page.locator('book-cover[cover-style="crest"]') }).click();
  await selected(page, 'crest');
  await expect(page.locator('#title')).toHaveValue('Kingdom of Ash');
});

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`the gallery has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/gallery/');
    await expect(page.locator('book-cover')).toHaveCount(39);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('your design goes to the gallery and comes back in the style you pick', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#title=My%20Own%20Book&author=Me&style=minimal&variant=align.start&seed=mine&palette=mint');
  await ready(page);
  // Every link to the gallery carries it, before any click (opened in a new tab, it would too).
  const links = page.locator('a[href^="/gallery/"]');
  await expect(links).toHaveCount(2);
  for (const href of await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')))) {
    expect(href).toMatch(/^\/gallery\/#title=My\+Own\+Book&/);
  }
  await page.locator('#nav-gallery').click();
  await expect(page).toHaveURL(/\/gallery\/#title=My\+Own\+Book&/);
  // Every cover shows your book, as the link under it opens it.
  await expect(page.locator('book-cover[cover-style="crest"]')).toHaveAttribute('cover-title', 'My Own Book');
  await expect(page.locator('book-cover[cover-style="crest"]')).toHaveAttribute('palette', 'mint');
  await expect(page.locator('a[data-app]', { hasText: 'Make a cover' })).toHaveAttribute(
    'href',
    /^\/#title=My\+Own\+Book&/,
  );
  // Your pins stay with your own style, and are left behind for another, as in the app.
  await expect(page.locator('a[data-style="minimal"]')).toHaveAttribute('href', /style=minimal&variant=align\.start/);
  await expect(page.locator('a[data-style="crest"]')).not.toHaveAttribute('href', /variant=/);
  await expect(page.locator('.site-header a[aria-current="page"]')).toHaveAttribute('href', /^\/gallery\/#title=/);
  // The header's links back to the app keep the design, and the place they go to.
  await page.locator('.site-header a', { hasText: 'Developers' }).click();
  await expect(page.locator('#title')).toHaveValue('My Own Book');
  await expect(page.locator('#usage')).toBeInViewport();
  // Keyboard focus starts there too, so Tab goes on from it rather than from the top.
  await expect(page.locator('#usage')).toBeFocused();
  await expect(page).not.toHaveURL(/usage/);
  await page.goBack();
  await page.locator('a[data-style="crest"]').click();
  await selected(page, 'crest');
  await expect(page.locator('#title')).toHaveValue('My Own Book');
  await expect(page.locator('#author')).toHaveValue('Me');
});

test('lazy covers hold their own shape, and draw at once when no longer lazy', async ({ page }) => {
  await page.goto('/#title=Host&style=minimal&seed=h');
  const shape = await page.evaluate(async () => {
    await import('/src/element.js');
    const spacer = document.createElement('div');
    spacer.style.height = '5000px';
    document.body.append(spacer);
    const el = /** @type {any} */ (document.createElement('book-cover'));
    el.setAttribute('loading', 'LAZY');
    el.setAttribute('author', 'Ann');
    el.style.width = '200px';
    document.body.append(el);
    const img = el.shadowRoot.querySelector('img');
    const untitled = img.alt;
    // Changed while it waits: its name and shape follow.
    el.setAttribute('cover-title', 'Square');
    el.setAttribute('format', 'square');
    const before = {
      src: img.getAttribute('src'),
      height: Math.round(img.getBoundingClientRect().height),
      alt: img.alt,
    };
    const drawn = new Promise((resolve) => el.addEventListener('cover', resolve, { once: true }));
    el.removeAttribute('loading');
    await drawn;
    // (Its shape held before the image has decoded, too.)
    const drawing = Math.round(img.getBoundingClientRect().height);
    await img.decode();
    return { untitled, before, drawing, after: Math.round(img.getBoundingClientRect().height) };
  });
  expect(shape).toEqual({
    untitled: 'Cover: Untitled by Ann',
    before: { src: null, height: 200, alt: 'Cover: Square by Ann' },
    drawing: 200,
    after: 200,
  });
});

test('the gallery and the app fit a 320px phone @mobile', async ({ page }) => {
  for (const path of ['/gallery/', '/#title=Phone&style=bigtype&seed=m']) {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(path);
    await expect(page.locator('.site-header')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('a Japanese title sets the language of the cover', async ({ page }) => {
  await page.goto(`/#title=${encodeURIComponent('ガラスの街')}&style=minimal&seed=j`);
  expect(await svgOf(page, '#preview')).toMatch(/^<svg [^>]* lang="ja"/);
});

test('works offline once it has loaded', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates offline service workers reliably only in Chromium');
  await page.goto('/#title=Offline&style=minimal&seed=o');
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await ready(page);
    expect(await svgOf(page, '#preview')).toContain('Offline');
    await expect(page.locator('.tile')).toHaveCount(39);
    // The gallery, linked from the header, opens offline too (not the app in its place).
    await page.goto('/gallery/');
    await expect(page.locator('h1')).toContainText('cover styles');
    await expect(page.locator('book-cover').first()).toBeAttached();
  } finally {
    await context.setOffline(false);
  }
});

test('the gallery works offline on its own, opened before the app', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates offline service workers reliably only in Chromium');
  await page.goto('/gallery/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    for (const path of ['/gallery/', '/gallery/index.html']) {
      await page.goto(path);
      await expect(page.locator('h1'), path).toContainText('cover styles');
    }
    // Its covers open the app, kept too.
    await page.locator('a[data-style="crest"]').click();
    await selected(page, 'crest');
  } finally {
    await context.setOffline(false);
  }
});

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/#title=Access&style=artdeco&seed=a');
    await ready(page);
    await page.locator('#keep').click();
    // The colour pickers and the size fields too.
    await page.locator('[data-palette="custom"]').click();
    await page.locator('[data-format="custom"]').click();
    // And the print panel, open, with its preview.
    await page.locator('#print summary').click();
    await expect(page.locator('#print-preview')).toHaveAttribute('src', /^data:image\/svg\+xml/);
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

test('Node measures the built-in fonts as Chrome on macOS does', async ({ page, browserName }) => {
  // (The width tables are macOS's: elsewhere the browser has other fonts to measure.)
  test.skip(platform !== 'darwin' || browserName !== 'chromium', 'The tables are measured in Chrome on macOS');
  const { measureText, FONTS } = await import('../src/text.js');
  const samples = ['The Lighthouse Keeper', 'MIDNIGHT ARITHMETIC', 'Salt and Static', 'Mara Ellison, J. R. Okafor'];
  const specs = Object.keys(FONTS)
    .filter((key) => !FONTS[/** @type {keyof typeof FONTS} */ (key)].mono)
    .flatMap((key) =>
      [300, 400, 500, 600, 700, 800].flatMap((weight) => [false, true].map((italic) => ({ key, weight, italic }))),
    );
  await page.goto('/');
  const chrome = await page.evaluate(
    async ({ list, texts }) => {
      const text = await import('/src/text.js');
      return list.map((s) =>
        texts.map((t) =>
          text.measureText(t, 100, { font: text.FONTS[/** @type {keyof typeof text.FONTS} */ (s.key)], ...s }),
        ),
      );
    },
    { list: specs, texts: samples },
  );
  specs.forEach((s, i) => {
    samples.forEach((t, j) => {
      const node = measureText(t, 100, { font: FONTS[/** @type {keyof typeof FONTS} */ (s.key)], ...s });
      // Never more than 1% narrow, which would overflow; a little wide is safe (Chrome kerns pairs of
      // letters, the tables measure each alone).
      const ratio = node / chrome[i][j];
      const where = `${s.key} ${s.weight}${s.italic ? ' italic' : ''} "${t}": ${ratio.toFixed(3)}`;
      expect(ratio, where).toBeGreaterThan(0.99);
      expect(ratio, where).toBeLessThan(1.04);
    });
  });
});

test('the HTTP API draws covers and mockups for any page', async ({ page, request }) => {
  const res = await request.get('/api/cover.svg?title=Dune&author=Frank+Herbert&style=retro&seed=s');
  expect(res.status()).toBe(200);
  const headers = res.headers();
  expect(headers['content-type']).toBe('image/svg+xml; charset=utf-8');
  expect(headers['access-control-allow-origin']).toBe('*');
  expect(headers['cross-origin-resource-policy']).toBe('cross-origin');
  expect(headers['x-cover-style']).toBe('retro');
  expect(await res.text()).toMatch(/^<svg [\s\S]*Dune[\s\S]*<\/svg>$/);
  const mockup = await request.get('/api/mockup.svg?title=Dune&kind=card&text=Out+now');
  expect(await mockup.text()).toContain('Out now');
  const bad = await request.get('/api/cover.svg?style=nope');
  expect(bad.status()).toBe(400);
  expect(await bad.text()).toContain('Unknown style "nope"');
  expect((await request.get('/api/nothing')).status()).toBe(404);
  // It draws as an image on a page.
  await page.goto('/');
  const size = await page.evaluate(async () => {
    const img = new Image();
    img.src = '/api/cover.svg?title=Embedded&format=ebook';
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  expect(size).toEqual([600, 960]);
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

test('on a phone the title field is on the first screen, with style arrows and Undo by the cover @mobile', async ({
  page,
}) => {
  await page.goto('/#title=Phone&style=bigtype&seed=m');
  await ready(page);
  // Above the bar along the bottom.
  const [field, bar] = await Promise.all([
    page.locator('#title').boundingBox(),
    page.locator('.mobile-bar').boundingBox(),
  ]);
  expect(field && bar && field.y + field.height <= bar.y).toBe(true);
  await page.locator('#m-next-style').click();
  await expect(page.locator('#style-name')).not.toHaveText('Big Type');
  await page.locator('#m-undo').click();
  await expect(page.locator('#style-name')).toHaveText('Big Type');
  await page.locator('#m-prev-style').click();
  await expect(page.locator('#style-name')).not.toHaveText('Big Type');
  await page.locator('#m-keep').click();
  await expect(page.locator('#m-keep')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#kept-list li')).toHaveCount(1);
  // 16px text in fields, so iOS Safari doesn't zoom in on focus.
  for (const id of ['#title', '#author', '#seed', '#title-font']) {
    expect(
      await page.locator(id).evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      id,
    ).toBeGreaterThanOrEqual(16);
  }
});

test('the phone download button shows that it is busy @mobile', async ({ page }) => {
  await page.goto('/#title=Busy&style=minimal&seed=b');
  await expect(page.locator('#m-download')).toBeVisible();
  const [download, busy] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => {
      const button = /** @type {HTMLButtonElement} */ (document.getElementById('m-download'));
      button.click();
      return button.getAttribute('aria-disabled') === 'true' && button.getAttribute('aria-busy') === 'true';
    }),
  ]);
  expect(busy).toBe(true);
  expect(download.suggestedFilename()).toBe('busy-minimal.png');
  await expect(page.locator('#m-download')).toBeEnabled();
});

test('your own colours and size fit a phone screen @mobile', async ({ page }) => {
  await page.goto(
    '/#title=Phone&style=bigtype&seed=m&palette=custom-101010-fafafa-ff0066-00ccff-ffe66d&format=1080x1350',
  );
  await expect(page.locator('#custom-colors')).toBeVisible();
  await expect(page.locator('#custom-size')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
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

test('/element.js, the one-file <book-cover>, draws a cover on a page of its own', async ({ page }) => {
  // (The about page loads no part of the library: the bundle brings all of it.)
  await page.goto('/about/');
  await expect(page.getByRole('heading', { level: 1, name: 'Using your covers' })).toBeVisible();
  const drawn = await page.evaluate(async () => {
    await import('/element.js');
    const el = document.createElement('book-cover');
    el.setAttribute('cover-title', 'Dune');
    el.setAttribute('cover-style', 'retro');
    const cover = new Promise((resolve) =>
      el.addEventListener('cover', (e) => resolve(/** @type {CustomEvent} */ (e).detail.style), { once: true }),
    );
    document.body.append(el);
    return cover;
  });
  expect(drawn).toBe('retro');
});

test('the dev server never serves hidden files, however the URL spells the path', async ({ request }) => {
  for (const path of [
    '/.git/HEAD',
    '/api/..%2f.git%2fHEAD',
    '/api/..%2fnode_modules%2f.package-lock.json',
    '/api/..%2f_headers',
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    expect(await res.text(), path).not.toMatch(/ref: refs|"lockfileVersion"|Content-Security-Policy/);
  }
});

test('a link’s language is the design’s: its capitals, and every link the app writes', async ({ page }) => {
  await page.goto('/#title=istanbul&author=Ada&style=bigtype&case=upper&seed=t&lang=tr');
  await ready(page);
  await expect.poll(() => svgSoon(page, '#preview')).toContain('İSTANBUL');
  await page.locator('#author').fill('Ada Yılmaz');
  await expect.poll(() => new URL(page.url()).hash).toContain('lang=tr');
  await expect.poll(() => svgSoon(page, '#preview')).toContain('İSTANBUL');
  // It's shown by the title, and can be cleared: the text's own capitals again.
  await expect(page.locator('#lang-note')).toBeVisible();
  await expect(page.locator('#lang-name')).toHaveText('Turkish');
  await page.locator('#lang-clear').click();
  await expect(page.locator('#lang-note')).toBeHidden();
  await expect.poll(() => new URL(page.url()).hash).not.toContain('lang=');
  await expect.poll(() => svgSoon(page, '#preview')).toContain('ISTANBUL');
});

test('a kept design’s snapshot of another size (a file from elsewhere) is drawn again from the design', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const huge = '<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"><title>Not this</title></svg>';
    localStorage.setItem(
      'book-cover-generator:kept',
      JSON.stringify([{ title: 'Mine', style: 'minimal', seed: 'm', svg: huge }]),
    );
  });
  await page.goto('/#title=New&style=minimal&seed=n');
  const thumb = page.locator('#kept-list li img').first();
  await expect(thumb).toHaveAttribute('src', /.+/);
  const src = (await thumb.getAttribute('src')) ?? '';
  expect(decodeURIComponent(src)).not.toContain('Not this');
  expect(decodeURIComponent(src)).toContain('Mine');
});

test('the gallery reads the design you bring as the app does: no object names, only pins a style takes', async ({
  page,
}) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/gallery/#valueOf=1&__proto__=x&title=Dune&style=stripes&variant=layout.top');
  const stripes = page.locator('a[data-style="stripes"] book-cover');
  await expect(stripes).toHaveAttribute('cover-title', 'Dune');
  // (Stripes has no layout.top: the app drops that pin, so the gallery does.)
  await expect(stripes).not.toHaveAttribute('variant', /./);
  expect(errors).toEqual([]);
});

test('a link to a design this tab showed before opens that design, not the latest', async ({ page }) => {
  await page.goto('/#title=Back&author=A&style=swiss&palette=noir&seed=s&format=paperback');
  await selected(page, 'swiss');
  const swiss = page.url();
  await page.locator('.tile[data-style="bauhaus"]').click();
  await selected(page, 'bauhaus');
  // Away, then a link to the earlier design (as the gallery's cover of it is).
  await page.goto('/gallery/');
  await page.goto(swiss);
  await selected(page, 'swiss');
  // …a new step after the latest: Undo goes back to it.
  await page.locator('#undo').click();
  await selected(page, 'bauhaus');
});

test('the gallery shows your design in its own shape, as each cover opens it', async ({ page }) => {
  await page.goto('/gallery/#title=Square+Book&style=minimal&format=square');
  const cover = page.locator('a[data-style="swiss"] book-cover');
  await expect(cover).toHaveAttribute('format', 'square');
  await cover.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => {
      const box = await cover.boundingBox();
      return box ? Math.round((box.height / box.width) * 100) / 100 : 0;
    })
    .toBe(1);
});

test('Many covers previews every book, one whose size can’t be made among them', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/#title=Base&style=minimal&seed=b');
  await page.locator('#many summary').click();
  await page.locator('#many-list').fill('title,height\nDune,60\nOther,\nThird,1500');
  await expect(page.locator('#many-preview li')).toHaveCount(3);
  // (The others drawn; the one that can't be is left empty, and said so on download.)
  await expect(page.locator('#many-preview li img[src^="data:"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('the gallery gives your pins to the style the app opens your design in, one the link leaves out too', async ({
  page,
}) => {
  const { wholeDesign, readDesign, lastValues } = await import('../src/link.js');
  const { listStyles } = await import('../src/index.js');
  // A seed whose style (the link names none) offers a pin, and that pin.
  const found = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].flatMap((seed) => {
    const style = wholeDesign(readDesign(lastValues(new URLSearchParams(`title=A&seed=${seed}`)))).style;
    const variant = listStyles().find((s) => s.id === style)?.variants[0];
    return variant ? [{ seed, style, pin: `${variant.name}.${variant.values.at(-1)?.value}` }] : [];
  })[0];
  expect(found).toBeTruthy();
  await page.goto(`/gallery/#title=A&seed=${found.seed}&variant=${found.pin}`);
  await expect(page.locator(`a[data-style="${found.style}"] book-cover`)).toHaveAttribute('variant', found.pin);
});

test('a back colour chosen as an accent stays chosen through a palette without that accent', async ({ page }) => {
  await page.goto('/#title=Kept&style=minimal&palette=riso&seed=k');
  await page.locator('#print summary').click();
  await page.locator('#print-back [data-key="a2"]').click();
  await expect(page.locator('#print-back [data-key="a2"]')).toHaveAttribute('aria-pressed', 'true');
  // Your own colours with one accent: no third accent, so its colour (the one accent's) is marked.
  await page.goto('/#title=Kept&style=minimal&palette=custom-000000-ffffff-ff0000&seed=k');
  await expect(page.locator('#print-back [data-key="a0"]')).toHaveAttribute('aria-pressed', 'true');
  // …and back in Riso, it's still the third accent.
  await page.goto('/#title=Kept&style=minimal&palette=riso&seed=k');
  await expect(page.locator('#print-back [data-key="a2"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a page count the print cover can’t take isn’t kept for the next visit', async ({ page }) => {
  await page.goto('/#title=Pages&style=minimal&seed=p');
  await page.locator('#print summary').click();
  await page.locator('#print-pages').fill('');
  await expect(page.locator('#print-pages')).toHaveAttribute('aria-invalid', 'true');
  await page.reload();
  await page.locator('#print summary').click();
  await expect(page.locator('#print-pages')).not.toHaveValue('0');
  await expect(page.locator('#print-pages')).not.toHaveAttribute('aria-invalid', 'true');
});

test('<book-cover> with a lang that isn’t a tag (en_US) draws, as a browser takes it: no language', async ({
  page,
}) => {
  await page.goto('/about/');
  const drawn = await page.evaluate(async () => {
    await import('/element.js');
    const el = document.createElement('book-cover');
    el.setAttribute('cover-title', 'Dune');
    el.setAttribute('lang', 'en_US');
    const done = new Promise((resolve) => {
      el.addEventListener('cover', () => resolve('cover'), { once: true });
      el.addEventListener('cover-error', () => resolve('error'), { once: true });
    });
    document.body.append(el);
    return done;
  });
  expect(drawn).toBe('cover');
});

test('the about page keeps your design on its links, and the gallery’s family links keep it in the address', async ({
  page,
}) => {
  await page.goto('/#title=Kept+Here&style=retro&seed=k');
  await ready(page);
  const about = page.locator('a[href^="/about/"]').first();
  await expect(about).toHaveAttribute('href', /title=Kept\+Here/);
  await page.goto('/about/#title=Kept+Here&style=retro&seed=k');
  await expect(page.locator('.site-header a.brand')).toHaveAttribute('href', /title=Kept\+Here/);
  await page.goto('/gallery/#title=Kept+Here&style=retro&seed=k');
  await page.locator('.gallery-families a').nth(2).click();
  await expect.poll(() => new URL(page.url()).hash).toContain('title=Kept');
});
