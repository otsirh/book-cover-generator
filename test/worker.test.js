// The HTTP API the site's Worker answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { api } from '../worker/index.js';
import { optionsFromLink } from '../src/link.js';
import { createCover, createMockup, version } from '../src/index.js';

const get = (/** @type {string} */ path, method = 'GET') =>
  api(new Request(`https://covers.example${path}`, { method }));

test('a cover from the query string: the same as the library draws', async () => {
  const res = /** @type {Response} */ (
    get('/api/cover.svg?title=Dune&author=Frank+Herbert&style=retro&seed=s&width=1600&height=2560')
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('x-cover-style'), 'retro');
  assert.match(res.headers.get('cache-control') ?? '', /max-age=86400/);
  const svg = await res.text();
  assert.equal(
    svg,
    createCover({ title: 'Dune', author: 'Frank Herbert', style: 'retro', seed: 's', width: 1600, height: 2560 }).svg,
  );
});

test('every option the library has, by name', () => {
  const q = new URLSearchParams(
    'title=T&author=A&subtitle=S&series=Se&credit=C&badge=B&style=crest&seed=1&genre=fantasy&font=didone&lang=ja&width=600&height=600&case=upper&texture=1&variant=field.pale-emblem.sun&bg=fff&ink=%23000&accent=f00,0f0',
  );
  assert.deepEqual(optionsFromLink(q), {
    title: 'T',
    author: 'A',
    subtitle: 'S',
    series: 'Se',
    credit: 'C',
    badge: 'B',
    style: 'crest',
    seed: '1',
    genre: 'fantasy',
    font: 'didone',
    lang: 'ja',
    width: 600,
    height: 600,
    titleCase: 'upper',
    texture: true,
    variants: { field: 'pale', emblem: 'sun' },
    palette: { bg: '#fff', ink: '#000', accents: ['#f00', '#0f0'] },
  });
});

test('an app link draws the cover the app draws', () => {
  const q = new URLSearchParams(
    'title=Glass%0ACity&author=A&subtitle=&style=crest&variant=emblem.sun&palette=custom-0b132b-f8f9fa-ff6b6b&seed=&format=ebook&texture=0&v=1.2.0',
  );
  assert.deepEqual(optionsFromLink(q), {
    title: 'Glass\nCity',
    author: 'A',
    style: 'crest',
    variants: { emblem: 'sun' },
    palette: { bg: '#0b132b', ink: '#f8f9fa', accents: ['#ff6b6b'] },
    width: 600,
    height: 960,
    texture: false,
  });
  // (auto leaves the palette to the seed, as the library's default.)
  assert.deepEqual(optionsFromLink(new URLSearchParams('format=900x1350&palette=auto')), { width: 900, height: 1350 });
  for (const [query, message] of [
    ['format=huge', /Unknown format "huge"/],
    ['texture=yes', /texture is 1/],
    ['variant=scene', /name\.value pairs/],
    ['bg=fff&ink=000', /need bg, ink and accent/],
  ]) {
    assert.throws(() => optionsFromLink(new URLSearchParams(query)), message);
  }
});

test('answers are kept at the edge, once per version', async () => {
  /** @type {Map<string, Response>} */
  const kept = new Map();
  /** @type {Promise<unknown>[]} */
  const waiting = [];
  const ctx = { waitUntil: (/** @type {Promise<unknown>} */ p) => waiting.push(p) };
  /** @type {any} */ (globalThis).caches = {
    default: {
      match: async (/** @type {Request} */ key) => kept.get(key.url)?.clone(),
      put: async (/** @type {Request} */ key, /** @type {Response} */ res) => void kept.set(key.url, res),
    },
  };
  try {
    const env = { CF_VERSION_METADATA: { id: 'd1' } };
    const first = await worker.fetch(new Request('https://covers.example/api/cover.svg?title=Kept&v=1.0.0'), env, ctx);
    await Promise.all(waiting);
    assert.deepEqual(
      [...kept.keys()],
      [`https://covers.example/api/cover.svg?title=Kept&v=${encodeURIComponent(`${version}+d1`)}`],
    );
    // A link from another version is the same answer; another deployment draws anew.
    const again = await worker.fetch(new Request('https://covers.example/api/cover.svg?title=Kept&v=1.6.0'), env, ctx);
    assert.equal(await again.text(), await first.text());
    await worker.fetch(
      new Request('https://covers.example/api/cover.svg?title=Kept'),
      { CF_VERSION_METADATA: { id: 'd2' } },
      ctx,
    );
    await Promise.all(waiting);
    assert.equal(kept.size, 2);
    // Errors aren't kept.
    await worker.fetch(new Request('https://covers.example/api/cover.svg?style=nope'), env, ctx);
    await Promise.all(waiting);
    assert.equal(kept.size, 2);
  } finally {
    delete (/** @type {any} */ (globalThis).caches);
  }
});

test('mockups, errors, other methods, and what isn’t the API', async () => {
  const mock = /** @type {Response} */ (get('/api/mockup.svg?title=Dune&seed=s&kind=card&text=Out+now'));
  assert.equal(mock.status, 200);
  assert.equal(
    await mock.text(),
    createMockup(createCover({ title: 'Dune', seed: 's' }), { kind: 'card', text: 'Out now' }).svg,
  );
  const bad = /** @type {Response} */ (get('/api/cover.svg?style=nope'));
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /Unknown style "nope"/);
  assert.equal(/** @type {Response} */ (get('/api/cover.svg?bg=fff')).status, 400);
  assert.equal(/** @type {Response} */ (get('/api/cover.svg', 'POST')).status, 405);
  assert.equal(/** @type {Response} */ (get('/api/cover.svg', 'OPTIONS')).status, 204);
  const head = /** @type {Response} */ (get('/api/cover.svg?title=x', 'HEAD'));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(get('/index.html'), null);
  // The Worker hands everything else to the static site.
  const assets = { fetch: async () => new Response('static') };
  const res = await worker.fetch(new Request('https://covers.example/'), { ASSETS: assets }, { waitUntil() {} });
  assert.equal(await res.text(), 'static');
});

test('the API reads a link as the app does, and sizes a format as the CLI does', () => {
  const o = optionsFromLink(new URLSearchParams(`palette=Mint&seed=%20abc%20&title=${'x'.repeat(250)}`));
  assert.equal(o.palette, 'mint');
  assert.equal(createCover({ ...o, title: 'x' }).palette, 'mint');
  assert.equal(o.seed, 'abc');
  assert.equal(o.title?.length, 200);
  assert.deepEqual(optionsFromLink(new URLSearchParams('format=ebook&width=1200')), { width: 1200, height: 1920 });
  assert.deepEqual(optionsFromLink(new URLSearchParams('format=square&height=500')), { width: 500, height: 500 });
  assert.throws(() => optionsFromLink(new URLSearchParams('format=ebook&width=600&height=600')), /not both/);
  // Sizes and pins as the app reads them: no leading zeros, and pins in any case.
  assert.throws(() => optionsFromLink(new URLSearchParams('format=0x0')), /Unknown format/);
  assert.deepEqual(optionsFromLink(new URLSearchParams('variant=Moon.Blood')).variants, { moon: 'blood' });
  // Texture in any case, and a seed's line breaks as spaces, as the app reads them.
  assert.equal(optionsFromLink(new URLSearchParams('texture=TRUE')).texture, true);
  assert.equal(optionsFromLink(new URLSearchParams('seed=a%0Ab')).seed, 'a b');
});

test('a mockup background without its #, and a preflight for any header', async () => {
  const res = /** @type {Response} */ (get('/api/mockup.svg?title=x&background=ffffff'));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /#ffffff/);
  const pre = /** @type {Response} */ (get('/api/cover.svg', 'OPTIONS'));
  assert.equal(pre.headers.get('access-control-allow-headers'), '*');
  assert.equal(pre.headers.get('access-control-max-age'), '86400');
});

test('the API and the app read one link alike: the last of a repeated key, CRLF, titleCase, sizes', async () => {
  const { LINK, lastValues } = await import('../src/link.js');
  const q = new URLSearchParams(
    `style=retro&style=swiss&title=a%0D%0A${'x'.repeat(198)}&titleCase=UPPER&palette=auto%20`,
  );
  const o = optionsFromLink(q);
  assert.equal(o.style, 'swiss');
  assert.equal(o.style, LINK.style(lastValues(q).style));
  assert.equal(o.title, LINK.title(lastValues(q).title));
  assert.equal(o.title?.length, 200);
  assert.equal(o.titleCase, 'upper');
  assert.equal(o.palette, undefined);
  assert.throws(
    () => optionsFromLink(new URLSearchParams('format=ebook&height=abc')),
    /height must be a number, got "abc"/,
  );
  // Unknown names still get the library's own message.
  const bad = /** @type {Response} */ (get('/api/cover.svg?style=Art%20Decco'));
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /Unknown style "Art Decco"/);
});

test('a format is a shape a width or height may scale; the library says what’s wrong with a size', () => {
  assert.deepEqual(optionsFromLink(new URLSearchParams('format=10x16&width=1600')), { width: 1600, height: 2560 });
  assert.deepEqual(optionsFromLink(new URLSearchParams('format=16x25&height=2500')), { width: 1600, height: 2500 });
  assert.deepEqual(optionsFromLink(new URLSearchParams('width=1e3')), { width: 1000 });
  assert.throws(
    () => optionsFromLink(new URLSearchParams('titleCase=bold')),
    /titleCase is upper or normal, got "bold"/,
  );
  assert.throws(() => createCover(optionsFromLink(new URLSearchParams('format=12000x18000'))), /10000/);
});

test('the app’s format and texture readers: presets, sizes it can make, on and off', async () => {
  const { LINK, fits } = await import('../src/link.js');
  assert.equal(LINK.format(' ebook '), 'ebook');
  assert.equal(LINK.format('1600x2560'), '1600x2560');
  for (const f of ['10x90', '20000x30000', '0x0', 'huge']) assert.equal(LINK.format(f), undefined, f);
  assert.equal(fits(600, 900), true);
  assert.equal(fits(600.5, 900), false);
  assert.equal(LINK.texture(' TRUE '), true);
  assert.equal(LINK.texture(false), false);
  assert.equal(LINK.texture('yes'), undefined);
});

/** The site's files as the Worker's ASSETS binding gives them, and resvg's WebAssembly (Node can't import it). */
const siteEnv = async () => {
  const { readFile } = await import('node:fs/promises');
  return {
    ASSETS: {
      /** @param {Request} request */
      async fetch(request) {
        const path = new URL(request.url).pathname;
        const file = path === '/' ? 'index.html' : path.startsWith('/fonts/') ? `public${path}` : null;
        if (!file) return new Response('Not found', { status: 404 });
        return new Response(await readFile(new URL(`../${file}`, import.meta.url)));
      },
    },
    RESVG_WASM: await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)),
  };
};

test('PNG covers and mockups: drawn with open fonts, scaled, capped, and refused for scripts they lack', async () => {
  const env = await siteEnv();
  const ctx = { waitUntil() {} };
  /** @param {string} path @param {string} [method] */
  const fetchPath = (path, method = 'GET') =>
    worker.fetch(new Request(`https://covers.example${path}`, { method }), env, ctx);
  /** @param {Response} res */
  const size = async (res) => {
    const view = new DataView(await res.arrayBuffer());
    return [view.getUint32(16), view.getUint32(20)];
  };
  const cover = await fetchPath('/api/cover.png?title=Dune&author=Frank+Herbert&style=retro&seed=s');
  assert.equal(cover.status, 200);
  assert.equal(cover.headers.get('content-type'), 'image/png');
  assert.equal(cover.headers.get('x-cover-style'), 'retro');
  assert.equal(cover.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await size(cover), [600, 900]);
  assert.deepEqual(await size(await fetchPath('/api/cover.png?title=Dune&scale=2&format=square')), [1200, 1200]);
  assert.deepEqual(await size(await fetchPath('/api/mockup.png?title=Dune&kind=card')), [1200, 630]);
  assert.equal(await (await fetchPath('/api/cover.png?title=Dune', 'HEAD')).text(), '');
  // What isn't drawn: a scale out of range, too many pixels, a bad option, text the fonts lack.
  assert.match(
    await (await fetchPath('/api/cover.png?title=Dune&scale=9')).text(),
    /scale must be a number from 1 to 4/,
  );
  const big = await fetchPath('/api/cover.png?title=Dune&width=4000&height=6000');
  assert.equal(big.status, 400);
  assert.match(await big.text(), /at most 16777216 pixels/);
  assert.equal((await fetchPath('/api/cover.png?title=Dune&style=nope')).status, 400);
  const japanese = await fetchPath(`/api/cover.png?title=${encodeURIComponent('灯台守')}`);
  assert.equal(japanese.status, 422);
  assert.match(await japanese.text(), /ask for the SVG/);
  // For a link preview, the site's own picture instead.
  const fallback = await fetchPath(`/api/mockup.png?kind=card&preview=1&title=${encodeURIComponent('灯台守')}`);
  assert.equal(fallback.status, 302);
  assert.equal(fallback.headers.get('location'), 'https://covers.example/og.png');
  assert.equal((await fetchPath('/api/cover.png', 'POST')).status, 405);
});

test('a design’s link (/?title=…) gets its own link preview; the site’s headers come with it', async () => {
  const env = await siteEnv();
  const res = await worker.fetch(
    new Request('https://covers.example/?title=Dune&author=Frank+Herbert&style=retro&seed=s'),
    env,
    { waitUntil() {} },
  );
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>Dune by Frank Herbert · Book Cover Generator<\/title>/);
  assert.match(html, /<meta property="og:title" content="Dune by Frank Herbert"/);
  assert.match(
    html,
    /<meta property="og:url" content="https:\/\/covers\.example\/\?title=Dune&amp;author=Frank\+Herbert/,
  );
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/covers\.example\/api\/mockup\.png\?title=Dune&amp;author=Frank\+Herbert&amp;style=retro&amp;seed=s&amp;kind=card&amp;preview=1"/,
  );
  assert.match(html, /<meta property="og:image:alt" content="The cover of Dune by Frank Herbert"/);
  // The page's security headers, which the static files' rules don't give a Worker's answer.
  assert.match(res.headers.get('content-security-policy') ?? '', /require-trusted-types-for 'script'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  // Markup in the title is escaped; a link the library refuses keeps the page as it is.
  const marked = await (
    await worker.fetch(new Request('https://covers.example/?title=%3Cb%3E%22x%22'), env, { waitUntil() {} })
  ).text();
  assert.match(marked, /<title>&lt;b&gt;&quot;x&quot; · Book Cover Generator<\/title>/);
  const refused = await (
    await worker.fetch(new Request('https://covers.example/?title=X&style=nope'), env, { waitUntil() {} })
  ).text();
  assert.match(refused, /<meta property="og:image" content="https:\/\/covers\.otsirh\.dev\/og\.png"/);
});

test('the Worker’s pages have the site’s headers: SITE_HEADERS is public/_headers’ /* rule', async () => {
  const { SITE_HEADERS } = await import('../worker/index.js');
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  const block = /^\/\*\n((?: {2}.+\n)+)/m.exec(text)?.[1] ?? '';
  const rule = Object.fromEntries(
    block
      .trim()
      .split('\n')
      .map((line) =>
        line
          .trim()
          .split(/:\s(.*)/s)
          .slice(0, 2),
      ),
  );
  assert.deepEqual(SITE_HEADERS, rule);
});
