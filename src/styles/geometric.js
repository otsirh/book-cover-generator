import { n, rect, circle, path, pathD, inkOn, mix, clamp, quarterDisc, halfDisc } from '../core.js';
import { FONTS, drawText } from '../text.js';
import { titleBlock, authorFit } from '../type.js';
import { strongAccents, fitTitleWith } from './util.js';

/** @typedef {import('../index.js').StyleContext} Ctx */

/**
 * @param {string} type @param {number} x @param {number} y @param {number} size @param {string} color @param {number} rot
 */
function bauhausShape(type, x, y, size, color, rot) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const tr = rot ? `transform="rotate(${rot} ${n(cx)} ${n(cy)})"` : '';
  switch (type) {
    case 'circle':
      return circle(cx, cy, size / 2, color);
    case 'dot':
      return circle(cx, cy, size * 0.2, color);
    case 'ring':
      return circle(cx, cy, size * 0.31, 'none', `stroke="${color}" stroke-width="${n(size * 0.14)}"`);
    case 'half':
      return path(halfDisc(x, y, size), color, tr);
    case 'quarter':
      return path(quarterDisc(x, y, size), color, tr);
    case 'triangle':
      return path(
        pathD(
          [
            [x, y + size],
            [x + size, y + size],
            [x, y],
          ],
          true,
        ),
        color,
        tr,
      );
    case 'square':
      return rect(x + size * 0.18, y + size * 0.18, size * 0.64, size * 0.64, color, tr);
    case 'bars': {
      let o = '';
      for (let i = 0; i < 3; i++) o += rect(x, y + size * (0.1 + i * 0.3), size, size * 0.2, color);
      return `<g ${tr}>${o}</g>`;
    }
    default:
      return '';
  }
}

const BAUHAUS_SHAPES = ['circle', 'half', 'half', 'quarter', 'quarter', 'triangle', 'square', 'ring', 'bars', 'dot'];

export const bauhaus = {
  id: 'bauhaus',
  name: 'Bauhaus',
  group: 'Geometric',
  description: 'A grid of primary geometric shapes.',
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const gw = W - m * 2;
    const colors = [...p.accents, p.ink];
    const square = S * 0.06;
    const a = authorFit(c, {
      font: FONTS.geometric,
      weight: 600,
      letterSpacing: 0.12,
      maxWidth: gw - square - m * 0.5,
      maxSize: S * 0.044,
    });
    const aY = H - m - a.height;

    // Square cells: 3 across a tall cover (4 on squarer ones), never taller than the grid area.
    const gridH = H * 0.62 - m;
    const cell = Math.min(gw / (W / H > 0.9 ? 4 : 3), gridH);
    const cols = Math.max(1, Math.floor(gw / cell + 1e-6));
    const maxRows = Math.max(1, Math.floor(gridH / cell + 1e-6));
    // Long titles get room: drop rows of shapes rather than shrinking the title.
    const { block: t, value: rows } = fitTitleWith(
      c,
      Array.from({ length: maxRows }, (_, i) => maxRows - i),
      (r) => ({
        font: FONTS.geometric,
        weight: 800,
        upper: true,
        maxWidth: gw,
        maxHeight: aY - m * 0.7 - (m + r * cell + m * 0.8),
        maxSize: S * 0.2,
        lineHeight: 1.0,
        maxLines: 5,
        subtitleFont: FONTS.geometric,
        subtitleItalic: false,
      }),
      0.085,
    );

    let s = rect(0, 0, W, H, p.bg);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = m + col * cell;
        const y = m + row * cell;
        /** @type {string | null} */
        let cellBg = null;
        if (rng.bool(0.4)) {
          cellBg = rng.pick(colors);
          s += rect(x, y, cell + 0.5, cell + 0.5, cellBg);
        }
        if (rng.bool(0.1)) continue;
        const choices = colors.filter((col2) => col2 !== cellBg);
        const color = choices.length ? rng.pick(choices) : p.bg;
        s += bauhausShape(rng.pick(BAUHAUS_SHAPES), x, y, cell, color, rng.int(0, 3) * 90);
      }
    }
    s += t.draw({ x: m, y: m + rows * cell + m * 0.8, fill: p.ink });
    s += drawText(a, { x: m, y: aY, fill: p.ink });
    s += rect(W - m - square, aY + a.height - square + 1, square, square, p.accents[0]);
    return s;
  },
};

/** @param {string} kind @param {number} cx @param {number} cy @param {number} r @param {string} fill */
function splitShape(kind, cx, cy, r, fill) {
  switch (kind) {
    case 'diamond':
      return path(
        pathD(
          [
            [cx, cy - r],
            [cx + r, cy],
            [cx, cy + r],
            [cx - r, cy],
          ],
          true,
        ),
        fill,
      );
    case 'square':
      return rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, fill);
    case 'triangle':
      return path(
        pathD(
          [
            [cx, cy - r],
            [cx + r * 1.05, cy + r * 0.8],
            [cx - r * 1.05, cy + r * 0.8],
          ],
          true,
        ),
        fill,
      );
    default:
      return circle(cx, cy, r, fill);
  }
}

export const split = {
  id: 'split',
  name: 'Split',
  group: 'Geometric',
  description: 'Two-tone field with an inverted shape on the seam.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const splitY = H * rng.float(0.52, 0.6);
    const A = rng.pick([...strongAccents(p, p.bg, 1.3), p.ink]);
    const B = p.bg;
    const kind = rng.pick(['circle', 'circle', 'diamond', 'square', 'triangle']);
    const r = Math.min(S * rng.float(0.18, 0.26), splitY * 0.3, (H - splitY) * 0.4);
    const cx = W * rng.float(0.3, 0.7);
    const top = c.id('top');
    const bottom = c.id('bottom');

    let s = `<defs><clipPath id="${top}">${rect(0, 0, W, splitY, '#000')}</clipPath><clipPath id="${bottom}">${rect(0, splitY, W, H - splitY, '#000')}</clipPath></defs>`;
    s += rect(0, 0, W, splitY + 0.5, A) + rect(0, splitY, W, H - splitY, B);
    s += `<g clip-path="url(#${top})">${splitShape(kind, cx, splitY, r, B)}</g>`;
    s += `<g clip-path="url(#${bottom})">${splitShape(kind, cx, splitY, r, A)}</g>`;

    const t = titleBlock(c, {
      font: rng.pick([FONTS.sans, FONTS.geometric, FONTS.didone]),
      weight: 700,
      stack: rng.bool(0.4),
      maxWidth: W - m * 2,
      maxHeight: splitY - r - m * 2,
      maxSize: S * 0.22,
      lineHeight: 1.0,
      maxLines: 5,
    });
    s += t.draw({ x: m, y: m * 1.15, fill: inkOn(A, p) });
    const a = authorFit(c, { upper: false, letterSpacing: 0, weight: 700, maxSize: S * 0.056 });
    s += drawText(a, { x: W - m, y: H - m * 1.15 - a.height, anchor: 'end', fill: p.ink });
    return s;
  },
};

export const blocks = {
  id: 'blocks',
  name: 'Blocks',
  group: 'Geometric',
  description: 'Neo-plastic grid of primary colour blocks.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const lw = u * rng.float(6, 11);
    const pad = m * 0.8;
    const innerW = W - lw - pad * 2;
    const font = rng.pick([FONTS.sans, FONTS.geometric]);
    const a = authorFit(c, { upper: false, letterSpacing: 0, weight: 700, maxWidth: innerW, maxSize: S * 0.05 });
    // The text cell grows (and the art shrinks) until the title fits comfortably.
    const start = H * rng.float(0.32, 0.38);
    const { block: t, value: textH } = fitTitleWith(
      c,
      Array.from({ length: 7 }, (_, i) => Math.min(start + i * H * 0.04, H * 0.56)),
      (cellH) => ({
        font,
        weight: 800,
        maxWidth: innerW,
        maxHeight: cellH - lw - pad * 2.6 - a.height,
        maxSize: S * 0.2,
        lineHeight: 1.0,
        maxLines: 4,
        subtitleFont: FONTS.sans,
        subtitleItalic: false,
      }),
    );
    const textTop = rng.bool(0.5);
    const textRect = textTop ? { x: 0, y: 0, w: W, h: textH } : { x: 0, y: H - textH, w: W, h: textH };
    const art = textTop ? { x: 0, y: textH, w: W, h: H - textH } : { x: 0, y: 0, w: W, h: H - textH };
    const minSide = S * 0.12;
    /** @type {{ x: number, y: number, w: number, h: number }[]} */
    const leaves = [];
    /** @param {{ x: number, y: number, w: number, h: number }} r @param {number} depth */
    const divide = (r, depth) => {
      const canV = r.w >= minSide * 2;
      const canH = r.h >= minSide * 2;
      if (depth <= 0 || (!canV && !canH) || (depth < 3 && rng.bool(0.25))) {
        leaves.push(r);
        return;
      }
      const vertical = canV && (!canH || (r.w > r.h ? rng.bool(0.75) : rng.bool(0.3)));
      const k = rng.float(0.3, 0.7);
      if (vertical) {
        const w1 = r.w * k;
        divide({ ...r, w: w1 }, depth - 1);
        divide({ ...r, x: r.x + w1, w: r.w - w1 }, depth - 1);
      } else {
        const h1 = r.h * k;
        divide({ ...r, h: h1 }, depth - 1);
        divide({ ...r, y: r.y + h1, h: r.h - h1 }, depth - 1);
      }
    };
    divide(art, 4);

    const paper = p.paper;
    const lines = p.night;
    const order = rng.shuffle(leaves.map((_, i) => i));
    const fills = new Array(leaves.length).fill(paper);
    order.forEach((idx, k) => {
      if (k < p.accents.length) fills[idx] = p.accents[k];
      else if (rng.bool(0.15)) fills[idx] = rng.pick([...p.accents, lines]);
    });

    let s = rect(0, 0, W, H, lines);
    leaves.forEach((r, i) => {
      s += rect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw, fills[i]);
    });
    s += rect(textRect.x + lw / 2, textRect.y + lw / 2, textRect.w - lw, textRect.h - lw, paper);

    const tTop = textRect.y + lw / 2 + pad;
    const aY = textRect.y + textRect.h - lw / 2 - pad - a.height;
    s += t.draw({ x: lw / 2 + pad, y: tTop, fill: lines });
    s += drawText(a, { x: lw / 2 + pad, y: aY, fill: lines });
    return s;
  },
};

export const concentric = {
  id: 'concentric',
  name: 'Concentric',
  group: 'Geometric',
  description: 'Rings, targets and tunnels.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const cx = W * rng.float(0.3, 0.7);
    const cy = H * rng.float(0.25, 0.33);
    const maxR = Math.min(S * rng.float(0.34, 0.46), H * 0.54 - cy);
    const mode = rng.pick(['alternate', 'gradient', 'tunnel', 'lines']);
    // The accents that stand out most against the background, so rings never go muddy.
    const strong = strongAccents(p, p.bg, 1.5);
    const c1 = strong[0];
    const c2 = strong[1] ?? mix(c1, p.bg, 0.4);
    const count = mode === 'lines' ? rng.int(16, 28) : rng.int(6, 13);
    const ang = rng.float(0, Math.PI * 2);
    const drift = (maxR * 0.45) / count;

    let s = rect(0, 0, W, H, p.bg);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const r = maxR * (1 - t);
      if (mode === 'lines') {
        const strokeColor = i % 4 === 0 ? c2 : c1;
        s += circle(cx, cy, r, 'none', `stroke="${strokeColor}" stroke-width="${n(u * (i % 4 === 0 ? 3 : 1.4))}"`);
      } else if (mode === 'tunnel') {
        s += circle(
          cx + Math.cos(ang) * drift * i,
          cy + Math.sin(ang) * drift * i,
          r,
          mix(c1, i % 2 ? p.bg : c2, t * 0.9),
        );
      } else {
        s += circle(cx, cy, r, mode === 'alternate' ? (i % 2 ? p.bg : c1) : mix(c1, c2, t));
      }
    }

    const a = authorFit(c, { maxSize: S * 0.044 });
    const aY = H - m * 1.2 - a.height;
    const top = cy + maxR + m * 0.8;
    const font = rng.pick([FONTS.serif, FONTS.sans, FONTS.condensed]);
    const t = titleBlock(c, {
      font,
      weight: font === FONTS.serif ? 400 : 700,
      upper: font === FONTS.condensed,
      maxWidth: W - m * 2,
      maxHeight: aY - m * 0.8 - top,
      maxSize: S * 0.17,
      lineHeight: 1.04,
      maxLines: 4,
    });
    s += t.draw({ x: W / 2, y: top + Math.max(0, (aY - m * 0.8 - top - t.height) / 2), anchor: 'middle', fill: p.ink });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: p.ink });
    return s;
  },
};

export const stripes = {
  id: 'stripes',
  name: 'Stripes',
  group: 'Geometric',
  description: 'Bold stripes, with the title on a plate or in open space.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const angle = rng.pick([0, 90, 45, -45, 30, -30, 60]);
    const colors = rng.shuffle([...p.accents, p.ink]).slice(0, rng.int(2, 3));
    const mode = rng.pick(['even', 'varied', 'gapped']);
    const layout = rng.pick(['plate', 'plate', 'open']);
    const diag = Math.hypot(W, H);
    const base = S * rng.float(0.035, 0.07);
    const stripeH = layout === 'open' ? H * rng.float(0.5, 0.58) : H;

    let bars = '';
    let x = -diag / 2;
    let i = 0;
    while (x < diag / 2) {
      const w = mode === 'varied' ? base * rng.float(0.35, 2.4) : base;
      const col =
        mode === 'varied' ? rng.pick(colors) : colors[Math.floor(i / (mode === 'gapped' ? 2 : 1)) % colors.length];
      if (mode !== 'gapped' || i % 2 === 0) bars += rect(W / 2 + x, H / 2 - diag / 2, w + 0.6 * u, diag, col);
      x += w;
      i++;
    }
    const clip = c.id('clip');
    let s = rect(0, 0, W, H, p.bg);
    s += `<defs><clipPath id="${clip}">${rect(0, 0, W, stripeH, '#000')}</clipPath></defs>`;
    s += `<g clip-path="url(#${clip})"><g transform="rotate(${angle} ${n(W / 2)} ${n(H / 2)})">${bars}</g></g>`;

    const font = rng.pick([FONTS.serif, FONTS.geometric, FONTS.didone]);
    const titleOpts = {
      font,
      weight: font === FONTS.geometric ? 800 : 400,
      upper: font === FONTS.geometric,
      lineHeight: 1.04,
      maxLines: 5,
    };
    if (layout === 'open') {
      const a = authorFit(c, { maxSize: S * 0.046 });
      const aY = H - m * 1.15 - a.height;
      const top = stripeH + m * 0.9;
      const t = titleBlock(c, { ...titleOpts, maxWidth: W - m * 2, maxHeight: aY - m * 0.7 - top, maxSize: S * 0.16 });
      s += t.draw({ x: m, y: top, fill: p.ink });
      s += drawText(a, { x: m, y: aY, fill: p.ink });
      return s;
    }
    const pad = m * 0.9;
    const plateW = W - m * 2;
    const innerW = plateW - pad * 2;
    const t = titleBlock(c, { ...titleOpts, maxWidth: innerW, maxHeight: H * 0.34, maxSize: S * 0.15 });
    const a = authorFit(c, { maxWidth: innerW, maxSize: S * 0.04 });
    const gap = a.lines.length ? m * 0.7 : 0;
    const plateH = pad * 2 + t.height + gap + a.height;
    const py = clamp(H * rng.pick([0.5, 0.58, 0.42]) - plateH / 2, m, H - m - plateH);
    s += rect(m, py, plateW, plateH, p.bg);
    s += rect(
      m + 6 * u,
      py + 6 * u,
      plateW - 12 * u,
      plateH - 12 * u,
      'none',
      `stroke="${p.ink}" stroke-width="${n(1.5 * u)}"`,
    );
    s += t.draw({ x: W / 2, y: py + pad, anchor: 'middle', fill: p.ink });
    s += drawText(a, { x: W / 2, y: py + pad + t.height + gap, anchor: 'middle', fill: p.ink });
    return s;
  },
};
