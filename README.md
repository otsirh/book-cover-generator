# Book Cover Generator

[![CI](https://github.com/otsirh/book-cover-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/otsirh/book-cover-generator/actions/workflows/ci.yml)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fcovers.otsirh.dev&label=covers.otsirh.dev)](https://covers.otsirh.dev)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Types](https://img.shields.io/badge/types-included-blue)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Generate book covers from a **title** and an **author**. 34 styles, 28 palettes, a seeded randomizer, and export to **SVG, PNG or JPEG**. The library has no dependencies and ships TypeScript types. It's written as plain ES modules, so it runs in the browser and in Node.

**[▶ Open the generator](https://covers.otsirh.dev)**

![Sample covers](docs/preview.png)

## Features

- **34 styles in six families.**
  - Typographic: Big Type, Minimal, Big Letter, Swiss.
  - Genre: Thriller, Botanical, Noir, Blueprint.
  - Vintage: Art Deco, Classic Paperback, Engraved, Sunburst, Typewriter.
  - Scenic: Landscape, Retro Sun, Silhouette, Constellation, Orbit, Waves, Aurora, Bookshelf.
  - Geometric: Bauhaus, Split, Blocks, Concentric, Stripes.
  - Pattern: Paper Cut, Halftone, Topographic, Flow Field, Low Poly, Mosaic, Memphis, Pixel.
- **28 palettes** (15 light, 13 dark), or pass your own. Every style adapts to light and dark palettes.
- **Typography that responds to the title.** Short titles are set large, a leading "The" or "A" becomes a small line above the title, and some styles stack the words edge to edge. Long titles wrap with balanced lines and shrink to fit. Author names stay readable at thumbnail size. Accents, emoji, Chinese, Japanese and Thai are handled.
- **Subtitle or tagline**, and an optional **paper texture**.
- **Randomizer.** Every random choice comes from a seed, so the same seed always gives the same cover. If you don't pass a seed, it is derived from the title and author.
- **Any size.** 2:3 paperback, 5:8 eBook, 1:1 audiobook, or any width × height from 50 to 10,000 px with an aspect ratio between 1:3 and 3:1.
- **Export.** Copy the SVG, or download it as SVG, PNG or JPEG at up to 4× resolution.

## The web app

On [covers.otsirh.dev](https://covers.otsirh.dev) you type a title and author, then choose:

- **a style**, from a rail that previews your book in all 34 styles;
- **a palette**, from swatches that show the background, text colour and accents;
- **a variation**, the seed behind the artwork.

**Randomize** reshuffles everything, except what you've locked. Undo and redo step back and forth through your designs, and so do the browser's Back and Forward buttons. **Keep** saves a design to a tray under the preview. **Copy link** shares the exact design, because the URL holds every setting. The export panel tells you which size suits Kindle, print or audiobook covers.

Keyboard shortcuts:

- `R` randomizes.
- `←` and `→` step through styles.
- `[` and `]` step through palettes.
- `Z` undoes and `Shift+Z` redoes.

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

Options: `-s/--style`, `-p/--palette`, `--subtitle`, `--texture`, `--seed`, `--width`, `--height`, `-o/--out`, `--list`, `--help`.

## API

### `generateCover(options) → string`

Returns the SVG markup.

### `createCover(options) → { svg, style, palette, seed, width, height }`

Same as `generateCover`, but also tells you which style and palette were chosen. This is useful when either one was random.

| option     | type               | default                | notes                                          |
| ---------- | ------------------ | ---------------------- | ---------------------------------------------- |
| `title`    | `string`           | `'Untitled'`           |                                                |
| `author`   | `string`           | `''`                   | optional                                       |
| `subtitle` | `string`           | `''`                   | optional subtitle or tagline                   |
| `texture`  | `boolean`          | `false`                | adds a fine film grain                         |
| `style`    | `string`           | `'random'`             | a style id, see `styles`                       |
| `palette`  | `string \| object` | `'random'`             | a palette id, or `{ bg, ink, accents: [...] }` |
| `seed`     | `string \| number` | hash of title + author | controls every random choice                   |
| `width`    | `number`           | `600`                  | px, 50–10000; aspect ratio 1:3 to 3:1          |
| `height`   | `number`           | `width × 1.5`          | px, 50–10000                                   |

Titles and subtitles longer than 300 characters (authors: 200) are cut. With `'random'`, the style and palette are picked from the seed, so you get the same result every time for the same seed. Some styles prefer dark or light palettes when they pick one themselves. Invalid options throw an error that says what's wrong.

### Other exports

- `styles`: array of style ids
- `listStyles()`: `[{ id, name, description, group }]`
- `palettes`: `[{ id, name, bg, ink, accents, dark? }]`
- `randomSeed()`: a short random seed string
- `pickStyle(options)`: the style id `createCover` would use for these options (resolving `'random'` from the seed), without drawing the cover
- `registerStyle({ id, name, description, group, prefer, render(ctx) })`: add your own style (see below)
- `titleBlock`, `authorFit`: the typography the built-in styles use (a title with its lead line and subtitle, and the author line)
- `fitText`, `drawText`, `fitStack`, `drawStack`, `splitLead`, `measureText`, `setTextMeasurer`, `FONTS`: lower-level text helpers
- `svgUtils`: the SVG, colour and noise helpers the built-in styles use

### TypeScript

Types are included. `CoverOptions`, `Cover`, `StyleId`, `PaletteId`, `StyleGroup`, `StyleContext`, `CoverStyle`, `TitleBlock` and the rest are exported from the main entry point, and style and palette ids autocomplete.

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

- `title`, `author`, `subtitle` (may be empty)
- `W`, `H`: the size of the cover
- `u`: a scale unit (1 at a short side of 600px)
- `m`: the suggested margin
- `S`: the short side; base text sizes on it so wide covers work
- `rng`: seeded random with `next`, `float`, `int`, `bool`, `pick`, `shuffle`
- `p`: the palette, with `bg`, `ink`, `accents`, plus `paper` (lighter) and `night` (darker)
- `id(name)`: makes ids that are unique per cover, for gradients and filters

```js
import { registerStyle, titleBlock, authorFit, drawText, FONTS } from 'book-cover-generator';

registerStyle({
  id: 'plain',
  name: 'Plain',
  group: 'Typographic',
  render(c) {
    const title = titleBlock(c, {
      font: FONTS.serif,
      maxWidth: c.W - c.m * 2,
      maxHeight: c.H * 0.5,
      maxSize: c.S * 0.2,
    });
    const author = authorFit(c);
    return (
      `<rect width="${c.W}" height="${c.H}" fill="${c.p.bg}"/>` +
      title.draw({ x: c.m, y: c.m, fill: c.p.ink }) +
      drawText(author, { x: c.m, y: c.H - c.m - author.height, fill: c.p.ink })
    );
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
| `npm run assets`        | regenerate the app icons, the social preview and the README image |
| `npm run deploy`        | run every check, then build and deploy to Cloudflare (`wrangler`) |

Open `examples/contact-sheet.html?palettes=noir,mint&seeds=a,b` on the dev server to see many covers at once (also `styles`, `titles`, `subtitle`, `w`, `h`, `cols` and `texture=1`).

### Project layout

```
src/            the library (plain ES modules + .d.ts types)
  styles/       the 34 styles, one file per family
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
