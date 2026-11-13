// The gallery page (/gallery/): every style, drawn by <book-cover> in the visitor's browser, each
// opening the app in that style. Written by scripts/build.js; the dev server answers it too.
import { readFileSync } from 'node:fs';
import { escapeXml as esc } from '../src/core.js';
import { familyName } from '../src/shared.js';
import { aboutHtml } from './about.js';
import { listStyles, genres } from '../src/index.js';

/** A book for each style, one it suits: its title, author and subtitle. */
const SAMPLES = {
  bigtype: ['Burn Rate', 'Dana Keller', ''],
  minimal: ['Quiet Hours', 'Mara Ellison', 'A Novel'],
  typographic: ['Wildwood', 'Ines Calder', ''],
  swiss: ['Form Follows', 'Lena Hart', 'Notes on design'],
  thriller: ['Signal Lost', 'R. M. Price', ''],
  botanical: ['The Glass Orchard', 'Theo Vance', 'A Novel'],
  noir: ['Rain on Fifth Street', 'Sam Whitlock', ''],
  blueprint: ['How Bridges Stand', 'Ada Lindqvist', 'The engineering of everyday things'],
  hollow: ['The Hollow Night', 'Edgar Vale', ''],
  ribbon: ['Love Letters from Lisbon', 'Clara Moss', 'A Novel'],
  crest: ['Kingdom of Ash', 'Elias Brandt', 'Book One'],
  storybook: ['The Brave Little Fox', 'Pip Hollins', ''],
  idea: ['The Habit Engine', 'Yuki Tanaka', 'How small changes compound'],
  artdeco: ['The Lighthouse Keeper', 'Margot Fairley', ''],
  classic: ['A Long Way from Harbour', 'J. R. Okafor', ''],
  engraved: ['The Last Cartographer', 'Henry Ashdown', ''],
  sunburst: ['Summer at the Pier', 'Rosa Bell', ''],
  typewriter: ['Found in a Drawer', 'Walter Quill', 'A Novel'],
  landscape: ['A Map of Quiet Places', 'Noor Haddad', ''],
  retro: ['Neon Tide', 'Kai Moreno', ''],
  silhouette: ['Hollow Season', 'Ruth Mercer', ''],
  constellation: ['Small Gods of Winter', 'Isla Reyes', ''],
  orbit: ['The Far Moons', 'Tomas Lind', 'Book One'],
  waves: ['Salt and Static', 'Maya Okoro', 'Stories'],
  aurora: ['Northern Light', 'Freya Dahl', ''],
  shelf: ['A Life in Books', 'Hugh Pemberton', 'Essays'],
  bauhaus: ['Bright Machines', 'Anna Weiss', ''],
  split: ['Double Blind', 'Cole Harmon', ''],
  blocks: ['The Colour Game', 'Bea Lumley', ''],
  concentric: ['The Spiral Year', 'Omar Sayed', ''],
  stripes: ['Fast Lanes', 'Jack Tierney', 'A history of speed'],
  papercut: ['Under Paper Skies', 'Lily Archer', ''],
  halftone: ['Pressure Point', 'Vic Santos', ''],
  topographic: ['High Ground', 'Ewan Price', 'Walking the old roads'],
  flowfield: ['Currents', 'Hana Mori', 'A Novel'],
  lowpoly: ['Shard', 'Petra Novak', ''],
  mosaic: ['The Tile Maker’s Daughter', 'Leila Haddad', ''],
  memphis: ['Wiggle’s Big Day', 'Molly Pepper', ''],
  pixel: ['Quest for the Pixel Crown', 'Max Byte', ''],
};
/** For a style without a book of its own: a book of its first genre. */
const BY_GENRE = {
  literary: ['The Lighthouse Keeper', 'Mara Ellison', 'A Novel'],
  thriller: ['Signal Lost', 'R. M. Price', ''],
  horror: ['The Hollow Night', 'Edgar Vale', ''],
  romance: ['Love Letters', 'Clara Moss', 'A Novel'],
  fantasy: ['Kingdom of Ash', 'Elias Brandt', 'Book One'],
  children: ['The Brave Little Fox', 'Pip Hollins', ''],
  nonfiction: ['The Habit Engine', 'Yuki Tanaka', 'How small changes compound'],
};

/**
 * The app's header and footer (index.html), for one of the site's pages: one copy of the site's
 * chrome. Its in-page links point back to the app, and the nav link `current` (its id) is this page.
 * @param {string} [current]
 */
export function chrome(current = 'nav-gallery') {
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
      .replace(new RegExp(`<a ([^>]*)id="${current}"([^>]*)>`), '<a $1aria-current="page"$2>');
  // The app's module preloads of the library (the app's own scripts aside), so the covers' modules
  // come at once.
  const preloads = [...html.matchAll(/<link rel="modulepreload" href="(src\/[^"]+)"/g)]
    .map((m) => `    <link rel="modulepreload" href="/${m[1]}" />`)
    .join('\n');
  const header = forGallery(part('header', 'site-header'));
  // (Markup these depend on, changed in index.html: say so, rather than build a page without it.)
  if (!header.includes('aria-current="page"'))
    throw new Error(`scripts/gallery.js: index.html has no #${current} link`);
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
  /** @param {string} group */
  const idOf = (group) => `g-${familyName(group).toLowerCase()}`;
  const sections = groups
    .map((group) => {
      const figures = styles
        .filter((s) => s.group === group)
        .map((s) => {
          const [title, author, subtitle] =
            SAMPLES[/** @type {keyof typeof SAMPLES} */ (s.id)] ??
            BY_GENRE[/** @type {keyof typeof BY_GENRE} */ (s.genres[0])] ??
            BY_GENRE.literary;
          const link = new URLSearchParams({ title, author, subtitle, style: s.id, seed: 'gallery' });
          const suits = s.genres.map((g) => genreName[g] ?? g).join(', ');
          return `
        <figure class="gallery-item">
          <a href="/#${esc(link.toString())}" data-style="${esc(s.id)}" aria-label="${esc(`${s.name}: open it in the generator`)}">
            <book-cover loading="lazy" cover-title="${esc(title)}" author="${esc(author)}"${subtitle ? ` subtitle="${esc(subtitle)}"` : ''} cover-style="${esc(s.id)}" seed="gallery"></book-cover>
          </a>
          <figcaption><strong>${esc(s.name)}</strong> ${esc(s.description)}${suits ? ` <span class="gallery-genres">${esc(suits)}</span>` : ''}</figcaption>
        </figure>`;
        })
        .join('');
      return `
      <section class="gallery-group" aria-labelledby="${esc(idOf(group))}">
        <h2 id="${esc(idOf(group))}">${esc(familyName(group))}</h2>
        <div class="gallery-grid">${figures}
        </div>
      </section>`;
    })
    .join('');
  // Jump links to each family: on a phone the page is long.
  const families = groups
    .map((group) => `<a href="#${esc(idOf(group))}">${esc(familyName(group))}</a>`)
    .join('\n          ');
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
        <p>Each drawn here as you see it, for a book it suits. Click one to make your own cover in it.</p>
      </div>
      <div class="gallery-actions">
        <a class="primary" href="/" data-app>Make a cover</a>
        <nav class="gallery-families" aria-label="Style families">
          ${families}
        </nav>
      </div>${sections}
    </main>
    ${footer}
  </body>
</html>
`;
}

/** The pages the build writes, by path (the dev server answers them too). */
export const PAGES = { '/gallery/': galleryHtml, '/about/': () => aboutHtml(chrome('nav-about')) };
