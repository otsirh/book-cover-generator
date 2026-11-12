// The genre pack's styles: defects a design review found, kept fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCover, palettes } from '../src/index.js';

/** How many different covers a style draws for one title, palette and size over `count` seeds. */
const variety = (/** @type {string} */ style, count = 60) =>
  new Set(
    Array.from(
      { length: count },
      (_, i) => createCover({ title: 'Field Notes', style, palette: 'mono', seed: `v${i}` }).svg,
    ),
  ).size;

test('Crest and Big Idea draw many different covers from their seeds', () => {
  // (Before: 20 and 27 in 60, so the app's strip of seven often showed the same cover twice.)
  assert.ok(variety('crest') >= 45, `crest: ${variety('crest')}`);
  assert.ok(variety('idea') >= 50, `idea: ${variety('idea')}`);
});

test('Hollow stays light: its tree is a few paths, not hundreds', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const { svg } = createCover({ title: 'The Hollow Night', style: 'hollow', seed, width: 600, height: 900 });
    assert.ok(svg.length < 20_000, `${seed}: ${svg.length} bytes`);
  }
});

test('Storybook never sets its title in plain black or white', () => {
  for (const p of palettes) {
    const { svg } = createCover({ title: 'Moon Bear', style: 'storybook', palette: p.id, seed: 's' });
    const fill = /<g [^>]*fill="(#[0-9a-f]{6})"[^>]*stroke="#ffffff"/.exec(svg)?.[1];
    assert.ok(fill, p.id);
    assert.ok(!['#111111', '#0d0d0d', '#ffffff'].includes(fill), `${p.id}: ${fill}`);
  }
});

test('the genre styles draw at every shape, with every pinned choice', () => {
  const pins = {
    hollow: [{ moon: 'full' }, { moon: 'blood' }],
    ribbon: [{}],
    crest: ['laurels', 'swords', 'rays'].map((behind) => ({ behind, field: 'quarterly', emblem: 'tower' })),
    storybook: [{ sky: 'sun' }, { sky: 'rainbow' }],
    idea: ['bars', 'arrow', 'circle'].map((mark) => ({ mark })),
  };
  for (const [style, list] of Object.entries(pins)) {
    for (const variants of list) {
      for (const [width, height] of [
        [600, 900],
        [600, 600],
        [1800, 600],
        [400, 1200],
      ]) {
        for (const subtitle of ['', 'A Novel\nTranslated by Someone']) {
          const c = createCover({ title: 'An Extraordinarily Long Title', subtitle, style, variants, width, height });
          assert.doesNotMatch(
            c.svg,
            /NaN|Infinity|undefined/,
            `${style} ${JSON.stringify(variants)} ${width}x${height}`,
          );
          assert.deepEqual(c.variants, { ...c.variants, ...variants });
        }
      }
    }
  }
});
