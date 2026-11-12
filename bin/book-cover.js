#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createCover, listStyles, palettes, formats } from '../src/index.js';

const HELP = `Usage: book-cover "<title>" ["<author>"] [options]

Options:
  -s, --style <id>      style id or "random" (default: random from seed)
  -p, --palette <id>    palette id or "random" (default: random from seed)
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
  book-cover "Salt and Static" "J. R. Okafor" --count 12 -o ideas/cover.svg`;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      style: { type: 'string', short: 's' },
      palette: { type: 'string', short: 'p' },
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

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

if (values.list) {
  console.log('Styles:');
  for (const s of listStyles()) {
    console.log(`  ${s.id.padEnd(14)} ${s.description}`);
    for (const v of s.variants) {
      console.log(`  ${''.padEnd(14)}   --variant ${v.name}=${v.values.map((x) => x.value).join('|')}`);
    }
  }
  console.log('\nPalettes:');
  for (const p of palettes) console.log(`  ${p.id.padEnd(14)} ${p.name}${p.dark ? ' (dark)' : ''}`);
  process.exit(0);
}

if (!positionals.length) {
  console.error(HELP);
  process.exit(1);
}
if (positionals.length > 2) {
  console.error(
    `Expected a title and an author, got ${positionals.length} arguments. Quote values with spaces: book-cover "The Lighthouse Keeper" "Mara Ellison"`,
  );
  process.exit(1);
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

try {
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
  process.exit(1);
}
