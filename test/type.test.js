import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLead, stackLines, fitStack, drawStack, titleBlock, authorFit } from '../src/type.js';
import { FONTS } from '../src/text.js';
import { createRng } from '../src/core.js';

/** A minimal style context. @param {Partial<import('../src/index.js').StyleContext>} [o] */
const ctx = (o = {}) =>
  /** @type {import('../src/index.js').StyleContext} */ ({
    title: 'The Lighthouse Keeper',
    author: 'Mara Ellison',
    subtitle: '',
    W: 600,
    H: 900,
    S: 600,
    u: 1,
    m: 42,
    rng: createRng('t'),
    p: /** @type {any} */ ({}),
    id: (/** @type {string} */ n) => n,
    ...o,
  });

test('splitLead and stackLines keep words joined by a no-break space', () => {
  assert.deepEqual(splitLead('The\u00A0Road'), { lead: '', main: 'The\u00A0Road' });
  assert.deepEqual(stackLines('Big\u00A0Sur Nights'), ['Big\u00A0Sur', 'Nights']);
});

test('splitLead takes a leading English article off', () => {
  assert.deepEqual(splitLead('The Lighthouse Keeper'), { lead: 'The', main: 'Lighthouse Keeper' });
  assert.deepEqual(splitLead('a little life'), { lead: 'a', main: 'little life' });
  assert.deepEqual(splitLead('Theater of War'), { lead: '', main: 'Theater of War' });
  assert.deepEqual(splitLead('The'), { lead: '', main: 'The' });
});

test('stackLines joins small words to the next word', () => {
  assert.deepEqual(stackLines('Lord of the Rings'), ['Lord', 'of the Rings']);
  assert.deepEqual(stackLines('Pride and Prejudice'), ['Pride', 'and Prejudice']);
  assert.deepEqual(stackLines('Gone with the'), ['Gone', 'with the']);
  assert.deepEqual(stackLines('of'), ['of']);
});

test('fitStack validates, rejects unsuitable text and fills the width', () => {
  assert.throws(() => fitStack('A B', /** @type {any} */ ({ maxWidth: 100 })), /maxSize/);
  assert.equal(fitStack('Single', { maxWidth: 500, maxSize: 200 }), null);
  assert.equal(fitStack('one two three four five six', { maxWidth: 500, maxSize: 200 }), null);
  const fit = fitStack('Signal Lost', { font: FONTS.sans, maxWidth: 500, maxHeight: 400, maxSize: 300, upper: true });
  assert.ok(fit);
  assert.equal(fit.lines.length, 2);
  assert.ok(fit.height + fit.descent <= 400 + 0.01);
});

test('stacked lowercase lines leave room for descenders', () => {
  const fit = fitStack('Sleeping Giants', { font: FONTS.sans, maxWidth: 516, maxHeight: 600, maxSize: 300 });
  assert.ok(fit);
  const svg = drawStack(fit, { x: 0, y: 0, lineFills: [undefined, '#f00'] });
  const ys = [...svg.matchAll(/ y="([\d.]+)"/g)].map((m) => Number(m[1]));
  const [a, b] = fit.lines;
  // The gap between baselines covers the first line's descenders and the second line's caps.
  assert.ok(ys[1] - ys[0] >= b.size * fit.cap + a.size * 0.22 - 0.2, `${ys[1] - ys[0]}`);
  assert.match(svg, /fill="#f00">Giants</);
});

test('drawStack escapes the font family and per-line colours', () => {
  const fit = fitStack('Hello World', { font: { family: '"Fira Sans", serif' }, maxWidth: 400, maxSize: 100 });
  assert.ok(fit);
  const svg = drawStack(fit, { x: 0, y: 0, lineFills: ['url("#g")'] });
  assert.match(svg, /font-family="&quot;Fira Sans&quot;, serif"/);
  assert.match(svg, /fill="url\(&quot;#g&quot;\)"/);
});

test('titleBlock never exceeds its height budget', () => {
  const rng = createRng('blocks');
  const words = [
    'The',
    'Lighthouse',
    'Keeper',
    'of',
    'Small',
    'Gods',
    'Signal',
    'Lost',
    'gypsy',
    'quay',
    'Winter',
    'A',
  ];
  for (let i = 0; i < 300; i++) {
    const title = Array.from({ length: rng.int(1, 9) }, () => rng.pick(words)).join(' ');
    const subtitle = rng.bool() ? Array.from({ length: rng.int(1, 6) }, () => rng.pick(words)).join(' ') : '';
    const maxSize = rng.float(40, 220);
    const maxHeight = rng.float(maxSize * 0.6, 500);
    const block = titleBlock(ctx({ title, subtitle }), {
      font: rng.pick([FONTS.serif, FONTS.sans, FONTS.condensed]),
      upper: rng.bool(),
      stack: rng.bool(),
      maxWidth: rng.float(200, 520),
      maxHeight,
      maxSize,
    });
    assert.ok(block.height <= maxHeight + 0.5, `"${title}" / "${subtitle}": ${block.height} > ${maxHeight}`);
  }
});

test('titleBlock sets the lead small above the title, and the subtitle below', () => {
  const block = titleBlock(ctx({ subtitle: 'A Novel' }), { maxWidth: 500, maxHeight: 500, maxSize: 120 });
  const svg = block.draw({ x: 0, y: 0, fill: '#000', subtitleFill: '#00f' });
  const the = svg.indexOf('>THE<');
  const main = svg.indexOf('Lighthouse');
  const sub = svg.indexOf('A Novel');
  assert.ok(the > -1 && main > the && sub > main, svg);
  assert.match(svg, /fill="#00f"[^>]*opacity="0.85"/);
  assert.equal(block.lines, 2);
  assert.equal(block.stacked, false);
  const flat = titleBlock(ctx(), { maxWidth: 500, maxHeight: 500, maxSize: 120, lead: false, subtitle: false });
  assert.doesNotMatch(flat.draw({ x: 0, y: 0, fill: '#000' }), />THE</);
});

test('authorFit is readable by default and empty without an author', () => {
  const a = authorFit(ctx());
  assert.equal(a.lines[0], 'MARA ELLISON');
  assert.ok(a.size > 20);
  assert.equal(authorFit(ctx({ author: '' })).lines.length, 0);
});

test('titleBlock stays within even a very small budget', () => {
  const block = titleBlock(ctx({ subtitle: 'And a subtitle' }), { maxWidth: 500, maxHeight: 12, maxSize: 100 });
  assert.ok(block.height <= 12.5, `height ${block.height}`);
});

test('titleBlock drops the subtitle before crushing the title', () => {
  const c = ctx({ subtitle: 'A Novel', W: 600, H: 600, S: 600 });
  for (const maxHeight of [40, 50, 60, 70, 80, 90, 100]) {
    const block = titleBlock(c, { maxWidth: 516, maxHeight, maxSize: 120, font: FONTS.sans, weight: 700 });
    // fitText's default minimum for a 120 px title is 26.4 px; the subtitle is 21.6 px.
    assert.ok(block.size >= 26.4 - 1e-9, `${maxHeight}: title at ${block.size}px`);
    assert.ok(block.height <= maxHeight + 0.5, `${maxHeight}: block ${block.height}`);
  }
  // With room to spare, the subtitle stays.
  const roomy = titleBlock(c, { maxWidth: 516, maxHeight: 300, maxSize: 120, font: FONTS.sans, weight: 700 });
  assert.match(roomy.draw({ x: 0, y: 0, fill: '#000' }), /A Novel/);
});
