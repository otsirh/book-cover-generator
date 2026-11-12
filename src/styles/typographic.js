import { n, rect, circle, mix, inkOn, escapeXml, contrast } from '../core.js';
import { FONTS, fitText, drawText, measureText, textGroupAttrs } from '../text.js';
import { titleBlock, authorFit } from '../type.js';
import { strongAccents, initialChars } from './util.js';

/** @typedef {import('../index.js').StyleContext} Ctx */

export const minimal = {
  id: 'minimal',
  name: 'Minimal',
  group: 'Typographic',
  description: 'Quiet, generous typography with a single accent rule.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const align = /** @type {'middle' | 'start'} */ (rng.pick(['middle', 'middle', 'start']));
    const pad = m * 1.4;
    const x = align === 'middle' ? W / 2 : pad;
    const maxWidth = W - pad * 2;
    const font = rng.pick([FONTS.serif, FONTS.didone, FONTS.garamond, FONTS.sans]);
    const accent = rng.pick(strongAccents(p, p.bg));

    let s = rect(0, 0, W, H, p.bg);
    if (rng.bool(0.5)) {
      s += rect(
        m * 0.6,
        m * 0.6,
        W - m * 1.2,
        H - m * 1.2,
        'none',
        `stroke="${p.ink}" stroke-opacity="0.3" stroke-width="${n(1.5 * u)}"`,
      );
    }
    const a = authorFit(c, { font: FONTS.sans, weight: 600, letterSpacing: 0.18, maxWidth, maxSize: S * 0.042 });
    const aY = H - pad - a.height;
    const top = H * rng.float(0.13, 0.19);
    const t = titleBlock(c, {
      font,
      weight: font === FONTS.sans ? 300 : 400,
      maxWidth,
      maxHeight: aY - top - S * 0.18,
      maxSize: S * 0.24,
      lineHeight: 1.06,
      maxLines: 6,
    });
    s += t.draw({ x, y: top, anchor: align, fill: p.ink });
    const ruleW = S * 0.14;
    const ruleY = top + t.height + S * 0.05;
    s += rect(align === 'middle' ? W / 2 - ruleW / 2 : x, ruleY, ruleW, 3 * u, accent);
    s += drawText(a, { x, y: aY, anchor: align, fill: p.ink });
    return s;
  },
};

// (initialChars upper-cases the title and skips punctuation, so these are all that can occur.)
const NARROW_INITIALS = /^[I1|]$/;

export const typographic = {
  id: 'typographic',
  name: 'Big Letter',
  group: 'Typographic',
  description: 'A giant initial cropped by the edge of the cover.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const chars = initialChars(c.title);
    const first = chars[0] || 'A';
    // A narrow initial (I, l, 1…) makes an unexplained slab; use two letters instead.
    const letters = NARROW_INITIALS.test(first) && chars[1] && /\p{L}/u.test(chars[1]) ? first + chars[1] : first;
    const font = rng.pick([FONTS.didone, FONTS.serif, FONTS.didone]);
    const mode = rng.pick(['solid', 'outline', 'duo']);
    const [c1, c2] = strongAccents(p, p.bg, 1.4).concat(p.accents);
    const fit = (S * rng.float(1.05, 1.3)) / Math.max(1, (measureText(letters, 100, { font }) / 100) * 0.95);
    const size = Math.min(fit, H * 0.85, S * 1.35);
    const baseline = H * rng.float(0.6, 0.64);
    const lx = W * rng.float(0.44, 0.56);
    /** @param {number} x @param {number} y @param {string} fill @param {string} [attrs] */
    const glyph = (x, y, fill, attrs) =>
      `<text x="${n(x)}" y="${n(y)}" ${textGroupAttrs({ font, size, anchor: 'middle', fill, attrs })}>${escapeXml(letters)}</text>`;

    let s = rect(0, 0, W, H, p.bg);
    if (mode === 'duo') {
      s += glyph(lx + size * 0.035, baseline + size * 0.02, c2);
      s += glyph(lx, baseline, c1, `style="mix-blend-mode:${p.dark ? 'screen' : 'multiply'}"`);
    } else if (mode === 'outline') {
      s += glyph(lx, baseline, 'none', `stroke="${c1}" stroke-width="${n(3.5 * u)}"`);
    } else {
      s += glyph(lx, baseline, c1);
    }
    const ruleY = baseline + m * 0.5;
    s += rect(m, ruleY, W - m * 2, 1.2 * u, p.ink);

    const a = authorFit(c, { maxSize: S * 0.044 });
    const aY = H - m * 1.2 - a.height;
    const tTop = ruleY + m * 0.75;
    const tfont = rng.pick([FONTS.serif, FONTS.sans, FONTS.garamond]);
    const t = titleBlock(c, {
      font: tfont,
      weight: tfont === FONTS.sans ? 700 : 400,
      maxWidth: W - m * 2,
      maxHeight: aY - m * 0.7 - tTop,
      maxSize: S * 0.11,
      lineHeight: 1.06,
      maxLines: 4,
    });
    s += t.draw({ x: m, y: tTop, fill: p.ink });
    s += drawText(a, { x: m, y: aY, fill: p.ink, opacity: 0.9 });
    return s;
  },
};

export const bigtype = {
  id: 'bigtype',
  name: 'Big Type',
  group: 'Typographic',
  description: 'The title set enormous, edge to edge, in one flat colour.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const flat = rng.bool(0.5);
    const bg = flat ? rng.pick(strongAccents(p, p.bg, 1.2)) : p.bg;
    const ink = inkOn(bg, p);
    // The lead line and one stacked line take this colour: keep it at 3:1 or more.
    const soft = mix(ink, bg, 0.3);
    const accent = rng.pick(
      strongAccents(p, bg, 3)
        .filter((col) => col !== ink && contrast(col, bg) >= 3)
        .concat(contrast(soft, bg) >= 3 ? [soft] : [ink]),
    );
    const font = rng.pick([FONTS.display, FONTS.condensed, FONTS.sans]);
    const weight = font === FONTS.display ? 400 : 800;
    const edge = m * 0.55;

    let s = rect(0, 0, W, H, bg);
    const a = authorFit(c, {
      font: FONTS.sans,
      weight: 700,
      letterSpacing: 0.06,
      maxSize: S * 0.052,
      maxWidth: W - edge * 2,
    });
    const aY = H - m - a.height;
    const t = titleBlock(c, {
      font,
      weight,
      upper: true,
      stack: true,
      letterSpacing: font === FONTS.sans ? -0.02 : 0,
      maxWidth: W - edge * 2,
      maxHeight: aY - m * 0.8 - edge * 1.5,
      maxSize: S * 0.62,
      lineHeight: 0.92,
      maxLines: 6,
      subtitleFont: FONTS.sans,
      subtitleItalic: false,
    });
    const ty = rng.bool(0.5) ? edge * 1.5 : aY - m * 0.8 - t.height;
    // In a stack, one line (first or last) picks up the accent.
    const hi = rng.bool() ? 0 : t.lines - 1;
    const lineFills = t.stacked
      ? Array.from({ length: t.lines }, (_, i) => (i === hi ? accent : undefined))
      : undefined;
    s += t.draw({ x: edge, y: ty, fill: ink, leadFill: accent, lineFills });
    s += rect(edge, aY - m * 0.45, S * 0.12, 4 * u, accent);
    s += drawText(a, { x: edge, y: aY, fill: ink });
    return s;
  },
};

export const swiss = {
  id: 'swiss',
  name: 'Swiss',
  group: 'Typographic',
  description: 'International-style grid: colour block, circle and tight sans.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const [blockColor, circleColor] = rng.shuffle([...p.accents, p.ink]);
    const blockH = H * rng.float(0.52, 0.62);
    const r = Math.min(S * rng.float(0.2, 0.3), blockH * 0.36);
    const cx = W * rng.float(0.58, 0.8);

    let s = rect(0, 0, W, H, p.bg) + rect(0, 0, W, blockH, blockColor);
    s += circle(cx, blockH, r, circleColor === blockColor ? p.bg : circleColor);

    const t = titleBlock(c, {
      font: FONTS.sans,
      weight: 700,
      stack: rng.bool(0.5),
      letterSpacing: -0.02,
      maxWidth: W - m * 2,
      maxHeight: blockH - r - m * 2.2,
      maxSize: S * 0.24,
      lineHeight: 0.98,
      maxLines: 6,
      subtitleFont: FONTS.sans,
      subtitleItalic: false,
    });
    s += t.draw({ x: m, y: m * 1.15, fill: inkOn(blockColor, p) });

    const ruleY = H - m * 2.6;
    s += rect(m, ruleY, W - m * 2, 2 * u, p.ink);
    const a = authorFit(c, { upper: false, letterSpacing: 0, weight: 700, maxWidth: W * 0.62, maxSize: S * 0.052 });
    s += drawText(a, { x: m, y: ruleY + m * 0.55, fill: p.ink });
    const no = fitText(`No. ${rng.int(1, 99)}`, { font: FONTS.sans, maxWidth: W * 0.2, maxSize: S * 0.032 });
    s += drawText(no, { x: W - m, y: ruleY + m * 0.55, anchor: 'end', fill: p.ink, opacity: 0.7 });
    return s;
  },
};
