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

test('a style can be a class instance, and missing details get defaults', () => {
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
  assert.deepEqual(info, { id: 'test-undefined', name: 'test-undefined', description: '', group: 'Custom' });
});
