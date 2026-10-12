import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.js';
import { parseArgs } from '../src/cli.js';
import { demoBundle } from '../scripts/build-demo.js';

const CLI = path.join(ROOT, 'src', 'cli.js');
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

test('CLI --demo prints profiles, stats and the badge', () => {
  const r = run('--demo', '--limit', '3');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Unused & Looking/);
  assert.match(r.stdout, /days single/);
  assert.match(r.stdout, /Your codebase has 19 single functions\./);
  assert.match(r.stdout, /Loneliest: formatLegacyDate\(\), 1,402 days single/);
  assert.match(r.stdout, /img\.shields\.io\/badge\/lonely%20functions-19/);
  assert.doesNotMatch(r.stdout, /\x1b\[/, 'no colours when NO_COLOR / not a TTY');
});

test('CLI --json is valid and complete', () => {
  const r = run('--demo', '--json');
  assert.equal(r.status, 0);
  const report = JSON.parse(r.stdout);
  assert.equal(report.tool, 'unused-and-looking');
  assert.equal(report.orphans.length, 19);
  const o = report.orphans.find((x) => x.name === 'formatLegacyDate');
  assert.equal(o.file, 'src/utils/date.js');
  assert.ok(o.lastModified > 0);
  assert.ok(Array.isArray(o.matches));
});

test('CLI --markdown prints a Breakup List', () => {
  const r = run('--demo', '--md');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^# 💔 Breakup List: 19 functions/);
  assert.equal((r.stdout.match(/^- \[ \]/gm) || []).length, 19);
});

test('CLI works on a real folder and --max fails CI when exceeded', () => {
  const dir = path.join(ROOT, 'fixtures', 'go-app');
  const ok = run(dir, '--json', '--no-git');
  assert.equal(ok.status, 0);
  assert.ok(JSON.parse(ok.stdout).orphans.length >= 3);
  const fail = run(dir, '--max', '1', '--no-git');
  assert.equal(fail.status, 1);
  assert.match(fail.stderr, /max allowed: 1/);
});

test('CLI friendly errors', () => {
  const missing = run(path.join(ROOT, 'does-not-exist'));
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /is not a folder/);
  const bad = run('--wat');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Unknown option --wat/);
  const num = run('--limit', 'lots');
  assert.equal(num.status, 2);
  assert.match(num.stderr, /needs a number/);
});

test('CLI --help and --version', () => {
  assert.match(run('--help').stdout, /npx unused-and-looking \[dir\]/);
  assert.match(run('-v').stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('parseArgs handles = syntax and positional dir', () => {
  const o = parseArgs(['src', '--min-confidence=70', '--no-git']);
  assert.equal(o.dir, 'src');
  assert.equal(o.minConfidence, 70);
  assert.equal(o.git, false);
});

test('the CLI never writes to the scanned folder', () => {
  const dir = path.join(ROOT, 'fixtures', 'ruby-app');
  const snapshot = () => fs.readdirSync(dir, { recursive: true }).sort().join('|');
  const before = snapshot();
  run(dir, '--json', '--md');
  assert.equal(snapshot(), before);
});

test('web/demo-repo.json is in sync with demo/ (run npm run build:demo)', () => {
  const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'demo-repo.json'), 'utf8'));
  assert.deepEqual(onDisk, demoBundle());
});
