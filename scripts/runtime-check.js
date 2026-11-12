#!/usr/bin/env node
// Draws the same covers in whichever runtime runs it (Node, Deno, Bun) and prints one hash of
// them all: CI compares the hashes, so the library runs everywhere and draws the same bytes.
//
//   node scripts/runtime-check.js · deno run --allow-read scripts/runtime-check.js · bun scripts/runtime-check.js
import { createHash } from 'node:crypto';
import { createCover, createMockup, listStyles, palettes, parseBookList, mockupKinds } from '../src/index.js';

const hash = createHash('sha256');
let covers = 0;
for (const { id, variants } of listStyles()) {
  for (const [i, [width, height]] of [
    [600, 900],
    [600, 600],
    [1800, 600],
  ].entries()) {
    const cover = createCover({
      title: i ? 'The Lighthouse Keeper of Wimbledon' : 'Dune',
      author: 'Mara Ellison',
      subtitle: i === 2 ? 'A Novel' : '',
      series: i === 1 ? 'Book Two' : '',
      badge: i === 1 ? 'Bestseller' : '',
      style: id,
      palette: palettes[(covers * 7) % palettes.length].id,
      seed: `r${i}`,
      width,
      height,
      texture: i === 2,
      variants: Object.fromEntries(variants.slice(0, 1).map((v) => [v.name, v.values[i % v.values.length].value])),
    });
    hash.update(cover.svg);
    covers += 1;
  }
}
const cover = createCover({ title: 'ガラスの街', author: '村上春樹', seed: 'cjk' });
hash.update(cover.svg);
for (const kind of mockupKinds) hash.update(createMockup(cover, { kind, text: 'Out now' }).svg);
hash.update(JSON.stringify(parseBookList('title,author,genre\nNight,Ann,Horror\n"Fish, Chips",Bo,')));

console.log(`${hash.digest('hex').slice(0, 16)} (${covers + 1} covers, ${mockupKinds.length} mockups)`);
