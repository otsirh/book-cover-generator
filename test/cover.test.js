import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCover, generateCover, styles, palettes, registerStyle, listStyles } from '../src/index.js';

/** Minimal XML well-formedness check: balanced tags, no stray `<` or `&`. */
function assertWellFormed(svg, label) {
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(svg))) {
    const between = svg.slice(last, m.index);
    assert.ok(!between.includes('<'), `${label}: stray "<" near ${svg.slice(last, last + 60)}`);
    assert.ok(!/&(?!(amp|lt|gt|quot|apos);)/.test(between), `${label}: unescaped "&"`);
    last = tagRe.lastIndex;
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name, `${label}: mismatched </${name}>`);
    else stack.push(name);
  }
  assert.equal(stack.length, 0, `${label}: unclosed <${stack.join('>, <')}>`);
  assert.equal(svg.slice(last), '', `${label}: trailing content`);
}

const titles = [
  ['The Lighthouse Keeper', 'Mara Ellison'],
  ['A', ''],
  [
    'An Extraordinarily Long Title About the Secret History of Absolutely Everything',
    'Someone With A Rather Long Name',
  ],
  ['Под игото', 'Иван Вазов'],
  ['Fish & Chips <Deluxe> "Edition"', "O'Brien & Sons"],
];

test('every style renders well-formed SVG for every palette and size', () => {
  for (const style of styles) {
    for (const palette of palettes) {
      for (const [width, height] of [
        [600, 900],
        [600, 600],
        [1600, 2560],
      ]) {
        for (const [title, author] of titles) {
          const label = `${style}/${palette.id}/${width}x${height}/${title.slice(0, 12)}`;
          const { svg } = createCover({ title, author, style, palette: palette.id, width, height });
          assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), label);
          assert.ok(!/NaN|undefined|Infinity/.test(svg), `${label}: contains NaN/undefined`);
          assertWellFormed(svg, label);
        }
      }
    }
  }
});

test('output is deterministic', () => {
  const a = createCover({ title: 'Same', author: 'Input' });
  const b = createCover({ title: 'Same', author: 'Input' });
  assert.equal(a.svg, b.svg);
  assert.equal(a.style, b.style);
});

test('an explicit seed keeps style and palette stable across titles', () => {
  const a = createCover({ title: 'One', seed: 'fixed' });
  const b = createCover({ title: 'Two', seed: 'fixed' });
  assert.equal(a.style, b.style);
  assert.equal(a.palette, b.palette);
});

test('different seeds produce variety', () => {
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(createCover({ title: 'X', seed: i }).style);
  assert.ok(seen.size > 10, `only ${seen.size} styles picked`);
});

test('user text is escaped', () => {
  const svg = generateCover({ title: '<script>alert(1)</script>', author: 'a & b', style: 'minimal' });
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('a &amp; b'));
});

test('custom palettes are accepted and validated', () => {
  const { svg, palette } = createCover({
    title: 'Custom',
    style: 'swiss',
    palette: { bg: '#101010', ink: '#fafafa', accents: ['#ff0066', '#00ccff'] },
  });
  assert.equal(palette, 'custom');
  assert.ok(svg.includes('#ff0066'));
  assert.throws(() => createCover({ title: 'x', palette: { bg: 'red', ink: '#fff', accents: ['#000'] } }), /hex/);
});

test('unknown style or palette throws a helpful error', () => {
  assert.throws(() => createCover({ title: 'x', style: 'nope' }), /Unknown style "nope"/);
  assert.throws(() => createCover({ title: 'x', palette: 'nope' }), /Unknown palette "nope"/);
});

test('custom styles can be registered', () => {
  registerStyle({
    id: 'test-plain',
    name: 'Plain',
    render: (c) => `<rect width="${c.W}" height="${c.H}" fill="${c.p.bg}"/>`,
  });
  assert.ok(styles.includes('test-plain'));
  assert.ok(listStyles().some((s) => s.id === 'test-plain'));
  const { svg } = createCover({ title: 'x', style: 'test-plain', palette: 'noir' });
  assert.ok(svg.includes('fill="#121212"'));
});

test('width and height are respected', () => {
  const { svg, width, height } = createCover({ title: 'x', width: 1600, height: 2560 });
  assert.equal(width, 1600);
  assert.equal(height, 2560);
  assert.ok(svg.includes('viewBox="0 0 1600 2560"'));
});

test('invalid sizes throw instead of producing NaN, hanging or changing shape', () => {
  assert.throws(() => createCover({ title: 'x', width: '12abc' }), /width must be a number from 50 to 10000/);
  assert.throws(() => createCover({ title: 'x', width: Infinity }), /width must be a number from 50 to 10000/);
  assert.throws(() => createCover({ title: 'x', height: -5 }), /height must be a number from 50 to 10000/);
  assert.throws(() => createCover({ title: 'x', width: 1e6 }), /width must be a number from 50 to 10000/);
  assert.throws(
    () => createCover({ title: 'x', width: 8000 }),
    /height defaults to 12000 here.*pass height explicitly/,
  );
  assert.throws(
    () => createCover({ title: 'x', width: 3000, height: 600 }),
    /aspect ratio must be between 1:3 and 3:1/,
  );
  assert.throws(() => createCover({ title: 'x', width: 200, height: 10000 }), /aspect ratio/);
  assert.deepEqual(
    [
      createCover({ title: 'x', width: 8000, height: 9000 }).width,
      createCover({ title: 'x', width: 1800, height: 600 }).height,
    ],
    [8000, 600],
  );
});

/**
 * Vertical extent of every line of text: [top of capitals, bottom of descenders, font size].
 * Tracks font-size through nested <g>/<text>/<tspan> elements.
 * @param {string} svg
 */
function textLines(svg) {
  /** @type {number[]} */
  const sizes = [];
  /** @type {[number, number, number][]} */
  const out = [];
  for (const m of svg.matchAll(/<(\/?)(g|text|tspan)\b([^>]*?)(\/?)>/g)) {
    const [, closing, , attrs, selfClosing] = m;
    if (closing) {
      sizes.pop();
      continue;
    }
    const size = Number(/font-size="([\d.]+)"/.exec(attrs)?.[1] ?? sizes.at(-1) ?? 0);
    const y = /\by="(-?[\d.]+)"/.exec(attrs)?.[1];
    if (y != null && size) out.push([Number(y) - size * 0.8, Number(y) + size * 0.3, size]);
    if (!selfClosing) sizes.push(size);
  }
  return out;
}

test('every style keeps its text inside the cover, from 1:3 to 3:1', () => {
  const shapes = [
    [600, 900],
    [600, 960],
    [600, 600],
    [900, 600],
    [1800, 600],
    [600, 1800],
    [300, 900],
  ];
  const cases = [
    ['It', 'A'],
    ['The Lighthouse Keeper', 'Mara Ellison'],
    [
      'An Extraordinarily Long Title About the Secret History of Absolutely Everything',
      'Someone With A Rather Long Name',
    ],
    ['ノルウェイの森と世界の終わり', '村上春樹'],
  ];
  for (const style of styles) {
    for (const [width, height] of shapes) {
      for (const [title, author] of cases) {
        for (const seed of ['a', 'b']) {
          const { svg } = createCover({ title, author, style, width, height, seed });
          const short = Math.min(width, height);
          for (const [top, bottom, size] of textLines(svg)) {
            if (size > short * 0.5) continue; // a deliberately cropped giant letter
            const where = `${style} ${width}x${height} seed ${seed} "${title.slice(0, 12)}": text at ${top.toFixed(0)}..${bottom.toFixed(0)}`;
            assert.ok(top >= -1 && bottom <= height + 1, where);
          }
        }
      }
    }
  }
});

test('control characters and lone surrogates never reach the SVG', () => {
  for (const style of styles) {
    const { svg } = createCover({ title: 'Soft\u000Bbreak\u0000 \uD83D', author: 'Form\u000Cfeed', style });
    assertWellFormed(svg, style);
    assert.doesNotThrow(() => encodeURIComponent(svg), style);
    // eslint-disable-next-line no-control-regex -- asserting no control characters remain
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(svg), `${style}: control character in output`);
  }
});

test('palettes whose accents equal the ink colour still render', () => {
  const palette = { bg: '#ffffff', ink: '#000000', accents: ['#000000'] };
  for (const style of styles) {
    for (const seed of ['s0', 's1', 's2', 's3']) {
      const { svg } = createCover({ title: 'Mono', author: 'Chrome', style, seed, palette });
      assert.ok(!svg.includes('undefined'), `${style}/${seed}: undefined in output`);
    }
  }
});

test('fitText validates maxSize and never exceeds it', async () => {
  const { fitText, FONTS } = await import('../src/index.js');
  assert.throws(() => fitText('Hello', { font: FONTS.sans, maxWidth: 100 }), /maxSize/);
  const fit = fitText('An extraordinarily long title', { font: FONTS.sans, maxWidth: 40, maxHeight: 20, maxSize: 5 });
  assert.ok(fit.size <= 5, `size ${fit.size} exceeds maxSize`);
});

test('Chinese, Japanese and Thai titles wrap between words without overflowing', async () => {
  const { fitText, measureText, FONTS } = await import('../src/index.js');
  const box = { font: FONTS.serif, maxWidth: 480, maxHeight: 340, maxSize: 72, lineHeight: 1.1, maxLines: 6 };
  for (const title of [
    'ノルウェイの森と世界の終わり',
    '中文書名天龍八部與射鵰英雄傳',
    'ภาษาไทยเป็นภาษาที่ไม่มีช่องว่างระหว่างคำและยาวมาก',
  ]) {
    const fit = fitText(title, box);
    assert.ok(fit.lines.length > 1, `${title} should wrap`);
    assert.ok(fit.size >= 40, `${title} shrank to ${fit.size}`);
    for (const line of fit.lines) assert.ok(measureText(line, fit.size, { font: FONTS.serif }) <= box.maxWidth, line);
  }
  const jp = fitText('東京、大阪」へ行く長い旅の物語', { ...box, maxWidth: 200 });
  for (const line of jp.lines) assert.doesNotMatch(line, /^[、。」）]/, 'no line starts with closing punctuation');
});

test('wrapping never splits emoji or combining characters', async () => {
  const { fitText, FONTS } = await import('../src/index.js');
  const family = '👨\u200D👩\u200D👧\u200D👦';
  const fit = fitText(family.repeat(8) + ' Cafe\u0301\u0301\u0301', {
    font: FONTS.sans,
    maxWidth: 50,
    maxSize: 20,
    minSize: 20,
  });
  for (const line of fit.lines) assert.doesNotMatch(line, /^[\u200D\p{M}]/u, JSON.stringify(line));
});

test('initial letters use the whole first character', () => {
  const { svg } = createCover({ title: '🇫🇷 Paris', style: 'classic', seed: 'x' });
  assert.match(svg, />🇫🇷<\/text>/);
});

test('svgUtils helpers handle every documented input', async () => {
  const { svgUtils } = await import('../src/index.js');
  const pts = svgUtils.ridge(svgUtils.createRng('r'), 10);
  assert.equal(pts.length, 11);
  assert.ok(pts.filter((v) => v !== 0).length >= 9, 'ridge is not flat for non-power-of-two segments');
  assert.ok(Math.max(...pts.map(Math.abs)) <= 1);
  assert.deepEqual(svgUtils.ridge(svgUtils.createRng('r'), 64), svgUtils.ridge(svgUtils.createRng('r'), 64));
  const g = svgUtils.radialGradient('g', [[0, '#000']], { fx: 0.3 });
  assert.match(g, /fx="0.3"/);
  assert.doesNotMatch(g, /undefined|fy=/);
});

test('custom palettes reject non-hex colours and trim whitespace', () => {
  assert.throws(
    () => createCover({ title: 'x', palette: { bg: '#fff', ink: '#000', accents: ['red', '#00f'] } }),
    /hex/,
  );
  const { svg } = createCover({
    title: 'x',
    style: 'minimal',
    palette: { bg: ' #ffffff ', ink: '#000000', accents: ['#ff0000'] },
  });
  assert.match(svg, /fill="#ffffff"/);
  assert.doesNotMatch(svg, /fill=" #/);
});

test('short hex colours, random seeds and style registration errors', async () => {
  const { randomSeed } = await import('../src/index.js');
  const { svg } = createCover({ title: 'x', style: 'swiss', palette: { bg: '#fff', ink: '#000', accents: ['#f00'] } });
  assert.match(svg, /fill="#fff"/);
  const seeds = new Set(Array.from({ length: 20 }, randomSeed));
  assert.ok(seeds.size > 15);
  for (const seed of seeds) assert.match(seed, /^[a-z0-9]{1,6}$/);
  assert.throws(() => registerStyle(/** @type {any} */ ({ id: 'no-render' })), TypeError);
  assert.throws(() => registerStyle(/** @type {any} */ (null)), TypeError);
});
