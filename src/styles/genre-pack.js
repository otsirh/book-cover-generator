// Styles made for genres the others don't speak to: horror, romance, fantasy, children's books
// and non-fiction.

import {
  n,
  rect,
  circle,
  path,
  mix,
  clamp,
  contrast,
  luminance,
  grain,
  blurFilter,
  shadowFilter,
  linearGradient,
  radialGradient,
  ridge,
} from '../core.js';
import { FONTS, drawText, fitText, typedLines } from '../text.js';
import { titleBlock, authorFit } from '../type.js';
import { strongAccents, textColor, tintText, leaf, most, redness, rosy, yellowness, coolness, chroma } from './util.js';

/** @typedef {import('../index.js').StyleContext} Ctx */

/**
 * The palette's accents, those that stand out on `bg` first, each colour once: at least three
 * (a palette with fewer different accents gets shades of them).
 * @param {import('../index.js').ResolvedPalette} p @param {string} bg @param {number} min
 */
function accentsOn(p, bg, min) {
  const list = [...new Set([...strongAccents(p, bg, min), ...p.accents])];
  while (list.length < 3) list.push(mix(list[list.length - 1], list.length % 2 ? p.ink : p.paper, 0.35));
  return list;
}

/* ------------------------------------------------------------------ hollow */

export const hollow = {
  id: 'hollow',
  name: 'Hollow',
  group: 'Genre',
  description: 'Horror: a dead tree against a full or blood moon, fog, and worn lettering.',
  variants: { moon: { label: 'Moon', values: { full: 'Full', blood: 'Blood moon' } } },
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const moon = c.choose('moon', ['full', 'full', 'blood']);
    // A night that is black, not blue (Cobalt's and Teal's night is bright).
    let night = mix(p.night, '#000000', 0.35);
    for (let i = 0; i < 4 && luminance(night) > 0.012; i++) night = mix(night, '#000000', 0.25);
    // The moon: the palest of the palette's colours, taken toward moonlight (Mustard's paper is mustard).
    const palest = [p.paper, ...p.accents].reduce((best, col) => (luminance(col) > luminance(best) ? col : best));
    const pale = mix(palest, '#f1ede4', 0.45);
    const blood = mix('#c2281c', most(p.accents, redness), 0.25);
    const glowC = moon === 'blood' ? blood : mix(pale, p.accents[1], 0.08);
    const ground = mix(night, '#000000', 0.6);
    const ink = textColor(p, ground, [pale, p.paper]);

    const a = authorFit(c, { font: FONTS.sans, weight: 600, letterSpacing: 0.28, maxSize: S * 0.042 });
    const t = titleBlock(c, {
      font: FONTS.condensed,
      weight: 700,
      upper: true,
      letterSpacing: 0.05,
      maxWidth: W - m * 2,
      maxHeight: H * 0.3,
      maxSize: S * 0.17,
      lineHeight: 1.0,
      stack: true,
      subtitle: false,
    });
    // The subtitle is a crisp tagline under the worn title (a credit is a line of its own after it).
    const tag = c.subtitle
      ? fitText(c.subtitle, {
          font: FONTS.sans,
          weight: 600,
          upper: true,
          letterSpacing: 0.2,
          maxWidth: W - m * 2,
          maxHeight: S * 0.08 * (1 + (typedLines(c.subtitle) - 1) * 0.5),
          maxSize: Math.min(S * 0.028, t.smallest),
          maxLines: 1 + typedLines(c.subtitle),
        })
      : null;
    const tagRoom = tag ? tag.height + tag.size * 1.3 : 0;
    const titleY = H - m * 1.1 - tagRoom - t.height;
    const groundY = Math.max(H * 0.55, titleY - m * 0.9);
    const skyTop = m + a.height + m * 0.6;

    // The moon, as big as the sky allows, high in it; the scene keeps to the foot of a tall sky.
    const artH = Math.min(groundY - skyTop, S * 1.05);
    const artTop = groundY - artH;
    const r = Math.min(S * rng.float(0.17, 0.23), artH * 0.34, W * 0.3);
    const mx = W * rng.float(0.3, 0.7);
    const my = artTop + r * 1.08 + (artH - r * 2.2) * rng.float(0.05, 0.3);

    const ids = {
      sky: c.id('sky'),
      halo: c.id('halo'),
      moon: c.id('moon'),
      fog: c.id('fog'),
      rough: c.id('rough'),
      vig: c.id('vig'),
    };
    const skyC = [mix(night, '#000000', 0.4), mix(night, glowC, 0.34)];
    let s =
      `<defs>${linearGradient(ids.sky, [
        [0, skyC[0]],
        [1, skyC[1]],
      ])}` +
      radialGradient(ids.halo, [
        [0.3, glowC, 0.5],
        [0.55, glowC, 0.16],
        [1, glowC, 0],
      ]) +
      radialGradient(
        ids.vig,
        [
          [0.4, '#000000', 0],
          [1, '#000000', 0.6],
        ],
        { r: 0.75 },
      ) +
      `<clipPath id="${ids.moon}">${circle(mx, my, r, '#000000')}</clipPath>` +
      blurFilter(ids.fog, S * 0.03) +
      // Worn letters: noise displaces their edges a little and eats into them in vertical streaks.
      `<filter id="${ids.rough}" x="-5%" y="-10%" width="110%" height="120%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${+(0.045 / u).toFixed(3)} ${+(0.012 / u).toFixed(3)}" numOctaves="3" seed="${rng.int(1, 99)}" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="${n(Math.min(3.2 * u, t.smallest * 0.035))}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 12 0 -8" result="holes"/>` +
      `<feComposite in="d" in2="holes" operator="out"/></filter></defs>`;
    s += rect(0, 0, W, H, `url(#${ids.sky})`);

    // The moon: a halo, the disc in shade, its lit face and seas (all inside the disc).
    s += circle(mx, my, r * 3.2, `url(#${ids.halo})`);
    s += circle(mx, my, r, mix(glowC, night, 0.22));
    let face = circle(mx - r * 0.14, my - r * 0.08, r, glowC);
    for (let i = 0; i < 5; i++) {
      const ang = rng.float(0, Math.PI * 2);
      const d = r * rng.float(0.1, 0.7);
      face += circle(mx + Math.cos(ang) * d, my + Math.sin(ang) * d, r * rng.float(0.07, 0.2), mix(glowC, night, 0.14));
    }
    s += `<g clip-path="url(#${ids.moon})">${face}</g>`;

    // Birds, now and then, crossing the halo (clear of the author's name).
    if (rng.bool(0.5)) {
      let birds = '';
      for (let i = rng.int(2, 4); i > 0; i--) {
        const bx = mx + (rng.bool() ? 1 : -1) * r * rng.float(1.1, 2.2);
        const by = Math.max(skyTop + S * 0.03, my + r * rng.float(-1.2, 0.6));
        const bw = S * rng.float(0.012, 0.02);
        birds += `M${n(bx - bw)} ${n(by)}Q${n(bx - bw / 2)} ${n(by - bw * 0.6)} ${n(bx)} ${n(by)}Q${n(bx + bw / 2)} ${n(by - bw * 0.6)} ${n(bx + bw)} ${n(by)}`;
      }
      s += `<path d="${birds}" fill="none" stroke="${ground}" stroke-width="${n(1.6 * u)}" stroke-linecap="round"/>`;
    }

    // Fog behind the tree.
    const fog = (/** @type {number} */ k) =>
      `<ellipse cx="${n(W * rng.float(0.2, 0.8))}" cy="${n(groundY - S * (0.02 + k * 0.035))}" rx="${n(W * rng.float(0.5, 0.8))}" ry="${n(S * 0.03)}" fill="${pale}" opacity="${(0.1 + k * 0.04).toFixed(2)}"/>`;
    s += `<g filter="url(#${ids.fog})">${fog(2)}</g>`;

    // The tree: a leader that carries on and limbs that break away, grown in its own space (base
    // at 0,0, trunk 1 long), then fitted so it leans back across the moon, its crown in the moon's
    // upper half.
    const side = rng.bool() ? 1 : -1;
    const baseX = clamp(mx + side * r * rng.float(0.55, 1.15), W * 0.14, W * 0.86);
    const baseY = groundY + S * 0.02;
    /** x1 y1 qx qy x2 y2 depth. @type {number[][]} */
    const limbs = [];
    /** @param {number} x @param {number} y @param {number} ang @param {number} len @param {number} depth */
    const grow = (x, y, ang, len, depth) => {
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      const bend = rng.float(-0.28, 0.28) * len;
      limbs.push([x, y, (x + x2) / 2 - Math.sin(ang) * bend, (y + y2) / 2 + Math.cos(ang) * bend, x2, y2, depth]);
      if (!depth) return;
      const turn = rng.bool() ? 1 : -1;
      grow(x2, y2, ang + turn * rng.float(0.1, 0.45), len * rng.float(0.74, 0.86), depth - 1);
      grow(x2, y2, ang - turn * rng.float(0.6, 1.15), len * rng.float(0.5, 0.72), depth - 1);
      // A dead twig.
      if (depth > 1 && rng.bool(0.3)) grow(x2, y2, ang + turn * rng.float(1.0, 1.5), len * 0.35, 0);
    };
    grow(0, 0, -Math.PI / 2 - side * rng.float(0.08, 0.26), 1, 6);
    const xs = limbs.map((l) => l[4]);
    const reach = -Math.min(...limbs.map((l) => Math.min(l[5], (l[1] + 2 * l[3] + l[5]) / 4)));
    const crown = Math.max(artTop + m * 0.2, my - r * rng.float(0.3, 1));
    const scale = Math.min((baseY - crown) / reach, (W * 1.15) / (Math.max(...xs) - Math.min(...xs)));
    const byDepth = Array.from({ length: 7 }, () => '');
    for (const [x1, y1, qx, qy, x2, y2, depth] of limbs) {
      byDepth[depth] +=
        `M${n(baseX + x1 * scale)} ${n(baseY + y1 * scale)}` +
        `Q${n(baseX + qx * scale)} ${n(baseY + qy * scale)} ${n(baseX + x2 * scale)} ${n(baseY + y2 * scale)}`;
    }
    const bark = mix(ground, '#000000', 0.5);
    s += `<g fill="none" stroke="${bark}" stroke-linecap="round">${byDepth
      .map((segs, depth) =>
        segs ? `<path d="${segs}" stroke-width="${n(Math.max(0.9 * u, 0.2 * scale * 0.66 ** (6 - depth)))}"/>` : '',
      )
      .join('')}</g>`;

    // Fog in front, then the hill, rising to a knoll under the tree, and now and then graves.
    s += `<g filter="url(#${ids.fog})">${fog(0)}${fog(1)}</g>`;
    const hill = ridge(rng, 24, 0.5);
    const heightAt = (/** @type {number} */ x, /** @type {number} */ v) =>
      groundY + v * S * 0.02 - S * 0.045 * Math.exp(-(((x - baseX) / (W * 0.22)) ** 2));
    let d = `M0 ${n(H)}`;
    hill.forEach((v, i) => {
      const x = (i / (hill.length - 1)) * W;
      d += `L${n(x)} ${n(heightAt(x, v))}`;
    });
    s += path(`${d}L${n(W)} ${n(H)}Z`, ground);
    let graves = '';
    for (let i = rng.int(0, 4); i > 0; i--) {
      const gx = W * rng.float(0.06, 0.94);
      if (Math.abs(gx - baseX) < W * 0.08) continue;
      const gy = heightAt(gx, hill[Math.round((gx / W) * (hill.length - 1))]) + S * 0.006;
      const gs = S * rng.float(0.022, 0.04);
      const lean = `transform="rotate(${n(rng.float(-12, 12))} ${n(gx)} ${n(gy)})"`;
      graves += rng.bool()
        ? `<path d="M${n(gx - gs * 0.06)} ${n(gy)}V${n(gy - gs)}M${n(gx - gs * 0.35)} ${n(gy - gs * 0.7)}H${n(gx + gs * 0.35)}" stroke="${ground}" stroke-width="${n(gs * 0.14)}" ${lean}/>`
        : path(
            `M${n(gx - gs * 0.3)} ${n(gy)}V${n(gy - gs * 0.6)}A${n(gs * 0.3)} ${n(gs * 0.3)} 0 0 1 ${n(gx + gs * 0.3)} ${n(gy - gs * 0.6)}V${n(gy)}Z`,
            ground,
            lean,
          );
    }
    s += graves;

    const g = grain(c, { opacity: 0.18, light: true, id: 'grain' });
    s += `<defs>${g.defs}</defs>${rect(0, 0, W, H, `url(#${ids.vig})`)}${g.layer}`;
    s += drawText(a, {
      x: W / 2,
      y: m,
      anchor: 'middle',
      fill: tintText(textColor(p, skyC, [p.paper]), glowC, 0.2, skyC),
    });
    // On a blood moon, a stacked title's last line is set in blood.
    const bloodInk = textColor(p, ground, [mix(blood, '#ff6a4d', 0.35)]);
    const lineFills = moon === 'blood' && t.stacked ? [...Array(t.lines - 1), bloodInk] : [];
    s += `<g filter="url(#${ids.rough})">${t.draw({ x: W / 2, y: titleY, anchor: 'middle', fill: ink, lineFills })}</g>`;
    if (tag) {
      s += drawText(tag, {
        x: W / 2,
        y: H - m * 1.1 - tag.height,
        anchor: 'middle',
        fill: tintText(ink, glowC, 0.3, ground),
      });
    }
    return s;
  },
};

/* ------------------------------------------------------------------ ribbon */

/**
 * A ribbon turning over along a cubic curve P, w wide: the runs of its face and its back, a
 * polygon each. lo..hi is the part of its width drawn (-1..1 is all of it); with no `back`, only
 * the face is drawn.
 * @param {number[][]} P @param {number} w @param {number} turns @param {number} phase
 * @param {string} face @param {string} back @param {number} [lo] @param {number} [hi]
 */
function strip(P, w, turns, phase, face, back, lo = -1, hi = 1) {
  /** x, y, the normal's x and y scaled to the signed half-width, and the signed half-width. */
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const f = i / 48;
    const g = 1 - f;
    const x = g * g * g * P[0][0] + 3 * g * g * f * P[1][0] + 3 * g * f * f * P[2][0] + f * f * f * P[3][0];
    const y = g * g * g * P[0][1] + 3 * g * g * f * P[1][1] + 3 * g * f * f * P[2][1] + f * f * f * P[3][1];
    const dx = 3 * g * g * (P[1][0] - P[0][0]) + 6 * g * f * (P[2][0] - P[1][0]) + 3 * f * f * (P[3][0] - P[2][0]);
    const dy = 3 * g * g * (P[1][1] - P[0][1]) + 6 * g * f * (P[2][1] - P[1][1]) + 3 * f * f * (P[3][1] - P[2][1]);
    const len = Math.hypot(dx, dy) || 1;
    const half = (Math.cos(phase + f * turns * Math.PI) * w) / 2;
    pts.push([x, y, (-dy / len) * half, (dx / len) * half, half]);
  }
  let out = '';
  /** @type {number[][]} */
  let run = [];
  const flush = () => {
    const col = run[1][4] >= 0 ? face : back;
    if (!col) return;
    const up = run.map(([x, y, nx, ny]) => `${n(x + nx * hi)} ${n(y + ny * hi)}`);
    const down = run.map(([x, y, nx, ny]) => `${n(x + nx * lo)} ${n(y + ny * lo)}`).reverse();
    out += `<path d="M${up.join('L')}L${down.join('L')}Z" fill="${col}"/>`;
  };
  for (const q of pts) {
    const prev = run[run.length - 1];
    if (prev && q[4] * prev[4] < 0) {
      // The turn, where the two edges meet: one run ends and the next begins.
      const f = prev[4] / (prev[4] - q[4]);
      const turn = [prev[0] + (q[0] - prev[0]) * f, prev[1] + (q[1] - prev[1]) * f, 0, 0, 0];
      run.push(turn);
      flush();
      run = [turn];
    }
    run.push(q);
  }
  flush();
  return out;
}

/** A petal pointing up from its base at the origin, 1 long. */
const PETAL = 'M0 0C0.55 -0.25 0.6 -0.85 0.12 -1Q0 -0.9 -0.12 -1C-0.6 -0.85 -0.55 -0.25 0 0Z';

export const ribbon = {
  id: 'ribbon',
  name: 'Ribbon',
  group: 'Genre',
  description: 'Romance: ribbons turning over under an italic title, and falling petals.',
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    // A rosy ribbon when the palette has one, and a ground that blushes (or, on a dark palette,
    // a dark romance).
    const dark = p.dark;
    const list = accentsOn(p, dark ? p.bg : p.paper, 1.3);
    const warmest = most(list, rosy);
    const hero = rosy(warmest) >= 80 ? warmest : list[0];
    const top = dark ? mix(p.bg, '#000000', 0.25) : mix(p.paper, hero, 0.05);
    const bottom = dark ? mix(p.bg, hero, 0.18) : mix(p.paper, hero, 0.2);
    const away = dark ? p.paper : p.night;
    let c1 = hero;
    for (let i = 0; i < 10 && contrast(c1, bottom) < 2; i++) c1 = mix(c1, away, 0.12);
    let c2 = list.find((col) => col !== hero) ?? hero;
    for (let i = 0; i < 10 && contrast(c2, bottom) < 1.8; i++) c2 = mix(c2, away, 0.12);
    const ink = textColor(p, [top, bottom], [away, mix(away, hero, 0.4)]);

    const a = authorFit(c, { font: FONTS.serif, weight: 400, letterSpacing: 0.24, maxSize: S * 0.04 });
    const t = titleBlock(c, {
      font: FONTS.didone,
      italic: true,
      maxWidth: W - m * 2,
      maxHeight: H * 0.4,
      maxSize: S * 0.19,
      lineHeight: 1.0,
      subtitleFont: FONTS.serif,
      subtitleItalic: false,
      subtitleUpper: true,
    });
    const titleY = Math.max(m * 1.6, H * 0.34 - t.height / 2);
    const aY = H - m * 1.2 - a.height;
    const ids = { bg: c.id('bg'), soft: c.id('soft'), sh: c.id('sh') };
    let s = `<defs>${linearGradient(ids.bg, [
      [0, top],
      [1, bottom],
    ])}${blurFilter(ids.soft, S * 0.012, { width: W, height: H })}${shadowFilter(ids.sh, u, { blur: 5, dy: 3, opacity: 0.22 })}</defs>`;
    s += rect(0, 0, W, H, `url(#${ids.bg})`);

    const tints = [c1, mix(c1, p.paper, 0.35), mix(c1, p.paper, 0.6), mix(c1, p.night, 0.15)];
    /** @param {number} x @param {number} y @param {number} len @param {string} col @param {number} opacity */
    const petal = (x, y, len, col, opacity) =>
      `<path d="${PETAL}" fill="${col}" opacity="${opacity.toFixed(2)}" transform="translate(${n(x)} ${n(y)}) rotate(${rng.int(0, 359)}) scale(${n(len)})"/>`;
    // Three large petals at the edges, out of focus.
    let near = '';
    for (let i = 0; i < 3; i++) {
      near += petal(
        rng.bool() ? -W * 0.02 : W * 1.02,
        rng.float(0, H),
        S * rng.float(0.08, 0.12),
        rng.pick(tints),
        0.5,
      );
    }
    s += `<g filter="url(#${ids.soft})">${near}</g>`;

    // Two ribbons, one wide and one narrow, turning over in the room between the title and the
    // author. Every point that steers them lies inside that room, so they stay in it.
    const bandTop = titleY + t.height + m * 0.6;
    const bandBottom = aY - m * 0.6;
    const span = Math.max(0, bandBottom - bandTop);
    let ribbons = '';
    [c1, c2].forEach((col, k) => {
      const w = Math.min(S * (k ? rng.float(0.028, 0.042) : rng.float(0.07, 0.1)), span * 0.4);
      const at = (/** @type {number} */ f) => bandTop + w / 2 + (span - w) * f;
      const P = [
        [-W * 0.1, at(k ? rng.float(0.5, 1) : rng.float(0, 0.5))],
        [W * 0.3, at(rng.float(0, 1))],
        [W * 0.7, at(rng.float(0, 1))],
        [W * 1.1, at(k ? rng.float(0, 0.5) : rng.float(0.5, 1))],
      ];
      const turns = rng.float(1.6, 3.2);
      const phase = rng.float(0, Math.PI);
      if (w < S * 0.01) return;
      // Its face and back, and a sheen on the face.
      ribbons +=
        strip(P, w, turns, phase, col, mix(col, p.night, 0.32)) +
        strip(P, w, turns, phase, mix(col, '#ffffff', 0.4), '', 0.15, 0.5);
    });
    s += `<g filter="url(#${ids.sh})">${ribbons}</g>`;

    // Petals where there is no text: above the title, beside it, and among the ribbons.
    const pad = m * 0.7;
    const side = Math.max(0, W / 2 - t.width / 2 - pad);
    const zones = [
      [0, 0, W, titleY - pad],
      [0, titleY, side, t.height],
      [W - side, titleY, side, t.height],
      [0, bandTop, W, span],
    ].map(([x, y, zw, zh]) => [x, y, Math.max(0, zw), Math.max(0, zh)]);
    const total = zones.reduce((sum, z) => sum + z[2] * z[3], 0);
    let petals = '';
    for (let i = rng.int(10, 15); i > 0; i--) {
      const len = S * rng.float(0.022, 0.045);
      let pick = rng.float(0, total);
      const [zx, zy, zw, zh] = zones.find((z) => (pick -= z[2] * z[3]) <= 0) ?? zones[0];
      if (zw < len * 2 || zh < len * 2) continue;
      petals += petal(
        zx + len + rng.float(0, zw - len * 2),
        zy + len + rng.float(0, zh - len * 2),
        len,
        rng.pick(tints),
        rng.float(0.6, 0.95),
      );
    }
    s += petals;

    s += t.draw({
      x: W / 2,
      y: titleY,
      anchor: 'middle',
      fill: ink,
      subtitleFill: tintText(ink, c1, 0.35, [top, bottom]),
    });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: ink });
    return s;
  },
};

/* ------------------------------------------------------------------- crest */

/** Shield outlines, their top left at (x, y): w wide and 1.2 w tall. */
const SHIELDS = {
  /** Straight sides that curve to a point. @param {number} x @param {number} y @param {number} w */
  heater: (x, y, w) => `M${n(x)} ${n(y)}H${n(x + w)}${heaterSides(x, y, w)}`,
  /** A top that dips to a point in the middle. @param {number} x @param {number} y @param {number} w */
  notched: (x, y, w) =>
    `M${n(x)} ${n(y)}Q${n(x + w * 0.32)} ${n(y)} ${n(x + w / 2)} ${n(y + w * 0.09)}` +
    `Q${n(x + w * 0.68)} ${n(y)} ${n(x + w)} ${n(y)}${heaterSides(x, y, w)}`,
  /** Straight sides and a round foot. @param {number} x @param {number} y @param {number} w */
  round: (x, y, w) =>
    `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + w * 0.7)}A${n(w / 2)} ${n(w * 0.5)} 0 0 1 ${n(x)} ${n(y + w * 0.7)}Z`,
};

/** A heater shield's sides and point, from its top right corner. @param {number} x @param {number} y @param {number} w */
function heaterSides(x, y, w) {
  const h = w * 1.2;
  return (
    `V${n(y + h * 0.5)}C${n(x + w)} ${n(y + h * 0.8)} ${n(x + w * 0.72)} ${n(y + h * 0.92)} ${n(x + w / 2)} ${n(y + h)}` +
    `C${n(x + w * 0.28)} ${n(y + h * 0.92)} ${n(x)} ${n(y + h * 0.8)} ${n(x)} ${n(y + h * 0.5)}Z`
  );
}

/**
 * A charge for the shield, centred on (x, y), r its reach.
 * @param {string} kind @param {number} x @param {number} y @param {number} r @param {string} fill
 */
function charge(kind, x, y, r, fill) {
  /** @param {[number, number][]} pts */
  const poly = (pts) => `<polygon points="${pts.map(([px, py]) => `${n(px)},${n(py)}`).join(' ')}" fill="${fill}"/>`;
  if (kind === 'star') {
    // Four points, taller than wide.
    /** @type {[number, number][]} */
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.24 : i % 4 ? r * 0.72 : r;
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    return poly(pts);
  }
  if (kind === 'sun') {
    let rays = '';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const tip = i % 2 ? r * 0.8 : r;
      const at = (/** @type {number} */ ang, /** @type {number} */ rr) =>
        `${n(x + Math.cos(ang) * rr)},${n(y + Math.sin(ang) * rr)}`;
      rays += `<polygon points="${at(a - 0.13, r * 0.56)} ${at(a, tip)} ${at(a + 0.13, r * 0.56)}"/>`;
    }
    return `<g fill="${fill}">${rays}${circle(x, y, r * 0.46, fill)}</g>`;
  }
  if (kind === 'crown') {
    const w = r * 1.8;
    const h = r * 1.2;
    const x0 = x - w / 2;
    const y0 = y - h / 2;
    return (
      poly([
        [x0, y0 + h],
        [x0, y0 + h * 0.2],
        [x0 + w * 0.25, y0 + h * 0.55],
        [x0 + w * 0.5, y0],
        [x0 + w * 0.75, y0 + h * 0.55],
        [x0 + w, y0 + h * 0.2],
        [x0 + w, y0 + h],
      ]) +
      // A band, and pearls on the points.
      rect(x0 - w * 0.03, y0 + h * 0.8, w * 1.06, h * 0.2, fill) +
      circle(x0, y0 + h * 0.2, r * 0.09, fill) +
      circle(x0 + w / 2, y0, r * 0.09, fill) +
      circle(x0 + w, y0 + h * 0.2, r * 0.09, fill)
    );
  }
  // A tower: a keep with battlements, and a door the field shows through.
  const w = r * 1.1;
  const h = r * 1.7;
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  const merlon = w / 5;
  const door = w * 0.16;
  let d = `M${n(x0)} ${n(y0 + h)}V${n(y0)}`;
  for (let i = 0; i < 5; i++) d += `H${n(x0 + merlon * (i + 1))}V${n(y0 + (i % 2 ? 0 : merlon * 0.8))}`;
  d +=
    `V${n(y0 + h)}H${n(x + door)}V${n(y0 + h * 0.74)}` +
    `A${n(door)} ${n(door)} 0 0 0 ${n(x - door)} ${n(y0 + h * 0.74)}V${n(y0 + h)}Z`;
  return path(d, fill);
}

/**
 * What stands behind the shield, centred on the shield's middle (cx, cy), sw the shield's width,
 * and how far it reaches above and below the shield's top (in shield widths).
 */
const BEHIND = {
  laurels: { top: 0, bottom: 1.6 },
  swords: { top: -0.24, bottom: 1.5 },
  rays: { top: -0.24, bottom: 1.44 },
};

/** A wreath: two stems of paired leaves, crossing below. @param {number} cx @param {number} cy @param {number} sw @param {string} col @param {number} u */
function laurels(cx, cy, sw, col, u) {
  const R = sw * 0.82;
  let out = '';
  for (const dir of [-1, 1]) {
    let stem = '';
    for (let i = 0; i <= 11; i++) {
      // (It starts past the bottom, so the stems cross.)
      const ang = Math.PI / 2 + dir * (i * 0.215 - 0.18);
      const x = cx + Math.cos(ang) * R;
      const y = cy + Math.sin(ang) * R * 0.95;
      stem += `${i ? 'L' : 'M'}${n(x)} ${n(y)}`;
      const grows = ang + dir * (Math.PI / 2);
      const len = sw * 0.15 * (1 - i * 0.035);
      if (i) out += leaf(x, y, len, grows - dir * 0.55, col) + leaf(x, y, len * 0.85, grows + dir * 0.55, col);
    }
    out += `<path d="${stem}" fill="none" stroke="${col}" stroke-width="${n(1.6 * u)}" stroke-linecap="round"/>`;
  }
  return out;
}

/** Two swords crossed behind the shield, points up. @param {number} cx @param {number} cy @param {number} sw @param {string} col @param {string} dark */
function swords(cx, cy, sw, col, dark) {
  const L = sw * 2.2;
  const bw = sw * 0.075;
  const guard = L / 2 - sw * 0.3;
  const blade =
    `<polygon points="${n(-bw / 2)},${n(guard)} ${n(-bw / 2)},${n(-L / 2 + sw * 0.12)} 0,${n(-L / 2)} ${n(bw / 2)},${n(-L / 2 + sw * 0.12)} ${n(bw / 2)},${n(guard)}" fill="${col}"/>` +
    rect(-sw * 0.012, -L / 2 + sw * 0.14, sw * 0.024, guard + L / 2 - sw * 0.16, dark, 'opacity="0.5"') +
    rect(-sw * 0.16, guard, sw * 0.32, sw * 0.05, col) +
    rect(-sw * 0.028, guard + sw * 0.05, sw * 0.056, sw * 0.19, dark) +
    circle(0, L / 2 - sw * 0.04, sw * 0.05, col);
  return [-42, 42].map((deg) => `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${deg})">${blade}</g>`).join('');
}

/** A glory of rays behind the shield. @param {number} cx @param {number} cy @param {number} sw @param {string} col */
function glory(cx, cy, sw, col) {
  let out = '';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const tip = sw * (i % 2 ? 0.7 : 0.84);
    const at = (/** @type {number} */ ang, /** @type {number} */ rr) =>
      `${n(cx + Math.cos(ang) * rr)},${n(cy + Math.sin(ang) * rr)}`;
    out += `<polygon points="${at(a - 0.05, sw * 0.4)} ${at(a, tip)} ${at(a + 0.05, sw * 0.4)}"/>`;
  }
  return `<g fill="${col}" opacity="0.85">${out}</g>`;
}

export const crest = {
  id: 'crest',
  name: 'Crest',
  group: 'Genre',
  description: 'Fantasy: a heraldic shield before laurels, swords or rays, framed in gold.',
  variants: {
    field: {
      label: 'Field',
      values: { plain: 'Plain', pale: 'Halved', bend: 'Diagonal', quarterly: 'Quartered', chevron: 'Chevron' },
    },
    emblem: { label: 'Emblem', values: { star: 'Star', sun: 'Sun', crown: 'Crown', tower: 'Tower' } },
    behind: { label: 'Behind', values: { laurels: 'Laurels', swords: 'Swords', rays: 'Rays' } },
  },
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const field = c.choose('field', ['plain', 'pale', 'bend', 'quarterly', 'chevron']);
    const emblem = c.choose('emblem', ['star', 'sun', 'crown', 'tower']);
    const behind = c.choose('behind', ['laurels', 'laurels', 'swords', 'rays']);
    const outline = rng.pick(/** @type {const} */ (['heater', 'heater', 'notched', 'round']));

    // Gold, leaning to the palette's most golden accent, that stands out on the background.
    let gold = mix('#c9a24a', most(p.accents, yellowness), 0.3);
    for (let i = 0; i < 8 && contrast(gold, p.bg) < 2.4; i++) gold = mix(gold, p.dark ? '#ffffff' : '#2e2208', 0.15);
    // Tinctures: a metal and a colour at least 3.2:1 apart, so a charge reads on either.
    const metal = p.dark ? mix(p.paper, gold, 0.15) : mix(p.paper, '#ffffff', 0.55);
    const apart = (/** @type {string} */ col) => contrast(col, metal);
    const vivid = p.accents.filter((col) => apart(col) >= 2.5);
    let colour = vivid.length ? most(vivid, chroma) : most(p.accents, apart);
    for (let i = 0; i < 10 && apart(colour) < 3.2; i++) colour = mix(colour, '#000000', 0.1);
    const ground = [mix(p.bg, gold, 0.14), mix(p.bg, '#000000', p.dark ? 0.3 : 0.06)];
    const ink = textColor(p, ground, [gold, p.ink]);

    const frame = m * 0.45;
    const t = titleBlock(c, {
      font: FONTS.garamond,
      weight: 500,
      upper: true,
      letterSpacing: 0.1,
      maxWidth: W - m * 2.6,
      maxHeight: H * 0.3,
      maxSize: S * 0.13,
      lineHeight: 1.08,
    });
    const a = authorFit(c, { font: FONTS.garamond, weight: 600, letterSpacing: 0.22, maxSize: S * 0.04 });
    const titleY = m * 1.5;
    const aY = H - m * 1.5 - a.height;
    const artTop = titleY + t.height + m * 0.7;
    const room = Math.max(S * 0.1, aY - m * 0.7 - artTop);
    // The shield and what stands behind it fit the room.
    const reach = BEHIND[behind];
    const sw = Math.min(W * 0.4, room / (reach.bottom - reach.top), S * 0.46);
    const sh = sw * 1.2;
    const sx = W / 2 - sw / 2;
    const sy = artTop + (room - sw * (reach.bottom - reach.top)) / 2 - reach.top * sw;
    const cx = W / 2;
    const shield = SHIELDS[outline](sx, sy, sw);

    const ids = { clip: c.id('shield'), half: c.id('half'), glow: c.id('glow'), foil: c.id('foil'), sh: c.id('sh') };
    // The metal's share of the field: it also clips the charge drawn in the colour.
    const split = {
      plain: '',
      pale: `M${n(cx)} ${n(sy)}h${n(sw / 2)}v${n(sh)}h${n(-sw / 2)}Z`,
      bend: `M${n(sx)} ${n(sy)}h${n(sw)}L${n(sx)} ${n(sy + sh)}Z`,
      quarterly: `M${n(cx)} ${n(sy)}h${n(sw / 2)}v${n(sh / 2)}h${n(-sw)}v${n(sh / 2)}h${n(sw / 2)}Z`,
      chevron:
        `M${n(sx)} ${n(sy + sh * 0.78)}L${n(cx)} ${n(sy + sh * 0.3)}L${n(sx + sw)} ${n(sy + sh * 0.78)}` +
        `V${n(sy + sh * 0.98)}L${n(cx)} ${n(sy + sh * 0.5)}L${n(sx)} ${n(sy + sh * 0.98)}Z`,
    }[field];
    let s =
      `<defs>${radialGradient(
        ids.glow,
        [
          [0, ground[0]],
          [1, ground[1]],
        ],
        { r: 0.75 },
      )}` +
      linearGradient(ids.foil, [
        [0, tintText(ink, '#ffffff', 0.3, ground)],
        [0.55, ink],
        [1, tintText(ink, p.night, 0.3, ground)],
      ]) +
      shadowFilter(ids.sh, u, { blur: 5, dy: 3, opacity: 0.3 }) +
      `<clipPath id="${ids.clip}"><path d="${shield}"/></clipPath>` +
      (split ? `<clipPath id="${ids.half}"><path d="${split}"/></clipPath>` : '') +
      '</defs>';
    s += rect(0, 0, W, H, `url(#${ids.glow})`);
    s += rect(frame, frame, W - frame * 2, H - frame * 2, 'none', `stroke="${gold}" stroke-width="${n(2.4 * u)}"`);
    // The inner frame, its corners cut in.
    const fi = frame * 1.6;
    const cr = m * 0.5;
    s += path(
      `M${n(fi + cr)} ${n(fi)}H${n(W - fi - cr)}A${n(cr)} ${n(cr)} 0 0 0 ${n(W - fi)} ${n(fi + cr)}` +
        `V${n(H - fi - cr)}A${n(cr)} ${n(cr)} 0 0 0 ${n(W - fi - cr)} ${n(H - fi)}` +
        `H${n(fi + cr)}A${n(cr)} ${n(cr)} 0 0 0 ${n(fi)} ${n(H - fi - cr)}` +
        `V${n(fi + cr)}A${n(cr)} ${n(cr)} 0 0 0 ${n(fi + cr)} ${n(fi)}Z`,
      'none',
      `stroke="${gold}" stroke-width="${n(0.9 * u)}"`,
    );

    const mid = sy + sh / 2;
    if (behind === 'laurels') s += laurels(cx, sy + sh * 0.55, sw, gold, u);
    else if (behind === 'swords') s += swords(cx, mid, sw, gold, mix(gold, p.night, 0.45));
    else s += glory(cx, mid, sw, gold);

    // The shield: its shadow, the field, and the charge, counterchanged where the field divides.
    const ey = sy + sh * (field === 'chevron' ? 0.17 : 0.42);
    const er = sw * (field === 'chevron' ? 0.15 : 0.3);
    s += path(shield, colour, `filter="url(#${ids.sh})"`);
    s +=
      `<g clip-path="url(#${ids.clip})">${rect(sx, sy, sw, sh, colour)}${split ? path(split, metal) : ''}` +
      charge(emblem, cx, ey, er, metal) +
      (split ? `<g clip-path="url(#${ids.half})">${charge(emblem, cx, ey, er, colour)}</g>` : '') +
      '</g>';
    s += path(shield, 'none', `stroke="${gold}" stroke-width="${n(3 * u)}"`);

    s += t.draw({ x: W / 2, y: titleY, anchor: 'middle', fill: `url(#${ids.foil})`, leadFill: ink, subtitleFill: ink });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: ink });
    return s;
  },
};

/* --------------------------------------------------------------- storybook */

export const storybook = {
  id: 'storybook',
  name: 'Storybook',
  group: 'Genre',
  description:
    "Children's: rolling hills with trees and a house, a sun or a rainbow, clouds, and a bold outlined title.",
  variants: { sky: { label: 'Sky', values: { sun: 'Sun', rainbow: 'Rainbow' } } },
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const skyKind = c.choose('sky', ['sun', 'sun', 'rainbow']);
    // Each accent has a job: the yellowest is the sun, the coolest the land, another the title.
    const acc = [...new Set(p.accents)];
    const sunBase = most(acc, yellowness);
    const rest = acc.filter((col) => col !== sunBase);
    const landBase = most(rest.length ? rest : acc, coolness);
    const pop = acc.find((col) => col !== sunBase && col !== landBase) ?? landBase;
    const sun = yellowness(sunBase) > 15 ? mix(sunBase, '#ffd23f', 0.55) : '#ffd23f';
    // A sky in the land's hue, and land that steps darker toward you, each step distinct.
    const skyC = [mix(p.paper, landBase, 0.26), mix(p.paper, landBase, 0.08)];
    const land = [mix(landBase, p.paper, 0.4)];
    for (let i = 0; i < 12 && contrast(land[0], skyC[1]) < 1.3; i++) land[0] = mix(land[0], p.night, 0.1);
    for (let k = 1; k < 3; k++) {
      land[k] = mix(land[k - 1], p.night, 0.14);
      for (let i = 0; i < 12 && contrast(land[k], land[k - 1]) < 1.25; i++) land[k] = mix(land[k], p.night, 0.08);
    }
    const fill = textColor(p, [...skyC, '#ffffff'], [pop, mix(pop, p.night, 0.35), mix(pop, p.night, 0.6), p.night]);

    const a = authorFit(c, { font: FONTS.geometric, weight: 700, letterSpacing: 0.12, maxSize: S * 0.042 });
    const t = titleBlock(c, {
      font: FONTS.geometric,
      weight: 800,
      maxWidth: W - m * 2.4,
      maxHeight: H * 0.34,
      maxSize: S * 0.16,
      lineHeight: 1.02,
      subtitleFont: FONTS.geometric,
      subtitleItalic: false,
    });
    const aY = m * 1.1;
    const titleY = aY + (a.lines.length ? a.height + m * 0.6 : 0);
    // The sky between the title and the hills is never less than 0.12 S.
    const bandTop = titleY + t.height + m * 0.4;
    const hillTop = Math.max(titleY + t.height + m + S * 0.12, H * 0.62);
    const band = Math.max(0, hillTop - bandTop);
    const groundH = H - hillTop;
    // Three hills, back to front: the far one is the horizon, edge to edge.
    const hills = [
      { cx: W * rng.float(0.3, 0.7), top: hillTop, rx: W * rng.float(1.0, 1.3), ry: Math.min(groundH * 0.5, S * 0.16) },
      { cx: W * rng.float(0.1, 0.9), top: hillTop + groundH * 0.22, rx: W * rng.float(0.6, 0.9), ry: groundH * 0.9 },
      { cx: W * rng.float(0.1, 0.9), top: hillTop + groundH * 0.48, rx: W * rng.float(0.7, 1.0), ry: groundH * 0.9 },
    ];
    /** Where a hill's top is at x (H off its ends). @param {(typeof hills)[number]} hl @param {number} x */
    const topOf = (hl, x) =>
      Math.abs(x - hl.cx) < hl.rx ? hl.top + hl.ry - hl.ry * Math.sqrt(1 - ((x - hl.cx) / hl.rx) ** 2) : H;
    const landAt = (/** @type {number} */ x) => Math.min(H, ...hills.map((hl) => topOf(hl, x)));

    const ids = { sky: c.id('sky') };
    let s = `<defs>${linearGradient(ids.sky, [
      [0, skyC[0]],
      [1, skyC[1]],
    ])}</defs>`;
    s += rect(0, 0, W, H, `url(#${ids.sky})`);
    /** The sun, for the clouds to keep clear of. */
    let sunAt = { x: -W, y: 0, r: 0 };
    if (skyKind === 'sun') {
      // As much of the sun as the sky has room for: when there's little, it sinks behind the hills.
      const r = Math.min(S * rng.float(0.11, 0.15), W * 0.3);
      const sx = W * rng.float(0.2, 0.8);
      const sy = Math.max(landAt(sx) - r * 0.35, bandTop + r * 1.15);
      const ray = Math.min(r * 0.38, Math.max(0, sy - r * 1.22 - bandTop));
      let rays = '';
      for (let i = 0; i < 12 && ray > r * 0.08; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const [cos, sin] = [Math.cos(ang), Math.sin(ang)];
        rays += `<line x1="${n(sx + cos * r * 1.22)}" y1="${n(sy + sin * r * 1.22)}" x2="${n(sx + cos * (r * 1.22 + ray))}" y2="${n(sy + sin * (r * 1.22 + ray))}"/>`;
      }
      s += `<g stroke="${sun}" stroke-width="${n(Math.min(5 * u, r * 0.1))}" stroke-linecap="round">${rays}</g>`;
      // (A white rim keeps the sun off a yellow sky.)
      s += circle(sx, sy, r * 1.07, '#ffffff', 'opacity="0.7"') + circle(sx, sy, r, sun);
      sunAt = { x: sx, y: sy, r };
    } else {
      // A rainbow: bands a share of its radius, its top under the title, its feet in the hills.
      const R = Math.min(W * 0.4, Math.max(band, S * 0.26));
      const rx = W * rng.float(0.42, 0.58);
      const ry = Math.max(bandTop + S * 0.02 + R, landAt(rx - R) + S * 0.01, landAt(rx + R) + S * 0.01);
      const bw = R * 0.13;
      [pop, sun, landBase, mix(p.paper, pop, 0.45)].forEach((col, i) => {
        const rr = R - bw * (i + 0.5);
        s += `<path d="M${n(rx - rr)} ${n(ry)}A${n(rr)} ${n(rr)} 0 0 1 ${n(rx + rr)} ${n(ry)}" fill="none" stroke="${col}" stroke-width="${n(bw + 0.5)}"/>`;
      });
    }
    // Clouds, one to a quarter of the sky (not the sun's).
    const sunSlot = Math.floor((sunAt.x / W) * 4);
    const slots = rng.shuffle([0, 1, 2, 3].filter((i) => i !== sunSlot)).slice(0, rng.int(2, 3));
    for (const slot of slots) {
      const rc = Math.min(S * rng.float(0.035, 0.05), band / 3.2);
      const cx = (W * (slot + rng.float(0.3, 0.7))) / 4;
      const cy = bandTop + rc * 1.3 + rng.float(0, Math.max(0, band - rc * 3.2));
      if (rc < S * 0.012 || Math.hypot(cx - sunAt.x, cy - sunAt.y) < sunAt.r * 1.25 + rc * 2) continue;
      let puff = '';
      for (const [dx, dy, f] of [
        [-1.1, 0.2, 0.8],
        [0, -0.2, 1.1],
        [1.1, 0.2, 0.85],
        [0.4, 0.35, 0.9],
        [-0.5, 0.35, 0.85],
      ]) {
        puff += circle(cx + dx * rc, cy + dy * rc, rc * f, '#ffffff');
      }
      s += `<g opacity="0.95">${puff}</g>`;
    }

    // The hills, each with lollipop trees, and a house on the middle one where it stands clear.
    hills.forEach((hl, i) => {
      // (The ground under its curve, down to the foot of the cover.)
      s += path(
        `M${n(hl.cx - hl.rx)} ${n(H)}V${n(hl.top + hl.ry)}A${n(hl.rx)} ${n(hl.ry)} 0 0 1 ${n(hl.cx + hl.rx)} ${n(hl.top + hl.ry)}V${n(H)}Z`,
        land[i],
      );
      if (i === 1) {
        const near = hills[2];
        const hx = [0.2, 0.35, 0.5, 0.65, 0.8]
          .map((f) => W * f)
          .reduce((best, x) => (topOf(near, x) - topOf(hl, x) > topOf(near, best) - topOf(hl, best) ? x : best));
        const hw = S * 0.1;
        const hy = topOf(hl, hx) + hw * 0.1;
        if (topOf(near, hx) - hy > hw * 0.2) {
          s +=
            rect(hx - hw / 2, hy - hw * 0.62, hw, hw * 0.62, '#ffffff') +
            path(
              `M${n(hx - hw * 0.62)} ${n(hy - hw * 0.6)}L${n(hx)} ${n(hy - hw * 1.12)}L${n(hx + hw * 0.62)} ${n(hy - hw * 0.6)}Z`,
              pop,
            ) +
            rect(hx - hw * 0.11, hy - hw * 0.34, hw * 0.22, hw * 0.34, mix(pop, p.night, 0.3));
        }
      }
      const k = 0.75 + i * 0.25;
      for (let j = rng.int(1, 3); j > 0; j--) {
        const tx = clamp(hl.cx + rng.float(-0.6, 0.6) * hl.rx, W * 0.05, W * 0.95);
        const ty = topOf(hl, tx) + S * 0.004;
        const th = S * 0.07 * k * rng.float(0.85, 1.2);
        s +=
          rect(tx - th * 0.09, ty - th, th * 0.18, th, mix(land[i], p.night, 0.45)) +
          circle(tx, ty - th, th * 0.55, rng.bool() ? pop : mix(land[i], p.night, 0.3));
      }
    });

    // The title in thick letters with a white outline in proportion to each line (0.15 em), tilted
    // a little.
    const tilt = rng.pick([-3, -2, 2, 3]);
    s += `<g transform="rotate(${tilt} ${n(W / 2)} ${n(titleY + t.height / 2)})">${t.draw({
      x: W / 2,
      y: titleY,
      anchor: 'middle',
      fill,
      attrs: 'stroke="#ffffff" style="stroke-width:0.15em" stroke-linejoin="round" paint-order="stroke"',
    })}</g>`;
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: textColor(p, skyC[0], [p.night]) });
    return s;
  },
};

/* -------------------------------------------------------------------- idea */

/**
 * Accents that show on `bg` (2.2:1 or more), the most vivid first. Never empty.
 * @param {import('../index.js').ResolvedPalette} p @param {string} bg
 */
function popAccents(p, bg) {
  const pop = (/** @type {string} */ col) => chroma(col) * Math.min(contrast(col, bg), 4.5);
  const list = [...new Set(p.accents)].filter((col) => contrast(col, bg) >= 2.2).sort((x, y) => pop(y) - pop(x));
  return list.length ? list : strongAccents(p, bg, 2.2);
}

export const idea = {
  id: 'idea',
  name: 'Big Idea',
  group: 'Genre',
  description: 'Non-fiction: a big plain title, a prominent subtitle, and one clear mark: bars, a trend line or a pie.',
  variants: { mark: { label: 'Mark', values: { bars: 'Bars', arrow: 'Trend line', circle: 'Pie' } } },
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const mark = c.choose('mark', ['bars', 'arrow', 'circle']);
    const wide = W / H > 1.4;
    const pad = m * 1.2;
    // The most vivid accent; now and then the whole cover is in an accent.
    const field = rng.bool(0.35) ? popAccents(p, p.bg)[0] : p.bg;
    const accent = popAccents(p, field)[0];
    const ink = textColor(p, field, field === p.bg ? [p.ink] : [p.paper, p.night]);
    const pale = mix(accent, field, 0.55);

    // (The author keeps to the left: the mark stands at the right of it.)
    const a = authorFit(c, {
      font: FONTS.sans,
      weight: 700,
      letterSpacing: 0.04,
      upper: false,
      maxSize: S * 0.05,
      maxWidth: W * 0.52 - pad,
    });
    const t = titleBlock(c, {
      font: FONTS.sans,
      weight: 800,
      letterSpacing: -0.025,
      // "The" is part of a non-fiction title.
      lead: false,
      maxWidth: wide ? W * 0.62 - pad : W - pad * 2,
      maxHeight: wide ? H - pad * 2 - m * 1.9 - a.height : H * 0.5,
      maxSize: S * (wide ? 0.25 : 0.2),
      lineHeight: 0.98,
      subtitleFont: FONTS.sans,
      subtitleItalic: false,
      subtitleSize: S * 0.054,
    });
    const aY = H - pad - a.height;
    let s = rect(0, 0, W, H, field);
    // A rule over the title, in the accent.
    s += rect(pad, pad, Math.min(W * 0.18, S * 0.18), Math.max(3, 6 * u), accent);
    const titleY = pad + m * 0.7;

    // The mark stands on the author's baseline, at the right (on a wide cover, beside the title).
    const base = H - pad;
    const left = wide ? W * 0.62 + m : Math.max(pad + a.width + m, W * 0.5);
    const top = wide ? pad : titleY + t.height + m * 0.8;
    const size = Math.max(0, Math.min(base - top, W - pad - left, S * 0.56));
    if (size > S * 0.04) {
      const x1 = W - pad;
      const x0 = x1 - size;
      const y0 = base - size;
      if (mark === 'bars') {
        // Bars, one of them the peak.
        const count = rng.int(3, 5);
        const peak = rng.int(Math.max(1, count - 2), count - 1);
        const gap = size * 0.06;
        const bw = (size - gap * (count - 1)) / count;
        for (let i = 0; i < count; i++) {
          const h = i === peak ? size : size * (0.25 + (0.55 * i) / (count - 1)) * rng.float(0.8, 1.1);
          s += rect(x0 + i * (bw + gap), base - h, bw, h, i === peak ? accent : pale);
        }
      } else if (mark === 'arrow') {
        // A trend line with a dip, rising to an arrowhead.
        const w = size * 0.11;
        const pts = [
          [0, 0.92],
          [0.34, rng.float(0.5, 0.64)],
          [0.56, rng.float(0.66, 0.8)],
          [0.86, 0.2],
        ].map(([px, py]) => `${n(x0 + w / 2 + px * (size - w))} ${n(y0 + w / 2 + py * (size - w))}`);
        s += `<path d="M${pts.join('L')}" fill="none" stroke="${accent}" stroke-width="${n(w)}" stroke-linejoin="round" stroke-linecap="round"/>`;
        s += path(`M${n(x1)} ${n(y0)}V${n(y0 + size * 0.34)}L${n(x1 - size * 0.34)} ${n(y0)}Z`, accent);
      } else {
        // A pie with one slice pulled out.
        const r = size / 2;
        const a0 = rng.float(-1.9, -1.3);
        const a1 = a0 + rng.float(0.9, 1.7);
        /** @param {number} ox @param {number} oy @param {number} ang */
        const at = (ox, oy, ang) => `${n(ox + Math.cos(ang) * r * 0.92)} ${n(oy + Math.sin(ang) * r * 0.92)}`;
        const [cx, cy] = [x0 + r, y0 + r];
        s += path(
          `M${n(cx)} ${n(cy)}L${at(cx, cy, a1)}A${n(r * 0.92)} ${n(r * 0.92)} 0 1 1 ${at(cx, cy, a0)}Z`,
          accent,
        );
        const mid = (a0 + a1) / 2;
        const [sx, sy] = [cx + Math.cos(mid) * r * 0.08, cy + Math.sin(mid) * r * 0.08];
        s += path(`M${n(sx)} ${n(sy)}L${at(sx, sy, a0)}A${n(r * 0.92)} ${n(r * 0.92)} 0 0 1 ${at(sx, sy, a1)}Z`, pale);
      }
    }
    s += t.draw({ x: pad, y: titleY, fill: ink, subtitleFill: tintText(ink, accent, 0.25, field) });
    s += drawText(a, { x: pad, y: aY, fill: ink });
    return s;
  },
};
