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

test('invalid sizes throw instead of producing NaN or hanging', () => {
  assert.throws(() => createCover({ title: 'x', width: '12abc' }), /width must be a positive number/);
  assert.throws(() => createCover({ title: 'x', width: Infinity }), /width must be a positive number/);
  assert.throws(() => createCover({ title: 'x', height: -5 }), /height must be a positive number/);
  assert.equal(createCover({ title: 'x', width: 1e6 }).width, 10000);
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
