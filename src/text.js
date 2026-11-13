/* @ts-self-types="./text.d.ts" */
// Text measurement, fitting (wrap + shrink-to-fit) and rendering.
//
// Only system font stacks are used so that covers render identically when the
// SVG is rasterised through <img>/<canvas> (which cannot load web fonts).

import { escapeXml, n, stripInvalidXml } from './core.js';
// (The width tables are for measuring without a canvas. A browser loads them too, about 6 KB
// compressed: a Node-only entry point would spare it that, but bundlers and Workers pick entry
// points their own way, and one entry everywhere is worth more.)
import { CHARS, UPRIGHT, ITALIC, METRICS } from './metrics.js';

// Each stack starts with the macOS face the style was drawn with, then close matches on
// Windows, Android and Linux (where Futura, Didot or Gill Sans are rarely installed), so
// the look survives other systems and SVGs opened elsewhere.
export const FONTS = {
  serif: {
    name: 'Serif',
    family: "Georgia, 'Times New Roman', Times, 'Noto Serif', 'DejaVu Serif', serif",
    widthFactor: 1.1,
    cap: 0.7,
  },
  didone: {
    name: 'Didone',
    family: "Didot, 'Bodoni 72', 'Bodoni MT', 'Sitka Display', 'Noto Serif Display', Constantia, Georgia, serif",
    widthFactor: 1.04,
    cap: 0.68,
  },
  garamond: {
    name: 'Old style',
    family:
      "Garamond, 'EB Garamond', 'Hoefler Text', Baskerville, 'Palatino Linotype', Palatino, 'URW Palladio L', Georgia, serif",
    widthFactor: 0.98,
    cap: 0.66,
  },
  sans: {
    name: 'Sans',
    family: "'Helvetica Neue', Helvetica, Arial, Roboto, 'Liberation Sans', sans-serif",
    widthFactor: 1.0,
    cap: 0.72,
  },
  geometric: {
    name: 'Geometric',
    family:
      "Futura, 'Century Gothic', 'Avenir Next', Avenir, 'URW Gothic', 'TeX Gyre Adventor', 'Trebuchet MS', sans-serif",
    widthFactor: 1.06,
    cap: 0.72,
  },
  humanist: {
    name: 'Humanist',
    family: "'Gill Sans', 'Gill Sans MT', Seravek, Calibri, 'Segoe UI', 'Trebuchet MS', 'Noto Sans', sans-serif",
    widthFactor: 0.96,
    cap: 0.69,
  },
  condensed: {
    name: 'Condensed',
    family:
      "'Avenir Next Condensed', 'Arial Narrow', 'Bahnschrift Condensed', 'Roboto Condensed', sans-serif-condensed, 'Liberation Sans Narrow', 'Helvetica Neue', sans-serif",
    widthFactor: 0.84,
    cap: 0.7,
  },
  display: {
    name: 'Heavy',
    family:
      "Impact, Haettenschweiler, 'Arial Narrow Bold', 'Franklin Gothic Bold', Anton, Oswald, sans-serif-condensed, sans-serif",
    widthFactor: 0.82,
    cap: 0.79,
  },
  mono: {
    name: 'Typewriter',
    family: "'Courier New', Courier, 'Liberation Mono', 'Noto Mono', monospace",
    mono: true,
    widthFactor: 1,
    cap: 0.6,
  },
};

/** @typedef {import('./text.js').FontSpec} FontSpec */

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
  if (fn != null && typeof fn !== 'function') {
    throw new TypeError('setTextMeasurer: pass a function (text, size, font) => width in px, or null');
  }
  customMeasure = fn ?? null;
  widthCache.clear();
}

const NARROW = new Set("iljIİ.,:;!|'’`ı".split(''));
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

/** Where each measured character is in a table. */
const CHAR_INDEX = new Map([...CHARS].map((ch, i) => [ch, i]));
/** @typedef {{ upright: Float64Array[], italic: Float64Array[] }} WidthTables */
/** Decoded width tables, by font family (null: none). @type {Map<string, WidthTables | null>} */
const tables = new Map();
/** Two hex digits per character, in 1/200 em, as widths in em. @param {string} hex */
const decodeWidths = (hex) =>
  Float64Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 200);
/** The measured widths of a built-in font stack, or null. @param {string} family */
function tablesFor(family) {
  let found = tables.get(family);
  if (found === undefined) {
    const m = METRICS.get(family);
    found = m ? { upright: m.upright.map(decodeWidths), italic: m.italic.map(decodeWidths) } : null;
    tables.set(family, found);
  }
  return found;
}
/** The index of the measured weight nearest to `weight` (the heavier, on a tie). @param {readonly number[]} weights @param {number} weight */
const nearest = (weights, weight) =>
  weights.reduce((best, w, i) => (Math.abs(w - weight) <= Math.abs(weights[best] - weight) ? i : best), 0);

/**
 * Widths (in em) for environments without a canvas, e.g. Node: from the measured widths of a
 * built-in font stack's characters at the nearest measured weight (an accented letter as its
 * base letter), else estimated from the kind of character.
 * @param {string} text
 * @param {{ font: { family?: string, mono?: boolean, widthFactor?: number }, weight?: number, italic?: boolean }} spec
 */
function heuristicWidth(text, spec) {
  const weight = spec.weight || 400;
  const factor = (spec.font.widthFactor || 1) * (weight >= 600 ? 1.07 : 1);
  const found = spec.font.mono || !spec.font.family ? null : tablesFor(spec.font.family);
  const table = found
    ? spec.italic
      ? found.italic[nearest(ITALIC, weight)]
      : found.upright[nearest(UPRIGHT, weight)]
    : null;
  let w = 0;
  for (const g of graphemes(text)) {
    if (FULL_WIDTH.test(g)) w += 1;
    else if (spec.font.mono) w += 0.6;
    else {
      const i = table ? (CHAR_INDEX.get(g) ?? CHAR_INDEX.get(g.normalize('NFD')[0])) : undefined;
      w += table && i !== undefined ? table[i] : latinWidth(g[0]) * factor;
    }
  }
  return w;
}

/** Widths at the reference size: per font, then per text. @type {Map<string, Map<string, number>>} */
const widthCache = new Map();
let lastFont = '';
// Widths are measured once at this size and scaled: text width is linear in font size,
// so shrinking a title to fit costs no extra measuring.
const REFERENCE = 100;

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);
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

/** @typedef {{ family: string, weight: number, italic: boolean, mono: boolean, factor: number, font: string, key: string }} SpecFont */
/** @type {WeakMap<object, SpecFont>} */
const specFonts = new WeakMap();

/**
 * The font shorthand (at the reference size) and cache key for a spec, built once per spec
 * object: measuring runs in the tightest loops, with the same spec each time. Rebuilt if
 * the spec was changed since.
 * @param {{ font: { family: string, mono?: boolean, widthFactor?: number }, weight?: number, italic?: boolean }} spec
 * @returns {SpecFont}
 */
function fontOf(spec) {
  const weight = spec.weight || 400;
  const italic = !!spec.italic;
  const mono = !!spec.font.mono;
  const factor = spec.font.widthFactor ?? 1;
  const known = specFonts.get(spec);
  if (
    known &&
    known.family === spec.font.family &&
    known.weight === weight &&
    known.italic === italic &&
    known.mono === mono &&
    known.factor === factor
  ) {
    return known;
  }
  const font = `${italic ? 'italic ' : ''}${weight} ${REFERENCE}px ${spec.font.family}`;
  const made = { family: spec.font.family, weight, italic, mono, factor, font, key: `${font}\u0000${mono}${factor}` };
  specFonts.set(spec, made);
  return made;
}

/**
 * Advance width at the reference size, from the custom measurer, a canvas or the estimate.
 * @param {string} text
 * @param {{ font: { family: string, mono?: boolean, widthFactor?: number }, weight?: number, italic?: boolean }} spec
 */
function referenceWidth(text, spec) {
  const { font, weight, key } = fontOf(spec);
  let widths = widthCache.get(key);
  if (!widths) widthCache.set(key, (widths = new Map()));
  const cached = widths.get(text);
  if (cached !== undefined) return cached;
  let w;
  if (customMeasure) {
    w = customMeasure(text, REFERENCE, { family: spec.font.family, weight, italic: !!spec.italic });
    // Say so here, rather than let a bad width surface later as NaN or a misleading error.
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
      throw new TypeError(
        `setTextMeasurer: the measurer returned ${String(w)} for "${text}"; it must return a width in px`,
      );
    }
  } else {
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
  if (widths.size > 20000) widths.clear();
  widths.set(text, w);
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

/** @typedef {{ text: string, space: boolean, hard?: boolean }} Token  A wrap unit; `space` means a space comes before it, `hard` a line break the text asks for. */

/** Typed lines are kept whole when that sets them at least this share of the size wrapping gives. */
const TYPED_SHARE = 0.8;

/** The number of lines text was typed on (1 without line breaks). @param {string} text */
export const typedLines = (text) => Math.max(1, text.split(LINE_BREAK).filter((line) => line.trim()).length);

/** A line break in the text itself (a title typed on two lines): lines always break there. */
export const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/;

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * Collapse control characters and whitespace, drop anything illegal in XML and
 * cap the length (so huge inputs can't make layout slow).
 * @param {unknown} value
 * @param {number} max  maximum length in characters
 * @param {{ breaks?: boolean }} [options]
 */
export function cleanText(value, max, { breaks = false } = {}) {
  // With `breaks`, line breaks stay (as "\n", one between lines): the title's lines break there.
  const text = String(value ?? '')
    .split(breaks ? LINE_BREAK : /(?!)/)
    .map((line) => stripInvalidXml(line.replace(CONTROL, ' ')).replace(BREAKING_SPACE, ' ').trim())
    .filter(Boolean)
    .join('\n');
  // Cut between visible characters (segmenting lazily), so an emoji or accented letter is never split.
  return text.length > max ? clipGraphemes(text, max).trimEnd() : text;
}

/**
 * Wrap units of text that may hold line breaks: each line is split as `tokenize` splits text,
 * and the first unit after a break is marked `hard`.
 * @param {string} str  lines joined by "\n", each with single spaces
 * @returns {Token[]}
 */
function tokenizeLines(str) {
  /** @type {Token[]} */
  const tokens = [];
  for (const line of str.split('\n')) {
    const units = tokenize(line);
    if (tokens.length && units.length) units[0] = { ...units[0], space: false, hard: true };
    tokens.push(...units);
  }
  return tokens;
}

// Scripts written without spaces between words: lines may break between their words.
const NO_SPACE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Emoji_Presentation}]|\uFE0F/u;
// Never start a line with closing punctuation, or end one with opening punctuation; and never
// break at a no-break space, even between words of scripts written without spaces.
const NO_BREAK_BEFORE =
  /^[\u00A0\u2007\u202F\uFEFF.,!?:;…%)\]}»›’”、。，．・：；！？‼⁇⁈⁉ーゝゞヽヾ々〉》」』】〕〗〙〛）］｝｠｡｣､･]/u;
const NO_BREAK_AFTER = /[\u00A0\u2007\u202F\uFEFF([{«‹‘“〈《「『【〔〖〘〚（［｛｟｢]$/u;
// Scripts whose letters join up: browsers don't letter-space them, so they are set untracked.
const CURSIVE =
  /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u;

/**
 * The letter-spacing `text` is set with: none for scripts whose letters join (Arabic…), which
 * browsers don't space, so measuring it would size the text for a width it never has.
 * @param {string} text @param {number} spacing in em
 */
export const trackingFor = (text, spacing) => (spacing && CURSIVE.test(text) ? 0 : spacing);

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
  /** @type {Token[]} */
  const tokens = [];
  if (!wordSegmenter) {
    for (const [i, word] of str.split(' ').entries()) addToken(tokens, word, i > 0);
    return joinSingleLetters(tokens);
  }
  let space = false;
  for (const { segment } of wordSegmenter.segment(str)) {
    // (Breaking whitespace is a single space by now; a no-break space joins its neighbours.)
    if (segment === ' ') {
      space = tokens.length > 0;
      continue;
    }
    const prev = tokens.at(-1);
    // Words with no space between them stay together, except in scripts written without spaces.
    if (prev && !space && !NO_SPACE.test(segment) && !NO_SPACE.test(prev.text.slice(-2))) prev.text += segment;
    else addToken(tokens, segment, space);
    space = false;
  }
  return joinSingleLetters(tokens);
}

/**
 * Add a wrap unit, or join it to the last one when no line may break between them:
 * before closing or after opening punctuation, even across a space (« Le Petit Prince », Quoi ?!).
 * @param {Token[]} tokens @param {string} text @param {boolean} space
 */
function addToken(tokens, text, space) {
  const prev = tokens.at(-1);
  if (prev && (NO_BREAK_BEFORE.test(text) || NO_BREAK_AFTER.test(prev.text))) prev.text += (space ? ' ' : '') + text;
  else tokens.push({ text, space });
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
    if (!cur || (!token.hard && measure(cand) <= maxWidth)) cur = cand;
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

const SINGLE_LETTER = /^\p{L}$/u;

/**
 * A one-letter word (и, в, a, y, o…) doesn't end a line, as typesetters keep it with the
 * word after it. Not when that word is one letter too: a run of them (A B C D…) would
 * otherwise become one unbreakable unit.
 * @param {Token[]} tokens
 */
function joinSingleLetters(tokens) {
  /** @type {Token[]} */
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const [token, next] = [tokens[i], tokens[i + 1]];
    if (next?.space && SINGLE_LETTER.test(token.text) && !SINGLE_LETTER.test(next.text)) {
      out.push({ text: `${token.text} ${next.text}`, space: token.space });
      i++;
    } else out.push(token);
  }
  return out;
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
    // (The first piece starts the line the text asks for, if it does.)
    let hard = Boolean(token.hard);
    // Break the word into pieces that fit. Alphabetic words get a hyphen at each break,
    // placed after a vowel where one is close (INTERNATIO- → INTERNA-TIONAL…).
    const chars = graphemes(token.text);
    const hyphen = HYPHENABLE.test(token.text) ? '-' : '';
    let space = token.space;
    for (let start = 0; start < chars.length;) {
      const piece = (/** @type {number} */ end) =>
        chars.slice(start, end).join('') + (end < chars.length ? hyphen : '');
      let end = start + 1;
      while (end < chars.length && measure(piece(end + 1)) <= maxWidth) end++;
      if (hyphen && end < chars.length) {
        for (let k = end; k >= Math.max(start + 2, end - 3); k--) {
          if (k <= chars.length - 2 && syllableBreak(chars, k)) {
            end = k;
            break;
          }
        }
      }
      pieces.push({ text: piece(end), space, hard });
      space = false;
      hard = false;
      start = end;
    }
  }
  return wrapGreedy(pieces, maxWidth, measure) ?? pieces.map((piece) => piece.text);
}

/**
 * Prose wrapped to a width at a size, line by line as prose is set (not balanced, not shrunk): it
 * breaks where a line may (at spaces, between words of scripts written without them, never
 * before closing or after opening punctuation). A unit wider than the width (a web address, say)
 * is broken too, its first piece filling what's left of the line, after a / - . or the like
 * where one is near the end of what fits.
 * @param {string} text  one paragraph, its spaces single
 * @param {number} size @param {number} maxWidth @param {import('./text.js').TextSpec} spec
 * @returns {string[]}
 */
export function wrapText(text, size, maxWidth, spec) {
  const fits = (/** @type {string} */ s) => measureText(s, size, spec) <= maxWidth;
  /** @type {string[]} */
  const lines = [];
  let cur = '';
  for (const token of tokenize(text)) {
    const cand = append(cur, token);
    if (fits(cand)) {
      cur = cand;
      continue;
    }
    if (fits(token.text)) {
      if (cur) lines.push(cur);
      cur = token.text;
      continue;
    }
    let chars = graphemes(token.text);
    let lead = cur ? `${cur}${token.space ? ' ' : ''}` : '';
    // (What the line held is the lead now: written out with the unit's first piece, or alone.)
    cur = '';
    while (chars.length) {
      // The most characters that fit after what the line holds (by halves: a unit can be long).
      let lo = 0;
      let hi = chars.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(lead + chars.slice(0, mid).join(''))) lo = mid;
        else hi = mid - 1;
      }
      if (lo === chars.length) {
        cur = lead + chars.join('');
        break;
      }
      // Too little room left on this line: the unit starts the next one.
      if (lead && lo < Math.min(4, chars.length)) {
        lines.push(lead.trimEnd());
        lead = '';
        continue;
      }
      let cut = Math.max(1, lo);
      for (let k = cut; k > cut / 2; k--) {
        if (/[/\-.?&=_:,;)]/.test(chars[k - 1])) {
          cut = k;
          break;
        }
      }
      lines.push(lead + chars.slice(0, cut).join(''));
      lead = '';
      chars = chars.slice(cut);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Words that can take a hyphen when broken: alphabetic scripts written with spaces.
const HYPHENABLE = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{M}]+$/u;
const VOWEL = /^[aeiouyàáâäãåæèéêëìíîïòóôöõøœùúûüýÿаеёиоуыэюяіїєαεηιουωάέήίόύώ]/iu;
/** A break before `chars[k]` falls after a vowel and before a consonant. @param {string[]} chars @param {number} k */
const syllableBreak = (chars, k) => VOWEL.test(chars[k - 1]) && !VOWEL.test(chars[k]) && /\p{L}/u.test(chars[k]);

/**
 * Runs of whitespace a line may break at: all of it except the no-break spaces
 * (U+00A0, U+2007, U+202F and U+FEFF), which JavaScript's \\s also matches.
 */
export const BREAKING_SPACE = /[^\S\u00A0\u2007\u202F\uFEFF]+/g;

/**
 * Reject a missing or non-numeric box, which would otherwise lay text out with NaN.
 * `maxWidth` is required; `maxHeight` may be left out (no limit) but not be NaN.
 * @param {string} fn @param {{ maxWidth: number, maxHeight?: number }} o
 */
export function checkBox(fn, o) {
  if (!Number.isFinite(o.maxWidth)) throw new TypeError(`${fn}: \`maxWidth\` must be a number of pixels`);
  if (o.maxHeight != null && Number.isNaN(o.maxHeight)) {
    throw new TypeError(`${fn}: \`maxHeight\` must be a number of pixels`);
  }
}

/**
 * Reject a `maxSize` that isn't a positive number, and a `minSize` given as anything else.
 * @param {string} fn @param {{ maxSize: number, minSize?: number }} o
 */
export function checkSizes(fn, o) {
  if (!Number.isFinite(o.maxSize) || o.maxSize <= 0) {
    throw new TypeError(`${fn}: \`maxSize\` must be a positive number of pixels`);
  }
  if (o.minSize != null && (!Number.isFinite(o.minSize) || o.minSize <= 0)) {
    throw new TypeError(`${fn}: \`minSize\` must be a positive number of pixels`);
  }
}

/**
 * The smallest size text shrinks to before wrapping harder: `minSize` if given,
 * else 22% of `maxSize` but at least 6 px, or half of `maxSize` when that is less
 * (small text on a small cover can still shrink).
 * @param {number} maxSize @param {number} [minSize]
 */
export const defaultMinSize = (maxSize, minSize) =>
  Math.min(maxSize, minSize ?? Math.max(Math.min(6, maxSize / 2), maxSize * 0.22));

/** Room below the last baseline for descenders, as a fraction of the size. */
const DESCENT = 0.22;
/** How far below `minSize` text may shrink so that a long word fits whole. */
const WORD_FLOOR = 0.6;
/** Clear space between one line's marks and the next line's, in em. */
const MARK_GAP = 0.04;

// Scripts whose vowel and tone marks reach well above the cap height of Latin capitals and
// below the baseline, with how far in em (measured in common fonts, with some to spare).
/** @type {[RegExp, number, number][]} */
const MARK_SCRIPTS = [
  [/[\p{Script=Thai}\p{Script=Lao}\p{Script=Myanmar}\p{Script=Khmer}\p{Script=Tibetan}]/u, 0.5, 0.56],
  [
    /[\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}]/u,
    0.34,
    0.44,
  ],
  // Ideographs fill the em; Arabic letters and marks reach a little above capitals and well below.
  [/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u, 0.16, 0.16],
  [/[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Thaana}]/u, 0.16, 0.32],
];
// A capital with a mark on top once decomposed (É Å Ž İ Й Ё Ά): it reaches above the cap height.
const ACCENTED_CAP =
  /\p{Lu}\p{Mn}*[\u0300-\u0315\u031A\u031B\u033D-\u0344\u0346\u034A-\u034C\u0350-\u0352\u0357\u035B\u0363-\u036F]/u;
/** How far an accent on a capital reaches above the cap height, in em. */
const ACCENT = 0.34;

/**
 * How far marks reach past Latin capitals, in em: above the cap height (accents on capitals,
 * É Å Й, and the vowel and tone marks of scripts like Thai and Devanagari) and below the
 * baseline (the marks under letters in those scripts). Both are 0 for text without them.
 * @param {string} text
 */
export function markExtent(text) {
  let above = 0;
  let below = 0;
  for (const [script, up, down] of MARK_SCRIPTS) {
    if (script.test(text)) {
      above = Math.max(above, up);
      below = Math.max(below, down);
    }
  }
  if (above < ACCENT && ACCENTED_CAP.test(text.normalize('NFD'))) above = ACCENT;
  return { above, below };
}

/**
 * Room below a line for descenders, in em: a little for capitals and letters without
 * descenders, the full amount for g, p, y…, cedillas and ogoneks (ç ą), marks below (ạ),
 * lowercase Cyrillic and Greek (у р μ ρ) and scripts without case, and more for the
 * marks under letters in scripts like Thai and Devanagari.
 * @param {string} line
 */
export function descentOf(line) {
  const d = line.normalize('NFD');
  const letters =
    /[gjpqyQ,;()ДЦЩдцщ]/.test(d) ||
    /[\u0316-\u0333]/.test(d) ||
    /[\p{Ll}\p{Lo}]/u.test(d.replace(/\p{Script=Latin}/gu, ''))
      ? DESCENT
      : 0.04;
  return Math.max(letters, markExtent(line).below);
}

/** The language of the cover being drawn (see inLanguage), for its capitals. */
let coverLang = '';

/**
 * Text in capitals as its language writes them (Turkish and Azeri i is İ; Greek drops its accents):
 * in `lang`, else in the language of the cover being drawn; plain capitals for none, or for a tag
 * Intl doesn't know (en-GB-oed).
 * @param {string} text @param {string} [lang]
 */
export function toUpper(text, lang = coverLang) {
  if (!lang) return text.toUpperCase();
  try {
    return text.toLocaleUpperCase(lang);
  } catch {
    return text.toUpperCase();
  }
}

/**
 * Run `draw` with `lang` as the language its capitals are set in: createCover runs a style so, and
 * fitText's `upper` (and titleBlock's, and the initials) follow it.
 * @template T @param {string} lang @param {() => T} draw @returns {T}
 */
export function inLanguage(lang, draw) {
  const before = coverLang;
  coverLang = lang;
  try {
    return draw();
  } finally {
    coverLang = before;
  }
}

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
    letterSpacing: trackingFor(String(text ?? ''), opts.letterSpacing || 0),
  };
  const lineHeight = opts.lineHeight ?? 1.15;
  const cap = font.cap ?? 0.72;
  // With `descent`, the budget also covers the descenders below the last line.
  const descent = Boolean(opts.descent);
  const maxLines = opts.maxLines ?? 5;
  const maxWidth = Math.max(1, opts.maxWidth);
  const maxHeight = opts.maxHeight ?? Infinity;
  const maxSize = opts.maxSize;
  checkSizes('fitText', opts);
  checkBox('fitText', opts);
  const minSize = defaultMinSize(maxSize, opts.minSize);

  // Line breaks in the text stay (the lines always break there); other whitespace is a space.
  let str = String(text ?? '')
    .split(LINE_BREAK)
    .map((line) => line.replace(BREAKING_SPACE, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (opts.upper) str = toUpper(str, opts.lang || undefined);
  const base = { ...spec, lineHeight, cap, above: 0, below: DESCENT };
  if (!str) return { ...base, lines: [], size: 0, width: 0, height: 0, truncated: false };

  /**
   * How lines sit, in em: the pitch between baselines (more than `lineHeight` where a line's
   * accents or marks would reach the line above), and the room above the first line's cap
   * height and below the last baseline for them.
   * @param {string[]} lines
   */
  const layoutOf = (lines) => {
    let pitch = lineHeight;
    for (let i = 1; i < lines.length; i++) {
      const { above } = markExtent(lines[i]);
      if (above) pitch = Math.max(pitch, cap + above + descentOf(lines[i - 1]) + MARK_GAP);
    }
    const below = lines.length ? markExtent(lines[lines.length - 1]).below : 0;
    return { pitch, above: lines.length ? markExtent(lines[0]).above : 0, below: Math.max(DESCENT, below) };
  };
  /** @param {string[]} lines @param {number} size @param {ReturnType<typeof layoutOf>} l */
  const heightOf = (lines, size, l) => (lines.length ? size * (l.above + cap + (lines.length - 1) * l.pitch) : 0);
  /** Whether lines fit the height at `size`. @param {string[]} lines @param {number} size */
  const fitsHeight = (lines, size) => {
    const l = layoutOf(lines);
    return heightOf(lines, size, l) + (descent ? l.below * size : 0) <= maxHeight;
  };

  const tokens = tokenizeLines(str);
  // One long word that would come out smaller than `hyphenate` px: split it once, with a
  // hyphen near the middle, if that sets it clearly larger on two lines.
  if (opts.hyphenate && tokens.length === 1 && HYPHENABLE.test(str)) {
    const plain = fitText(text, { ...opts, hyphenate: 0 });
    if (plain.size >= opts.hyphenate) return plain;
    const chars = graphemes(str);
    if (chars.length < 9 || maxLines < 2) return plain;
    const mid = chars.length / 2;
    let at = -1;
    for (let k = 4; k <= chars.length - 4; k++) {
      if (syllableBreak(chars, k) && (at < 0 || Math.abs(k - mid) < Math.abs(at - mid))) at = k;
    }
    if (at < 0) at = Math.round(mid);
    const lines = [`${chars.slice(0, at).join('')}-`, chars.slice(at).join('')];
    // Widths scale with size, so the size that fits is a ratio.
    const perPx = Math.max(...lines.map((line) => measureText(line, REFERENCE, spec) / REFERENCE));
    const l = layoutOf(lines);
    const size = Math.min(maxSize, maxWidth / perPx, maxHeight / (l.above + cap + l.pitch + (descent ? l.below : 0)));
    if (!(size > plain.size * 1.15)) return plain;
    return {
      ...base,
      lineHeight: l.pitch,
      above: l.above,
      below: l.below,
      lines,
      size,
      width: Math.max(...lines.map((line) => measureText(line, size, spec))),
      height: heightOf(lines, size, l),
      truncated: false,
    };
  }
  const finish = (lines, size, truncated = false) => {
    const measure = (s) => measureText(s, size, spec);
    const l = layoutOf(lines);
    return {
      ...base,
      lineHeight: l.pitch,
      above: l.above,
      below: l.below,
      lines,
      size,
      width: Math.max(...lines.map(measure)),
      height: heightOf(lines, size, l),
      truncated,
    };
  };

  // Text typed on several lines may keep those lines whole, shrinking rather than wrapping inside
  // one, while that costs little: at least TYPED_SHARE of the size wrapping gives. (Wrapping
  // still breaks where the text was typed to.)
  /** @type {{ lines: string[], size: number } | null} */
  let typed = null;
  if (tokens.some((token) => token.hard)) {
    const lines = str.split('\n');
    const perPx = Math.max(...lines.map((line) => measureText(line, REFERENCE, spec) / REFERENCE));
    const l = layoutOf(lines);
    const size = Math.min(
      maxSize,
      maxWidth / perPx,
      maxHeight / (l.above + cap + (lines.length - 1) * l.pitch + (descent ? l.below : 0)),
    );
    if (lines.length <= maxLines && size >= minSize) typed = { lines, size };
  }
  /** The wrapped fit at `size`, unless the typed lines come close to it. @param {string[]} lines @param {number} size */
  const typedOr = (lines, size) =>
    typed && typed.size >= size * TYPED_SHARE ? finish(typed.lines, typed.size) : finish(lines, size);

  // Shrink 5% at a time down to minSize (which is positive, so this ends however far apart the two are).
  let size = maxSize;
  for (;;) {
    const measure = (s) => measureText(s, size, spec);
    let lines = wrapGreedy(tokens, maxWidth, measure, maxLines);
    if (lines && lines.length <= maxLines && fitsHeight(lines, size)) {
      if (opts.balance !== false && lines.length > 1) {
        // (Balanced lines may put an accented capital at the start of another line: keep them only if they still fit.)
        const even = balance(tokens, lines.length, maxWidth, measure);
        if (fitsHeight(even, size)) lines = even;
      }
      return typedOr(lines, size);
    }
    if (size <= minSize) break;
    size = Math.max(minSize, size * 0.95);
  }

  // Nothing wraps at minSize or larger: the typed lines, if they fit.
  if (typed) return finish(typed.lines, typed.size);

  // Fallback: smallest size (or smaller, if even one line won't fit the height),
  // break long words, truncate with an ellipsis.
  if (maxHeight <= 0) return { ...base, lines: [], size: 0, width: 0, height: 0, truncated: true };
  // (Lines aren't known yet: allow for marks wherever the text has them.)
  const marks = markExtent(str);
  const depth = descent ? Math.max(DESCENT, marks.below) : 0;
  const pitch = marks.above ? Math.max(lineHeight, cap + marks.above + descentOf(str) + MARK_GAP) : lineHeight;
  size = Math.min(minSize, maxHeight / (marks.above + cap + depth));
  // A word wider than the box: shrink a little further (widths scale with size) rather than
  // break it mid-word, down to WORD_FLOOR of this size.
  const widest = Math.max(...tokens.map((token) => measureText(token.text, size, spec)));
  const wordFits = (size * maxWidth) / widest;
  if (widest > maxWidth && wordFits >= size * WORD_FLOOR) size = wordFits * (1 - 1e-9);
  const measure = (s) => measureText(s, size, spec);
  let lines = hardWrap(tokens, maxWidth, measure);
  const fitCount = Math.max(
    1,
    Math.min(maxLines, Math.floor((maxHeight / size - marks.above - cap - depth) / pitch + 1e-9) + 1),
  );
  if (lines.length <= fitCount) {
    const whole = lines.length > 1 && opts.balance !== false && wrapGreedy(tokens, maxWidth, measure);
    const even = whole && balance(tokens, lines.length, maxWidth, measure);
    return finish(even && fitsHeight(even, size) ? even : lines, size);
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
 * @param {{ font: FontSpec, fill: string, size?: number, weight?: number, italic?: boolean, letterSpacing?: number, anchor?: 'start' | 'middle' | 'end', opacity?: number, attrs?: string }} o
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
 * The baseline of line `i` of a fit whose block starts at `y` (the top of its first line:
 * the cap height, or its accents and marks where they reach higher).
 * @param {import('./text.js').TextFit} fit @param {number} y @param {number} i
 */
export const baselineOf = (fit, y, i) => y + fit.size * ((fit.above ?? 0) + fit.cap + i * fit.lineHeight);

/**
 * Render a fit as SVG <text> elements.
 * `y` is the top of the block (see baselineOf).
 * @param {import('./text.js').TextFit} fit
 * @param {import('./text.js').DrawOptions} opts
 */
export function drawText(fit, { x, y, anchor = 'start', fill = '#000', opacity, attrs = '' }) {
  if (!fit.lines.length) return '';
  const left = anchor === 'middle' ? x - fit.width / 2 : anchor === 'end' ? x - fit.width : x;
  noteText(left, y, left + fit.width, textBottom(fit, y));
  const { size, font, weight, italic, letterSpacing } = fit;
  const ls = letterSpacing * size;
  const dx = spacingShift(anchor, ls);
  const a = textGroupAttrs({ font, size, weight, italic, letterSpacing: ls, fill, anchor, opacity, attrs });
  const rows = fit.lines
    .map((ln, i) => `<text x="${n(x + dx)}" y="${n(baselineOf(fit, y, i))}">${escapeXml(ln)}</text>`)
    .join('');
  return `<g ${a}>${rows}</g>`;
}

/** @typedef {{ x0: number, y0: number, x1: number, y1: number }} TextBox  where some text was drawn */

/** The text drawn while a cover renders (see recordText), or null when nothing records it. @type {TextBox[] | null} */
let textBoxes = null;

/**
 * Note that text was drawn in this box, so a badge can be placed clear of it. drawText and
 * drawStack do this themselves; styles that write their own text elements call it.
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 */
export function noteText(x0, y0, x1, y1) {
  if (textBoxes && [x0, y0, x1, y1].every(Number.isFinite)) textBoxes.push({ x0, y0, x1, y1 });
}

/**
 * Run `draw` and collect the boxes of the text it draws.
 * @template T @param {() => T} draw @returns {{ result: T, boxes: TextBox[] }}
 */
export function recordText(draw) {
  const outer = textBoxes;
  textBoxes = [];
  try {
    const result = draw();
    return { result, boxes: textBoxes };
  } finally {
    textBoxes = outer;
  }
}

/** Visual bottom of a fit placed at `y`, including descenders (and marks below). */
export const textBottom = (fit, y) => (fit.lines.length ? y + fit.height + fit.size * (fit.below ?? DESCENT) : y);
