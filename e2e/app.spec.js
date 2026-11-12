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

test('Undo onto an entry whose write was refused shows that entry, not a mix', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&palette=parchment&seed=w');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await page.evaluate(() => {
    const real = history.replaceState.bind(history);
    let refuse = true;
    history.replaceState = (...args) => {
      if (refuse) {
        refuse = false;
        throw new DOMException('Too many calls', 'SecurityError');
      }
      return real(...args);
    };
    location.hash = 'style=orbit&seed=w2';
  });
  await selected(page, 'orbit');
  await page.locator('[data-palette="mint"]').click();
  await expect(page.locator('[data-palette="mint"]')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1200);
  await page.locator('#undo').click();
  await selected(page, 'orbit');
  // The palette change is undone too.
  await expect(page.locator('[data-palette="parchment"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a step the browser ignored does not steer a later navigation', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=g');
  await page.locator('.tile[data-style="swiss"]').click();
  await page.locator('.tile[data-style="bauhaus"]').click();
  await selected(page, 'bauhaus');
  await page.locator('#undo').click();
  await selected(page, 'swiss');
  await page.locator('#undo').click();
  await selected(page, 'minimal');
  await expect(page.locator('#redo')).toBeEnabled();
  // The browser drops the next history.go.
  await page.evaluate(() => {
    const real = history.go.bind(history);
    let drop = true;
    history.go = (delta) => {
      if (drop) {
        drop = false;
        return;
      }
      real(delta);
    };
  });
  await page.locator('#redo').click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    location.hash = 'style=orbit&seed=g2';
  });
  await selected(page, 'orbit');
  // A new entry: nothing is ahead of it.
  await expect(page.locator('#redo')).toBeDisabled();
  await page.locator('#undo').click();
  await selected(page, 'minimal');
});

test('coming back with Forward makes the app entries ahead reachable again', async ({ page }) => {
  await page.goto('about:blank');
  await page.goto('/#title=T&style=minimal&seed=f');
  for (const style of ['swiss', 'bauhaus']) {
    await page.locator(`.tile[data-style="${style}"]`).click();
    await selected(page, style);
  }
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  await selected(page, 'minimal');
  await page.goBack();
  await page.goForward();
  await selected(page, 'minimal');
  await page.goForward();
  await selected(page, 'swiss');
  await page.locator('#undo').click();
  await selected(page, 'minimal');
  await expect(page.locator('#redo')).toBeEnabled();
  await page.locator('#redo').click();
  await selected(page, 'swiss');
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

test('a history write the browser ignores silently is retried', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=q');
  // Chrome may drop pushState and replaceState without throwing when rate-limited.
  await page.evaluate(() => {
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    let dropPush = true;
    let dropReplace = true;
    history.pushState = (...args) => {
      if (dropPush) dropPush = false;
      else push(...args);
    };
    history.replaceState = (...args) => {
      if (dropReplace) dropReplace = false;
      else replace(...args);
    };
  });
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await expect(page).toHaveURL(/style=swiss/, { timeout: 3000 });
});

test("the toolbar's Back onto an entry whose write was refused finds its place", async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=b');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await page.evaluate(() => {
    const real = history.replaceState.bind(history);
    let refuse = true;
    history.replaceState = (...args) => {
      if (refuse) {
        refuse = false;
        throw new DOMException('Too many calls', 'SecurityError');
      }
      return real(...args);
    };
    location.hash = 'style=orbit&seed=b2';
  });
  await selected(page, 'orbit');
  await page.locator('.tile[data-style="bauhaus"]').click();
  await selected(page, 'bauhaus');
  await page.waitForTimeout(1500);
  await page.goBack();
  await selected(page, 'orbit');
  await expect(page.locator('#redo')).toBeEnabled();
  await page.locator('#redo').click();
  await selected(page, 'bauhaus');
});

test("presses queued for a dropped step don't undo the toolbar's Back", async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=d');
  for (const style of ['swiss', 'bauhaus']) {
    await page.locator(`.tile[data-style="${style}"]`).click();
    await selected(page, style);
  }
  await page.locator('#undo').click();
  await selected(page, 'swiss');
  // The browser drops the next history.go; a second Redo is pressed while it is "in flight".
  await page.evaluate(() => {
    const real = history.go.bind(history);
    let drop = true;
    history.go = (delta) => {
      if (drop) drop = false;
      else real(delta);
    };
  });
  // Both presses from the page, back to back: a click from the test waits for the page to hold
  // still, which on a slow runner can take longer than the second a step is expected for.
  await page.evaluate(() => {
    const redo = /** @type {HTMLButtonElement} */ (document.getElementById('redo'));
    redo.click();
    redo.click();
  });
  await page.waitForTimeout(1200);
  await page.goBack();
  await selected(page, 'minimal');
  await page.waitForTimeout(500);
  await selected(page, 'minimal');
});

test('a write refused for an edited URL is not retried onto a later entry', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=w');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await page.evaluate(() => {
    const real = history.replaceState.bind(history);
    let refuse = true;
    history.replaceState = (...args) => {
      if (refuse) {
        refuse = false;
        throw new DOMException('Too many calls', 'SecurityError');
      }
      return real(...args);
    };
    location.hash = 'style=orbit&seed=w2';
  });
  await selected(page, 'orbit');
  // Within the retry's second: a click adds the next entry.
  await page.locator('.tile[data-style="bauhaus"]').click();
  await selected(page, 'bauhaus');
  await page.waitForTimeout(1500);
  await page.locator('#undo').click();
  await selected(page, 'orbit');
  await expect(page.locator('#redo')).toBeEnabled();
  await page.locator('#redo').click();
  await selected(page, 'bauhaus');
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

test('a change made behind an Undo the browser drops is still applied', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=q');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  await page.evaluate(() => {
    history.go = () => {};
  });
  await page.locator('#undo').click();
  await page.locator('.tile[data-style="bauhaus"]').click();
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

test('an entry whose history write was refused gets its index once the browser allows it', async ({ page }) => {
  await page.goto('/#title=T&style=minimal&seed=w');
  await page.locator('.tile[data-style="swiss"]').click();
  await selected(page, 'swiss');
  // Refuse the next write, as a rate-limited browser would.
  await page.evaluate(() => {
    const real = history.replaceState.bind(history);
    let refuse = true;
    history.replaceState = (...args) => {
      if (refuse) {
        refuse = false;
        throw new DOMException('Too many calls', 'SecurityError');
      }
      return real(...args);
    };
  });
  await page.evaluate(() => {
    location.hash = 'style=orbit&seed=w2';
  });
  await selected(page, 'orbit');
  await expect.poll(() => page.evaluate(() => history.state?.i), { timeout: 3000 }).toBe(2);
  await expect(page).toHaveURL(/title=T&.*style=orbit/);
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
  // Editing the URL now drops retro and bauhaus: the app's history is minimal, swiss, orbit.
  await page.evaluate(() => {
    location.hash = 'style=orbit&seed=e2';
  });
  await selected(page, 'orbit');
  for (let i = 0; i < 6; i++) {
    await page.locator('body').press('KeyZ');
    await page.waitForTimeout(150);
  }
  expect(new URL(page.url()).pathname).toBe('/');
  await selected(page, 'minimal');
  await expect(page.locator('#undo')).toBeDisabled();
});

test('a download keeps keyboard focus on its button', async ({ page }) => {
  await page.goto('/#title=Focus&style=topographic&seed=f');
  await page.locator('[data-scale="4"]').click();
  const button = page.locator('#dl-png');
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

test('the toast shows at the top on wide screens, clear of the export buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#title=Toast&style=minimal&seed=t');
  await page.locator('#keep').click();
  const toast = page.locator('#toast');
  await expect(toast).toHaveClass(/show/);
  const box = await toast.boundingBox();
  const exports = await page.locator('.export').boundingBox();
  expect(box && exports && box.y + box.height <= exports.y).toBe(true);
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
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#title=Clipboard.*style=minimal.*seed=c1/);
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
  await expect(page.locator('#toast')).toContainText('Image link copied');
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
  await expect(page.locator('#toast')).toContainText('50 to 10,000 px');
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
  const png = await grab('#dl-png');
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
  await expect(page.locator('#toast')).toContainText('no kept designs');
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
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const height = () => page.locator('#book').evaluate((el) => /** @type {HTMLElement} */ (el).offsetHeight);
  expect(await height()).toBe(120);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await height()).toBeGreaterThan(200);
});

test('when storage is full, the oldest kept designs give up their SVG first, and Keep says so', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      const svg = `<svg ${'a'.repeat(6000)}></svg>`;
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
  // A book that can't be made is left out and reported; the rest are saved.
  await page.locator('#many-list').fill('title,style\nGood,swiss\nBad,nope');
  await expect(page.locator('#many-count')).toHaveText('2 books');
  const [partial] = await Promise.all([page.waitForEvent('download'), page.locator('#many-download').click()]);
  expect([...unzip(await readFile(/** @type {string} */ (await partial.path()))).keys()]).toEqual(['1-good.svg']);
  await expect(page.locator('#toast')).toContainText('1 couldn’t be made');
  // None: no file, and the toast says so.
  await page.locator('#many-list').fill('title,style\nBad,nope');
  await page.locator('#many-download').click();
  await expect(page.locator('#toast')).toContainText('None of the books could be made');
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
    el.setAttribute('title', 'Dune');
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
    el.setAttribute('title', 'Arrakis');
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
    late.setAttribute('title', 'Late');
    late.setAttribute('texture', '0');
    let drawn = 0;
    late.addEventListener('cover', () => (drawn += 1));
    document.body.append(late);
    customElements.define('book-cover-late', class extends BookCover {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Moved elsewhere on the page, with the same attributes: not drawn again.
    document.body.prepend(late);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { drawn, texture: /** @type {any} */ (late).options().texture };
  });
  expect(upgraded).toEqual({ drawn: 1, texture: false });
  expect(result.retitled).toBe('Cover: Arrakis by Frank Herbert');
  expect(result.error).toContain('Unknown style "nope"');
  expect(result.src).toBeNull();
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
