import {
  createCover,
  listStyles,
  palettes,
  pickStyle,
  randomSeed,
  version,
  formats,
  sizeLimits,
  FONTS,
  createMockup,
  parseBookList,
  optionsForBook,
  genres,
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
} from '../src/browser.js';
import { hashString, contrast } from '../src/core.js';
import { CUSTOM_SIZE, customColors, slug } from '../src/shared.js';
import { LINK_FIELDS, fits, lastValues, writeLink, customPalette, variantOf } from '../src/link.js';

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
 */
/** @typedef {{ design: Design, svg: string }} Kept  a kept design, and the cover as it was drawn then ('' if unknown) */
/** @typedef {{ button: HTMLButtonElement, img: HTMLImageElement, visible: boolean, dirty: boolean }} Tile  visible: on screen or close to it */

/** The preset formats (the library's, as the CLI's --format has them too). */
const FORMATS = formats;
const MAX_SIDE = sizeLimits.max;
/** The most pixels an image is drawn with where it needn't be larger (iOS Safari's canvas limit). */
const MAX_PIXELS = 16_000_000;
/** Pixels per inch recorded in PNG and JPEG downloads, so print software sizes them right. */
const DPI = 300;
const STYLES = listStyles();
const STYLE_IDS = STYLES.map((s) => s.id);
/** @type {Set<string>} */
const PALETTE_IDS = new Set(['auto', ...palettes.map((p) => p.id)]);
// First-time visitors start on one of the strongest styles with a sample title.
const STARTERS = [
  'artdeco',
  'bigtype',
  'thriller',
  'botanical',
  'swiss',
  'landscape',
  'retro',
  'bauhaus',
  'aurora',
  'papercut',
];
const SAMPLES = [
  ['The Lighthouse Keeper', 'Mara Ellison'],
  ['Salt and Static', 'J. R. Okafor'],
  ['A Map of Quiet Places', 'Lena Hart'],
  ['Neon Tide', 'Kai Moreno'],
  ['The Glass Orchard', 'Theo Vance'],
  ['Small Gods of Winter', 'Ines Calder'],
  ['Signal Lost', 'R. M. Price'],
  ['Midnight Arithmetic', 'Ada Lindqvist'],
  ['The Last Cartographer', 'Elias Brandt'],
  ['Under Paper Skies', 'Noor Haddad'],
];
const KEEP_KEY = 'book-cover-generator:kept';
const SHORTCUTS_KEY = 'book-cover-generator:shortcuts';
const GENRE_KEY = 'book-cover-generator:genre';
/** @type {Record<string, string>} */
const LETTER_CODES = { KeyR: 'r', KeyZ: 'z', KeyY: 'y' };
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
  if (!isCustomSize(format)) return FORMATS[/** @type {Preset} */ (format)];
  const m = CUSTOM_SIZE.exec(format);
  return m ? [Number(m[1]), Number(m[2])] : FORMATS.paperback;
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

const [sampleTitle, sampleAuthor] = pick(SAMPLES);
/** @type {Design} */
const design = {
  title: sampleTitle,
  author: sampleAuthor,
  subtitle: '',
  series: '',
  credit: '',
  badge: '',
  style: pick(STARTERS),
  variant: '',
  font: '',
  case: '',
  palette: 'auto',
  seed: randomSeed(),
  format: 'paperback',
  texture: false,
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
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of KEYS) {
    const value = Object.hasOwn(raw, key) ? FIELDS[key].read(raw[key]) : undefined;
    if (value !== undefined) out[key] = value;
  }
  return /** @type {Partial<Design>} */ (out);
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

// Every discrete change is a history entry, so Undo/Redo and the browser's
// Back/Forward step through designs. A burst of typing is one entry. The
// position survives a reload: the entry's index is in history.state, and the
// newest index in sessionStorage.
const MAX_KEY = 'book-cover-generator:history-max';
let historyIndex = 0;
let historyMax = 0;

/** Fields links may leave out, with the values of a design that does (as entries of ours without them have). */
const OPTIONAL = /** @type {Partial<Design>} */ (
  Object.fromEntries(KEYS.filter((key) => FIELDS[key].optional).map((key) => [key, FIELDS[key].empty]))
);
/** The keys every link names; one that names them all is a whole design. */
const WHOLE_KEYS = KEYS.filter((key) => !FIELDS[key].optional);

function saveHistoryMax() {
  try {
    sessionStorage.setItem(MAX_KEY, String(historyMax));
  } catch {
    // Storage blocked: Redo after a reload just starts fresh.
  }
}
let typing = false;
/** The field of the current typing burst: typing in another field starts a new step. */
let typingField = '';
/**
 * The Undo (-1) or Redo (1) in flight until its popstate arrives: the index it left and when.
 * A popstate is that step only if it lands on `from + dir`; anything else is the browser's own.
 * @type {{ from: number, dir: number, at: number } | null}
 */
let pending = null;
/**
 * Undo/Redo presses (-1, 1) and changes made while a step was in flight, applied in order once it
 * lands: a change made then would otherwise be pushed after the entry the step is leaving.
 * @type {(number | { patch: Partial<Design>, kind: 'discrete' | 'typing' })[]}
 */
let queued = [];
/** @type {ReturnType<typeof setTimeout> | undefined} */
let drainTimer;
/** A step still expected (its popstate can be dropped by the browser: then, after a second, not). */
const inFlight = () => pending !== null && performance.now() - pending.at < 1000;
/** Forget queued Undo/Redo presses (not changes): they were for a step that never came. */
const dropSteps = () => {
  queued = queued.filter((item) => typeof item !== 'number');
};
/** @type {ReturnType<typeof setTimeout> | undefined} */
let typingTimer;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let replaceTimer;
/** Keystrokes not yet written to the typing burst's entry. */
let replaceDirty = false;
const REPLACE_MS = 300;

/**
 * Write to the history, ignoring the SecurityError browsers throw when pages
 * update history too often (the design still updates; only that step is lost).
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

/** Times of recent history writes. Safari allows about 100 in 30 s; typing slows down well before. */
/** @type {number[]} */
const recentWrites = [];

/** How long a typing burst waits between history writes: longer once many were made recently. */
function replaceInterval() {
  const now = performance.now();
  return recentWrites.filter((time) => now - time <= 30_000).length > 40 ? 2000 : REPLACE_MS;
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let stampTimer;
/** Counts entry changes (pushes and traversals), so a delayed write can tell it is stale. */
let entryGen = 0;
/**
 * Each entry this tab made, by index: its URL fragment and design. For an entry whose state
 * the browser refused to store, this is how a later visit to it is recognised and shown.
 * @type {Map<number, { hash: string, design: Design }>}
 */
const known = new Map();

/** Forget entries past the last one (the browser dropped them). */
function forgetAhead() {
  for (const index of known.keys()) if (index > historyMax) known.delete(index);
}

/** The index of an entry this tab made with this URL fragment, nearest the current one. @param {string} hash */
function knownIndex(hash) {
  /** @type {number | null} */
  let found = null;
  for (const [index, entry] of known) {
    if (entry.hash === hash && (found === null || Math.abs(index - historyIndex) < Math.abs(found - historyIndex))) {
      found = index;
    }
  }
  return found;
}

/** Whether the URL holds this fragment (compared as parameters, whatever the encoding). @param {string} hash */
const urlHolds = (hash) =>
  new URLSearchParams(location.hash.slice(1)).toString() === new URLSearchParams(hash.slice(1)).toString();
/** The URL fragment of the current entry, as last written or visited. */
let entryHash = '';
/**
 * Write the design and the index into the current entry. A write the browser refuses
 * (rate-limited) is retried, so an entry is not left without its index, which would make
 * a later visit to it look like a new entry.
 */
function stamp(gen = entryGen) {
  clearTimeout(stampTimer);
  stampTimer = undefined;
  // Another entry is current now (a click or Back since): this write was for the old one.
  if (gen !== entryGen) return;
  known.set(historyIndex, { hash: location.hash, design: { ...design } });
  const hash = toHash(design);
  // A write can fail silently (Chrome ignores some when rate-limited): check both the state and the URL.
  if (
    !safely(() => history.replaceState({ i: historyIndex }, '', hash)) ||
    history.state?.i !== historyIndex ||
    !urlHolds(hash)
  ) {
    stampTimer = setTimeout(() => stamp(gen), 1000);
    return;
  }
  entryHash = location.hash;
  known.set(historyIndex, { hash: entryHash, design: { ...design } });
}

/** Write the current design into the current entry. */
function writeReplace() {
  replaceDirty = false;
  stamp();
}

/** Save keystrokes not yet in the current entry, now. */
function flushReplace() {
  clearTimeout(replaceTimer);
  replaceTimer = undefined;
  if (replaceDirty) writeReplace();
}

/**
 * Keystrokes within a typing burst update the burst's entry: at once, then at most
 * every REPLACE_MS, or less often after many writes (browsers rate-limit history writes). The entry is never more than
 * that behind, even if the toolbar's Back button (which can't be intercepted) leaves it.
 */
function scheduleReplace() {
  replaceDirty = true;
  if (replaceTimer !== undefined) return;
  writeReplace();
  const tick = () => {
    replaceTimer = undefined;
    if (replaceDirty) {
      writeReplace();
      replaceTimer = setTimeout(tick, replaceInterval());
    }
  };
  replaceTimer = setTimeout(tick, replaceInterval());
}

/** A new history step for the current design. Callers save pending keystrokes first (update()). */
function commit() {
  // A discrete change ends any typing burst, so later keystrokes get their own step.
  typing = false;
  clearTimeout(typingTimer);
  // Chrome may ignore a pushState without throwing when a page writes history too fast:
  // only count the entry if it is really there.
  const pushed =
    safely(() => history.pushState({ i: historyIndex + 1 }, '', toHash(design))) &&
    history.state?.i === historyIndex + 1;
  if (pushed) {
    entryGen += 1;
    entryHash = location.hash;
    known.set(historyIndex + 1, { hash: entryHash, design: { ...design } });
    historyIndex += 1;
    historyMax = historyIndex;
    forgetAhead();
    saveHistoryMax();
  } else {
    // Rate-limited: update the current entry instead (which may also be refused).
    writeReplace();
  }
  syncHistoryButtons();
}

/** @param {string} field the field being typed in */
function typed(field) {
  if (!typing) {
    commit();
    typing = true;
    typingField = field;
  } else scheduleReplace();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    typing = false;
  }, 1200);
}

function syncHistoryButtons() {
  // aria-disabled rather than disabled: a focused button that becomes disabled drops keyboard
  // focus to the page. (Pressing it does nothing then: step() checks the index.)
  $('undo').setAttribute('aria-disabled', String(historyIndex <= 0));
  $('redo').setAttribute('aria-disabled', String(historyIndex >= historyMax));
}

// The browser's own Back and Forward leave the entry before popstate fires, too
// late to save a typing burst's last keystrokes into it. Save them on the
// shortcuts and mouse buttons that navigate, and when the page is hidden.
document.addEventListener(
  'keydown',
  (e) => {
    const nav =
      e.key === 'BrowserBack' ||
      e.key === 'BrowserForward' ||
      ((e.altKey || e.metaKey) && ['ArrowLeft', 'ArrowRight', '[', ']'].includes(e.key));
    if (nav) flushReplace();
  },
  { capture: true },
);
window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button === 3 || e.button === 4) flushReplace();
  },
  { capture: true },
);
window.addEventListener('pagehide', flushReplace);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushReplace();
});

window.addEventListener('popstate', (e) => {
  arrive(e);
  // What came in while a step was in flight.
  drain();
});

/** @param {PopStateEvent} e */
function arrive(e) {
  // The entry being left can no longer be written: what it missed is lost.
  clearTimeout(replaceTimer);
  replaceTimer = undefined;
  replaceDirty = false;
  clearTimeout(stampTimer);
  stampTimer = undefined;
  entryGen += 1;
  typing = false;
  const arrived = pending;
  pending = null;
  const ours = Boolean(e.state) && typeof e.state.i === 'number';
  /** Which way our Undo or Redo moved, if this popstate is that step; 0 for the browser's own. */
  let dir = 0;
  if (ours) {
    if (arrived && e.state.i === arrived.from + arrived.dir) dir = arrived.dir;
    historyIndex = e.state.i;
    entryHash = location.hash;
    // An entry of ours that is reachable again (toolbar Forward after the max was lowered).
    if (historyIndex > historyMax) {
      historyMax = historyIndex;
      saveHistoryMax();
    }
  }
  const linked = ours ? null : fromHash(location.hash);
  /** The design of an entry whose state was never stored, if this tab made it. @type {Design | null} */
  let remembered = null;
  if (!ours) {
    const seen = knownIndex(location.hash);
    if (arrived && performance.now() - arrived.at < 1000) {
      // Undo or Redo landed on an entry whose index was never written (the browser refused).
      dir = arrived.dir;
      historyIndex = arrived.from + arrived.dir;
      remembered = known.get(historyIndex)?.design ?? null;
    } else if (location.hash === entryHash) {
      // The same URL again (Enter in the address bar): the browser replaced this entry.
    } else if (seen !== null) {
      // The toolbar's Back or Forward onto such an entry: recognised by its URL.
      historyIndex = seen;
      remembered = known.get(seen)?.design ?? null;
    } else {
      // A new entry (an edited URL, a pasted link, or a fragment like #usage): the browser put
      // it right after the one we were on and dropped any ahead of it.
      historyIndex += 1;
      historyMax = historyIndex;
      forgetAhead();
      saveHistoryMax();
    }
  }
  // Presses queued for an Undo or Redo don't carry over to the browser's own navigation.
  if (!dir) dropSteps();
  if (linked && !remembered && !Object.keys(linked).length) {
    // A fragment that isn't a design (say #usage, typed to jump to the docs): keep the design.
    stamp();
    syncHistoryButtons();
    return;
  }
  // Undo and Redo pass over entries that show the same design, so every press changes something.
  if (ours && dir && toHash({ ...design, ...OPTIONAL, ...fromHash(location.hash) }) === toHash(design)) {
    if (dir < 0 ? historyIndex > 0 : historyIndex < historyMax) {
      go(dir);
      return;
    }
  }
  // The app's own entries hold whole designs (older ones leave out empty optional keys); an
  // edited URL changes just the keys it names, and a pasted link names them all. A link from
  // before 1.2.0 names every key but the optional ones, which it left out when empty or off.
  if (!linked) Object.assign(design, OPTIONAL, fromHash(location.hash));
  else if (remembered) Object.assign(design, remembered);
  else {
    // (Judged by the keys the URL names: an unknown value is dropped, but the link is still whole,
    // and opens as it would in a new tab.)
    const named = new URLSearchParams(location.hash.slice(1));
    const whole = WHOLE_KEYS.every((key) => named.has(key));
    Object.assign(design, whole ? complete(linked) : linked);
    if (whole) noteVersion(location.hash);
  }
  // Rewrite an edited URL so it always holds the whole design (for Copy link).
  if (!ours) stamp();
  render({ fade: true, announce: true });
  syncHistoryButtons();
}

/**
 * Apply a change and re-render (after any Undo or Redo still in flight).
 * @param {Partial<Design>} patch
 * @param {'discrete' | 'typing'} [kind]
 */
function update(patch, kind = 'discrete') {
  queued.push({ patch, kind });
  drain();
}

/** Apply queued presses and changes in order, until a step has to wait for its popstate. */
function drain() {
  clearTimeout(drainTimer);
  while (queued.length && !inFlight()) {
    const next = /** @type {(typeof queued)[number]} */ (queued.shift());
    if (typeof next === 'number') go(next);
    else apply(next.patch, next.kind);
  }
  // A step whose popstate never comes stops holding changes back after a second (and the presses
  // queued behind it are dropped with it).
  if (queued.length && pending) {
    drainTimer = setTimeout(
      () => {
        dropSteps();
        drain();
      },
      Math.ceil(pending.at + 1000 - performance.now()) + 1,
    );
  }
}

/**
 * @param {Partial<Design>} change
 * @param {'discrete' | 'typing'} kind
 */
function apply(change, kind) {
  // Pinned choices belong to a style: another style starts with none.
  const restyled = change.style !== undefined && change.style !== design.style && !('variant' in change);
  const patch = restyled ? { ...change, variant: '' } : change;
  const changed = Object.entries(patch).some(([key, value]) => design[/** @type {keyof Design} */ (key)] !== value);
  if (!changed) return;
  const field = kind === 'typing' ? Object.keys(patch).join() : '';
  // A discrete change, or typing in another field, is a new step: first save the burst's last
  // keystrokes to its own entry.
  if (kind === 'discrete' || !typing || field !== typingField) {
    flushReplace();
    typing = false;
  }
  Object.assign(design, patch);
  if (kind === 'typing') typed(field);
  else commit();
  render({ fade: kind === 'discrete', announce: kind === 'discrete' });
}

/* ------------------------------------------------------------------ render */

/** Cover options for a design. @param {Design} d @param {Partial<import('../src/index.js').CoverOptions>} [extra] */
function optionsFor(d, extra = {}) {
  const [width, height] = sizeOf(d.format);
  const colors = customColors(d.palette);
  return {
    title: d.title,
    author: d.author,
    subtitle: d.subtitle,
    series: d.series,
    credit: d.credit,
    badge: d.badge,
    style: d.style,
    palette: colors
      ? { bg: colors[0], ink: colors[1], accents: colors.slice(2) }
      : d.palette === 'auto'
        ? 'random'
        : d.palette,
    seed: d.seed,
    texture: d.texture,
    variants: pinsFor(d.variant, extra.style ?? d.style),
    font: d.font || undefined,
    titleCase: /** @type {'upper' | 'normal' | undefined} */ (d.case || undefined),
    width,
    height,
    ...extra,
  };
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
  const empty = /** @type {Design} */ (Object.fromEntries(KEYS.map((key) => [key, FIELDS[key].empty])));
  /** @type {Design} */
  const d = { ...empty, ...partial };
  if (!partial.style) d.style = pickStyle({ ...d, style: 'random' });
  return d;
}

let lastAnnouncement = '';
let lastGalleryKey = '';
/** @type {ReturnType<typeof setTimeout> | undefined} */
let galleryTimer;

/** @param {{ fade?: boolean, announce?: boolean }} [opts] */
function render({ fade = false, announce = false } = {}) {
  applyShape();
  renderPreview(fade, announce);
  // The list's preview follows the design too (not its title and author, which the list replaces).
  const manyKey = JSON.stringify({ ...design, title: '', author: '' });
  if (manyKey !== lastManyKey && /** @type {HTMLDetailsElement} */ ($('many')).open) {
    lastManyKey = manyKey;
    clearTimeout(manyTimer);
    manyTimer = setTimeout(renderMany, typing ? 250 : 0);
  }
  syncControls();
  markRail();
  // The gallery shows every style, so it only changes when something other than the style does.
  const key = JSON.stringify({ ...design, style: '' });
  if (key !== lastGalleryKey) {
    lastGalleryKey = key;
    clearTimeout(galleryTimer);
    if (typing) galleryTimer = setTimeout(invalidateGallery, 200);
    else invalidateGallery();
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
  /** @type {Record<string, string>} */
  const pins = {};
  const offered = STYLES.find((s) => s.id === style)?.variants ?? [];
  for (const pair of variant ? variant.split('-') : []) {
    const [name, value] = pair.split('.');
    if (offered.some((v) => v.name === name && v.values.some((x) => x.value === value))) pins[name] = value;
  }
  return pins;
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
      'Auto',
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
        'aria-label': 'Your own colours',
        'data-palette': 'custom',
      },
      h('span', { className: 'sw-aa' }, 'Aa'),
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
      toast(`Sizes go from ${min} to ${max.toLocaleString('en')} px, at most ${ratio} times as tall as wide`);
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
  $('redo').addEventListener('click', redo);

  const copyImageButton = /** @type {HTMLButtonElement} */ ($('copy-image'));
  copyImageButton.hidden = !canCopyImage();
  copyImageButton.addEventListener('click', () =>
    busyWhile(copyImageButton, async () => {
      const [w, hgt] = sizeOf(design.format);
      const scale = scaleFor(design.format);
      try {
        await copyImage(current.svg, { scale });
        toast(`Image copied · ${w * scale} × ${hgt * scale} px`);
      } catch (err) {
        console.warn(err);
        toast('Could not copy the image. Try Download PNG.');
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
      toast('Could not access the clipboard');
    }
  });
  $('copy-link').addEventListener('click', async () => {
    flushReplace();
    try {
      // From the design itself: a history write the browser refused would leave the URL behind.
      await copyText(new URL(toHash(design), location.href).href);
      toast('Link copied: it opens this exact design');
    } catch {
      toast('Could not access the clipboard');
    }
  });
  $('copy-image-link').addEventListener('click', async () => {
    flushReplace();
    try {
      await copyText(imageLink(design));
      toast('Image link copied: it draws this design as an SVG, on any page');
    } catch {
      toast('Could not access the clipboard');
    }
  });
  for (const format of /** @type {const} */ (['svg', 'png', 'jpeg', 'webp'])) {
    const button = /** @type {HTMLButtonElement} */ ($(`dl-${format}`));
    button.addEventListener('click', () => exportAs(format, button));
  }
  const mobileDownload = /** @type {HTMLButtonElement} */ ($('m-download'));
  mobileDownload.addEventListener('click', () => exportAs('png', mobileDownload));
  const mockupKind = /** @type {HTMLSelectElement} */ ($('mockup-kind'));
  const mockupText = /** @type {HTMLInputElement} */ ($('mockup-text'));
  mockupKind.addEventListener('change', renderMockup);
  mockupText.addEventListener('input', renderMockup);
  const mockupButton = /** @type {HTMLButtonElement} */ ($('dl-mockup'));
  mockupButton.addEventListener('click', () =>
    busyWhile(mockupButton, async () => {
      const kind = /** @type {import('../src/index.js').MockupKind} */ (mockupKind.value);
      const m = createMockup(current, { kind, text: mockupText.value });
      // Product shots follow the cover's size: twice it, for sharpness, within what browsers can
      // draw (10,000 px a side, and about 16 million pixels on phones). Cards have their own size.
      const card = ['card', 'square', 'story'].includes(kind);
      const scale = card
        ? 1
        : Math.min(2, MAX_SIDE / Math.max(m.width, m.height), Math.sqrt(MAX_PIXELS / (m.width * m.height)));
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
        toast('Export failed. Try again.');
      }
    }),
  );
  buildMany();
  $('thumb-toggle').addEventListener('click', () => {
    const on = $('book').classList.toggle('store-size');
    $('thumb-toggle').setAttribute('aria-pressed', String(on));
  });
  $('keep').addEventListener('click', keepDesign);
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
      tiles.get(design.style)?.button.scrollIntoView({ behavior, block: 'center' });
      tiles.get(design.style)?.button.focus({ preventScroll: true });
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
    for (const [id, keys] of [
      ['randomize', 'R'],
      ['undo', 'Z'],
      ['redo', 'Shift+Z'],
    ]) {
      if (ui.shortcuts) $(id).setAttribute('aria-keyshortcuts', keys);
      else $(id).removeAttribute('aria-keyshortcuts');
    }
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
    if (!ui.shortcuts || e.metaKey || e.repeat) return;
    // The target can be the document itself (events dispatched by scripts or extensions).
    const target = e.target instanceof Element ? e.target : null;
    // Text fields keep their keys; the texture switch (a checkbox) has no use for them.
    const field = target?.closest('input, textarea, select, [contenteditable]');
    if (field && !(field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio'))) return;
    // Match the character printed on the key (QWERTZ, AZERTY, Dvorak…); on
    // non-Latin layouts, fall back to the key's position.
    // (Not for Latin letters like à or ı, nor dead keys: those are characters of their own.)
    const nonLatin = /^\p{L}$/u.test(e.key) && !/\p{Script=Latin}/u.test(e.key);
    const letter = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : nonLatin ? (LETTER_CODES[e.code] ?? '') : '';
    const plain = !e.ctrlKey && !e.altKey;
    if (plain && letter === 'r') randomizeAll();
    else if (plain && letter === 'z') {
      if (e.shiftKey) redo();
      else undo();
    } else if (plain && letter === 'y') redo();
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
 * Move one entry through this app's own history, never past its first or last entry
 * (so never back or forward to another site).
 * @param {number} dir -1 or 1
 */
function go(dir) {
  if (dir < 0 ? historyIndex > 0 : historyIndex < historyMax) {
    pending = { from: historyIndex, dir, at: performance.now() };
    history.go(dir);
  } else pending = null;
}

/**
 * Undo or Redo. The index only moves when popstate arrives, so a press made before
 * then waits its turn rather than check a stale index (a double-click on Undo
 * could otherwise step off the first entry). Pending keystrokes are saved first.
 * @param {number} dir -1 or 1
 */
function step(dir) {
  flushReplace();
  // (A step whose popstate never came, after a second, no longer holds presses back.)
  if (!inFlight()) dropSteps();
  queued.push(dir);
  drain();
}

function undo() {
  step(-1);
}

function redo() {
  step(1);
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

/** iPhones and iPads draw a canvas of at most about 16.7 million pixels; other browsers far more. */
const CANVAS_PIXELS =
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
    ? 16_777_216
    : Infinity;
/** The largest export scale for a cover this size: its long side within 10,000 px, and the image within what the device can draw. @param {number} w @param {number} hgt */
const maxScaleOf = (w, hgt) =>
  Math.max(1, Math.min(4, Math.floor(MAX_SIDE / Math.max(w, hgt)), Math.floor(Math.sqrt(CANVAS_PIXELS / (w * hgt)))));
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

function syncControls() {
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
  const pw = w * scale;
  const ph = hgt * scale;
  $('png-size').textContent = `${pw} × ${ph} px`;
  $('size-hint').textContent = sizeHint(design.format, pw, ph);
  syncPaletteName();
}

/** The style the variant buttons were built for. */
let variantsBuiltFor = '';

/** Buttons for the current style's variants: Auto (the seed decides) and each value. */
function syncVariants() {
  const box = $('style-variants');
  const offered = STYLES.find((s) => s.id === design.style)?.variants ?? [];
  if (variantsBuiltFor !== design.style) {
    variantsBuiltFor = design.style;
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
      const section = h('section', { className: 'rail-group' }, h('h3', {}, s.group), grid);
      rail.append(section);
      // A jump link per family in the rail's header: 39 styles are a long scroll.
      const jump = h('button', { type: 'button', className: 'rail-jump' }, s.group);
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
  tile.img.src = svgToDataUrl(createCover(options({ style })).svg);
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
  const svg =
    typeof raw.svg === 'string' &&
    raw.svg.length <= MAX_SNAPSHOT &&
    raw.svg.startsWith('<svg ') &&
    raw.svg.endsWith('</svg>')
      ? raw.svg
      : '';
  return { design: complete(sanitize(raw)), svg };
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

function keepDesign() {
  const hash = toHash(design);
  const list = loadKept().filter((k) => toHash(k.design) !== hash);
  list.unshift({ design: { ...design }, svg: current.svg.length <= MAX_SNAPSHOT ? current.svg : '' });
  const lost = saveKept(list.slice(0, MAX_KEPT));
  if (lost < 0) {
    toast('Could not save here (private browsing?)');
    return;
  }
  renderKept();
  toast(
    (list.length > MAX_KEPT ? `Kept. The oldest of ${MAX_KEPT} made room.` : 'Kept. It’s under the preview.') +
      lostNote(lost),
  );
}

/** Kept thumbnails by design, so Keep and Remove only draw the one that changed. */
/** @type {Map<string, string>} */
const keptThumbs = new Map();
/** @type {{ img: HTMLImageElement, kept: Kept, hash: string }[]} */
let keptQueue = [];

/** @param {Kept[]} [list] the kept designs, if already loaded */
function renderKept(list = loadKept()) {
  const hashes = list.map((k) => toHash(k.design));
  for (const hash of keptThumbs.keys()) if (!hashes.includes(hash)) keptThumbs.delete(hash);
  keptQueue = [];
  $('kept-empty').hidden = list.length > 0;
  for (const id of ['kept-all', 'kept-export']) $(id).hidden = list.length === 0;
  $('kept-list').replaceChildren(
    ...list.map((k, i) => {
      const d = k.design;
      const hash = hashes[i];
      const img = /** @type {HTMLImageElement} */ (h('img', { alt: '' }));
      const thumb = keptThumbs.get(hash);
      if (thumb) img.src = thumb;
      else keptQueue.push({ img, kept: k, hash });
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
        // Remove this exact design (another tab may have changed the list since it was drawn).
        saveKept(loadKept().filter((other) => toHash(other.design) !== hash));
        renderKept();
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

/** Open a kept design, saying so when this version draws it differently from the kept SVG. @param {Kept} k */
function openKept(k) {
  update({ ...k.design });
  if (k.svg && createCover(optionsFor(k.design)).svg !== k.svg) {
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
      toast('Export failed. Try one at a time.');
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
    toast('That file has no kept designs in it');
    return;
  }
  const list = loadKept();
  const have = new Set(list.map((k) => toHash(k.design)));
  /** @type {Kept[]} */
  const added = [];
  for (const item of items) {
    // (Only designs: an entry naming nothing a design has would come out as an empty cover.)
    if (
      !item ||
      typeof item !== 'object' ||
      !Object.keys(sanitize(/** @type {Record<string, unknown>} */ (item))).length
    ) {
      continue;
    }
    const k = keptFrom(item);
    const hash = toHash(k.design);
    if (have.has(hash)) continue;
    have.add(hash);
    added.push(k);
  }
  const room = Math.max(0, MAX_KEPT - list.length);
  const taken = added.slice(0, room);
  if (!taken.length) {
    toast(
      added.length ? `The tray is full: it holds ${MAX_KEPT} designs` : 'Nothing new: those designs are kept already',
    );
    return;
  }
  const lost = saveKept([...taken, ...list]);
  if (lost < 0) {
    toast('Could not save here (private browsing?)');
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
      toast(`Saved ${ext === 'jpg' ? 'JPEG' : ext.toUpperCase()} · ${w * scale} × ${hgt * scale} px${fallback}`);
    } catch (err) {
      console.error(err);
      toast('Export failed. Try SVG instead.');
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
      toast('Could not share. Try Download PNG.');
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
  const base = optionsFor({ ...d, title: '', author: '' });
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

/** @type {ReturnType<typeof setTimeout> | undefined} */
let manyTimer;
/** The design the list's preview was last drawn for (title and author aside). */
let lastManyKey = '';
/** List covers still to draw. @type {{ img: HTMLImageElement, options: import('../src/index.js').CoverOptions }[]} */
let manyQueue = [];

/** Draw the next queued list cover (a few per frame, so a long list never stalls the page). */
const scheduleMany = sliced(() => {
  const item = manyQueue.shift();
  if (!item) return false;
  try {
    item.img.src = svgToDataUrl(createCover(item.options).svg);
  } catch {
    // A row the library refuses (an unknown style, say): shown empty, reported on download.
  }
  return true;
});

/** The count and the first covers of the list, as they will come out. */
function renderMany() {
  const { books, error } = listedBooks();
  const extra = books.length > MAX_BOOKS ? ` (the first ${MAX_BOOKS} are made)` : '';
  $('many-count').textContent =
    error || (books.length ? `${books.length} book${books.length === 1 ? '' : 's'}${extra}` : '');
  lastManyKey = JSON.stringify({ ...design, title: '', author: '' });
  manyQueue = [];
  $('many-preview').replaceChildren(
    ...books.slice(0, PREVIEWED).map((book, i) => {
      const img = /** @type {HTMLImageElement} */ (h('img', { alt: '' }));
      manyQueue.push({ img, options: bookOptions(book, i) });
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
    toast(error || 'Add a book per line first');
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
        failed.push(`${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failed.length) console.warn('Books left out:', failed);
    if (!files.length) {
      toast('None of the books could be made (see the console)');
      return;
    }
    downloadBlob(await zipFiles(files), 'covers.zip');
    toast(
      `Saved ${files.length} cover${files.length === 1 ? '' : 's'} in covers.zip` +
        (failed.length ? `; ${failed.length} couldn’t be made (see the console)` : ''),
    );
  } catch (err) {
    console.error(err);
    toast('Export failed. Try SVG, or fewer books.');
  } finally {
    button.textContent = 'Download all as ZIP';
  }
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/** @param {string} msg */
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* -------------------------------------------------------------------- boot */

/**
 * Work offline: a service worker keeps the app's files (public/sw.js). The page runs under
 * Trusted Types, so the worker's URL goes through a policy that allows only it.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const types = /** @type {any} */ (window).trustedTypes;
    const url = types
      ? types
          .createPolicy('sw', {
            createScriptURL: (/** @type {string} */ u) => {
              if (u !== '/sw.js') throw new TypeError(`Not the service worker: ${u}`);
              return u;
            },
          })
          .createScriptURL('/sw.js')
      : '/sw.js';
    navigator.serviceWorker.register(url).catch((err) => console.warn('No offline copy:', err));
  } catch (err) {
    console.warn('No offline copy:', err);
  }
}

// A shared link opens the same cover every time (see complete()); with no link, the sample stays.
const linked = fromHash(location.hash);
if (Object.keys(linked).length) Object.assign(design, complete(linked));
else {
  // With no link, the first cover is in the genre chosen last time: a starter that suits it, if any.
  const genre = ui.genre;
  const suits = genre ? STYLES.filter((s) => s.genres.includes(genre)).map((s) => s.id) : [];
  const starters = STARTERS.filter((id) => suits.includes(id));
  if (suits.length) design.style = pick(starters.length ? starters : suits);
}
const linkedHash = location.hash;
// A fragment that isn't a design (#usage, from a header link opened in a new tab) is a place on
// the page. The URL is about to hold the design instead, so scroll there once the page is built.
let anchor = /** @type {HTMLElement | null} */ (null);
if (!Object.keys(linked).length && location.hash.length > 1) {
  try {
    anchor = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  } catch {
    // A malformed fragment: nothing to scroll to.
  }
}
if (typeof history.state?.i === 'number') {
  // Back on an entry of ours. After a reload the later entries are still there; after
  // coming back from another site they may have been replaced by it, so Redo starts
  // fresh rather than risk navigating away.
  historyIndex = history.state.i;
  historyMax = historyIndex;
  const nav = /** @type {PerformanceNavigationTiming | undefined} */ (performance.getEntriesByType('navigation')[0]);
  if (nav?.type === 'reload') {
    try {
      historyMax = Math.max(historyIndex, Number(sessionStorage.getItem(MAX_KEY)) || 0);
    } catch {
      // Storage blocked.
    }
  }
}
// Store the max settled on, so a later reload can't bring back a stale, larger one.
saveHistoryMax();
// Restored from the back/forward cache after visiting another page: same reasoning.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  historyMax = historyIndex;
  saveHistoryMax();
  syncHistoryButtons();
});
// History entries are designs, not places on the page: Undo and Back must not scroll the page
// to where it was when that design was made.
history.scrollRestoration = 'manual';
stamp();
entryHash = location.hash;
registerServiceWorker();
buildControls();
buildRail();
buildVariations();
render();
renderKept();
syncHistoryButtons();
anchor?.scrollIntoView();
if (Object.keys(linked).length) noteVersion(linkedHash);
