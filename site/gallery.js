// The gallery's links keep the design you came with: the app's Gallery link carries it after the #,
// and each cover then opens your book in its style (your pins left behind, as for another style),
// the header and the logo your design as it was.
const design = new URLSearchParams(location.hash.slice(1));
if (design.has('title')) {
  for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('a[data-style]'))) {
    const q = new URLSearchParams(design);
    q.set('style', link.dataset.style ?? '');
    q.delete('variant');
    link.href = `/#${q}`;
  }
  for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (
    document.querySelectorAll('.site-header a.brand, .site-header a[href="/#styles"]')
  )) {
    link.href = `/#${design}`;
  }
}
