// The gallery page (/gallery/): every style, drawn by <book-cover> in the visitor's browser, each
// opening the app in that style. Written by scripts/build.js; the dev server answers it too.
import { readFileSync } from 'node:fs';
import { escapeXml as esc } from '../src/core.js';
import { listStyles, genres } from '../src/index.js';

/** A sample title for each genre, so a style is shown with a book it suits. */
const SAMPLES = {
  literary: ['The Lighthouse Keeper', 'A Novel'],
  thriller: ['Signal Lost', ''],
  horror: ['The Hollow Night', ''],
  romance: ['Love Letters', 'A Novel'],
  fantasy: ['Kingdom of Ash', 'Book One'],
  children: ['The Brave Little Fox', ''],
  nonfiction: ['The Habit Engine', 'How small changes compound'],
};

/**
 * The app's header and footer (index.html), for this page: one copy of the site's chrome. Its
 * in-page links point back to the app, and the Gallery link is this page.
 */
function chrome() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  /** @param {string} tag @param {string} cls */
  const part = (tag, cls) => {
    const start = html.indexOf(`<${tag} class="${cls}">`);
    const end = html.indexOf(`</${tag}>`, start);
    if (start < 0 || end < 0) throw new Error(`scripts/gallery.js: index.html has no <${tag} class="${cls}">`);
    return html.slice(start, end + tag.length + 3);
  };
  /** @param {string} markup */
  const forGallery = (markup) =>
    markup
      .replaceAll('href="./"', 'href="/"')
      .replace(/href="#/g, 'href="/#')
      .replace(/<a ([^>]*)id="nav-gallery"([^>]*)>/, '<a $1aria-current="page"$2>');
  // The app's module preloads of the library (the app's own scripts aside), so the covers' modules
  // come at once.
  const preloads = [...html.matchAll(/<link rel="modulepreload" href="(src\/[^"]+)"/g)]
    .map((m) => `    <link rel="modulepreload" href="/${m[1]}" />`)
    .join('\n');
  const header = forGallery(part('header', 'site-header'));
  // (Markup these depend on, changed in index.html: say so, rather than build a page without it.)
  if (!header.includes('aria-current="page"'))
    throw new Error('scripts/gallery.js: index.html has no #nav-gallery link');
  if (!preloads.includes('/src/index.js')) throw new Error('scripts/gallery.js: index.html preloads no src/ modules');
  return {
    header,
    footer: forGallery(part('footer', 'site-footer')),
    preloads,
  };
}

/** The gallery page's HTML. */
export function galleryHtml() {
  const { header, footer, preloads } = chrome();
  const styles = listStyles();
  const groups = [...new Set(styles.map((s) => s.group))];
  const genreName = Object.fromEntries(genres.map((g) => [g.id, g.name]));
  const sections = groups
    .map((group) => {
      const figures = styles
        .filter((s) => s.group === group)
        .map((s) => {
          const [title, subtitle] = SAMPLES[/** @type {keyof typeof SAMPLES} */ (s.genres[0])] ?? SAMPLES.literary;
          const link = new URLSearchParams({ title, author: 'Mara Ellison', subtitle, style: s.id, seed: 'gallery' });
          const suits = s.genres.map((g) => genreName[g] ?? g).join(', ');
          return `
        <figure class="gallery-item">
          <a href="/#${esc(link.toString())}" data-style="${esc(s.id)}" aria-label="${esc(`${s.name}: open it in the generator`)}">
            <book-cover loading="lazy" cover-title="${esc(title)}" author="Mara Ellison"${subtitle ? ` subtitle="${esc(subtitle)}"` : ''} cover-style="${esc(s.id)}" seed="gallery"></book-cover>
          </a>
          <figcaption><strong>${esc(s.name)}</strong> ${esc(s.description)}${suits ? ` <span class="gallery-genres">${esc(suits)}</span>` : ''}</figcaption>
        </figure>`;
        })
        .join('');
      return `
      <section class="gallery-group" aria-labelledby="g-${esc(group.toLowerCase())}">
        <h2 id="g-${esc(group.toLowerCase())}">${esc(group)}</h2>
        <div class="gallery-grid">${figures}
        </div>
      </section>`;
    })
    .join('');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gallery: ${styles.length} cover styles · Book Cover Generator</title>
    <meta name="description" content="Every style of the free Book Cover Generator: ${styles.length} looks for literary fiction, thrillers, horror, romance, fantasy, children's books and non-fiction. Click one to make your cover in it." />
    <meta name="color-scheme" content="light dark" />
    <link rel="canonical" href="https://covers.otsirh.dev/gallery/" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/site/style.css" />
    <link rel="modulepreload" href="/src/element.js" />
    <link rel="modulepreload" href="/site/offline.js" />
${preloads}
    <script type="module" src="/src/element.js"></script>
    <script type="module" src="/site/gallery.js"></script>
  </head>
  <body>
    ${header}
    <main class="gallery">
      <div class="section-head">
        <h1>${styles.length} cover styles</h1>
        <p>Each drawn here as you see it, for a book of the genre it suits. Click one to make your own cover in it.</p>
      </div>${sections}
    </main>
    ${footer}
  </body>
</html>
`;
}

/** The pages the build writes, by path (the dev server answers them too). */
export const PAGES = { '/gallery/': galleryHtml };
