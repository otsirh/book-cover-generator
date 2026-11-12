// Builds dist/: the page, its scripts and the library, plus everything in public/
// (headers, 404 page, icons, manifest, service worker…) at the site root. Deployed by `npm run deploy`.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { galleryHtml } from './gallery.js';

const SITE = ['index.html', 'site', 'src'];

/** OS and editor leftovers (.DS_Store, backups, swap files): never published. @param {string} path */
const junk = (path) => /(^|[\\/])(\.DS_Store|Thumbs\.db|desktop\.ini)$|~$|\.sw[op]$/i.test(path);
const filter = (/** @type {string} */ src) => !junk(src);

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const entry of SITE) cpSync(entry, `dist/${entry}`, { recursive: true, filter });
cpSync('public', 'dist', { recursive: true, filter });

/** Every file under a folder of dist/, as a site path. @param {string} dir */
const filesIn = (dir) =>
  readdirSync(`dist/${dir}`, { recursive: true, withFileTypes: true })
    // (Not hidden files: the offline copy is only what the page loads.)
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => `/${entry.parentPath.slice('dist/'.length)}/${entry.name}`.replaceAll('\\', '/'))
    .sort();

// What the service worker keeps for offline use: the page and everything it loads (not the type
// definitions, the 404 page or the social preview image).
const offline = [
  '/',
  ...filesIn('site'),
  // (Not the MCP server or <book-cover>: the app loads neither.)
  ...filesIn('src').filter((path) => path.endsWith('.js') && !['/src/mcp.js', '/src/element.js'].includes(path)),
  '/manifest.webmanifest',
  ...filesIn('icons'),
];
// The release changes whenever one of those files does, so the worker updates its copy.
const hash = createHash('sha256');
for (const path of offline) hash.update(path).update(readFileSync(`dist${path === '/' ? '/index.html' : path}`));
const release = hash.digest('hex').slice(0, 12);

const worker = readFileSync('dist/sw.js', 'utf8');
const built = worker
  .replace("const RELEASE = 'dev';", `const RELEASE = '${release}';`)
  .replace('const FILES = [];', `const FILES = ${JSON.stringify(offline)};`);
if (!built.includes(release) || built.includes('const FILES = [];')) {
  throw new Error('scripts/build.js: dist/sw.js no longer has the RELEASE and FILES lines to fill in');
}
writeFileSync('dist/sw.js', built);

// The gallery page, from the styles as they are now.
mkdirSync('dist/gallery');
writeFileSync('dist/gallery/index.html', galleryHtml());

console.log(`Built dist/ from ${SITE.join(', ')} and public/ (offline copy: ${offline.length} files, ${release})`);
