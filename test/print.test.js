// Print covers: sizes by KDP's rules, and the back's and spine's text where it may be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrintCover, spineWidth, paperTypes, trimSizes, printLimits, styles } from '../src/index.js';
import { assertWellFormed } from './well-formed.js';
import { extentOf, textBoxes } from './svg-text.js';
import { markExtent, descentOf } from '../src/text.js';

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
  assert.equal(spineWidth(100, 'premiumcolor'), 0.2347);
  // The largest trims take fewer pages, as printLimits.trimPages says and createPrintCover checks.
  assert.equal(printLimits.trimPages['8.5x11'].white, 590);
  assert.equal(printLimits.trimPages['8.27x11.69'].color, null);
  for (const trim of Object.keys(printLimits.trimPages)) assert.ok(Object.hasOwn(trimSizes, trim), trim);
  assert.throws(() => createPrintCover({ title: 'x' }, { trim: '8.5x11', pages: 591 }), /at most 590 pages/);
  assert.deepEqual(Object.keys(paperTypes), ['white', 'cream', 'color', 'premium-color']);
  assert.throws(() => spineWidth(200, 'glossy'), /Unknown paper "glossy". Available: white, cream/);
  assert.throws(() => spineWidth(23), /pages must be a whole number from 24 to 828 on white paper, got 23/);
  assert.throws(() => spineWidth(829), /from 24 to 828/);
  assert.throws(() => spineWidth(777, 'cream'), /from 24 to 776 on cream paper/);
  // Standard colour takes 72 to 600 pages; premium colour, as white.
  assert.throws(() => spineWidth(71, 'color'), /from 72 to 600 on color paper, got 71/);
  assert.throws(() => spineWidth(601, 'color'), /from 72 to 600 on color paper/);
  assert.equal(spineWidth(828, 'premium-color'), 1.943316);
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
  // (A long run of spaces is refused at once: no pattern tries every way of reading it.)
  const started = performance.now();
  assert.throws(() => createPrintCover(book, { trim: `9x9${' '.repeat(50_000)}!`, pages: 100 }), /trim must be/);
  assert.ok(performance.now() - started < 100, `${performance.now() - started} ms`);
  for (const trim of ['3x5', '9x12', 'A5', [6], [6, 9, 1], [NaN, 9], ['6', '9']]) {
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
      ['8.5x11', 590, 'premium-color'],
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
  // A blurb whose first paragraph takes all but a character of its 3,000 ends there, never on a
  // paragraph of "…" alone; and a text's own "…" is never doubled where it's cut.
  const full = createPrintCover(book, {
    trim: '8.5x11',
    pages: 300,
    blurb: `${'word '.repeat(599)}end…\n\nSecond paragraph here.`,
  });
  const rows = textBoxes(full.svg).filter((b) => !b.moved);
  assert.match(rows[rows.length - 1].text, /\bend…$/);
  const imprint = textBoxes(
    createPrintCover(book, { pages: 100, imprint: `Hello… ${'www.example.com/averyveryveryverylongpath/'.repeat(4)}` })
      .svg,
  ).filter((b) => /Hello/.test(b.text));
  assert.deepEqual(
    imprint.map((b) => b.text),
    ['Hello…'],
  );
  // A hook past its 200 characters ends in an ellipsis too, not mid-word.
  const hooked = textBoxes(createPrintCover(book, { pages: 100, hook: 'word '.repeat(60) }).svg).filter(
    (b) => !b.moved,
  );
  assert.match(hooked.map((b) => b.text).join(' '), /word…/);
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

test('a word wider than the back (a web address) is broken to fit, after a / where it can be', () => {
  const url = 'https://www.goodreads.com/book/show/12345678-the-lighthouse-keeper-a-novel';
  const print = createPrintCover(
    { ...book, style: 'retro' },
    { trim: '5x8', pages: 200, blurb: `Ada rows out to find out why. Read the first chapter at ${url} and join in.` },
  );
  assertBackText(print, 'long web address');
  const lines = textBoxes(print.svg)
    .filter((b) => !b.moved && b.family?.includes('Georgia'))
    .map((b) => b.text);
  // Every character is there, in order, broken only where it had to be.
  assert.equal(lines.join('').replace(/\s+/g, ''), `Adarowsouttofindoutwhy.Readthefirstchapterat${url}andjoinin.`);
  assert.ok(
    lines.some((l) => /\/$/.test(l) || /-$/.test(l)),
    lines.join(' | '),
  );
  // A word no wider than the column is never broken.
  const plain = textBoxes(createPrintCover(book, { pages: 200, blurb: 'Short words only here.' }).svg)
    .filter((b) => !b.moved && b.family?.includes('Georgia'))
    .map((b) => b.text);
  assert.deepEqual(plain, ['Short words only here.']);
});

test('the back’s text breaks lines as each language does, quickly, and cuts without losing a row', () => {
  /** @param {string} blurb @param {string} trim */
  const rows = (blurb, trim = '5x8') =>
    textBoxes(createPrintCover({ ...book, style: 'minimal' }, { trim, pages: 200, blurb }).svg)
      .filter((b) => !b.moved && b.family?.includes('Georgia'))
      .map((b) => b.text);
  // French: no line starts with ? ! ; : » or ends with «.
  const fr = rows(
    'Qui a éteint le phare ? Et pourquoi personne sur l’île ne veut-il en parler ? Le gardien murmure : « Certaines lumières restent allumées pour une raison. » Ada rame dans la tempête ; elle trouve le journal du gardien !'.repeat(
      2,
    ),
    '5.25x8',
  );
  for (const row of fr) assert.ok(!/^[?!;:»]/.test(row) && !/«$/.test(row), row);
  // Japanese: no line starts with 。、」 or ends with 「.
  const ja = rows(
    '灯台の灯りが九十年ぶりに消えた夜、エイダは嵐の中を漕ぎ出して、その理由を確かめに行く。「彼女が見つけたのは、灯台守の日誌だった。」'.repeat(
      6,
    ),
    '8.5x11',
  );
  assert.ok(ja.length > 2);
  for (const row of ja) assert.ok(!/^[。、」』）]/.test(row) && !/[「『（]$/.test(row), row);
  // Thai: lines break between words, as the segmenter finds them, not inside one.
  const thaiWords = ['เมื่อ', 'ไฟ', 'ประภาคาร', 'ดับ', 'ลง', 'เป็น', 'ครั้ง', 'แรก', 'ใน', 'รอบ', 'เก้าสิบ', 'ปี'];
  const th = rows(thaiWords.join('').repeat(12));
  const words = new Set(thaiWords);
  const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
  for (const row of th) {
    const parts = [...segmenter.segment(row)].map((p) => p.segment);
    assert.ok(words.has(parts[0]) && words.has(parts[parts.length - 1]), row);
  }
  // A long blurb without spaces: cut at its end with an ellipsis after text, never a row of "…" alone.
  const long = rows('灯台の灯りが消えた夜、エイダは嵐の中を漕ぎ出した。'.repeat(80));
  assert.match(long[long.length - 1], /.…$/u);
  // Quickly, however long (once wrapping measured ever longer prefixes of it).
  const started = performance.now();
  rows('灯台の灯りが九十年ぶりに消えた夜、エイダは嵐の中を漕ぎ出した。'.repeat(70), '6x9');
  assert.ok(performance.now() - started < 400, `${Math.round(performance.now() - started)} ms`);
});

test('the spine keeps the ink of accents and tails 1/16 in from its edges too', () => {
  for (const [title, font, pages, paper] of /** @type {const} */ ([
    ['Été à Paris', undefined, 120, 'white'],
    ['Die Bücher der Nacht', undefined, 100, 'cream'],
    ['Ça Ira', 'serif', 120, 'white'],
    ['Quiet Days', 'serif', 120, 'white'],
    ['夜の図書館', undefined, 120, 'white'],
    // Old-style figures hang below the baseline in Georgia and Hoefler Text; brackets and bars too.
    ['Fahrenheit 451', 'serif', 120, 'white'],
    ['Summer of 1969', 'serif', 100, 'white'],
    ['Jade', 'garamond', 100, 'white'],
    ['[Redacted]', undefined, 100, 'white'],
    ['A|B', undefined, 100, 'white'],
  ])) {
    const print = createPrintCover({ title, author: 'Ann Lee', font, seed: 's', style: 'minimal' }, { pages, paper });
    assert.equal(print.spineText, true, title);
    const half = (print.inches.spine * 96) / 2 - 6;
    const group = /rotate\(90\)">([\s\S]*?)<\/g><\/g>/.exec(print.svg)?.[1] ?? '';
    for (const line of textBoxes(`<g>${group}</g></g>`)) {
      const { font: face } = extentOf(line);
      const up = (face.cap ?? 0.72) + markExtent(line.text).above;
      const top = line.y - up * line.size;
      const bottom = line.y + descentOf(line.text) * line.size;
      assert.ok(
        top >= -half - 0.01 && bottom <= half + 0.01,
        `${title}: "${line.text}" from ${top} to ${bottom}, within ±${half}`,
      );
    }
  }
});

test('no type on the spine or the back under 6 pt: the author is left off a thin spine, a long imprint cut', () => {
  const spineLines = (/** @type {object} */ cover, /** @type {object} */ print) => {
    const svg = createPrintCover(/** @type {any} */ (cover), /** @type {any} */ (print)).svg;
    const group = /rotate\(90\)">([\s\S]*?)<\/g><\/g>/.exec(svg)?.[1] ?? '';
    return textBoxes(`<g>${group}</g></g>`).map((b) => ({ text: b.text, pt: (b.size * 72) / 96 }));
  };
  for (const [cover, print] of /** @type {const} */ ([
    [{ title: 'Dune', author: 'Frank Herbert', style: 'minimal' }, { pages: 88 }],
    [book, { pages: 80, paper: 'cream' }],
    [book, { pages: 400 }],
  ])) {
    const lines = spineLines(cover, print);
    assert.ok(lines.length >= 1, JSON.stringify(print));
    for (const line of lines) assert.ok(line.pt >= 6 - 0.01, `${line.text} at ${line.pt.toFixed(2)} pt`);
  }
  // Dune on 88 pages: the author too, at 6 pt, as their own letters fit it (not dropped because the
  // title's largest size was small).
  assert.deepEqual(
    spineLines({ title: 'Dune', author: 'Frank Herbert', style: 'minimal' }, { pages: 88 }).map((l) => l.text),
    ['DUNE', 'FRANK HERBERT'],
  );
  assert.deepEqual(
    spineLines(book, { pages: 400 }).map((l) => l.text),
    ['THE LIGHTHOUSE KEEPER', 'MARA ELLISON'],
  );
  // The spine's capitals are the cover's language's: Turkish i is İ.
  assert.deepEqual(
    spineLines({ title: 'istanbul', author: 'Orhan Pamuk', lang: 'tr', style: 'minimal' }, { pages: 300 }).map(
      (l) => l.text,
    ),
    ['İSTANBUL', 'ORHAN PAMUK'],
  );
  // A language tag the cover takes but Intl doesn't: capitals all the same.
  assert.deepEqual(
    spineLines({ title: 'Istanbul', author: 'Ann', lang: 'en-GB-oed', style: 'minimal' }, { pages: 300 }).map(
      (l) => l.text,
    ),
    ['ISTANBUL', 'ANN'],
  );
  // An imprint too long for its line: at 6 pt, cut with an ellipsis (not shrunk below it).
  const imprint = createPrintCover(book, {
    trim: '5x8',
    pages: 200,
    blurb: BLURB,
    imprint: 'https://www.harbourandlighthousepress.co.uk/books/the-lighthouse-keeper',
  });
  const foot = textBoxes(imprint.svg).filter((b) => !b.moved && /harbour/i.test(b.text));
  assert.equal(foot.length, 1);
  assert.ok((foot[0].size * 72) / 96 >= 6 - 0.01, `${foot[0].size} px`);
  assert.match(foot[0].text, /…$/);
  assertBackText(imprint, 'long imprint');
});

test('the back’s grain is as fine as the front’s, on landscape trims too', () => {
  for (const trim of /** @type {const} */ (['6x9', [8.25, 6], '8.5x8.5'])) {
    const print = createPrintCover({ ...book, texture: true }, { pages: 200, trim });
    const [tw, th] = print.inches.trim;
    // Per printed px: the front's frequency is per its own units (600 across the trim's width).
    const front = /** @type {number} */ (
      Number(/<symbol[\s\S]*?<feTurbulence[^>]*baseFrequency="([\d.]+)"/.exec(print.svg)?.[1]) / ((tw * 96) / 600)
    );
    const back = Number(
      /id="pc[^"]*-texture-dark"[^>]*><feTurbulence[^>]*baseFrequency="([\d.]+)"/.exec(print.svg)?.[1],
    );
    assert.ok(Number.isFinite(front) && Number.isFinite(back), String(trim));
    assert.ok(Math.abs(front - back) / back < 0.01, `${trim}: front ${front}, back ${back} per px (${th})`);
  }
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
  assert.deepEqual(printLimits.pages, {
    white: [24, 828],
    cream: [24, 776],
    color: [72, 600],
    'premium-color': [24, 828],
  });
});

test('KDP’s trims, and the largest of them take fewer pages (and not every paper)', () => {
  assert.equal(Object.keys(trimSizes).length, 16);
  for (const [name, [w, h]] of Object.entries(trimSizes)) {
    assert.equal(name, `${w}x${h}`);
    assert.ok(
      w >= printLimits.width[0] &&
        w <= printLimits.width[1] &&
        h >= printLimits.height[0] &&
        h <= printLimits.height[1],
      name,
    );
  }
  const big = { title: 'Big', seed: 's' };
  assert.ok(createPrintCover(big, { trim: '8.5x11', pages: 590 }));
  assert.throws(
    () => createPrintCover(big, { trim: '8.5x11', pages: 591 }),
    /8\.5 × 11 in book on white paper has at most 590 pages/,
  );
  assert.throws(() => createPrintCover(big, { trim: [8.5, 8.5], pages: 560, paper: 'cream' }), /at most 550/);
  assert.throws(
    () => createPrintCover(big, { trim: '8.27x11.69', pages: 100, paper: 'color' }),
    /color paper isn't printed at 8\.27 × 11\.69 in/,
  );
  // A trim of its own keeps the paper's own limits.
  assert.ok(createPrintCover(big, { trim: [8.4, 11], pages: 800 }));
  assert.ok(createPrintCover(big, { trim: '6x9', pages: 828 }));
});

test('the blurb’s budget counts characters as cleanText does: emoji first don’t crowd out what follows', () => {
  const emoji = '🙂'.repeat(1600);
  const print = createPrintCover(
    { title: 'x', seed: 's' },
    { trim: '6x9', pages: 200, blurb: `${emoji}\n\nThe second paragraph.` },
  );
  assert.match(print.svg, /The second paragraph/);
});

test('the spine’s title has all the room the author leaves: the whole title, where it fits at 6 pt', () => {
  const title = 'The Extraordinary and Entirely True Account of the Lighthouse Keeper of Wimbledon Common';
  for (const [author, pages] of [
    ['Bartholomew Featherstonehaugh', 90],
    ['Ann Lee', 200],
  ]) {
    const print = createPrintCover({ title, author, seed: 's' }, { trim: '5x8', pages });
    const spine = print.svg.slice(print.svg.indexOf('rotate(90)'));
    assert.match(spine, /WIMBLEDON COMMON</, `${pages} pages: the whole title`);
    assert.doesNotMatch(/<text[^>]*>([^<]*)</.exec(spine)?.[1] ?? '', /…/);
  }
});

test('the spine’s title takes back the room a byline gives when it shrinks to the title’s size', () => {
  const print = createPrintCover(
    {
      title: 'The Lighthouse Keeper of Wimbledon Common and Other Stories',
      author: 'Frank Herbert',
      style: 'minimal',
      seed: 'x',
    },
    { trim: '5x8', pages: 300 },
  );
  const spine = print.svg.slice(print.svg.indexOf('rotate(90)'));
  const size = Number(/font-size="([\d.]+)"/.exec(spine)?.[1]);
  assert.ok(size > 12, `the title at ${size} px`);
});

test('the spine shows the author whenever their letters fit at 6 pt, and the whole of a long name where the title leaves room', () => {
  /** @param {string} title @param {string} author @param {number} pages */
  const spine = (title, author, pages) => {
    const print = createPrintCover({ title, author, seed: 's' }, { trim: '6x9', pages });
    return [...print.svg.slice(print.svg.indexOf('rotate(90)')).matchAll(/<text[^>]*>([^<]*)</g)]
      .slice(0, 2)
      .map((m) => m[1]);
  };
  assert.deepEqual(spine('ความลับของทะเล', 'Frank Herbert', 140), ['ความลับของทะเล', 'FRANK HERBERT']);
  assert.deepEqual(spine('A', 'Bartholomew Featherstonehaugh-Cholmondeley Esq.', 400), [
    'A',
    'BARTHOLOMEW FEATHERSTONEHAUGH-CHOLMONDELEY ESQ.',
  ]);
});
