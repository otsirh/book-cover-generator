// Styles made for genres the others don't speak to: horror, romance, fantasy, children's books
// and non-fiction.

import { n, rect, circle, path, mix, grain, blurFilter, linearGradient, radialGradient, ridge } from '../core.js';
import { FONTS, drawText } from '../text.js';
import { titleBlock, authorFit } from '../type.js';
import { strongAccents, textColor } from './util.js';

/** @typedef {import('../index.js').StyleContext} Ctx */

/* ------------------------------------------------------------------ hollow */

export const hollow = {
  id: 'hollow',
  name: 'Hollow',
  group: 'Genre',
  description: 'Horror: a dead tree against a pale moon, fog, and eroded lettering.',
  variants: { sky: { label: 'Moon', values: { full: 'Full', blood: 'Blood moon' } } },
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const sky = c.choose('sky', ['full', 'full', 'blood']);
    const night = mix(p.night, '#000000', 0.35);
    const glowC =
      sky === 'blood' ? mix(strongAccents(p, night, 1.2)[0], '#b3261e', 0.55) : mix(p.paper, p.accents[1], 0.12);
    const ground = mix(night, '#000000', 0.55);
    const ink = textColor(p, ground, [p.paper]);

    const a = authorFit(c, { font: FONTS.sans, weight: 600, letterSpacing: 0.32, maxSize: S * 0.036 });
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
    });
    const titleY = H - m * 1.1 - t.height;
    const groundY = Math.max(H * 0.55, titleY - m * 0.9);
    const skyTop = m + a.height + m * 0.6;

    const ids = { sky: c.id('sky'), glow: c.id('glow'), fog: c.id('fog'), rough: c.id('rough') };
    let s = `<defs>${linearGradient(ids.sky, [
      [0, mix(night, '#000000', 0.4)],
      [1, mix(night, glowC, 0.22)],
    ])}${blurFilter(ids.glow, S * 0.06)}${blurFilter(ids.fog, S * 0.03)}`;
    // Worn letters: the edges displaced by a little noise.
    s +=
      `<filter id="${ids.rough}" x="-5%" y="-10%" width="110%" height="120%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${+(0.06 / u).toFixed(3)}" numOctaves="2" seed="${rng.int(1, 99)}" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="${n(3.2 * u)}" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
    s += rect(0, 0, W, H, `url(#${ids.sky})`);

    // The moon, its glow, and (for a blood moon) a darker limb.
    const r = Math.min(S * rng.float(0.12, 0.16), (groundY - skyTop) * 0.32);
    const mx = W * rng.float(0.3, 0.7);
    const my = skyTop + (groundY - skyTop) * rng.float(0.28, 0.4);
    s += circle(mx, my, r * 1.9, glowC, `opacity="0.35" filter="url(#${ids.glow})"`);
    s += circle(mx, my, r, glowC);
    s += circle(mx + r * 0.25, my - r * 0.1, r * 0.95, mix(glowC, night, 0.12), 'opacity="0.35"');

    // The tree: a trunk that forks, and forks again, thinning as it goes.
    const baseX = mx + (rng.bool() ? -1 : 1) * Math.min(W * 0.18, r * 1.4);
    const trunk = Math.min((groundY - skyTop) * 0.36, S * 0.26);
    let branches = '';
    /** @param {number} x @param {number} y @param {number} ang @param {number} len @param {number} w @param {number} depth */
    const grow = (x, y, ang, len, w, depth) => {
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      const bend = rng.float(-0.35, 0.35) * len;
      const qx = (x + x2) / 2 + Math.cos(ang + Math.PI / 2) * bend;
      const qy = (y + y2) / 2 + Math.sin(ang + Math.PI / 2) * bend;
      branches += `<path d="M${n(x)} ${n(y)}Q${n(qx)} ${n(qy)} ${n(x2)} ${n(y2)}" stroke-width="${n(w)}"/>`;
      if (depth === 0 || y2 < skyTop * 0.8) return;
      const forks = depth > 5 ? 2 : rng.int(2, 3);
      for (let k = 0; k < forks; k++) {
        const spread = (k - (forks - 1) / 2) * rng.float(0.45, 0.75);
        grow(x2, y2, ang + spread + rng.float(-0.2, 0.2), len * rng.float(0.62, 0.78), w * 0.66, depth - 1);
      }
    };
    grow(baseX, groundY + S * 0.02, -Math.PI / 2 + rng.float(-0.12, 0.12), trunk * 0.55, S * 0.03, 7);
    s += `<g fill="none" stroke="${ground}" stroke-linecap="round">${branches}</g>`;

    // Fog drifting over the hill, then the hill.
    for (let k = 0; k < 3; k++) {
      const fy = groundY - S * (0.02 + k * 0.035);
      s += `<ellipse cx="${n(W * rng.float(0.2, 0.8))}" cy="${n(fy)}" rx="${n(W * rng.float(0.5, 0.8))}" ry="${n(S * 0.03)}" fill="${p.paper}" opacity="${(0.1 + k * 0.04).toFixed(2)}" filter="url(#${ids.fog})"/>`;
    }
    const hill = ridge(rng, 24, 0.5);
    let d = `M0 ${n(H)}`;
    hill.forEach((v, i) => {
      d += `L${n((i / (hill.length - 1)) * W)} ${n(groundY + v * S * 0.025)}`;
    });
    s += path(`${d}L${n(W)} ${n(H)}Z`, ground);

    const g = grain(c, { opacity: 0.18, light: true, id: 'grain' });
    s += `<defs>${g.defs}</defs>${g.layer}`;
    s += drawAuthor(a, W / 2, m, mix(p.paper, glowC, 0.2));
    s += `<g filter="url(#${ids.rough})">${t.draw({ x: W / 2, y: titleY, anchor: 'middle', fill: ink })}</g>`;
    return s;
  },
};

/* ------------------------------------------------------------------ ribbon */

export const ribbon = {
  id: 'ribbon',
  name: 'Ribbon',
  group: 'Genre',
  description: 'Romance: ribbons crossing under an italic title, and falling petals.',
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const [c1, c2] = strongAccents(p, p.paper, 1.3).concat(p.accents);
    const top = mix(p.paper, c1, 0.06);
    const bottom = mix(p.paper, c1, 0.2);
    const ink = textColor(p, [top, bottom], [p.ink, mix(p.ink, c1, 0.4)]);
    const a = authorFit(c, { font: FONTS.serif, weight: 400, letterSpacing: 0.24, maxSize: S * 0.04 });
    const t = titleBlock(c, {
      font: FONTS.didone,
      italic: true,
      maxWidth: W - m * 2.4,
      maxHeight: H * 0.36,
      maxSize: S * 0.15,
      lineHeight: 1.04,
      subtitleUpper: true,
    });
    const titleY = Math.max(m * 1.6, H * 0.34 - t.height / 2);
    const aY = H - m * 1.2 - a.height;
    const ids = { bg: c.id('bg'), soft: c.id('soft') };
    let s = `<defs>${linearGradient(ids.bg, [
      [0, top],
      [1, bottom],
    ])}${blurFilter(ids.soft, S * 0.004)}</defs>`;
    s += rect(0, 0, W, H, `url(#${ids.bg})`);

    // Two ribbons sweeping across the room between the title and the author.
    const bandTop = titleY + t.height + m * 0.6;
    const bandBottom = aY - m * 0.6;
    const span = Math.max(S * 0.08, bandBottom - bandTop);
    [c1, c2].forEach((col, k) => {
      const w = S * rng.float(0.05, 0.08);
      const y0 = bandTop + span * (k ? rng.float(0.55, 0.85) : rng.float(0.1, 0.35));
      const y1 = bandTop + span * (k ? rng.float(0.05, 0.3) : rng.float(0.6, 0.9));
      const q1 = bandTop + span * rng.float(-0.2, 1.2);
      const q2 = bandTop + span * rng.float(-0.2, 1.2);
      const edge = (/** @type {number} */ dy) =>
        `M${n(-W * 0.1)} ${n(y0 + dy)}C${n(W * 0.3)} ${n(q1 + dy)} ${n(W * 0.7)} ${n(q2 + dy)} ${n(W * 1.1)} ${n(y1 + dy)}`;
      // The band: one edge across, the other back.
      const lower = `L${n(W * 1.1)} ${n(y1 + w)}C${n(W * 0.7)} ${n(q2 + w)} ${n(W * 0.3)} ${n(q1 + w)} ${n(-W * 0.1)} ${n(y0 + w)}Z`;
      s += `<path d="${edge(0)}${lower}" fill="${col}" opacity="0.88"/>`;
      s += `<path d="${edge(w * 0.22)}" fill="none" stroke="${mix(col, p.paper, 0.55)}" stroke-width="${n(1.4 * u)}" opacity="0.7"/>`;
    });

    // Petals drifting down, more of them high up.
    let petals = '';
    const count = rng.int(14, 22);
    for (let i = 0; i < count; i++) {
      const x = rng.float(0, W);
      const y = rng.float(0, 1) ** 1.6 * H;
      const len = S * rng.float(0.014, 0.024);
      const col = rng.pick([c1, c2, mix(c1, p.paper, 0.4)]);
      petals += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(len * 0.55)}" ry="${n(len)}" fill="${col}" opacity="${rng.float(0.45, 0.85).toFixed(2)}" transform="rotate(${rng.int(0, 179)} ${n(x)} ${n(y)})"/>`;
    }
    s += `<g filter="url(#${ids.soft})">${petals}</g>`;

    s += t.draw({ x: W / 2, y: titleY, anchor: 'middle', fill: ink, subtitleFill: mix(ink, c1, 0.35) });
    s += drawAuthor(a, W / 2, aY, ink);
    return s;
  },
};

/* ------------------------------------------------------------------- crest */

/** A shield, its top at (x, y): w wide and 1.2 w tall. @param {number} x @param {number} y @param {number} w */
function shieldPath(x, y, w) {
  const h = w * 1.2;
  return (
    `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h * 0.5)}` +
    `C${n(x + w)} ${n(y + h * 0.8)} ${n(x + w * 0.72)} ${n(y + h * 0.92)} ${n(x + w / 2)} ${n(y + h)}` +
    `C${n(x + w * 0.28)} ${n(y + h * 0.92)} ${n(x)} ${n(y + h * 0.8)} ${n(x)} ${n(y + h * 0.5)}Z`
  );
}

/**
 * A charge for the shield, centred on (x, y) and r across.
 * @param {string} kind @param {number} x @param {number} y @param {number} r @param {string} fill
 */
function charge(kind, x, y, r, fill) {
  if (kind === 'star') {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push(`${n(x + Math.cos(a) * rr)},${n(y + Math.sin(a) * rr)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
  }
  if (kind === 'sun') {
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays += `<polygon points="${n(x + Math.cos(a - 0.12) * r * 0.55)},${n(y + Math.sin(a - 0.12) * r * 0.55)} ${n(x + Math.cos(a) * r)},${n(y + Math.sin(a) * r)} ${n(x + Math.cos(a + 0.12) * r * 0.55)},${n(y + Math.sin(a + 0.12) * r * 0.55)}"/>`;
    }
    return `<g fill="${fill}">${rays}${circle(x, y, r * 0.48, fill)}</g>`;
  }
  if (kind === 'crown') {
    const w = r * 1.8;
    const h = r * 1.2;
    const x0 = x - w / 2;
    const y0 = y - h / 2;
    const pts = [
      [x0, y0 + h],
      [x0, y0 + h * 0.2],
      [x0 + w * 0.25, y0 + h * 0.55],
      [x0 + w * 0.5, y0],
      [x0 + w * 0.75, y0 + h * 0.55],
      [x0 + w, y0 + h * 0.2],
      [x0 + w, y0 + h],
    ];
    return `<polygon points="${pts.map(([px, py]) => `${n(px)},${n(py)}`).join(' ')}" fill="${fill}"/>`;
  }
  // A tower: a keep with battlements and a door.
  const w = r * 1.1;
  const h = r * 1.7;
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  const merlon = w / 5;
  let d = `M${n(x0)} ${n(y0 + h)}V${n(y0)}`;
  for (let i = 0; i < 5; i++) d += `H${n(x0 + merlon * (i + 1))}V${n(y0 + (i % 2 ? 0 : merlon * 0.8))}`;
  d += `V${n(y0 + h)}Z`;
  return (
    path(d, fill) +
    path(
      `M${n(x - w * 0.16)} ${n(y0 + h)}V${n(y0 + h * 0.72)}A${n(w * 0.16)} ${n(w * 0.16)} 0 0 1 ${n(x + w * 0.16)} ${n(y0 + h * 0.72)}V${n(y0 + h)}Z`,
      '#000000',
      'opacity="0.35"',
    )
  );
}

export const crest = {
  id: 'crest',
  name: 'Crest',
  group: 'Genre',
  description: 'Fantasy: a heraldic shield in laurels, framed in gold.',
  variants: {
    field: {
      label: 'Field',
      values: { plain: 'Plain', pale: 'Halved', bend: 'Diagonal', quarterly: 'Quartered', chevron: 'Chevron' },
    },
    emblem: { label: 'Emblem', values: { star: 'Star', sun: 'Sun', crown: 'Crown', tower: 'Tower' } },
  },
  prefer: 'dark',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, p } = c;
    const gold = strongAccents(p, p.bg, 1.8)[0];
    const [t1, t2] = [mix(p.accents.find((x) => x !== gold) ?? p.ink, p.night, 0.25), mix(p.paper, gold, 0.15)];
    const field = c.choose('field', ['plain', 'pale', 'bend', 'quarterly', 'chevron']);
    const emblem = c.choose('emblem', ['star', 'sun', 'crown', 'tower']);
    const ink = textColor(p, p.bg, [gold, p.ink]);

    const frame = m * 0.45;
    const t = titleBlock(c, {
      font: FONTS.garamond,
      weight: 600,
      upper: true,
      letterSpacing: 0.08,
      maxWidth: W - m * 2.6,
      maxHeight: H * 0.3,
      maxSize: S * 0.12,
      lineHeight: 1.08,
    });
    const a = authorFit(c, { font: FONTS.garamond, weight: 600, letterSpacing: 0.22, maxSize: S * 0.04 });
    const titleY = m * 1.5;
    const aY = H - m * 1.5 - a.height;
    const artTop = titleY + t.height + m * 0.7;
    const artBottom = aY - m * 0.7;
    const room = Math.max(S * 0.1, artBottom - artTop);
    // The shield and the laurels below it (they reach about 1.46 shield widths down) fit the room.
    const leaf = S * 0.03;
    const sw = Math.min(W * 0.4, (room - leaf) / 1.46, S * 0.42);
    const sh = sw * 1.2;
    const sx = W / 2 - sw / 2;
    const sy = artTop + (room - sw * 1.46 - leaf) / 2;

    const ids = { clip: c.id('shield'), glow: c.id('glow') };
    let s = `<defs>${radialGradient(ids.glow, [
      [0, mix(p.bg, gold, 0.12)],
      [1, p.bg],
    ])}<clipPath id="${ids.clip}"><path d="${shieldPath(sx, sy, sw)}"/></clipPath></defs>`;
    s += rect(0, 0, W, H, `url(#${ids.glow})`);
    s += rect(frame, frame, W - frame * 2, H - frame * 2, 'none', `stroke="${gold}" stroke-width="${n(2.4 * u)}"`);
    s += rect(
      frame * 1.6,
      frame * 1.6,
      W - frame * 3.2,
      H - frame * 3.2,
      'none',
      `stroke="${gold}" stroke-width="${n(0.9 * u)}"`,
    );

    // Laurels: leaves along two arcs below and around the shield.
    const cx = W / 2;
    const cy = sy + sh * 0.55;
    const R = sw * 0.82;
    let leaves = '';
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const ang = Math.PI / 2 + dir * (0.25 + i * 0.27);
        const x = cx + Math.cos(ang) * R;
        const y = cy + Math.sin(ang) * R * 0.95;
        const rot = (ang * 180) / Math.PI + (dir > 0 ? 70 : 110);
        const len = leaf * (1 - i * 0.04);
        leaves += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(len)}" ry="${n(len * 0.4)}" transform="rotate(${n(rot)} ${n(x)} ${n(y)})"/>`;
      }
    }
    s += `<g fill="${gold}" opacity="0.9">${leaves}</g>`;

    // The field, divided, inside the shield.
    let fieldSvg = rect(sx, sy, sw, sh, t1);
    if (field === 'pale') fieldSvg += rect(cx, sy, sw / 2, sh, t2);
    else if (field === 'bend') fieldSvg += path(`M${n(sx)} ${n(sy)}H${n(sx + sw)}L${n(sx)} ${n(sy + sh)}Z`, t2);
    else if (field === 'quarterly')
      fieldSvg += rect(cx, sy, sw / 2, sh / 2, t2) + rect(sx, sy + sh / 2, sw / 2, sh / 2, t2);
    else if (field === 'chevron') {
      fieldSvg += path(
        `M${n(sx)} ${n(sy + sh * 0.78)}L${n(cx)} ${n(sy + sh * 0.3)}L${n(sx + sw)} ${n(sy + sh * 0.78)}V${n(sy + sh * 0.98)}L${n(cx)} ${n(sy + sh * 0.5)}L${n(sx)} ${n(sy + sh * 0.98)}Z`,
        t2,
      );
    }
    s += `<g clip-path="url(#${ids.clip})">${fieldSvg}</g>`;
    const chargeFill = field === 'plain' ? gold : mix(gold, p.night, 0.1);
    s += charge(emblem, cx, sy + sh * (field === 'chevron' ? 0.2 : 0.42), sw * 0.2, chargeFill);
    s += path(shieldPath(sx, sy, sw), 'none', `stroke="${gold}" stroke-width="${n(3 * u)}"`);

    s += t.draw({ x: W / 2, y: titleY, anchor: 'middle', fill: ink });
    s += drawAuthor(a, W / 2, aY, ink);
    return s;
  },
};

/* --------------------------------------------------------------- storybook */

export const storybook = {
  id: 'storybook',
  name: 'Storybook',
  group: 'Genre',
  description: "Children's: rolling hills, a sun or a rainbow, clouds, and a bold outlined title.",
  variants: { sky: { label: 'Sky', values: { sun: 'Sun', rainbow: 'Rainbow' } } },
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const skyKind = c.choose('sky', ['sun', 'sun', 'rainbow']);
    const bright = strongAccents(p, p.paper, 1.2).concat(p.accents);
    const sky = mix(p.paper, bright[1] ?? p.accents[1], 0.18);
    const a = authorFit(c, { font: FONTS.geometric, weight: 700, letterSpacing: 0.12, maxSize: S * 0.042 });
    const fill = textColor(p, [sky, '#ffffff'], [bright[0], p.ink]);
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
    const hillTop = Math.max(titleY + t.height + m, H * 0.62);
    // The sky between the title and the hills: the sun, the rainbow and the clouds stay in it.
    const bandTop = titleY + t.height + m * 0.4;
    const band = Math.max(0, hillTop - bandTop);

    let s = rect(0, 0, W, H, sky);
    // The sun, or a rainbow arching over the hills.
    if (skyKind === 'sun') {
      const r = Math.min(S * rng.float(0.08, 0.11), band / 3.4);
      const sx = W * rng.float(0.72, 0.84);
      const sy = bandTop + band / 2;
      let rays = '';
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        rays += `<line x1="${n(sx + Math.cos(ang) * r * 1.25)}" y1="${n(sy + Math.sin(ang) * r * 1.25)}" x2="${n(sx + Math.cos(ang) * r * 1.6)}" y2="${n(sy + Math.sin(ang) * r * 1.6)}"/>`;
      }
      const sun = mix(bright[0], '#ffd23f', 0.5);
      s += `<g stroke="${sun}" stroke-width="${n(5 * u)}" stroke-linecap="round">${rays}</g>${circle(sx, sy, r, sun)}`;
    } else {
      const rx = W * 0.5;
      const ry = hillTop + S * 0.05;
      // As wide as the cover allows, and no higher than the band.
      const outer = Math.min(W * 0.46, ry - bandTop - W * 0.025);
      const colors = [
        bright[0],
        bright[1] ?? p.accents[0],
        bright[2] ?? p.accents[2],
        mix(p.paper, bright[1] ?? p.ink, 0.3),
      ];
      colors.forEach((col, i) => {
        const r = outer - W * 0.05 * i;
        if (r <= W * 0.03) return;
        s += `<path d="M${n(rx - r)} ${n(ry)}A${n(r)} ${n(r)} 0 0 1 ${n(rx + r)} ${n(ry)}" fill="none" stroke="${col}" stroke-width="${n(W * 0.05)}"/>`;
      });
    }
    // Clouds: puffs of circles.
    for (let k = 0; k < rng.int(2, 3); k++) {
      const r = Math.min(S * rng.float(0.035, 0.05), band / 3);
      const cx = W * rng.float(0.1, 0.9);
      const cy = bandTop + r * 1.3 + rng.float(0, Math.max(0, band - r * 2.6));
      if (r < S * 0.012) continue;
      let puff = '';
      for (const [dx, dy, f] of [
        [-1.1, 0.2, 0.8],
        [0, -0.2, 1.1],
        [1.1, 0.2, 0.85],
        [0.4, 0.35, 0.9],
        [-0.5, 0.35, 0.85],
      ]) {
        puff += circle(cx + dx * r, cy + dy * r, r * f, '#ffffff');
      }
      s += `<g opacity="0.95">${puff}</g>`;
    }
    // Hills, back to front.
    const hills = [bright[2] ?? p.accents[2], bright[1] ?? p.accents[1], mix(bright[1] ?? p.accents[0], p.ink, 0.15)];
    hills.forEach((col, i) => {
      const y = hillTop + (H - hillTop) * (0.08 + i * 0.22);
      const cx = W * rng.float(0.15, 0.85);
      s += `<ellipse cx="${n(cx)}" cy="${n(y + H * 0.35)}" rx="${n(W * rng.float(0.7, 0.95))}" ry="${n(H * 0.38)}" fill="${mix(col, p.paper, 0.15)}"/>`;
    });

    // The title in thick letters with a white outline, tilted a little.
    const stroke = `stroke="#ffffff" stroke-width="${n(Math.max(2, t.size * 0.12))}" stroke-linejoin="round" paint-order="stroke"`;
    s += `<g transform="rotate(-2 ${n(W / 2)} ${n(titleY + t.height / 2)})">${t.draw({
      x: W / 2,
      y: titleY,
      anchor: 'middle',
      fill,
      attrs: stroke,
    })}</g>`;
    s += drawAuthor(a, W / 2, aY, textColor(p, sky, [p.ink]));
    return s;
  },
};

/* -------------------------------------------------------------------- idea */

export const idea = {
  id: 'idea',
  name: 'Big Idea',
  group: 'Genre',
  description: 'Non-fiction: a big plain title, a prominent subtitle, and one clear mark.',
  variants: { mark: { label: 'Mark', values: { bars: 'Bars', arrow: 'Arrow', circle: 'Circle' } } },
  prefer: 'light',
  /** @param {Ctx} c */
  render(c) {
    const { W, H, S, u, m, rng, p } = c;
    const mark = c.choose('mark', ['bars', 'arrow', 'circle']);
    const accent = strongAccents(p, p.bg, 2)[0];
    const ink = textColor(p, p.bg, [p.ink]);
    const pad = m * 1.2;
    const a = authorFit(c, { font: FONTS.sans, weight: 700, letterSpacing: 0.04, upper: false, maxSize: S * 0.05 });
    const t = titleBlock(c, {
      font: FONTS.sans,
      weight: 800,
      letterSpacing: -0.02,
      maxWidth: W - pad * 2,
      maxHeight: H * 0.48,
      maxSize: S * 0.15,
      lineHeight: 1.0,
      subtitleFont: FONTS.sans,
      subtitleItalic: false,
      subtitleSize: S * 0.046,
    });
    const aY = H - pad - a.height;
    let s = rect(0, 0, W, H, p.bg);
    // A rule over the title, in the accent.
    s += rect(pad, pad, Math.min(W * 0.18, S * 0.18), Math.max(3, 6 * u), accent);
    const titleY = pad + m * 0.7;

    // The mark, in the room between the title and the author, at the right.
    const top = titleY + t.height + m * 0.8;
    const bottom = aY - m * 0.8;
    const room = Math.max(0, bottom - top);
    const size = Math.min(room, W * 0.5, S * 0.45);
    if (size > S * 0.08) {
      const x1 = W - pad;
      const y1 = top + (room + size) / 2;
      const x0 = x1 - size;
      const y0 = y1 - size;
      if (mark === 'bars') {
        const count = 4;
        const gap = size * 0.06;
        const bw = (size - gap * (count - 1)) / count;
        for (let i = 0; i < count; i++) {
          const h = size * (0.28 + (i / (count - 1)) * 0.72) * rng.float(0.85, 1);
          s += rect(x0 + i * (bw + gap), y1 - h, bw, h, i === count - 1 ? accent : mix(accent, p.bg, 0.55));
        }
      } else if (mark === 'arrow') {
        const w = size * 0.16;
        s += `<path d="M${n(x0 + w)} ${n(y1 - w * 0.2)}L${n(x1 - w * 1.2)} ${n(y0 + w * 1.2)}" stroke="${accent}" stroke-width="${n(w)}" stroke-linecap="square" fill="none"/>`;
        s += path(`M${n(x1)} ${n(y0)}V${n(y0 + size * 0.55)}L${n(x1 - size * 0.55)} ${n(y0)}Z`, accent);
      } else {
        s += circle(x0 + size / 2, y0 + size / 2, size / 2, accent);
        s += circle(x0 + size * 0.36, y0 + size * 0.36, size * 0.12, mix(accent, p.paper, 0.55));
      }
    }
    s += t.draw({ x: pad, y: titleY, fill: ink, subtitleFill: mix(ink, accent, 0.25) });
    s += drawAuthor(a, pad, aY, ink, 'start');
    return s;
  },
};

/**
 * The author's name at (x, y), if there is one.
 * @param {import('../text.js').TextFit} a @param {number} x @param {number} y @param {string} fill
 * @param {'start' | 'middle'} [anchor]
 */
function drawAuthor(a, x, y, fill, anchor = 'middle') {
  return a.lines.length ? drawText(a, { x, y, anchor, fill }) : '';
}
