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
