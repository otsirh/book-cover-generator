#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createCover, listStyles, palettes, formats, parseBookList, optionsForBook, genres } from '../src/index.js';
import { clipGraphemes } from '../src/text.js';

const HELP = `Usage: book-cover "<title>" ["<author>"] [options]

Options:
  -s, --style <id>      style id or "random" (default: random from seed)
  -p, --palette <id>    palette id or "random" (default: random from seed)
      --genre <id>      with a random style, one that suits this genre:
                        literary, thriller, horror, romance, fantasy, children
                        or nonfiction
      --bg <hex>        your own colours instead of a palette: background,
      --ink <hex>       text,
      --accent <hex>    and accents (repeat it, or separate them with commas)
      --variant <n=v>   pin one of the style's choices, e.g. scene=forest
                        (repeat it; --list shows each style's)
      --font <name>     the title's font: serif, didone, garamond, sans,
                        geometric, humanist, condensed, display or mono
      --case <how>      the title in capitals (upper) or as typed (normal)
      --subtitle <text> a subtitle or tagline
      --series <text>   a series line above the title ("Book Two of …")
      --credit <text>   a credit under the subtitle ("Translated by …")
      --badge <text>    a seal in a corner clear of the text ("Bestseller")
      --texture         add a fine film-grain texture
      --seed <value>    seed for the artwork (default: title + author)
      --format <shape>  paperback (2:3, the default), ebook (5:8) or square
      --width <px>      width  (default 600)
      --height <px>     height (default: from the format)
      --size <WxH>      width and height at once, e.g. 1600x2560
      --lang <tag>      language of the text, e.g. ja or zh-Hant (default: inferred)
      --batch <file>    a cover for each book in a list (- reads stdin): CSV or
                        TSV with a header row (title, author, subtitle, series,
                        credit, badge, style, genre, palette, seed, font, case, lang,
                        width, height, texture), JSON lines, or one book per
                        line as "Title | Author | Subtitle"; the other options
                        apply to every book the list doesn't say otherwise for
      --out-dir <dir>   where --batch writes its covers (default: here)
  -o, --out <file>      write SVG to a file instead of stdout
      --count <n>       write n variations (seeds 1…n, or <seed>-1…), named
                        cover-1.svg… from --out (or put {n} or {seed} in it)
      --json            print the choices (and the SVG, without --out) as JSON,
                        one line per cover
      --list            list styles and palettes
      --help            show this help

Examples:
  book-cover "The Lighthouse Keeper" "Mara Ellison" -s artdeco -o cover.svg
  book-cover "Neon Tide" "Kai Moreno" --style retro --palette synth --size 1600x2560 > cover.svg
  book-cover "Bright Machines" --bg 0b132b --ink f8f9fa --accent ff6b6b,4ecdc4 --format ebook -o cover.svg
  book-cover "Salt and Static" "J. R. Okafor" --count 12 -o ideas/cover.svg
  book-cover --batch books.csv --style minimal --seed series --out-dir covers`;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      style: { type: 'string', short: 's' },
      palette: { type: 'string', short: 'p' },
      genre: { type: 'string' },
      bg: { type: 'string' },
      ink: { type: 'string' },
      accent: { type: 'string', multiple: true },
      variant: { type: 'string', multiple: true },
      font: { type: 'string' },
      case: { type: 'string' },
      subtitle: { type: 'string' },
      series: { type: 'string' },
      credit: { type: 'string' },
      badge: { type: 'string' },
      texture: { type: 'boolean' },
      seed: { type: 'string' },
      format: { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      size: { type: 'string' },
      lang: { type: 'string' },
      out: { type: 'string', short: 'o' },
      batch: { type: 'string' },
      'out-dir': { type: 'string' },
      count: { type: 'string' },
      json: { type: 'boolean' },
      list: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
} catch (err) {
  console.error((err instanceof Error ? err.message : String(err)) + '\n\n' + HELP);
  process.exit(1);
}

const { values, positionals } = args;

/**
 * Help, the list, and checks of the arguments: whether to go on and make covers. (Exit codes are
 * set, not exited with, so output piped elsewhere is written in full first.)
 */
function preflight() {
  if (values.help) {
    console.log(HELP);
    return false;
  }
  if (values.list) {
    console.log('Styles:');
    for (const s of listStyles()) {
      console.log(`  ${s.id.padEnd(14)} ${s.description}`);
      if (s.genres.length) console.log(`  ${''.padEnd(14)}   genres: ${s.genres.join(', ')}`);
      for (const v of s.variants) {
        console.log(`  ${''.padEnd(14)}   --variant ${v.name}=${v.values.map((x) => x.value).join('|')}`);
      }
    }
    console.log('\nGenres (--genre):');
    for (const g of genres) console.log(`  ${g.id.padEnd(14)} ${g.name}`);
    console.log('\nPalettes:');
    for (const p of palettes) console.log(`  ${p.id.padEnd(14)} ${p.name}${p.dark ? ' (dark)' : ''}`);
    return false;
  }
  /** @param {string} message */
  const fail = (message) => {
    console.error(message);
    process.exitCode = 1;
    return false;
  };
  if (values.batch !== undefined && positionals.length) {
    return fail('--batch takes the titles from its list: give no title on the command line');
  }
  if (!positionals.length && values.batch === undefined) return fail(HELP);
  if (positionals.length > 2) {
    return fail(
      `Expected a title and an author, got ${positionals.length} arguments. Quote values with spaces: book-cover "The Lighthouse Keeper" "Mara Ellison"`,
    );
  }
  return true;
}

/**
 * A --width/--height value as a number, reporting what was typed if it isn't one.
 * @param {string | undefined} value @param {string} name
 */
function size(value, name) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number)) throw new RangeError(`--${name} must be a number, got "${value}"`);
  return number;
}

/**
 * Width and height from --format, --width, --height and --size.
 * @returns {{ width?: number, height?: number }}
 */
function dimensions() {
  if (values.size !== undefined) {
    if (values.width !== undefined || values.height !== undefined || values.format !== undefined) {
      throw new Error('--size sets the width and height: use it without --width, --height or --format');
    }
    const m = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(values.size);
    if (!m) throw new RangeError(`--size must look like 1600x2560, got "${values.size}"`);
    return { width: Number(m[1]), height: Number(m[2]) };
  }
  const width = size(values.width, 'width');
  const height = size(values.height, 'height');
  if (values.format === undefined) return { width, height };
  if (!Object.hasOwn(formats, values.format)) {
    throw new Error(`Unknown format "${values.format}". Available: ${Object.keys(formats).join(', ')}`);
  }
  if (height !== undefined) throw new Error('--format sets the height from the width: use --size for both');
  // The shape of the app's format, at the width asked for.
  const [w, h] = formats[/** @type {keyof typeof formats} */ (values.format)];
  const W = width ?? 600;
  return { width: W, height: Math.round((W * h) / w) };
}

/** A colour as typed, with the # added (it starts a comment in most shells). @param {string} c */
const hex = (c) => (c.trim().startsWith('#') ? c.trim() : `#${c.trim()}`);

/** The palette: an id, or your own colours from --bg, --ink and --accent. */
function palette() {
  const custom = values.bg !== undefined || values.ink !== undefined || values.accent !== undefined;
  if (!custom) return values.palette;
  if (values.palette !== undefined)
    throw new Error('Use --palette or your own colours (--bg, --ink, --accent), not both');
  const accents = (values.accent ?? []).flatMap((a) => a.split(',')).filter((a) => a.trim());
  if (values.bg === undefined || values.ink === undefined || !accents.length) {
    throw new Error('Your own colours need --bg, --ink and at least one --accent');
  }
  return { bg: hex(values.bg), ink: hex(values.ink), accents: accents.map(hex) };
}

// A reader that stops early (book-cover … | head) closes the pipe: that's fine, not a crash.
process.stdout.on('error', (err) => {
  if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EPIPE') process.exit(0);
  throw err;
});

/** The pinned variants from --variant name=value. */
function variants() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const pair of values.variant ?? []) {
    const m = /^\s*([^=\s]+)\s*=\s*(\S+)\s*$/.exec(pair);
    if (!m) throw new RangeError(`--variant must look like scene=forest, got "${pair}"`);
    out[m[1]] = m[2];
  }
  return out;
}

/** How many covers to write: --count, 1 by default. */
function count() {
  if (values.count === undefined) return 1;
  const n = Number(values.count);
  if (!/^\s*\d+\s*$/.test(values.count) || n < 1 || n > 1000) {
    throw new RangeError(`--count must be a whole number from 1 to 1000, got "${values.count}"`);
  }
  if (n > 1 && !values.out) throw new Error('--count writes files: give --out, e.g. -o covers/cover.svg');
  return n;
}

/**
 * The file for cover `n` of `total`: --out with {n} and {seed} filled in, or (for several
 * covers) with "-n" before the extension.
 * @param {string} out @param {number} n @param {number} total @param {string} seed
 */
function fileFor(out, n, total, seed) {
  if (/\{n\}|\{seed\}/.test(out)) return out.replaceAll('{n}', String(n)).replaceAll('{seed}', safeName(seed));
  if (total === 1) return out;
  const dot = out.lastIndexOf('.');
  const slash = Math.max(out.lastIndexOf('/'), out.lastIndexOf('\\'));
  return dot > slash + 1 ? `${out.slice(0, dot)}-${n}${out.slice(dot)}` : `${out}-${n}`;
}

/**
 * A seed as part of a file name: letters, digits, dots, dashes and underscores only (so a seed
 * can't add folders, leave the folder or break names on Windows), never starting with a dot.
 * @param {string} seed
 */
const safeName = (seed) => seed.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[.-]+/, '') || 'cover';

/** A title as part of a file name: lower case, accents off Latin letters, dashes between words. @param {string} title */
function slug(title) {
  const words = title
    .normalize('NFKD')
    .replace(/(\p{Script=Latin})[\u0300-\u036f]+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+/, '');
  // (Cut between whole characters, as the app cuts its file names.)
  return clipGraphemes(words, 60).replace(/-+$/, '') || 'cover';
}

/**
 * Write a cover for each book in the --batch list into --out-dir; the command line's options
 * apply to every book the list doesn't say otherwise for.
 * @param {import('../src/index.js').CoverOptions} defaults
 */
function batch(defaults) {
  if (values.count !== undefined || values.out !== undefined) {
    throw new Error('--batch writes a file per book into --out-dir: use it without --out or --count');
  }
  const source = /** @type {string} */ (values.batch);
  const books = parseBookList(readFileSync(source === '-' ? 0 : source, 'utf8'));
  if (!books.length) {
    throw new Error(
      `No books in ${source === '-' ? 'the input' : source}: a title per line, or a CSV with a "title" column`,
    );
  }
  const dir = values['out-dir'] ?? '.';
  mkdirSync(dir, { recursive: true });
  const digits = String(books.length).length;
  let failed = 0;
  books.forEach((book, i) => {
    const n = i + 1;
    try {
      // (The book's own values win, a size in the list replaces the command line's, and a genre
      // --style doesn't suit picks a style that does: see optionsForBook.)
      const cover = createCover({ ...optionsForBook(book, defaults), seed: book.seed ?? values.seed });
      const file = join(dir, `${String(n).padStart(digits, '0')}-${slug(cover.title)}.svg`);
      writeFileSync(file, cover.svg);
      const { style, palette: paletteId, seed, width, height } = cover;
      if (values.json)
        process.stdout.write(JSON.stringify({ file, style, palette: paletteId, seed, width, height }) + '\n');
    } catch (err) {
      failed += 1;
      console.error(`Book ${n} ("${book.title}"): ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  console.error(`Wrote ${books.length - failed} of ${books.length} covers to ${dir}`);
  if (failed) process.exitCode = 1;
}

function run() {
  try {
    if (values.batch !== undefined) {
      batch({
        subtitle: values.subtitle,
        series: values.series,
        credit: values.credit,
        badge: values.badge,
        texture: values.texture,
        style: values.style,
        genre: values.genre,
        palette: palette(),
        lang: values.lang,
        variants: variants(),
        font: values.font,
        titleCase: /** @type {'upper' | 'normal' | undefined} */ (values.case),
        ...dimensions(),
      });
      return;
    }
    const total = count();
    const options = {
      title: positionals[0],
      author: positionals[1] ?? '',
      subtitle: values.subtitle,
      series: values.series,
      credit: values.credit,
      badge: values.badge,
      texture: values.texture,
      style: values.style,
      genre: values.genre,
      palette: palette(),
      lang: values.lang,
      variants: variants(),
      font: values.font,
      titleCase: /** @type {'upper' | 'normal' | undefined} */ (values.case),
      ...dimensions(),
    };
    for (let n = 1; n <= total; n++) {
      // One cover: the seed given (or the title's). Several: seeds 1…n, or <seed>-1…<seed>-n.
      const seed = total === 1 ? values.seed : values.seed ? `${values.seed}-${n}` : String(n);
      const cover = createCover({ ...options, seed });
      const { style, palette: paletteId, width, height, lang } = cover;
      const choices = { style, palette: paletteId, seed: cover.seed, width, height, lang, variants: cover.variants };
      if (values.out) {
        const file = fileFor(values.out, n, total, cover.seed);
        writeFileSync(file, cover.svg);
        if (values.json) process.stdout.write(JSON.stringify({ file, ...choices }) + '\n');
        else console.error(`Wrote ${file} (style: ${style}, palette: ${paletteId}, ${width}x${height})`);
      } else if (values.json) {
        process.stdout.write(JSON.stringify({ ...choices, svg: cover.svg }) + '\n');
      } else {
        process.stdout.write(cover.svg + '\n');
      }
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

if (preflight()) run();
