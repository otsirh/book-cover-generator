import { createCover, listStyles, palettes, randomSeed } from '../src/index.js';
import { svgToDataUrl, downloadCover, copyText } from '../src/browser.js';

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
/** @typedef {{ button: HTMLButtonElement, img: HTMLImageElement, visible: boolean, dirty: boolean }} Tile */

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
/** Clip to `max` characters (code points), matching the inputs' maxlength. */
const clip = (/** @type {string} */ str, /** @type {number} */ max) => Array.from(str).slice(0, max).join('');

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
const ui = { scale: 2, lockStyle: false, lockPalette: false };
/** @type {ReturnType<typeof createCover>} */
let current;

/* ------------------------------------------------------------ URL & history */

/** Validate a design-like object (from the URL or storage); unknown values are dropped. @param {Record<string, unknown>} raw */
function sanitize(raw) {
  /** @type {Partial<Design>} */
  const out = {};
  const str = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : null);
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
  if (raw.texture != null) out.texture = raw.texture === true || raw.texture === '1';
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
  const q = new URLSearchParams({ title: d.title, author: d.author });
  if (d.subtitle) q.set('subtitle', d.subtitle);
  q.set('style', d.style);
  q.set('palette', d.palette);
  q.set('seed', d.seed);
  q.set('format', d.format);
  if (d.texture) q.set('texture', '1');
  return `#${q}`;
}

// Every discrete change is a history entry, so Undo/Redo and the browser's
// Back/Forward step through designs. A burst of typing is one entry. The
// position survives a reload: the entry's index is in history.state, and the
// newest index in sessionStorage.
const MAX_KEY = 'book-cover-generator:history-max';
let historyIndex = 0;
let historyMax = 0;

/** Keys that a URL may leave out; navigating to such a URL resets them. */
const OPTIONAL = { subtitle: '', texture: false };

function saveHistoryMax() {
  try {
    sessionStorage.setItem(MAX_KEY, String(historyMax));
  } catch {
    // Storage blocked: Redo after a reload just starts fresh.
  }
}
let typing = false;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let typingTimer;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let replaceTimer;

/**
 * Write to the history, ignoring the SecurityError browsers throw when pages
 * update history too often (the design still updates; only that step is lost).
 * @param {() => void} write
 */
function safely(write) {
  try {
    write();
    return true;
  } catch {
    return false;
  }
}

function flushReplace() {
  if (replaceTimer === undefined) return;
  clearTimeout(replaceTimer);
  replaceTimer = undefined;
  safely(() => history.replaceState({ i: historyIndex }, '', toHash(design)));
}

function commit() {
  flushReplace();
  // A discrete change ends any typing burst, so later keystrokes get their own step.
  typing = false;
  clearTimeout(typingTimer);
  if (safely(() => history.pushState({ i: historyIndex + 1 }, '', toHash(design)))) {
    historyIndex += 1;
    historyMax = historyIndex;
    saveHistoryMax();
  } else {
    // Rate-limited: update the current entry instead (which may also be refused).
    safely(() => history.replaceState({ i: historyIndex }, '', toHash(design)));
  }
  syncHistoryButtons();
}

function typed() {
  if (!typing) {
    commit();
    typing = true;
  } else {
    clearTimeout(replaceTimer);
    replaceTimer = setTimeout(flushReplace, 250);
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    typing = false;
  }, 1200);
}

function syncHistoryButtons() {
  /** @type {HTMLButtonElement} */ ($('undo')).disabled = historyIndex <= 0;
  /** @type {HTMLButtonElement} */ ($('redo')).disabled = historyIndex >= historyMax;
}

window.addEventListener('popstate', (e) => {
  clearTimeout(replaceTimer);
  replaceTimer = undefined;
  typing = false;
  if (e.state && typeof e.state.i === 'number') historyIndex = e.state.i;
  const edited = !(e.state && typeof e.state.i === 'number');
  if (edited) {
    // An edited URL: make it the newest entry.
    historyMax += 1;
    historyIndex = historyMax;
    saveHistoryMax();
  }
  Object.assign(design, OPTIONAL, fromHash(location.hash));
  // Rewrite an edited URL so it always holds the whole design (for Copy link).
  if (edited) safely(() => history.replaceState({ i: historyIndex }, '', toHash(design)));
  render({ fade: true, announce: true });
  syncHistoryButtons();
});

/**
 * Apply a change and re-render.
 * @param {Partial<Design>} patch
 * @param {'discrete' | 'typing'} [kind]
 */
function update(patch, kind = 'discrete') {
  const changed = Object.entries(patch).some(([key, value]) => design[/** @type {keyof Design} */ (key)] !== value);
  if (!changed) return;
  // Save the typing burst's last keystrokes to its own entry before a discrete change.
  if (kind === 'discrete') flushReplace();
  Object.assign(design, patch);
  if (kind === 'typing') typed();
  else commit();
  render({ fade: kind === 'discrete', announce: kind === 'discrete' });
}

/* ------------------------------------------------------------------ render */

/** @param {Partial<import('../src/index.js').CoverOptions>} [extra] */
function options(extra = {}) {
  const [width, height] = FORMATS[design.format];
  return {
    title: design.title,
    author: design.author,
    subtitle: design.subtitle,
    style: design.style,
    palette: design.palette === 'auto' ? 'random' : design.palette,
    seed: design.seed,
    texture: design.texture,
    width,
    height,
    ...extra,
  };
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
  if (announce && lastAnnouncement && announcement !== lastAnnouncement) $('announce').textContent = announcement;
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
      await copyText(location.href);
      toast('Link copied: it opens this exact design');
    } catch {
      toast('Could not access the clipboard');
    }
  });
  for (const format of /** @type {const} */ (['svg', 'png', 'jpeg'])) {
    const button = /** @type {HTMLButtonElement} */ ($(`dl-${format}`));
    button.addEventListener('click', () => exportAs(format, button));
  }
  $('m-download').addEventListener('click', () => exportAs('png', /** @type {HTMLButtonElement} */ ($('dl-png'))));
  $('keep').addEventListener('click', keepDesign);

  // In-page links scroll without touching the URL, which holds the design.
  document.addEventListener('click', (e) => {
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
    else target.scrollIntoView({ behavior });
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.repeat) return;
    // The target can be the document itself (events dispatched by scripts or extensions).
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    // Match the character printed on the key (QWERTZ, AZERTY, Dvorak…); on
    // non-Latin layouts, fall back to the key's position.
    const letter = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : (LETTER_CODES[e.code] ?? '');
    const plain = !e.ctrlKey && !e.altKey;
    if (plain && letter === 'r') randomizeAll();
    else if (plain && letter === 'z') {
      if (e.shiftKey) redo();
      else undo();
    } else if (plain && letter === 'y') redo();
    else if (plain && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) stepStyle(e.key === 'ArrowLeft' ? -1 : 1);
    // Brackets need AltGr or Option on many layouts, so modifiers are allowed for them.
    else if (e.key === '[' || e.key === ']') stepPalette(e.key === '[' ? -1 : 1);
    else return;
    e.preventDefault();
  });
}

// Both save pending keystrokes to the current entry before moving through history.
function undo() {
  flushReplace();
  if (historyIndex > 0) history.back();
}

/** Redo only within this app's own history, never forward to another site. */
function redo() {
  flushReplace();
  if (historyIndex < historyMax) history.forward();
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
  if (document.activeElement !== $('seed')) input('seed').value = design.seed;
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
let galleryFrame = 0;

function buildRail() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const tile = tiles.get(/** @type {HTMLElement} */ (entry.target).dataset.style ?? '');
        if (tile) tile.visible = entry.isIntersecting;
      }
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
}

function invalidateGallery() {
  for (const tile of tiles.values()) tile.dirty = true;
  scheduleGallery();
}

function scheduleGallery() {
  if (!galleryFrame) galleryFrame = requestAnimationFrame(pumpGallery);
}

/** Render dirty, visible tiles, yielding to the browser every ~8 ms. */
function pumpGallery() {
  galleryFrame = 0;
  const start = performance.now();
  for (const [style, tile] of tiles) {
    if (!tile.dirty || !tile.visible) continue;
    tile.img.src = svgToDataUrl(createCover(options({ style })).svg);
    tile.dirty = false;
    if (performance.now() - start > 8) {
      scheduleGallery();
      return;
    }
  }
}

function markRail() {
  for (const [style, tile] of tiles) tile.button.setAttribute('aria-pressed', String(style === design.style));
}

/* ---------------------------------------------------------------- keeping */

/** @returns {Design[]} */
function loadKept() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEEP_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => ({ ...design, ...sanitize(item && typeof item === 'object' ? item : {}) }))
      .slice(0, MAX_KEPT);
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
  if (!saveKept(list.slice(0, MAX_KEPT))) {
    toast('Could not save here (private browsing?)');
    return;
  }
  renderKept();
  toast('Kept. It’s under the preview.');
}

function renderKept() {
  const list = loadKept();
  $('kept').hidden = list.length === 0;
  $('kept-list').replaceChildren(
    ...list.map((d) => {
      const [width, height] = FORMATS[d.format];
      const { svg } = createCover({ ...d, palette: d.palette === 'auto' ? 'random' : d.palette, width, height });
      const label = `${d.title || 'Untitled'}, ${STYLES.find((s) => s.id === d.style)?.name ?? d.style}`;
      const open = h(
        'button',
        { type: 'button', className: 'kept-open', 'aria-label': `Open ${label}` },
        h('img', { src: svgToDataUrl(svg), alt: '' }),
      );
      open.addEventListener('click', () => update({ ...d }));
      const remove = h(
        'button',
        { type: 'button', className: 'kept-remove', 'aria-label': `Remove ${label}`, title: 'Remove' },
        '×',
      );
      remove.addEventListener('click', () => {
        // Remove this exact design (another tab may have changed the list since it was drawn).
        const hash = toHash(d);
        saveKept(loadKept().filter((k) => toHash(k) !== hash));
        renderKept();
      });
      return h('li', {}, open, remove);
    }),
  );
}

/* ------------------------------------------------------------------ export */

/** @param {string} str */
function slug(str) {
  return (
    str
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cover'
  );
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
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await downloadCover(current.svg, format, name, { scale, quality: 0.93 });
    toast(format === 'svg' ? 'Saved SVG' : `Saved ${format.toUpperCase()} · ${w * scale} × ${hgt * scale} px`);
  } catch (err) {
    console.error(err);
    toast('Export failed. Try SVG instead.');
  } finally {
    button.disabled = false;
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

// A shared link fills in what it leaves out with neutral, deterministic values
// (not the random sample title), so it opens the same cover every time.
const linked = fromHash(location.hash);
if (Object.keys(linked).length) {
  Object.assign(design, { title: '', author: '', palette: 'auto', seed: '', format: 'paperback' }, OPTIONAL, linked);
  if (!linked.style) design.style = createCover({ ...options(), style: 'random' }).style;
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
// Restored from the back/forward cache after visiting another page: same reasoning.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  historyMax = historyIndex;
  saveHistoryMax();
  syncHistoryButtons();
});
history.replaceState({ i: historyIndex }, '', toHash(design));
buildControls();
buildRail();
render();
renderKept();
syncHistoryButtons();
