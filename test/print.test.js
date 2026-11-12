// Print covers: sizes by KDP's rules, and the back's and spine's text where it may be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrintCover, spineWidth, paperTypes, trimSizes, printLimits, styles } from '../src/index.js';
import { assertWellFormed } from './well-formed.js';
import { extentOf, textBoxes } from './svg-text.js';

const BLURB = [
  'When the lamp at Gull Point goes dark for the first time in ninety years, Ada Fenn rows out through the storm to find out why.',
  "What she finds in the keeper's log will change everything she thought she knew about her family.",
  'A haunting novel about memory, the sea, and the lights we keep burning.',
].join('\n\n');
const book = { title: 'The Lighthouse Keeper', author: 'Mara Ellison', seed: 's' };

test('the spine is the page count times the paper, as KDP figures it', () => {
  assert.equal(spineWidth(200), 0.4504);
  assert.equal(spineWidth(200, 'white'), 0.4504);
  assert.equal(spineWidth(320, 'cream'), 0.8);
  assert.equal(spineWidth(100, 'Premium Color'), 0.2347);
  assert.deepEqual(Object.keys(paperTypes), ['white', 'cream', 'color', 'premium-color']);
  assert.throws(() => spineWidth(200, 'glossy'), /Unknown paper "glossy". Available: white, cream/);
  assert.throws(() => spineWidth(23), /pages must be a whole number from 24 to 828 on white paper, got 23/);
  assert.throws(() => spineWidth(829), /from 24 to 828/);
  assert.throws(() => spineWidth(777, 'cream'), /from 24 to 776 on cream paper/);
  assert.throws(() => spineWidth(100.5), /whole number/);
  assert.throws(() => spineWidth(/** @type {any} */ ('100')), /whole number/);
});

test('the whole cover is bleed, back, spine, front and bleed, in inches and in CSS px', () => {
  const print = createPrintCover(book, { trim: '6x9', pages: 320, paper: 'cream' });
  assert.deepEqual(print.inches, { width: 13.05, height: 9.25, trim: [6, 9], spine: 0.8, bleed: 0.125 });
  assert.equal(print.width, 1252.8);
  assert.equal(print.height, 888);
  assert.match(
    print.svg,
    /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1252\.8" height="888" viewBox="0 0 1252\.8 888"/,
  );
  // The front is the cover at the trim's shape, as designed (6 × 9 is 600 × 900).
  assert.deepEqual([print.front.width, print.front.height], [600, 900]);
  // Trim sizes by name, in any spacing, or in inches.
  for (const [trim, size] of /** @type {const} */ ([
    ['5.5x8.5', [5.5, 8.5]],
    [' 5.5 × 8.5 in', [5.5, 8.5]],
    [
      [7, 10],
      [7, 10],
    ],
    [trimSizes['8.5x11'], [8.5, 11]],
  ])) {
    assert.deepEqual(createPrintCover(book, { trim, pages: 100 }).inches.trim, size, String(trim));
  }
  for (const trim of ['3x5', '9x12', 'A5', [6], [6, 9, 1], [NaN, 9]]) {
    assert.throws(() => createPrintCover(book, { trim: /** @type {any} */ (trim), pages: 100 }), /trim must be/);
  }
  assert.throws(() => createPrintCover(book, /** @type {any} */ ({})), /pages must be a whole number/);
  assert.throws(() => createPrintCover(book), /pages must be a whole number/);
  assert.throws(() => createPrintCover(book, /** @type {any} */ (null)), /pass the print options/);
  // Another printer's figures.
  const own = createPrintCover(book, { pages: 100, pageThickness: 0.003, bleed: 0.25 });
  assert.deepEqual([own.inches.spine, own.inches.bleed, own.inches.width], [0.3, 0.25, 12.8]);
  assert.throws(() => createPrintCover(book, { pages: 100, bleed: 1 }), /at most 0\.5/);
  assert.throws(() => createPrintCover(book, { pages: 100, pageThickness: -1 }), /positive/);
  // Without bleed, nothing is mirrored into it.
  assert.doesNotMatch(createPrintCover(book, { pages: 100, bleed: 0 }).svg, /<clipPath/);
});

test('text on the spine only from 80 pages, and only when it would be readable', () => {
  const spine = (/** @type {number} */ pages, paper = 'cream') => createPrintCover(book, { pages, paper }).spineText;
  // 79 cream pages make a spine thick enough, but KDP prints no text on it.
  assert.equal(spine(79), false);
  assert.equal(spine(80), true);
  // 80 white pages are too thin for 6 pt type within 1/16 in of each edge.
  assert.equal(spine(80, 'white'), false);
  assert.equal(spine(300, 'white'), true);
  assert.doesNotMatch(createPrintCover(book, { pages: 79, paper: 'cream' }).svg, /rotate\(90\)/);
});

test('every style makes a well-formed print cover, its text where it may be', () => {
  for (const style of styles) {
    for (const [trim, pages, paper] of /** @type {const} */ ([
      ['6x9', 320, 'cream'],
      ['5x8', 120, 'white'],
      ['8.5x11', 600, 'premium-color'],
    ])) {
      const label = `${style} ${trim} ${pages} ${paper}`;
      const print = createPrintCover(
        { ...book, style, subtitle: 'A Novel', texture: true },
        { trim, pages, paper, hook: 'Some lights are kept burning.', blurb: BLURB, imprint: 'Harbour Press' },
      );
      assertWellFormed(print.svg, label);
      // Ids are unique, and every reference is to one of them.
      const ids = [...print.svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, `${label}: duplicate ids`);
      for (const [, ref] of print.svg.matchAll(/(?:url\(#|href="#)([^)"]+)/g))
        assert.ok(ids.includes(ref), `${label}: #${ref}`);
      assertBackText(print, label);
    }
  }
});

/**
 * The back's text is well inside the trim (3/8 in: its column is set half an inch in), and clear
 * of the barcode's box.
 * @param {ReturnType<typeof createPrintCover>} print @param {string} label
 */
function assertBackText(print, label) {
  const { bleed, trim } = print.inches;
  const [b, tw, th] = [bleed * 96, trim[0] * 96, trim[1] * 96];
  const safe = 0.375 * 96;
  const back = { left: b + safe, right: b + tw - safe, top: b + safe, bottom: b + th - safe };
  const boxes = textBoxes(print.svg).filter((box) => !box.moved && box.x !== undefined && Number(box.x) < b + tw);
  assert.ok(boxes.length >= 3, `${label}: the back's text`);
  for (const box of boxes) {
    const { left, right } = extentOf(box);
    const [top, bottom] = [box.y - box.size * 0.8, box.y + box.size * 0.3];
    const where = `${label}: "${box.text.slice(0, 20)}" at ${left.toFixed(0)}..${right.toFixed(0)} × ${top.toFixed(0)}..${bottom.toFixed(0)}`;
    assert.ok(left >= back.left - 1 && right <= back.right + 1, `${where}: outside the column`);
    assert.ok(top >= back.top - 1 && bottom <= back.bottom + 1, `${where}: above or below the column`);
    const bar = print.barcode;
    if (bar) {
      const clear = right <= bar.x || left >= bar.x + bar.width || bottom <= bar.y || top >= bar.y + bar.height;
      assert.ok(clear, `${where}: over the barcode's box`);
    }
  }
}

test('the spine holds its title and author within 1/16 in of its edges, reading top to bottom', () => {
  const print = createPrintCover({ ...book, style: 'swiss' }, { pages: 320, paper: 'cream' });
  const spine = /<g transform="translate\(([\d.]+) ([\d.]+)\) rotate\(90\)">([\s\S]*?)<\/g><\/g>/.exec(print.svg);
  assert.ok(spine, 'a turned group on the spine');
  const [cx] = [Number(spine[1])];
  const backRight = (0.125 + 6) * 96;
  assert.ok(Math.abs(cx - (backRight + 0.8 * 48)) < 0.1, 'centred on the spine');
  const lines = textBoxes(`<g>${spine[3]}</g></g>`);
  assert.deepEqual(
    lines.map((l) => l.text),
    ['THE LIGHTHOUSE KEEPER', 'MARA ELLISON'],
  );
  const along = 9 * 96 - 2 * 0.375 * 96;
  for (const line of lines) {
    const { left, right, font } = extentOf(line);
    assert.ok(left >= -0.5 && right <= along + 0.5, `${line.text} runs off the spine's length`);
    // Its capitals, centred across the spine, keep 1/16 in from each edge.
    const capHalf = (line.size * (font.cap ?? 0.72)) / 2;
    assert.ok(capHalf <= (0.8 * 96) / 2 - 6 + 0.1, `${line.text} too large for the spine`);
  }
});

test('a blurb too long for the back is cut with an ellipsis, at 8 pt', () => {
  const long = Array.from({ length: 30 }, () => BLURB).join('\n\n');
  const print = createPrintCover(book, { trim: '5x8', pages: 100, blurb: long });
  const body = textBoxes(print.svg).filter((b) => !b.moved && b.family?.includes('Georgia'));
  assert.ok(body.length > 20);
  assert.equal(body[0].size, 10.7, 'at 8 pt (10.7 px)');
  assert.match(body[body.length - 1].text, /…$/);
  assertBackText(print, 'long blurb');
  // A short one is set at 12 pt, its paragraphs kept apart.
  const short = textBoxes(createPrintCover(book, { pages: 100, blurb: 'One.\n\n\nTwo.' }).svg).filter((b) => !b.moved);
  assert.deepEqual(
    short.map((b) => [b.text, b.size]),
    [
      ['One.', 16],
      ['Two.', 16],
    ],
  );
  // Markup and control characters in any text are escaped or dropped.
  const marked = createPrintCover(book, { pages: 100, hook: '<b>&', blurb: 'a\u0000b "c"', imprint: "O'Neil & Co" });
  assertWellFormed(marked.svg, 'marked');
  assert.match(marked.svg, />&lt;b&gt;&amp;</);
});

test('the barcode box, the colours and the guides', () => {
  const print = createPrintCover(book, { pages: 200 });
  assert.deepEqual(print.barcode, {
    x: (0.125 + 6 - 0.25 - 2) * 96,
    y: (0.125 + 9 - 0.25 - 1.2) * 96,
    width: 192,
    height: 1.2 * 96,
  });
  assert.equal(createPrintCover(book, { pages: 200, barcode: false }).barcode, null);
  assert.doesNotMatch(print.svg, /stroke-dasharray/);
  assert.match(createPrintCover(book, { pages: 200, guides: true }).svg, /stroke="#ff00ff"[^>]*stroke-dasharray/);
  const coloured = createPrintCover(book, { pages: 200, backColor: '#123456', spineColor: '#ABCDEF' });
  assert.match(coloured.svg, /<rect width="[\d.]+" height="[\d.]+" fill="#123456"\/>/);
  assert.match(coloured.svg, /<rect x="[\d.]+" width="[\d.]+" height="[\d.]+" fill="#abcdef"\/>/);
  assert.throws(() => createPrintCover(book, { pages: 200, backColor: 'navy' }), /backColor must be a hex colour/);
  // The same options make the same cover; its limits are what KDP takes.
  assert.equal(createPrintCover(book, { pages: 200 }).svg, print.svg);
  assert.deepEqual(printLimits.pages, [24, 828]);
});
