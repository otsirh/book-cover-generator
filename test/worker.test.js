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
    // (Each colour as #rrggbb, as the cover's link writes it.)
    palette: { bg: '#ffffff', ink: '#000000', accents: ['#ff0000', '#00ff00'] },
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
    const drawn = await first.text();
    assert.equal(await again.text(), drawn);
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
    // The same design in another order is the same answer.
    await worker.fetch(new Request('https://covers.example/api/cover.svg?author=Z&title=Kept'), env, ctx);
    await worker.fetch(new Request('https://covers.example/api/cover.svg?title=Kept&author=Z'), env, ctx);
    await Promise.all(waiting);
    assert.equal(kept.size, 3);
    kept.delete([...kept.keys()].at(-1) ?? '');
    // A parameter the API doesn't read is the same answer, and so is a HEAD (without the body).
    const extra = await worker.fetch(
      new Request('https://covers.example/api/cover.svg?x=1&title=Kept&utm=a'),
      env,
      ctx,
    );
    assert.equal(await extra.text(), drawn);
    const head = await worker.fetch(
      new Request('https://covers.example/api/cover.svg?title=Kept', { method: 'HEAD' }),
      env,
      ctx,
    );
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    assert.equal(await head.text(), '');
    await Promise.all(waiting);
    assert.equal(kept.size, 2);
    // A HEAD of what isn't kept yet is drawn and kept for the GET.
    await worker.fetch(new Request('https://covers.example/api/cover.json?title=Head', { method: 'HEAD' }), env, ctx);
    await Promise.all(waiting);
    assert.equal(kept.size, 3);
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
  // (A width or a height alone sizes the paperback's shape, as the CLI does: a width alone as the
  // library takes it, rounded first; a height alone with its width, said of the height if too small.)
  assert.deepEqual(optionsFromLink(new URLSearchParams('width=1e3')), { width: 1000 });
  assert.deepEqual(optionsFromLink(new URLSearchParams('height=1500')), { height: 1500 });
  const tall = createCover(optionsFromLink(new URLSearchParams('title=x&height=1500')));
  assert.deepEqual([tall.width, tall.height], [1000, 1500]);
  const fractional = createCover(optionsFromLink(new URLSearchParams('title=x&width=600.4')));
  assert.deepEqual([fractional.width, fractional.height], [600, 900]);
  assert.throws(
    () => createCover(optionsFromLink(new URLSearchParams('title=x&height=73'))),
    /height 73 makes a paperback 49 px wide/,
  );
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

// (resvg is a dev dependency: the PNG tests are skipped where it isn't installed, as in CI's bare jobs.)
const noResvg = (await import('@resvg/resvg-wasm').then(() => false).catch(() => true))
  ? 'resvg is a dev dependency: run npm ci'
  : false;
if (noResvg && process.env.REQUIRE_RESVG) throw new Error('REQUIRE_RESVG: @resvg/resvg-wasm is not installed');

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
        return new Response(await readFile(new URL(`../${file}`, import.meta.url)), { headers: { ETag: '"page"' } });
      },
    },
    // (Only the PNG tests need it.)
    RESVG_WASM: await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)).catch(
      () => undefined,
    ),
  };
};

test(
  'PNG covers and mockups: drawn with open fonts, scaled, capped, and refused for scripts they lack',
  { skip: noResvg },
  async () => {
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
    assert.deepEqual(await size(await fetchPath('/api/cover.png?title=Dune&scale=1.2&format=square')), [720, 720]);
    // A cover that fits is drawn at its size, to the pixel.
    assert.deepEqual(await size(await fetchPath('/api/cover.png?title=Dune&width=600&height=1000')), [600, 1000]);
    assert.deepEqual(await size(await fetchPath('/api/mockup.png?title=Dune&kind=card')), [1200, 630]);
    // A story at its full size: a mockup shows the cover as a picture drawn first, so it costs little.
    assert.deepEqual(await size(await fetchPath('/api/mockup.png?title=Dune&kind=story')), [1080, 1920]);
    assert.equal(await (await fetchPath('/api/cover.png?title=Dune', 'HEAD')).text(), '');
    // A large cover is drawn smaller, to fit 600,000 pixels (resvg's memory in a Worker).
    const [w, h] = await size(await fetchPath('/api/cover.png?title=Dune&width=1600&height=2560'));
    assert.ok(w * h <= 600_000 && w * h > 590_000 && Math.abs(w / h - 1600 / 2560) < 0.01, `${w} × ${h}`);
    // A flat shot's shadow is as wide as its picture: it has fewer pixels (1.3 million).
    const [fw, fh] = await size(await fetchPath('/api/mockup.png?title=Dune&kind=flat&width=1600&height=2560'));
    assert.ok(fw * fh <= 1_300_000 && fw * fh > 1_280_000, `${fw} × ${fh}`);
    // A scale too small to draw anything is the request's mistake (400), and the engine stays.
    const tiny = await fetchPath('/api/cover.png?title=Dune&style=retro&seed=s&scale=0.0001');
    assert.equal(tiny.status, 400);
    assert.match(await tiny.text(), /draws 600 × 900 as nothing/);
    assert.equal((await fetchPath('/api/cover.png?title=Dune&scale=0.01')).status, 200);
    // A character no named face has (∞) is drawn from a family that has it.
    assert.equal((await fetchPath('/api/cover.png?title=Love+%E2%88%9E+Forever&style=classic&seed=s')).status, 200);
    // Designs resvg 2.6 once stopped on (opacity under a blur): drawn.
    for (const path of [
      '/api/cover.png?title=Dune&author=Frank+Herbert&style=aurora&seed=s',
      '/api/mockup.png?title=Dune&style=retro',
      '/api/mockup.png?title=Dune&style=hollow&kind=flat&seed=d',
    ]) {
      assert.equal((await fetchPath(path)).status, 200, path);
    }
    // What isn't drawn: a scale out of range or too large, a bad option, text the fonts lack.
    assert.match(
      await (await fetchPath('/api/cover.png?title=Dune&scale=9')).text(),
      /scale must be a number above 0, at most 4/,
    );
    const big = await fetchPath('/api/cover.png?title=Dune&scale=2');
    assert.equal(big.status, 400);
    assert.match(
      await big.text(),
      /A cover PNG has at most 600000 pixels; 1200 × 1800 is more: ask for a scale up to 1\.05/,
    );
    assert.equal((await fetchPath('/api/cover.png?title=Dune&style=nope')).status, 400);
    const japanese = await fetchPath(`/api/cover.png?title=${encodeURIComponent('灯台守')}`);
    assert.equal(japanese.status, 422);
    assert.match(await japanese.text(), /ask for the SVG/);
    // For a link preview, the site's own picture instead.
    const fallback = await fetchPath(`/api/mockup.png?kind=card&preview=1&title=${encodeURIComponent('灯台守')}`);
    assert.equal(fallback.status, 302);
    assert.equal(fallback.headers.get('location'), 'https://covers.example/og.png');
    assert.equal((await fetchPath('/api/cover.png', 'POST')).status, 405);
    // A scale that draws the cover in a mockup as nothing is the request's fault, as for a cover.
    const nothing = await fetchPath('/api/mockup.png?title=x&format=3000x1000&kind=card&scale=0.001');
    assert.equal(nothing.status, 400);
    assert.match(await nothing.text(), /as nothing/);
    // The MCP server answers a cover with its picture (a PNG at most 480 px wide), and keeps the
    // links of one in a script the PNG fonts lack.
    /** @param {string} title */
    const call = async (title) => {
      const res = await worker.fetch(
        new Request('https://covers.example/mcp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'create_mockup', arguments: { title, kind: 'story', text: 'Out now' } },
          }),
        }),
        env,
        ctx,
      );
      return (await res.json()).result;
    };
    const drawn = await call('Dune');
    const picture = drawn.content.find((/** @type {{ type: string }} */ c) => c.type === 'image');
    assert.equal(picture.mimeType, 'image/png');
    const view = new DataView(Uint8Array.from(atob(picture.data), (c) => c.charCodeAt(0)).buffer);
    assert.deepEqual([view.getUint32(16), view.getUint32(20)], [480, 853]);
    assert.match(drawn.structuredContent.pngUrl, /^https:\/\/covers\.example\/api\/mockup\.png\?/);
    // A cover taller than the picture's width allows is drawn within its height too.
    const tall = await worker.fetch(
      new Request('https://covers.example/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'create_cover', arguments: { title: 'Tall', format: '600x1800' } },
        }),
      }),
      env,
      ctx,
    );
    const tallPicture = (await tall.json()).result.content.find(
      (/** @type {{ type: string }} */ c) => c.type === 'image',
    );
    const tallView = new DataView(Uint8Array.from(atob(tallPicture.data), (c) => c.charCodeAt(0)).buffer);
    assert.deepEqual([tallView.getUint32(16), tallView.getUint32(20)], [320, 960]);
    const unwritten = await call('灯台守');
    assert.equal(unwritten.isError, undefined);
    // (A script the fonts lack is the design's answer: kept at the edge, as a drawing is.)
    const lacking = await fetchPath(`/api/cover.png?title=${encodeURIComponent('灯台守')}`);
    assert.equal(lacking.status, 422);
    assert.match(lacking.headers.get('cache-control') ?? '', /public/);
    assert.equal(unwritten.content.filter((/** @type {{ type: string }} */ c) => c.type === 'image').length, 0);
  },
);

test('a design’s link (/?title=…) gets its own link preview; the site’s headers come with it', async () => {
  const env = await siteEnv();
  const res = await worker.fetch(
    new Request('https://covers.example/?title=Dune&author=Frank+Herbert&style=retro&seed=s'),
    env,
    { waitUntil() {} },
  );
  assert.equal(res.status, 200);
  const html = await res.text();
  // (The page's own title stays the app's: the design changes as soon as it opens.)
  assert.match(html, /<title>Book Cover Generator: covers from a title and an author<\/title>/);
  assert.match(html, /<meta property="og:title" content="Dune by Frank Herbert"/);
  assert.match(
    html,
    /<meta property="og:url" content="https:\/\/covers\.example\/\?title=Dune&amp;author=Frank\+Herbert/,
  );
  // The card's picture is the design's own link (as the app writes it), as a card.
  const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1].replaceAll('&amp;', '&') ?? '';
  const card = new URL(image);
  assert.equal(card.pathname, '/api/mockup.png');
  assert.equal(card.searchParams.get('title'), 'Dune');
  assert.equal(card.searchParams.get('style'), 'retro');
  assert.equal(card.searchParams.get('kind'), 'card');
  assert.equal(card.searchParams.get('preview'), '1');
  // A link the app opens (a pin its style doesn't take, dropped) gets its card too, and the page's
  // other parameters (a scale, a download) never reach the picture.
  const odd = await (
    await worker.fetch(
      new Request('https://covers.example/?title=Dune&style=minimal&variant=align.left&scale=0.25&download=1&text=Hi'),
      env,
      { waitUntil() {} },
    )
  ).text();
  assert.match(odd, /<meta property="og:title" content="Dune"/);
  const oddImage = new URL(/<meta property="og:image" content="([^"]+)"/.exec(odd)?.[1].replaceAll('&amp;', '&') ?? '');
  for (const key of ['scale', 'download', 'text', 'variant']) assert.equal(oddImage.searchParams.get(key), null, key);
  assert.match(html, /<meta property="og:image:alt" content="The cover of Dune by Frank Herbert"/);
  // The page's validators don't describe the page rewritten.
  assert.equal(res.headers.get('etag'), null);
  // The page's security headers, which the static files' rules don't give a Worker's answer.
  assert.match(res.headers.get('content-security-policy') ?? '', /require-trusted-types-for 'script'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  // Markup in the title is escaped; a style the app doesn't know is one the seed picks, as the app
  // opens it, and its card shows that.
  const marked = await (
    await worker.fetch(new Request('https://covers.example/?title=%3Cb%3E%22x%22'), env, { waitUntil() {} })
  ).text();
  assert.match(marked, /<meta property="og:title" content="&lt;b&gt;&quot;x&quot;"/);
  const unknown = await (
    await worker.fetch(new Request('https://covers.example/?title=X&style=nope'), env, { waitUntil() {} })
  ).text();
  assert.match(unknown, /<meta property="og:title" content="X"/);
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

test('the API describes itself: what a query draws, the catalog, and OpenAPI', async () => {
  const { info } = await import('../worker/index.js');
  /** @param {string} path @param {string} [method] */
  const ask = async (path, method = 'GET') => {
    const res = /** @type {Response} */ (info(new Request(`https://covers.example${path}`, { method })));
    const json = method !== 'HEAD' && res.headers.get('content-type')?.startsWith('application/json');
    return { res, body: json ? await res.json() : await res.text() };
  };
  assert.equal(info(new Request('https://covers.example/api/nope.json')), null);
  // What a random style and palette came to, and the link that keeps them.
  const { res, body } = await ask('/api/cover.json?title=Dune&author=Frank+Herbert&style=random&seed=s');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const cover = createCover({ title: 'Dune', author: 'Frank Herbert', seed: 's' });
  assert.equal(body.style, cover.style);
  assert.equal(body.palette, cover.palette);
  assert.deepEqual(body.colors, cover.colors);
  assert.equal(body.seed, 's');
  assert.deepEqual([body.width, body.height], [600, 900]);
  const link = new URLSearchParams(body.link);
  assert.equal(link.get('style'), cover.style);
  assert.equal(link.get('palette'), cover.palette);
  assert.equal(createCover(optionsFromLink(link)).svg, cover.svg);
  assert.equal(body.urls.svg, `https://covers.example/api/cover.svg?${body.link}`);
  assert.equal(body.urls.edit, `https://covers.example/#${body.link}`);
  assert.equal(body.version, version);
  // A seed from the title stays one, and a cover without a language says so as null too.
  assert.equal((await ask('/api/cover.json?title=Dune')).body.seed, null);
  assert.equal((await ask('/api/cover.json?title=Dune')).body.lang, null);
  // A mockup's line that is null is no line (not the word "null").
  assert.doesNotMatch(
    createMockup(createCover({ title: 'Dune' }), { kind: 'card', text: /** @type {any} */ (null) }).svg,
    />null</,
  );
  // Its links draw the cover it describes, in the language the query gave (Turkish capitals).
  const turkish = (await ask('/api/cover.json?title=istanbul&lang=tr&style=bigtype&case=upper&seed=t')).body;
  assert.equal(new URLSearchParams(turkish.link).get('lang'), 'tr');
  const direct = /** @type {Response} */ (get('/api/cover.svg?title=istanbul&lang=tr&style=bigtype&case=upper&seed=t'));
  const linked = /** @type {Response} */ (get(new URL(turkish.urls.svg).pathname + new URL(turkish.urls.svg).search));
  assert.equal(await linked.text(), await direct.text());
  // Your own colours: one to three accents, as a link's palette holds.
  assert.equal((await ask('/api/cover.json?title=A&bg=000&ink=fff&accent=f00,0f0,00f')).res.status, 200);
  const four = await ask('/api/cover.json?title=A&bg=000&ink=fff&accent=f00,0f0,00f,ff0');
  assert.equal(four.res.status, 400);
  assert.match(four.body, /accent is one to three colours/);
  assert.equal((await ask('/api/cover.json?style=nope')).res.status, 400);
  assert.equal((await ask('/api/cover.json?title=x', 'HEAD')).body, '');

  const catalog = (await ask('/api/catalog.json')).body;
  const { listStyles, palettes, genres, mockupKinds } = await import('../src/index.js');
  assert.deepEqual(
    catalog.styles.map((/** @type {{ id: string }} */ s) => s.id),
    listStyles().map((s) => s.id),
  );
  assert.equal(catalog.palettes.length, palettes.length);
  assert.equal(catalog.genres.length, genres.length);
  assert.deepEqual(catalog.mockups, [...mockupKinds]);
  assert.equal(catalog.version, version);

  const spec = (await ask('/api/openapi.json')).body;
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.info.version, version);
  assert.deepEqual(spec.servers, [{ url: 'https://covers.example' }]);
  for (const path of ['/api/cover.svg', '/api/cover.png', '/api/mockup.svg', '/api/mockup.png', '/api/cover.json'])
    assert.ok(
      spec.paths[path].get.parameters.some((/** @type {{ name: string }} */ p) => p.name === 'title'),
      path,
    );
  const kind = spec.paths['/api/mockup.svg'].get.parameters.find(
    (/** @type {{ name: string }} */ p) => p.name === 'kind',
  );
  assert.deepEqual(kind.schema.enum, [...mockupKinds]);
  // Every parameter it names is one the API reads (it refuses none of them as unknown).
  assert.equal((await ask('/api/openapi.json', 'POST')).res.status, 405);
});

test('download names the file after the title, or as asked', async () => {
  const plain = /** @type {Response} */ (get('/api/cover.svg?title=Dune'));
  assert.equal(plain.headers.get('content-disposition'), null);
  // Off as the other switches are.
  for (const off of ['0', 'false', 'FALSE', '']) {
    const res = /** @type {Response} */ (get(`/api/cover.svg?title=Dune&download=${off}`));
    assert.equal(res.headers.get('content-disposition'), null, off);
  }
  const named = /** @type {Response} */ (get('/api/cover.svg?title=The+Café+Days&download=1'));
  assert.equal(
    named.headers.get('content-disposition'),
    `attachment; filename="the-cafe-days.svg"; filename*=UTF-8''the-cafe-days.svg`,
  );
  const asked = /** @type {Response} */ (get('/api/mockup.svg?title=Dune&kind=card&download=My+Card'));
  assert.equal(
    asked.headers.get('content-disposition'),
    `attachment; filename="my-card.svg"; filename*=UTF-8''my-card.svg`,
  );
  // (A mockup's kind in any case, as the API's other values.)
  assert.equal(/** @type {Response} */ (get('/api/mockup.svg?title=Dune&kind=Card')).status, 200);
  const shown = createMockup(createCover({ title: 'Dune' }), { kind: 'story' });
  assert.ok(shown.coverScale > 1, `a story shows the cover larger: ${shown.coverScale}`);
  assert.equal(createMockup(createCover({ title: 'Dune' }), { kind: 'flat' }).coverScale, 1);
  const mockup = /** @type {Response} */ (get('/api/mockup.svg?title=Dune&kind=card&download=1'));
  assert.match(mockup.headers.get('content-disposition') ?? '', /filename="dune-card\.svg"/);
  const japanese = /** @type {Response} */ (get(`/api/cover.svg?title=${encodeURIComponent('灯台守')}&download=1`));
  assert.equal(
    japanese.headers.get('content-disposition'),
    `attachment; filename="___.svg"; filename*=UTF-8''${encodeURIComponent('灯台守.svg')}`,
  );
});

test('PNGs and MCP requests past a client’s limit are refused with 429; cached answers aren’t counted', async () => {
  /** A limiter that allows `n` requests in all, recording the keys asked about. @param {number} n */
  const limiter = (n) => ({
    /** @type {string[]} */ keys: [],
    /** @param {{ key: string }} o */
    async limit({ key }) {
      this.keys.push(key);
      return { success: this.keys.length <= n };
    },
  });
  const png = limiter(0);
  const mcpLimit = limiter(0);
  const env = { PNG_LIMIT: png, MCP_LIMIT: mcpLimit };
  const ctx = { waitUntil() {} };
  const headers = { 'cf-connecting-ip': '203.0.113.9' };
  const busy = await worker.fetch(
    new Request('https://covers.example/api/cover.png?title=Dune', { headers }),
    env,
    ctx,
  );
  assert.equal(busy.status, 429);
  assert.equal(busy.headers.get('retry-after'), '60');
  assert.match(await busy.text(), /Too many requests/);
  assert.deepEqual(png.keys, ['203.0.113.9']);
  // A query the library refuses is refused before the limit is asked (or resvg started).
  for (const query of [
    'title=Dune&style=nope',
    'title=Dune&scale=9',
    'title=Dune&scale=4',
    'title=Dune&scale=0.0001',
    'title=Dune&kind=nope',
    'title=Dune&kind=story&scale=4',
  ]) {
    const path = query.includes('kind') ? '/api/mockup.png' : '/api/cover.png';
    const bad = await worker.fetch(new Request(`https://covers.example${path}?${query}`, { headers }), env, ctx);
    assert.equal(bad.status, 400, query);
  }
  assert.deepEqual(png.keys, ['203.0.113.9']);
  // SVGs and descriptions are cheap: never limited.
  const svg = await worker.fetch(new Request('https://covers.example/api/cover.svg?title=Dune', { headers }), env, ctx);
  assert.equal(svg.status, 200);
  assert.equal(png.keys.length, 1);
  // A link preview's picture is never an error: past the limit, it's the site's own image.
  const preview = await worker.fetch(
    new Request('https://covers.example/api/mockup.png?title=Dune&kind=card&preview=1', { headers }),
    env,
    ctx,
  );
  assert.equal(preview.status, 302);
  assert.equal(preview.headers.get('location'), 'https://covers.example/og.png');
  const post = new Request('https://covers.example/mcp', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
  const refused = await worker.fetch(post, env, ctx);
  assert.equal(refused.status, 429);
  assert.equal(refused.headers.get('retry-after'), '60');
  assert.equal((await refused.json()).error.code, -32000);
  // A limiter that fails stops nothing: the limit is a courtesy.
  const broken = {
    async limit() {
      throw new Error('binding down');
    },
  };
  const unlimited = await worker.fetch(
    new Request('https://covers.example/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    }),
    { MCP_LIMIT: broken },
    ctx,
  );
  assert.equal(unlimited.status, 200);
  // Within the limit, the answer.
  const open = await worker.fetch(
    new Request('https://covers.example/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    }),
    { MCP_LIMIT: limiter(1) },
    ctx,
  );
  assert.equal(open.status, 200);
});

test('the cache key keeps every parameter the API reads (OpenAPI’s, at least)', async () => {
  const { API_PARAMETERS } = await import('../worker/index.js');
  const { openapi } = await import('../worker/openapi.js');
  const spec = openapi('https://covers.example');
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const p of /** @type {any} */ (item).get?.parameters ?? [])
      assert.ok(API_PARAMETERS.includes(p.name), `${path} ${p.name}`);
  }
});

test('a link names its language, and the app’s link reader takes it (and only a tag)', async () => {
  const { LINK, writeLink, LINK_FIELDS } = await import('../src/link.js');
  assert.equal(LINK.lang(' tr '), 'tr');
  assert.equal(LINK.lang('zh-Hant'), 'zh-Hant');
  for (const bad of ['', 'turkish!', 'x', `en-${'a'.repeat(40)}`]) assert.equal(LINK.lang(bad), undefined, bad);
  const empty = Object.fromEntries(Object.entries(LINK_FIELDS).map(([k, f]) => [k, f.empty]));
  assert.equal(writeLink({ ...empty, title: 'x' }).has('lang'), false);
  assert.equal(writeLink({ ...empty, title: 'x', lang: 'tr' }).get('lang'), 'tr');
  // The API reads it as the app does: trimmed, and an error where the app would drop it.
  assert.equal(optionsFromLink(new URLSearchParams('title=x&lang=%20tr')).lang, 'tr');
  assert.throws(
    () => optionsFromLink(new URLSearchParams(`title=x&lang=en-${'a'.repeat(40)}`)),
    /lang must be a language tag/,
  );
});

test('cover.json’s link draws the very bytes its query does, colours of three digits too', async () => {
  const { info } = await import('../worker/index.js');
  const query = 'title=Dune&bg=000&ink=FFF&accent=f00&seed=c';
  const res = /** @type {Response} */ (info(new Request(`https://covers.example/api/cover.json?${query}`)));
  const { link } = await res.json();
  assert.equal(new URLSearchParams(link).get('palette'), 'custom-000000-ffffff-ff0000');
  const direct = await /** @type {Response} */ (get(`/api/cover.svg?${query}`)).text();
  const linked = await /** @type {Response} */ (get(`/api/cover.svg?${link}`)).text();
  assert.equal(linked, direct);
});

test('a pin of a registered style named in capitals stays in the link, as links hold names', async () => {
  const { registerStyle, unregisterStyle } = await import('../src/index.js');
  const { linkOf } = await import('../src/link.js');
  registerStyle({
    id: 'camel-test',
    name: 'Camel test',
    group: 'Test',
    description: 'A test style.',
    variants: { bigSky: { values: { yes: 'Yes', noWay: 'No way' } } },
    render: (/** @type {any} */ c) =>
      `<rect width="${c.W}" height="${c.H}" fill="${c.choose('bigSky', ['yes', 'noWay']) === 'yes' ? c.p.bg : c.p.ink}"/>`,
  });
  try {
    const options = { title: 'T', style: 'camel-test', seed: 's', variants: { bigSky: 'noWay' } };
    const cover = createCover(options);
    assert.equal(new URLSearchParams(linkOf(options, cover)).get('variant'), 'bigsky.noway');
    // …which draws that pin again.
    assert.deepEqual(createCover(optionsFromLink(linkOf(options, cover))).variants, cover.variants);
  } finally {
    unregisterStyle('camel-test');
  }
});

test('a format is read in any case, as every other link value', async () => {
  const { LINK } = await import('../src/link.js');
  assert.equal(LINK.format('Ebook'), 'ebook');
  assert.equal(LINK.format('1600X2560'), '1600x2560');
  assert.equal(LINK.format('1600 × 2560'), '1600x2560');
  assert.deepEqual(optionsFromLink(new URLSearchParams('format=SQUARE')), { width: 600, height: 600 });
  assert.deepEqual(optionsFromLink(new URLSearchParams('format=1600X2560')), { width: 1600, height: 2560 });
});
