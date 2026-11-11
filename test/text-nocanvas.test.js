// When creating a canvas throws, measurement falls back to the estimate. Runs in its own process.
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(globalThis, {
  OffscreenCanvas: class {
    constructor() {
      throw new Error('blocked');
    }
  },
});

const { measureText, FONTS } = await import('../src/text.js');

test('falls back to the width estimate if a canvas cannot be created', () => {
  assert.ok(measureText('abc', 10, { font: FONTS.mono }) === 18);
});
