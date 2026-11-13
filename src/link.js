// Reading a design from a link: the part of an app link after #, and the HTTP API's query, read by
// the same rules, so one link draws one design. Each reader takes a value from a link (or from a
// design the app stored) and gives the field's value, or undefined for one it can't read: the app
// drops it, the API says so. (Not part of the library's API.)

import { styleIdFor, palettes, formats, sizeLimits, version } from './index.js';
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
  LANG_TAG,
  customColors,
} from './shared.js';

/** Line breaks as spaces (a single-line field: the cover spaces them). @param {unknown} v */
const oneLine = (v) => (typeof v === 'string' ? v.split(LINE_BREAK).join(' ') : null);
/** Line breaks kept, each as "\n" (the title, typed on several lines). @param {unknown} v */
const lines = (v) => (typeof v === 'string' ? v.split(LINE_BREAK).join('\n') : null);
/** A format as links write it: lower case, a size as WxH (1600X2560 and 1600 × 2560 as 1600x2560). @param {string} format */
const formatName = (format) =>
  format
    .trim()
    .toLowerCase()
    .replace(/^(\d+)\s*[x×]\s*(\d+)$/, '$1x$2');
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
  /** A preset, or a size of your own the library can make, in any case (1600X2560, 1600 × 2560). @param {unknown} v */
  format: (v) =>
    oneOf(typeof v === 'string' ? formatName(v) : undefined, (f) => {
      if (Object.hasOwn(formats, f)) return true;
      const size = CUSTOM_SIZE.exec(f);
      return size !== null && fits(Number(size[1]), Number(size[2]));
    }),
  /** The text's language, a tag such as tr or zh-Hant. @param {unknown} v */
  lang: (v) => oneOf(oneLine(v)?.trim(), (t) => t.length <= 35 && LANG_TAG.test(t)),
  /** On or off: 1, 0, true or false, in any case. @param {unknown} v */
  texture: (v) => {
    const t = typeof v === 'string' ? v.trim().toLowerCase() : v;
    if (t === true || t === '1' || t === 'true') return true;
    if (t === false || t === '0' || t === 'false') return false;
    return undefined;
  },
};

/**
 * @typedef {object} Field
 * @property {(v: unknown) => unknown} read  the value from a link or a stored design; undefined drops it
 * @property {(v: any) => string} [write]    the value as a link writes it (default: as it is)
 * @property {unknown} empty                 the value of a design that leaves it out (see complete())
 * @property {boolean} [optional]            links may leave it out and still be whole designs
 * @property {boolean} [omitEmpty]           links leave it out when it is empty
 */

/**
 * Every field of a design, in the order links name them. A field added later is `optional`, so
 * links made before it existed still open as whole designs (with its `empty` value).
 * @type {Record<string, Field>}
 */
export const LINK_FIELDS = {
  // (Each read by LINK, as the HTTP API reads links too: one link draws one design.)
  // (Line breaks kept since 1.5.0: the cover breaks the title there.)
  title: { read: LINK.title, empty: '' },
  author: { read: LINK.author, empty: '' },
  // (Optional since 1.2.0: older links left it out when empty.)
  subtitle: { read: LINK.subtitle, empty: '', optional: true },
  // (Since 1.5.0.)
  series: { read: LINK.series, empty: '', optional: true, omitEmpty: true },
  credit: { read: LINK.credit, empty: '', optional: true, omitEmpty: true },
  // (Since 1.6.0.)
  badge: { read: LINK.badge, empty: '', optional: true, omitEmpty: true },
  style: { read: LINK.style, empty: '' },
  // (Since 1.5.0.) Checked against the style when used (the app's pinsFor()).
  variant: { read: LINK.variant, empty: '', optional: true, omitEmpty: true },
  // (Since 1.5.0.)
  font: { read: LINK.font, empty: '', optional: true, omitEmpty: true },
  case: { read: LINK.case, empty: '', optional: true, omitEmpty: true },
  palette: { read: LINK.palette, empty: 'auto' },
  seed: { read: LINK.seed, empty: '' },
  format: { read: LINK.format, empty: 'paperback' },
  // On or off; any other value (texture=yes) is dropped like other unknown values.
  texture: { read: LINK.texture, write: (v) => (v ? '1' : '0'), empty: false, optional: true },
  // (Since 1.13.0.) The text's language, for its capitals and letterforms: '' leaves it to the text.
  lang: { read: LINK.lang, empty: '', optional: true, omitEmpty: true },
};

/**
 * A design from a link's values or a stored design: each field it names (its own properties only,
 * not an object's like `valueOf`), read as links are read; a value a reader can't read is left
 * out. (The app and the gallery read designs so.)
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function readDesign(raw) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, field] of Object.entries(LINK_FIELDS)) {
    const value = Object.hasOwn(raw, key) ? field.read(raw[key]) : undefined;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Of a design's pins (name.value pairs joined by '-'), the ones a style offers: one left from
 * another style, or from an old link, is dropped, as the app draws it.
 * @param {string} variant @param {readonly { name: string, values: readonly { value: string }[] }[]} offered the style's variants
 * @returns {Record<string, string>}
 */
export function pinsOf(variant, offered) {
  /** @type {Record<string, string>} */
  const pins = {};
  for (const pair of variant ? variant.split('-') : []) {
    const [name, value] = pair.split('.');
    if (offered.some((v) => v.name === name && v.values.some((x) => x.value === value))) pins[name] = value;
  }
  return pins;
}

/**
 * A design's link (the part of an app link after #, the HTTP API's query): every field, even when
 * empty or off, so a link is the whole design, never mistaken for a hand-edited partial one (which
 * changes only the keys it names); last, the version that drew it (artwork can change between
 * minor versions).
 * @param {Record<string, unknown>} design
 */
export function writeLink(design) {
  const q = new URLSearchParams();
  for (const [key, field] of Object.entries(LINK_FIELDS)) {
    if (field.omitEmpty && design[key] === field.empty) continue;
    q.set(key, field.write?.(design[key]) ?? String(design[key]));
  }
  q.set('v', version);
  return q;
}

/**
 * The link of the cover drawn, written as the app writes its links from the options it was drawn
 * with (not the tool's arguments), with what the seed chose written out: the app and the API draw
 * that cover. (The MCP server's links and the HTTP API's cover.json.)
 * @param {import('./index.js').CoverOptions} options @param {ReturnType<typeof import('./index.js').createCover>} cover
 */
export function linkOf(options, cover) {
  /** @type {Record<string, string>} */
  const pinned = {};
  // (Names and values in lower case, as links hold them: the library reads them in any case.)
  for (const name of Object.keys(options.variants ?? {}).map((n) => n.toLowerCase())) {
    const key = Object.keys(cover.variants).find((k) => k.toLowerCase() === name);
    if (key !== undefined) pinned[name] = String(cover.variants[key]).toLowerCase();
  }
  const own = options.palette && typeof options.palette === 'object' ? options.palette : null;
  const preset = Object.entries(formats).find(([, [w, h]]) => w === cover.width && h === cover.height);
  return writeLink({
    title: cover.title,
    author: cover.author,
    subtitle: options.subtitle ?? '',
    series: options.series ?? '',
    credit: options.credit ?? '',
    badge: options.badge ?? '',
    style: cover.style,
    variant: variantOf(pinned),
    font: options.font ?? '',
    case: options.titleCase ?? '',
    palette: own ? customPalette([own.bg, own.ink, ...(own.accents ?? [])]) : cover.palette,
    // (A seed from the title stays one: the app reads an empty seed so.)
    seed: options.seed != null ? cover.seed : '',
    format: preset ? preset[0] : `${cover.width}x${cover.height}`,
    texture: options.texture === true,
    // (A language given; one the text implies, the text implies again.)
    lang: options.lang ? cover.lang : '',
  });
}

/**
 * Your own colours (background, text, one to three accents) as a link's palette: each as six hex
 * digits (#abc is #aabbcc; an alpha is dropped).
 * @param {readonly string[]} colors
 */
export const customPalette = (colors) => `custom-${colors.map((c) => sixDigits(c).slice(1)).join('-')}`;

/**
 * A colour as #rrggbb, lower-case: #abc as #aabbcc, and an alpha (#abcd, #aabbccdd) dropped. Any
 * other value is left as it is, for the reader to refuse.
 * @param {string} c
 */
export function sixDigits(c) {
  const h = c.trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(h)) return c;
  if (h.length === 3 || h.length === 4) return `#${[...h.slice(0, 3)].map((x) => x + x).join('')}`;
  if (h.length === 6 || h.length === 8) return `#${h.slice(0, 6)}`;
  return c;
}

/** A design's pins as a link holds them (sorted by name, so the same pins make the same link). @param {Record<string, string>} pins */
export const variantOf = (pins) =>
  Object.keys(pins)
    .sort()
    .map((name) => `${name}.${pins[name]}`)
    .join('-');

/**
 * The value of each key in a query, the last when it is given more than once (as an app link's
 * reader, `Object.fromEntries`, takes it).
 * @param {URLSearchParams} q
 */
export const lastValues = (q) => /** @type {Record<string, string>} */ (Object.fromEntries(q));

/** A size in px, as the CLI reads one (the library checks its range), else an error naming the parameter. @param {string} key @param {string} raw */
export function px(key, raw) {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value)) throw new RangeError(`${key} must be a number, got "${raw}"`);
  return value;
}

/**
 * A cover's size from a format (a preset, or any WxH shape) and a width or height that scales it,
 * as the HTTP API and the CLI read them; the format's own size with neither. The library checks
 * the size it comes to.
 * @param {string} format @param {number | undefined} width @param {number | undefined} height
 * @returns {[number, number]}
 */
export function formatSize(format, width, height) {
  const read = formatName(format);
  const size = Object.hasOwn(formats, read)
    ? formats[/** @type {keyof typeof formats} */ (read)]
    : CUSTOM_SIZE.exec(read)?.slice(1).map(Number);
  if (!size) {
    throw new RangeError(
      `Unknown format "${format}". Use one of ${Object.keys(formats).join(', ')}, or a size such as 1600x2560`,
    );
  }
  if (width !== undefined && height !== undefined) {
    throw new RangeError('A format sets the shape: give it a width or a height, not both');
  }
  const [w, h] = size;
  if (width !== undefined) return [width, Math.round((width * h) / w)];
  if (height !== undefined) return [Math.round((height * w) / h), height];
  return [w, h];
}

/**
 * A cover's size from a width or a height without a format, as the CLI and the HTTP API read them:
 * both, as given; a width alone, as the library takes it (the paperback's shape, 2:3); a height
 * alone, with the paperback's width for it, said of the height if that width is too small.
 * @param {number | undefined} width @param {number | undefined} height
 * @param {{ width: string, height: string }} [names] the parameters, as an error names them
 * @returns {{ width?: number, height?: number }}
 */
export function shapelessSize(width, height, names = { width: 'width', height: 'height' }) {
  if (width !== undefined || height === undefined) return { width, height };
  const [w, h] = formatSize('paperback', undefined, height);
  if (w < sizeLimits.min) {
    throw new RangeError(
      `${names.height} ${height} makes a paperback ${w} px wide, under ${sizeLimits.min}: give a taller ${names.height}, or ${names.width} too`,
    );
  }
  return { width: w, height: h };
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
  if (given('genre') !== undefined) o.genre = given('genre');
  const lang = given('lang');
  if (lang !== undefined) {
    o.lang = LINK.lang(lang);
    if (!o.lang) throw new RangeError(`lang must be a language tag such as "tr" or "zh-Hant", got "${lang}"`);
  }
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
  if (format !== undefined) [o.width, o.height] = formatSize(format, width, height);
  else {
    const size = shapelessSize(width, height);
    if (size.width !== undefined) o.width = size.width;
    if (size.height !== undefined) o.height = size.height;
  }
  const [bg, ink, accent] = [given('bg'), given('ink'), given('accent')];
  if (bg || ink || accent) {
    if (!bg || !ink || !accent) throw new RangeError('Your own colours need bg, ink and accent');
    // (Each as #rrggbb, as a link writes it: the query and its link draw the same bytes.)
    const accents = accent
      .split(',')
      .filter((c) => c.trim())
      .map(sixDigits);
    // (As many as a link's palette holds: custom-… has one to three.)
    if (accents.length < 1 || accents.length > 3) {
      throw new RangeError(`accent is one to three colours, separated by commas; got ${accents.length}`);
    }
    o.palette = { bg: sixDigits(bg), ink: sixDigits(ink), accents };
  }
  return /** @type {import('./index.js').CoverOptions} */ (o);
}
