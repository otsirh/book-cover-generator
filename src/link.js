// Reading a design from a link: the part of an app link after #, and the HTTP API's query, read by
// the same rules, so one link draws one design. Each reader takes a value from a link (or from a
// design the app stored) and gives the field's value, or undefined for one it can't read: the app
// drops it, the API says so. (Not part of the library's API.)

import { styleIdFor, palettes, formats, sizeLimits } from './index.js';
import { LINE_BREAK, clipGraphemes } from './text.js';
import {
  idFor,
  fontEntries,
  reserved,
  STYLE_WORDS,
  PALETTE_WORDS,
  CUSTOM_PALETTE,
  CUSTOM_SIZE,
  VARIANT,
  customColors,
  hex,
} from './shared.js';

/** Line breaks as spaces (a single-line field: the cover spaces them). @param {unknown} v */
const oneLine = (v) => (typeof v === 'string' ? v.split(LINE_BREAK).join(' ') : null);
/** Line breaks kept, each as "\n" (the title, typed on several lines). @param {unknown} v */
const lines = (v) => (typeof v === 'string' ? v.split(LINE_BREAK).join('\n') : null);
/** At most `max` UTF-16 units (as the app's inputs count), cut between whole characters. @param {string | null | undefined} s @param {number} max */
const clip = (s, max) => (s == null ? undefined : clipGraphemes(s, max, { units: true }));
/** The value if it passes `ok`, else undefined. @param {string | null | undefined} v @param {(v: string) => boolean} ok */
const oneOf = (v, ok) => (v && ok(v) ? v : undefined);

/** Whether the library can make a cover this size (in whole px). @param {number} w @param {number} h */
export const fits = (w, h) =>
  Number.isInteger(w) &&
  Number.isInteger(h) &&
  Math.min(w, h) >= sizeLimits.min &&
  Math.max(w, h) <= sizeLimits.max &&
  w <= h * sizeLimits.ratio &&
  h <= w * sizeLimits.ratio;

/** Each field a link may name, and how it is read. */
export const LINK = {
  title: (/** @type {unknown} */ v) => clip(lines(v), 200),
  author: (/** @type {unknown} */ v) => clip(oneLine(v), 120),
  subtitle: (/** @type {unknown} */ v) => clip(oneLine(v), 160),
  series: (/** @type {unknown} */ v) => clip(oneLine(v), 120),
  credit: (/** @type {unknown} */ v) => clip(oneLine(v), 120),
  badge: (/** @type {unknown} */ v) => clip(oneLine(v), 60),
  /** A style's id or name, in any case ('random' is left to the title: undefined). @param {unknown} v */
  style: (v) => {
    const t = oneLine(v);
    return t == null || reserved(t, STYLE_WORDS) ? undefined : styleIdFor(t);
  },
  /** Pins as name.value pairs joined by '-', in any case. @param {unknown} v */
  variant: (v) => oneOf(oneLine(v)?.trim().toLowerCase(), (t) => VARIANT.test(t)),
  /** A font's id or name ("Old style"), in any case. @param {unknown} v */
  font: (v) => idFor(oneLine(v), fontEntries()),
  /** 'upper' or 'normal', in any case. @param {unknown} v */
  case: (v) => oneOf(oneLine(v)?.trim().toLowerCase(), (t) => t === 'upper' || t === 'normal'),
  /** 'auto' (or 'random'), your own colours as custom-…, or a palette's id or name. @param {unknown} v */
  palette: (v) => {
    const t = oneLine(v);
    if (t == null) return undefined;
    if (reserved(t, PALETTE_WORDS)) return 'auto';
    const lower = t.trim().toLowerCase();
    return CUSTOM_PALETTE.test(lower) ? lower : idFor(t, palettes);
  },
  seed: (/** @type {unknown} */ v) => clip(oneLine(v)?.trim(), 40),
  /** A preset, or a size of your own the library can make. @param {unknown} v */
  format: (v) =>
    oneOf(oneLine(v)?.trim(), (f) => {
      if (Object.hasOwn(formats, f)) return true;
      const size = CUSTOM_SIZE.exec(f);
      return size !== null && fits(Number(size[1]), Number(size[2]));
    }),
  /** On or off: 1, 0, true or false, in any case. @param {unknown} v */
  texture: (v) => {
    const t = typeof v === 'string' ? v.trim().toLowerCase() : v;
    if (t === true || t === '1' || t === 'true') return true;
    if (t === false || t === '0' || t === 'false') return false;
    return undefined;
  },
};

/**
 * The value of each key in a query, the last when it is given more than once (as an app link's
 * reader, `Object.fromEntries`, takes it).
 * @param {URLSearchParams} q
 */
export const lastValues = (q) => /** @type {Record<string, string>} */ (Object.fromEntries(q));

/** A size in px, as the CLI reads one (the library checks its range), else an error naming the parameter. @param {string} key @param {string} raw */
function px(key, raw) {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value)) throw new RangeError(`${key} must be a number of px, got "${raw}"`);
  return value;
}

/**
 * Cover options from a link's query (the HTTP API's). The app's link parameters are read as the
 * app reads them, the last of a repeated one too, except that a value the app would drop is an
 * error here. Also the library's option names (`titleCase`, `genre`, `lang`, `width`, `height`)
 * and your own colours as `bg`, `ink` and `accent` (hex, the # optional, accents separated by
 * commas).
 * @param {URLSearchParams} q
 * @returns {import('./index.js').CoverOptions}
 */
export function optionsFromLink(q) {
  const v = lastValues(q);
  /** A parameter's value, if it has one. @param {string} key */
  const given = (key) => (v[key] != null && v[key] !== '' ? v[key] : undefined);
  /** @type {Record<string, unknown>} */
  const o = {};
  for (const key of /** @type {const} */ (['title', 'author', 'subtitle', 'series', 'credit', 'badge', 'seed'])) {
    const value = given(key) === undefined ? undefined : LINK[key](v[key]);
    if (value) o[key] = value;
  }
  // Styles, fonts and palettes the reader doesn't know go to the library as typed: it picks for
  // 'random', and says what's wrong with the others.
  for (const key of /** @type {const} */ (['style', 'font'])) {
    const raw = given(key);
    if (raw !== undefined) o[key] = LINK[key](raw) ?? raw;
  }
  for (const key of ['genre', 'lang']) if (given(key) !== undefined) o[key] = given(key);
  const palette = given('palette');
  if (palette !== undefined) {
    const read = LINK.palette(palette);
    const colors = read ? customColors(read) : null;
    if (colors) o.palette = { bg: colors[0], ink: colors[1], accents: colors.slice(2) };
    else if (read !== 'auto') o.palette = read ?? palette;
  }
  const caseKey = given('case') !== undefined ? 'case' : 'titleCase';
  const titleCase = given(caseKey);
  if (titleCase !== undefined) {
    o.titleCase = LINK.case(titleCase);
    if (!o.titleCase) throw new RangeError(`${caseKey} is upper or normal, got "${titleCase}"`);
  }
  const texture = given('texture');
  if (texture !== undefined) {
    o.texture = LINK.texture(texture);
    if (o.texture === undefined) throw new RangeError('texture is 1 (on) or 0 (off)');
  }
  const variant = given('variant');
  if (variant !== undefined) {
    const pairs = LINK.variant(variant);
    if (!pairs) {
      throw new RangeError('variant is name.value pairs joined by "-", such as scene.forest or field.pale-emblem.sun');
    }
    o.variants = Object.fromEntries(pairs.split('-').map((pair) => pair.split('.')));
  }
  const width = given('width') === undefined ? undefined : px('width', /** @type {string} */ (given('width')));
  const height = given('height') === undefined ? undefined : px('height', /** @type {string} */ (given('height')));
  const format = given('format');
  if (format !== undefined) {
    // A preset, or any WxH shape: a width or height may scale it, and the library checks the size
    // it comes to (saying what's wrong with it).
    const read = format.trim();
    const size = Object.hasOwn(formats, read)
      ? formats[/** @type {keyof typeof formats} */ (read)]
      : CUSTOM_SIZE.exec(read)?.slice(1).map(Number);
    if (!size) {
      throw new RangeError(
        `Unknown format "${format}". Use one of ${Object.keys(formats).join(', ')}, or a size such as 1600x2560`,
      );
    }
    // A format's shape, at the width or height asked for (as the CLI's --format --width).
    if (width !== undefined && height !== undefined) {
      throw new RangeError('format sets the shape: give it a width or a height, not both');
    }
    const [w, h] = size;
    [o.width, o.height] =
      width !== undefined
        ? [width, Math.round((width * h) / w)]
        : height !== undefined
          ? [Math.round((height * w) / h), height]
          : [w, h];
  } else {
    if (width !== undefined) o.width = width;
    if (height !== undefined) o.height = height;
  }
  const [bg, ink, accent] = [given('bg'), given('ink'), given('accent')];
  if (bg || ink || accent) {
    if (!bg || !ink || !accent) throw new RangeError('Your own colours need bg, ink and accent');
    o.palette = {
      bg: hex(bg),
      ink: hex(ink),
      accents: accent
        .split(',')
        .filter((c) => c.trim())
        .map(hex),
    };
  }
  return /** @type {import('./index.js').CoverOptions} */ (o);
}
