// Mockups: a cover shown as a product (a flat shot, a book, an e-reader) or on a social card,
// for listings and cover reveals. Each is an SVG with the cover nested in it.

import { n, mix, escapeXml, hashString, contrast, readable, isHex } from './core.js';
import { FONTS, fitText, drawText, textBottom, clipGraphemes } from './text.js';

/** The kinds of mockup, with the size of each (or how it follows the cover's). */
export const mockupKinds = Object.freeze(['flat', 'book', 'ereader', 'card', 'square', 'story']);

/** The neutral backdrop of the product shots. */
const STUDIO = '#ecebe7';

/**
 * The cover's markup with its ids made a mockup's own (the mockup's tag before the cover's `bc…-`
 * prefix), so the cover and its mockups, or two mockups of it, can share a page.
 * @param {string} body @param {string} tag
 */
const ownIds = (body, tag) => {
  const uid = /\bid="(bc[0-9a-z]+)-/.exec(body)?.[1];
  return uid ? body.replace(new RegExp(`(id="|url\\(#|href="#)${uid}-`, 'g'), `$1${tag}-${uid}-`) : body;
};

/**
 * The cover nested at a place and size.
 * @param {{ width: number, height: number, body: string }} cover @param {number} x @param {number} y @param {number} w @param {number} h
 */
const nest = (cover, x, y, w, h) =>
  `<svg x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${cover.width} ${cover.height}" preserveAspectRatio="none" overflow="hidden">${cover.body}</svg>`;

/**
 * A soft shadow under a shape: blurred black, offset down.
 * @param {string} id @param {number} blur @param {number} dy @param {number} opacity
 */
const shadow = (id, blur, dy, opacity) =>
  `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">` +
  `<feGaussianBlur in="SourceAlpha" stdDeviation="${n(blur)}"/><feOffset dy="${n(dy)}"/>` +
  `<feComponentTransfer><feFuncA type="linear" slope="${opacity}"/></feComponentTransfer>` +
  `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

/**
 * A mockup's line as it draws it: on one line, at most 80 characters (cut between whole
 * characters: an emoji or accented letter is never split).
 * @param {unknown} text
 */
export const mockupText = (text) =>
  clipGraphemes(
    String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
    80,
  ).trim();

/**
 * The cover as a product or a social card.
 *
 * - `flat`: the cover on a backdrop with a soft shadow.
 * - `book`: a book turned a little, its spine showing.
 * - `ereader`: the cover on an e-reader's screen.
 * - `card` (1200 × 630, a link preview), `square` (1080 × 1080) and `story` (1080 × 1920): the
 *   cover on a background in its colours, with the title and author, and `text` if given ("Out now").
 *
 * @param {import('./index.js').Cover} cover  from createCover
 * @param {{ kind?: string, background?: string, text?: string }} [options]
 * @returns {{ svg: string, width: number, height: number, coverScale: number }}
 */
export function createMockup(cover, { kind = 'book', background: given, text = '' } = {}) {
  if (!cover || typeof cover.body !== 'string' || !(cover.width > 0) || !(cover.height > 0)) {
    throw new TypeError('createMockup: pass a cover from createCover');
  }
  if (!mockupKinds.includes(kind)) {
    throw new RangeError(`Unknown mockup "${kind}". Available: ${mockupKinds.join(', ')}`);
  }
  // (A hex colour as the library takes one everywhere: its spaces trimmed.)
  if (given != null && !isHex(given)) {
    throw new RangeError(`createMockup: background must be a hex colour, got ${JSON.stringify(given)}`);
  }
  const background = given == null ? undefined : given.trim();
  // Ids unique to this cover and kind of mockup, so several can share a page.
  const tag = `mk${hashString(cover.svg).toString(36)}-${kind}`;
  const id = (/** @type {string} */ name) => `${tag}-${name}`;
  const nested = { width: cover.width, height: cover.height, body: ownIds(cover.body, tag) };
  /** How many times its own size it shows the cover at, so far (the largest place). */
  let shown = 0;
  /** The cover nested at a place and size, noted. @param {number} x @param {number} y @param {number} w @param {number} h */
  const place = (x, y, w, h) => {
    shown = Math.max(shown, w / cover.width, h / cover.height);
    return nest(nested, x, y, w, h);
  };
  const { width: CW, height: CH, colors } = cover;
  const words = mockupText(text);
  const label = escapeXml(`${cover.title.replace(/\n/g, ' ')}${cover.author ? ` by ${cover.author}` : ''}`);

  // (The cover's language too, so Chinese characters keep that language's forms.)
  const lang = cover.lang ? ` lang="${escapeXml(cover.lang)}" xml:lang="${escapeXml(cover.lang)}"` : '';
  /** @param {number} W @param {number} H @param {string} inner */
  const wrap = (W, H, inner) => ({
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${n(W)} ${n(H)}"${lang} role="img" aria-label="${label}">` +
      `<title>${label}</title>${inner}</svg>`,
    width: Math.round(W),
    height: Math.round(H),
    coverScale: shown || 1,
  });

  if (kind === 'flat') {
    const pad = Math.min(CW, CH) * 0.14;
    const W = CW + pad * 2;
    const H = CH + pad * 2;
    const u = Math.min(CW, CH) / 600;
    return wrap(
      W,
      H,
      `<defs>${shadow(id('shadow'), 14 * u, 10 * u, 0.32)}</defs>` +
        `<rect width="${n(W)}" height="${n(H)}" fill="${background ?? STUDIO}"/>` +
        `<g filter="url(#${id('shadow')})">${place(pad, pad, CW, CH)}</g>`,
    );
  }

  if (kind === 'book') {
    // The front turned a little away (narrower, its far edge higher), with the spine at its left.
    const turn = 0.9;
    const rise = 0.07;
    const spine = CW * 0.075;
    const pad = Math.min(CW, CH) * 0.16;
    const W = spine + CW * turn + pad * 2;
    const H = CH + CW * rise + pad * 2;
    const x0 = pad + spine;
    const y0 = pad + CW * rise;
    const u = Math.min(CW, CH) / 600;
    const spineFill = mix(colors.bg, '#000000', 0.32);
    const sag = spine * 0.32;
    return wrap(
      W,
      H,
      `<defs>${shadow(id('soft'), 22 * u, 0, 1)}` +
        `<linearGradient id="${id('gloss')}" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0" stop-color="#000" stop-opacity="0.28"/><stop offset="0.04" stop-color="#fff" stop-opacity="0.16"/>` +
        `<stop offset="0.09" stop-color="#000" stop-opacity="0.05"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#fff" stop-opacity="0.08"/></linearGradient>` +
        `<linearGradient id="${id('spine')}" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0" stop-color="#000" stop-opacity="0.3"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.08"/>` +
        `<stop offset="1" stop-color="#000" stop-opacity="0.25"/></linearGradient></defs>` +
        `<rect width="${n(W)}" height="${n(H)}" fill="${background ?? STUDIO}"/>` +
        // The shadow on the floor.
        `<ellipse cx="${n(x0 + (CW * turn) / 2)}" cy="${n(y0 + CH - CW * rise * 0.3)}" rx="${n((CW * turn) / 2 + spine)}" ry="${n(CW * 0.035)}" fill="#000" opacity="0.28" filter="url(#${id('soft')})"/>` +
        `<polygon points="${n(x0 - spine)},${n(y0 + sag)} ${n(x0)},${n(y0)} ${n(x0)},${n(y0 + CH)} ${n(x0 - spine)},${n(y0 + CH - sag)}" fill="${spineFill}"/>` +
        `<polygon points="${n(x0 - spine)},${n(y0 + sag)} ${n(x0)},${n(y0)} ${n(x0)},${n(y0 + CH)} ${n(x0 - spine)},${n(y0 + CH - sag)}" fill="url(#${id('spine')})"/>` +
        `<g transform="matrix(${turn} ${-rise} 0 1 ${n(x0)} ${n(y0)})">${place(0, 0, CW, CH)}` +
        `<rect width="${CW}" height="${CH}" fill="url(#${id('gloss')})"/></g>`,
    );
  }

  if (kind === 'ereader') {
    const side = CW * 0.07;
    const top = CH * 0.07;
    const bottom = CH * 0.12;
    const pad = Math.min(CW, CH) * 0.14;
    const DW = CW + side * 2;
    const DH = CH + top + bottom;
    const W = DW + pad * 2;
    const H = DH + pad * 2;
    const u = Math.min(CW, CH) / 600;
    return wrap(
      W,
      H,
      `<defs>${shadow(id('shadow'), 16 * u, 12 * u, 0.35)}</defs>` +
        `<rect width="${n(W)}" height="${n(H)}" fill="${background ?? STUDIO}"/>` +
        `<g filter="url(#${id('shadow')})"><rect x="${n(pad)}" y="${n(pad)}" width="${n(DW)}" height="${n(DH)}" rx="${n(CW * 0.06)}" fill="#1c1c1e"/></g>` +
        `<rect x="${n(pad + 2 * u)}" y="${n(pad + 2 * u)}" width="${n(DW - 4 * u)}" height="${n(DH - 4 * u)}" rx="${n(CW * 0.055)}" fill="none" stroke="#3a3a3c" stroke-width="${n(1.5 * u)}"/>` +
        place(pad + side, pad + top, CW, CH) +
        `<rect x="${n(pad + DW / 2 - CW * 0.08)}" y="${n(pad + DH - bottom / 2 - 2 * u)}" width="${n(CW * 0.16)}" height="${n(4 * u)}" rx="${n(2 * u)}" fill="#3a3a3c"/>`,
    );
  }

  // Social cards: fixed sizes, in the cover's colours.
  const [W, H] = { card: [1200, 630], square: [1080, 1080], story: [1080, 1920] }[
    /** @type {'card' | 'square' | 'story'} */ (kind)
  ];
  const bg = background ?? mix(colors.bg, colors.dark ? '#000000' : colors.ink, colors.dark ? 0.35 : 0.08);
  // Whichever of near-black and near-white reads better on it.
  const ink = readable(bg, ['#141414', '#f7f5f0']);
  const u = Math.min(W, H) / 600;
  // Where the cover goes (as large as its area allows), where the words go, and their sizes.
  const layout = {
    card: { area: { x: 70, y: 63, w: 460, h: 504 }, below: 0, margin: 0, sizes: [64, 24, 28] },
    square: { area: { x: 120, y: 70, w: W - 240, h: 594 }, below: 60, margin: 70, sizes: [56, 26, 30] },
    story: { area: { x: 120, y: 240, w: W - 240, h: 980 }, below: 110, margin: 220, sizes: [72, 30, 36] },
  }[/** @type {'card' | 'square' | 'story'} */ (kind)];
  const { area } = layout;
  const [titleSize, authorSize, noteSize] = layout.sizes;
  const scale = Math.min(area.w / CW, area.h / CH);
  const cw = CW * scale;
  const ch = CH * scale;
  const cx = kind === 'card' ? area.x + (area.w - cw) / 2 : (W - cw) / 2;
  const cy = area.y + (area.h - ch) / 2;
  let s =
    `<defs>${shadow(id('shadow'), 18 * u, 14 * u, 0.4)}</defs>` +
    `<rect width="${W}" height="${H}" fill="${bg}"/>` +
    `<g filter="url(#${id('shadow')})">${place(cx, cy, cw, ch)}</g>`;
  // The words: beside the cover on a card, under it otherwise.
  const box =
    kind === 'card'
      ? { x: 590, y: 120, w: 540, h: 390, anchor: 'start' }
      : {
          x: W / 2,
          y: cy + ch + layout.below,
          w: W - 200,
          h: H - (cy + ch + layout.below) - layout.margin,
          anchor: 'middle',
        };
  const title = fitText(cover.title, {
    font: FONTS.serif,
    weight: 700,
    maxWidth: box.w,
    maxHeight: box.h * 0.55,
    maxSize: titleSize,
    maxLines: 4,
    lineHeight: 1.08,
  });
  const author = cover.author
    ? fitText(cover.author, {
        font: FONTS.sans,
        weight: 600,
        upper: true,
        lang: cover.lang,
        letterSpacing: 0.12,
        maxWidth: box.w,
        maxSize: authorSize,
        maxLines: 2,
      })
    : null;
  const note = words
    ? fitText(words, {
        font: FONTS.sans,
        weight: 700,
        maxWidth: box.w,
        maxSize: noteSize,
        maxLines: 2,
      })
    : null;
  const gap = kind === 'card' ? 22 : 18 * u;
  const blockH =
    textBottom(title, 0) + (author ? gap + textBottom(author, 0) : 0) + (note ? gap * 1.6 + textBottom(note, 0) : 0);
  let y = kind === 'card' ? box.y + (box.h - blockH) / 2 : box.y + Math.max(0, (box.h - blockH) / 2);
  const anchor = /** @type {'start' | 'middle'} */ (box.anchor);
  s += drawText(title, { x: box.x, y, anchor, fill: ink });
  y = textBottom(title, y);
  if (author) {
    y += gap;
    s += drawText(author, { x: box.x, y, anchor, fill: ink, opacity: 0.8 });
    y = textBottom(author, y);
  }
  if (note) {
    y += gap * 1.6;
    s += drawText(note, {
      x: box.x,
      y,
      anchor,
      // An accent if one reads on the background (3:1, for large bold text), else the ink.
      fill: colors.accents.find((a) => contrast(a, bg) >= 3) ?? ink,
    });
  }
  return wrap(W, H, s);
}
