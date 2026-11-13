// The HTTP API described as OpenAPI 3.1 (/api/openapi.json), made from the library's own lists, so
// it names every style, palette, font, genre and mockup the deployed Worker knows.

import { version, sizeLimits } from '../src/index.js';
import { catalog } from '../src/mcp.js';
import { COVER_PIXELS } from './png.js';

/**
 * A query parameter.
 * @param {string} name @param {string} description @param {Record<string, unknown>} [schema]
 */
const param = (name, description, schema = { type: 'string' }) => ({ name, in: 'query', description, schema });

/** A plain-text refusal, with what's wrong. @param {string} description */
const refused = (description) => ({ description, content: { 'text/plain': { schema: { type: 'string' } } } });

/**
 * The API, as OpenAPI 3.1.
 * @param {string} base the site the API is served from
 */
export function openapi(base) {
  const { styles, palettes, genres, fonts, formats, mockups } = catalog();
  const design = [
    param('title', 'The title. Line breaks (%0A) break it there.'),
    param('author', "The author's name."),
    param('subtitle', 'A subtitle or tagline.'),
    param('series', 'A series line, such as "Book One".'),
    param('credit', 'A credit line, such as "Foreword by …".'),
    param('badge', 'A small badge, such as "Bestseller".'),
    param('style', 'A style, by id or name in any case, or "random" (the default: the seed picks one).', {
      type: 'string',
      examples: [...styles.map((s) => s.id), 'random'],
    }),
    param('genre', 'With no style: a style for this genre.', { type: 'string', enum: genres.map((g) => g.id) }),
    param(
      'variant',
      'Choices the style lets you pin (/api/catalog.json lists them): name.value pairs joined by "-", such as scene.forest.',
      { type: 'string', pattern: '^[a-z][a-z0-9]*\\.[a-z][a-z0-9]*(-[a-z][a-z0-9]*\\.[a-z][a-z0-9]*)*$' },
    ),
    param('palette', 'A palette, by id or name in any case, or "auto" (the default: the seed picks one).', {
      type: 'string',
      examples: [...palettes.map((p) => p.id), 'auto'],
    }),
    param('bg', 'Your own colours, with ink and accent: the background, as hex (# optional).'),
    param('ink', 'Your own colours: the text colour, as hex.'),
    param('accent', 'Your own colours: one to three accent colours, as hex, separated by commas.'),
    param('font', "The title's font, by id or name (default: the style's own).", {
      type: 'string',
      enum: fonts.map((f) => f.id),
    }),
    param('case', "The title's case (default: the style's own).", { type: 'string', enum: ['upper', 'normal'] }),
    param('seed', 'Any text: the same seed draws the same cover. Default: from the title and author.'),
    param(
      'format',
      `A shape: ${Object.keys(formats).join(', ')}, or a size in px such as 1600x2560. Default: paperback.`,
      { type: 'string', examples: [...Object.keys(formats), '1600x2560'] },
    ),
    param('width', `The width in px (${sizeLimits.min} to ${sizeLimits.max}); with a format, it scales it.`, {
      type: 'integer',
      minimum: sizeLimits.min,
      maximum: sizeLimits.max,
    }),
    param('height', `The height in px (${sizeLimits.min} to ${sizeLimits.max}); with a format, it scales it.`, {
      type: 'integer',
      minimum: sizeLimits.min,
      maximum: sizeLimits.max,
    }),
    param('texture', 'Paper grain: 1 (on) or 0 (off).', { type: 'string', enum: ['0', '1'] }),
    param('lang', "The text's language (BCP 47), for its capitals, such as tr."),
  ];
  const mockup = [
    param('kind', 'What to show the cover as.', { type: 'string', enum: mockups, default: 'book' }),
    param('text', 'A line for the social cards (card, square, story).'),
    param('background', 'The background colour, as hex.'),
  ];
  const scale = param('scale', 'Multiplies the size: above 0, at most 4. Default: the size, or smaller to fit.', {
    type: 'number',
    exclusiveMinimum: 0,
    maximum: 4,
  });
  const download = param('download', 'Answer as a file to save: 1 names it after the title, any other text names it.');
  const drawn = {
    400: refused("A parameter the API can't read, and why."),
    429: refused('Too many PNGs this minute: wait (Retry-After) or ask for the SVG.'),
  };
  /** A drawing endpoint. @param {string} summary @param {string} type @param {object[]} parameters @param {Record<string, unknown>} [more] */
  const draw = (summary, type, parameters, more = {}) => ({
    get: {
      summary,
      parameters: [...parameters, download],
      responses: {
        200: { description: 'The picture.', content: { [type]: { schema: { type: 'string', format: 'binary' } } } },
        400: drawn[400],
        ...more,
      },
    },
  });
  const png = {
    500: refused('resvg could not draw this design: ask for the SVG, or again later.'),
    422: refused('Text in a script the PNG fonts lack (they have Latin, Greek and Cyrillic): ask for the SVG.'),
    429: drawn[429],
    503: refused('PNGs are unavailable just now: ask for the SVG.'),
  };
  const json = (/** @type {string} */ description) => ({
    description,
    content: { 'application/json': { schema: { type: 'object' } } },
  });
  return {
    openapi: '3.1.0',
    info: {
      title: 'Book Cover Generator',
      version,
      description:
        "Book covers from a title and an author. A query is the web app's link: the part of a design's link after # draws that design. Free to use; please cache what you use often.",
      license: { name: 'MIT', identifier: 'MIT' },
    },
    externalDocs: { description: 'README', url: 'https://github.com/otsirh/book-cover-generator#http-api' },
    servers: [{ url: base }],
    paths: {
      '/api/cover.svg': draw('A cover, as SVG', 'image/svg+xml', design),
      '/api/cover.png': draw(
        `A cover, as PNG (at most ${COVER_PIXELS.toLocaleString('en')} px: smaller to fit, or as scale asks)`,
        'image/png',
        [...design, scale],
        png,
      ),
      '/api/mockup.svg': draw('A mockup of a cover (3D book, e-reader, social card…), as SVG', 'image/svg+xml', [
        ...design,
        ...mockup,
      ]),
      '/api/mockup.png': draw('A mockup of a cover, as PNG', 'image/png', [...design, ...mockup, scale], png),
      '/api/cover.json': {
        get: {
          summary:
            'What a query draws: the style, palette, colours, seed, size and pins it came to, its link with every choice written out, and its URLs',
          parameters: design,
          responses: { 200: json('The cover, described.'), 400: drawn[400] },
        },
      },
      '/api/catalog.json': {
        get: {
          summary: 'Every style (with its genres and pins), palette, genre, font, format and mockup',
          responses: { 200: json('The catalog.') },
        },
      },
      '/api/openapi.json': { get: { summary: 'This description', responses: { 200: json('OpenAPI 3.1.') } } },
      '/mcp': {
        post: {
          summary: 'The Model Context Protocol server (Streamable HTTP, JSON answers, no sessions)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: {
            200: json('The JSON-RPC answer.'),
            202: { description: 'A notification, accepted.' },
            413: json('The body is over 1 MB.'),
            429: json('Too many requests this minute.'),
          },
        },
      },
    },
  };
}
