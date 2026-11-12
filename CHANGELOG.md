# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Artwork for a given seed may change in minor releases.

## [Unreleased]

### Fixed

- Accents on capitals (É Å Ž Й) and the marks of Devanagari, Bengali, Thai, Lao, Khmer, Myanmar and other scripts no longer run into the line above or off the top of the cover: text leaves room for them above its first line and between lines. Arabic and CJK get a little room too. Text without such marks is laid out exactly as before. Big Letter keeps an accented initial on the cover.
- Arabic and other scripts whose letters join are set without letter-spacing. Browsers don't letter-space them, so tracked Arabic titles used to overflow or come out too small.
- Spaced punctuation stays with its word when lines wrap, so French titles no longer leave a lone "»" or "?!" on a line. No-break spaces hold next to Chinese, Japanese, Thai and emoji too.
- A run of one-letter words ("A B C D…") wraps instead of shrinking to fit on one line.
- Small text on small covers can shrink below 6 px (to half its largest size), so titles on tiny covers are no longer cut with an ellipsis.
- `fitText` keeps shrinking text until it fits, however far `maxSize` is above `minSize`, instead of jumping to `minSize`.
- `fitStack` rejects an invalid `minSize`, as `fitText` does.
- In the app:
  - a change made before an Undo or Redo has landed now comes after it, instead of being replaced by it;
  - the variations keep their seeds when only spaces in the title or author change, and a variation always applies the seed its thumbnail shows;
  - on phones, the variations sit under the preview and the style family links no longer scroll their family under the pinned preview;
  - the selected palette swatch shows keyboard focus.

### Added

- In the app:
  - **your own colours**: a Custom swatch with five colour pickers (background, text, three accents), starting from the palette on the cover and showing the text contrast. Links hold them (`palette=custom-0b132b-f8f9fa-…`);
  - **any size**: a Custom format with width and height in pixels and common sizes to pick (Kindle, print trim sizes at 300 dpi, audiobook, a 4:5 social post). Its 1× export is the size asked for (`format=1600x2560` in links);
  - WebP downloads, **Copy image**, and **Share** where the browser can share files (phones, Safari);
  - PNG and JPEG downloads record 300 dpi, so print software opens them at their print size;
  - **Download all** saves the kept designs as PNGs in one ZIP file, instead of one download each;
  - kept designs are stored with the cover as it was drawn, so a later version can't change them (opening one says when this version draws it differently). The tray holds 100 designs instead of 24, and **Export** and **Import** move them between browsers as a file;
  - the app works offline once it has loaded (a service worker keeps its files);
  - **Store size** shrinks the preview to a store listing's size, to check the title still reads;
  - links name the version that made them (`v=1.4.0`), and opening one made with an earlier minor version says this one may draw it a little differently;
  - the size notes say KDP takes JPEG for eBook covers and ACX caps audiobook covers at 8 MB.
- `lang` option: the cover's language, set on the SVG so Chinese characters get that language's glyphs. Text with kana is marked Japanese and text with Hangul Korean unless you say otherwise; `createCover` reports it.
- `Cover.body`: the markup inside the outer `<svg>`, to nest covers in another SVG.
- The helpers the built-in styles use, for custom styles: `strongAccents`, `textColor`, `tintText`, `fitTitleWith`, `textPanel`, `TEXT_CONTRAST`, `baselineOf`, `textBottom`, `textGroupAttrs` and `markExtent`.
- Browser helpers: `rasterize` takes an exact `width` and `height` and a `dpi`; `downloadCover` resolves to the file name it saved; `copyImage`, `canCopyImage`, `setDpi`, `zipFiles` and `extensionOf`.
- `registerPalette` and `unregisterPalette`, so a palette can be used by id; `unregisterStyle`; `version`; and `sizeLimits` and `formats`, the sizes covers can have and the app's shapes.
- CLI: your own colours (`--bg`, `--ink`, `--accent`), `--format`, `--size`, `--lang`, `--json`, and `--count` to write many variations at once.
- `TextFit.above` and `TextFit.below` (room for accents and marks), `StackFit` line `above`, and `baselineOf(fit, y, i)` for styles that draw a fit's lines themselves.

### Changed

- `registerStyle` no longer replaces a built-in style unless you pass `{ replace: true }`, and refuses the id `'random'` and ids with spaces at either end (which could never be picked).
- The page's Content Security Policy allows one Trusted Types policy, `sw`, which only lets the page register its own service worker.

## [1.3.0] - 2026-11-12

Cover art and app improvements from a second design review.

### Added

- A strip of six other variations under the preview: one click picks one.
- Jump links to each style family in the style rail; style names under kept designs, and **Download all** to save every kept design as a PNG.
- `pickStyle(options)`; `fitText`'s `hyphenate` option; `TitleBlock.smallest`.

### Changed

- Long single words are hyphenated across two lines instead of shrinking to a hairline, and a word that has to break gets a hyphen at a syllable-like point (Big Type no longer prints "INTERNATION / ALIZATION").
- Short one-word titles ("Dune") grow to fill their space; a style gives up art for a longer title only when that sets the title clearly larger, so Bauhaus keeps its shapes.
- Leading articles in French, Spanish, Italian and German are recognised, and only leads of three letters or more get their own small line (no more lone "A"); in any language, one- and two-letter words join the next word in stacks, and a one-letter word (и, a, y) never ends a line.
- Thriller on light palettes is a field of one accent with ink shadows, not grey fog; Low Poly's scrim and text come from the palette; Landscape's ranges ramp through one hue; Typewriter makes a carbon copy on dark palettes and drops "by" before names in other scripts; Engraved sets a larger title in ink; Blocks colours 30–45% of its art and sets the title at one size; Pixel keeps stars and scanlines out of its lettering.
- Big Letter takes the initial of the main word ("The Lighthouse Keeper" gets an L), fits a pair of letters whole, crops on one side at most and keeps ideographs clear of the rule.
- Noir and Blueprint lay wide covers out side by side; Sunburst's sun stays clear of its banner on square covers.
- Author names in scripts without capitals are set larger and untracked; wrapped tracked-caps names get more leading.
- Font stacks include close matches on Windows, Android and Linux.
- On desktop, Randomize sits under the text fields, the palette swatches take four rows, the preview stays in view while the controls scroll, and the toast shows at the top, clear of the export buttons.

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
- Long titles are never cut off in any common shape: Retro Sun shrinks its sun, Blocks grows its text cell and Noir lowers its lamp when the title needs room (`TextFit` and `TitleBlock` report `truncated`).
- Paper Cut leaves room for the title on square and wide covers; Pixel reserves space for the subtitle; Noir's author line no longer meets the lamp.
- Undo and Back restore the subtitle and texture; history survives a reload; redo never navigates away from the app; holding an arrow key no longer floods the browser history.
- Redo can't reach another site after coming back with Back; keyboard shortcuts follow the printed key (QWERTZ, AZERTY, Dvorak) with a positional fallback for non-Latin layouts; a hand-edited URL is rewritten to hold the whole design.
- Paper Cut measures its holes so the title never sits on them; Blueprint keeps its dimension callout above the title block; Silhouette's moon rises below the title.
- Text measurement falls back to a DOM canvas when `OffscreenCanvas` has no 2D context, and measures each string once per font (widths scale with size).
- The CLI accepts `--subtitle` and `--texture`.
- Undo after typing keeps every keystroke, a click during typing becomes its own step, clicking the current choice adds no step, and history writes never break the page when the browser rate-limits them.
- A partial share link (say, only a title) opens the same cover every time instead of filling in a random sample author.
- Every style escapes font names in attributes; long inputs are cut between whole characters; letter-spacing is measured per visible character; text fitting honours even tiny height budgets and validates `minSize`.
- `rasterize` reads SVG sizes with units or from the `viewBox`; the export toast reports the size actually exported; removing a kept design removes that exact design.
- Measurements are cached for every backend (custom measurer, canvas and the Node estimate); `setTextMeasurer` is called once per string and font at 100 px.
- Bookshelf keeps its leaning book on tall covers; Blueprint's hatching fills the whole section ring.
- ™, © and ‼ stay with the word before them (only emoji-style symbols break like CJK and measure 1em wide); inputs are capped between whole characters however many combining marks each has.
- `fitText` takes a `descent` option that counts the descenders in `maxHeight`, so title blocks fit in one pass; letter-spaced widths reuse their character count.
- The app saves a typing burst's last keystrokes before the browser's own Back (Alt+←, ⌘[, mouse buttons) and when the page is hidden; a fragment that isn't a design (say `#usage`) leaves the design alone; arrow keys scroll a focused code sample instead of changing the style; kept-design thumbnails are drawn once each, a few per frame.
- The link-preview image and icons can be shown by other sites (`Cross-Origin-Resource-Policy: cross-origin`).
- A title is never crushed below its minimum or set smaller than its subtitle: the title block folds the lead line in, then drops the subtitle, before shrinking the title that far.
- A long word shrinks the text a little (to 60% of `minSize`) instead of breaking mid-word, so Big Type sets "Cartographer" whole.
- Big Letter's initial and Classic's emblem skip opening quotes, brackets and other punctuation; Typewriter types the word count it measured.
- The app's Undo and Redo pass over entries that show the same design; the Variation field follows Back and buttons even while focused; the phone's PNG button shows its own busy state; shared-link fields are clipped to the inputs' maxlength between whole characters; download names are cut between whole characters and never end in a hyphen.
- No-break spaces (U+00A0, U+2007, U+202F, U+FEFF) are kept and never become line breaks; the CLI rejects extra arguments (an unquoted title) instead of dropping them; Big Letter pairs a narrow initial only with a letter of the same word.
- Stacked titles leave room for descenders in Cyrillic, Greek, accented Latin (ç ą ạ) and uncased scripts, and never go below fitText's 6 px floor; ASCII `. , ! ? : ; …` never start a line after CJK, Thai or emoji; a font name the canvas can't parse is retried quoted, then estimated, instead of measured with the previous font; the CLI reports a bad `--width`/`--height` as typed.
- Text keeps 3:1 contrast or more where it could fall low: Aurora fades colour fields that would sit too close to the ink, Classic's emblem initial falls back to the ink, Big Type's coloured lines, and Low Poly's shade is fully in behind its white rule and title on every shape.
- Typewriter types letter by letter only in scripts whose letters stand alone, so Devanagari, Tamil, Kannada, Myanmar and others keep their conjuncts; a title gets back the room its lead line doesn't need; `registerStyle` keeps class instances (their methods and `this`) and fills in missing details without changing the caller's object; the CLI exits quietly when piped into a reader that stops early (`| head`).
- The app's single-key shortcuts can be turned off (WCAG 2.1.4), and the choice is remembered; the PNG icons are drawn from `icon.svg`.
- `registerStyle` calls a style's `render` on the style itself, so class styles with private fields work; `fitText`, `fitStack` and `titleBlock` reject a missing `maxWidth` (and `titleBlock` a missing `maxHeight`) instead of drawing NaN; generic families such as `ui-monospace` stay unquoted when font names are quoted for the canvas; `copyText` falls back to the copy command when the async clipboard refuses.
- When no layout fits (a very long single word), the title block still never sets the title smaller than its subtitle or lead; widths are cached per font with the font string built once per spec; downloads stay available for 40 s (for browsers that confirm first); export canvases are freed right away; the copy fallback gives focus back.
- `pickStyle(options)` names the style `createCover` would use (resolving `'random'` from the seed) without drawing the cover.
- Text that takes an accent colour keeps 3:1 contrast everywhere, through shared `textColor` and `tintText` helpers: Engraved, Noir's author, Orbit's and Constellation's tinted authors, and Art Deco's gold title; Engraved's title fits the region it is centred in; `TitleBlock.smallest` gives a stack's smallest line, which layout choices now judge stacks by.
- `setTextMeasurer` rejects a non-function and reports a measurer that returns something other than a width, instead of letting NaN reach the cover; Topographic draws its contours faster (same output).
- The app: Undo and Redo are recognised by where they land, not by timing; the toolbar's Back onto an entry whose history write was refused finds its place; presses queued for a dropped step never undo the toolbar's Back; a history write the browser ignores silently is retried; download names keep й, ё and Greek accents.
- The app: Undo onto an entry whose history write was refused shows that entry's design; a step the browser ignored no longer steers a later navigation; entries reached again with Forward are reachable with Redo; a long typing session slows its history writes to stay inside Safari's limit; presses queued during a step survive landing on such an entry.
- The app: loading the same URL again (Enter in the address bar) adds no Undo step, so Undo can't step off the app; a refused history write is never retried onto a later entry; shortcuts by key position apply only to non-Latin letters (not à, ı or dead keys); section links move keyboard focus to their section; a whole link with an unknown value opens in an open tab as it would in a new one; line breaks in a link become spaces; download names keep Japanese voicing marks and Indic vowel signs.
- The app: typing in another field starts a new Undo step; removing a kept design keeps keyboard focus in the tray; a link from before 1.2.0 pasted into an open tab opens that design; an unknown `texture=` value is ignored; a style or palette change that repeats the live region's text is still announced.
- The app: links and the URL always name every key (an empty subtitle, texture off), so a link pasted into an open tab opens exactly that design; a history write the browser refuses is retried, so the entry keeps its place in Undo; Undo, Redo and the download buttons keep keyboard focus while they are unavailable or busy.
- The app: a hand-edited URL keeps the subtitle and texture like every other field; a typing burst's history entry is updated while typing (at most every 300 ms), so the toolbar's Back loses at most the last moment; a history write the browser silently ignores is no longer counted as an Undo step.
- The app: a quick double-click on Undo steps twice and never leaves the app; Undo and Back no longer scroll the page; a section link opened in a new tab scrolls to its section; shortcuts work while the texture switch has focus; Cmd/Ctrl-clicking a section link opens a new tab; Copy link always copies the design on screen; kept designs saved by another version keep their look; the style rail renders a few tiles ahead of its scroll position.

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

[Unreleased]: https://github.com/otsirh/book-cover-generator/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/otsirh/book-cover-generator/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/otsirh/book-cover-generator/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/otsirh/book-cover-generator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/otsirh/book-cover-generator/releases/tag/v1.0.0
