import type { Rng } from './core.js';
import type { Palette, PaletteId } from './palettes.js';
import type { FontSpec, FONTS } from './text.js';

export type { Rng } from './core.js';
export type { Palette, PaletteId } from './palettes.js';
export type { FontSpec, FitOptions, TextFit, DrawOptions, TextSpec, TextMeasurer } from './text.js';
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
} from './text.js';
export { titleBlock, authorFit, fitStack, drawStack, splitLead } from './type.js';
export { strongAccents, textColor, tintText, fitTitleWith, textPanel, TEXT_CONTRAST } from './styles/util.js';
export * as svgUtils from './core.js';

export type MockupKind = 'flat' | 'book' | 'ereader' | 'card' | 'square' | 'story';
/** The kinds of mockup `createMockup` makes. */
export declare const mockupKinds: readonly MockupKind[];
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
 * names its columns (title, author, subtitle, series, credit, badge, style, palette, seed, font,
 * case, lang, width, height, texture), JSON lines, or one book per line ("Title | Author | Subtitle").
 */
export declare function parseBookList(text: string): CoverOptions[];
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
  | 'blueprint';

export type StyleGroup = 'Typographic' | 'Geometric' | 'Pattern' | 'Scenic' | 'Vintage' | 'Genre';

/** A palette you define yourself. All colours must be hex (`#rgb` or `#rrggbb`). */
export interface CustomPalette {
  bg: string;
  ink: string;
  accents: readonly string[];
  id?: string;
  name?: string;
  dark?: boolean;
}

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
  /** Add a fine film-grain texture over the cover. Default `false`. */
  texture?: boolean;
  /** A style id, a registered custom style, or `'random'` (default; picked from the seed). */
  style?: StyleId | 'random' | (string & {});
  /** A palette id, a custom palette, or `'random'` / `'auto'` (default; picked from the seed). */
  palette?: PaletteId | 'random' | 'auto' | CustomPalette | (string & {});
  /** Controls every random choice. Defaults to a hash of title + author. */
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
   * Silhouette (see each style's `variants` in `listStyles()`). Names the style doesn't have
   * are ignored; a value it doesn't offer throws.
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

export interface Cover {
  svg: string;
  /** The markup inside the outer `<svg>`, to nest the cover in another SVG (its ids are unique to the cover). */
  body: string;
  /** The style that was used. */
  style: string;
  /** The palette that was used (`'custom'` for a custom palette). */
  palette: string;
  /** The palette's colours, as the cover used them. */
  colors: { bg: string; ink: string; accents: string[]; dark: boolean };
  seed: string;
  width: number;
  height: number;
  /** The language set on the cover (given or inferred), or `''`. */
  lang: string;
  /** The value of each of the style's variants this cover has, pinned or picked by the seed. */
  variants: Record<string, string>;
  /** The title as set (line breaks as "\n"), and the author, after cleaning. */
  title: string;
  author: string;
}

/** A choice a style lets you pin, such as Silhouette's scene. */
export interface StyleVariant {
  name: string;
  label: string;
  values: { value: string; label: string }[];
}

export interface StyleInfo {
  id: string;
  name: string;
  description: string;
  /** The family the style belongs to; `'Custom'` for registered styles without one. */
  group: StyleGroup | (string & {});
  /** The choices you can pin with `createCover({ variants })`; empty for styles without any. */
  variants: StyleVariant[];
}

/** A palette as seen by styles, with derived light/dark colours. */
export interface ResolvedPalette extends Palette {
  readonly accents: readonly string[];
  readonly dark: boolean;
  /** The lighter of `bg` and `ink`. */
  readonly paper: string;
  /** The darker of `bg` and `ink`. */
  readonly night: string;
}

/** Everything a style's `render` function receives. */
export interface StyleContext {
  readonly title: string;
  readonly author: string;
  /** Empty when there is no subtitle. A credit, if any, follows on a line of its own (after "\n"). */
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

export interface CoverStyle {
  id: string;
  name?: string;
  description?: string;
  group?: StyleGroup | (string & {});
  /** Background preference when the palette is picked automatically. */
  prefer?: 'light' | 'dark';
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
export declare function listStyles(): StyleInfo[];
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
export declare function pickStyle(options?: Pick<CoverOptions, 'title' | 'author' | 'seed' | 'style'>): string;
/** Generate a cover and report the style and palette that were chosen. */
export declare function createCover(options?: CoverOptions): Cover;
/** Generate a cover and return the SVG markup. */
export declare function generateCover(options?: CoverOptions): string;
export default generateCover;
