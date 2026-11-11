// book-cover-generator — generate SVG book covers from a title and an author.
//
//   import { generateCover } from 'book-cover-generator';
//   const svg = generateCover({ title: 'Dune', author: 'Frank Herbert', style: 'retro' });

import { createRng, hashString, isHex, luminance, escapeXml, stripInvalidXml } from './core.js';
import { palettes } from './palettes.js';
import { styleList } from './styles/index.js';

export { palettes } from './palettes.js';
export { FONTS, fitText, drawText, measureText, setTextMeasurer } from './text.js';
export * as svgUtils from './core.js';

const registry = new Map(styleList.map((s) => [s.id, s]));

/** Metadata for every available style: [{ id, name, description }] */
export function listStyles() {
  return [...registry.values()].map(({ id, name, description }) => ({ id, name, description }));
}

/** Ids of every available style. */
export const styles = listStyles().map((s) => s.id);

/**
 * Register a custom style. `style.render(ctx)` must return SVG markup (without
 * the outer <svg>). See README for the shape of `ctx`.
 * @param {import('./index.js').CoverStyle} style
 */
export function registerStyle(style) {
  if (!style || !style.id || typeof style.render !== 'function') {
    throw new TypeError('registerStyle: a style needs an `id` and a `render(ctx)` function');
  }
  registry.set(style.id, { name: style.id, description: '', ...style });
  if (!styles.includes(style.id)) styles.push(style.id);
}

/** A fresh random seed string, e.g. for a "randomize" button. */
export function randomSeed() {
  return Math.random().toString(36).slice(2, 8);
}

function resolveStyle(style, rng) {
  if (style == null || style === '' || style === 'random') return rng.pick([...registry.keys()]);
  if (!registry.has(style)) {
    throw new Error(`Unknown style "${style}". Available: ${[...registry.keys()].join(', ')}`);
  }
  return style;
}

/** @param {any} p */
function normalizePalette(p) {
  const given = Array.isArray(p.accents) ? p.accents : [];
  if (!isHex(p.bg) || !isHex(p.ink) || !given.length || !given.every(isHex)) {
    throw new Error('A custom palette needs hex colours (#rgb or #rrggbb): { bg, ink, accents: [hex, ...] }');
  }
  /** @type {string[]} */
  const accents = given.map((/** @type {string} */ c) => c.trim());
  const count = accents.length;
  while (accents.length < 3) accents.push(accents[accents.length % count]);
  const bg = p.bg.trim();
  const ink = p.ink.trim();
  const dark = p.dark ?? luminance(bg) < luminance(ink);
  return { id: p.id || 'custom', name: p.name || 'Custom', bg, ink, accents, dark };
}

function resolvePalette(palette, rng, style) {
  if (palette && typeof palette === 'object') return normalizePalette(palette);
  if (palette == null || palette === '' || palette === 'random' || palette === 'auto') {
    let pool = palettes;
    if (style.prefer === 'dark') pool = palettes.filter((p) => p.dark);
    if (style.prefer === 'light') pool = palettes.filter((p) => !p.dark);
    return normalizePalette(rng.pick(pool));
  }
  const found = palettes.find((p) => p.id === palette);
  if (!found) throw new Error(`Unknown palette "${palette}". Available: ${palettes.map((p) => p.id).join(', ')}`);
  return normalizePalette(found);
}

/** Collapse control characters and whitespace; drop anything illegal in XML. */
function cleanText(value) {
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  return stripInvalidXml(String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {string} name
 */
function dimension(value, fallback, name) {
  if (value == null || value === '') {
    if (fallback > 10000) {
      throw new RangeError(
        `${name} defaults to ${Math.round(fallback)} here, which is over 10000; pass ${name} explicitly`,
      );
    }
    return Math.round(fallback);
  }
  const v = Number(value);
  if (!Number.isFinite(v) || v < 50 || v > 10000) {
    throw new RangeError(`${name} must be a number from 50 to 10000, got ${String(value)}`);
  }
  return Math.round(v);
}

/**
 * Generate a cover and return it together with the resolved choices.
 *
 * @param {import('./index.js').CoverOptions} [options]
 * @returns {import('./index.js').Cover}
 */
export function createCover(options = {}) {
  const title = cleanText(options.title) || 'Untitled';
  const author = cleanText(options.author);
  const W = dimension(options.width, 600, 'width');
  const H = dimension(options.height, W * 1.5, 'height');
  if (W / H > 3 || H / W > 3) {
    throw new RangeError(`The aspect ratio must be between 1:3 and 3:1, got ${W}×${H}`);
  }
  const seed = options.seed == null || options.seed === '' ? `${title}␟${author}` : String(options.seed);

  const styleId = resolveStyle(options.style, createRng(`${seed}|style`));
  const style = registry.get(styleId);
  if (!style) throw new Error(`Unknown style "${styleId}"`);
  const palette = resolvePalette(options.palette, createRng(`${seed}|palette`), style);
  const [paper, night] =
    luminance(palette.bg) >= luminance(palette.ink) ? [palette.bg, palette.ink] : [palette.ink, palette.bg];

  const uid = 'bc' + hashString(JSON.stringify([title, author, seed, styleId, palette, W, H])).toString(36);
  const short = Math.min(W, H);
  /** @type {import('./index.js').StyleContext} */
  const ctx = {
    title,
    author,
    W,
    H,
    S: short,
    u: short / 600,
    m: short * 0.07,
    rng: createRng(`${seed}|${styleId}`),
    p: { ...palette, paper, night },
    id: (name) => `${uid}-${name}`,
  };

  const body = style.render(ctx);
  const label = escapeXml(author ? `${title} by ${author}` : title);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">` +
    `<title>${label}</title>${body}</svg>`;
  return { svg, style: styleId, palette: palette.id, seed, width: W, height: H };
}

/**
 * Generate a cover and return the SVG markup string.
 * @param {import('./index.js').CoverOptions} [options]
 */
export function generateCover(options = {}) {
  return createCover(options).svg;
}

export default generateCover;
