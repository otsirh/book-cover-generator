import type { CoverOptions, createCover } from './index.js';

/**
 * `<book-cover>`: a cover on any page, from its attributes (cover-title, author, subtitle, series,
 * credit, badge, cover-style, genre, palette, seed, format, font, case, texture, variant, lang). It
 * fires `cover` (detail: the cover) when it draws, and `cover-error` (detail: the error) when the
 * attributes can't make one. With `loading="lazy"` it draws once it comes near the viewport, as an
 * image does; until then it holds the cover's shape and is named for screen readers.
 *
 * (The class alone: Deno and JSR use these types, as a package there may not declare global ones.
 * element.d.ts adds the tag to `document.createElement`'s types for TypeScript from npm.)
 */
export declare class BookCover extends HTMLElement {
  static observedAttributes: string[];
  /** The cover drawn last, or null (before the first, or after an error). */
  cover: ReturnType<typeof createCover> | null;
  /** The cover's options, read from the attributes as the HTTP API reads a link. */
  options(): CoverOptions;
}
