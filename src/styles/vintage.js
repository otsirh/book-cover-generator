import {
  n,
  rect,
  circle,
  line,
  path,
  pathD,
  mix,
  readable,
  clamp,
  escapeXml,
  radialGradient,
  linearGradient,
} from '../core.js';
import { FONTS, fitText, drawText, textBottom, graphemes } from '../text.js';

export const classic = {
  id: 'classic',
  name: 'Classic Paperback',
  description: 'Three horizontal bands, like a mid-century paperback.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const band = rng.pick(p.accents);
    const cream = mix(p.paper, '#ffffff', 0.2);
    const ink = p.night;
    const b1 = H * 0.3;
    const b2 = H * 0.72;
    const onBand = readable(band, [cream, ink]);

    let s = rect(0, 0, W, H, band) + rect(0, b1, W, b2 - b1, cream);
    s += rect(0, b1 + 9 * u, W, 1.2 * u, band) + rect(0, b2 - 10.2 * u, W, 1.2 * u, band);

    const a = fitText(c.author, {
      font: FONTS.humanist,
      weight: 400,
      upper: true,
      letterSpacing: 0.24,
      maxWidth: W - m * 2.4,
      maxHeight: b1 * 0.4,
      maxSize: W * 0.04,
      maxLines: 2,
    });
    s += drawText(a, { x: W / 2, y: (b1 - a.height) / 2 + m * 0.2, anchor: 'middle', fill: onBand });

    const pad = m * 0.9;
    const font = rng.pick([FONTS.humanist, FONTS.serif, FONTS.garamond]);
    const t = fitText(c.title, {
      font,
      maxWidth: W - m * 2.4,
      maxHeight: b2 - b1 - pad * 2 - 20 * u,
      maxSize: W * 0.1,
      lineHeight: 1.14,
      maxLines: 5,
    });
    s += drawText(t, { x: W / 2, y: b1 + (b2 - b1 - t.height) / 2, anchor: 'middle', fill: ink });

    const er = Math.min(W * 0.07, (H - b2) * 0.28);
    const ey = (b2 + H) / 2;
    s += circle(W / 2, ey, er, cream, `stroke="${ink}" stroke-width="${n(1.5 * u)}"`);
    const initial = (Array.from(c.title.trim())[0] || '').toUpperCase();
    if (initial) {
      s += `<text x="${n(W / 2)}" y="${n(ey + er * 0.38)}" font-family="${FONTS.serif.family}" font-size="${n(er * 1.1)}" text-anchor="middle" fill="${band}">${escapeXml(initial)}</text>`;
    }
    return s;
  },
};

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
  description: 'Gilded frame, sunburst fan and stepped ornaments.',
  prefer: 'dark',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const bg = p.night;
    const light = p.paper;
    const gold = readable(bg, p.accents);
    const i1 = m * 0.45;
    const i2 = i1 + 8 * u;

    let s = rect(0, 0, W, H, bg);
    // fan
    const fx = W / 2;
    const fy = H - i2;
    const R = Math.min(W * 0.42, H * 0.3);
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

    // frame
    s += rect(i1, i1, W - i1 * 2, H - i1 * 2, 'none', `stroke="${gold}" stroke-width="${n(2.5 * u)}"`);
    s += rect(i2, i2, W - i2 * 2, H - i2 * 2, 'none', `stroke="${gold}" stroke-width="${n(u)}"`);
    s += decoCorner(i2, i2, 1, 1, gold, u) + decoCorner(W - i2, i2, -1, 1, gold, u);
    s += decoCorner(i2, H - i2, 1, -1, gold, u) + decoCorner(W - i2, H - i2, -1, -1, gold, u);

    // top chevrons
    const topY = i2 + m * 1.3;
    for (let k = 0; k < 3; k++) {
      const w = (40 - k * 11) * u;
      const y = topY + k * 7 * u;
      s += `<path d="M${n(W / 2 - w)} ${n(y + 12 * u)}L${n(W / 2)} ${n(y)}L${n(W / 2 + w)} ${n(y + 12 * u)}" fill="none" stroke="${gold}" stroke-width="${n(1.4 * u)}"/>`;
    }

    // text
    const font = rng.pick([FONTS.didone, FONTS.condensed]);
    const titleColor = rng.bool(0.5) ? gold : light;
    const a = fitText(c.author, {
      font: FONTS.geometric,
      weight: 400,
      upper: true,
      letterSpacing: 0.32,
      maxWidth: W - m * 3,
      maxHeight: W * 0.08,
      maxSize: W * 0.028,
      maxLines: 2,
    });
    const regionTop = topY + 34 * u + m * 0.4;
    const regionBottom = fy - R - m * 0.5;
    const divider = 26 * u;
    const authorBlock = a.lines.length ? divider + a.height : divider;
    const t = fitText(c.title, {
      font,
      weight: font === FONTS.condensed ? 600 : 400,
      upper: true,
      letterSpacing: 0.08,
      maxWidth: W - m * 3,
      maxHeight: regionBottom - regionTop - authorBlock - m * 0.6,
      maxSize: W * 0.1,
      lineHeight: 1.12,
      maxLines: 5,
    });
    const blockH = t.height + m * 0.6 + authorBlock;
    let y = regionTop + Math.max(0, (regionBottom - regionTop - blockH) / 2);
    s += drawText(t, { x: W / 2, y, anchor: 'middle', fill: titleColor });
    y += t.height + m * 0.6;
    const dy = y + 6 * u;
    s +=
      line(W / 2 - W * 0.16, dy, W / 2 - 10 * u, dy, gold, 1.2 * u) +
      line(W / 2 + 10 * u, dy, W / 2 + W * 0.16, dy, gold, 1.2 * u);
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

const STAMPS = ['MANUSCRIPT', 'FIRST DRAFT', 'ADVANCE COPY', 'UNCORRECTED PROOF', 'FILE COPY', 'APPROVED'];

function typedLine(str, x, y, size, rng, color) {
  let o = '';
  graphemes(str).forEach((ch, i) => {
    if (ch === ' ') return;
    const op = rng.float(0.72, 1).toFixed(2);
    o += `<tspan x="${n(x + i * size * 0.6 + rng.float(-0.4, 0.4))}" y="${n(y + rng.float(-0.6, 0.6))}" fill-opacity="${op}">${escapeXml(ch)}</tspan>`;
  });
  return `<text font-family="${FONTS.mono.family}" font-size="${n(size)}" font-weight="700" fill="${color}">${o}</text>`;
}

export const typewriter = {
  id: 'typewriter',
  name: 'Typewriter',
  description: 'A typed manuscript page with a rubber stamp.',
  prefer: 'light',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const paper = mix(p.paper, '#f4ead4', 0.45);
    const ink = mix(p.night, '#222222', 0.4);
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
      const r = Math.min(W, H) * rng.float(0.11, 0.15);
      const cx = W * rng.pick([0.22, 0.8]);
      const cy = H * rng.pick([0.12, 0.86]);
      s += `<g filter="url(#${ids.stain})" opacity="0.2">${circle(cx, cy, r, 'none', `stroke="#7a4b2a" stroke-width="${n(7 * u)}"`)}${circle(cx + r * 0.08, cy - r * 0.05, r * 0.94, 'none', `stroke="#7a4b2a" stroke-width="${n(2 * u)}"`)}</g>`;
    }

    const x = m * 1.5;
    const maxW = W - m * 3;
    const t = fitText(c.title, {
      font: FONTS.mono,
      weight: 700,
      upper: true,
      maxWidth: maxW,
      maxHeight: H * 0.34,
      maxSize: W * 0.095,
      minSize: W * 0.03,
      lineHeight: 1.35,
      maxLines: 6,
      balance: false,
    });
    let y = H * 0.22;
    t.lines.forEach((ln, i) => {
      s += typedLine(ln, x, y + t.size * t.cap + i * t.size * t.lineHeight, t.size, rng, ink);
    });
    y = textBottom(t, y) + 8 * u;
    const uw = Math.max(...t.lines.map((ln) => graphemes(ln).length)) * t.size * 0.6;
    s += line(
      x,
      y,
      x + uw,
      y,
      ink,
      1.6 * u,
      'stroke-dasharray="' + n(t.size * 0.5) + ' ' + n(t.size * 0.1) + '" opacity="0.85"',
    );
    if (c.author.trim()) {
      const a = fitText(`by ${c.author}`, {
        font: FONTS.mono,
        weight: 400,
        maxWidth: maxW,
        maxHeight: W * 0.1,
        maxSize: W * 0.045,
        maxLines: 2,
        balance: false,
      });
      y += m * 0.9;
      a.lines.forEach((ln, i) => {
        s += typedLine(ln, x, y + a.size * a.cap + i * a.size * a.lineHeight, a.size, rng, ink);
      });
    }
    const pg = fitText('- 1 -', { font: FONTS.mono, maxWidth: W, maxSize: W * 0.028 });
    s += drawText(pg, { x: W / 2, y: H - m * 1.3, anchor: 'middle', fill: ink, opacity: 0.7 });

    // stamp
    const word = rng.pick(STAMPS);
    const st = fitText(word, {
      font: FONTS.condensed,
      weight: 700,
      upper: true,
      letterSpacing: 0.12,
      maxWidth: W * 0.56,
      maxSize: W * 0.078,
      maxLines: 1,
    });
    const sp = st.size * 0.45;
    const sw = st.width + sp * 2;
    const shh = st.height + sp * 2;
    const scx = W * rng.float(0.5, 0.64);
    const scy = H * rng.float(0.66, 0.76);
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

export const sunburst = {
  id: 'sunburst',
  name: 'Sunburst',
  description: 'Vintage poster rays over a title banner.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const [c1, c2] = rng.shuffle(p.accents);
    const cx = W / 2;
    const cy = H * rng.float(0.4, 0.52);
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
    const sr = Math.min(W, H) * rng.float(0.13, 0.18);
    s += circle(cx, cy, sr * 1.18, p.bg) + circle(cx, cy, sr, c2);

    const pad = m * 0.8;
    const innerW = W - m * 2 - pad * 2;
    const font = rng.pick([FONTS.display, FONTS.serif, FONTS.condensed]);
    const t = fitText(c.title, {
      font,
      weight: font === FONTS.condensed ? 700 : 400,
      upper: font !== FONTS.serif,
      maxWidth: innerW,
      maxHeight: H * 0.24,
      maxSize: W * 0.11,
      lineHeight: 1.04,
      maxLines: 4,
    });
    const a = fitText(c.author, {
      font: FONTS.serif,
      italic: true,
      maxWidth: innerW,
      maxHeight: W * 0.1,
      maxSize: W * 0.04,
      maxLines: 2,
    });
    const gap = a.lines.length ? m * 0.55 : 0;
    const bandH = pad * 2 + t.height + gap + a.height + 10 * u;
    const by = clamp(cy + sr * 1.18 + m * 0.6, m, H - m - bandH);
    s += rect(m, by, W - m * 2, bandH, p.bg);
    s += rect(
      m + 5 * u,
      by + 5 * u,
      W - m * 2 - 10 * u,
      bandH - 10 * u,
      'none',
      `stroke="${p.ink}" stroke-width="${n(1.5 * u)}"`,
    );
    s += drawText(t, { x: W / 2, y: by + pad + 5 * u, anchor: 'middle', fill: p.ink });
    s += drawText(a, { x: W / 2, y: by + pad + 5 * u + t.height + gap, anchor: 'middle', fill: p.ink });
    return s;
  },
};

export const typographic = {
  id: 'typographic',
  name: 'Big Letter',
  description: 'A giant initial cropped by the cover edge.',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const letter = (Array.from(c.title.trim())[0] || 'A').toUpperCase();
    const font = rng.pick([FONTS.didone, FONTS.serif, FONTS.geometric, FONTS.display]);
    const weight = font === FONTS.geometric ? 700 : 400;
    const mode = rng.pick(['solid', 'outline', 'duo']);
    const [c1, c2] = rng.shuffle(p.accents);
    const size = Math.min(W, H * 0.7) * rng.float(1.05, 1.3) * (font === FONTS.display ? 0.85 : 1);
    const baseline = H * rng.float(0.6, 0.65);
    const lx = W * rng.float(0.42, 0.6);
    const attrs = `font-family="${font.family}" font-size="${n(size)}" font-weight="${weight}" text-anchor="middle"`;
    const glyph = escapeXml(letter);

    let s = rect(0, 0, W, H, p.bg);
    if (mode === 'duo') {
      s += `<text x="${n(lx + size * 0.035)}" y="${n(baseline + size * 0.02)}" ${attrs} fill="${c2}">${glyph}</text>`;
      s += `<text x="${n(lx)}" y="${n(baseline)}" ${attrs} fill="${c1}" style="mix-blend-mode:${p.dark ? 'screen' : 'multiply'}">${glyph}</text>`;
    } else if (mode === 'outline') {
      s += `<text x="${n(lx)}" y="${n(baseline)}" ${attrs} fill="none" stroke="${readable(p.bg, p.accents)}" stroke-width="${n(3.5 * u)}">${glyph}</text>`;
    } else {
      s += `<text x="${n(lx)}" y="${n(baseline)}" ${attrs} fill="${c1}">${glyph}</text>`;
    }
    const ruleY = baseline + m * 0.5;
    s += rect(m, ruleY, W - m * 2, 1.2 * u, p.ink);

    const a = fitText(c.author, {
      font: FONTS.sans,
      weight: 500,
      upper: true,
      letterSpacing: 0.2,
      maxWidth: W - m * 2,
      maxHeight: W * 0.08,
      maxSize: W * 0.03,
      maxLines: 2,
    });
    const aY = H - m * 1.2 - a.height;
    const tTop = ruleY + m * 0.7;
    const tfont = rng.pick([FONTS.serif, FONTS.sans, FONTS.garamond]);
    const t = fitText(c.title, {
      font: tfont,
      weight: tfont === FONTS.sans ? 700 : 400,
      maxWidth: W - m * 2,
      maxHeight: aY - m * 0.7 - tTop,
      maxSize: W * 0.085,
      lineHeight: 1.08,
      maxLines: 4,
    });
    s += drawText(t, { x: m, y: tTop, fill: p.ink });
    s += drawText(a, { x: m, y: aY, fill: p.ink, opacity: 0.8 });
    return s;
  },
};

function memphisShape(type, x, y, s, color, rot, u) {
  const tr = `transform="rotate(${n(rot)} ${n(x)} ${n(y)})"`;
  const stroke = (w) =>
    `fill="none" stroke="${color}" stroke-width="${n(w * u)}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (type) {
    case 'squiggle': {
      const pts = [];
      for (let i = 0; i <= 6; i++) pts.push([x - s + (i * s * 2) / 6, y + (i % 2 ? -s * 0.22 : s * 0.22)]);
      return `<path d="${pathD(pts)}" ${stroke(5)} ${tr}/>`;
    }
    case 'triangle':
      return `<path d="${pathD(
        [
          [x, y - s * 0.6],
          [x + s * 0.6, y + s * 0.45],
          [x - s * 0.6, y + s * 0.45],
        ],
        true,
      )}" ${stroke(4)} ${tr}/>`;
    case 'circle':
      return circle(x, y, s * 0.45, color);
    case 'ring':
      return circle(x, y, s * 0.42, 'none', `stroke="${color}" stroke-width="${n(4 * u)}"`);
    case 'dots': {
      let o = '';
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) o += circle(x + (i - 1) * s * 0.3, y + (j - 1) * s * 0.3, s * 0.06, color);
      return `<g ${tr}>${o}</g>`;
    }
    case 'half':
      return path(`M${n(x - s * 0.5)} ${n(y)}A${n(s * 0.5)} ${n(s * 0.5)} 0 0 1 ${n(x + s * 0.5)} ${n(y)}Z`, color, tr);
    case 'confetti':
      return rect(x - s * 0.4, y - s * 0.1, s * 0.8, s * 0.2, color, tr);
    case 'cross':
      return `<g ${tr}>${rect(x - s * 0.35, y - s * 0.08, s * 0.7, s * 0.16, color)}${rect(x - s * 0.08, y - s * 0.35, s * 0.16, s * 0.7, color)}</g>`;
    default: {
      let o = '';
      for (let i = 0; i < 4; i++)
        o += line(x - s * 0.5, y + (i - 1.5) * s * 0.22, x + s * 0.5, y + (i - 1.5) * s * 0.22, color, 3 * u);
      return `<g ${tr}>${o}</g>`;
    }
  }
}

export const memphis = {
  id: 'memphis',
  name: 'Memphis',
  description: 'Playful eighties confetti of squiggles and shapes.',
  prefer: 'light',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const colors = [...p.accents, p.ink];
    const types = ['squiggle', 'squiggle', 'triangle', 'circle', 'ring', 'dots', 'half', 'confetti', 'cross', 'lines'];
    let s = rect(0, 0, W, H, p.bg);
    const gc = 4;
    const gr = Math.round((H / W) * 4) + 1;
    for (let j = 0; j < gr; j++) {
      for (let i = 0; i < gc; i++) {
        if (rng.bool(0.25)) continue;
        const x = ((i + rng.float(0.15, 0.85)) / gc) * W;
        const y = ((j + rng.float(0.15, 0.85)) / gr) * H;
        s += memphisShape(
          rng.pick(types),
          x,
          y,
          Math.min(W, H) * rng.float(0.07, 0.12),
          rng.pick(colors),
          rng.float(0, 360),
          u,
        );
      }
    }
    const pad = m * 0.9;
    const boxW = W - m * 2.6;
    const innerW = boxW - pad * 2;
    const t = fitText(c.title, {
      font: FONTS.geometric,
      weight: 800,
      upper: true,
      maxWidth: innerW,
      maxHeight: H * 0.3,
      maxSize: W * 0.1,
      lineHeight: 1.02,
      maxLines: 5,
    });
    const a = fitText(c.author, {
      font: FONTS.geometric,
      weight: 500,
      upper: true,
      letterSpacing: 0.12,
      maxWidth: innerW,
      maxHeight: W * 0.08,
      maxSize: W * 0.032,
      maxLines: 2,
    });
    const gap = a.lines.length ? m * 0.7 : 0;
    const boxH = pad * 2 + t.height + gap + a.height;
    const bx = (W - boxW) / 2;
    const by = clamp(H * rng.float(0.42, 0.56) - boxH / 2, m, H - m - boxH);
    const shadow = p.dark ? p.accents[0] : p.ink;
    s += rect(bx + 12 * u, by + 12 * u, boxW, boxH, shadow);
    s += rect(bx, by, boxW, boxH, p.bg, `stroke="${p.ink}" stroke-width="${n(3 * u)}"`);
    s += drawText(t, { x: bx + pad, y: by + pad, fill: p.ink });
    if (a.lines.length) {
      const ay = by + pad + t.height + gap;
      s += rect(
        bx + pad - 4 * u,
        ay + a.height - a.size * 0.25,
        Math.min(a.width + 8 * u, innerW),
        a.size * 0.45,
        p.accents[2],
        'opacity="0.8"',
      );
      s += drawText(a, { x: bx + pad, y: ay, fill: p.ink });
    }
    return s;
  },
};

export const noir = {
  id: 'noir',
  name: 'Noir',
  description: 'Venetian-blind shadows and a hard-boiled title.',
  prefer: 'dark',
  /** @param {import('../index.js').StyleContext} c */
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const bg = mix(p.night, '#000000', 0.35);
    const light = p.paper;
    const accent = readable(bg, p.accents);
    const ids = { pool: c.id('pool'), fade: c.id('fade'), mask: c.id('mask') };
    let s = '<defs>';
    s += radialGradient(
      ids.pool,
      [
        [0, mix(bg, light, 0.16)],
        [1, bg],
      ],
      { cx: 0.7, cy: 0.25, r: 0.7 },
    );
    s += linearGradient(
      ids.fade,
      [
        [0, '#ffffff'],
        [0.55, '#ffffff', 0.6],
        [1, '#ffffff', 0],
      ],
      { x1: 1, y1: 0, x2: 0, y2: 1 },
    );
    s += `<mask id="${ids.mask}">${rect(0, 0, W, H, `url(#${ids.fade})`)}</mask>`;
    s += '</defs>';
    s += rect(0, 0, W, H, `url(#${ids.pool})`);

    if (rng.bool(0.55))
      s += circle(
        W * rng.float(0.6, 0.8),
        H * rng.float(0.18, 0.3),
        Math.min(W, H) * rng.float(0.12, 0.17),
        accent,
        'opacity="0.9"',
      );
    else s += rect(W - m * 1.6, H * 0.08, 8 * u, H * 0.45, accent);

    const ang = rng.float(-26, -14);
    const sp = H * rng.float(0.045, 0.06);
    let bars = '';
    for (let y = -H * 0.3; y < H * 1.3; y += sp) bars += rect(-W * 0.3, y, W * 1.6, sp * 0.48, light);
    s += `<g mask="url(#${ids.mask})"><g transform="rotate(${n(ang)} ${n(W / 2)} ${n(H / 2)})" opacity="0.13">${bars}</g></g>`;

    const a = fitText(c.author, {
      font: FONTS.condensed,
      weight: 600,
      upper: true,
      letterSpacing: 0.3,
      maxWidth: W - m * 2,
      maxHeight: W * 0.08,
      maxSize: W * 0.034,
      maxLines: 2,
    });
    const aY = H - m * 1.3 - a.height;
    const font = rng.pick([FONTS.display, FONTS.condensed]);
    const t = fitText(c.title, {
      font,
      weight: font === FONTS.condensed ? 700 : 400,
      upper: true,
      maxWidth: W - m * 2,
      maxHeight: H * 0.42,
      maxSize: W * 0.17,
      lineHeight: 0.95,
      maxLines: 5,
    });
    s += drawText(t, { x: m, y: aY - m * 0.7 - t.height, fill: light });
    s += drawText(a, { x: m, y: aY, fill: accent });
    return s;
  },
};
