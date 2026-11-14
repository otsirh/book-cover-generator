/**
 * Draw book covers as SVG from a title and an author. Every random choice (the style, the palette,
 * the artwork) comes from a seed, by default the title and author, so the same options give the
 * same cover.
 *
 * ```js
 * import { createCover } from '@otsirh/book-cover-generator';
 *
 * const { svg, style, palette } = createCover({
 *   title: 'Dune',
 *   author: 'Frank Herbert',
 *   style: 'retro', // or 'random' (the default): picked from the seed
 *   seed: 42,
 * });
 * ```
 *
 * `generateCover` returns the SVG alone, and `createMockup` shows a cover as a book or on a social
 * card. To make a PNG, JPEG or WebP in a browser, see the `./browser` entry point; for a cover from
 * an HTML element, `./element`. `registerStyle` adds a style of your own, drawn with the same text and
 * colour helpers the built-in styles use.
 *
 * (On npm the package is `book-cover-generator`: `import { createCover } from 'book-cover-generator'`.)
 *
 * @module
 */

import type { Rng } from './core.js';
import type { Palette, PaletteId } from './palettes.js';
import type { FontSpec, FONTS } from './text.js';

export type { Rng } from './core.js';
export type { Palette, PaletteId } from './palettes.js';
export type { FontSpec, FitOptions, TextFit, DrawOptions, TextSpec, TextMeasurer, TextBox } from './text.js';
export type { StackFit, TitleBlock, TitleBlockOptions } from './type.js';
export { palettes } from './palettes.js';
export {
  FONTS,
  fitText,
  drawText,
  measureText,
  setTextMeasurer,
  baselineOf,
  textBottom,
  textGroupAttrs,
  markExtent,
  noteText,
  recordText,
} from './text.js';
export { titleBlock, authorFit, fitStack, drawStack, splitLead } from './type.js';
export { strongAccents, textColor, tintText, fitTitleWith, textPanel, TEXT_CONTRAST } from './styles/util.js';
/** The SVG, colour and noise helpers the built-in styles use. */
export * as svgUtils from './core.js';

/** A kind of mockup: a product shot (`flat`, `book`, `ereader`) or a social card (`card`, `square`, `story`). */
export type MockupKind = 'flat' | 'book' | 'ereader' | 'card' | 'square' | 'story';
/** The kinds of mockup `createMockup` makes. */
export declare const mockupKinds: readonly MockupKind[];
/** Options for `createMockup`. */
export interface MockupOptions {
  /** Default `'book'`. `card` is 1200 × 630, `square` 1080 × 1080, `story` 1080 × 1920; the others follow the cover's size. */
  kind?: MockupKind;
  /** A hex colour behind it. Product shots default to a light studio grey, social cards to the cover's colours. */
  background?: string;
  /** A line for social cards, such as `'Out now'` (up to 80 characters). */
  text?: string;
}
/**
 * Read a list of books into cover options, one per book with a title: CSV or TSV whose first row
 * names its columns (title, author, subtitle, series, credit, badge, style, genre, palette, seed,
 * font, case, lang, width, height, texture), JSON lines, or one book per line ("Title | Author | Subtitle").
 */
export declare function parseBookList(text: string): CoverOptions[];
/**
 * Cover options for a book from a list over `defaults`, the options every book shares: the book's
 * own values win, a width or a height it gives alone sizes the defaults' shape, a book naming another
 * style than the defaults' drops their pinned variants (with no shared style, it keeps the ones
 * its own style offers), and one naming a genre the defaults' style doesn't suit gets a style that
 * suits it. A shared style that doesn't exist throws.
 */
export declare function optionsForBook(book: CoverOptions, defaults?: CoverOptions): CoverOptions;
/** The id of the style that `name` names, by id or name in any case ('Art Deco', 'artdeco'), or undefined. */
export declare function styleIdFor(name: string): string | undefined;
/** The cover as a product shot (flat, book, e-reader) or on a social card, as SVG. */
export declare function createMockup(
  cover: Cover,
  options?: MockupOptions,
): {
  svg: string;
  width: number;
  height: number;
  /** How many times its own size the mockup shows the cover at (the largest place it shows it). */
  coverScale: number;
  /** The kind of mockup it is (the one asked for, as the library reads it: `'Card'` is `'card'`). */
  kind: MockupKind;
};

/** A paper a paperback is printed on. `color` is KDP's standard colour; `premium-color` is thicker. */
export type PaperType = 'white' | 'cream' | 'color' | 'premium-color';
/** How thick a page is, in inches, on each paper (Amazon KDP's figures). */
export declare const paperTypes: Readonly<Record<PaperType, number>>;
/** Amazon KDP's paperback trim sizes, width × height in inches, by name (`'6x9'`…). */
export declare const trimSizes: Readonly<
  Record<
    | '5x8'
    | '5.06x7.81'
    | '5.25x8'
    | '5.5x8.5'
    | '6x9'
    | '6.14x9.21'
    | '6.69x9.61'
    | '7x10'
    | '7.44x9.69'
    | '7.5x9.25'
    | '8x10'
    | '8.25x6'
    | '8.25x8.25'
    | '8.27x11.69'
    | '8.5x8.5'
    | '8.5x11',
    readonly [number, number]
  >
>;
/** What a paperback can be (Amazon KDP's limits). */
export declare const printLimits: Readonly<{
  /** Trim width, in inches: least and most. */
  width: readonly [number, number];
  /** Trim height, in inches: least and most. */
  height: readonly [number, number];
  /**
   * Page count on each paper, least and most (cream is thicker; standard colour takes 72 to 600).
   * The largest trims take fewer (8.5 × 11 and 8.5 × 8.5 at most 590 on white paper; 8.25 × 6,
   * 8.25 × 8.25 and 8.27 × 11.69 a little fewer), which `createPrintCover` checks.
   */
  pages: Readonly<Record<PaperType, readonly [number, number]>>;
  /**
   * The most pages at the trims that take fewer than `pages` says, by trim (as `trimSizes` names
   * it, such as `'8.5x11'`) and paper; `null` where the paper isn't offered at that trim. KDP
   * states these for its named trims only: a trim of your own is held to `pages`.
   */
  trimPages: Readonly<Record<string, Readonly<Record<PaperType, number | null>>>>;
  /** A book with fewer pages has no text on its spine. */
  spineTextPages: number;
}>;
/**
 * A paperback's spine width in inches: `pages` times the thickness of its paper (default white).
 * Throws for an unknown paper, or a page count outside `printLimits`.
 */
export declare function spineWidth(pages: number, paper?: PaperType | (string & {})): number;
/**
 * The page counts a paperback can have at a trim (a name such as `'8.5x11'`, or `[width, height]`
 * in inches) on a paper (default white): `[least, most]`, the most capped by what the trim takes
 * (8.5 × 11 in: 590 on white paper), as `createPrintCover` checks it; `null` where the paper isn't
 * printed at that trim. Throws for an unknown trim or paper.
 */
export declare function pageRange(
  trim: string | readonly [number, number],
  paper?: PaperType | (string & {}),
): [number, number] | null;

/** Options for `createPrintCover`: the book as printed, and its back cover. */
export interface PrintOptions {
  /** The page count, from which the spine's width follows. Required. */
  pages: number;
  /** The trim size: a name such as `'6x9'` or `'5.5 × 8.5'`, or `[width, height]` in inches. Default `'6x9'`. */
  trim?: string | readonly [number, number];
  /** The paper, which sets the thickness of a page. Default `'white'`. */
  paper?: PaperType | (string & {});
  /** Inches per page, for a printer with other figures than KDP's (instead of `paper`'s). */
  pageThickness?: number;
  /** Bleed past the trim on the outside edges, in inches. Default 0.125 (KDP's). */
  bleed?: number;
  /** A line or two at the top of the back cover, set large ("Some lights are kept burning for a reason."). */
  hook?: string;
  /** The back cover's text: paragraphs separated by blank lines. As large as fits, from 12 pt to 8 pt, then cut with "…". */
  blurb?: string;
  /** A small line at the foot of the back cover: your imprint, website… */
  imprint?: string;
  /** Keep the barcode's box (2 × 1.2 in, at the foot of the back, by the spine) clear of text. Default `true`. */
  barcode?: boolean;
  /** The back cover's colour (hex). Default: the cover's background. */
  backColor?: string;
  /** The spine's colour (hex). Default: the cover's ink. */
  spineColor?: string;
  /** Draw the trim, the folds and the barcode's box as dashed lines: for a preview, not for the printer. */
  guides?: boolean;
}

/** A paperback's whole cover, from `createPrintCover`. */
export interface PrintCover {
  /** The back, the spine and the front as one SVG, in CSS px (96 to the inch). */
  svg: string;
  /** Its width in CSS px (96 to the inch). */
  width: number;
  /** Its height in CSS px (96 to the inch). */
  height: number;
  /** Its sizes in inches, as a print service asks for them. */
  inches: {
    /** The whole width: bleed, back, spine, front and bleed. */
    width: number;
    /** The whole height: the trim's and the bleed above and below. */
    height: number;
    /** The trim size, width and height. */
    trim: [number, number];
    /** The spine's width. */
    spine: number;
    /** The bleed on each outside edge. */
    bleed: number;
  };
  /** Whether the spine has the title and author (only from `printLimits.spineTextPages` pages, and when they'd be readable). */
  spineText: boolean;
  /** The barcode's box in CSS px, kept clear of text, or null with `barcode: false`. */
  barcode: { x: number; y: number; width: number; height: number } | null;
  /** The front cover, as `createCover` drew it at the trim's shape. */
  front: Cover;
}

/**
 * A paperback's whole cover as one SVG: the back with your text and room for the barcode, the
 * spine with the title and author, and the front, which is the cover `cover` draws, its art
 * carried into the bleed. Sized by Amazon KDP's rules from the trim and the page count; in a
 * browser, `svgToPdf` (from `./browser`) makes the PDF to upload.
 *
 * ```js
 * const { svg, inches } = createPrintCover(
 *   { title: 'The Lighthouse Keeper', author: 'Mara Ellison', style: 'artdeco' },
 *   { trim: '6x9', pages: 320, paper: 'cream', blurb: 'When the lamp at Gull Point goes dark…' },
 * );
 * // inches.width === 13.05, inches.spine === 0.8
 * ```
 */
export declare function createPrintCover(cover: CoverOptions, print: PrintOptions): PrintCover;

/** This version of the library, such as `'1.4.0'`. Artwork for a seed can change between minor versions. */
export declare const version: string;
/** The sizes a cover can have: each side `min` to `max` px, and neither more than `ratio` times the other. */
export declare const sizeLimits: Readonly<{ min: number; max: number; ratio: number }>;
/** Common cover shapes at 600 px wide, as the web app offers them: `[width, height]`. */
export declare const formats: Readonly<{
  paperback: readonly [number, number];
  ebook: readonly [number, number];
  square: readonly [number, number];
}>;

/** The ids of the built-in styles. */
export type StyleId =
  | 'minimal'
  | 'swiss'
  | 'bauhaus'
  | 'typographic'
  | 'classic'
  | 'artdeco'
  | 'aurora'
  | 'landscape'
  | 'retro'
  | 'constellation'
  | 'orbit'
  | 'waves'
  | 'halftone'
  | 'topographic'
  | 'flowfield'
  | 'lowpoly'
  | 'mosaic'
  | 'stripes'
  | 'concentric'
  | 'split'
  | 'blocks'
  | 'pixel'
  | 'sunburst'
  | 'memphis'
  | 'noir'
  | 'typewriter'
  | 'shelf'
  | 'bigtype'
  | 'thriller'
  | 'botanical'
  | 'engraved'
  | 'papercut'
  | 'silhouette'
  | 'blueprint'
  | 'hollow'
  | 'ribbon'
  | 'crest'
  | 'storybook'
  | 'idea';

/** The families the built-in styles belong to. */
export type StyleGroup = 'Typographic' | 'Geometric' | 'Pattern' | 'Scenic' | 'Vintage' | 'Genre';

/** A palette you define yourself. All colours must be hex (`#rgb` or `#rrggbb`). */
export interface CustomPalette {
  /** The background. */
  bg: string;
  /**
   * The text colour, and that of the lines styles draw with it. One that reads badly on `bg`
   * (under 3:1 contrast) is replaced with black or white (`#111111` or `#ffffff`), so text is
   * always readable: a cover's `colors.ink`, and a palette `registerPalette` adds, hold that.
   */
  ink: string;
  /** One or more accents; a cover repeats them to make three if there are fewer. */
  accents: readonly string[];
  /** Its id: what the cover reports as its `palette` (default `'custom'`). `registerPalette` needs one. */
  id?: string;
  /** Its name as people read it. Default `'Custom'`, or for `registerPalette` its id. */
  name?: string;
  /** Whether the background is dark. Default: whether `bg` is darker than `ink`. */
  dark?: boolean;
}

/**
 * Options for `createCover` and `generateCover`, all optional. An option that isn't valid throws
 * an error that says why (`texture` excepted: any truthy value turns it on).
 */
export interface CoverOptions {
  /** Defaults to `'Untitled'`. Up to 300 characters are used. */
  title?: string;
  /** Up to 200 characters are used. */
  author?: string;
  /** A subtitle or tagline, set small under the title. Up to 300 characters are used. */
  subtitle?: string;
  /** A series line set small above the title, such as `'Book Two of the Ember Cycle'`. Up to 120 characters. */
  series?: string;
  /** A credit set on a line of its own under the subtitle, such as `'Translated by Edith Grossman'`. Up to 120 characters. */
  credit?: string;
  /** A seal set in a corner clear of the text, such as `'Winner of the Hugo Award'`. Up to 60 characters. */
  badge?: string;
  /** Add a fine film-grain texture over the cover. Default `false`; any truthy value (even `'false'`) turns it on. */
  texture?: boolean;
  /** A style id, a registered custom style, or `'random'` (default; picked from the seed). */
  style?: StyleId | 'random' | (string & {});
  /** With a random style, pick one that suits this genre (see `genres`). */
  genre?: GenreId | (string & {});
  /**
   * A palette id, a custom palette, your own colours as a link writes them
   * (`'custom-0b132b-f8f9fa-ff6b6b'`: background, ink and one to three accents), or `'random'` /
   * `'auto'` (default; picked from the seed).
   */
  palette?: PaletteId | 'random' | 'auto' | CustomPalette | (string & {});
  /** Controls every random choice. Defaults to the title and author (`Cover.seed` says which seed was used). */
  seed?: string | number;
  /** Width in px, 50–10000. Default 600, or `height ÷ 1.5` when only a height is given (the paperback's 2:3). */
  width?: number;
  /** Height in px, 50–10000. Default `width × 1.5`. */
  height?: number;
  /**
   * The language of the text, as a BCP 47 tag (`'ja'`, `'zh-Hant'`), so Chinese characters get
   * that language's glyphs. Default: `'ja'` for text with kana, `'ko'` for text with Hangul, else none.
   */
  lang?: string;
  /**
   * Choices to pin instead of leaving them to the seed, such as `{ scene: 'forest' }` for
   * Silhouette (see each style's `variants` in `listStyles()`), in any case. Names the style
   * doesn't have are ignored. A value no style offers throws; with a style you name, so does a
   * value that style lacks (a style picked at random takes only the pins it can).
   */
  variants?: Readonly<Record<string, string>>;
  /**
   * The title's font, one of `FONTS` (`'didone'`, `'geometric'`…), instead of the style's. Styles
   * that draw their own lettering (Typewriter, Pixel) keep theirs.
   */
  font?: keyof typeof FONTS | (string & {});
  /** Set the title in capitals (`'upper'`) or as typed (`'normal'`) instead of as the style does. */
  titleCase?: 'upper' | 'normal';
}

/** A cover made by `createCover`: its SVG, and the choices it was made with. */
export interface Cover {
  /** The SVG document, `width` × `height` px, named for screen readers by its title, author and other text. */
  svg: string;
  /** The markup inside the outer `<svg>`, to nest the cover in another SVG (its ids are unique to the cover). */
  body: string;
  /** The style that was used. */
  style: string;
  /** The palette that was used: its id, or for a custom palette its own `id` (`'custom'` if it has none). */
  palette: string;
  /** The palette's colours, as the cover used them. */
  colors: { bg: string; ink: string; accents: string[]; dark: boolean };
  /**
   * The seed the cover was drawn from: the `seed` option as a string, else one made from the title
   * and author. The same options with this seed give the same cover.
   */
  seed: string;
  /** Width in px. */
  width: number;
  /** Height in px. */
  height: number;
  /** The language set on the cover (given or inferred), or `''`. */
  lang: string;
  /** The value of each of the style's variants this cover has, pinned or picked by the seed. */
  variants: Record<string, string>;
  /** The title as set, after cleaning (line breaks as "\n"; `'Untitled'` when there is none). */
  title: string;
  /** The author after cleaning, or `''`. */
  author: string;
}

/** A choice a style lets you pin, such as Silhouette's scene. */
export interface StyleVariant {
  /** The name to pin it by, such as `'scene'`. */
  name: string;
  /** The name as people read it, such as `'Scene'`. */
  label: string;
  /** The values it can take, each with a label as people read it. */
  values: { value: string; label: string }[];
}

/** A style as `listStyles()` describes it. */
export interface StyleInfo {
  /** Its id, as `createCover({ style })` takes it. */
  id: string;
  /** Its name as people read it, such as `'Art Deco'`; for a registered style without one, its id. */
  name: string;
  /** What it looks like, in a sentence; empty for a registered style without one. */
  description: string;
  /** The family the style belongs to; `'Custom'` for registered styles without one. */
  group: StyleGroup | (string & {});
  /** The choices you can pin with `createCover({ variants })`; empty for styles without any. */
  variants: StyleVariant[];
  /** The genres the style suits (ids from `genres`). */
  genres: string[];
}

/** The ids of the genres in `genres`. */
export type GenreId = 'literary' | 'thriller' | 'horror' | 'romance' | 'fantasy' | 'children' | 'nonfiction';
/** The genres styles can suit, as `createCover({ genre })` and `listStyles()` name them. */
export declare const genres: readonly { readonly id: GenreId; readonly name: string }[];

/** A palette as seen by styles, with derived light/dark colours. */
export interface ResolvedPalette extends Palette {
  /** At least three accents: a palette with fewer has them repeated. */
  readonly accents: readonly string[];
  /** Whether the background is dark: the palette's `dark`, else whether `bg` is darker than `ink`. */
  readonly dark: boolean;
  /** The lighter of `bg` and `ink`. */
  readonly paper: string;
  /** The darker of `bg` and `ink`. */
  readonly night: string;
}

/** Everything a style's `render` function receives. */
export interface StyleContext {
  /** The title after cleaning (`'Untitled'` if there is none), with any line breaks it was typed with as "\n". */
  readonly title: string;
  /** The author after cleaning, or empty. */
  readonly author: string;
  /**
   * The subtitle, then the credit ("Translated by …"), if any, on a line of its own (after "\n"):
   * the credit alone when there is no subtitle, and empty when there is neither.
   */
  readonly subtitle: string;
  /** The series line, or empty. `titleBlock` sets it above the title. */
  readonly series: string;
  /** Cover width in px. */
  readonly W: number;
  /** Cover height in px. */
  readonly H: number;
  /** The short side in px: base text and decoration sizes on this, so wide covers work. */
  readonly S: number;
  /** Scale unit: 1 when the short side is 600 px. */
  readonly u: number;
  /** Suggested margin in px. */
  readonly m: number;
  /** Seeded random numbers, unique to this cover and style. */
  readonly rng: Rng;
  /** The palette, with its lighter and darker colours as `paper` and `night`. */
  readonly p: ResolvedPalette;
  /** Make an id that is unique to this cover, for gradients, filters, masks… */
  id(name: string): string;
  /**
   * Pick one of `values` for the variant `name`, as `rng.pick(values)` would, unless the cover
   * pins it (`createCover({ variants: { [name]: value } })`). Repeat a value to make it likelier.
   */
  choose<T extends string>(name: string, values: readonly T[]): T;
  /** The title font the cover asks for (`createCover`'s `font`), or null; `titleBlock` follows it. */
  readonly titleFont: FontSpec | null;
  /** The title case the cover asks for (`titleCase`), or null; `titleBlock` follows it. */
  readonly titleCase: 'upper' | 'normal' | null;
}

/** A style to add with `registerStyle`. */
export interface CoverStyle {
  /** Its id: a non-empty string without spaces at either end, and not `'random'` (in any case). */
  id: string;
  /** Its name as people read it. Default: the id. */
  name?: string;
  /** What it looks like, in a sentence. Default empty. */
  description?: string;
  /** The family it belongs to, as `listStyles()` reports it. Default `'Custom'`. */
  group?: StyleGroup | (string & {});
  /** Background preference when the palette is picked automatically. */
  prefer?: 'light' | 'dark';
  /**
   * The genres the style suits (ids or names from `genres`), so `createCover({ genre })` can pick it. A
   * replacement for a built-in style suits the built-in's genres unless it names its own.
   */
  genres?: readonly string[];
  /**
   * The choices `render` makes with `ctx.choose(name, values)` that people can pin, with labels:
   * `{ scene: { label: 'Scene', values: { city: 'City', forest: 'Forest' } } }`.
   */
  variants?: Readonly<Record<string, { label?: string; values: Readonly<Record<string, string>> }>>;
  /** Return SVG markup without the outer `<svg>` element. */
  render(ctx: StyleContext): string;
}

/** Ids of every available style (including registered custom styles). */
export declare const styles: string[];
/** Every available style, built-in and registered, as copies: changing them changes no style. */
export declare function listStyles(): StyleInfo[];
/** Options for `registerStyle` and `registerPalette`. */
export interface RegisterOptions {
  /** Allow replacing the built-in style (or palette) with the same id. */
  replace?: boolean;
}
/**
 * Add a custom style. Replacing a built-in one takes `{ replace: true }`. Registering a style
 * changes which style `'random'` picks for a given seed.
 */
export declare function registerStyle(style: CoverStyle, options?: RegisterOptions): void;
/** Remove a registered style, or bring back the built-in style one replaced. Whether anything changed. */
export declare function unregisterStyle(id: string): boolean;
/**
 * Add a palette, used with `palette: id`. Replacing a built-in one takes `{ replace: true }`.
 * Registering a palette changes which palette `'random'` picks for a given seed.
 */
export declare function registerPalette(palette: CustomPalette & { id: string }, options?: RegisterOptions): void;
/** Remove a registered palette, or bring back the built-in palette one replaced. Whether anything changed. */
export declare function unregisterPalette(id: string): boolean;
/** A short random seed, e.g. for a "randomize" button. */
export declare function randomSeed(): string;
/** The style id `createCover` would use for these options (resolving `'random'` from the seed), without drawing. */
export declare function pickStyle(
  options?: Pick<CoverOptions, 'title' | 'author' | 'seed' | 'style' | 'genre'>,
): string;
/** Generate a cover and report the style and palette that were chosen. */
export declare function createCover(options?: CoverOptions): Cover;
/** Generate a cover and return the SVG markup. */
export declare function generateCover(options?: CoverOptions): string;
export default generateCover;
