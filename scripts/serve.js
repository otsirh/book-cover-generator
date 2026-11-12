#!/usr/bin/env node
// Static file server for development and end-to-end tests.
//
//   node scripts/serve.js [port] [root ...]
//
// Serves files from the given roots in order (default: the repo root, then
// public/), applies the Cloudflare-style `_headers` file found in a root and
// answers unknown paths with 404.html, so local runs behave like production. /api/* is the
// Worker's HTTP API (worker/index.js), as in production.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { api } from '../worker/index.js';

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

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
async function handle(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (urlPath.startsWith('/api/')) {
    // (Its own headers only: in production the Worker's answers don't get _headers.)
    const answer = api(new Request(new URL(req.url ?? '/', `http://127.0.0.1:${port}`), { method: req.method }));
    if (answer) {
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      res.end(Buffer.from(await answer.arrayBuffer()));
      return;
    }
  }
  // Never serve dotfiles (except .well-known), underscore files or node_modules, whatever the case or separator.
  const hidden = urlPath
    .toLowerCase()
    .split(/[\\/]/)
    .some(
      (seg) =>
        (seg.startsWith('.') && seg !== '.well-known' && seg !== '..') || seg.startsWith('_') || seg === 'node_modules',
    );
  let file = hidden ? null : await locate(urlPath);
  let status = 200;
  if (!file) {
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
