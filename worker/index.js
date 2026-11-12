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
import { handlePayload } from '../src/mcp.js';

/** Headers every answer has: anyone may embed it, and it's never taken for anything but what it is. */
const COMMON = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'X-Cover-Style, X-Cover-Palette, X-Cover-Version',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

/**
 * Answer an API request (or say it isn't one: null).
 * @param {Request} request
 * @returns {Response | null}
 */
export function api(request) {
  const url = new URL(request.url);
  const kind = url.pathname === '/api/cover.svg' ? 'cover' : url.pathname === '/api/mockup.svg' ? 'mockup' : null;
  if (!kind) return null;
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
  try {
    const q = url.searchParams;
    const cover = createCover(optionsFromLink(q));
    const svg =
      kind === 'cover'
        ? cover.svg
        : createMockup(cover, {
            kind: /** @type {import('../src/index.js').MockupKind} */ (q.getAll('kind').at(-1) || 'book'),
            text: q.getAll('text').at(-1) ?? '',
            background: q.getAll('background').at(-1)
              ? hex(/** @type {string} */ (q.getAll('background').at(-1)))
              : undefined,
          }).svg;
    return new Response(request.method === 'HEAD' ? null : svg, {
      headers: {
        ...COMMON,
        'Content-Type': 'image/svg+xml; charset=utf-8',
        // The same query always draws the same cover in a version of the library.
        'Cache-Control': 'public, max-age=86400',
        // Opened on its own, the SVG may style itself and nothing else.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        'X-Cover-Style': cover.style,
        'X-Cover-Palette': cover.palette,
        'X-Cover-Version': version,
      },
    });
  } catch (err) {
    return new Response(`${err instanceof Error ? err.message : String(err)}\n`, {
      status: 400,
      headers: { ...COMMON, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
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
  /** @param {number} status @param {unknown} body */
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...MCP_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
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
  const answer = handlePayload(message, { base: url.origin });
  return answer ? json(200, answer) : new Response(null, { status: 202, headers: MCP_HEADERS });
}

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS?: { fetch(request: Request): Promise<Response> }, CF_VERSION_METADATA?: { id: string } }} env
   * @param {{ waitUntil(promise: Promise<unknown>): void }} ctx
   */
  async fetch(request, env, ctx) {
    const mcpAnswer = await mcp(request);
    if (mcpAnswer) return mcpAnswer;
    const cache = request.method === 'GET' ? /** @type {any} */ (globalThis).caches?.default : undefined;
    const key = cache ? cacheKey(request, env.CF_VERSION_METADATA?.id ?? 'dev') : null;
    if (cache && key) {
      const hit = await cache.match(key);
      if (hit) return hit;
    }
    const answer = api(request);
    if (!answer) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found\n', { status: 404 });
    if (cache && key && answer.ok) ctx.waitUntil(cache.put(key, answer.clone()));
    return answer;
  },
};
