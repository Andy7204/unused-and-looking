// Builds the static GitHub Pages site into _site/: web/ plus src/core/ at
// _site/core/ (the web app imports the exact same analyser as the CLI).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'web'), OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'src', 'core'), path.join(OUT, 'core'), { recursive: true });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

let total = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else total += fs.statSync(p).size;
  }
})(OUT);
console.log(`built _site/ (${(total / 1024).toFixed(1)} KB)`);
