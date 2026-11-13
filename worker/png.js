// Covers as PNG, in the Worker: resvg (compiled to WebAssembly) draws the SVG with the open fonts
// in public/fonts, and the cover is laid out with those fonts' own widths, so text fits as drawn.
// The WebAssembly module and the font files are passed in: the Worker imports and fetches them,
// Node (tests, the dev server) reads them from disk.
import { setTextMeasurer } from '../src/text.js';
import { FONT_FILES, GENERIC, fontSet, readFont } from './fonts.js';

/** The most pixels a PNG may have: as many as a phone's canvas, and kind to the Worker's memory. */
export const MAX_PIXELS = 16_777_216;

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

/** resvg's WebAssembly, started once per resvg (it refuses a second start). @type {WeakMap<object, Promise<void>>} */
const started = new WeakMap();

/**
 * resvg, ready to draw with these fonts.
 * @param {{ initWasm(module: WebAssembly.Module | BufferSource): Promise<void>, Resvg: any }} resvg
 * @param {WebAssembly.Module | BufferSource} wasm
 * @param {(file: string) => Promise<Uint8Array>} fontFile  a file of public/fonts, by name
 */
export async function pngEngine(resvg, wasm, fontFile) {
  let start = started.get(resvg);
  if (!start) {
    start = resvg.initWasm(wasm);
    started.set(resvg, start);
    start.catch(() => started.delete(resvg));
  }
  await start;
  const buffers = await Promise.all(FONT_FILES.map(fontFile));
  const fonts = fontSet(buffers.map(readFont));
  return {
    fonts,
    /**
     * Run `draw` (which makes a cover) with text measured in the fonts the PNG is drawn with.
     * @template T @param {() => T} draw @returns {T}
     */
    laidOut(draw) {
      setTextMeasurer(fonts.measure);
      try {
        return draw();
      } finally {
        setTextMeasurer(null);
      }
    },
    /** Whether the fonts draw all of this SVG's text (else it would show empty boxes). @param {string} svg */
    draws: (svg) => fonts.covers(drawnText(svg)),
    /**
     * The SVG as a PNG, `scale` times its size.
     * @param {string} svg @param {number} [scale]
     * @returns {Uint8Array}
     */
    render(svg, scale = 1) {
      // Each font-family list named by the one family it is measured in: resvg's own choice from
      // a list can differ (it skips a condensed face that isn't first), and then text won't fit.
      const named = svg.replace(
        /font-family="([^"]*)"/g,
        (_, stack) => `font-family="${fonts.familyOf(unescape(stack)).replace(/[<>&"']/g, '')}"`,
      );
      const r = new resvg.Resvg(named, {
        fitTo: { mode: 'zoom', value: scale },
        font: {
          fontBuffers: buffers,
          loadSystemFonts: false,
          defaultFontFamily: GENERIC.serif,
          serifFamily: GENERIC.serif,
          sansSerifFamily: GENERIC['sans-serif'],
          monospaceFamily: GENERIC.monospace,
        },
      });
      try {
        const image = r.render();
        try {
          return image.asPng();
        } finally {
          image.free?.();
        }
      } finally {
        r.free?.();
      }
    },
  };
}
