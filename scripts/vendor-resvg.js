#!/usr/bin/env node
// Writes worker/resvg-glue.js: @resvg/resvg-wasm's JavaScript glue (index.mjs) as a function that
// makes a fresh copy each time it's called. The package keeps its WebAssembly instance in its own
// module and starts it only once, so a drawing that traps it would leave the Worker's PNGs on a
// broken instance for as long as the Worker lives; with a copy of its own, an engine that traps is
// replaced by a new instance of the same compiled module, and the old one's memory is freed.
//
//   node scripts/vendor-resvg.js           write it (after updating @resvg/resvg-wasm)
//   node scripts/vendor-resvg.js --check   fail if it isn't what the installed package gives
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('../node_modules/@resvg/resvg-wasm/package.json', import.meta.url), 'utf8'),
);
const source = readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index.mjs', import.meta.url), 'utf8');
const target = new URL('../worker/resvg-glue.js', import.meta.url);

const EXPORTS = /\nexport \{\n {2}Resvg2 as Resvg,\n {2}initWasm\n\};\n?$/;
if (!EXPORTS.test(source) || /^\s*import\s/m.test(source) || source.includes('import.meta')) {
  throw new Error(`@resvg/resvg-wasm ${pkg.version}: its glue isn't laid out as this script expects; check it by hand`);
}

const glue = `// @resvg/resvg-wasm ${pkg.version} (${pkg.license}, https://github.com/thx/resvg-js): its index.mjs,
// unchanged but for being wrapped in createResvg(), so each call has state of its own. Written by
// scripts/vendor-resvg.js; don't edit it by hand. This file stays under the Mozilla Public License
// 2.0 (https://mozilla.org/MPL/2.0/), as the package is.
/* eslint-disable */
// @ts-nocheck

/** A fresh copy of resvg's glue: its own WebAssembly instance once initWasm() is called. */
export function createResvg() {
${source.replace(EXPORTS, '\nreturn { Resvg: Resvg2, initWasm };\n')}
}
`;

if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== glue) {
    console.error('worker/resvg-glue.js is not the installed @resvg/resvg-wasm: run node scripts/vendor-resvg.js');
    process.exit(1);
  }
  console.log(`worker/resvg-glue.js is @resvg/resvg-wasm ${pkg.version}`);
} else {
  writeFileSync(target, glue);
  console.log(`Wrote worker/resvg-glue.js from @resvg/resvg-wasm ${pkg.version}`);
}
