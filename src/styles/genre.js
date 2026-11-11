import {
  n,
  rect,
  circle,
  line,
  path,
  pathD,
  mix,
  inkOn,
  readable,
  hexToRgb,
  grain,
  blurFilter,
  linearGradient,
  radialGradient,
} from '../core.js';
import { FONTS, fitText, drawText } from '../text.js';
import { titleBlock, authorFit } from '../type.js';
import { strongAccents } from './util.js';

/** @typedef {import('../index.js').StyleContext} Ctx */

export const thriller = {
  id: 'thriller',
  name: 'Thriller',
  group: 'Genre',
  description: 'Airport thriller: huge author, stacked title, one red bar.',
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const dark = p.dark;
    const base = dark ? mix(p.bg, '#000000', 0.3) : p.bg;
    const light = inkOn(base, p);
    const bar = strongAccents(p, base, 1.6).sort((a, b) => redness(b) - redness(a))[0];
    const tint = rng.pick(p.accents);
    const ids = { blur: c.id('blur'), vig: c.id('vig') };
    const g = grain(c, { opacity: dark ? 0.16 : 0.12, light: dark });

    // A blurred, tinted "photograph": dark shapes, light streaks, vignette and grain.
    let s = `<defs>${blurFilter(ids.blur, S * 0.06)}${radialGradient(
      ids.vig,
      [
        [0.4, '#000000', 0],
        [1, '#000000', dark ? 0.75 : 0.25],
      ],
      { r: 0.75 },
    )}${g.defs}</defs>`;
    s += rect(0, 0, W, H, base);
    let shapes = '';
    for (let i = 0; i < 6; i++) {
      shapes += circle(
        rng.float(0, W),
        rng.float(0, H * 0.75),
        S * rng.float(0.15, 0.4),
        mix(tint, base, rng.float(0.3, 0.8)),
        `opacity="${rng.float(0.4, 0.8).toFixed(2)}"`,
      );
    }
    for (let i = 0; i < 4; i++) {
      const y = rng.float(H * 0.1, H * 0.6);
      shapes += rect(
        -W * 0.1,
        y,
        W * 1.2,
        S * rng.float(0.004, 0.012),
        mix(light, tint, 0.4),
        `opacity="0.5" transform="rotate(${n(rng.float(-12, 12))} ${n(W / 2)} ${n(y)})"`,
      );
    }
    s += `<g filter="url(#${ids.blur})">${shapes}</g>` + rect(0, 0, W, H, `url(#${ids.vig})`) + g.layer;

    const a = authorFit(c, {
      font: FONTS.condensed,
      weight: 800,
      letterSpacing: 0.08,
      maxWidth: W - m * 2,
      maxHeight: H * 0.16,
      maxSize: S * 0.1,
    });
    s += drawText(a, { x: W / 2, y: m * 1.1, anchor: 'middle', fill: light });
    const bottom = H - m;
    const t = titleBlock(c, {
      font: rng.pick([FONTS.condensed, FONTS.display]),
      weight: 800,
      upper: true,
      stack: true,
      subtitle: false,
      maxWidth: W - m * 1.6,
      maxHeight: H * 0.42,
      maxSize: S * 0.32,
      lineHeight: 0.92,
      maxLines: 5,
    });
    const tY = bottom - t.height;
    s += t.draw({ x: W / 2, y: tY, anchor: 'middle', fill: light });
    const barY = tY - S * 0.05;
    s += rect(W / 2 - S * 0.18, barY, S * 0.36, 6 * u, bar);
    if (c.subtitle) {
      // The subtitle is the tagline above the bar.
      const tag = fitText(c.subtitle, {
        font: FONTS.sans,
        weight: 600,
        upper: true,
        letterSpacing: 0.14,
        maxWidth: W - m * 2,
        maxHeight: S * 0.08,
        maxSize: S * 0.03,
        maxLines: 2,
      });
      s += drawText(tag, { x: W / 2, y: barY - S * 0.03 - tag.height, anchor: 'middle', fill: light, opacity: 0.85 });
    }
    return s;
  },
};

/** How red a hex colour is (red channel minus the others). @param {string} hex */
function redness(hex) {
  const [r, g, b] = hexToRgb(hex);
  return r - (g + b) / 2;
}

/**
 * A leaf from (x, y) pointing at `angle`, made of two quadratic curves.
 * @param {number} x @param {number} y @param {number} len @param {number} angle @param {string} color
 */
function leaf(x, y, len, angle, color) {
  const w = len * 0.36;
  const tr = `transform="translate(${n(x)} ${n(y)}) rotate(${n((angle * 180) / Math.PI)})"`;
  return `<path d="M0 0Q${n(len * 0.45)} ${n(-w)} ${n(len)} 0Q${n(len * 0.45)} ${n(w)} 0 0Z" fill="${color}" ${tr}/>`;
}

/** @param {number} x @param {number} y @param {number} r @param {string} petal @param {string} heart @param {number} count */
function bloom(x, y, r, petal, heart, count) {
  let o = '';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 360;
    o += `<ellipse cx="${n(x)}" cy="${n(y - r * 0.55)}" rx="${n(r * 0.32)}" ry="${n(r * 0.55)}" fill="${petal}" transform="rotate(${n(a)} ${n(x)} ${n(y)})"/>`;
  }
  return o + circle(x, y, r * 0.3, heart);
}

export const botanical = {
  id: 'botanical',
  name: 'Botanical',
  group: 'Genre',
  description: 'Hand-drawn stems, leaves and blooms around the title.',
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const strong = strongAccents(p, p.bg, 1.4).concat(p.accents);
    const stem = mix(p.ink, p.bg, 0.2);
    const leafA = mix(strong[1] ?? strong[0], p.ink, 0.35);
    const leafB = mix(leafA, p.bg, 0.3);
    const [petal, heart] = [strong[0], mix(strong[2] ?? p.ink, p.ink, 0.2)];
    const mode = rng.pick(['wreath', 'bouquet']);
    let s = rect(0, 0, W, H, p.bg);
    const a = authorFit(c, { font: FONTS.serif, weight: 400, letterSpacing: 0.2, maxSize: S * 0.044 });
    const aY = H - m * 1.2 - a.height;

    if (mode === 'wreath') {
      const cx = W / 2;
      const cy = Math.min(H * 0.44, (aY - m) / 2 + m * 0.3);
      const R = Math.min(S * 0.36, cy - m * 0.6, (aY - m * 0.6 - cy) * 0.98);
      const stems = 2;
      for (let side = 0; side < stems; side++) {
        // Each half of the wreath grows from the bottom up its side.
        const dir = side ? 1 : -1;
        let d = '';
        const n0 = 22;
        for (let i = 0; i <= n0; i++) {
          const a0 = Math.PI / 2 + dir * (i / n0) * Math.PI * 0.92;
          const x = cx + Math.cos(a0) * R;
          const y = cy + Math.sin(a0) * R;
          d += `${i ? 'L' : 'M'}${n(x)} ${n(y)}`;
          if (i > 0 && i < n0) {
            const tangent = a0 + dir * (Math.PI / 2);
            s += leaf(x, y, S * rng.float(0.05, 0.075), tangent - dir * 0.5, i % 2 ? leafA : leafB);
            s += leaf(x, y, S * rng.float(0.04, 0.065), tangent + dir * 0.9, i % 2 ? leafB : leafA);
          }
        }
        s += `<path d="${d}" fill="none" stroke="${stem}" stroke-width="${n(2 * u)}" stroke-linecap="round"/>`;
      }
      const blooms = rng.int(3, 5);
      for (let i = 0; i < blooms; i++) {
        const a0 = rng.float(0.15, 0.85) * Math.PI * 2;
        s += bloom(
          cx + Math.cos(a0) * R,
          cy + Math.sin(a0) * R,
          S * rng.float(0.035, 0.05),
          petal,
          heart,
          rng.int(5, 8),
        );
      }
      const t = titleBlock(c, {
        font: rng.pick([FONTS.serif, FONTS.didone, FONTS.garamond]),
        maxWidth: R * 1.35,
        maxHeight: R * 1.1,
        maxSize: S * 0.13,
        lineHeight: 1.08,
        maxLines: 5,
      });
      s += t.draw({ x: cx, y: cy - t.height / 2, anchor: 'middle', fill: p.ink });
    } else {
      // A bouquet rising from the bottom, the title above it.
      const baseX = W / 2;
      const baseY = aY - m * 0.6;
      const top = H * 0.42;
      const count = rng.int(5, 8);
      for (let i = 0; i < count; i++) {
        const spread = (i / (count - 1) - 0.5) * 2;
        const tipX = baseX + spread * W * 0.34 + rng.float(-1, 1) * S * 0.03;
        const tipY = top + Math.abs(spread) * H * 0.12 + rng.float(0, 1) * S * 0.04;
        const cx1 = baseX + spread * W * 0.08;
        const cy1 = (baseY + tipY) / 2;
        s += `<path d="M${n(baseX)} ${n(baseY)}Q${n(cx1)} ${n(cy1)} ${n(tipX)} ${n(tipY)}" fill="none" stroke="${stem}" stroke-width="${n(2 * u)}" stroke-linecap="round"/>`;
        for (let k = 1; k <= 3; k++) {
          const t = k / 4;
          const x = (1 - t) ** 2 * baseX + 2 * (1 - t) * t * cx1 + t * t * tipX;
          const y = (1 - t) ** 2 * baseY + 2 * (1 - t) * t * cy1 + t * t * tipY;
          const ang = Math.atan2(tipY - baseY, tipX - baseX);
          s += leaf(x, y, S * rng.float(0.05, 0.08), ang + (k % 2 ? 0.9 : -0.9), k % 2 ? leafA : leafB);
        }
        s += bloom(
          tipX,
          tipY,
          S * rng.float(0.035, 0.055),
          i % 3 ? petal : mix(petal, p.bg, 0.3),
          heart,
          rng.int(5, 8),
        );
      }
      const t = titleBlock(c, {
        font: rng.pick([FONTS.serif, FONTS.didone, FONTS.garamond]),
        maxWidth: W - m * 2.2,
        maxHeight: top - m * 2.2 - S * 0.06,
        maxSize: S * 0.15,
        lineHeight: 1.06,
        maxLines: 4,
      });
      s += t.draw({ x: W / 2, y: m * 1.3, anchor: 'middle', fill: p.ink });
    }
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: p.ink });
    return s;
  },
};

// A figure in a hat and long coat, in a 1 × 1 box (feet at the bottom).
const FIGURE = [
  [0.25, 0.125],
  [0.36, 0.11],
  [0.38, 0.02],
  [0.62, 0.02],
  [0.64, 0.11],
  [0.75, 0.125],
  [0.75, 0.14],
  [0.6, 0.14],
  [0.6, 0.2],
  [0.56, 0.22],
  [0.8, 0.26],
  [0.86, 0.4],
  [0.88, 0.62],
  [0.92, 1],
  [0.08, 1],
  [0.12, 0.62],
  [0.14, 0.4],
  [0.2, 0.26],
  [0.44, 0.22],
  [0.4, 0.2],
  [0.4, 0.14],
  [0.25, 0.14],
];

export const noir = {
  id: 'noir',
  name: 'Noir',
  group: 'Genre',
  description: 'A street lamp, a figure, and blind shadows across the title.',
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, m, rng, p } = c;
    const dark = p.dark;
    const bg = dark ? mix(p.night, '#000000', 0.45) : p.bg;
    const light = dark ? p.paper : p.ink;
    const accent = rng.pick(strongAccents(p, bg, 2));
    const ids = { cone: c.id('cone'), blur: c.id('blur') };
    const g = grain(c, { opacity: dark ? 0.2 : 0.14, light: dark });
    const lampX = W * rng.pick([0.2, 0.78]);
    const groundY = H * 0.94;
    const a = authorFit(c, { font: FONTS.condensed, weight: 700, letterSpacing: 0.26, maxSize: S * 0.044 });
    const font = rng.pick([FONTS.display, FONTS.condensed]);
    const stack = rng.bool(0.6);
    const fitTitle = (/** @type {number} */ lamp) =>
      titleBlock(c, {
        font,
        weight: 700,
        upper: true,
        stack,
        maxWidth: W - m * 2,
        // The author sits under the title, so the title leaves room for it above the lamp.
        maxHeight: lamp - S * 0.1 - m * 1.6 - (a.lines.length ? a.height + m * 0.7 : 0),
        maxSize: S * 0.26,
        lineHeight: 0.94,
        maxLines: 4,
        subtitleFont: FONTS.condensed,
        subtitleItalic: false,
      });
    // The lamp stands lower when a long title needs the room.
    let lampY = H * 0.5;
    let t = fitTitle(lampY);
    while ((t.truncated || t.size < S * 0.06) && lampY < H * 0.64) t = fitTitle((lampY += H * 0.035));

    let s = `<defs>${linearGradient(ids.cone, [
      [0, light, 0.5],
      [1, light, 0.04],
    ])}${blurFilter(ids.blur, S * 0.01)}${g.defs}</defs>`;
    s += rect(0, 0, W, H, bg);
    // The lamp's cone of light, the lamp post and its head.
    s += path(
      pathD(
        [
          [lampX - S * 0.02, lampY],
          [lampX + S * 0.02, lampY],
          [lampX + S * 0.34, groundY],
          [lampX - S * 0.34, groundY],
        ],
        true,
      ),
      `url(#${ids.cone})`,
      `filter="url(#${ids.blur})"`,
    );
    s += `<ellipse cx="${n(lampX)}" cy="${n(groundY)}" rx="${n(S * 0.34)}" ry="${n(S * 0.04)}" fill="${light}" opacity="0.2"/>`;
    const post = mix(bg, light, dark ? 0.12 : 0.6);
    s += rect(lampX - S * 0.008, lampY, S * 0.016, H - lampY, post);
    s += path(
      pathD(
        [
          [lampX - S * 0.04, lampY],
          [lampX + S * 0.04, lampY],
          [lampX + S * 0.025, lampY - S * 0.05],
          [lampX - S * 0.025, lampY - S * 0.05],
        ],
        true,
      ),
      post,
    );
    s += circle(lampX, lampY + S * 0.006, S * 0.022, light, 'opacity="0.9"');
    // The figure, standing at the edge of the light.
    const fh = H * 0.36;
    const fw = fh * 0.42;
    const fx = lampX + (lampX < W / 2 ? 1 : -1) * S * 0.15 - fw / 2;
    const figure = FIGURE.map(([x, y]) => [fx + x * fw, groundY - fh + y * fh]);
    s += path(pathD(figure, true), dark ? '#000000' : mix(p.ink, '#000000', 0.4));

    const tY = m * 1.3;
    s += t.draw({ x: m, y: tY, fill: light });
    // Venetian-blind shadows fall across everything above the lamp, title included.
    const ang = rng.float(-24, -12);
    const sp = H * rng.float(0.045, 0.06);
    let bars = '';
    for (let y = -H * 0.3; y < H * 0.9; y += sp) bars += rect(-W * 0.3, y, W * 1.6, sp * 0.3, bg);
    s += `<g transform="rotate(${n(ang)} ${n(W / 2)} ${n(H / 3)})" opacity="0.38">${bars}</g>`;
    s += drawText(a, { x: m, y: tY + t.height + m * 0.7, fill: accent });
    s += g.layer;
    return s;
  },
};

/**
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {string} color @param {number} u
 * @param {string} label
 */
function dimension(x1, y1, x2, y2, color, u, label) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ a) =>
    path(
      pathD(
        [
          [x, y],
          [x - Math.cos(a - 0.35) * 9 * u, y - Math.sin(a - 0.35) * 9 * u],
          [x - Math.cos(a + 0.35) * 9 * u, y - Math.sin(a + 0.35) * 9 * u],
        ],
        true,
      ),
      color,
    );
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    line(x1, y1, x2, y2, color, u) +
    head(x2, y2, ang) +
    head(x1, y1, ang + Math.PI) +
    `<text x="${n(mx)}" y="${n(my - 6 * u)}" font-family="${FONTS.mono.family}" font-size="${n(13 * u)}" fill="${color}" text-anchor="middle" transform="rotate(${n((ang * 180) / Math.PI)} ${n(mx)} ${n(my)})">${label}</text>`
  );
}

export const blueprint = {
  id: 'blueprint',
  name: 'Blueprint',
  group: 'Genre',
  description: 'A technical drawing with dimensions and a title block.',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const dark = p.dark;
    const bg = dark ? p.bg : p.paper;
    const ink = dark ? p.paper : p.night;
    const accent = readable(bg, p.accents);
    const cell = S / 40;
    let s = rect(0, 0, W, H, bg);
    let minor = '';
    let major = '';
    for (let x = 0, i = 0; x <= W; x += cell, i++) i % 5 ? (minor += `M${n(x)} 0V${H}`) : (major += `M${n(x)} 0V${H}`);
    for (let y = 0, i = 0; y <= H; y += cell, i++) i % 5 ? (minor += `M0 ${n(y)}H${W}`) : (major += `M0 ${n(y)}H${W}`);
    s += `<path d="${minor}" stroke="${ink}" stroke-width="${n(0.5 * u)}" opacity="0.12"/>`;
    s += `<path d="${major}" stroke="${ink}" stroke-width="${n(0.8 * u)}" opacity="0.22"/>`;

    const blockH = Math.max(H * 0.24, S * 0.3);
    const cx = W / 2;
    const cy = (H - blockH) / 2 + m * 0.3;
    const R = Math.min(S * 0.3, (H - blockH) * 0.36);
    const outline = (/** @type {number} */ w) => `stroke="${ink}" stroke-width="${n(w * u)}"`;
    const stroke = `fill="none" ${outline(1.6)}`;
    const center = `stroke-dasharray="${n(14 * u)} ${n(4 * u)} ${n(3 * u)} ${n(4 * u)}" opacity="0.7"`;
    const kind = rng.pick(['gear', 'iso', 'section']);
    if (kind === 'gear') {
      const teeth = rng.int(12, 20);
      const pts = [];
      for (let i = 0; i < teeth * 4; i++) {
        const a = (i / (teeth * 4)) * Math.PI * 2;
        const r = i % 4 < 2 ? R : R * 0.86;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      s += `<path d="${pathD(pts, true)}" ${stroke}/>`;
      s += circle(cx, cy, R * 0.62, 'none', outline(1)) + circle(cx, cy, R * 0.22, 'none', outline(1.6));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        s += circle(cx + Math.cos(a) * R * 0.42, cy + Math.sin(a) * R * 0.42, R * 0.07, 'none', outline(1.6));
      }
      s += dimension(cx - R, cy + R + S * 0.06, cx + R, cy + R + S * 0.06, accent, u, `Ø ${Math.round(R * 2 * 0.4)}`);
    } else if (kind === 'iso') {
      const k = R * 0.95;
      const c30 = Math.cos(Math.PI / 6);
      const P = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => [
        cx + (x - y) * c30 * k,
        cy + ((x + y) * 0.5 - z) * k,
      ];
      const hgt = rng.float(0.6, 1.1);
      const top = [P(0, 0, hgt), P(1, 0, hgt), P(1, 1, hgt), P(0, 1, hgt)].map(([x, y]) => [x, y - k * 0.3]);
      const bottom = [P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)].map(([x, y]) => [x, y - k * 0.3]);
      s += `<path d="${pathD(top, true)}" ${stroke}/>`;
      for (const i of [1, 2, 3]) s += line(top[i][0], top[i][1], bottom[i][0], bottom[i][1], ink, 1.6 * u);
      s += `<path d="${pathD([bottom[1], bottom[2], bottom[3]])}" ${stroke}/>`;
      s += `<path d="${pathD([bottom[1], bottom[0], bottom[3]])}" fill="none" stroke="${ink}" stroke-width="${n(u)}" stroke-dasharray="${n(6 * u)} ${n(4 * u)}" opacity="0.6"/>`;
      s += line(
        top[0][0],
        top[0][1],
        bottom[0][0],
        bottom[0][1],
        ink,
        u,
        `stroke-dasharray="${n(6 * u)} ${n(4 * u)}" opacity="0.6"`,
      );
      s += dimension(
        bottom[2][0],
        bottom[2][1] + S * 0.05,
        bottom[1][0],
        bottom[1][1] + S * 0.05,
        accent,
        u,
        String(rng.int(80, 240)),
      );
    } else {
      for (const r of [R, R * 0.8, R * 0.46, R * 0.3]) s += circle(cx, cy, r, 'none', outline(1.6));
      // Hatched section between the outer rings.
      const clip = c.id('ring');
      let hatch = '';
      for (let x = -R; x <= R; x += 7 * u) hatch += `M${n(cx + x)} ${n(cy - R)}l${n(R)} ${n(R * 2)}`;
      s += `<defs><mask id="${clip}">${circle(cx, cy, R, '#fff')}${circle(cx, cy, R * 0.8, '#000')}</mask></defs>`;
      s += `<path d="${hatch}" stroke="${ink}" stroke-width="${n(u)}" opacity="0.6" mask="url(#${clip})"/>`;
      s += dimension(
        cx - R * 0.46,
        cy + R + S * 0.06,
        cx + R * 0.46,
        cy + R + S * 0.06,
        accent,
        u,
        `Ø ${Math.round(R * 0.92 * 0.4)}`,
      );
    }
    s += line(cx - R * 1.25, cy, cx + R * 1.25, cy, ink, u, center);
    s += line(cx, cy - R * 1.25, cx, cy + R * 1.25, ink, u, center);

    // Engineering title block.
    const bx = m * 0.8;
    const by = H - m * 0.8 - blockH;
    const bw = W - m * 1.6;
    const labelSize = S * 0.018;
    const labelRow = blockH * 0.18;
    s += rect(bx, by, bw, blockH, bg, `stroke="${ink}" stroke-width="${n(2 * u)}"`);
    s += line(bx, by + blockH * 0.68, bx + bw, by + blockH * 0.68, ink, u);
    s += line(bx + bw * 0.68, by + blockH * 0.68, bx + bw * 0.68, by + blockH, ink, u);
    const label = (/** @type {string} */ text, /** @type {number} */ x, /** @type {number} */ y) =>
      `<text x="${n(x)}" y="${n(y)}" font-family="${FONTS.mono.family}" font-size="${n(labelSize)}" fill="${ink}" opacity="0.7">${text}</text>`;
    s += label('TITLE', bx + m * 0.4, by + labelRow * 0.7);
    s += label('AUTHOR', bx + m * 0.4, by + blockH * 0.68 + labelRow * 0.7);
    s += label(`SCALE 1:${rng.pick([2, 5, 10, 20])}`, bx + bw * 0.68 + m * 0.3, by + blockH * 0.68 + labelRow * 0.7);
    s += label('SHEET 1 OF 1', bx + bw * 0.68 + m * 0.3, by + blockH - m * 0.35);
    const t = titleBlock(c, {
      font: FONTS.condensed,
      weight: 700,
      upper: true,
      letterSpacing: 0.04,
      maxWidth: bw - m * 0.8,
      maxHeight: blockH * 0.68 - labelRow - m * 0.45,
      maxSize: S * 0.11,
      lineHeight: 1.0,
      maxLines: 3,
      subtitleFont: FONTS.mono,
      subtitleItalic: false,
    });
    s += t.draw({ x: bx + m * 0.4, y: by + labelRow + m * 0.15, fill: ink });
    const a = authorFit(c, {
      font: FONTS.mono,
      weight: 700,
      letterSpacing: 0.04,
      maxWidth: bw * 0.68 - m * 0.8,
      maxHeight: blockH * 0.32 - labelRow - m * 0.2,
      maxSize: S * 0.036,
      maxLines: 1,
    });
    s += drawText(a, { x: bx + m * 0.4, y: by + blockH * 0.68 + labelRow + m * 0.1, fill: ink });
    return s;
  },
};
