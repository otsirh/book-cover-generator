// The HTTP API the site's Worker answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { api, coverOptions } from '../worker/index.js';
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
  assert.deepEqual(coverOptions(q), {
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
  assert.deepEqual(coverOptions(q), {
    title: 'Glass\nCity',
    author: 'A',
    style: 'crest',
    variants: { emblem: 'sun' },
    palette: { bg: '#0b132b', ink: '#f8f9fa', accents: ['#ff6b6b'] },
    width: 600,
    height: 960,
    texture: false,
  });
  assert.deepEqual(coverOptions(new URLSearchParams('format=900x1350&palette=auto')), {
    width: 900,
    height: 1350,
    palette: 'auto',
  });
  for (const [query, message] of [
    ['format=huge', /Unknown format "huge"/],
    ['texture=yes', /texture is 1/],
    ['variant=scene', /name\.value pairs/],
    ['bg=fff&ink=000', /need bg, ink and accent/],
  ]) {
    assert.throws(() => coverOptions(new URLSearchParams(query)), message);
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
  const o = coverOptions(new URLSearchParams(`palette=Mint&seed=%20abc%20&title=${'x'.repeat(250)}`));
  // (A palette's name in any case is left to the library, which reads it.)
  assert.equal(o.palette, 'Mint');
  assert.equal(createCover({ ...o, title: 'x' }).palette, 'mint');
  assert.equal(o.seed, 'abc');
  assert.equal(o.title?.length, 200);
  assert.deepEqual(coverOptions(new URLSearchParams('format=ebook&width=1200')), { width: 1200, height: 1920 });
  assert.deepEqual(coverOptions(new URLSearchParams('format=square&height=500')), { width: 500, height: 500 });
  assert.throws(() => coverOptions(new URLSearchParams('format=ebook&width=600&height=600')), /not both/);
  // Sizes and pins as the app reads them: no leading zeros, and pins in any case.
  assert.throws(() => coverOptions(new URLSearchParams('format=0x0')), /Unknown format/);
  assert.deepEqual(coverOptions(new URLSearchParams('variant=Moon.Blood')).variants, { moon: 'blood' });
  // Texture in any case, and a seed's line breaks as spaces, as the app reads them.
  assert.equal(coverOptions(new URLSearchParams('texture=TRUE')).texture, true);
  assert.equal(coverOptions(new URLSearchParams('seed=a%0Ab')).seed, 'a b');
});

test('a mockup background without its #, and a preflight for any header', async () => {
  const res = /** @type {Response} */ (get('/api/mockup.svg?title=x&background=ffffff'));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /#ffffff/);
  const pre = /** @type {Response} */ (get('/api/cover.svg', 'OPTIONS'));
  assert.equal(pre.headers.get('access-control-allow-headers'), '*');
  assert.equal(pre.headers.get('access-control-max-age'), '86400');
});
