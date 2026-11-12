#!/usr/bin/env node
// A bundler keeps `import 'book-cover-generator/element'`: the import is only for its side effect
// (defining <book-cover>), which package.json's `sideEffects` must name, or bundlers drop it.
import { build } from 'esbuild';

const result = await build({
  stdin: { contents: "import 'book-cover-generator/element';", resolveDir: process.cwd(), loader: 'js' },
  bundle: true,
  write: false,
  format: 'esm',
  logLevel: 'silent',
});
const code = result.outputFiles[0].text;
if (!code.includes("customElements.define('book-cover'") && !code.includes('customElements.define("book-cover"')) {
  console.error('A bundle of book-cover-generator/element drops <book-cover>: check "sideEffects" in package.json');
  process.exit(1);
}
console.log(`A bundle of book-cover-generator/element defines <book-cover> (${Math.round(code.length / 1024)} KB)`);
