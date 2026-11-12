import {
  n,
  rect,
  circle,
  line,
  path,
  pathD,
  mix,
  inkOn,
  luminance,
  ridge,
  grain,
  linearGradient,
  radialGradient,
  blurFilter,
  shadowFilter,
} from '../core.js';
import { FONTS, drawText } from '../text.js';
import { titleBlock, authorFit } from '../type.js';
import { strongAccents, fitTitleWith } from './util.js';

/** @typedef {import('../index.js').StyleContext} Ctx */

/** @param {Ctx} c @param {number} count @param {number} maxY @param {string} color */
function starfield(c, count, maxY, color) {
  const { W, u, rng } = c;
  let s = '';
  for (let i = 0; i < count; i++) {
    const r = u * (0.4 + rng.next() ** 3 * 1.6);
    s += circle(rng.float(0, W), rng.float(0, maxY), r, color, `opacity="${rng.float(0.3, 1).toFixed(2)}"`);
  }
  return s;
}

export const landscape = {
  id: 'landscape',
  name: 'Landscape',
  group: 'Scenic',
  description: 'Layered mountain ranges under a low sun.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const [sunC, , farC] = rng.shuffle(p.accents);
    const skyTop = p.dark ? p.bg : mix(p.bg, p.accents[1], 0.1);
    const horizon = mix(skyTop, sunC, 0.45);
    const dark = p.dark ? mix(p.bg, '#000000', 0.45) : mix(p.ink, farC, 0.3);
    const sky = c.id('sky');

    let s = `<defs>${linearGradient(sky, [
      [0, skyTop],
      [0.5, mix(skyTop, horizon, 0.55)],
      [0.75, horizon],
    ])}</defs>`;
    s += rect(0, 0, W, H, `url(#${sky})`);
    if (p.dark) s += starfield(c, 70, H * 0.45, p.ink);

    const sunR = S * rng.float(0.08, 0.13);
    const sunX = W * rng.float(0.2, 0.8);
    const sunY = H * rng.float(0.4, 0.47);
    s += circle(sunX, sunY, sunR * 1.9, sunC, 'opacity="0.16"');
    s += circle(sunX, sunY, sunR, mix(sunC, '#ffffff', 0.15));

    const layers = rng.int(4, 6);
    let front = dark;
    for (let i = 0; i < layers; i++) {
      const k = i / (layers - 1);
      const baseY = H * (0.52 + 0.33 * k);
      const amp = H * (0.11 - 0.06 * k);
      const pts = ridge(rng, 64, rng.float(0.45, 0.6));
      const coords = pts.map((v, j) => [(j / 64) * W, baseY - amp * (v * 0.5 + 0.5)]);
      front = mix(horizon, dark, ((i + 1) / layers) ** 0.85);
      s += path(pathD([[0, H], ...coords, [W, H]], true), front);
    }

    const top = m * 1.3;
    const font = rng.pick([FONTS.serif, FONTS.didone, FONTS.condensed]);
    const condensed = font === FONTS.condensed;
    const t = titleBlock(c, {
      font,
      weight: condensed ? 700 : 400,
      upper: condensed,
      letterSpacing: condensed ? 0.04 : 0,
      maxWidth: W - m * 2.2,
      maxHeight: Math.min(sunY - sunR, H * 0.4) - m * 0.8 - top,
      maxSize: S * 0.17,
      lineHeight: 1.04,
      maxLines: 4,
    });
    s += t.draw({ x: W / 2, y: top, anchor: 'middle', fill: inkOn(skyTop, p) });
    const a = authorFit(c, { letterSpacing: 0.2, maxSize: S * 0.044 });
    s += drawText(a, { x: W / 2, y: H - m * 1.1 - a.height, anchor: 'middle', fill: inkOn(front, p) });
    return s;
  },
};

export const waves = {
  id: 'waves',
  name: 'Waves',
  group: 'Scenic',
  description: 'Stacked sine waves in blended tones.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const flip = rng.bool(0.35);
    const count = rng.int(5, 9);
    const start = H * rng.float(0.5, 0.58);
    const A = H * rng.float(0.02, 0.04);
    const [c1, c2] = strongAccents(p, p.bg, 1.2).concat(p.accents);
    const deep = rng.bool(0.5);
    const endColor = deep ? (p.dark ? mix(p.bg, '#000000', 0.5) : p.ink) : c2;

    let body = '';
    let last = c1;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const base = start + (H - start) * (i / count) * 0.92 + A;
      const k1 = (rng.float(1, 2.4) * Math.PI * 2) / W;
      const k2 = (rng.float(3, 6) * Math.PI * 2) / W;
      const ph1 = rng.float(0, Math.PI * 2);
      const ph2 = rng.float(0, Math.PI * 2);
      const pts = [];
      for (let x = 0; x <= W + 0.01; x += W / 48) {
        pts.push([x, base + A * Math.sin(k1 * x + ph1) + A * 0.35 * Math.sin(k2 * x + ph2)]);
      }
      last = mix(c1, endColor, deep ? t * 0.85 : t);
      body += path(pathD([[0, H + 2], ...pts, [W, H + 2]], true), last);
    }
    let s = rect(0, 0, W, H, p.bg);
    s += flip ? `<g transform="translate(0 ${H}) scale(1 -1)">${body}</g>` : body;

    const free = start - A * 1.4 - m * 0.6;
    const regionTop = flip ? H - free : m * 1.3;
    const regionBottom = flip ? H - m * 1.3 : free;
    const a = authorFit(c, { letterSpacing: 0.18, maxSize: S * 0.044 });
    const font = rng.pick([FONTS.serif, FONTS.garamond, FONTS.sans]);
    const t = titleBlock(c, {
      font,
      weight: font === FONTS.sans ? 300 : 400,
      maxWidth: W - m * 2.2,
      maxHeight: regionBottom - regionTop,
      maxSize: S * 0.2,
      lineHeight: 1.06,
      maxLines: 5,
    });
    s += t.draw({ x: W / 2, y: regionTop + (regionBottom - regionTop - t.height) / 2, anchor: 'middle', fill: p.ink });
    const aY = flip ? m * 1.1 : H - m * 1.1 - a.height;
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: inkOn(last, p) });
    return s;
  },
};

export const retro = {
  id: 'retro',
  name: 'Retro Sun',
  group: 'Scenic',
  description: 'Eighties sunset over a neon perspective grid.',
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const sorted = [...p.accents].sort((a, b) => luminance(b) - luminance(a));
    const [hi, mid, lo] = sorted;
    // Light palettes get a pastel dawn instead of a night sky.
    const dark = p.dark;
    const night = dark ? p.night : p.bg;
    const horizon = H * rng.float(0.56, 0.62);
    const top = m * 1.2;
    // A smaller sun leaves more sky: shrink it until the title fits comfortably.
    const R0 = Math.min(S * rng.float(0.26, 0.34), horizon * 0.36);
    const { block: t, value: R } = fitTitleWith(
      c,
      [1, 0.85, 0.72, 0.61, 0.52].map((k) => R0 * k),
      (r) => ({
        font: FONTS.geometric,
        weight: 800,
        italic: true,
        upper: true,
        maxWidth: W - m * 2,
        maxHeight: horizon - r * 1.25 - m * 0.6 - top,
        maxSize: S * 0.2,
        lineHeight: 1.0,
        maxLines: 4,
        subtitleFont: FONTS.geometric,
        subtitleUpper: true,
        subtitleItalic: false,
      }),
    );
    const cx = W / 2;
    const cy = horizon - R * 0.25;

    const ids = {
      sky: c.id('sky'),
      sun: c.id('sun'),
      stripes: c.id('stripes'),
      glow: c.id('glow'),
      clip: c.id('clip'),
      chrome: c.id('chrome'),
      sh: c.id('sh'),
    };
    /** @type {[number, string][]} */
    const skyStops = dark
      ? [
          [0, mix(night, '#000000', 0.35)],
          [0.7, mix(night, lo, 0.35)],
          [1, mix(night, lo, 0.6)],
        ]
      : [
          [0, mix(night, '#ffffff', 0.2)],
          [0.7, mix(night, hi, 0.35)],
          [1, mix(night, lo, 0.45)],
        ];
    let defs = linearGradient(ids.sky, skyStops);
    defs += linearGradient(ids.sun, [
      [0, hi],
      [1, lo],
    ]);
    defs += dark
      ? linearGradient(ids.chrome, [
          [0, '#ffffff'],
          [0.48, mix(p.paper, hi, 0.35)],
          [0.52, hi],
          [1, mix(hi, lo, 0.6)],
        ])
      : linearGradient(ids.chrome, [
          [0, mix(p.ink, lo, 0.2)],
          [0.5, p.ink],
          [1, mix(p.ink, lo, 0.4)],
        ]);
    let bands = rect(cx - R, cy - R, R * 2, R * 2, '#ffffff');
    for (let k = 0; k < 7; k++)
      bands += rect(cx - R, cy - R * 0.12 + k * R * 0.17, R * 2, R * 0.025 * (k + 1), '#000000');
    defs += `<mask id="${ids.stripes}">${bands}</mask>`;
    defs += `<clipPath id="${ids.clip}">${rect(0, 0, W, horizon, '#000')}</clipPath>`;
    defs +=
      `<filter id="${ids.glow}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${n(2.5 * u)}" result="b"/>` +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    defs += shadowFilter(ids.sh, u, { blur: 5, dy: 3, opacity: dark ? 0.6 : 0.2 });

    let s = `<defs>${defs}</defs>`;
    s += rect(0, 0, W, H, `url(#${ids.sky})`);
    if (dark) s += starfield(c, 50, horizon * 0.7, p.paper);
    s += `<g clip-path="url(#${ids.clip})">`;
    s += circle(cx, cy, R * 1.35, lo, 'opacity="0.18"');
    s += `<g mask="url(#${ids.stripes})">${circle(cx, cy, R, `url(#${ids.sun})`)}</g>`;
    if (rng.bool(0.6)) {
      const pts = ridge(rng, 32, 0.6).map((v, j) => [(j / 32) * W, horizon - H * 0.03 - H * 0.05 * (v * 0.5 + 0.5)]);
      s += path(pathD([[0, horizon + 1], ...pts, [W, horizon + 1]], true), mix(night, dark ? '#000000' : p.ink, 0.2));
    }
    s += '</g>';

    const floor = dark ? mix(night, '#000000', 0.45) : mix(night, lo, 0.18);
    const gridColor = dark ? mid : mix(lo, p.ink, 0.25);
    s += rect(0, horizon, W, H - horizon, floor);
    let grid = line(0, horizon, W, horizon, gridColor, 2.2 * u);
    for (let k = 1; k <= 12; k++) {
      const y = horizon + (H - horizon) * (k / 12) ** 2.1;
      grid += line(0, y, W, y, gridColor, 1.4 * u);
    }
    for (let j = -14; j <= 14; j++) {
      grid += line(cx + j * S * 0.035, horizon, cx + j * S * 0.32, H + (H - horizon) * 0.4, gridColor, 1.4 * u);
    }
    s += `<g filter="url(#${ids.glow})" opacity="0.9">${grid}</g>`;

    s += t.draw({
      x: W / 2,
      y: top,
      anchor: 'middle',
      fill: `url(#${ids.chrome})`,
      leadFill: dark ? p.paper : p.ink,
      subtitleFill: dark ? p.paper : p.ink,
      attrs: `filter="url(#${ids.sh})"`,
    });
    const a = authorFit(c, { font: FONTS.geometric, letterSpacing: 0.24, maxSize: S * 0.044 });
    const aY = H - m * 1.1 - a.height;
    if (a.lines.length) s += rect(0, aY - m * 0.45, W, a.height + m * 0.9, floor, 'opacity="0.8"');
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: inkOn(floor, p) });
    return s;
  },
};

export const constellation = {
  id: 'constellation',
  name: 'Constellation',
  group: 'Scenic',
  description: 'A star chart: a night sky, or an antique chart on paper.',
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const accent = rng.pick(strongAccents(p, p.bg, 1.3));
    const ids = { sky: c.id('sky'), moon: c.id('moon'), glow: c.id('glow') };
    // Dark palettes: a night sky. Light palettes: ink on paper, like an antique star chart.
    const dark = p.dark;
    const bg = p.bg;
    const ink = dark ? p.paper : p.ink;
    const mr = S * rng.float(0.05, 0.075);
    const mx = W * rng.float(0.18, 0.82);
    const my = H * rng.float(0.09, 0.15);

    let s = '<defs>';
    s += dark
      ? linearGradient(ids.sky, [
          [0, mix(bg, '#000000', 0.3)],
          [1, mix(bg, accent, 0.28)],
        ])
      : radialGradient(
          ids.sky,
          [
            [0.5, bg],
            [1, mix(bg, p.ink, 0.12)],
          ],
          { r: 0.75 },
        );
    s += `<mask id="${ids.moon}">${circle(mx, my, mr, '#ffffff')}${circle(mx + mr * 0.42, my - mr * 0.22, mr * 0.9, '#000000')}</mask>`;
    s += blurFilter(ids.glow, 3 * u);
    s += '</defs>';
    s += rect(0, 0, W, H, `url(#${ids.sky})`);
    if (!dark) {
      // Chart graticule: faint concentric circles and spokes.
      let grid = '';
      for (let k = 1; k <= 4; k++)
        grid += circle(W / 2, H * 0.4, S * 0.16 * k, 'none', `stroke="${ink}" stroke-width="${n(0.8 * u)}"`);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        grid += line(W / 2, H * 0.4, W / 2 + Math.cos(a) * S, H * 0.4 + Math.sin(a) * S, ink, 0.6 * u);
      }
      s += `<g opacity="0.12">${grid}</g>`;
    }
    s += starfield(c, Math.round(200 * Math.sqrt((W * H) / (S * S * 1.5))), H, ink);
    s += circle(mx, my, mr * 2.4, ink, 'opacity="0.06"');
    s += `<g mask="url(#${ids.moon})">${circle(mx, my, mr, mix(ink, accent, 0.15))}</g>`;

    const k = rng.int(5, 8);
    /** @type {[number, number][]} */
    const pts = [];
    for (let tries = 0; pts.length < k && tries < 400; tries++) {
      /** @type {[number, number]} */
      const pt = [rng.float(m * 1.5, W - m * 1.5), rng.float(H * 0.24, H * 0.52)];
      if (pts.every((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) > S * 0.1)) pts.push(pt);
    }
    pts.sort((a, b) => a[0] - b[0]);
    const order = [pts[0]];
    const rest = pts.slice(1);
    while (rest.length) {
      const last = order[order.length - 1];
      let bi = 0;
      rest.forEach((q, i) => {
        if (Math.hypot(q[0] - last[0], q[1] - last[1]) < Math.hypot(rest[bi][0] - last[0], rest[bi][1] - last[1]))
          bi = i;
      });
      order.push(rest.splice(bi, 1)[0]);
    }
    let lines = '';
    for (let i = 1; i < order.length; i++)
      lines += line(order[i - 1][0], order[i - 1][1], order[i][0], order[i][1], ink, 1.1 * u);
    if (order.length > 4 && rng.bool(0.6)) {
      const a = order[rng.int(1, order.length - 3)];
      const b = order[order.length - 1];
      lines += line(a[0], a[1], b[0], b[1], ink, 1.1 * u);
    }
    s += `<g opacity="0.5">${lines}</g>`;
    for (const [x, y] of order) {
      s += circle(x, y, 7 * u, accent, `opacity="0.45" filter="url(#${ids.glow})"`);
      s += circle(x, y, 2.8 * u, ink);
    }

    const a = authorFit(c, { weight: 500, letterSpacing: 0.28, maxSize: S * 0.04 });
    const aY = H - m * 1.2 - a.height;
    const top = H * 0.6;
    const font = rng.pick([FONTS.serif, FONTS.didone, FONTS.garamond]);
    const t = titleBlock(c, {
      font,
      upper: true,
      letterSpacing: 0.08,
      maxWidth: W - m * 2.2,
      maxHeight: aY - m * 0.8 - top,
      maxSize: S * 0.13,
      lineHeight: 1.14,
      maxLines: 4,
    });
    s += t.draw({ x: W / 2, y: top + (aY - m * 0.8 - top - t.height) / 2, anchor: 'middle', fill: ink });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: mix(ink, accent, 0.3) });
    return s;
  },
};

export const orbit = {
  id: 'orbit',
  name: 'Orbit',
  group: 'Scenic',
  description: 'A planet with tilted orbits and moons.',
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const dark = p.dark;
    const night = p.bg;
    const light = dark ? p.paper : p.ink;
    const [pc, rc, mc] = rng.shuffle(strongAccents(p, p.bg, 1.2).concat(p.accents).slice(0, 3));
    const cx = W / 2 + W * rng.float(-0.1, 0.1);
    const cy = H * rng.float(0.3, 0.35);
    const R = S * rng.float(0.1, 0.14);
    const tilt = rng.float(-28, 28);
    const squash = rng.float(0.3, 0.44);
    const rad = (tilt * Math.PI) / 180;
    const limit = H * 0.56 - cy;
    const step = S * rng.float(0.07, 0.09);
    /** @type {[number, number][]} */
    const orbits = [];
    const orbitCount = rng.int(3, 6);
    for (let i = 0; i < orbitCount; i++) {
      const rx = R * 1.9 + i * step;
      const ry = rx * squash;
      if (Math.hypot(rx * Math.sin(rad), ry * Math.cos(rad)) > limit) break;
      orbits.push([rx, ry]);
    }

    const planet = c.id('planet');
    const halo = c.id('halo');
    let s = '<defs>';
    s += radialGradient(
      planet,
      [
        [0, mix(pc, '#ffffff', 0.45)],
        [0.55, pc],
        [1, mix(pc, '#000000', 0.55)],
      ],
      { fx: 0.35, fy: 0.3, r: 0.6 },
    );
    s += radialGradient(
      halo,
      [
        [0, mix(night, pc, dark ? 0.35 : 0.12)],
        [1, night],
      ],
      { r: 0.6, cy: 0.33 },
    );
    s += '</defs>';
    s += rect(0, 0, W, H, `url(#${halo})`);
    s += starfield(c, 90, H, light);

    let og = '';
    for (const [rx, ry] of orbits) {
      og += `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="none" stroke="${light}" stroke-opacity="0.3" stroke-width="${n(u)}"/>`;
      const th = rng.float(0, Math.PI * 2);
      og += circle(cx + rx * Math.cos(th), cy + ry * Math.sin(th), u * rng.float(3, 8), rng.pick([mc, rc, light]));
    }
    s += `<g transform="rotate(${n(tilt)} ${n(cx)} ${n(cy)})">${og}</g>`;

    const ringed = rng.bool(0.6);
    const rrx = R * 1.75;
    const rry = rrx * squash * 0.75;
    const ringAttrs = `fill="none" stroke="${rc}" stroke-width="${n(R * 0.13)}" stroke-opacity="0.9"`;
    const back = `M${n(cx - rrx)} ${n(cy)}A${n(rrx)} ${n(rry)} 0 0 1 ${n(cx + rrx)} ${n(cy)}`;
    const front = `M${n(cx + rrx)} ${n(cy)}A${n(rrx)} ${n(rry)} 0 0 1 ${n(cx - rrx)} ${n(cy)}`;
    const rot = `transform="rotate(${n(tilt)} ${n(cx)} ${n(cy)})"`;
    if (ringed) s += `<path d="${back}" ${ringAttrs} ${rot}/>`;
    s += circle(cx, cy, R, `url(#${planet})`);
    if (ringed) s += `<path d="${front}" ${ringAttrs} ${rot}/>`;

    const a = authorFit(c, { font: FONTS.geometric, weight: 500, letterSpacing: 0.26, maxSize: S * 0.04 });
    const aY = H - m * 1.2 - a.height;
    const top = H * 0.62;
    const t = titleBlock(c, {
      font: FONTS.geometric,
      weight: 600,
      upper: true,
      letterSpacing: 0.1,
      maxWidth: W - m * 2.2,
      maxHeight: aY - m * 0.8 - top,
      maxSize: S * 0.13,
      lineHeight: 1.16,
      maxLines: 4,
      subtitleFont: FONTS.geometric,
      subtitleItalic: false,
    });
    s += t.draw({ x: W / 2, y: top + (aY - m * 0.8 - top - t.height) / 2, anchor: 'middle', fill: light });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: mix(light, rc, 0.35) });
    return s;
  },
};

/**
 * A city skyline or a forest tree line standing on `baseY`.
 * @param {Ctx} c @param {'city' | 'forest'} kind @param {number} baseY @param {number} maxH @param {string} color @param {string} windowColor
 */
function skyline(c, kind, baseY, maxH, color, windowColor) {
  const { W, H, S, rng } = c;
  let s = '';
  if (kind === 'forest') {
    let x = -S * 0.05;
    while (x < W + S * 0.05) {
      const h = maxH * rng.float(0.45, 1);
      const w = h * rng.float(0.32, 0.42);
      const tiers = 3;
      for (let t = 0; t < tiers; t++) {
        const ty = baseY - h + (h * t) / (tiers + 0.4);
        const tw = w * (0.55 + t * 0.25);
        s += path(
          pathD(
            [
              [x, ty],
              [x + tw / 2, ty + h * 0.42],
              [x - tw / 2, ty + h * 0.42],
            ],
            true,
          ),
          color,
        );
      }
      s += rect(x - w * 0.04, baseY - h * 0.15, w * 0.08, h * 0.15, color);
      x += w * rng.float(0.35, 0.7);
    }
    return s + rect(0, baseY - 1, W, H - baseY + 1, color);
  }
  let x = 0;
  let windows = '';
  while (x < W) {
    const w = S * rng.float(0.05, 0.12);
    const h = maxH * rng.float(0.35, 1);
    s += rect(x, baseY - h, w + 0.5, h + 1, color);
    if (rng.bool(0.25)) s += rect(x + w * 0.45, baseY - h - maxH * 0.12, w * 0.1, maxH * 0.12, color);
    const q = S * 0.012;
    for (let wy = baseY - h + q * 2; wy < baseY - q * 2; wy += q * 2.6) {
      for (let wx = x + q; wx < x + w - q * 1.5; wx += q * 2.2)
        if (rng.bool(0.22)) windows += rect(wx, wy, q, q * 1.3, windowColor);
    }
    x += w + S * rng.float(0, 0.012);
  }
  return s + windows + rect(0, baseY - 1, W, H - baseY + 1, color);
}

export const silhouette = {
  id: 'silhouette',
  name: 'Silhouette',
  group: 'Scenic',
  description: 'A city skyline or a forest tree line against the sky.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const kind = /** @type {'city' | 'forest'} */ (rng.pick(['city', 'forest']));
    const [glowC, , lit] = strongAccents(p, p.night, 1.2).concat(p.accents);
    const skyTop = p.dark ? mix(p.bg, '#000000', 0.25) : mix(p.bg, p.accents[1], 0.12);
    const skyLow = mix(skyTop, glowC, p.dark ? 0.4 : 0.5);
    const sky = c.id('sky');
    const far = mix(skyLow, p.night, 0.45);
    const near = p.dark ? mix(p.bg, '#000000', 0.55) : mix(p.ink, p.night, 0.3);

    let s =
      `<defs>${linearGradient(sky, [
        [0, skyTop],
        [0.75, skyLow],
      ])}</defs>` + rect(0, 0, W, H, `url(#${sky})`);
    if (p.dark) s += starfield(c, 60, H * 0.5, p.paper);
    const top = m * 1.3;
    const font = rng.pick([FONTS.condensed, FONTS.serif, FONTS.display]);
    const t = titleBlock(c, {
      font,
      weight: font === FONTS.condensed ? 700 : 400,
      upper: font !== FONTS.serif,
      letterSpacing: font === FONTS.serif ? 0 : 0.03,
      maxWidth: W - m * 2,
      maxHeight: H * 0.36 - top,
      maxSize: S * 0.2,
      lineHeight: 0.98,
      maxLines: 4,
    });
    // The moon rises below the title (partly behind the skyline if it must).
    const mr = S * rng.float(0.06, 0.1);
    const moonY = Math.max(H * rng.float(0.38, 0.47), top + t.height + mr + S * 0.04);
    s += circle(W * rng.float(0.2, 0.8), moonY, mr, mix(glowC, '#ffffff', 0.3), 'opacity="0.95"');
    s += skyline(c, kind, H * 0.72, H * 0.3, far, mix(far, lit, 0.5));
    s += skyline(c, kind, H * 0.8, H * 0.22, near, lit);
    s += t.draw({ x: W / 2, y: top, anchor: 'middle', fill: inkOn(skyTop, p) });
    const a = authorFit(c, { letterSpacing: 0.2, maxSize: S * 0.044 });
    s += drawText(a, { x: W / 2, y: H - m * 1.1 - a.height, anchor: 'middle', fill: inkOn(near, p) });
    return s;
  },
};

export const shelf = {
  id: 'shelf',
  name: 'Bookshelf',
  group: 'Scenic',
  description: 'A row of book spines on a shelf.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const shelfY = H * rng.float(0.54, 0.6);
    const plankH = 12 * u;
    const left = m * 0.8;
    const right = W - m * 0.8;
    const lean = rng.bool(0.6);
    // The leaning book reaches at most h·sin(22°) + w·cos(22°) past its neighbour, and h scales with H.
    const stop = lean ? right - Math.max(S * 0.26, H * 0.12 + S * 0.09) : right;
    const colors = [
      ...p.accents,
      mix(p.accents[0], p.ink, 0.35),
      mix(p.accents[1], p.bg, 0.3),
      mix(p.accents[2], p.ink, 0.2),
      p.ink,
    ];

    /** @param {number} x @param {number} w @param {number} h @param {string} col */
    const spine = (x, w, h, col) => {
      const top = shelfY - h;
      const deco = inkOn(col, p);
      let o = rect(x, top, w, h, col);
      const kind = rng.int(0, 3);
      if (kind === 0) {
        o += rect(x, top + h * 0.08, w, h * 0.02, deco, 'opacity="0.55"');
        o += rect(x, shelfY - h * 0.1, w, h * 0.02, deco, 'opacity="0.55"');
      } else if (kind === 1) {
        o += rect(x + w * 0.22, top + h * 0.28, w * 0.56, h * 0.3, deco, 'opacity="0.8"');
      } else if (kind === 2) {
        for (let k = 0; k < 3; k++)
          o += rect(x + w * 0.3, top + h * (0.2 + k * 0.08), w * 0.4, h * 0.025, deco, 'opacity="0.6"');
      } else {
        o += circle(x + w / 2, top + h * 0.2, w * 0.22, deco, 'opacity="0.7"');
      }
      return o;
    };

    let s = rect(0, 0, W, H, p.bg);
    let x = left;
    let books = '';
    let lastRight = left;
    let lastH = 0;
    while (x < stop - S * 0.04) {
      const w = Math.min(S * rng.float(0.045, 0.085), stop - x);
      const h = H * rng.float(0.2, 0.31);
      books += spine(x, w, h, rng.pick(colors));
      lastRight = x + w;
      lastH = h;
      x += w + u * rng.float(0, 2.5);
    }
    if (lean && lastH) {
      // Pivot on the bottom-left corner and tip left until the book rests on its neighbour.
      const w = S * rng.float(0.05, 0.075);
      const h = H * rng.float(0.22, 0.27);
      const ang = rng.float(14, 22);
      const rad = (ang * Math.PI) / 180;
      const contact = Math.min(lastH, h * Math.cos(rad));
      const bx = lastRight + contact * Math.tan(rad);
      books += `<g transform="rotate(${n(-ang)} ${n(bx)} ${n(shelfY)})">${spine(bx, w, h, rng.pick(colors))}</g>`;
    }
    s += books;
    s += rect(0, shelfY + plankH, W, plankH * 0.9, p.ink, 'opacity="0.12"');
    s += rect(0, shelfY, W, plankH, p.ink);

    const a = authorFit(c, { font: FONTS.humanist, weight: 600, letterSpacing: 0.22, maxSize: S * 0.044 });
    s += drawText(a, { x: W / 2, y: m * 1.2, anchor: 'middle', fill: p.ink });
    const tTop = shelfY + plankH + m * 0.9;
    const font = rng.pick([FONTS.serif, FONTS.humanist, FONTS.garamond]);
    const t = titleBlock(c, {
      font,
      weight: font === FONTS.humanist ? 600 : 400,
      maxWidth: W - m * 2.2,
      maxHeight: H - m * 1.2 - tTop,
      maxSize: S * 0.16,
      lineHeight: 1.06,
      maxLines: 4,
    });
    s += t.draw({ x: W / 2, y: tTop + (H - m * 1.2 - tTop - t.height) / 2, anchor: 'middle', fill: p.ink });
    return s;
  },
};

export const aurora = {
  id: 'aurora',
  name: 'Aurora',
  group: 'Scenic',
  description: 'Soft blurred colour fields with film grain.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const blur = c.id('blur');
    const sh = c.id('sh');
    const g = grain(c, { opacity: p.dark ? 0.16 : 0.14, light: p.dark });
    let s = `<defs>${blurFilter(blur, S * 0.11)}${shadowFilter(sh, u, { blur: 8, dy: 2, opacity: p.dark ? 0.5 : 0.15 })}${g.defs}</defs>`;
    s += rect(0, 0, W, H, p.bg);
    let blobs = '';
    const cols = rng.shuffle([...p.accents, rng.pick(p.accents), p.dark ? p.bg : p.ink]);
    const count = rng.int(4, 6);
    for (let i = 0; i < count; i++) {
      const col = cols[i % cols.length];
      const op = col === p.ink ? 0.35 : rng.float(0.7, 1);
      blobs += circle(
        rng.float(-0.1, 1.1) * W,
        rng.float(-0.05, 1.05) * H,
        S * rng.float(0.28, 0.5),
        col,
        `opacity="${op.toFixed(2)}"`,
      );
    }
    s += `<g filter="url(#${blur})">${blobs}</g>${g.layer}`;

    const layout = rng.pick(['bottom', 'center', 'top']);
    const font = rng.pick([FONTS.sans, FONTS.serif, FONTS.didone]);
    const a = authorFit(c, { letterSpacing: 0.2, maxSize: S * 0.044 });
    const tOpts = {
      maxWidth: W - m * 2.2,
      maxSize: S * 0.22,
      lineHeight: 1.0,
      maxLines: 5,
      font,
      weight: font === FONTS.sans ? 300 : 400,
      stack: font === FONTS.sans && rng.bool(0.5),
    };
    const shadow = `filter="url(#${sh})"`;
    if (layout === 'center') {
      const t = titleBlock(c, { ...tOpts, maxHeight: H * 0.5 });
      s += t.draw({ x: W / 2, y: (H - t.height) / 2 - H * 0.03, anchor: 'middle', fill: p.ink, attrs: shadow });
      s += drawText(a, { x: W / 2, y: H - m * 1.3 - a.height, anchor: 'middle', fill: p.ink, attrs: shadow });
    } else {
      const t = titleBlock(c, { ...tOpts, maxHeight: H * 0.46 });
      const tY = layout === 'bottom' ? H - m * 1.4 - t.height : m * 1.4;
      const aY = layout === 'bottom' ? m * 1.3 : H - m * 1.3 - a.height;
      s += t.draw({ x: m, y: tY, fill: p.ink, attrs: shadow });
      s += drawText(a, { x: m, y: aY, fill: p.ink, attrs: shadow });
    }
    return s;
  },
};
