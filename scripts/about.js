// The about page (/about/): what people ask before they put a cover on a book they sell (may I,
// what leaves my browser, why it looks different elsewhere) and how to upload the files to Amazon
// KDP. Written by scripts/build.js through PAGES (scripts/gallery.js); the dev server answers it too.
import { listStyles, palettes, version } from '../src/index.js';

/** One question and its answer (HTML: the answers are written here, not typed by anyone). */
const QUESTIONS = [
  {
    id: 'use',
    q: 'May I use the covers I make here?',
    a: `<p>Yes. The covers you make are yours to use for anything: a book you sell on Amazon or anywhere else, an ebook, a print run, ads and posts. You don't need to ask, pay or credit anyone. (The generator's code is <a href="https://github.com/otsirh/book-cover-generator/blob/main/LICENSE">MIT licensed</a>; the covers it draws are your work, made from your words and your choices.)</p>
      <p>The text is yours to answer for: a title, a name or a quote that belongs to someone else stays theirs.</p>`,
  },
  {
    id: 'privacy',
    q: 'Is anything I type sent anywhere?',
    a: `<p>No. The app draws every cover in your browser. There are no accounts, no cookies and no analytics; designs you keep stay in your browser's storage on this device.</p>
      <p>A design leaves your device only when you send it: a link you copy holds the design (anyone with the link sees it), and an image link or <a href="https://github.com/otsirh/book-cover-generator#http-api">the HTTP API</a> asks this site to draw it, which it does without keeping it.</p>`,
  },
  {
    id: 'fonts',
    q: 'Which fonts do the covers use, and why does a cover look different on another computer?',
    a: `<p>Covers are set in the fonts already on your device (Georgia, Helvetica, Futura, Didot, Impact and others, each with close matches on Windows, Android and Linux), so nothing has to load and the app works offline. A device with other fonts draws the same design a little differently.</p>
      <p>A PNG, JPEG or PDF you download keeps the cover exactly as you saw it: use one of those for your book. An SVG is drawn by whatever opens it, with that device's fonts. PNGs from the HTTP API are drawn with open fonts (SIL Open Font License), which you may use in any image.</p>`,
  },
  {
    id: 'links',
    q: 'Why does a link I saved draw a slightly different cover now?',
    a: `<p>Styles get better in new versions (a title fits better, a colour reads more clearly), and a link draws with the version on the site today. The file you downloaded never changes, so keep it with your book's files.</p>`,
  },
  {
    id: 'ebook',
    q: 'How do I upload an ebook cover to Amazon KDP?',
    a: `<ol>
        <li>Set <strong>Format</strong> to <strong>eBook (5:8)</strong>, or a size of your own such as 1600 × 2560 (KDP's ideal).</li>
        <li>Click <strong>Download JPEG</strong>. KDP takes JPEG (or TIFF) for ebook covers, not PNG.</li>
        <li>In KDP, open your book's <strong>Kindle eBook Content</strong>, choose <strong>Upload a cover you already have</strong> under Kindle eBook Cover, and pick the file.</li>
      </ol>`,
  },
  {
    id: 'paperback',
    q: 'How do I upload a paperback cover to Amazon KDP?',
    a: `<ol>
        <li>Open <strong>Paperback for print</strong> and set the trim size, page count and paper exactly as in KDP's Paperback Content: the spine's width comes from them.</li>
        <li>Write the back cover's text, then click <strong>Download print PDF</strong>. The PDF is the back, the spine and the front in one, with bleed, at 300 dpi.</li>
        <li>In KDP's <strong>Paperback Content</strong>, choose <strong>Upload a cover you already have (print-ready PDF only)</strong> and pick the file. Leave the barcode's box, at the bottom right of the back, clear: KDP prints its barcode there.</li>
        <li>Check KDP's previewer before you publish. If you change the page count later, download the PDF again: the spine changes with it.</li>
      </ol>`,
  },
  {
    id: 'help',
    q: 'Something is wrong, or I have an idea',
    a: `<p>Ask or share in <a href="https://github.com/otsirh/book-cover-generator/discussions">Discussions</a>, report a bug in <a href="https://github.com/otsirh/book-cover-generator/issues/new/choose">issues</a>, and report a security problem <a href="https://github.com/otsirh/book-cover-generator/security/advisories/new">privately</a>.</p>`,
  },
];

/**
 * The about page's HTML, in the site's header and footer.
 * @param {{ header: string, footer: string }} chrome
 */
export function aboutHtml({ header, footer }) {
  const items = QUESTIONS.map(
    ({ id, q, a }) => `
        <section class="about-item" id="${id}" aria-labelledby="${id}-q">
          <h2 id="${id}-q">${q}</h2>
          ${a}
        </section>`,
  ).join('');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>About: using your covers · Book Cover Generator</title>
    <meta name="description" content="May I use the covers? Yes, for anything, with no credit needed. What stays private, which fonts covers use, and how to upload ebook and paperback covers to Amazon KDP." />
    <meta name="color-scheme" content="light dark" />
    <link rel="canonical" href="https://covers.otsirh.dev/about/" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/site/style.css" />
    <script type="module" src="/site/page.js"></script>
  </head>
  <body>
    ${header}
    <main class="about">
      <div class="section-head">
        <h1>Using your covers</h1>
        <p>A free generator of ${listStyles().length} styles and ${palettes.length} palettes, version ${version}. What people ask before they put a cover on a book.</p>
      </div>${items}
    </main>
    ${footer}
  </body>
</html>
`;
}
