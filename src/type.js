// Shared cover typography: title blocks and author lines.
//
// A title block is an optional small leading article ("THE"), the title itself
// (wrapped and shrunk to fit, or a justified stack where every line spans the
// full width) and an optional subtitle. Sizes are based on the short side of
// the cover (c.S), so they work at any size and shape.

import { n, clamp, escapeXml } from './core.js';
import {
  FONTS,
  typedLines,
  fitText,
  drawText,
  measureText,
  textBottom,
  textGroupAttrs,
  spacingShift,
  defaultMinSize,
  checkBox,
  checkSizes,
  graphemes,
  trackingFor,
  descentOf,
  markExtent,
} from './text.js';

// Leading articles (English, French, Spanish, Italian, German). "Die" is left out: "Die Hard".
// (After the article, spaces or a typed line break; the rest may run over several typed lines.)
const LEAD = /^(the|an|a|les|los|las|der|das|une|un|eine|ein|el|la|le|il|lo)[ \n]+(\S[\s\S]*)$/i;

/**
 * Split a leading article off a title: "The Lighthouse Keeper" →
 * { lead: 'The', main: 'Lighthouse Keeper' }; also "Les", "La", "El", "Der"….
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
  // Lines the text asks for (a title typed on two lines) are the stack's lines, as typed.
  if (/\n/.test(text)) {
    return text
      .split('\n')
      .map((line) => line.split(' ').filter(Boolean).join(' '))
      .filter(Boolean);
  }
  /** @type {string[]} */
  const lines = [];
  let pending = '';
  // Split at spaces only: words joined by a no-break space stay on one line.
  for (const word of text.split(' ').filter(Boolean)) {
    // Short words (in any language: и, de, y, et, og…) join the word after them, so a
    // one- or two-letter word never stands alone as the stack's largest line.
    if (SMALL_WORDS.has(word.toLowerCase()) || graphemes(word).length <= 2) pending += `${word} `;
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
 * @property {{ text: string, size: number, descent: number, above: number }[]} lines  descent (below the baseline) and above (accents and marks above the cap height) are fractions of the line's size
 * @property {number} height  top of the first line (its cap height, or its accents) to the last baseline
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
  checkSizes('fitStack', o);
  checkBox('fitStack', o);
  const font = o.font ?? FONTS.sans;
  const spec = {
    font,
    weight: o.weight ?? 700,
    italic: !!o.italic,
    letterSpacing: trackingFor(text, o.letterSpacing ?? 0),
  };
  const source = o.upper ? text.toUpperCase() : text;
  const lines = stackLines(source);
  if (lines.length < 2 || lines.length > (o.maxLines ?? 5)) return null;
  const cap = font.cap ?? 0.72;
  const gap = o.gap ?? 0.16;
  const desc = lines.map(descentOf);
  const above = lines.map((line) => markExtent(line).above);
  let sizes = lines.map((line) => Math.min(o.maxSize, o.maxWidth / (measureText(line, 100, spec) / 100)));
  const heightOf = (/** @type {number[]} */ sz) =>
    sz.reduce((h, size, i) => h + size * (above[i] + cap) + (i ? size * gap + sz[i - 1] * desc[i - 1] : 0), 0);
  const maxHeight = o.maxHeight ?? Infinity;
  const h = heightOf(sizes) + sizes[sizes.length - 1] * desc[desc.length - 1];
  if (h > maxHeight) sizes = sizes.map((size) => (size * maxHeight) / h);
  // fitText's own floor, so a stack is never smaller than a wrapped title could be.
  const minSize = defaultMinSize(o.maxSize, o.minSize);
  if (Math.min(...sizes) < minSize) return null;
  // Very uneven stacks (a two-letter word next to a long one) look accidental.
  if (Math.max(...sizes) / Math.min(...sizes) > 3.2) return null;
  return {
    kind: 'stack',
    lines: lines.map((line, i) => ({ text: line, size: sizes[i], descent: desc[i], above: above[i] })),
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
  const rows = fit.lines.map(({ text, size, above = 0 }, i) => {
    const prev = fit.lines[i - 1];
    baseline += size * (above + fit.cap) + (prev ? size * fit.gap + prev.size * prev.descent : 0);
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
 * @property {false} [series]  false to leave out the cover's series line
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
 * @property {number} smallest the smallest title line's size (the same as `size` unless stacked)
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
  checkBox('titleBlock', o);
  if (!Number.isFinite(o.maxHeight)) throw new TypeError('titleBlock: `maxHeight` must be a number of pixels');
  // The cover's own title font and case (createCover's `font` and `titleCase`) win over the style's.
  const font = c.titleFont ?? o.font ?? FONTS.serif;
  const changedFont = Boolean(c.titleFont) && c.titleFont !== (o.font ?? FONTS.serif);
  // (A serif in another font's heavy weight looks smudged: at most bold.)
  const serif = font === FONTS.serif || font === FONTS.didone || font === FONTS.garamond;
  const weight = changedFont && serif ? Math.min(o.weight ?? 400, 700) : (o.weight ?? 400);
  const upper = c.titleCase ? c.titleCase === 'upper' : !!o.upper;
  // Spacing set for capitals is too wide for lower case, and capitals set solid need a little.
  const letterSpacing = upper === !!o.upper ? (o.letterSpacing ?? 0) : upper ? Math.max(o.letterSpacing ?? 0, 0.03) : 0;
  const whole = (o.text ?? c.title).trim();
  // A title typed on several lines is set on those lines: no lead line of its own, and room for all.
  const titleLines = typedLines(whole);
  const split = o.lead === false || titleLines > 1 ? { lead: '', main: whole } : splitLead(whole);
  // Only a lead of three letters or more gets its own small line: a lone "A" or "La" up there
  // reads as a stray mark, so short ones stay with the title.
  const { lead, main } = graphemes(split.lead).length >= 3 ? split : { lead: '', main: whole };
  const subtitle = o.subtitle === false ? '' : c.subtitle;
  // The series ("Book Two of the Ember Cycle"): a small line of capitals above everything else.
  const seriesFit =
    o.series === false || !c.series
      ? null
      : fitSubtitle(c, c.series, {
          font: o.subtitleFont ?? font,
          weight: Math.min(weight, 600),
          upper: true,
          letterSpacing: 0.16,
          maxWidth: o.maxWidth,
          maxSize: clamp(o.maxSize * 0.2, c.S * 0.022, c.S * 0.036),
          maxLines: 2,
          lineHeight: 1.25,
        });
  const seriesH = seriesFit?.lines.length ? seriesFit.height + seriesFit.size * 1.2 : 0;
  const maxHeight = o.maxHeight;

  const sub = subtitle
    ? fitSubtitle(c, subtitle, {
        font: o.subtitleFont ?? font,
        italic: o.subtitleItalic ?? (o.subtitleFont ?? font) !== FONTS.mono,
        upper: !!o.subtitleUpper,
        letterSpacing: o.subtitleUpper ? 0.12 : 0,
        weight: 400,
        maxWidth: o.maxWidth,
        // (A credit is a line of its own after the subtitle: room for it too.)
        maxHeight: c.S * 0.1 * (1 + (typedLines(subtitle) - 1) * 0.5),
        maxSize: o.subtitleSize ?? c.S * 0.036,
        maxLines: 1 + typedLines(subtitle),
        lineHeight: 1.25,
      })
    : null;
  // fitText's own default: a title forced below this didn't really fit.
  const minMain = defaultMinSize(o.maxSize, o.minSize);

  /** @type {import('./text.js').FitOptions} */
  const mainOpts = {
    font,
    weight,
    italic: !!o.italic,
    upper,
    letterSpacing,
    lineHeight: o.lineHeight ?? 1.05,
    maxWidth: o.maxWidth,
    maxSize: o.maxSize,
    minSize: o.minSize,
    maxLines: Math.max(o.maxLines ?? 5, titleLines),
  };

  /** Visual bottom of a main-title fit, including descenders. @param {import('./text.js').TextFit | StackFit} f */
  const bottomOf = (f) => ('kind' in f ? f.height + f.descent : textBottom(f, 0));
  /** Fit the main title so its visual bottom stays inside `avail`. @param {string} text @param {number} avail */
  const fitMain = (text, avail) => {
    // A short one-word title ("Dune") may grow past the style's usual cap, up to the box.
    const short = !/\s/.test(text) && graphemes(text).length <= 8;
    const maxSize = mainOpts.maxSize * (short ? 1.6 : 1);
    return (
      (o.stack && fitStack(text, { ...mainOpts, maxSize, maxHeight: avail })) ||
      // A long single word is hyphenated rather than shrunk below 7% of the short side.
      fitText(text, { ...mainOpts, maxSize, maxHeight: avail, descent: true, hyphenate: c.S * 0.07 })
    );
  };

  /**
   * Lay out with or without the lead line, the subtitle and the series line.
   * @param {boolean} useLead @param {boolean} useSub @param {boolean} useSeries
   */
  const layout = (useLead, useSub, useSeries) => {
    const text = useLead ? main : (o.text ?? c.title).trim();
    const leadText = useLead ? lead : '';
    const subFit = useSub ? sub : null;
    const kickerL = useSeries && seriesH ? seriesFit : null;
    const kickerHL = kickerL ? seriesH : 0;
    const subGapL = subFit?.lines.length ? subFit.size * 0.9 : 0;
    const subHL = subFit?.lines.length ? subGapL + textBottom(subFit, 0) : 0;
    /** @type {import('./text.js').TextFit | null} */
    let leadFitL = null;
    let leadGapL = 0;
    let reserve = leadText ? o.maxSize * 0.3 : 0;
    let f = fitMain(text, Math.max(1, maxHeight - kickerHL - subHL - reserve));
    /** The lead line for a title of `size`: its fit and the room it takes with its gap. @param {number} size */
    const leadFor = (size) => {
      const fit = fitText(leadText, {
        font,
        weight,
        upper: true,
        letterSpacing: 0.28,
        maxWidth: o.maxWidth,
        maxSize: clamp(size * 0.3, c.S * 0.026, c.S * 0.07),
      });
      return { fit, gap: fit.size * 0.9, needed: fit.height + fit.size * 0.9 };
    };
    for (let pass = 0; leadText && pass < 3; pass++) {
      const leadLine = leadFor(f.size);
      leadFitL = leadLine.fit;
      leadGapL = leadLine.gap;
      if (leadLine.needed <= reserve + 0.5) {
        // The first guess can be generous: give the title back what the lead doesn't need. A
        // bigger title has a bigger lead, so search for the smallest reserve that still holds it.
        let lo = leadLine.needed;
        let hi = reserve;
        for (let k = 0; k < 4 && hi - lo > 1; k++) {
          const mid = (lo + hi) / 2;
          const bigger = fitMain(text, Math.max(1, maxHeight - kickerHL - subHL - mid));
          const itsLead = leadFor(bigger.size);
          if (itsLead.needed <= mid + 0.5) {
            hi = mid;
            f = bigger;
            leadFitL = itsLead.fit;
            leadGapL = itsLead.gap;
          } else lo = mid;
        }
        break;
      }
      reserve = leadLine.needed;
      f = fitMain(text, Math.max(1, maxHeight - kickerHL - subHL - reserve));
    }
    const leadHL = leadFitL ? leadFitL.height + leadGapL : 0;
    return {
      fit: f,
      leadFit: leadFitL,
      leadH: leadHL,
      sub: subFit,
      subGap: subGapL,
      kicker: kickerL,
      kickerH: kickerHL,
      height: kickerHL + leadHL + bottomOf(f) + subHL,
    };
  };

  /** @param {ReturnType<typeof layout>} l */
  const truncatedIn = (l) => !('kind' in l.fit) && l.fit.truncated;
  /** The title's size, for a stack its smallest line. @param {ReturnType<typeof layout>} l */
  const titleSize = (l) => ('kind' in l.fit ? Math.min(...l.fit.lines.map((line) => line.size)) : l.fit.size);
  /** The title is at least as large as its subtitle, its lead and its series line. @param {ReturnType<typeof layout>} l */
  const inOrder = (l) => titleSize(l) >= Math.max(l.sub?.size ?? 0, l.leadFit?.size ?? 0, l.kicker?.size ?? 0);
  /** Fits the height, the title is whole, at its minimum or larger, and in order. @param {ReturnType<typeof layout>} l */
  const fits = (l) => l.height <= maxHeight + 0.5 && !truncatedIn(l) && titleSize(l) >= minMain * 0.999 && inOrder(l);
  /**
   * Of two layouts that don't fit, whether `a` is better: inside the height, then a title no
   * smaller than its subtitle and lead, then a larger title, then a whole one.
   * @param {ReturnType<typeof layout>} a @param {ReturnType<typeof layout>} b
   */
  const better = (a, b) => {
    const inA = a.height <= maxHeight + 0.5;
    const inB = b.height <= maxHeight + 0.5;
    if (inA !== inB) return inA;
    if (inOrder(a) !== inOrder(b)) return inOrder(a);
    if (Math.abs(titleSize(a) - titleSize(b)) > 0.01) return titleSize(a) > titleSize(b);
    return truncatedIn(b) && !truncatedIn(a);
  };

  // Shrink first; if the title still doesn't fit, fold the lead back into it, then drop the
  // subtitle, then the series line.
  const hasLead = Boolean(lead);
  const hasSub = Boolean(sub?.lines.length);
  const hasSeries = Boolean(seriesH);
  /** @type {[boolean, boolean, boolean][]} */
  const tries = [];
  for (const useSeries of hasSeries ? [true, false] : [false]) {
    tries.push([hasLead, hasSub, useSeries]);
    if (hasLead) tries.push([false, hasSub, useSeries]);
    if (hasSub) tries.push([hasLead, false, useSeries]);
    if (hasLead && hasSub) tries.push([false, false, useSeries]);
  }
  let L = layout(...tries[0]);
  let best = L;
  for (let i = 1; i < tries.length && !fits(L); i++) {
    L = layout(...tries[i]);
    if (better(L, best)) best = L;
  }
  if (!fits(L)) L = best;
  const { fit, leadFit, leadH, kicker, kickerH } = L;
  const mainBottom = bottomOf(fit);
  const width = Math.max(fit.width, leadFit?.width ?? 0, L.sub?.width ?? 0, kicker?.width ?? 0);

  return {
    height: L.height,
    width,
    size: fit.size,
    smallest: titleSize(L),
    stacked: 'kind' in fit,
    lines: fit.lines.length,
    truncated: truncatedIn(L),
    draw({ x, y: top, anchor = 'start', fill, leadFill, subtitleFill, attrs, lineFills }) {
      let s = '';
      if (kicker) s += drawText(kicker, { x, y: top, anchor, fill: leadFill ?? fill, opacity: 0.85, attrs });
      const y = top + kickerH;
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
  const opts = {
    font: FONTS.sans,
    weight: 600,
    upper: true,
    letterSpacing: 0.1,
    maxWidth: c.W - c.m * 2,
    maxHeight: c.S * 0.13,
    maxSize: c.S * 0.048,
    maxLines: 2,
    ...o,
  };
  // Tracked capitals need more room between lines when the name wraps.
  const tracked = opts.upper && (opts.letterSpacing ?? 0) > 0.05;
  const lineHeight = o.lineHeight ?? (tracked ? 1.35 : 1.15);
  // A name in a script without capitals (村上春樹) would be set at the small size meant for
  // tracked caps: a third larger, untracked.
  if (/\p{L}/u.test(c.author) && !/[\p{Lu}\p{Ll}]/u.test(c.author)) {
    return fitText(c.author, { ...opts, lineHeight, maxSize: opts.maxSize * 1.35, letterSpacing: 0 });
  }
  return fitText(c.author, { ...opts, lineHeight });
}
