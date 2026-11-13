import {
  createCover,
  listStyles,
  palettes,
  randomSeed,
  version,
  formats,
  sizeLimits,
  FONTS,
  createMockup,
  parseBookList,
  optionsForBook,
  genres,
  createPrintCover,
  trimSizes,
  printLimits,
} from '../src/index.js';
import {
  svgToDataUrl,
  downloadCover,
  downloadBlob,
  copyText,
  copyImage,
  canCopyImage,
  rasterize,
  zipFiles,
  extensionOf,
  svgToPdf,
  svgToBlob,
} from '../src/browser.js';
import { hashString, contrast } from '../src/core.js';
import { customColors, slug, familyName } from '../src/shared.js';
import {
  LINK_FIELDS,
  fits,
  lastValues,
  writeLink,
  customPalette,
  variantOf,
  readDesign,
  pinsOf,
  designOptions,
  wholeDesign,
  sizeOfFormat,
} from '../src/link.js';
import { registerServiceWorker } from './offline.js';

/** @typedef {keyof typeof formats} Preset */
/**
 * @typedef {object} Design  Everything that defines a cover; mirrored in the URL.
 * @property {string} title
 * @property {string} author
 * @property {string} subtitle
 * @property {string} series    a series line above the title
 * @property {string} credit    a credit under the subtitle ("Translated by …")
 * @property {string} badge     a seal set in a corner ("Bestseller")
 * @property {string} style
 * @property {string} variant   the style's choices pinned, as name.value pairs joined by '-' ('scene.forest')
 * @property {string} font      the title's font (a FONTS key), or '' for the style's
 * @property {string} case      the title 'upper', 'normal' (as typed), or '' as the style sets it
 * @property {string} palette   a palette id, 'auto', or your own colours ('custom-0b132b-f8f9fa-ff6b6b-…')
 * @property {string} seed      '' means "from the title"
 * @property {string} format    a preset, or a size in px ('1600x2560')
 * @property {boolean} texture
 * @property {string} lang      the text's language tag ('tr', 'zh-Hant'), or '' to leave it to the text
 */
/** @typedef {{ design: Design, svg: string }} Kept  a kept design, and the cover as it was drawn then ('' if unknown) */
/** @typedef {{ button: HTMLButtonElement, img: HTMLImageElement, visible: boolean, dirty: boolean }} Tile  visible: on screen or close to it */

/** The preset formats (the library's, as the CLI's --format has them too). */
const FORMATS = formats;
const MAX_SIDE = sizeLimits.max;
/** iPhones and iPads draw a canvas of at most about 16.7 million pixels; other browsers far more. */
const CANVAS_PIXELS =
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
    ? 16_777_216
    : Infinity;
/** Pixels per inch recorded in PNG and JPEG downloads, so print software sizes them right. */
const DPI = 300;
const STYLES = listStyles();
const STYLE_IDS = STYLES.map((s) => s.id);
/** @type {Set<string>} */
const PALETTE_IDS = new Set(['auto', ...palettes.map((p) => p.id)]);
/**
 * First-time visitors start on a sample book in a style, palette and variation that suit it (the
 * README's sheet, scripts/preview.js, pairs them the same way).
 * @type {{ title: string, author: string, style: string, palette: string, seed: string }[]}
 */
const STARTERS = [
  { title: 'The Lighthouse Keeper', author: 'Mara Ellison', style: 'artdeco', palette: 'midnight', seed: 's1' },
  { title: 'Signal Lost', author: 'R. M. Price', style: 'thriller', palette: 'thriller', seed: 's9' },
  { title: 'The Glass Orchard', author: 'Theo Vance', style: 'botanical', palette: 'sage', seed: 's6' },
  { title: 'Neon Tide', author: 'Kai Moreno', style: 'bigtype', palette: 'riso', seed: 's2' },
  { title: 'Small Gods of Winter', author: 'Ines Calder', style: 'constellation', palette: 'deepsea', seed: 's4' },
  { title: 'Bright Machines', author: 'Yuki Tanaka', style: 'bauhaus', palette: 'bauhaus', seed: 's5' },
  { title: 'Salt and Static', author: 'J. R. Okafor', style: 'swiss', palette: 'mint', seed: 's7' },
  { title: 'Hollow Season', author: 'Sam Whitlock', style: 'silhouette', palette: 'dusk', seed: 's8' },
  { title: 'The Last Cartographer', author: 'Elias Brandt', style: 'engraved', palette: 'oxblood', seed: 's12' },
  { title: 'Under Paper Skies', author: 'Noor Haddad', style: 'papercut', palette: 'pastel', seed: 's10' },
  { title: 'Midnight Arithmetic', author: 'Ada Lindqvist', style: 'blueprint', palette: 'cobalt', seed: 's11' },
  { title: 'A Map of Quiet Places', author: 'Lena Hart', style: 'retro', palette: 'synth', seed: 's3' },
];
const KEEP_KEY = 'book-cover-generator:kept';
const SHORTCUTS_KEY = 'book-cover-generator:shortcuts';
const GENRE_KEY = 'book-cover-generator:genre';
/** @type {Record<string, string>} */
const LETTER_CODES = { KeyR: 'r', KeyZ: 'z', KeyY: 'y', KeyK: 'k' };
const MAX_KEPT = 100;
/** A kept cover's SVG is stored with it up to this length (the largest styles are about 100 KB). */
const MAX_SNAPSHOT = 400_000;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
/** @template T @param {readonly T[]} arr @returns {T} */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** @template T @param {readonly T[]} arr @param {T} current @returns {T} */
const pickOther = (arr, current) => pick(arr.filter((x) => x !== current));

/** A format that is a size of its own, not a preset. @param {string} format */
const isCustomSize = (format) => !Object.hasOwn(FORMATS, format);
/** A format's cover size in px. @param {string} format @returns {readonly [number, number]} */
function sizeOf(format) {
  return sizeOfFormat(format);
}

/** The five colours the editor shows: background, text and three accents (repeating the ones given). @param {string[]} colors */
const fiveColors = (colors) => [colors[0], colors[1], ...[0, 1, 2].map((i) => colors[2 + (i % (colors.length - 2))])];
/** A built-in palette's colours, as the editor shows them. @param {string} id */
function colorsOf(id) {
  const p = palettes.find((x) => x.id === id) ?? palettes[0];
  return fiveColors([p.bg, p.ink, ...p.accents]);
}

/**
 * Tiny element builder (no innerHTML, so the page works under Trusted Types).
 * @param {string} tag
 * @param {Record<string, unknown>} [props]
 * @param {...(Node | string)} children
 */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role') node.setAttribute(key, String(value));
    else /** @type {any} */ (node)[key] = value;
  }
  node.append(...children);
  return node;
}

/** @type {Design} */
const design = {
  ...pick(STARTERS),
  subtitle: '',
  series: '',
  credit: '',
  badge: '',
  variant: '',
  font: '',
  case: '',
  format: 'paperback',
  texture: false,
  lang: '',
};
const ui = {
  /** Export scale for the preset formats, and for custom sizes (whose 1× is the size asked for). */
  scale: 2,
  customScale: 1,
  lockStyle: false,
  lockPalette: false,
  shortcuts: true,
  /** The last custom colours and size, so Custom brings them back. @type {string[] | null} */
  colors: null,
  /** The genre the rail shows (and Randomize picks from); '' for all. Kept from the last visit. */
  genre: savedGenre(),
  size: '1600x2560',
};
/** @type {ReturnType<typeof createCover>} */
let current;

/* ------------------------------------------------------------ URL & history */

/** A title as one line, for labels and file names. @param {string} title */
const oneLine = (title) => title.replace(/\s*\n\s*/g, ' ').trim();

/** The design's fields, as links name them (src/link.js). */
const FIELDS = /** @type {Record<keyof Design, import('../src/link.js').Field>} */ (LINK_FIELDS);
const KEYS = /** @type {(keyof Design)[]} */ (Object.keys(FIELDS));

/** Validate a design-like object (from the URL, storage or a file); unknown values are dropped. @param {Record<string, unknown>} raw */
function sanitize(raw) {
  return /** @type {Partial<Design>} */ (readDesign(raw));
}

/** @param {string} hash */
function fromHash(hash) {
  // (The last value of a repeated key, as the API reads it; own properties only, even for __proto__.)
  return sanitize(lastValues(new URLSearchParams(hash.replace(/^#/, ''))));
}

/** @param {Design} d */
function toHash(d) {
  return `#${writeLink(d)}`;
}

/**
 * A link to share a design: its settings in the query (/?title=…), so the page it opens has the
 * design's own link preview (a #fragment never reaches the server); the app moves them to the
 * #fragment as it opens.
 * @param {Design} d
 */
function shareLink(d) {
  // (Only the pins its style has, as imageLink: the link preview draws it with the API.)
  return new URL(`/?${writeLink({ ...d, variant: variantOf(pinsFor(d.variant, d.style)) })}`, location.href).href;
}

/**
 * The site's HTTP API URL that draws a design (see worker/index.js): its link, as a query.
 * Only the pins its style has, so a pin left from another style can't make it an error.
 * @param {Design} d
 */
function imageLink(d) {
  const hash = toHash({ ...d, variant: variantOf(pinsFor(d.variant, d.style)) });
  return new URL(`/api/cover.svg?${hash.slice(1)}`, location.href).href;
}

/** A version's major and minor number, or null. @param {string | null} v */
function minorOf(v) {
  const m = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(v ?? '');
  return m ? Number(m[1]) * 1000 + Number(m[2]) : null;
}

/** Say so when a link was made with an earlier minor version, which may have drawn it differently. @param {string} hash */
function noteVersion(hash) {
  const made = lastValues(new URLSearchParams(hash.replace(/^#/, ''))).v ?? null;
  const then = minorOf(made);
  const now = minorOf(version);
  if (then !== null && now !== null && then < now) {
    toast(`Made with version ${made}: this version may draw it a little differently`);
  }
}

// Undo and Redo step through this tab's designs within the page. The browser's history keeps a
// single entry for the app, whose URL holds the design as it is now: Back leaves the site, and a
// reload or a copied address opens the same design. A burst of typing is one step. The steps
// survive a reload (in sessionStorage, which is the tab's own).
const STEPS_KEY = 'book-cover-generator:steps';
/** The most steps kept: the oldest go first. */
const MAX_STEPS = 100;
/** The designs Undo and Redo step through, oldest first. @type {Design[]} */
let steps = [];
/** The step on show. */
let stepIndex = 0;

/** The keys every link names; one that names them all is a whole design. */
const WHOLE_KEYS = KEYS.filter((key) => !FIELDS[key].optional);

let typing = false;
/** The field of the current typing burst: typing in another field starts a new step. */
let typingField = '';
/** @type {ReturnType<typeof setTimeout> | undefined} */
let typingTimer;

/** Times of recent history writes. Safari allows about 100 in 30 s; typing slows down well before. */
/** @type {number[]} */
const recentWrites = [];
const REPLACE_MS = 300;

/**
 * Write to the history, ignoring the SecurityError browsers throw when pages
 * update history too often (the design still updates; only that write is lost).
 * @param {() => void} write
 */
function safely(write) {
  const now = performance.now();
  // (Keep only the last 30 s, pruned here so a long session without typing can't pile them up.)
  const cut = recentWrites.findIndex((time) => now - time <= 30_000);
  recentWrites.splice(0, cut === -1 ? recentWrites.length : cut);
  recentWrites.push(now);
  try {
    write();
    return true;
  } catch {
    return false;
  }
}

/** How long to wait between writes to the URL: longer once many were made recently. */
function replaceInterval() {
  const now = performance.now();
  return recentWrites.filter((time) => now - time <= 30_000).length > 40 ? 2000 : REPLACE_MS;
}

/** Whether the URL holds this fragment (compared as parameters, whatever the encoding). @param {string} hash */
const urlHolds = (hash) =>
  new URLSearchParams(location.hash.slice(1)).toString() === new URLSearchParams(hash.slice(1)).toString();

/** @type {ReturnType<typeof setTimeout> | undefined} */
let urlTimer;
/** The URL (or the stored steps) may be behind the design. */
let urlDirty = false;

/** Save the steps for this tab: a reload of it, or Back to it, goes on from them (restoreSteps). */
function saveSteps() {
  try {
    sessionStorage.setItem(STEPS_KEY, JSON.stringify({ steps, index: stepIndex }));
  } catch {
    // Storage blocked or full: Undo starts afresh after a reload.
  }
}

/** Write the design to the URL and the steps to the tab's storage, now. */
function flushUrl() {
  const hash = toHash(design);
  // A write can be refused (rate-limited browsers throw) or ignored silently (Chrome): checked, so
  // the timer tries again.
  urlDirty = !urlHolds(hash) && !(safely(() => history.replaceState(null, '', hash)) && urlHolds(hash));
  saveSteps();
}

/** Make the write that is waiting, then wait a while before the next one. */
function tickUrl() {
  urlTimer = undefined;
  if (!urlDirty) return;
  flushUrl();
  urlTimer = setTimeout(tickUrl, urlDirty ? 1000 : replaceInterval());
}

/**
 * Keep the URL up with the design: at once for a new step, and while typing at most every
 * REPLACE_MS (less often after many writes: browsers rate-limit them).
 * @param {boolean} [keystroke] a keystroke within a typing burst
 */
function writeUrl(keystroke = false) {
  urlDirty = true;
  if (keystroke) {
    if (urlTimer === undefined) tickUrl();
    return;
  }
  flushUrl();
  if (urlDirty && urlTimer === undefined) urlTimer = setTimeout(tickUrl, 1000);
}

// Leaving or reloading the page: the steps are saved with the design as it is now (a reload's
// address may be a keystroke or two behind it). (pagehide and visibilitychange both come as a page
// is left; either saves.)
const leaving = () => {
  if (urlDirty) flushUrl();
  else saveSteps();
};
window.addEventListener('pagehide', leaving);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') leaving();
});

/** A new step for the design as it is now, after the one on show (any ahead of it are dropped). */
function commit() {
  // A discrete change ends any typing burst, so later keystrokes get their own step.
  typing = false;
  clearTimeout(typingTimer);
  steps.splice(stepIndex + 1, Infinity, { ...design });
  if (steps.length > MAX_STEPS) steps.splice(0, steps.length - MAX_STEPS);
  stepIndex = steps.length - 1;
  writeUrl();
  syncHistoryButtons();
}

/** @param {string} field the field being typed in */
function typed(field) {
  if (!typing) {
    commit();
    typing = true;
    typingField = field;
  } else {
    // Later keystrokes of the burst update its step (saved with the URL, and as the page is left).
    steps[stepIndex] = { ...design };
    writeUrl(true);
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    typing = false;
  }, 1200);
}

function syncHistoryButtons() {
  // aria-disabled rather than disabled: a focused button that becomes disabled drops keyboard
  // focus to the page. (Pressing it does nothing then: step() checks.)
  for (const id of ['undo', 'm-undo']) $(id).setAttribute('aria-disabled', String(stepIndex <= 0));
  $('redo').setAttribute('aria-disabled', String(stepIndex >= steps.length - 1));
}

/**
 * Undo (-1) or Redo (1): to the nearest step that shows another design, so every press changes
 * something (a burst of typing can end where it began).
 * @param {number} dir
 */
function step(dir) {
  typing = false;
  clearTimeout(typingTimer);
  const now = toHash(design);
  let i = stepIndex + dir;
  while (i >= 0 && i < steps.length && toHash(steps[i]) === now) i += dir;
  if (i < 0 || i >= steps.length) return;
  stepIndex = i;
  Object.assign(design, steps[i]);
  writeUrl();
  render({ fade: true, announce: true });
  syncHistoryButtons();
}

function undo() {
  step(-1);
}

function redo() {
  step(1);
}

/**
 * How this page was opened: 'reload', 'back_forward', 'navigate' (a link or an address), or '' where
 * the browser doesn't say.
 */
function openedBy() {
  try {
    const entry = /** @type {PerformanceNavigationTiming | undefined} */ (
      performance.getEntriesByType('navigation')[0]
    );
    return entry?.type ?? '';
  } catch {
    return '';
  }
}

/**
 * The steps saved for this tab. Reloaded, the app goes on as it was: the steps, and the design as it
 * last was (typed, maybe, after the address was last written). Come back to with Back or Forward at
 * the design it was left at, the same. Opened any other way (a link opened in the tab), its design is
 * a new step after the one that was on show.
 */
function restoreSteps() {
  /** @type {Design[]} */
  let saved = [];
  let index = -1;
  try {
    const raw = JSON.parse(sessionStorage.getItem(STEPS_KEY) || 'null');
    if (Array.isArray(raw?.steps) && raw.steps.length) {
      saved = raw.steps
        .slice(0, MAX_STEPS)
        .map((/** @type {unknown} */ d) =>
          complete(sanitize(d && typeof d === 'object' ? /** @type {Record<string, unknown>} */ (d) : {})),
        );
      index = Number.isInteger(raw.index) ? Math.min(Math.max(raw.index, 0), saved.length - 1) : saved.length - 1;
    }
  } catch {
    // Unreadable or blocked: a fresh start.
  }
  const how = openedBy();
  const leftHere = saved.length > 0 && toHash(saved[index]) === toHash(design);
  if (saved.length && (how === 'reload' || leftHere)) {
    steps = saved;
    stepIndex = index;
    Object.assign(design, saved[index]);
    return;
  }
  steps = saved.slice(0, index + 1);
  if (!steps.length || toHash(steps[steps.length - 1]) !== toHash(design)) steps.push({ ...design });
  if (steps.length > MAX_STEPS) steps.splice(0, steps.length - MAX_STEPS);
  stepIndex = steps.length - 1;
}

// The address changed within the page: an edited URL, a link pasted into the tab, a #place, or Back
// and Forward between those. What it names is a change like any other, and can be undone.
window.addEventListener('popstate', () => {
  // (Read first: the URL is rewritten as the design changes.)
  const hash = location.hash;
  const linked = fromHash(hash);
  if (Object.keys(linked).length) {
    // An edited URL changes just the keys it names; a pasted link names them all (and opens as it
    // would in a new tab). A link from before 1.2.0 names every key but the optional ones.
    // (Judged by the keys the URL names: an unknown value is dropped, but the link is still whole.)
    const named = new URLSearchParams(hash.slice(1));
    const whole = WHOLE_KEYS.every((key) => named.has(key));
    update(whole ? complete(linked) : linked);
    if (whole) noteVersion(hash);
  }
  // The URL holds the whole design again (a fragment that isn't one, such as #usage, keeps it).
  writeUrl();
});

/**
 * Apply a change and re-render.
 * @param {Partial<Design>} change
 * @param {'discrete' | 'typing'} [kind]
 */
function update(change, kind = 'discrete') {
  // Pinned choices belong to a style: another style starts with none.
  const restyled = change.style !== undefined && change.style !== design.style && !('variant' in change);
  const patch = restyled ? { ...change, variant: '' } : change;
  const changed = Object.entries(patch).some(([key, value]) => design[/** @type {keyof Design} */ (key)] !== value);
  if (!changed) return;
  const field = kind === 'typing' ? Object.keys(patch).join() : '';
  // A discrete change, or typing in another field, is a new step.
  if (kind === 'discrete' || field !== typingField) typing = false;
  Object.assign(design, patch);
  if (kind === 'typing') typed(field);
  else commit();
  render({ fade: kind === 'discrete', announce: kind === 'discrete' });
}

/* ------------------------------------------------------------------ render */

/** Cover options for a design. @param {Design} d @param {Partial<import('../src/index.js').CoverOptions>} [extra] */
function optionsFor(d, extra = {}) {
  const style = extra.style ?? d.style;
  return designOptions(d, STYLES.find((s) => s.id === style)?.variants ?? [], extra);
}

/** Cover options for the current design. @param {Partial<import('../src/index.js').CoverOptions>} [extra] */
const options = (extra = {}) => optionsFor(design, extra);

/**
 * A whole design from a partial one (a shared link, or a kept design saved by another
 * version). What it leaves out gets neutral, deterministic values, never the current
 * design's, so it always opens the same cover. A missing style follows from the title.
 * @param {Partial<Design>} partial
 * @returns {Design}
 */
function complete(partial) {
  return /** @type {Design} */ (wholeDesign(partial));
}

let lastAnnouncement = '';
let lastGalleryKey = '';
/** The style and pins the rail's current tile was last drawn with. */
let lastGalleryPins = '';
/** @type {ReturnType<typeof setTimeout> | undefined} */
let galleryTimer;

/** The app's links to the gallery page (site/gallery.js keeps the design they carry). */
const galleryLinks = /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('a[href^="/gallery/"]'));
/**
 * Keep the design in the gallery links, so its covers open your book: always, so a link opened
 * in a new tab, copied or long-pressed carries it as a click does.
 */
function linkGallery() {
  const href = `/gallery/${toHash(design)}`;
  for (const a of galleryLinks) if (a.getAttribute('href') !== href) a.setAttribute('href', href);
}

/** @param {{ fade?: boolean, announce?: boolean }} [opts] */
function render({ fade = false, announce = false } = {}) {
  applyShape();
  renderPreview(fade, announce);
  // The list's preview follows the design too (not its title and author, which the list replaces).
  const manyKey = JSON.stringify(lookOf(design));
  if (manyKey !== lastManyKey && /** @type {HTMLDetailsElement} */ ($('many')).open) {
    lastManyKey = manyKey;
    clearTimeout(manyTimer);
    manyTimer = setTimeout(renderMany, typing ? 250 : 0);
  }
  syncControls();
  syncKeep();
  markRail();
  linkGallery();
  // The print panel follows the design, when it's open.
  if (
    /** @type {HTMLDetailsElement} */ ($('print')).open &&
    JSON.stringify({ design, settings: printSettings() }) !== lastPrintKey
  ) {
    clearTimeout(printTimer);
    printTimer = setTimeout(renderPrint, typing ? 250 : 0);
  }
  // The gallery shows every style, so it only changes when something other than the style does;
  // pins are the current style's alone (a tile of another style is drawn as picking it would draw
  // it, without them), so a pin changes only the current style's tile.
  const key = JSON.stringify({ ...design, style: '', variant: '' });
  if (key !== lastGalleryKey) {
    lastGalleryKey = key;
    lastGalleryPins = `${design.style}|${design.variant}`;
    clearTimeout(galleryTimer);
    if (typing) galleryTimer = setTimeout(invalidateGallery, 200);
    else invalidateGallery();
  } else if (`${design.style}|${design.variant}` !== lastGalleryPins) {
    // (The style that had them, and the one that has them now.)
    const before = lastGalleryPins.split('|')[0];
    lastGalleryPins = `${design.style}|${design.variant}`;
    for (const style of new Set([before, design.style])) {
      const tile = tiles.get(style);
      if (tile) tile.dirty = true;
    }
    scheduleGallery();
  }
  const variantsKey = JSON.stringify(design);
  if (variantsKey !== lastVariantsKey) {
    lastVariantsKey = variantsKey;
    clearTimeout(variantsTimer);
    if (typing) variantsTimer = setTimeout(renderVariations, 200);
    else renderVariations();
  }
}

/**
 * The variants a design pins that `style` has (others are left out, as the library would refuse
 * them: a link may name ones for another style).
 * @param {string} variant @param {string} style @returns {Record<string, string>}
 */
function pinsFor(variant, style) {
  return pinsOf(variant, STYLES.find((s) => s.id === style)?.variants ?? []);
}

/** Give the preview and the thumbnails the cover's shape (as site/boot.js does before first paint). */
function applyShape() {
  const root = document.documentElement;
  const custom = isCustomSize(design.format);
  root.dataset.coverFormat = custom ? 'custom' : design.format;
  if (custom) {
    const [w, hgt] = sizeOf(design.format);
    root.style.setProperty('--cover-w', String(w));
    root.style.setProperty('--cover-h', String(hgt));
  } else {
    root.style.removeProperty('--cover-w');
    root.style.removeProperty('--cover-h');
  }
}

/* -------------------------------------------------------------- variations */

// Six other variations of the current design (same style and palette, other seeds), so the
// seed is something to look at and click, not only a text box.
const VARIANTS = 6;
/** @type {{ button: HTMLElement, img: HTMLImageElement, seed: string }[]} */
const variants = [];
/** Variations still to draw, with their new seeds. @type {[(typeof variants)[number], string][]} */
let variantQueue = [];
let lastVariantsKey = '';
/** @type {ReturnType<typeof setTimeout> | undefined} */
let variantsTimer;

function buildVariations() {
  const strip = $('variations');
  for (let k = 0; k < VARIANTS; k++) {
    const img = /** @type {HTMLImageElement} */ (h('img', { alt: '' }));
    const button = h('button', { type: 'button', className: 'variation' }, img);
    const variant = { button, img, seed: '' };
    // (Not before its thumbnail is drawn: it has no seed yet, and '' would mean "from the title".)
    button.addEventListener('click', () => {
      if (variant.seed) update({ seed: variant.seed });
    });
    variants.push(variant);
    strip.append(button);
  }
}

/**
 * Seeds for the strip, derived from the cover's (the library's, so a title typed with a stray
 * space keeps them): the same design always shows the same six.
 */
function variantSeeds() {
  return Array.from({ length: VARIANTS }, (_, k) => hashString(`${current.seed}|${k}`).toString(36).slice(0, 6));
}

/** Draw the next queued variation, giving its button the seed it now shows. */
const scheduleVariants = sliced(() => {
  const next = variantQueue.shift();
  if (!next) return false;
  const [variant, seed] = next;
  variant.img.src = svgToDataUrl(createCover(options({ seed })).svg);
  variant.seed = seed;
  variant.button.setAttribute('aria-label', `Variation ${seed}`);
  variant.button.title = `Variation ${seed}`;
  return true;
});

function renderVariations() {
  const seeds = variantSeeds();
  variantQueue = variants.map((variant, k) => [variant, seeds[k]]);
  scheduleVariants();
}

/** @param {boolean} fade @param {boolean} announce */
function renderPreview(fade, announce) {
  current = createCover(options());
  const style = STYLES.find((s) => s.id === current.style);
  const palette = palettes.find((p) => p.id === current.palette);
  const img = /** @type {HTMLImageElement} */ ($('preview'));
  const prev = /** @type {HTMLImageElement} */ ($('preview-prev'));
  if (fade && img.src && !reducedMotion.matches) {
    // Cross-fade: the old cover sits on top and fades out.
    prev.src = img.src;
    prev.classList.remove('fading');
    void prev.offsetWidth;
    prev.classList.add('fading');
  }
  img.src = svgToDataUrl(current.svg);
  // (After a pause while typing: it is a second full-size drawing.)
  clearTimeout(mockupTimer);
  mockupTimer = setTimeout(renderMockup, typing ? 300 : 0);
  const title = oneLine(design.title) || 'Untitled';
  img.alt = `Cover preview: “${title}”${design.author.trim() ? ` by ${design.author.trim()}` : ''}, ${style?.name} style`;
  const paletteName = `${palette?.name ?? 'Custom'}${design.palette === 'auto' ? ' (auto)' : ''}`;
  $('meta').replaceChildren(
    h('strong', {}, style?.name ?? current.style),
    ` · ${paletteName} · `,
    ...(design.seed ? ['variation ', h('code', {}, design.seed)] : ['variation from the title']),
  );
  $('style-name').textContent = style?.name ?? current.style;
  $('rail-note').textContent =
    design.palette === 'auto'
      ? 'Each in a palette picked for it. Click one to use it.'
      : `In ${palette?.name ?? 'your colours'}. Click one to use it.`;
  // Screen readers hear about style and palette changes, not every keystroke.
  const announcement = `Style: ${style?.name ?? current.style}. Palette: ${paletteName}.`;
  if (announce && lastAnnouncement && announcement !== lastAnnouncement) {
    // If the region still holds this text from before, change it anyway (a trailing no-break
    // space) so screen readers announce it again.
    const region = $('announce');
    region.textContent = region.textContent === announcement ? `${announcement}\u00A0` : announcement;
  }
  lastAnnouncement = announcement;
}

/* ---------------------------------------------------------------- controls */

function buildControls() {
  $('controls').addEventListener('submit', (e) => e.preventDefault());
  const value = (/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).value;
  $('title').addEventListener('input', (e) => update({ title: value(e) }, 'typing'));
  $('lang-clear').addEventListener('click', () => {
    update({ lang: '' });
    $('title').focus();
  });
  $('author').addEventListener('input', (e) => update({ author: value(e) }, 'typing'));
  $('subtitle').addEventListener('input', (e) => update({ subtitle: value(e) }, 'typing'));
  $('series').addEventListener('input', (e) => update({ series: value(e) }, 'typing'));
  $('credit').addEventListener('input', (e) => update({ credit: value(e) }, 'typing'));
  $('badge').addEventListener('input', (e) => update({ badge: value(e) }, 'typing'));
  $('seed').addEventListener('input', (e) => update({ seed: value(e).trim() }, 'typing'));
  $('texture').addEventListener('change', (e) =>
    update({ texture: /** @type {HTMLInputElement} */ (e.target).checked }),
  );

  const swatches = $('swatches');
  swatches.append(
    h(
      'button',
      { type: 'button', className: 'swatch auto', title: 'Auto: picked from the variation', 'data-palette': 'auto' },
      h('span', { className: 'sw-label' }, 'Auto'),
    ),
  );
  for (const p of palettes) {
    const dots = h('span', { className: 'sw-dots' }, ...p.accents.slice(0, 3).map(() => h('i')));
    const b = h(
      'button',
      { type: 'button', className: 'swatch', title: p.name, 'aria-label': p.name, 'data-palette': p.id },
      h('span', { className: 'sw-aa' }, 'Aa'),
      dots,
    );
    b.style.background = p.bg;
    b.style.color = p.ink;
    [...dots.children].forEach((dot, i) => {
      /** @type {HTMLElement} */ (dot).style.background = p.accents[i];
    });
    swatches.append(b);
  }
  swatches.append(
    h(
      'button',
      {
        type: 'button',
        className: 'swatch custom',
        title: 'Custom: your own colours',
        'aria-label': 'Custom colours',
        'data-palette': 'custom',
      },
      h('span', { className: 'sw-label' }, 'Custom'),
      h('span', { className: 'sw-dots' }, h('i'), h('i'), h('i')),
    ),
  );
  swatches.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-palette]');
    if (!(b instanceof HTMLElement) || !b.dataset.palette) return;
    if (b.dataset.palette !== 'custom') update({ palette: b.dataset.palette });
    // Your colours from last time, or the colours on the cover now, to start from.
    else if (!customColors(design.palette)) update({ palette: customPalette(ui.colors ?? colorsOf(current.palette)) });
  });
  for (const input of colorInputs()) {
    input.addEventListener('input', () =>
      update({ palette: customPalette(colorInputs().map((i) => i.value)) }, 'typing'),
    );
  }
  const showName = (/** @type {Event} */ e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-palette]');
    if (b instanceof HTMLElement) $('palette-name').textContent = b.title.split(':')[0];
  };
  swatches.addEventListener('pointerover', showName);
  swatches.addEventListener('focusin', showName);
  swatches.addEventListener('pointerleave', syncPaletteName);
  swatches.addEventListener('focusout', syncPaletteName);

  $('format').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-format]');
    if (!(b instanceof HTMLElement) || !b.dataset.format) return;
    if (b.dataset.format !== 'custom') update({ format: b.dataset.format });
    else if (!isCustomSize(design.format)) update({ format: ui.size });
  });
  const sizeInputs = /** @type {HTMLInputElement[]} */ ([$('size-w'), $('size-h')]);
  const typedSize = () => sizeInputs.map((input) => Number(input.value));
  for (const input of sizeInputs) {
    // The cover follows the size as it is typed, whenever it is one the library can make…
    input.addEventListener('input', () => {
      const [w, hgt] = typedSize();
      if (fits(w, hgt)) update({ format: `${w}x${hgt}` }, 'typing');
    });
    // …and a size it can't make is put back when the field is left.
    input.addEventListener('change', () => {
      const [w, hgt] = typedSize();
      if (fits(w, hgt)) return;
      syncSize(true);
      const { min, max, ratio } = sizeLimits;
      fail(`Sizes go from ${min} to ${max.toLocaleString('en')} px, at most ${ratio} times as tall as wide`);
    });
  }
  $('size-preset').addEventListener('change', (e) => {
    const size = /** @type {HTMLSelectElement} */ (e.target).value;
    if (size) update({ format: size });
  });
  $('scale').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-scale]');
    if (!(b instanceof HTMLElement) || !b.dataset.scale || b.getAttribute('aria-disabled') === 'true') return;
    if (isCustomSize(design.format)) ui.customScale = Number(b.dataset.scale);
    else ui.scale = Number(b.dataset.scale);
    syncControls();
  });

  $('style-variants').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-variant]');
    if (!(b instanceof HTMLElement)) return;
    const pins = pinsFor(design.variant, design.style);
    const name = b.dataset.variant ?? '';
    if (b.dataset.value) pins[name] = b.dataset.value;
    else delete pins[name];
    update({ variant: variantOf(pins) });
  });
  // Each font named in itself (where the browser draws menus with page styles).
  const fontMenu = /** @type {HTMLSelectElement} */ ($('title-font'));
  for (const option of fontMenu.options) {
    const font = FONTS[/** @type {keyof typeof FONTS} */ (option.value)];
    if (font) option.style.fontFamily = font.family;
  }
  fontMenu.addEventListener('change', () => update({ font: fontMenu.value }));
  $('title-case').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-case]');
    if (b instanceof HTMLElement) update({ case: b.dataset.case ?? '' });
  });
  $('prev-style').addEventListener('click', () => stepStyle(-1));
  $('next-style').addEventListener('click', () => stepStyle(1));
  $('dice-style').addEventListener('click', () => update({ style: otherStyle() }));
  $('dice-palette').addEventListener('click', () =>
    update({ palette: pickOther([...PALETTE_IDS].slice(1), design.palette) }),
  );
  $('dice-seed').addEventListener('click', () => update({ seed: randomSeed() }));
  for (const [id, key] of /** @type {const} */ ([
    ['lock-style', 'lockStyle'],
    ['lock-palette', 'lockPalette'],
  ])) {
    $(id).addEventListener('click', () => {
      ui[key] = !ui[key];
      $(id).setAttribute('aria-pressed', String(ui[key]));
    });
  }
  $('randomize').addEventListener('click', randomizeAll);
  $('m-randomize').addEventListener('click', randomizeAll);
  $('undo').addEventListener('click', undo);
  $('m-undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('m-prev-style').addEventListener('click', () => stepStyle(-1));
  $('m-next-style').addEventListener('click', () => stepStyle(1));
  // The sample title a first-time visitor sees is selected on first focus, so typing replaces it.
  const titleField = /** @type {HTMLTextAreaElement} */ ($('title'));
  titleField.addEventListener(
    'focus',
    () => {
      if (!sampleTitle || titleField.value !== sampleTitle) return;
      titleField.select();
      // (A click would put the caret where it lands, after focus: not this once.)
      titleField.addEventListener('mouseup', (e) => e.preventDefault(), { once: true });
    },
    { once: true },
  );

  const copyImageButton = /** @type {HTMLButtonElement} */ ($('copy-image'));
  copyImageButton.hidden = !canCopyImage();
  copyImageButton.addEventListener('click', () =>
    busyWhile(copyImageButton, async () => {
      const [w, hgt] = sizeOf(design.format);
      const scale = scaleFor(design.format);
      try {
        await copyImage(current.svg, { scale });
        toast(`Image copied · ${Math.round(w * scale)} × ${Math.round(hgt * scale)} px`);
      } catch (err) {
        console.warn(err);
        fail('Could not copy the image. Try Download PNG.');
      }
    }),
  );
  const shareButton = /** @type {HTMLButtonElement} */ ($('share'));
  shareButton.hidden = !canShareFiles();
  shareButton.addEventListener('click', () => busyWhile(shareButton, shareCover));
  $('copy-svg').addEventListener('click', async () => {
    try {
      await copyText(current.svg);
      toast('SVG copied to the clipboard');
    } catch {
      fail('Could not access the clipboard');
    }
  });
  $('copy-link').addEventListener('click', async () => {
    try {
      // From the design itself: a history write the browser refused would leave the URL behind.
      await copyText(shareLink(design));
      toast('Link copied: it opens this exact design');
    } catch {
      fail('Could not access the clipboard');
    }
  });
  $('copy-image-link').addEventListener('click', async () => {
    try {
      await copyText(imageLink(design));
      toast('Embed link copied: it draws this design as an SVG, on any page');
    } catch {
      fail('Could not access the clipboard');
    }
  });
  for (const format of /** @type {const} */ (['svg', 'png', 'jpeg', 'webp'])) {
    const button = /** @type {HTMLButtonElement} */ ($(`dl-${format}`));
    button.addEventListener('click', () => exportAs(format, button));
  }
  // The main download: PNG, or JPEG for an eBook (which KDP takes, and PNG not).
  for (const id of ['download', 'm-download']) {
    const button = /** @type {HTMLButtonElement} */ ($(id));
    button.addEventListener('click', () => exportAs(mainFormat(design.format), button));
  }
  const mockupKind = /** @type {HTMLSelectElement} */ ($('mockup-kind'));
  const mockupText = /** @type {HTMLInputElement} */ ($('mockup-text'));
  mockupKind.addEventListener('change', renderMockup);
  mockupText.addEventListener('input', renderMockup);
  const mockupButton = /** @type {HTMLButtonElement} */ ($('dl-mockup'));
  mockupButton.addEventListener('click', () =>
    busyWhile(mockupButton, async () => {
      const kind = /** @type {import('../src/index.js').MockupKind} */ (mockupKind.value);
      const m = createMockup(current, { kind, text: mockupText.value });
      // Product shots follow the cover's size: twice it, for sharpness, within what the browser can
      // draw (10,000 px a side, and about 16.7 million pixels on iPhones). Cards have their own size.
      const card = ['card', 'square', 'story'].includes(kind);
      const scale = card
        ? 1
        : Math.min(2, MAX_SIDE / Math.max(m.width, m.height), Math.sqrt(CANVAS_PIXELS / (m.width * m.height)));
      const [pw, ph] = [Math.round(m.width * scale), Math.round(m.height * scale)];
      try {
        await downloadCover(m.svg, 'png', `${slug(oneLine(design.title))}-${kind}`, {
          width: pw,
          height: ph,
          dpi: DPI,
        });
        toast(`Saved the mockup · ${pw} × ${ph} px`);
      } catch (err) {
        console.error(err);
        fail('Export failed. Try again.');
      }
    }),
  );
  buildMany();
  buildPrint();
  $('thumb-toggle').addEventListener('click', () => {
    const on = $('book').classList.toggle('store-size');
    $('thumb-toggle').setAttribute('aria-pressed', String(on));
  });
  $('keep').addEventListener('click', toggleKeep);
  $('m-keep').addEventListener('click', toggleKeep);
  // Under Format: the paperback's back and spine are in their own panel, below.
  $('print-link').addEventListener('click', () => {
    const panel = /** @type {HTMLDetailsElement} */ ($('print'));
    panel.open = true;
    const summary = /** @type {HTMLElement} */ (panel.querySelector('summary'));
    summary.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    summary.focus({ preventScroll: true });
  });
  $('kept-all').addEventListener('click', downloadKept);
  $('kept-export').addEventListener('click', exportKept);
  $('kept-import').addEventListener('click', () => $('kept-file').click());
  $('kept-file').addEventListener('change', async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files?.[0];
    // (Cleared, so choosing the same file again imports it again.)
    input.value = '';
    if (file) await importKept(file);
  });

  // In-page links scroll without touching the URL, which holds the design.
  document.addEventListener('click', (e) => {
    // Cmd/Ctrl/Shift-clicks open the link in a new tab or window, as usual.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = /** @type {HTMLElement} */ (e.target).closest('a[href^="#"]');
    if (!(a instanceof HTMLAnchorElement)) return;
    const target = document.getElementById(a.hash.slice(1));
    if (!target) return;
    e.preventDefault();
    const behavior = reducedMotion.matches ? 'auto' : 'smooth';
    if (a.id === 'style-name') {
      const tile = tiles.get(design.style)?.button;
      if (tile) showTile(tile, behavior);
      tile?.focus({ preventScroll: true });
    } else if (a.hash === '#controls') $('title').focus();
    else {
      target.scrollIntoView({ behavior });
      // Move keyboard focus there too, as following the link would, so Tab continues from it.
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });

  // Single-key shortcuts can be turned off (WCAG 2.1.4), e.g. for speech input; the choice is remembered.
  const toggle = $('shortcuts-toggle');
  const syncShortcuts = () => {
    toggle.textContent = ui.shortcuts ? 'Turn off shortcuts' : 'Turn on shortcuts';
    $('shortcut-hint').classList.toggle('off', !ui.shortcuts);
    // (Control and Command with Z work either way: they aren't single keys.)
    for (const [id, keys, always] of [
      ['randomize', 'R', ''],
      ['undo', 'Z', 'Control+Z Meta+Z'],
      ['redo', 'Shift+Z', 'Control+Shift+Z Meta+Shift+Z'],
      ['keep', 'K', ''],
    ]) {
      const list = ui.shortcuts ? `${keys} ${always}`.trim() : always;
      if (list) $(id).setAttribute('aria-keyshortcuts', list);
      else $(id).removeAttribute('aria-keyshortcuts');
    }
    $('keep').title = ui.shortcuts ? 'Keep this design (K)' : 'Keep this design';
  };
  try {
    ui.shortcuts = localStorage.getItem(SHORTCUTS_KEY) !== 'off';
  } catch {
    // Storage blocked: shortcuts stay on.
  }
  syncShortcuts();
  toggle.addEventListener('click', () => {
    ui.shortcuts = !ui.shortcuts;
    try {
      if (ui.shortcuts) localStorage.removeItem(SHORTCUTS_KEY);
      else localStorage.setItem(SHORTCUTS_KEY, 'off');
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
    syncShortcuts();
    toast(ui.shortcuts ? 'Keyboard shortcuts on' : 'Keyboard shortcuts off');
  });

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // The target can be the document itself (events dispatched by scripts or extensions).
    const target = e.target instanceof Element ? e.target : null;
    // Text fields keep their keys (Control or Command with Z undoes typing there); the texture
    // switch (a checkbox) has no use for them.
    const field = target?.closest('input, textarea, select, [contenteditable]');
    if (field && !(field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio'))) return;
    // Match the character printed on the key (QWERTZ, AZERTY, Dvorak…); on
    // non-Latin layouts, fall back to the key's position.
    // (Not for Latin letters like à or ı, nor dead keys: those are characters of their own.)
    const nonLatin = /^\p{L}$/u.test(e.key) && !/\p{Script=Latin}/u.test(e.key);
    const letter = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : nonLatin ? (LETTER_CODES[e.code] ?? '') : '';
    // Undo and Redo as everywhere else: Control or Command with Z (and Shift), or Control with Y.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (letter === 'z' || (letter === 'y' && !e.metaKey))) {
      if (letter === 'y' || e.shiftKey) redo();
      else undo();
      e.preventDefault();
      return;
    }
    if (!ui.shortcuts || e.metaKey) return;
    const plain = !e.ctrlKey && !e.altKey;
    if (plain && letter === 'r') randomizeAll();
    else if (plain && letter === 'z') {
      if (e.shiftKey) redo();
      else undo();
    } else if (plain && letter === 'y') redo();
    else if (plain && letter === 'k' && !e.shiftKey) toggleKeep();
    // (Not in the code samples: they are focusable so arrow keys can scroll them.)
    else if (plain && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !target?.closest('pre'))
      stepStyle(e.key === 'ArrowLeft' ? -1 : 1);
    // Brackets need AltGr or Option on many layouts, so modifiers are allowed for them.
    else if (e.key === '[' || e.key === ']') stepPalette(e.key === '[' ? -1 : 1);
    else return;
    e.preventDefault();
  });
}

/**
 * Bring a style's tile into view. Where the rail scrolls on its own (beside the preview), only the
 * rail scrolls, so the cover stays where it is; elsewhere the page scrolls to it.
 * @param {HTMLElement} tile @param {ScrollBehavior} behavior
 */
function showTile(tile, behavior) {
  const rail = $('styles');
  const box = rail.getBoundingClientRect();
  // (A rail out of sight, scrolled past to the docs, say: the page goes to it.)
  if (getComputedStyle(rail).overflowY !== 'auto' || box.bottom < 0 || box.top > innerHeight) {
    tile.scrollIntoView({ behavior, block: 'center' });
    return;
  }
  // Centred in the part of the rail on screen, below its pinned header.
  const head = /** @type {HTMLElement} */ (rail.querySelector('.rail-head')).getBoundingClientRect();
  const [top, bottom] = [Math.max(head.bottom, 0), Math.min(box.bottom, innerHeight)];
  const r = tile.getBoundingClientRect();
  const most = rail.scrollHeight - rail.clientHeight;
  const to = Math.min(most, Math.max(0, rail.scrollTop + r.top + r.height / 2 - (top + bottom) / 2));
  const at = r.top - (to - rail.scrollTop);
  rail.scrollTo({ top: to, behavior });
  // The rail can run past the window's edge (at the top of the page): then the page moves, as little
  // as it must for the whole tile to show.
  const below = at + r.height + 8 - innerHeight;
  if (below > 0) window.scrollBy({ top: below, behavior });
}

/** @param {number} dir */
function stepStyle(dir) {
  const pool = stylePool();
  const i = pool.indexOf(design.style);
  // From a style outside the genre: to its first style or its last.
  update({ style: i === -1 ? pool.at(dir > 0 ? 0 : -1) : pool[(i + dir + pool.length) % pool.length] });
}

/** The styles to pick from: those of the chosen genre (all of them without one). */
function stylePool() {
  const pool = ui.genre ? STYLES.filter((s) => s.genres.includes(ui.genre)).map((s) => s.id) : STYLE_IDS;
  return pool.length ? pool : STYLE_IDS;
}

/** Another style from the pool (this one, if it is all the pool has). */
function otherStyle() {
  const others = stylePool().filter((id) => id !== design.style);
  return others.length ? pick(others) : design.style;
}

/** @param {number} dir */
function stepPalette(dir) {
  const ids = [...PALETTE_IDS];
  const i = ids.indexOf(design.palette);
  // From your own colours: to the first palette or the last.
  update({ palette: i === -1 ? ids.at(dir > 0 ? 0 : -1) : ids[(i + dir + ids.length) % ids.length] });
}

function randomizeAll() {
  update({
    style: ui.lockStyle ? design.style : otherStyle(),
    palette: ui.lockPalette ? design.palette : Math.random() < 0.3 ? 'auto' : pick(palettes).id,
    seed: randomSeed(),
  });
}

function syncPaletteName() {
  const p = palettes.find((x) => x.id === current?.palette);
  $('palette-name').textContent =
    design.palette === 'auto' ? `Auto · ${p?.name ?? ''}` : customColors(design.palette) ? 'Custom' : (p?.name ?? '');
}

/** The colour pickers: background, text and three accents. */
const colorInputs = () =>
  ['color-bg', 'color-ink', 'color-a1', 'color-a2', 'color-a3'].map((id) => /** @type {HTMLInputElement} */ ($(id)));

/**
 * The largest export scale for a cover this size: its long side within 10,000 px, and the image
 * within what the device can draw. A cover too large for an iPhone's canvas even at 1× is drawn
 * as large as it can be (below 1×).
 * @param {number} w @param {number} hgt
 */
const maxScaleOf = (w, hgt) => {
  const fit = Math.sqrt(CANVAS_PIXELS / (w * hgt));
  const most = Math.min(4, Math.floor(MAX_SIDE / Math.max(w, hgt)), Math.floor(fit));
  return most >= 1 ? most : Math.floor(fit * 100) / 100;
};
/** The largest export scale for a format. @param {string} format */
const maxScale = (format) => maxScaleOf(...sizeOf(format));
/** The export scale chosen for a format (custom sizes have their own, 1× by default). @param {string} format */
const scaleFor = (format) => Math.min(isCustomSize(format) ? ui.customScale : ui.scale, maxScale(format));

/** Show the cover's size in the custom size fields; `always` even where one is being typed in. */
function syncSize(always = false) {
  const [w, hgt] = sizeOf(design.format);
  for (const [id, value] of /** @type {const} */ ([
    ['size-w', w],
    ['size-h', hgt],
  ])) {
    const input = /** @type {HTMLInputElement} */ ($(id));
    // (Compared as numbers: a field showing "01600" while typed in is left alone.)
    if (always || Number(input.value) !== value) input.value = String(value);
  }
}

/** The language a link gave the design, named (Turkish), with a way to clear it. */
function syncLang() {
  $('lang-note').hidden = !design.lang;
  if (!design.lang) return;
  let name = design.lang;
  try {
    name = new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' }).of(design.lang) ?? name;
  } catch {
    // (A tag the browser can't name: shown as it is.)
  }
  $('lang-name').textContent = name;
}

function syncControls() {
  syncLang();
  const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
  // A series or credit that comes from elsewhere (a link, Undo, a kept design) opens their section,
  // so it is never hidden; one typed there leaves it as it is, and closing it is up to you.
  const arrived = /** @type {const} */ (['series', 'credit', 'badge']).some(
    (key) => design[key] && input(key).value !== design[key],
  );
  if (arrived) /** @type {HTMLDetailsElement} */ ($('more-text')).open = true;
  for (const key of /** @type {const} */ (['title', 'author', 'subtitle', 'series', 'credit', 'badge'])) {
    if (input(key).value !== design[key]) input(key).value = design[key];
  }
  // (Compared trimmed, as the field's input handler trims: typing a space doesn't get undone.)
  if (input('seed').value.trim() !== design.seed) input('seed').value = design.seed;
  input('texture').checked = design.texture;
  const colors = customColors(design.palette);
  if (colors) ui.colors = fiveColors(colors);
  for (const b of document.querySelectorAll('[data-palette]')) {
    const id = b.getAttribute('data-palette');
    b.setAttribute('aria-pressed', String(id === 'custom' ? Boolean(colors) : id === design.palette));
  }
  syncCustomColors(colors);
  syncVariants();
  /** @type {HTMLSelectElement} */ ($('title-font')).value = design.font;
  $('type-note').hidden = design.style !== 'typewriter' && design.style !== 'pixel';
  for (const b of document.querySelectorAll('[data-case]')) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-case') === design.case));
  }
  const custom = isCustomSize(design.format);
  if (custom) ui.size = design.format;
  for (const b of document.querySelectorAll('[data-format]')) {
    const id = b.getAttribute('data-format');
    b.setAttribute('aria-pressed', String(id === 'custom' ? custom : id === design.format));
  }
  $('custom-size').hidden = !custom;
  if (custom) syncSize();
  const preset = /** @type {HTMLSelectElement} */ ($('size-preset'));
  preset.value = [...preset.options].some((o) => o.value === design.format) ? design.format : '';
  const scale = scaleFor(design.format);
  const most = maxScale(design.format);
  for (const b of document.querySelectorAll('[data-scale]')) {
    const value = Number(b.getAttribute('data-scale'));
    b.setAttribute('aria-pressed', String(value === scale));
    // Larger than 10,000 px, or than this device's canvas: more than it can reliably draw.
    if (value > most) {
      b.setAttribute('aria-disabled', 'true');
      b.setAttribute('title', 'Too large to export on this device');
    } else {
      b.removeAttribute('aria-disabled');
      b.removeAttribute('title');
    }
  }
  const [w, hgt] = sizeOf(design.format);
  const pw = Math.round(w * scale);
  const ph = Math.round(hgt * scale);
  $('png-size').textContent = `${pw} × ${ph} px`;
  $('size-hint').textContent = sizeHint(design.format, pw, ph);
  // The main download is the file the format is for; the other formats are under it.
  const main = mainFormat(design.format);
  const kind = main === 'jpeg' ? 'JPEG' : 'PNG';
  if ($('download-kind').textContent !== kind) {
    $('download-kind').textContent = kind;
    $('m-download-kind').textContent = kind;
  }
  $('dl-png').hidden = main === 'png';
  $('dl-jpeg').hidden = main === 'jpeg';
  // A paperback (or a size of its own) may want its back and spine too; an eBook or audiobook not.
  $('print-link').hidden = design.format === 'ebook' || design.format === 'square';
  syncPaletteName();
}

/**
 * The format the main download makes: JPEG for a Kindle cover (KDP takes JPEG, not PNG), else PNG.
 * @param {string} format
 * @returns {'png' | 'jpeg'}
 */
function mainFormat(format) {
  const [w, hgt] = sizeOf(format);
  return format === 'ebook' || (isCustomSize(format) && w * 2560 === hgt * 1600) ? 'jpeg' : 'png';
}

/** The style the variant buttons were built for. */
let variantsBuiltFor = '';

/** Buttons for the current style's variants: Auto (the seed decides) and each value. */
function syncVariants() {
  const box = $('style-variants');
  const offered = STYLES.find((s) => s.id === design.style)?.variants ?? [];
  if (variantsBuiltFor !== design.style) {
    variantsBuiltFor = design.style;
    // A chip with focus is about to go: focus moves to its place in the new ones (or the style's name).
    const focused = box.contains(document.activeElement);
    queueMicrotask(() => {
      if (!focused || box.contains(document.activeElement)) return;
      const chip = /** @type {HTMLElement | null} */ (box.querySelector('button[aria-pressed="true"]'));
      (chip && !box.hidden ? chip : $('style-name')).focus();
    });
    box.replaceChildren(
      ...offered.map((v) => {
        const labelId = `variant-${v.name}`;
        return h(
          'div',
          { className: 'variant' },
          h('span', { className: 'variant-label', id: labelId }, v.label),
          h(
            'div',
            { className: 'chips', role: 'group', 'aria-labelledby': labelId },
            ...[{ value: '', label: 'Auto' }, ...v.values].map((x) =>
              h(
                'button',
                {
                  type: 'button',
                  className: 'chip',
                  'data-variant': v.name,
                  'data-value': x.value,
                  title: x.value ? `Always ${x.label.toLowerCase()}` : 'Picked by the variation',
                },
                x.label,
              ),
            ),
          ),
        );
      }),
    );
  }
  box.hidden = offered.length === 0;
  const pins = pinsFor(design.variant, design.style);
  for (const b of box.querySelectorAll('button[data-variant]')) {
    const name = b.getAttribute('data-variant') ?? '';
    const value = b.getAttribute('data-value') ?? '';
    b.setAttribute('aria-pressed', String((pins[name] ?? '') === value));
    // While Auto is on, the value the variation picked is outlined.
    b.classList.toggle('picked', !pins[name] && value !== '' && current?.variants[name] === value);
  }
}

/** The colour pickers and the Custom swatch. @param {string[] | null} colors the design's own colours, if it has them */
function syncCustomColors(colors) {
  $('custom-colors').hidden = !colors;
  const swatch = /** @type {HTMLElement} */ (document.querySelector('.swatch.custom'));
  // The swatch shows your colours once you have some.
  swatch.classList.toggle('has-colors', Boolean(ui.colors));
  if (ui.colors) {
    const [bg, ink, ...accents] = ui.colors;
    swatch.style.background = bg;
    swatch.style.color = ink;
    swatch.querySelectorAll('i').forEach((dot, i) => {
      /** @type {HTMLElement} */ (dot).style.background = accents[i];
    });
  }
  if (!colors) return;
  const five = fiveColors(colors);
  colorInputs().forEach((input, i) => {
    if (input.value.toLowerCase() !== five[i]) input.value = five[i];
  });
  const ratio = contrast(five[0], five[1]);
  const note = $('contrast-note');
  // Styles set text in black or white instead of a colour that reads badly (under 3:1).
  note.textContent =
    ratio < 3
      ? `Text on background: ${ratio.toFixed(1)}:1, too low. Covers use black or white text instead.`
      : `Text on background: ${ratio.toFixed(1)}:1${ratio < 4.5 ? ', fine for large text' : ''}.`;
  note.classList.toggle('warn', ratio < 3);
}

/** What a given export size is good for. @param {string} format @param {number} w @param {number} hgt */
function sizeHint(format, w, hgt) {
  // (Checked against KDP's and ACX's cover guidelines, November 2026.)
  const kindle = 'Meets Kindle’s recommended 1600 × 2560 (KDP takes JPEG, not PNG).';
  const audiobook = 'Meets the 2400 × 2400 audiobook minimum (as JPEG it stays under ACX’s 8 MB).';
  if (isCustomSize(format)) {
    const inches = (/** @type {number} */ px) => String(Math.round((px / DPI) * 100) / 100);
    const print = `${inches(w)} × ${inches(hgt)} in at ${DPI} dpi.`;
    if (w * 2560 === hgt * 1600 && hgt >= 2560) return `${kindle} ${print}`;
    if (w === hgt && w >= 2400) return audiobook;
    return print;
  }
  if (format === 'ebook') return hgt >= 2560 ? kindle : 'Kindle recommends 1600 × 2560: choose 3× or more.';
  if (format === 'square') return w >= 2400 ? audiobook : 'Audiobook stores ask for 2400 × 2400: choose 4×.';
  return w >= 1800
    ? 'Enough for a 6 × 9 in front cover at 300 dpi.'
    : 'For a 6 × 9 in print cover at 300 dpi, choose 3× or more.';
}

/* -------------------------------------------------------------- style rail */

/** @type {Map<string, Tile>} */
const tiles = new Map();

/** Styles whose tiles are on screen (or within the observer's margin). */
const onScreen = new Set();
/** Styles in rail order, to render a few tiles ahead of what is on screen. */
let railOrder = /** @type {string[]} */ ([]);
// The rail (desktop) and the strips (phones) scroll on their own, and they clip the
// observer's margin, so look ahead by position in the rail instead.
const LOOKAHEAD = 6;

function buildRail() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const style = /** @type {HTMLElement} */ (entry.target).dataset.style ?? '';
        if (entry.isIntersecting) onScreen.add(style);
        else onScreen.delete(style);
      }
      const near = new Set();
      for (const style of onScreen) {
        const i = railOrder.indexOf(style);
        for (let k = Math.max(0, i - LOOKAHEAD); k <= Math.min(railOrder.length - 1, i + LOOKAHEAD); k++) {
          near.add(railOrder[k]);
        }
      }
      for (const [style, tile] of tiles) tile.visible = near.has(style);
      scheduleGallery();
    },
    { rootMargin: '400px' },
  );
  const rail = $('rail');
  /** @type {Map<string, HTMLElement>} */
  const groups = new Map();
  for (const s of STYLES) {
    let grid = groups.get(s.group);
    if (!grid) {
      grid = h('div', { className: 'rail-grid' });
      groups.set(s.group, grid);
      const section = h('section', { className: 'rail-group' }, h('h3', {}, familyName(s.group)), grid);
      rail.append(section);
      // A jump link per family in the rail's header: 39 styles are a long scroll.
      const jump = h('button', { type: 'button', className: 'rail-jump' }, familyName(s.group));
      jump.addEventListener('click', () => {
        // Clear of the rail's pinned header, however tall it has grown (on narrower screens, where
        // it isn't pinned, the stylesheet's margin applies).
        const head = /** @type {HTMLElement} */ ($('rail').previousElementSibling);
        section.style.scrollMarginTop =
          getComputedStyle(head).position === 'sticky' ? `${head.getBoundingClientRect().height + 8}px` : '';
        section.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      });
      $('rail-groups').append(jump);
    }
    const img = /** @type {HTMLImageElement} */ (h('img', { alt: '', decoding: 'async', width: 150, height: 225 }));
    const button = /** @type {HTMLButtonElement} */ (
      h(
        'button',
        { type: 'button', className: 'tile', title: s.description, 'data-style': s.id },
        h('span', { className: 'tile-img' }, img),
        h('span', { className: 'tile-name' }, s.name),
      )
    );
    button.addEventListener('click', () => update({ style: s.id }));
    tiles.set(s.id, { button, img, visible: false, dirty: true });
    observer.observe(button);
    grid.append(button);
  }
  buildGenres();
}

/** The genre chosen on an earlier visit, or '' for all. */
function savedGenre() {
  try {
    const saved = localStorage.getItem(GENRE_KEY) ?? '';
    return genres.some((g) => g.id === saved) ? saved : '';
  } catch {
    // Storage blocked: all genres.
    return '';
  }
}

/** The genre menu: it filters the rail, and what Randomize, the dice and the arrows pick. */
function buildGenres() {
  const menu = /** @type {HTMLSelectElement} */ ($('genre'));
  for (const g of genres) menu.append(h('option', { value: g.id }, g.name));
  // (ui.genre holds the saved genre already: read once, at start.)
  menu.value = ui.genre;
  menu.addEventListener('change', () => {
    ui.genre = menu.value;
    try {
      if (ui.genre) localStorage.setItem(GENRE_KEY, ui.genre);
      else localStorage.removeItem(GENRE_KEY);
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
    applyGenre();
  });
  applyGenre();
}

/** Show the styles of the chosen genre only, and the families that have some. */
function applyGenre() {
  const rail = $('rail');
  for (const s of STYLES) {
    const tile = tiles.get(s.id);
    if (!tile) continue;
    // (The selected style always shows, in or out of the genre.)
    const hide = Boolean(ui.genre) && !s.genres.includes(ui.genre) && s.id !== design.style;
    // A tile with keyboard focus hands it to the selected one before it goes.
    if (hide && document.activeElement === tile.button) tiles.get(design.style)?.button.focus();
    tile.button.hidden = hide;
  }
  const sections = [...rail.querySelectorAll('.rail-group')];
  const jumps = [...$('rail-groups').querySelectorAll('.rail-jump')];
  sections.forEach((section, i) => {
    const empty = ![...section.querySelectorAll('.tile')].some((t) => !(/** @type {HTMLElement} */ (t).hidden));
    /** @type {HTMLElement} */ (section).hidden = empty;
    if (jumps[i]) /** @type {HTMLElement} */ (jumps[i]).hidden = empty;
  });
  railOrder = Array.from(
    rail.querySelectorAll('.tile:not([hidden])'),
    (b) => /** @type {HTMLElement} */ (b).dataset.style ?? '',
  );
}

function invalidateGallery() {
  for (const tile of tiles.values()) tile.dirty = true;
  scheduleGallery();
}

/**
 * Run `work` in slices of about 8 ms, one animation frame each, until it reports there is
 * nothing left. Returns a function that starts it (if it isn't already running).
 * @param {() => boolean} work  does one unit; false when there was nothing to do
 */
function sliced(work) {
  let frame = 0;
  const tick = () => {
    frame = 0;
    const start = performance.now();
    while (work()) {
      if (performance.now() - start > 8) {
        frame = requestAnimationFrame(tick);
        return;
      }
    }
  };
  return () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };
}

/** Render the next dirty tile near the screen, those on it first. */
const scheduleGallery = sliced(() => {
  /** @type {[string, Tile] | null} */
  let next = null;
  for (const [style, tile] of tiles) {
    if (!tile.dirty || !tile.visible) continue;
    next = [style, tile];
    if (onScreen.has(style)) break;
  }
  if (!next) return false;
  const [style, tile] = next;
  // (Another style is drawn as picking it draws it: without the current style's pins.)
  tile.img.src = svgToDataUrl(createCover(options(style === design.style ? { style } : { style, variants: {} })).svg);
  tile.dirty = false;
  return true;
});

/** The style the rail last marked. */
let markedStyle = '';
function markRail() {
  // (Only a change of style changes the rail: typing in the title doesn't.)
  if (design.style === markedStyle) return;
  markedStyle = design.style;
  for (const [style, tile] of tiles) tile.button.setAttribute('aria-pressed', String(style === design.style));
  // The selected style shows in the rail even outside the genre (and the one before it no longer).
  if (ui.genre) applyGenre();
}

/* ---------------------------------------------------------------- keeping */

/**
 * A kept design from storage or a file: the design (unknown values dropped, missing ones
 * completed) and the SVG drawn when it was kept, if it looks like a cover.
 * @param {unknown} item
 * @returns {Kept}
 */
function keptFrom(item) {
  const raw = item && typeof item === 'object' ? /** @type {Record<string, unknown>} */ (item) : {};
  const kept = complete(sanitize(raw));
  // The cover as it was drawn, if it is one of the design's size (a file of kept designs from
  // elsewhere can hold anything): else it is drawn again from the design.
  const [w, hgt] = sizeOf(kept.format);
  const size = typeof raw.svg === 'string' ? /^<svg [^>]*?\bwidth="(\d+)" height="(\d+)"/.exec(raw.svg) : null;
  const svg =
    typeof raw.svg === 'string' &&
    raw.svg.length <= MAX_SNAPSHOT &&
    raw.svg.endsWith('</svg>') &&
    size !== null &&
    Number(size[1]) === w &&
    Number(size[2]) === hgt
      ? raw.svg
      : '';
  return { design: kept, svg };
}

/**
 * The kept designs as last read or saved, so a click doesn't parse the whole tray again; null when
 * storage may hold something newer (another tab changed it).
 * @type {Kept[] | null}
 */
let keptCache = null;

/** The kept designs, newest first (a copy of the list: change it and save it with saveKept). @returns {Kept[]} */
function loadKept() {
  if (!keptCache) {
    keptCache = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KEEP_KEY) || '[]');
      // (Cut first: there's no use completing designs that are thrown away.)
      if (Array.isArray(raw)) keptCache = raw.slice(0, MAX_KEPT).map(keptFrom);
    } catch {
      // Unreadable or blocked: none.
    }
  }
  return [...keptCache];
}

// Another tab kept or removed a design: show the tray as it is now.
window.addEventListener('storage', (e) => {
  if (e.key !== KEEP_KEY && e.key !== null) return;
  keptCache = null;
  renderKept();
});

/** A kept design as stored and exported: the design's fields, and its SVG. @param {Kept} k @param {boolean} [withSvg] */
const stored = (k, withSvg = true) => (withSvg && k.svg ? { ...k.design, svg: k.svg } : { ...k.design });

/**
 * Save the kept designs. When storage is full, the oldest give up their SVG first, a quarter at a
 * time (they are then drawn from their settings, which a later version may draw differently).
 * Returns how many lost their SVG that way, or -1 when nothing could be saved.
 * @param {Kept[]} list
 */
function saveKept(list) {
  const n = list.length;
  for (const withSvg of new Set([n, Math.ceil(n * 0.75), Math.ceil(n / 2), Math.ceil(n / 4), Math.min(n, 1), 0])) {
    try {
      localStorage.setItem(KEEP_KEY, JSON.stringify(list.map((k, i) => stored(k, i < withSvg))));
    } catch {
      // Full (try with fewer SVGs) or blocked.
      continue;
    }
    keptCache = list.map((k, i) => (i < withSvg || !k.svg ? k : { ...k, svg: '' }));
    return list.filter((k, i) => i >= withSvg && k.svg).length;
  }
  return -1;
}

/** What to add to a message when saving made older designs give up their SVG. @param {number} lost */
const lostNote = (lost) =>
  lost > 0
    ? ` Storage is full, so the ${lost === 1 ? 'oldest is' : `${lost} oldest are`} now kept as settings only.`
    : '';

/** The designs kept, by link, as the tray last showed them. @type {Set<string>} */
let keptHashes = new Set();

/** The Keep stars say whether the design on show is kept. */
function syncKeep() {
  const kept = String(keptHashes.has(toHash(design)));
  for (const id of ['keep', 'm-keep'])
    if ($(id).getAttribute('aria-pressed') !== kept) $(id).setAttribute('aria-pressed', kept);
}

/** Keep the design on show, or, when it is kept already, remove it (with an Undo). */
function toggleKeep() {
  const hash = toHash(design);
  const list = loadKept();
  const i = list.findIndex((k) => toHash(k.design) === hash);
  if (i < 0) keepDesign();
  else removeKept(list[i], i);
}

function keepDesign() {
  const hash = toHash(design);
  const list = loadKept().filter((k) => toHash(k.design) !== hash);
  list.unshift({ design: { ...design }, svg: current.svg.length <= MAX_SNAPSHOT ? current.svg : '' });
  const lost = saveKept(list.slice(0, MAX_KEPT));
  if (lost < 0) {
    fail('Could not save here (private browsing?)');
    return;
  }
  renderKept();
  toast(
    (list.length > MAX_KEPT ? `Kept. The oldest of ${MAX_KEPT} made room.` : 'Kept. It’s under the preview.') +
      lostNote(lost),
  );
}

/**
 * Remove a kept design, offering to put it back where it was.
 * @param {Kept} k @param {number} at its place in the tray
 */
function removeKept(k, at) {
  const hash = toHash(k.design);
  // (By its link: another tab may have changed the list since it was drawn.)
  saveKept(loadKept().filter((other) => toHash(other.design) !== hash));
  renderKept();
  toast('Removed from kept designs.', {
    action: 'Undo',
    run: () => {
      const list = loadKept();
      if (list.some((other) => toHash(other.design) === hash)) return;
      list.splice(Math.min(at, list.length), 0, k);
      if (saveKept(list.slice(0, MAX_KEPT)) < 0) fail('Could not save here (private browsing?)');
      else toast('Put back.');
      renderKept();
    },
  });
}

/** Kept thumbnails by design, so Keep and Remove only draw the one that changed. */
/** @type {Map<string, string>} */
const keptThumbs = new Map();
/** @type {{ img: HTMLImageElement, kept: Kept, hash: string }[]} */
let keptQueue = [];

/** Each kept design's SVG hashed once (an SVG can be 400 KB, the tray holds a hundred). @type {WeakMap<Kept, number>} */
const keptSvgHashes = new WeakMap();
/** @param {Kept} k */
function keptSvgHash(k) {
  let hash = keptSvgHashes.get(k);
  if (hash === undefined) {
    hash = k.svg ? hashString(k.svg) : 0;
    keptSvgHashes.set(k, hash);
  }
  return hash;
}

/** @param {Kept[]} [list] the kept designs, if already loaded */
function renderKept(list = loadKept()) {
  const hashes = list.map((k) => toHash(k.design));
  // Thumbnails by the SVG kept too: a design kept again with a new drawing shows the new one.
  const thumbKeys = list.map((k, i) => `${hashes[i]}|${k.svg ? keptSvgHash(k) : ''}`);
  for (const key of keptThumbs.keys()) if (!thumbKeys.includes(key)) keptThumbs.delete(key);
  keptQueue = [];
  keptHashes = new Set(hashes);
  syncKeep();
  $('kept-empty').hidden = list.length > 0;
  for (const id of ['kept-all', 'kept-export']) $(id).hidden = list.length === 0;
  $('kept-list').replaceChildren(
    ...list.map((k, i) => {
      const d = k.design;
      const img = /** @type {HTMLImageElement} */ (h('img', { alt: '' }));
      const thumb = keptThumbs.get(thumbKeys[i]);
      if (thumb) img.src = thumb;
      else keptQueue.push({ img, kept: k, hash: thumbKeys[i] });
      const styleName = STYLES.find((s) => s.id === d.style)?.name ?? d.style;
      const paletteName = customColors(d.palette)
        ? 'Custom'
        : d.palette === 'auto'
          ? 'Auto'
          : (palettes.find((x) => x.id === d.palette)?.name ?? d.palette);
      const label = `${oneLine(d.title) || 'Untitled'}, ${styleName}`;
      const open = h(
        'button',
        {
          type: 'button',
          className: 'kept-open',
          'aria-label': `Open ${label}`,
          title: `${styleName} · ${paletteName}`,
        },
        img,
      );
      open.addEventListener('click', () => openKept(k));
      const remove = h(
        'button',
        { type: 'button', className: 'kept-remove', 'aria-label': `Remove ${label}`, title: 'Remove' },
        '×',
      );
      remove.addEventListener('click', () => {
        removeKept(k, i);
        // The button is gone: move focus to the next design's (or the last one's), or to Keep.
        const buttons = $('kept-list').querySelectorAll('.kept-remove');
        const next = /** @type {HTMLElement | undefined} */ (buttons[Math.min(i, buttons.length - 1)]);
        (next ?? $('keep')).focus();
      });
      return h('li', {}, open, remove, h('span', { className: 'kept-label', 'aria-hidden': 'true' }, styleName));
    }),
  );
  scheduleKept();
}

/** A cover's drawing, whatever its ids (which a version may name differently). @param {string} svg */
const drawingOf = (svg) => svg.replace(/\bbc[0-9a-z]+-/g, 'bc-');

/** Open a kept design, saying so when this version draws it differently from the kept SVG. @param {Kept} k */
function openKept(k) {
  update({ ...k.design });
  if (k.svg && drawingOf(createCover(optionsFor(k.design)).svg) !== drawingOf(k.svg)) {
    toast('This version draws it a little differently. Download all saves it as kept.');
  }
}

/** A file name not yet in `taken` (adding -2, -3…), which it then joins. @param {string} base @param {string} ext @param {Set<string>} taken */
function uniqueName(base, ext, taken) {
  let name = `${base}.${ext}`;
  for (let k = 2; taken.has(name); k++) name = `${base}-${k}.${ext}`;
  taken.add(name);
  return name;
}

/** Download every kept design as a PNG at the chosen size, together in one ZIP file. */
async function downloadKept() {
  const button = $('kept-all');
  const list = loadKept();
  if (!list.length) return;
  await busyWhile(button, async () => {
    /** @type {Set<string>} */
    const taken = new Set();
    /** @type {{ name: string, data: Blob }[]} */
    const files = [];
    try {
      for (const k of list) {
        button.textContent = `Drawing ${files.length + 1} of ${list.length}…`;
        // As kept, when the SVG was kept with it.
        const svg = k.svg || createCover(optionsFor(k.design)).svg;
        const blob = await rasterize(svg, { scale: scaleFor(k.design.format), dpi: DPI });
        const name = uniqueName(`${slug(k.design.title)}-${k.design.style}`, extensionOf(blob) ?? 'png', taken);
        files.push({ name, data: blob });
      }
      downloadBlob(await zipFiles(files), 'kept-covers.zip');
      toast(`Saved ${files.length} PNG${files.length === 1 ? '' : 's'} in kept-covers.zip`);
    } catch (err) {
      console.error(err);
      fail('Export failed. Try one at a time.');
    } finally {
      button.textContent = 'Download all';
    }
  });
}

/** Save the kept designs (with their SVGs) to a file, to keep elsewhere or import in another browser. */
function exportKept() {
  const list = loadKept();
  const data = { app: 'book-cover-generator', kind: 'kept-designs', version: 1, designs: list.map((k) => stored(k)) };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'kept-designs.json');
  toast(`Saved ${list.length} design${list.length === 1 ? '' : 's'} to kept-designs.json`);
}

/** Add the designs in an exported file to the kept ones (those not kept already, first). @param {File} file */
async function importKept(file) {
  /** @type {unknown} */
  let data = null;
  try {
    if (file.size <= 50_000_000) data = JSON.parse(await file.text());
  } catch {
    // Not JSON: reported below.
  }
  const items = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray(/** @type {{ designs?: unknown }} */ (data).designs)
      ? /** @type {unknown[]} */ (/** @type {{ designs: unknown[] }} */ (data).designs)
      : null;
  if (!items) {
    fail('That file has no kept designs in it');
    return;
  }
  const list = loadKept();
  const have = new Set(list.map((k) => toHash(k.design)));
  /** @type {Kept[]} */
  const added = [];
  let designs = 0;
  for (const item of items) {
    // (Only designs: an entry naming nothing a design has would come out as an empty cover.)
    if (
      !item ||
      typeof item !== 'object' ||
      !Object.keys(sanitize(/** @type {Record<string, unknown>} */ (item))).length
    ) {
      continue;
    }
    designs += 1;
    const k = keptFrom(item);
    const hash = toHash(k.design);
    if (have.has(hash)) continue;
    have.add(hash);
    added.push(k);
  }
  const room = Math.max(0, MAX_KEPT - list.length);
  const taken = added.slice(0, room);
  if (!designs) {
    fail('That file has no kept designs in it');
    return;
  }
  if (!taken.length) {
    if (added.length) fail(`The tray is full: it holds ${MAX_KEPT} designs`);
    else toast('Nothing new: those designs are kept already');
    return;
  }
  const lost = saveKept([...taken, ...list]);
  if (lost < 0) {
    fail('Could not save here (private browsing?)');
    return;
  }
  renderKept();
  const note = taken.length < added.length ? ` (the tray holds ${MAX_KEPT})` : '';
  toast(`Imported ${taken.length} design${taken.length === 1 ? '' : 's'}${note}.${lostNote(lost)}`);
}

/** Draw the next queued kept thumbnail: the SVG kept with it, else from its settings. */
const scheduleKept = sliced(() => {
  const item = keptQueue.shift();
  if (!item) return false;
  const url = svgToDataUrl(item.kept.svg || createCover(optionsFor(item.kept.design)).svg);
  keptThumbs.set(item.hash, url);
  item.img.src = url;
  return true;
});

/* ------------------------------------------------------------------ export */

/**
 * Run `work` with `button` marked busy, ignoring presses meanwhile. (aria-disabled, not
 * disabled, so keyboard focus stays on it.)
 * @param {HTMLElement} button @param {() => Promise<void>} work
 */
async function busyWhile(button, work) {
  if (button.getAttribute('aria-busy') === 'true') return;
  button.setAttribute('aria-disabled', 'true');
  button.setAttribute('aria-busy', 'true');
  try {
    await work();
  } finally {
    button.removeAttribute('aria-disabled');
    button.removeAttribute('aria-busy');
  }
}

/**
 * @param {'svg' | 'png' | 'jpeg' | 'webp'} format
 * @param {HTMLButtonElement} button
 */
async function exportAs(format, button) {
  // Capture what is being exported: the design may change while the image renders.
  const name = `${slug(design.title)}-${current.style}`;
  const svg = current.svg;
  const [w, hgt] = sizeOf(design.format);
  const scale = scaleFor(design.format);
  await busyWhile(button, async () => {
    try {
      const saved = await downloadCover(svg, format, name, { scale, quality: 0.93, dpi: DPI });
      if (format === 'svg') {
        toast('Saved SVG');
        return;
      }
      const ext = saved.slice(saved.lastIndexOf('.') + 1);
      // Safari makes a PNG when asked for WebP.
      const fallback = format === 'webp' && ext !== 'webp' ? ' (this browser can’t make WebP)' : '';
      toast(
        `Saved ${ext === 'jpg' ? 'JPEG' : ext.toUpperCase()} · ${Math.round(w * scale)} × ${Math.round(hgt * scale)} px${fallback}`,
      );
    } catch (err) {
      console.error(err);
      fail('Export failed. Try SVG instead.');
    }
  });
}

/** Whether this browser can share image files (phones, Safari, Edge). */
function canShareFiles() {
  try {
    return (
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'cover.png', { type: 'image/png' })] })
    );
  } catch {
    return false;
  }
}

/** The PNG last made for Share, so a second tap shares it at once. @type {{ key: string, file: File } | null} */
let shared = null;

/** Share the cover as a PNG (to Photos, Messages, another app…). */
async function shareCover() {
  const scale = scaleFor(design.format);
  const key = `${scale}|${current.svg}`;
  const name = `${slug(design.title)}-${current.style}.png`;
  try {
    if (shared?.key !== key) {
      const blob = await rasterize(current.svg, { scale, dpi: DPI });
      shared = { key, file: new File([blob], name, { type: 'image/png' }) };
    }
    await navigator.share({ files: [shared.file], title: oneLine(design.title) || 'Book cover' });
  } catch (err) {
    const why = err instanceof DOMException ? err.name : '';
    // The share sheet was closed.
    if (why === 'AbortError') return;
    // Drawing took longer than the browser lets a tap count for: the image is ready now.
    if (why === 'NotAllowedError') toast('Ready: tap Share again');
    else {
      console.error(err);
      fail('Could not share. Try Download PNG.');
    }
  }
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let mockupTimer;

/** The mockup preview, and the card's line shown only for the kinds that have one. */
function renderMockup() {
  const kind = /** @type {import('../src/index.js').MockupKind} */ (
    /** @type {HTMLSelectElement} */ ($('mockup-kind')).value
  );
  const words = /** @type {HTMLInputElement} */ ($('mockup-text'));
  words.hidden = !['card', 'square', 'story'].includes(kind);
  /** @type {HTMLImageElement} */ ($('mockup-preview')).src = svgToDataUrl(
    createMockup(current, { kind, text: words.value }).svg,
  );
}

/* ------------------------------------------------------------ many covers */

/** The most books one download makes. */
const MAX_BOOKS = 300;
/** How many the panel previews. */
const PREVIEWED = 12;

/** The books in the list (or why it can't be read). @returns {{ books: import('../src/index.js').CoverOptions[], error: string }} */
function listedBooks() {
  try {
    return { books: parseBookList(/** @type {HTMLTextAreaElement} */ ($('many-list')).value), error: '' };
  } catch (err) {
    return { books: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cover options for book `i` of the list: the design `d`, with what the list says for it, and a
 * palette of its own when `own` asks for one.
 * @param {import('../src/index.js').CoverOptions} book @param {number} i
 * @param {Design} [d] @param {boolean} [own]
 */
function bookOptions(book, i, d = design, own = /** @type {HTMLInputElement} */ ($('many-palettes')).checked) {
  // (The design's look for every book; its text is the book's own: one book's subtitle, series,
  // credit, badge or language isn't another's. A list can give each its own.)
  const base = optionsFor(lookOf(d));
  const start = Math.max(
    0,
    palettes.findIndex((p) => p.id === d.palette),
  );
  // (The book's own values win; see optionsForBook for its style, genre and size.)
  return optionsForBook(book, {
    ...base,
    ...(own && !book.palette ? { palette: palettes[(start + i) % palettes.length].id } : {}),
  });
}

/**
 * A design's look, without its text: what Many covers lends every book (its subtitle, series,
 * credit, badge and language are each book's own), and what its preview is drawn again for.
 * @param {Design} d
 */
function lookOf(d) {
  return { ...d, title: '', author: '', subtitle: '', series: '', credit: '', badge: '', lang: '' };
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let manyTimer;
/** The design the list's preview was last drawn for (title and author aside). */
let lastManyKey = '';
/** List covers still to draw: each book, and its place in the list. @type {{ img: HTMLImageElement, book: import('../src/index.js').CoverOptions, i: number }[]} */
let manyQueue = [];

/** Draw the next queued list cover (a few per frame, so a long list never stalls the page). */
const scheduleMany = sliced(() => {
  const item = manyQueue.shift();
  if (!item) return false;
  try {
    item.img.src = svgToDataUrl(createCover(bookOptions(item.book, item.i)).svg);
  } catch {
    // A row the library refuses (an unknown style, a size it can't make): shown empty, reported on download.
  }
  return true;
});

/** The count and the first covers of the list, as they will come out. */
function renderMany() {
  const { books, error } = listedBooks();
  const extra = books.length > MAX_BOOKS ? ` (the first ${MAX_BOOKS} are made)` : '';
  $('many-count').textContent =
    error || (books.length ? `${books.length} book${books.length === 1 ? '' : 's'}${extra}` : '');
  lastManyKey = JSON.stringify(lookOf(design));
  manyQueue = [];
  $('many-preview').replaceChildren(
    ...books.slice(0, PREVIEWED).map((book, i) => {
      const img = /** @type {HTMLImageElement} */ (h('img', { alt: '' }));
      manyQueue.push({ img, book, i });
      return h('li', {}, img);
    }),
  );
  scheduleMany();
}

function buildMany() {
  const later = () => {
    clearTimeout(manyTimer);
    manyTimer = setTimeout(renderMany, 250);
  };
  $('many-list').addEventListener('input', later);
  $('many').addEventListener('toggle', renderMany);
  $('many-palettes').addEventListener('change', renderMany);
  const button = /** @type {HTMLButtonElement} */ ($('many-download'));
  button.addEventListener('click', () => busyWhile(button, downloadMany));
}

/** Every book in the list as a PNG or SVG, together in one ZIP. */
async function downloadMany() {
  const { books, error } = listedBooks();
  if (!books.length) {
    fail(error || 'Add a book per line first');
    return;
  }
  // Taken now: changing the design while the ZIP is made doesn't change the books still to draw.
  const d = { ...design };
  const own = /** @type {HTMLInputElement} */ ($('many-palettes')).checked;
  const chosen = scaleFor(d.format);
  const format = /** @type {HTMLSelectElement} */ ($('many-format')).value;
  const button = $('many-download');
  const list = books.slice(0, MAX_BOOKS);
  /** @type {Set<string>} */
  const taken = new Set();
  /** @type {{ name: string, data: Blob | string }[]} */
  const files = [];
  /** @type {string[]} */
  const failed = [];
  try {
    for (const [i, book] of list.entries()) {
      button.textContent = `Drawing ${i + 1} of ${list.length}…`;
      // A book that can't be made (an unknown style, a size too large to draw) is left out and
      // reported; the others are saved.
      try {
        const cover = createCover(bookOptions(book, i, d, own));
        const base = `${String(i + 1).padStart(String(list.length).length, '0')}-${slug(oneLine(cover.title))}`;
        if (format === 'svg') files.push({ name: uniqueName(base, 'svg', taken), data: cover.svg });
        else {
          // The chosen scale, within what this book's own size allows (10,000 px, the device's canvas).
          const scale = Math.min(chosen, maxScaleOf(cover.width, cover.height));
          const blob = await rasterize(cover.svg, { scale, dpi: DPI });
          files.push({ name: uniqueName(base, extensionOf(blob) ?? 'png', taken), data: blob });
        }
      } catch (err) {
        const title = oneLine(String(book.title ?? '')) || 'Untitled';
        failed.push(`${i + 1}. ${title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // The books left out, and why, in the panel.
    $('many-failed').hidden = !failed.length;
    $('many-failed-list').replaceChildren(...failed.map((why) => h('li', {}, why)));
    if (!files.length) {
      fail('None of the books could be made: the panel says why.');
      return;
    }
    downloadBlob(await zipFiles(files), 'covers.zip');
    toast(
      `Saved ${files.length} cover${files.length === 1 ? '' : 's'} in covers.zip` +
        (failed.length ? `; ${failed.length} couldn’t be made (listed in the panel)` : ''),
    );
  } catch (err) {
    console.error(err);
    fail('Export failed. Try SVG, or fewer books.');
  } finally {
    button.textContent = 'Download all as ZIP';
  }
}

/* ------------------------------------------------------------------- print */

const PRINT_KEY = 'book-cover-generator:print';
/**
 * On a phone the preview is pinned at the top: what gets focus under it is scrolled clear (WCAG
 * 2.4.11). The page's scroll-padding does this in Chrome and Firefox; Safari scrolls only for what
 * is outside the window, so it's checked here once the browser has done its own scrolling.
 */
function keepFocusInView() {
  const wrap = /** @type {HTMLElement} */ (document.querySelector('.preview-wrap'));
  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || wrap.contains(target)) return;
    requestAnimationFrame(() => {
      if (getComputedStyle(wrap).position !== 'sticky') return;
      const [covered, r] = [wrap.getBoundingClientRect(), target.getBoundingClientRect()];
      if (r.height && r.bottom > covered.top && r.top < covered.bottom) {
        window.scrollBy({ top: r.top - covered.bottom - 12, behavior: 'instant' });
      }
    });
  });
}

/** The paperback's settings, as the print form holds them. */
const PRINT_DEFAULTS = {
  trim: '6x9',
  pages: 300,
  paper: 'white',
  hook: '',
  blurb: '',
  imprint: '',
  /** The back's colour and the spine's, by their place in the cover's palette: bg, ink, a0… */
  back: 'bg',
  spine: 'ink',
};
/** @typedef {typeof PRINT_DEFAULTS} PrintSettings */
/** @type {ReturnType<typeof setTimeout> | undefined} */
let printTimer;
let lastPrintKey = '';
const PRINT_FIELDS = /** @type {const} */ (['trim', 'pages', 'paper', 'hook', 'blurb', 'imprint', 'back', 'spine']);

/** The print settings last used in this browser (a convenience: they aren't in the link). */
function savedPrint() {
  const out = { ...PRINT_DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(PRINT_KEY) || '{}');
    for (const key of PRINT_FIELDS) {
      if (typeof saved?.[key] === typeof PRINT_DEFAULTS[key]) /** @type {any} */ (out)[key] = saved[key];
    }
  } catch {
    // Storage blocked, or something else there: the defaults.
  }
  return out;
}

/** @param {string} id */
const field = (id) => /** @type {HTMLInputElement} */ ($(id));

/** The print form's settings. @returns {PrintSettings} */
function printSettings() {
  return {
    trim: field('print-trim').value,
    pages: Number(field('print-pages').value),
    paper: field('print-paper').value,
    hook: field('print-hook').value,
    blurb: field('print-blurb').value,
    imprint: field('print-imprint').value,
    back: $('print-back').dataset.value ?? PRINT_DEFAULTS.back,
    spine: $('print-spine').dataset.value ?? PRINT_DEFAULTS.spine,
  };
}

/** A colour of the cover's palette by its place (bg, ink, a0…). @param {string} key @param {ReturnType<typeof createCover>['colors']} colors */
function paletteColour(key, colors) {
  if (key === 'bg') return colors.bg;
  if (key === 'ink') return colors.ink;
  return colors.accents[Number(key.slice(1))] ?? colors.ink;
}

/** The back's and the spine's colour choices: the cover's palette as swatches (the choice kept, as a place in it). */
function printColourMenus() {
  const { colors } = current;
  // (Each accent once: a palette of your own with one accent is padded to three of the same.)
  const accents = colors.accents.flatMap((c, i) => (colors.accents.indexOf(c) === i ? [i] : []));
  const choices = [
    ['bg', 'Background'],
    ['ink', 'Ink'],
    ...accents.map((i, k) => [`a${i}`, accents.length > 1 ? `Accent ${k + 1}` : 'Accent']),
  ];
  for (const id of /** @type {const} */ (['print-back', 'print-spine'])) {
    const group = $(id);
    const fallback = id === 'print-back' ? 'bg' : 'ink';
    const chosen = group.dataset.value ?? (id === 'print-back' ? savedPrint().back : savedPrint().spine);
    group.dataset.value = choices.some(([key]) => key === chosen) ? chosen : fallback;
    const labels = choices.map(([key, name]) => `${key}:${name}:${paletteColour(key, colors)}`).join('|');
    if (group.dataset.labels !== labels) {
      group.dataset.labels = labels;
      group.replaceChildren(
        ...choices.map(([key, name]) => {
          const colour = paletteColour(key, colors);
          const button = h(
            'button',
            {
              type: 'button',
              className: 'colour-choice',
              'data-key': key,
              title: `${name} · ${colour}`,
              'aria-label': name,
            },
            h('span', { className: 'colour-chip' }),
          );
          /** @type {HTMLElement} */ (button.firstChild).style.background = colour;
          return button;
        }),
      );
    }
    for (const b of group.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-key') === group.dataset.value));
    }
  }
}

/**
 * The paperback cover for a design and the print settings.
 * @param {Design} d @param {PrintSettings} settings @param {boolean} guides
 */
function printCoverOf(d, settings, guides) {
  const { colors } = current;
  return createPrintCover(optionsFor(d), {
    trim: settings.trim,
    pages: settings.pages,
    paper: settings.paper,
    hook: settings.hook,
    blurb: settings.blurb,
    imprint: settings.imprint,
    backColor: paletteColour(settings.back, colors),
    spineColor: paletteColour(settings.spine, colors),
    guides,
  });
}

/** The preview and the sizes, when the panel is open. */
function renderPrint() {
  if (!(/** @type {HTMLDetailsElement} */ ($('print')).open)) return;
  printColourMenus();
  const settings = printSettings();
  // The page count the paper takes (standard colour 72 to 600…), for the field's arrows.
  const range = printLimits.pages[/** @type {keyof typeof printLimits.pages} */ (settings.paper)];
  if (range) [field('print-pages').min, field('print-pages').max] = range.map(String);
  lastPrintKey = JSON.stringify({ design, settings });
  try {
    localStorage.setItem(PRINT_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: the settings last as long as the page.
  }
  const preview = /** @type {HTMLImageElement} */ ($('print-preview'));
  try {
    const print = printCoverOf(design, settings, true);
    preview.src = svgToDataUrl(print.svg);
    field('print-pages').removeAttribute('aria-invalid');
    const { width, height, spine } = print.inches;
    const inches = (/** @type {number} */ v) => v.toFixed(3).replace(/\.?0+$/, '');
    $('print-size').textContent =
      `Whole cover ${inches(width)} × ${inches(height)} in, spine ${inches(spine)} in` +
      (print.spineText ? '' : ` (no spine text: ${settings.pages < 80 ? 'under 80 pages' : 'too thin to read'})`);
  } catch (err) {
    preview.removeAttribute('src');
    $('print-size').textContent = err instanceof Error ? err.message : String(err);
    // (The field says what's wrong: the status line under it describes it.)
    if (/pages/.test(String(err))) field('print-pages').setAttribute('aria-invalid', 'true');
  }
}

function buildPrint() {
  const saved = savedPrint();
  const trims = /** @type {HTMLSelectElement} */ ($('print-trim'));
  trims.replaceChildren(
    ...Object.entries(trimSizes).map(([name, [w, h2]]) => h('option', { value: name }, `${w} × ${h2}`)),
  );
  for (const key of PRINT_FIELDS) {
    if (key === 'back' || key === 'spine') continue;
    const input = field(`print-${key}`);
    input.value = String(saved[key]);
    // (A trim saved that the menu no longer has: the default.)
    if (input.value !== String(saved[key])) input.value = String(PRINT_DEFAULTS[key]);
  }
  const later = () => {
    clearTimeout(printTimer);
    printTimer = setTimeout(renderPrint, 250);
  };
  for (const key of PRINT_FIELDS) {
    if (key === 'back' || key === 'spine') continue;
    field(`print-${key}`).addEventListener(
      key === 'blurb' || key === 'hook' || key === 'imprint' || key === 'pages' ? 'input' : 'change',
      later,
    );
  }
  for (const id of ['print-back', 'print-spine']) {
    $(id).addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('button[data-key]');
      if (!(b instanceof HTMLElement) || !b.dataset.key) return;
      $(id).dataset.value = b.dataset.key;
      // (Drawn at once: the swatch pressed shows it is chosen.)
      renderPrint();
    });
  }
  $('print').addEventListener('toggle', renderPrint);
  const pdf = /** @type {HTMLButtonElement} */ ($('print-pdf'));
  pdf.addEventListener('click', () =>
    busyWhile(pdf, async () => {
      // Taken now: the design may change while the PDF is drawn.
      const d = { ...design };
      const settings = printSettings();
      try {
        const print = printCoverOf(d, settings, false);
        pdf.textContent = 'Drawing the PDF…';
        const blob = await svgToPdf(print.svg, { bleed: print.inches.bleed, title: oneLine(d.title) });
        downloadBlob(blob, `${slug(d.title)}-paperback-${settings.trim}.pdf`);
        toast(
          `Saved the print PDF · ${print.inches.width.toFixed(3).replace(/\.?0+$/, '')} × ${print.inches.height} in at ${DPI} dpi`,
        );
      } catch (err) {
        console.error(err);
        fail(err instanceof RangeError ? err.message : 'The PDF could not be made. Try the SVG.');
      } finally {
        pdf.textContent = 'Download print PDF';
      }
    }),
  );
  $('print-svg').addEventListener('click', () => {
    try {
      const print = printCoverOf({ ...design }, printSettings(), false);
      downloadBlob(svgToBlob(print.svg), `${slug(design.title)}-paperback-${printSettings().trim}.svg`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  });
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/** How long the toast on show stays, from when it is shown or the pointer leaves it. */
let toastFor = 0;

/** A live region's text; if it holds this text already, changed anyway (a trailing no-break space) so it is read again. @param {HTMLElement} el @param {string} msg */
function say(el, msg) {
  el.textContent = el.textContent === msg ? `${msg}\u00A0` : msg;
}

function hideToast() {
  clearTimeout(toastTimer);
  const el = $('toast');
  el.classList.remove('show');
  // (Its button goes with it, so nothing unseen takes keyboard focus.)
  el.querySelector('button')?.remove();
}

function hideAlert() {
  $('alert').classList.remove('show');
  $('alert-close').hidden = true;
}

/**
 * A message that comes and goes: on show long enough to read it (four seconds at least, longer for
 * a long one), and for as long as the pointer is over it or focus is in it. An action, such as
 * Undo, gets a button.
 * @param {string} msg @param {{ action?: string, run?: () => void }} [opts]
 */
function toast(msg, { action, run } = {}) {
  hideAlert();
  hideToast();
  const el = $('toast');
  say(el, msg);
  if (action && run) {
    const button = h('button', { type: 'button', className: 'toast-action' }, action);
    button.addEventListener('click', () => {
      hideToast();
      run();
    });
    el.append(' ', button);
  }
  el.classList.add('show');
  toastFor = Math.max(4000, 1500 + msg.split(/\s+/).length * 300) + (action ? 3000 : 0);
  toastTimer = setTimeout(hideToast, toastFor);
}

/** Something that went wrong: it looks different, is announced at once, and stays until dismissed. @param {string} msg */
function fail(msg) {
  hideToast();
  say($('alert-text'), msg);
  $('alert-close').hidden = false;
  $('alert').classList.add('show');
}

function buildToasts() {
  const el = $('toast');
  const hold = () => clearTimeout(toastTimer);
  const resume = () => {
    clearTimeout(toastTimer);
    if (el.classList.contains('show') && !el.matches(':hover, :focus-within')) {
      toastTimer = setTimeout(hideToast, Math.min(toastFor, 3000));
    }
  };
  el.addEventListener('pointerenter', hold);
  el.addEventListener('focusin', hold);
  el.addEventListener('pointerleave', resume);
  el.addEventListener('focusout', resume);
  $('alert-close').addEventListener('click', hideAlert);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('alert').classList.contains('show')) hideAlert();
  });
}

/* -------------------------------------------------------------------- boot */

// A design's link as Copy link makes it (/?title=…): the design moves to the #fragment, where the
// app keeps it (and the query goes, so the page's address is the app's again).
const sharedLink = new URLSearchParams(location.search).has('title') && location.hash.length < 2;
if (sharedLink) {
  safely(() => history.replaceState(history.state, '', `${location.pathname}#${location.search.slice(1)}`));
}
// A shared link opens the same cover every time (see complete()); with no link, the sample stays.
const linked = fromHash(location.hash.length > 1 ? location.hash : sharedLink ? location.search : '');
if (Object.keys(linked).length) Object.assign(design, complete(linked));
else {
  // With no link, the first cover is in the genre chosen last time: a starter that suits it, if any
  // (else the sample in a style of the genre, in a palette and variation picked for it).
  const genre = ui.genre;
  const suits = genre ? STYLES.filter((s) => s.genres.includes(genre)).map((s) => s.id) : [];
  const starters = STARTERS.filter((starter) => suits.includes(starter.style));
  if (starters.length) Object.assign(design, pick(starters));
  else if (suits.length) Object.assign(design, { style: pick(suits), palette: 'auto', seed: randomSeed() });
}
/** The sample title shown to a first-time visitor: selected when first focused, so typing replaces it. */
const sampleTitle = Object.keys(linked).length ? '' : design.title;
const linkedHash = location.hash;
// A fragment can name a place on the page: alone (#usage, from a header link opened in a new tab),
// or before a design (#usage&title=…, from the gallery's header). The URL is about to hold just the
// design, so scroll there once the page is built.
let anchor = /** @type {HTMLElement | null} */ (null);
const place = location.hash.slice(1).split('&')[0];
if (place && !place.includes('=')) {
  try {
    anchor = document.getElementById(decodeURIComponent(place));
  } catch {
    // A malformed fragment: nothing to scroll to.
  }
}
restoreSteps();
// Nothing in the page is a place the browser should scroll back to.
history.scrollRestoration = 'manual';
writeUrl();
registerServiceWorker();
keepFocusInView();
buildToasts();
buildControls();
buildRail();
buildVariations();
render();
renderKept();
syncHistoryButtons();
if (anchor) {
  anchor.scrollIntoView();
  // Keyboard focus starts there too, as following an in-page link does, so Tab goes on from it.
  if (!anchor.hasAttribute('tabindex')) anchor.setAttribute('tabindex', '-1');
  anchor.focus({ preventScroll: true });
}
if (Object.keys(linked).length) noteVersion(linkedHash);
