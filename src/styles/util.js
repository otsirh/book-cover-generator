/* @ts-self-types="./util.d.ts" */
import { n, circle, contrast, readable, clamp, mix, inkCandidates, hexToRgb } from '../core.js';
import { titleBlock } from '../type.js';
import { graphemes } from '../text.js';

/** @typedef {import('../type.js').TitleBlock} TitleBlock */

/**
 * The title's characters, upper-cased, from the first that isn't punctuation or a
 * space: an initial skips opening quotes, brackets, "¿" and the like (but keeps
 * letters, digits, symbols and emoji). Spaces inside are kept, so callers can tell
 * where the first word ends. All of it if the title is only punctuation.
 * @param {string} title
 */
export function initialChars(title) {
  const chars = graphemes(title.trim().toUpperCase());
  const start = chars.findIndex((ch) => ch.trim() && !/^\p{P}+$/u.test(ch));
  return start > 0 ? chars.slice(start) : chars;
}

/**
 * Accents that stand out against `bg`, best first; falls back to the single
 * most readable colour so callers always get at least one.
 * @param {import('../index.js').ResolvedPalette} p
 * @param {string} bg
 * @param {number} [min] minimum contrast ratio
 */
export function strongAccents(p, bg, min = 1.8) {
  const list = [...p.accents].filter((a) => contrast(a, bg) >= min).sort((a, b) => contrast(b, bg) - contrast(a, bg));
  return list.length ? list : [readable(bg, [...p.accents, p.ink, p.bg])];
}

/** Text needs this much contrast with what is behind it (WCAG's floor for large text). */
export const TEXT_CONTRAST = 3;

/**
 * A colour for text over `bg` (or over every colour in `bg`, for text on a gradient): the
 * first of `preferred` with at least 3:1 against all of them, else whichever of the
 * palette's ink and background, white and near-black reads best. Decoration can use any
 * accent; text that takes an accent goes through here.
 * @param {import('../index.js').ResolvedPalette} p
 * @param {string | string[]} bg
 * @param {string[]} [preferred]
 */
export function textColor(p, bg, preferred = []) {
  const bgs = Array.isArray(bg) ? bg : [bg];
  const worst = (/** @type {string} */ col) => Math.min(...bgs.map((b) => contrast(col, b)));
  const good = preferred.find((col) => worst(col) >= TEXT_CONTRAST);
  if (good) return good;
  return inkCandidates(p).reduce((best, col) => (worst(col) > worst(best) ? col : best));
}

/**
 * `mix(base, toward, k)` for text: as much of `toward` (up to `k`) as keeps 3:1 against
 * `bg` (or every colour in it). `base` itself must already read well.
 * @param {string} base @param {string} toward @param {number} k @param {string | string[]} bg
 */
export function tintText(base, toward, k, bg) {
  const bgs = Array.isArray(bg) ? bg : [bg];
  for (let t = k; t > 0.001; t -= 0.05) {
    const col = mix(base, toward, t);
    if (bgs.every((b) => contrast(col, b) >= TEXT_CONTRAST)) return col;
  }
  return base;
}

/**
 * Try layouts in order until the title fits comfortably: not truncated, and at
 * least `minSize` × the short side. A later layout (less art) is taken only when it
 * actually sets the title larger or whole.
 * @template V
 * @param {import('../index.js').StyleContext} c
 * @param {readonly V[]} candidates  layout values, from the most to the least room for the art
 * @param {(value: V) => import('../type.js').TitleBlockOptions} optionsFor
 * @param {number} [minSize]  fraction of the short side
 * @returns {{ block: TitleBlock, value: V }}
 */
export function fitTitleWith(c, candidates, optionsFor, minSize = 0.06) {
  let block = titleBlock(c, optionsFor(candidates[0]));
  let value = candidates[0];
  for (let i = 1; i < candidates.length && (block.truncated || block.smallest < c.S * minSize); i++) {
    const next = titleBlock(c, optionsFor(candidates[i]));
    // Give up art only for a real gain: a title no longer cut, or clearly larger. (A title held
    // back by its width, like one long word, gains nothing from a taller box.)
    if ((block.truncated && !next.truncated) || next.smallest > block.smallest * 1.08) {
      block = next;
      value = candidates[i];
    }
  }
  return { block, value };
}

/**
 * A flower or rosette: petals around a centre.
 * @param {number} x @param {number} y @param {number} r @param {string} petal @param {string} heart
 * @param {number} count @param {number} [width] petal width relative to its length
 */
export function flower(x, y, r, petal, heart, count, width = 0.58) {
  let o = '';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 360;
    o += `<ellipse cx="${n(x)}" cy="${n(y - r * 0.55)}" rx="${n(r * 0.55 * width)}" ry="${n(r * 0.55)}" fill="${petal}" transform="rotate(${n(a)} ${n(x)} ${n(y)})"/>`;
  }
  return o + circle(x, y, r * 0.3, heart);
}

/**
 * A panel holding the title above the author (mosaic, stripes, memphis, sunburst, and the
 * open text of topographic and flow field): its top `y` and height `h`, centred on
 * `centerY` (or starting at `top`, or ending at `bottom`) and kept inside the margins. A panel taller than the room between the margins is centred on the cover.
 * `gap` is the space between title and author (none without an author); `extra` adds to
 * the height, e.g. for a frame.
 * @param {import('../index.js').StyleContext} c
 * @param {import('../type.js').TitleBlock} t @param {import('../text.js').TextFit} a
 * @param {{ pad: number, gap: number, extra?: number, centerY?: number, top?: number, bottom?: number }} o
 */
export function textPanel(c, t, a, { pad, gap, extra = 0, centerY = c.H / 2, top, bottom }) {
  const space = a.lines.length ? gap : 0;
  const h = pad * 2 + t.height + space + a.height + extra;
  const want = top ?? (bottom != null ? bottom - h : centerY - h / 2);
  const y = h > c.H - c.m * 2 ? (c.H - h) / 2 : clamp(want, c.m, c.H - c.m - h);
  return { y, h, gap: space };
}

/**
 * A leaf from (x, y) pointing at `angle`, made of two quadratic curves.
 * @param {number} x @param {number} y @param {number} len @param {number} angle @param {string} color
 */
export function leaf(x, y, len, angle, color) {
  const w = len * 0.36;
  const tr = `transform="translate(${n(x)} ${n(y)}) rotate(${n((angle * 180) / Math.PI)})"`;
  return `<path d="M0 0Q${n(len * 0.45)} ${n(-w)} ${n(len)} 0Q${n(len * 0.45)} ${n(w)} 0 0Z" fill="${color}" ${tr}/>`;
}

// How much a colour leans one way, to give each accent the job it suits (the sun to the yellowest).
/** Red (the red channel over the others). @param {string} hex */
export function redness(hex) {
  const [r, g, b] = hexToRgb(hex);
  return r - (g + b) / 2;
}
/** Red, rose or coral (red over green). @param {string} hex */
export function rosy(hex) {
  const [r, g] = hexToRgb(hex);
  return r - g;
}
/** Yellow to orange (red and green over blue). @param {string} hex */
export function yellowness(hex) {
  const [r, g, b] = hexToRgb(hex);
  return Math.min(r, g) - b;
}
/** Green, teal or blue (green or blue over red). @param {string} hex */
export function coolness(hex) {
  const [r, g, b] = hexToRgb(hex);
  return Math.max(g, b) - r;
}
/** How vivid (the spread of the channels). @param {string} hex */
export function chroma(hex) {
  const [r, g, b] = hexToRgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}
/**
 * The colour that scores highest (the first, on a tie).
 * @param {readonly string[]} list @param {(hex: string) => number} score
 */
export function most(list, score) {
  return list.reduce((best, col) => (score(col) > score(best) ? col : best));
}
