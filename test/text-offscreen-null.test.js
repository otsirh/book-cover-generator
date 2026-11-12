// OffscreenCanvas exists but has no 2D context: measurement uses a DOM canvas. Runs in its own process.
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(globalThis, {
  OffscreenCanvas: class {
    getContext() {
      return null;
    }
  },
  document: {
    createElement: () => ({
      getContext: () => ({ font: '', measureText: (/** @type {string} */ t) => ({ width: t.length * 5 }) }),
    }),
  },
});

const { measureText, FONTS } = await import('../src/text.js');

test('falls back to a DOM canvas when OffscreenCanvas has no 2D context', () => {
  assert.equal(measureText('abcd', 100, { font: FONTS.sans }), 20);
});
