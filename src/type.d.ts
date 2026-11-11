import type { FitOptions, FontSpec, DrawOptions, TextFit } from './text.js';
import type { StyleContext } from './index.js';

/** A justified stack: every line spans the full width at its own size. */
export interface StackFit {
  kind: 'stack';
  /** `descent` is the room below each line for descenders, as a fraction of its size. */
  lines: { text: string; size: number; descent: number }[];
  /** Cap height of the first line to the last baseline. */
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
  /** Whether the title came out as a justified stack. */
  stacked: boolean;
  /** Number of title lines, not counting the lead or subtitle. */
  lines: number;
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

/** Split a leading English article off a title. */
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
