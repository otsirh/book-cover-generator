import type { FitOptions, FontSpec, DrawOptions, TextFit } from './text.js';
import type { StyleContext } from './index.js';

/** A justified stack: every line spans the full width at its own size. */
export interface StackFit {
  /** Tells a stack from a `TextFit`. */
  kind: 'stack';
  /**
   * `descent` is the room below each line for descenders and marks, and `above` the room above
   * its cap height for accents and marks, as fractions of its size.
   */
  lines: { text: string; size: number; descent: number; above?: number }[];
  /** Top of the first line (its cap height, or its accents) to the last baseline. */
  height: number;
  /** Room needed below the last baseline, in px. */
  descent: number;
  /** The widest line's width in px. */
  width: number;
  /** The largest line size. */
  size: number;
  /** The font. */
  font: FontSpec;
  /** Font weight (`fitStack` defaults to 700). */
  weight: number;
  /** Whether it is italic. */
  italic: boolean;
  /** Letter-spacing in em (0 for scripts whose letters join). */
  letterSpacing: number;
  /** Space between lines, as a fraction of the lower line's size. */
  gap: number;
  /** Cap height as a fraction of each line's size: the font's `cap`, else 0.72. */
  cap: number;
}

/** Options for `titleBlock`. */
export interface TitleBlockOptions {
  /** Box width in px. */
  maxWidth: number;
  /** Box height in px, for all of it: the series line, the lead, the title and the subtitle. */
  maxHeight: number;
  /** Largest title size in px (a short one-word title, such as "Dune", may grow to 1.6 times this). */
  maxSize: number;
  /**
   * Smallest title size in px (default as for `fitText`). Rather than set the title smaller or cut
   * it, the leading article rejoins the title, then the subtitle and then the series line are left out.
   */
  minSize?: number;
  /** The title's font. Default `FONTS.serif`; the cover's `font` option wins. */
  font?: FontSpec;
  /** The title's weight. Default 400 (at most 700 when the cover's `font` option swaps in a serif). */
  weight?: number;
  /** Set the title in italics. Default `false`. */
  italic?: boolean;
  /** Set the title in capitals. Default `false`; the cover's `titleCase` option wins. */
  upper?: boolean;
  /** The title's letter-spacing in em. Default 0. */
  letterSpacing?: number;
  /** The title's line height, as a multiple of its size. Default 1.05. */
  lineHeight?: number;
  /** The most title lines. Default 5 (or as many as the title was typed on, if more). */
  maxLines?: number;
  /**
   * Set a leading article of three letters or more ("The", "Les", "Der") as a small line above the
   * title; a shorter one ("A", "An", "La") stays with the title. Default `true`.
   */
  lead?: boolean;
  /** Try a justified stack (each line full width) before regular wrapping. */
  stack?: boolean;
  /** Include the subtitle under the title. Default `true`. */
  subtitle?: boolean;
  /** The font of the subtitle and the series line. Default: the title's. */
  subtitleFont?: FontSpec;
  /** `false` to leave out the cover's series line (for a style that sets it itself). */
  series?: false;
  /** Set the subtitle in italics. Default `true`, except in `FONTS.mono`. */
  subtitleItalic?: boolean;
  /** Set the subtitle in spaced capitals. Default `false`. */
  subtitleUpper?: boolean;
  /** Largest subtitle size in px. Default 3.6% of the cover's short side. */
  subtitleSize?: number;
  /** Use this text instead of the cover's title. */
  text?: string;
}

/** A title laid out by `titleBlock`, ready to draw. */
export interface TitleBlock {
  /** From the top of the first line to the bottom of the block. */
  height: number;
  /** The widest line's width in px (the title's, the lead's, the subtitle's or the series line's). */
  width: number;
  /** The main title size (the largest line, for stacks). */
  size: number;
  /** The smallest title line's size: the same as `size` unless stacked. */
  smallest: number;
  /** Whether the title came out as a justified stack. */
  stacked: boolean;
  /** Number of title lines, not counting the lead or subtitle. */
  lines: number;
  /** The title was cut with an ellipsis because it didn't fit. */
  truncated: boolean;
  /**
   * The block as SVG, its top at `y`. `fill` colours the title, `leadFill` the lead and the series
   * line, and `subtitleFill` the subtitle (both default to `fill`); `attrs` (raw SVG attributes)
   * go on every part.
   */
  draw(o: {
    x: number;
    y: number;
    anchor?: 'start' | 'middle' | 'end';
    fill: string;
    leadFill?: string;
    subtitleFill?: string;
    attrs?: string;
    /** Per-line colours for a stacked title. */
    lineFills?: (string | undefined)[];
  }): string;
}

/** Split a leading article (English, French, Spanish, Italian or German) off a title: "Les Misérables" → `{ lead: 'Les', main: 'Misérables' }`. */
export declare function splitLead(title: string): { lead: string; main: string };
/** Words grouped into lines for a stack; small words join the next word. */
export declare function stackLines(text: string): string[];
/** Fit a justified stack, or `null` when the text doesn't suit one. */
export declare function fitStack(text: string, opts: FitOptions & { gap?: number }): StackFit | null;
/**
 * Render a stack as SVG `<text>` elements, its top at `y` (as for `drawText`); `lineFills` colours
 * lines one by one.
 */
export declare function drawStack(fit: StackFit, opts: DrawOptions & { lineFills?: (string | undefined)[] }): string;
/** Fit the title (with a demoted leading article and the subtitle) into a box. */
export declare function titleBlock(c: StyleContext, opts: TitleBlockOptions): TitleBlock;
/** The author's name, sized to be readable at thumbnail size. */
export declare function authorFit(c: StyleContext, opts?: Partial<FitOptions>): TextFit;
