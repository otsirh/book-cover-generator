// A minimal XML well-formedness check for the SVG the library writes (shared by the tests and
// the fuzz suite; it has no tests of its own).
import assert from 'node:assert/strict';

/** An `&` that doesn't start an entity XML knows. */
const BARE_AMP = /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i;

/**
 * Balanced tags, unique attributes, and no stray `<` or bare `&`, between tags or in an
 * attribute's value (where user text reaches, as in aria-label).
 * @param {string} svg @param {string} label
 */
export function assertWellFormed(svg, label) {
  /** @type {string[]} */
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(svg))) {
    const between = svg.slice(last, m.index);
    assert.ok(!between.includes('<'), `${label}: stray "<" near ${svg.slice(last, last + 60)}`);
    assert.ok(!BARE_AMP.test(between), `${label}: unescaped "&" near ${between.slice(0, 60)}`);
    last = tagRe.lastIndex;
    const [, closing, name, attrs, selfClosing] = m;
    const pairs = [...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)];
    const names = pairs.map((a) => a[1]);
    assert.equal(new Set(names).size, names.length, `${label}: duplicate attribute in <${name}${attrs}>`);
    for (const [, attr, value] of pairs) {
      assert.ok(!value.includes('<'), `${label}: "<" in ${attr}="${value.slice(0, 60)}"`);
      assert.ok(!BARE_AMP.test(value), `${label}: unescaped "&" in ${attr}="${value.slice(0, 60)}"`);
    }
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name, `${label}: mismatched </${name}>`);
    else stack.push(name);
  }
  assert.equal(stack.length, 0, `${label}: unclosed <${stack.join('>, <')}>`);
  assert.equal(svg.slice(last), '', `${label}: trailing content`);
}
