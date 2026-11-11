// Draws the social preview (the page itself) and renders the app icons to PNG data URLs.
import { createCover } from '../src/index.js';

/** @type {[title: string, author: string, style: string, palette: string, seed: string, x: number, y: number, rotate: number][]} */
const covers = [
  ['Neon Tide', 'Kai Moreno', 'retro', 'synth', 's2', 30, 150, -8],
  ['The Lighthouse Keeper', 'Mara Ellison', 'artdeco', 'midnight', 's1', 190, 95, -2],
  ['Bright Machines', 'Yuki Tanaka', 'bauhaus', 'bauhaus', 's5', 350, 140, 4],
  ['Small Gods of Winter', 'Ines Calder', 'constellation', 'deepsea', 's4', 500, 200, 9],
];
const loads = covers.map(([title, author, style, palette, seed, x, y, rot], i) => {
  const img = new Image();
  img.src =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(createCover({ title, author, style, palette, seed }).svg);
  Object.assign(img.style, { left: `${x}px`, top: `${y}px`, transform: `rotate(${rot}deg)`, zIndex: String(i) });
  document.getElementById('covers')?.append(img);
  return img.decode();
});

/** @param {number} scale */
const book = (scale) =>
  `<g transform="translate(${16 - 16 * scale} ${16 - 16 * scale}) scale(${scale})">` +
  '<rect x="6" y="3" width="20" height="26" rx="2" fill="#c2410c"/><rect x="6" y="3" width="4" height="26" fill="#7c2d12"/>' +
  '<rect x="13" y="9" width="9" height="2" rx=".5" fill="#fff"/><rect x="13" y="13" width="6" height="1.4" rx=".5" fill="#fed7aa"/></g>';
/** @param {number} rx @param {number} scale */
const icon = (rx, scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="${rx}" fill="#f5f2ec"/>${book(scale)}</svg>`;

/** @type {Record<string, [number, string]>} */
const ICONS = {
  'icon-192.png': [192, icon(7, 0.78)],
  'icon-512.png': [512, icon(7, 0.78)],
  'icon-maskable-512.png': [512, icon(0, 0.6)], // book stays inside the 80% safe zone
  'apple-touch-icon.png': [180, icon(0, 0.72)],
};

/** @type {Record<string, string>} */
const pngs = {};
for (const [name, [size, markup]] of Object.entries(ICONS)) {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')?.drawImage(img, 0, 0, size, size);
  pngs[name] = canvas.toDataURL('image/png');
}
await Promise.all(loads);
Object.assign(window, { __assets: pngs });
