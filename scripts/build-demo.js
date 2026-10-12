// Bundles demo/lovelorn-shop into web/demo-repo.json for the web demo.
// Run after editing the demo: npm run build:demo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProject } from '../src/node/scan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function demoBundle() {
  const ages = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo', 'ages.json'), 'utf8'));
  const { files } = readProject(path.join(ROOT, 'demo', 'lovelorn-shop'), { useGit: false });
  return {
    name: 'lovelorn-shop',
    note: 'A tiny shop with planted lonely functions (and some false-positive traps). Ages are fake.',
    files: files
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => ({ path: f.path, content: f.content.replace(/\r\n?/g, '\n'), ageDays: ages[f.path] ?? 3 })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(ROOT, 'web', 'demo-repo.json');
  fs.writeFileSync(out, JSON.stringify(demoBundle(), null, 1) + '\n');
  console.log('wrote', path.relative(ROOT, out));
}
