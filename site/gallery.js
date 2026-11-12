// The gallery's links keep the design you came with: the app's Gallery links carry it after the #,
// and each cover then opens your book in its style (your pins kept for your own style, left behind
// for another, as in the app). The header and footer links back to the app keep it too, and the
// place they go to: "#usage&title=…" opens the design at #usage (see site/app.js).
import { registerServiceWorker } from './offline.js';

registerServiceWorker();

const design = new URLSearchParams(location.hash.slice(1));
if (design.has('title')) {
  for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('a[data-style]'))) {
    const q = new URLSearchParams(design);
    const style = link.dataset.style ?? '';
    if (style !== design.get('style')) q.delete('variant');
    q.set('style', style);
    link.href = `/#${q}`;
  }
  for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (
    document.querySelectorAll('.site-header a[href^="/"], .site-footer a[href^="/"]')
  )) {
    const { pathname, hash } = new URL(link.href);
    if (pathname === '/') link.href = hash.length > 1 ? `/${hash}&${design}` : `/#${design}`;
    else if (pathname === '/gallery/') link.href = `/gallery/#${design}`;
  }
}
