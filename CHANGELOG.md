# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Artwork for a given seed may change in minor releases.

## [Unreleased]

### Added

- **The HTTP API describes itself**: `/api/cover.json` says what a query draws (the style, palette, colours, seed, size and pins it came to, its link with every choice written out, and its SVG, PNG, edit and share URLs), `/api/catalog.json` lists every style, palette, genre, font, format and mockup, and `/api/openapi.json` describes the API as OpenAPI 3.1.
- **The MCP server shows what it drew**: the hosted server (`/mcp`) answers `create_cover` and `create_mockup` with the picture (a PNG up to 480 px wide), so the assistant can see the cover and your client can show it; every server adds a link to the PNG (`pngUrl`).
- **All of KDP's paperback trims**: `trimSizes` (and the app's print panel) has the sixteen, from 5 × 8 to 8.5 × 11 with 5.06 × 7.81, 6.69 × 9.61, 7.44 × 9.69, 7.5 × 9.25, 8 × 10, 8.25 × 6, 8.25 × 8.25, 8.5 × 8.5 and A4 (8.27 × 11.69); `createPrintCover` holds the largest to the fewer pages KDP prints at them (8.5 × 11 at most 590 on white paper), and says when a paper isn't offered at a size.
- **An about page** (`/about/`, "Using your covers" in the footer): you may use the covers you make for anything, books you sell included, with no credit needed; what stays private; which fonts covers use and why a cover looks different elsewhere; and how to upload ebook and paperback covers to Amazon KDP.
- **One file for `<book-cover>`**: `https://covers.otsirh.dev/element.js` is the element and the library as one minified module (48 KB compressed), for pages that would rather load one file than the two dozen of `/src/element.js`.
- **The MCP registry**: the server is listed in the official MCP registry as `io.github.otsirh/book-cover-generator` (npm and the hosted `/mcp`), published by each release.
- **A design's language in its link** (`lang=tr`): the app, the HTTP API, kept designs and the gallery draw it with that language's capitals and letterforms, and the MCP tools take `lang` too. The app names it under the title ("Set as Turkish text, from the link"), with a way to clear it.
- `download=1` on any image of the HTTP API answers it as a file named after the title (`download=my-cover` names it, `my-cover.png` too; `download=0`, or empty, doesn't).
- **Keep is a star on the preview**: it shows whether the design on show is kept, keeps it (or press K), and pressed again removes it. Removing a kept design, here or in the tray, offers Undo.
- Undo and Redo with Ctrl or Cmd+Z too (Shift for Redo, or Ctrl+Y), outside text fields, and with single-key shortcuts off. On a phone, Undo and Keep are in the bar along the bottom, and the previous and next style beside the pinned preview.

### Fixed

- Link previews of a design show its picture on X and other sites whose crawlers honour `robots.txt`, which kept them from the image.
- A PNG cover that fits is drawn at its size, to the pixel (600 × 1000 came as 597 × 995), and a PNG mockup shows the cover as sharp as it's shown (a story's cover was drawn smaller and enlarged).
- The HTTP API answers a HEAD from the cache, as its GET, and a parameter it doesn't read (`&utm_source=…`) no longer draws a cover again.
- `parseBookList` reads only its own column names: a `constructor` or `__proto__` column is ignored like any other unknown one.
- `create_mockup`'s image link holds its line as the mockup draws it (at most 80 characters).
- The HTTP API takes one to three accents for your own colours, as a link's palette holds (four or more gave links that drew nothing), and the links `/api/cover.json` and the MCP server write keep the language a query gave (`lang=tr`), so they draw the same capitals.
- On an iPhone or iPad, a size of your own too large for the device's canvas even at 1× exports as large as the device can draw, rather than failing; exports and mockups (a Kindle-size cover's flat or 3D book) count their sides as the canvas rounds them, so none lands a few pixels over the device's limit.
- A design's link from Copy link opens in its shape at once (an eBook or square no longer starts as a paperback), and leaves out pins its style doesn't have, which cost it its link preview.
- `wrapText` no longer repeats a line when a long word's last letter is wider than the line by itself; in a very narrow box, `fitText` never adds a hyphen past the edge, never makes a line of a lone space, and shortens to an ellipsis that fits.
- A PNG too large for the scale asked suggests a scale it then takes; a mockup's PNG refusal points at `mockup.svg`, which draws the mockup; the MCP server's links pin only what the cover took (a style the seed picked that lacks a pin draws its own); a design's link preview has one address whatever tracking the link carried.
- A design's link preview page names itself as its canonical address (without the version, so one address release after release); `preview=0`, or empty, is off, as the API's other switches are; a PNG drawn smaller to fit is as large as its pixels allow (774 × 774, not 771 × 771); `createMockup` says to pass a cover of anything that isn't a whole one; a custom palette's `dark` must be true or false (`'false'` made it dark); the back cover's text budget counts an emoji as one character, as it clips them; `setTextMeasurer` returns the measurer it replaces, and the Worker's PNG layout puts yours back; the style rail draws other styles without your style's pins, as picking one draws it, and a pin redraws only your style's tile; `svgUtils.shadowFilter` takes a `margin` for its region.
- The MCP server names a mockup as the library read its kind (`Ereader` is "an ereader mockup"); a mockup's background of spaces is none; the print panel offers each of your own colours once.
- The dev server never serves a hidden file (`.git`, `node_modules`), however the URL spells its path.
- A PNG resvg stops on no longer stops the site's other PNGs: the Worker starts a new resvg for the next one (its own copy of resvg's glue, `worker/resvg-glue.js`, made by `scripts/vendor-resvg.js`).
- A link preview's picture is the site's own image whenever the design's can't be drawn (the crawler asked too much, or resvg failed), never an error.
- A design's link preview shows the design the app opens from it (an old link's pin its style no longer takes, a style it doesn't know, or pins with no style, which the seed's style takes), and the card's picture is drawn from the design alone, not the page's other parameters.
- The gallery shows your design in its own shape (a square or an eBook), as each cover opens it, and your pins on the style the app opens it in (the seed's, when the link names none).
- Many covers previews every book of a list, one whose size can't be made among them (left empty, and said on download).
- A mockup's `kind` is read in any case, by `createMockup` (which says the kind it made, `kind`), the HTTP API and the MCP server; a PNG of text in a script its fonts lack is a `422` kept at the edge, so asking again costs nothing; `createMockup` says how large it shows the cover (`coverScale`).
- The gallery reads the design you bring as the app does, with the app's own reader (the last of a repeated value; `texture=false` is off; only pins the style takes; a name like `valueOf` in the link no longer stops it).
- A list of books may quote a field after the space typed after a comma (`Night, "A Tale, Retold"`).
- A PNG of text with a character that draws nothing (an Arabic letter mark, a Mongolian vowel separator) is no longer refused for want of a font; `createMockup`'s `text: null` is no line, not the word "null".
- Many covers draws each book with its own text: the design on show lends its look, but no longer its subtitle, series, credit, badge or language, to books that don't have their own.
- A link opened in the tab to a design it showed before opens that design (as a new step), even one met a moment ago: the app resumes its steps only when the page is reloaded or come back to.
- A `height` alone gives the paperback's shape, as a `width` alone always has, in `createCover`, the CLI and the HTTP API (`height=1500` is 1000 × 1500, not 600 × 1500; a height too short for a paperback says so); a book in a list that gives only a width or a height takes the shared shape (an eBook's under an eBook's size), an empty size cell is no size, and a size that can't be made is said of the column given; the same design asked for in another order is one cache entry; and the CLI writes your own colours as the API does (`--bg abc` as `#aabbcc`).
- Text with characters that draw nothing (soft hyphens, zero-width spaces, word joiners) is measured as it's drawn, without room for them, in Node, the CLI and the HTTP API, SVG and PNG.
- Your own colours in the HTTP API's query are read as a link writes them (`bg=000` as `#000000`), so `/api/cover.json`'s link draws the very bytes the query does; a registered style's pin named in capitals stays in the links the MCP server and `cover.json` write.
- A link's `format` is read in any case, as its other values are (`format=Ebook`, `1600X2560`, `1600 × 2560`), by the app, `<book-cover>`, the HTTP API and the CLI alike; `--size` reads a size as `--format` does.
- A PNG mockup at a scale that would draw its cover as nothing is refused with a `400`, as a cover is, not a `500`; and a PNG that can't be drawn at the scale asked for (too large, or nothing) is refused before it counts against the PNG limit.
- Typewriter fits a long series line as it types it (untracked), so it is no smaller than it needs to be; `createMockup`'s `background` may have spaces around it, as colours elsewhere may.
- A kept design's snapshot that isn't of the design's size (from a file made elsewhere) is drawn again from the design, so its thumbnail and Download all show the design.
- Aurora's title and author keep 3:1 against what is drawn behind them: each colour field kept it alone, but blurred fields add up where they overlap (two covers in five had a fifth of a line's outline under 3:1, down to 1.7:1). Where they would, a soft field of the background goes under that text, only as strong as it needs.
- Blueprint no longer shrinks its title to make room for a subtitle (from 54 to 29 px on a 600 × 900 cover): on tall and square covers the title block grows into the drawing's room instead, and for a long title too.
- Aurora, Thriller and Ribbon blur only the cover and the blur's reach around it, so their PNGs take a third of the memory they did (Aurora's up to 32 MiB of resvg's, from 98) and draw faster. `svgUtils.blurFilter(id, std, { width, height })` gives a filter that region. With it, the PNGs draw opacity as the SVG does: the rewrite that kept resvg from stopping on Aurora's glows (and could make a shape that takes its stroke from its group opaque) is gone.
- The 3D book mockup's floor shadow is soft, as meant: it was a hard grey ellipse in a band of clipped haze (a drop shadow drew the ellipse back over its own blur). `svgUtils.blurFilter`'s region may start at an `x` and `y`.
- Sizes and scales are read in decimal, as written (`width=0x258` is an error, not 600); the CLI takes one to three accents, as links and the API do; `<book-cover>` with a `lang` that isn't a tag (`en_US`) draws without one, as a browser takes it, rather than not at all; the MCP server reads pins and your own colours as given, so a pin it doesn't know is named as the style's, not as link syntax.
- The HTTP API and the MCP server refuse a palette and your own colours together, as the CLI does (the colours quietly won); `--batch --json` says each cover's language and pins, as a single cover's does; a page count the print cover can't take isn't kept for your next visit.
- A paperback's spine gives its title all the room the author leaves (it kept a third for the author, even one left off for a thin spine, and cut a long title short); `createMockup` checks a cover's colours are hex colours.
- A back or spine colour chosen as an accent stays chosen when you try a palette without that accent (it was replaced for good); a plain list whose first book has a comma and the word Title is read as a list, not a CSV header; a mockup's `background` is read as your own colours are (`11223344` drops its alpha); the local MCP server may write over an empty `.svg` file.
- The CLI refuses `--out-dir` without `--batch` (it was ignored, and the cover went to the terminal).
- Many covers' previews were drawn at full size, wider than the panel: the page grew sideways (892 px wide on a 390 px phone). They are thumbnails now.
- Store size keeps the preview's frame, so the buttons under it no longer jump.
- Dark covers, swatches and thumbnails keep an edge on the dark page, and white ones on white: a hairline goes round every cover.
- The title font menu shows its names whole (the field is now "Title font and case").
- Fields show the 2px focus ring everything else has. Fields, chips, the switches and the texture switch's track have edges of 3:1; placeholders and the Auto swatch's name are readable (4.5:1). The page heading is in the main landmark. Without JavaScript, a note at the top takes the place of controls that can't work.
- The Variation dice is as wide as its neighbours; the format and size switches, the tray's buttons, Store size and the style's name react to the pointer; the Custom swatch says "Custom".

### Security

- The MCP server run locally (`book-cover --mcp`) saves a cover (`output`) only as an `.svg` file, never over a file that isn't an SVG and never through a link, so an assistant talked into a path can't replace or make other files.
- Releases: the job that publishes to npm runs none of the repository's code; it publishes the package the checks passed, which is the one the GitHub release signs. JSR is checked and published with a pinned Deno instead of a package fetched at run time.

### Changed

- The site's PNGs not yet cached are limited to 240 a minute for each client, and MCP requests to 600 (`429` with `Retry-After`); SVGs aren't limited. The README says how to run your own copy. The site's Worker keeps its errors in Workers Logs, without query strings, and a daily check of the live site (pages, API, MCP, link previews and the version) runs in CI and after every deploy.
- **Back leaves the site**: changes no longer add browser history entries (nine changes took ten Back presses to leave). Undo and Redo keep their steps in the page, and through a reload, even one right after typing; the URL still holds the design, and links work as before.
- **Laptops**: from 1280 px the downloads are a column beside the cover, so every export is in view with it, and the whole preview stays in view as the controls scroll. From 1024 px the styles are beside the preview (they were 800 px below it), and Browse scrolls the styles, not the page.
- The exports are in groups, "Also as" and "Copy"; Copy image link is Copy embed link. For an eBook the main download is a JPEG, the file KDP takes.
- Format comes right after the text, with a link to the paperback's back and spine. Many covers and Paperback for print open from cards that say what they make, with full-size buttons; the print panel's Back colour and Spine colour are swatches; and a book Many covers can't make is listed in the panel, with why.
- On phones the title field is on the first screen: the form comes right under the pinned preview, and the line under the heading is gone. Fields have 16px text, so iOS doesn't zoom in, and on touch screens buttons, chips and swatches are 40px.
- A first visit opens a sample book in a style and palette that suit it, as on the README's sheet, and its title is selected, so typing replaces it.
- Messages stay four seconds or more (longer ones longer) and while the pointer is on them. Errors look different, are read out at once and stay until dismissed.
- The mockup preview is as wide as its panel, so a link card's line can be read.
- Gallery: each style shows a book of its own, and coming from the app every cover shows yours, as the click opens it. Links to each family and a Make a cover button are at the top; a laptop shows five covers to a row; the header marks the page you're on. The styles' Genre family is called Themed here and in the app, apart from the Genre menu.

## [1.12.0] - 2026-11-13

PNG covers from the site, and link previews of a design. Covers are drawn as in 1.11.0.

### Added

- **PNG from the HTTP API**: `/api/cover.png` and `/api/mockup.png` draw what the `.svg` endpoints do as PNG, for email, chat and social posts: a cover up to 600,000 pixels (600 × 900), a mockup up to 2.1 million (a 1080 × 1920 story; a flat or e-reader shot 1.3 million), larger ones drawn smaller to fit (`scale` to choose). The site's Worker draws them with resvg and open fonts (Noto, Liberation, EB Garamond, Roboto Condensed, Anton, TeX Gyre Adventor), laying the text out in their own widths; text in a script they lack gets a `422` (the SVG draws it).
- **Link previews of a design**: Copy link gives a link that holds the design in its query, `https://covers.otsirh.dev/?title=…`, and a link preview of it (on X, Facebook, Slack, Discord, iMessage…) shows that design, as a social card. The app opens it as before.

### Fixed

- `createPrintCover`'s trim no longer makes a slow pattern of a long run of spaces (a CodeQL finding): the text is trimmed and capped first.

## [1.11.0] - 2026-11-13

Capitals in the cover's language. Covers without a language are drawn as in 1.10.0; Turkish and Azeri covers, and Big Letter for an initial with an accent on its I, change.

### Changed

- Capitals follow the cover's language (`lang`): a Turkish or Azeri title's i is İ in every style that sets capitals, on its badge and its mockups, as on the print cover's spine. `fitText` and `fitStack` take a `lang` for their `upper`.
- Big Letter sets two letters for an initial İ, Í, Ì, Î or Ï, as it does for I: one alone reads as a slab.
- A cover's SVG ids include its language, so two covers that differ only in it can share a page (Japanese and Korean covers, whose language is inferred, get new ids).

## [1.10.0] - 2026-11-13

A paperback for print: the back, the spine and the front as the PDF Amazon KDP takes. Covers are drawn as in 1.9.2, but for Typewriter's square covers with a series.

### Added

- **A paperback for print**: the whole cover of a printed book, the back, the spine and the front, as the PDF Amazon KDP takes. In the app, **Paperback for print** sizes it from the trim, the page count and the paper (an eighth of an inch of bleed, a spine as wide as the pages are thick, blank under 80 pages as KDP requires), sets your headline, back cover text and imprint on the back with the barcode's box left clear, carries the front's art into the bleed, and downloads a PDF at 300 dpi with its trim marked. In the library, `createPrintCover(cover, print)` makes it as SVG and `svgToPdf` (in `./browser`) the PDF; `spineWidth`, `trimSizes`, `paperTypes` and `printLimits` give the numbers. On the command line, `--print 6x9 --pages 320`.

### Fixed

- On phones, **Many covers** sat above the preview at the top of the page; it now follows the export buttons, with Kept designs and the print panel. On wider screens, the preview stays in view beside the controls however many designs are kept, and never covers what's under it.
- On tablets, the controls (kept in view as the page scrolls) no longer lie over the styles below them.
- On phones, a field reached with the keyboard is scrolled clear of the pinned preview, in Safari too (it stayed under it). Focus on a variation chip stays on one when the style changes, rather than falling back to the page.
- Typewriter keeps a tall title block below its typed header on square covers (a series line could overprint it).
- Kept designs: one kept again with a new drawing shows the new one in the tray; importing a file with no designs in it says so (not "kept already").
- The Title field is named by its label alone (its hint describes it, and was read twice); disabled export sizes look disabled.
- CLI: `--height` alone keeps the paperback shape, as `--width` alone does.

## [1.9.2] - 2026-11-13

The whole API documented, on JSR and in your editor. Covers are drawn as in 1.9.1.

### Changed

- The whole API is documented: every function, type and option, with module docs and examples for each entry point (shown on JSR and in your editor). CI keeps it so (`deno doc --lint`).

### Fixed

- Docs: `seed` defaults to the title and author (as `Cover.seed` shows), not a hash of them; `texture` is on for any truthy value; `TitleBlockOptions.maxSize` may be exceeded by a short one-word title; `FitOptions.maxHeight` counts accents above the first line; `textGroupAttrs` takes px and writes `attrs` as given; `svgToBlob`'s type names its charset.

## [1.9.1] - 2026-11-12

The library on JSR, as 1.9.0 meant it to be. Covers are drawn as in 1.9.0.

### Fixed

- **JSR**: the package publishes there (1.9.0 didn't reach it: its `<book-cover>` types declared the tag globally, which JSR doesn't allow). From JSR, `BookCover` is typed as a class; from npm, `document.createElement('book-cover')` is still typed as one too. CI now checks the package as JSR's server does.

## [1.9.0] - 2026-11-12

A gallery of every style, the library on JSR, `<book-cover loading="lazy">`, and a sturdier MCP server. Covers are drawn as in 1.8.0 (some of their SVG ids are named differently).

### Added

- **A gallery** of every style at [covers.otsirh.dev/gallery/](https://covers.otsirh.dev/gallery/), each drawn for a book of the genre it suits (by `<book-cover>`, in your browser) and opening the generator in it. It works offline, as the app does, even when it is the first page you open.
- **JSR**: `import { createCover } from 'jsr:@otsirh/book-cover-generator'` in Deno. Every module names its types for Deno.
- `<book-cover loading="lazy">` draws once it comes near the viewport, as an image does (the gallery's covers do). Until then it holds the cover's shape and is named for screen readers, both following its attributes.
- Going to the gallery from the app keeps your design, whichever link takes you there (or opens it in a new tab): a cover there opens your book in its style, with your pins if it is your own style, and the header's links take you back to your design.
- The app's developer section shows every way to use the covers: an image link, `<book-cover>`, an AI assistant (MCP) and the library.

### Fixed

- On the narrowest phones (320 px), the app no longer scrolls sideways: the variation thumbnails shrink a little to fit.
- MCP: a request whose id JSON-RPC doesn't allow (an object, an array, however deeply nested) is answered as an invalid request instead of stopping `book-cover --mcp` or failing at `/mcp`; a message that isn't a request is answered with an error even without an id, and a response sent to the server needs no answer. A cover's links no longer carry a pin named `constructor`.
- Two covers that differ only in their font and their series (say, a series named "serif") no longer share ids, and a mockup's ids are its own, so a cover and its mockups can share a page.
- Opening the app at a place on the page (`#usage`, or from the gallery) moves keyboard focus there too.
- Docs: `<book-cover loading="lazy">` in the README and types; a leading "A" or "An" stays with the title (only longer articles get a line of their own); a custom palette's `palette` is its own `id`; a style's `subtitle` holds the credit when there is no subtitle. `isHex` is no longer typed as a type guard.

## [1.8.0] - 2026-11-12

Covers wherever you work: an MCP server for AI assistants, a `<book-cover>` element for any page, Deno and Bun, and signed releases. Covers are drawn as in 1.7.0.

### Added

- **`<book-cover>`**, a custom element for any page: one script (`https://covers.otsirh.dev/src/element.js`, or `import 'book-cover-generator/element'`), then `<book-cover cover-title="Dune" author="Frank Herbert" cover-style="retro">`. Its attributes are the app's link parameters; it draws again when one changes.
- **MCP server**, so AI assistants can make covers: `book-cover --mcp` speaks the Model Context Protocol over stdio (`claude mcp add book-covers -- npx -y book-cover-generator --mcp`), and the site at `https://covers.otsirh.dev/mcp` over HTTP. Its tools draw a cover or a mockup and answer with links to the image and to the app, and list the styles and palettes.
- Deno and Bun: the library runs in both, and CI checks that Node, Deno and Bun draw the same covers byte for byte.
- Each GitHub release carries the npm package and its build provenance, signed with Sigstore: check a download with `gh attestation verify book-cover-generator-X.Y.Z.tgz --repo otsirh/book-cover-generator`. (The package on npm has had provenance since 1.7.0.)

### Changed

- The CLI's `--format` takes a shape too (`--format 10x16 --width 1600`), and `--height` with a format, as the HTTP API reads them: the shape at that width or height.

### Fixed

- In Many covers, a book whose list gives it a larger size no longer fails to export on an iPhone or iPad: its scale keeps within the device's canvas, as the export's does.

## [1.7.0] - 2026-11-12

Genres and five styles made for them, an HTTP API that draws covers from a URL, and text that fits in Node as it does in the browser. Covers made without a style may come out in a new one, and text made in Node may be set a little differently (see Changed); covers drawn in the browser with a style are as in 1.6.0.

### Added

- **Five genre styles**: Hollow (horror: a dead tree across a full or blood moon, fog, and worn lettering), Ribbon (romance: ribbons turning over under an italic title, and falling petals; dark palettes make it a dark romance), Crest (fantasy: a heraldic shield before laurels, swords or rays, framed in gold, with its field, emblem and what's behind it to pin), Storybook (children's: hills with trees and a house, a sun or a rainbow, clouds, and a bold outlined title) and Big Idea (non-fiction: a big plain title, a prominent subtitle, and bars, a trend line or a pie). There are 39 styles now.
- **Genres.** Every style says which genres it suits (`genres` in `listStyles()`, and the `genres` list), and `createCover({ genre })` picks a random style that suits one. In the app, the style rail's Genre menu shows only those styles (and is remembered), and Randomize, the dice and the arrow keys stay in it. In the CLI, `--genre`, and `--list` shows each style's genres. A book list can give each book its genre, in a `genre` column: a book whose genre the chosen style doesn't suit gets a style that does.
- **HTTP API.** `https://covers.otsirh.dev/api/cover.svg?title=…&author=…` draws a cover, and `/api/mockup.svg` a mockup, for an `<img>` on any page. The query takes the library's option names and the app's link parameters, so an app link's query draws the same design. In the app, **Copy image link** copies that URL for the design on screen.
- `optionsForBook(book, defaults)`: a listed book's cover options over the options every book shares, as the app's Many covers and the CLI's `--batch` make them.
- **Names in any case.** Styles, palettes, genres and fonts may be given by id or by name, in any case (`'Art Deco'`, `'MINT'`, `'Non-fiction'`), in the library, the CLI, the HTTP API, the app's links and book lists, and fonts by the names the app's menu gives them ("Old style", "Heavy", "Typewriter"); pinned variants too. `FONTS` entries have a `name`, and `styleIdFor(name)` says which style a name means.

### Changed

- **Text fits in Node as it does in the browser.** Where there is no canvas (Node, the CLI, the HTTP API), the built-in fonts are now measured from their characters' widths as macOS draws them, not estimated: text was up to 15% too wide or too narrow, and a title made in Node could run past its box in a browser. Each weight and its italic are measured on their own, as Chrome picks a different face for 600 or 800. Covers made in Node may set their text at a slightly different size than before.
- With `style: 'random'` (the default), a seed can now pick one of the new styles, so covers made without a style may come out in a different one. Covers with a style keep it.

### Fixed

- A plain book list line ("Title | Author") is split at the first kind of separator it uses, so a dash in a title stays in it ("Harry Potter – The Philosopher’s Stone | J. K. Rowling"). A size in a list that isn't a number is reported as written.
- The CLI's `-o` makes the folder it writes into (as `--out-dir` does).
- On an iPhone or iPad, the export sizes the device can't draw (over its canvas's 16.7 megapixels) are unavailable, instead of failing.
- With a random style, a pinned variant that another style names alike (Aurora's and Stripes' `layout`) no longer throws when the seed picks the other one: a style picked at random takes only the pins it can. A value no style offers throws whichever style the seed picks, and a style you name still says when it lacks a value.

## [1.6.0] - 2026-11-12

Badges, mockups and many covers at once. Covers that use none of these are drawn exactly as in 1.5.0.

### Added

- **Many covers at once.** `parseBookList(text)` reads a list of books (CSV with commas, semicolons or tabs and a header row naming a `title` column, JSON lines, or "Title | Author | Subtitle" lines) into cover options. In the app, "Many covers" previews the list in the current design and downloads them all as PNG or SVG in one ZIP, with "A different palette for each" for a set in several colours. In the CLI, `--batch <file|->` writes a cover per book into `--out-dir`, with the other options for every book the list doesn't set (a book that can't be made is reported and the rest are written).
- **Mockups.** `createMockup(cover, { kind, background, text })` shows a cover as a product shot (`flat`, `book` turned with its spine showing, `ereader`) or on a social card (`card` 1200 × 630, `square` 1080 × 1080, `story` 1080 × 1920) with its title, author and a line such as "Out now". In the app, the Mockup row under the export buttons previews and downloads them as PNG. `createCover` also returns the cover's `colors`, `title` and `author`.
- **Badges.** `badge` ("Winner of the Hugo Award", "10th Anniversary Edition") is set as a star-edged seal in the first corner (then side) of the cover clear of its text, smaller if it must be. The text styles draw is recorded for this (`drawText`, `drawStack`, `titleBlock`, and `noteText` and `recordText` for styles that write their own). In the app it sits with the series and credit; in the CLI, `--badge`.

## [1.5.0] - 2026-11-12

Control over the cover: pin a style's choices, set the title's font and case and where its lines break, and add a series line and a credit. Covers that use none of these are drawn exactly as in 1.4.0.

### Added

- **Style variants.** Eleven styles let you pin a choice the variation otherwise makes: Minimal's alignment, Big Letter's letter, Split's shape, Concentric's rings, Stripes' stripes and title, Mosaic's tiles, Silhouette's scene, Aurora's title, Botanical's flowers, Blueprint's drawing and Engraved's border. In the app they are buttons under the style (Auto, or a value; Auto outlines what the variation picked), kept in links as `variant=scene.forest`, and the variations strip keeps them. In the library: `createCover({ variants })`, `Cover.variants`, `variants` in `listStyles()`, and for custom styles a `variants` declaration and `ctx.choose(name, values)`. In the CLI: `--variant scene=forest`. Covers that pin nothing are drawn exactly as before.
- **Series line and credit.** `series` ("Book Two of the Ember Cycle") is set in small capitals above the title by `titleBlock`, inside the title's room, never larger than the title, and left out only when the title wouldn't fit with it (Blueprint puts it in its title block's TITLE field; Typewriter types it and Pixel sets it above their titles). `credit` ("Translated by Edith Grossman") follows the subtitle on a line of its own, so every style sets it, and the subtitle keeps its two lines. Both count when the cover's language is inferred. Both are in the cover's label. In the app they sit under "Series and credit" below the subtitle; in the CLI, `--series` and `--credit`.
- **Line breaks in titles.** A title typed on several lines (`'Salt and\nStatic'`, or Enter in the app's title box) is set on those lines in every style: each typed line is kept whole when that costs at most a fifth of the size wrapping would give, and otherwise wraps inside itself, never across a break. Stacked titles stack the typed lines, and Pixel's lettering follows them. The break doesn't change the seed a title makes, so the artwork's choices stay the same, and the title's label reads it as a space. `fitText` breaks at any line break in its text (`LINE_BREAK`). Authors and subtitles stay on one line of text each.
- **Title type.** `font` (any of the nine `FONTS`) and `titleCase` (`'upper'` or `'normal'`) set the title instead of the style's choice, in every style but Typewriter and Pixel, which draw their own lettering. Serifs set in a heavy style's weight are kept to bold, and tracking set for capitals is dropped for lower case. In the app: a font menu (each font shown in itself) and Auto / ABC / Abc under the style, kept across styles and in links (`font=didone&case=upper`). In the CLI: `--font` and `--case`.

### Changed

- The package is on npm: `npm install book-cover-generator`, `npx book-cover-generator`, and the CDN link `cdn.jsdelivr.net/npm/book-cover-generator@1`.

## [1.4.0] - 2026-11-12

Your own colours, any size, more ways to export, kept designs that last, and the app offline.

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

[Unreleased]: https://github.com/otsirh/book-cover-generator/compare/v1.12.0...HEAD
[1.12.0]: https://github.com/otsirh/book-cover-generator/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/otsirh/book-cover-generator/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/otsirh/book-cover-generator/compare/v1.9.2...v1.10.0
[1.9.2]: https://github.com/otsirh/book-cover-generator/compare/v1.9.1...v1.9.2
[1.9.1]: https://github.com/otsirh/book-cover-generator/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/otsirh/book-cover-generator/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/otsirh/book-cover-generator/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/otsirh/book-cover-generator/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/otsirh/book-cover-generator/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/otsirh/book-cover-generator/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/otsirh/book-cover-generator/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/otsirh/book-cover-generator/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/otsirh/book-cover-generator/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/otsirh/book-cover-generator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/otsirh/book-cover-generator/releases/tag/v1.0.0
