// The MCP server: messages, tools, and its two transports (the CLI's stdio, the Worker's /mcp).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  // Not a request, with no id (or one JSON-RPC doesn't allow, not sent back): an error for id null.
  for (const message of [
    { foo: 'boo' },
    { jsonrpc: '2.0', method: 1, params: 'bar' },
    { jsonrpc: '2.0', id: { a: 1 }, method: 'ping' },
    { jsonrpc: '2.0', id: [1], method: 'ping' },
  ]) {
    assert.deepEqual(
      handleMessage(message),
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } },
      JSON.stringify(message),
    );
  }
  // A response to the server (which sends no requests) needs no answer.
  assert.equal(handleMessage({ jsonrpc: '2.0', id: 5, result: {} }), null);
  assert.equal(handleMessage({ jsonrpc: '2.0', id: 5, error: { code: 1, message: 'x' } }), null);
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
  // A genre by its name; a seed from the title stays one (and isn't reported as one to give back).
  const genred = call('tools/call', {
    name: 'create_cover',
    arguments: { title: 'Night', genre: 'Horror', seed: '  ' },
  }).result;
  assert.ok(['hollow', 'noir', 'silhouette'].includes(genred.structuredContent.style));
  assert.equal(new URL(genred.structuredContent.imageUrl).searchParams.get('seed'), '');
  assert.equal(genred.structuredContent.seed, null);
  // Your own colours.
  const own = call('tools/call', {
    name: 'create_cover',
    arguments: { title: 'X', colors: { bg: '#0b132b', ink: '#f8f9fa', accents: ['#ff6b6b'] } },
  }).result;
  assert.match(own.structuredContent.imageUrl, /palette=custom-0b132b-f8f9fa-ff6b6b&/);
  // Short hex too: links that draw those colours; more than three accents is an error.
  const short = call('tools/call', {
    name: 'create_cover',
    arguments: { title: 'X', colors: { bg: '#000', ink: '#fff', accents: ['#f00'] }, svg: true },
  }).result;
  assert.match(short.structuredContent.imageUrl, /palette=custom-000000-ffffff-ff0000&/);
  assert.equal(
    createCover(optionsFromLink(new URL(short.structuredContent.imageUrl).searchParams)).svg,
    short.content[1].text,
  );
  const four = call('tools/call', {
    name: 'create_cover',
    arguments: { title: 'X', colors: { bg: '#000', ink: '#fff', accents: ['#f00', '#0f0', '#00f', '#ff0'] } },
  }).result;
  assert.equal(four.isError, true);
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
  for (const genre of ["children's", 'Childrens', 'thriller and crime']) {
    assert.equal(call('tools/call', { name: 'list_styles', arguments: { genre } }).result.isError, undefined, genre);
  }
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
    const child = spawn(process.execPath, [fileURLToPath(new URL('../bin/book-cover.js', import.meta.url)), '--mcp'], {
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
        params: { name: 'create_cover', arguments: { title: 'Saved', output: join(dir, 'out', 'cover.svg') } },
      },
      [
        { jsonrpc: '2.0', id: 3, method: 'ping' },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'create_cover', arguments: { title: 'X', output: 'relative.svg' } },
        },
      ],
    ];
    // An id nested too deep to write back is refused, and the server goes on.
    const deep = `{"jsonrpc":"2.0","id":${'['.repeat(20_000)}${']'.repeat(20_000)},"method":"ping"}`;
    const after = JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'ping' });
    child.stdin.end(`${lines.map((l) => JSON.stringify(l)).join('\n')}\n${deep}\nnot json\n${after}\n`);
    await new Promise((resolve) => child.on('close', resolve));
    const answers = out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.deepEqual(
      answers.map((a) => (Array.isArray(a) ? a.map((b) => b.id) : a.id)),
      [1, 2, [3, 4], null, null, 5],
    );
    // A relative path is refused: the host chose the folder the server runs in.
    assert.match(answers[2][1].result.content[0].text, /absolute path/);
    assert.equal(answers[3].error.code, -32600);
    assert.equal(answers[4].error.code, -32700);
    assert.equal(answers[1].result.structuredContent.file, join(dir, 'out', 'cover.svg'));
    assert.match(await readFile(join(dir, 'out', 'cover.svg'), 'utf8'), /^<svg [\s\S]*Saved/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('book-cover --mcp saves only an .svg, and never over a file of another kind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-cover-mcp-'));
  try {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'notes.svg'), 'export PATH=/usr/bin\n');
    await writeFile(
      join(dir, 'old.svg'),
      '<?xml version="1.0"?>\n<!-- kept --><svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    // (Many comments and no SVG: read one by one, at once, not by a pattern that tries every split.)
    await writeFile(join(dir, 'comments.svg'), '<!---->'.repeat(73));
    // An editor's SVG: a generator's comment, a DOCTYPE, and a licence longer than 512 bytes.
    await writeFile(
      join(dir, 'drawn.svg'),
      `<?xml version="1.0"?>\n<!-- Generator: Adobe Illustrator -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY ns "x">]>\n<!-- ${'licence '.repeat(100)} -->\n<svg xmlns="http://www.w3.org/2000/svg"/>`,
    );
    const child = spawn(process.execPath, [fileURLToPath(new URL('../bin/book-cover.js', import.meta.url)), '--mcp'], {
      cwd: dir,
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    const save = (/** @type {number} */ id, /** @type {string} */ output) => ({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: 'create_cover', arguments: { title: 'Saved', output } },
    });
    const lines = [
      save(1, join(dir, '.zshrc')),
      save(2, join(dir, 'notes.svg')),
      save(3, join(dir, 'old.svg')),
      save(4, join(dir, 'comments.svg')),
      save(5, join(dir, 'drawn.svg')),
    ];
    child.stdin.end(`${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
    await new Promise((resolve) => child.on('close', resolve));
    const [other, notSvg, svg, comments, drawn] = out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).result);
    assert.equal(other.isError, true);
    assert.match(other.content[0].text, /must name an \.svg file/);
    assert.equal(notSvg.isError, true);
    assert.match(notSvg.content[0].text, /isn't an SVG: not replaced/);
    assert.equal(await readFile(join(dir, 'notes.svg'), 'utf8'), 'export PATH=/usr/bin\n');
    assert.equal(svg.isError, undefined);
    assert.match(await readFile(join(dir, 'old.svg'), 'utf8'), /^<svg [\s\S]*Saved/);
    assert.match(comments.content[0].text, /isn't an SVG: not replaced/);
    assert.equal(drawn.isError, undefined);
    assert.match(await readFile(join(dir, 'drawn.svg'), 'utf8'), /^<svg [\s\S]*Saved/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a mockup’s link holds its line as the mockup draws it', () => {
  const answer = handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'create_mockup',
      arguments: { title: 'Dune', kind: 'card', text: `Out   now ${'x'.repeat(5000)}` },
    },
  });
  const line = new URL(/** @type {any} */ (answer).result.structuredContent.imageUrl).searchParams.get('text');
  assert.equal(line, `Out now ${'x'.repeat(72)}`);
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
  // A batch is capped (each message may draw a cover), and an empty one is an error.
  const many = await (
    await post(
      'POST',
      Array.from({ length: 21 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'ping' })),
    )
  ).json();
  assert.equal(many.error.code, -32600);
  assert.equal((await (await post('POST', [])).json()).error.code, -32600);
  // An id nested too deep to write back: an answer all the same, not a crash of the Worker.
  const deep = await worker.fetch(
    new Request('https://covers.example/mcp', {
      method: 'POST',
      body: `{"jsonrpc":"2.0","id":${'['.repeat(20_000)}${']'.repeat(20_000)},"method":"ping"}`,
    }),
    {},
    { waitUntil() {} },
  );
  assert.equal(deep.status, 200);
  assert.deepEqual((await deep.json()).id, null);
  assert.equal((await post('GET')).status, 405);
  assert.equal((await post('OPTIONS')).status, 204);
  const bad = await worker.fetch(
    new Request('https://covers.example/mcp', { method: 'POST', body: '{' }),
    {},
    { waitUntil() {} },
  );
  assert.equal(bad.status, 400);
});

test('the links are the options drawn, whatever form the arguments took', () => {
  /** @param {Record<string, unknown>} args */
  const drawnAlike = (args) => {
    const answer = call('tools/call', { name: 'create_cover', arguments: { ...args, svg: true } }).result;
    assert.equal(answer.isError, undefined, JSON.stringify(args));
    const query = new URL(answer.structuredContent.imageUrl).searchParams;
    assert.equal(createCover(optionsFromLink(query)).svg, answer.content[1].text, JSON.stringify(args));
  };
  drawnAlike({ title: 'Dune', palette: 'custom-0b132b-f8f9fa-ff6b6b' });
  drawnAlike({ title: 'Dune', subtitle: 2026, seed: 7 });
  drawnAlike({ title: 'Dune', style: 'silhouette', variants: { scene: '', moon: null } });
  // A colour that isn't one is the library's error, about that colour.
  const red = call('tools/call', {
    name: 'create_cover',
    arguments: { title: 'X', colors: { bg: 'red', ink: '#fff', accents: ['#f00'] } },
  }).result;
  assert.equal(red.isError, true);
  // A mockup reports its own size.
  const card = call('tools/call', { name: 'create_mockup', arguments: { title: 'X', kind: 'card' } }).result;
  assert.deepEqual([card.structuredContent.width, card.structuredContent.height], [1200, 630]);
  assert.match(
    call('tools/call', { name: 'create_mockup', arguments: { title: 'X', kind: 'ereader' } }).result.content[0].text,
    /^Drew an ereader mockup/,
  );
});

test('the Worker reads at most 1 MB of a body, even one that doesn’t say its length', async () => {
  const chunk = new TextEncoder().encode('x'.repeat(64 * 1024));
  let sent = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent++ < 40) controller.enqueue(chunk);
      else controller.close();
    },
  });
  const res = await worker.fetch(
    new Request('https://covers.example/mcp', { method: 'POST', body: stream, duplex: 'half' }),
    {},
    { waitUntil() {} },
  );
  assert.equal(res.status, 413);
  assert.ok(sent < 40, `read ${sent} chunks`);
});

test('the MCP registry entry (server.json) is this package, at its version, with this server', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const server = JSON.parse(await readFile(new URL('../server.json', import.meta.url), 'utf8'));
  // (The registry checks the package's mcpName is the entry's name.)
  assert.equal(server.name, pkg.mcpName);
  assert.equal(server.version, pkg.version);
  assert.ok(server.description.length <= 100, 'the registry takes 100 characters');
  const [npm] = server.packages;
  assert.deepEqual([npm.identifier, npm.version], [pkg.name, pkg.version]);
  assert.deepEqual(npm.packageArguments, [{ type: 'positional', value: '--mcp' }]);
  assert.deepEqual(server.remotes, [{ type: 'streamable-http', url: 'https://covers.otsirh.dev/mcp' }]);
});
