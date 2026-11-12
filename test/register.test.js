// Registering a style changes the shared style list, so this runs in its own process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCover, styles, registerStyle, listStyles } from '../src/index.js';

test('custom styles can be registered', () => {
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
