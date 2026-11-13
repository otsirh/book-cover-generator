// One-file builds for pages that embed the library from the site: `<book-cover>` as a single
// minified module (/element.js), instead of the two dozen modules of /src/element.js. Written by
// scripts/build.js; the dev server answers them too.
import { readFileSync } from 'node:fs';

/** The bundles the site serves, by path, and the module each is built from. */
export const BUNDLES = Object.freeze({ '/element.js': 'src/element.js' });

/**
 * A bundle's code: its module and everything it imports, minified, as one ES module.
 * @param {keyof typeof BUNDLES} path
 */
export async function bundle(path) {
  const { build } = await import('esbuild');
  const { version, license } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const result = await build({
    entryPoints: [BUNDLES[path]],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    write: false,
    legalComments: 'none',
    banner: { js: `// book-cover-generator ${version} (${license}): https://github.com/otsirh/book-cover-generator` },
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}
