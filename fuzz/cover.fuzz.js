// Property-based fuzzing (fast-check): random titles, palettes, sizes, pins, book lists and links,
// for properties that must hold for any input. Run with `npm run test:fuzz` (a dev dependency, so
// apart from `npm test`, which runs without installing anything).
import process from 'node:process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  createCover,
  createMockup,
  listStyles,
  palettes,
  parseBookList,
  sizeLimits,
  mockupKinds,
} from '../src/index.js';
import { fold, idFor } from '../src/shared.js';
import { LINK, optionsFromLink } from '../src/link.js';
import { assertWellFormed } from '../test/well-formed.js';

const STYLES = listStyles();
/** FUZZ_RUNS=20 npm run test:fuzz runs every property 20 times as often. */
const scale = Math.max(1, Number(process.env.FUZZ_RUNS) || 1);
/** @param {number} n */
const runs = (n) => ({ numRuns: n * scale });
/** Any text people might type or paste: letters of every script, emoji, controls and lone surrogates. */
const anyText = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 80 }),
  fc.string({ unit: 'binary', maxLength: 40 }),
  fc.constantFrom(
    '',
    ' ',
    '\n',
    'The',
    'A Very Long Title That Has To Wrap Over Several Lines Of The Cover',
    `Fish & "Chips" <b> 'n' ]]>`,
  ),
);
const hex = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, '0')}`);
const palette = fc.oneof(
  fc.constantFrom('random', ...palettes.map((p) => p.id)),
  fc.record({ bg: hex, ink: hex, accents: fc.array(hex, { minLength: 1, maxLength: 3 }) }),
);
/** A size the library can make: 50 to 10,000 px a side (kept small here, for speed), 1:3 to 3:1. */
const size = fc
  .tuple(fc.integer({ min: sizeLimits.min, max: 1600 }), fc.double({ min: 1 / 3, max: 3, noNaN: true }))
  .map(([w, ratio]) => [w, Math.min(sizeLimits.max, Math.max(sizeLimits.min, Math.round(w * ratio)))])
  .filter(([w, h]) => w <= h * sizeLimits.ratio && h <= w * sizeLimits.ratio);
/** A style, and pins it offers (some, none, or left to the seed). */
const styleAndPins = fc.constantFrom(...STYLES).chain((s) =>
  fc
    .tuple(...s.variants.map((v) => fc.option(fc.constantFrom(...v.values.map((x) => x.value)), { nil: undefined })))
    .map((values) => ({
      style: s.id,
      variants: Object.fromEntries(s.variants.flatMap((v, i) => (values[i] ? [[v.name, values[i]]] : []))),
    })),
);
const coverOptionsArb = fc.record({
  title: anyText,
  author: anyText,
  subtitle: anyText,
  series: fc.option(anyText, { nil: undefined }),
  badge: fc.option(anyText, { nil: undefined }),
  seed: fc.oneof(fc.string({ maxLength: 12 }), fc.integer()),
  palette,
  size,
  texture: fc.boolean(),
  styled: styleAndPins,
});

test('any cover options draw a well-formed cover, the same every time', () => {
  fc.assert(
    fc.property(coverOptionsArb, ({ size: [width, height], styled, ...rest }) => {
      const options = { ...rest, ...styled, width, height };
      const cover = createCover(options);
      assert.match(cover.svg, /^<svg [\s\S]*<\/svg>$/);
      assertWellFormed(cover.svg, JSON.stringify(options));
      assert.doesNotMatch(cover.svg, /NaN|Infinity|undefined|\[object /);
      assert.equal(cover.width, width);
      assert.equal(createCover(options).svg, cover.svg);
    }),
    runs(250),
  );
});

test('any cover makes every mockup', () => {
  fc.assert(
    fc.property(
      coverOptionsArb,
      fc.constantFrom(...mockupKinds),
      anyText,
      ({ size: [width, height], styled, ...rest }, kind, text) => {
        const { svg } = createMockup(createCover({ ...rest, ...styled, width, height }), { kind, text });
        assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
      },
    ),
    runs(60),
  );
});

test('any text reads as a book list: books with titles, or which JSON line is wrong', () => {
  const listText = fc.oneof(
    anyText,
    fc.array(fc.tuple(anyText, anyText), { maxLength: 6 }).map((rows) => rows.map((r) => r.join(' | ')).join('\n')),
    fc
      .array(fc.tuple(anyText, anyText, fc.constantFrom('horror', 'Mint', '600', 'x')), { maxLength: 6 })
      .map((rows) => ['title,author,genre', ...rows.map((r) => r.map((c) => JSON.stringify(c)).join(','))].join('\n')),
  );
  fc.assert(
    fc.property(listText, (text) => {
      let books;
      try {
        books = parseBookList(text);
      } catch (err) {
        // JSON lines (every line starting with "{") must be JSON: a list that says which line isn't.
        assert.ok(err instanceof SyntaxError && /^\s*\{/.test(text), String(err));
        return;
      }
      for (const book of books) {
        assert.equal(typeof book.title, 'string');
        assert.ok(String(book.title).trim());
      }
    }),
    runs(400),
  );
});

test('any link value reads to a value of its kind, or is dropped', () => {
  fc.assert(
    fc.property(fc.constantFrom(...Object.keys(LINK)), anyText, (key, raw) => {
      const value = LINK[/** @type {keyof typeof LINK} */ (key)](raw);
      if (value === undefined) return;
      if (key === 'texture') assert.equal(typeof value, 'boolean');
      else assert.equal(typeof value, 'string');
      if (key === 'title') assert.ok(String(value).length <= 200);
    }),
    runs(1000),
  );
});

test('any query either draws a cover or says what is wrong with it', () => {
  const pairs = fc.array(
    fc.tuple(
      fc.constantFrom(
        'title',
        'style',
        'palette',
        'format',
        'variant',
        'case',
        'texture',
        'seed',
        'width',
        'height',
        'genre',
        'font',
        'bg',
        'ink',
        'accent',
      ),
      anyText,
    ),
    { maxLength: 6 },
  );
  fc.assert(
    fc.property(pairs, (entries) => {
      try {
        createCover(optionsFromLink(new URLSearchParams(entries)));
      } catch (err) {
        // A mistake in the query is an Error with a message, never a crash of another kind.
        assert.ok(err instanceof Error, String(err));
        assert.ok(err.message);
      }
    }),
    runs(400),
  );
});

test('a name is found in any case and spacing, and folding is stable', () => {
  fc.assert(
    fc.property(fc.constantFrom(...STYLES), fc.constantFrom('upper', 'lower', 'spaced'), (s, how) => {
      const name = how === 'upper' ? s.name.toUpperCase() : how === 'lower' ? s.name.toLowerCase() : `  ${s.name} `;
      assert.equal(idFor(name, STYLES), s.id);
    }),
    runs(100),
  );
  fc.assert(
    fc.property(anyText, (t) => assert.equal(fold(fold(t)), fold(t))),
    runs(1000),
  );
});
