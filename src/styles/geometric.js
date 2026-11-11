import { n, rect, circle, path, pathD, inkOn, mix, clamp } from '../core.js';
import { FONTS, fitText, drawText, textBottom } from '../text.js';

export const minimal = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Quiet typography with a single accent rule.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const align = /** @type {'middle' | 'start'} */ (rng.pick(['middle', 'middle', 'start']));
    const pad = m * 1.4;
    const x = align === 'middle' ? W / 2 : pad;
    const maxWidth = W - pad * 2;
    const font = rng.pick([FONTS.serif, FONTS.didone, FONTS.garamond, FONTS.sans]);
    const accent = rng.pick(p.accents);
    const top = H * rng.float(0.16, 0.24);

    let s = rect(0, 0, W, H, p.bg);
    if (rng.bool(0.5)) {
      s += rect(
        m * 0.6,
        m * 0.6,
        W - m * 1.2,
        H - m * 1.2,
        'none',
        `stroke="${p.ink}" stroke-opacity="0.3" stroke-width="${n(1.5 * u)}"`,
      );
    }
    const t = fitText(c.title, {
      font,
      weight: font === FONTS.sans ? 300 : 400,
      maxWidth,
      maxHeight: H * 0.38,
      maxSize: S * 0.12,
      lineHeight: 1.12,
      maxLines: 6,
    });
    s += drawText(t, { x, y: top, anchor: align, fill: p.ink });

    const ruleW = W * 0.14;
    const ruleY = textBottom(t, top) + H * 0.04;
    s += rect(align === 'middle' ? W / 2 - ruleW / 2 : x, ruleY, ruleW, 3 * u, accent);

    const a = fitText(c.author, {
      font: FONTS.sans,
      weight: 500,
      upper: true,
      letterSpacing: 0.22,
      maxWidth,
      maxHeight: S * 0.09,
      maxSize: S * 0.03,
      maxLines: 2,
    });
    s += drawText(a, { x, y: H - pad - a.height, anchor: align, fill: p.ink, opacity: 0.85 });
    return s;
  },
};

export const swiss = {
  id: 'swiss',
  name: 'Swiss',
  description: 'International-style grid: colour block, circle and tight sans.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const [blockColor, circleColor] = rng.shuffle([...p.accents, p.ink]);
    const blockH = H * rng.float(0.5, 0.6);
    const r = Math.min(W * rng.float(0.22, 0.32), blockH * 0.4);
    const cx = W * rng.float(0.55, 0.8);

    let s = rect(0, 0, W, H, p.bg) + rect(0, 0, W, blockH, blockColor);
    s += circle(cx, blockH, r, circleColor);

    const t = fitText(c.title, {
      font: FONTS.sans,
      weight: 700,
      maxWidth: W - m * 2,
      maxHeight: blockH - r - m * 2.4,
      maxSize: S * 0.15,
      letterSpacing: -0.015,
      lineHeight: 0.98,
      maxLines: 6,
    });
    s += drawText(t, { x: m, y: m * 1.2, fill: inkOn(blockColor, p) });

    const ruleY = H - m * 2.4;
    s += rect(m, ruleY, W - m * 2, 1.5 * u, p.ink);
    const a = fitText(c.author, {
      font: FONTS.sans,
      weight: 500,
      maxWidth: W * 0.6,
      maxHeight: S * 0.08,
      maxSize: S * 0.036,
      maxLines: 2,
    });
    s += drawText(a, { x: m, y: ruleY + m * 0.55, fill: p.ink });
    const no = fitText(`No. ${rng.int(1, 99)}`, {
      font: FONTS.sans,
      weight: 400,
      maxWidth: W * 0.25,
      maxSize: S * 0.03,
    });
    s += drawText(no, { x: W - m, y: ruleY + m * 0.55, anchor: 'end', fill: p.ink, opacity: 0.7 });
    return s;
  },
};

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
      return path(
        `M${n(x)} ${n(y + size)}A${n(size / 2)} ${n(size / 2)} 0 0 1 ${n(x + size)} ${n(y + size)}Z`,
        color,
        tr,
      );
    case 'quarter':
      return path(
        `M${n(x)} ${n(y + size)}L${n(x)} ${n(y)}A${n(size)} ${n(size)} 0 0 1 ${n(x + size)} ${n(y + size)}Z`,
        color,
        tr,
      );
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

export const bauhaus = {
  id: 'bauhaus',
  name: 'Bauhaus',
  description: 'A grid of primary geometric shapes.',
  prefer: 'light',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const gw = W - m * 2;
    // Square cells: 3 across a tall cover (4 on squarer ones), never taller than the grid area.
    const gridH = H * 0.62 - m;
    const cell = Math.min(gw / (W / H > 0.9 ? 4 : 3), gridH);
    const cols = Math.max(1, Math.floor(gw / cell + 1e-6));
    const rows = Math.max(1, Math.floor(gridH / cell + 1e-6));
    const colors = [...p.accents, p.ink];
    const shapes = ['circle', 'half', 'half', 'quarter', 'quarter', 'triangle', 'square', 'ring', 'bars', 'dot'];

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
        s += bauhausShape(rng.pick(shapes), x, y, cell, color, rng.int(0, 3) * 90);
      }
    }

    const gridBottom = m + rows * cell;
    const a = fitText(c.author, {
      font: FONTS.geometric,
      weight: 500,
      upper: true,
      letterSpacing: 0.14,
      maxWidth: gw - S * 0.06 - m * 0.5,
      maxHeight: S * 0.08,
      maxSize: S * 0.032,
      maxLines: 2,
    });
    const aY = H - m - a.height;
    const tTop = gridBottom + m * 0.8;
    const t = fitText(c.title, {
      font: FONTS.geometric,
      weight: 700,
      upper: true,
      maxWidth: gw,
      maxHeight: aY - m * 0.7 - tTop,
      maxSize: S * 0.11,
      lineHeight: 1.02,
      maxLines: 4,
    });
    s += drawText(t, { x: m, y: tTop, fill: p.ink });
    s += drawText(a, { x: m, y: aY, fill: p.ink });
    s += rect(W - m - S * 0.06, aY + a.height - S * 0.06 + 1, S * 0.06, S * 0.06, p.accents[0]);
    return s;
  },
};

export const stripes = {
  id: 'stripes',
  name: 'Stripes',
  description: 'Bold stripes behind a framed title plate.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const angle = rng.pick([0, 90, 45, -45, 30, -30, 60]);
    const colors = rng.shuffle([...p.accents, p.ink]).slice(0, rng.int(2, 3));
    const mode = rng.pick(['even', 'varied', 'gapped']);
    const diag = Math.hypot(W, H);
    const base = W * rng.float(0.035, 0.07);

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
    let s = rect(0, 0, W, H, p.bg);
    s += `<g transform="rotate(${angle} ${n(W / 2)} ${n(H / 2)})">${bars}</g>`;

    const pad = m * 0.9;
    const plateW = W - m * 2;
    const innerW = plateW - pad * 2;
    const font = rng.pick([FONTS.serif, FONTS.geometric, FONTS.didone]);
    const t = fitText(c.title, {
      font,
      weight: font === FONTS.geometric ? 700 : 400,
      upper: font === FONTS.geometric,
      maxWidth: innerW,
      maxHeight: H * 0.3,
      maxSize: S * 0.1,
      lineHeight: 1.08,
      maxLines: 5,
    });
    const a = fitText(c.author, {
      font: FONTS.sans,
      weight: 500,
      upper: true,
      letterSpacing: 0.18,
      maxWidth: innerW,
      maxHeight: S * 0.08,
      maxSize: S * 0.03,
      maxLines: 2,
    });
    const gap = a.lines.length ? m * 0.75 : 0;
    const tBottom = t.height + t.size * 0.22;
    const plateH = pad * 2 + tBottom + gap + a.height;
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
    s += drawText(t, { x: W / 2, y: py + pad, anchor: 'middle', fill: p.ink });
    s += drawText(a, { x: W / 2, y: py + pad + tBottom + gap, anchor: 'middle', fill: p.ink });
    return s;
  },
};

export const concentric = {
  id: 'concentric',
  name: 'Concentric',
  description: 'Rings, targets and tunnels.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const cx = W * rng.float(0.3, 0.7);
    const cy = H * rng.float(0.27, 0.36);
    const maxR = Math.min(W * rng.float(0.36, 0.5), H * 0.6 - cy);
    const mode = rng.pick(['alternate', 'gradient', 'tunnel', 'lines']);
    const [c1, c2] = rng.shuffle(p.accents);
    const count = mode === 'lines' ? rng.int(16, 28) : rng.int(6, 13);
    const ang = rng.float(0, Math.PI * 2);
    const drift = (maxR * 0.45) / count;

    let s = rect(0, 0, W, H, p.bg);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const r = maxR * (1 - t);
      if (mode === 'lines') {
        s += circle(
          cx,
          cy,
          r,
          'none',
          `stroke="${i % 4 === 0 ? c2 : c1}" stroke-width="${n(u * (i % 4 === 0 ? 3 : 1.4))}"`,
        );
      } else if (mode === 'tunnel') {
        const ox = cx + Math.cos(ang) * drift * i;
        const oy = cy + Math.sin(ang) * drift * i;
        s += circle(ox, oy, r, mix(c1, i % 2 ? p.bg : c2, t * 0.9));
      } else {
        const fill = mode === 'alternate' ? (i % 2 ? p.bg : c1) : mix(c1, c2, t);
        s += circle(cx, cy, r, fill);
      }
    }

    const a = fitText(c.author, {
      font: FONTS.sans,
      weight: 500,
      upper: true,
      letterSpacing: 0.2,
      maxWidth: W - m * 2,
      maxHeight: S * 0.08,
      maxSize: S * 0.03,
      maxLines: 2,
    });
    const aY = H - m * 1.2 - a.height;
    const top = cy + maxR + m * 0.8;
    const font = rng.pick([FONTS.serif, FONTS.sans, FONTS.condensed]);
    const t = fitText(c.title, {
      font,
      weight: font === FONTS.serif ? 400 : 700,
      upper: font === FONTS.condensed,
      maxWidth: W - m * 2,
      maxHeight: aY - m * 0.8 - top,
      maxSize: S * 0.1,
      lineHeight: 1.06,
      maxLines: 4,
    });
    s += drawText(t, { x: W / 2, y: top, anchor: 'middle', fill: p.ink });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: p.ink, opacity: 0.85 });
    return s;
  },
};

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
  description: 'Two-tone field with an inverted shape on the seam.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const splitY = H * rng.float(0.5, 0.6);
    const A = rng.pick([...p.accents, p.ink]);
    const B = p.bg;
    const kind = rng.pick(['circle', 'circle', 'diamond', 'square', 'triangle']);
    const r = Math.min(W * rng.float(0.2, 0.3), splitY * 0.33, (H - splitY) * 0.42);
    const cx = W * rng.float(0.3, 0.7);
    const top = c.id('top');
    const bottom = c.id('bottom');

    let s = `<defs><clipPath id="${top}">${rect(0, 0, W, splitY, '#000')}</clipPath><clipPath id="${bottom}">${rect(0, splitY, W, H - splitY, '#000')}</clipPath></defs>`;
    s += rect(0, 0, W, splitY + 0.5, A) + rect(0, splitY, W, H - splitY, B);
    s += `<g clip-path="url(#${top})">${splitShape(kind, cx, splitY, r, B)}</g>`;
    s += `<g clip-path="url(#${bottom})">${splitShape(kind, cx, splitY, r, A)}</g>`;

    const t = fitText(c.title, {
      font: rng.pick([FONTS.sans, FONTS.geometric, FONTS.didone]),
      weight: 700,
      maxWidth: W - m * 2,
      maxHeight: splitY - r - m * 2,
      maxSize: S * 0.12,
      lineHeight: 1.0,
      maxLines: 5,
    });
    s += drawText(t, { x: m, y: m * 1.2, fill: inkOn(A, p) });
    const a = fitText(c.author, {
      font: FONTS.sans,
      weight: 500,
      maxWidth: W - m * 2,
      maxHeight: S * 0.1,
      maxSize: S * 0.042,
      maxLines: 2,
    });
    s += drawText(a, { x: W - m, y: H - m * 1.2 - a.height, anchor: 'end', fill: p.ink });
    return s;
  },
};

export const blocks = {
  id: 'blocks',
  name: 'Blocks',
  description: 'Neo-plastic grid of primary colour blocks.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const lw = u * rng.float(6, 11);
    const textH = H * rng.float(0.3, 0.36);
    const textTop = rng.bool(0.5);
    const textRect = textTop ? { x: 0, y: 0, w: W, h: textH } : { x: 0, y: H - textH, w: W, h: textH };
    const art = textTop ? { x: 0, y: textH, w: W, h: H - textH } : { x: 0, y: 0, w: W, h: H - textH };
    const minSide = Math.min(W, H) * 0.12;
    const leaves = [];
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

    const pad = m * 0.8;
    const innerW = W - lw - pad * 2;
    const a = fitText(c.author, {
      font: FONTS.sans,
      weight: 500,
      maxWidth: innerW,
      maxHeight: S * 0.08,
      maxSize: S * 0.036,
      maxLines: 2,
    });
    const tTop = textRect.y + lw / 2 + pad;
    const aY = textRect.y + textRect.h - lw / 2 - pad - a.height;
    const t = fitText(c.title, {
      font: rng.pick([FONTS.sans, FONTS.geometric]),
      weight: 700,
      maxWidth: innerW,
      maxHeight: aY - tTop - pad * 0.6,
      maxSize: S * 0.11,
      lineHeight: 1.0,
      maxLines: 4,
    });
    s += drawText(t, { x: lw / 2 + pad, y: tTop, fill: lines });
    s += drawText(a, { x: lw / 2 + pad, y: aY, fill: lines, opacity: 0.85 });
    return s;
  },
};

export const pixel = {
  id: 'pixel',
  name: 'Pixel',
  description: 'A mirrored pixel emblem derived from the seed.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const cols = rng.pick([5, 7, 9]);
    const half = Math.ceil(cols / 2);
    const size = Math.min(W - m * 3.4, H * 0.46);
    const cell = size / cols;
    const gx = (W - size) / 2;
    const gy = H * 0.13;
    const [c1, c2] = rng.shuffle(p.accents);
    const kind = rng.pick(['square', 'dot', 'round']);

    let s = rect(0, 0, W, H, p.bg);
    const tile = m * 0.6;
    s += rect(gx - tile, gy - tile, size + tile * 2, size + tile * 2, mix(p.bg, p.ink, 0.07), `rx="${n(tile * 0.6)}"`);

    let on = 0;
    const cells = [];
    for (let y = 0; y < cols; y++) {
      for (let x = 0; x < half; x++) {
        if (!rng.bool(0.52)) continue;
        on++;
        const col = rng.bool(0.22) ? c2 : c1;
        cells.push([x, y, col], [cols - 1 - x, y, col]);
      }
    }
    if (on < cols) cells.push([half - 1, Math.floor(cols / 2), c1]);
    for (const [x, y, col] of cells) {
      const px = gx + x * cell;
      const py = gy + y * cell;
      if (kind === 'dot') s += circle(px + cell / 2, py + cell / 2, cell * 0.42, col);
      else if (kind === 'round')
        s += rect(px + cell * 0.06, py + cell * 0.06, cell * 0.88, cell * 0.88, col, `rx="${n(cell * 0.24)}"`);
      else s += rect(px, py, cell + 0.4, cell + 0.4, col);
    }

    const a = fitText(c.author, {
      font: FONTS.mono,
      weight: 400,
      upper: true,
      letterSpacing: 0.08,
      maxWidth: W - m * 2,
      maxHeight: S * 0.08,
      maxSize: S * 0.032,
      maxLines: 2,
    });
    const aY = H - m * 1.2 - a.height;
    const top = gy + size + tile + m * 0.9;
    const font = rng.pick([FONTS.mono, FONTS.geometric]);
    const t = fitText(c.title, {
      font,
      weight: 700,
      upper: font === FONTS.geometric,
      maxWidth: W - m * 2,
      maxHeight: aY - m * 0.7 - top,
      maxSize: S * 0.09,
      lineHeight: 1.1,
      maxLines: 4,
    });
    s += drawText(t, { x: W / 2, y: top, anchor: 'middle', fill: p.ink });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: p.ink, opacity: 0.8 });
    return s;
  },
};
