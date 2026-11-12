// The MCP server: messages, tools, and its two transports (the CLI's stdio, the Worker's /mcp).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleMessage } from '../src/mcp.js';
import { optionsFromLink } from '../src/link.js';
import { createCover, createMockup, version } from '../src/index.js';
import worker from '../worker/index.js';

/** @param {string} method @param {unknown} [params] @param {object} [ctx] */
const call = (method, params, ctx) =>
  /** @type {any} */ (handleMessage({ jsonrpc: '2.0', id: 1, method, params }, ctx));

test('initialize, ping, notifications and errors', () => {
  const init = call('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 't', version: '1' },
  });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.deepEqual(init.result.serverInfo, { name: 'book-cover-generator', title: 'Book Cover Generator', version });
  assert.ok(init.result.capabilities.tools);
  // A version it doesn't speak gets its newest.
  assert.equal(call('initialize', { protocolVersion: '1999-01-01' }).result.protocolVersion, '2025-06-18');
  assert.deepEqual(call('ping').result, {});
  assert.equal(handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(call('nope').error.code, -32601);
  assert.equal(/** @type {any} */ (handleMessage([])).error.code, -32600);
  assert.equal(/** @type {any} */ (handleMessage({ id: 2, method: 'ping' })).error.code, -32600);
  assert.equal(call('tools/call', { name: 'nope', arguments: {} }).error.code, -32602);
  assert.equal(call('tools/call', { arguments: {} }).error.code, -32602);
  assert.equal(call('tools/call', { name: 'list_styles', arguments: null }).error.code, -32602);
});

test('the tools, and a file to save to only where one can be', () => {
  const names = call('tools/list').result.tools.map((/** @type {any} */ t) => t.name);
  assert.deepEqual(names, ['create_cover', 'create_mockup', 'list_styles', 'list_palettes']);
  const [cover] = call('tools/list').result.tools;
  assert.deepEqual(cover.inputSchema.required, ['title']);
  assert.equal(cover.inputSchema.properties.output, undefined);
  const local = call('tools/list', undefined, { writeFile: () => '' }).result.tools[0];
  assert.ok(local.inputSchema.properties.output);
});

test('create_cover: links that draw the cover it drew, by name, genre and pins', () => {
  const answer = call('tools/call', {
    name: 'create_cover',
    arguments: {
      title: 'Kingdom of Ash',
      author: 'Ann',
      style: 'Crest',
      variants: { emblem: 'Tower' },
      seed: 's',
      format: 'ebook',
      case: 'upper',
      texture: true,
    },
  }).result;
  assert.equal(answer.isError, undefined);
  const { style, imageUrl, editUrl, variants, width, height } = answer.structuredContent;
  assert.equal(style, 'crest');
  assert.equal(variants.emblem, 'tower');
  assert.deepEqual([width, height], [600, 960]);
  assert.match(answer.content[0].text, /Crest style/);
  // The image link and the edit link hold the same design: the API draws the cover the tool drew.
  const query = new URL(imageUrl).searchParams;
  assert.equal(new URL(editUrl).hash.slice(1), query.toString());
  const tool = call('tools/call', {
    name: 'create_cover',
    arguments: {
      title: 'Kingdom of Ash',
      author: 'Ann',
      style: 'Crest',
      variants: { emblem: 'Tower' },
      seed: 's',
      format: 'ebook',
      case: 'upper',
      texture: true,
      svg: true,
    },
  }).result;
  assert.equal(createCover(optionsFromLink(query)).svg, tool.content[1].text);
  // A genre by its name; a seed from the title stays one.
  const genred = call('tools/call', { name: 'create_cover', arguments: { title: 'Night', genre: 'Horror' } }).result;
  assert.ok(['hollow', 'noir', 'silhouette'].includes(genred.structuredContent.style));
  assert.equal(new URL(genred.structuredContent.imageUrl).searchParams.get('seed'), '');
  // Your own colours.
  const own = call('tools/call', {
    name: 'create_cover',
    arguments: { title: 'X', colors: { bg: '#0b132b', ink: '#f8f9fa', accents: ['#ff6b6b'] } },
  }).result;
  assert.match(own.structuredContent.imageUrl, /palette=custom-0b132b-f8f9fa-ff6b6b&/);
});

test('create_mockup, the lists, and errors the assistant can fix', () => {
  const card = call('tools/call', {
    name: 'create_mockup',
    arguments: { title: 'Dune', seed: 'm', kind: 'card', text: 'Out now', svg: true },
  }).result;
  assert.match(card.structuredContent.imageUrl, /\/api\/mockup\.svg\?.*kind=card&text=Out\+now$/);
  assert.equal(
    card.content[1].text,
    createMockup(createCover({ title: 'Dune', seed: 'm' }), { kind: 'card', text: 'Out now' }).svg,
  );
  const styles = call('tools/call', { name: 'list_styles', arguments: { genre: 'Horror' } }).result;
  assert.deepEqual(
    styles.structuredContent.styles.map((/** @type {any} */ s) => s.id),
    ['noir', 'hollow', 'silhouette'],
  );
  assert.equal(
    call('tools/call', { name: 'list_palettes', arguments: {} }).result.structuredContent.palettes.length,
    28,
  );
  for (const args of [{}, { title: 'X', style: 'nope' }, { title: 'X', format: 'huge' }]) {
    const failed = call('tools/call', { name: 'create_cover', arguments: args }).result;
    assert.equal(failed.isError, true, JSON.stringify(args));
    assert.ok(failed.content[0].text);
  }
  assert.equal(call('tools/call', { name: 'list_styles', arguments: { genre: 'poetry' } }).result.isError, true);
});

test('book-cover --mcp: a message a line, and a cover saved to a file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-mcp-'));
  try {
    const child = spawn(process.execPath, [new URL('../bin/book-cover.js', import.meta.url).pathname, '--mcp'], {
      cwd: dir,
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    const lines = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'create_cover', arguments: { title: 'Saved', output: 'out/cover.svg' } },
      },
    ];
    child.stdin.end(`${lines.map((l) => JSON.stringify(l)).join('\n')}\nnot json\n`);
    await new Promise((resolve) => child.on('close', resolve));
    const answers = out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.deepEqual(
      answers.map((a) => a.id),
      [1, 2, null],
    );
    assert.equal(answers[2].error.code, -32700);
    assert.equal(answers[1].result.structuredContent.file, join(await realpath(dir), 'out', 'cover.svg'));
    assert.match(await readFile(join(dir, 'out', 'cover.svg'), 'utf8'), /^<svg [\s\S]*Saved/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the Worker answers MCP at /mcp', async () => {
  /** @param {string} method @param {unknown} [body] */
  const post = (method, body) =>
    worker.fetch(
      new Request('https://covers.example/mcp', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      {},
      { waitUntil() {} },
    );
  const res = await post('POST', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'create_cover', arguments: { title: 'Web' } },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json');
  const answer = await res.json();
  assert.match(answer.result.structuredContent.imageUrl, /^https:\/\/covers\.example\/api\/cover\.svg\?/);
  assert.equal((await post('POST', { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const batch = await (
    await post('POST', [
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'x' },
    ])
  ).json();
  assert.deepEqual(batch, [{ jsonrpc: '2.0', id: 1, result: {} }]);
  assert.equal((await post('GET')).status, 405);
  assert.equal((await post('OPTIONS')).status, 204);
  const bad = await worker.fetch(
    new Request('https://covers.example/mcp', { method: 'POST', body: '{' }),
    {},
    { waitUntil() {} },
  );
  assert.equal(bad.status, 400);
});
