import { n, circle, contrast, readable } from '../core.js';
import { titleBlock } from '../type.js';
import { graphemes } from '../text.js';

/**
 * The title's visible characters, upper-cased, from the first that isn't punctuation:
 * an initial skips opening quotes, brackets, "¿" and the like (but keeps letters,
 * digits, symbols and emoji). All of them if the title is only punctuation.
 * @param {string} title
 */
export function initialChars(title) {
  const chars = graphemes(title.trim().toUpperCase()).filter((ch) => ch.trim());
  const start = chars.findIndex((ch) => !/^\p{P}+$/u.test(ch));
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
