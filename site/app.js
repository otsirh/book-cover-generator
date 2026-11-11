import { createCover, listStyles, palettes, randomSeed } from '../src/index.js';
import { svgToDataUrl, downloadCover, copyText } from '../src/browser.js';

const FORMATS = {
  paperback: [600, 900],
  ebook: [600, 960],
  square: [600, 600],
};
const SCALES = [1, 2, 3, 4];
const STYLES = listStyles();
const $ = (id) => document.getElementById(id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const state = {
  title: 'The Lighthouse Keeper',
  author: 'Mara Ellison',
  style: pick(STYLES).id,
  palette: 'auto',
  seed: randomSeed(),
  format: 'paperback',
  scale: 2,
};
let current = null;

/* --------------------------------------------------------------- URL state */

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('title')) state.title = q.get('title');
  if (q.has('author')) state.author = q.get('author');
  if (STYLES.some((s) => s.id === q.get('style'))) state.style = q.get('style');
  if (q.get('palette') === 'auto' || palettes.some((p) => p.id === q.get('palette'))) state.palette = q.get('palette');
  if (q.has('seed')) state.seed = q.get('seed').trim();
  if (FORMATS[q.get('format')]) state.format = q.get('format');
}

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
    history.replaceState(null, '', '#' + q.toString());
  }, 250);
}

/* ---------------------------------------------------------------- controls */

function buildControls() {
  $('style').innerHTML = STYLES.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');

  const sw = $('swatches');
  const auto = document.createElement('button');
  auto.type = 'button';
  auto.className = 'swatch auto';
  auto.dataset.palette = 'auto';
  auto.setAttribute('role', 'radio');
  auto.title = 'Auto — picked from the seed';
  auto.textContent = 'Auto';
  sw.append(auto);
  for (const p of palettes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.palette = p.id;
    b.setAttribute('role', 'radio');
    b.title = p.name;
    b.setAttribute('aria-label', p.name);
    b.style.background = `linear-gradient(90deg, ${p.bg} 0 46%, ${p.accents[0]} 46% 64%, ${p.accents[1]} 64% 82%, ${p.accents[2]} 82%)`;
    sw.append(b);
  }

  $('scale').innerHTML = SCALES.map((s) => `<option value="${s}">${s}×</option>`).join('');

  $('title').addEventListener('input', (e) => update({ title: e.target.value }, { gallery: 'debounce' }));
  $('author').addEventListener('input', (e) => update({ author: e.target.value }, { gallery: 'debounce' }));
  $('seed').addEventListener('input', (e) => update({ seed: e.target.value.trim() }, { gallery: 'debounce' }));
  $('style').addEventListener('change', (e) => update({ style: e.target.value }, { gallery: false }));
  sw.addEventListener('click', (e) => {
    const b = e.target.closest('[data-palette]');
    if (b) update({ palette: b.dataset.palette });
  });
  $('format').addEventListener('click', (e) => {
    const b = e.target.closest('[data-format]');
    if (b) update({ format: b.dataset.format });
  });
  $('scale').addEventListener('change', (e) => {
    state.scale = +e.target.value;
    syncScaleLabels();
  });

  $('dice-style').addEventListener('click', () => update({ style: pick(STYLES.filter((s) => s.id !== state.style)).id }, { gallery: false }));
  $('dice-palette').addEventListener('click', () => update({ palette: pick(palettes.filter((p) => p.id !== state.palette)).id }));
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
  $('dl-svg').addEventListener('click', () => exportAs('svg'));
  $('dl-png').addEventListener('click', () => exportAs('png'));
  $('dl-jpeg').addEventListener('click', () => exportAs('jpeg'));

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    e.preventDefault();
    randomizeAll();
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
  if ($('title').value !== state.title) $('title').value = state.title;
  if ($('author').value !== state.author) $('author').value = state.author;
  if (document.activeElement !== $('seed')) $('seed').value = state.seed;
  $('style').value = state.style;
  $('scale').value = String(state.scale);
  for (const b of document.querySelectorAll('[data-palette]')) {
    const on = b.dataset.palette === state.palette;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  }
  for (const b of document.querySelectorAll('[data-format]')) {
    const on = b.dataset.format === state.format;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  }
  syncScaleLabels();
}

function syncScaleLabels() {
  const [w, h] = FORMATS[state.format];
  for (const opt of $('scale').options) opt.textContent = `${w * +opt.value} × ${h * +opt.value} px`;
}

/* ------------------------------------------------------------------ render */

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
  $('preview').src = svgToDataUrl(current.svg);
  $('book').style.aspectRatio = `${current.width} / ${current.height}`;
  const style = STYLES.find((s) => s.id === current.style);
  const pal = palettes.find((p) => p.id === current.palette);
  $('meta').innerHTML =
    `<strong>${style.name}</strong> · ${pal ? pal.name : 'Custom'}${state.palette === 'auto' ? ' (auto)' : ''} · ${state.seed ? `seed <code>${escapeHtml(state.seed)}</code>` : 'seed from title + author'}`;
}

function buildGallery() {
  const grid = $('gallery-grid');
  for (const s of STYLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile';
    b.dataset.style = s.id;
    b.innerHTML = `<span class="tile-img"><img alt="" loading="lazy" /></span><span class="tile-name">${s.name}</span><span class="tile-desc">${s.description}</span>`;
    b.addEventListener('click', () => {
      update({ style: s.id }, { gallery: false });
      const top = $('book').getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.6) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    grid.append(b);
  }
}

function renderGallery() {
  for (const tile of document.querySelectorAll('.tile')) {
    const { svg } = createCover(options({ style: tile.dataset.style }));
    tile.querySelector('img').src = svgToDataUrl(svg);
    tile.querySelector('.tile-img').style.aspectRatio = FORMATS[state.format].join(' / ');
  }
  markGallery();
}

function markGallery() {
  for (const tile of document.querySelectorAll('.tile')) {
    tile.classList.toggle('active', tile.dataset.style === state.style);
  }
}

let galleryTimer;
function update(patch, { gallery = true } = {}) {
  Object.assign(state, patch);
  syncControls();
  renderPreview();
  writeHash();
  if (gallery === 'debounce') {
    clearTimeout(galleryTimer);
    galleryTimer = setTimeout(renderGallery, 220);
  } else if (gallery) {
    clearTimeout(galleryTimer);
    renderGallery();
  } else {
    // A pending debounced render (if any) will pick up this change too.
    markGallery();
  }
}

/* ------------------------------------------------------------------ export */

function slug(str) {
  return (
    str
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cover'
  );
}

async function exportAs(format) {
  const name = `${slug(state.title)}-${current.style}`;
  try {
    await downloadCover(current.svg, format, name, { scale: state.scale, quality: 0.93 });
    if (format !== 'svg') {
      const [w, h] = FORMATS[state.format];
      toast(`Saved ${format.toUpperCase()} · ${w * state.scale} × ${h * state.scale}px`);
    }
  } catch (err) {
    console.error(err);
    toast('Export failed — try SVG instead');
  }
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/* -------------------------------------------------------------------- boot */

readHash();
buildControls();
buildGallery();
update({});
