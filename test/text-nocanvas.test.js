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
  const em = measureText('😀', 10, { font: FONTS.sans });
  assert.ok(measureText('™', 10, { font: FONTS.sans }) < em * 0.8);
  assert.ok(Math.abs(measureText('❤️', 10, { font: FONTS.sans }) - em) < 1e-9);
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
