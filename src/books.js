// A list of books, as people paste or export it, read into cover options: CSV or TSV with a
// header row, JSON lines, or one book per line ("Title | Author | Subtitle").

/** The columns a list may have, by the names it may give them, and how each is read. */
const COLUMNS = /** @type {const} */ ({
  title: 'title',
  author: 'author',
  subtitle: 'subtitle',
  series: 'series',
  credit: 'credit',
  badge: 'badge',
  style: 'style',
  palette: 'palette',
  seed: 'seed',
  font: 'font',
  case: 'titleCase',
  titlecase: 'titleCase',
  lang: 'lang',
  width: 'width',
  height: 'height',
  texture: 'texture',
});

/** Separators of a plain line: a tab, or a bar or dash with spaces around it. */
const LINE_SEPARATOR = /\t| \| | — | – /;

/**
 * Split CSV (or TSV) text into rows of fields: quoted fields may hold the delimiter, quotes ("")
 * and line breaks.
 * @param {string} text @param {string} delimiter
 * @returns {string[][]}
 */
function csvRows(text, delimiter) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

/**
 * Cover options from a row's named values: known columns only, trimmed, empty ones left out,
 * numbers and switches read as such.
 * @param {Record<string, unknown>} named
 * @returns {import('./index.js').CoverOptions}
 */
function optionsFrom(named) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, raw] of Object.entries(named)) {
    const option = COLUMNS[/** @type {keyof typeof COLUMNS} */ (key.trim().toLowerCase())];
    if (!option || raw == null) continue;
    if (option === 'texture') {
      const v = String(raw).trim().toLowerCase();
      if (v) out.texture = raw === true || ['1', 'true', 'yes', 'y', 'on'].includes(v);
      continue;
    }
    // (Numbers stay numbers for sizes and the seed; any other column is text, a title of 1984 too.)
    const value = typeof raw === 'number' && option !== 'title' ? raw : String(raw).trim();
    if (value === '') continue;
    if (option === 'width' || option === 'height') out[option] = Number(value);
    else out[option] = option === 'seed' ? value : String(value);
  }
  return /** @type {import('./index.js').CoverOptions} */ (out);
}

/**
 * Read a list of books into cover options, one per book (rows without a title are left out):
 *
 * - CSV or TSV whose first row names its columns (`title`, `author`, `subtitle`, `series`,
 *   `credit`, `badge`, `style`, `palette`, `seed`, `font`, `case`, `lang`, `width`, `height`,
 *   `texture`; others are ignored);
 * - JSON lines, one object per book, with the same names;
 * - else one book per line: "Title | Author | Subtitle" (a tab, or " — " or " – ", also separates).
 *
 * @param {string} text
 * @returns {import('./index.js').CoverOptions[]}
 */
export function parseBookList(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  // (Each with its line number in the text, for errors.)
  const lines = src
    .split(/\r\n|[\r\n]/)
    .map((line, i) => ({ line, number: i + 1 }))
    .filter(({ line }) => line.trim());
  if (!lines.length) return [];
  /** @type {import('./index.js').CoverOptions[]} */
  let books;
  if (lines.every(({ line }) => line.trim().startsWith('{'))) {
    books = lines.map(({ line, number }) => {
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        throw new SyntaxError(`Line ${number} is not valid JSON`);
      }
      return value && typeof value === 'object' ? optionsFrom(value) : {};
    });
  } else {
    // A header row names a "title" column, separated by tabs, commas or semicolons (as
    // spreadsheets in many countries save CSV).
    const first = lines[0].line;
    const delimiter = ['\t', ',', ';'].find((d) =>
      (csvRows(first, d)[0] ?? []).some((name) => name.trim().toLowerCase() === 'title'),
    );
    if (delimiter) {
      const [names, ...rows] = csvRows(src, delimiter);
      books = rows.map((row) => optionsFrom(Object.fromEntries(names.map((name, i) => [name, row[i] ?? '']))));
    } else {
      books = lines.map(({ line }) => {
        const [title, author, subtitle] = line.split(LINE_SEPARATOR);
        return optionsFrom({ title, author, subtitle });
      });
    }
  }
  return books.filter((book) => typeof book.title === 'string' && book.title.trim());
}
