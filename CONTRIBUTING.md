# Contributing

Thanks for helping! Bug reports, new styles and palettes, and fixes are all welcome.

## Setup

```sh
npm ci
npx playwright install   # browsers for the end-to-end tests
npm run dev              # http://127.0.0.1:4173
```

You need Node 24 for development (see `.nvmrc`). The library itself supports Node 18.3 and later.

npm only runs install scripts for packages listed in `allowScripts` in `package.json`, pinned to exact versions. When a Dependabot update bumps `wrangler`, approve its new `esbuild` and `workerd` versions with `npm install-scripts approve <package>` after checking them.

## Before you open a pull request

```sh
npm run check      # lint, format check, type check, package check, unit tests
npm run test:e2e   # browser tests (CI runs these too)
```

`npm run format` fixes formatting. CI must be green before a pull request is merged.

## Adding a style

1. Add the style object to one of the files in `src/styles/` (or a new one) with an `id`, `name`, `description` and `render(c)`. Annotate `render` with `/** @param {import('../index.js').StyleContext} c */` so it is type-checked.
2. Register it in `src/styles/index.js` and add its id to the `StyleId` union in `src/index.d.ts`.
3. Draw everything relative to `c.W`, `c.H`, `c.u` and `c.m`, so the style works at every size and aspect ratio. Use `c.rng` for randomness, never `Math.random`, and `c.id()` for gradient, filter and mask ids.
4. Use `fitText` and `drawText` for text, and check long titles, empty authors, square covers and dark and light palettes on the contact sheet (`examples/contact-sheet.html?styles=<id>&palettes=noir,mint,sky&seeds=a,b,c`).
5. Update the style count in the README and the page if it changes, and add a line to `CHANGELOG.md`.

The unit tests render every style with every palette at several sizes and check that the SVG is well-formed, so most mistakes show up in `npm test`.

## Deploying

Maintainers deploy with `npm run deploy`. It runs every check and the browser tests, then publishes `dist/` to Cloudflare with `wrangler`.
