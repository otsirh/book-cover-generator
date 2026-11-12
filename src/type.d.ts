import type { FitOptions, FontSpec, DrawOptions, TextFit } from './text.js';
import type { StyleContext } from './index.js';

/** A justified stack: every line spans the full width at its own size. */
export interface StackFit {
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
  width: number;
  /** The largest line size. */
  size: number;
  font: FontSpec;
  weight: number;
  italic: boolean;
  letterSpacing: number;
  /** Space between lines, as a fraction of the lower line's size. */
  gap: number;
  cap: number;
}

export interface TitleBlockOptions {
  maxWidth: number;
  maxHeight: number;
  /** Largest title size in px. */
  maxSize: number;
  minSize?: number;
  font?: FontSpec;
  weight?: number;
  italic?: boolean;
  upper?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  maxLines?: number;
  /** Set a leading "The" / "A" / "An" as a small line above the title. Default `true`. */
  lead?: boolean;
  /** Try a justified stack (each line full width) before regular wrapping. */
  stack?: boolean;
  /** Include the subtitle under the title. Default `true`. */
  subtitle?: boolean;
  subtitleFont?: FontSpec;
  /** `false` to leave out the cover's series line (for a style that sets it itself). */
  series?: false;
  subtitleItalic?: boolean;
  subtitleUpper?: boolean;
  subtitleSize?: number;
  /** Use this text instead of the cover's title. */
  text?: string;
}

export interface TitleBlock {
  /** From the top of the first line to the bottom of the block. */
  height: number;
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
export declare function drawStack(fit: StackFit, opts: DrawOptions & { lineFills?: (string | undefined)[] }): string;
/** Fit the title (with a demoted leading article and the subtitle) into a box. */
export declare function titleBlock(c: StyleContext, opts: TitleBlockOptions): TitleBlock;
/** The author's name, sized to be readable at thumbnail size. */
export declare function authorFit(c: StyleContext, opts?: Partial<FitOptions>): TextFit;
