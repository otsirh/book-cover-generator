/* @ts-self-types="./element.d.ts" */
// <book-cover>: a cover on any page, from its attributes.
//
//   <script type="module" src="https://covers.otsirh.dev/src/element.js"></script>
//   <book-cover cover-title="Dune" author="Frank Herbert" cover-style="retro"></book-cover>
//
// Attributes: cover-title and cover-style (`title` and `style` are HTML's own: a tooltip, the
// element's CSS), author, subtitle, series, credit, badge, genre, palette, seed, format (paperback,
// ebook, square or 1600x2560), font, case, texture (present: on), variant (as in the app's links:
// scene.forest) and lang (the language of the text, as on any element). The cover
// is drawn as an image (so pages with Trusted Types can show it: the page's CSP must allow data:
// images), sized by the element's width (240px unless styled).

import { createCover } from './index.js';
import { svgToDataUrl } from './browser.js';
import { LINK, optionsFromLink } from './link.js';

/** The attributes that draw the cover, and the link parameter each is. */
const ATTRIBUTES = /** @type {const} */ ({
  'cover-title': 'title',
  author: 'author',
  subtitle: 'subtitle',
  series: 'series',
  credit: 'credit',
  badge: 'badge',
  'cover-style': 'style',
  genre: 'genre',
  palette: 'palette',
  seed: 'seed',
  format: 'format',
  font: 'font',
  case: 'case',
  variant: 'variant',
  lang: 'lang',
});

const CSS =
  ':host{display:inline-block;width:240px;vertical-align:top}:host([hidden]){display:none}' +
  'img{display:block;width:100%;height:auto}';
/** The element's styles as a constructed sheet: a page whose CSP allows no inline styles still applies it. */
const sheet =
  typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype
    ? (() => {
        const made = new CSSStyleSheet();
        made.replaceSync(CSS);
        return made;
      })()
    : null;

// (In Node there is no HTMLElement: the module still loads, and defines nothing.)
const Base = /** @type {typeof HTMLElement} */ (typeof HTMLElement === 'undefined' ? class {} : HTMLElement);

export class BookCover extends Base {
  static observedAttributes = [...Object.keys(ATTRIBUTES), 'texture'];

  /** The cover drawn last (null before the first, or after an error). @type {ReturnType<typeof createCover> | null} */
  cover = null;
  /** @type {HTMLImageElement} */
  #img;
  #queued = false;
  /** Drawn once connected: until then, attributes set (or present when upgraded) wait for it. */
  #ready = false;
  /** The options last drawn, to skip drawing them again. */
  #drawn = '';

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    if (sheet && 'adoptedStyleSheets' in root) root.adoptedStyleSheets = [sheet];
    else {
      const style = document.createElement('style');
      style.textContent = CSS;
      root.append(style);
    }
    this.#img = document.createElement('img');
    this.#img.decoding = 'async';
    this.#img.setAttribute('part', 'image');
    root.append(this.#img);
  }

  connectedCallback() {
    this.#ready = true;
    this.#render();
  }

  attributeChangedCallback() {
    // (Several attributes set at once draw once; an element upgraded on the page draws once, when
    // it connects.)
    if (!this.#ready || this.#queued || !this.isConnected) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#render();
    });
  }

  /** The cover's options, read from the attributes as the HTTP API reads a link. */
  options() {
    const q = new URLSearchParams();
    for (const [attribute, key] of Object.entries(ATTRIBUTES)) {
      const value = this.getAttribute(attribute);
      if (value != null) q.set(key, value);
    }
    // (Present is on, as a boolean attribute; 0 and false, as links write them, are off.)
    const texture = this.getAttribute('texture');
    if (texture !== null) q.set('texture', LINK.texture(texture) === false ? '0' : '1');
    return optionsFromLink(q);
  }

  #render() {
    try {
      const options = this.options();
      // (Moved or reconnected with the same attributes: the cover stands.)
      const key = JSON.stringify(options);
      if (this.cover && key === this.#drawn) return;
      this.#drawn = key;
      this.cover = createCover(options);
      this.#img.src = svgToDataUrl(this.cover.svg);
      this.#img.alt = this.cover.author
        ? `Cover: ${this.cover.title.replace(/\n/g, ' ')} by ${this.cover.author}`
        : `Cover: ${this.cover.title.replace(/\n/g, ' ')}`;
      this.dispatchEvent(new CustomEvent('cover', { detail: this.cover }));
    } catch (err) {
      this.cover = null;
      this.#drawn = '';
      this.#img.removeAttribute('src');
      this.#img.alt = '';
      this.dispatchEvent(new CustomEvent('cover-error', { detail: err }));
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('book-cover')) {
  customElements.define('book-cover', BookCover);
}
