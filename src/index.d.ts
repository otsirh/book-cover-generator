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
 * own values win, a size it gives replaces both sides of the defaults', a book naming another
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
): { svg: string; width: number; height: number };

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
  /** The text colour. */
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
  /** A palette id, a custom palette, or `'random'` / `'auto'` (default; picked from the seed). */
  palette?: PaletteId | 'random' | 'auto' | CustomPalette | (string & {});
  /** Controls every random choice. Defaults to the title and author (`Cover.seed` says which seed was used). */
  seed?: string | number;
  /** Width in px, 50–10000. Default 600. */
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
