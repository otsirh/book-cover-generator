export type PaletteId =
  | 'parchment'
  | 'bauhaus'
  | 'mint'
  | 'blush'
  | 'sky'
  | 'sand'
  | 'lilac'
  | 'citrus'
  | 'mustard'
  | 'tangerine'
  | 'mono'
  | 'clean'
  | 'riso'
  | 'pastel'
  | 'sage'
  | 'midnight'
  | 'noir'
  | 'forest'
  | 'wine'
  | 'deepsea'
  | 'synth'
  | 'ink'
  | 'rust'
  | 'cobalt'
  | 'teal'
  | 'oxblood'
  | 'thriller'
  | 'dusk';

export interface Palette {
  readonly id: string;
  readonly name: string;
  /** Background, as hex. */
  readonly bg: string;
  /** Text colour with strong contrast against `bg`. */
  readonly ink: string;
  readonly accents: readonly string[];
  /** `true` for dark backgrounds. */
  readonly dark?: boolean;
}

/** The built-in palettes, then any added with `registerPalette`. */
export declare const palettes: readonly (Palette & { readonly id: PaletteId | (string & {}) })[];
