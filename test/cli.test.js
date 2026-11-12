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
    [['T', '--format', 'ebook', '--height', '900'], /use --size/],
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
