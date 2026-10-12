import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFixture } from './helpers.js';
import { analyze } from '../src/core/analyze.js';

const { names, byName } = runFixture('js-app');

test('JS: finds the planted orphans', () => {
  for (const n of ['unusedHelper', 'countdown', 'legacyFormat', 'GhostButton', 'fetchUserLegacy', 'formatOld']) {
    assert.ok(names.has(n), `expected ${n} to be an orphan`);
  }
});

test('JS: false-positive traps stay alive', () => {
  for (const n of [
    'Button', // used only in JSX
    'Header', // default export imported as Hdr
    'buildTitle', // default export imported as makeTitle
    'shout', // used only inside a template literal
    'clean', // after a tricky regex literal
    'onSave', // looked up by exact string
    'Home', 'getServerSideProps', // Next.js page exports
    'componentDidMount', 'render', 'tick', // React class lifecycle + internal call
    'fetchUser', // CommonJS export that is required
    'config', // vite.config.js export
  ]) {
    assert.ok(!names.has(n), `${n} should be alive`);
  }
});

test('JS: exported-but-never-imported is reported with a reason and lower confidence', () => {
  const o = byName.GhostButton;
  assert.equal(o.exported, true);
  assert.match(o.reasons[0], /nothing ever imports it/);
  assert.ok(o.confidence < byName.unusedHelper.confidence);
});

test('JS: orphan details: file:line, params, length, doc, calls, recursion', () => {
  const o = byName.legacyFormat;
  assert.equal(o.file, 'src/title.js');
  assert.equal(o.params.length, 6);
  assert.ok(o.length >= 3);
  assert.equal(byName.countdown.recursive, true);
  assert.deepEqual(byName.countdown.calls, []);
});

test('JS: a library entry point keeps its exports alive', () => {
  const report = analyze([
    { path: 'package.json', content: JSON.stringify({ name: 'lib', main: 'dist/index.js' }) },
    { path: 'src/index.ts', content: "export function publicThing() { return 1 }\nexport * from './util';\n" },
    { path: 'src/util.ts', content: 'export function reExported() { return 2 }\nfunction secret() { return 3 }\n' },
  ], { minConfidence: 0 });
  const n = new Set(report.orphans.map((o) => o.name));
  assert.ok(!n.has('publicThing') && !n.has('reExported'));
  assert.ok(n.has('secret'));
});

test('JS: skips node_modules, dist, minified files and test fixtures', () => {
  const report = analyze([
    { path: 'node_modules/x/index.js', content: 'function dep() {}' },
    { path: 'dist/app.js', content: 'function built() {}' },
    { path: 'src/vendor.min.js', content: 'function mini() {}' },
    { path: 'test/fixtures/sample.js', content: 'function fixture() {}' },
    { path: 'src/real.js', content: 'function real() {}' },
  ], { minConfidence: 0 });
  assert.deepEqual(report.orphans.map((o) => o.name), ['real']);
});

test('JS: a mention in an HTML template counts as a use', () => {
  const report = analyze([
    { path: 'index.html', content: '<button onclick="openMenu()">x</button>' },
    { path: 'menu.js', content: 'function openMenu() {}\nfunction closeMenu() {}' },
  ], { minConfidence: 0 });
  assert.deepEqual(report.orphans.map((o) => o.name), ['closeMenu']);
});

test('JS: names built at runtime (this[`voice_${x}`]) are not confident orphans', () => {
  const report = analyze([{ path: 'synth.js', content: 'class Synth {\n  play(m) { return this[`voice_${m}`](); }\n  voice_bell() { return 1; }\n}\nnew Synth().play("bell");\n' }]);
  assert.equal(report.orphans.length, 0);
  assert.equal(report.shy[0].name, 'voice_bell');
  assert.ok(report.shy[0].risks.some((r) => /builds names like/.test(r.text)));
});
