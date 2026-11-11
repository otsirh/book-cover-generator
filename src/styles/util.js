import { contrast, readable } from '../core.js';

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
