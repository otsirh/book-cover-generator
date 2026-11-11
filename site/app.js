import { createCover, listStyles, palettes, randomSeed } from '../src/index.js';
import { svgToDataUrl, downloadCover, copyText } from '../src/browser.js';

/** @typedef {'paperback' | 'ebook' | 'square'} Format */
/** @typedef {{ button: HTMLButtonElement, frame: HTMLElement, img: HTMLImageElement, visible: boolean, dirty: boolean }} Tile */

/** @type {Record<Format, [number, number]>} */
const FORMATS = { paperback: [600, 900], ebook: [600, 960], square: [600, 600] };
const SCALES = [1, 2, 3, 4];
const STYLES = listStyles();
const STYLE_IDS = new Set(STYLES.map((s) => s.id));
const PALETTE_IDS = new Set(palettes.map((p) => p.id));

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
/** @template T @param {readonly T[]} arr @returns {T} */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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

const state = {
  title: 'The Lighthouse Keeper',
  author: 'Mara Ellison',
  style: pick(STYLES).id,
  palette: 'auto',
  seed: randomSeed(),
  /** @type {Format} */
  format: 'paperback',
  scale: 2,
};
/** @type {ReturnType<typeof createCover>} */
let current;

/* --------------------------------------------------------------- URL state */

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('title')) state.title = q.get('title') ?? '';
  if (q.has('author')) state.author = q.get('author') ?? '';
  const style = q.get('style');
  if (style && STYLE_IDS.has(style)) state.style = style;
  const palette = q.get('palette');
  if (palette && (palette === 'auto' || PALETTE_IDS.has(palette))) state.palette = palette;
  if (q.has('seed')) state.seed = (q.get('seed') ?? '').trim();
  const format = q.get('format');
  if (format && format in FORMATS) state.format = /** @type {Format} */ (format);
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let hashTimer;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const q = new URLSearchParams({
      title: state.title,
      author: state.author,
      style: state.style,
      palette: state.palette,
      seed: state.seed,
      format: state.format,
    });
    history.replaceState(null, '', `#${q}`);
  }, 250);
}

/* ---------------------------------------------------------------- controls */

function buildControls() {
  $('controls').addEventListener('submit', (e) => e.preventDefault());
  $('style').append(...STYLES.map((s) => new Option(s.name, s.id)));
  $('scale').append(...SCALES.map((s) => new Option(`${s}×`, String(s))));

  const swatches = $('swatches');
  swatches.append(
    h(
      'button',
      { type: 'button', className: 'swatch auto', title: 'Auto: picked from the seed', 'data-palette': 'auto' },
      'Auto',
    ),
  );
  for (const p of palettes) {
    const b = h('button', {
      type: 'button',
      className: 'swatch',
      title: p.name,
      'aria-label': p.name,
      'data-palette': p.id,
    });
    const [a1, a2, a3] = p.accents;
    b.style.background = `linear-gradient(90deg, ${p.bg} 0 46%, ${a1} 46% 64%, ${a2} 64% 82%, ${a3} 82%)`;
    swatches.append(b);
  }

  const value = (/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).value;
  $('title').addEventListener('input', (e) => update({ title: value(e) }, { gallery: 'debounce' }));
  $('author').addEventListener('input', (e) => update({ author: value(e) }, { gallery: 'debounce' }));
  $('seed').addEventListener('input', (e) => update({ seed: value(e).trim() }, { gallery: 'debounce' }));
  $('style').addEventListener('change', (e) => update({ style: value(e) }, { gallery: 'mark' }));
  $('scale').addEventListener('change', (e) => {
    state.scale = Number(value(e));
  });
  swatches.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-palette]');
    if (b instanceof HTMLElement && b.dataset.palette) update({ palette: b.dataset.palette });
  });
  $('format').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-format]');
    if (b instanceof HTMLElement && b.dataset.format) update({ format: /** @type {Format} */ (b.dataset.format) });
  });

  $('dice-style').addEventListener('click', () =>
    update({ style: pick(STYLES.filter((s) => s.id !== state.style)).id }, { gallery: 'mark' }),
  );
  $('dice-palette').addEventListener('click', () =>
    update({ palette: pick(palettes.filter((p) => p.id !== state.palette)).id }),
  );
  $('dice-seed').addEventListener('click', () => update({ seed: randomSeed() }));
  $('randomize').addEventListener('click', randomizeAll);

  $('copy-svg').addEventListener('click', async () => {
    try {
      await copyText(current.svg);
      toast('SVG copied to clipboard');
    } catch {
      toast('Could not access the clipboard');
    }
  });
  for (const format of /** @type {const} */ (['svg', 'png', 'jpeg'])) {
    const button = /** @type {HTMLButtonElement} */ ($(`dl-${format}`));
    button.addEventListener('click', () => exportAs(format, button));
  }

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const target = /** @type {HTMLElement | null} */ (e.target);
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    randomizeAll();
  });

  // Back/forward and edited URLs restore the design they describe.
  window.addEventListener('hashchange', () => {
    const before = JSON.stringify(state);
    readHash();
    if (JSON.stringify(state) !== before) update({});
  });
}

function randomizeAll() {
  update({
    style: pick(STYLES.filter((s) => s.id !== state.style)).id,
    palette: Math.random() < 0.35 ? 'auto' : pick(palettes).id,
    seed: randomSeed(),
  });
}

function syncControls() {
  const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
  if (input('title').value !== state.title) input('title').value = state.title;
  if (input('author').value !== state.author) input('author').value = state.author;
  if (document.activeElement !== $('seed')) input('seed').value = state.seed;
  input('style').value = state.style;
  input('scale').value = String(state.scale);
  for (const b of document.querySelectorAll('[data-palette]')) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-palette') === state.palette));
  }
  for (const b of document.querySelectorAll('[data-format]')) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-format') === state.format));
  }
  const [w, hgt] = FORMATS[state.format];
  for (const opt of /** @type {HTMLSelectElement} */ ($('scale')).options) {
    opt.textContent = `${w * Number(opt.value)} × ${hgt * Number(opt.value)} px`;
  }
}

/* ------------------------------------------------------------------ render */

/** @param {Partial<import('../src/index.js').CoverOptions>} [extra] */
function options(extra = {}) {
  const [width, height] = FORMATS[state.format];
  return {
    title: state.title,
    author: state.author,
    style: state.style,
    palette: state.palette === 'auto' ? 'random' : state.palette,
    seed: state.seed,
    width,
    height,
    ...extra,
  };
}

function renderPreview() {
  current = createCover(options());
  const style = STYLES.find((s) => s.id === current.style);
  const palette = palettes.find((p) => p.id === current.palette);
  const img = /** @type {HTMLImageElement} */ ($('preview'));
  img.src = svgToDataUrl(current.svg);
  img.alt = `Cover preview: “${state.title.trim() || 'Untitled'}”${state.author.trim() ? ` by ${state.author.trim()}` : ''}, ${style?.name} style`;
  $('book').style.aspectRatio = `${current.width} / ${current.height}`;
  $('meta').replaceChildren(
    h('strong', {}, style?.name ?? current.style),
    ` · ${palette?.name ?? 'Custom'}${state.palette === 'auto' ? ' (auto)' : ''} · `,
    ...(state.seed ? ['seed ', h('code', {}, state.seed)] : ['seed from title + author']),
  );
}

/* ----------------------------------------------------------------- gallery */

/** @type {Map<string, Tile>} */
const tiles = new Map();
/** @type {ReturnType<typeof setTimeout> | undefined} */
let galleryTimer;
let galleryFrame = 0;

function buildGallery() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const tile = tiles.get(/** @type {HTMLElement} */ (entry.target).dataset.style ?? '');
        if (tile) tile.visible = entry.isIntersecting;
      }
      scheduleGallery();
    },
    { rootMargin: '600px 0px' },
  );
  const grid = $('gallery-grid');
  for (const s of STYLES) {
    const img = /** @type {HTMLImageElement} */ (h('img', { alt: '', decoding: 'async', width: 150, height: 225 }));
    const frame = h('span', { className: 'tile-img' }, img);
    const button = /** @type {HTMLButtonElement} */ (
      h(
        'button',
        { type: 'button', className: 'tile', 'data-style': s.id },
        frame,
        h('span', { className: 'tile-name' }, s.name),
        h('span', { className: 'tile-desc' }, s.description),
      )
    );
    button.addEventListener('click', () => {
      update({ style: s.id }, { gallery: 'mark' });
      const top = $('book').getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.6) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    tiles.set(s.id, { button, frame, img, visible: false, dirty: true });
    observer.observe(button);
    grid.append(button);
  }
}

function invalidateGallery() {
  const ratio = FORMATS[state.format].join(' / ');
  for (const tile of tiles.values()) {
    tile.dirty = true;
    tile.frame.style.aspectRatio = ratio;
  }
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

function markGallery() {
  for (const [style, tile] of tiles) tile.button.setAttribute('aria-pressed', String(style === state.style));
}

/**
 * Apply a state change and re-render.
 * @param {Partial<typeof state>} patch
 * @param {{ gallery?: 'now' | 'debounce' | 'mark' }} [opts]
 *   now: re-render the gallery; debounce: re-render once typing pauses;
 *   mark: the gallery content is unchanged, only the selected tile moves.
 */
function update(patch, { gallery = 'now' } = {}) {
  Object.assign(state, patch);
  syncControls();
  renderPreview();
  writeHash();
  markGallery();
  if (gallery === 'now') {
    clearTimeout(galleryTimer);
    invalidateGallery();
  } else if (gallery === 'debounce') {
    clearTimeout(galleryTimer);
    galleryTimer = setTimeout(invalidateGallery, 200);
  }
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
  const name = `${slug(state.title)}-${current.style}`;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await downloadCover(current.svg, format, name, { scale: state.scale, quality: 0.93 });
    if (format !== 'svg') {
      const [w, hgt] = FORMATS[state.format];
      toast(`Saved ${format.toUpperCase()} · ${w * state.scale} × ${hgt * state.scale} px`);
    }
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* -------------------------------------------------------------------- boot */

readHash();
buildControls();
buildGallery();
update({});
