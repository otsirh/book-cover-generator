// The gallery's links keep the design you came with: the app's Gallery links carry it after the #,
// and each cover then shows your book, and opens it, in its style (your pins kept for your own
// style, left behind for another, as in the app). The header and footer links back to the app keep
// it too, and the place they go to: "#usage&title=…" opens the design at #usage (see site/app.js).
import { registerServiceWorker } from './offline.js';
import { carryDesign } from './carry.js';
import { lastValues, readDesign, pinsOf, variantOf, wholeDesign } from '../src/link.js';
import { COVER_ATTRIBUTES } from '../src/shared.js';
import { listStyles } from '../src/index.js';

registerServiceWorker();

/** The design's link parameters each cover draws, and the attribute that is each (src/element.js). */
const DRAWN = Object.fromEntries(
  Object.entries(COVER_ATTRIBUTES)
    // (Each tile has its own style, and pins only for your own style: set below.)
    .filter(([attribute]) => attribute !== 'cover-style' && attribute !== 'variant')
    .map(([attribute, key]) => [key, attribute]),
);

const design = new URLSearchParams(location.hash.slice(1));
/** The design as the app reads it (src/link.js): the last of a repeated key, each by the app's rules. */
const read = readDesign(lastValues(design));
/** …and as a whole design, its style the one the app opens it in. */
const whole = wholeDesign(read);
/** Each style's variants, for the pins it can take. */
const offered = new Map(listStyles().map((s) => [s.id, s.variants]));
if (typeof read.title === 'string') {
  for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('a[data-style]'))) {
    const q = new URLSearchParams(design);
    const style = link.dataset.style ?? '';
    // (Your style as the app opens your design: one the link leaves out is the seed's.)
    const own = style === whole.style;
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
    // (Your pins for your own style, those it can take, as the app draws them.)
    const pins =
      own && typeof read.variant === 'string' ? variantOf(pinsOf(read.variant, offered.get(style) ?? [])) : '';
    if (pins) cover.setAttribute('variant', pins);
    else cover.removeAttribute('variant');
    // (On, as a boolean attribute.)
    if (read.texture === true) cover.setAttribute('texture', '');
    else cover.removeAttribute('texture');
  }
}
carryDesign(design);

// The family links scroll to their family, keeping your design in the address (a #g-scenic would
// take its place, and a reload or a shared link would lose it).
for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('.gallery-families a'))) {
  link.addEventListener('click', (e) => {
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target.querySelector('a')?.focus({ preventScroll: true });
  });
}
