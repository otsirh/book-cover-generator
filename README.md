# Book Cover Generator

[![CI](https://github.com/otsirh/book-cover-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/otsirh/book-cover-generator/actions/workflows/ci.yml)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fcovers.otsirh.dev&label=covers.otsirh.dev)](https://covers.otsirh.dev)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Types](https://img.shields.io/badge/types-included-blue)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Generate book covers from a **title** and an **author**. 27 styles, 20 palettes, a seeded randomizer, and export to **SVG, PNG or JPEG**. The library has no dependencies and ships TypeScript types. It's written as plain ES modules, so it runs in the browser and in Node.

**[▶ Open the generator](https://covers.otsirh.dev)**

![Sample covers](docs/preview.png)

## Features

- **27 styles:** minimal, swiss, bauhaus, big letter, classic paperback, art deco, aurora, landscape, retro sun, constellation, orbit, waves, halftone, topographic, flow field, low poly, mosaic, stripes, concentric, split, blocks, pixel, sunburst, memphis, noir, typewriter, bookshelf.
- **20 palettes** (10 light, 10 dark), or pass your own.
- **Randomizer.** Every random choice comes from a seed, so the same seed always gives the same cover. If you don't pass a seed, it is derived from the title and author.
- **Text fitting.** Titles wrap with balanced lines and shrink to fit their box, so very long titles still fit. Accents, emoji and non-Latin scripts are handled.
- **Any size.** 2:3 paperback, 5:8 eBook, 1:1 audiobook, or any width × height from 50 to 10,000 px.
- **Export.** Copy the SVG, or download it as SVG, PNG or JPEG at up to 4× resolution.

## The web app

On [covers.otsirh.dev](https://covers.otsirh.dev) you type a title and author, then pick a style, a palette and a seed, or roll the dice for any of them. Press **R** to randomize everything. The page shows your book in every style at once. The URL keeps your settings, so you can share a design by sharing the link, and the browser's back button works too.

## Library usage

### Browser (no install)

```html
<script type="module">
  import { generateCover } from 'https://cdn.jsdelivr.net/gh/otsirh/book-cover-generator@1/src/index.js';

  document.body.innerHTML = generateCover({
    title: 'The Lighthouse Keeper',
    author: 'Mara Ellison',
    style: 'artdeco',
    palette: 'midnight',
  });
</script>
```

`@1` gives you the latest 1.x release. Pin an exact version (such as `@1.1.0`) if you need the artwork to never change.

### Node / bundlers

```sh
npm install "github:otsirh/book-cover-generator#semver:^1"
```

```js
import { createCover } from 'book-cover-generator';
import { writeFileSync } from 'node:fs';

const { svg, style, palette, seed } = createCover({
  title: 'Neon Tide',
  author: 'Kai Moreno',
  style: 'random', // or a style id, see `styles`
  seed: 42, // same seed, same cover
  width: 1600,
  height: 2560,
});
writeFileSync('cover.svg', svg);
```

### CLI

```sh
npx github:otsirh/book-cover-generator "The Lighthouse Keeper" "Mara Ellison" --style artdeco -o cover.svg
npx github:otsirh/book-cover-generator --list   # all styles and palettes
```

Options: `-s/--style`, `-p/--palette`, `--seed`, `--width`, `--height`, `-o/--out`, `--list`, `--help`.

## API

### `generateCover(options) → string`

Returns the SVG markup.

### `createCover(options) → { svg, style, palette, seed, width, height }`

Same as `generateCover`, but also tells you which style and palette were chosen. This is useful when either one was random.

| option    | type               | default                | notes                                          |
| --------- | ------------------ | ---------------------- | ---------------------------------------------- |
| `title`   | `string`           | `'Untitled'`           |                                                |
| `author`  | `string`           | `''`                   | optional                                       |
| `style`   | `string`           | `'random'`             | a style id, see `styles`                       |
| `palette` | `string \| object` | `'random'`             | a palette id, or `{ bg, ink, accents: [...] }` |
| `seed`    | `string \| number` | hash of title + author | controls every random choice                   |
| `width`   | `number`           | `600`                  | px, 50–10000                                   |
| `height`  | `number`           | `width × 1.5`          | px, 50–10000                                   |

With `'random'`, the style and palette are picked from the seed, so you get the same result every time for the same seed. Some styles prefer dark or light palettes when they pick one themselves. Invalid options throw an error that says what's wrong.

### Other exports

- `styles`: array of style ids
- `listStyles()`: `[{ id, name, description }]`
- `palettes`: `[{ id, name, bg, ink, accents, dark? }]`
- `randomSeed()`: a short random seed string
- `registerStyle({ id, name, description, prefer, render(ctx) })`: add your own style (see below)
- `fitText`, `drawText`, `measureText`, `setTextMeasurer`, `FONTS`: the text helpers the built-in styles use
- `svgUtils`: the SVG, colour and noise helpers the built-in styles use

### TypeScript

Types are included. `CoverOptions`, `Cover`, `StyleId`, `PaletteId`, `StyleContext`, `CoverStyle` and the rest are exported from the main entry point, and style and palette ids autocomplete.

### Export helpers (browser)

```js
import { downloadCover, rasterize, copyText, svgToDataUrl } from 'book-cover-generator/browser';

await copyText(svg); // copy SVG markup
await downloadCover(svg, 'svg', 'my-cover'); // my-cover.svg
await downloadCover(svg, 'png', 'my-cover', { scale: 3 }); // 1800×2700 PNG
await downloadCover(svg, 'jpeg', 'my-cover', { scale: 2, quality: 0.9 });
const blob = await rasterize(svg, { type: 'image/webp', scale: 2 });
```

### Custom palette

```js
generateCover({
  title: 'Bright Machines',
  palette: { bg: '#0b132b', ink: '#f8f9fa', accents: ['#ff6b6b', '#4ecdc4', '#ffe66d'] },
});
```

### Custom style

`render(ctx)` returns SVG markup without the outer `<svg>` element. `ctx` contains:

- `title`, `author`
- `W`, `H`: the size of the cover
- `u`: a scale unit (1 at a short side of 600px)
- `m`: the suggested margin
- `rng`: seeded random with `next`, `float`, `int`, `bool`, `pick`, `shuffle`
- `p`: the palette, with `bg`, `ink`, `accents`, plus `paper` (lighter) and `night` (darker)
- `id(name)`: makes ids that are unique per cover, for gradients and filters

```js
import { registerStyle, fitText, drawText, FONTS } from 'book-cover-generator';

registerStyle({
  id: 'plain',
  name: 'Plain',
  render(c) {
    const t = fitText(c.title, { font: FONTS.serif, maxWidth: c.W - c.m * 2, maxSize: c.W * 0.1 });
    return `<rect width="${c.W}" height="${c.H}" fill="${c.p.bg}"/>` + drawText(t, { x: c.m, y: c.m, fill: c.p.ink });
  },
});
```

## Notes

- **Fonts.** Covers only use system font stacks (Georgia, Helvetica, Futura, Didot, Impact, Courier and others, with fallbacks). This is because an SVG drawn into a canvas for PNG/JPEG export can't load web fonts. In the browser, text is measured with a canvas, so it fits exactly. In Node, widths are estimated; plug in a real font engine with `setTextMeasurer` if you need exact fits there.
- **Deterministic.** The same options always give the same artwork. In Node the SVG is identical every time. In the browser, text is measured with the fonts installed on that computer, so line breaks can differ slightly between machines. Registering a custom style changes which style `style: 'random'` picks for a given seed.
- **Versioning.** Artwork for a given seed can change in minor releases (a style gets better). Pin an exact version if you need byte-identical covers forever.
- **Browser support.** Current Chrome, Edge, Firefox and Safari. Every release is tested in Chromium, Firefox and WebKit, including PNG and JPEG export.

## Development

```sh
npm ci                     # install dev tooling (the library itself has no dependencies)
npx playwright install     # browsers for the end-to-end tests
npm run dev                # http://127.0.0.1:4173
```

| script                  | what it does                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run check`         | lint, format check, type check, package check and unit tests      |
| `npm test`              | unit tests (`node --test`)                                        |
| `npm run test:coverage` | unit tests with coverage thresholds                               |
| `npm run test:e2e`      | browser tests in Chromium, Firefox, WebKit and mobile Chrome      |
| `npm run format`        | format everything with Prettier                                   |
| `npm run assets`        | regenerate the app icons and the social preview image             |
| `npm run deploy`        | run every check, then build and deploy to Cloudflare (`wrangler`) |

Open `examples/contact-sheet.html?palettes=noir,mint&seeds=a,b` on the dev server to see many covers at once.

### Project layout

```
src/            the library (plain ES modules + .d.ts types)
  styles/       the 27 styles, grouped by family
bin/            the CLI
site/           the web app (index.html is at the root)
public/         files served at the site root: headers, 404, icons, manifest
test/           unit tests (node --test)
test-d/         type tests (tsc)
e2e/            browser tests (Playwright)
scripts/        build, dev server and asset generation
```

The site is a static [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/) deployment configured in `wrangler.jsonc`, with security headers in `public/_headers`.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), and report security issues as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
