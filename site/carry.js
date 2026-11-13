// The site's pages keep the design you came with: the app's links to them carry it after the #,
// and their links back to the app (and to each other) carry it on, so leaving one never loses it.
// "#usage&title=…" opens the design at #usage (see site/app.js).

/**
 * Carry a design (a link's query, from this page's #) on the page's links to the site's other
 * pages: the header's, the footer's, and any marked data-app.
 * @param {URLSearchParams} design
 */
export function carryDesign(design) {
  if (!design.has('title')) return;
  for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (
    document.querySelectorAll('.site-header a[href^="/"], .site-footer a[href^="/"], a[data-app]')
  )) {
    const { pathname, hash } = new URL(link.href);
    if (pathname === '/') link.href = hash.length > 1 ? `/${hash}&${design}` : `/#${design}`;
    else if (pathname === '/gallery/' || pathname === '/about/') link.href = `${pathname}#${design}`;
  }
}
