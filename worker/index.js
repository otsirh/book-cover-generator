// The site's Worker: an HTTP API that draws covers, at /api/cover.svg and /api/mockup.svg.
// Everything else is the static site (wrangler.jsonc sends only /api/* here).
//
//   <img src="https://covers.otsirh.dev/api/cover.svg?title=Dune&author=Frank+Herbert">
//
// The query is the app's link: any design's link (the part after #) draws that design. Text is
// measured with the built-in fonts' widths (src/metrics.js), as macOS draws them, so it can break
// a little differently from the app on another system, which measures with its own fonts.

import { createCover, createMockup, formats, version } from '../src/index.js';
import { LINE_BREAK, clipGraphemes } from '../src/text.js';
import { CUSTOM_SIZE, VARIANT, customColors, hex } from '../src/shared.js';

/** Query parameters that are cover options as they are. */
const TEXT = ['style', 'genre', 'font', 'lang'];
/** Text read as the app reads its links: cut to the app's lengths (in UTF-16 units). */
const LIMITS = { title: 200, author: 120, subtitle: 160, series: 120, credit: 120, badge: 60 };

/**
 * Cover options from a query string: the app's link parameters (`format`, `palette` with your
 * own colours as `custom-…`, `case`, `texture` 1 or 0, `variant` as name.value pairs joined by
 * "-"), the library's option names, and for convenience `width` and `height`, and `bg`, `ink`
 * and `accent` (hex, with or without the #, accents separated by commas).
 * @param {URLSearchParams} q
 * @returns {import('../src/index.js').CoverOptions}
 */
export function coverOptions(q) {
  /** @type {Record<string, unknown>} */
  const o = {};
  for (const key of TEXT) {
    const value = q.get(key);
    if (value) o[key] = value;
  }
  for (const [key, max] of Object.entries(LIMITS)) {
    const value = q.get(key);
    if (value) o[key] = clipGraphemes(value, max, { units: true });
  }
  // (The app trims the seed it reads from a link, and keeps 40 characters.)
  const seed = q.get('seed')?.split(LINE_BREAK).join(' ').trim();
  if (seed) o.seed = clipGraphemes(seed, 40, { units: true });
  const [width, height] = ['width', 'height'].map((key) => (q.get(key) ? Number(q.get(key)) : undefined));
  const format = q.get('format');
  if (format) {
    const size = Object.hasOwn(formats, format)
      ? formats[/** @type {keyof typeof formats} */ (format)]
      : CUSTOM_SIZE.exec(format)?.slice(1).map(Number);
    if (!size) {
      throw new RangeError(
        `Unknown format "${format}". Use one of ${Object.keys(formats).join(', ')}, or a size such as 1600x2560`,
      );
    }
    // A format's shape, at the width or height asked for (as the CLI's --format --width).
    if (width !== undefined && height !== undefined) {
      throw new RangeError('format sets the shape: give it a width or a height, not both');
    }
    const [w, h] = size;
    [o.width, o.height] =
      width !== undefined
        ? [width, Math.round((width * h) / w)]
        : height !== undefined
          ? [Math.round((height * w) / h), height]
          : [w, h];
  } else {
    if (width !== undefined) o.width = width;
    if (height !== undefined) o.height = height;
  }
  // A palette id or name (the library reads either in any case), or your own colours.
  const palette = q.get('palette');
  const colors = palette ? customColors(palette.toLowerCase()) : null;
  if (colors) o.palette = { bg: colors[0], ink: colors[1], accents: colors.slice(2) };
  else if (palette) o.palette = palette;
  const [bg, ink, accent] = [q.get('bg'), q.get('ink'), q.get('accent')];
  if (bg || ink || accent) {
    if (!bg || !ink || !accent) throw new RangeError('Your own colours need bg, ink and accent');
    o.palette = {
      bg: hex(bg),
      ink: hex(ink),
      accents: accent
        .split(',')
        .filter((c) => c.trim())
        .map(hex),
    };
  }
  const titleCase = q.get('case');
  if (titleCase) o.titleCase = titleCase;
  const texture = q.get('texture')?.toLowerCase();
  if (texture) {
    if (!['1', '0', 'true', 'false'].includes(texture)) throw new RangeError('texture is 1 (on) or 0 (off)');
    o.texture = texture === '1' || texture === 'true';
  }
  const variant = q.get('variant')?.toLowerCase();
  if (variant) {
    if (!VARIANT.test(variant)) {
      throw new RangeError('variant is name.value pairs joined by "-", such as scene.forest or field.pale-emblem.sun');
    }
    o.variants = Object.fromEntries(variant.split('-').map((pair) => pair.split('.')));
  }
  return /** @type {import('../src/index.js').CoverOptions} */ (o);
}

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
    const cover = createCover(coverOptions(q));
    const svg =
      kind === 'cover'
        ? cover.svg
        : createMockup(cover, {
            kind: /** @type {import('../src/index.js').MockupKind} */ (q.get('kind') || 'book'),
            text: q.get('text') ?? '',
            background: q.get('background') ? hex(/** @type {string} */ (q.get('background'))) : undefined,
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

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS?: { fetch(request: Request): Promise<Response> }, CF_VERSION_METADATA?: { id: string } }} env
   * @param {{ waitUntil(promise: Promise<unknown>): void }} ctx
   */
  async fetch(request, env, ctx) {
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
