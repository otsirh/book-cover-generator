// Copies the public site (page + library) into dist/ for deployment.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const PUBLIC = ['index.html', 'site', 'src', 'docs'];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const entry of PUBLIC) cpSync(entry, `dist/${entry}`, { recursive: true });
console.log(`Built dist/ (${PUBLIC.join(', ')})`);
