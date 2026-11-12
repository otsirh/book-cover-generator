import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCover, generateCover, styles, palettes, registerStyle, listStyles, pickStyle } from '../src/index.js';
import { contrast, mix, luminance } from '../src/core.js';
import * as textLib from '../src/text.js';
import { FONT_BY_FAMILY, extentOf, textBoxes, unescapeXml } from './svg-text.js';
import { assertWellFormed } from './well-formed.js';

// The built-in styles (registration is tested in its own process, in register.test.js).
const builtIn = [...styles];

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
 * Every <g>, <text> and <tspan>: its own text, its y (if set) and its font size, inherited
 * through nested elements.
 * @param {string} svg
 */
function textElements(svg) {
  /** @type {{ size: number, fill: string }[]} */
  const stack = [];
  /** @type {{ text: string, y: number | null, size: number, fill: string }[]} */
  const out = [];
  for (const [, closing, attrs, selfClosing, content] of svg.matchAll(
    /<(\/?)(?:g|text|tspan)\b([^>]*?)(\/?)>([^<]*)/g,
  )) {
    if (closing) {
      stack.pop();
      continue;
    }
    const size = Number(/font-size="([\d.]+)"/.exec(attrs)?.[1] ?? stack.at(-1)?.size ?? 0);
    const fill = /\bfill="(#[0-9a-f]{6})"/.exec(attrs)?.[1] ?? stack.at(-1)?.fill ?? '';
    const y = /\by="(-?[\d.]+)"/.exec(attrs)?.[1];
    out.push({ text: content, y: y == null ? null : Number(y), size, fill });
    if (!selfClosing) stack.push({ size, fill });
  }
  return out;
}

/**
 * Every line of text is on the cover: across, from its x, its anchor and its width as the library
 * measures it, and down, from the top of its capitals to the bottom of its descenders. (Not text
 * moved by a transform.) Big Letter's giant initial is cropped by design, on one side at most, with
 * its top kept on the cover by its font's cap height.
 * @param {string} svg @param {number} width @param {number} height @param {string} label @param {string} style
 */
function assertTextInside(svg, width, height, label, style) {
  for (const box of textBoxes(svg)) {
    if (box.moved) continue;
    const font = FONT_BY_FAMILY.get(unescapeXml(box.family ?? ''));
    assert.ok(font, `${label}: text in an unknown font, ${box.family}`);
    const where = `${label}: "${box.text.slice(0, 16)}" at ${box.size}px`;
    const giant = style === 'typographic' && box.anchor === 'middle' && box.size > Math.min(width, height) * 0.5;
    // Capitals without a tail (no J or Q) and figures don't reach below the baseline.
    const bottom = box.y + box.size * (/^[A-IK-PR-Z0-9 .,'’&!?:–—-]+$/.test(box.text) ? 0.05 : 0.3);
    const top = box.y - box.size * (giant ? (font.cap ?? 0.72) + textLib.markExtent(box.text).above : 0.8);
    assert.ok(top >= -1 && bottom <= height + 1, `${where}: from ${top.toFixed(0)} to ${bottom.toFixed(0)} down`);
    if (box.x === undefined) continue;
    const { left, right } = extentOf(box);
    const [inLeft, inRight] = [left >= -1, right <= width + 1];
    const across = `${where}: from ${left.toFixed(0)} to ${right.toFixed(0)} across`;
    if (giant) assert.ok(inLeft || inRight, `${across} (cropped on both sides)`);
    else assert.ok(inLeft && inRight, across);
  }
}

/** Every run of visible text with its font size. @param {string} svg */
const textRuns = (svg) => textElements(svg).filter((el) => el.text.trim());

test('every style keeps its text inside the cover, across and down, from 1:3 to 3:1', () => {
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
          assertTextInside(svg, width, height, `${style} ${width}x${height} seed ${seed}`, style);
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

test('every style draws the subtitle on the cover', () => {
  // Pixel draws short subtitles as pixel letters (shapes), checked separately below.
  for (const style of builtIn.filter((id) => id !== 'pixel')) {
    const { svg } = createCover({ title: 'Plain', author: 'Writer', subtitle: 'Zebra Quokka', style, seed: 'sub' });
    const body = svg.replace(/<title>[\s\S]*?<\/title>/, '').replace(/aria-label="[^"]*"/, '');
    const text = body
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
    assert.ok(text.includes('zebraquokka'), `${style} does not show the subtitle`);
  }
});

test('Pixel draws the subtitle as pixel letters', () => {
  const rects = (/** @type {string} */ subtitle) =>
    (createCover({ title: 'Plain', subtitle, style: 'pixel', seed: 'sub' }).svg.match(/<rect /g) ?? []).length;
  assert.ok(rects('Zebra Quokka') > rects('') + 20);
});

test('texture adds grain that works on light and dark covers', () => {
  for (const style of builtIn) {
    const { svg } = createCover({ title: 'Grain', style, texture: true, seed: 'g' });
    assertWellFormed(svg, style);
    assert.equal((svg.match(/<feTurbulence[^>]*seed="(3|11)"/g) ?? []).length, 2, style);
  }
  assert.doesNotMatch(createCover({ title: 'x', style: 'minimal' }).svg, /texture-dark/);
});

test('every style has a group, and every palette renders', () => {
  for (const s of listStyles().filter((x) => builtIn.includes(x.id)))
    assert.ok(['Typographic', 'Geometric', 'Pattern', 'Scenic', 'Vintage', 'Genre'].includes(s.group), s.id);
  assert.equal(palettes.length, 28);
  for (const p of palettes) assert.ok(createCover({ title: 'x', palette: p.id, style: 'swiss' }).svg.includes(p.bg));
});

test('very long inputs are capped and fast', () => {
  const started = Date.now();
  const { svg } = createCover({
    title: 'lorem ipsum '.repeat(10000),
    subtitle: 'x'.repeat(5000),
    author: 'y'.repeat(5000),
    style: 'minimal',
  });
  assert.ok(Date.now() - started < 2000);
  const label = /aria-label="([^"]*)"/.exec(svg)?.[1] ?? '';
  assert.ok(label.length < 900, `label is ${label.length} characters`);
});

test('no style truncates an ordinary long title, in any common shape', () => {
  const longTitles = [
    'The Unbearable Lightness of Being',
    'Do Androids Dream of Electric Sheep',
    'One Hundred Years of Solitude',
  ];
  for (const style of builtIn) {
    for (const [width, height] of [
      [600, 900],
      [600, 960],
      [600, 600],
      [900, 600],
      [1500, 600],
    ]) {
      for (const title of longTitles) {
        for (const subtitle of ['', 'A Novel']) {
          const { svg } = createCover({
            title,
            subtitle,
            author: 'Gabriel García Márquez',
            style,
            width,
            height,
            seed: 'long',
          });
          assert.ok(!svg.includes('…'), `${style} ${width}x${height} truncates "${title}"`);
        }
      }
    }
  }
});

test('Paper Cut gives the title room on square covers', () => {
  const { svg } = createCover({
    title: 'The Lighthouse Keeper',
    author: 'Mara Ellison',
    style: 'papercut',
    width: 600,
    height: 600,
    seed: 'p',
  });
  const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
  const author = sizes.at(-1) ?? 0;
  assert.ok(Math.max(...sizes) > author * 1.5, `title ${Math.max(...sizes)} vs author ${author}`);
});

test('Blueprint keeps its dimension callout clear of the title block', () => {
  for (const [width, height] of [
    [600, 600],
    [900, 600],
    [600, 900],
    [1800, 600],
  ]) {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const { svg } = createCover({ title: 'Engine', author: 'A. Writer', style: 'blueprint', width, height, seed });
      const short = Math.min(width, height);
      // Wide covers have the block on the right half; others along the bottom.
      const wide = width / height > 1.4;
      const blockTop = height - short * 0.07 * 0.8 - Math.max(height * 0.24, short * 0.3);
      for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>(?:Ø )?\d+<\/text>/g)) {
        if (wide) assert.ok(Number(m[1]) < width * 0.5, `${width}x${height} ${seed}: callout at x ${m[1]}`);
        else assert.ok(Number(m[2]) < blockTop, `${width}x${height} ${seed}: callout at ${m[2]}, block at ${blockTop}`);
      }
    }
  }
});

test('long inputs are cut between visible characters', () => {
  const flag = '🇫🇷';
  for (const pad of [298, 299, 300]) {
    const { svg } = createCover({ title: 'a'.repeat(pad) + flag + flag, style: 'minimal' });
    const label = /aria-label="([^"]*)"/.exec(svg)?.[1] ?? '';
    const flags = label.match(/\p{Regional_Indicator}/gu) ?? [];
    assert.equal(flags.length % 2, 0, `a lone regional indicator after ${pad} letters`);
  }
});

test('long inputs are cut between visible characters, however long each one is', async () => {
  const { clipGraphemes } = await import('../src/text.js');
  // 41 code units per character: more than any fixed pre-cut would allow for.
  const accented = ('e' + '\u0301'.repeat(40)).repeat(300);
  assert.equal(clipGraphemes(accented, 300), accented);
  assert.equal(clipGraphemes(accented + 'x', 300), accented);
  assert.equal(clipGraphemes('😀😀😀', 2), '😀😀');
  // Astral combining marks: a cut through one would leave a lone surrogate.
  const astral = ('a' + '\u{1D165}'.repeat(20)).repeat(320);
  const { svg } = createCover({ title: astral, style: 'minimal', seed: 's' });
  const label = /aria-label="([^"]*)"/.exec(svg)?.[1] ?? '';
  assert.equal(label.match(/a/g)?.length, 300);
  assert.equal(label.match(/\u{1D165}/gu)?.length, 300 * 20);
});

test('Bookshelf keeps the leaning book on the cover, from 1:3 to 3:1', () => {
  for (const [width, height] of [
    [600, 1800],
    [600, 1500],
    [600, 900],
    [600, 600],
    [1800, 600],
  ]) {
    const right = width - Math.min(width, height) * 0.07 * 0.8;
    for (let seed = 0; seed < 40; seed++) {
      const { svg } = createCover({ title: 'Shelf Life', author: 'A. Reader', style: 'shelf', width, height, seed });
      const lean =
        /<g transform="rotate\((-?[\d.]+) ([\d.]+) [\d.]+\)"><rect x="[\d.]+" y="[\d.]+" width="([\d.]+)"/.exec(svg);
      if (!lean) continue;
      const rad = (-Number(lean[1]) * Math.PI) / 180;
      const edge = Number(lean[2]) + Number(lean[3]) * Math.cos(rad);
      assert.ok(
        edge <= right + 0.5,
        `${width}x${height} seed ${seed}: book reaches ${edge.toFixed(1)}, margin ${right}`,
      );
    }
  }
});

test('Blueprint hatches the whole section ring', () => {
  let checked = 0;
  for (let seed = 0; seed < 60; seed++) {
    const { svg } = createCover({ title: 'Engine', style: 'blueprint', width: 600, height: 900, seed });
    const ring = /<mask id="([^"]*ring[^"]*)"><circle cx="([\d.]+)" cy="[\d.]+" r="([\d.]+)"/.exec(svg);
    if (!ring) continue;
    const [, id, cx, r] = ring;
    const hatch = new RegExp(`<path d="M(-?[\\d.]+) [^"]*" [^>]*mask="url\\(#${id}\\)"`).exec(svg);
    assert.ok(hatch, `seed ${seed}: no hatch`);
    // Each diagonal runs one radius right over the ring's height, so they must start 2R to its left.
    assert.ok(Number(hatch[1]) <= Number(cx) - 1.9 * Number(r), `seed ${seed}: hatch starts at ${hatch[1]}`);
    checked++;
  }
  assert.ok(checked > 0, 'no seed drew a section');
});

test('a title is never set smaller than its subtitle', () => {
  for (const subtitle of ['A Novel', 'The Definitive Edition with a Long Subtitle'])
    for (const style of builtIn) {
      for (const [width, height] of [
        [600, 900],
        [600, 960],
        [600, 600],
      ]) {
        for (const [title, word] of [
          ['The Lighthouse Keeper', 'LIGHTHOUSE'],
          ['Do Androids Dream of Electric Sheep', 'ANDROIDS'],
          // One long word: the title is width-bound, so no layout may fit.
          ['Supercalifragilisticexpialidocious', 'SUPERCAL'],
          ['Antidisestablishmentarianism', 'ANTIDISE'],
        ]) {
          for (const seed of ['a', 'e', 'h']) {
            const { svg } = createCover({ title, author: 'Mara Ellison', subtitle, style, width, height, seed });
            const runs = textRuns(svg);
            const main = runs.find((r) => r.text.toUpperCase().replace(/\s+/g, '').includes(word));
            const sub = runs.find((r) => r.text.toUpperCase().startsWith(subtitle.toUpperCase().slice(0, 7)));
            if (!main || !sub) continue;
            assert.ok(
              main.size >= sub.size,
              `${style} ${width}x${height} ${seed} ${title}: ${main.size} < ${sub.size}`,
            );
          }
        }
      }
    }
});

test('initials skip opening quotes, brackets and other punctuation', () => {
  for (const title of ['“Who Goes There?”', '(Don’t Fear) The Reaper', '¿Quién?', "'Salem's Lot", '#1 Fan']) {
    for (const style of ['typographic', 'classic']) {
      for (const seed of ['a', 'b', 'c', 'd']) {
        const { svg } = createCover({ title, style, seed });
        for (const run of textRuns(svg)) {
          assert.doesNotMatch(run.text, /^\p{P}$/u, `${style} ${seed} ${title}: a lone "${run.text}"`);
        }
      }
    }
  }
});

test('Typewriter places its word count from the text it types', async () => {
  const { setTextMeasurer } = await import('../src/index.js');
  // Very wide monospace glyphs force the word count to be cut to fit.
  setTextMeasurer((text, size, font) => [...text].length * size * (font.family.includes('Courier') ? 1.4 : 0.5));
  try {
    for (const seed of ['a', 'b', 'c']) {
      const { svg } = createCover({ title: 'Draft', author: 'A', style: 'typewriter', width: 300, height: 900, seed });
      for (const m of svg.matchAll(/<tspan x="([\d.-]+)"/g)) {
        assert.ok(Number(m[1]) < 300 - 300 * 0.07 * 1.2 + 1, `seed ${seed}: a character at x=${m[1]}`);
      }
    }
  } finally {
    setTextMeasurer(null);
  }
});

test('no-break spaces keep words together', () => {
  const title = 'Mr. Penumbra and the 24 Hour Bookstore';
  for (const width of [300, 400, 600]) {
    const { svg } = createCover({ title, style: 'minimal', seed: 'n', width, height: width * 1.5 });
    assert.ok(svg.includes('Mr. Penumbra'), `${width}: ${textRuns(svg).map((r) => r.text)}`);
    assert.ok(svg.includes('24 Hour'));
  }
});

test('a narrow initial pairs only with a letter of the same word', () => {
  for (const [title, initial] of [
    ['I Am Legend', 'I'],
    ['1 Up', '1'],
    ['Ivanhoe', 'IV'],
  ]) {
    for (const seed of ['a', 'b', 'c']) {
      const runs = textRuns(createCover({ title, style: 'typographic', seed }).svg);
      const glyph = runs.reduce((a, b) => (b.size > a.size ? b : a));
      assert.equal(glyph.text, initial, `${title} ${seed}`);
    }
  }
});

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

test('Aurora keeps its ink at 3:1 or more over every colour field', () => {
  for (const p of palettes) {
    for (const seed of SEEDS) {
      const { svg } = createCover({
        title: 'The Lighthouse Keeper',
        author: 'Mara Ellison',
        style: 'aurora',
        palette: p.id,
        seed,
      });
      const blobs = /<g filter="url\(#[^"]*blur[^"]*\)">(.*?)<\/g>/.exec(svg)?.[1] ?? '';
      assert.ok(blobs, `${p.id} ${seed}: no colour fields`);
      for (const [, fill, op] of blobs.matchAll(/fill="(#[0-9a-f]{6})" opacity="([\d.]+)"/g)) {
        const seen = mix(p.bg, fill, Number(op));
        assert.ok(
          contrast(seen, p.ink) >= 3 - 1e-9,
          `${p.id} ${seed}: ${fill} at ${op} gives ${contrast(seen, p.ink)}`,
        );
      }
    }
  }
});

test('Classic draws its emblem initial readably on the panel', () => {
  for (const p of palettes) {
    for (const seed of SEEDS) {
      const { svg } = createCover({
        title: 'The Lighthouse Keeper',
        style: 'classic',
        palette: p.id,
        seed,
        width: seed < 'd' ? 600 : 900,
        height: 600 + (seed < 'd' ? 300 : 0),
      });
      const m =
        /<circle [^>]*fill="(#[0-9a-f]{6})" stroke="[^"]*"[^>]*\/><text [^>]*fill="(#[0-9a-f]{6})"[^>]*>T<\/text>/.exec(
          svg,
        );
      assert.ok(m, `${p.id} ${seed}: no emblem`);
      assert.ok(contrast(m[1], m[2]) >= 3, `${p.id} ${seed}: ${m[2]} on ${m[1]} is ${contrast(m[1], m[2]).toFixed(2)}`);
    }
  }
});

test('Big Type sets every text colour at 3:1 or more against its background', () => {
  for (const p of palettes) {
    for (const seed of SEEDS) {
      const { svg } = createCover({
        title: 'The Lighthouse Keeper',
        author: 'Mara Ellison',
        style: 'bigtype',
        palette: p.id,
        seed,
      });
      const bg = /<rect [^>]*fill="(#[0-9a-f]{6})"/.exec(svg)?.[1] ?? '';
      for (const [, fill] of svg.matchAll(/<(?:g|text)\b[^>]*\bfill="(#[0-9a-f]{6})"[^>]*>(?=[^<]*\S|<text)/g)) {
        assert.ok(contrast(fill, bg) >= 3, `${p.id} ${seed}: ${fill} on ${bg} is ${contrast(fill, bg).toFixed(2)}`);
      }
    }
  }
});

test('Low Poly sets its text on a palette scrim that is nearly opaque from the rule down', () => {
  for (const [width, height] of [
    [600, 900],
    [600, 600],
    [900, 600],
    [1800, 600],
  ]) {
    for (const palette of ['parchment', 'mustard', 'midnight', 'teal']) {
      for (const seed of SEEDS) {
        const { svg } = createCover({
          title: 'The Lighthouse Keeper',
          author: 'Mara Ellison',
          style: 'lowpoly',
          palette,
          width,
          height,
          seed,
        });
        const label = `${width}x${height} ${palette} ${seed}`;
        const stops = [
          ...svg.matchAll(/<stop offset="([\d.]+)" stop-color="(#[0-9a-f]{6})" stop-opacity="([\d.]+)"\/>/g),
        ].map((s) => [Number(s[1]), s[2], Number(s[3])]);
        const shade = /<rect x="0" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" fill="url\(#[^"]*shade[^"]*\)"/.exec(
          svg,
        );
        assert.ok(shade, `${label}: no scrim`);
        const [top, h] = [Number(shade[1]), Number(shade[2])];
        // The rule: a short bar (0.12 of the short side) in the text colour, just above the title.
        const short = Math.min(width, height);
        const rule = [
          ...svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="([\d.]+)" height="[\d.]+" fill="(#[0-9a-f]{6})"\/>/g),
        ].find((r) => Math.abs(Number(r[2]) - short * 0.12) < 0.6);
        assert.ok(rule, `${label}: no rule`);
        const at = (Number(rule[1]) - top) / h;
        let opacity = 0;
        for (let k = 1; k < stops.length; k++) {
          const [o0, , a0] = stops[k - 1];
          const [o1, , a1] = stops[k];
          if (at >= o0 - 1e-6 && at <= o1 + 1e-6) opacity = a0 + ((a1 - a0) * (at - o0)) / (o1 - o0 || 1);
        }
        assert.ok(opacity >= 0.85 - 0.01, `${label}: scrim ${opacity.toFixed(2)} at the rule`);
        const scrim = /** @type {string} */ (stops[0][1]);
        assert.ok(contrast(rule[3], scrim) >= 4.5, `${label}: text ${rule[3]} on scrim ${scrim}`);
      }
    }
  }
});

test('Typewriter sets scripts with conjuncts as one run', () => {
  for (const title of ['க்ஷேத்திரம்', 'ಕನ್ನಡ ಕಥೆ', 'မြန်မာစာ', 'संस्कृत']) {
    const { svg } = createCover({ title, author: 'A', style: 'typewriter', seed: 'a' });
    const drawn = textRuns(svg).map((r) => r.text);
    for (const word of title.split(' ')) {
      assert.ok(
        drawn.some((text) => text.includes(word)),
        `${title}: "${word}" was split into ${JSON.stringify(drawn)}`,
      );
    }
  }
});

test('pickStyle names the style createCover would use, without drawing', () => {
  for (const [title, author] of titles) {
    for (const seed of ['', 'a', 'b']) {
      assert.equal(pickStyle({ title, author, seed }), createCover({ title, author, seed }).style, `${title} ${seed}`);
      assert.equal(pickStyle({ title, author, seed, style: 'random' }), createCover({ title, author, seed }).style);
    }
  }
  assert.equal(pickStyle({ style: 'noir' }), 'noir');
  assert.throws(() => pickStyle({ style: 'nope' }), /Unknown style "nope"/);
});

test('text that takes an accent colour keeps 3:1 against its background', () => {
  /** @type {Record<string, (p: import('../src/index.js').Palette) => string>} */
  const backgrounds = {
    engraved: (p) => p.bg,
    artdeco: (p) => p.bg,
    orbit: (p) => p.bg,
    constellation: (p) => p.bg,
    noir: (p) => {
      const night = luminance(p.bg) >= luminance(p.ink) ? p.ink : p.bg;
      return p.dark ? mix(night, '#000000', 0.45) : p.bg;
    },
  };
  const low = [];
  for (const [style, bgOf] of Object.entries(backgrounds)) {
    for (const p of palettes) {
      const bg = bgOf(p);
      for (let seed = 0; seed < 24; seed++) {
        const { svg } = createCover({
          title: 'Lighthouse',
          author: 'Mara Ellison',
          style,
          palette: p.id,
          seed: String(seed),
        });
        for (const run of textRuns(svg)) {
          if (run.fill && contrast(run.fill, bg) < 3)
            low.push(`${style} ${p.id} ${seed} "${run.text}": ${run.fill} on ${bg}`);
        }
      }
    }
  }
  assert.deepEqual(low.slice(0, 8), []);
});

test('Big Letter takes the initial of the main word and fits a pair of letters', () => {
  const glyph = (/** @type {string} */ title, /** @type {string} */ seed) => {
    const runs = textRuns(createCover({ title, style: 'typographic', seed }).svg);
    return runs.reduce((a, b) => (b.size > a.size ? b : a));
  };
  for (const seed of ['a', 'b', 'c']) {
    assert.equal(glyph('The Lighthouse Keeper', seed).text, 'L');
    assert.equal(glyph('An Unexpected Journey Home', seed).text, 'U');
    assert.equal(glyph('Internationalization', seed).text, 'IN');
  }
});

test('Typewriter makes a carbon copy on dark palettes, and says "by" only in Latin script', () => {
  const dark = createCover({
    title: 'Draft',
    author: 'Mara Ellison',
    style: 'typewriter',
    palette: 'midnight',
    seed: 'a',
  }).svg;
  const paper = /<rect x="0" y="0" width="600" height="900" fill="(#[0-9a-f]{6})"\/>/.exec(dark)?.[1] ?? '';
  assert.ok(luminance(paper) < 0.1, `paper ${paper}`);
  const cyrillic = createCover({ title: 'Роман', author: 'Михаил Булгаков', style: 'typewriter', seed: 'a' }).svg;
  // (The accessible <title> may say "by"; the typed page must not.)
  assert.doesNotMatch(
    textRuns(cyrillic)
      .map((r) => r.text)
      .join(''),
    /by/,
  );
  const latin = createCover({ title: 'Draft', author: 'Mara Ellison', style: 'typewriter', seed: 'a' }).svg;
  assert.match(
    textRuns(latin)
      .map((r) => r.text)
      .join(''),
    /by/,
  );
});

test('Thriller on a light palette is a field of one of its accents, not fog', () => {
  for (const p of palettes.filter((x) => !x.dark)) {
    const { svg } = createCover({
      title: 'The Silent Patient',
      author: 'A',
      style: 'thriller',
      palette: p.id,
      seed: 'a1',
    });
    const ground = /<rect x="0" y="0" width="600" height="900" fill="(#[0-9a-f]{6})"\/>/.exec(svg)?.[1];
    assert.ok(ground && p.accents.includes(ground), `${p.id}: ground ${ground}`);
  }
});

test('Blocks always colours a real share of its art, in at least three blocks', () => {
  for (const p of palettes) {
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 'a', 'b', 'c']) {
      const { svg } = createCover({ title: 'The Silent Patient', author: 'A', style: 'blocks', palette: p.id, seed });
      const rects = [
        ...svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-f]{6})"/g),
      ];
      const coloured = rects.filter((r) => p.accents.includes(r[3]));
      const area = coloured.reduce((sum, r) => sum + Number(r[1]) * Number(r[2]), 0);
      assert.ok(coloured.length >= Math.min(3, new Set(p.accents).size), `${p.id} ${seed}: ${coloured.length} blocks`);
      // 30% of the art, which is at least about half the cover (less the lines between blocks).
      assert.ok(area >= 600 * 900 * 0.12, `${p.id} ${seed}: ${((area / (600 * 900)) * 100).toFixed(1)}% coloured`);
    }
  }
});

test('Pixel keeps its stars out of the title band', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const { svg } = createCover({
      title: 'One Hundred Years of Solitude',
      author: 'A',
      style: 'pixel',
      palette: 'midnight',
      seed,
    });
    // The band: the second full-width rectangle from the top edge (after the first sky band).
    const band = [...svg.matchAll(/<rect x="0" y="0" width="600" height="([\d.]+)" fill="#[0-9a-f]{6}"\/>/g)].at(-1);
    assert.ok(band, `${seed}: no band`);
    for (const star of svg.matchAll(
      /<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="[\d.]+" fill="#[0-9a-f]{6}" opacity="0.7"\/>/g,
    )) {
      assert.ok(Number(star[1]) >= Number(band[1]), `${seed}: a star at y ${star[1]} in a band to ${band[1]}`);
    }
    // The lettering comes after the scanlines, on top of them.
    assert.ok(svg.indexOf('<g opacity="0.12">') < svg.lastIndexOf('<rect'), `${seed}: scanlines over the text`);
  }
});

test('Sunburst keeps its sun clear of the banner on square and wide covers', () => {
  for (const [width, height] of [
    [600, 600],
    [900, 600],
  ]) {
    for (const seed of ['a', 'b', 'c', 'c5', 'd']) {
      const { svg } = createCover({
        title: 'The Remains of the Day',
        author: 'Kazuo Ishiguro',
        style: 'sunburst',
        width,
        height,
        seed,
      });
      const circles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((c) => [
        Number(c[2]),
        Number(c[3]),
      ]);
      const sunBottom = Math.max(...circles.map(([cy, r]) => cy + r));
      const banner = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].find(
        (r) => Number(r[1]) > 1 && Number(r[3]) > width * 0.6,
      );
      assert.ok(banner, `${width}x${height} ${seed}: no banner`);
      assert.ok(
        sunBottom <= Number(banner[2]) + 0.5,
        `${width}x${height} ${seed}: sun to ${sunBottom}, banner at ${banner[2]}`,
      );
    }
  }
});

test('Noir and Blueprint set wide covers side by side, with a larger title', () => {
  for (const seed of ['a', 'd9', 'q']) {
    const noir = createCover({
      title: 'A Wizard of Earthsea',
      author: 'Ursula K. Le Guin',
      style: 'noir',
      width: 900,
      height: 500,
      seed,
    }).svg;
    const title = textRuns(noir).reduce((a, b) => (b.size > a.size ? b : a));
    assert.ok(title.size >= 500 * 0.1, `noir ${seed}: title at ${title.size}`);
    const blueprint = createCover({
      title: 'A Wizard of Earthsea',
      author: 'Ursula K. Le Guin',
      style: 'blueprint',
      width: 900,
      height: 500,
      seed,
    }).svg;
    const runs = textRuns(blueprint).filter((r) => /WIZARD/.test(r.text));
    assert.ok(runs.length && runs.every((r) => r.size >= 500 * 0.09), `blueprint ${seed}: ${runs.map((r) => r.size)}`);
  }
});

test('titles on a tiny cover shrink to fit rather than being cut', () => {
  const { svg } = createCover({
    title: 'The Lighthouse Keeper',
    author: 'Mara Ellison',
    style: 'blueprint',
    width: 50,
    height: 75,
  });
  assert.doesNotMatch(svg, /…/);
});

test('the Big Letter initial keeps its accent on the cover', () => {
  for (const seed of ['a', 'b', 'c', 'd', 'e']) {
    const { svg } = createCover({ title: 'Île', style: 'typographic', seed });
    const m = /<text x="[\d.-]+" y="([\d.-]+)" font-family="[^"]*" font-size="([\d.]+)"[^>]*>Î</.exec(svg);
    assert.ok(m, svg.slice(0, 400));
    const [y, size] = [Number(m[1]), Number(m[2])];
    // Accents reach about 0.3 em above the cap height (≤ 0.72 em) in the fonts it uses.
    assert.ok(y - size * (0.72 + 0.3) >= 0, `seed ${seed}: top at ${y - size * 1.02}`);
  }
});

test('the language is set on the cover: given, or inferred from kana and Hangul', () => {
  const lang = (/** @type {import('../src/index.js').CoverOptions} */ o) => createCover({ style: 'minimal', ...o });
  assert.equal(lang({ title: 'ガラスの街' }).lang, 'ja');
  assert.match(lang({ title: 'ガラスの街' }).svg, /^<svg [^>]* lang="ja" xml:lang="ja" /);
  assert.equal(lang({ title: '채식주의자', author: '한강' }).lang, 'ko');
  assert.equal(lang({ title: 'Kafka', author: '村上春樹', subtitle: 'うみべのカフカ' }).lang, 'ja');
  // Chinese characters alone could be any of the three: no guess.
  assert.equal(lang({ title: '红楼梦' }).lang, '');
  assert.doesNotMatch(lang({ title: '红楼梦' }).svg, /lang=/);
  assert.equal(lang({ title: '红楼梦', lang: 'zh-Hans' }).lang, 'zh-Hans');
  assert.equal(lang({ title: 'ガラスの街', lang: 'zh-Hant' }).lang, 'zh-Hant');
  for (const bad of ['en us', 'e', '"><script>', 12]) {
    assert.throws(() => lang({ title: 'x', lang: /** @type {any} */ (bad) }), /language tag/);
  }
  // Inferring a language changes no artwork.
  const ja = createCover({ title: 'ガラスの街', style: 'swiss', seed: 's' });
  const given = createCover({ title: 'ガラスの街', style: 'swiss', seed: 's', lang: 'ja' });
  assert.equal(ja.svg, given.svg);
});

test('the cover body nests in another SVG', () => {
  const cover = createCover({ title: 'Nest', style: 'aurora', seed: 'n', texture: true });
  assert.ok(cover.svg.endsWith(`${cover.body}</svg>`));
  assert.doesNotMatch(cover.body, /^<svg/);
  assert.match(cover.body, /texture-dark/);
});

test('the helpers the built-in styles use are exported for custom styles', async () => {
  const lib = await import('../src/index.js');
  for (const name of [
    'strongAccents',
    'textColor',
    'tintText',
    'fitTitleWith',
    'textPanel',
    'baselineOf',
    'textBottom',
    'textGroupAttrs',
    'markExtent',
  ]) {
    assert.equal(typeof lib[/** @type {keyof typeof lib} */ (name)], 'function', name);
  }
  assert.equal(lib.TEXT_CONTRAST, 3);
});

test('version matches the package', async () => {
  const { version } = await import('../src/index.js');
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(version, pkg.version);
  // JSR's too (jsr.json).
  const jsr = JSON.parse(await readFile(new URL('../jsr.json', import.meta.url), 'utf8'));
  assert.equal(jsr.version, pkg.version);
});

test('npm and JSR get the types each needs for <book-cover>', async () => {
  const { readFile } = await import('node:fs/promises');
  /** @param {string} path */
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const pkg = JSON.parse(await read('package.json'));
  const jsr = JSON.parse(await read('jsr.json'));
  // From npm, document.createElement('book-cover') is typed (test-d checks the file itself).
  assert.equal(pkg.exports['./element'].types, './src/element.d.ts');
  assert.match(await read('src/element.d.ts'), /interface HTMLElementTagNameMap \{\s*'book-cover': BookCover;/);
  // JSR refuses global types: it gets the class alone, which element.js names for Deno.
  assert.match(await read('src/element.js'), /^\/\* @ts-self-types="\.\/element-types\.d\.ts" \*\//);
  assert.doesNotMatch(await read('src/element-types.d.ts'), /^\s*declare global\b/m);
  assert.deepEqual(jsr.publish.exclude, ['src/element.d.ts']);
});

test('sizeLimits and formats describe the sizes covers can have', async () => {
  const { sizeLimits, formats } = await import('../src/index.js');
  assert.deepEqual({ ...sizeLimits }, { min: 50, max: 10000, ratio: 3 });
  assert.throws(() => createCover({ width: sizeLimits.max + 1, height: sizeLimits.max }), /from 50 to 10000/);
  assert.throws(() => createCover({ width: 100, height: 100 * sizeLimits.ratio + 1 }), /aspect ratio/);
  for (const [width, height] of Object.values(formats)) {
    assert.match(createCover({ title: 'x', width, height }).svg, new RegExp(`width="${width}" height="${height}"`));
  }
  assert.ok(Object.isFrozen(formats) && Object.isFrozen(formats.ebook));
});

test('styles list the variants they let you pin, and choose them in render', () => {
  const withVariants = Object.fromEntries(
    listStyles()
      .filter((s) => s.variants.length)
      .map((s) => [s.id, s.variants.map((v) => v.name)]),
  );
  assert.deepEqual(withVariants, {
    minimal: ['align'],
    typographic: ['letter'],
    split: ['shape'],
    concentric: ['rings'],
    stripes: ['stripes', 'layout'],
    mosaic: ['tiles'],
    silhouette: ['scene'],
    aurora: ['layout'],
    botanical: ['arrangement'],
    blueprint: ['drawing'],
    engraved: ['motif'],
    hollow: ['moon'],
    crest: ['field', 'emblem', 'behind'],
    storybook: ['sky'],
    idea: ['mark'],
  });
  for (const style of builtIn) {
    const declared =
      listStyles()
        .find((s) => s.id === style)
        ?.variants.map((v) => v.name) ?? [];
    // Every variant a style declares is one its render chooses, and only those.
    for (const seed of ['a', 'b', 'c']) {
      assert.deepEqual(
        Object.keys(createCover({ title: 'x', style, seed }).variants).sort(),
        [...declared].sort(),
        style,
      );
    }
  }
  const silhouette = listStyles().find((s) => s.id === 'silhouette');
  assert.deepEqual(silhouette?.variants, [
    {
      name: 'scene',
      label: 'Scene',
      values: [
        { value: 'city', label: 'City' },
        { value: 'forest', label: 'Forest' },
      ],
    },
  ]);
});

test('a pinned variant is drawn as pinned, for every value, and stays well-formed with text on the cover', () => {
  /** Ids differ between covers; compare the drawing. @param {string} svg */
  const drawing = (svg) => svg.replace(/bc[0-9a-z]+-/g, 'id-');
  for (const info of listStyles().filter((s) => s.variants.length)) {
    for (const variant of info.variants) {
      for (const { value } of variant.values) {
        for (const [width, height] of [
          [600, 900],
          [600, 600],
          [1800, 600],
        ]) {
          for (const seed of ['a', 'b', 'c']) {
            const label = `${info.id} ${variant.name}=${value} ${width}x${height} ${seed}`;
            const options = {
              title: 'The Lighthouse Keeper',
              author: 'Mara Ellison',
              style: info.id,
              seed,
              width,
              height,
            };
            const pinned = createCover({ ...options, variants: { [variant.name]: value } });
            assert.equal(pinned.variants[variant.name], value, label);
            assertWellFormed(pinned.svg, label);
            assertTextInside(pinned.svg, width, height, label, info.id);
            // Pinning what the seed picks anyway changes nothing but the ids.
            const free = createCover(options);
            if (free.variants[variant.name] === value) assert.equal(drawing(pinned.svg), drawing(free.svg), label);
          }
        }
      }
    }
  }
});

test('variants a style lacks are ignored, and a value it lacks throws', () => {
  const plain = createCover({ title: 'x', style: 'swiss', seed: 's' });
  assert.equal(createCover({ title: 'x', style: 'swiss', seed: 's', variants: { scene: 'forest' } }).svg, plain.svg);
  assert.deepEqual(
    createCover({ title: 'x', style: 'silhouette', variants: { scene: '' } }).variants.scene !== '',
    true,
  );
  assert.throws(
    () => createCover({ title: 'x', style: 'silhouette', variants: { scene: 'beach' } }),
    /scene "beach". Available: city, forest/,
  );
  assert.throws(
    () => createCover({ title: 'x', style: 'silhouette', variants: /** @type {any} */ ('forest') }),
    TypeError,
  );
  // A style picked at random takes only the pins it can: Aurora's and Stripes' layouts differ.
  for (let i = 0; i < 300; i++) {
    const c = createCover({ title: 'x', seed: `p${i}`, variants: { layout: 'top', scene: 'forest' } });
    if (c.style === 'silhouette') assert.equal(c.variants.scene, 'forest');
  }
  // Pinned covers get ids of their own, so a pinned and a free cover can share a page.
  const free = createCover({ title: 'x', style: 'silhouette', seed: 's' });
  const other = free.variants.scene === 'city' ? 'forest' : 'city';
  const pinned = createCover({ title: 'x', style: 'silhouette', seed: 's', variants: { scene: other } });
  assert.notEqual(/id="(bc[0-9a-z]+)-/.exec(free.svg)?.[1], /id="(bc[0-9a-z]+)-/.exec(pinned.svg)?.[1]);
});

test('a title font and case of your own, in every style', async () => {
  const { FONTS } = await import('../src/index.js');
  const drawing = (/** @type {string} */ svg) => svg.replace(/bc[0-9a-z]+-/g, 'id-');
  for (const style of builtIn) {
    for (const font of Object.keys(FONTS)) {
      for (const titleCase of /** @type {const} */ ([undefined, 'upper', 'normal'])) {
        for (const [width, height] of [
          [600, 900],
          [1800, 600],
        ]) {
          const label = `${style} ${font} ${titleCase} ${width}x${height}`;
          const options = {
            title: 'The Lighthouse Keeper',
            author: 'Mara Ellison',
            subtitle: 'A Novel',
            style,
            seed: 's',
            width,
            height,
          };
          const { svg } = createCover({ ...options, font, titleCase });
          assertWellFormed(svg, label);
          assertTextInside(svg, width, height, label, style);
          // The title is never set smaller than its subtitle.
          const sizes = textRuns(svg).map((r) => ({ text: r.text, size: r.size }));
          const title = sizes.find((r) => /lighthouse|keeper/i.test(r.text));
          const subtitle = sizes.find((r) => /a novel/i.test(r.text));
          if (title && subtitle) assert.ok(title.size >= subtitle.size * 0.99, `${label}: title smaller than subtitle`);
          if (style !== 'typewriter' && style !== 'pixel') {
            assert.ok(
              svg.includes(
                FONTS[/** @type {keyof typeof FONTS} */ (font)].family.split(',')[0].replace(/'/g, '&apos;'),
              ) || svg.includes(FONTS[/** @type {keyof typeof FONTS} */ (font)].family.split(',')[0]),
              `${label}: font not used`,
            );
          }
        }
      }
    }
    // Upper case shows in capitals; normal keeps the case typed.
    if (style !== 'typewriter' && style !== 'pixel') {
      assert.match(
        createCover({ title: 'The Lighthouse Keeper', style, seed: 's', titleCase: 'upper' }).svg,
        /LIGHTHOUSE/,
        style,
      );
      assert.match(
        createCover({ title: 'The Lighthouse Keeper', style, seed: 's', titleCase: 'normal' }).svg,
        /Lighthouse/,
        style,
      );
    }
    // Leaving them out draws the style's own.
    assert.equal(
      drawing(createCover({ title: 'x', style, seed: 's', font: '', titleCase: undefined }).svg),
      drawing(createCover({ title: 'x', style, seed: 's' }).svg),
    );
  }
  assert.throws(() => createCover({ font: 'comic' }), /Unknown font "comic"/);
  assert.throws(() => createCover({ titleCase: /** @type {any} */ ('lower') }), /titleCase/);
});

test('a title typed on several lines is set on them, in every style, with the same artwork choices', () => {
  for (const style of builtIn) {
    for (const [width, height] of [
      [600, 900],
      [1800, 600],
    ]) {
      const label = `${style} ${width}x${height}`;
      const two = createCover({
        title: 'Salt and\nStatic',
        author: 'J. R. Okafor',
        subtitle: 'A Novel',
        style,
        width,
        height,
      });
      const one = createCover({
        title: 'Salt and Static',
        author: 'J. R. Okafor',
        subtitle: 'A Novel',
        style,
        width,
        height,
      });
      // The seed made from the title ignores the break: same palette and choices.
      assert.equal(two.palette, one.palette, label);
      assert.deepEqual(two.variants, one.variants, label);
      assertWellFormed(two.svg, label);
      assert.match(two.svg, /<title>Salt and Static: A Novel by J\. R\. Okafor<\/title>/, label);
      assertTextInside(two.svg, width, height, label, style);
      // The break holds: no line runs from the first typed line into the second.
      assert.ok(!textRuns(two.svg).some((r) => /and static/i.test(r.text)), `${label}: lines joined`);
    }
  }
  // Breaks only in titles: the author and subtitle are one line of text each.
  const { svg } = createCover({ title: 'T', author: 'A\nB', subtitle: 'C\nD', style: 'minimal' });
  assert.match(svg, /<title>T: C D by A B<\/title>/);
});

test('a series line and a credit, in every style', () => {
  const missing = [];
  for (const style of builtIn) {
    for (const [width, height] of [
      [600, 900],
      [600, 600],
      [1800, 600],
    ]) {
      const label = `${style} ${width}x${height}`;
      const { svg } = createCover({
        title: 'The Lighthouse Keeper',
        author: 'Mara Ellison',
        subtitle: 'A Novel',
        series: 'Book Two of the Ember Cycle',
        credit: 'Translated by Edith Grossman',
        style,
        seed: 's',
        width,
        height,
      });
      assertWellFormed(svg, label);
      assertTextInside(svg, width, height, label, style);
      const runs = textRuns(svg);
      const title = runs.find((r) => /lighthouse|keeper/i.test(r.text));
      const series = runs.find((r) => /ember cycle/i.test(r.text));
      if (title && series) assert.ok(series.size < title.size, `${label}: series as large as the title`);
      // (Typewriter types each letter on its own: read the cover's text run together.)
      const typed = svg.replace(/<title>[^<]*<\/title>/, '').replace(/<[^>]+>|\s/g, '');
      if (!series && !/BOOKTWOOFTHEEMBERCYCLE/i.test(typed)) missing.push(label);
      assert.match(svg, /<title>[^<]*\(Book Two of the Ember Cycle\)\. Translated by Edith Grossman<\/title>/, label);
    }
  }
  // Every style sets the series, at every shape.
  assert.deepEqual(missing, []);
  // Without them, nothing changes.
  const plain = createCover({ title: 'x', style: 'minimal', seed: 's' });
  assert.equal(createCover({ title: 'x', style: 'minimal', seed: 's', series: ' ', credit: '' }).svg, plain.svg);
});

test('a typed line break costs the title little; else it wraps inside the long line', () => {
  for (const style of builtIn) {
    const sizeOf = (/** @type {string} */ title) => {
      const { svg } = createCover({ title, author: 'A', style, seed: 's' });
      return Math.max(
        0,
        ...textRuns(svg)
          .filter((r) => /lighthouse|northern/i.test(r.text))
          .map((r) => r.size),
      );
    };
    const broken = sizeOf('The Lighthouse Keeper of the Northern Coast\nStories');
    const whole = sizeOf('The Lighthouse Keeper of the Northern Coast Stories');
    if (broken && whole) assert.ok(broken >= whole * 0.75, `${style}: ${broken} with the break, ${whole} without`);
  }
});

test('a credit leaves the subtitle its two lines', () => {
  const subtitle = 'An Extraordinarily Long Subtitle About the Secret History of Absolutely Everything Here';
  const size = (/** @type {string} */ credit) => {
    const { svg } = createCover({ title: 'T', subtitle, credit, style: 'minimal', seed: 's' });
    return Math.max(
      ...textRuns(svg)
        .filter((r) => /extraordinarily|everything/i.test(r.text))
        .map((r) => r.size),
    );
  };
  assert.ok(size('Translated by Edith Grossman') >= size('') * 0.85);
});

test('the series line is never set larger than the title', () => {
  for (const style of builtIn) {
    const { svg } = createCover({
      title: 'Supercalifragilisticexpialidocious Antidisestablishmentarianism',
      series: 'Book Two of the Ember Cycle',
      style,
      seed: 's',
    });
    const runs = textRuns(svg);
    const title = Math.max(0, ...runs.filter((r) => /super|anti/i.test(r.text)).map((r) => r.size));
    const series = Math.max(0, ...runs.filter((r) => /ember/i.test(r.text)).map((r) => r.size));
    if (title && series) assert.ok(series <= title, `${style}: series ${series}, title ${title}`);
  }
});

test('typed line breaks and the styles with their own lettering', () => {
  // Big Letter takes the main word's initial, past a typed break too.
  const initial = (/** @type {string} */ title) =>
    /font-size="(\d+(?:\.\d+)?)"[^>]*>([^<]+)<\/text>/.exec(
      createCover({ title, style: 'typographic', seed: 's' }).svg,
    )?.[2];
  assert.equal(initial('The Lighthouse\nKeeper'), initial('The Lighthouse Keeper'));
  // Pixel keeps its own lettering whether or not the title can be drawn in pixel letters.
  for (const title of ['Cafe Society', 'Café Society']) {
    const { svg } = createCover({
      title,
      series: 'Book Two',
      style: 'pixel',
      seed: 's',
      font: 'didone',
      titleCase: 'normal',
    });
    assert.doesNotMatch(svg, /Didot/, title);
    assert.match(svg, /BOOK TWO/, title);
  }
  // The language counts the series and credit too.
  assert.equal(createCover({ title: '東京物語', series: 'シリーズ第二巻' }).lang, 'ja');
});

test('a badge goes in the first corner clear of the text, in every style', async () => {
  const { drawBadge } = await import('../src/badge.js');
  const { createRng } = await import('../src/core.js');
  const c = /** @type {import('../src/index.js').StyleContext} */ ({
    W: 600,
    H: 900,
    S: 600,
    u: 1,
    m: 42,
    p: { ...palettes[0], dark: false, paper: palettes[0].bg, night: palettes[0].ink },
    rng: createRng('x'),
  });
  const centre = (/** @type {string} */ svg) => /rotate\(-8 ([\d.]+) ([\d.]+)\)/.exec(svg)?.slice(1).map(Number);
  // Nothing in the way: the top right corner.
  const [x1, y1] = /** @type {number[]} */ (centre(drawBadge(c, 'Bestseller', [])));
  assert.ok(x1 > 450 && y1 < 150, `${x1},${y1}`);
  // Text across the top: a bottom corner.
  const [, y2] = /** @type {number[]} */ (centre(drawBadge(c, 'Bestseller', [{ x0: 0, y0: 0, x1: 600, y1: 300 }])));
  assert.ok(y2 > 700, `${y2}`);
  // Text everywhere: still drawn, where it covers least.
  assert.match(drawBadge(c, 'Bestseller', [{ x0: 0, y0: 0, x1: 600, y1: 900 }]), /BESTSELLER/);

  for (const style of builtIn) {
    const { svg } = createCover({
      title: 'The Lighthouse Keeper',
      author: 'Mara Ellison',
      badge: 'Winner of the Hugo Award',
      style,
      seed: 's',
    });
    assertWellFormed(svg, style);
    assert.match(svg, /aria-label="Winner of the Hugo Award"/, style);
    assert.match(svg, /<title>The Lighthouse Keeper by Mara Ellison\. Winner of the Hugo Award<\/title>/, style);
  }
  // Markup in any text is escaped wherever it goes, attributes (aria-label) included.
  const marked = `Fish & "Chips" <b> 'n' ]]>`;
  for (const style of builtIn) {
    const fields = { title: marked, author: marked, subtitle: marked, series: marked, credit: marked, badge: marked };
    const cover = createCover({ ...fields, style, seed: 's' });
    assertWellFormed(cover.svg, style);
    assert.match(cover.svg, /aria-label="Fish &amp; &quot;Chips&quot; &lt;b&gt;/, style);
  }
  // Without one, nothing changes.
  assert.equal(
    createCover({ title: 'x', style: 'minimal', seed: 's', badge: ' ' }).svg,
    createCover({ title: 'x', style: 'minimal', seed: 's' }).svg,
  );
});

test('mockups: every kind is a well-formed SVG with the cover in it, at its size', async () => {
  const { createMockup, mockupKinds } = await import('../src/index.js');
  const cover = createCover({ title: 'Fish & Chips\nTonight', author: "O'Brien & Sons", style: 'aurora', seed: 'm' });
  /** @type {Record<string, [number, number] | null>} */
  const sizes = { card: [1200, 630], square: [1080, 1080], story: [1080, 1920], flat: null, book: null, ereader: null };
  for (const kind of mockupKinds) {
    const m = createMockup(cover, { kind, text: 'Out now <soon>' });
    assertWellFormed(m.svg, kind);
    // The cover is nested whole, its ids made the mockup's own.
    assert.ok(
      m.svg.replace(/mk[0-9a-z]+-[a-z]+-(?=bc)/g, '').includes(cover.body),
      `${kind}: the cover is nested whole`,
    );
    assert.match(m.svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}"`));
    assert.match(m.svg, /<title>Fish &amp; Chips Tonight by O&apos;Brien &amp; Sons<\/title>/, kind);
    const fixed = sizes[kind];
    if (fixed) {
      assert.deepEqual([m.width, m.height], fixed, kind);
      assert.match(m.svg, /Out now &lt;soon&gt;/, kind);
    } else assert.ok(m.width > cover.width && m.height > cover.height, kind);
    // Two mockups on one page don't share ids with each other or the cover: every id is the
    // mockup's, and every reference is to one of them.
    const ids = [...m.svg.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]);
    assert.ok(ids.length && ids.every((x) => x.startsWith(`mk`)), kind);
    assert.equal(new Set(ids).size, ids.length, kind);
    for (const [, ref] of m.svg.matchAll(/(?:url\(#|href="#)([^)"]+)/g))
      assert.ok(ids.includes(ref), `${kind}: #${ref}`);
  }
  assert.throws(() => createMockup(cover, { kind: /** @type {any} */ ('poster') }), /Unknown mockup "poster"/);
  assert.throws(() => createMockup(cover, { background: 'red' }), /hex colour/);
  assert.throws(() => createMockup(/** @type {any} */ ({ svg: '' })), /a cover from createCover/);
  assert.match(createMockup(cover, { kind: 'flat', background: '#123456' }).svg, /fill="#123456"/);
});

test('mockups keep the cover’s language, have ids of their own per kind, and readable card text', async () => {
  const { createMockup, noteText, recordText } = await import('../src/index.js');
  const ja = createCover({ title: 'ガラスの街', style: 'minimal', seed: 's' });
  assert.match(createMockup(ja, { kind: 'flat' }).svg, /^<svg [^>]* lang="ja" xml:lang="ja"/);
  const cover = createCover({ title: 'T', style: 'minimal', seed: 's' });
  const ids = (/** @type {string} */ svg) => [...svg.matchAll(/id="(mk[^"]+)"/g)].map((m) => m[1]);
  const flat = ids(createMockup(cover, { kind: 'flat' }).svg);
  const reader = ids(createMockup(cover, { kind: 'ereader' }).svg);
  assert.deepEqual(
    flat.filter((x) => reader.includes(x)),
    [],
  );
  // Card text reads on its background, whatever the palette.
  for (const p of palettes) {
    const c = createCover({ title: 'Readable', author: 'A', style: 'minimal', palette: p.id, seed: 's' });
    const { svg } = createMockup(c, { kind: 'card', text: 'Out now' });
    const bg = /<rect width="1200" height="630" fill="(#[0-9a-f]{6})"/.exec(svg)?.[1] ?? '';
    for (const run of textRuns(svg)) {
      if (!/Readable|Out now|^A$/.test(run.text) || !run.fill) continue;
      const need = /Out now/.test(run.text) ? 3 : 4.5;
      assert.ok(contrast(run.fill, bg) >= need, `${p.id}: "${run.text}" at ${contrast(run.fill, bg).toFixed(2)}:1`);
    }
  }
  // noteText and recordText are exported for styles that write their own text.
  assert.deepEqual(recordText(() => noteText(1, 2, 3, 4)).boxes, [{ x0: 1, y0: 2, x1: 3, y1: 4 }]);
  // The badge counts when the language is inferred.
  assert.equal(createCover({ title: 'Glass City', badge: 'ベストセラー' }).lang, 'ja');
});

test('every style suits a genre, and a genre picks a random style that suits it', async () => {
  const { genres } = await import('../src/index.js');
  const ids = genres.map((g) => g.id);
  for (const s of listStyles()) {
    assert.ok(s.genres.length, `${s.id} suits no genre`);
    for (const g of s.genres) assert.ok(ids.includes(g), `${s.id}: unknown genre ${g}`);
  }
  for (const g of ids) {
    const suited = listStyles()
      .filter((s) => s.genres.includes(g))
      .map((s) => s.id);
    for (let i = 0; i < 12; i++) assert.ok(suited.includes(createCover({ title: `T${i}`, genre: g }).style), g);
    // pickStyle agrees with createCover.
    assert.equal(pickStyle({ title: 'Same', genre: g }), createCover({ title: 'Same', genre: g }).style);
  }
  // An explicit style wins over the genre; an unknown genre throws.
  assert.equal(createCover({ title: 'x', style: 'pixel', genre: 'horror' }).style, 'pixel');
  assert.throws(() => createCover({ genre: 'poetry' }), /Unknown genre "poetry"/);
});

test('a genre is checked even with a style given, and a mockup’s line is cut between whole characters', async () => {
  assert.throws(() => createCover({ style: 'retro', genre: 'poetry' }), /Unknown genre "poetry"/);
  const { createMockup } = await import('../src/index.js');
  // A card's line is cut between whole characters.
  const card = createMockup(createCover({ title: 'x' }), { kind: 'card', text: `a${'🎉'.repeat(50)}` }).svg;
  assert.ok(
    !/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/.test(card.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')),
    'no lone surrogate',
  );
});

test('styles, palettes, genres and fonts may be named in any case, or by their names', () => {
  const canonical = createCover({ title: 'x', style: 'artdeco', palette: 'deepsea', font: 'didone', seed: 'n' });
  const named = createCover({ title: 'x', style: 'Art Deco', palette: 'Deep Sea', font: 'DIDONE', seed: 'n' });
  assert.equal(named.svg, canonical.svg);
  assert.equal(named.style, 'artdeco');
  assert.equal(
    createCover({ title: 'x', style: 'RANDOM', seed: 'n' }).style,
    createCover({ title: 'x', seed: 'n' }).style,
  );
  for (const genre of ['Non-fiction', 'NONFICTION', 'Children’s', 'Thriller & crime']) {
    assert.doesNotThrow(() => createCover({ title: 'x', genre }), genre);
  }
  assert.throws(() => createCover({ title: 'x', style: 'Art Decco' }), /Unknown style "Art Decco"/);
});

test('a pinned value no style offers throws, whichever style the seed picks', () => {
  for (let i = 0; i < 40; i++) {
    assert.throws(
      () => createCover({ title: 'x', seed: `t${i}`, variants: { scene: 'forrest' } }),
      /No style has scene "forrest"/,
    );
    // Names and values in any case.
    assert.doesNotThrow(() =>
      createCover({ title: 'x', seed: `t${i}`, variants: { Scene: 'Forest', layout: 'open' } }),
    );
  }
  assert.equal(createCover({ title: 'x', style: 'silhouette', variants: { SCENE: 'City' } }).variants.scene, 'city');
});

test('a pin no style offers throws with a named style too; fonts and genres by their names', async () => {
  assert.throws(
    () => createCover({ title: 'x', style: 'noir', variants: { scene: 'forrest' } }),
    /No style has scene "forrest"/,
  );
  for (const font of ['Typewriter', 'old style', 'HEAVY'])
    assert.doesNotThrow(() => createCover({ title: 'x', font }), font);
  for (const genre of ['Childrens', 'Thriller and crime', 'Thriller crime', 'Fantasy sci-fi']) {
    assert.doesNotThrow(() => createCover({ title: 'x', genre }), genre);
  }
  // A named style lists its own values; 'random' is read as names are.
  assert.throws(
    () => createCover({ title: 'x', style: 'stripes', variants: { layout: 'bogus' } }),
    /Style "stripes" has no layout "bogus". Available: plate, open/,
  );
  assert.equal(
    createCover({ title: 'x', style: ' Random ', palette: ' AUTO', seed: 'r' }).style,
    createCover({ title: 'x', seed: 'r' }).style,
  );
  // A font added to FONTS is found too.
  const { FONTS } = await import('../src/index.js');
  /** @type {any} */ (FONTS).extra = { name: 'Extra', family: 'Georgia, serif' };
  try {
    assert.doesNotThrow(() => createCover({ title: 'x', font: 'Extra' }));
  } finally {
    delete (/** @type {any} */ (FONTS).extra);
  }
  const { registerPalette } = await import('../src/index.js');
  assert.throws(() => registerStyle({ id: 'Random', render: () => '' }), /not a style id/);
  assert.throws(() => registerPalette({ id: 'AUTO', bg: '#ffffff', ink: '#000000', accents: ['#ff0000'] }), /reserved/);
  assert.throws(
    () => registerStyle({ id: 'num', name: /** @type {any} */ (42), render: () => '' }),
    /name must be a string/,
  );
});

test('only random and auto (any case, spaces around) leave a choice to the seed, and can’t be ids', async () => {
  for (const style of [' ', '-', 'and'])
    assert.throws(() => createCover({ title: 'x', style }), /Unknown style/, style);
  assert.throws(() => createCover({ title: 'x', palette: '-' }), /Unknown palette/);
  const { unregisterStyle, registerPalette } = await import('../src/index.js');
  assert.throws(() => registerStyle({ id: 'RANDOM', render: () => '' }), /not a style id/);
  assert.throws(() => registerPalette({ id: 'Custom', bg: '#ffffff', ink: '#000000', accents: ['#f00'] }), /reserved/);
  // An id spelled like a style's name doesn't take it over: "Art Deco" is the style named so.
  registerStyle({ id: 'art-deco', name: 'Deco Mine', render: () => '' });
  try {
    assert.equal(createCover({ title: 'x', style: 'Art Deco' }).style, 'artdeco');
  } finally {
    unregisterStyle('art-deco');
  }
});

test('a name as written but for case wins over an id only spelled alike', async () => {
  const { unregisterStyle } = await import('../src/index.js');
  registerStyle({ id: 'art-deco', name: 'Deco Mine', render: () => '' });
  try {
    for (const style of ['Art Deco', 'art deco', 'ART DECO'])
      assert.equal(createCover({ title: 'x', style }).style, 'artdeco', style);
    assert.equal(createCover({ title: 'x', style: 'ART-DECO' }).style, 'art-deco');
  } finally {
    unregisterStyle('art-deco');
  }
});
