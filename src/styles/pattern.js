import {
  n,
  rect,
  circle,
  line,
  path,
  pathD,
  mix,
  inkOn,
  clamp,
  smoothstep,
  makeNoise2D,
  fbm,
  ridge,
  quarterDisc,
  halfDisc,
  blurFilter,
  shadowFilter,
  linearGradient,
} from '../core.js';
import { FONTS, fitText, drawText, textBottom } from '../text.js';
import { titleBlock, authorFit } from '../type.js';
import { strongAccents, textPanel } from './util.js';

/** @typedef {import('../index.js').StyleContext} Ctx */

/**
 * A mask that hides artwork around a text box, with a soft edge, so the title
 * can sit directly on busy artwork.
 * @param {Ctx} c @param {{ x: number, y: number, w: number, h: number }} box
 */
function halo(c, box) {
  const id = c.id('halo');
  const soft = c.id('halo-soft');
  const pad = c.S * 0.045;
  return {
    id,
    defs:
      blurFilter(soft, c.S * 0.025) +
      `<mask id="${id}">${rect(0, 0, c.W, c.H, '#fff')}` +
      `${rect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2, '#000', `rx="${n(pad)}" filter="url(#${soft})"`)}</mask>`,
  };
}

export const mosaic = {
  id: 'mosaic',
  name: 'Mosaic',
  group: 'Pattern',
  description: 'Truchet and quarter-circle tiles around a title band.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const cols = Math.max(3, Math.round((W / S) * rng.int(5, 8)));
    const size = W / cols;
    const rows = Math.ceil(H / size);
    const family = rng.pick(['truchet', 'quarters', 'triangles', 'mixed']);
    const colors = [...p.accents, p.ink];
    const [c1, c2] = rng.shuffle(p.accents);

    let s = rect(0, 0, W, H, p.bg);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * size;
        const y = j * size;
        const rot = `transform="rotate(${rng.int(0, 3) * 90} ${n(x + size / 2)} ${n(y + size / 2)})"`;
        if (family === 'truchet') {
          const h = size / 2;
          const d = `M${n(x + h)} ${n(y)}A${n(h)} ${n(h)} 0 0 1 ${n(x)} ${n(y + h)}M${n(x + h)} ${n(y + size)}A${n(h)} ${n(h)} 0 0 1 ${n(x + size)} ${n(y + h)}`;
          s += `<path d="${d}" fill="none" stroke="${(i + j) % 2 ? c1 : c2}" stroke-width="${n(size * 0.17)}" ${rot}/>`;
          continue;
        }
        const back = rng.pick(colors);
        const others = colors.filter((col) => col !== back);
        const front = others.length ? rng.pick(others) : p.bg;
        s += rect(x, y, size + 0.5, size + 0.5, back);
        const kind = family === 'mixed' ? rng.pick(['quarters', 'triangles', 'half', 'circle']) : family;
        if (kind === 'quarters') {
          s += path(quarterDisc(x, y, size), front, rot);
        } else if (kind === 'triangles')
          s += path(
            pathD(
              [
                [x, y],
                [x + size, y + size],
                [x, y + size],
              ],
              true,
            ),
            front,
            rot,
          );
        else if (kind === 'half') {
          s += path(halfDisc(x, y, size), front, rot);
        } else s += circle(x + size / 2, y + size / 2, size * 0.36, front);
      }
    }

    const pad = m * 0.8;
    const t = titleBlock(c, {
      font: FONTS.geometric,
      weight: 800,
      upper: true,
      maxWidth: W - m * 2,
      maxHeight: H * 0.3,
      maxSize: S * 0.15,
      lineHeight: 1.0,
      maxLines: 4,
      subtitleFont: FONTS.geometric,
      subtitleItalic: false,
    });
    const a = authorFit(c, { font: FONTS.geometric, maxSize: S * 0.042 });
    const {
      y: by,
      h: bandH,
      gap,
    } = textPanel(c, t, a, { pad, gap: m * 0.6, centerY: H * rng.pick([0.62, 0.5, 0.36]) });
    s += rect(0, by, W, bandH, p.bg);
    s += rect(0, by, W, 5 * u, p.ink) + rect(0, by + bandH - 5 * u, W, 5 * u, p.ink);
    s += t.draw({ x: W / 2, y: by + pad, anchor: 'middle', fill: p.ink });
    s += drawText(a, { x: W / 2, y: by + pad + t.height + gap, anchor: 'middle', fill: p.ink });
    return s;
  },
};

export const halftone = {
  id: 'halftone',
  name: 'Halftone',
  group: 'Pattern',
  description: 'Risograph-style overlapping dot screens.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const step = S / rng.int(22, 30);
    const cols = Math.ceil(W / step);
    const rowH = step * 0.866;
    const fadeTop = H * rng.float(0.5, 0.56);
    const blend = p.dark ? 'screen' : 'multiply';
    const layers = rng.bool(0.65) ? 2 : 1;
    const inks = strongAccents(p, p.bg, 1.3).concat(p.accents);

    const makeField = () => {
      const kind = rng.pick(['radial', 'radial', 'linear', 'wave']);
      const cx = W * rng.float(0.1, 0.9);
      const cy = H * rng.float(0.05, 0.4);
      const R = Math.max(W, H) * rng.float(0.35, 0.6);
      const ang = rng.float(0, Math.PI * 2);
      const freq = rng.float(2, 5);
      if (kind === 'radial')
        return (/** @type {number} */ x, /** @type {number} */ y) => 1 - Math.hypot(x - cx, y - cy) / R;
      if (kind === 'linear') {
        return (/** @type {number} */ x, /** @type {number} */ y) =>
          0.5 + (((x - W / 2) * Math.cos(ang) + (y - H / 2) * Math.sin(ang)) / W) * 1.1;
      }
      return (/** @type {number} */ x, /** @type {number} */ y) =>
        0.5 + 0.5 * Math.sin((x / W) * freq * Math.PI + Math.sin((y / H) * freq * 2) * 1.5);
    };

    let s = rect(0, 0, W, H, p.bg);
    for (let l = 0; l < layers; l++) {
      const field = makeField();
      const off = l * step * 0.33;
      let dots = '';
      for (let row = 0; row * rowH < fadeTop; row++) {
        const y = row * rowH + rowH / 2 + off;
        for (let col = -1; col <= cols; col++) {
          const x = col * step + (row % 2 ? step / 2 : 0) + off;
          const v = clamp(field(x, y), 0, 1) * smoothstep(fadeTop, fadeTop - H * 0.22, y);
          const r = v * step * 0.56;
          if (r > step * 0.07) dots += circle(x, y, r, inks[l]);
        }
      }
      s += l ? `<g style="mix-blend-mode:${blend}">${dots}</g>` : dots;
    }

    const a = authorFit(c, { upper: false, letterSpacing: 0, weight: 700, maxSize: S * 0.05 });
    const aY = H - m * 1.15 - a.height;
    const top = fadeTop + m * 0.1;
    const font = rng.pick([FONTS.sans, FONTS.geometric, FONTS.display]);
    const t = titleBlock(c, {
      font,
      weight: font === FONTS.display ? 400 : 800,
      upper: font !== FONTS.sans,
      stack: rng.bool(0.5),
      maxWidth: W - m * 2,
      maxHeight: aY - m * 0.7 - top,
      maxSize: S * 0.24,
      lineHeight: 0.96,
      maxLines: 4,
      subtitleFont: FONTS.sans,
      subtitleItalic: false,
    });
    s += t.draw({ x: m, y: top, fill: p.ink });
    s += drawText(a, { x: m, y: aY, fill: p.ink });
    return s;
  },
};

const MS_SEGMENTS = /** @type {Record<number, [string, string][]>} */ ({
  1: [['l', 'b']],
  2: [['b', 'r']],
  3: [['l', 'r']],
  4: [['t', 'r']],
  5: [
    ['l', 't'],
    ['b', 'r'],
  ],
  6: [['t', 'b']],
  7: [['l', 't']],
  8: [['l', 't']],
  9: [['t', 'b']],
  10: [
    ['t', 'r'],
    ['l', 'b'],
  ],
  11: [['t', 'r']],
  12: [['l', 'r']],
  13: [['b', 'r']],
  14: [['l', 'b']],
});

/**
 * Marching squares contour lines, joined into polylines. Returns path `d` strings.
 * @param {Float32Array} values @param {number} cols @param {number} rows @param {number} res @param {number} level
 */
function contours(values, cols, rows, res, level) {
  /** @type {Map<string, [number, number]>} */
  const pts = new Map();
  /** @type {[string, string][]} */
  const segs = [];
  const at = (/** @type {number} */ i, /** @type {number} */ j) => values[j * (cols + 1) + i];
  /** @param {string} key @param {number} ax @param {number} ay @param {number} av @param {number} bx @param {number} by @param {number} bv */
  const edgePoint = (key, ax, ay, av, bx, by, bv) => {
    if (!pts.has(key)) {
      const t = (level - av) / (bv - av || 1e-9);
      pts.set(key, [(ax + (bx - ax) * t) * res, (ay + (by - ay) * t) * res]);
    }
    return key;
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const cc = at(i + 1, j + 1);
      const d = at(i, j + 1);
      const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (cc > level ? 2 : 0) | (d > level ? 1 : 0);
      const list = MS_SEGMENTS[code];
      if (!list) continue;
      /** @type {Record<string, () => string>} */
      const edge = {
        t: () => edgePoint(`h${i},${j}`, i, j, a, i + 1, j, b),
        b: () => edgePoint(`h${i},${j + 1}`, i, j + 1, d, i + 1, j + 1, cc),
        l: () => edgePoint(`v${i},${j}`, i, j, a, i, j + 1, d),
        r: () => edgePoint(`v${i + 1},${j}`, i + 1, j, b, i + 1, j + 1, cc),
      };
      for (const [e1, e2] of list) segs.push([edge[e1](), edge[e2]()]);
    }
  }
  /** @type {Map<string, number[]>} */
  const adj = new Map();
  segs.forEach(([k1, k2], idx) => {
    for (const k of [k1, k2]) {
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k)?.push(idx);
    }
  });
  const used = new Uint8Array(segs.length);
  /** @type {string[]} */
  const out = [];
  /** @param {string[]} chain @param {string} start */
  const extend = (chain, start) => {
    let key = start;
    for (;;) {
      const next = (adj.get(key) || []).find((idx) => !used[idx]);
      if (next == null) return;
      used[next] = 1;
      key = segs[next][0] === key ? segs[next][1] : segs[next][0];
      chain.push(key);
    }
  };
  for (let idx = 0; idx < segs.length; idx++) {
    if (used[idx]) continue;
    used[idx] = 1;
    const fwd = [segs[idx][0], segs[idx][1]];
    extend(fwd, fwd[1]);
    /** @type {string[]} */
    const back = [];
    extend(back, fwd[0]);
    const chain = back.reverse().concat(fwd);
    out.push(pathD(chain.map((k) => /** @type {[number, number]} */ (pts.get(k)))));
  }
  return out;
}

/**
 * Lay out a title block and author at the top or bottom-left, for styles whose
 * text sits directly on the artwork inside a halo.
 * @param {Ctx} c @param {boolean} atTop @param {Omit<import('../type.js').TitleBlockOptions, 'maxWidth' | 'maxHeight'>} opts
 */
function openText(c, atTop, opts) {
  const { W, H, S, m } = c;
  const t = titleBlock(c, { maxWidth: W - m * 2, maxHeight: H * 0.34, ...opts });
  const a = authorFit(c, { maxSize: S * 0.044 });
  const gap = a.lines.length ? m * 0.7 : 0;
  const blockH = t.height + gap + a.height;
  const y = atTop ? m * 1.2 : H - m * 1.2 - blockH;
  const width = Math.max(t.width, a.width);
  return { t, a, y, gap, box: { x: m, y, w: width, h: blockH } };
}

export const topographic = {
  id: 'topographic',
  name: 'Topographic',
  group: 'Pattern',
  description: 'Contour lines from a generated terrain map.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, rng, p } = c;
    const noise = makeNoise2D(rng);
    const res = S / 64;
    const cols = Math.ceil(W / res);
    const rows = Math.ceil(H / res);
    const freq = rng.float(2, 3.4);
    const ox = rng.float(0, 50);
    const oy = rng.float(0, 50);
    const values = new Float32Array((cols + 1) * (rows + 1));
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const v = fbm(noise, ((i * res) / S) * freq + ox, ((j * res) / S) * freq + oy, 4);
        values[j * (cols + 1) + i] = v;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    const levels = rng.int(14, 22);
    const lineColor = rng.pick(strongAccents(p, p.bg, 1.8).concat(p.ink));
    let thin = '';
    let thick = '';
    for (let k = 0; k < levels; k++) {
      const level = lo + ((hi - lo) * (k + 0.5)) / levels;
      const d = contours(values, cols, rows, res, level).join('');
      if (k % 5 === 2) thick += d;
      else thin += d;
    }
    const tint = rng.bool(0.5) ? mix(p.bg, lineColor, 0.08) : p.bg;
    const text = openText(c, rng.bool(0.5), {
      font: FONTS.condensed,
      weight: 700,
      upper: true,
      letterSpacing: 0.03,
      maxSize: S * 0.17,
      lineHeight: 0.98,
      maxLines: 4,
      subtitleFont: FONTS.mono,
      subtitleItalic: false,
    });
    const h = halo(c, text.box);
    let s = `<defs>${h.defs}</defs>` + rect(0, 0, W, H, tint);
    s += `<g mask="url(#${h.id})">`;
    s += `<path d="${thin}" fill="none" stroke="${lineColor}" stroke-width="${n(1.2 * u)}" stroke-opacity="0.9" stroke-linejoin="round"/>`;
    s += `<path d="${thick}" fill="none" stroke="${p.ink}" stroke-width="${n(2 * u)}" stroke-opacity="0.65" stroke-linejoin="round"/>`;
    s += '</g>';
    s += text.t.draw({ x: c.m, y: text.y, fill: p.ink });
    s += drawText(text.a, { x: c.m, y: text.y + text.t.height + text.gap, fill: p.ink });
    return s;
  },
};

export const flowfield = {
  id: 'flowfield',
  name: 'Flow Field',
  group: 'Pattern',
  description: 'Strands following a noise vector field.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, rng, p } = c;
    const noise = makeNoise2D(rng);
    const freq = rng.float(1.2, 2.6);
    const turns = rng.float(1.5, 3);
    const angle = (/** @type {number} */ x, /** @type {number} */ y) =>
      fbm(noise, (x / S) * freq, (y / S) * freq, 3) * Math.PI * turns;
    const count = Math.round(rng.int(170, 240) * Math.sqrt((W * H) / (S * S * 1.5)));
    const step = S * 0.009;
    const steps = rng.int(26, 42);
    const width = u * rng.float(1.6, 3.2);
    const inks = strongAccents(p, p.bg, 1.3).concat(p.accents).slice(0, 3);
    const groups = inks.map(() => '');
    for (let i = 0; i < count; i++) {
      let x = rng.float(-0.05, 1.05) * W;
      let y = rng.float(-0.05, 1.05) * H;
      const pts = [[x, y]];
      for (let k = 0; k < steps; k++) {
        const a = angle(x, y);
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        pts.push([x, y]);
      }
      groups[rng.int(0, groups.length - 1)] += pathD(pts);
    }
    const font = rng.pick([FONTS.serif, FONTS.didone, FONTS.sans]);
    const text = openText(c, rng.bool(0.5), {
      font,
      weight: font === FONTS.sans ? 800 : 400,
      maxSize: S * 0.17,
      lineHeight: 1.02,
      maxLines: 4,
    });
    const h = halo(c, text.box);
    let s = `<defs>${h.defs}</defs>` + rect(0, 0, W, H, p.bg) + `<g mask="url(#${h.id})">`;
    groups.forEach((d, i) => {
      s += `<path d="${d}" fill="none" stroke="${inks[i]}" stroke-width="${n(width * (1 + i * 0.4))}" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    s += '</g>';
    s += text.t.draw({ x: c.m, y: text.y, fill: p.ink });
    s += drawText(text.a, { x: c.m, y: text.y + text.t.height + text.gap, fill: p.ink });
    return s;
  },
};

export const lowpoly = {
  id: 'lowpoly',
  name: 'Low Poly',
  group: 'Pattern',
  description: 'Faceted triangles with a gradient sweep.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const cols = Math.max(3, Math.round((W / S) * rng.int(6, 9)));
    const cw = W / cols;
    const rows = Math.max(2, Math.round(H / cw));
    const rh = H / rows;
    /** @type {[number, number][][]} */
    const P = [];
    for (let j = 0; j <= rows; j++) {
      P.push([]);
      for (let i = 0; i <= cols; i++) {
        const jx = i === 0 || i === cols ? 0 : rng.float(-0.38, 0.38) * cw;
        const jy = j === 0 || j === rows ? 0 : rng.float(-0.38, 0.38) * rh;
        P[j].push([i * cw + jx, j * rh + jy]);
      }
    }
    const [g0, g1, g2] = rng.shuffle(p.accents);
    const ang = rng.float(0, Math.PI * 2);
    const ext = (Math.abs(Math.cos(ang)) * W + Math.abs(Math.sin(ang)) * H) / 2;
    const colorAt = (/** @type {number} */ x, /** @type {number} */ y) => {
      const t = clamp(0.5 + ((x - W / 2) * Math.cos(ang) + (y - H / 2) * Math.sin(ang)) / (2 * ext), 0, 1);
      const base = t < 0.5 ? mix(g0, g1, t * 2) : mix(g1, g2, (t - 0.5) * 2);
      return mix(base, rng.bool() ? '#ffffff' : '#000000', rng.float(0, 0.12));
    };
    let s = '';
    /** @param {[number, number]} a @param {[number, number]} b @param {[number, number]} d */
    const tri = (a, b, d) => {
      const col = colorAt((a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3);
      s += path(pathD([a, b, d], true), col, `stroke="${col}" stroke-width="${n(0.8 * u)}" stroke-linejoin="round"`);
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = P[j][i];
        const b = P[j][i + 1];
        const cc = P[j + 1][i + 1];
        const d = P[j + 1][i];
        if (rng.bool()) {
          tri(a, b, cc);
          tri(a, cc, d);
        } else {
          tri(a, b, d);
          tri(b, cc, d);
        }
      }
    }
    const light = '#ffffff';
    const a = authorFit(c, { maxSize: S * 0.046 });
    const aY = H - m * 1.2 - a.height;
    const t = titleBlock(c, {
      font: FONTS.sans,
      weight: 800,
      maxWidth: W - m * 2,
      maxHeight: H * 0.36,
      maxSize: S * 0.2,
      lineHeight: 0.98,
      maxLines: 4,
      subtitleFont: FONTS.sans,
      subtitleItalic: false,
    });
    const tY = aY - m * 0.8 - t.height;
    const ruleY = tY - m * 0.6;
    // A dark shade under the white text: it fades in above the rule, and is at least 60% from
    // the rule down, so even the lightest facets keep white text readable.
    const shade = c.id('shade');
    const night = mix(p.night, '#000000', 0.3);
    const top = Math.max(0, Math.min(H * 0.35, ruleY - m * 1.5));
    const full = (ruleY - top) / (H - top);
    s = `<defs>${linearGradient(shade, [
      [0, night, 0],
      [full, night, 0.6],
      [1, night, 0.92],
    ])}</defs>${s}`;
    s += rect(0, top, W, H - top, `url(#${shade})`);
    s += t.draw({ x: m, y: tY, fill: light });
    s += rect(m, ruleY, S * 0.12, 4 * u, light);
    s += drawText(a, { x: m, y: aY, fill: light, opacity: 0.92 });
    return s;
  },
};

/**
 * @param {string} type @param {number} x @param {number} y @param {number} size @param {string} color @param {number} rot @param {number} u
 */
function memphisShape(type, x, y, size, color, rot, u) {
  const tr = `transform="rotate(${n(rot)} ${n(x)} ${n(y)})"`;
  const stroke = (/** @type {number} */ w) =>
    `fill="none" stroke="${color}" stroke-width="${n(w * u)}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (type) {
    case 'squiggle': {
      const pts = [];
      for (let i = 0; i <= 6; i++) pts.push([x - size + (i * size * 2) / 6, y + (i % 2 ? -size * 0.22 : size * 0.22)]);
      return `<path d="${pathD(pts)}" ${stroke(Math.max(5, (size * 0.06) / u))} ${tr}/>`;
    }
    case 'triangle':
      return path(
        pathD(
          [
            [x, y - size * 0.6],
            [x + size * 0.6, y + size * 0.45],
            [x - size * 0.6, y + size * 0.45],
          ],
          true,
        ),
        color,
        tr,
      );
    case 'outline':
      return `<path d="${pathD(
        [
          [x, y - size * 0.6],
          [x + size * 0.6, y + size * 0.45],
          [x - size * 0.6, y + size * 0.45],
        ],
        true,
      )}" ${stroke(5)} ${tr}/>`;
    case 'circle':
      return circle(x, y, size * 0.5, color);
    case 'ring':
      return circle(x, y, size * 0.42, 'none', `stroke="${color}" stroke-width="${n(Math.max(5 * u, size * 0.1))}"`);
    case 'dots': {
      let o = '';
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
          o += circle(x + (i - 1.5) * size * 0.26, y + (j - 1.5) * size * 0.26, size * 0.05, color);
      return `<g ${tr}>${o}</g>`;
    }
    case 'half':
      return path(
        `M${n(x - size * 0.55)} ${n(y)}A${n(size * 0.55)} ${n(size * 0.55)} 0 0 1 ${n(x + size * 0.55)} ${n(y)}Z`,
        color,
        tr,
      );
    case 'confetti':
      return rect(x - size * 0.45, y - size * 0.11, size * 0.9, size * 0.22, color, tr);
    case 'checker': {
      let o = '';
      const q = size / 4;
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
          if ((i + j) % 2 === 0) o += rect(x - size / 2 + i * q, y - size / 2 + j * q, q, q, color);
      return `<g ${tr}>${o}</g>`;
    }
    default: {
      let o = '';
      for (let i = 0; i < 5; i++)
        o += line(
          x - size * 0.5,
          y + (i - 2) * size * 0.2,
          x + size * 0.5,
          y + (i - 2) * size * 0.2,
          color,
          Math.max(3 * u, size * 0.05),
        );
      return `<g ${tr}>${o}</g>`;
    }
  }
}

const MEMPHIS = [
  'squiggle',
  'squiggle',
  'triangle',
  'outline',
  'circle',
  'ring',
  'dots',
  'half',
  'confetti',
  'checker',
  'lines',
];

export const memphis = {
  id: 'memphis',
  name: 'Memphis',
  group: 'Pattern',
  description: 'Dense eighties pattern with the title on a solid block.',
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const colors = [...p.accents, p.ink];
    let s = rect(0, 0, W, H, p.bg);
    // Dense and large, with shapes running off every edge.
    const gc = Math.max(3, Math.round((W / S) * 4));
    const gr = Math.max(3, Math.round((H / S) * 4));
    for (let j = -0.3; j < gr; j++) {
      for (let i = -0.3; i < gc; i++) {
        if (rng.bool(0.12)) continue;
        const x = ((i + rng.float(0, 1)) / gc) * W;
        const y = ((j + rng.float(0, 1)) / gr) * H;
        s += memphisShape(rng.pick(MEMPHIS), x, y, S * rng.float(0.1, 0.24), rng.pick(colors), rng.float(0, 360), u);
      }
    }
    const block = rng.pick(strongAccents(p, p.bg, 1.2).concat(p.ink));
    const shadow = rng.pick(colors.filter((col) => col !== block)) ?? p.ink;
    const pad = m * 0.9;
    const boxW = W - m * 2.2;
    const innerW = boxW - pad * 2;
    const ink = inkOn(block, p);
    const t = titleBlock(c, {
      font: FONTS.geometric,
      weight: 800,
      upper: true,
      maxWidth: innerW,
      maxHeight: H * 0.34,
      maxSize: S * 0.17,
      lineHeight: 1.0,
      maxLines: 5,
      subtitleFont: FONTS.geometric,
      subtitleItalic: false,
    });
    const a = authorFit(c, { font: FONTS.geometric, weight: 700, maxWidth: innerW, maxSize: S * 0.046 });
    const { y: by, h: boxH, gap } = textPanel(c, t, a, { pad, gap: m * 0.7, centerY: H * rng.float(0.42, 0.58) });
    const bx = (W - boxW) / 2;
    const tilt = rng.pick([0, -2, 2]);
    const g = `transform="rotate(${tilt} ${n(W / 2)} ${n(by + boxH / 2)})"`;
    s += `<g ${g}>`;
    s += rect(bx + 14 * u, by + 14 * u, boxW, boxH, shadow);
    s += rect(bx, by, boxW, boxH, block);
    s += t.draw({ x: bx + pad, y: by + pad, fill: ink });
    s += drawText(a, { x: bx + pad, y: by + pad + t.height + gap, fill: ink });
    s += '</g>';
    return s;
  },
};

/**
 * A smooth closed blob (Catmull-Rom through wobbly polar points), and the lowest y it reaches.
 * @param {import('../core.js').Rng} rng @param {number} cx @param {number} cy @param {number} rx @param {number} ry @param {number} wobble
 */
function blob(rng, cx, cy, rx, ry, wobble) {
  const k = 12;
  const phase = [rng.float(0, 6.3), rng.float(0, 6.3), rng.float(0, 6.3)];
  const amp = [rng.float(0.3, 1), rng.float(0.2, 0.7), rng.float(0.1, 0.4)].map((v) => v * wobble);
  /** @type {[number, number][]} */
  const pts = [];
  for (let i = 0; i < k; i++) {
    const th = (i / k) * Math.PI * 2;
    const f =
      1 +
      amp[0] * Math.sin(2 * th + phase[0]) * 0.5 +
      amp[1] * Math.sin(3 * th + phase[1]) * 0.5 +
      amp[2] * Math.sin(5 * th + phase[2]) * 0.5;
    pts.push([cx + Math.cos(th) * rx * f, cy + Math.sin(th) * ry * f]);
  }
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < k; i++) {
    const p0 = pts[(i - 1 + k) % k];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % k];
    const p3 = pts[(i + 2) % k];
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
  }
  // Catmull-Rom curves overshoot their points slightly; allow for it.
  const bottom = Math.max(...pts.map(([, y]) => y));
  return { d: d + 'Z', bottom: bottom + (bottom - cy) * 0.06 };
}

export const papercut = {
  id: 'papercut',
  name: 'Paper Cut',
  group: 'Pattern',
  description: 'Layered paper with organic cut-outs and soft shadows.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const layers = rng.int(5, 7);
    const cx = W * rng.float(0.4, 0.6);
    const cy = H * rng.float(0.32, 0.38);
    const shadow = c.id('shadow');
    const [deep, mid] = strongAccents(p, p.bg, 1.2).concat(p.accents);
    // Back to front: the deepest layer is darkest; each layer in front has a bigger hole.
    let s = `<defs>${shadowFilter(shadow, u, { blur: 7, dy: 4, opacity: p.dark ? 0.6 : 0.35 })}</defs>`;
    s += rect(0, 0, W, H, mix(deep, p.night, 0.35));
    // The hole is sized so the title always gets the space below it, whatever the shape.
    // A hole reaches up to ~1.48 r below its centre (ellipse × wobble), plus jitter;
    // size them so the title keeps the space below.
    const maxR = Math.min(S * 0.4, Math.max(S * 0.12, (H * 0.6 - cy - S * 0.03) / 1.48));
    let holeBottom = 0;
    let front = p.bg;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const color = i === layers - 1 ? p.bg : mix(mix(deep, mid, t), p.bg, t * 0.75);
      const r = maxR * (0.25 + 0.75 * t);
      const hole = blob(
        rng,
        cx + rng.float(-1, 1) * S * 0.03,
        cy + rng.float(-1, 1) * S * 0.03,
        r * (W / S > 1 ? 1.2 : 1),
        r * 1.08,
        0.35,
      );
      s += `<path d="M0 0H${W}V${H}H0Z${hole.d}" fill="${color}" fill-rule="evenodd" filter="url(#${shadow})"/>`;
      holeBottom = Math.max(holeBottom, hole.bottom);
      front = color;
    }
    const a = authorFit(c, { maxSize: S * 0.044 });
    const aY = H - m * 1.2 - a.height;
    const top = holeBottom + m * 0.5;
    const font = rng.pick([FONTS.serif, FONTS.didone, FONTS.geometric]);
    const t = titleBlock(c, {
      font,
      weight: font === FONTS.geometric ? 700 : 400,
      upper: font === FONTS.geometric,
      maxWidth: W - m * 2,
      maxHeight: aY - m * 0.7 - top,
      maxSize: S * 0.15,
      lineHeight: 1.04,
      maxLines: 4,
    });
    const ink = inkOn(front, p);
    s += t.draw({ x: W / 2, y: top + Math.max(0, (aY - m * 0.7 - top - t.height) / 2), anchor: 'middle', fill: ink });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: ink });
    return s;
  },
};

/* --------------------------------------------------------------------- pixel */

// A 5×7 pixel font: each glyph is seven rows of five bits.
/** @type {Record<string, string>} */
const PIXEL_FONT = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110',
  1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010',
  5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110',
  7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100',
  "'": '00100 00100 01000 00000 00000 00000 00000',
  '’': '00100 00100 01000 00000 00000 00000 00000',
  '-': '00000 00000 00000 01110 00000 00000 00000',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  '&': '01100 10010 10100 01000 10101 10010 01101',
};

/** Whether every character can be drawn with the pixel font. @param {string} text */
const pixelable = (text) => [...text].every((ch) => ch === ' ' || PIXEL_FONT[ch]);

/**
 * Wrap `text` into lines of pixel glyphs and pick the largest pixel size that fits.
 * @param {string} text @param {number} maxWidth @param {number} maxHeight @param {number} maxQ
 */
function fitPixelText(text, maxWidth, maxHeight, maxQ) {
  const words = text.split(' ').filter(Boolean);
  const widthOf = (/** @type {string} */ s) => s.length * 6 - 1;
  for (let q = maxQ; q >= 1.5; q -= 0.5) {
    const perLine = Math.floor((maxWidth / q + 1) / 6);
    /** @type {string[]} */
    const lines = [];
    let cur = '';
    let ok = true;
    for (const w of words) {
      if (w.length > perLine) {
        ok = false;
        break;
      }
      const cand = cur ? `${cur} ${w}` : w;
      if (cand.length <= perLine) cur = cand;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    const height = (lines.length * 10 - 3) * q;
    if (ok && height <= maxHeight) return { q, lines, height, width: Math.max(...lines.map(widthOf)) * q };
  }
  return null;
}

/**
 * Draw pixel-font lines as merged horizontal runs of squares.
 * @param {{ q: number, lines: string[] }} fit @param {number} x @param {number} y @param {'start' | 'middle'} anchor @param {string} color
 */
function drawPixelText(fit, x, y, anchor, color) {
  const { q, lines } = fit;
  let o = '';
  lines.forEach((ln, li) => {
    const w = (ln.length * 6 - 1) * q;
    const x0 = anchor === 'middle' ? x - w / 2 : x;
    const y0 = y + li * 10 * q;
    [...ln].forEach((ch, ci) => {
      const glyph = PIXEL_FONT[ch];
      if (!glyph) return;
      glyph.split(' ').forEach((row, ry) => {
        let run = -1;
        for (let rx = 0; rx <= 5; rx++) {
          if (rx < 5 && row[rx] === '1') {
            if (run < 0) run = rx;
          } else if (run >= 0) {
            o += rect(x0 + (ci * 6 + run) * q, y0 + ry * q, (rx - run) * q + 0.3, q + 0.3, color);
            run = -1;
          }
        }
      });
    });
  });
  return o;
}

export const pixel = {
  id: 'pixel',
  name: 'Pixel',
  group: 'Pattern',
  description: 'An 8-bit scene with pixel lettering and scanlines.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const g = S / 48;
    const cols = Math.ceil(W / g);
    const horizon = Math.round((H * rng.float(0.6, 0.68)) / g) * g;
    const [sunC, hillC, groundC] = strongAccents(p, p.night, 1.2).concat(p.accents);
    const skyTop = p.dark ? p.bg : mix(p.bg, p.night, 0.12);
    const skyLow = mix(skyTop, sunC, 0.45);

    let s = '';
    // Sky in hard bands, like a limited palette.
    const bands = 7;
    for (let i = 0; i < bands; i++) {
      const y0 = Math.round(((horizon / bands) * i) / g) * g;
      const y1 = Math.round(((horizon / bands) * (i + 1)) / g) * g;
      s += rect(0, y0, W, y1 - y0 + 0.5, mix(skyTop, skyLow, i / (bands - 1)));
    }
    // Stars.
    for (let i = 0; i < cols * 0.8; i++) {
      s += rect(rng.int(0, cols) * g, rng.int(0, Math.floor((horizon * 0.5) / g)) * g, g, g, p.paper, 'opacity="0.7"');
    }
    // Sun: a rasterised disc with scan gaps.
    const sr = Math.round(rng.float(5, 8));
    const scx = Math.round((W * rng.float(0.3, 0.7)) / g);
    const scy = Math.round((horizon - sr * g * 0.6) / g);
    for (let y = -sr; y <= sr; y++) {
      if (y > 1 && y % 3 === 0) continue;
      const half = Math.floor(Math.sqrt(sr * sr - y * y));
      if (half > 0) s += rect((scx - half) * g, (scy + y) * g, half * 2 * g, g + 0.3, sunC);
    }
    // Two rows of blocky hills.
    for (const [k, color, amp] of /** @type {[number, string, number][]} */ ([
      [0, mix(hillC, skyLow, 0.35), 0.16],
      [1, hillC, 0.1],
    ])) {
      const pts = ridge(rng, 32, 0.55);
      for (let i = 0; i < cols; i++) {
        const v = pts[Math.floor((i / cols) * 32)] * 0.5 + 0.5;
        const top = Math.round((horizon - H * amp * v - k * g * 2) / g) * g;
        s += rect(i * g, top, g + 0.3, horizon - top + 0.3, color);
      }
    }
    // Ground in stripes.
    const ground = mix(groundC, p.night, 0.55);
    s += rect(0, horizon, W, H - horizon, ground);
    for (let y = horizon + g * 2, k = 1; y < H; y += g * (2 + k), k++)
      s += rect(0, y, W, g, mix(ground, groundC, 0.25));

    // Title in pixel letters when possible, otherwise in a monospaced face.
    const title = c.title.toUpperCase();
    const ink = inkOn(skyTop, p);
    const box = { w: W - m * 2, h: horizon - m * 2.2 - sr * g * 1.6 };
    // The subtitle is fitted first so the title leaves room for it (only if the title can be
    // drawn in pixel letters at all: otherwise titleBlock sets both).
    const drawable = pixelable(title);
    const subText = c.subtitle.toUpperCase();
    const sfit =
      drawable && c.subtitle && pixelable(subText) ? fitPixelText(subText, box.w, S * 0.08, S * 0.008) : null;
    const sText =
      drawable && c.subtitle && !sfit
        ? fitText(c.subtitle, {
            font: FONTS.mono,
            weight: 700,
            maxWidth: box.w,
            maxHeight: S * 0.08,
            maxSize: S * 0.032,
            maxLines: 2,
          })
        : null;
    const subH = sfit ? sfit.height : sText ? textBottom(sText, 0) : 0;
    const reserve = subH ? subH + g * 2.5 : 0;
    const pfit = drawable ? fitPixelText(title, box.w, box.h - reserve, S * 0.022) : null;
    if (pfit) {
      const y = m * 1.3;
      s += drawPixelText(pfit, W / 2 + g * 0.6, y + g * 0.6, 'middle', mix(skyTop, '#000000', 0.5));
      s += drawPixelText(pfit, W / 2, y, 'middle', ink);
      const subY = y + pfit.height + g * 2.5;
      if (sfit) s += drawPixelText(sfit, W / 2, subY, 'middle', ink);
      else if (sText) s += drawText(sText, { x: W / 2, y: subY, anchor: 'middle', fill: ink });
    } else {
      const t = titleBlock(c, {
        font: FONTS.mono,
        weight: 700,
        upper: true,
        lead: false,
        subtitleFont: FONTS.mono,
        subtitleItalic: false,
        maxWidth: box.w,
        maxHeight: box.h,
        maxSize: S * 0.11,
        lineHeight: 1.1,
        maxLines: 5,
      });
      s += t.draw({ x: W / 2, y: m * 1.3, anchor: 'middle', fill: ink });
    }
    const author = c.author.toUpperCase();
    const groundInk = inkOn(ground, p);
    const afit = author && pixelable(author) ? fitPixelText(author, W - m * 2, H - horizon - m * 2, S * 0.007) : null;
    if (afit) s += drawPixelText(afit, W / 2, H - m * 1.2 - afit.height, 'middle', groundInk);
    else if (author) {
      const a = authorFit(c, { font: FONTS.mono, weight: 700, letterSpacing: 0.05, maxSize: S * 0.042 });
      s += drawText(a, { x: W / 2, y: H - m * 1.2 - a.height, anchor: 'middle', fill: groundInk });
    }
    // CRT scanlines over everything.
    let scan = '';
    for (let y = 0; y < H; y += g * 2) scan += rect(0, y, W, g * 0.45, '#000');
    s += `<g opacity="0.12">${scan}</g>`;
    return s;
  },
};
