// The cover montage at the top of the README (docs/preview.png).
import { createCover } from '../src/index.js';
import { svgToDataUrl } from '../src/browser.js';

/** @type {[string, string, string, string, string, string?][]} */
const covers = [
  ['The Lighthouse Keeper', 'Mara Ellison', 'artdeco', 'midnight', 's1'],
  ['Signal Lost', 'R. M. Price', 'thriller', 'thriller', 's9', 'A Novel'],
  ['The Glass Orchard', 'Theo Vance', 'botanical', 'sage', 's6'],
  ['Neon Tide', 'Kai Moreno', 'bigtype', 'riso', 's2'],
  ['Small Gods of Winter', 'Ines Calder', 'constellation', 'deepsea', 's4'],
  ['Bright Machines', 'Yuki Tanaka', 'bauhaus', 'bauhaus', 's5'],
  ['Salt and Static', 'J. R. Okafor', 'swiss', 'mint', 's7'],
  ['Hollow Season', 'Sam Whitlock', 'silhouette', 'dusk', 's8'],
  ['The Last Cartographer', 'Elias Brandt', 'engraved', 'oxblood', 's12'],
  ['Under Paper Skies', 'Noor Haddad', 'papercut', 'pastel', 's10'],
  ['Midnight Arithmetic', 'Ada Lindqvist', 'blueprint', 'cobalt', 's11'],
  ['A Map of Quiet Places', 'Lena Hart', 'retro', 'synth', 's3'],
];
const loads = covers.map(([title, author, style, palette, seed, subtitle]) => {
  const img = new Image();
  img.src = svgToDataUrl(createCover({ title, author, subtitle, style, palette, seed }).svg);
  document.body.append(img);
  return img.decode();
});
await Promise.all(loads);
Object.assign(window, { __ready: true });
