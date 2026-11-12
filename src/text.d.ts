export interface FontSpec {
  /** CSS font-family stack. */
  family: string;
  /** Width multiplier used by the estimate when no canvas is available. */
  widthFactor?: number;
  /** Cap height as a fraction of the font size. */
  cap?: number;
  /** Monospaced (every glyph is 0.6 em). */
  mono?: boolean;
}

export declare const FONTS: Readonly<{
  serif: FontSpec;
  didone: FontSpec;
  garamond: FontSpec;
  sans: FontSpec;
  geometric: FontSpec;
  humanist: FontSpec;
  condensed: FontSpec;
  display: FontSpec;
  mono: FontSpec;
}>;

export interface TextSpec {
  font: FontSpec;
  weight?: number;
  italic?: boolean;
  /** In em. */
  letterSpacing?: number;
}

/** Returns the advance width in px of `text` at `size` px. */
export type TextMeasurer = (
  text: string,
  size: number,
  font: { family: string; weight: number; italic: boolean },
) => number;

/**
 * Override text measurement (e.g. with a real font engine in Node). The measurer is called once per
 * string and font at a reference size of 100 px, and other sizes are scaled from it. Pass `null` to restore the default.
 */
export declare function setTextMeasurer(fn: TextMeasurer | null): void;
export declare function measureText(text: string, size: number, spec: TextSpec): number;
/** Throw a TypeError if `maxWidth` is missing or `maxHeight` is NaN. */
export declare function checkBox(fn: string, o: { maxWidth: number; maxHeight?: number }): void;
/** Throw a TypeError if `maxSize` isn't a positive number, or `minSize` is given and isn't one. */
export declare function checkSizes(fn: string, o: { maxSize: number; minSize?: number }): void;
/** The smallest size text shrinks to: `minSize`, else 22% of `maxSize` but at least 6 px (or half of `maxSize`, if less). */
export declare function defaultMinSize(maxSize: number, minSize?: number): number;
/** The letter-spacing `text` is set with: none for scripts whose letters join (Arabic…), which browsers don't space. */
export declare function trackingFor(text: string, spacing: number): number;
/** Runs of whitespace a line may break at (every kind except the no-break spaces). */
export declare const BREAKING_SPACE: RegExp;
/** A line break in text (CR, LF, CRLF, U+2028, U+2029): `fitText` always breaks lines there. */
export declare const LINE_BREAK: RegExp;
/** The start of a string, cut between user-perceived characters (`units`: count UTF-16 code units). */
export declare function clipGraphemes(str: string, max: number, options?: { units?: boolean }): string;
/** Split a string into user-perceived characters. */
export declare function graphemes(str: string): string[];

export interface FitOptions {
  /** Box width in px. */
  maxWidth: number;
  /** Largest font size in px. */
  maxSize: number;
  /** Box height in px (cap height of the first line to the last baseline). */
  maxHeight?: number;
  /** Smallest font size in px before words are broken and truncated. */
  minSize?: number;
  font?: FontSpec;
  weight?: number;
  italic?: boolean;
  /** In em. Ignored for scripts whose letters join (Arabic…), which browsers don't letter-space. */
  letterSpacing?: number;
  /** Multiple of the font size. */
  lineHeight?: number;
  maxLines?: number;
  upper?: boolean;
  /** Even out line lengths (default `true`). */
  balance?: boolean;
  /** Count the descenders below the last line in `maxHeight`. */
  descent?: boolean;
  /** A single long word that would be set below this size (px) is split once, with a hyphen, instead. */
  hyphenate?: number;
}

export interface TextFit {
  lines: string[];
  size: number;
  width: number;
  /** From the top of the first line (its cap height, or its accents and marks where they reach higher) to the baseline of the last. */
  height: number;
  font: FontSpec;
  weight: number;
  italic: boolean;
  letterSpacing: number;
  /** The pitch between baselines, as a multiple of the size: the requested line height, or more where a line's accents or marks would reach the line above. */
  lineHeight: number;
  cap: number;
  /** Room above the first line's cap height for its accents and marks, as a fraction of the size. */
  above?: number;
  /** Room below the last baseline for descenders and marks, as a fraction of the size. */
  below?: number;
  /** True when the text didn't fit even at the smallest size and was cut with an ellipsis. */
  truncated: boolean;
}

export interface DrawOptions {
  x: number;
  /** Top of the text block: the cap height of the first line, or its accents and marks where they reach higher. */
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
  opacity?: number;
  /** Extra raw SVG attributes for the wrapping `<g>`. */
  attrs?: string;
}

/** Wrap and shrink `text` until it fits the box. */
export declare function fitText(text: unknown, opts: FitOptions): TextFit;
/** Render a fit as SVG `<text>` elements. */
export declare function drawText(fit: TextFit, opts: DrawOptions): string;
/** The baseline of line `i` of a fit drawn at `y`. */
export declare function baselineOf(fit: TextFit, y: number, i: number): number;
/** How far marks reach past Latin capitals, in em: above the cap height (É Å, Thai and Devanagari marks) and below the baseline. */
export declare function markExtent(text: string): { above: number; below: number };
/** Room below a line for descenders and marks, in em. */
export declare function descentOf(line: string): number;
/** Attributes shared by every line of a text block (escaped), for its wrapping `<g>`. */
export declare function textGroupAttrs(o: {
  font: FontSpec;
  fill: string;
  size?: number;
  weight?: number;
  italic?: boolean;
  letterSpacing?: number;
  anchor?: 'start' | 'middle' | 'end';
  opacity?: number;
  attrs?: string;
}): string;
/** The x offset that compensates trailing letter-spacing for centred and right-aligned text. */
export declare function spacingShift(anchor: 'start' | 'middle' | 'end', spacing: number): number;
/** Visual bottom of a fit placed at `y`, including descenders. */
export declare function textBottom(fit: TextFit, y: number): number;
