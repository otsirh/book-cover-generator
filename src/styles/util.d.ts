import type { ResolvedPalette, StyleContext } from '../index.js';
import type { TextFit } from '../text.js';
import type { TitleBlock, TitleBlockOptions } from '../type.js';

/** The title's characters, upper-cased, from the first that isn't punctuation or a space. */
export declare function initialChars(title: string): string[];
/**
 * Accents with at least `min` contrast against `bg` (default 1.8), most contrasting first. Never
 * empty: falls back to the single most readable colour.
 */
export declare function strongAccents(p: ResolvedPalette, bg: string, min?: number): string[];
/** The contrast text needs with what is behind it (3, WCAG's floor for large text). */
export declare const TEXT_CONTRAST: number;
/**
 * A colour for text over `bg` (or over every colour in `bg`): the first of `preferred` with at
 * least 3:1 against all of them, else whichever of ink, background, white and near-black reads best.
 */
export declare function textColor(
  p: ResolvedPalette,
  bg: string | readonly string[],
  preferred?: readonly string[],
): string;
/** `mix(base, toward, k)` for text: as much of `toward` (up to `k`) as keeps 3:1 against `bg`. */
export declare function tintText(base: string, toward: string, k: number, bg: string | readonly string[]): string;
/**
 * Try title layouts in order (most room for the art first) until the title fits comfortably:
 * not truncated, and at least `minSize` × the short side (default 0.06).
 */
export declare function fitTitleWith<V>(
  c: StyleContext,
  candidates: readonly V[],
  optionsFor: (value: V) => TitleBlockOptions,
  minSize?: number,
): { block: TitleBlock; value: V };
/** A flower or rosette: `count` petals around a centre. */
export declare function flower(
  x: number,
  y: number,
  r: number,
  petal: string,
  heart: string,
  count: number,
  width?: number,
): string;
/**
 * A panel holding the title above the author: its top `y` and height `h`, centred on `centerY`
 * (or starting at `top`, or ending at `bottom`) and kept inside the margins.
 */
export declare function textPanel(
  c: StyleContext,
  t: TitleBlock,
  a: TextFit,
  o: { pad: number; gap: number; extra?: number; centerY?: number; top?: number; bottom?: number },
): { y: number; h: number; gap: number };
/** A leaf from (x, y) pointing at `angle` (radians), `len` long. */
export declare function leaf(x: number, y: number, len: number, angle: number, color: string): string;
/** Red (the red channel over the others). */
export declare function redness(hex: string): number;
/** Red, rose or coral (red over green). */
export declare function rosy(hex: string): number;
/** Yellow to orange (red and green over blue). */
export declare function yellowness(hex: string): number;
/** Green, teal or blue (green or blue over red). */
export declare function coolness(hex: string): number;
/** How vivid (the spread of the channels). */
export declare function chroma(hex: string): number;
/** The colour that scores highest (the first, on a tie). */
export declare function most(list: readonly string[], score: (hex: string) => number): string;
