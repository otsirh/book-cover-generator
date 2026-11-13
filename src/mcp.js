// A Model Context Protocol server, so AI assistants can make covers: `book-cover --mcp` speaks it
// over stdio, and the site's Worker over HTTP at /mcp. This module only answers messages; the
// transports are theirs. (Not part of the library's API.)

import {
  createCover,
  createMockup,
  listStyles,
  palettes,
  genres,
  formats,
  mockupKinds,
  sizeLimits,
  version,
} from './index.js';
import { optionsFromLink, linkOf } from './link.js';
import { mockupText } from './mockups.js';
import { idFor, fontEntries } from './shared.js';

/** The site that draws covers from links, and edits them. */
export const SITE = 'https://covers.otsirh.dev';
/** Protocol versions this server speaks, newest first. */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Makes book covers. create_cover draws one from a title (and an author, a style or a genre, a palette…) and ' +
  'answers with a link to the image (an SVG) and a link that opens it in the editor at covers.otsirh.dev, where ' +
  'it can be changed and downloaded as PNG or JPEG. Give the same seed to keep a cover, another for a variation. ' +
  'list_styles and list_palettes show the choices; create_mockup shows a cover as a 3D book, on an e-reader or ' +
  'on a social card.';

/**
 * @typedef {{ base?: string, writeFile?: (path: string, data: string) => string, pictures?: boolean }} Context
 * `base`: the site links point to; `writeFile`: where a local server can save a file (it answers
 * the path written), else undefined; `pictures`: the server adds the picture to a cover's answer
 * (the site's, which draws PNGs).
 */

/** @param {Context} ctx */
function designProperties(ctx) {
  /** @type {Record<string, object>} */
  const properties = {
    title: { type: 'string', description: "The book's title. A line break (\\n) breaks its line on the cover." },
    author: { type: 'string', description: "The author's name." },
    subtitle: { type: 'string', description: 'A subtitle or tagline.' },
    series: { type: 'string', description: 'A series line above the title, such as "Book Two of the Ember Cycle".' },
    credit: { type: 'string', description: 'A credit under the subtitle, such as "Translated by Ann Lee".' },
    badge: { type: 'string', description: 'A seal in a corner, such as "Winner of the Hugo Award".' },
    style: {
      type: 'string',
      description: 'A style, by id or name (see list_styles), or "random" (the default: the seed picks one).',
    },
    genre: {
      type: 'string',
      description: `With no style, pick one that suits a genre: ${genres.map((g) => `${g.id} (${g.name})`).join(', ')}.`,
    },
    palette: {
      type: 'string',
      description: 'A palette, by id or name (see list_palettes), or "auto" (the default: the seed picks one).',
    },
    colors: {
      type: 'object',
      description: 'Your own colours instead of a palette, as hex.',
      properties: {
        bg: { type: 'string', description: 'Background, such as #0b132b.' },
        ink: { type: 'string', description: 'Text.' },
        accents: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
      },
      required: ['bg', 'ink', 'accents'],
    },
    seed: {
      type: ['string', 'number'],
      description: 'Every random choice comes from it: the same seed draws the same cover; another, a variation.',
    },
    format: {
      type: 'string',
      description: `${Object.keys(formats).join(', ')}, or a size in px such as 1600x2560 (Kindle). Default: paperback (2:3).`,
    },
    font: {
      type: 'string',
      description: `The title's font instead of the style's: ${fontEntries()
        .map((f) => f.id)
        .join(', ')}.`,
    },
    case: { type: 'string', enum: ['upper', 'normal'], description: 'The title in capitals, or as typed.' },
    lang: {
      type: 'string',
      description:
        "The text's language, a tag such as tr or zh-Hant, for its capitals (Turkish İ) and letterforms. Default: from the text.",
    },
    texture: { type: 'boolean', description: 'A fine film grain.' },
    variants: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Choices a style lets you pin, as list_styles shows them, such as { "scene": "forest" }.',
    },
    svg: { type: 'boolean', description: 'Also answer with the SVG markup (large).' },
  };
  if (ctx.writeFile) {
    properties.output = {
      type: 'string',
      description: 'An absolute path of an .svg file to save the SVG to (a new file, or an SVG it replaces).',
    };
  }
  return properties;
}

/** @param {Context} ctx */
function tools(ctx) {
  const design = designProperties(ctx);
  return [
    {
      name: 'create_cover',
      title: 'Create a book cover',
      description: `Draw a book cover. Answers with ${ctx.pictures ? 'the picture, ' : ''}links to the image (SVG and PNG) and to edit it in the app, and the style, palette and seed it used.`,
      inputSchema: { type: 'object', properties: design, required: ['title'] },
      annotations: { readOnlyHint: !ctx.writeFile, openWorldHint: false },
    },
    {
      name: 'create_mockup',
      title: 'Create a mockup of a cover',
      description: `Draw a cover as a product shot (a 3D book, flat, on an e-reader) or on a social card with a line of text.${ctx.pictures ? ' Answers with the picture and its links.' : ''}`,
      inputSchema: {
        type: 'object',
        properties: {
          ...design,
          kind: { type: 'string', enum: [...mockupKinds], description: 'Default: book.' },
          text: { type: 'string', description: 'The line on a card, square or story, such as "Out now".' },
        },
        required: ['title'],
      },
      annotations: { readOnlyHint: !ctx.writeFile, openWorldHint: false },
    },
    {
      name: 'list_styles',
      title: 'List the cover styles',
      description: 'The styles, with their genres and the choices each lets you pin.',
      inputSchema: {
        type: 'object',
        properties: { genre: { type: 'string', description: 'Only styles that suit this genre.' } },
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: 'list_palettes',
      title: 'List the colour palettes',
      description: 'The palettes, light and dark, with their colours.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
  ];
}

/** Whether the arguments give a seed (else the cover's comes from its title). @param {Record<string, unknown>} args */
const seedGiven = (args) => typeof args.seed === 'number' || (typeof args.seed === 'string' && args.seed.trim() !== '');

/** A tool's arguments as a link's query, read as the HTTP API reads one. @param {Record<string, unknown>} args */
function queryFrom(args) {
  const q = new URLSearchParams();
  if (seedGiven(args)) q.set('seed', String(args.seed).trim());
  for (const key of [
    'title',
    'author',
    'subtitle',
    'series',
    'credit',
    'badge',
    'style',
    'genre',
    'palette',
    'format',
    'font',
    'case',
    'lang',
  ]) {
    const value = args[key];
    if (value != null && value !== '') q.set(key, String(value));
  }
  if (typeof args.texture === 'boolean') q.set('texture', args.texture ? '1' : '0');
  if (args.variants && typeof args.variants === 'object') {
    // (An empty pin leaves the choice to the seed, as the library takes it.)
    const pairs = Object.entries(args.variants)
      .filter(([, value]) => value != null && value !== '')
      .map(([name, value]) => `${name}.${String(value)}`);
    if (pairs.length) q.set('variant', pairs.join('-'));
  }
  const colors = /** @type {{ bg?: unknown, ink?: unknown, accents?: unknown } | undefined} */ (args.colors);
  if (colors && typeof colors === 'object') {
    if (!Array.isArray(colors.accents) || colors.accents.length < 1 || colors.accents.length > 3) {
      throw new RangeError('colors.accents is a list of one to three colours');
    }
    // (The link reader writes each as #rrggbb, as the cover's link does: the two draw the same bytes.)
    q.set('bg', String(colors.bg ?? ''));
    q.set('ink', String(colors.ink ?? ''));
    q.set('accent', colors.accents.map((c) => String(c)).join(','));
  }
  return q;
}

/**
 * What covers can be made of: the styles (with their genres and the pins they take), palettes,
 * genres, fonts, formats, sizes and mockups, as list_styles, list_palettes and the HTTP API's
 * /api/catalog.json give them. (Styles and palettes registered in this process are included.)
 */
export function catalog() {
  return {
    version,
    styles: listStyles().map(({ id, name, group, description, genres: suits, variants }) => ({
      id,
      name,
      group,
      description,
      genres: suits,
      variants: variants.map((v) => ({ name: v.name, values: v.values.map((x) => x.value) })),
    })),
    palettes: palettes.map(({ id, name, bg, ink, accents, dark }) => ({
      id,
      name,
      bg,
      ink,
      accents: [...accents],
      dark: !!dark,
    })),
    genres: genres.map(({ id, name }) => ({ id, name })),
    fonts: fontEntries(),
    formats: Object.fromEntries(Object.entries(formats).map(([id, size]) => [id, [...size]])),
    sizeLimits: { ...sizeLimits },
    mockups: [...mockupKinds],
  };
}

/** Text for a tool's answer. @param {string} body */
const text = (body) => ({ type: 'text', text: body });

/**
 * Run a tool: its answer (an error is an answer with isError, so the assistant can fix the call).
 * @param {string} tool @param {Record<string, unknown>} args @param {Context} ctx
 */
function callTool(tool, args, ctx) {
  const base = ctx.base ?? SITE;
  try {
    if (tool === 'list_styles') {
      const genre = typeof args.genre === 'string' && args.genre ? args.genre : null;
      const genreId = genre ? idFor(genre, genres) : null;
      if (genre && !genreId)
        throw new RangeError(`Unknown genre "${genre}". Available: ${genres.map((g) => g.id).join(', ')}`);
      const styles = catalog().styles.filter((s) => !genreId || s.genres.includes(genreId));
      const lines = styles.map((s) => {
        const pins = s.variants.map((v) => `${v.name}: ${v.values.join(', ')}`).join('; ');
        return `- ${s.id} (${s.name}, ${s.group}): ${s.description} Genres: ${s.genres.join(', ') || 'none'}.${pins ? ` Pins: ${pins}.` : ''}`;
      });
      return { content: [text(`${styles.length} styles:\n${lines.join('\n')}`)], structuredContent: { styles } };
    }
    if (tool === 'list_palettes') {
      const listed = catalog().palettes;
      const lines = listed.map(
        (p) =>
          `- ${p.id} (${p.name}, ${p.dark ? 'dark' : 'light'}): ${p.bg} background, ${p.ink} text, ${p.accents.join(' ')}`,
      );
      return {
        content: [text(`${listed.length} palettes:\n${lines.join('\n')}`)],
        structuredContent: { palettes: listed },
      };
    }
    if (tool !== 'create_cover' && tool !== 'create_mockup') return null;
    if (typeof args.title !== 'string' || !args.title.trim()) throw new TypeError('A cover needs a title');
    const options = optionsFromLink(queryFrom(args));
    const cover = createCover(options);
    const link = linkOf(options, cover);
    let [width, height] = [cover.width, cover.height];
    const edit = `${base}/#${link}`;
    let image = `${base}/api/cover.svg?${link}`;
    let svg = cover.svg;
    let what = `"${cover.title.replace(/\n/g, ' ')}"${cover.author ? ` by ${cover.author}` : ''}`;
    if (tool === 'create_mockup') {
      const kind = typeof args.kind === 'string' && args.kind ? args.kind : 'book';
      // (As the mockup draws it, so its link is no longer than its picture's line.)
      const line = typeof args.text === 'string' ? mockupText(args.text) : '';
      const mockup = createMockup(cover, { kind: /** @type {import('./index.js').MockupKind} */ (kind), text: line });
      ({ svg, width, height } = mockup);
      const extra = new URLSearchParams({ kind, ...(line ? { text: line } : {}) });
      image = `${base}/api/mockup.svg?${link}&${extra}`;
      what = `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} mockup of ${what}`;
    }
    const png = image.replace(/\.svg\?/, '.png?');
    const saved =
      typeof args.output === 'string' && args.output && ctx.writeFile ? ctx.writeFile(args.output, svg) : null;
    const styleName = listStyles().find((s) => s.id === cover.style)?.name ?? cover.style;
    const paletteName = palettes.find((p) => p.id === cover.palette)?.name ?? 'your own colours';
    const seed = options.seed != null ? `seed ${cover.seed}` : 'seed from the title';
    const content = [
      text(
        `Drew ${what} in the ${styleName} style (${cover.style}), palette ${paletteName}, ${seed} (${width} × ${height} px).\n` +
          `Image (SVG): ${image}\nPNG: ${png}\nEdit, or download in other sizes: ${edit}` +
          (saved ? `\nSaved to ${saved}` : ''),
      ),
    ];
    if (args.svg === true) content.push(text(svg));
    return {
      content,
      structuredContent: {
        style: cover.style,
        palette: cover.palette,
        // (Null when it comes from the title: give the title again to keep the cover.)
        seed: options.seed != null ? cover.seed : null,
        // (The image's size: a mockup's, for a mockup.)
        width,
        height,
        variants: cover.variants,
        imageUrl: image,
        // (Drawn with open fonts that have Latin, Greek and Cyrillic letters: other scripts, the SVG.)
        pngUrl: png,
        editUrl: edit,
        ...(saved ? { file: saved } : {}),
      },
    };
  } catch (err) {
    return { content: [text(err instanceof Error ? err.message : String(err))], isError: true };
  }
}

/** The most messages a batch may hold (a batch is one request: each message draws a cover). */
export const MAX_BATCH = 20;

/**
 * Answer what a client sent: one message, or a batch (older protocol versions), as each
 * transport receives them. Null when nothing needs an answer (notifications only).
 * @param {unknown} payload @param {Context} [ctx]
 */
export function handlePayload(payload, ctx = {}) {
  if (!Array.isArray(payload)) return handleMessage(payload, ctx);
  if (!payload.length) return failure(null, -32600, 'An empty batch');
  if (payload.length > MAX_BATCH) return failure(null, -32600, `A batch holds at most ${MAX_BATCH} messages`);
  const answers = payload.map((m) => handleMessage(m, ctx)).filter(Boolean);
  return answers.length ? answers : null;
}

/**
 * The answer to what a client sent, as objects (null when nothing needs one): an error in answering
 * is the Internal error answer, never a throw.
 * @param {unknown} payload @param {Context} [ctx]
 */
export function answerOf(payload, ctx = {}) {
  try {
    return handlePayload(payload, ctx);
  } catch {
    return failure(null, -32603, 'Internal error');
  }
}

/**
 * An answer as JSON text (one that can't be written, an id nested too deep say, the Internal error).
 * @param {unknown} answer
 */
export function answerText(answer) {
  try {
    return JSON.stringify(answer);
  } catch {
    return JSON.stringify(failure(null, -32603, 'Internal error'));
  }
}

/**
 * The answer to what a client sent, as the JSON text a transport sends (null when nothing needs
 * one).
 * @param {unknown} payload @param {Context} [ctx]
 */
export function answerPayload(payload, ctx = {}) {
  const answer = answerOf(payload, ctx);
  return answer ? answerText(answer) : null;
}

/** @param {unknown} id @param {unknown} result */
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
/** An id as JSON-RPC allows it, so it can be sent back: a string, a number or null. @param {unknown} id */
const validId = (id) => id === null || typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
/** @param {unknown} id @param {number} code @param {string} message */
const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/**
 * Answer one JSON-RPC message: a response, or null for a notification (which has none).
 * @param {unknown} message @param {Context} [ctx]
 */
export function handleMessage(message, ctx = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message))
    return failure(null, -32600, 'Invalid request');
  const { jsonrpc, id, method, params } = /** @type {Record<string, any>} */ (message);
  const hasId = 'id' in message;
  // A response (this server sends no requests, so it answers none): nothing to say.
  if (jsonrpc === '2.0' && !('method' in message) && hasId && ('result' in message || 'error' in message)) {
    return null;
  }
  // Not a request: an error, with its id if it is one JSON-RPC allows (else null, as for none).
  if (jsonrpc !== '2.0' || typeof method !== 'string' || (hasId && !validId(id))) {
    return failure(hasId && validId(id) ? id : null, -32600, 'Invalid request');
  }
  // A notification (initialized, cancelled…) has no answer.
  if (!hasId) return null;
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'book-cover-generator', title: 'Book Cover Generator', version },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: tools(ctx) });
    case 'tools/call': {
      const name = params?.name;
      // (Arguments may be left out, but not given as something other than an object.)
      const args = params?.arguments === undefined ? {} : params.arguments;
      if (typeof name !== 'string' || typeof args !== 'object' || args === null) {
        return failure(id, -32602, 'tools/call needs a tool name and its arguments');
      }
      const answer = callTool(name, args, ctx);
      return answer ? ok(id, answer) : failure(id, -32602, `Unknown tool "${name}"`);
    }
    default:
      return failure(id, -32601, `Method not found: ${method}`);
  }
}
