import {
  n,
  rect,
  circle,
  path,
  pathD,
  mix,
  clamp,
  contrast,
  smoothstep,
  makeNoise2D,
  fbm,
  grain,
  blurFilter,
  shadowFilter,
  linearGradient,
} from '../core.js';
import { FONTS, fitText, drawText, textBottom } from '../text.js';

export const aurora = {
  id: 'aurora',
  name: 'Aurora',
  description: 'Soft blurred colour fields with film grain.',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const blur = c.id('blur');
    const sh = c.id('sh');
    const g = grain(c, { opacity: p.dark ? 0.16 : 0.14, light: p.dark });
    let s = `<defs>${blurFilter(blur, Math.min(W, H) * 0.11)}${shadowFilter(sh, u, { blur: 8, dy: 2, opacity: p.dark ? 0.5 : 0.15 })}${g.defs}</defs>`;
    s += rect(0, 0, W, H, p.bg);
    let blobs = '';
    const cols = rng.shuffle([...p.accents, rng.pick(p.accents), p.dark ? p.bg : p.ink]);
    const count = rng.int(4, 6);
    for (let i = 0; i < count; i++) {
      const col = cols[i % cols.length];
      const op = col === p.ink ? 0.35 : rng.float(0.7, 1);
      blobs += circle(rng.float(-0.1, 1.1) * W, rng.float(-0.05, 1.05) * H, Math.min(W, H) * rng.float(0.28, 0.5), col, `opacity="${op.toFixed(2)}"`);
    }
    s += `<g filter="url(#${blur})">${blobs}</g>${g.layer}`;

    const layout = rng.pick(['bottom', 'center', 'top']);
    const font = rng.pick([FONTS.sans, FONTS.serif, FONTS.didone]);
    const a = fitText(c.author, { font: FONTS.sans, weight: 500, upper: true, letterSpacing: 0.25, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.03, maxLines: 2 });
    const tAttrs = { maxWidth: W - m * 2.2, maxSize: W * 0.13, lineHeight: 1.04, maxLines: 5, font, weight: font === FONTS.sans ? 300 : 400 };
    const shadow = `filter="url(#${sh})"`;
    if (layout === 'center') {
      const t = fitText(c.title, { ...tAttrs, maxHeight: H * 0.45 });
      s += drawText(t, { x: W / 2, y: (H - t.height) / 2 - H * 0.03, anchor: 'middle', fill: p.ink, attrs: shadow });
      s += drawText(a, { x: W / 2, y: H - m * 1.3 - a.height, anchor: 'middle', fill: p.ink, attrs: shadow });
    } else {
      const t = fitText(c.title, { ...tAttrs, maxHeight: H * 0.42 });
      const tY = layout === 'bottom' ? H - m * 1.4 - t.height : m * 1.4;
      const aY = layout === 'bottom' ? m * 1.3 : H - m * 1.3 - a.height;
      s += drawText(t, { x: m, y: tY, fill: p.ink, attrs: shadow });
      s += drawText(a, { x: m, y: aY, fill: p.ink, attrs: shadow });
    }
    return s;
  },
};

export const halftone = {
  id: 'halftone',
  name: 'Halftone',
  description: 'Risograph-style overlapping dot screens.',
  render(c) {
    const { W, H, m, rng, p } = c;
    const cols = rng.int(22, 30);
    const step = W / cols;
    const rowH = step * 0.866;
    const fadeTop = H * rng.float(0.55, 0.6);
    const blend = p.dark ? 'screen' : 'multiply';
    const layers = rng.bool(0.65) ? 2 : 1;
    const inks = rng.shuffle(p.accents);

    const makeField = () => {
      const kind = rng.pick(['radial', 'radial', 'linear', 'wave']);
      const cx = W * rng.float(0.1, 0.9);
      const cy = H * rng.float(0.05, 0.4);
      const R = Math.max(W, H) * rng.float(0.35, 0.6);
      const ang = rng.float(0, Math.PI * 2);
      const freq = rng.float(2, 5);
      if (kind === 'radial') return (x, y) => 1 - Math.hypot(x - cx, y - cy) / R;
      if (kind === 'linear') return (x, y) => 0.5 + (((x - W / 2) * Math.cos(ang) + (y - H / 2) * Math.sin(ang)) / W) * 1.1;
      return (x, y) => 0.5 + 0.5 * Math.sin((x / W) * freq * Math.PI + Math.sin((y / H) * freq * 2) * 1.5);
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

    const a = fitText(c.author, { font: FONTS.sans, weight: 500, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.036, maxLines: 2 });
    const aY = H - m * 1.2 - a.height;
    const top = fadeTop + m * 0.2;
    const font = rng.pick([FONTS.sans, FONTS.geometric, FONTS.display]);
    const t = fitText(c.title, {
      font,
      weight: font === FONTS.display ? 400 : 700,
      upper: font !== FONTS.sans,
      maxWidth: W - m * 2,
      maxHeight: aY - m * 0.7 - top,
      maxSize: W * 0.13,
      lineHeight: 0.98,
      maxLines: 4,
    });
    s += drawText(t, { x: m, y: top, fill: p.ink });
    s += drawText(a, { x: m, y: aY, fill: p.ink });
    return s;
  },
};

const MS_SEGMENTS = {
  1: [['l', 'b']],
  2: [['b', 'r']],
  3: [['l', 'r']],
  4: [['t', 'r']],
  5: [['l', 't'], ['b', 'r']],
  6: [['t', 'b']],
  7: [['l', 't']],
  8: [['l', 't']],
  9: [['t', 'b']],
  10: [['t', 'r'], ['l', 'b']],
  11: [['t', 'r']],
  12: [['l', 'r']],
  13: [['b', 'r']],
  14: [['l', 'b']],
};

/** Marching squares contour lines joined into polylines. Returns path `d` strings. */
function contours(values, cols, rows, res, level) {
  const pts = new Map();
  const segs = [];
  const at = (i, j) => values[j * (cols + 1) + i];
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
      const edge = {
        t: () => edgePoint(`h${i},${j}`, i, j, a, i + 1, j, b),
        b: () => edgePoint(`h${i},${j + 1}`, i, j + 1, d, i + 1, j + 1, cc),
        l: () => edgePoint(`v${i},${j}`, i, j, a, i, j + 1, d),
        r: () => edgePoint(`v${i + 1},${j}`, i + 1, j, b, i + 1, j + 1, cc),
      };
      for (const [e1, e2] of list) segs.push([edge[e1](), edge[e2]()]);
    }
  }
  const adj = new Map();
  segs.forEach(([k1, k2], idx) => {
    for (const k of [k1, k2]) {
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push(idx);
    }
  });
  const used = new Uint8Array(segs.length);
  const out = [];
  const extend = (chain, key) => {
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
    const back = [];
    extend(back, fwd[0]);
    const chain = back.reverse().concat(fwd);
    out.push(pathD(chain.map((k) => pts.get(k))));
  }
  return out;
}

export const topographic = {
  id: 'topographic',
  name: 'Topographic',
  description: 'Contour lines from a generated terrain map.',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const noise = makeNoise2D(rng);
    const res = Math.min(W, H) / 64;
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
        const v = fbm(noise, ((i * res) / W) * freq + ox, ((j * res) / W) * freq + oy, 4);
        values[j * (cols + 1) + i] = v;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    const levels = rng.int(14, 22);
    const lineColor = rng.pick(p.accents.filter((col) => contrast(col, p.bg) > 1.8).concat(p.ink));
    let thin = '';
    let thick = '';
    for (let k = 0; k < levels; k++) {
      const level = lo + ((hi - lo) * (k + 0.5)) / levels;
      const d = contours(values, cols, rows, res, level).join('');
      if (k % 5 === 2) thick += d;
      else thin += d;
    }
    const tint = rng.bool(0.5) ? mix(p.bg, lineColor, 0.08) : p.bg;
    let s = rect(0, 0, W, H, tint);
    s += `<path d="${thin}" fill="none" stroke="${lineColor}" stroke-width="${n(1.2 * u)}" stroke-opacity="0.9" stroke-linejoin="round"/>`;
    s += `<path d="${thick}" fill="none" stroke="${p.ink}" stroke-width="${n(2 * u)}" stroke-opacity="0.65" stroke-linejoin="round"/>`;

    const pad = m * 0.75;
    const panelW = W - m * 2;
    const innerW = panelW - pad * 2;
    const t = fitText(c.title, { font: FONTS.condensed, weight: 700, upper: true, letterSpacing: 0.03, maxWidth: innerW, maxHeight: H * 0.24, maxSize: W * 0.1, lineHeight: 1.0, maxLines: 4 });
    const a = fitText(c.author, { font: FONTS.mono, weight: 400, maxWidth: innerW, maxHeight: W * 0.08, maxSize: W * 0.03, maxLines: 2 });
    const gap = a.lines.length ? m * 0.6 : 0;
    const panelH = pad * 2 + t.height + gap + a.height;
    const top = rng.bool(0.5);
    const py = top ? m : H - m - panelH;
    s += rect(m, py, panelW, panelH, p.bg, `stroke="${p.ink}" stroke-width="${n(2 * u)}"`);
    s += drawText(t, { x: m + pad, y: py + pad, fill: p.ink });
    s += drawText(a, { x: m + pad, y: py + pad + t.height + gap, fill: p.ink, opacity: 0.85 });
    return s;
  },
};

export const mosaic = {
  id: 'mosaic',
  name: 'Mosaic',
  description: 'Truchet and quarter-circle tiles.',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const cols = rng.int(5, 8);
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
        const front = rng.pick(colors.filter((col) => col !== back));
        s += rect(x, y, size + 0.5, size + 0.5, back);
        const kind = family === 'mixed' ? rng.pick(['quarters', 'triangles', 'half', 'circle']) : family;
        if (kind === 'quarters') s += path(`M${n(x)} ${n(y + size)}L${n(x)} ${n(y)}A${n(size)} ${n(size)} 0 0 1 ${n(x + size)} ${n(y + size)}Z`, front, rot);
        else if (kind === 'triangles') s += path(pathD([[x, y], [x + size, y + size], [x, y + size]], true), front, rot);
        else if (kind === 'half') s += path(`M${n(x)} ${n(y + size)}A${n(size / 2)} ${n(size / 2)} 0 0 1 ${n(x + size)} ${n(y + size)}Z`, front, rot);
        else s += circle(x + size / 2, y + size / 2, size * 0.36, front);
      }
    }

    const pad = m * 0.8;
    const t = fitText(c.title, { font: FONTS.geometric, weight: 700, upper: true, maxWidth: W - m * 2, maxHeight: H * 0.24, maxSize: W * 0.1, lineHeight: 1.02, maxLines: 4 });
    const a = fitText(c.author, { font: FONTS.geometric, weight: 400, upper: true, letterSpacing: 0.2, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.03, maxLines: 2 });
    const gap = a.lines.length ? m * 0.6 : 0;
    const bandH = pad * 2 + t.height + gap + a.height;
    const by = clamp(H * rng.pick([0.62, 0.5, 0.36]) - bandH / 2, m, H - m - bandH);
    s += rect(0, by, W, bandH, p.bg);
    s += rect(0, by, W, 5 * u, p.ink) + rect(0, by + bandH - 5 * u, W, 5 * u, p.ink);
    s += drawText(t, { x: W / 2, y: by + pad, anchor: 'middle', fill: p.ink });
    s += drawText(a, { x: W / 2, y: by + pad + t.height + gap, anchor: 'middle', fill: p.ink });
    return s;
  },
};

export const lowpoly = {
  id: 'lowpoly',
  name: 'Low Poly',
  description: 'Faceted triangles with a gradient sweep.',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const cols = rng.int(6, 9);
    const cw = W / cols;
    const rows = Math.max(2, Math.round(H / cw));
    const rh = H / rows;
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
    const colorAt = (x, y) => {
      const t = clamp(0.5 + ((x - W / 2) * Math.cos(ang) + (y - H / 2) * Math.sin(ang)) / (2 * ext), 0, 1);
      const base = t < 0.5 ? mix(g0, g1, t * 2) : mix(g1, g2, (t - 0.5) * 2);
      return mix(base, rng.bool() ? '#ffffff' : '#000000', rng.float(0, 0.12));
    };
    let s = '';
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
    const shade = c.id('shade');
    const night = mix(p.night, '#000000', 0.3);
    s = `<defs>${linearGradient(shade, [[0, night, 0], [0.45, night, 0.55], [1, night, 0.92]])}</defs>${s}`;
    s += rect(0, H * 0.4, W, H * 0.6, `url(#${shade})`);

    const light = '#ffffff';
    const a = fitText(c.author, { font: FONTS.sans, weight: 500, upper: true, letterSpacing: 0.22, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.03, maxLines: 2 });
    const aY = H - m * 1.2 - a.height;
    const t = fitText(c.title, { font: FONTS.sans, weight: 700, maxWidth: W - m * 2, maxHeight: H * 0.3, maxSize: W * 0.12, lineHeight: 1.0, maxLines: 4 });
    const tY = aY - m * 0.8 - t.height;
    s += drawText(t, { x: m, y: tY, fill: light });
    s += rect(m, tY - m * 0.6, W * 0.12, 4 * u, light);
    s += drawText(a, { x: m, y: aY, fill: light, opacity: 0.9 });
    return s;
  },
};

export const flowfield = {
  id: 'flowfield',
  name: 'Flow Field',
  description: 'Strands following a noise vector field.',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const noise = makeNoise2D(rng);
    const freq = rng.float(1.2, 2.6);
    const turns = rng.float(1.5, 3);
    const angle = (x, y) => fbm(noise, (x / W) * freq, (y / W) * freq, 3) * Math.PI * turns;
    const count = rng.int(170, 240);
    const step = Math.min(W, H) * 0.009;
    const steps = rng.int(26, 42);
    const width = u * rng.float(1.6, 3.2);
    const groups = p.accents.map(() => '');
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
    let s = rect(0, 0, W, H, p.bg);
    groups.forEach((d, i) => {
      s += `<path d="${d}" fill="none" stroke="${p.accents[i]}" stroke-width="${n(width * (1 + i * 0.4))}" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>`;
    });

    const pad = m;
    const font = rng.pick([FONTS.serif, FONTS.didone, FONTS.sans]);
    const t = fitText(c.title, { font, weight: font === FONTS.sans ? 700 : 400, maxWidth: W - pad * 2, maxHeight: H * 0.22, maxSize: W * 0.1, lineHeight: 1.05, maxLines: 4 });
    const a = fitText(c.author, { font: FONTS.sans, weight: 500, upper: true, letterSpacing: 0.2, maxWidth: W - pad * 2, maxHeight: W * 0.08, maxSize: W * 0.03, maxLines: 2 });
    const gap = a.lines.length ? m * 0.7 : 0;
    const panelH = pad * 1.8 + textBottom(t, 0) + gap + a.height;
    const top = rng.bool(0.4);
    const py = top ? 0 : H - panelH;
    s += rect(0, py, W, panelH, p.bg);
    s += rect(0, top ? py + panelH - 2 * u : py, W, 2 * u, p.ink);
    const ty = py + pad * 0.9;
    s += drawText(t, { x: pad, y: ty, fill: p.ink });
    s += drawText(a, { x: pad, y: textBottom(t, ty) + gap, fill: p.ink, opacity: 0.85 });
    return s;
  },
};

