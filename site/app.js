import { createCover, listStyles, palettes, pickStyle, randomSeed } from '../src/index.js';
import { svgToDataUrl, downloadCover, copyText } from '../src/browser.js';
import { clipGraphemes } from '../src/text.js';

/** @typedef {'paperback' | 'ebook' | 'square'} Format */
/**
 * @typedef {object} Design  Everything that defines a cover; mirrored in the URL.
 * @property {string} title
 * @property {string} author
 * @property {string} subtitle
 * @property {string} style
 * @property {string} palette   a palette id or 'auto'
 * @property {string} seed      '' means "from the title"
 * @property {Format} format
 * @property {boolean} texture
 */
/** @typedef {{ button: HTMLButtonElement, img: HTMLImageElement, visible: boolean, dirty: boolean }} Tile  visible: on screen or close to it */

/** @type {Record<Format, [number, number]>} */
const FORMATS = { paperback: [600, 900], ebook: [600, 960], square: [600, 600] };
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
/** @type {Record<string, string>} */
const LETTER_CODES = { KeyR: 'r', KeyZ: 'z', KeyY: 'y' };
const MAX_KEPT = 24;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
/** @template T @param {readonly T[]} arr @returns {T} */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** @template T @param {readonly T[]} arr @param {T} current @returns {T} */
const pickOther = (arr, current) => pick(arr.filter((x) => x !== current));
/** Clip to the inputs' maxlength (which counts UTF-16 code units), between whole characters. */
const clip = (/** @type {string} */ str, /** @type {number} */ max) => clipGraphemes(str, max, { units: true });

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
  style: pick(STARTERS),
  palette: 'auto',
  seed: randomSeed(),
  format: 'paperback',
  texture: false,
};
const ui = { scale: 2, lockStyle: false, lockPalette: false, shortcuts: true };
/** @type {ReturnType<typeof createCover>} */
let current;

/* ------------------------------------------------------------ URL & history */

/** Validate a design-like object (from the URL or storage); unknown values are dropped. @param {Record<string, unknown>} raw */
function sanitize(raw) {
  /** @type {Partial<Design>} */
  const out = {};
  // Line breaks become spaces: the single-line inputs would drop them, and the cover spaces them.
  const str = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.replace(/[\r\n\u2028\u2029]+/g, ' ') : null);
  const title = str(raw.title);
  if (title != null) out.title = clip(title, 200);
  const author = str(raw.author);
  if (author != null) out.author = clip(author, 120);
  const subtitle = str(raw.subtitle);
  if (subtitle != null) out.subtitle = clip(subtitle, 160);
  const style = str(raw.style);
  if (style && STYLE_IDS.includes(style)) out.style = style;
  const palette = str(raw.palette);
  if (palette && PALETTE_IDS.has(palette)) out.palette = palette;
  const seed = str(raw.seed);
  if (seed != null) out.seed = clip(seed.trim(), 40);
  const format = str(raw.format);
  if (format && Object.hasOwn(FORMATS, format)) out.format = /** @type {Format} */ (format);
  // On or off; any other value (texture=yes) is ignored like other unknown values.
  if (raw.texture === true || raw.texture === '1') out.texture = true;
  else if (raw.texture === false || raw.texture === '0') out.texture = false;
  return out;
}

/** @param {string} hash */
function fromHash(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  /** @type {Record<string, unknown>} */
  const raw = {};
  for (const [key, value] of q) raw[key] = value;
  return sanitize(raw);
}

/** @param {Design} d */
function toHash(d) {
  // Every key, even when empty or off: a link is then the whole design, never mistaken for a
  // hand-edited partial one (which changes only the keys it names).
  const q = new URLSearchParams({ title: d.title, author: d.author, subtitle: d.subtitle });
  q.set('style', d.style);
  q.set('palette', d.palette);
  q.set('seed', d.seed);
  q.set('format', d.format);
  q.set('texture', d.texture ? '1' : '0');
  return `#${q}`;
}

// Every discrete change is a history entry, so Undo/Redo and the browser's
// Back/Forward step through designs. A burst of typing is one entry. The
// position survives a reload: the entry's index is in history.state, and the
// newest index in sessionStorage.
const MAX_KEY = 'book-cover-generator:history-max';
let historyIndex = 0;
let historyMax = 0;

/** Keys that URLs from before 1.2.0 left out when empty or off; entries of ours without them have these values. */
const OPTIONAL = { subtitle: '', texture: false };
/** The keys every link names; one that names them all is a whole design. */
const WHOLE_KEYS = ['title', 'author', 'style', 'palette', 'seed', 'format'];

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
/** Undo/Redo presses made while a step was in flight, net (-2: two more undos). */
let queuedSteps = 0;
/** A step still expected (its popstate can be dropped by the browser: then, after a second, not). */
const inFlight = () => pending !== null && performance.now() - pending.at < 1000;
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
  if (!dir) queuedSteps = 0;
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
    Object.assign(design, WHOLE_KEYS.every((key) => named.has(key)) ? complete(linked) : linked);
  }
  // Rewrite an edited URL so it always holds the whole design (for Copy link).
  if (!ours) stamp();
  render({ fade: true, announce: true });
  syncHistoryButtons();
  // Presses that came in while this step was in flight.
  if (dir && queuedSteps) {
    const next = Math.sign(queuedSteps);
    queuedSteps -= next;
    go(next);
  }
});

/**
 * Apply a change and re-render.
 * @param {Partial<Design>} patch
 * @param {'discrete' | 'typing'} [kind]
 */
function update(patch, kind = 'discrete') {
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
  const [width, height] = FORMATS[d.format];
  return {
    title: d.title,
    author: d.author,
    subtitle: d.subtitle,
    style: d.style,
    palette: d.palette === 'auto' ? 'random' : d.palette,
    seed: d.seed,
    texture: d.texture,
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
  /** @type {Design} */
  const d = {
    title: '',
    author: '',
    style: '',
    palette: 'auto',
    seed: '',
    format: 'paperback',
    ...OPTIONAL,
    ...partial,
  };
  if (!partial.style) d.style = pickStyle({ ...d, style: 'random' });
  return d;
}

let lastAnnouncement = '';
let lastGalleryKey = '';
/** @type {ReturnType<typeof setTimeout> | undefined} */
let galleryTimer;

/** @param {{ fade?: boolean, announce?: boolean }} [opts] */
function render({ fade = false, announce = false } = {}) {
  document.documentElement.dataset.coverFormat = design.format;
  renderPreview(fade, announce);
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
  const title = design.title.trim() || 'Untitled';
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
      : `In ${palette?.name ?? 'your palette'}. Click one to use it.`;
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
  swatches.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-palette]');
    if (b instanceof HTMLElement && b.dataset.palette) update({ palette: b.dataset.palette });
  });
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
    if (b instanceof HTMLElement && b.dataset.format) update({ format: /** @type {Format} */ (b.dataset.format) });
  });
  $('scale').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-scale]');
    if (b instanceof HTMLElement && b.dataset.scale) {
      ui.scale = Number(b.dataset.scale);
      syncControls();
    }
  });

  $('prev-style').addEventListener('click', () => stepStyle(-1));
  $('next-style').addEventListener('click', () => stepStyle(1));
  $('dice-style').addEventListener('click', () => update({ style: pickOther(STYLE_IDS, design.style) }));
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
  for (const format of /** @type {const} */ (['svg', 'png', 'jpeg'])) {
    const button = /** @type {HTMLButtonElement} */ ($(`dl-${format}`));
    button.addEventListener('click', () => exportAs(format, button));
  }
  const mobileDownload = /** @type {HTMLButtonElement} */ ($('m-download'));
  mobileDownload.addEventListener('click', () => exportAs('png', mobileDownload));
  $('keep').addEventListener('click', keepDesign);

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
  } else {
    pending = null;
    queuedSteps = 0;
  }
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
  if (inFlight()) queuedSteps += dir;
  else {
    queuedSteps = 0;
    go(dir);
  }
}

function undo() {
  step(-1);
}

function redo() {
  step(1);
}

/** @param {number} dir */
function stepStyle(dir) {
  const i = STYLE_IDS.indexOf(design.style);
  update({ style: STYLE_IDS[(i + dir + STYLE_IDS.length) % STYLE_IDS.length] });
}

/** @param {number} dir */
function stepPalette(dir) {
  const ids = [...PALETTE_IDS];
  const i = ids.indexOf(design.palette);
  update({ palette: ids[(i + dir + ids.length) % ids.length] });
}

function randomizeAll() {
  update({
    style: ui.lockStyle ? design.style : pickOther(STYLE_IDS, design.style),
    palette: ui.lockPalette ? design.palette : Math.random() < 0.3 ? 'auto' : pick(palettes).id,
    seed: randomSeed(),
  });
}

function syncPaletteName() {
  const p = palettes.find((x) => x.id === current?.palette);
  $('palette-name').textContent = design.palette === 'auto' ? `Auto · ${p?.name ?? ''}` : (p?.name ?? '');
}

function syncControls() {
  const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
  for (const key of /** @type {const} */ (['title', 'author', 'subtitle'])) {
    if (input(key).value !== design[key]) input(key).value = design[key];
  }
  // (Compared trimmed, as the field's input handler trims: typing a space doesn't get undone.)
  if (input('seed').value.trim() !== design.seed) input('seed').value = design.seed;
  input('texture').checked = design.texture;
  for (const b of document.querySelectorAll('[data-palette]')) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-palette') === design.palette));
  }
  for (const b of document.querySelectorAll('[data-format]')) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-format') === design.format));
  }
  for (const b of document.querySelectorAll('[data-scale]')) {
    b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-scale')) === ui.scale));
  }
  const [w, hgt] = FORMATS[design.format];
  const pw = w * ui.scale;
  const ph = hgt * ui.scale;
  $('png-size').textContent = `${pw} × ${ph} px`;
  $('size-hint').textContent = sizeHint(design.format, pw, ph);
  syncPaletteName();
}

/** What a given export size is good for. @param {Format} format @param {number} w @param {number} hgt */
function sizeHint(format, w, hgt) {
  if (format === 'ebook') {
    return hgt >= 2560
      ? 'Meets Kindle’s recommended 1600 × 2560.'
      : 'Kindle recommends 1600 × 2560: choose 3× or more.';
  }
  if (format === 'square') {
    return w >= 2400 ? 'Meets the 2400 × 2400 audiobook minimum.' : 'Audiobook stores ask for 2400 × 2400: choose 4×.';
  }
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
      rail.append(h('section', { className: 'rail-group' }, h('h3', {}, s.group), grid));
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
  railOrder = Array.from(rail.querySelectorAll('.tile'), (b) => /** @type {HTMLElement} */ (b).dataset.style ?? '');
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

function markRail() {
  for (const [style, tile] of tiles) tile.button.setAttribute('aria-pressed', String(style === design.style));
}

/* ---------------------------------------------------------------- keeping */

/** @returns {Design[]} */
function loadKept() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEEP_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    // (Cut first: there's no use completing designs that are thrown away.)
    return raw.slice(0, MAX_KEPT).map((item) => complete(sanitize(item && typeof item === 'object' ? item : {})));
  } catch {
    return [];
  }
}

/** @param {Design[]} list */
function saveKept(list) {
  try {
    localStorage.setItem(KEEP_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function keepDesign() {
  const hash = toHash(design);
  const list = loadKept().filter((d) => toHash(d) !== hash);
  list.unshift({ ...design });
  const kept = list.slice(0, MAX_KEPT);
  if (!saveKept(kept)) {
    toast('Could not save here (private browsing?)');
    return;
  }
  renderKept(kept);
  toast('Kept. It’s under the preview.');
}

/** Kept thumbnails by design, so Keep and Remove only draw the one that changed. */
/** @type {Map<string, string>} */
const keptThumbs = new Map();
/** @type {{ img: HTMLImageElement, design: Design, hash: string }[]} */
let keptQueue = [];

/** @param {Design[]} [list] the kept designs, if already loaded */
function renderKept(list = loadKept()) {
  const hashes = list.map(toHash);
  for (const hash of keptThumbs.keys()) if (!hashes.includes(hash)) keptThumbs.delete(hash);
  keptQueue = [];
  $('kept').hidden = list.length === 0;
  $('kept-list').replaceChildren(
    ...list.map((d, i) => {
      const hash = hashes[i];
      const img = /** @type {HTMLImageElement} */ (h('img', { alt: '' }));
      const thumb = keptThumbs.get(hash);
      if (thumb) img.src = thumb;
      else keptQueue.push({ img, design: d, hash });
      const label = `${d.title || 'Untitled'}, ${STYLES.find((s) => s.id === d.style)?.name ?? d.style}`;
      const open = h('button', { type: 'button', className: 'kept-open', 'aria-label': `Open ${label}` }, img);
      open.addEventListener('click', () => update({ ...d }));
      const remove = h(
        'button',
        { type: 'button', className: 'kept-remove', 'aria-label': `Remove ${label}`, title: 'Remove' },
        '×',
      );
      remove.addEventListener('click', () => {
        // Remove this exact design (another tab may have changed the list since it was drawn).
        const rest = loadKept().filter((k) => toHash(k) !== hash);
        saveKept(rest);
        renderKept(rest);
        // The button is gone: move focus to the next design's (or the last one's), or to Keep.
        const buttons = $('kept-list').querySelectorAll('.kept-remove');
        const next = /** @type {HTMLElement | undefined} */ (buttons[Math.min(i, buttons.length - 1)]);
        (next ?? $('keep')).focus();
      });
      return h('li', {}, open, remove);
    }),
  );
  scheduleKept();
}

/** Draw the next queued kept thumbnail. */
const scheduleKept = sliced(() => {
  const item = keptQueue.shift();
  if (!item) return false;
  const url = svgToDataUrl(createCover(optionsFor(item.design)).svg);
  keptThumbs.set(item.hash, url);
  item.img.src = url;
  return true;
});

/* ------------------------------------------------------------------ export */

/** @param {string} str */
function slug(str) {
  const words = str
    // Drop accents from Latin letters only (é → e); other marks (й, ά, Japanese voicing
    // marks, Indic vowel signs) are part of the letter and come back together under NFC.
    .normalize('NFKD')
    .replace(/(\p{Script=Latin})[\u0300-\u036f]+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+/, '');
  // Cut between whole characters first, so the trim also catches a separator at the cut.
  return clipGraphemes(words, 60).replace(/-+$/, '') || 'cover';
}

/**
 * @param {'svg' | 'png' | 'jpeg'} format
 * @param {HTMLButtonElement} button
 */
async function exportAs(format, button) {
  const name = `${slug(design.title)}-${current.style}`;
  // Capture what is being exported: the design may change while the PNG renders.
  const [w, hgt] = FORMATS[design.format];
  const scale = ui.scale;
  // One export per button at a time. aria-disabled, not disabled, so focus stays on it.
  if (button.getAttribute('aria-busy') === 'true') return;
  button.setAttribute('aria-disabled', 'true');
  button.setAttribute('aria-busy', 'true');
  try {
    await downloadCover(current.svg, format, name, { scale, quality: 0.93 });
    toast(format === 'svg' ? 'Saved SVG' : `Saved ${format.toUpperCase()} · ${w * scale} × ${hgt * scale} px`);
  } catch (err) {
    console.error(err);
    toast('Export failed. Try SVG instead.');
  } finally {
    button.removeAttribute('aria-disabled');
    button.removeAttribute('aria-busy');
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

// A shared link opens the same cover every time (see complete()); with no link, the sample stays.
const linked = fromHash(location.hash);
if (Object.keys(linked).length) Object.assign(design, complete(linked));
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
buildControls();
buildRail();
render();
renderKept();
syncHistoryButtons();
anchor?.scrollIntoView();
