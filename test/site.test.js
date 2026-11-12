// Sanity checks for the static files deployed with the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('security.txt has not expired (and will not within 30 days)', () => {
  const text = readFileSync('public/.well-known/security.txt', 'utf8');
  const expires = /^Expires: (.+)$/m.exec(text)?.[1];
  assert.ok(expires, 'Expires field is required by RFC 9116');
  const days = (Date.parse(expires) - Date.now()) / 86_400_000;
  assert.ok(days > 30, `security.txt expires in ${Math.round(days)} days; bump the Expires date`);
  assert.ok(days <= 365, `Expires is ${Math.round(days)} days away; RFC 9116 recommends less than a year`);
});

test('the web manifest is valid and its icons exist', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) assert.ok(existsSync(`public/${icon.src}`), `missing ${icon.src}`);
  assert.ok(manifest.icons.some((/** @type {{ purpose?: string }} */ i) => i.purpose === 'maskable'));
});

test('every local asset referenced by index.html exists', () => {
  const html = readFileSync('index.html', 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith('./'));
  assert.ok(refs.length > 5);
  for (const ref of refs) assert.ok(existsSync(ref) || existsSync(`public/${ref}`), `missing ${ref}`);
});

test('_headers sets a strict CSP and keeps the library importable cross-origin', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  assert.match(headers, /Content-Security-Policy: default-src 'none'; script-src 'self';/);
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval/);
  // One Trusted Types policy, the one that registers the service worker.
  assert.match(headers, /require-trusted-types-for 'script'; trusted-types sw\n/);
  assert.match(
    headers,
    /\/src\/\*\n {2}! Cross-Origin-Resource-Policy\n {2}Cross-Origin-Resource-Policy: cross-origin\n {2}Access-Control-Allow-Origin: \*/,
  );
  // Link previews and icons are shown by other sites.
  for (const path of ['/icons/*', '/og.png']) {
    assert.ok(
      headers.includes(`${path}\n  ! Cross-Origin-Resource-Policy\n  Cross-Origin-Resource-Policy: cross-origin\n`),
      path,
    );
  }
});

test('the page preloads every module of the library', async () => {
  const { readdirSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const modules = readdirSync(new URL('../src/', import.meta.url), { recursive: true })
    .map((f) => `src/${String(f).replaceAll('\\', '/')}`)
    .filter((f) => f.endsWith('.js'));
  for (const file of modules) assert.ok(html.includes(`rel="modulepreload" href="${file}"`), `${file} isn't preloaded`);
});
