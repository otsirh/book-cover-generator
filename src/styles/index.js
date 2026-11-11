import { minimal, typographic, bigtype, swiss } from './typographic.js';
import { bauhaus, split, blocks, concentric, stripes } from './geometric.js';
import { mosaic, halftone, topographic, flowfield, lowpoly, memphis, papercut, pixel } from './pattern.js';
import { landscape, waves, retro, constellation, orbit, silhouette, shelf, aurora } from './scenic.js';
import { classic, artdeco, sunburst, typewriter, engraved } from './vintage.js';
import { thriller, botanical, noir, blueprint } from './genre.js';

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
