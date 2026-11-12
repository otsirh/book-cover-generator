// Text measurement, fitting (wrap + shrink-to-fit) and rendering.
//
// Only system font stacks are used so that covers render identically when the
// SVG is rasterised through <img>/<canvas> (which cannot load web fonts).

import { escapeXml, n } from './core.js';

export const FONTS = {
  serif: { family: "Georgia, 'Times New Roman', Times, serif", widthFactor: 1.1, cap: 0.7 },
  didone: { family: "Didot, 'Bodoni 72', 'Bodoni MT', Georgia, serif", widthFactor: 1.04, cap: 0.68 },
  garamond: {
    family: "Garamond, 'EB Garamond', 'Hoefler Text', Baskerville, 'Palatino Linotype', Palatino, Georgia, serif",
    widthFactor: 0.98,
    cap: 0.66,
  },
  sans: { family: "'Helvetica Neue', Helvetica, Arial, sans-serif", widthFactor: 1.0, cap: 0.72 },
  geometric: {
    family: "Futura, 'Century Gothic', 'Avenir Next', Avenir, 'Trebuchet MS', sans-serif",
    widthFactor: 1.06,
    cap: 0.72,
  },
  humanist: {
    family: "'Gill Sans', 'Gill Sans MT', Seravek, Calibri, 'Trebuchet MS', sans-serif",
    widthFactor: 0.96,
    cap: 0.69,
  },
  condensed: {
    family: "'Avenir Next Condensed', 'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', sans-serif",
    widthFactor: 0.84,
    cap: 0.7,
  },
  display: {
    family: "Impact, Haettenschweiler, 'Arial Narrow Bold', 'Franklin Gothic Bold', sans-serif",
    widthFactor: 0.82,
    cap: 0.79,
  },
  mono: { family: "'Courier New', Courier, monospace", mono: true, widthFactor: 1, cap: 0.6 },
};

/* ------------------------------------------------------------- measurement */

/** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined} */
let ctx2d;
function canvasContext() {
  if (ctx2d !== undefined) return ctx2d;
  ctx2d = null;
  // Prefer OffscreenCanvas, but fall back to a DOM canvas if it is missing or has no 2D context.
  try {
    if (typeof OffscreenCanvas !== 'undefined') ctx2d = new OffscreenCanvas(8, 8).getContext('2d');
  } catch {
    ctx2d = null;
  }
  if (!ctx2d) {
    try {
      if (typeof document !== 'undefined') ctx2d = document.createElement('canvas').getContext('2d');
    } catch {
      ctx2d = null;
    }
  }
  return ctx2d;
}

/** @type {((text: string, size: number, font: { family: string, weight: number, italic: boolean }) => number) | null} */
let customMeasure = null;
/**
 * Override text measurement. `fn(text, sizePx, { family, weight, italic })` must
 * return the advance width in px. Pass `null` to restore the default.
 */
export function setTextMeasurer(fn) {
  customMeasure = fn;
}

const NARROW = new Set("iljI.,:;!|'’`ı".split(''));
const SEMI = new Set('frt()[]-/"“”'.split(''));
const WIDE = new Set('mwMW@%&'.split(''));
// Glyphs that are about 1em wide in any font: CJK, kana, Hangul, full-width forms, emoji.
const FULL_WIDTH =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u;

/** @param {string} ch */
function latinWidth(ch) {
  if (ch === ' ' || NARROW.has(ch)) return 0.28;
  if (SEMI.has(ch)) return 0.38;
  if (WIDE.has(ch)) return 0.88;
  if (ch >= '0' && ch <= '9') return 0.56;
  if (ch !== ch.toLowerCase()) return 0.7;
  return 0.54;
}

/**
 * Rough widths (in em) for environments without a canvas, e.g. Node.
 * @param {string} text
 * @param {{ font: { mono?: boolean, widthFactor?: number }, weight?: number }} spec
 */
function heuristicWidth(text, spec) {
  const factor = (spec.font.widthFactor || 1) * ((spec.weight || 400) >= 600 ? 1.07 : 1);
  let w = 0;
  for (const g of graphemes(text)) {
    if (FULL_WIDTH.test(g)) w += 1;
    else if (spec.font.mono) w += 0.6;
    else w += latinWidth(g[0]) * factor;
  }
  return w;
}

/** @type {Map<string, number>} */
const widthCache = new Map();
let lastFont = '';
const REFERENCE = 100;

/** Width in px of `text` rendered at `size` px with the given font spec. */
export function measureText(text, size, spec) {
  let w;
  const weight = spec.weight || 400;
  if (customMeasure) {
    w = customMeasure(text, size, { family: spec.font.family, weight, italic: !!spec.italic });
  } else {
    const c = canvasContext();
    if (c) {
      // Measure once at a reference size and scale: text width is linear in font size,
      // so shrinking a title to fit costs no extra canvas work.
      const font = `${spec.italic ? 'italic ' : ''}${weight} ${REFERENCE}px ${spec.font.family}`;
      const key = `${font}\u0000${text}`;
      let ref = widthCache.get(key);
      if (ref === undefined) {
        if (font !== lastFont) {
          c.font = font;
          lastFont = font;
        }
        const measured = c.measureText(text).width;
        if (widthCache.size > 20000) widthCache.clear();
        widthCache.set(key, measured);
        ref = measured;
      }
      w = (ref * size) / REFERENCE;
    } else {
      w = heuristicWidth(text, spec) * size;
    }
  }
  return w + (spec.letterSpacing || 0) * size * [...text].length;
}

let segmenter;
/** Split a string into user-perceived characters (grapheme clusters). */
export function graphemes(str) {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
  }
  return segmenter ? Array.from(segmenter.segment(str), (s) => s.segment) : [...str];
}

/* ----------------------------------------------------------------- fitting */

/** @typedef {{ text: string, space: boolean }} Token  A wrap unit; `space` means a space comes before it. */

// Scripts written without spaces between words: lines may break between their words.
const NO_SPACE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Extended_Pictographic}]/u;
// Never start a line with closing punctuation, or end one with opening punctuation.
const NO_BREAK_BEFORE = /^[)\]}»›’”、。，．・：；！？‼⁇⁈⁉ーゝゞヽヾ々〉》」』】〕〗〙〛）］｝｠｡｣､･]/u;
const NO_BREAK_AFTER = /[([{«‹‘“〈《「『【〔〖〘〚（［｛｟｢]$/u;

/** @type {Intl.Segmenter | null | undefined} */
let wordSegmenter;

/**
 * Split text into wrap units. Lines break at spaces, and between words of
 * scripts that don't use spaces (Chinese, Japanese, Thai…).
 * @param {string} str
 * @returns {Token[]}
 */
function tokenize(str) {
  if (wordSegmenter === undefined) {
    wordSegmenter =
      typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'word' }) : null;
  }
  if (!wordSegmenter) return str.split(' ').map((text, i) => ({ text, space: i > 0 }));
  /** @type {Token[]} */
  const tokens = [];
  let space = false;
  for (const { segment } of wordSegmenter.segment(str)) {
    if (segment.trim() === '') {
      space = tokens.length > 0;
      continue;
    }
    const prev = tokens.at(-1);
    const breakable =
      prev &&
      (space ||
        ((NO_SPACE.test(segment) || NO_SPACE.test(prev.text.slice(-2))) &&
          !NO_BREAK_BEFORE.test(segment) &&
          !NO_BREAK_AFTER.test(prev.text)));
    if (!prev || breakable) tokens.push({ text: segment, space });
    else prev.text += segment;
    space = false;
  }
  return tokens;
}

/** @param {string} line @param {Token} token */
const append = (line, token) => (line ? line + (token.space ? ' ' : '') + token.text : token.text);

/**
 * @param {Token[]} tokens
 * @param {number} maxWidth
 * @param {(s: string) => number} measure
 * @param {number} [maxLines]
 */
function wrapGreedy(tokens, maxWidth, measure, maxLines = Infinity) {
  /** @type {string[]} */
  const lines = [];
  let cur = '';
  for (const token of tokens) {
    if (measure(token.text) > maxWidth) return null;
    const cand = append(cur, token);
    if (!cur || measure(cand) <= maxWidth) cur = cand;
    else {
      lines.push(cur);
      cur = token.text;
      // Already too many lines: the caller will shrink and retry, so stop early.
      if (lines.length > maxLines) return lines;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Re-wrap at the narrowest width that keeps the same line count (even rag).
 * @param {Token[]} tokens
 * @param {number} count
 * @param {number} maxWidth
 * @param {(s: string) => number} measure
 */
function balance(tokens, count, maxWidth, measure) {
  let lo = Math.max(...tokens.map((t) => measure(t.text)));
  let hi = maxWidth;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const lines = wrapGreedy(tokens, mid, measure);
    if (lines && lines.length <= count) hi = mid;
    else lo = mid;
  }
  return /** @type {string[]} */ (wrapGreedy(tokens, hi, measure));
}

/**
 * Break units that are wider than the box between visible characters.
 * @param {Token[]} tokens
 * @param {number} maxWidth
 * @param {(s: string) => number} measure
 */
function hardWrap(tokens, maxWidth, measure) {
  /** @type {Token[]} */
  const pieces = [];
  for (const token of tokens) {
    if (measure(token.text) <= maxWidth) {
      pieces.push(token);
      continue;
    }
    let cur = '';
    let space = token.space;
    for (const g of graphemes(token.text)) {
      if (cur && measure(cur + g) > maxWidth) {
        pieces.push({ text: cur, space });
        space = false;
        cur = g;
      } else cur += g;
    }
    if (cur) pieces.push({ text: cur, space });
  }
  return wrapGreedy(pieces, maxWidth, measure) ?? pieces.map((piece) => piece.text);
}

const blockHeight = (count, size, lineHeight, cap) => (count ? size * (cap + (count - 1) * lineHeight) : 0);

/**
 * Wrap and shrink `text` until it fits the box.
 *
 * Returns a "fit" object: { lines, size, width, height, ... } where `height`
 * spans from the cap-height of the first line to the baseline of the last.
 */
export function fitText(text, opts) {
  const font = opts.font || FONTS.sans;
  const spec = {
    font,
    weight: opts.weight ?? 400,
    italic: !!opts.italic,
    letterSpacing: opts.letterSpacing || 0,
  };
  const lineHeight = opts.lineHeight ?? 1.15;
  const cap = font.cap ?? 0.72;
  const maxLines = opts.maxLines ?? 5;
  const maxWidth = Math.max(1, opts.maxWidth);
  const maxHeight = opts.maxHeight ?? Infinity;
  const maxSize = opts.maxSize;
  if (!Number.isFinite(maxSize) || maxSize <= 0)
    throw new TypeError('fitText: `maxSize` must be a positive number of pixels');
  const minSize = Math.min(maxSize, opts.minSize ?? Math.max(6, maxSize * 0.22));

  let str = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (opts.upper) str = str.toUpperCase();
  const base = { ...spec, lineHeight, cap };
  if (!str) return { ...base, lines: [], size: 0, width: 0, height: 0, truncated: false };

  const tokens = tokenize(str);
  const finish = (lines, size, truncated = false) => {
    const measure = (s) => measureText(s, size, spec);
    return {
      ...base,
      lines,
      size,
      width: Math.max(...lines.map(measure)),
      height: blockHeight(lines.length, size, lineHeight, cap),
      truncated,
    };
  };

  let size = maxSize;
  for (let guard = 0; guard < 120; guard++) {
    const measure = (s) => measureText(s, size, spec);
    let lines = wrapGreedy(tokens, maxWidth, measure, maxLines);
    if (lines && lines.length <= maxLines && blockHeight(lines.length, size, lineHeight, cap) <= maxHeight) {
      if (opts.balance !== false && lines.length > 1) lines = balance(tokens, lines.length, maxWidth, measure);
      return finish(lines, size);
    }
    if (size <= minSize) break;
    size = Math.max(minSize, size * 0.95);
  }

  // Fallback: smallest size, break long words, truncate with an ellipsis.
  size = minSize;
  const measure = (s) => measureText(s, size, spec);
  let lines = hardWrap(tokens, maxWidth, measure);
  const fitCount = Math.max(1, Math.min(maxLines, Math.floor((maxHeight / size - cap) / lineHeight) + 1));
  if (lines.length <= fitCount) return finish(lines, size);
  lines = lines.slice(0, fitCount);
  const chars = graphemes(lines[fitCount - 1]);
  while (chars.length > 1 && measure(chars.join('') + '…') > maxWidth) chars.pop();
  lines[fitCount - 1] = chars.join('').trimEnd() + '…';
  return finish(lines, size, true);
}

/**
 * Attributes shared by every line of a text block, for its wrapping `<g>`.
 * Colours and font names are escaped; `attrs` is raw SVG.
 * @param {{ font: import('./text.js').FontSpec, fill: string, size?: number, weight?: number, italic?: boolean, letterSpacing?: number, anchor?: 'start' | 'middle' | 'end', opacity?: number, attrs?: string }} o
 */
export function textGroupAttrs({ font, fill, size, weight, italic, letterSpacing, anchor = 'start', opacity, attrs }) {
  let a = `font-family="${escapeXml(font.family)}"`;
  if (size) a += ` font-size="${n(size)}"`;
  a += ` fill="${escapeXml(fill)}"`;
  if (weight && weight !== 400) a += ` font-weight="${weight}"`;
  if (italic) a += ' font-style="italic"';
  if (letterSpacing) a += ` letter-spacing="${n(letterSpacing)}"`;
  if (anchor !== 'start') a += ` text-anchor="${anchor}"`;
  if (opacity != null && opacity !== 1) a += ` opacity="${opacity}"`;
  if (attrs) a += ' ' + attrs;
  return a;
}

/**
 * Trailing letter-spacing shifts centred and right-aligned text; this is the x offset that compensates.
 * @param {'start' | 'middle' | 'end'} anchor @param {number} spacing letter spacing in px
 */
export const spacingShift = (anchor, spacing) => (anchor === 'middle' ? spacing / 2 : anchor === 'end' ? spacing : 0);

/**
 * Render a fit as SVG <text> elements.
 * `y` is the top of the block (cap height of the first line).
 * @param {import('./text.js').TextFit} fit
 * @param {import('./text.js').DrawOptions} opts
 */
export function drawText(fit, { x, y, anchor = 'start', fill = '#000', opacity, attrs = '' }) {
  if (!fit.lines.length) return '';
  const { size, font, weight, italic, letterSpacing, lineHeight, cap } = fit;
  const ls = letterSpacing * size;
  const dx = spacingShift(anchor, ls);
  const a = textGroupAttrs({ font, size, weight, italic, letterSpacing: ls, fill, anchor, opacity, attrs });
  const rows = fit.lines
    .map((ln, i) => `<text x="${n(x + dx)}" y="${n(y + size * cap + i * size * lineHeight)}">${escapeXml(ln)}</text>`)
    .join('');
  return `<g ${a}>${rows}</g>`;
}

/** Visual bottom of a fit placed at `y`, including descenders. */
export const textBottom = (fit, y) => (fit.lines.length ? y + fit.height + fit.size * 0.22 : y);
