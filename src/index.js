// book-cover-generator — generate SVG book covers from a title and an author.
//
//   import { generateCover } from 'book-cover-generator';
//   const svg = generateCover({ title: 'Dune', author: 'Frank Herbert', style: 'retro' });

import { createRng, hashString, isHex, luminance, escapeXml, stripInvalidXml, grain } from './core.js';
import { palettes } from './palettes.js';
import { BREAKING_SPACE, FONTS, LINE_BREAK, clipGraphemes, recordText } from './text.js';
import { drawBadge } from './badge.js';
import { idFor, fontEntries, reserved, STYLE_WORDS, PALETTE_WORDS } from './shared.js';
import { styleList, genreList, builtInGenres } from './styles/index.js';

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
  noteText,
  recordText,
} from './text.js';
export { titleBlock, authorFit, fitStack, drawStack, splitLead } from './type.js';
export { strongAccents, textColor, tintText, fitTitleWith, textPanel, TEXT_CONTRAST } from './styles/util.js';
export * as svgUtils from './core.js';
export { createMockup, mockupKinds } from './mockups.js';
export { parseBookList } from './books.js';

/** This version of the library (artwork for a seed can change between minor versions). */
export const version = '1.8.0';

/** The sizes a cover can have: each side `min` to `max` px, and neither more than `ratio` times the other. */
export const sizeLimits = Object.freeze({ min: 50, max: 10000, ratio: 3 });

/** Common cover shapes at 600 px wide, as the web app offers them: [width, height]. */
export const formats = Object.freeze({
  paperback: Object.freeze([600, 900]),
  ebook: Object.freeze([600, 960]),
  square: Object.freeze([600, 600]),
});

/** An id as registries take it: a string, not empty, without spaces at either end. @param {unknown} id */
const isId = (id) => typeof id === 'string' && id !== '' && id === id.trim();

/**
 * A style's genres, checked: a list of genre ids.
 * @param {string} id the style's id, for errors @param {unknown} genres
 * @returns {string[]}
 */
function genresOf(id, genres) {
  if (genres == null) return [];
  // (Ids or names, in any case, as everywhere else.)
  const ids = Array.isArray(genres) ? genres.map((g) => idFor(g, genreList)) : [undefined];
  if (ids.some((g) => g === undefined)) {
    throw new TypeError(
      `Style "${id}": genres must be a list of genres, by id or name (${genreList.map((g) => g.id).join(', ')})`,
    );
  }
  return [...new Set(/** @type {string[]} */ (ids))];
}

/** A name or value as people read it: 'bouquet' → 'Bouquet'. @param {string} id */
const labelFor = (id) => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * A style's variants (the choices it lets you pin), checked and in one shape: each with its
 * name, a label, and its values with theirs.
 * @param {string} id the style's id, for errors
 * @param {import('./index.js').CoverStyle['variants']} variants
 * @returns {import('./index.js').StyleVariant[]}
 */
function variantsOf(id, variants) {
  if (variants == null) return [];
  if (typeof variants !== 'object') throw new TypeError(`Style "${id}": variants must be an object`);
  return Object.entries(variants).map(([name, spec]) => {
    const values = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec.values : null;
    const entries = values && typeof values === 'object' ? Object.entries(values) : [];
    if (!isId(name) || !entries.length || !entries.every(([v, l]) => isId(v) && typeof l === 'string')) {
      throw new TypeError(
        `Style "${id}": variant "${name}" needs { values: { value: 'Label', … } } with at least one value`,
      );
    }
    return {
      name,
      label: typeof spec.label === 'string' ? spec.label : labelFor(name),
      values: entries.map(([value, label]) => ({ value, label: label || labelFor(value) })),
    };
  });
}

/**
 * A registry entry: the style's details with defaults filled in, and a render that calls
 * the style's own method on the style itself (so class styles keep `this` and private fields).
 * The caller's object is never changed.
 * @param {import('./index.js').CoverStyle} style
 * @param {readonly string[]} [genres] for a built-in style, the genres it suits
 */
const entryFor = (style, genres) => ({
  id: style.id,
  name: style.name ?? style.id,
  description: style.description ?? '',
  group: style.group ?? 'Custom',
  prefer: style.prefer,
  variants: variantsOf(style.id, style.variants),
  genres: genresOf(style.id, style.genres ?? genres),
  render: (/** @type {import('./index.js').StyleContext} */ ctx) => style.render(ctx),
});

/** Whether a style option leaves the choice to the seed. @param {unknown} v */
const unsetStyle = (v) => v == null || v === '' || reserved(v, STYLE_WORDS);
/** Whether a palette option leaves the choice to the seed. @param {unknown} v */
const unsetPalette = (v) => v == null || v === '' || reserved(v, PALETTE_WORDS);

/**
 * The variants pinned for a style: the given ones it has (others are ignored, so the same
 * options can go to any style), each checked against the values it offers.
 * @param {unknown} given @param {ReturnType<typeof entryFor>} style
 * @returns {Record<string, string>}
 */
function pinnedVariants(given, style, strict = true) {
  if (given == null) return {};
  if (typeof given !== 'object') throw new TypeError('variants must be an object such as { scene: "forest" }');
  // Names and values in any case.
  const byName = pinsByName(given);
  /** @type {Record<string, string>} */
  const pins = {};
  for (const variant of style.variants) {
    const value = byName.get(variant.name.toLowerCase());
    if (value === undefined) continue;
    const match = valueIn(variant, value);
    if (match) pins[variant.name] = match.value;
    // A style you name says when it lacks a value (listing its own); one picked at random takes
    // only the pins it can (two styles may name a variant alike).
    else if (strict) {
      const offered = variant.values.map((v) => v.value).join(', ');
      throw new RangeError(`Style "${style.id}" has no ${variant.name} "${value}". Available: ${offered}`);
    }
  }
  checkOffered(byName);
  return pins;
}

/**
 * Pins by lower-cased name, with values as strings (empty ones left out).
 * @param {object} given
 */
const pinsByName = (given) =>
  new Map(
    Object.entries(given)
      .filter(([, value]) => value != null && value !== '')
      .map(([name, value]) => [name.toLowerCase(), String(value)]),
  );

/**
 * A pinned value no style offers is a mistake, whatever the style. (A name no style has is ignored.)
 * @param {Map<string, string>} byName
 */
function checkOffered(byName) {
  for (const [name, value] of byName) {
    const variants = [...registry.values()].flatMap((s) => s.variants.filter((v) => v.name.toLowerCase() === name));
    if (variants.length && !variants.some((v) => valueIn(v, value))) {
      const offered = [...new Set(variants.flatMap((v) => v.values.map((x) => x.value)))].join(', ');
      throw new RangeError(`No style has ${name} "${value}". Available: ${offered}`);
    }
  }
}

/**
 * The value of `variant` that `value` names, in any case.
 * @param {{ values: { value: string }[] }} variant @param {string} value
 */
function valueIn(variant, value) {
  return (
    variant.values.find((v) => v.value === value) ??
    variant.values.find((v) => v.value.toLowerCase() === value.toLowerCase())
  );
}

const builtInStyles = new Map(styleList.map((s) => [s.id, entryFor(s, builtInGenres[s.id])]));

/** The genres styles can suit: `[{ id, name }]`, as `createCover({ genre })` and `listStyles()` name them. */
export const genres = Object.freeze(genreList.map((g) => Object.freeze({ ...g })));
const registry = new Map(builtInStyles);
/** The palettes, as this module changes them (registering adds to the list everyone sees). */
const paletteList = /** @type {import('./palettes.js').Palette[]} */ (/** @type {unknown} */ (palettes));
/** @type {Map<string, import('./palettes.js').Palette>} */
const builtInPalettes = new Map(paletteList.map((p) => [p.id, p]));

/**
 * The id of the style that `name` names, by id or name in any case ('Art Deco', 'artdeco'), or
 * undefined if none does.
 * @param {string} name
 */
export function styleIdFor(name) {
  return idFor(name, registry.values());
}

/** Metadata for every available style: [{ id, name, description, group }] */
export function listStyles() {
  return [...registry.values()].map(({ id, name, description, group, variants, genres: suits }) => ({
    id,
    name,
    description,
    group,
    variants: variants.map((v) => ({ ...v, values: v.values.map((x) => ({ ...x })) })),
    genres: [...suits],
  }));
}

/** Ids of every available style. */
export const styles = listStyles().map((s) => s.id);

/**
 * Register a custom style. `style.render(ctx)` must return SVG markup (without
 * the outer <svg>). See README for the shape of `ctx`. Replacing a built-in style
 * takes `{ replace: true }`.
 * @param {import('./index.js').CoverStyle} style
 * @param {{ replace?: boolean }} [options]
 */
export function registerStyle(style, { replace = false } = {}) {
  if (!style || !isId(style.id) || typeof style.render !== 'function') {
    throw new TypeError(
      'registerStyle: a style needs an `id` (a string without spaces at either end) and a `render(ctx)` function',
    );
  }
  if (reserved(style.id, STYLE_WORDS)) throw new TypeError('registerStyle: "random" is not a style id, it picks one');
  if (style.name != null && typeof style.name !== 'string') throw new TypeError('registerStyle: name must be a string');
  if (builtInStyles.has(style.id) && !replace) {
    throw new Error(`registerStyle: "${style.id}" is a built-in style; pass { replace: true } to replace it`);
  }
  // (A built-in style's replacement suits its genres, unless it names its own.)
  registry.set(style.id, entryFor(style, builtInStyles.get(style.id)?.genres));
  if (!styles.includes(style.id)) styles.push(style.id);
}

/**
 * Remove a registered style, or bring back the built-in style one replaced. Whether anything changed.
 * @param {string} id
 */
export function unregisterStyle(id) {
  const original = builtInStyles.get(id);
  if (original) {
    if (registry.get(id) === original) return false;
    registry.set(id, original);
    return true;
  }
  if (!registry.delete(id)) return false;
  const at = styles.indexOf(id);
  if (at !== -1) styles.splice(at, 1);
  return true;
}

/** Palette ids that mean something else. */

/**
 * Register a palette, so `palette: id` uses it (and `'random'` can pick it). Replacing a
 * built-in palette takes `{ replace: true }`.
 * @param {import('./index.js').CustomPalette & { id: string }} palette
 * @param {{ replace?: boolean }} [options]
 */
export function registerPalette(palette, { replace = false } = {}) {
  if (!palette || !isId(palette.id)) {
    throw new TypeError('registerPalette: a palette needs an `id` (a string without spaces at either end)');
  }
  const id = palette.id;
  // ("custom" too: the app's links write your own colours as custom-….)
  if (reserved(id, [...PALETTE_WORDS, 'custom'])) throw new TypeError(`registerPalette: "${id}" is reserved`);
  if (builtInPalettes.has(id) && !replace) {
    throw new Error(`registerPalette: "${id}" is a built-in palette; pass { replace: true } to replace it`);
  }
  const { bg, ink, dark } = normalizePalette(palette);
  if (palette.name != null && typeof palette.name !== 'string')
    throw new TypeError('registerPalette: name must be a string');
  // Named after its id when it has no name, as a style is.
  const name = typeof palette.name === 'string' && palette.name.trim() ? palette.name : id;
  const entry = { id, name, bg, ink, accents: palette.accents.map((c) => c.trim()), dark };
  const at = paletteList.findIndex((p) => p.id === id);
  if (at === -1) paletteList.push(entry);
  else paletteList[at] = entry;
}

/**
 * Remove a registered palette, or bring back the built-in palette one replaced. Whether anything changed.
 * @param {string} id
 */
export function unregisterPalette(id) {
  const at = paletteList.findIndex((p) => p.id === id);
  if (at === -1) return false;
  const original = builtInPalettes.get(id);
  if (paletteList[at] === original) return false;
  if (original) paletteList[at] = original;
  else paletteList.splice(at, 1);
  return true;
}

/** A fresh random seed string, e.g. for a "randomize" button. */
export function randomSeed() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * @param {string | null | undefined} style @param {import('./core.js').Rng} rng
 * @param {unknown} [genre] with a random style, pick one that suits this genre
 * @returns {string}
 */
function resolveStyle(style, rng, genre) {
  // (Checked whether or not a style is given, so a typo is caught either way.)
  const genreId = genre == null || genre === '' ? undefined : idFor(genre, genreList);
  if (genre != null && genre !== '' && genreId === undefined) {
    throw new RangeError(`Unknown genre "${String(genre)}". Available: ${genreList.map((g) => g.id).join(', ')}`);
  }
  if (unsetStyle(style)) {
    if (!genreId) return rng.pick([...registry.keys()]);
    const suited = [...registry.values()].filter((s) => s.genres.includes(genreId));
    if (!suited.length) throw new RangeError(`No style suits the genre "${String(genre)}"`);
    return rng.pick(suited.map((s) => s.id));
  }
  const id = idFor(style, registry.values());
  if (!id) throw new Error(`Unknown style "${style}". Available: ${[...registry.keys()].join(', ')}`);
  return id;
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
  if (unsetPalette(palette)) {
    let pool = palettes;
    if (style.prefer === 'dark') pool = palettes.filter((p) => p.dark);
    if (style.prefer === 'light') pool = palettes.filter((p) => !p.dark);
    return normalizePalette(rng.pick(pool));
  }
  const id = idFor(palette, palettes);
  const found = palettes.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown palette "${palette}". Available: ${palettes.map((p) => p.id).join(', ')}`);
  return normalizePalette(found);
}

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * Collapse control characters and whitespace, drop anything illegal in XML and
 * cap the length (so huge inputs can't make layout slow).
 * @param {unknown} value
 * @param {number} max  maximum length in characters
 * @param {{ breaks?: boolean }} [options]
 */
function cleanText(value, max, { breaks = false } = {}) {
  // With `breaks`, line breaks stay (as "\n", one between lines): the title's lines break there.
  const text = String(value ?? '')
    .split(breaks ? LINE_BREAK : /(?!)/)
    .map((line) => stripInvalidXml(line.replace(CONTROL, ' ')).replace(BREAKING_SPACE, ' ').trim())
    .filter(Boolean)
    .join('\n');
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
    if (fallback > sizeLimits.max) {
      throw new RangeError(
        `${name} defaults to ${Math.round(fallback)} here, which is over ${sizeLimits.max}; pass ${name} explicitly`,
      );
    }
    return Math.round(fallback);
  }
  const v = Number(value);
  const { min, max } = sizeLimits;
  if (!Number.isFinite(v) || v < min || v > max) {
    throw new RangeError(
      `${name} must be a number from ${min} to ${max}, got ${typeof value === 'string' ? JSON.stringify(value) : String(value)}`,
    );
  }
  return Math.round(v);
}

/** Ways to set a title's letters: in capitals, or as typed. */
const TITLE_CASES = ['upper', 'normal'];

/**
 * The title's font and case, if the options set them (else each style's own).
 * @param {import('./index.js').CoverOptions} options
 * @returns {{ font: import('./text.js').FontSpec | null, fontId: string, titleCase: 'upper' | 'normal' | null }}
 */
function typeOptions(options) {
  const font = /** @type {unknown} */ (options.font);
  const titleCase = /** @type {unknown} */ (options.titleCase);
  const fontGiven = font != null && font !== '';
  const fontId = fontGiven ? idFor(font, fontEntries()) : undefined;
  if (fontGiven && fontId === undefined) {
    throw new RangeError(`Unknown font "${String(font)}". Available: ${Object.keys(FONTS).join(', ')}`);
  }
  const caseId = typeof titleCase === 'string' ? titleCase.toLowerCase() : titleCase;
  if (caseId != null && caseId !== '' && !TITLE_CASES.includes(/** @type {string} */ (caseId))) {
    throw new RangeError(`titleCase must be 'upper' or 'normal', got ${JSON.stringify(titleCase)}`);
  }
  return {
    font: fontId ? FONTS[/** @type {keyof typeof FONTS} */ (fontId)] : null,
    fontId: fontId ?? '',
    titleCase: caseId ? /** @type {'upper' | 'normal'} */ (caseId) : null,
  };
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
 * @param {Pick<import('./index.js').CoverOptions, 'title' | 'author' | 'seed' | 'style' | 'genre'>} options
 */
function resolveText(options) {
  const title = cleanText(options.title, 300, { breaks: true }) || 'Untitled';
  const author = cleanText(options.author, 200);
  // (A line break in the title doesn't change the seed it makes: same words, same artwork.)
  const seed =
    options.seed == null || options.seed === '' ? `${title.replace(/\n/g, ' ')}␟${author}` : String(options.seed);
  return { title, author, seed, styleId: resolveStyle(options.style, createRng(`${seed}|style`), options.genre) };
}

/**
 * The style id `createCover` would use for these options (resolving `'random'` or a missing
 * style from the seed), without drawing the cover.
 * @param {Pick<import('./index.js').CoverOptions, 'title' | 'author' | 'seed' | 'style' | 'genre'>} [options]
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
  const series = cleanText(options.series, 120);
  const credit = cleanText(options.credit, 120);
  const badge = cleanText(options.badge, 60);
  const W = dimension(options.width, 600, 'width');
  const H = dimension(options.height, W * 1.5, 'height');
  const lang = resolveLang(options.lang, `${title} ${subtitle} ${author} ${series} ${credit} ${badge}`);
  const { ratio } = sizeLimits;
  if (W / H > ratio || H / W > ratio) {
    throw new RangeError(`The aspect ratio must be between 1:${ratio} and ${ratio}:1, got ${W}×${H}`);
  }
  const style = /** @type {ReturnType<typeof entryFor>} */ (registry.get(styleId)); // resolveStyle checked it
  const palette = resolvePalette(options.palette, createRng(`${seed}|palette`), style);
  const [paper, night] =
    luminance(palette.bg) >= luminance(palette.ink) ? [palette.bg, palette.ink] : [palette.ink, palette.bg];

  const pins = pinnedVariants(options.variants, style, !unsetStyle(options.style));
  const titleType = typeOptions(options);
  const uid =
    'bc' +
    hashString(
      // (Pins only when there are some, so ids of covers without them stay as they were.)
      JSON.stringify([
        title,
        author,
        subtitle,
        seed,
        styleId,
        palette,
        W,
        H,
        !!options.texture,
        ...(Object.keys(pins).length ? [pins] : []),
        ...(titleType.font || titleType.titleCase ? [titleType.fontId, titleType.titleCase ?? ''] : []),
        ...(series || credit ? [series, credit] : []),
        ...(badge ? [badge] : []),
      ]),
    ).toString(36);
  /** The variants the style chose (or was given). @type {Record<string, string>} */
  const chosen = {};
  const rng = createRng(`${seed}|${styleId}`);
  const short = Math.min(W, H);
  /** @type {import('./index.js').StyleContext} */
  const ctx = {
    title,
    author,
    // A credit ("Translated by …") is a line of its own under the subtitle, so every style sets it.
    subtitle: [subtitle, credit].filter(Boolean).join('\n'),
    series,
    W,
    H,
    S: short,
    u: short / 600,
    m: short * 0.07,
    rng,
    p: { ...palette, paper, night },
    id: (name) => `${uid}-${name}`,
    titleFont: titleType.font,
    titleCase: titleType.titleCase,
    // The seed's pick is always drawn, so pinning a variant changes nothing drawn before it.
    choose: (name, values) => {
      const picked = rng.pick(values);
      const pin = pins[name];
      const value = pin !== undefined && values.includes(/** @type {any} */ (pin)) ? /** @type {any} */ (pin) : picked;
      chosen[name] = value;
      return value;
    },
  };

  // The text the style draws is recorded, so a badge can go where there is none.
  const { result: drawn, boxes } = recordText(() => style.render(ctx));
  let body = drawn;
  if (badge) body += drawBadge(ctx, badge, boxes);
  if (options.texture) {
    // Film grain over the whole cover. Styles paint their own backgrounds, so lay
    // dark and light specks (from different noise) to show on any colour.
    const dark = grain(ctx, { opacity: 0.1, id: 'texture-dark', seed: 3 });
    const light = grain(ctx, { opacity: 0.08, light: true, id: 'texture-light', seed: 11 });
    body += `<defs>${dark.defs}${light.defs}</defs>${dark.layer}${light.layer}`;
  }
  const label = escapeXml(
    `${title.replace(/\n/g, ' ')}${subtitle ? `: ${subtitle}` : ''}${author ? ` by ${author}` : ''}` +
      `${series ? ` (${series})` : ''}${credit ? `. ${credit}` : ''}${badge ? `. ${badge}` : ''}`,
  );
  // (Both spellings: `lang` is SVG 2's, `xml:lang` what older renderers read.)
  const langAttrs = lang ? ` lang="${lang}" xml:lang="${lang}"` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"${langAttrs} role="img" aria-label="${label}">` +
    `<title>${label}</title>${body}</svg>`;
  const colors = { bg: palette.bg, ink: palette.ink, accents: [...palette.accents], dark: palette.dark };
  return {
    svg,
    body,
    style: styleId,
    palette: palette.id,
    colors,
    seed,
    width: W,
    height: H,
    lang,
    variants: chosen,
    title,
    author,
  };
}

/**
 * Generate a cover and return the SVG markup string.
 * @param {import('./index.js').CoverOptions} [options]
 */
export function generateCover(options = {}) {
  return createCover(options).svg;
}

export default generateCover;

/**
 * Cover options for a book from a list (see `parseBookList`) over `defaults`, the options every
 * book shares. The book's own values win, and a size it gives replaces both sides of the
 * defaults'. A book that names another style than the defaults' drops their pinned variants (with
 * no shared style, it keeps the ones its own style offers); one that names a genre the defaults'
 * style doesn't suit gets a style that suits it instead. A shared style that doesn't exist throws.
 * @param {import('./index.js').CoverOptions} listed the book
 * @param {import('./index.js').CoverOptions} [defaults]
 * @returns {import('./index.js').CoverOptions}
 */
export function optionsForBook(listed, defaults = {}) {
  // A key a book leaves undefined (an empty cell) is a key it doesn't set.
  const book = /** @type {import('./index.js').CoverOptions} */ (
    Object.fromEntries(Object.entries(listed).filter(([, value]) => value !== undefined))
  );
  // The styles as ids (undefined: picked by the seed, or for the book's, not one that exists,
  // which createCover reports). A shared style that doesn't exist is reported for every book.
  const sharedGiven = !unsetStyle(defaults.style);
  const shared = sharedGiven ? idFor(defaults.style, registry.values()) : undefined;
  if (sharedGiven && shared === undefined) {
    throw new Error(`Unknown style "${String(defaults.style)}". Available: ${[...registry.keys()].join(', ')}`);
  }
  // A shared pin no style offers is reported for every book, whichever style each one gets.
  if (defaults.variants != null && typeof defaults.variants === 'object') checkOffered(pinsByName(defaults.variants));
  const own = unsetStyle(book.style) ? undefined : idFor(book.style, registry.values());
  const genre = idFor(book.genre, genreList);
  const sharedEntry = shared === undefined ? undefined : registry.get(shared);
  const ownGenre =
    Boolean(book.genre) && !book.style && sharedEntry !== undefined && !sharedEntry.genres.includes(genre ?? '');
  /** The shared pins a book's own style takes. @type {import('./index.js').CoverOptions['variants']} */
  let variants = defaults.variants;
  if (book.style && own !== shared) {
    const ownEntry = own === undefined ? undefined : registry.get(own);
    // Pins made for the shared style don't follow a book to another one; with no shared style
    // they're for any, and the book's style takes the ones it offers.
    // (As a style picked at random takes them: a value no style offers still throws.)
    variants = shared !== undefined ? {} : ownEntry ? pinnedVariants(variants, ownEntry, false) : variants;
  }
  return {
    ...defaults,
    ...(book.width !== undefined || book.height !== undefined ? { width: undefined, height: undefined } : {}),
    ...(variants !== defaults.variants ? { variants } : {}),
    ...(ownGenre ? { style: 'random', variants: {} } : {}),
    ...book,
  };
}
