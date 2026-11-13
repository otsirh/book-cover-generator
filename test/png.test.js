// The Worker's PNG covers: the fonts it reads, the text laid out in them, and resvg drawing them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { FONT_FILES, fontSet, readFont } from '../worker/fonts.js';
import { pngEngine, drawnText } from '../worker/png.js';
import { createCover, createMockup, styles, FONTS, measureText } from '../src/index.js';
import { textBoxes, extentOf } from './svg-text.js';

const file = (/** @type {string} */ path) => new Uint8Array(readFileSync(new URL(`../${path}`, import.meta.url)));
// resvg is a dev dependency (the site's, not the library's): where it isn't installed, as in CI's
// jobs that test the library bare, these tests are skipped; the checks job runs them.
const resvg = await import('@resvg/resvg-wasm').catch(() => null);
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
