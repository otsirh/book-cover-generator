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
