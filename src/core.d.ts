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
  pick<T>(arr: readonly T[]): T;
  /** A shuffled copy. */
  shuffle<T>(arr: readonly T[]): T[];
}

export declare function hashString(input: unknown): number;
export declare function createRng(seed: unknown): Rng;

export declare function clamp(v: number, lo: number, hi: number): number;
export declare function lerp(a: number, b: number, t: number): number;
export declare function smoothstep(e0: number, e1: number, x: number): number;

export declare function isHex(v: unknown): v is string;
export declare function hexToRgb(hex: string): [number, number, number];
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

export type Noise2D = (x: number, y: number) => number;
export declare function makeNoise2D(rng: Rng): Noise2D;
export declare function fbm(noise: Noise2D, x: number, y: number, octaves?: number): number;
/** Midpoint-displacement ridge line with values in `[-1, 1]`. */
export declare function ridge(rng: Rng, segments?: number, roughness?: number): number[];

/** Round to one decimal place. */
export declare function n(v: number): number;
export declare function stripInvalidXml(str: unknown): string;
export declare function escapeXml(str: unknown): string;

export declare function rect(x: number, y: number, w: number, h: number, fill: string, extra?: string): string;
export declare function circle(cx: number, cy: number, r: number, fill: string, extra?: string): string;
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
export declare function path(d: string, fill: string, extra?: string): string;
/** Path for a quarter disc filling the square (x, y, size), centred on its bottom-left corner. */
export declare function quarterDisc(x: number, y: number, size: number): string;
/** Path for a half disc standing on the bottom edge of the square (x, y, size). */
export declare function halfDisc(x: number, y: number, size: number): string;

export interface GrainOptions {
  opacity?: number;
  light?: boolean;
  freq?: number;
  /** Filter id suffix, when a cover needs more than one grain filter. Default `'grain'`. */
  id?: string;
  /** Noise seed, so two grain layers don't line up. Default 0. */
  seed?: number;
}
export declare function grain(
  c: { id(name: string): string; readonly u: number; readonly W: number; readonly H: number },
  opts?: GrainOptions,
): { defs: string; layer: string };
export declare function shadowFilter(
  id: string,
  u: number,
  opts?: { blur?: number; dy?: number; opacity?: number },
): string;
export declare function blurFilter(id: string, std: number): string;

/** `[offset 0–1, colour, opacity?]` */
export type GradientStop = readonly [offset: number, color: string, opacity?: number];
export declare function linearGradient(
  id: string,
  stops: readonly GradientStop[],
  vector?: { x1?: number; y1?: number; x2?: number; y2?: number },
): string;
export declare function radialGradient(
  id: string,
  stops: readonly GradientStop[],
  geometry?: { cx?: number; cy?: number; r?: number; fx?: number; fy?: number },
): string;
