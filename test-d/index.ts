// Compile-time checks for the published type definitions (run by `npm run typecheck`).
import generateDefault, {
  createCover,
  generateCover,
  styles,
  palettes,
  listStyles,
  registerStyle,
  randomSeed,
  fitText,
  drawText,
  FONTS,
  svgUtils,
  titleBlock,
  authorFit,
  splitLead,
  type Cover,
  type StyleGroup,
  type StyleContext,
  type StyleInfo,
} from '../src/index.js';
import { rasterize, downloadCover, copyText, svgToDataUrl } from '../src/browser.js';

const cover: Cover = createCover({
  title: 'T',
  author: 'A',
  style: 'artdeco',
  palette: 'midnight',
  seed: 1,
  width: 600,
  height: 900,
});
const svg: string = generateCover({ title: cover.style });
const fromDefault: string = generateDefault();
createCover({ palette: { bg: '#000', ink: '#fff', accents: ['#f00'] } });
createCover({ style: 'random', palette: 'auto', seed: randomSeed() });
createCover({ style: 'my-registered-style' });
createCover({ title: 'T', subtitle: 'A Novel', texture: true, style: 'botanical', palette: 'riso' });
// @ts-expect-error texture is a boolean
createCover({ texture: 'yes' });

// @ts-expect-error width must be a number
createCover({ width: '600' });
// @ts-expect-error unknown option
createCover({ colour: 'red' });
// @ts-expect-error accents are required for a custom palette
createCover({ palette: { bg: '#000', ink: '#fff' } });

const ids: string[] = styles;
const info: StyleInfo[] = listStyles();
const group: StyleGroup | (string & {}) = info[0].group;
const lead: string = splitLead('The End').lead;
const firstPalette: string = palettes[0].bg;

registerStyle({
  id: 'plain',
  name: 'Plain',
  group: 'Typographic',
  prefer: 'dark',
  render(c: StyleContext) {
    const t = fitText(c.title, { font: FONTS.serif, maxWidth: c.W - c.m * 2, maxSize: c.W * 0.1 });
    const r = c.rng.int(1, 3);
    const block = titleBlock(c, { maxWidth: c.W - c.m * 2, maxHeight: c.H / 2, maxSize: c.S * 0.2, stack: true });
    const a = authorFit(c, { maxSize: c.S * 0.05 });
    return (
      svgUtils.rect(0, 0, c.W, c.H, c.p.night) +
      drawText(t, { x: c.m, y: c.m * r, fill: c.p.paper }) +
      block.draw({ x: c.m, y: c.H / 2, fill: c.p.ink, lineFills: [c.p.accents[0]] }) +
      drawText(a, { x: c.m, y: c.H - c.m, fill: c.subtitle ? c.p.ink : c.p.paper })
    );
  },
});
// @ts-expect-error render is required
registerStyle({ id: 'broken' });
// @ts-expect-error prefer is 'light' | 'dark'
registerStyle({ id: 'x', prefer: 'grey', render: () => '' });
// @ts-expect-error maxSize is required
fitText('x', { maxWidth: 10 });
const fitted: boolean = fitText('Gg', { maxWidth: 10, maxSize: 10, maxHeight: 12, descent: true }).truncated;
void fitted;
// @ts-expect-error descent is a boolean
fitText('x', { maxWidth: 10, maxSize: 10, descent: 0.2 });
// @ts-expect-error anchor must be start | middle | end
drawText(fitText('x', { maxWidth: 10, maxSize: 10 }), { x: 0, y: 0, anchor: 'center' });

const blob: Promise<Blob> = rasterize(svg, { type: 'image/png', scale: 2 });
void downloadCover(svg, 'jpeg', 'name', { scale: 2, quality: 0.9 });
void copyText(svgToDataUrl(svg));
// @ts-expect-error gif is not supported
void downloadCover(svg, 'gif');

export { fromDefault, ids, info, firstPalette, blob, group, lead };
