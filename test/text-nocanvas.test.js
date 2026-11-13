// When creating a canvas throws, measurement falls back to the estimate. Runs in its own process.
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(globalThis, {
  OffscreenCanvas: class {
    constructor() {
      throw new Error('blocked');
    }
  },
});

const { measureText, fitText, FONTS } = await import('../src/text.js');

test('falls back to the width estimate if a canvas cannot be created', () => {
  assert.ok(Math.abs(measureText('abc', 10, { font: FONTS.mono }) - 18) < 1e-9);
});

test('the estimate treats only emoji-style symbols as 1em wide', () => {
  // (A font without measured widths, so ™ is estimated by its kind, not measured.)
  const font = { family: 'Example Sans, sans-serif' };
  const em = measureText('😀', 10, { font });
  assert.ok(measureText('™', 10, { font }) < em * 0.8);
  assert.ok(Math.abs(measureText('❤️', 10, { font }) - em) < 1e-9);
});

test('built-in fonts are measured from their widths, accented letters as their base letters', () => {
  const spec = { font: FONTS.condensed, weight: 700 };
  assert.equal(measureText('Café', 100, spec), measureText('Cafe', 100, spec));
  // Narrow and wide letters measure differently, and bold is wider.
  assert.ok(measureText('iiii', 100, spec) < measureText('MMMM', 100, spec) / 2);
  assert.ok(measureText('Keeper', 100, { font: FONTS.condensed, weight: 400 }) < measureText('Keeper', 100, spec));
  assert.ok(measureText('Keeper', 100, { font: FONTS.garamond, italic: true }) > 0);
});

test('symbols with text presentation stay with their word', () => {
  for (const title of [
    'The Brand Name Kingdom™ of Glass',
    'The Acme© Stories of the Year',
    'Wait‼ Then Run Away Home',
  ]) {
    for (const maxWidth of [110, 130, 160, 200]) {
      const fit = fitText(title, { font: FONTS.sans, maxWidth, maxSize: 20, minSize: 20, maxLines: 8 });
      for (const line of fit.lines) assert.doesNotMatch(line, /^[™©‼]/u, `${title}: ${fit.lines.join(' | ')}`);
    }
  }
  // Emoji still break like CJK, so a run of them can wrap.
  const emoji = fitText('😀😀😀😀😀😀😀😀😀😀😀😀', { font: FONTS.sans, maxWidth: 60, maxSize: 20, minSize: 20 });
  assert.ok(emoji.lines.length > 1);
});

test('ASCII punctuation never starts a line after CJK, Thai or emoji', () => {
  for (const title of ['こんにちは世界、さようなら!?', '😀😀😀😀😀😀😀😀😀!', 'สวัสดีครับสวัสดีครับ.']) {
    for (const maxWidth of [60, 80, 100]) {
      const fit = fitText(title, { font: FONTS.sans, maxWidth, maxSize: 20, minSize: 20, maxLines: 12 });
      for (const line of fit.lines)
        assert.doesNotMatch(line, /^[.,!?:;…]/u, `${title} at ${maxWidth}: ${fit.lines.join(' | ')}`);
    }
  }
});

test('every built-in font stack has measured widths for every character', async () => {
  const { CHARS, METRICS } = await import('../src/metrics.js');
  for (const font of Object.values(FONTS)) {
    if (font.mono) continue;
    const m = METRICS.get(font.family);
    assert.ok(m, `no widths for ${font.family}: run npm run metrics`);
    for (const table of [...m.upright, ...m.italic]) assert.equal(table.length, [...CHARS].length * 2);
  }
});

test('characters that draw nothing take no room where text is measured without a canvas', () => {
  const plain = measureText('Donaudampfschiff', 100, { font: FONTS.serif });
  for (const invisible of ['­', '​', '⁠', '‎', '﻿']) {
    assert.equal(
      measureText(`Donau${invisible}dampf${invisible}schiff`, 100, { font: FONTS.serif }),
      plain,
      invisible.codePointAt(0)?.toString(16),
    );
  }
});

test('fitText in a narrow box: no hyphen past the edge, no line of a lone space, an ellipsis that fits', async () => {
  const narrow = fitText('WWWW', { font: FONTS.display, maxWidth: 28, maxHeight: 307, maxSize: 118, maxLines: 6 });
  for (const line of narrow.lines) assert.ok(measureText(line, narrow.size, { font: FONTS.display }) <= 28, line);
  const spaced = fitText('東京 » \n »', {
    font: FONTS.garamond,
    maxWidth: 24,
    maxSize: 98,
    maxLines: 6,
    letterSpacing: 0.3,
  });
  assert.ok(
    spaced.lines.every((line) => line.trim()),
    JSON.stringify(spaced.lines),
  );
  const cut = fitText('WWWW I —', {
    font: FONTS.mono,
    maxWidth: 25,
    maxHeight: 13,
    maxSize: 114,
    maxLines: 3,
    upper: true,
  });
  for (const line of cut.lines) assert.ok(measureText(line, cut.size, { font: FONTS.mono }) <= 25, line);
});
