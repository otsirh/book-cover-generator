# Book Cover Generator

Generate book covers from a **title** and an **author**. 27 styles, 20 palettes, a seeded randomizer, and export to **SVG, PNG or JPEG**. It has no dependencies and is written as plain ES modules, so it runs in the browser and in Node.

**[▶ Open the generator](https://covers.otsirh.dev)**

![Sample covers](docs/preview.png)

## Features

- **27 styles:** minimal, swiss, bauhaus, big letter, classic paperback, art deco, aurora, landscape, retro sun, constellation, orbit, waves, halftone, topographic, flow field, low poly, mosaic, stripes, concentric, split, blocks, pixel, sunburst, memphis, noir, typewriter, bookshelf.
- **20 palettes** (10 light, 10 dark), or pass your own.
- **Randomizer.** Every random choice comes from a seed, so the same seed always gives the same cover. If you don't pass a seed, it is derived from the title and author.
- **Text fitting.** Titles wrap with balanced lines and shrink to fit their box, so very long titles still fit.
- **Any size.** 2:3 paperback, 5:8 eBook, 1:1 audiobook, or any width × height you choose.
- **Export.** Copy the SVG, or download it as SVG, PNG or JPEG at up to 4× resolution.

## The web app

The page at <https://covers.otsirh.dev> lets you type a title and author, then pick a style, a palette and a seed (or roll the dice for any of them). You can also press **R** to randomize everything. The page shows your book in every style at once, and the URL keeps your settings, so you can share a design by sharing the link.

## Library usage

### Browser (no install)

```html
<script type="module">
  import { generateCover } from 'https://cdn.jsdelivr.net/gh/otsirh/book-cover-generator@main/src/index.js';

  document.body.innerHTML = generateCover({
    title: 'The Lighthouse Keeper',
    author: 'Mara Ellison',
    style: 'artdeco',
    palette: 'midnight',
  });
</script>
```

### Node / bundlers

```sh
npm install github:otsirh/book-cover-generator
```

```js
import { createCover, styles, palettes } from 'book-cover-generator';
import { writeFileSync } from 'node:fs';

const { svg, style, palette, seed } = createCover({
  title: 'Neon Tide',
  author: 'Kai Moreno',
  style: 'random', // or one of `styles`
  seed: 42, // same seed, same cover
  width: 1600,
  height: 2560,
});
writeFileSync('cover.svg', svg);
```

### CLI

```sh
npx github:otsirh/book-cover-generator "The Lighthouse Keeper" "Mara Ellison" --style artdeco -o cover.svg
book-cover --list   # all styles and palettes
```

## API

### `generateCover(options) → string`

Returns the SVG markup.

### `createCover(options) → { svg, style, palette, seed, width, height }`

Same as `generateCover`, but also tells you which style and palette were chosen. This is useful when either one was random.

| option    | type                       | default                | notes                                            |
| --------- | -------------------------- | ---------------------- | ------------------------------------------------ |
| `title`   | `string`                   | `'Untitled'`           |                                                  |
| `author`  | `string`                   | `''`                   | optional                                         |
| `style`   | `string`                   | `'random'`             | a style id, see `styles`                         |
| `palette` | `string \| object`         | `'random'`             | a palette id, or `{ bg, ink, accents: [...] }`   |
| `seed`    | `string \| number`         | hash of title + author | controls every random choice                     |
| `width`   | `number`                   | `600`                  | px, 50–10000                                     |
| `height`  | `number`                   | `width × 1.5`          | px, 50–10000                                     |

With `'random'`, the style and palette are picked from the seed, so you get the same result every time for the same seed. Some styles prefer dark or light palettes when they pick one themselves.

### Other exports

- `styles`: array of style ids
- `listStyles()`: `[{ id, name, description }]`
- `palettes`: `[{ id, name, bg, ink, accents, dark? }]`
- `randomSeed()`: a short random seed string
- `registerStyle({ id, name, description, render(ctx) })`: add your own style (see below)
- `fitText`, `drawText`, `FONTS`, `setTextMeasurer`: the text helpers the built-in styles use

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

- **Fonts.** Covers only use system font stacks (Georgia, Helvetica, Futura, Didot, Impact, Courier and others, with fallbacks). This is because an SVG drawn into a canvas for PNG/JPEG export can't load web fonts. In the browser, text is measured with a canvas, so it fits exactly. In Node, widths are estimated.
- **Deterministic.** The same options always give the same artwork. In Node the SVG is identical every time. In the browser, text is measured with the fonts installed on that computer, so line breaks can differ slightly between machines. Registering a custom style changes which style `style: 'random'` picks for a given seed.

## Development

```sh
npm test                    # node --test
python3 -m http.server      # then open http://localhost:8000
npm run deploy              # build dist/ and deploy to Cloudflare
```

GitHub Actions runs the tests on every push and pull request. The site is hosted on Cloudflare at <https://covers.otsirh.dev>, and `npm run deploy` publishes it using your local `wrangler login`.

Open `examples/contact-sheet.html?palettes=noir,mint&seeds=a,b` to see many covers at once.

## License

MIT
