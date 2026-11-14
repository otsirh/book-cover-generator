// Checks the live site: the pages, every API endpoint, the MCP server and a design's link preview
// answer as they should, from the version expected. `npm run deploy` runs it after deploying (the
// version is package.json's); the Smoke workflow runs it every day (the version is npm's latest),
// so a release that wasn't deployed, or a site that broke, shows up as a failed run.
//
//   node scripts/smoke.js [--expect 1.2.3] [--site https://covers.otsirh.dev]

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { expect: { type: 'string' }, site: { type: 'string', default: 'https://covers.otsirh.dev' } },
});
const site = /** @type {string} */ (values.site).replace(/\/$/, '');
const expected = values.expect ?? JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
// (A seed of its own, so the PNG is drawn now, not answered from the edge's cache.)
const seed = `smoke-${Date.now()}`;

/** @type {string[]} */
const failures = [];

/** Whether version `a` is before `b` (as x.y.z). @param {string} a @param {string} b */
const before = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(/[.+-]/).slice(0, 3).map(Number));
  const at = x.findIndex((part, i) => part !== y[i]);
  return at >= 0 && x[at] < y[at];
};

/**
 * Fetch a path and check the answer; the response, or null when it failed (recorded). A check
 * `since` a version after the one expected is skipped: the site runs that version, which hasn't it.
 * @param {string} path @param {{ type: string, status?: number, init?: RequestInit, since?: string, check?: (res: Response, body: Uint8Array) => string | void }} want
 */
async function expect(path, { type, status = 200, init, since, check }) {
  if (since && before(expected, since)) {
    console.log(`– ${init?.method ?? 'GET'} ${path}: skipped (since ${since}; the site is at ${expected})`);
    return null;
  }
  try {
    const res = await fetch(`${site}${path}`, { redirect: 'manual', ...init });
    const body = new Uint8Array(await res.arrayBuffer());
    const problems = [];
    if (res.status !== status) problems.push(`status ${res.status}, not ${status}`);
    if (!(res.headers.get('content-type') ?? '').startsWith(type))
      problems.push(`type ${res.headers.get('content-type')}, not ${type}`);
    const said = problems.length ? undefined : check?.(res, body);
    if (said) problems.push(said);
    console.log(
      `${problems.length ? '✗' : '✓'} ${init?.method ?? 'GET'} ${path}${problems.length ? `: ${problems.join('; ')}` : ''}`,
    );
    if (problems.length) failures.push(`${path}: ${problems.join('; ')}`);
    return res;
  } catch (err) {
    console.log(`✗ ${path}: ${err instanceof Error ? err.message : err}`);
    failures.push(`${path}: ${err}`);
    return null;
  }
}

const text = (/** @type {Uint8Array} */ body) => new TextDecoder().decode(body);
/** The version a drawn answer says it was drawn by. @param {Response} res */
const fromVersion = (res) =>
  res.headers.get('x-cover-version') === expected
    ? undefined
    : `version ${res.headers.get('x-cover-version')}, not ${expected}`;
const isPng = (/** @type {Uint8Array} */ body) =>
  body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47 ? undefined : 'not a PNG';

const design = `title=Smoke+Test&author=The+Site&seed=${seed}`;
await expect('/', {
  type: 'text/html',
  check: (res) => (res.headers.get('content-security-policy') ? undefined : 'no Content-Security-Policy'),
});
await expect('/gallery/', { type: 'text/html' });
await expect('/src/element.js', { type: 'text/javascript' });
await expect(`/?${design}`, {
  type: 'text/html',
  check: (_, body) =>
    text(body).includes('content="Smoke Test by The Site"') ? undefined : 'no link preview of the design',
});
await expect(`/api/cover.svg?${design}`, {
  type: 'image/svg+xml',
  check: (res, body) => fromVersion(res) ?? (text(body).startsWith('<svg') ? undefined : 'not an SVG'),
});
await expect(`/api/cover.png?${design}&style=minimal`, {
  type: 'image/png',
  check: (res, body) => fromVersion(res) ?? isPng(body),
});
await expect(`/api/mockup.png?${design}&kind=card`, {
  type: 'image/png',
  check: (res, body) => fromVersion(res) ?? isPng(body),
});
await expect(`/api/cover.json?${design}`, {
  type: 'application/json',
  since: '1.13.0',
  check: (_, body) => (JSON.parse(text(body)).version === expected ? undefined : 'another version'),
});
await expect('/api/catalog.json', {
  type: 'application/json',
  since: '1.13.0',
  check: (_, body) => (JSON.parse(text(body)).styles?.length > 0 ? undefined : 'no styles'),
});
await expect('/api/openapi.json', { type: 'application/json', since: '1.13.0' });
await expect('/mcp', {
  type: 'application/json',
  init: {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } },
    }),
  },
  check: (_, body) => {
    const info = JSON.parse(text(body)).result?.serverInfo;
    return info?.version === expected ? undefined : `MCP server ${info?.version}, not ${expected}`;
  },
});
await expect('/no-such-page', { type: 'text/html', status: 404 });

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed on ${site} (expected version ${expected}).`);
  process.exit(1);
}
console.log(`\n${site} is up, at ${expected}.`);
