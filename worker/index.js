// The site's Worker: an HTTP API that draws covers, at /api/cover.svg and /api/mockup.svg.
// Everything else is the static site (wrangler.jsonc sends only /api/* here).
//
//   <img src="https://covers.otsirh.dev/api/cover.svg?title=Dune&author=Frank+Herbert">
//
// The query is the app's link: any design's link (the part after #) draws that design. Text is
// measured with the built-in fonts' widths (src/metrics.js), as macOS draws them, so it can break
// a little differently from the app on another system, which measures with its own fonts.

import { createCover, createMockup, formats, version } from '../src/index.js';
import { CUSTOM_SIZE, customColors, hex } from '../src/shared.js';
import { LINK, lastValues } from '../src/link.js';

/** A size in px, as the CLI reads one (the library checks its range), else an error naming the parameter. @param {string} key @param {string} raw */
function px(key, raw) {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value)) throw new RangeError(`${key} must be a number of px, got "${raw}"`);
  return value;
}

/**
 * Cover options from a query string. The app's link parameters are read as the app reads them
 * (src/link.js), the last of a repeated one too, except that a value the app would drop is an
 * error here. Also the library's option names (`titleCase`, `genre`, `lang`, `width`, `height`)
 * and your own colours as `bg`, `ink` and `accent` (hex, the # optional, accents separated by
 * commas).
 * @param {URLSearchParams} q
 * @returns {import('../src/index.js').CoverOptions}
 */
export function coverOptions(q) {
  const v = lastValues(q);
  /** A parameter's value, if it has one. @param {string} key */
  const given = (key) => (v[key] != null && v[key] !== '' ? v[key] : undefined);
  /** @type {Record<string, unknown>} */
  const o = {};
  for (const key of /** @type {const} */ (['title', 'author', 'subtitle', 'series', 'credit', 'badge', 'seed'])) {
    const value = given(key) === undefined ? undefined : LINK[key](v[key]);
    if (value) o[key] = value;
  }
  // Styles, fonts and palettes the reader doesn't know go to the library as typed: it picks for
  // 'random', and says what's wrong with the others.
  for (const key of /** @type {const} */ (['style', 'font'])) {
    const raw = given(key);
    if (raw !== undefined) o[key] = LINK[key](raw) ?? raw;
  }
  for (const key of ['genre', 'lang']) if (given(key) !== undefined) o[key] = given(key);
  const palette = given('palette');
  if (palette !== undefined) {
    const read = LINK.palette(palette);
    const colors = read ? customColors(read) : null;
    if (colors) o.palette = { bg: colors[0], ink: colors[1], accents: colors.slice(2) };
    else if (read !== 'auto') o.palette = read ?? palette;
  }
  const caseKey = given('case') !== undefined ? 'case' : 'titleCase';
  const titleCase = given(caseKey);
  if (titleCase !== undefined) {
    o.titleCase = LINK.case(titleCase);
    if (!o.titleCase) throw new RangeError(`${caseKey} is upper or normal, got "${titleCase}"`);
  }
  const texture = given('texture');
  if (texture !== undefined) {
    o.texture = LINK.texture(texture);
    if (o.texture === undefined) throw new RangeError('texture is 1 (on) or 0 (off)');
  }
  const variant = given('variant');
  if (variant !== undefined) {
    const pairs = LINK.variant(variant);
    if (!pairs) {
      throw new RangeError('variant is name.value pairs joined by "-", such as scene.forest or field.pale-emblem.sun');
    }
    o.variants = Object.fromEntries(pairs.split('-').map((pair) => pair.split('.')));
  }
  const width = given('width') === undefined ? undefined : px('width', /** @type {string} */ (given('width')));
  const height = given('height') === undefined ? undefined : px('height', /** @type {string} */ (given('height')));
  const format = given('format');
  if (format !== undefined) {
    // A preset, or any WxH shape: a width or height may scale it, and the library checks the size
    // it comes to (saying what's wrong with it).
    const read = format.trim();
    const size = Object.hasOwn(formats, read)
      ? formats[/** @type {keyof typeof formats} */ (read)]
      : CUSTOM_SIZE.exec(read)?.slice(1).map(Number);
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
  const [bg, ink, accent] = [given('bg'), given('ink'), given('accent')];
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
