// Core utilities: seeded randomness, colour math, noise and SVG helpers.

/** 32-bit string hash (cyrb53 variant folded to 32 bits). */
export function hashString(input) {
  const str = String(input);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Deterministic PRNG (mulberry32) with convenience helpers. */
export function createRng(seed) {
  let a = hashString(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    float: (min = 0, max = 1) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    bool: (p = 0.5) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ colour */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHex = (v) => typeof v === 'string' && HEX_RE.test(v.trim());

export function hexToRgb(hex) {
  let h = hex.trim().slice(1);
  if (h.length === 3)
    h = h
      .split('')
      .map((ch) => ch + ch)
      .join('');
  const v = parseInt(h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(rgb) {
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(clamp(v, 0, 255))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Linear blend between two hex colours. */
export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pick the candidate colour with the best contrast against `bg`. */
export function readable(bg, candidates = ['#ffffff', '#111111']) {
  return candidates.reduce((best, c) => (contrast(bg, c) > contrast(bg, best) ? c : best));
}

/** Best text colour on `bg`: the palette's ink/background, or white/near-black. */
export const inkOn = (bg, p) => readable(bg, [p.ink, p.bg, '#ffffff', '#111111']);

/* ------------------------------------------------------------------- noise */

/** Smooth 2D value noise in roughly [-1, 1]. */
export function makeNoise2D(rng) {
  const perm = rng.shuffle([...Array(256).keys()]);
  const vals = Array.from({ length: 256 }, () => rng.float(-1, 1));
  const lattice = (ix, iy) => vals[perm[(perm[ix & 255] + iy) & 255]];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const top = lerp(lattice(ix, iy), lattice(ix + 1, iy), fx);
    const bottom = lerp(lattice(ix, iy + 1), lattice(ix + 1, iy + 1), fx);
    return lerp(top, bottom, fy);
  };
}

/** Fractal (multi-octave) noise built on a 2D noise function. */
export function fbm(noise, x, y, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq + i * 17.3, y * freq - i * 9.1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** 1D midpoint-displacement ridge, values normalised to [-1, 1]. */
export function ridge(rng, segments = 64, roughness = 0.55) {
  // Midpoint displacement needs a power of two; build one, then resample.
  const count = Math.max(1, Math.round(segments));
  let size = 1;
  while (size < count) size *= 2;
  const pts = new Array(size + 1).fill(0);
  pts[0] = rng.float(-0.6, 0.6);
  pts[size] = rng.float(-0.6, 0.6);
  let step = size;
  let disp = 1;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < size; i += step) {
      pts[i] = (pts[i - half] + pts[i + half]) / 2 + rng.float(-disp, disp);
    }
    step = half;
    disp *= roughness;
  }
  const max = Math.max(...pts.map(Math.abs)) || 1;
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * size;
    const i0 = Math.floor(t);
    out.push(lerp(pts[i0], pts[Math.min(size, i0 + 1)], t - i0) / max);
  }
  return out;
}

/* --------------------------------------------------------------------- svg */

/** Round to one decimal place to keep the SVG compact. */
export const n = (v) => Math.round(v * 10) / 10;

// Characters that are illegal in XML 1.0, plus unpaired UTF-16 surrogates.
const INVALID_XML =
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export const stripInvalidXml = (str) => String(str).replace(INVALID_XML, '');

export function escapeXml(str) {
  return stripInvalidXml(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const extra = (e) => (e ? ' ' + e : '');

export const rect = (x, y, w, h, fill, e = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra(e)}/>`;

export const circle = (cx, cy, r, fill, e = '') =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.max(0, r))}" fill="${fill}"${extra(e)}/>`;

export const line = (x1, y1, x2, y2, stroke, width, e = '') =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${n(width)}"${extra(e)}/>`;

/** Points [[x, y], ...] to a path `d` string. */
export function pathD(points, close = false) {
  return 'M' + points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L') + (close ? 'Z' : '');
}

export const path = (d, fill, e = '') => `<path d="${d}" fill="${fill}"${extra(e)}/>`;

/** Film-grain overlay. Returns { defs, layer }. */
export function grain(c, { opacity = 0.12, light = false, freq = 0.75 } = {}) {
  const id = c.id('grain');
  const v = light ? 1 : 0;
  const defs =
    `<filter id="${id}" x="0" y="0" width="100%" height="100%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${+(freq / c.u).toFixed(3)}" numOctaves="3" stitchTiles="stitch"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 0 ${v} 1.6 0 0 0 -0.55"/></filter>`;
  const layer = `<rect width="${c.W}" height="${c.H}" filter="url(#${id})" opacity="${opacity}"/>`;
  return { defs, layer };
}

/** Soft drop shadow filter definition. */
export function shadowFilter(id, u, { blur = 4, dy = 2, opacity = 0.35 } = {}) {
  return (
    `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${n(blur * u)}"/>` +
    `<feOffset dy="${n(dy * u)}"/>` +
    `<feComponentTransfer><feFuncA type="linear" slope="${opacity}"/></feComponentTransfer>` +
    `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
  );
}

/** Gaussian blur filter with a generous filter region. */
export function blurFilter(id, std) {
  return `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${n(std)}"/></filter>`;
}

/** Vertical/linear gradient definition. stops: [[offset 0..1, colour, opacity?], ...] */
export function linearGradient(id, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) {
  const s = stops
    .map(
      ([o, col, op]) =>
        `<stop offset="${+o.toFixed(3)}" stop-color="${col}"${op != null ? ` stop-opacity="${op}"` : ''}/>`,
    )
    .join('');
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${s}</linearGradient>`;
}

/**
 * @param {string} id
 * @param {ReadonlyArray<readonly [number, string, number?]>} stops
 * @param {{ cx?: number, cy?: number, r?: number, fx?: number, fy?: number }} [geometry]
 */
export function radialGradient(id, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy } = {}) {
  const s = stops
    .map(
      ([o, col, op]) =>
        `<stop offset="${+o.toFixed(3)}" stop-color="${col}"${op != null ? ` stop-opacity="${op}"` : ''}/>`,
    )
    .join('');
  const f = (fx != null ? ` fx="${fx}"` : '') + (fy != null ? ` fy="${fy}"` : '');
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${f}>${s}</radialGradient>`;
}
