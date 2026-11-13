// The Worker's PNG covers: the fonts it reads, the text laid out in them, and resvg drawing them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { FONT_FILES, fontSet, readFont } from '../worker/fonts.js';
import { pngEngine, drawnText, prepare } from '../worker/png.js';
import { createCover, createMockup, styles, FONTS, measureText } from '../src/index.js';
import { textBoxes, extentOf } from './svg-text.js';

const file = (/** @type {string} */ path) => new Uint8Array(readFileSync(new URL(`../${path}`, import.meta.url)));
// resvg is a dev dependency (the site's, not the library's): where it isn't installed, as in CI's
// jobs that test the library bare, these tests are skipped; the checks job runs them.
const resvg = await import('@resvg/resvg-wasm').catch(() => null);
if (!resvg && process.env.REQUIRE_RESVG) throw new Error('REQUIRE_RESVG: @resvg/resvg-wasm is not installed');
const skip = resvg ? false : 'resvg is a dev dependency: run npm ci';
const engine = resvg
  ? await pngEngine(resvg, file('node_modules/@resvg/resvg-wasm/index_bg.wasm'), async (name) =>
      file(`public/fonts/${name}`),
    )
  : /** @type {never} */ (null);

/** A PNG's width and height, from its header. @param {Uint8Array} png */
const sizeOf = (png) => {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a PNG');
  const view = new DataView(png.buffer, png.byteOffset);
  return [view.getUint32(16), view.getUint32(20)];
};

test('the fonts the Worker loads are the files in public/fonts, and each stack has its open face', () => {
  const files = readdirSync(new URL('../public/fonts/', import.meta.url)).filter((f) => /\.(ttf|otf)$/.test(f));
  assert.deepEqual([...files].sort(), [...FONT_FILES].sort());
  const set = fontSet(FONT_FILES.map((f) => readFont(file(`public/fonts/${f}`))));
  assert.deepEqual(Object.fromEntries(Object.entries(FONTS).map(([id, f]) => [id, set.familyOf(f.family)])), {
    serif: 'Noto Serif',
    didone: 'Noto Serif Display',
    garamond: 'EB Garamond',
    sans: 'Liberation Sans',
    geometric: 'TeX Gyre Adventor',
    humanist: 'Noto Sans',
    condensed: 'Roboto Condensed',
    display: 'Anton',
    mono: 'Liberation Mono',
  });
  // Weights and slants as CSS matches them; generic names, and names there are none of.
  assert.equal(set.faceFor('Georgia, serif', 800, false).weight, 700);
  assert.equal(set.faceFor('Georgia, serif', 500, true).italic, true);
  assert.equal(set.familyOf('monospace'), 'Liberation Mono');
  assert.equal(set.familyOf('Nothing Like It'), 'Noto Serif');
  // Latin, Greek and Cyrillic, in every weight; not Japanese or Arabic.
  assert.equal(set.covers('Ça Ira — Ελλάδα, Москва! İstanbul ‘ok’ 1 2 3'), true);
  assert.equal(set.covers('東京'), false);
  assert.equal(set.covers('مرحبا'), false);
});

test('text measured in the PNG fonts is as wide as resvg draws it', { skip }, () => {
  for (const [family, text] of [
    ["Georgia, 'Noto Serif', serif", 'The Lighthouse Keeper'],
    ["'Helvetica Neue', 'Liberation Sans', sans-serif", 'MARA ELLISON'],
    ["'Avenir Next Condensed', 'Roboto Condensed', sans-serif", 'KEEPER'],
    ["'Courier New', 'Liberation Mono', monospace", 'by Mara Ellison'],
  ]) {
    const measured = engine.laidOut(() => measureText(text, 100, { font: { family } }));
    // resvg's own box of the line's ink (a little inside the advance widths at either end), in the
    // family render() names for the list, as it draws covers.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="200"><text x="10" y="120" font-family="${engine.fonts.familyOf(family)}" font-size="100">${text}</text></svg>`;
    const r = new /** @type {typeof import('@resvg/resvg-wasm')} */ (resvg).Resvg(svg, {
      font: { fontBuffers: FONT_FILES.map((f) => file(`public/fonts/${f}`)), loadSystemFonts: false },
    });
    const ink = r.getBBox()?.width ?? 0;
    r.free();
    assert.ok(
      Math.abs(measured - ink) / measured < 0.06,
      `${family}: measured ${measured.toFixed(1)}, drawn ${ink.toFixed(1)}`,
    );
  }
  // Outside laidOut, text is measured as before.
  const before = measureText('Keeper', 100, { font: FONTS.serif });
  engine.laidOut(() => measureText('Keeper', 100, { font: FONTS.serif }));
  assert.equal(measureText('Keeper', 100, { font: FONTS.serif }), before);
});

test('every style laid out in the PNG fonts keeps its text inside the cover, and draws as a PNG', { skip }, () => {
  for (const style of styles) {
    for (const [width, height] of [
      [600, 900],
      [600, 600],
    ]) {
      engine.laidOut(() => {
        const cover = createCover({
          title: 'The Lighthouse Keeper',
          author: 'Mara Ellison',
          subtitle: 'A Novel',
          style,
          seed: 's',
          width,
          height,
        });
        for (const box of textBoxes(cover.svg)) {
          if (box.moved || box.x === undefined) continue;
          const giant = style === 'typographic' && box.size > Math.min(width, height) * 0.5;
          const { left, right } = extentOf(box);
          if (!giant)
            assert.ok(
              left >= -1 && right <= width + 1,
              `${style} ${width}x${height}: "${box.text}" from ${left.toFixed(0)} to ${right.toFixed(0)}`,
            );
        }
      });
    }
  }
  const cover = engine.laidOut(() =>
    createCover({ title: 'Dune', author: 'Frank Herbert', style: 'retro', seed: 's' }),
  );
  assert.deepEqual(sizeOf(engine.render(cover.svg)), [600, 900]);
  assert.deepEqual(sizeOf(engine.render(cover.svg, 2)), [1200, 1800]);
  const card = engine.laidOut(() => createMockup(cover, { kind: 'card', text: 'Out now' }));
  assert.deepEqual(sizeOf(engine.render(card.svg)), [1200, 630]);
  assert.match(drawnText(card.svg), /Dune[\s\S]*Out now/);
  assert.equal(engine.draws(card.svg), true);
  assert.equal(engine.draws(createCover({ title: '灯台守', style: 'minimal' }).svg), false);
});

test('a line a face lacks a letter of is set, measured and drawn, in a family that has them all', { skip }, () => {
  // Anton (the display stack's open face) has no Cyrillic: the line goes on down the list, to the
  // sans-serif, as a browser's would; the line is named so for resvg, and measured so.
  const display = FONTS.display.family;
  assert.equal(engine.fonts.familyOf(display, 'REVOLUTIONARY'), 'Anton');
  assert.equal(engine.fonts.familyOf(display, 'ЯEVOLUTIONARY'), 'Liberation Sans');
  const cover = engine.laidOut(() =>
    createCover({ title: 'ЯEVOLUTIONARY', author: 'Mara Ellison', style: 'thriller', font: 'display', seed: 's' }),
  );
  assert.match(prepare(cover.svg, engine.fonts), /font-family="Liberation Sans"[^>]*>ЯEVOLUTIONARY</);
  for (const box of textBoxes(cover.svg)) {
    if (box.moved || box.x === undefined) continue;
    const { left, right } = engine.laidOut(() => extentOf(box));
    assert.ok(left >= -1 && right <= 601, `"${box.text}" from ${left.toFixed(0)} to ${right.toFixed(0)}`);
  }
});

test('prepare: a lone filled shape’s opacity is its fill’s; others keep theirs', { skip }, () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><g filter="url(#b)"><circle r="5" fill="#f00" opacity="0.5"/>' +
    '<rect width="5" height="5" fill="#0f0" stroke="#000" opacity="0.4"/><path d="M0 0" fill="none" stroke="#000" opacity="0.3"/>' +
    '<g opacity="0.2"><circle r="1" fill="#00f"/></g></g></svg>';
  const ready = prepare(svg, engine.fonts);
  assert.match(ready, /<circle r="5" fill="#f00" fill-opacity="0.5"\/>/);
  assert.match(ready, /<rect [^>]*stroke="#000" opacity="0.4"\/>/);
  assert.match(ready, /<path [^>]*fill="none" [^>]*opacity="0.3"\/>/);
  assert.match(ready, /<g opacity="0.2">/);
});

test('an engine whose resvg stopped draws no more (the Worker makes a new one)', async () => {
  // A stand-in resvg whose drawing traps, as resvg 2.6 did on some designs.
  const trapping = {
    initWasm: async () => {},
    Resvg: class {
      render() {
        throw new WebAssembly.RuntimeError('unreachable');
      }
      free() {
        throw new Error('recursive use of an object detected');
      }
    },
  };
  const fonts = FONT_FILES.slice(0, 1);
  const broken = await pngEngine(trapping, new Uint8Array(), async () => file(`public/fonts/${fonts[0]}`));
  assert.equal(broken.broken, false);
  assert.throws(() => broken.render('<svg xmlns="http://www.w3.org/2000/svg"/>'), /unreachable/);
  assert.equal(broken.broken, true);
  assert.throws(() => broken.render('<svg xmlns="http://www.w3.org/2000/svg"/>'), /unreachable/);
});

test(
  'a character the stack’s faces lack (∞, →, a superscript in italic) is set in a family whose face has it',
  { skip },
  () => {
    const f = engine.fonts;
    // EB Garamond's italic has no superscripts (its upright has): an italic line with one is set in
    // a family whose italic has them all, so resvg draws it as measured.
    assert.equal(f.familyOf(FONTS.garamond.family, 'E = mc²', 400, false), 'EB Garamond');
    assert.notEqual(f.familyOf(FONTS.garamond.family, 'E = mc²', 400, true), 'EB Garamond');
    assert.equal(f.whole(FONTS.garamond.family, 'E = mc²', 400, true), true);
    // ∞ and → aren't in the Noto faces: the line goes to a family that has them, and only it is loaded.
    for (const text of ['Love ∞ Forever', 'North → South']) {
      const family = f.familyOf(FONTS.serif.family, text);
      assert.equal(f.whole(family, text), true, `${text} in ${family}`);
      const cover = engine.laidOut(() =>
        createCover({ title: text, author: 'Mara Ellison', style: 'classic', seed: 's' }),
      );
      const ready = prepare(cover.svg, f);
      const line = new RegExp(
        `font-family="([^"]+)"[^>]*>${text.split(' ')[1]}|font-family="([^"]+)"[^>]*>[^<]*${text.split(' ')[1]}`,
      ).exec(ready);
      assert.ok(line, `${text}: named`);
      assert.equal(
        f.whole(/** @type {string} */ (line[1] ?? line[2]), text.split(' ')[1]),
        true,
        `${text}: ${line[1] ?? line[2]}`,
      );
    }
  },
);
