import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, easterEggOf, loneliest, interestsOf } from '../src/core/profile.js';
import { avatarSvg, avatarSpec } from '../src/core/avatar.js';
import { breakupMarkdown, badgeMarkdown, statsSentence } from '../src/core/report.js';
import { parseRepo } from '../src/core/repo.js';

const NOW = Date.UTC(2026, 9, 1);
const base = (over = {}) => ({
  id: 'x', name: 'formatLegacyDate', file: 'src/utils/date.js', line: 14, endLine: 31, length: 18, lang: 'js', kind: 'function',
  params: ['a', 'b', 'c', 'd', 'e'], paramsText: 'a, b, c, d, e', confidence: 92, status: 'Very single', doc: '',
  calls: ['padStart'], snippet: 'function formatLegacyDate(a,b,c,d,e) {\n  var d = new Date(a); return d.getMonth();\n}',
  reasons: ['Never referenced anywhere in the scanned code'], risks: [], matches: [], recursive: false,
  lastModified: NOW - 1402 * 86400000, ...over,
});

test('profile: age, bio, interests and red flags', () => {
  const p = buildProfile(base(), NOW);
  assert.equal(p.days, 1402);
  assert.match(p.since, /^[A-Z][a-z]+ \d{4}$/);
  assert.equal(p.interests[0].key, 'dates');
  assert.ok(p.redFlags.some((f) => /5 parameters/.test(f)));
  assert.ok(p.redFlags.includes('uses var'));
  assert.ok(p.bio.length > 30);
  assert.equal(p.headline, 'formatLegacyDate(), 1,402');
});

test('profile is deterministic', () => {
  assert.deepEqual(buildProfile(base(), NOW), buildProfile(base(), NOW));
  assert.equal(avatarSvg('foo'), avatarSvg('foo'));
  assert.notEqual(avatarSvg('foo'), avatarSvg('bar'));
  assert.ok(avatarSpec('foo').shapes.length > 4);
});

test('unknown age is handled gracefully', () => {
  const p = buildProfile(base({ lastModified: null }), NOW);
  assert.equal(p.days, null);
  assert.ok(!/Ghosted since null/.test(p.bio));
});

test('easter egg: love() and match() get special profiles', () => {
  assert.equal(easterEggOf({ name: 'love' }), 'love');
  assert.equal(easterEggOf({ name: 'match' }), 'match');
  assert.equal(easterEggOf({ name: 'matches' }), null);
  const p = buildProfile(base({ name: 'love' }), NOW);
  assert.equal(p.easterEgg, 'love');
  assert.match(p.bio, /Literally named love/);
});

test('loneliest prefers the oldest confident orphan', () => {
  const a = base({ id: 'a', name: 'a', lastModified: NOW - 10 * 86400000 });
  const b = base({ id: 'b', name: 'b', lastModified: NOW - 900 * 86400000 });
  const c = base({ id: 'c', name: 'c', confidence: 40, lastModified: NOW - 5000 * 86400000 });
  assert.equal(loneliest([a, b, c], NOW).name, 'b');
});

test('interests come from the name and the body', () => {
  const keys = interestsOf(base({ name: 'fetchUserToken', snippet: 'return fetch(url, { headers: { auth: token } })' })).map((i) => i.key);
  assert.ok(keys.includes('network') && keys.includes('auth'));
});

test('Breakup List markdown is a PR-ready checklist with links', () => {
  const md = breakupMarkdown([base()], { repo: 'o/r', now: NOW, complicated: [base({ id: 'y', name: 'maybe' })] });
  assert.match(md, /^# 💔 Breakup List: 1 function/);
  assert.match(md, /- \[ \] `formatLegacyDate\(\)` in \[src\/utils\/date\.js:14\]\(https:\/\/github\.com\/o\/r\/blob\/HEAD\/src\/utils\/date\.js#L14-L31\)/);
  assert.match(md, /## It's complicated/);
  assert.match(md, /Nothing was deleted automatically/);
});

test('badge + stats sentence', () => {
  assert.match(badgeMarkdown(12), /lonely%20functions-12-/);
  assert.equal(statsSentence({ stats: { orphans: 47, lonelyLines: 1204 } }), 'Your codebase has 47 single functions. 1,204 lines of loneliness.');
  assert.match(statsSentence({ stats: { orphans: 0, lonelyLines: 0 } }), /happily married/);
});

test('parseRepo accepts the usual shapes', () => {
  assert.equal(parseRepo('lukeed/polka').full, 'lukeed/polka');
  assert.equal(parseRepo('https://github.com/psf/requests.git').full, 'psf/requests');
  assert.equal(parseRepo('github.com/spf13/cobra/tree/v1.8.0').ref, 'v1.8.0');
  assert.equal(parseRepo('git@github.com:a/b.git').full, 'a/b');
  assert.equal(parseRepo('not a repo'), null);
  assert.equal(parseRepo(''), null);
});
