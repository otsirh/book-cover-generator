// The gallery page (/gallery/): every style, drawn by <book-cover> in the visitor's browser, each
// opening the app in that style. Written by scripts/build.js; the dev server answers it too.
import { escapeXml } from '../src/core.js';
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

/** @param {string} text */
const esc = (text) => escapeXml(text);

/** The gallery page's HTML. */
export function galleryHtml() {
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
          <a href="/#${esc(link.toString())}" aria-label="${esc(`${s.name}: open it in the generator`)}">
            <book-cover cover-title="${esc(title)}" author="Mara Ellison"${subtitle ? ` subtitle="${esc(subtitle)}"` : ''} cover-style="${esc(s.id)}" seed="gallery"></book-cover>
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
    <script type="module" src="/src/element.js"></script>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect x="6" y="3" width="20" height="26" rx="2" fill="currentColor" />
          <rect x="6" y="3" width="4" height="26" fill="#000" opacity=".3" />
          <rect x="13" y="9" width="9" height="2" fill="#fff" />
        </svg>
        <span>Book Cover Generator</span>
      </a>
      <nav aria-label="Main">
        <a href="/">Generator</a>
        <a href="/gallery/" aria-current="page">Gallery</a>
        <a href="https://github.com/otsirh/book-cover-generator">GitHub</a>
      </nav>
    </header>
    <main class="gallery">
      <div class="section-head">
        <h1>${styles.length} cover styles</h1>
        <p>Each drawn here as you see it, for a book of the genre it suits. Click one to make your own cover in it.</p>
      </div>${sections}
    </main>
    <footer class="site-footer">
      <p>
        MIT licensed · <a href="https://github.com/otsirh/book-cover-generator">Source on GitHub</a> ·
        <a href="https://github.com/otsirh/book-cover-generator/blob/main/CHANGELOG.md">Changelog</a>
      </p>
    </footer>
  </body>
</html>
`;
}
