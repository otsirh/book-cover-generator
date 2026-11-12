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
  /** In em. */
  letterSpacing?: number;
  /** Multiple of the font size. */
  lineHeight?: number;
  maxLines?: number;
  upper?: boolean;
  /** Even out line lengths (default `true`). */
  balance?: boolean;
}

export interface TextFit {
  lines: string[];
  size: number;
  width: number;
  /** From the cap height of the first line to the baseline of the last. */
  height: number;
  font: FontSpec;
  weight: number;
  italic: boolean;
  letterSpacing: number;
  lineHeight: number;
  cap: number;
  /** True when the text didn't fit even at the smallest size and was cut with an ellipsis. */
  truncated: boolean;
}

export interface DrawOptions {
  x: number;
  /** Top of the text block (cap height of the first line). */
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
