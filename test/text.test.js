// Text measurement and fitting. Runs in its own process, so the fake canvas
// below is what text.js sees on its first measurement.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** @type {string[]} */
const fontsSet = [];
const PROBE = '10px sans-serif';
class FakeOffscreenCanvas {
  getContext() {
    let font = PROBE;
    return {
      get font() {
        return font;
      },
      set font(/** @type {string} */ value) {
        if (value !== PROBE) fontsSet.push(value);
        // Like a real canvas, ignore a shorthand that doesn't parse: here, an unquoted
        // family name word that starts with a digit, or any family named BROKEN.
        const families = value.replace(/^.*?\d+px /, '').replace(/"[^"]*"/g, '""');
        if (/(^|[ ,])\d/.test(families) || value.includes('BROKEN')) return;
        font = value;
      },
      // 10 px per character at 100 px; 20 px under a quoted family name, to tell them apart.
      measureText: (/** @type {string} */ text) => ({ width: [...text].length * (font.includes('"') ? 20 : 10) }),
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
    // Called once at the 100 px reference size; other sizes are scaled.
    assert.deepEqual(calls[0], ['xyz', 100, { family: FONTS.mono.family, weight: 600, italic: true }]);
    assert.equal(measureText('xyz', 4, { font: FONTS.mono, weight: 600, italic: true }), 12);
    assert.equal(calls.length, 1);
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
  // (Astronauts: each a sequence of three code points joined by a zero-width joiner.)
  for (const text of ['🧑‍🚀'.repeat(40), `aaaa ${'🧑‍🚀'.repeat(40)}`]) {
    const fit = fitText(text, { font: FONTS.sans, maxWidth: 60, maxHeight: 12, maxSize: 10, minSize: 10, maxLines: 1 });
    const line = fit.lines.join('');
    assert.ok(fit.truncated && line.endsWith('…'), line);
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const whole = new Set([...segmenter.segment(text)].map((s) => s.segment));
    const kept = [...segmenter.segment(line.slice(0, -1))].map((s) => s.segment);
    assert.ok(kept.includes('🧑‍🚀'), line);
    for (const g of kept) assert.ok(whole.has(g), `${JSON.stringify(g)} is part of a character: ${line}`);
  }
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

test('letter-spacing is added per visible character, not per code point', () => {
  const family = '👨\u200D👩\u200D👧\u200D👦';
  const plain = measureText(family, 10, { font: FONTS.sans });
  assert.equal(measureText(family, 10, { font: FONTS.sans, letterSpacing: 0.5 }), plain + 0.5 * 10);
});

test('fitText honours tiny height budgets and validates minSize', () => {
  const fit = fitText('A title that cannot possibly fit', {
    font: FONTS.sans,
    maxWidth: 40,
    maxHeight: 12,
    maxSize: 100,
  });
  assert.ok(fit.height <= 12 + 1e-9, `height ${fit.height}`);
  assert.equal(fit.truncated, true);
  assert.equal(fitText('Anything', { maxWidth: 500, maxHeight: 0, maxSize: 100 }).lines.length, 0);
  assert.throws(() => fitText('x', { maxWidth: 10, maxSize: 20, minSize: 0 }), /minSize/);
});

test('fitText can count the descenders below the last line in the height', () => {
  for (const maxHeight of [400, 60, 12, 3]) {
    const fit = fitText('Glossy pages of quiet typography', {
      font: FONTS.sans,
      maxWidth: 80,
      maxHeight,
      maxSize: 100,
      minSize: 8,
      descent: true,
    });
    assert.ok(textBottom(fit, 0) <= maxHeight + 1e-9, `${maxHeight}: bottom at ${textBottom(fit, 0)}`);
  }
  const without = fitText('Gg', { font: FONTS.sans, maxWidth: 500, maxHeight: 50, maxSize: 100 });
  const withDescent = fitText('Gg', { font: FONTS.sans, maxWidth: 500, maxHeight: 50, maxSize: 100, descent: true });
  assert.ok(withDescent.size < without.size);
});

test('letter-spaced widths stay exact when measured again', () => {
  const spec = { font: FONTS.sans, letterSpacing: 0.2 };
  const first = measureText('Café 🧑‍🚀', 10, spec);
  assert.equal(measureText('Café 🧑‍🚀', 10, spec), first);
  assert.equal(first, measureText('Café 🧑‍🚀', 10, { font: FONTS.sans }) + 0.2 * 10 * 6);
});

test('a long word shrinks a little below minSize rather than break', () => {
  // The fake measures 0.1 × size per character: "Cartographer" is 1.2 × size wide.
  const whole = fitText('Last Cartographer', { font: FONTS.sans, maxWidth: 100, maxSize: 200, minSize: 100 });
  assert.deepEqual(whole.lines, ['Last', 'Cartographer']);
  assert.ok(whole.size < 100 && whole.size >= 60, `size ${whole.size}`);
  assert.equal(whole.truncated, false);
  // Too far below minSize: break the word instead.
  const broken = fitText('Last Cartographer', { font: FONTS.sans, maxWidth: 50, maxSize: 200, minSize: 100 });
  assert.equal(broken.size, 100);
  assert.ok(broken.lines.length > 2, broken.lines.join(' | '));
});

test('clipGraphemes can count UTF-16 code units, as maxlength does', async () => {
  const { clipGraphemes } = await import('../src/text.js');
  const family = '👨‍👩‍👧‍👦';
  assert.equal(clipGraphemes(family.repeat(30), 200, { units: true }), family.repeat(18));
  assert.equal(clipGraphemes('a𠮷b', 2, { units: true }), 'a');
  assert.equal(clipGraphemes('abc', 5, { units: true }), 'abc');
});

test('lines never break at a no-break space', () => {
  for (const nbsp of [' ', ' ', ' ', '﻿']) {
    const fit = fitText(`Mr.${nbsp}Penumbra and the 24${nbsp}Hour Bookstore`, {
      font: FONTS.sans,
      maxWidth: 120,
      maxSize: 10,
      minSize: 10,
      maxLines: 8,
    });
    assert.ok(
      fit.lines.some((line) => line.includes(`Mr.${nbsp}Penumbra`)),
      fit.lines.join(' | '),
    );
    assert.ok(
      fit.lines.some((line) => line.includes(`24${nbsp}Hour`)),
      fit.lines.join(' | '),
    );
  }
});

test('a font shorthand the canvas rejects is retried with quoted names, then estimated', () => {
  const spec = { font: { family: 'Font Awesome 6, serif', cap: 0.7 } };
  // Accepted once quoted: measured by the canvas (the fake gives 20 px per character then).
  assert.equal(measureText('ab', 100, spec), 40);
  assert.ok(fontsSet.includes('400 100px "Font Awesome 6", serif'));
  // Rejected either way: the estimate, not the previous font's metrics.
  const broken = { font: { family: 'BROKEN', cap: 0.7 } };
  const estimate = measureText('ab', 100, broken);
  assert.notEqual(estimate, 20);
  assert.notEqual(estimate, 40);
  assert.ok(estimate > 0);
});

test('fitText rejects a missing width or a NaN height', () => {
  assert.throws(() => fitText('x', /** @type {any} */ ({ maxSize: 40 })), /fitText: `maxWidth`/);
  assert.throws(() => fitText('x', { maxWidth: 100, maxHeight: NaN, maxSize: 40 }), /fitText: `maxHeight`/);
  assert.equal(fitText('x', { maxWidth: 100, maxHeight: Infinity, maxSize: 40 }).lines.length, 1);
});

test('generic font families stay unquoted when names are quoted for the canvas', () => {
  measureText('ab', 100, { font: { family: 'Icons 7, ui-monospace', cap: 0.7 } });
  assert.ok(fontsSet.includes('400 100px "Icons 7", ui-monospace'), fontsSet.join(' | '));
});

test('a spec changed between measurements is measured with its new font', () => {
  const spec = { font: FONTS.serif, weight: 400 };
  measureText('qq', 10, spec);
  Object.assign(spec, { italic: true, weight: 700 });
  measureText('qq', 10, spec);
  assert.ok(
    fontsSet.some((f) => f.startsWith('italic 700 100px Georgia')),
    fontsSet.join(' | '),
  );
});

test('a custom measurer must be a function and return a width', () => {
  assert.throws(() => setTextMeasurer(/** @type {any} */ ('nope')), /setTextMeasurer: pass a function/);
  setTextMeasurer(/** @type {any} */ (() => ({ width: 10 })));
  try {
    assert.throws(() => measureText('bad', 10, { font: FONTS.sans }), /measurer returned \[object Object\]/);
    setTextMeasurer(() => NaN);
    assert.throws(() => measureText('bad2', 10, { font: FONTS.sans }), /measurer returned NaN/);
  } finally {
    setTextMeasurer(null);
  }
});

test('line breaks in the text always break lines, and typed lines stay whole while they fit', () => {
  const opts = { font: FONTS.serif, maxWidth: 400, maxSize: 80, maxHeight: 400 };
  const typed = fitText('Salt and\nStatic', opts);
  assert.deepEqual(typed.lines, ['Salt and', 'Static']);
  // Every kind of line break, and blank lines, make one break.
  for (const text of ['Salt and\r\nStatic', 'Salt and Static', 'Salt and\n\n \nStatic', '  Salt   and \n Static ']) {
    assert.deepEqual(fitText(text, opts).lines, ['Salt and', 'Static'], JSON.stringify(text));
  }
  // A typed line too long to keep whole at a fair size wraps, but never across the break.
  const long = fitText('A very long first line that cannot fit\nEnd', {
    ...opts,
    maxWidth: 200,
    maxSize: 60,
    minSize: 55,
  });
  assert.ok(long.lines.length > 2);
  assert.equal(long.lines.at(-1), 'End');
  assert.ok(!long.lines.some((line) => line.includes('fit End')));
  // Capitals and stacks follow the lines too.
  assert.deepEqual(fitText('Salt and\nStatic', { ...opts, upper: true }).lines, ['SALT AND', 'STATIC']);
});

test('fitText keeps to maxLines, even for text typed on more lines', () => {
  const fit = fitText('One\nTwo\nThree', {
    font: FONTS.serif,
    maxWidth: 400,
    maxSize: 40,
    maxHeight: 400,
    maxLines: 1,
  });
  assert.equal(fit.lines.length, 1);
  assert.ok(fit.truncated);
});

test('wrapText: a unit broken to the end, its last letter wider than the line, never repeats the line before it', async () => {
  const { wrapText } = await import('../src/text.js');
  // Every letter 10 px at 100 px, but W 1000 px: too wide for any line.
  setTextMeasurer((text) => [...text].reduce((w, c) => w + (c === 'W' ? 1000 : 10), 0));
  try {
    const lines = wrapText('abc xyzW', 100, 60, { font: FONTS.sans });
    assert.deepEqual(lines, ['abc', 'xyz', 'W']);
    assert.deepEqual(wrapText('abc xyzW def', 100, 60, { font: FONTS.sans }), ['abc', 'xyz', 'W', 'def']);
  } finally {
    setTextMeasurer(null);
  }
});
