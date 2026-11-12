// Where a cover's text is, read from its SVG (shared by the tests; it has no tests of its own).
import { FONTS, measureText, graphemes } from '../src/text.js';

export const FONT_BY_FAMILY = new Map(Object.values(FONTS).map((f) => [f.family, f]));
/** @param {string} s */
export const unescapeXml = (s) =>
  s.replace(/&(apos|quot|lt|gt|amp);/g, (_, e) => ({ apos: "'", quot: '"', lt: '<', gt: '>', amp: '&' })[e] ?? e);

/**
 * Every line of text set on the cover, with where it is and what it is set in, inherited through
 * nested elements. Text in a transformed group (a spine, a turned line) or in definitions (a clip,
 * a mask) is marked `moved`: its place isn't its x and y.
 * @param {string} svg
 */
export function textBoxes(svg) {
  /** @type {{ size: number, family?: string, weight: number, italic: boolean, spacing: number, anchor: string, x?: string, moved: boolean }[]} */
  const stack = [];
  const out = [];
  for (const [, closing, tag, attrs, selfClosing, content] of svg.matchAll(
    /<(\/?)(g|text|tspan|svg|clipPath|mask|pattern|defs|symbol)\b([^>]*?)(\/?)>([^<]*)/g,
  )) {
    if (closing) {
      stack.pop();
      continue;
    }
    const up = stack.at(-1);
    /** @param {RegExp} re */
    const get = (re) => re.exec(attrs)?.[1];
    const state = {
      size: Number(get(/font-size="([\d.]+)"/) ?? up?.size ?? 0),
      family: get(/font-family="([^"]*)"/) ?? up?.family,
      weight: Number(get(/font-weight="(\d+)"/) ?? up?.weight ?? 400),
      italic: (get(/font-style="(\w+)"/) ?? (up?.italic ? 'italic' : '')) === 'italic',
      spacing: Number(get(/letter-spacing="(-?[\d.]+)"/) ?? up?.spacing ?? 0),
      anchor: get(/text-anchor="(\w+)"/) ?? up?.anchor ?? 'start',
      x: get(/\bx="(-?[\d.]+)"/) ?? (tag === 'tspan' ? up?.x : undefined),
      moved: !!up?.moved || /\btransform=/.test(attrs) || !['g', 'text', 'tspan', 'svg'].includes(tag),
    };
    const y = get(/\by="(-?[\d.]+)"/);
    const text = unescapeXml(content);
    if ((tag === 'text' || tag === 'tspan') && text.trim() && y != null && state.size) {
      out.push({ ...state, text, y: Number(y) });
    }
    if (!selfClosing) stack.push(state);
  }
  return out;
}

/**
 * A text box's extent across, from its x, anchor and width as the library measures it. (SVG adds
 * letter-spacing after every character, the last one too: that space is in the anchoring, but
 * nothing is drawn in it.)
 * @param {ReturnType<typeof textBoxes>[number]} box
 */
export function extentOf(box) {
  const font = FONT_BY_FAMILY.get(unescapeXml(box.family ?? ''));
  if (!font) throw new Error(`text in an unknown font, ${box.family}`);
  const w =
    measureText(box.text, box.size, { font, weight: box.weight, italic: box.italic }) +
    box.spacing * graphemes(box.text).length;
  const x = Number(box.x);
  const left = box.anchor === 'middle' ? x - w / 2 : box.anchor === 'end' ? x - w : x;
  return { left, right: left + w - box.spacing, font };
}
