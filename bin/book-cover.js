#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createCover, listStyles, palettes } from '../src/index.js';

const HELP = `Usage: book-cover "<title>" ["<author>"] [options]

Options:
  -s, --style <id>      style id or "random" (default: random from seed)
  -p, --palette <id>    palette id or "random" (default: random from seed)
      --seed <value>    seed for the artwork (default: title + author)
      --width <px>      width  (default 600)
      --height <px>     height (default width * 1.5)
  -o, --out <file>      write SVG to a file instead of stdout
      --list            list styles and palettes
      --help            show this help

Examples:
  book-cover "The Lighthouse Keeper" "Mara Ellison" -s artdeco -o cover.svg
  book-cover "Neon Tide" "Kai Moreno" --style retro --palette synth --width 1600 --height 2560 > cover.svg`;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      style: { type: 'string', short: 's' },
      palette: { type: 'string', short: 'p' },
      seed: { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      out: { type: 'string', short: 'o' },
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
  for (const s of listStyles()) console.log(`  ${s.id.padEnd(14)} ${s.description}`);
  console.log('\nPalettes:');
  for (const p of palettes) console.log(`  ${p.id.padEnd(14)} ${p.name}${p.dark ? ' (dark)' : ''}`);
  process.exit(0);
}

if (!positionals.length) {
  console.error(HELP);
  process.exit(1);
}

try {
  const cover = createCover({
    title: positionals[0],
    author: positionals[1] ?? '',
    style: values.style,
    palette: values.palette,
    seed: values.seed,
    width: values.width ? Number(values.width) : undefined,
    height: values.height ? Number(values.height) : undefined,
  });
  if (values.out) {
    writeFileSync(values.out, cover.svg);
    console.error(
      `Wrote ${values.out} (style: ${cover.style}, palette: ${cover.palette}, ${cover.width}x${cover.height})`,
    );
  } else {
    process.stdout.write(cover.svg + '\n');
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
