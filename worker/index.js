// The site's Worker: an HTTP API that draws covers (/api/cover.svg and .png, /api/mockup.svg and
// .png) and describes them (/api/cover.json, /api/catalog.json, /api/openapi.json), the MCP
// endpoint at /mcp, and a design's link (/?title=…) with its own link preview. Everything else is
// the static site (wrangler.jsonc sends only those here).
//
//   <img src="https://covers.otsirh.dev/api/cover.svg?title=Dune&author=Frank+Herbert">
//
// The query is the app's link: any design's link (the part after #) draws that design. Text is
// measured with the built-in fonts' widths (src/metrics.js), as macOS draws them, so it can break
// a little differently from the app on another system, which measures with its own fonts.

import { createCover, createMockup, mockupKinds, version } from '../src/index.js';
import { hex, slug } from '../src/shared.js';
import { optionsFromLink, linkOf, LINK_FIELDS } from '../src/link.js';
import { answerPayload, catalog } from '../src/mcp.js';
import { escapeXml, isHex } from '../src/core.js';
import { COVER_PIXELS, MOCKUP_PIXELS, SHADOWED_PIXELS, pngEngine } from './png.js';
import { openapi } from './openapi.js';

/**
 * The site's headers (public/_headers, /*), for the pages the Worker answers itself: the static
 * assets' rules don't reach a Worker's answers. (A test keeps the two the same.)
 */
export const SITE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types sw",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** Headers every answer has: anyone may embed it, and it's never taken for anything but what it is. */
const COMMON = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'X-Cover-Style, X-Cover-Palette, X-Cover-Version',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

/**
 * A CORS preflight's answer, or a refusal of any method but GET and HEAD; null for those.
 * @param {Request} request
 */
function notGet(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...COMMON,
        'Access-Control-Allow-Methods': 'GET, HEAD',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Use GET\n', {
      status: 405,
      headers: { ...COMMON, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return null;
}

/** @param {unknown} err @param {number} [status] @param {Record<string, string>} [extra] headers */
const refusal = (err, status = 400, extra = {}) =>
  new Response(`${err instanceof Error ? err.message : String(err)}\n`, {
    status,
    headers: { ...COMMON, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

/**
 * @typedef {{ limit(options: { key: string }): Promise<{ success: boolean }> }} RateLimit
 * A Workers rate limiter (wrangler.jsonc `ratelimits`): so many requests a minute for each key.
 */

/**
 * Whether this client may make another request of `limiter` this minute. Keyed by the client's
 * address; without a limiter (Node, tests, a copy of the Worker without one), always.
 * @param {Request} request @param {RateLimit | undefined} limiter
 */
async function allowed(request, limiter) {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
    return success;
  } catch (err) {
    // (The limit is a courtesy: a fault in it never stops a drawing.)
    console.error('Rate limiter:', err);
    return true;
  }
}

/** What a client that asked too much is told, and when to ask again. */
const TOO_MANY = 'Too many requests: wait a minute, or draw covers in your own code with the library';

/**
 * The header that makes an answer a download (`download` in the query), named after the title,
 * or as `download=` names it; none without it.
 * @param {URLSearchParams} q @param {string} title @param {string} ext
 * @returns {Record<string, string>}
 */
function disposition(q, title, ext) {
  const asked = q.getAll('download').at(-1)?.trim();
  // (Off as the API's other switches are: 0 or false, or not given, or empty.)
  if (!asked || /^(0|false)$/i.test(asked)) return {};
  const name = `${slug(asked && !/^(1|true)$/i.test(asked) ? asked : title)}.${ext}`;
  // (A name in ASCII for older clients, and the name itself, encoded, for the rest.)
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  return { 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}` };
}

/** A cover's or a mockup's file name, without its extension. @param {'cover' | 'mockup'} kind @param {URLSearchParams} q @param {string} title */
const fileTitle = (kind, q, title) => (kind === 'cover' ? title : `${title} ${mockupOptions(q).kind}`);

/**
 * The cover a query draws (the app's link), or its mockup, as SVG.
 * @param {'cover' | 'mockup'} kind @param {URLSearchParams} q
 */
function drawn(kind, q) {
  const cover = createCover(optionsFromLink(q));
  if (kind === 'cover') return { cover, svg: cover.svg, width: cover.width, height: cover.height };
  const mockup = createMockup(cover, mockupOptions(q));
  return { cover, svg: mockup.svg, width: mockup.width, height: mockup.height };
}

/** A mockup's options from a query: kind, text and background. @param {URLSearchParams} q */
function mockupOptions(q) {
  const background = q.getAll('background').at(-1);
  return {
    kind: /** @type {import('../src/index.js').MockupKind} */ (q.getAll('kind').at(-1) || 'book'),
    text: q.getAll('text').at(-1) ?? '',
    background: background ? hex(background) : undefined,
  };
}

/** Bytes as base64 (btoa takes a binary string; made in slices, so no argument list grows too long). @param {Uint8Array} bytes */
function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** What every drawn answer says of the cover. @param {ReturnType<typeof createCover>} cover */
const about = (cover) => ({
  'X-Cover-Style': cover.style,
  'X-Cover-Palette': cover.palette,
  'X-Cover-Version': version,
});

/**
 * Answer an API request for SVG (or say it isn't one: null).
 * @param {Request} request
 * @returns {Response | null}
 */
export function api(request) {
  const url = new URL(request.url);
  const kind = url.pathname === '/api/cover.svg' ? 'cover' : url.pathname === '/api/mockup.svg' ? 'mockup' : null;
  if (!kind) return null;
  const refused = notGet(request);
  if (refused) return refused;
  try {
    const { cover, svg } = drawn(kind, url.searchParams);
    return new Response(request.method === 'HEAD' ? null : svg, {
      headers: {
        ...COMMON,
        'Content-Type': 'image/svg+xml; charset=utf-8',
        // The same query always draws the same cover in a version of the library.
        'Cache-Control': 'public, max-age=86400',
        // Opened on its own, the SVG may style itself and nothing else.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        ...about(cover),
        ...disposition(url.searchParams, fileTitle(kind, url.searchParams, cover.title), 'svg'),
      },
    });
  } catch (err) {
    return refusal(err);
  }
}

/**
 * What a query draws, described: the cover's text, style, palette and colours, seed, size and
 * pins, its link with every choice written out (so a random style or palette stays the one it
 * came to), and where to get it.
 * @param {URLSearchParams} q @param {string} base the site
 */
function described(q, base) {
  const options = optionsFromLink(q);
  const cover = createCover(options);
  const link = linkOf(options, cover);
  return {
    title: cover.title,
    author: cover.author,
    style: cover.style,
    palette: cover.palette,
    colors: cover.colors,
    // (Null when it comes from the title: the same title gives the same cover.)
    seed: options.seed != null ? cover.seed : null,
    width: cover.width,
    height: cover.height,
    lang: cover.lang || null,
    variants: cover.variants,
    link: link.toString(),
    urls: {
      svg: `${base}/api/cover.svg?${link}`,
      png: `${base}/api/cover.png?${link}`,
      edit: `${base}/#${link}`,
      share: `${base}/?${link}`,
    },
    version,
  };
}

/**
 * Answer a request for the API's own description (or say it isn't one: null): what a query draws
 * (/api/cover.json), what covers can be made of (/api/catalog.json), and the API as OpenAPI
 * (/api/openapi.json).
 * @param {Request} request
 * @returns {Response | null}
 */
export function info(request) {
  const url = new URL(request.url);
  const make = {
    '/api/cover.json': () => described(url.searchParams, url.origin),
    '/api/catalog.json': () => catalog(),
    '/api/openapi.json': () => openapi(url.origin),
  }[url.pathname];
  if (!make) return null;
  const refused = notGet(request);
  if (refused) return refused;
  try {
    const body = `${JSON.stringify(make(), null, 2)}\n`;
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: {
        ...COMMON,
        'Content-Type': 'application/json; charset=utf-8',
        // (The catalog and the description change with a release; a cover's, with its query.)
        'Cache-Control': url.pathname === '/api/cover.json' ? 'public, max-age=86400' : 'public, max-age=3600',
        'X-Cover-Version': version,
      },
    });
  } catch (err) {
    return refusal(err);
  }
}

/**
 * @typedef {object} Env
 * @property {{ fetch(request: Request): Promise<Response> }} [ASSETS]  the site's files
 * @property {{ id: string }} [CF_VERSION_METADATA]  this deployment
 * @property {WebAssembly.Module | BufferSource} [RESVG_WASM]  resvg's WebAssembly, where it can't be imported (Node)
 * @property {RateLimit} [PNG_LIMIT]  how many PNGs a client may have drawn a minute (cached ones are free)
 * @property {RateLimit} [MCP_LIMIT]  how many MCP requests a client may make a minute
 */

/** The PNG engine, made once an instance needs it. @type {Promise<Awaited<ReturnType<typeof pngEngine>>> | null} */
let engine = null;

/**
 * Stop handing out an engine whose resvg trapped: the next request makes a new one. (Only if the
 * engine on hand is still that one: another request may have replaced it while this one waited.)
 * @param {Awaited<ReturnType<typeof pngEngine>>} drawer
 */
async function retire(drawer) {
  const held = engine;
  try {
    if (held && (await held) === drawer && engine === held) engine = null;
  } catch {
    // (The engine on hand failed to start: pngEngineFor has let it go already.)
  }
}

/** The site's font files, read once for every engine. @type {Map<string, Promise<Uint8Array>>} */
const fontFiles = new Map();

/**
 * resvg and the fonts, ready: a copy of resvg of its own (worker/resvg-glue.js), so an engine
 * whose resvg trapped is replaced by a new one, on the WebAssembly that comes with the Worker (in
 * Node, as env.RESVG_WASM); the fonts are the site's own files (public/fonts).
 * @param {Env} env @param {string} origin
 */
function pngEngineFor(env, origin) {
  if (!engine) {
    /** @param {string} file */
    const fontFile = (file) => {
      let read = fontFiles.get(file);
      if (!read) {
        read = (async () => {
          if (!env.ASSETS) throw new Error('No site files to read the fonts from');
          const res = await env.ASSETS.fetch(new Request(new URL(`/fonts/${file}`, origin)));
          if (!res.ok) throw new Error(`fonts/${file}: ${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        })();
        fontFiles.set(file, read);
        // (A failure isn't kept: the next engine reads it again.)
        read.catch(() => fontFiles.delete(file));
      }
      return read;
    };
    const made = (async () => {
      const [{ createResvg }, wasm] = await Promise.all([
        import('./resvg-glue.js'),
        env.RESVG_WASM ?? import('./resvg-wasm.js').then((m) => m.default),
      ]);
      return pngEngine(createResvg(), wasm, fontFile);
    })();
    // (A failure isn't kept: the next request tries again.)
    made.catch(() => {
      if (engine === made) engine = null;
    });
    engine = made;
  }
  return engine;
}

/**
 * How many times its own size a mockup shows the cover at (the largest place it nests it).
 * @param {string} mockup the mockup's SVG @param {{ width: number, height: number }} cover
 */
function shownAt(mockup, cover) {
  const nests = mockup.matchAll(
    new RegExp(`<svg [^>]*\\bwidth="([\\d.]+)" height="([\\d.]+)" viewBox="0 0 ${cover.width} ${cover.height}"`, 'g'),
  );
  let most = 0;
  for (const [, w, h] of nests) most = Math.max(most, Number(w) / cover.width, Number(h) / cover.height);
  return most || 1;
}

/**
 * Answer an API request for PNG (or say it isn't one: null): the cover drawn by resvg with open
 * fonts, laid out in their widths. `scale` (1 to 4) multiplies its size. Text in a script the
 * fonts lack (Chinese, Japanese, Arabic…) is refused (the SVG draws it), or, for a link preview
 * (`preview`), answered with the site's own image.
 * @param {Request} request @param {Env} env
 * @returns {Promise<Response | null>}
 */
export async function png(request, env) {
  const url = new URL(request.url);
  const kind = url.pathname === '/api/cover.png' ? 'cover' : url.pathname === '/api/mockup.png' ? 'mockup' : null;
  if (!kind) return null;
  const answer = await drawPng(request, env, url, kind);
  // A link preview's picture that can't be drawn (too many asked of the crawler's address, resvg
  // unavailable or failed, a script the fonts lack) is the site's own: never an error card.
  if (!answer.ok && answer.status !== 405 && url.searchParams.has('preview')) {
    return Response.redirect(new URL('/og.png', url).href, 302);
  }
  return answer;
}

/**
 * A PNG answer: the picture, or why not.
 * @param {Request} request @param {Env} env @param {URL} url @param {'cover' | 'mockup'} kind
 * @returns {Promise<Response>}
 */
async function drawPng(request, env, url, kind) {
  const refused = notGet(request);
  if (refused) return refused;
  const q = url.searchParams;
  // A query the library refuses is refused before anything costly (the limit, resvg, the fonts):
  // the scale, the cover's options, and the mockup's. (The cover is drawn again, laid out in the
  // PNG fonts.)
  const asked = q.getAll('scale').at(-1);
  const given = asked === undefined || asked === '' ? null : Number(asked);
  if (given !== null && !(given > 0 && given <= 4)) {
    return refusal(new RangeError(`scale must be a number above 0, at most 4, got "${asked}"`));
  }
  try {
    createCover(optionsFromLink(q));
    if (kind === 'mockup') {
      const { kind: shape, background } = mockupOptions(q);
      if (!mockupKinds.includes(shape))
        throw new RangeError(`Unknown mockup "${shape}". Available: ${mockupKinds.join(', ')}`);
      if (background !== undefined && !isHex(background)) {
        throw new RangeError(`background must be a hex colour, got ${JSON.stringify(background)}`);
      }
    }
  } catch (err) {
    return refusal(err);
  }
  if (!(await allowed(request, env.PNG_LIMIT))) return refusal(new Error(TOO_MANY), 429, { 'Retry-After': '60' });
  let drawer;
  try {
    drawer = await pngEngineFor(env, url.origin);
  } catch (err) {
    console.error(err);
    return refusal(new Error('PNG covers are unavailable just now: ask for the SVG (cover.svg)'), 503);
  }
  // (An engine whose resvg trapped on an earlier drawing draws no more: a new one takes its place.)
  if (drawer.trapped) {
    await retire(drawer);
    try {
      drawer = await pngEngineFor(env, url.origin);
    } catch (err) {
      console.error(err);
      return refusal(new Error('PNG covers are unavailable just now: ask for the SVG (cover.svg)'), 503);
    }
  }
  try {
    const { cover, svg, width, height } = drawer.laidOut(() => drawn(kind, q));
    // At its size, or smaller to fit (a large cover, a story); a scale asked for that can't fit is
    // refused. (Auto a hair under the limit, as resvg rounds the size.)
    const shadowed = /^(flat|ereader)$/.test(mockupOptions(q).kind);
    const most = kind === 'cover' ? COVER_PIXELS : shadowed ? SHADOWED_PIXELS : MOCKUP_PIXELS;
    const fit = Math.sqrt(most / (width * height));
    const scale = given ?? (fit >= 1 ? 1 : fit * 0.995);
    const [w, h] = [Math.ceil(width * scale), Math.ceil(height * scale)];
    if (w * h > most) {
      throw new RangeError(
        `A ${kind} PNG has at most ${most} pixels; ${w} × ${h} is more: ask for a scale up to ${Math.floor(fit * 100) / 100}, the SVG, or a large PNG from the app`,
      );
    }
    if (Math.round(width * scale) < 1 || Math.round(height * scale) < 1) {
      throw new RangeError(`scale ${scale} draws ${width} × ${height} as nothing: ask for a larger scale`);
    }
    if (!drawer.draws(svg)) {
      return refusal(
        new RangeError(
          'The PNG fonts have Latin, Greek and Cyrillic letters, not all of this text: ask for the SVG (cover.svg), which your fonts draw',
        ),
        422,
      );
    }
    let bytes;
    try {
      if (kind === 'cover') bytes = drawer.render(svg, scale);
      else {
        // The cover drawn first, then shown in the mockup as that picture: its own filters, under
        // the mockup's shadow, would take resvg several times the memory.
        // (At the size the mockup shows it, at most COVER_PIXELS.)
        const pictureScale = Math.min(
          scale * shownAt(svg, cover),
          0.995 * Math.sqrt(COVER_PIXELS / (cover.width * cover.height)),
        );
        if (Math.round(cover.width * pictureScale) < 1 || Math.round(cover.height * pictureScale) < 1) {
          return refusal(
            new RangeError(`scale ${scale} draws the cover in this mockup as nothing: ask for a larger scale`),
          );
        }
        const picture = drawer.render(cover.svg, pictureScale);
        const body = `<image width="${cover.width}" height="${cover.height}" href="data:image/png;base64,${base64(picture)}"/>`;
        const flat = drawer.laidOut(() => createMockup({ ...cover, body }, mockupOptions(q)));
        bytes = drawer.render(flat.svg, scale);
      }
    } catch (err) {
      // resvg failed: our fault, not the request's. (What was drawn, without the visitor's text.)
      console.error(`PNG ${kind} in ${cover.style}, ${width} × ${height} at ${scale}:`, err);
      // (Not kept: it may be this instance's state, not the design's. If resvg trapped, the next
      // request gets an engine with a new one.)
      if (drawer.trapped) await retire(drawer);
      return refusal(new Error('The PNG could not be drawn: ask for the SVG (cover.svg)'), 500);
    }
    return new Response(request.method === 'HEAD' ? null : /** @type {BodyInit} */ (bytes), {
      headers: {
        ...COMMON,
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        ...about(cover),
        ...disposition(q, fileTitle(kind, q, cover.title), 'png'),
      },
    });
  } catch (err) {
    return refusal(err);
  }
}

/**
 * The app's page for a design's link (/?title=…, as Copy link makes it): with the design's own
 * title and picture for link previews (a social card of it), which a link's #fragment can't give
 * (it never reaches the server). The app moves the design to the #fragment as it opens. (Only the
 * og: tags change: the page's own <title> stays the app's, as the design changes as soon as it opens.)
 * @param {Request} request @param {Env} env
 * @returns {Promise<Response | null>}
 */
export async function preview(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/' || !url.searchParams.has('title') || !env.ASSETS) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const page = await env.ASSETS.fetch(new Request(new URL('/', url)));
  if (!page.ok) return page;
  let html = await page.text();
  let name = '';
  try {
    const cover = createCover(optionsFromLink(url.searchParams));
    name = `${cover.title.replace(/\n/g, ' ')}${cover.author ? ` by ${cover.author}` : ''}`;
  } catch {
    // A link the library refuses: the page as it is (the app says what's wrong).
  }
  if (name) {
    const image = new URL('/api/mockup.png', url);
    image.search = url.search;
    image.searchParams.set('kind', 'card');
    image.searchParams.set('preview', '1');
    /** @param {RegExp} re @param {string} value */
    const set = (re, value) => {
      html = html.replace(re, (_, start) => `${start}${escapeXml(value)}`);
    };
    set(/(<meta property="og:title" content=")[^"]*/, name);
    set(/(<meta property="og:url" content=")[^"]*/, url.href);
    set(/(<meta property="og:image" content=")[^"]*/, image.href);
    set(/(<meta property="og:image:alt" content=")[^"]*/, `The cover of ${name}`);
  }
  const headers = new Headers(page.headers);
  for (const [k, v] of Object.entries(SITE_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  headers.set('Cache-Control', 'public, max-age=300');
  // (The page's own length, tag and cache state don't describe the page rewritten.)
  for (const header of ['Content-Length', 'ETag', 'Last-Modified', 'CF-Cache-Status']) headers.delete(header);
  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
}

/**
 * The query parameters the API reads (every other is ignored): a design's (the app's link and the
 * library's option names), a mockup's, a PNG's, and a download's name.
 */
export const API_PARAMETERS = Object.freeze([
  ...Object.keys(LINK_FIELDS),
  ...['genre', 'width', 'height', 'titleCase', 'bg', 'ink', 'accent'],
  ...['kind', 'text', 'background', 'scale', 'preview', 'download'],
]);

/**
 * Where an answer is kept at the edge: its path and the parameters the API reads, so a parameter
 * it ignores (`&x=1`) doesn't draw it again. The `v` an app link names is ignored too (the API
 * draws with the code deployed), so the key names this deployment instead: every deploy draws
 * anew, even one between releases. A HEAD is answered from the GET's.
 * @param {Request} request @param {string} deployment
 */
function cacheKey(request, deployment) {
  const url = new URL(request.url);
  const read = new URLSearchParams(
    [...url.searchParams].filter(([name]) => name !== 'v' && API_PARAMETERS.includes(name)),
  );
  // (In any order, one design: sorted by name, the values of a repeated one in their order.)
  read.sort();
  url.search = read.toString();
  url.searchParams.set('v', `${version}+${deployment}`);
  return new Request(url.href, { method: 'GET' });
}

/** The largest body the MCP endpoint reads, in bytes. */
const MCP_MAX_BODY = 1_000_000;

/** Headers of the MCP endpoint's answers: any page or client may call it. */
const MCP_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

/**
 * The MCP endpoint at /mcp (Streamable HTTP, without sessions or streams): POST a JSON-RPC message
 * (or a batch), get the answer as JSON; a notification gets 202. Covers it draws link to this
 * site, and come with their picture when `draw` can fetch the API's PNGs. Null for any other path.
 * @param {Request} request @param {Env} [env] @param {(url: URL) => Promise<Response>} [draw]
 * @returns {Promise<Response | null>}
 */
export async function mcp(request, env = {}, draw) {
  const url = new URL(request.url);
  if (url.pathname !== '/mcp') return null;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...MCP_HEADERS,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Protocol-Version, Mcp-Session-Id',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  /** @param {number} status @param {string} text */
  const jsonText = (status, text) =>
    new Response(text, {
      status,
      headers: { ...MCP_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  /** @param {number} status @param {unknown} body */
  const json = (status, body) => jsonText(status, JSON.stringify(body));
  if (request.method !== 'POST') {
    return new Response('POST JSON-RPC messages here (this server streams nothing).\n', {
      status: 405,
      headers: { ...MCP_HEADERS, Allow: 'POST, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  if (!(await allowed(request, env.MCP_LIMIT))) {
    const busy = json(429, { jsonrpc: '2.0', id: null, error: { code: -32000, message: TOO_MANY } });
    busy.headers.set('Retry-After', '60');
    return busy;
  }
  // At most 1 MB: refused up front when it says so, else as soon as it reads past it (a chunked
  // body says nothing), so a huge body is never held whole.
  const tooLarge = () => json(413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } });
  if (Number(request.headers.get('content-length') ?? 0) > MCP_MAX_BODY) return tooLarge();
  const chunks = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MCP_MAX_BODY) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  const body = new TextDecoder().decode(bytes);
  let message;
  try {
    message = JSON.parse(body);
  } catch {
    return json(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  const answer = answerPayload(message, { base: url.origin, pictures: Boolean(draw) });
  if (answer === null) return new Response(null, { status: 202, headers: MCP_HEADERS });
  return jsonText(200, draw ? await withPictures(answer, url.origin, draw) : answer);
}

/** The most pictures one MCP answer holds (a batch can draw twenty covers). */
const MCP_PICTURES = 4;
/** How wide and tall a picture in an MCP answer is at most, in px: enough to judge it, small to send. */
const MCP_PICTURE_WIDTH = 480;
const MCP_PICTURE_HEIGHT = 960;

/**
 * An MCP answer (JSON) with the picture added to each cover or mockup it drew (the first few), as
 * an image the assistant can see and the client can show: the PNG the HTTP API draws, at most
 * MCP_PICTURE_WIDTH wide. A cover whose PNG can't be drawn (a script the fonts lack) keeps its links.
 * @param {string} answer @param {string} origin
 * @param {(url: URL) => Promise<Response>} draw  fetches a PNG of the API
 */
async function withPictures(answer, origin, draw) {
  const parsed = JSON.parse(answer);
  const results = (Array.isArray(parsed) ? parsed : [parsed])
    .map((message) => message?.result)
    .filter((result) => !result?.isError && typeof result?.structuredContent?.pngUrl === 'string')
    .filter((result) => new URL(result.structuredContent.pngUrl).origin === origin)
    .slice(0, MCP_PICTURES);
  // (Drawn at once; a picture that fails is left out, never the answer.)
  await Promise.all(
    results.map(async (result) => {
      const { pngUrl, width, height } = result.structuredContent;
      const url = new URL(pngUrl);
      url.searchParams.set('scale', String(Math.min(1, MCP_PICTURE_WIDTH / width, MCP_PICTURE_HEIGHT / height)));
      try {
        const res = await draw(url);
        if (!res.ok || res.headers.get('Content-Type') !== 'image/png') return;
        const data = base64(new Uint8Array(await res.arrayBuffer()));
        result.content.push({ type: 'image', data, mimeType: 'image/png' });
      } catch (err) {
        console.error('An MCP picture:', err);
      }
    }),
  );
  return JSON.stringify(parsed);
}

/**
 * Answer a request the Worker runs first for (wrangler.jsonc): the MCP endpoint, a design's link,
 * the API (from the edge's cache when it can), and the site's files for anything else.
 * @param {Request} request
 * @param {Env} env
 * @param {{ waitUntil(promise: Promise<unknown>): void }} ctx
 * @returns {Promise<Response>}
 */
async function handle(request, env, ctx) {
  // (A cover's picture is the API's PNG, fetched as this client: cached, and within its limit. The
  // PNG fonts are the site's files: without them, no pictures.)
  const ip = request.headers.get('cf-connecting-ip');
  /** @param {URL} url */
  const fetchPng = (url) => handle(new Request(url, { headers: ip ? { 'cf-connecting-ip': ip } : {} }), env, ctx);
  const draw = env.ASSETS ? fetchPng : undefined;
  const mcpAnswer = await mcp(request, env, draw);
  if (mcpAnswer) return mcpAnswer;
  const page = await preview(request, env);
  if (page) return page;
  // A HEAD is answered as its GET (from the cache, or drawn and kept), without the body.
  const head = request.method === 'HEAD';
  const asked = head ? new Request(request.url, { method: 'GET', headers: request.headers }) : request;
  /** @param {Response} res */
  const told = (res) => (head ? new Response(null, res) : res);
  // (Only what the API draws is kept: the page at / never is.)
  const drawable = new URL(asked.url).pathname.startsWith('/api/');
  const cache = asked.method === 'GET' && drawable ? /** @type {any} */ (globalThis).caches?.default : undefined;
  const key = cache ? cacheKey(asked, env.CF_VERSION_METADATA?.id ?? 'dev') : null;
  if (cache && key) {
    const hit = await cache.match(key);
    if (hit) return told(hit);
  }
  const made = api(asked) ?? info(asked) ?? (await png(asked, env));
  if (!made) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found\n', { status: 404 });
  // (What it says may be kept: drawings, never a refusal.)
  if (cache && key && /\bpublic\b/.test(made.headers.get('Cache-Control') ?? '')) {
    ctx.waitUntil(cache.put(key, made.clone()));
  }
  return told(made);
}

export default { fetch: handle };
