import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { similarity, nameSimilarity, nameTokens, normTokens } from '../src/core/match.js';
import { analyze } from '../src/core/analyze.js';
import { readDir, ROOT } from './helpers.js';

test('normalised tokens ignore local names but keep APIs', () => {
  assert.deepEqual(normTokens('const a = b.trim()'), normTokens('let x = y.trim()'));
  assert.notDeepEqual(normTokens('a.trim()'), normTokens('a.split()'));
});

test('similarity: renamed copies score high, unrelated code scores low', () => {
  const a = 'function f(items) { let t = 0; for (const i of items) { t += i.price * i.qty; } return t; }';
  const b = 'function g(list) { let sum = 0; for (const x of list) { sum += x.price * x.qty; } return sum; }';
  const c = 'function h(url) { return fetch(url).then((r) => r.json()); }';
  assert.ok(similarity(a, b) > 0.8, 'renamed copy');
  assert.ok(similarity(a, c) < 0.2, 'unrelated');
  assert.equal(similarity('', a), 0);
});

test('name similarity splits camelCase and snake_case', () => {
  assert.deepEqual(nameTokens('formatLegacyDate'), ['format', 'legacy', 'date']);
  assert.deepEqual(nameTokens('parse_HTTPHeader'), ['parse', 'http', 'header']);
  const s = nameSimilarity('formatLegacyDate', 'formatDate');
  assert.ok(s.score > 0.5);
  assert.deepEqual(s.shared.sort(), ['date', 'format']);
  assert.equal(nameSimilarity('slugify', 'fetchUser').score, 0);
});

test('matchmaking finds inline duplicates and cousins in the demo', () => {
  const report = analyze(readDir(path.join(ROOT, 'demo', 'lovelorn-shop')));
  const o = report.orphans.find((x) => x.name === 'formatLegacyDate');
  assert.ok(o.matches.some((m) => m.file === 'src/components/Report.jsx' && m.type === 'inline'), 'inline duplicate in Report.jsx');
  assert.ok(o.matches.some((m) => m.type === 'cousin' && m.target === 'formatDate'), 'call site of formatDate');
  for (const m of o.matches) {
    assert.ok(m.score > 0 && m.score <= 99);
    assert.ok(m.reason.length > 20);
  }
  const close = report.orphans.find((x) => x.name === 'closeCartDrawerOld');
  assert.ok(close.matches.some((m) => m.file === 'src/drawer.js'), 'near-twin of openCartDrawer');
});
