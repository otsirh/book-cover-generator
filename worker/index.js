// The site's Worker: an HTTP API that draws covers, at /api/cover.svg and /api/mockup.svg, and the
// MCP endpoint at /mcp. Everything else is the static site (wrangler.jsonc sends only those here).
//
//   <img src="https://covers.otsirh.dev/api/cover.svg?title=Dune&author=Frank+Herbert">
//
// The query is the app's link: any design's link (the part after #) draws that design. Text is
// measured with the built-in fonts' widths (src/metrics.js), as macOS draws them, so it can break
// a little differently from the app on another system, which measures with its own fonts.

import { createCover, createMockup, version } from '../src/index.js';
import { hex } from '../src/shared.js';
import { optionsFromLink } from '../src/link.js';
import { answerPayload } from '../src/mcp.js';
import { escapeXml } from '../src/core.js';
import { COVER_PIXELS, MOCKUP_PIXELS, pngEngine } from './png.js';

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

/** @param {unknown} err @param {number} [status] */
const refusal = (err, status = 400) =>
  new Response(`${err instanceof Error ? err.message : String(err)}\n`, {
    status,
    headers: { ...COMMON, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

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
 */

/** The PNG engine, made once an instance needs it. @type {Promise<Awaited<ReturnType<typeof pngEngine>>> | null} */
let engine = null;

/**
 * resvg and the fonts, ready: its WebAssembly comes with the Worker (in Node, as env.RESVG_WASM),
 * the fonts are the site's own files (public/fonts).
 * @param {Env} env @param {string} origin
 */
function pngEngineFor(env, origin) {
  if (!engine) {
    const made = (async () => {
      const [resvg, wasm] = await Promise.all([
        import('@resvg/resvg-wasm'),
        env.RESVG_WASM ?? import('./resvg-wasm.js').then((m) => m.default),
      ]);
      return pngEngine(resvg, wasm, async (file) => {
        if (!env.ASSETS) throw new Error('No site files to read the fonts from');
        const res = await env.ASSETS.fetch(new Request(new URL(`/fonts/${file}`, origin)));
        if (!res.ok) throw new Error(`fonts/${file}: ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      });
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
  const refused = notGet(request);
  if (refused) return refused;
  const q = url.searchParams;
  const asked = q.getAll('scale').at(-1);
  const given = asked === undefined || asked === '' ? null : Number(asked);
  if (given !== null && !(given > 0 && given <= 4)) {
    return refusal(new RangeError(`scale must be a number above 0, at most 4, got "${asked}"`));
  }
  let drawer;
  try {
    drawer = await pngEngineFor(env, url.origin);
  } catch (err) {
    console.error(err);
    return refusal(new Error('PNG covers are unavailable just now: ask for the SVG (cover.svg)'), 503);
  }
  try {
    const { cover, svg, width, height } = drawer.laidOut(() => drawn(kind, q));
    // At its size, or smaller to fit (a large cover, a story); a scale asked for that can't fit is
    // refused. (Auto a hair under the limit, as resvg rounds the size.)
    const most = kind === 'cover' ? COVER_PIXELS : MOCKUP_PIXELS;
    const fit = Math.sqrt(most / (width * height));
    const scale = given ?? Math.min(1, fit * 0.995);
    const [w, h] = [Math.ceil(width * scale), Math.ceil(height * scale)];
    if (w * h > most) {
      throw new RangeError(
        `A ${kind} PNG has at most ${most} pixels; ${w} × ${h} is more: ask for a scale up to ${Math.floor(fit * 100) / 100}, the SVG, or a large PNG from the app`,
      );
    }
    if (!drawer.draws(svg)) {
      if (q.has('preview')) return Response.redirect(new URL('/og.png', url).href, 302);
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
        // (At the mockup's scale, as a mockup shows the cover at its own size or smaller; at most
        // COVER_PIXELS.)
        const picture = drawer.render(
          cover.svg,
          Math.min(scale, 0.995 * Math.sqrt(COVER_PIXELS / (cover.width * cover.height))),
        );
        const body = `<image width="${cover.width}" height="${cover.height}" href="data:image/png;base64,${base64(picture)}"/>`;
        const flat = drawer.laidOut(() => createMockup({ ...cover, body }, mockupOptions(q)));
        bytes = drawer.render(flat.svg, scale);
      }
    } catch (err) {
      // resvg failed: our fault, not the request's; the next one gets a new engine.
      console.error(err);
      if (engine && (await engine) === drawer) engine = null;
      return refusal(new Error('The PNG could not be drawn: ask for the SVG (cover.svg)'), 500);
    }
    return new Response(request.method === 'HEAD' ? null : /** @type {BodyInit} */ (bytes), {
      headers: { ...COMMON, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', ...about(cover) },
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
  headers.delete('Content-Length');
  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
}

/**
 * Where an answer is kept at the edge. The `v` an app link names is ignored (the API draws with
 * the code deployed), so the key names this deployment instead: every deploy draws anew, even
 * one between releases.
 * @param {Request} request @param {string} deployment
 */
function cacheKey(request, deployment) {
  const url = new URL(request.url);
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
 * site. Null for any other path.
 * @param {Request} request
 * @returns {Promise<Response | null>}
 */
export async function mcp(request) {
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
  const answer = answerPayload(message, { base: url.origin });
  return answer === null ? new Response(null, { status: 202, headers: MCP_HEADERS }) : jsonText(200, answer);
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {{ waitUntil(promise: Promise<unknown>): void }} ctx
   */
  async fetch(request, env, ctx) {
    const mcpAnswer = await mcp(request);
    if (mcpAnswer) return mcpAnswer;
    const page = await preview(request, env);
    if (page) return page;
    const cache = request.method === 'GET' ? /** @type {any} */ (globalThis).caches?.default : undefined;
    const key = cache ? cacheKey(request, env.CF_VERSION_METADATA?.id ?? 'dev') : null;
    if (cache && key) {
      const hit = await cache.match(key);
      if (hit) return hit;
    }
    const answer = api(request) ?? (await png(request, env));
    if (!answer) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found\n', { status: 404 });
    if (cache && key && answer.ok) ctx.waitUntil(cache.put(key, answer.clone()));
    return answer;
  },
};
