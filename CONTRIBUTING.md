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
npm run test:fuzz  # property-based fuzzing (part of check)
npm run test:e2e   # browser tests (CI runs these too)
```

`npm run format` fixes formatting. CI must be green before a pull request is merged.

## Adding a style

1. Add the style object to the file for its family in `src/styles/` with an `id`, `name`, `group`, `description` and `render(c)`. Annotate `render` with `/** @param {import('../index.js').StyleContext} c */` so it is type-checked.
2. Register it in `src/styles/index.js`, give it its genres in `builtInGenres` there, and add its id to the `StyleId` union in `src/index.d.ts`.
3. Draw everything relative to `c.W`, `c.H`, `c.u` and `c.m`, so the style works at every size and aspect ratio. Use `c.rng` for randomness, never `Math.random`, and `c.id()` for gradient, filter and mask ids.
4. Set the title with `titleBlock` (it handles the lead line, the subtitle and the height budget) and the author with `authorFit`. Use `strongAccents` from `src/styles/util.js` when a colour must stand out from the background, so the style works with every palette. Check long and short titles, subtitles, empty authors, square and wide covers, and dark and light palettes on the contact sheet (`examples/contact-sheet.html?styles=<id>&palettes=noir,mint,sky&seeds=a,b,c&subtitle=A+Novel`).
5. Update the style count in the README and the page if it changes, and add a line to `CHANGELOG.md`.

If you change a font stack in `FONTS` (`src/text.js`), run `npm run metrics` on a Mac: it measures the stacks' characters in Chrome and rewrites `src/metrics.js`, the widths Node uses where there is no canvas.

The unit tests render every style with every palette at many sizes and shapes, check that the SVG is well-formed, that all text stays on the cover and that the subtitle is drawn, so most mistakes show up in `npm test`.

## Releasing and deploying

To release, set the new version in `package.json`, `jsr.json` and `version` in `src/index.js` (a unit test checks they match), date the `[Unreleased]` section of `CHANGELOG.md`, commit, tag the commit `vX.Y.Z` and push both. The tag runs the Release workflow (`.github/workflows/release.yml`): it checks the tag matches the version, runs the checks, publishes to npm with provenance (npm trusts the workflow, so no token is kept anywhere) and makes the GitHub release from the CHANGELOG section.

Maintainers deploy with `npm run deploy`. It runs every check and the browser tests, then publishes `dist/` to Cloudflare with `wrangler`. The build gives the service worker (`public/sw.js`) a new release name whenever a file it keeps changes, so open apps pick up the new version.
