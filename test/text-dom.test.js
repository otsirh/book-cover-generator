// Text measurement through a DOM <canvas> (browsers without OffscreenCanvas), in its own process.
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(globalThis, {
  document: {
    createElement: (/** @type {string} */ tag) => {
      assert.equal(tag, 'canvas');
      return { getContext: () => ({ font: '', measureText: (/** @type {string} */ t) => ({ width: t.length * 7 }) }) };
    },
  },
});

const { measureText, FONTS } = await import('../src/text.js');

test('measures with a DOM canvas when there is no OffscreenCanvas', () => {
  assert.equal(measureText('abc', 100, { font: FONTS.sans }), 21);
});
