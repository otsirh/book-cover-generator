import {
  n,
  rect,
  circle,
  line,
  path,
  pathD,
  mix,
  readable,
  inkOn,
  escapeXml,
  radialGradient,
  contrast,
} from '../core.js';
import {
  FONTS,
  fitText,
  drawText,
  textBottom,
  graphemes,
  measureText,
  textGroupAttrs,
  baselineOf,
  typedLines,
  noteText,
} from '../text.js';
import { titleBlock, authorFit } from '../type.js';
import { strongAccents, flower, initialChars, textPanel, textColor } from './util.js';

/** @typedef {import('../index.js').StyleContext} Ctx */

export const classic = {
  id: 'classic',
  name: 'Classic Paperback',
  group: 'Vintage',
  description: 'Three horizontal bands, like a mid-century paperback.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    // Dark palettes use their own background for the bands and their light ink for the panel.
    const band = p.dark ? p.bg : rng.pick(strongAccents(p, p.bg, 1.3));
    const panel = p.dark ? mix(p.ink, '#ffffff', 0.15) : mix(p.paper, '#ffffff', 0.2);
    const ink = inkOn(panel, p);
    const b1 = H * 0.28;
    const b2 = H * 0.72;
    const onBand = inkOn(band, { ink: panel, bg: ink });

    let s = rect(0, 0, W, H, band) + rect(0, b1, W, b2 - b1, panel);
    s += rect(0, b1 + 9 * u, W, 1.2 * u, band) + rect(0, b2 - 10.2 * u, W, 1.2 * u, band);

    const a = authorFit(c, {
      font: FONTS.humanist,
      weight: 600,
      letterSpacing: 0.2,
      maxWidth: W - m * 2.4,
      maxHeight: b1 * 0.45,
      maxSize: S * 0.052,
    });
    s += drawText(a, { x: W / 2, y: (b1 - a.height) / 2 + m * 0.2, anchor: 'middle', fill: onBand });

    const pad = m * 0.8;
    const t = titleBlock(c, {
      font: rng.pick([FONTS.humanist, FONTS.serif, FONTS.garamond]),
      maxWidth: W - m * 2.2,
      maxHeight: b2 - b1 - pad * 2 - 20 * u,
      maxSize: S * 0.15,
      lineHeight: 1.1,
      maxLines: 5,
    });
    s += t.draw({ x: W / 2, y: b1 + (b2 - b1 - t.height) / 2, anchor: 'middle', fill: ink });

    const er = Math.min(S * 0.07, (H - b2) * 0.28);
    const ey = (b2 + H) / 2;
    s += circle(W / 2, ey, er, panel, `stroke="${ink}" stroke-width="${n(1.5 * u)}"`);
    const initial = initialChars(c.title)[0];
    if (initial) {
      const fill = contrast(band, panel) >= 3 ? band : ink;
      const attrs = textGroupAttrs({ font: FONTS.serif, size: er * 1.1, anchor: 'middle', fill });
      s += `<text x="${n(W / 2)}" y="${n(ey + er * 0.38)}" ${attrs}>${escapeXml(initial)}</text>`;
    }
    return s;
  },
};

/** @param {number} x @param {number} y @param {number} sx @param {number} sy @param {string} gold @param {number} u */
function decoCorner(x, y, sx, sy, gold, u) {
  let o = '';
  for (let k = 0; k < 3; k++) {
    const d = (10 + k * 9) * u;
    o += `<path d="M${n(x + sx * d)} ${n(y)}L${n(x + sx * d)} ${n(y + sy * d)}L${n(x)} ${n(y + sy * d)}" fill="none" stroke="${gold}" stroke-width="${n(1.2 * u)}"/>`;
  }
  return o;
}

export const artdeco = {
  id: 'artdeco',
  name: 'Art Deco',
  group: 'Vintage',
  description: 'Gilded frame, sunburst fan and stepped ornaments.',
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    // Dark palettes: gold on night. Light palettes: cream with gilt or ink lines.
    const bg = p.bg;
    const light = p.ink;
    const gold = readable(bg, p.accents);
    const i1 = m * 0.45;
    const i2 = i1 + 8 * u;

    let s = rect(0, 0, W, H, bg);
    const fx = W / 2;
    const fy = H - i2;
    const R = Math.min(S * 0.42, H * 0.28);
    const rays = rng.pick([18, 24, 30]);
    let fan = '';
    for (let i = 0; i < rays; i += 2) {
      const a0 = Math.PI + (i / rays) * Math.PI;
      const a1 = Math.PI + ((i + 1) / rays) * Math.PI;
      fan += pathD(
        [
          [fx, fy],
          [fx + R * Math.cos(a0), fy + R * Math.sin(a0)],
          [fx + R * Math.cos(a1), fy + R * Math.sin(a1)],
        ],
        true,
      );
    }
    s += path(fan, gold, 'opacity="0.2"');
    for (const k of [0.36, 0.62, 1]) {
      s += `<path d="M${n(fx - R * k)} ${n(fy)}A${n(R * k)} ${n(R * k)} 0 0 1 ${n(fx + R * k)} ${n(fy)}" fill="none" stroke="${gold}" stroke-width="${n(1.4 * u)}" opacity="0.7"/>`;
    }
    s += `<path d="M${n(fx - R * 0.18)} ${n(fy)}A${n(R * 0.18)} ${n(R * 0.18)} 0 0 1 ${n(fx + R * 0.18)} ${n(fy)}Z" fill="${gold}"/>`;
    s += rect(i1, i1, W - i1 * 2, H - i1 * 2, 'none', `stroke="${gold}" stroke-width="${n(2.5 * u)}"`);
    s += rect(i2, i2, W - i2 * 2, H - i2 * 2, 'none', `stroke="${gold}" stroke-width="${n(u)}"`);
    s += decoCorner(i2, i2, 1, 1, gold, u) + decoCorner(W - i2, i2, -1, 1, gold, u);
    s += decoCorner(i2, H - i2, 1, -1, gold, u) + decoCorner(W - i2, H - i2, -1, -1, gold, u);

    const topY = i2 + m * 1.2;
    for (let k = 0; k < 3; k++) {
      const w = (40 - k * 11) * u;
      const y = topY + k * 7 * u;
      s += `<path d="M${n(W / 2 - w)} ${n(y + 12 * u)}L${n(W / 2)} ${n(y)}L${n(W / 2 + w)} ${n(y + 12 * u)}" fill="none" stroke="${gold}" stroke-width="${n(1.4 * u)}"/>`;
    }

    const font = rng.pick([FONTS.didone, FONTS.condensed]);
    const titleColor = rng.bool(0.5) ? textColor(p, bg, [gold]) : light;
    const a = authorFit(c, {
      font: FONTS.geometric,
      weight: 500,
      letterSpacing: 0.28,
      maxWidth: W - m * 3,
      maxSize: S * 0.04,
    });
    const regionTop = topY + 34 * u + m * 0.3;
    const regionBottom = fy - R - m * 0.5;
    const divider = 26 * u;
    const authorBlock = a.lines.length ? divider + a.height : divider;
    const t = titleBlock(c, {
      font,
      weight: font === FONTS.condensed ? 600 : 400,
      upper: true,
      letterSpacing: 0.07,
      maxWidth: W - m * 3,
      maxHeight: regionBottom - regionTop - authorBlock - m * 0.6,
      maxSize: S * 0.15,
      lineHeight: 1.08,
      maxLines: 5,
    });
    const blockH = t.height + m * 0.6 + authorBlock;
    let y = regionTop + Math.max(0, (regionBottom - regionTop - blockH) / 2);
    s += t.draw({ x: W / 2, y, anchor: 'middle', fill: titleColor, leadFill: light });
    y += t.height + m * 0.6;
    const dy = y + 6 * u;
    s +=
      line(W / 2 - S * 0.16, dy, W / 2 - 10 * u, dy, gold, 1.2 * u) +
      line(W / 2 + 10 * u, dy, W / 2 + S * 0.16, dy, gold, 1.2 * u);
    s += path(
      pathD(
        [
          [W / 2, dy - 6 * u],
          [W / 2 + 6 * u, dy],
          [W / 2, dy + 6 * u],
          [W / 2 - 6 * u, dy],
        ],
        true,
      ),
      gold,
    );
    s += drawText(a, { x: W / 2, y: y + divider, anchor: 'middle', fill: light });
    return s;
  },
};

export const sunburst = {
  id: 'sunburst',
  name: 'Sunburst',
  group: 'Vintage',
  description: 'Vintage poster rays over a title banner.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const [c1, c2] = strongAccents(p, p.bg, 1.2).concat(p.accents);
    const cx = W / 2;
    // On square and wide covers the sun sits higher and smaller, so the banner below it
    // doesn't cover half of it.
    const tall = H / W >= 1.2;
    const cy = H * (tall ? rng.float(0.36, 0.46) : rng.float(0.24, 0.3));
    const rays = rng.pick([24, 32, 36, 48]);
    const R = Math.hypot(W, H);
    const off = rng.float(0, Math.PI);
    let wedges = '';
    for (let i = 0; i < rays; i += 2) {
      const a0 = off + (i / rays) * Math.PI * 2;
      const a1 = off + ((i + 1) / rays) * Math.PI * 2;
      wedges += pathD(
        [
          [cx, cy],
          [cx + R * Math.cos(a0), cy + R * Math.sin(a0)],
          [cx + R * Math.cos(a1), cy + R * Math.sin(a1)],
        ],
        true,
      );
    }
    let s = rect(0, 0, W, H, mix(c1, p.bg, 0.35));
    s += path(wedges, c1);
    const sr = S * (tall ? rng.float(0.12, 0.16) : rng.float(0.09, 0.12));
    s += circle(cx, cy, sr * 1.18, p.bg) + circle(cx, cy, sr, c2);

    const pad = m * 0.8;
    const innerW = W - m * 2 - pad * 2;
    const font = rng.pick([FONTS.display, FONTS.serif, FONTS.condensed]);
    const t = titleBlock(c, {
      font,
      weight: font === FONTS.condensed ? 700 : 400,
      upper: font !== FONTS.serif,
      maxWidth: innerW,
      maxHeight: H * 0.3,
      maxSize: S * 0.17,
      lineHeight: 1.0,
      maxLines: 4,
    });
    const a = authorFit(c, {
      font: FONTS.serif,
      weight: 400,
      upper: false,
      letterSpacing: 0,
      italic: true,
      maxWidth: innerW,
      maxSize: S * 0.05,
    });
    const {
      y: by,
      h: bandH,
      gap,
    } = textPanel(c, t, a, { pad, gap: m * 0.55, extra: 10 * u, top: cy + sr * 1.18 + m * 0.6 });
    s += rect(m, by, W - m * 2, bandH, p.bg);
    s += rect(
      m + 5 * u,
      by + 5 * u,
      W - m * 2 - 10 * u,
      bandH - 10 * u,
      'none',
      `stroke="${p.ink}" stroke-width="${n(1.5 * u)}"`,
    );
    s += t.draw({ x: W / 2, y: by + pad + 5 * u, anchor: 'middle', fill: p.ink });
    s += drawText(a, { x: W / 2, y: by + pad + 5 * u + t.height + gap, anchor: 'middle', fill: p.ink });
    return s;
  },
};

const STAMPS = ['MANUSCRIPT', 'FIRST DRAFT', 'ADVANCE COPY', 'UNCORRECTED PROOF', 'FILE COPY', 'APPROVED'];
// Scripts whose letters stand alone (no joining, conjuncts or reordering), so they can be typed one by
// one. Others (Arabic, Hebrew, Devanagari, Tamil, Myanmar…) are set as one run to keep their shaping.
const TYPED_BY_LETTER =
  /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Common}\p{Script=Inherited}]*$/u;

/**
 * Type a line character by character, each slightly off its baseline and ink level.
 * Characters advance by their measured width, so wide (e.g. CJK) glyphs don't overlap.
 * @param {string} str @param {number} x @param {number} y @param {number} size @param {number} weight
 * @param {import('../core.js').Rng} rng @param {string} color @param {'start' | 'middle'} [anchor]
 */
function typedLine(str, x, y, size, weight, rng, color, anchor = 'start') {
  const spec = { font: FONTS.mono, weight };
  const width = measureText(str, size, spec);
  const left = anchor === 'middle' ? x - width / 2 : x;
  noteText(left, y - size * 0.8, left + width, y + size * 0.3);
  if (!TYPED_BY_LETTER.test(str)) {
    // Keep joining, conjuncts and direction intact: one run of text, no per-letter jitter.
    return `<text x="${n(x)}" y="${n(y)}" ${textGroupAttrs({ ...spec, size, fill: color, anchor })}>${escapeXml(str)}</text>`;
  }
  let o = '';
  let cx = anchor === 'middle' ? x - width / 2 : x;
  for (const ch of graphemes(str)) {
    if (ch !== ' ') {
      const op = rng.float(0.72, 1).toFixed(2);
      o += `<tspan x="${n(cx + rng.float(-0.4, 0.4))}" y="${n(y + rng.float(-0.6, 0.6))}" fill-opacity="${op}">${escapeXml(ch)}</tspan>`;
    }
    cx += measureText(ch, size, spec);
  }
  return `<text ${textGroupAttrs({ ...spec, size, fill: color })}>${o}</text>`;
}

export const typewriter = {
  id: 'typewriter',
  name: 'Typewriter',
  group: 'Vintage',
  description: 'A typed manuscript title page with a rubber stamp.',
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    // A dark palette gives a carbon copy: a dark sheet with light type.
    const carbon = p.dark;
    const paper = carbon ? mix(p.bg, '#000000', 0.15) : mix(p.paper, '#f4ead4', 0.45);
    const ink = carbon ? mix(p.paper, '#ffffff', 0.2) : mix(p.night, '#222222', 0.4);
    const stampColor = readable(paper, p.accents);
    const ids = { tex: c.id('tex'), rough: c.id('rough'), stain: c.id('stain'), vig: c.id('vig') };
    let s = '<defs>';
    s += `<filter id="${ids.tex}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${+(0.9 / u).toFixed(3)}" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 0 0.15 1.4 0 0 0 -0.5"/></filter>`;
    s += `<filter id="${ids.rough}"><feTurbulence type="fractalNoise" baseFrequency="${+(0.06 / u).toFixed(3)}" numOctaves="2"/><feDisplacementMap in="SourceGraphic" scale="${n(5 * u)}"/></filter>`;
    s += `<filter id="${ids.stain}"><feTurbulence type="turbulence" baseFrequency="${+(0.03 / u).toFixed(3)}" numOctaves="2"/><feDisplacementMap in="SourceGraphic" scale="${n(9 * u)}"/></filter>`;
    s += radialGradient(
      ids.vig,
      [
        [0.55, '#000000', 0],
        [1, '#3a2a10', 0.22],
      ],
      { r: 0.75 },
    );
    s += '</defs>';
    s += rect(0, 0, W, H, paper);
    s += `<rect width="${W}" height="${H}" filter="url(#${ids.tex})" opacity="0.18"/>`;
    s += rect(0, 0, W, H, `url(#${ids.vig})`);

    if (rng.bool(0.55)) {
      const r = S * rng.float(0.11, 0.15);
      const cx = W * rng.pick([0.2, 0.8]);
      const cy = H * rng.pick([0.82, 0.88]);
      s += `<g filter="url(#${ids.stain})" opacity="0.2">${circle(cx, cy, r, 'none', `stroke="#7a4b2a" stroke-width="${n(7 * u)}"`)}${circle(cx + r * 0.08, cy - r * 0.05, r * 0.94, 'none', `stroke="#7a4b2a" stroke-width="${n(2 * u)}"`)}</g>`;
    }

    // Manuscript conventions: author top left, approximate word count top right.
    const small = S * 0.026;
    const headY = m * 1.3 + small * 0.6;
    if (c.author) {
      const head = fitText(c.author, { font: FONTS.mono, maxWidth: W * 0.5, maxSize: small, maxLines: 1 });
      if (head.lines[0]) s += typedLine(head.lines[0], m * 1.2, headY, head.size, 400, rng, ink);
    }
    const words = `approx. ${rng.int(55, 140)},000 words`;
    const wc = fitText(words, { font: FONTS.mono, maxWidth: W * 0.4, maxSize: small, maxLines: 1 });
    if (wc.lines[0]) s += typedLine(wc.lines[0], W - m * 1.2 - wc.width, headY, wc.size, 400, rng, ink);

    // The title page itself, centred.
    const maxW = W - m * 3;
    const t = fitText(c.title, {
      font: FONTS.mono,
      weight: 700,
      upper: true,
      maxWidth: maxW,
      maxHeight: H * 0.3,
      maxSize: S * 0.1,
      minSize: S * 0.03,
      lineHeight: 1.3,
      // (A title typed on more lines gets them all.)
      maxLines: Math.max(5, typedLines(c.title)),
    });
    const sub = c.subtitle
      ? fitText(c.subtitle, {
          font: FONTS.mono,
          maxWidth: maxW,
          // (A credit is a line of its own after the subtitle.)
          maxHeight: S * 0.1 * (1 + (typedLines(c.subtitle) - 1) * 0.5),
          maxSize: S * 0.036,
          maxLines: 1 + typedLines(c.subtitle),
          lineHeight: 1.3,
        })
      : null;
    // The series, typed above the title.
    const series = c.series
      ? fitText(c.series, {
          font: FONTS.mono,
          upper: true,
          letterSpacing: 0.08,
          maxWidth: maxW,
          maxHeight: S * 0.08,
          maxSize: S * 0.028,
          maxLines: 2,
          lineHeight: 1.3,
        })
      : null;
    // "by" only before a name in Latin script; "by Михаил Булгаков" reads as a mistake.
    const byline = /\p{Script=Latin}/u.test(c.author) ? `by ${c.author}` : c.author;
    const by = c.author
      ? fitText(byline, {
          font: FONTS.mono,
          maxWidth: maxW,
          maxHeight: S * 0.1,
          maxSize: S * 0.042,
          maxLines: 2,
          lineHeight: 1.3,
        })
      : null;
    const gap = S * 0.05;
    const underline = 8 * u;
    const seriesH = series?.lines.length ? textBottom(series, 0) + gap * 0.6 : 0;
    const blockH =
      seriesH +
      textBottom(t, 0) +
      underline +
      (sub ? gap * 0.6 + textBottom(sub, 0) : 0) +
      (by ? gap + textBottom(by, 0) : 0);
    // Centred a little above the middle, but below the typed header (a tall block on a square
    // cover would reach it).
    let y = Math.max(H * 0.42 - blockH / 2, headY + small * 0.5 + gap * 0.5);
    if (series && seriesH) {
      series.lines.forEach((ln, i) => {
        s += typedLine(ln, W / 2, baselineOf(series, y, i), series.size, 400, rng, ink, 'middle');
      });
      y += seriesH;
    }
    t.lines.forEach((ln, i) => {
      s += typedLine(ln, W / 2, baselineOf(t, y, i), t.size, 700, rng, ink, 'middle');
    });
    y = textBottom(t, y) + underline;
    const uw = t.width;
    s += line(
      W / 2 - uw / 2,
      y,
      W / 2 + uw / 2,
      y,
      ink,
      1.6 * u,
      `stroke-dasharray="${n(t.size * 0.5)} ${n(t.size * 0.1)}" opacity="0.85"`,
    );
    for (const [fit, space] of /** @type {[import('../text.js').TextFit | null, number][]} */ ([
      [sub, gap * 0.6],
      [by, gap],
    ])) {
      if (!fit) continue;
      y += space;
      fit.lines.forEach((ln, i) => {
        s += typedLine(ln, W / 2, baselineOf(fit, y, i), fit.size, 400, rng, ink, 'middle');
      });
      y = textBottom(fit, y);
    }
    const pg = fitText('- 1 -', { font: FONTS.mono, maxWidth: W, maxSize: S * 0.028 });
    s += drawText(pg, { x: W / 2, y: H - m * 1.2, anchor: 'middle', fill: ink, opacity: 0.7 });

    const word = rng.pick(STAMPS);
    const st = fitText(word, {
      font: FONTS.condensed,
      weight: 700,
      upper: true,
      letterSpacing: 0.12,
      maxWidth: W * 0.56,
      maxSize: S * 0.078,
      maxLines: 1,
    });
    const sp = st.size * 0.45;
    const sw = st.width + sp * 2;
    const shh = st.height + sp * 2;
    const scx = W * rng.float(0.5, 0.64);
    const scy = H * rng.float(0.7, 0.78);
    const ang = rng.float(-16, -6);
    let stamp = rect(
      scx - sw / 2,
      scy - shh / 2,
      sw,
      shh,
      'none',
      `stroke="${stampColor}" stroke-width="${n(4 * u)}" rx="${n(4 * u)}"`,
    );
    stamp += rect(
      scx - sw / 2 + 6 * u,
      scy - shh / 2 + 6 * u,
      sw - 12 * u,
      shh - 12 * u,
      'none',
      `stroke="${stampColor}" stroke-width="${n(1.5 * u)}" rx="${n(2 * u)}"`,
    );
    stamp += drawText(st, { x: scx, y: scy - st.height / 2, anchor: 'middle', fill: stampColor });
    s += `<g transform="rotate(${n(ang)} ${n(scx)} ${n(scy)})" filter="url(#${ids.rough})" opacity="0.82">${stamp}</g>`;
    return s;
  },
};

export const engraved = {
  id: 'engraved',
  name: 'Engraved',
  group: 'Vintage',
  description: 'A clothbound classic: ornamental border and a centre medallion.',
  variants: { motif: { label: 'Border', values: { diamond: 'Diamonds', leaf: 'Leaves', dot: 'Dots' } } },
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const cloth = p.bg;
    const gilt = rng.pick(strongAccents(p, cloth, 2).concat(p.ink));
    // The gilt decorates (border, rosette, rules); the text is in the palette's ink, which reads.
    const ink = inkOn(cloth, p);
    const o1 = m * 0.5;
    const band = S * 0.05;
    const o2 = o1 + band;

    let s = rect(0, 0, W, H, cloth);
    s += rect(o1, o1, W - o1 * 2, H - o1 * 2, 'none', `stroke="${gilt}" stroke-width="${n(2.5 * u)}"`);
    s += rect(o2, o2, W - o2 * 2, H - o2 * 2, 'none', `stroke="${gilt}" stroke-width="${n(1.2 * u)}"`);
    // A repeated motif runs around the border band.
    const motif = c.choose('motif', ['diamond', 'leaf', 'dot']);
    const step = band * 0.9;
    const mid = (o1 + o2) / 2;
    /** @param {number} x @param {number} y @param {number} rot */
    const unit = (x, y, rot) => {
      const k = band * 0.28;
      if (motif === 'diamond')
        return path(
          pathD(
            [
              [x, y - k],
              [x + k * 0.6, y],
              [x, y + k],
              [x - k * 0.6, y],
            ],
            true,
          ),
          gilt,
        );
      if (motif === 'leaf') {
        return `<path d="M${n(x - k)} ${n(y)}Q${n(x)} ${n(y - k * 0.8)} ${n(x + k)} ${n(y)}Q${n(x)} ${n(y + k * 0.8)} ${n(x - k)} ${n(y)}Z" fill="${gilt}" transform="rotate(${rot} ${n(x)} ${n(y)})"/>`;
      }
      return circle(x, y, k * 0.4, gilt);
    };
    for (let x = o2 + step; x < W - o2 - step / 2; x += step) s += unit(x, mid, 0) + unit(x, H - mid, 0);
    for (let y = o2 + step; y < H - o2 - step / 2; y += step) s += unit(mid, y, 90) + unit(W - mid, y, 90);
    for (const [x, y] of [
      [mid, mid],
      [W - mid, mid],
      [mid, H - mid],
      [W - mid, H - mid],
    ])
      s += flower(x, y, band * 0.48, gilt, gilt, 8, 0.45);

    // Centre medallion.
    const mr = Math.min(S * 0.13, H * 0.1);
    const my = H * 0.56;
    s += circle(W / 2, my, mr, 'none', `stroke="${gilt}" stroke-width="${n(1.6 * u)}"`);
    s += circle(W / 2, my, mr * 0.84, 'none', `stroke="${gilt}" stroke-width="${n(0.8 * u)}"`);
    s += flower(W / 2, my, mr * 0.62, gilt, gilt, rng.pick([6, 8, 12]), 0.45);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      s += circle(W / 2 + Math.cos(a) * mr * 0.92, my + Math.sin(a) * mr * 0.92, 1.4 * u, gilt);
    }
    for (const dir of [-1, 1]) {
      const x0 = W / 2 + dir * mr * 1.2;
      s += line(x0, my, x0 + dir * S * 0.12, my, gilt, 1.2 * u);
      s += path(
        pathD(
          [
            [x0 + dir * S * 0.12, my - 4 * u],
            [x0 + dir * (S * 0.12 + 6 * u), my],
            [x0 + dir * S * 0.12, my + 4 * u],
          ],
          true,
        ),
        gilt,
      );
    }

    const inner = W - o2 * 2 - m * 1.2;
    // The title is centred between the inner border and the medallion, and fits that region.
    const tTop = o2 + m * 0.9;
    const regionH = my - mr - m * 0.8 - tTop;
    const t = titleBlock(c, {
      font: rng.pick([FONTS.didone, FONTS.serif, FONTS.garamond]),
      weight: 600,
      upper: true,
      letterSpacing: 0.06,
      maxWidth: inner,
      maxHeight: regionH,
      maxSize: S * 0.13,
      lineHeight: 1.2,
      maxLines: 5,
    });
    s += t.draw({
      x: W / 2,
      y: tTop + Math.max(0, (regionH - t.height) / 2),
      anchor: 'middle',
      fill: ink,
    });
    const a = authorFit(c, { font: FONTS.serif, weight: 400, letterSpacing: 0.24, maxWidth: inner, maxSize: S * 0.04 });
    const aTop = my + mr + m * 0.8;
    s += drawText(a, {
      x: W / 2,
      y: aTop + Math.max(0, (H - o2 - m * 0.9 - aTop - a.height) / 2),
      anchor: 'middle',
      fill: ink,
    });
    return s;
  },
};
