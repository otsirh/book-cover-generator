// The fonts the Worker draws PNGs with, and what it needs to know of them: each face's family,
// weight and slant, which characters it has and how wide they are. Read from the font files
// themselves (public/fonts), so the Worker lays text out in the faces resvg then draws it in.
// Plain JavaScript, no DOM: Node tests it with the same files.

import { INVISIBLE } from '../src/text.js';

/** The fonts in public/fonts the Worker loads: open faces the built-in stacks name. */
export const FONT_FILES = [
  'NotoSerif-Regular.ttf',
  'NotoSerif-Bold.ttf',
  'NotoSerif-Italic.ttf',
  'NotoSerif-BoldItalic.ttf',
  'NotoSerifDisplay-Regular.ttf',
  'NotoSerifDisplay-Bold.ttf',
  'NotoSerifDisplay-Italic.ttf',
  'NotoSans-Regular.ttf',
  'NotoSans-Bold.ttf',
  'NotoSans-Italic.ttf',
  'NotoSans-BoldItalic.ttf',
  'EBGaramond-Regular.ttf',
  'EBGaramond-Bold.ttf',
  'EBGaramond-Italic.ttf',
  'EBGaramond-BoldItalic.ttf',
  'LiberationSans-Regular.ttf',
  'LiberationSans-Bold.ttf',
  'LiberationSans-Italic.ttf',
  'LiberationSans-BoldItalic.ttf',
  'LiberationMono-Regular.ttf',
  'LiberationMono-Bold.ttf',
  'RobotoCondensed-Regular.ttf',
  'RobotoCondensed-Bold.ttf',
  'Anton-Regular.ttf',
  'texgyreadventor-regular.otf',
  'texgyreadventor-bold.otf',
  'texgyreadventor-italic.otf',
  'texgyreadventor-bolditalic.otf',
];

/**
 * Control characters and Unicode's default ignorables (joiners, soft hyphens, variation selectors,
 * marks of direction…): they draw nothing, so no face needs them, and they take no room.
 * @param {string} ch
 */
const silent = (ch) => /** @type {number} */ (ch.codePointAt(0)) <= 0x20 || INVISIBLE.test(ch);

/**
 * The characters of a text that need a glyph (not spacing or one that draws nothing), as code points.
 * @param {string} text
 */
const needed = (text) =>
  [...text].filter((ch) => !silent(ch) && !/\s/u.test(ch)).map((ch) => /** @type {number} */ (ch.codePointAt(0)));

/** The faces generic family names stand for (and any stack falls back to). */
export const GENERIC = { serif: 'Noto Serif', 'sans-serif': 'Liberation Sans', monospace: 'Liberation Mono' };

/**
 * @typedef {object} Face  A font file, read.
 * @property {string} family
 * @property {number} weight  100 to 900
 * @property {boolean} italic
 * @property {number} unitsPerEm
 * @property {(codePoint: number) => number} glyph  its glyph for a character (0: none)
 * @property {(glyph: number) => number} advance  a glyph's advance width, in font units
 * @property {Uint8Array} bytes
 */

/**
 * Read what a TrueType or OpenType file says of itself.
 * @param {Uint8Array} bytes
 * @returns {Face}
 */
export function readFont(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /** @type {Record<string, number>} */
  const tables = {};
  for (let i = 0, count = view.getUint16(4); i < count; i++) {
    const at = 12 + i * 16;
    tables[String.fromCharCode(...bytes.subarray(at, at + 4))] = view.getUint32(at + 8);
  }
  for (const tag of ['head', 'hhea', 'hmtx', 'cmap', 'name', 'OS/2']) {
    if (tables[tag] === undefined) throw new Error(`readFont: no ${tag} table`);
  }
  const unitsPerEm = view.getUint16(tables.head + 18);
  const metrics = view.getUint16(tables.hhea + 34);
  const hmtx = tables.hmtx;
  /** @param {number} g */
  const advance = (g) => view.getUint16(hmtx + Math.min(g, metrics - 1) * 4);
  const os2 = tables['OS/2'];
  return {
    family: familyName(view, bytes, tables.name),
    weight: view.getUint16(os2 + 4),
    italic: (view.getUint16(os2 + 62) & 1) === 1,
    unitsPerEm,
    glyph: cmapLookup(view, tables.cmap),
    advance,
    bytes,
  };
}

/** The family name: the typographic one (16) if set, else the family (1), in Windows' UTF-16. */
function familyName(/** @type {DataView} */ view, /** @type {Uint8Array} */ bytes, /** @type {number} */ at) {
  const count = view.getUint16(at + 2);
  const strings = at + view.getUint16(at + 4);
  /** @type {Record<number, string>} */
  const found = {};
  for (let i = 0; i < count; i++) {
    const r = at + 6 + i * 12;
    const [platform, encoding, id, length, offset] = [0, 2, 6, 8, 10].map((k) => view.getUint16(r + k));
    if (platform !== 3 || (encoding !== 1 && encoding !== 10) || (id !== 1 && id !== 16) || found[id]) continue;
    let text = '';
    for (let k = 0; k < length; k += 2) text += String.fromCharCode(view.getUint16(strings + offset + k));
    found[id] = text;
  }
  const name = found[16] || found[1];
  if (!name) throw new Error('readFont: no family name');
  return name;
}

/** A character-to-glyph lookup from the cmap's Unicode subtable (format 12, else 4). */
function cmapLookup(/** @type {DataView} */ view, /** @type {number} */ at) {
  /** @type {Record<string, number>} */
  const subtables = {};
  for (let i = 0, count = view.getUint16(at + 2); i < count; i++) {
    const r = at + 4 + i * 8;
    subtables[`${view.getUint16(r)}/${view.getUint16(r + 2)}`] = at + view.getUint32(r + 4);
  }
  const full = subtables['3/10'] ?? subtables['0/4'];
  if (full !== undefined && view.getUint16(full) === 12) {
    const groups = view.getUint32(full + 12);
    return (cp) => {
      let [lo, hi] = [0, groups - 1];
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const g = full + 16 + mid * 12;
        if (cp < view.getUint32(g)) hi = mid - 1;
        else if (cp > view.getUint32(g + 4)) lo = mid + 1;
        else return view.getUint32(g + 8) + (cp - view.getUint32(g));
      }
      return 0;
    };
  }
  const bmp = subtables['3/1'] ?? subtables['0/3'];
  if (bmp === undefined || view.getUint16(bmp) !== 4) throw new Error('readFont: no Unicode cmap (format 4 or 12)');
  const segs = view.getUint16(bmp + 6) / 2;
  const ends = bmp + 14;
  const starts = ends + segs * 2 + 2;
  const deltas = starts + segs * 2;
  const ranges = deltas + segs * 2;
  return (cp) => {
    if (cp > 0xffff) return 0;
    let [lo, hi] = [0, segs - 1];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (view.getUint16(ends + mid * 2) < cp) lo = mid + 1;
      else hi = mid;
    }
    const start = view.getUint16(starts + lo * 2);
    if (cp < start || cp > view.getUint16(ends + lo * 2)) return 0;
    const delta = view.getInt16(deltas + lo * 2);
    const range = view.getUint16(ranges + lo * 2);
    if (range === 0) return (cp + delta) & 0xffff;
    const g = view.getUint16(ranges + lo * 2 + range + (cp - start) * 2);
    return g === 0 ? 0 : (g + delta) & 0xffff;
  };
}

/**
 * The faces, as a set to measure text with the way resvg draws it.
 * @param {Face[]} faces
 */
export function fontSet(faces) {
  /** @type {Map<string, Face[]>} */
  const families = new Map();
  for (const face of faces) {
    const key = face.family.toLowerCase();
    families.set(key, [...(families.get(key) ?? []), face]);
  }

  /** Whether a face has every character of a text that needs a glyph. @param {Face} face @param {string} text */
  const has = (face, text) => hasAll(face, needed(text));
  /** Whether a face has all these code points. @param {Face} face @param {readonly number[]} cps */
  const hasAll = (face, cps) => cps.every((cp) => face.glyph(cp));

  /**
   * The face of a family CSS picks for a weight and slant: the slant if the family has it, then
   * the nearest weight, lighter first up to 500.
   * @param {Face[]} list @param {number} weight @param {boolean} italic
   */
  const pick = (list, weight, italic) => {
    const slanted = list.filter((f) => f.italic === italic);
    const pool = slanted.length ? slanted : list;
    /** CSS's order of preference among weights. @param {Face} f */
    const rank = (f) => {
      const w = f.weight;
      if (w === weight) return 0;
      if (weight <= 500) {
        if (weight === 400 && w === 500) return 1;
        return w < weight ? 1000 + (weight - w) : 2000 + (w - weight);
      }
      return w > weight ? 1000 + (w - weight) : 2000 + (weight - w);
    };
    return pool.reduce((best, f) => (rank(f) < rank(best) ? f : best));
  };

  /**
   * The family a CSS font-family list sets a text in, at a weight and slant: the first whose face
   * for them has every character of the text (as a browser falls back along the list); else the
   * serif, else any family that has them all (∞, →…); else the list's first there is. Generic
   * names are the faces GENERIC says.
   * @param {string} stack @param {string} [text] @param {number} [weight] @param {boolean} [italic]
   */
  const familyFor = (stack, text = '', weight = 400, italic = false) => {
    const names = stack.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    const found = /** @type {Face[][]} */ (
      names
        .map((n) => families.get((GENERIC[/** @type {keyof typeof GENERIC} */ (n)] ?? n).toLowerCase()))
        .filter(Boolean)
    );
    const serif = /** @type {Face[]} */ (families.get(GENERIC.serif.toLowerCase()));
    if (text) {
      // (The characters it needs, found once for all the families tried.)
      const cps = needed(text);
      for (const list of [...found, serif, ...families.values()])
        if (hasAll(pick(list, weight, italic), cps)) return list;
    }
    return found[0] ?? serif;
  };

  /**
   * The face a CSS font-family list sets a text in, at a weight and slant (see familyFor).
   * @param {string} stack @param {number} weight @param {boolean} italic @param {string} [text]
   */
  const faceFor = (stack, weight, italic, text) => pick(familyFor(stack, text, weight, italic), weight, italic);

  /** @param {string} stack @param {string} [text] @param {number} [weight] @param {boolean} [italic] */
  const setIn = (stack, text = '', weight = 400, italic = false) => {
    const list = familyFor(stack, text, weight, italic);
    return { family: list[0].family, whole: !text || has(pick(list, weight, italic), text) };
  };

  /** Every face, for characters no family of the list has (as resvg falls back to any font). */
  const fallbacks = [...families.values()].flat();

  return {
    faceFor,
    /**
     * The family a CSS font-family list sets a text in (see familyFor), and whether its face has
     * every character of it (else resvg sets it from several fonts, and needs them all): render()
     * names the family on each line, so resvg draws the line in the face it was measured in.
     * @param {string} stack @param {string} [text] @param {number} [weight] @param {boolean} [italic]
     */
    setIn,
    /**
     * The name of the family a list sets a text in (setIn's).
     * @param {string} stack @param {string} [text] @param {number} [weight] @param {boolean} [italic]
     */
    familyOf: (stack, text = '', weight = 400, italic = false) => setIn(stack, text, weight, italic).family,
    /**
     * Width in px of `text` at `size` px in a font-family list: a setTextMeasurer measurer.
     * (Advance widths, without kerning, which only ever narrows a line.)
     * @param {string} text @param {number} size @param {{ family: string, weight?: number, italic?: boolean }} font
     */
    measure(text, size, { family, weight = 400, italic = false }) {
      const face = faceFor(family, weight, italic, text);
      let width = 0;
      for (const ch of text) {
        // (A character that draws nothing takes no room, whatever glyph a face gives it. Spaces do.)
        if (INVISIBLE.test(ch)) continue;
        const cp = /** @type {number} */ (ch.codePointAt(0));
        let f = face;
        let g = face.glyph(cp);
        if (!g) {
          const other = fallbacks.find((x) => x.glyph(cp));
          if (other) [f, g] = [other, other.glyph(cp)];
        }
        width += f.advance(g) / f.unitsPerEm;
      }
      return width * size;
    },
    /**
     * Whether some face has every character of `text` (else a PNG would show empty boxes).
     * @param {string} text
     */
    covers(text) {
      return needed(text).every((cp) => fallbacks.some((f) => f.glyph(cp)));
    },
  };
}
