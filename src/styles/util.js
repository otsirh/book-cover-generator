import { n, circle, contrast, readable, clamp } from '../core.js';
import { titleBlock } from '../type.js';
import { graphemes } from '../text.js';

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

/**
 * Try layouts in order until the title fits comfortably: not truncated, and at
 * least `minSize` × the short side. The last layout wins if none does.
 * @template V
 * @param {import('../index.js').StyleContext} c
 * @param {readonly V[]} candidates  layout values, from the most to the least room for the art
 * @param {(value: V) => import('../type.js').TitleBlockOptions} optionsFor
 * @param {number} [minSize]  fraction of the short side
 * @returns {{ block: import('../type.js').TitleBlock, value: V }}
 */
export function fitTitleWith(c, candidates, optionsFor, minSize = 0.06) {
  let block = titleBlock(c, optionsFor(candidates[0]));
  let value = candidates[0];
  for (let i = 1; i < candidates.length && (block.truncated || block.size < c.S * minSize); i++) {
    value = candidates[i];
    block = titleBlock(c, optionsFor(value));
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
 * A panel holding the title above the author (mosaic, stripes, memphis, sunburst): its top
 * `y` and height `h`, centred on `centerY` (or starting at `top`) and kept inside the
 * margins. A panel taller than the room between the margins is centred on the cover.
 * `gap` is the space between title and author (none without an author); `extra` adds to
 * the height, e.g. for a frame.
 * @param {import('../index.js').StyleContext} c
 * @param {import('../type.js').TitleBlock} t @param {import('../text.js').TextFit} a
 * @param {{ pad: number, gap: number, extra?: number, centerY?: number, top?: number }} o
 */
export function textPanel(c, t, a, { pad, gap, extra = 0, centerY = c.H / 2, top }) {
  const space = a.lines.length ? gap : 0;
  const h = pad * 2 + t.height + space + a.height + extra;
  const want = top ?? centerY - h / 2;
  const y = h > c.H - c.m * 2 ? (c.H - h) / 2 : clamp(want, c.m, c.H - c.m - h);
  return { y, h, gap: space };
}
