import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/core/analyze.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readDir(dir) {
  const out = [];
  (function walk(rel) {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else out.push({ path: r, content: fs.readFileSync(path.join(dir, r), 'utf8') });
    }
  })('');
  return out;
}

/** Analyse a fixture app and return { report, names, byName }. */
export function runFixture(name, opts = {}) {
  const report = analyze(readDir(path.join(ROOT, 'fixtures', name)), { minConfidence: 0, ...opts });
  const names = new Set(report.orphans.map((o) => o.name));
  const byName = Object.fromEntries(report.orphans.map((o) => [o.name, o]));
  return { report, names, byName };
}
