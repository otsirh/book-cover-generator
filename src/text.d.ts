/** A font to set text in: a CSS font-family stack, and what fitting text in it needs to know. */
export interface FontSpec {
  /** Its name as the app's menu shows it (the built-in fonts). */
  name?: string;
  /** CSS font-family stack. */
  family: string;
  /** Width multiplier used by the estimate when no canvas is available. */
  widthFactor?: number;
  /** Cap height as a fraction of the font size. */
  cap?: number;
  /** Monospaced (every glyph is 0.6 em). */
  mono?: boolean;
}

/**
 * The built-in fonts. Each is a stack of system fonts, as an SVG drawn into a canvas (for PNG or
 * JPEG export) can't load web fonts.
 */
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

/** The type `measureText` measures with: a font, its weight and style, and letter-spacing. */
export interface TextSpec {
  /** The font. */
  font: FontSpec;
  /** Font weight. Default 400. */
  weight?: number;
  /** Italic. Default `false`. */
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
 * Returns the measurer it replaces (null for the default), to put back after.
 */
export declare function setTextMeasurer(fn: TextMeasurer | null): TextMeasurer | null;
/**
 * The width in px of `text` at `size` px, letter-spacing included: measured with the function set
 * by `setTextMeasurer`, else with a canvas, else from the built-in fonts' character widths (other
 * fonts are estimated). Throws a TypeError if that function returns anything but a finite width of
 * 0 or more.
 */
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
/** The number of lines text was typed on: 1 without line breaks. */
export declare function typedLines(text: string): number;
/** Where some text was drawn. */
export interface TextBox {
  /** Left edge, in px. */
  x0: number;
  /** Top edge, in px. */
  y0: number;
  /** Right edge, in px. */
  x1: number;
  /** Bottom edge, in px. */
  y1: number;
}
/** Note that text was drawn in this box (drawText and drawStack do it), so a badge can be placed clear of it. */
export declare function noteText(x0: number, y0: number, x1: number, y1: number): void;
/** Run `draw` and collect the boxes of the text it draws. */
export declare function recordText<T>(draw: () => T): { result: T; boxes: TextBox[] };
/** The start of a string, cut between user-perceived characters (`units`: count UTF-16 code units). */
export declare function clipGraphemes(str: string, max: number, options?: { units?: boolean }): string;
/**
 * Text as a cover sets it: control characters and runs of spaces become one space, characters XML
 * can't hold are dropped, and it's cut (between whole characters) to `max` characters. With
 * `breaks`, typed line breaks stay, as "\n" (empty lines dropped).
 */
export declare function cleanText(value: unknown, max: number, options?: { breaks?: boolean }): string;
/** Text in capitals as `lang` writes them (default: the language of the cover being drawn). */
export declare function toUpper(text: string, lang?: string): string;
/** Run `draw` with `lang` as the language capitals are set in. */
export declare function inLanguage<T>(lang: string, draw: () => T): T;
/**
 * A paragraph wrapped to `maxWidth` px at `size` px, line by line as prose is set: breaking where
 * a line may (spaces, between words of scripts without them, not around punctuation that must
 * stay), and breaking a word wider than the width.
 */
export declare function wrapText(text: string, size: number, maxWidth: number, spec: TextSpec): string[];
/** Split a string into user-perceived characters. */
export declare function graphemes(str: string): string[];

/** Options for `fitText`: the box to fit, and how to set the text. */
export interface FitOptions {
  /** Box width in px. */
  maxWidth: number;
  /** Largest font size in px. */
  maxSize: number;
  /**
   * Box height in px: from the top of the first line (its cap height, or its marks when it has
   * accents or marks above, such as É, Thai or Devanagari) to the last baseline.
   */
  maxHeight?: number;
  /** Smallest font size in px before words are broken and truncated. */
  minSize?: number;
  /** The font. Default `FONTS.sans`. */
  font?: FontSpec;
  /** Font weight. Default 400. */
  weight?: number;
  /** Italic. Default `false`. */
  italic?: boolean;
  /** In em. Ignored for scripts whose letters join (Arabic…), which browsers don't letter-space. */
  letterSpacing?: number;
  /** Multiple of the font size. */
  lineHeight?: number;
  /** The most lines to wrap to. Default 5. */
  maxLines?: number;
  /** Set the text in capitals. Default `false`. */
  upper?: boolean;
  /** The language whose capitals `upper` uses (Turkish i is İ). Default: the cover's, while one is drawn. */
  lang?: string;
  /** Even out line lengths (default `true`). */
  balance?: boolean;
  /** Count the descenders below the last line in `maxHeight`. */
  descent?: boolean;
  /** A single long word that would be set below this size (px) is split once, with a hyphen, instead. */
  hyphenate?: number;
}

/** Text fitted to a box by `fitText`, ready for `drawText`. */
export interface TextFit {
  /** The lines, as set (in capitals with `upper`); empty for empty text. */
  lines: string[];
  /** Font size in px (0 for empty text). */
  size: number;
  /** The widest line's width in px. */
  width: number;
  /** From the top of the first line (its cap height, or its accents and marks where they reach higher) to the baseline of the last. */
  height: number;
  /** The font. */
  font: FontSpec;
  /** Font weight. */
  weight: number;
  /** Whether it is italic. */
  italic: boolean;
  /** Letter-spacing in em (0 for scripts whose letters join). */
  letterSpacing: number;
  /** The pitch between baselines, as a multiple of the size: the requested line height, or more where a line's accents or marks would reach the line above. */
  lineHeight: number;
  /** Cap height as a fraction of the size: the font's `cap`, else 0.72. */
  cap: number;
  /** Room above the first line's cap height for its accents and marks, as a fraction of the size. */
  above?: number;
  /** Room below the last baseline for descenders and marks, as a fraction of the size. */
  below?: number;
  /** True when the text didn't fit even at the smallest size and was cut with an ellipsis. */
  truncated: boolean;
}

/** Where and how `drawText` sets a fit. */
export interface DrawOptions {
  /** The x of the anchor point, in px. */
  x: number;
  /** Top of the text block: the cap height of the first line, or its accents and marks where they reach higher. */
  y: number;
  /** How the lines align on `x`, as SVG's `text-anchor`. Default `'start'`. */
  anchor?: 'start' | 'middle' | 'end';
  /** Text colour. Default `'#000'`. */
  fill?: string;
  /** Opacity, 0–1. Default 1. */
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
/**
 * Attributes shared by every line of a text block, for its wrapping `<g>`: the font family and fill
 * are escaped, `attrs` is written as given (raw SVG). Unlike the fitting options, `size` and
 * `letterSpacing` are in px here (`drawText` passes a fit's letter-spacing × its size).
 */
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
/**
 * Text of characters that draw nothing and take no room (Unicode's default ignorables: joiners,
 * soft hyphens, variation selectors, marks of direction), as browsers and resvg draw them.
 */
export declare const INVISIBLE: RegExp;
