import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripSource } from '../src/core/strip.js';

const ids = (code) => new Set(code.match(/[A-Za-z_$][\w$]*/g));

test('JS: comments and strings are blanked but offsets are kept', () => {
  const src = "const a = 'hello world'; // call foo()\n/* bar() */ baz();";
  const { code, strings } = stripSource(src, 'js');
  assert.equal(code.length, src.length);
  assert.equal(code.split('\n').length, 2);
  assert.ok(!ids(code).has('foo') && !ids(code).has('bar') && !ids(code).has('hello'));
  assert.ok(ids(code).has('baz'));
  assert.equal(strings[0].text, 'hello world');
});

test('JS: template literal interpolations stay as code', () => {
  const { code } = stripSource('const s = `hi ${shout(name)} and ${`nested ${deep()}`} bye`;', 'js');
  assert.ok(ids(code).has('shout') && ids(code).has('deep'));
  assert.ok(!ids(code).has('hi') && !ids(code).has('bye'));
});

test("JS: an apostrophe in JSX text doesn't swallow the rest of the line", () => {
  const { code } = stripSource("<p>Don't panic</p><Widget />", 'js');
  assert.ok(ids(code).has('Widget'));
});

test('JS: regex literals with quotes and slashes are not strings', () => {
  const { code } = stripSource("const RE = /[\"'\\/]+/g; after();", 'js');
  assert.ok(ids(code).has('after'));
});

test('JS: division is not mistaken for a regex', () => {
  const { code } = stripSource('const x = a / b; keep(); const y = c / d;', 'js');
  assert.ok(ids(code).has('keep'));
});

test('Python: f-string expressions are code, plain strings and comments are not', () => {
  const { code } = stripSource('x = f"{slugify(s)} costs {{literal}}"  # comment()\ny = "not_code()"\n', 'py');
  assert.ok(ids(code).has('slugify'));
  assert.ok(!ids(code).has('comment') && !ids(code).has('not_code') && !ids(code).has('literal'));
});

test('Python: triple-quoted docstrings are stripped', () => {
  const { code } = stripSource('def f():\n    """Calls hidden() here."""\n    return real()\n', 'py');
  assert.ok(!ids(code).has('hidden') && ids(code).has('real'));
});

test('Go: raw strings, runes and comments are stripped', () => {
  const { code } = stripSource('s := `json:"x" hidden()`\nr := \'"\'\n// gone()\nkeep()', 'go');
  assert.ok(!ids(code).has('hidden') && !ids(code).has('gone') && ids(code).has('keep'));
});

test('Ruby: interpolation is code, char literals do not open strings', () => {
  const src = 'case c\nwhen ?" then "q #{abbrev(s)}"\nwhen ?\\t then 1\nend\nlater()\n';
  const { code } = stripSource(src, 'rb');
  assert.ok(ids(code).has('abbrev') && ids(code).has('later'));
});

test('Ruby: heredocs and =begin blocks are stripped, symbols kept', () => {
  const src = 'x = <<~SQL\n  select hidden()\nSQL\n=begin\nalso_hidden()\n=end\nbefore_action :load_user\n';
  const { code } = stripSource(src, 'rb');
  assert.ok(!ids(code).has('hidden') && !ids(code).has('also_hidden'));
  assert.ok(ids(code).has('load_user'));
});
