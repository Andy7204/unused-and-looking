import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFixture } from './helpers.js';
import { analyze } from '../src/core/analyze.js';

test('Python: orphans found, framework/test/dunder/entry-point traps alive', () => {
  const { names, byName } = runFixture('python-app');
  for (const n of ['_unused_cache_key', '_legacy_total', 'format_price_old']) assert.ok(names.has(n), `${n} should be an orphan`);
  for (const n of ['__init__', '__str__', 'total', 'show_order', 'public_api', 'slugify', 'format_price', 'main', 'run_migrations', 'order', 'test_total_is_zero', 'setUp', 'test_str']) {
    assert.ok(!names.has(n), `${n} should be alive`);
  }
  assert.equal(byName._legacy_total.doc, 'Pre-2020 totals.');
  assert.equal(byName._legacy_total.params.length, 5, 'self is not a param');
  assert.equal(byName._legacy_total.kind, 'method');
});

test('Python: public functions of a packaged library get low confidence', () => {
  const report = analyze([
    { path: 'setup.py', content: 'from setuptools import setup\nsetup(name="x")\n' },
    { path: 'pkg/core.py', content: 'def public_helper():\n    return 1\n\ndef _private_helper():\n    return 2\n' },
  ]);
  const names = report.orphans.map((o) => o.name);
  assert.deepEqual(names, ['_private_helper']);
  assert.equal(report.shy[0].name, 'public_helper');
});

test('Go: orphans found; main/init/tests/Stringer/cgo exports alive', () => {
  const { names, byName } = runFixture('go-app');
  for (const n of ['oldGreet', 'compact', 'ExportedButUnused', 'Purge']) assert.ok(names.has(n), `${n} should be an orphan`);
  for (const n of ['main', 'init', 'greet', 'String', 'TestGreet', 'BenchmarkGreet', 'CallbackFromC', 'New', 'Get']) {
    assert.ok(!names.has(n), `${n} should be alive`);
  }
  assert.match(byName.oldGreet.doc, /pre-i18n/);
  assert.equal(byName.compact.kind, 'method');
});

test('Go: exported functions in a library package are low confidence', () => {
  const report = analyze([
    { path: 'go.mod', content: 'module example.com/lib\n' },
    { path: 'lib.go', content: 'package lib\n\nfunc Public() {}\n\nfunc private() {}\n' },
  ]);
  assert.deepEqual(report.orphans.map((o) => o.name), ['private']);
  assert.deepEqual(report.shy.map((o) => o.name), ['Public']);
});

test('Ruby: private orphans found; actions, callbacks, hooks, interpolation traps alive', () => {
  const { names } = runFixture('ruby-app');
  for (const n of ['legacy_avatar_url', 'unused_normalize']) assert.ok(names.has(n), `${n} should be an orphan`);
  for (const n of ['index', 'show', 'find_user', 'initialize', 'to_s', 'tokens', 'classify', 'abbrev', 'describe']) {
    assert.ok(!names.has(n), `${n} should be alive`);
  }
});

test('Ruby: predicate methods keep their ? and are matched with it', () => {
  const report = analyze([{ path: 'a.rb', content: 'class A\n  def ok?\n    true\n  end\n\n  def go\n    ok?\n  end\nend\nA.new.go\n' }], { minConfidence: 0 });
  assert.deepEqual(report.orphans.map((o) => o.name), []);
});

test('confidence is always 5..99 and every orphan explains itself', () => {
  for (const f of ['js-app', 'python-app', 'go-app', 'ruby-app']) {
    for (const o of runFixture(f).report.orphans) {
      assert.ok(o.confidence >= 5 && o.confidence <= 99);
      assert.ok(o.reasons.length > 0);
      assert.ok(o.snippet.length > 0);
    }
  }
});
