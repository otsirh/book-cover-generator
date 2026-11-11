// Renders a grid of covers. Query parameters (all optional, comma-separated lists):
//   styles, palettes, seeds, titles, title, author, subtitle, w, h, cols, texture=1
import { createCover, styles } from '../src/index.js';
import { svgToDataUrl } from '../src/browser.js';

const q = new URLSearchParams(location.search);
/** @param {string} key @param {string[]} fallback */
const list = (key, fallback) => (q.get(key) ? String(q.get(key)).split(',') : fallback);
const grid = /** @type {HTMLElement} */ (document.getElementById('grid'));
grid.style.setProperty('--cols', q.get('cols') || '6');
const author = q.get('author') ?? 'Mara Ellison';
const subtitle = q.get('subtitle') ?? '';
const width = Number(q.get('w') || 600);
const height = Number(q.get('h') || 900);
for (const style of list('styles', styles)) {
  for (const palette of list('palettes', ['random'])) {
    for (const seed of list('seeds', ['a1'])) {
      for (const title of list('titles', [q.get('title') || 'The Lighthouse Keeper'])) {
        const c = createCover({
          title,
          author,
          subtitle,
          style,
          palette,
          seed,
          width,
          height,
          texture: q.get('texture') === '1',
        });
        const fig = document.createElement('figure');
        const img = new Image();
        img.src = svgToDataUrl(c.svg);
        const cap = document.createElement('figcaption');
        cap.textContent = `${c.style} · ${c.palette} · ${c.seed}`;
        fig.append(img, cap);
        grid.append(fig);
      }
    }
  }
}
