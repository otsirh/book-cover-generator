// Builds dist/: the page, its scripts and the library, plus everything in public/
// (headers, 404 page, icons, manifest…) at the site root. Deployed by `npm run deploy`.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const SITE = ['index.html', 'site', 'src'];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const entry of SITE) cpSync(entry, `dist/${entry}`, { recursive: true });
cpSync('public', 'dist', { recursive: true });
console.log(`Built dist/ from ${SITE.join(', ')} and public/`);
