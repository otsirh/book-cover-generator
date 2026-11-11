# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Artwork for a given seed may change in minor releases.

## [Unreleased]

## [1.1.0] - 2026-11-12

### Added

- TypeScript types for the library and the browser helpers, with style and palette id unions.
- `book-cover-generator/browser` export with `exports` conditions for types.
- The site moved to [covers.otsirh.dev](https://covers.otsirh.dev) on Cloudflare, with a strict Content Security Policy (including Trusted Types), security headers, a 404 page, a web app manifest, icons, a social preview image, `robots.txt`, `sitemap.xml` and `security.txt`.
- The site restores designs on back/forward and when the URL is edited.
- Browser tests in Chromium, Firefox, WebKit and mobile Chrome, covering exports, sharing, the keyboard shortcut and accessibility (axe, light and dark).
- Type checking, linting, formatting, coverage thresholds, package validation and CI on Linux, macOS and Windows.

### Changed

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

### Security

- Fixed a DOM XSS in `examples/contact-sheet.html` (the `seeds` query parameter). The page was never part of the deployed site after 1.0.0.

## [1.0.0] - 2026-11-11

### Added

- First release: 27 styles, 20 palettes, seeded randomizer, text fitting, CLI and the web app with SVG, PNG and JPEG export.

[Unreleased]: https://github.com/otsirh/book-cover-generator/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/otsirh/book-cover-generator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/otsirh/book-cover-generator/releases/tag/v1.0.0
