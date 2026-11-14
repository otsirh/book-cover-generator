// What the app, the CLI and the HTTP API share, so they read links and name files alike. (Not
// part of the library's API: the package exports only src/index.js and src/browser.js.)

import { FONTS, clipGraphemes } from './text.js';

/**
 * A name as people may type it: without accents, case, apostrophes, punctuation or "and"
 * ("Children’s" and "childrens"; "Thriller & crime", "thriller and crime" and "Thriller crime").
 * @param {string} name
 */
export const fold = (name) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && word !== 'and')
    .join(' ');

/** The fonts of FONTS (as it is now: fonts may be added or renamed) by id and name, as idFor reads them. */
export const fontEntries = () => Object.entries(FONTS).map(([id, f]) => ({ id, name: f.name }));

/**
 * The id that `given` names among `entries`: an id as it is, else an id or a name in any case and
 * spacing, as a list or a link may type it ("Art Deco", "MINT", "Non-fiction"). Undefined if none.
 * @param {unknown} given @param {Iterable<{ id: string, name?: unknown }>} entries
 * @returns {string | undefined}
 */
export function idFor(given, entries) {
  if (typeof given !== 'string') return undefined;
  const list = Array.isArray(entries) ? entries : [...entries];
  // An id or a name as written, or as written but for case, wins over one only spelled alike
  // ("Art Deco" and "art deco" are the style named so, even beside an id "art-deco").
  const lower = given.toLowerCase();
  /** @param {unknown} name */
  const named = (name) => typeof name === 'string' && name.toLowerCase() === lower;
  const exact =
    list.find((e) => e.id === given) ??
    list.find((e) => e.name === given) ??
    list.find((e) => e.id.toLowerCase() === lower) ??
    list.find((e) => named(e.name));
  if (exact) return exact.id;
  const key = fold(given);
  if (!key) return undefined;
  return (
    list.find((e) => fold(e.id) === key)?.id ?? list.find((e) => typeof e.name === 'string' && fold(e.name) === key)?.id
  );
}

/**
 * The words that leave a choice to the seed, in any case and with spaces around: 'random' for a
 * style, and 'random' or 'auto' for a palette. Registering refuses them as ids, so every id stays
 * one that can be chosen.
 * @param {unknown} v @param {readonly string[]} words
 */
export const reserved = (v, words) => typeof v === 'string' && words.includes(v.trim().toLowerCase());
export const STYLE_WORDS = ['random'];
export const PALETTE_WORDS = ['random', 'auto'];

/** A size of your own in a link: width x height in px. */
export const CUSTOM_SIZE = /^([1-9]\d{1,4})x([1-9]\d{1,4})$/;
/** Your own colours in a link: background, text and one to three accents. */
export const CUSTOM_PALETTE = /^custom(?:-[0-9a-f]{6}){3,5}$/;
/**
 * A family of styles as the site's pages name it: the library's Genre family (its styles drawn
 * for one genre each) is "Themed", where Genre is the menu that filters the styles.
 * @param {string} group
 */
export const familyName = (group) => (group === 'Genre' ? 'Themed' : group);

/** A BCP 47 language tag, loosely: `ja`, `zh-Hant`, `pt-BR`, `sr-Latn-RS`. */
export const LANG_TAG = /^[a-z]{2,3}(?:-[a-z\d]{1,8})*$/i;
/** Pinned variants in a link: name.value pairs joined by '-'. */
export const VARIANT = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*\.[a-z][a-z0-9]*)*$/;

/** The colours of a link's own palette (background, text, accents), or null for a palette id. @param {string} palette */
export function customColors(palette) {
  return CUSTOM_PALETTE.test(palette)
    ? palette
        .slice('custom-'.length)
        .split('-')
        .map((h) => `#${h}`)
    : null;
}

/**
 * A file name for a title: lower case, accents dropped from Latin letters, anything else that
 * isn't a letter or a digit as "-", and at most 60 characters.
 * @param {string} title
 */
export function slug(title) {
  const words = title
    // Drop accents from Latin letters only (é → e); other marks (й, ά, Japanese voicing marks,
    // Indic vowel signs) are part of the letter and come back together under NFC.
    .normalize('NFKD')
    .replace(/(\p{Script=Latin})[̀-ͯ]+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+/, '');
  // Cut between whole characters first, so the trim also catches a separator at the cut.
  return clipGraphemes(words, 60).replace(/-+$/, '') || 'cover';
}

/** The attributes of <book-cover> that draw the cover, and the link parameter each is (src/element.js; the gallery sets them). */
export const COVER_ATTRIBUTES = /** @type {const} */ ({
  'cover-title': 'title',
  author: 'author',
  subtitle: 'subtitle',
  series: 'series',
  credit: 'credit',
  badge: 'badge',
  'cover-style': 'style',
  genre: 'genre',
  palette: 'palette',
  seed: 'seed',
  format: 'format',
  font: 'font',
  case: 'case',
  variant: 'variant',
  lang: 'lang',
});

/** Byte arrays joined into one. @param {readonly Uint8Array[]} parts */
export function joinBytes(parts) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/**
 * The largest scale, at most `wanted`, that draws a w × h picture within `most` pixels, its sides
 * counted as drawn (`round`: Math.round as a canvas rounds them, Math.ceil as resvg does), in steps
 * of `step` when given (0.01: a scale people read). Rounding a side up can take a scale that fits
 * on paper just over the limit; this one never is.
 * @param {number} w @param {number} h @param {number} most @param {number} wanted
 * @param {{ round?: (v: number) => number, step?: number }} [how]
 */
export function scaleWithin(w, h, most, wanted, { round = Math.round, step = 0 } = {}) {
  const fits = (/** @type {number} */ s) => round(w * s) * round(h * s) <= most;
  const best = Math.min(wanted, Math.sqrt(most / (w * h)));
  if (step) {
    // In whole steps, each the very number it says (2.09, not 2.0899999999999999), and checked as it is.
    // (As many places as the step has: 0.25 has two, 2.5e-7 eight.)
    const [, digits = '', exp = '0'] = /^\d+(?:\.(\d+))?(?:e-(\d+))?$/.exec(String(step)) ?? [];
    const places = Math.min(20, digits.length + Number(exp));
    const at = (/** @type {number} */ k) => Number((k * step).toFixed(places));
    let k = Math.floor(best / step + 1e-9);
    while (k > 0 && !fits(at(k))) k--;
    return Math.max(at(k), 0);
  }
  let s = best;
  while (s > 0 && !fits(s)) s *= 0.999;
  return Math.max(s, 0);
}

/**
 * Whether a query's switch (download, preview) is on: given, and not empty, 0 or false, in any case.
 * @param {string | null | undefined} value the last value given, if any
 */
export const switchedOn = (value) => value != null && !/^(0|false)?$/i.test(value.trim());

/**
 * A number written in decimal (600, 1.5, 1e3), or NaN: not hex, binary or octal (0x258 isn't 600).
 * @param {string} raw
 */
export const decimal = (raw) => (/^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(raw) ? Number(raw) : NaN);

/**
 * A size as the library reads one: a number as it is, text in decimal (0x258 isn't 600).
 * @param {unknown} value
 */
export const sizeValue = (value) => (typeof value === 'string' ? decimal(value) : Number(value));

/**
 * A shape's size at one side given: that side rounded (as the library rounds it), the other
 * following the shape from it.
 * @param {readonly [number, number]} shape [width, height] @param {number | undefined} width @param {number | undefined} height
 * @returns {[number, number]}
 */
export function shapeAt([w, h], width, height) {
  if (width !== undefined) return [Math.round(width), Math.round((Math.round(width) * h) / w)];
  if (height !== undefined) return [Math.round((Math.round(height) * w) / h), Math.round(height)];
  return [w, h];
}
