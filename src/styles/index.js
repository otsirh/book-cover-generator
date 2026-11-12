import { minimal, typographic, bigtype, swiss } from './typographic.js';
import { bauhaus, split, blocks, concentric, stripes } from './geometric.js';
import { mosaic, halftone, topographic, flowfield, lowpoly, memphis, papercut, pixel } from './pattern.js';
import { landscape, waves, retro, constellation, orbit, silhouette, shelf, aurora } from './scenic.js';
import { classic, artdeco, sunburst, typewriter, engraved } from './vintage.js';
import { thriller, botanical, noir, blueprint } from './genre.js';
import { hollow, ribbon, crest, storybook, idea } from './genre-pack.js';

/** The genres a cover can be for, in the order the app lists them. */
export const genreList = [
  { id: 'literary', name: 'Literary' },
  { id: 'thriller', name: 'Thriller & crime' },
  { id: 'horror', name: 'Horror' },
  { id: 'romance', name: 'Romance' },
  { id: 'fantasy', name: 'Fantasy & sci-fi' },
  { id: 'children', name: 'Children’s' },
  { id: 'nonfiction', name: 'Non-fiction' },
];

/** The genres each built-in style suits. @type {Record<string, string[]>} */
export const builtInGenres = {
  bigtype: ['thriller', 'nonfiction'],
  minimal: ['literary', 'nonfiction'],
  typographic: ['literary'],
  swiss: ['nonfiction', 'literary'],
  thriller: ['thriller'],
  botanical: ['romance', 'literary'],
  noir: ['thriller', 'horror'],
  blueprint: ['nonfiction'],
  hollow: ['horror'],
  ribbon: ['romance'],
  crest: ['fantasy'],
  storybook: ['children'],
  idea: ['nonfiction'],
  artdeco: ['literary', 'romance'],
  classic: ['literary'],
  engraved: ['literary', 'fantasy'],
  sunburst: ['literary'],
  typewriter: ['literary', 'thriller'],
  landscape: ['literary', 'fantasy'],
  retro: ['fantasy'],
  silhouette: ['thriller', 'horror', 'fantasy'],
  constellation: ['fantasy', 'romance'],
  orbit: ['fantasy'],
  waves: ['literary', 'romance'],
  aurora: ['fantasy', 'romance'],
  shelf: ['literary', 'nonfiction'],
  bauhaus: ['nonfiction', 'children'],
  split: ['thriller', 'nonfiction'],
  blocks: ['children', 'nonfiction'],
  concentric: ['fantasy', 'nonfiction'],
  stripes: ['nonfiction', 'thriller'],
  papercut: ['children', 'literary'],
  halftone: ['thriller', 'nonfiction'],
  topographic: ['nonfiction', 'fantasy'],
  flowfield: ['literary', 'fantasy'],
  lowpoly: ['fantasy', 'thriller'],
  mosaic: ['children', 'literary'],
  memphis: ['children'],
  pixel: ['children', 'fantasy'],
};

/** All built-in cover styles, grouped by family, in display order. */
export const styleList = [
  // Typographic
  bigtype,
  minimal,
  typographic,
  swiss,
  // Genre
  thriller,
  botanical,
  noir,
  blueprint,
  hollow,
  ribbon,
  crest,
  storybook,
  idea,
  // Vintage
  artdeco,
  classic,
  engraved,
  sunburst,
  typewriter,
  // Scenic
  landscape,
  retro,
  silhouette,
  constellation,
  orbit,
  waves,
  aurora,
  shelf,
  // Geometric
  bauhaus,
  split,
  blocks,
  concentric,
  stripes,
  // Pattern
  papercut,
  halftone,
  topographic,
  flowfield,
  lowpoly,
  mosaic,
  memphis,
  pixel,
];
