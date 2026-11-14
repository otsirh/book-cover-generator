// Registering a style changes the shared style list, so this runs in its own process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCover,
  styles,
  palettes,
  registerStyle,
  unregisterStyle,
  registerPalette,
  unregisterPalette,
  listStyles,
} from '../src/index.js';

test('custom styles can be registered', (t) => {
  // (Each test leaves the registry as it found it, so a later one never picks its styles.)
  t.after(() => unregisterStyle('test-plain'));
  registerStyle({
    id: 'test-plain',
    name: 'Plain',
    render: (c) => `<rect width="${c.W}" height="${c.H}" fill="${c.p.bg}"/>`,
  });
  assert.ok(styles.includes('test-plain'));
  assert.ok(listStyles().some((s) => s.id === 'test-plain'));
  const { svg } = createCover({ title: 'x', style: 'test-plain', palette: 'noir' });
  assert.ok(svg.includes('fill="#121212"'));
});

test('a style can be a class instance, and missing details get defaults', (t) => {
  t.after(() => ['test-class', 'test-undefined'].forEach((id) => unregisterStyle(id)));
  class Plain {
    id = 'test-class';
    fill = '#123456';
    /** @param {import('../src/index.js').StyleContext} c */
    render(c) {
      return `<rect width="${c.W}" height="${c.H}" fill="${this.fill}"/>`;
    }
  }
  registerStyle(new Plain());
  assert.match(createCover({ title: 'x', style: 'test-class' }).svg, /fill="#123456"/);
  const frozen = Object.freeze({ id: 'test-undefined', name: undefined, group: undefined, render: () => '' });
  registerStyle(frozen);
  const info = listStyles().find((s) => s.id === 'test-undefined');
  assert.deepEqual(info, {
    id: 'test-undefined',
    name: 'test-undefined',
    description: '',
    group: 'Custom',
    variants: [],
    genres: [],
  });
});

test('a class style with private fields renders with itself as `this`', (t) => {
  t.after(() => unregisterStyle('test-private'));
  class Private {
    id = 'test-private';
    #fill = '#abcdef';
    calls = 0;
    /** @param {import('../src/index.js').StyleContext} c */
    render(c) {
      this.calls++;
      return `<rect width="${c.W}" height="${c.H}" fill="${this.#fill}"/>`;
    }
  }
  const style = new Private();
  registerStyle(style);
  assert.match(createCover({ title: 'x', style: 'test-private' }).svg, /fill="#abcdef"/);
  assert.equal(style.calls, 1, 'writes to `this` reach the instance');
});

test('a built-in style is replaced only when asked, and can be brought back', (t) => {
  // (The built-in back, and no test style left, even if an assertion fails.)
  t.after(() => ['minimal', 'test-gone'].forEach((id) => unregisterStyle(id)));
  const plain = { id: 'minimal', render: () => '<rect width="1" height="1" fill="#abc123"/>' };
  assert.throws(() => registerStyle(plain), /built-in style; pass \{ replace: true \}/);
  assert.throws(() => registerStyle({ id: 'random', render: () => '' }), /picks one/);
  // A padded id would slip past the guard and could never be picked.
  assert.throws(() => registerStyle({ id: ' minimal ', render: () => '' }), /without spaces/);
  assert.throws(() => registerStyle({ id: /** @type {any} */ (7), render: () => '' }), TypeError);
  const before = createCover({ title: 'x', style: 'minimal', seed: 's' }).svg;
  const count = styles.length;
  registerStyle(plain, { replace: true });
  assert.match(createCover({ title: 'x', style: 'minimal', seed: 's' }).svg, /#abc123/);
  assert.equal(styles.length, count, 'still one minimal');
  assert.equal(unregisterStyle('minimal'), true);
  assert.equal(createCover({ title: 'x', style: 'minimal', seed: 's' }).svg, before);
  assert.equal(unregisterStyle('minimal'), false, 'the built-in stays');
  assert.equal(unregisterStyle('no-such-style'), false);
  registerStyle({ id: 'test-gone', render: () => '' });
  // Gone from `styles` already (someone filtered it): nothing else is taken out with it.
  styles.splice(styles.indexOf('test-gone'), 1);
  const listed = [...styles];
  assert.equal(unregisterStyle('test-gone'), true);
  assert.deepEqual(styles, listed);
  registerStyle({ id: 'test-gone', render: () => '' });
  assert.equal(unregisterStyle('test-gone'), true);
  assert.ok(!styles.includes('test-gone'));
  assert.ok(!listStyles().some((s) => s.id === 'test-gone'));
  assert.throws(() => createCover({ style: 'test-gone' }), /Unknown style/);
});

test('palettes can be registered by id, and built-ins replaced only when asked', (t) => {
  // (Put back as they were, even if an assertion fails: mint's built-in, no brand or nameless.)
  t.after(() => ['brand', 'nameless', 'mint'].forEach((id) => unregisterPalette(id)));
  registerPalette({ id: 'brand', name: 'Brand', bg: ' #0b132b ', ink: '#f8f9fa', accents: ['#ff6b6b'] });
  const cover = createCover({ title: 'x', style: 'minimal', palette: 'brand' });
  assert.equal(cover.palette, 'brand');
  assert.match(cover.svg, /#0b132b/);
  const brand = palettes.find((p) => p.id === 'brand');
  assert.deepEqual(brand, {
    id: 'brand',
    name: 'Brand',
    bg: '#0b132b',
    ink: '#f8f9fa',
    accents: ['#ff6b6b'],
    dark: true,
  });
  // 'random' can pick it, as it can any palette.
  const seeds = Array.from({ length: 400 }, (_, i) => `seed-${i}`);
  assert.ok(seeds.some((seed) => createCover({ title: 'x', style: 'minimal', seed }).palette === 'brand'));
  assert.throws(() => registerPalette({ id: 'mint', bg: '#000', ink: '#fff', accents: ['#f00'] }), /built-in palette/);
  registerPalette({ id: 'nameless', bg: '#000000', ink: '#ffffff', accents: ['#ff0000'] });
  assert.equal(palettes.find((p) => p.id === 'nameless')?.name, 'nameless');
  assert.equal(unregisterPalette('nameless'), true);
  // (And an id a link reads as your own colours: one a link names could never be chosen.)
  for (const id of ['random', 'auto', 'custom', ' ', ' brand', 'custom-0b132b-f8f9fa-ff6b6b']) {
    assert.throws(() => registerPalette({ id, bg: '#000', ink: '#fff', accents: ['#f00'] }), TypeError);
  }
  assert.throws(() => registerPalette({ id: 'bad', bg: 'black', ink: '#fff', accents: ['#f00'] }), /hex/);
  const mint = palettes.find((p) => p.id === 'mint');
  registerPalette(
    { id: 'mint', name: 'My mint', bg: '#00ff99', ink: '#000000', accents: ['#ff0000'] },
    { replace: true },
  );
  assert.match(createCover({ title: 'x', style: 'minimal', palette: 'mint' }).svg, /#00ff99/);
  assert.equal(palettes.filter((p) => p.id === 'mint').length, 1);
  assert.equal(unregisterPalette('mint'), true);
  assert.equal(
    palettes.find((p) => p.id === 'mint'),
    mint,
  );
  assert.equal(unregisterPalette('mint'), false);
  assert.equal(unregisterPalette('brand'), true);
  assert.throws(() => createCover({ palette: 'brand' }), /Unknown palette "brand"/);
  assert.equal(unregisterPalette('brand'), false);
});

test('a custom style can offer variants and pick them with choose', (t) => {
  t.after(() => unregisterStyle('test-moods'));
  registerStyle({
    id: 'test-moods',
    variants: { mood: { label: 'Mood', values: { calm: 'Calm', loud: '' } } },
    render: (c) =>
      `<rect width="${c.W}" height="${c.H}" fill="${c.choose('mood', ['calm', 'loud']) === 'loud' ? '#ff0000' : '#0000ff'}"/>`,
  });
  const info = listStyles().find((s) => s.id === 'test-moods');
  assert.deepEqual(info?.variants, [
    {
      name: 'mood',
      label: 'Mood',
      values: [
        { value: 'calm', label: 'Calm' },
        { value: 'loud', label: 'Loud' },
      ],
    },
  ]);
  assert.match(createCover({ style: 'test-moods', variants: { mood: 'loud' } }).svg, /#ff0000/);
  assert.match(createCover({ style: 'test-moods', variants: { mood: 'calm' } }).svg, /#0000ff/);
  for (const variants of [{ mood: ['calm'] }, { mood: { values: {} } }, { ' mood': { values: { a: 'A' } } }, 'mood']) {
    assert.throws(
      () => registerStyle({ id: 'test-bad', variants: /** @type {any} */ (variants), render: () => '' }),
      TypeError,
    );
  }
});

test('a registered style’s genres must be a list of genre ids', () => {
  for (const genres of ['horror', ['Horrors'], [1]]) {
    assert.throws(
      () => registerStyle({ id: 'test-genres', genres: /** @type {any} */ (genres), render: () => '' }),
      /list of genres/,
    );
  }
  // (By id or name, in any case.)
  registerStyle({ id: 'test-genres', genres: ['Horror', 'Thriller & crime'], render: () => '' });
  try {
    assert.deepEqual(listStyles().find((s) => s.id === 'test-genres')?.genres, ['horror', 'thriller']);
  } finally {
    unregisterStyle('test-genres');
  }
  // A built-in style's replacement suits the built-in's genres, unless it names its own.
  const noir = () => listStyles().find((s) => s.id === 'noir')?.genres;
  const before = noir();
  registerStyle({ id: 'noir', render: () => '' }, { replace: true });
  try {
    assert.deepEqual(noir(), before);
    registerStyle({ id: 'noir', genres: ['literary'], render: () => '' }, { replace: true });
    assert.deepEqual(noir(), ['literary']);
  } finally {
    unregisterStyle('noir');
  }
  assert.deepEqual(noir(), before);
});
