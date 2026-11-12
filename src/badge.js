// A badge on the cover: a seal ("Winner of the …", "10th Anniversary Edition") set in a corner
// clear of the text.

import { n, mix, escapeXml } from './core.js';
import { FONTS, fitText, drawText } from './text.js';
import { strongAccents, textColor } from './styles/util.js';

/** @typedef {import('./text.js').TextBox} TextBox */

/** How much of the square around a circle a box covers. @param {number} cx @param {number} cy @param {number} r @param {TextBox} b */
function overlap(cx, cy, r, b) {
  const w = Math.min(cx + r, b.x1) - Math.max(cx - r, b.x0);
  const h = Math.min(cy + r, b.y1) - Math.max(cy - r, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * The seal: a star-edged disc with a ring and the text inside, tilted a little, in the first
 * corner (then side) clear of the text, smaller if it must be; else where it covers least.
 * @param {import('./index.js').StyleContext} c
 * @param {string} text
 * @param {TextBox[]} boxes the text already on the cover
 */
export function drawBadge(c, text, boxes) {
  const { W, H, S, u, m, p } = c;
  /** Where a seal of radius r could go: corners first, then the middle of each side. @param {number} r */
  const spots = (r) => {
    const inset = m * 0.5 + r;
    return [
      [W - inset, inset],
      [inset, inset],
      [W - inset, H - inset],
      [inset, H - inset],
      [W - inset, H / 2],
      [inset, H / 2],
    ];
  };
  const pad = S * 0.01;
  /** @type {[number, number, number] | null} */
  let place = null;
  for (const scale of [1, 0.85, 0.7]) {
    const r = S * 0.12 * scale;
    const free = spots(r).find(([x, y]) => boxes.every((b) => overlap(x, y, r + pad, b) === 0));
    if (free) {
      place = [free[0], free[1], r];
      break;
    }
  }
  if (!place) {
    const r = S * 0.084;
    const covered = (/** @type {number[]} */ [x, y]) => boxes.reduce((sum, b) => sum + overlap(x, y, r, b), 0);
    const best = spots(r).reduce((a, b) => (covered(b) < covered(a) ? b : a));
    place = [best[0], best[1], r];
  }
  const [cx, cy, r] = place;

  const fill = strongAccents(p, p.bg, 1.5)[0];
  const ink = textColor(p, fill, [p.paper, p.night]);
  const points = [];
  const spikes = 28;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.9 : r;
    points.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`);
  }
  const fit = fitText(text, {
    font: FONTS.sans,
    weight: 700,
    upper: true,
    letterSpacing: 0.04,
    maxWidth: r * 1.25,
    maxHeight: r * 1.05,
    maxSize: r * 0.3,
    maxLines: 4,
    lineHeight: 1.05,
  });
  const edge = mix(fill, p.night, 0.35);
  return (
    `<g transform="rotate(-8 ${n(cx)} ${n(cy)})" aria-label="${escapeXml(text)}">` +
    `<polygon points="${points.join(' ')}" fill="${fill}" stroke="${edge}" stroke-width="${n(1.2 * u)}"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.76)}" fill="none" stroke="${ink}" stroke-width="${n(1.4 * u)}" opacity="0.7"/>` +
    drawText(fit, { x: cx, y: cy - fit.height / 2, anchor: 'middle', fill: ink }) +
    '</g>'
  );
}
