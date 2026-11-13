// The gallery's links keep the design you came with: the app's Gallery links carry it after the #,
// and each cover then shows your book, and opens it, in its style (your pins kept for your own
// style, left behind for another, as in the app). The header and footer links back to the app keep
// it too, and the place they go to: "#usage&title=…" opens the design at #usage (see site/app.js).
import { registerServiceWorker } from './offline.js';
import { LINK, lastValues } from '../src/link.js';

registerServiceWorker();

/** The design's link parameters each cover draws, and the attribute that is each (src/element.js). */
const DRAWN = {
  title: 'cover-title',
  author: 'author',
  subtitle: 'subtitle',
  series: 'series',
  credit: 'credit',
  badge: 'badge',
  palette: 'palette',
  seed: 'seed',
  font: 'font',
  case: 'case',
  lang: 'lang',
};

const design = new URLSearchParams(location.hash.slice(1));
/**
 * The design as the app reads it (src/link.js): the last of a repeated key, each value by the
 * app's rules, and one it would drop left out.
 * @type {Record<string, unknown>}
 */
const read = {};
for (const [key, value] of Object.entries(lastValues(design))) {
  const reader = /** @type {Record<string, (v: unknown) => unknown>} */ (LINK)[key];
  const got = reader?.(value);
  if (got !== undefined) read[key] = got;
}
if (typeof read.title === 'string') {
  for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('a[data-style]'))) {
    const q = new URLSearchParams(design);
    const style = link.dataset.style ?? '';
    const own = style === read.style;
    if (!own) q.delete('variant');
    q.set('style', style);
    link.href = `/#${q}`;
    // The cover shows what the link opens: your book, in this style.
    const cover = link.querySelector('book-cover');
    if (!cover) continue;
    for (const [key, attribute] of Object.entries(DRAWN)) {
      const value = read[key];
      if (typeof value === 'string' && value !== '') cover.setAttribute(attribute, value);
      else cover.removeAttribute(attribute);
    }
    if (own && typeof read.variant === 'string') cover.setAttribute('variant', read.variant);
    else cover.removeAttribute('variant');
    // (On, as a boolean attribute.)
    if (read.texture === true) cover.setAttribute('texture', '');
    else cover.removeAttribute('texture');
  }
  for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (
    document.querySelectorAll('.site-header a[href^="/"], .site-footer a[href^="/"], a[data-app]')
  )) {
    const { pathname, hash } = new URL(link.href);
    if (pathname === '/') link.href = hash.length > 1 ? `/${hash}&${design}` : `/#${design}`;
    else if (pathname === '/gallery/') link.href = `/gallery/#${design}`;
  }
}
