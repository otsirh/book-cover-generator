// The types of book-cover-generator/element from npm: the class, and the tag in
// `document.createElement('book-cover')`'s types.
import { BookCover } from './element-types.js';

export { BookCover };

declare global {
  interface HTMLElementTagNameMap {
    'book-cover': BookCover;
  }
}
