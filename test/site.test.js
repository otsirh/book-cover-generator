// Sanity checks for the static files deployed with the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PAGES } from '../scripts/gallery.js';

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
  // (And the pages the build writes.)
  const built = new Set(Object.keys(PAGES));
  for (const ref of refs) assert.ok(built.has(ref) || existsSync(ref) || existsSync(`public/${ref}`), `missing ${ref}`);
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
    .filter((f) => f.endsWith('.js'))
    // (The MCP server is the CLI's and the Worker's, and <book-cover> other pages': the app loads neither.)
    .filter((f) => f !== 'src/mcp.js' && f !== 'src/element.js');
  for (const file of modules) assert.ok(html.includes(`rel="modulepreload" href="${file}"`), `${file} isn't preloaded`);
});

test('robots.txt lets crawlers fetch a design’s link preview image, and nothing else of the API', async () => {
  const rules = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => /^(Allow|Disallow):\s*(\S+)/.exec(line.trim()))
    .filter((m) => m !== null)
    .map((m) => ({ allow: m[1] === 'Allow', path: m[2] }));
  /** As crawlers read it: the longest rule that matches wins. @param {string} path */
  const allowed = (path) => {
    const hits = rules.filter((r) => path.startsWith(r.path)).sort((a, b) => b.path.length - a.path.length);
    return hits[0]?.allow ?? true;
  };
  // The image preview() puts in a design's page (worker/index.js).
  const { preview } = await import('../worker/index.js');
  const page = await preview(new Request('https://covers.otsirh.dev/?title=Dune'), {
    ASSETS: { fetch: async () => new Response('<meta property="og:image" content="">') },
  });
  const image = /og:image" content="([^"]+)"/.exec(await /** @type {Response} */ (page).text())?.[1] ?? '';
  const imagePath = new URL(image.replaceAll('&amp;', '&')).pathname;
  assert.equal(imagePath, '/api/mockup.png');
  assert.equal(allowed(imagePath), true);
  for (const path of ['/api/cover.svg', '/api/cover.png', '/api/catalog.json', '/mcp'])
    assert.equal(allowed(path), false, path);
  assert.equal(allowed('/gallery/'), true);
});

test('boot.js reads a custom size by the library’s rules (sizeLimits, CUSTOM_SIZE)', async () => {
  const { sizeLimits } = await import('../src/index.js');
  const { CUSTOM_SIZE } = await import('../src/shared.js');
  const boot = readFileSync(new URL('../site/boot.js', import.meta.url), 'utf8');
  assert.ok(boot.includes(CUSTOM_SIZE.source), 'the size pattern is src/shared.js’s');
  assert.ok(
    boot.includes(
      `Math.min(w, h) >= ${sizeLimits.min} && Math.max(w, h) <= ${sizeLimits.max} && w <= h * ${sizeLimits.ratio} && h <= w * ${sizeLimits.ratio}`,
    ),
    'the size limits are sizeLimits',
  );
});

test('the app’s title font menu offers every font of FONTS, in order', async () => {
  const { FONTS } = await import('../src/text.js');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const menu = /<select id="title-font"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
  const values = [...menu.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ['', ...Object.keys(FONTS)]);
});

test('the about page answers what people ask, in the site’s chrome, and the sitemap lists every page', () => {
  const about = PAGES['/about/']();
  for (const id of ['use', 'privacy', 'fonts', 'links', 'ebook', 'paperback'])
    assert.match(about, new RegExp(`id="${id}"`));
  assert.match(about, /<a [^>]*aria-current="page"[^>]*>About<\/a>/);
  assert.match(about, /<link rel="canonical" href="https:\/\/covers\.otsirh\.dev\/about\/"/);
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const path of ['/', ...Object.keys(PAGES)])
    assert.ok(sitemap.includes(`<loc>https://covers.otsirh.dev${path}</loc>`), path);
});

test('boot.js paints a design link’s shape as the app reads it: any case, from the hash or the query', async () => {
  const { runInNewContext } = await import('node:vm');
  const code = readFileSync(new URL('../site/boot.js', import.meta.url), 'utf8');
  /** @param {string} hash @param {string} [search] */
  const paint = (hash, search = '') => {
    /** @type {Record<string, string>} */
    const props = {};
    const root = {
      classList: { add() {} },
      dataset: /** @type {Record<string, string>} */ ({}),
      style: { setProperty: (/** @type {string} */ k, /** @type {string} */ v) => (props[k] = v) },
    };
    runInNewContext(code, { location: { hash, search }, document: { documentElement: root }, URLSearchParams });
    return { shape: root.dataset.coverFormat, ...props };
  };
  assert.equal(paint('#title=x&format=Ebook').shape, 'ebook');
  assert.equal(paint('#title=x&format=SQUARE').shape, 'square');
  assert.deepEqual(paint('#title=x&format=1600X2560'), { shape: 'custom', '--cover-w': '1600', '--cover-h': '2560' });
  assert.deepEqual(paint('', '?title=x&format=1600%20%C3%97%202560'), {
    shape: 'custom',
    '--cover-w': '1600',
    '--cover-h': '2560',
  });
  assert.equal(paint('#title=x&format=paperback').shape, undefined);
});
