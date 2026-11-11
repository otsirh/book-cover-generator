import type { Rng } from './core.js';
import type { Palette, PaletteId } from './palettes.js';

export type { Rng } from './core.js';
export type { Palette, PaletteId } from './palettes.js';
export type { FontSpec, FitOptions, TextFit, DrawOptions, TextSpec, TextMeasurer } from './text.js';
export { palettes } from './palettes.js';
export { FONTS, fitText, drawText, measureText, setTextMeasurer } from './text.js';
export * as svgUtils from './core.js';

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
  | 'shelf';

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
  /** Defaults to `'Untitled'`. */
  title?: string;
  author?: string;
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
}

export interface Cover {
  svg: string;
  /** The style that was used. */
  style: string;
  /** The palette that was used (`'custom'` for a custom palette). */
  palette: string;
  seed: string;
  width: number;
  height: number;
}

export interface StyleInfo {
  id: string;
  name: string;
  description: string;
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
}

export interface CoverStyle {
  id: string;
  name?: string;
  description?: string;
  /** Background preference when the palette is picked automatically. */
  prefer?: 'light' | 'dark';
  /** Return SVG markup without the outer `<svg>` element. */
  render(ctx: StyleContext): string;
}

/** Ids of every available style (including registered custom styles). */
export declare const styles: string[];
export declare function listStyles(): StyleInfo[];
/** Add a custom style. Registering a style changes which style `'random'` picks for a given seed. */
export declare function registerStyle(style: CoverStyle): void;
/** A short random seed, e.g. for a "randomize" button. */
export declare function randomSeed(): string;
/** Generate a cover and report the style and palette that were chosen. */
export declare function createCover(options?: CoverOptions): Cover;
/** Generate a cover and return the SVG markup. */
export declare function generateCover(options?: CoverOptions): string;
export default generateCover;
