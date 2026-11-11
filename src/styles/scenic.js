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
  linearGradient,
  radialGradient,
  blurFilter,
  shadowFilter,
} from '../core.js';
import { FONTS, fitText, drawText } from '../text.js';

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
  description: 'Layered mountain ranges under a low sun.',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const [sunC, , farC] = rng.shuffle(p.accents);
    const skyTop = p.dark ? p.bg : mix(p.bg, p.accents[1], 0.1);
    const horizon = mix(skyTop, sunC, 0.45);
    const dark = p.dark ? mix(p.bg, '#000000', 0.45) : mix(p.ink, farC, 0.3);
    const sky = c.id('sky');

    let s = `<defs>${linearGradient(sky, [[0, skyTop], [0.5, mix(skyTop, horizon, 0.55)], [0.75, horizon]])}</defs>`;
    s += rect(0, 0, W, H, `url(#${sky})`);
    if (p.dark) s += starfield(c, 70, H * 0.45, p.ink);

    const sunR = Math.min(W, H) * rng.float(0.08, 0.13);
    const sunX = W * rng.float(0.2, 0.8);
    const sunY = H * rng.float(0.38, 0.46);
    s += circle(sunX, sunY, sunR * 1.9, sunC, 'opacity="0.16"');
    s += circle(sunX, sunY, sunR, mix(sunC, '#ffffff', 0.15));

    const layers = rng.int(4, 6);
    let front = dark;
    for (let i = 0; i < layers; i++) {
      const k = i / (layers - 1);
      const baseY = H * (0.5 + 0.34 * k);
      const amp = H * (0.11 - 0.06 * k);
      const pts = ridge(rng, 64, rng.float(0.45, 0.6));
      const coords = pts.map((v, j) => [(j / 64) * W, baseY - amp * (v * 0.5 + 0.5)]);
      front = mix(horizon, dark, ((i + 1) / layers) ** 0.85);
      s += path(pathD([[0, H], ...coords, [W, H]], true), front);
    }

    const top = m * 1.4;
    const font = rng.pick([FONTS.serif, FONTS.didone, FONTS.condensed]);
    const condensed = font === FONTS.condensed;
    const t = fitText(c.title, {
      font,
      weight: condensed ? 600 : 400,
      upper: condensed,
      letterSpacing: condensed ? 0.06 : 0,
      maxWidth: W - m * 2.4,
      maxHeight: Math.min(sunY - sunR, H * 0.39) - m * 0.9 - top,
      maxSize: W * 0.11,
      lineHeight: 1.08,
      maxLines: 4,
    });
    s += drawText(t, { x: W / 2, y: top, anchor: 'middle', fill: inkOn(skyTop, p) });
    const a = fitText(c.author, { font: FONTS.sans, weight: 500, upper: true, letterSpacing: 0.25, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.03, maxLines: 2 });
    s += drawText(a, { x: W / 2, y: H - m * 1.1 - a.height, anchor: 'middle', fill: inkOn(front, p) });
    return s;
  },
};

export const waves = {
  id: 'waves',
  name: 'Waves',
  description: 'Stacked sine waves in blended tones.',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const flip = rng.bool(0.35);
    const count = rng.int(5, 9);
    const start = H * rng.float(0.46, 0.56);
    const A = H * rng.float(0.02, 0.04);
    const [c1, c2] = rng.shuffle(p.accents);
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
    const regionTop = flip ? H - free : m * 1.4;
    const regionBottom = flip ? H - m * 1.4 : free;
    const a = fitText(c.author, { font: FONTS.sans, weight: 500, upper: true, letterSpacing: 0.22, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.03, maxLines: 2 });
    const font = rng.pick([FONTS.serif, FONTS.garamond, FONTS.sans]);
    const t = fitText(c.title, {
      font,
      weight: font === FONTS.sans ? 300 : 400,
      maxWidth: W - m * 2.4,
      maxHeight: regionBottom - regionTop,
      maxSize: W * 0.11,
      lineHeight: 1.1,
      maxLines: 5,
    });
    const tY = regionTop + (regionBottom - regionTop - t.height) / 2;
    s += drawText(t, { x: W / 2, y: tY, anchor: 'middle', fill: p.ink });
    const aY = flip ? m * 1.1 : H - m * 1.1 - a.height;
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: inkOn(last, p) });
    return s;
  },
};

export const constellation = {
  id: 'constellation',
  name: 'Constellation',
  description: 'Night sky with a crescent moon and a star chart.',
  prefer: 'dark',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const accent = rng.pick(p.accents);
    const sky = c.id('sky');
    const moonMask = c.id('moon');
    const glow = c.id('glow');
    const night = p.night;
    const light = p.paper;

    const mr = Math.min(W, H) * rng.float(0.05, 0.075);
    const mx = W * rng.float(0.18, 0.82);
    const my = H * rng.float(0.09, 0.15);
    let s = '<defs>';
    s += linearGradient(sky, [[0, mix(night, '#000000', 0.3)], [1, mix(night, accent, 0.28)]]);
    s += `<mask id="${moonMask}">${circle(mx, my, mr, '#ffffff')}${circle(mx + mr * 0.42, my - mr * 0.22, mr * 0.9, '#000000')}</mask>`;
    s += blurFilter(glow, 3 * u);
    s += '</defs>';
    s += rect(0, 0, W, H, `url(#${sky})`);
    s += starfield(c, Math.round(200 * Math.sqrt((W * H) / 540000)), H, light);
    s += circle(mx, my, mr * 2.4, light, 'opacity="0.06"');
    s += `<g mask="url(#${moonMask})">${circle(mx, my, mr, mix(light, accent, 0.15))}</g>`;

    const k = rng.int(5, 8);
    const pts = [];
    for (let tries = 0; pts.length < k && tries < 400; tries++) {
      const pt = [rng.float(m * 1.5, W - m * 1.5), rng.float(H * 0.24, H * 0.56)];
      if (pts.every((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) > W * 0.1)) pts.push(pt);
    }
    pts.sort((a, b) => a[0] - b[0]);
    const order = [pts[0]];
    const rest = pts.slice(1);
    while (rest.length) {
      const last = order[order.length - 1];
      let bi = 0;
      rest.forEach((q, i) => {
        if (Math.hypot(q[0] - last[0], q[1] - last[1]) < Math.hypot(rest[bi][0] - last[0], rest[bi][1] - last[1])) bi = i;
      });
      order.push(rest.splice(bi, 1)[0]);
    }
    let lines = '';
    for (let i = 1; i < order.length; i++) {
      lines += line(order[i - 1][0], order[i - 1][1], order[i][0], order[i][1], light, 1.1 * u);
    }
    if (order.length > 4 && rng.bool(0.6)) {
      const a = order[rng.int(1, order.length - 3)];
      const b = order[order.length - 1];
      lines += line(a[0], a[1], b[0], b[1], light, 1.1 * u);
    }
    s += `<g opacity="0.5">${lines}</g>`;
    for (const [x, y] of order) {
      s += circle(x, y, 7 * u, accent, `opacity="0.45" filter="url(#${glow})"`);
      s += circle(x, y, 2.6 * u, light);
    }

    const a = fitText(c.author, { font: FONTS.sans, weight: 400, upper: true, letterSpacing: 0.3, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.028, maxLines: 2 });
    const aY = H - m * 1.2 - a.height;
    const top = H * 0.64;
    const font = rng.pick([FONTS.serif, FONTS.didone, FONTS.garamond]);
    const t = fitText(c.title, {
      font,
      upper: true,
      letterSpacing: 0.1,
      maxWidth: W - m * 2.2,
      maxHeight: aY - m * 0.8 - top,
      maxSize: W * 0.085,
      lineHeight: 1.18,
      maxLines: 4,
    });
    s += drawText(t, { x: W / 2, y: top + (aY - m * 0.8 - top - t.height) / 2, anchor: 'middle', fill: light });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: mix(light, accent, 0.3) });
    return s;
  },
};

export const orbit = {
  id: 'orbit',
  name: 'Orbit',
  description: 'A planet with tilted orbits and moons.',
  prefer: 'dark',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const night = p.night;
    const light = p.paper;
    const [pc, rc, mc] = rng.shuffle(p.accents);
    const cx = W / 2 + W * rng.float(-0.1, 0.1);
    const cy = H * rng.float(0.3, 0.36);
    const R = Math.min(W, H) * rng.float(0.1, 0.14);
    const tilt = rng.float(-28, 28);
    const squash = rng.float(0.3, 0.44);
    const rad = (tilt * Math.PI) / 180;
    const limit = H * 0.6 - cy;
    const step = W * rng.float(0.07, 0.09);
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
    s += radialGradient(planet, [[0, mix(pc, '#ffffff', 0.45)], [0.55, pc], [1, mix(pc, '#000000', 0.55)]], { fx: 0.35, fy: 0.3, r: 0.6 });
    s += radialGradient(halo, [[0, mix(night, pc, 0.35)], [1, night]], { r: 0.6, cy: 0.33 });
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

    const a = fitText(c.author, { font: FONTS.geometric, weight: 400, upper: true, letterSpacing: 0.3, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.028, maxLines: 2 });
    const aY = H - m * 1.2 - a.height;
    const top = H * 0.66;
    const t = fitText(c.title, {
      font: FONTS.geometric,
      weight: 500,
      upper: true,
      letterSpacing: 0.12,
      maxWidth: W - m * 2.2,
      maxHeight: aY - m * 0.8 - top,
      maxSize: W * 0.08,
      lineHeight: 1.2,
      maxLines: 4,
    });
    s += drawText(t, { x: W / 2, y: top + (aY - m * 0.8 - top - t.height) / 2, anchor: 'middle', fill: light });
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: mix(light, rc, 0.4) });
    return s;
  },
};

export const retro = {
  id: 'retro',
  name: 'Retro Sun',
  description: 'Eighties sunset over a neon perspective grid.',
  prefer: 'dark',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const sorted = [...p.accents].sort((a, b) => luminance(b) - luminance(a));
    const [hi, mid, lo] = sorted;
    const night = p.night;
    const light = p.paper;
    const horizon = H * rng.float(0.56, 0.62);
    const R = Math.min(W * rng.float(0.26, 0.34), horizon * 0.36);
    const cx = W / 2;
    const cy = horizon - R * 0.25;

    const ids = { sky: c.id('sky'), sun: c.id('sun'), stripes: c.id('stripes'), glow: c.id('glow'), clip: c.id('clip'), chrome: c.id('chrome'), sh: c.id('sh') };
    let defs = linearGradient(ids.sky, [[0, mix(night, '#000000', 0.35)], [0.7, mix(night, lo, 0.35)], [1, mix(night, lo, 0.6)]]);
    defs += linearGradient(ids.sun, [[0, hi], [1, lo]]);
    defs += linearGradient(ids.chrome, [[0, '#ffffff'], [0.48, mix(light, hi, 0.35)], [0.52, hi], [1, mix(hi, lo, 0.6)]]);
    let bands = rect(cx - R, cy - R, R * 2, R * 2, '#ffffff');
    for (let k = 0; k < 7; k++) {
      const y = cy - R * 0.12 + k * R * 0.17;
      bands += rect(cx - R, y, R * 2, R * 0.025 * (k + 1), '#000000');
    }
    defs += `<mask id="${ids.stripes}">${bands}</mask>`;
    defs += `<clipPath id="${ids.clip}">${rect(0, 0, W, horizon, '#000')}</clipPath>`;
    defs +=
      `<filter id="${ids.glow}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${n(2.5 * u)}" result="b"/>` +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    defs += shadowFilter(ids.sh, u, { blur: 5, dy: 3, opacity: 0.6 });

    let s = `<defs>${defs}</defs>`;
    s += rect(0, 0, W, H, `url(#${ids.sky})`);
    s += starfield(c, 50, horizon * 0.7, light);
    s += `<g clip-path="url(#${ids.clip})">`;
    s += circle(cx, cy, R * 1.35, lo, 'opacity="0.18"');
    s += `<g mask="url(#${ids.stripes})">${circle(cx, cy, R, `url(#${ids.sun})`)}</g>`;
    if (rng.bool(0.6)) {
      const pts = ridge(rng, 32, 0.6).map((v, j) => [(j / 32) * W, horizon - H * 0.03 - H * 0.05 * (v * 0.5 + 0.5)]);
      s += path(pathD([[0, horizon + 1], ...pts, [W, horizon + 1]], true), mix(night, '#000000', 0.2));
    }
    s += '</g>';

    const floor = mix(night, '#000000', 0.45);
    s += rect(0, horizon, W, H - horizon, floor);
    let grid = line(0, horizon, W, horizon, mid, 2.2 * u);
    for (let k = 1; k <= 12; k++) {
      const y = horizon + (H - horizon) * (k / 12) ** 2.1;
      grid += line(0, y, W, y, mid, 1.4 * u);
    }
    for (let j = -14; j <= 14; j++) {
      grid += line(cx + j * W * 0.035, horizon, cx + j * W * 0.32, H + (H - horizon) * 0.4, mid, 1.4 * u);
    }
    s += `<g filter="url(#${ids.glow})" opacity="0.9">${grid}</g>`;

    const top = m * 1.3;
    const t = fitText(c.title, {
      font: FONTS.geometric,
      weight: 800,
      italic: true,
      upper: true,
      maxWidth: W - m * 2,
      maxHeight: cy - R - m * 0.7 - top,
      maxSize: W * 0.12,
      lineHeight: 1.02,
      maxLines: 4,
    });
    s += drawText(t, { x: W / 2, y: top, anchor: 'middle', fill: `url(#${ids.chrome})`, attrs: `filter="url(#${ids.sh})"` });
    const a = fitText(c.author, { font: FONTS.geometric, weight: 500, upper: true, letterSpacing: 0.3, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.03, maxLines: 2 });
    const aY = H - m * 1.1 - a.height;
    if (a.lines.length) s += rect(0, aY - m * 0.45, W, a.height + m * 0.9, floor, 'opacity="0.75"');
    s += drawText(a, { x: W / 2, y: aY, anchor: 'middle', fill: light });
    return s;
  },
};

export const shelf = {
  id: 'shelf',
  name: 'Bookshelf',
  description: 'A row of book spines on a shelf.',
  render(c) {
    const { W, H, u, m, rng, p } = c;
    const shelfY = H * rng.float(0.56, 0.62);
    const plankH = 12 * u;
    const left = m * 0.8;
    const right = W - m * 0.8;
    const lean = rng.bool(0.6);
    const stop = lean ? right - W * 0.26 : right;
    const colors = [...p.accents, mix(p.accents[0], p.ink, 0.35), mix(p.accents[1], p.bg, 0.3), mix(p.accents[2], p.ink, 0.2), p.ink];

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
        for (let k = 0; k < 3; k++) o += rect(x + w * 0.3, top + h * (0.2 + k * 0.08), w * 0.4, h * 0.025, deco, 'opacity="0.6"');
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
    while (x < stop - W * 0.04) {
      const w = Math.min(W * rng.float(0.045, 0.085), stop - x);
      const h = H * rng.float(0.2, 0.33);
      books += spine(x, w, h, rng.pick(colors));
      lastRight = x + w;
      lastH = h;
      x += w + u * rng.float(0, 2.5);
    }
    if (lean && lastH) {
      // Pivot on the bottom-left corner and tip left until the book rests on its neighbour.
      const w = W * rng.float(0.05, 0.075);
      const h = H * rng.float(0.22, 0.28);
      const ang = rng.float(14, 22);
      const rad = (ang * Math.PI) / 180;
      const contact = Math.min(lastH, h * Math.cos(rad));
      const bx = lastRight + contact * Math.tan(rad);
      books += `<g transform="rotate(${n(-ang)} ${n(bx)} ${n(shelfY)})">${spine(bx, w, h, rng.pick(colors))}</g>`;
    }
    s += books;
    s += rect(0, shelfY + plankH, W, plankH * 0.9, p.ink, 'opacity="0.12"');
    s += rect(0, shelfY, W, plankH, p.ink);

    const a = fitText(c.author, { font: FONTS.humanist, weight: 400, upper: true, letterSpacing: 0.28, maxWidth: W - m * 2, maxHeight: W * 0.08, maxSize: W * 0.032, maxLines: 2 });
    s += drawText(a, { x: W / 2, y: m * 1.3, anchor: 'middle', fill: p.ink });
    const tTop = shelfY + plankH + m * 0.9;
    const font = rng.pick([FONTS.serif, FONTS.humanist, FONTS.garamond]);
    const t = fitText(c.title, {
      font,
      weight: font === FONTS.humanist ? 600 : 400,
      maxWidth: W - m * 2.2,
      maxHeight: H - m * 1.3 - tTop,
      maxSize: W * 0.1,
      lineHeight: 1.1,
      maxLines: 4,
    });
    s += drawText(t, { x: W / 2, y: tTop + (H - m * 1.3 - tTop - t.height) / 2, anchor: 'middle', fill: p.ink });
    return s;
  },
};
