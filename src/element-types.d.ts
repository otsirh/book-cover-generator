/**
 * `<book-cover>`: a cover on any page, drawn from the element's attributes. Importing this module
 * defines the element (outside a browser, such as in Node, it loads and defines nothing). See
 * `BookCover` for its attributes and events.
 *
 * ```html
 * <script type="module" src="https://covers.otsirh.dev/src/element.js"></script>
 *
 * <book-cover cover-title="Dune" author="Frank Herbert" cover-style="retro"></book-cover>
 * <!-- drawn once it comes near the viewport, as a lazy image is -->
 * <book-cover cover-title="Emma" author="Jane Austen" loading="lazy"></book-cover>
 * ```
 *
 * ```js
 * // Or from a module (Deno, or a bundler):
 * import '@otsirh/book-cover-generator/element';
 * ```
 *
 * @module
 */

import type { CoverOptions, createCover } from './index.js';

// (The class alone: Deno and JSR use these types, as a package there may not declare global ones.
// element.d.ts adds the tag to `document.createElement`'s types for TypeScript from npm.)

/**
 * `<book-cover>`: a cover on any page, from its attributes (cover-title, author, subtitle, series,
 * credit, badge, cover-style, genre, palette, seed, format, font, case, texture, variant, lang). It
 * fires `cover` (detail: the cover) when it draws, and `cover-error` (detail: the error) when the
 * attributes can't make one. With `loading="lazy"` it draws once it comes near the viewport, as an
 * image does; until then it holds the cover's shape and is named for screen readers.
 */
export declare class BookCover extends HTMLElement {
  /** The attributes it watches: those that make the cover, and `loading`. */
  static observedAttributes: string[];
  /** The cover drawn last, or null (before the first, or after an error). */
  cover: ReturnType<typeof createCover> | null;
  /** The cover's options, read from the attributes as the HTTP API reads a link. */
  options(): CoverOptions;
}
