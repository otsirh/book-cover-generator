// Print covers: a paperback's back, spine and front as one SVG, at the size a print service takes
// it. The rules are Amazon KDP's: 0.125 in of bleed, a spine as wide as the pages are thick, text
// on the spine only from 80 pages, and the barcode's box at the foot of the back cover. Other
// printers' are close; `bleed` and `pageThickness` change the numbers.
import { createCover } from './index.js';
import { escapeXml, grain, hashString, isHex, n } from './core.js';
import {
  FONTS,
  cleanText,
  descentOf,
  drawText,
  fitText,
  graphemes,
  markExtent,
  measureText,
  spacingShift,
  textGroupAttrs,
  toUpper,
  wrapText,
} from './text.js';
import { strongAccents, textColor } from './styles/util.js';
import { fontEntries, idFor } from './shared.js';

/** The SVG's units: CSS px, 96 to the inch, so it shows at its printed size. */
const PX = 96;
/** A typographic point, in px. */
const PT = PX / 72;

/** How thick a page is, in inches, on each paper (KDP's figures). */
export const paperTypes = Object.freeze({ white: 0.002252, cream: 0.0025, color: 0.002252, 'premium-color': 0.002347 });

/** Amazon KDP's paperback trim sizes (width × height, in inches), by name. */
export const trimSizes = Object.freeze({
  '5x8': Object.freeze([5, 8]),
  '5.06x7.81': Object.freeze([5.06, 7.81]),
  '5.25x8': Object.freeze([5.25, 8]),
  '5.5x8.5': Object.freeze([5.5, 8.5]),
  '6x9': Object.freeze([6, 9]),
  '6.14x9.21': Object.freeze([6.14, 9.21]),
  '6.69x9.61': Object.freeze([6.69, 9.61]),
  '7x10': Object.freeze([7, 10]),
  '7.44x9.69': Object.freeze([7.44, 9.69]),
  '7.5x9.25': Object.freeze([7.5, 9.25]),
  '8x10': Object.freeze([8, 10]),
  '8.25x6': Object.freeze([8.25, 6]),
  '8.25x8.25': Object.freeze([8.25, 8.25]),
  '8.27x11.69': Object.freeze([8.27, 11.69]),
  '8.5x8.5': Object.freeze([8.5, 8.5]),
  '8.5x11': Object.freeze([8.5, 11]),
});

/**
 * The most pages KDP prints at the trims that take fewer than `printLimits.pages` (the widest and
 * the A4), on each paper; null where the paper isn't offered at that size.
 * @type {Readonly<Record<string, Readonly<Record<keyof typeof paperTypes, number | null>>>>}
 */
const FEWER_PAGES = Object.freeze({
  '8.25x6': Object.freeze({ white: 800, cream: 750, color: 600, 'premium-color': 800 }),
  '8.25x8.25': Object.freeze({ white: 800, cream: 750, color: 600, 'premium-color': 800 }),
  '8.27x11.69': Object.freeze({ white: 780, cream: 730, color: null, 'premium-color': 590 }),
  '8.5x8.5': Object.freeze({ white: 590, cream: 550, color: 600, 'premium-color': 590 }),
  '8.5x11': Object.freeze({ white: 590, cream: 550, color: 600, 'premium-color': 590 }),
});

/** What a paperback can be (KDP): its trim, in inches, and its page count on each paper. */
export const printLimits = Object.freeze({
  width: Object.freeze([4, 8.5]),
  height: Object.freeze([6, 11.69]),
  pages: Object.freeze({
    white: Object.freeze([24, 828]),
    cream: Object.freeze([24, 776]),
    color: Object.freeze([72, 600]),
    'premium-color': Object.freeze([24, 828]),
  }),
  /** Below this many pages, the spine stays blank. */
  spineTextPages: 80,
});

/** Inches to a millionth: sizes without floating-point noise (0.13512, not 0.13512000000000002). @param {number} v */
const inch = (v) => Math.round(v * 1e6) / 1e6;

/** @param {unknown} value @param {string} name */
const positive = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${JSON.stringify(value)}`);
  }
  return value;
};

/** The paper's id, from a name in any case. @param {unknown} paper */
function paperOf(paper) {
  const id =
    typeof paper === 'string'
      ? paper
          .trim()
          .toLowerCase()
          .replace(/[\s_]+/g, '-')
      : paper;
  if (typeof id !== 'string' || !Object.hasOwn(paperTypes, id)) {
    throw new RangeError(`Unknown paper ${JSON.stringify(paper)}. Available: ${Object.keys(paperTypes).join(', ')}`);
  }
  return /** @type {keyof typeof paperTypes} */ (id);
}

/** @param {unknown} pages @param {string} paper */
function checkPages(pages, paper) {
  const [min, most] = printLimits.pages[/** @type {keyof typeof paperTypes} */ (paper)];
  if (typeof pages !== 'number' || !Number.isInteger(pages) || pages < min || pages > most) {
    throw new RangeError(
      `pages must be a whole number from ${min} to ${most} on ${paper} paper, got ${JSON.stringify(pages)}`,
    );
  }
  return pages;
}

/**
 * How wide a paperback's spine is, in inches: its page count times the thickness of its paper.
 * @param {number} pages @param {string} [paper]
 */
export function spineWidth(pages, paper = 'white') {
  const id = paperOf(paper);
  return inch(checkPages(pages, id) * paperTypes[id]);
}

/** A trim size, named ("6x9", "6 × 9") or as [width, height] in inches. @param {unknown} trim */
function trimOf(trim) {
  // (Trimmed and capped first, so the pattern has no runs of optional spaces to try every way of.)
  const typed = typeof trim === 'string' && trim.length <= 40 ? trim.trim() : null;
  const named = typed === null ? null : /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?: ?in)?$/i.exec(typed);
  const size = named ? [Number(named[1]), Number(named[2])] : trim;
  const [w, h] =
    Array.isArray(size) && size.length === 2 && size.every((v) => typeof v === 'number') ? size : [NaN, NaN];
  const [[w0, w1], [h0, h1]] = [printLimits.width, printLimits.height];
  if (!(w >= w0 && w <= w1 && h >= h0 && h <= h1)) {
    throw new RangeError(
      `trim must be a width from ${w0} to ${w1} in and a height from ${h0} to ${h1} in, as "6x9" or [6, 9]; got ${JSON.stringify(trim)}`,
    );
  }
  return /** @type {[number, number]} */ ([w, h]);
}

/**
 * Text for the back cover: its paragraphs (split at blank lines), each cleaned to one line, at most
 * `max` characters in all.
 * @param {unknown} value @param {number} max
 */
function paragraphsOf(value, max) {
  const out = [];
  let room = max;
  for (const typed of String(value ?? '')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .split(/\n\s*\n/)) {
    if (room <= 0) break;
    const para = cleanText(typed, room);
    if (!para) continue;
    out.push(para);
    room -= para.length;
  }
  return out;
}

/**
 * A paperback's whole cover: the back (with your blurb, and room for the barcode), the spine
 * (title and author, when the book is thick enough) and the front, which is the cover these
 * options draw, with its art running into the bleed. One SVG in inches' worth of CSS px (96 to
 * the inch); `svgToPdf` (in ./browser) makes the PDF a printer takes.
 * @param {import('./index.js').CoverOptions} [coverOptions]
 * @param {import('./index.js').PrintOptions} [print]
 */
export function createPrintCover(coverOptions = {}, print = /** @type {any} */ ({})) {
  if (!print || typeof print !== 'object') throw new TypeError('createPrintCover: pass the print options, with pages');
  const [tw, th] = trimOf(print.trim ?? '6x9');
  const paper = paperOf(print.paper ?? 'white');
  const pages = checkPages(print.pages, paper);
  // (Some of the largest trims take fewer pages, or not every paper.)
  const fewer = FEWER_PAGES[`${tw}x${th}`]?.[paper];
  if (fewer === null) throw new RangeError(`${paper} paper isn't printed at ${tw} × ${th} in`);
  if (fewer !== undefined && pages > fewer) {
    throw new RangeError(`A ${tw} × ${th} in book on ${paper} paper has at most ${fewer} pages, got ${pages}`);
  }
  const thickness = print.pageThickness == null ? paperTypes[paper] : positive(print.pageThickness, 'pageThickness');
  const bleed = print.bleed == null ? 0.125 : print.bleed === 0 ? 0 : positive(print.bleed, 'bleed');
  if (bleed > 0.5) throw new RangeError(`bleed must be at most 0.5 in, got ${bleed}`);
  const spine = inch(pages * thickness);
  const barcode = print.barcode !== false;

  /** @param {unknown} value @param {string} name */
  const colour = (value, name) => {
    if (value == null || value === '') return null;
    if (!isHex(value)) throw new RangeError(`${name} must be a hex colour, got ${JSON.stringify(value)}`);
    return /** @type {string} */ (value).trim().toLowerCase();
  };
  const backColor = colour(print.backColor, 'backColor');
  const spineColor = colour(print.spineColor, 'spineColor');

  // The front: the cover as designed, at the trim's shape.
  const front = createCover({ ...coverOptions, width: 600, height: Math.round((600 * th) / tw) });

  const b = bleed * PX;
  const backRight = b + tw * PX;
  const spineRight = backRight + spine * PX;
  const W = spineRight + tw * PX + b;
  const H = th * PX + 2 * b;
  const trimTop = b;
  const trimBottom = b + th * PX;

  const hook = cleanText(print.hook, 200);
  const blurb = paragraphsOf(print.blurb, 3000);
  const imprint = cleanText(print.imprint, 80);
  const uid = `pc${hashString(JSON.stringify([front.svg, tw, th, pages, thickness, bleed, hook, blurb, imprint, barcode])).toString(36)}`;

  // (The colour helpers read only the palette's colours.)
  const p = /** @type {import('./index.js').ResolvedPalette} */ (/** @type {unknown} */ (front.colors));
  // The back in the cover's background, the spine in its ink, unless you choose.
  const bg = backColor ?? front.colors.bg;
  const ink = front.colors.ink;
  const fontId = idFor(coverOptions.font, fontEntries());
  const titleFont = fontId ? FONTS[/** @type {keyof typeof FONTS} */ (fontId)] : null;
  const lang = front.lang ? ` lang="${escapeXml(front.lang)}" xml:lang="${escapeXml(front.lang)}"` : '';

  // Back and spine: the cover's background and ink, the spine in reverse. Each panel lies a little
  // under the next (the back under all of it, the spine a pixel under the front): where two meet
  // within a pixel, as they do at 300 dpi, the page never shows through as a hairline.
  const spineBg = spineColor ?? ink;
  let s = `<rect width="${n(W)}" height="${n(H)}" fill="${bg}"/>`;
  if (spine > 0)
    s += `<rect x="${n(backRight)}" width="${n(spineRight - backRight + 1)}" height="${n(H)}" fill="${spineBg}"/>`;

  // The back's text, in a column half an inch inside the trim.
  const margin = 0.5 * PX;
  const left = b + margin;
  const right = backRight - margin;
  const column = right - left;
  const box = barcode
    ? { x: backRight - 0.25 * PX - 2 * PX, y: trimBottom - 0.25 * PX - 1.2 * PX, width: 2 * PX, height: 1.2 * PX }
    : null;
  const bodyColor = textColor(p, bg, [ink, front.colors.bg]);
  let top = trimTop + margin;
  if (hook) {
    const fit = fitText(hook, {
      font: titleFont ?? FONTS.serif,
      weight: 700,
      maxWidth: column,
      maxSize: 20 * PT,
      minSize: 11 * PT,
      maxLines: 4,
      lineHeight: 1.2,
    });
    const color = textColor(p, bg, strongAccents(p, bg, 3));
    s += drawText(fit, { x: left, y: top, fill: color });
    top += fit.height + fit.size * 0.3 + 0.25 * PX;
  }
  // The imprint (publisher, website) at the foot, beside the barcode's box.
  const foot = trimBottom - margin;
  let bottom = foot;
  if (imprint) {
    const room = (box ? box.x - 0.25 * PX : right) - left;
    const fit = fitText(imprint, {
      font: FONTS.sans,
      weight: 600,
      maxWidth: room,
      maxSize: 8 * PT,
      minSize: 6 * PT,
      maxLines: 1,
      letterSpacing: 0.04,
    });
    // (Its baseline on the foot margin, at the size it is set: 6 pt, if fitText went below.)
    const set = atLeast(fit, imprint, 6 * PT, room);
    const above = set.size * ((set.above ?? 0) + set.cap);
    s += drawText(set, { x: left, y: foot - above, fill: bodyColor });
    bottom = foot - above - 0.2 * PX;
  }
  if (box) bottom = Math.min(bottom, box.y - 0.25 * PX);
  if (blurb.length) s += blurbText(blurb, left, top, column, Math.max(0, bottom - top), bodyColor);

  // The spine: title and author, reading top to bottom (letters' tops toward the front), with
  // 1/16 in clear on each side; from KDP's 80 pages, and when the type would be readable.
  let spineText = false;
  const across = spine * PX - 2 * 0.0625 * PX;
  const spineFont = titleFont ?? FONTS.sans;
  // (In the cover's language: Turkish "istanbul" is İSTANBUL.)
  const upper = (/** @type {string} */ t) => toUpper(t, front.lang);
  const spineTitle = upper(front.title.replace(/\n/g, ' '));
  const author = upper(front.author);
  // As large as the line's ink fits across, accents above and tails below included (É, Ç, Q, 夜).
  const sizeMax = Math.min(across / inkHeight(spineTitle, spineFont), 22 * PT);
  if (pages >= printLimits.spineTextPages && sizeMax >= 6 * PT) {
    const along = th * PX - 2 * 0.375 * PX;
    const spineInk = textColor(p, spineBg, [front.colors.bg, ink]);
    const title = atLeast(
      fitText(spineTitle, {
        font: spineFont,
        weight: 700,
        maxWidth: author ? along * 0.62 : along,
        maxSize: sizeMax,
        minSize: 6 * PT,
        maxLines: 1,
        letterSpacing: 0.08,
      }),
      spineTitle,
      6 * PT,
      author ? along * 0.62 : along,
    );
    // The author too, when the spine is thick enough for them at 6 pt or more; else the title alone.
    const byMax = Math.min(across / inkHeight(author, FONTS.sans), sizeMax * 0.8, title.size);
    const by =
      author && byMax >= 6 * PT
        ? atLeast(
            fitText(author, {
              font: FONTS.sans,
              weight: 500,
              maxWidth: along * 0.32,
              maxSize: byMax,
              minSize: 6 * PT,
              maxLines: 1,
              letterSpacing: 0.08,
            }),
            author,
            6 * PT,
            along * 0.32,
          )
        : null;
    const cx = (backRight + spineRight) / 2;
    s += `<g transform="translate(${n(cx)} ${n(trimTop + 0.375 * PX)}) rotate(90)">`;
    s += spineLine(title, 0, 'start', spineInk);
    if (by) s += spineLine(by, along, 'end', textColor(p, spineBg, [...strongAccents(p, spineBg, 3), spineInk]));
    s += '</g>';
    spineText = true;
  }

  // Film grain over the back and spine too, as the front has it.
  if (coverOptions.texture) {
    // (Its grain as fine as the front's, which scales with the front's shorter side.)
    const c = {
      id: (/** @type {string} */ name) => `${uid}-${name}`,
      u: (Math.min(tw, th) * PX) / 600,
      W: spineRight,
      H,
    };
    const darkGrain = grain(c, { opacity: 0.1, id: 'texture-dark', seed: 3 });
    const lightGrain = grain(c, { opacity: 0.08, light: true, id: 'texture-light', seed: 11 });
    s += `<defs>${darkGrain.defs}${lightGrain.defs}</defs>${darkGrain.layer}${lightGrain.layer}`;
  }

  // The front at the trim, its art carried into the bleed by mirror images of its edges: nothing
  // on it moves toward the cut. Under them all, the front stretched over the whole panel, so the
  // trim line, where the front and its mirrors meet within a pixel, shows no seam.
  const art = `${uid}-front`;
  const [fx, fy, fw, fh] = [spineRight, b, tw * PX, th * PX];
  s += `<defs><symbol id="${art}" viewBox="0 0 ${front.width} ${front.height}" preserveAspectRatio="none">${front.body}</symbol>`;
  /** @type {[string, number, number, number, number, string][]} */
  const mirrors = b
    ? [
        ['r', fx + fw, fy, b, fh, `-1 0 0 1 ${n(2 * (fx + fw))} 0`],
        ['t', fx, 0, fw, b, `1 0 0 -1 0 ${n(2 * fy)}`],
        ['b', fx, fy + fh, fw, b, `1 0 0 -1 0 ${n(2 * (fy + fh))}`],
        ['tr', fx + fw, 0, b, b, `-1 0 0 -1 ${n(2 * (fx + fw))} ${n(2 * fy)}`],
        ['br', fx + fw, fy + fh, b, b, `-1 0 0 -1 ${n(2 * (fx + fw))} ${n(2 * (fy + fh))}`],
      ]
    : [];
  for (const [side, x, y, w, h] of mirrors) {
    s += `<clipPath id="${art}-${side}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/></clipPath>`;
  }
  s += '</defs>';
  const use = `href="#${art}" x="${n(fx)}" y="${n(fy)}" width="${n(fw)}" height="${n(fh)}"`;
  if (b) s += `<use href="#${art}" x="${n(fx)}" y="0" width="${n(fw + b)}" height="${n(H)}"/>`;
  for (const [side, , , , , matrix] of mirrors) {
    s += `<g clip-path="url(#${art}-${side})"><use ${use} transform="matrix(${matrix})"/></g>`;
  }
  s += `<use ${use}/>`;

  // Guides (for a preview, not for the printer): the trim, the folds and the barcode's box.
  if (print.guides) {
    // (Lines a pixel and a half wide however small the preview: vector-effect isn't inherited.)
    const guide =
      'fill="none" stroke="#ff00ff" stroke-width="1.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"';
    s += `<rect x="${n(b)}" y="${n(b)}" width="${n(W - 2 * b)}" height="${n(th * PX)}" ${guide}/>`;
    if (spine > 0) s += `<path d="M${n(backRight)} 0V${n(H)}M${n(spineRight)} 0V${n(H)}" ${guide}/>`;
    if (box) s += `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" ${guide}/>`;
  }

  const label = escapeXml(
    `Paperback cover: ${front.title.replace(/\n/g, ' ')}${front.author ? ` by ${front.author}` : ''}`,
  );
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}"${lang} role="img" aria-label="${label}">` +
    `<title>${label}</title>${s}</svg>`;
  return {
    svg,
    width: n(W),
    height: n(H),
    inches: {
      width: inch(2 * bleed + 2 * tw + spine),
      height: inch(2 * bleed + th),
      trim: /** @type {[number, number]} */ ([tw, th]),
      spine,
      bleed,
    },
    spineText,
    barcode: box,
    front,
  };
}

/**
 * `text` cut to `width` at `size` with an ellipsis, if it's wider: whole words dropped from its
 * end where it has spaces, else characters (Japanese, Thai, a long address), so something is
 * always left before the ellipsis.
 * @param {string} text @param {number} size @param {number} width @param {import('./text.js').TextSpec} spec
 */
function ellipsized(text, size, width, spec) {
  if (measureText(text, size, spec) <= width) return text;
  let cut = text;
  while (cut && measureText(`${cut}…`, size, spec) > width) {
    cut = /\s\S/.test(cut) ? cut.replace(/\s*\S+\s*$/, '') : graphemes(cut).slice(0, -1).join('');
  }
  return `${cut.replace(/[\s,;:.·]+$/, '')}…`;
}

/**
 * A one-line fit at `min` at least: fitText goes below its smallest size for a word that won't
 * fit; this sets the line at `min` instead, cut with an ellipsis to `width`.
 * @param {import('./text.js').TextFit} fit @param {string} text @param {number} min @param {number} width
 */
function atLeast(fit, text, min, width) {
  if (fit.size >= min - 0.01) return fit;
  const spec = { font: fit.font, weight: fit.weight, italic: fit.italic, letterSpacing: fit.letterSpacing };
  const line = ellipsized(text, min, width, spec);
  return { ...fit, size: min, lines: [line], width: measureText(line, min, spec) };
}

/**
 * One line along the spine (in the spine's turned coordinates: x along it, the line centred on 0).
 * @param {import('./text.js').TextFit} fit @param {number} x @param {'start' | 'end'} anchor @param {string} fill
 */
function spineLine(fit, x, anchor, fill) {
  if (!fit.lines.length) return '';
  const { size, font, weight, letterSpacing } = fit;
  const line = fit.lines[0];
  const ls = letterSpacing * size;
  const attrs = textGroupAttrs({ font, size, weight, letterSpacing: ls, fill, anchor });
  // The line's ink centred on the spine: from its accents' tops to its tails' bottoms.
  const baseline = ((inkAbove(line, font) - inkBelow(line)) / 2) * size;
  return `<g ${attrs}><text x="${n(x + spacingShift(anchor, ls))}" y="${n(baseline)}">${escapeXml(line)}</text></g>`;
}

/**
 * How tall a line's ink is, in em: its capitals and any accents above them, and the tails and
 * marks below the baseline; with a little to spare, as fonts differ from the measured ones.
 * @param {string} text @param {import('./text.js').FontSpec} font
 */
const inkHeight = (text, font) => (inkAbove(text, font) + inkBelow(text)) * 1.08;

// Characters whose ink reaches past what descentOf and markExtent allow for in some fonts:
// old-style figures (Georgia, Hoefler Text: 3 4 5 7 9 hang below), a J with a tail, brackets, bars.
const LOW = /[0-9J[\]{}|$@/\\]/;
const TALL = /[[\]{}()|$@/\\]/;
/**
 * How far a line's ink reaches above its baseline, in em. (Capitals at least 0.76 em tall: the PDF
 * is drawn with the fonts the browser has, and where a stack's first font is missing, the one it
 * falls back to may have taller capitals, as DejaVu has against Garamond.)
 * @param {string} line @param {import('./text.js').FontSpec} font
 */
const inkAbove = (line, font) =>
  Math.max(font.cap ?? 0.72, 0.76) + Math.max(markExtent(line).above, TALL.test(line) ? 0.1 : 0);
/** How far a line's ink reaches below its baseline, in em. @param {string} line */
const inkBelow = (line) => Math.max(descentOf(line), LOW.test(line) ? 0.24 : 0);

/**
 * The blurb's paragraphs, as large as fits the column (12 pt down to 8 pt), cut with an ellipsis
 * if even the smallest is too much.
 * @param {string[]} paragraphs @param {number} x @param {number} y @param {number} width @param {number} height @param {string} fill
 */
function blurbText(paragraphs, x, y, width, height, fill) {
  const font = FONTS.serif;
  const lineHeight = 1.42;
  const cap = font.cap ?? 0.72;
  /** @param {number} size */
  const layout = (size) => {
    const wrapped = paragraphs.map((p) => wrapText(p, size, width, { font }));
    const count = wrapped.reduce((sum, l) => sum + l.length, 0);
    const tall = cap * size + (count - 1) * size * lineHeight + (wrapped.length - 1) * size * 0.7 + size * 0.3;
    return { wrapped, tall };
  };
  // The largest size, in quarter points, at which it all fits.
  const steps = Array.from({ length: 17 }, (_, i) => (12 - i * 0.25) * PT);
  let size = steps[steps.length - 1];
  let { wrapped } = layout(size);
  for (const step of steps) {
    const tried = layout(step);
    if (tried.tall <= height) {
      size = step;
      wrapped = tried.wrapped;
      break;
    }
  }
  // Too much even so: as many lines as fit, the last one ending in an ellipsis.
  /** @type {{ line: string, baseline: number }[]} */
  const rows = [];
  let baseline = y + cap * size;
  let cut = false;
  for (const [pi, para] of wrapped.entries()) {
    for (const line of para) {
      if (baseline + size * 0.3 > y + height + 0.01) {
        cut = true;
        break;
      }
      rows.push({ line, baseline });
      baseline += size * lineHeight;
    }
    if (cut) break;
    if (pi < wrapped.length - 1) baseline += size * 0.7;
  }
  if (cut && rows.length) {
    const last = rows[rows.length - 1];
    // (The row's own text, then an ellipsis: what follows it was cut.)
    last.line = ellipsized(`${last.line.replace(/[\s,;:.]+$/, '')}…`, size, width, { font });
  }
  const attrs = textGroupAttrs({ font, size, weight: 400, fill });
  return `<g ${attrs}>${rows.map((r) => `<text x="${n(x)}" y="${n(r.baseline)}">${escapeXml(r.line)}</text>`).join('')}</g>`;
}
