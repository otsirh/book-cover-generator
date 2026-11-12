// Shared cover typography: title blocks and author lines.
//
// A title block is an optional small leading article ("THE"), the title itself
// (wrapped and shrunk to fit, or a justified stack where every line spans the
// full width) and an optional subtitle. Sizes are based on the short side of
// the cover (c.S), so they work at any size and shape.

import { n, clamp, escapeXml } from './core.js';
import { FONTS, fitText, drawText, measureText, textBottom, textGroupAttrs, spacingShift } from './text.js';

const LEAD = /^(the|a|an) +(\S.*)$/i;

/**
 * Split a leading English article off a title: "The Lighthouse Keeper" →
 * { lead: 'The', main: 'Lighthouse Keeper' }.
 * @param {string} title
 */
export function splitLead(title) {
  const m = LEAD.exec(title.trim());
  return m ? { lead: m[1], main: m[2] } : { lead: '', main: title.trim() };
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', '&', '+']);

/**
 * Words grouped into stack lines: small words join the word after them.
 * @param {string} text
 */
export function stackLines(text) {
  /** @type {string[]} */
  const lines = [];
  let pending = '';
  // Split at spaces only: words joined by a no-break space stay on one line.
  for (const word of text.split(' ').filter(Boolean)) {
    if (SMALL_WORDS.has(word.toLowerCase())) pending += `${word} `;
    else {
      lines.push(pending + word);
      pending = '';
    }
  }
  if (pending) {
    if (lines.length) lines[lines.length - 1] += ` ${pending.trim()}`;
    else lines.push(pending.trim());
  }
  return lines;
}

/**
 * @typedef {object} StackFit
 * @property {'stack'} kind
 * @property {{ text: string, size: number, descent: number }[]} lines  descent is a fraction of the line's size
 * @property {number} height  cap height of the first line to the last baseline
 * @property {number} descent room needed below the last baseline, in px
 * @property {number} width
 * @property {number} size    the largest line size
 * @property {import('./text.js').FontSpec} font
 * @property {number} weight
 * @property {boolean} italic
 * @property {number} letterSpacing
 * @property {number} gap     space between lines, as a fraction of the lower line's size
 * @property {number} cap
 */

/**
 * Justified stack: every line is sized to fill `maxWidth`, then the whole stack
 * is scaled down to fit `maxHeight`. Returns null when the text doesn't suit a
 * stack (one line, more than `maxLines`, or lines that would be too small).
 * @param {string} text
 * @param {import('./text.js').FitOptions & { gap?: number }} o
 * @returns {StackFit | null}
 */
export function fitStack(text, o) {
  if (!Number.isFinite(o.maxSize) || o.maxSize <= 0)
    throw new TypeError('fitStack: `maxSize` must be a positive number of pixels');
  const font = o.font ?? FONTS.sans;
  const spec = { font, weight: o.weight ?? 700, italic: !!o.italic, letterSpacing: o.letterSpacing ?? 0 };
  const source = o.upper ? text.toUpperCase() : text;
  const lines = stackLines(source);
  if (lines.length < 2 || lines.length > (o.maxLines ?? 5)) return null;
  const cap = font.cap ?? 0.72;
  const gap = o.gap ?? 0.16;
  // Room below each line for descenders (none needed for capitals).
  const desc = lines.map((line) => (/[gjpqyQ,;()]/.test(line) ? 0.22 : 0.04));
  let sizes = lines.map((line) => Math.min(o.maxSize, o.maxWidth / (measureText(line, 100, spec) / 100)));
  const heightOf = (/** @type {number[]} */ sz) =>
    sz.reduce((h, size, i) => h + size * cap + (i ? size * gap + sz[i - 1] * desc[i - 1] : 0), 0);
  const maxHeight = o.maxHeight ?? Infinity;
  const h = heightOf(sizes) + sizes[sizes.length - 1] * desc[desc.length - 1];
  if (h > maxHeight) sizes = sizes.map((size) => (size * maxHeight) / h);
  const minSize = o.minSize ?? o.maxSize * 0.22;
  if (Math.min(...sizes) < minSize) return null;
  // Very uneven stacks (a two-letter word next to a long one) look accidental.
  if (Math.max(...sizes) / Math.min(...sizes) > 3.2) return null;
  return {
    kind: 'stack',
    lines: lines.map((line, i) => ({ text: line, size: sizes[i], descent: desc[i] })),
    height: heightOf(sizes),
    descent: sizes[sizes.length - 1] * desc[desc.length - 1],
    width: Math.max(...lines.map((line, i) => measureText(line, sizes[i], spec))),
    size: Math.max(...sizes),
    ...spec,
    gap,
    cap,
  };
}

/**
 * @param {StackFit} fit
 * @param {import('./text.js').DrawOptions & { lineFills?: (string | undefined)[] }} o
 */
export function drawStack(fit, { x, y, anchor = 'start', fill = '#000', opacity, attrs = '', lineFills = [] }) {
  const a = textGroupAttrs({ font: fit.font, weight: fit.weight, italic: fit.italic, fill, anchor, opacity, attrs });
  let baseline = y;
  const rows = fit.lines.map(({ text, size }, i) => {
    const prev = fit.lines[i - 1];
    baseline += size * fit.cap + (prev ? size * fit.gap + prev.size * prev.descent : 0);
    const ls = fit.letterSpacing * size;
    const spacing = ls ? ` letter-spacing="${n(ls)}"` : '';
    const color = lineFills[i] ? ` fill="${escapeXml(lineFills[i] ?? '')}"` : '';
    return `<text x="${n(x + spacingShift(anchor, ls))}" y="${n(baseline)}" font-size="${n(size)}"${spacing}${color}>${escapeXml(text)}</text>`;
  });
  return `<g ${a}>${rows.join('')}</g>`;
}

/**
 * @typedef {object} TitleBlockOptions
 * @property {number} maxWidth
 * @property {number} maxHeight
 * @property {number} maxSize            largest title size in px
 * @property {number} [minSize]
 * @property {import('./text.js').FontSpec} [font]
 * @property {number} [weight]
 * @property {boolean} [italic]
 * @property {boolean} [upper]
 * @property {number} [letterSpacing]
 * @property {number} [lineHeight]
 * @property {number} [maxLines]
 * @property {boolean} [lead]            set "The"/"A"/"An" as a small line above (default true)
 * @property {boolean} [stack]           try a justified stack first
 * @property {boolean} [subtitle]        include the subtitle (default true)
 * @property {import('./text.js').FontSpec} [subtitleFont]
 * @property {boolean} [subtitleItalic]
 * @property {boolean} [subtitleUpper]
 * @property {number} [subtitleSize]
 * @property {string} [text]             override the title text
 */

/**
 * @typedef {object} TitleBlock
 * @property {number} height   cap height of the first line to the bottom of the block
 * @property {number} width
 * @property {number} size     main title size (largest line for stacks)
 * @property {boolean} stacked  whether the title came out as a justified stack
 * @property {number} lines    number of title lines (excluding the lead and subtitle)
 * @property {boolean} truncated  the title was cut with an ellipsis because it didn't fit
 * @property {(o: { x: number, y: number, anchor?: 'start' | 'middle' | 'end', fill: string, leadFill?: string, subtitleFill?: string, attrs?: string, lineFills?: (string | undefined)[] }) => string} draw
 */

/** Subtitle fits per cover: fitTitleWith lays the title out several ways with the same subtitle. */
/** @type {WeakMap<object, Map<string, import('./text.js').TextFit>>} */
const subtitleFits = new WeakMap();

/**
 * @param {import('./index.js').StyleContext} c @param {string} text
 * @param {import('./text.js').FitOptions} opts
 */
function fitSubtitle(c, text, opts) {
  let fits = subtitleFits.get(c);
  if (!fits) subtitleFits.set(c, (fits = new Map()));
  const key = JSON.stringify([text, opts]);
  let fit = fits.get(key);
  if (!fit) fits.set(key, (fit = fitText(text, opts)));
  return fit;
}

/**
 * Fit the title (and subtitle) into a box.
 * @param {import('./index.js').StyleContext} c
 * @param {TitleBlockOptions} o
 * @returns {TitleBlock}
 */
export function titleBlock(c, o) {
  const font = o.font ?? FONTS.serif;
  const weight = o.weight ?? 400;
  const { lead, main } =
    o.lead === false ? { lead: '', main: (o.text ?? c.title).trim() } : splitLead(o.text ?? c.title);
  const subtitle = o.subtitle === false ? '' : c.subtitle;

  const sub = subtitle
    ? fitSubtitle(c, subtitle, {
        font: o.subtitleFont ?? font,
        italic: o.subtitleItalic ?? (o.subtitleFont ?? font) !== FONTS.mono,
        upper: !!o.subtitleUpper,
        letterSpacing: o.subtitleUpper ? 0.12 : 0,
        weight: 400,
        maxWidth: o.maxWidth,
        maxHeight: c.S * 0.1,
        maxSize: o.subtitleSize ?? c.S * 0.036,
        maxLines: 2,
        lineHeight: 1.25,
      })
    : null;
  // fitText's own default: a title forced below this didn't really fit.
  const minMain = Math.min(o.maxSize, o.minSize ?? Math.max(6, o.maxSize * 0.22));

  /** @type {import('./text.js').FitOptions} */
  const mainOpts = {
    font,
    weight,
    italic: !!o.italic,
    upper: !!o.upper,
    letterSpacing: o.letterSpacing ?? 0,
    lineHeight: o.lineHeight ?? 1.05,
    maxWidth: o.maxWidth,
    maxSize: o.maxSize,
    minSize: o.minSize,
    maxLines: o.maxLines ?? 5,
  };

  /** Visual bottom of a main-title fit, including descenders. @param {import('./text.js').TextFit | StackFit} f */
  const bottomOf = (f) => ('kind' in f ? f.height + f.descent : textBottom(f, 0));
  /** Fit the main title so its visual bottom stays inside `avail`. @param {string} text @param {number} avail */
  const fitMain = (text, avail) =>
    (o.stack && fitStack(text, { ...mainOpts, maxHeight: avail })) ||
    fitText(text, { ...mainOpts, maxHeight: avail, descent: true });

  /** Lay out with or without the lead line and subtitle. @param {boolean} useLead @param {boolean} useSub */
  const layout = (useLead, useSub) => {
    const text = useLead ? main : (o.text ?? c.title).trim();
    const leadText = useLead ? lead : '';
    const subFit = useSub ? sub : null;
    const subGapL = subFit?.lines.length ? subFit.size * 0.9 : 0;
    const subHL = subFit?.lines.length ? subGapL + textBottom(subFit, 0) : 0;
    /** @type {import('./text.js').TextFit | null} */
    let leadFitL = null;
    let leadGapL = 0;
    let reserve = leadText ? o.maxSize * 0.3 : 0;
    let f = fitMain(text, Math.max(1, o.maxHeight - subHL - reserve));
    for (let pass = 0; leadText && pass < 3; pass++) {
      const leadSize = clamp(f.size * 0.3, c.S * 0.026, c.S * 0.07);
      leadFitL = fitText(leadText, {
        font,
        weight,
        upper: true,
        letterSpacing: 0.28,
        maxWidth: o.maxWidth,
        maxSize: leadSize,
      });
      leadGapL = leadFitL.size * 0.9;
      const needed = leadFitL.height + leadGapL;
      if (needed <= reserve + 0.5) break;
      reserve = needed;
      f = fitMain(text, Math.max(1, o.maxHeight - subHL - reserve));
    }
    const leadHL = leadFitL ? leadFitL.height + leadGapL : 0;
    return {
      fit: f,
      leadFit: leadFitL,
      leadH: leadHL,
      sub: subFit,
      subGap: subGapL,
      height: leadHL + bottomOf(f) + subHL,
    };
  };

  /** @param {ReturnType<typeof layout>} l */
  const truncatedIn = (l) => !('kind' in l.fit) && l.fit.truncated;
  /** Fits the height, the title is whole and at least as large as its minimum, its lead and its subtitle. @param {ReturnType<typeof layout>} l */
  const fits = (l) =>
    l.height <= o.maxHeight + 0.5 &&
    !truncatedIn(l) &&
    l.fit.size >= minMain * 0.999 &&
    l.fit.size >= Math.max(l.sub?.size ?? 0, l.leadFit?.size ?? 0);
  /** Of two layouts that don't fit, whether `a` is better: inside the height, then a larger title, then whole. @param {ReturnType<typeof layout>} a @param {ReturnType<typeof layout>} b */
  const better = (a, b) => {
    const inA = a.height <= o.maxHeight + 0.5;
    const inB = b.height <= o.maxHeight + 0.5;
    if (inA !== inB) return inA;
    if (Math.abs(a.fit.size - b.fit.size) > 0.01) return a.fit.size > b.fit.size;
    return truncatedIn(b) && !truncatedIn(a);
  };

  // Shrink first; if the title still doesn't fit, fold the lead back into it, then drop the subtitle.
  const hasLead = Boolean(lead);
  const hasSub = Boolean(sub?.lines.length);
  /** @type {[boolean, boolean][]} */
  const tries = [[hasLead, hasSub]];
  if (hasLead) tries.push([false, hasSub]);
  if (hasSub) tries.push([hasLead, false]);
  if (hasLead && hasSub) tries.push([false, false]);
  let L = layout(...tries[0]);
  let best = L;
  for (let i = 1; i < tries.length && !fits(L); i++) {
    L = layout(...tries[i]);
    if (better(L, best)) best = L;
  }
  if (!fits(L)) L = best;
  const { fit, leadFit, leadH } = L;
  const mainBottom = bottomOf(fit);
  const width = Math.max(fit.width, leadFit?.width ?? 0, L.sub?.width ?? 0);

  return {
    height: L.height,
    width,
    size: fit.size,
    stacked: 'kind' in fit,
    lines: fit.lines.length,
    truncated: truncatedIn(L),
    draw({ x, y, anchor = 'start', fill, leadFill, subtitleFill, attrs, lineFills }) {
      let s = '';
      if (leadFit) s += drawText(leadFit, { x, y, anchor, fill: leadFill ?? fill, attrs });
      const my = y + leadH;
      s +=
        'kind' in fit
          ? drawStack(fit, { x, y: my, anchor, fill, attrs, lineFills })
          : drawText(fit, { x, y: my, anchor, fill, attrs });
      if (L.sub?.lines.length) {
        s += drawText(L.sub, {
          x,
          y: my + mainBottom + L.subGap,
          anchor,
          fill: subtitleFill ?? fill,
          opacity: 0.85,
          attrs,
        });
      }
      return s;
    },
  };
}

/**
 * The author's name, sized to be readable at thumbnail size.
 * @param {import('./index.js').StyleContext} c
 * @param {Partial<import('./text.js').FitOptions>} [o]
 */
export function authorFit(c, o = {}) {
  return fitText(c.author, {
    font: FONTS.sans,
    weight: 600,
    upper: true,
    letterSpacing: 0.1,
    maxWidth: c.W - c.m * 2,
    maxHeight: c.S * 0.13,
    maxSize: c.S * 0.048,
    maxLines: 2,
    lineHeight: 1.15,
    ...o,
  });
}
