/**
 * The SVG, colour and noise helpers the built-in styles use, exported as `svgUtils`.
 *
 * @module
 */

/** Seeded pseudo-random number generator. */
export interface Rng {
  /** Next float in `[0, 1)`. */
  next(): number;
  /** Float in `[min, max)`. */
  float(min?: number, max?: number): number;
  /** Integer in `[min, max]` (inclusive). */
  int(min: number, max: number): number;
  /** `true` with probability `p`. */
  bool(p?: number): boolean;
  /** One of `arr`'s items, at random (undefined for an empty array). */
  pick<T>(arr: readonly T[]): T;
  /** A shuffled copy. */
  shuffle<T>(arr: readonly T[]): T[];
}

/** A 32-bit hash of `String(input)` (cyrb53, folded to 32 bits), as an unsigned integer. */
export declare function hashString(input: unknown): number;
/**
 * A seeded random number generator (mulberry32). The seed is hashed as a string, so the same seed
 * (42 or '42') always gives the same numbers.
 */
export declare function createRng(seed: unknown): Rng;

/** `v` kept within `lo`–`hi`. */
export declare function clamp(v: number, lo: number, hi: number): number;
/** Linear interpolation: `a` at `t = 0`, `b` at `t = 1` (`t` isn't clamped). */
export declare function lerp(a: number, b: number, t: number): number;
/** 0 at `e0` and below, 1 at `e1` and above, and a smooth S-curve in between. */
export declare function smoothstep(e0: number, e1: number, x: number): number;

/** Whether `v` is a hex colour string, `#rgb` or `#rrggbb` in any case (spaces at either end allowed). */
export declare function isHex(v: unknown): boolean;
/** A hex colour (`#rgb` or `#rrggbb`) as `[r, g, b]`, each 0–255. It isn't checked: see `isHex`. */
export declare function hexToRgb(hex: string): [number, number, number];
/** `[r, g, b]` as `#rrggbb`; each channel is rounded and clamped to 0–255. */
export declare function rgbToHex(rgb: readonly number[]): string;
/** Linear blend of two hex colours; `t = 0` is `a`, `t = 1` is `b`. */
export declare function mix(a: string, b: string, t: number): string;
/** WCAG relative luminance. */
export declare function luminance(hex: string): number;
/** WCAG contrast ratio, 1–21. */
export declare function contrast(a: string, b: string): number;
/** The candidate with the highest contrast against `bg`. */
export declare function readable(bg: string, candidates?: readonly string[]): string;
/** The colours text can always fall back to: the palette's ink and background, white and near-black. */
export declare function inkCandidates(p: { readonly ink: string; readonly bg: string }): string[];
/** Best text colour on `bg`: the palette's ink or background, or white / near-black. */
export declare function inkOn(bg: string, p: { readonly ink: string; readonly bg: string }): string;

/** A 2D noise function: a value between -1 and 1 for each point. */
export type Noise2D = (x: number, y: number) => number;
/** Smooth 2D value noise from `rng`: values between -1 and 1, changing over about one unit. */
export declare function makeNoise2D(rng: Rng): Noise2D;
/**
 * Fractal noise at (x, y): `octaves` layers of `noise` (default 4), each at twice the frequency and
 * half the weight of the one before, averaged by weight so it stays in the range of `noise`.
 */
export declare function fbm(noise: Noise2D, x: number, y: number, octaves?: number): number;
/** Midpoint-displacement ridge line with values in `[-1, 1]`. */
export declare function ridge(rng: Rng, segments?: number, roughness?: number): number[];

/** Round to one decimal place. */
export declare function n(v: number): number;
/**
 * `String(str)` without the characters XML 1.0 forbids: control characters other than tab, LF and
 * CR, U+FFFE, U+FFFF and lone surrogates.
 */
export declare function stripInvalidXml(str: unknown): string;
/**
 * `String(str)` made safe for SVG text and attribute values: the characters XML forbids dropped, and
 * `& < > " '` escaped.
 */
export declare function escapeXml(str: unknown): string;

/** A `<rect>`. Numbers are rounded to one decimal; `fill` and `extra` (raw attributes) are written as given. */
export declare function rect(x: number, y: number, w: number, h: number, fill: string, extra?: string): string;
/**
 * A `<circle>` (a negative radius is drawn as 0). Numbers are rounded to one decimal; `fill` and
 * `extra` are written as given.
 */
export declare function circle(cx: number, cy: number, r: number, fill: string, extra?: string): string;
/**
 * A `<line>` with a stroke `width` px wide. Numbers are rounded to one decimal; `stroke` and
 * `extra` are written as given.
 */
export declare function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  width: number,
  extra?: string,
): string;
/** `[[x, y], ...]` to a path `d` string. */
export declare function pathD(points: ReadonlyArray<readonly number[]>, close?: boolean): string;
/** A `<path>`; `d`, `fill` and `extra` (raw attributes) are written as given. */
export declare function path(d: string, fill: string, extra?: string): string;
/** Path for a quarter disc filling the square (x, y, size), centred on its bottom-left corner. */
export declare function quarterDisc(x: number, y: number, size: number): string;
/** Path for a half disc standing on the bottom edge of the square (x, y, size). */
export declare function halfDisc(x: number, y: number, size: number): string;

/** Options for `grain`. */
export interface GrainOptions {
  /** The layer's opacity, 0–1. Default 0.12. */
  opacity?: number;
  /** White specks instead of black. Default `false`. */
  light?: boolean;
  /**
   * The noise's base frequency for a short side of 600 px (it is divided by `u`, so the grain
   * scales with the cover). Default 0.75.
   */
  freq?: number;
  /** Filter id suffix, when a cover needs more than one grain filter. Default `'grain'`. */
  id?: string;
  /** Noise seed, so two grain layers don't line up. Default 0. */
  seed?: number;
}
/**
 * A film-grain overlay: a `<filter>` for the cover's `<defs>` (`defs`), and a rectangle the size
 * of the cover drawn with it (`layer`). `c` is the style's context.
 */
export declare function grain(
  c: { id(name: string): string; readonly u: number; readonly W: number; readonly H: number },
  opts?: GrainOptions,
): { defs: string; layer: string };
/**
 * The film grain a cover's `texture` lays over it (and a print cover's back and spine): dark and
 * light specks, from different noise, so it shows on any colour. Its `<defs>` and layers, as markup.
 */
export declare function filmGrain(c: {
  id(name: string): string;
  readonly u: number;
  readonly W: number;
  readonly H: number;
}): string;
/**
 * A soft drop-shadow `<filter>` with this id: the shape over its shadow, blurred by `blur` (a
 * standard deviation) and moved down by `dy`, both times `u`, at `opacity` (defaults 4, 2 and 0.35),
 * in a region `margin` of the shape's size larger on every side (default 0.2).
 */
export declare function shadowFilter(
  id: string,
  u: number,
  opts?: { blur?: number; dy?: number; opacity?: number; margin?: number },
): string;
/**
 * A Gaussian-blur `<filter>` with this id and standard deviation `std` (px), with room around the
 * shape for the blur. Given the cover's `canvas` size, the filter's region is the cover and 3 × `std`
 * around it instead (in user space): for a blurred group that spans the cover, which then costs a
 * renderer less memory than room around the group's own box.
 */
export declare function blurFilter(
  id: string,
  std: number,
  canvas?: { width: number; height: number; x?: number; y?: number },
): string;

/** `[offset 0–1, colour, opacity?]` */
export type GradientStop = readonly [offset: number, color: string, opacity?: number];
/**
 * A `<linearGradient>` with this id. The vector is in fractions of the shape's box: top to bottom
 * by default (`x1` 0, `y1` 0, `x2` 0, `y2` 1).
 */
export declare function linearGradient(
  id: string,
  stops: readonly GradientStop[],
  vector?: { x1?: number; y1?: number; x2?: number; y2?: number },
): string;
/**
 * A `<radialGradient>` with this id: centre (`cx`, `cy`) and radius `r` in fractions of the
 * shape's box (0.5 each by default), and the focal point (`fx`, `fy`) if given.
 */
export declare function radialGradient(
  id: string,
  stops: readonly GradientStop[],
  geometry?: { cx?: number; cy?: number; r?: number; fx?: number; fy?: number },
): string;
