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
 * return the advance width in px. It is called once per string and font at a
 * reference size of 100 px; other sizes are scaled from that. Pass `null` to
 * restore the default.
 */
export function setTextMeasurer(fn) {
  customMeasure = fn;
  widthCache.clear();
}

const NARROW = new Set("iljI.,:;!|'’`ı".split(''));
const SEMI = new Set('frt()[]-/"“”'.split(''));
const WIDE = new Set('mwMW@%&'.split(''));
// Glyphs that are about 1em wide in any font: CJK, kana, Hangul, full-width forms, emoji.
const FULL_WIDTH =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60\uffe0-\uffe6\p{Emoji_Presentation}]|\uFE0F/u;

/** @param {string} ch */
function latinWidth(ch) {
  if (ch === ' ' || ch === '\u00A0' || NARROW.has(ch)) return 0.28;
  if (ch === '\uFEFF') return 0;
  if (ch === '\u202F') return 0.2;
  if (ch === '\u2007') return 0.56;
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
// Widths are measured once at this size and scaled: text width is linear in font size,
// so shrinking a title to fit costs no extra measuring.
const REFERENCE = 100;

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);
/** @type {Map<string, string | null>} */
const canvasFonts = new Map();

/**
 * The font shorthand a canvas accepts for `font`, or null if it accepts none. A canvas
 * silently ignores a shorthand it can't parse (say, an unquoted family name with a digit,
 * like Font Awesome 6), which would measure with the previous font; quoting the names
 * fixes most, and the rest fall back to the estimate.
 * @param {{ font: string }} c @param {string} font
 * @param {{ font: { family: string }, weight?: number, italic?: boolean }} spec
 */
function canvasFont(c, font, spec) {
  let accepted = canvasFonts.get(font);
  if (accepted !== undefined) return accepted;
  const quoted = spec.font.family
    .split(',')
    .map((name) => name.trim())
    .map((name) =>
      /^(['"]).*\1$/.test(name) || GENERIC_FAMILIES.has(name) ? name : `"${name.replace(/["\\]/g, '\\$&')}"`,
    )
    .join(', ');
  accepted = null;
  for (const candidate of [font, font.slice(0, -spec.font.family.length) + quoted]) {
    c.font = '10px sans-serif';
    c.font = candidate;
    if (c.font !== '10px sans-serif') {
      accepted = candidate;
      break;
    }
  }
  // The canvas now holds the accepted shorthand (or the probe, if none was).
  lastFont = accepted ?? '';
  canvasFonts.set(font, accepted);
  return accepted;
}

/**
 * Advance width at the reference size, from the custom measurer, a canvas or the estimate.
 * @param {string} text
 * @param {{ font: { family: string, mono?: boolean, widthFactor?: number }, weight?: number, italic?: boolean }} spec
 */
function referenceWidth(text, spec) {
  const weight = spec.weight || 400;
  const font = `${spec.italic ? 'italic ' : ''}${weight} ${REFERENCE}px ${spec.font.family}`;
  const key = `${font}\u0000${spec.font.mono ? 1 : 0}${spec.font.widthFactor ?? 1}\u0000${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  let w;
  if (customMeasure) w = customMeasure(text, REFERENCE, { family: spec.font.family, weight, italic: !!spec.italic });
  else {
    const c = canvasContext();
    const shorthand = c && canvasFont(c, font, spec);
    if (c && shorthand) {
      if (shorthand !== lastFont) {
        c.font = shorthand;
        lastFont = shorthand;
      }
      w = c.measureText(text).width;
    } else w = heuristicWidth(text, spec) * REFERENCE;
  }
  if (widthCache.size > 20000) widthCache.clear();
  widthCache.set(key, w);
  return w;
}

/** @type {Map<string, number>} */
const graphemeCounts = new Map();
/** @param {string} text */
function graphemeCount(text) {
  let count = graphemeCounts.get(text);
  if (count === undefined) {
    count = graphemes(text).length;
    if (graphemeCounts.size > 20000) graphemeCounts.clear();
    graphemeCounts.set(text, count);
  }
  return count;
}

/** Width in px of `text` rendered at `size` px with the given font spec. */
export function measureText(text, size, spec) {
  const w = (referenceWidth(text, spec) * size) / REFERENCE;
  // SVG adds letter-spacing after every visible character (grapheme), not every code point.
  return spec.letterSpacing ? w + spec.letterSpacing * size * graphemeCount(text) : w;
}

/** @type {Intl.Segmenter | null | undefined} */
let segmenter;
/** A grapheme segmenter, or null where `Intl.Segmenter` is missing. */
function graphemeSegmenter() {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
  }
  return segmenter;
}

/** Split a string into user-perceived characters (grapheme clusters). */
export function graphemes(str) {
  const seg = graphemeSegmenter();
  return seg ? Array.from(seg.segment(str), (s) => s.segment) : [...str];
}

/**
 * Iterate a string's user-perceived characters lazily (code points without Intl.Segmenter).
 * @param {string} str
 */
function* lazyGraphemes(str) {
  const seg = graphemeSegmenter();
  if (!seg) {
    yield* str;
    return;
  }
  for (const { segment } of seg.segment(str)) yield segment;
}

/**
 * The start of a string, cut between user-perceived characters: at most `max`
 * characters, or with `units`, at most `max` UTF-16 code units (what an input's
 * maxlength counts). Segments lazily, so a huge string costs only what is kept.
 * @param {string} str @param {number} max @param {{ units?: boolean }} [options]
 */
export function clipGraphemes(str, max, { units = false } = {}) {
  let out = '';
  let count = 0;
  for (const ch of lazyGraphemes(str)) {
    count += units ? ch.length : 1;
    if (count > max) break;
    out += ch;
  }
  return out;
}

/* ----------------------------------------------------------------- fitting */

/** @typedef {{ text: string, space: boolean }} Token  A wrap unit; `space` means a space comes before it. */

// Scripts written without spaces between words: lines may break between their words.
const NO_SPACE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Emoji_Presentation}]|\uFE0F/u;
// Never start a line with closing punctuation, or end one with opening punctuation.
const NO_BREAK_BEFORE = /^[.,!?:;…%)\]}»›’”、。，．・：；！？‼⁇⁈⁉ーゝゞヽヾ々〉》」』】〕〗〙〛）］｝｠｡｣､･]/u;
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
    // (Breaking whitespace is a single space by now; a no-break space joins its neighbours.)
    if (segment === ' ') {
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

/**
 * Runs of whitespace a line may break at: all of it except the no-break spaces
 * (U+00A0, U+2007, U+202F and U+FEFF), which JavaScript's \\s also matches.
 */
export const BREAKING_SPACE = /[^\S\u00A0\u2007\u202F\uFEFF]+/g;

/** Room below the last baseline for descenders, as a fraction of the size. */
const DESCENT = 0.22;
/** How far below `minSize` text may shrink so that a long word fits whole. */
const WORD_FLOOR = 0.6;

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
  // With `descent`, the budget also covers the descenders below the last line.
  const descent = opts.descent ? DESCENT : 0;
  const maxLines = opts.maxLines ?? 5;
  const maxWidth = Math.max(1, opts.maxWidth);
  const maxHeight = opts.maxHeight ?? Infinity;
  const maxSize = opts.maxSize;
  if (!Number.isFinite(maxSize) || maxSize <= 0)
    throw new TypeError('fitText: `maxSize` must be a positive number of pixels');
  if (opts.minSize != null && (!Number.isFinite(opts.minSize) || opts.minSize <= 0)) {
    throw new TypeError('fitText: `minSize` must be a positive number of pixels');
  }
  const minSize = Math.min(maxSize, opts.minSize ?? Math.max(6, maxSize * 0.22));

  let str = String(text ?? '')
    .replace(BREAKING_SPACE, ' ')
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
    if (
      lines &&
      lines.length <= maxLines &&
      blockHeight(lines.length, size, lineHeight, cap) + descent * size <= maxHeight
    ) {
      if (opts.balance !== false && lines.length > 1) lines = balance(tokens, lines.length, maxWidth, measure);
      return finish(lines, size);
    }
    if (size <= minSize) break;
    size = Math.max(minSize, size * 0.95);
  }

  // Fallback: smallest size (or smaller, if even one line won't fit the height),
  // break long words, truncate with an ellipsis.
  if (maxHeight <= 0) return { ...base, lines: [], size: 0, width: 0, height: 0, truncated: true };
  size = Math.min(minSize, maxHeight / (cap + descent));
  // A word wider than the box: shrink a little further (widths scale with size) rather than
  // break it mid-word, down to WORD_FLOOR of this size.
  const widest = Math.max(...tokens.map((token) => measureText(token.text, size, spec)));
  const wordFits = (size * maxWidth) / widest;
  if (widest > maxWidth && wordFits >= size * WORD_FLOOR) size = wordFits * (1 - 1e-9);
  const measure = (s) => measureText(s, size, spec);
  let lines = hardWrap(tokens, maxWidth, measure);
  const fitCount = Math.max(
    1,
    Math.min(maxLines, Math.floor((maxHeight / size - cap - descent) / lineHeight + 1e-9) + 1),
  );
  if (lines.length <= fitCount) {
    const whole = lines.length > 1 && opts.balance !== false && wrapGreedy(tokens, maxWidth, measure);
    return finish(whole ? balance(tokens, lines.length, maxWidth, measure) : lines, size);
  }
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
export const textBottom = (fit, y) => (fit.lines.length ? y + fit.height + fit.size * DESCENT : y);
