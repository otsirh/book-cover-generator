/** The ids of the built-in palettes. */
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

/** A palette: a background, an ink colour for text, and accents. */
export interface Palette {
  /** Its id, as `createCover({ palette })` takes it. */
  readonly id: string;
  /** Its name as people read it, such as `'Midnight'`. */
  readonly name: string;
  /** Background, as hex. */
  readonly bg: string;
  /** Text colour with strong contrast against `bg`. */
  readonly ink: string;
  /** Accent colours, as hex (three in each built-in palette). */
  readonly accents: readonly string[];
  /** `true` for dark backgrounds. */
  readonly dark?: boolean;
}

/** The built-in palettes, then any added with `registerPalette`. */
export declare const palettes: readonly (Palette & { readonly id: PaletteId | (string & {}) })[];
