#!/usr/bin/env node
// Static file server for development and end-to-end tests.
//
//   node scripts/serve.js [port] [root ...]
//
// Serves files from the given roots in order (default: the repo root, then
// public/), applies the Cloudflare-style `_headers` file found in a root and
// answers unknown paths with 404.html, so local runs behave like production. /api/* and /mcp
// are the Worker's (worker/index.js), answered by its own fetch, as in production.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import worker from '../worker/index.js';
import { PAGES } from './gallery.js';
import { BUNDLES, bundle } from './bundle.js';

const [portArg, ...rootArgs] = process.argv.slice(2);
const port = Number(portArg ?? 4173);
const roots = (rootArgs.length ? rootArgs : ['.', 'public']).map((r) => resolve(r));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
};

/**
 * Parse a Cloudflare `_headers` file into rules.
 * @param {string} text
 */
function parseHeaders(text) {
  /** @type {{ pattern: RegExp, set: [string, string][], remove: string[] }[]} */
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const source = line
        .trim()
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      rules.push({ pattern: new RegExp(`^${source}$`), set: [], remove: [] });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('!')) rule.remove.push(trimmed.slice(1).trim().toLowerCase());
    else {
      const i = trimmed.indexOf(':');
      if (i > 0) rule.set.push([trimmed.slice(0, i).trim(), trimmed.slice(i + 1).trim()]);
    }
  }
  return rules;
}

/** @param {string} file */
async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** @param {string} urlPath */
async function locate(urlPath) {
  for (const root of roots) {
    const base = resolve(join(root, urlPath));
    if (base !== root && !base.startsWith(root + sep)) continue;
    for (const candidate of [base, join(base, 'index.html')]) {
      if (await isFile(candidate)) return candidate;
    }
  }
  return null;
}

/** @type {ReturnType<typeof parseHeaders>} */
let headerRules = [];
for (const root of roots) {
  const text = await readFile(join(root, '_headers'), 'utf8').catch(() => null);
  if (text) {
    headerRules = parseHeaders(text);
    break;
  }
}

/**
 * What the Worker has in production, here: the site's files (ASSETS: the roots, as served) and
 * resvg's WebAssembly (which Node can't import, so it's read from disk).
 * @type {import('../worker/index.js').Env}
 */
const workerEnv = {
  ASSETS: {
    async fetch(request) {
      const file = await locate(decodeURIComponent(new URL(request.url).pathname));
      if (!file) return new Response('Not found\n', { status: 404 });
      const type = TYPES[/** @type {keyof typeof TYPES} */ (extname(file))] ?? 'application/octet-stream';
      return new Response(await readFile(file), { headers: { 'Content-Type': type } });
    },
  },
  RESVG_WASM: await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)),
};

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
async function handle(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  // The Worker's paths (wrangler.jsonc runs it first for them), answered by the Worker's own fetch,
  // with the body as a stream: routing, limits and headers as in production (which doesn't add
  // _headers to the Worker's answers).
  const raw = new URL(req.url ?? '/', 'http://localhost');
  const rawPath = raw.pathname;
  // (And a design's link, /?title=…, whose page the Worker gives the design's link preview.)
  if (rawPath === '/mcp' || rawPath.startsWith('/api/') || (rawPath === '/' && raw.searchParams.has('title'))) {
    const method = req.method ?? 'GET';
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, v);
    }
    const answer = await worker.fetch(
      new Request(new URL(req.url ?? '/', `http://127.0.0.1:${port}`), {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : /** @type {ReadableStream} */ (Readable.toWeb(req)),
        // @ts-expect-error duplex is required for a streamed body, and missing from the types
        duplex: 'half',
      }),
      workerEnv,
      { waitUntil() {} },
    );
    res.writeHead(answer.status, Object.fromEntries(answer.headers));
    res.end(Buffer.from(await answer.arrayBuffer()));
    return;
  }
  // Never serve dotfiles (except .well-known), underscore files or node_modules, whatever the case or separator.
  const hidden = urlPath
    .toLowerCase()
    .split(/[\\/]/)
    .some(
      (seg) =>
        (seg.startsWith('.') && seg !== '.well-known' && seg !== '..') || seg.startsWith('_') || seg === 'node_modules',
    );
  // A page the build writes, without its slash: sent to it, as production does (built or not).
  if (Object.hasOwn(PAGES, `${urlPath}/`)) {
    res.writeHead(307, { Location: `${urlPath}/${new URL(req.url ?? '/', 'http://localhost').search}` }).end();
    return;
  }
  let file = hidden ? null : await locate(urlPath);
  let status = 200;
  // A page the build writes, made here when the roots haven't it (the source tree).
  /** @type {string | null} */
  let generated = null;
  let generatedType = TYPES['.html'];
  const page = PAGES[/** @type {keyof typeof PAGES} */ (urlPath)];
  if (!file && page) generated = page();
  else if (!file && Object.hasOwn(BUNDLES, urlPath)) {
    // (A bundle the build writes: built here from the source as it is now.)
    generated = await bundle(/** @type {keyof typeof BUNDLES} */ (urlPath));
    generatedType = TYPES['.js'];
  } else if (!file) {
    status = 404;
    file = await locate('/404.html');
  }

  /** @type {Map<string, [string, string]>} */
  const headers = new Map();
  for (const rule of headerRules) {
    if (!rule.pattern.test(urlPath)) continue;
    for (const name of rule.remove) headers.delete(name);
    for (const [name, value] of rule.set) {
      const prev = headers.get(name.toLowerCase());
      headers.set(name.toLowerCase(), [name, prev ? `${prev[1]}, ${value}` : value]);
    }
  }
  for (const [name, value] of headers.values()) res.setHeader(name, value);
  res.setHeader('Cache-Control', res.getHeader('Cache-Control') ?? 'no-cache');

  if (generated !== null) {
    res.writeHead(200, { 'Content-Type': generatedType });
    res.end(req.method === 'HEAD' ? undefined : generated);
    return;
  }
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  const type = TYPES[/** @type {keyof typeof TYPES} */ (extname(file))] ?? 'application/octet-stream';
  let body;
  try {
    body = await readFile(file);
  } catch {
    // Gone or unreadable since it was found (say, a rebuild of dist): report it, don't crash.
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Could not read the file');
    return;
  }
  res.writeHead(status, { 'Content-Type': type });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = createServer((req, res) => {
  // A request nothing here expected (a TRACE, say, which a Request can't hold) is answered, never
  // left to stop the server.
  handle(req, res).catch((err) => {
    if (res.headersSent) res.destroy();
    else res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${err?.message ?? err}\n`);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${roots.join(' + ')} at http://127.0.0.1:${port}`);
});
