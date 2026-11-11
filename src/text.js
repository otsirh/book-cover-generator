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

let ctx2d;
function canvasContext() {
  if (ctx2d !== undefined) return ctx2d;
  ctx2d = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined') ctx2d = new OffscreenCanvas(8, 8).getContext('2d');
    else if (typeof document !== 'undefined') ctx2d = document.createElement('canvas').getContext('2d');
  } catch {
    ctx2d = null;
  }
  return ctx2d;
}

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

/** Rough per-glyph widths (in em) for environments without a canvas, e.g. Node. */
function heuristicWidth(text, spec) {
  if (spec.font.mono) return text.length * 0.6;
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += 0.28;
    else if (NARROW.has(ch)) w += 0.28;
    else if (SEMI.has(ch)) w += 0.38;
    else if (WIDE.has(ch)) w += 0.88;
    else if (ch >= '0' && ch <= '9') w += 0.56;
    else if (ch !== ch.toLowerCase()) w += 0.7;
    else w += 0.54;
  }
  const bold = (spec.weight || 400) >= 600 ? 1.07 : 1;
  return w * (spec.font.widthFactor || 1) * bold;
}

/** Width in px of `text` rendered at `size` px with the given font spec. */
export function measureText(text, size, spec) {
  let w;
  const weight = spec.weight || 400;
  if (customMeasure) {
    w = customMeasure(text, size, { family: spec.font.family, weight, italic: !!spec.italic });
  } else {
    const c = canvasContext();
    if (c) {
      c.font = `${spec.italic ? 'italic ' : ''}${weight} ${size}px ${spec.font.family}`;
      w = c.measureText(text).width;
    } else {
      w = heuristicWidth(text, spec) * size;
    }
  }
  return w + (spec.letterSpacing || 0) * size * [...text].length;
}

/* ----------------------------------------------------------------- fitting */

function wrapGreedy(words, maxWidth, measure) {
  const lines = [];
  let cur = '';
  for (const word of words) {
    if (measure(word) > maxWidth) return null;
    const cand = cur ? `${cur} ${word}` : word;
    if (!cur || measure(cand) <= maxWidth) cur = cand;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Re-wrap at the narrowest width that keeps the same line count (even rag). */
function balance(words, count, maxWidth, measure) {
  let lo = Math.max(...words.map(measure));
  let hi = maxWidth;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const lines = wrapGreedy(words, mid, measure);
    if (lines && lines.length <= count) hi = mid;
    else lo = mid;
  }
  return wrapGreedy(words, hi, measure);
}

/** Break words that are wider than the box, character by character. */
function hardWrap(words, maxWidth, measure) {
  const pieces = [];
  for (const word of words) {
    if (measure(word) <= maxWidth) {
      pieces.push(word);
      continue;
    }
    let cur = '';
    for (const ch of word) {
      if (cur && measure(cur + ch) > maxWidth) {
        pieces.push(cur);
        cur = ch;
      } else cur += ch;
    }
    if (cur) pieces.push(cur);
  }
  return wrapGreedy(pieces, maxWidth, measure) || pieces;
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
  const minSize = opts.minSize ?? Math.max(6, maxSize * 0.22);

  let str = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (opts.upper) str = str.toLocaleUpperCase();
  const base = { ...spec, lineHeight, cap };
  if (!str) return { ...base, lines: [], size: 0, width: 0, height: 0 };

  const words = str.split(' ');
  const finish = (lines, size) => {
    const measure = (s) => measureText(s, size, spec);
    return {
      ...base,
      lines,
      size,
      width: Math.max(...lines.map(measure)),
      height: blockHeight(lines.length, size, lineHeight, cap),
    };
  };

  let size = maxSize;
  for (let guard = 0; guard < 120; guard++) {
    const measure = (s) => measureText(s, size, spec);
    let lines = wrapGreedy(words, maxWidth, measure);
    if (lines && lines.length <= maxLines && blockHeight(lines.length, size, lineHeight, cap) <= maxHeight) {
      if (opts.balance !== false && lines.length > 1) lines = balance(words, lines.length, maxWidth, measure);
      return finish(lines, size);
    }
    if (size <= minSize) break;
    size = Math.max(minSize, size * 0.95);
  }

  // Fallback: smallest size, break long words, truncate with an ellipsis.
  size = minSize;
  const measure = (s) => measureText(s, size, spec);
  let lines = hardWrap(words, maxWidth, measure);
  const fitCount = Math.max(1, Math.min(maxLines, Math.floor((maxHeight / size - cap) / lineHeight) + 1));
  if (lines.length > fitCount) {
    lines = lines.slice(0, fitCount);
    let last = lines[fitCount - 1];
    while (last.length > 1 && measure(last + '…') > maxWidth) last = last.slice(0, -1);
    lines[fitCount - 1] = last.trimEnd() + '…';
  }
  return finish(lines, size);
}

/**
 * Render a fit as SVG <text> elements.
 * `y` is the top of the block (cap height of the first line).
 */
export function drawText(fit, { x, y, anchor = 'start', fill = '#000', opacity, attrs = '' }) {
  if (!fit.lines.length) return '';
  const { size, font, weight, italic, letterSpacing, lineHeight, cap } = fit;
  const ls = letterSpacing * size;
  // Trailing letter-spacing shifts centred/right-aligned text; compensate.
  const dx = anchor === 'middle' ? ls / 2 : anchor === 'end' ? ls : 0;
  let a = `font-family="${font.family}" font-size="${n(size)}" fill="${fill}"`;
  if (weight && weight !== 400) a += ` font-weight="${weight}"`;
  if (italic) a += ' font-style="italic"';
  if (ls) a += ` letter-spacing="${n(ls)}"`;
  if (anchor !== 'start') a += ` text-anchor="${anchor}"`;
  if (opacity != null && opacity !== 1) a += ` opacity="${opacity}"`;
  if (attrs) a += ' ' + attrs;
  const rows = fit.lines
    .map((ln, i) => `<text x="${n(x + dx)}" y="${n(y + size * cap + i * size * lineHeight)}">${escapeXml(ln)}</text>`)
    .join('');
  return `<g ${a}>${rows}</g>`;
}

/** Visual bottom of a fit placed at `y`, including descenders. */
export const textBottom = (fit, y) => (fit.lines.length ? y + fit.height + fit.size * 0.22 : y);
