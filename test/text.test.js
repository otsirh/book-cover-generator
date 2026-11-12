// Text measurement and fitting. Runs in its own process, so the fake canvas
// below is what text.js sees on its first measurement.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** @type {string[]} */
const fontsSet = [];
class FakeOffscreenCanvas {
  getContext() {
    return {
      set font(/** @type {string} */ value) {
        fontsSet.push(value);
      },
      measureText: (/** @type {string} */ text) => ({ width: [...text].length * 10 }),
    };
  }
}
Object.assign(globalThis, { OffscreenCanvas: FakeOffscreenCanvas });

const { fitText, drawText, measureText, setTextMeasurer, FONTS } = await import('../src/text.js');
const { graphemes, textBottom } = await import('../src/text.js');

test('measures with a canvas once per font at a reference size, then scales', () => {
  // The fake canvas measures 10px per character (at the 100px reference size).
  const spec = { font: FONTS.sans, weight: 700 };
  assert.equal(measureText('abcd', 20, spec), 8);
  assert.equal(measureText('abcd', 50, spec), 20);
  assert.equal(measureText('ab', 20, spec), 4);
  assert.equal(fontsSet.length, 1, 'the font is set once, whatever the size');
  assert.match(fontsSet[0], /^700 100px 'Helvetica Neue'/);
  measureText('ab', 20, { font: FONTS.serif, italic: true });
  assert.match(fontsSet[1], /^italic 400 100px Georgia/);
  assert.equal(measureText('ab', 10, { font: FONTS.sans, letterSpacing: 0.5 }), 2 + 0.5 * 10 * 2);
});

test('a custom measurer overrides the canvas', () => {
  /** @type {unknown[][]} */
  const calls = [];
  setTextMeasurer((text, size, font) => {
    calls.push([text, size, font]);
    return text.length * size;
  });
  try {
    assert.equal(measureText('xyz', 2, { font: FONTS.mono, weight: 600, italic: true }), 6);
    assert.deepEqual(calls[0], ['xyz', 2, { family: FONTS.mono.family, weight: 600, italic: true }]);
  } finally {
    setTextMeasurer(null);
  }
  assert.equal(measureText('xyz', 100, { font: FONTS.mono }), 30, 'back to the canvas after reset');
});

test('fitText wraps, balances and shrinks to fit', () => {
  const fit = fitText('one two three four', { font: FONTS.sans, maxWidth: 100, maxSize: 100, lineHeight: 1.2 });
  // The fake measures 0.1 × size per character: at 100px the whole title is 180px, so it must wrap.
  assert.ok(fit.lines.length >= 2);
  for (const line of fit.lines) assert.ok(measureText(line, fit.size, { font: FONTS.sans }) <= 100);
  assert.equal(fit.height, fit.size * (FONTS.sans.cap + (fit.lines.length - 1) * 1.2));
  assert.equal(textBottom(fit, 10), 10 + fit.height + fit.size * 0.22);
  assert.equal(textBottom(fitText('', { maxWidth: 10, maxSize: 10 }), 7), 7);
});

test('fitText falls back to breaking words and truncating with an ellipsis', () => {
  const fit = fitText('Supercalifragilistic expialidocious and more words here', {
    font: FONTS.sans,
    maxWidth: 50,
    maxHeight: 12,
    maxSize: 10,
    minSize: 10,
    maxLines: 1,
  });
  assert.equal(fit.lines.length, 1);
  assert.ok(fit.lines[0].endsWith('…'), fit.lines[0]);
  assert.ok(measureText(fit.lines[0], fit.size, { font: FONTS.sans }) <= 50);
});

test('truncation never splits an emoji', () => {
  const fit = fitText('aaaa 🧑‍🚀🧑‍🚀🧑‍🚀🧑‍🚀🧑‍🚀', {
    font: FONTS.sans,
    maxWidth: 30,
    maxHeight: 5,
    maxSize: 10,
    minSize: 10,
    maxLines: 1,
  });
  assert.doesNotThrow(() => encodeURIComponent(fit.lines.join('')));
});

test('graphemes keeps clusters together', () => {
  assert.deepEqual(graphemes('Café'), ['C', 'a', 'f', 'é']);
  assert.equal(graphemes('🧑‍🚀x').length, 2);
});

test('drawText renders anchors, spacing and escaping', () => {
  const fit = fitText('A & B', {
    font: FONTS.serif,
    maxWidth: 500,
    maxSize: 20,
    letterSpacing: 0.1,
    upper: true,
    italic: true,
    weight: 700,
  });
  const svg = drawText(fit, { x: 100, y: 0, anchor: 'middle', fill: '#000', opacity: 0.5, attrs: 'data-x="1"' });
  assert.match(svg, /text-anchor="middle"/);
  assert.match(svg, /letter-spacing="2"/);
  assert.match(svg, /font-style="italic"/);
  assert.match(svg, /font-weight="700"/);
  assert.match(svg, /opacity="0.5" data-x="1"/);
  assert.match(svg, /<text x="101" [^>]*>A &amp; B<\/text>/);
  assert.equal(drawText(fitText('  ', { maxWidth: 10, maxSize: 10 }), { x: 0, y: 0 }), '');
});
