// Covers as PNG, in the Worker: resvg (compiled to WebAssembly) draws the SVG with the open fonts
// in public/fonts, and the cover is laid out with those fonts' own widths, so text fits as drawn.
// The WebAssembly module and the font files are passed in: the Worker imports and fetches them,
// Node (tests, the dev server) reads them from disk.
import { setTextMeasurer } from '../src/text.js';
import { FONT_FILES, GENERIC, fontSet, readFont } from './fonts.js';

/**
 * The most pixels a cover is drawn at. resvg's memory grows with the pixels and the cover's
 * filters (blurs, grain): the heaviest style, Aurora, peaks near 140 bytes a pixel, and a Worker
 * has 128 MB in all, its WebAssembly's included (which never shrinks). 600 × 900 px fits; larger
 * PNGs come from the app, which draws them in the browser.
 */
export const COVER_PIXELS = 600_000;

/**
 * The most pixels a mockup is drawn at: it shows the cover as a picture already drawn (see
 * worker/index.js), so it costs little more than its pixels: a story (1080 × 1920) fits. A flat
 * shot and an e-reader cast a shadow as wide as the picture, which costs about 55 bytes a pixel:
 * they have less.
 */
export const MOCKUP_PIXELS = 2_100_000;
/** The most pixels a flat or e-reader mockup is drawn at (see MOCKUP_PIXELS). */
export const SHADOWED_PIXELS = 1_300_000;

/** @param {string} s */
const unescape = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (_, dec, hexa, name) =>
    dec
      ? String.fromCodePoint(Number(dec))
      : hexa
        ? String.fromCodePoint(parseInt(hexa, 16))
        : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[/** @type {string} */ (name).toLowerCase()] ?? ''),
  );

/**
 * The text an SVG draws: its <text> and <tspan> elements' (not its <title>, which isn't drawn).
 * @param {string} svg
 */
export const drawnText = (svg) =>
  [...svg.matchAll(/<(?:text|tspan)\b[^>]*>([^<]*)/g)].map((m) => unescape(/** @type {string} */ (m[1]))).join(' ');

/**
 * The SVG as resvg is to draw it: each line names the one family it was measured in (resvg's own
 * choice from a list can differ: it skips a condensed face that isn't first, and sets a line a face
 * lacks a letter of in another face whole), and each group its list's family. (Opacity is drawn
 * as it is: resvg 2.6 stopped on opacity under Aurora's blurs only while their region was the
 * group's 220%; blurFilter's canvas region ended that.)
 * @param {string} svg @param {ReturnType<typeof fontSet>} fonts
 */
export function prepare(svg, fonts) {
  return prepared(svg, fonts).svg;
}

/**
 * prepare(), and whether one family has every line's text: else resvg needs every font, to take
 * each character from one that has it.
 * @param {string} svg @param {ReturnType<typeof fontSet>} fonts
 */
function prepared(svg, fonts) {
  /** The font-family list, weight and slant in force, by open element. @type {{ list?: string, weight: number, italic: boolean }[]} */
  const open = [];
  let whole = true;
  const named = svg.replace(
    /<(\/?)(g|text|tspan)\b([^>]*?)(\/?)>([^<]*)/g,
    (all, closing, tag, attrs, self, content) => {
      if (closing) {
        open.pop();
        return all;
      }
      const up = open.at(-1) ?? { list: undefined, weight: 400, italic: false };
      const own = /\sfont-family="([^"]*)"/.exec(attrs)?.[1];
      const weight = Number(/\sfont-weight="(\d+)"/.exec(attrs)?.[1] ?? up.weight);
      const style = /\sfont-style="(\w+)"/.exec(attrs)?.[1];
      const state = {
        list: own === undefined ? up.list : unescape(own),
        weight,
        italic: style ? style === 'italic' : up.italic,
      };
      if (!self) open.push(state);
      const text = tag === 'g' ? '' : unescape(content).trim();
      if (state.list === undefined || (own === undefined && !text)) return all;
      const set = fonts.setIn(state.list, text, state.weight, state.italic);
      if (!set.whole) whole = false;
      const family = set.family.replace(/[<>&"']/g, '');
      const rest = attrs.replace(/\sfont-family="[^"]*"/, '');
      return `<${tag}${rest} font-family="${family}"${self}>${content}`;
    },
  );
  return { svg: named, whole };
}

/** resvg's WebAssembly, started once per resvg (it refuses a second start). @type {WeakMap<object, Promise<void>>} */
const started = new WeakMap();
/**
 * resvgs that trapped: a trapped WebAssembly instance is in no state to draw again (what it held
 * is never freed, its stack is where the trap left it), so every engine on it draws no more. The
 * Worker makes a new engine on a copy of resvg of its own (worker/resvg-glue.js).
 * @type {WeakSet<object>}
 */
const trapped = new WeakSet();

/**
 * resvg, ready to draw with these fonts.
 * @param {{ initWasm(module: WebAssembly.Module | BufferSource): Promise<void>, Resvg: any }} resvg
 * @param {WebAssembly.Module | BufferSource} wasm
 * @param {(file: string) => Promise<Uint8Array>} fontFile  a file of public/fonts, by name
 */
export async function pngEngine(resvg, wasm, fontFile) {
  // (The fonts first: without them there's no engine, and no WebAssembly started for nothing.)
  const buffers = await Promise.all(FONT_FILES.map(fontFile));
  let start = started.get(resvg);
  if (!start) {
    start = resvg.initWasm(wasm);
    started.set(resvg, start);
    start.catch(() => started.delete(resvg));
  }
  await start;
  const faces = buffers.map(readFont);
  const fonts = fontSet(faces);
  return {
    fonts,
    /**
     * Run `draw` (which makes a cover) with text measured in the fonts the PNG is drawn with.
     * @template T @param {() => T} draw @returns {T}
     */
    laidOut(draw) {
      // (The measurer in force before, put back after: a caller's own, or the built-in.)
      const before = setTextMeasurer(fonts.measure);
      try {
        return draw();
      } finally {
        setTextMeasurer(before);
      }
    },
    /** Whether resvg trapped on an earlier drawing (it then draws no more). */
    get trapped() {
      return trapped.has(resvg);
    },
    /** Whether the fonts draw all of this SVG's text (else it would show empty boxes). @param {string} svg */
    draws: (svg) => fonts.covers(drawnText(svg)),
    /**
     * The SVG as a PNG, `scale` times its size.
     * @param {string} svg @param {number} [scale]
     * @returns {Uint8Array}
     */
    render(svg, scale = 1) {
      if (trapped.has(resvg)) throw new Error('resvg stopped on an earlier drawing: it draws no more here');
      const { svg: ready, whole } = prepared(svg, fonts);
      // Only the families it names (prepare names one on each line, which has every letter of it),
      // and the serif resvg falls back to: the fonts are copied into resvg's memory for each
      // drawing. (All of them where no one family has a line's letters.)
      const named = new Set([GENERIC.serif, ...[...ready.matchAll(/\sfont-family="([^"]*)"/g)].map((m) => m[1])]);
      const fontBuffers = whole ? buffers.filter((_, i) => named.has(faces[i].family)) : buffers;
      /** @type {any} */
      let r;
      /** @type {any} */
      let image;
      let trap = false;
      try {
        r = new resvg.Resvg(ready, {
          fitTo: { mode: 'zoom', value: scale },
          font: {
            fontBuffers,
            loadSystemFonts: false,
            defaultFontFamily: GENERIC.serif,
            serifFamily: GENERIC.serif,
            sansSerifFamily: GENERIC['sans-serif'],
            monospaceFamily: GENERIC.monospace,
          },
        });
        image = r.render();
        return image.asPng();
      } catch (err) {
        // resvg stopped (a WebAssembly trap): what it held isn't safe to free, and it draws no more
        // (see `trapped`). An error it reports, such as a size of nothing, leaves it sound.
        trap = err instanceof WebAssembly.RuntimeError;
        if (trap) trapped.add(resvg);
        throw err;
      } finally {
        if (trap) {
          // (Never freed, not even later by the glue's finalizers: that would trap again.)
          image?.__destroy_into_raw?.();
          r?.__destroy_into_raw?.();
        } else {
          image?.free?.();
          r?.free?.();
        }
      }
    },
  };
}
