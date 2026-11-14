import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../bin/book-cover.js', import.meta.url));

/** @param {string[]} args */
async function cli(...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = /** @type {{ code: number, stdout: string, stderr: string }} */ (err);
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

test('prints an SVG to stdout', async () => {
  const { code, stdout } = await cli('The Lighthouse Keeper', 'Mara Ellison', '--style', 'artdeco', '--seed', 'x');
  assert.equal(code, 0);
  assert.match(stdout, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="900"[\s\S]*<\/svg>\n$/);
  assert.match(stdout, /<title>The Lighthouse Keeper by Mara Ellison<\/title>/);
});

test('writes to a file with --out and reports the choices', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-'));
  try {
    const out = join(dir, 'cover.svg');
    const { code, stderr } = await cli(
      'Neon Tide',
      '-s',
      'retro',
      '-p',
      'synth',
      '--width',
      '1600',
      '--height',
      '2560',
      '-o',
      out,
    );
    assert.equal(code, 0);
    assert.match(stderr, /style: retro, palette: synth, 1600x2560/);
    assert.match(await readFile(out, 'utf8'), /^<svg[^>]*width="1600" height="2560"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--list and --help', async () => {
  const list = await cli('--list');
  assert.equal(list.code, 0);
  assert.match(list.stdout, /Styles:[\s\S]*artdeco[\s\S]*Palettes:[\s\S]*midnight/);
  const help = await cli('--help');
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage: book-cover/);
});

test('fails clearly on bad input', async () => {
  for (const args of [
    [],
    ['T', '--width', 'abc'],
    ['T', '--style', 'nope'],
    ['T', '--bogus'],
    ['The', 'Lighthouse', 'Keeper'],
  ]) {
    const { code, stdout, stderr } = await cli(...args);
    assert.equal(code, 1, `exit code for ${args.join(' ')}`);
    assert.equal(stdout, '');
    assert.ok(stderr.length > 0);
  }
});

test('an unquoted title is caught, not silently cut', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-'));
  try {
    const out = join(dir, 'never.svg');
    const { code, stderr } = await cli('The', 'Lighthouse', 'Keeper', '-o', out);
    assert.equal(code, 1);
    assert.match(stderr, /Quote values with spaces/);
    await assert.rejects(stat(out), { code: 'ENOENT' }, 'no file is written');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a bad size is reported as typed', async () => {
  const { code, stderr } = await cli('T', '--width', '12abc');
  assert.equal(code, 1);
  assert.match(stderr, /--width must be a number, got "12abc"/);
});

test('--subtitle and --texture', async () => {
  const { code, stdout } = await cli('Dune', 'Herbert', '--subtitle', 'A Novel', '--texture', '-s', 'minimal');
  assert.equal(code, 0);
  assert.match(stdout, /<title>Dune: A Novel by Herbert<\/title>/);
  assert.match(stdout, /feTurbulence/);
});

test(
  'a reader that stops early (| head) is not a crash',
  { skip: process.platform === 'win32' && 'needs a POSIX shell' },
  async () => {
    // ~100 KB of SVG into `head`, which exits after 20 bytes and closes the pipe.
    const command = `"${process.execPath}" "${CLI}" Flow -s flowfield --width 3000 --height 3000 | head -c 20 > /dev/null`;
    const { stderr } = await run('sh', ['-c', command]);
    assert.doesNotMatch(stderr, /EPIPE|Unhandled/);
  },
);

test('your own colours, a format and a size', async () => {
  const custom = await cli(
    'Bright',
    '--bg',
    '0b132b',
    '--ink',
    '#f8f9fa',
    '--accent',
    'ff6b6b,4ecdc4',
    '-s',
    'minimal',
  );
  assert.equal(custom.code, 0);
  assert.match(custom.stdout, /fill="#0b132b"/);
  // --palette auto or random beside your own colours is no conflict: your colours are used.
  const random = await cli(
    'Bright',
    '--bg',
    '0b132b',
    '--ink',
    'f8f9fa',
    '--accent',
    'ff6b6b',
    '-p',
    'random',
    '-s',
    'minimal',
  );
  assert.equal(random.code, 0, random.stderr);
  assert.match(random.stdout, /fill="#0b132b"/);
  const ebook = await cli('T', '--format', 'ebook', '--width', '1600');
  assert.match(ebook.stdout, /^<svg[^>]*width="1600" height="2560"/);
  const square = await cli('T', '--format', 'square');
  assert.match(square.stdout, /^<svg[^>]*width="600" height="600"/);
  const sized = await cli('T', '--size', '1650x2550');
  assert.match(sized.stdout, /^<svg[^>]*width="1650" height="2550"/);
});

test('--json reports the choices, with the SVG unless it went to a file', async () => {
  const printed = await cli('ガラスの街', '--seed', 's', '--size', '1600x2560', '--json');
  assert.equal(printed.code, 0);
  const data = JSON.parse(printed.stdout);
  assert.equal(data.width, 1600);
  assert.equal(data.lang, 'ja');
  assert.match(data.svg, /^<svg[^>]* lang="ja"/);
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-'));
  try {
    const out = join(dir, 'cover.svg');
    const written = await cli('T', '-s', 'swiss', '-p', 'mint', '--json', '-o', out);
    assert.equal(written.stderr, '');
    assert.deepEqual(JSON.parse(written.stdout), {
      file: out,
      style: 'swiss',
      palette: 'mint',
      seed: 'T␟',
      width: 600,
      height: 900,
      lang: '',
      variants: {},
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('conflicting or incomplete options are reported', async () => {
  for (const [args, message] of [
    [['T', '--bg', 'fff', '--ink', '000'], /at least one --accent/],
    [['T', '--bg', 'fff', '--ink', '000', '--accent', 'f00', '-p', 'mint'], /not both/],
    [['T', '--bg', 'red', '--ink', '000', '--accent', 'f00'], /hex/],
    [['T', '--size', '1600'], /--size must look like 1600x2560/],
    [['T', '--size', '1600x2560', '--width', '600'], /without --width/],
    [['T', '--format', 'a4'], /Unknown format "a4"/],
    [['T', '--format', 'ebook', '--width', '600', '--height', '900'], /a width or a height, not both/],
    [['T', '--lang', 'not a tag'], /language tag/],
  ]) {
    const { code, stdout, stderr } = await cli(.../** @type {string[]} */ (args));
    assert.equal(code, 1, args.join(' '));
    assert.equal(stdout, '');
    assert.match(stderr, /** @type {RegExp} */ (message));
  }
});

test('--count writes variations, named from --out', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-'));
  try {
    const plain = await cli('Ideas', '--count', '3', '--json', '-o', join(dir, 'cover.svg'));
    assert.equal(plain.code, 0);
    const lines = plain.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      lines.map((l) => [l.file, l.seed]),
      [1, 2, 3].map((n) => [join(dir, `cover-${n}.svg`), String(n)]),
    );
    for (const { file } of lines) assert.match(await readFile(file, 'utf8'), /^<svg/);
    const named = await cli('Ideas', '--seed', 'x', '--count', '2', '-o', join(dir, '{seed}.svg'));
    assert.equal(named.code, 0);
    assert.match(named.stderr, /x-1\.svg[\s\S]*x-2\.svg/);
    await stat(join(dir, 'x-2.svg'));
    // The same seed again gives the same cover.
    const again = await cli('Ideas', '--seed', 'x-2');
    assert.equal(again.stdout.trim(), (await readFile(join(dir, 'x-2.svg'), 'utf8')).trim());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  for (const [args, message] of [
    [['T', '--count', '3'], /give --out/],
    [['T', '--count', '0', '-o', 'x.svg'], /from 1 to 1000/],
    [['T', '--count', '2.5', '-o', 'x.svg'], /whole number/],
  ]) {
    const { code, stderr } = await cli(...args);
    assert.equal(code, 1);
    assert.match(stderr, message);
  }
});

test('{n} and {seed} in --out are filled in for one cover too, and a seed never makes a path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-'));
  try {
    const one = await cli('Dune', '--seed', 'abc', '-o', join(dir, 'c-{seed}-{n}.svg'));
    assert.equal(one.code, 0);
    await stat(join(dir, 'c-abc-1.svg'));
    const sneaky = await cli('Dune', '--count', '2', '--seed', '../a/b:c', '--json', '-o', join(dir, '{seed}.svg'));
    assert.equal(sneaky.code, 0);
    const files = sneaky.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).file);
    assert.deepEqual(files, [join(dir, 'a-b-c-1.svg'), join(dir, 'a-b-c-2.svg')]);
    // The title's own seed (title and author, joined by a separator) makes a name too.
    const derived = await cli('Dune', 'Herbert', '-o', join(dir, '{seed}.svg'));
    assert.equal(derived.code, 0);
    await stat(join(dir, 'Dune-Herbert.svg'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--variant pins a style’s choice, and --list shows them', async () => {
  const forest = await cli('Dune', '-s', 'silhouette', '--seed', 'x', '--variant', 'scene=forest', '--json');
  assert.deepEqual(JSON.parse(forest.stdout).variants, { scene: 'forest' });
  const city = await cli('Dune', '-s', 'silhouette', '--seed', 'x', '--variant', 'scene=city', '--json');
  assert.notEqual(JSON.parse(city.stdout).svg, JSON.parse(forest.stdout).svg);
  const list = await cli('--list');
  assert.match(list.stdout, /silhouette[^\n]*\n(?:\s+genres:[^\n]*\n)?\s+--variant scene=city\|forest/);
  for (const [args, message] of [
    [['Dune', '-s', 'silhouette', '--variant', 'scene=beach'], /scene "beach"/],
    [['Dune', '--variant', 'scene'], /--variant must look like scene=forest/],
  ]) {
    const { code, stderr } = await cli(...args);
    assert.equal(code, 1);
    assert.match(stderr, message);
  }
});

test('--font and --case set the title', async () => {
  const { stdout } = await cli('The Lighthouse Keeper', '-s', 'minimal', '--font', 'didone', '--case', 'upper');
  assert.match(stdout, /font-family="Didot,/);
  assert.match(stdout, />LIGHTHOUSE\b/);
  for (const [args, message] of [
    [['T', '--font', 'comic'], /Unknown font "comic"/],
    [['T', '--case', 'lower'], /titleCase must be/],
  ]) {
    const { code, stderr } = await cli(...args);
    assert.equal(code, 1);
    assert.match(stderr, message);
  }
});

test('--series and --credit', async () => {
  const { stdout } = await cli(
    'Dune',
    'Frank Herbert',
    '-s',
    'minimal',
    '--series',
    'Dune Chronicles 1',
    '--credit',
    'Foreword by Brian Herbert',
  );
  assert.match(stdout, /<title>Dune by Frank Herbert \(Dune Chronicles 1\)\. Foreword by Brian Herbert<\/title>/);
  assert.match(stdout, />DUNE CHRONICLES 1</);
});

test('--badge sets a seal', async () => {
  const { stdout } = await cli('Dune', '-s', 'minimal', '--badge', 'Bestseller');
  assert.match(stdout, /aria-label="Bestseller"/);
  assert.match(stdout, />BESTSELLER</);
});

test('-o makes the folder it writes into', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-'));
  try {
    const made = await cli('Salt and Static', '--count', '2', '-o', join(dir, 'ideas', 'cover.svg'));
    assert.equal(made.code, 0, made.stderr);
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual((await readdir(join(dir, 'ideas'))).sort(), ['cover-1.svg', 'cover-2.svg']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--batch writes a cover per book, with the other options for every book', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-'));
  try {
    const list = join(dir, 'books.csv');
    const { writeFile, readdir } = await import('node:fs/promises');
    await writeFile(list, 'title,author,palette\nDune,Frank Herbert,mint\n"Fish, Chips",Ana,\n');
    const out = join(dir, 'covers');
    const made = await cli('--batch', list, '--out-dir', out, '-s', 'minimal', '--seed', 'set', '--json');
    assert.equal(made.code, 0, made.stderr);
    const lines = made.stdout
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    // (Each line says what a single cover's --json says: its language and pins too.)
    for (const line of lines) assert.ok('lang' in line && 'variants' in line, JSON.stringify(line));
    assert.deepEqual(
      lines.map((l) => [l.file, l.style, l.palette, l.seed]),
      [
        [join(out, '1-dune.svg'), 'minimal', 'mint', 'set'],
        [join(out, '2-fish-chips.svg'), 'minimal', lines[1].palette, 'set'],
      ],
    );
    assert.deepEqual((await readdir(out)).sort(), ['1-dune.svg', '2-fish-chips.svg']);
    assert.match(made.stderr, /Wrote 2 of 2 covers/);
    // A book that can't be made is reported, the rest are written, and the exit code says so.
    await writeFile(list, 'title,style\nGood,swiss\nBad,nope\n');
    const partial = await cli('--batch', list, '--out-dir', join(dir, 'partial'));
    assert.equal(partial.code, 1);
    assert.match(partial.stderr, /Book 2 \("Bad"\): Unknown style "nope"/);
    assert.match(partial.stderr, /Wrote 1 of 2 covers/);
    // A book's genre picks a style that suits it, unless --style's already does.
    await writeFile(list, 'title,genre\nNight,horror\nNight,literary\nNight,\n');
    const genred = await cli('--batch', list, '--out-dir', join(dir, 'genred'), '-s', 'minimal', '--json');
    assert.equal(genred.code, 0, genred.stderr);
    const styles = genred.stdout
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).style);
    assert.ok(['hollow', 'noir', 'silhouette'].includes(styles[0]), styles[0]);
    assert.deepEqual(styles.slice(1), ['minimal', 'minimal']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  for (const [args, message] of [
    [['T', '--batch', 'x.csv'], /give no title/],
    [['--batch', 'x.csv', '-o', 'a.svg'], /without --out or --count/],
  ]) {
    const { code, stderr } = await cli(...args);
    assert.equal(code, 1);
    assert.match(stderr, message);
  }
});

test(
  '--batch --json writes every line, even to a slow reader',
  { skip: process.platform === 'win32' && 'needs a POSIX shell' },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'book-cover-'));
    try {
      const { writeFile } = await import('node:fs/promises');
      const list = join(dir, 'list.txt');
      await writeFile(list, Array.from({ length: 400 }, (_, i) => `Book ${i} | Author`).join('\n'));
      const command = `"${process.execPath}" "${CLI}" --batch "${list}" --out-dir "${join(dir, 'out')}" --json 2>/dev/null | (sleep 1; wc -l)`;
      const { stdout } = await run('sh', ['-c', command]);
      assert.equal(Number(stdout.trim()), 400);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test('--genre picks a random style that suits it, and --list names the genres', async () => {
  const { listStyles } = await import('../src/index.js');
  const horror = listStyles()
    .filter((s) => s.genres.includes('horror'))
    .map((s) => s.id);
  for (const seed of ['1', '2', '3']) {
    const { stdout } = await cli('Dune', '--genre', 'horror', '--seed', seed, '--json');
    assert.ok(horror.includes(JSON.parse(stdout).style), seed);
  }
  const list = await cli('--list');
  assert.match(list.stdout, /Genres \(--genre\):[\s\S]*horror\s+Horror/);
  assert.match(list.stdout, /hollow[^\n]*\n\s+genres: horror/);
  const bad = await cli('Dune', '--genre', 'poetry');
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /Unknown genre "poetry"/);
});

test('--format with --width or --height: the shape at that size, as the HTTP API reads it', async () => {
  for (const [args, size] of [
    [
      ['--format', 'ebook', '--height', '1920'],
      [1200, 1920],
    ],
    [
      ['--format', '10x16', '--width', '1600'],
      [1600, 2560],
    ],
    [
      ['--format', '1600x2560'],
      [1600, 2560],
    ],
  ]) {
    const { code, stdout, stderr } = await cli('T', ...args, '--json');
    assert.equal(code, 0, stderr);
    const { width, height } = JSON.parse(stdout);
    assert.deepEqual([width, height], size, args.join(' '));
  }
});

test('--print: the whole paperback cover, sized from the trim and the pages', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-print-'));
  try {
    const out = join(dir, 'paperback.svg');
    const blurbFile = join(dir, 'blurb.txt');
    await import('node:fs/promises').then((fs) => fs.writeFile(blurbFile, 'The first paragraph.\n\nThe second one.'));
    const made = await cli(
      'The Lighthouse Keeper',
      'Mara Ellison',
      '-s',
      'artdeco',
      '--print',
      '6x9',
      '--pages',
      '320',
      '--paper',
      'cream',
      '--hook',
      'Some lights are kept burning.',
      '--blurb-file',
      blurbFile,
      '--imprint',
      'Harbour Press',
      '-o',
      out,
    );
    assert.equal(made.code, 0, made.stderr);
    assert.match(made.stderr, /Wrote .*paperback\.svg: 13\.05 × 9\.25 in, spine 0\.8 in \(style: artdeco\)/);
    const svg = await readFile(out, 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1252\.8" height="888"/);
    for (const text of [
      'Some lights are kept',
      'The first paragraph.',
      'The second one.',
      'Harbour Press',
      'MARA ELLISON',
    ]) {
      assert.ok(svg.includes(text), text);
    }
    // {n} and {seed} in --out are filled in, as for any single cover.
    const named = await cli(
      'T',
      '--print',
      '6x9',
      '--pages',
      '300',
      '--seed',
      'abc',
      '-o',
      join(dir, '{n}-{seed}.svg'),
    );
    assert.equal(named.code, 0, named.stderr);
    assert.ok((await stat(join(dir, '1-abc.svg'))).isFile());
    // As JSON, to stdout.
    const json = JSON.parse((await cli('X', '--print', '5x8', '--pages', '60', '--json')).stdout);
    assert.deepEqual(json.inches, { width: 10.38512, height: 8.25, trim: [5, 8], spine: 0.13512, bleed: 0.125 });
    assert.equal(json.spineText, false);
    assert.match(json.svg, /^<svg /);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  // What doesn't go with it, or is missing.
  for (const [args, message] of /** @type {const} */ ([
    [['X', '--print', '6x9'], /--print needs --pages/],
    [['X', '--pages', '300'], /--pages is for a print cover: add --print/],
    [['X', '--print', '6x9', '--pages', '200', '--size', '600x900'], /use it without --size/],
    [['X', '--print', '6x9', '--pages', '200', '--blurb', 'a', '--blurb-file', 'b'], /--blurb or --blurb-file/],
    [['X', '--print', '9x13', '--pages', '200'], /trim must be/],
    [['X', '--print', '6x9', '--pages', '2000'], /pages must be a whole number from 24 to 828/],
  ])) {
    const { code, stderr } = await cli(...args);
    assert.equal(code, 1, args.join(' '));
    assert.match(stderr, message, args.join(' '));
  }
});

test('--height alone keeps the paperback shape, as --width alone does', async () => {
  for (const [args, size] of /** @type {const} */ ([
    [
      ['--height', '1200'],
      [800, 1200],
    ],
    [
      ['--width', '800'],
      [800, 1200],
    ],
  ])) {
    const { stdout } = await cli('Dune', ...args, '--json');
    const { width, height } = JSON.parse(stdout);
    assert.deepEqual([width, height], size, args.join(' '));
  }
});

test('--height alone too small for a paperback says so of the height', async () => {
  const { code, stderr } = await cli('Dune', '--height', '60');
  assert.equal(code, 1);
  assert.match(stderr, /height 60 makes a paperback 40 px wide, under 50/);
});

test('--out-dir is for --batch: alone, or with --print, it is refused, not ignored', async () => {
  for (const args of [
    ['X', '--out-dir', 'covers'],
    ['X', '--print', '6x9', '--pages', '300', '--out-dir', 'covers'],
  ]) {
    const { stderr, code } = await cli(...args);
    assert.equal(code, 1, args.join(' '));
    assert.match(stderr, /--out-dir is where --batch writes its covers/);
  }
});

test('the CLI takes one to three accents, as links and the API do', async () => {
  const { code, stderr } = await cli('Dune', '--bg', '000', '--ink', 'fff', '--accent', 'a00,0b0,00c,ddd');
  assert.equal(code, 1);
  assert.match(stderr, /one to three accents/);
});
