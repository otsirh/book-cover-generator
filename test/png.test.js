// The Worker's PNG covers: the fonts it reads, the text laid out in them, and resvg drawing them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FONT_FILES, GENERIC, fontSet, readFont } from '../worker/fonts.js';
import { pngEngine, drawnText, prepare, COVER_PIXELS } from '../worker/png.js';
import { createCover, createMockup, styles, palettes, FONTS, measureText } from '../src/index.js';
import { contrast } from '../src/core.js';
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

test('a drawing that traps resvg isn’t freed (that would trap again), and resvg draws no more', async () => {
  // A stand-in resvg whose drawing traps, as resvg 2.6 did on some designs.
  let frees = 0;
  const stand = () => ({
    initWasm: async () => {},
    Resvg: class {
      constructor(/** @type {string} */ svg) {
        if (svg.includes('early')) throw new WebAssembly.RuntimeError('unreachable');
      }
      render() {
        throw new WebAssembly.RuntimeError('unreachable');
      }
      free() {
        frees++;
      }
    },
  });
  const fonts = FONT_FILES.slice(0, 1);
  const font = async () => file(`public/fonts/${fonts[0]}`);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const resvgA = stand();
  const drawer = await pngEngine(resvgA, new Uint8Array(), font);
  assert.equal(drawer.trapped, false);
  assert.throws(() => drawer.render(svg), /unreachable/);
  assert.equal(frees, 0);
  assert.equal(drawer.trapped, true);
  assert.throws(() => drawer.render(svg), /draws no more/);
  // Another engine on the same resvg is no better: its WebAssembly is the one that trapped.
  assert.equal((await pngEngine(resvgA, new Uint8Array(), font)).trapped, true);
  // (A trap as it starts, too.)
  const resvgB = stand();
  const early = await pngEngine(resvgB, new Uint8Array(), font);
  assert.throws(
    () => early.render('<svg xmlns="http://www.w3.org/2000/svg"><title>early</title></svg>'),
    /unreachable/,
  );
  assert.equal(early.trapped, true);
  assert.equal(frees, 0);
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

test('the blurred styles draw at the pixel cap in a fraction of a Worker’s memory', { skip }, async () => {
  // A resvg of its own (the module loaded afresh starts its own WebAssembly), its memory caught as
  // it starts. The memory only grows, so its size after the drawings is the most they needed.
  /** @type {WebAssembly.Memory | undefined} */
  let memory;
  const instantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = async (...args) => {
    const made = await instantiate(...args);
    memory = (made.instance ?? made).exports.memory;
    return made;
  };
  let own;
  try {
    const fresh = await import(new URL('../node_modules/@resvg/resvg-wasm/index.mjs?memory', import.meta.url).href);
    own = await pngEngine(fresh, file('node_modules/@resvg/resvg-wasm/index_bg.wasm'), async (name) =>
      file(`public/fonts/${name}`),
    );
  } finally {
    WebAssembly.instantiate = instantiate;
  }
  assert.ok(memory, 'resvg’s memory');
  // Their blurs' regions are the cover and 3σ around it (27 MiB in all): 220% of each blurred
  // group, which already spans the cover, took these drawings to 103 MiB of the Worker's 128 MB.
  const side = Math.floor(Math.sqrt(COVER_PIXELS));
  for (const style of ['aurora', 'thriller', 'ribbon']) {
    for (const [width, height] of [
      [600, 900],
      [side, side],
    ]) {
      for (const seed of ['s', 'c']) {
        const cover = own.laidOut(() =>
          createCover({ title: 'The Lighthouse Keeper', author: 'Mara Ellison', style, seed, width, height }),
        );
        own.render(cover.svg);
      }
    }
  }
  const mib = memory.buffer.byteLength / 2 ** 20;
  assert.ok(mib <= 48, `resvg took ${mib.toFixed(0)} MiB`);
});

test('Aurora sets its text at 3:1 or more against the pixels around it, over every palette', { skip }, () => {
  // Each line of text, drawn as the Worker draws it, against the pixels just outside its letters:
  // the blurred fields where they overlap, the grain and the text's own shadow. (Each field alone
  // keeping 3:1 against the ink left a fifth of a line's outline under it on 2 covers in 5.)
  const buffers = FONT_FILES.map((f) => file(`public/fonts/${f}`));
  const families = buffers.map((b) => readFont(b).family);
  /** The SVG's pixels (RGBA) as resvg draws it. @param {string} svg */
  const draw = (svg) => {
    const ready = prepare(svg, engine.fonts);
    const named = new Set([GENERIC.serif, ...[...ready.matchAll(/\sfont-family="([^"]*)"/g)].map((m) => m[1])]);
    const r = new /** @type {typeof import('@resvg/resvg-wasm')} */ (resvg).Resvg(ready, {
      font: {
        fontBuffers: buffers.filter((_, i) => named.has(families[i])),
        loadSystemFonts: false,
        defaultFontFamily: GENERIC.serif,
      },
    });
    const image = r.render();
    const out = { width: image.width, pixels: image.pixels.slice() };
    image.free();
    r.free();
    return out;
  };
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f'];
  palettes.forEach((p, k) => {
    const seed = seeds[k % seeds.length];
    const { svg } = engine.laidOut(() =>
      createCover({ title: 'The Lighthouse Keeper', author: 'Mara Ellison', style: 'aurora', palette: p.id, seed }),
    );
    const cover = draw(svg).pixels;
    const open = svg.slice(0, svg.indexOf('>') + 1);
    for (const [, attrs, lines] of svg.matchAll(/<g ([^>]*)>((?:<text\b[^>]*>[^<]*<\/text>)+)<\/g>/g)) {
      const ink = /\sfill="(#[0-9a-f]{6})"/.exec(attrs)?.[1] ?? '';
      const plain = attrs.replace(/\s(?:filter|fill|opacity)="[^"]*"/g, '');
      for (const [line, text] of lines.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)) {
        // The line alone, white on black: where its letters are.
        const { width, pixels } = draw(
          `${open}<rect width="100%" height="100%"/><g ${plain} fill="#fff">${line}</g></svg>`,
        );
        const height = pixels.length / 4 / width;
        const on = (/** @type {number} */ x, /** @type {number} */ y) => pixels[(y * width + x) * 4] > 0;
        let [x0, y0, x1, y1] = [width, height, 0, 0];
        for (let i = 0; i < pixels.length; i += 4) {
          if (!pixels[i]) continue;
          const x = (i / 4) % width;
          const y = Math.floor(i / 4 / width);
          [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
        }
        // Its outline: the pixels with none of a letter that touch one.
        let ring = 0;
        let under = 0;
        for (let y = Math.max(1, y0 - 1); y <= Math.min(height - 2, y1 + 1); y++) {
          for (let x = Math.max(1, x0 - 1); x <= Math.min(width - 2, x1 + 1); x++) {
            if (on(x, y)) continue;
            let touches = false;
            for (let dy = -1; dy <= 1 && !touches; dy++)
              for (let dx = -1; dx <= 1; dx++) touches ||= on(x + dx, y + dy);
            if (!touches) continue;
            ring++;
            const i = (y * width + x) * 4;
            const seen = `#${[cover[i], cover[i + 1], cover[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
            if (contrast(seen, ink) < 3) under++;
          }
        }
        assert.ok(ring > 0, `${p.id} ${seed}: "${text}" is drawn`);
        assert.ok(
          under / ring < 0.2,
          `${p.id} ${seed}: ${Math.round((under / ring) * 100)}% of "${text}"'s outline is under 3:1`,
        );
      }
    }
  });
});

test(
  'the Worker’s copy of resvg (worker/resvg-glue.js) is the package’s, and each copy has an instance of its own',
  { skip },
  async () => {
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/vendor-resvg.js', import.meta.url)), '--check']);
    const { createResvg } = await import('../worker/resvg-glue.js');
    const wasm = await WebAssembly.compile(file('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
    const fonts = FONT_FILES.slice(0, 1);
    const [one, two] = [createResvg(), createResvg()];
    assert.notEqual(one.Resvg, two.Resvg);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#c00"/></svg>';
    for (const copy of [one, two]) {
      const drawer = await pngEngine(copy, wasm, async () => file(`public/fonts/${fonts[0]}`));
      const png = drawer.render(svg);
      assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
    }
  },
);
