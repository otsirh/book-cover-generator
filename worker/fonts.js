// The fonts the Worker draws PNGs with, and what it needs to know of them: each face's family,
// weight and slant, which characters it has and how wide they are. Read from the font files
// themselves (public/fonts), so the Worker lays text out in the faces resvg then draws it in.
// Plain JavaScript, no DOM: Node tests it with the same files.

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

  /**
   * The family a CSS font-family list is drawn in: its first there is (generic names as GENERIC
   * says), else the serif.
   * @param {string} stack
   */
  const familyFor = (stack) => {
    const names = stack.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    const found = names
      .map((n) => families.get((GENERIC[/** @type {keyof typeof GENERIC} */ (n)] ?? n).toLowerCase()))
      .find(Boolean);
    return /** @type {Face[]} */ (found ?? families.get(GENERIC.serif.toLowerCase()));
  };

  /**
   * The face a CSS font-family list (with a weight and slant) is drawn in: in its family (see
   * familyFor), the weight CSS matches: the nearest, lighter first up to 500.
   * @param {string} stack @param {number} weight @param {boolean} italic
   */
  const faceFor = (stack, weight, italic) => {
    const list = familyFor(stack);
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

  /** Every face, for characters a family lacks (as resvg falls back to any font that has them). */
  const fallbacks = [...families.values()].flat();

  return {
    faceFor,
    /** The name of the family a CSS font-family list is drawn in. @param {string} stack */
    familyOf: (stack) => familyFor(stack)[0].family,
    /**
     * Width in px of `text` at `size` px in a font-family list: a setTextMeasurer measurer.
     * (Advance widths, without kerning, which only ever narrows a line.)
     * @param {string} text @param {number} size @param {{ family: string, weight?: number, italic?: boolean }} font
     */
    measure(text, size, { family, weight = 400, italic = false }) {
      const face = faceFor(family, weight, italic);
      let width = 0;
      for (const ch of text) {
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
      for (const ch of text) {
        const cp = /** @type {number} */ (ch.codePointAt(0));
        // (Spacing, joiners and variation selectors draw nothing.)
        if (cp <= 0x20 || (cp >= 0x200b && cp <= 0x200f) || cp === 0x2060 || (cp >= 0xfe00 && cp <= 0xfe0f)) continue;
        if (/\s/u.test(ch)) continue;
        if (!fallbacks.some((f) => f.glyph(cp))) return false;
      }
      return true;
    },
  };
}
