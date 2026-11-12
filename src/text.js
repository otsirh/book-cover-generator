// Text measurement, fitting (wrap + shrink-to-fit) and rendering.
//
// Only system font stacks are used so that covers render identically when the
// SVG is rasterised through <img>/<canvas> (which cannot load web fonts).

import { escapeXml, n } from './core.js';

// Each stack starts with the macOS face the style was drawn with, then close matches on
// Windows, Android and Linux (where Futura, Didot or Gill Sans are rarely installed), so
// the look survives other systems and SVGs opened elsewhere.
export const FONTS = {
  serif: {
    family: "Georgia, 'Times New Roman', Times, 'Noto Serif', 'DejaVu Serif', serif",
    widthFactor: 1.1,
    cap: 0.7,
  },
  didone: {
    family: "Didot, 'Bodoni 72', 'Bodoni MT', 'Sitka Display', 'Noto Serif Display', Constantia, Georgia, serif",
    widthFactor: 1.04,
    cap: 0.68,
  },
  garamond: {
    family:
      "Garamond, 'EB Garamond', 'Hoefler Text', Baskerville, 'Palatino Linotype', Palatino, 'URW Palladio L', Georgia, serif",
    widthFactor: 0.98,
    cap: 0.66,
  },
  sans: {
    family: "'Helvetica Neue', Helvetica, Arial, Roboto, 'Liberation Sans', sans-serif",
    widthFactor: 1.0,
    cap: 0.72,
  },
  geometric: {
    family:
      "Futura, 'Century Gothic', 'Avenir Next', Avenir, 'URW Gothic', 'TeX Gyre Adventor', 'Trebuchet MS', sans-serif",
    widthFactor: 1.06,
    cap: 0.72,
  },
  humanist: {
    family: "'Gill Sans', 'Gill Sans MT', Seravek, Calibri, 'Segoe UI', 'Trebuchet MS', 'Noto Sans', sans-serif",
    widthFactor: 0.96,
    cap: 0.69,
  },
  condensed: {
    family:
      "'Avenir Next Condensed', 'Arial Narrow', 'Bahnschrift Condensed', 'Roboto Condensed', sans-serif-condensed, 'Liberation Sans Narrow', 'Helvetica Neue', sans-serif",
    widthFactor: 0.84,
    cap: 0.7,
  },
  display: {
    family:
      "Impact, Haettenschweiler, 'Arial Narrow Bold', 'Franklin Gothic Bold', Anton, Oswald, sans-serif-condensed, sans-serif",
    widthFactor: 0.82,
    cap: 0.79,
  },
  mono: {
    family: "'Courier New', Courier, 'Liberation Mono', 'Noto Mono', monospace",
    mono: true,
    widthFactor: 1,
    cap: 0.6,
  },
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
  if (fn != null && typeof fn !== 'function') {
    throw new TypeError('setTextMeasurer: pass a function (text, size, font) => width in px, or null');
  }
  customMeasure = fn ?? null;
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

/** @typedef {{ text: string, space: boolean }} Token  A wrap unit; `space` means a space comes before it. */

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
      pieces.push({ text: piece(end), space });
      space = false;
      start = end;
    }
  }
  return wrapGreedy(pieces, maxWidth, measure) ?? pieces.map((piece) => piece.text);
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

  let str = String(text ?? '')
    .replace(BREAKING_SPACE, ' ')
    .trim();
  if (opts.upper) str = str.toUpperCase();
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

  const tokens = tokenize(str);
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
      return finish(lines, size);
    }
    if (size <= minSize) break;
    size = Math.max(minSize, size * 0.95);
  }

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
  const { size, font, weight, italic, letterSpacing } = fit;
  const ls = letterSpacing * size;
  const dx = spacingShift(anchor, ls);
  const a = textGroupAttrs({ font, size, weight, italic, letterSpacing: ls, fill, anchor, opacity, attrs });
  const rows = fit.lines
    .map((ln, i) => `<text x="${n(x + dx)}" y="${n(baselineOf(fit, y, i))}">${escapeXml(ln)}</text>`)
    .join('');
  return `<g ${a}>${rows}</g>`;
}

/** Visual bottom of a fit placed at `y`, including descenders (and marks below). */
export const textBottom = (fit, y) => (fit.lines.length ? y + fit.height + fit.size * (fit.below ?? DESCENT) : y);
