// book-cover-generator — generate SVG book covers from a title and an author.
//
//   import { generateCover } from 'book-cover-generator';
//   const svg = generateCover({ title: 'Dune', author: 'Frank Herbert', style: 'retro' });

import { createRng, hashString, isHex, luminance, escapeXml, stripInvalidXml, grain } from './core.js';
import { palettes } from './palettes.js';
import { BREAKING_SPACE, clipGraphemes } from './text.js';
import { styleList } from './styles/index.js';

export { palettes } from './palettes.js';
export {
  FONTS,
  fitText,
  drawText,
  measureText,
  setTextMeasurer,
  baselineOf,
  textBottom,
  textGroupAttrs,
  markExtent,
} from './text.js';
export { titleBlock, authorFit, fitStack, drawStack, splitLead } from './type.js';
export { strongAccents, textColor, tintText, fitTitleWith, textPanel, TEXT_CONTRAST } from './styles/util.js';
export * as svgUtils from './core.js';

/**
 * A registry entry: the style's details with defaults filled in, and a render that calls
 * the style's own method on the style itself (so class styles keep `this` and private fields).
 * The caller's object is never changed.
 * @param {import('./index.js').CoverStyle} style
 */
const entryFor = (style) => ({
  id: style.id,
  name: style.name ?? style.id,
  description: style.description ?? '',
  group: style.group ?? 'Custom',
  prefer: style.prefer,
  render: (/** @type {import('./index.js').StyleContext} */ ctx) => style.render(ctx),
});

const registry = new Map(styleList.map((s) => [s.id, entryFor(s)]));

/** Metadata for every available style: [{ id, name, description, group }] */
export function listStyles() {
  return [...registry.values()].map(({ id, name, description, group }) => ({ id, name, description, group }));
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
  registry.set(style.id, entryFor(style));
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

/**
 * Collapse control characters and whitespace, drop anything illegal in XML and
 * cap the length (so huge inputs can't make layout slow).
 * @param {unknown} value
 * @param {number} max  maximum length in characters
 */
function cleanText(value, max) {
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  const text = stripInvalidXml(String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' '))
    .replace(BREAKING_SPACE, ' ')
    .trim();
  // Cut between visible characters (segmenting lazily), so an emoji or accented letter is never split.
  return text.length > max ? clipGraphemes(text, max).trimEnd() : text;
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

/** A BCP 47 language tag, loosely: `ja`, `zh-Hant`, `pt-BR`, `sr-Latn-RS`. */
const LANG_TAG = /^[a-z]{2,3}(?:-[a-z\d]{1,8})*$/i;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;

/**
 * The cover's language: the one given, else Japanese for text with kana and Korean for text
 * with Hangul (so shared Chinese characters get those countries' glyphs), else none.
 * @param {unknown} lang @param {string} text
 */
function resolveLang(lang, text) {
  if (lang != null && lang !== '') {
    if (typeof lang !== 'string' || !LANG_TAG.test(lang)) {
      throw new RangeError(`lang must be a language tag such as "ja" or "zh-Hant", got ${JSON.stringify(lang)}`);
    }
    return lang;
  }
  if (KANA.test(text)) return 'ja';
  if (HANGUL.test(text)) return 'ko';
  return '';
}

/**
 * The cleaned title and author, the seed, and the style id a cover with these options uses.
 * @param {Pick<import('./index.js').CoverOptions, 'title' | 'author' | 'seed' | 'style'>} options
 */
function resolveText(options) {
  const title = cleanText(options.title, 300) || 'Untitled';
  const author = cleanText(options.author, 200);
  const seed = options.seed == null || options.seed === '' ? `${title}␟${author}` : String(options.seed);
  return { title, author, seed, styleId: resolveStyle(options.style, createRng(`${seed}|style`)) };
}

/**
 * The style id `createCover` would use for these options (resolving `'random'` or a missing
 * style from the seed), without drawing the cover.
 * @param {Pick<import('./index.js').CoverOptions, 'title' | 'author' | 'seed' | 'style'>} [options]
 */
export function pickStyle(options = {}) {
  return resolveText(options).styleId;
}

/**
 * Generate a cover and return it together with the resolved choices.
 *
 * @param {import('./index.js').CoverOptions} [options]
 * @returns {import('./index.js').Cover}
 */
export function createCover(options = {}) {
  const { title, author, seed, styleId } = resolveText(options);
  const subtitle = cleanText(options.subtitle, 300);
  const W = dimension(options.width, 600, 'width');
  const H = dimension(options.height, W * 1.5, 'height');
  const lang = resolveLang(options.lang, `${title} ${subtitle} ${author}`);
  if (W / H > 3 || H / W > 3) {
    throw new RangeError(`The aspect ratio must be between 1:3 and 3:1, got ${W}×${H}`);
  }
  const style = /** @type {ReturnType<typeof entryFor>} */ (registry.get(styleId)); // resolveStyle checked it
  const palette = resolvePalette(options.palette, createRng(`${seed}|palette`), style);
  const [paper, night] =
    luminance(palette.bg) >= luminance(palette.ink) ? [palette.bg, palette.ink] : [palette.ink, palette.bg];

  const uid =
    'bc' +
    hashString(JSON.stringify([title, author, subtitle, seed, styleId, palette, W, H, !!options.texture])).toString(36);
  const short = Math.min(W, H);
  /** @type {import('./index.js').StyleContext} */
  const ctx = {
    title,
    author,
    subtitle,
    W,
    H,
    S: short,
    u: short / 600,
    m: short * 0.07,
    rng: createRng(`${seed}|${styleId}`),
    p: { ...palette, paper, night },
    id: (name) => `${uid}-${name}`,
  };

  let body = style.render(ctx);
  if (options.texture) {
    // Film grain over the whole cover. Styles paint their own backgrounds, so lay
    // dark and light specks (from different noise) to show on any colour.
    const dark = grain(ctx, { opacity: 0.1, id: 'texture-dark', seed: 3 });
    const light = grain(ctx, { opacity: 0.08, light: true, id: 'texture-light', seed: 11 });
    body += `<defs>${dark.defs}${light.defs}</defs>${dark.layer}${light.layer}`;
  }
  const label = escapeXml(`${title}${subtitle ? `: ${subtitle}` : ''}${author ? ` by ${author}` : ''}`);
  // (Both spellings: `lang` is SVG 2's, `xml:lang` what older renderers read.)
  const langAttrs = lang ? ` lang="${lang}" xml:lang="${lang}"` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"${langAttrs} role="img" aria-label="${label}">` +
    `<title>${label}</title>${body}</svg>`;
  return { svg, body, style: styleId, palette: palette.id, seed, width: W, height: H, lang };
}

/**
 * Generate a cover and return the SVG markup string.
 * @param {import('./index.js').CoverOptions} [options]
 */
export function generateCover(options = {}) {
  return createCover(options).svg;
}

export default generateCover;
