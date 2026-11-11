# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Artwork for a given seed may change in minor releases.

## [Unreleased]

## [1.2.0] - 2026-11-12

A redesign of the covers and the app, based on a design review.

### Added

- Seven styles: **Big Type**, **Thriller**, **Botanical**, **Engraved**, **Paper Cut**, **Silhouette** (city or forest) and **Blueprint**, for 34 in total, grouped into six families (`listStyles()` returns each style's `group`).
- Eight palettes, for 28 in total: Mono, Clean, Riso, Pastel, Sage, Oxblood, Thriller and Dusk.
- `subtitle` and `texture` options.
- Typography helpers for custom styles: `titleBlock`, `authorFit`, `fitStack`, `drawStack` and `splitLead`, plus `StyleContext.subtitle`.
- The app:
  - a style rail with live thumbnails grouped by family;
  - undo and redo, wired to the browser's Back and Forward buttons, with a burst of typing counting as one step;
  - locks for style and palette;
  - Keep, which saves designs to a tray;
  - Copy link;
  - a primary Download PNG button, a 1×–4× size picker and size hints for Kindle, print and audiobook covers;
  - keyboard shortcuts for styles, palettes and undo;
  - a visible headline;
  - on phones, a preview pinned while you edit and a bottom action bar;
  - a cross-fade between covers.

### Changed

- Every style now uses one typography system. Titles grow with the space (short titles are set large), "The", "A" and "An" become a small line above the title, some styles stack words edge to edge, and author names are bigger and bolder.
- Styles follow the palette: Art Deco, Retro Sun, Constellation, Orbit and Noir have light variants, and Classic Paperback no longer turns every dark palette mustard.
- Reworked styles:
  - **Noir:** a lamp, a figure, and blind shadows over the title.
  - **Memphis:** dense, with the title on a colour block.
  - **Typewriter:** a manuscript title page.
  - **Pixel:** an 8-bit scene with pixel lettering and scanlines.
- Topographic and Flow Field set the title directly on the artwork; Big Letter uses two letters when the initial is narrow; Concentric chooses ring colours by contrast; Bauhaus gives up a row of shapes for long titles.
- Palette swatches are small covers showing the background, ink and accents.

### Fixed

- Title blocks always stay inside their space, including descenders, the lead line and the subtitle.
- Font names in SVG attributes are escaped, so custom fonts with quotes produce valid SVG.
- Typewriter keeps Arabic and Hebrew titles joined and in the right direction.
- Very long titles no longer slow layout (inputs are capped and wrapping stops early).
- The texture grain is visible on light and dark covers.
- The dev server never serves dotfiles, whatever the letter case, and browser tests use their own port.

## [1.1.0] - 2026-11-12

### Added

- TypeScript types for the library and the browser helpers, with style and palette id unions.
- `book-cover-generator/browser` export with `exports` conditions for types.
- The site moved to [covers.otsirh.dev](https://covers.otsirh.dev) on Cloudflare, with a strict Content Security Policy (including Trusted Types), security headers, a 404 page, a web app manifest, icons, a social preview image, `robots.txt`, `sitemap.xml` and `security.txt`.
- The site restores designs on back/forward and when the URL is edited.
- Browser tests in Chromium, Firefox, WebKit and mobile Chrome, covering exports, sharing, the keyboard shortcut and accessibility (axe, light and dark).
- Type checking, linting, formatting, coverage thresholds, package validation and CI on Linux, macOS and Windows.

### Changed

- **Breaking for edge cases:** `width` and `height` outside 50–10000, and aspect ratios beyond 1:3 or 3:1, now throw a `RangeError` instead of being clamped silently. Non-hex accent colours in a custom palette throw too.
- `StyleContext` has `S`, the short side in px.
- The gallery renders thumbnails only when they are on screen, in small chunks, so typing stays smooth.
- The page uses toggle buttons with `aria-pressed`, labelled groups, a skip link and descriptive preview alt text.
- Upper-casing is locale-independent, so covers look the same in every browser language.

### Fixed

- Invalid `width`/`height` throw a clear error instead of producing a broken SVG or hanging.
- Control characters and unpaired surrogates in titles no longer produce invalid SVG.
- Shared links with an empty seed keep "seed from title" instead of picking a random seed.
- Changing the style while typing no longer leaves the gallery showing the old title.
- Truncated titles never split an emoji or an accented letter.
- Custom palettes whose accent equals the ink no longer produce `fill="undefined"`.
- `fitText` requires `maxSize` and never renders text larger than it.
- Bauhaus: long author names no longer run under the accent square.
- Retro Sun: no empty strip when there is no author.
- Bookshelf: the leaning book rests on its neighbour instead of dipping below the shelf.
- Orbit: the number of orbits is uniformly distributed.
- Typewriter: combining accents and Indic scripts stay attached to their letters.
- Chinese, Japanese and Thai titles wrap between words (with Japanese line-break rules) instead of shrinking onto one line, and Node estimates their width correctly.
- Long words break between whole characters, so emoji sequences and accents are never split; initial letters use the whole first character (e.g. a flag).
- Typewriter spaces characters by their real width, so wide glyphs don't overlap.
- Text sizes follow the cover's short side, so wide covers keep all text on the canvas; Bauhaus' grid fits wide covers.
- Downloads are named after the format the browser actually produced (Safari can't encode WebP and returns PNG).
- The R shortcut works on every keyboard layout.
- `svgUtils.ridge` works for any number of segments; `radialGradient` no longer writes `fy="undefined"`.

### Security

- Fixed a DOM XSS in `examples/contact-sheet.html` (the `seeds` query parameter). The page was never part of the deployed site after 1.0.0.

## [1.0.0] - 2026-11-11

### Added

- First release: 27 styles, 20 palettes, seeded randomizer, text fitting, CLI and the web app with SVG, PNG and JPEG export.

[Unreleased]: https://github.com/otsirh/book-cover-generator/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/otsirh/book-cover-generator/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/otsirh/book-cover-generator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/otsirh/book-cover-generator/releases/tag/v1.0.0
