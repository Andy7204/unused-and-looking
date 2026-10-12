// Unused & Looking web app. Uses the same core analyser as the CLI.
// Read-only: never edits code, only exports lists.

import { analyze } from '../core/analyze.js';
import { buildProfile, loneliest, lonelinessScore, fmtNum } from '../core/profile.js';
import { avatarSvg } from '../core/avatar.js';
import { breakupMarkdown, badgeMarkdown, badgeUrl, statsSentence, shareText, DEMO_URL } from '../core/report.js';
import { parseRepo, loadGithub, loadDemo, loadFolder, loadLocalReport, fetchFileAge, FriendlyError } from './sources.js';
import { Deck } from './deck.js';
import { drawShareCard, downloadCanvas, xIntent } from './share.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LANG = { js: 'JS/TS', py: 'Python', go: 'Go', rb: 'Ruby' };
const LANG_COLOR = { js: '#f7c948', py: '#3b82f6', go: '#14b8c6', rb: '#e0245e' };
const FEATURED = [
  { repo: 'lukeed/polka', lang: 'js' },
  { repo: 'psf/requests', lang: 'py' },
  { repo: 'spf13/cobra', lang: 'go' },
];
const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const state = {
  report: null,
  source: null, // { kind, id, label, spec? }
  decisions: {},
  history: [],
  showShy: false,
  abort: null,
  token: storage.get('ual:token') || '',
  agesInFlight: new Set(),
  ageBudget: 0,
  rateLimited: false,
  profiles: new Map(),
  view: 'home',
  shareTarget: null,
};

// ---------------------------------------------------------------- helpers

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

async function copyText(text, okMsg = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  toast(okMsg);
}

function hearts(n = 18, emoji = ['💖', '💘', '💕', '💗', '❤️']) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = $('#hearts');
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.textContent = emoji[i % emoji.length];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDelay = Math.random() * 0.8 + 's';
    s.style.fontSize = 18 + Math.random() * 26 + 'px';
    layer.appendChild(s);
    setTimeout(() => s.remove(), 3600);
  }
}

function svgFill(svg) {
  return svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ');
}

function profileOf(o) {
  if (!state.profiles.has(o.id)) state.profiles.set(o.id, buildProfile(o));
  return state.profiles.get(o.id);
}

function allOrphans() {
  if (!state.report) return [];
  return state.showShy ? [...state.report.orphans, ...state.report.shy] : state.report.orphans;
}

function deckList() {
  const list = allOrphans().filter((o) => !state.decisions[o.id]);
  // The easter eggs always get to go first.
  const rank = (o) => (o.id === state.pinnedId ? 9 : 0) + ({ love: 2, match: 1 }[profileOf(o).easterEgg] || 0);
  return list.sort((a, b) => rank(b) - rank(a));
}

function byDecision(kind) {
  return allOrphans().filter((o) => state.decisions[o.id] === kind);
}

function findOrphan(id) {
  return allOrphans().find((o) => o.id === id) || (state.report && [...state.report.orphans, ...state.report.shy].find((o) => o.id === id));
}

function ghLink(file, line, endLine) {
  const spec = state.source && state.source.spec;
  if (!spec) return null;
  const enc = file.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${spec.full}/blob/${spec.ref.split('/').map(encodeURIComponent).join('/')}/${enc}#L${line}${endLine && endLine !== line ? '-L' + endLine : ''}`;
}

function whereHtml(file, line, endLine) {
  const label = `${esc(file)}:${line}`;
  const href = ghLink(file, line, endLine);
  return href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${label}</a>` : label;
}

function shareBase() {
  return /\.github\.io$/.test(location.hostname) ? location.origin + location.pathname : DEMO_URL;
}

function shareLink(o) {
  const s = state.source;
  const fn = o ? `&fn=${encodeURIComponent(o.name)}` : '';
  if (s && s.kind === 'github') return `${shareBase()}?repo=${encodeURIComponent(s.spec.full).replace('%2F', '/')}${s.spec.ref !== 'HEAD' ? '&ref=' + encodeURIComponent(s.spec.ref) : ''}${fn}`;
  if (s && s.kind === 'demo') return `${shareBase()}?demo${fn}`;
  return shareBase();
}

// ---------------------------------------------------------------- views

const VIEWS = ['home', 'loading', 'error', 'deck', 'matches', 'breakup', 'complicated', 'stats'];

function show(view) {
  state.view = view;
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  const hasReport = !!state.report && !['home', 'loading', 'error'].includes(view);
  $('#tabs').hidden = !hasReport;
  $('#bottomTabs').hidden = !hasReport;
  $$('.tab').forEach((t) => { if (t.dataset.view === view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  if (view === 'deck') renderDeck();
  if (view === 'matches' || view === 'breakup' || view === 'complicated') renderList(view);
  if (view === 'stats') renderStats();
  if (view !== 'loading') window.scrollTo({ top: 0 });
}

function updateCounts() {
  for (const k of ['matches', 'breakup', 'complicated']) {
    const n = byDecision(k === 'matches' ? 'match' : k).length;
    $$(`[data-count="${k}"]`).forEach((el) => { el.textContent = n; });
  }
}

// ---------------------------------------------------------------- cards

function cardHtml(o) {
  const p = profileOf(o);
  const egg = p.easterEgg;
  const age = p.days != null ? fmtNum(p.days) : state.agesInFlight.has(o.id) ? '…' : '?';
  return `<article class="card${egg ? ' egg-' + egg : ''}" data-id="${esc(o.id)}" aria-label="${esc(o.name)}, ${p.days != null ? p.days + ' days since last touched' : 'age unknown'}, ${o.confidence}% likely unused">
    <div class="card-photo">${svgFill(avatarSvg(o.name, { heart: egg === 'love' }))}
      <span class="lang-tag">${LANG[o.lang] || o.lang}</span>
      <span class="conf"><b>${o.confidence}%</b> single</span>
      ${egg ? `<span class="egg-ribbon">${esc(p.eggTitle)}</span>` : ''}
      <div class="card-title">
        <h2>${esc(o.name)}(), <span class="age" data-age="${esc(o.id)}" title="Days since these lines were last touched">${age}</span></h2>
        <p class="loc">📍 ${esc(o.file)}:${o.line}</p>
      </div>
    </div>
    <div class="card-body">
      <p class="bio" data-bio="${esc(o.id)}">${esc(p.bio)}</p>
      ${p.interests.length ? `<ul class="chips" aria-label="Interests">${p.interests.map((i) => `<li>${i.emoji} ${esc(i.label)}</li>`).join('')}</ul>` : ''}
      ${p.redFlags.length ? `<p class="flags-title">Red flags</p><ul class="flags">${p.redFlags.slice(0, 2).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      <button class="more-link" data-action="profile" type="button">Read full profile →</button>
    </div>
    <div class="stamp stamp-like" aria-hidden="true">Match</div>
    <div class="stamp stamp-nope" aria-hidden="true">Break up</div>
    <div class="stamp stamp-super" aria-hidden="true">It's complicated</div>
  </article>`;
}

let deck;

function renderDeck() {
  const list = deckList();
  const el = $('#deck');
  const total = allOrphans().length;
  const empty = $('#deckEmpty');
  $('#deckMeta').textContent = total
    ? `${list.length} of ${total} single${total === 1 ? '' : 's'} left · ${state.source.label}`
    : state.source.label;
  $('#undoBtn').disabled = !state.history.length;
  if (!list.length) {
    el.hidden = true; $('#actions').hidden = !state.history.length;
    $$('#actions .act:not(#undoBtn)').forEach((b) => { b.disabled = true; });
    empty.hidden = false;
    const shy = state.report.shy.length;
    if (!total) {
      empty.innerHTML = `<div class="big" aria-hidden="true">💍</div><h2>Happily married codebase</h2>
        <p>${state.report.stats.definitions.toLocaleString()} functions checked, and every one of them is in a relationship. 0 lonely functions at ≥${state.report.minConfidence}% confidence.</p>
        <div class="row">${shy && !state.showShy ? `<button class="btn btn-primary" data-action="shy">Meet the ${shy} shy maybe${shy === 1 ? '' : 's'}</button>` : ''}<button class="btn btn-ghost" data-action="home">Try another repo</button></div>`;
    } else {
      empty.innerHTML = `<div class="big" aria-hidden="true">🎉</div><h2>You've met everyone!</h2>
        <p>${byDecision('match').length} matches, ${byDecision('breakup').length} breakups, ${byDecision('complicated').length} complicated.</p>
        <div class="row"><button class="btn btn-primary" data-goto="breakup">Export the Breakup List</button><button class="btn btn-ghost" data-goto="stats">See your stats</button>
        ${shy && !state.showShy ? `<button class="btn btn-ghost" data-action="shy">Meet ${shy} shy maybe${shy === 1 ? '' : 's'}</button>` : ''}</div>`;
    }
    return;
  }
  el.hidden = false; empty.hidden = true; $('#actions').hidden = false;
  $$('#actions .act').forEach((b) => { b.disabled = b.id === 'undoBtn' ? !state.history.length : false; });
  el.innerHTML = list.slice(0, 3).reverse().map(cardHtml).join('');
  deck.attach(el.lastElementChild);
  ensureAges(list.slice(0, 3));
}

function topOrphan() {
  const c = deck && deck.card;
  return c ? findOrphan(c.dataset.id) : null;
}

function decide(o, dir) {
  const kind = dir === 'right' ? 'match' : dir === 'left' ? 'breakup' : 'complicated';
  state.decisions[o.id] = kind;
  state.history.push(o.id);
  saveDecisions();
  updateCounts();
  return kind;
}

function onSwipe(dir) {
  const id = deck.card && deck.card.dataset.id;
  const o = findOrphan(id);
  if (!o) { renderDeck(); return; }
  const kind = decide(o, dir);
  const p = profileOf(o);
  renderDeck();
  if (kind === 'match') {
    if (p.easterEgg === 'love') hearts(40);
    openMatch(o);
  } else if (kind === 'breakup') {
    toast(p.easterEgg === 'love' ? "You broke up with love() itself. Cold. 🥶" : `💔 ${o.name}() added to the Breakup List`);
  } else {
    toast(`🤔 ${o.name}(): it's complicated. Saved for later.`);
  }
}

function undo() {
  const id = state.history.pop();
  if (!id) return;
  delete state.decisions[id];
  saveDecisions();
  updateCounts();
  if (state.view !== 'deck') show('deck'); else renderDeck();
  const o = findOrphan(id);
  toast(`↶ ${o ? o.name + '() is' : "They're"} back in the deck`);
}

function saveDecisions() {
  if (!state.source) return;
  storage.set(`ual:dec:${state.source.id}`, JSON.stringify({ d: state.decisions, h: state.history.slice(-200) }));
}

// ---------------------------------------------------------------- matches html

const MATCH_LABEL = { twin: 'Near-twin', inline: 'Does it inline', cousin: 'Similar name', keyword: 'Same vibe' };

function matchesHtml(o, limit = 5) {
  const ms = (o.matches || []).slice(0, limit);
  if (!ms.length) return '';
  return `<ul class="match-list">${ms.map((m) => `<li class="match-row">
      <div class="match-top"><div class="compat" style="--p:${m.score}"><span>${m.score}%</span></div>
        <div><div class="match-type">${MATCH_LABEL[m.type] || 'Match'}${m.target ? ` · ${esc(m.target)}()` : ''}</div><div class="match-where">${whereHtml(m.file, m.line, m.endLine)}</div></div></div>
      <p class="match-reason">${esc(m.reason)}</p>
      ${m.snippet ? `<pre class="snip"><code>${esc(m.snippet)}</code></pre>` : ''}
    </li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------- modals

let lastFocus = null;

function openModal(id) {
  lastFocus = document.activeElement;
  const m = $('#' + id);
  m.hidden = false;
  const sheet = $('.modal-sheet', m);
  sheet.scrollTop = 0;
  sheet.focus();
}

function closeModal(m) {
  m = m || $$('.modal').find((x) => !x.hidden);
  if (!m) return;
  m.hidden = true;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

function anyModalOpen() {
  return $$('.modal').some((m) => !m.hidden);
}

function openProfile(o) {
  const p = profileOf(o);
  const decided = state.decisions[o.id];
  const gh = ghLink(o.file, o.line, o.endLine);
  const ageTxt = p.days != null ? `${fmtNum(p.days)} days` : 'unknown';
  $('#profileBody').innerHTML = `
    <div class="profile-head">
      <div class="ava">${avatarSvg(o.name, { heart: p.easterEgg === 'love' })}</div>
      <div><h2 id="profileTitle">${esc(o.name)}()${p.easterEgg ? ` <span title="${esc(p.eggTitle)}">✨</span>` : ''}</h2>
      <p>${whereHtml(o.file, o.line, o.endLine)}${o.className ? ` · ${esc(o.className)}` : ''}</p></div>
    </div>
    <div class="facts">
      <div class="fact"><b>${ageTxt}</b><span>single${p.since ? ' since ' + esc(p.since) : ''}</span></div>
      <div class="fact"><b>${o.confidence}%</b><span>${esc(o.status)}</span></div>
      <div class="fact"><b>${o.params.length}</b><span>param${o.params.length === 1 ? '' : 's'}</span></div>
      <div class="fact"><b>${o.length}</b><span>line${o.length === 1 ? '' : 's'}</span></div>
      <div class="fact"><b>${LANG[o.lang]}</b><span>${o.kind}</span></div>
    </div>
    <p class="bio">${esc(p.bio)}</p>
    ${p.interests.length ? `<ul class="chips">${p.interests.map((i) => `<li>${i.emoji} ${esc(i.label)}</li>`).join('')}</ul>` : ''}
    ${o.doc ? `<p class="section-title">In its own words</p><p>“${esc(o.doc)}”</p>` : ''}
    ${o.params.length ? `<p class="section-title">Baggage (params)</p><p><code>(${esc(o.paramsText)})</code></p>` : ''}
    ${o.calls.length ? `<p class="section-title">Calls</p><p>${o.calls.map((c) => `<code>${esc(c)}()</code>`).join(' ')}</p>` : ''}
    ${p.redFlags.length ? `<p class="section-title">Red flags</p><ul class="flags">${p.redFlags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${p.greenFlags.length ? `<p class="section-title">Green flags</p><p>${p.greenFlags.map((g) => '💚 ' + esc(g)).join(' · ')}</p>` : ''}
    <p class="section-title">Why we think it's single</p>
    <ul class="reasons">${o.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}
      ${o.risks.map((r) => `<li class="risk"><b>${r.delta}</b> ${esc(r.text)}</li>`).join('')}</ul>
    <p class="section-title">Profile picture (the code)</p>
    <pre class="snip"><code>${esc(o.snippet)}${o.snippetTruncated ? '\n…' : ''}</code></pre>
    ${(o.matches || []).length ? `<p class="section-title">Potential matches</p>${matchesHtml(o)}` : ''}
    <div class="profile-actions">
      ${!decided && deck && deck.card && deck.card.dataset.id === o.id && state.view === 'deck' ? `
        <button class="btn btn-ghost" data-pdecide="left">💔 Break up</button>
        <button class="btn btn-ghost" data-pdecide="up">🤔 It's complicated</button>
        <button class="btn btn-primary" data-pdecide="right">💘 Match</button>` : ''}
      <button class="btn btn-ghost" data-action="share-profile" data-id="${esc(o.id)}">Share this profile</button>
      ${gh ? `<a class="btn btn-ghost" href="${esc(gh)}" target="_blank" rel="noopener">View on GitHub</a>` : ''}
    </div>`;
  openModal('profileModal');
}

function openMatch(o) {
  const ms = o.matches || [];
  const p = profileOf(o);
  const other = ms[0] ? (ms[0].target || ms[0].file.split('/').pop()) : '?';
  $('#matchBody').innerHTML = ms.length ? `
    <div class="match-avas" aria-hidden="true"><div class="ava">${avatarSvg(o.name)}</div><div class="heart">💘</div><div class="ava">${avatarSvg(other)}</div></div>
    <h2 class="match-hero" id="matchTitle">It's a match!</h2>
    <p>${esc(o.name)}() found ${ms.length} place${ms.length === 1 ? '' : 's'} where it could belong.</p>
    ${matchesHtml(o)}
    <div class="profile-actions" style="justify-content:center"><button class="btn btn-primary" data-close>Keep swiping</button></div>`
    : `
    <div class="match-avas" aria-hidden="true"><div class="ava">${avatarSvg(o.name)}</div><div class="heart">💭</div></div>
    <h2 id="matchTitle">No matches… yet</h2>
    <p>We couldn't find anywhere that duplicates ${esc(o.name)}() or could obviously use it. ${p.easterEgg === 'love' ? 'Love is like that sometimes.' : 'Maybe it is meant to be single. Consider the Breakup List.'}</p>
    <div class="profile-actions" style="justify-content:center">
      <button class="btn btn-ghost" data-action="rebreak" data-id="${esc(o.id)}">💔 Move to Breakup List</button>
      <button class="btn btn-primary" data-close>Keep swiping</button></div>`;
  openModal('matchModal');
}

async function openShare(o) {
  state.shareTarget = o;
  openModal('shareModal');
  await drawShareCard($('#shareCanvas'), { orphan: o, profile: profileOf(o), sourceLabel: state.source.label, total: state.report.orphans.length });
  $('#shareModal [data-share="x"]').href = xIntent(profileShareText(o), shareLink(o));
}

function profileShareText(o) {
  const p = profileOf(o);
  return `Meet ${o.name}(), ${p.days != null ? fmtNum(p.days) + ' days single' : 'single since forever'}. ${p.bio.split('. ')[0]}. Found by Unused & Looking 💔`;
}

// ---------------------------------------------------------------- lists

function renderList(view) {
  const kind = view === 'matches' ? 'match' : view;
  const items = byDecision(kind);
  const el = $(`#${view === 'matches' ? 'matchesList' : view + 'List'}`);
  if (view === 'breakup') { $('#copyMd').disabled = !items.length; $('#downloadMd').disabled = !items.length; }
  if (!items.length) {
    const empty = {
      match: ['💘', 'No matches yet. Swipe right on a function to see where it could belong.'],
      breakup: ['💔', 'No breakups yet. Swipe left on functions you want to delete.'],
      complicated: ['🤔', 'Nothing complicated yet. Swipe up to save one for later.'],
    }[kind];
    el.innerHTML = `<div class="empty-list"><div class="big" aria-hidden="true">${empty[0]}</div><p>${empty[1]}</p><button class="btn btn-ghost" data-goto="deck">Back to swiping</button></div>`;
    return;
  }
  el.innerHTML = items.map((o) => {
    const p = profileOf(o);
    const btns = {
      match: `<button data-move="breakup">💔 Break up</button>`,
      breakup: `<button data-move="complicated">🤔 Complicated</button>`,
      complicated: `<button data-move="breakup">💔 Break up</button><button data-move="match">💘 Match</button>`,
    }[kind];
    return `<article class="item" data-id="${esc(o.id)}">
      <div class="item-ava">${avatarSvg(o.name)}</div>
      <div>
        <h3>${esc(o.name)}()</h3>
        <p class="sub">${whereHtml(o.file, o.line, o.endLine)} · ${o.length} line${o.length === 1 ? '' : 's'} · ${o.confidence}%${p.days != null ? ` · ${fmtNum(p.days)} days single` : ''}</p>
        <p class="why">${esc(o.reasons[0])}${o.risks.length ? ` <span class="risk">(${esc(o.risks[0].text.toLowerCase())})</span>` : ''}</p>
        ${kind === 'match' ? (o.matches.length ? matchesHtml(o, 3) : '<p class="why risk">No matches found. Maybe it really is meant to be single.</p>') : ''}
      </div>
      <div class="item-btns"><button data-action="profile-id">Profile</button>${btns}<button data-move="deck">↶ Back to deck</button></div>
    </article>`;
  }).join('');
}

function breakupMd() {
  return breakupMarkdown(byDecision('breakup'), {
    repo: state.source.spec ? state.source.spec.full : null,
    ref: state.source.spec ? state.source.spec.ref : 'HEAD',
    complicated: byDecision('complicated'),
    sourceLabel: state.source.label,
  });
}

// ---------------------------------------------------------------- stats

async function renderStats() {
  const r = state.report;
  const orphans = r.orphans;
  const s = r.stats;
  $('#statsHeadline').textContent = statsSentence(r);
  $('#statsSub').textContent = `Scanned ${fmtNum(s.filesScanned)} files and ${fmtNum(s.definitions)} functions in ${state.source.label}.`;
  ensureAges([...orphans].sort((a, b) => b.confidence - a.confidence).slice(0, 8));
  const ages = orphans.map((o) => profileOf(o).days).filter((d) => d != null);
  const oldest = ages.length ? Math.max(...ages) : null;
  const avg = orphans.length ? Math.round(orphans.reduce((a, o) => a + o.confidence, 0) / orphans.length) : 0;
  const matched = orphans.filter((o) => o.matches && o.matches.length).length;
  const tiles = [
    [fmtNum(orphans.length), 'single functions'],
    [fmtNum(s.lonelyLines), 'lines of loneliness'],
    [oldest != null ? fmtNum(oldest) + 'd' : '?', 'longest single streak'],
    [avg ? avg + '%' : 'n/a', 'average confidence'],
    [fmtNum(matched), 'have potential matches'],
    [fmtNum(r.shy.length), 'shy maybes (hidden)'],
  ];
  $('#tiles').innerHTML = tiles.map(([b, t]) => `<div class="tile"><b>${b}</b><span>${t}</span></div>`).join('');
  const langs = Object.entries(s.byLanguage);
  const maxO = Math.max(1, ...langs.map(([, v]) => v.orphans));
  $('#langBars').innerHTML = langs.length ? langs.map(([k, v]) => `<div class="lang-row"><span>${LANG[k] || k}</span><div class="lang-bar"><i style="width:${Math.max(2, (v.orphans / maxO) * 100)}%;background:${LANG_COLOR[k]}"></i></div><span>${v.orphans}/${v.definitions}</span></div>`).join('') : '<p>No source files.</p>';
  const rank = (o) => (o.confidence >= 80 ? 1e6 : 0) + (profileOf(o).days ?? 0) * 10 + lonelinessScore(o);
  const top = [...orphans].sort((a, b) => rank(b) - rank(a)).slice(0, 5);
  $('#lonelyList').innerHTML = top.length ? top.map((o) => `<li><button data-open="${esc(o.id)}"><div class="mini-ava">${avatarSvg(o.name)}</div><span class="nm">${esc(o.name)}()</span><span class="dd">${profileOf(o).days != null ? fmtNum(profileOf(o).days) + ' days' : o.confidence + '%'}</span></button></li>`).join('') : '<li>Nobody. Everyone is taken. 💍</li>';
  $('#badgeImg').src = badgeUrl(orphans.length);
  $('#badgeCode').textContent = badgeMarkdown(orphans.length);
  $('#shyNote').innerHTML = r.shy.length && !state.showShy ? `${r.shy.length} more function${r.shy.length === 1 ? ' is' : 's are'} "maybe seeing someone" (below ${r.minConfidence}% confidence). <button data-action="shy">Show the shy ones</button>` : '';
  const lone = loneliest(orphans);
  const panel = $('.share-panel');
  panel.hidden = !lone;
  if (lone) {
    state.statsShare = lone;
    await drawShareCard($('#statsCanvas'), { orphan: lone, profile: profileOf(lone), sourceLabel: state.source.label, total: orphans.length });
    $('.share-panel [data-share="x"]').href = xIntent(shareText(r), shareLink(lone));
  }
}

// ---------------------------------------------------------------- ages (GitHub)

async function ensureAges(list) {
  const s = state.source;
  if (!s || s.kind !== 'github' || state.rateLimited) return;
  const max = state.token ? 80 : 16;
  for (const o of list) {
    if (o.lastModified || state.agesInFlight.has(o.id) || o._ageTried) continue;
    if (state.ageBudget >= max) return;
    state.ageBudget++;
    o._ageTried = true;
    state.agesInFlight.add(o.id);
    setAgeText(o);
    try {
      const ts = await fetchFileAge(s.spec, o.file, state.token);
      if (ts) {
        for (const x of [...state.report.orphans, ...state.report.shy]) if (x.file === o.file && !x.lastModified) { x.lastModified = ts; x.ageSource = 'github'; state.profiles.delete(x.id); setAgeText(x); }
      }
    } catch (e) {
      if (e.extra && e.extra.rateLimited) { state.rateLimited = true; toast('GitHub rate limit reached: ages will show as "?". Add a token to see them.', 4200); }
    } finally {
      state.agesInFlight.delete(o.id);
      setAgeText(o);
    }
  }
  if (state.view === 'stats') { /* refresh share card with ages */ clearTimeout(ensureAges._t); ensureAges._t = setTimeout(() => state.view === 'stats' && renderStats(), 400); }
}

function setAgeText(o) {
  const p = profileOf(o);
  const sel = CSS.escape(o.id);
  $$(`[data-age="${sel}"]`).forEach((el) => { el.textContent = p.days != null ? fmtNum(p.days) : state.agesInFlight.has(o.id) ? '…' : '?'; });
  $$(`[data-bio="${sel}"]`).forEach((el) => { el.textContent = p.bio; });
}

// ---------------------------------------------------------------- loading

function setProgress(done, total, label) {
  $('#loadBar').style.width = Math.max(3, Math.round((done / Math.max(1, total)) * 100)) + '%';
  $('#loadDetail').textContent = total > 1 ? `${done.toLocaleString()} / ${total.toLocaleString()} · ${label}` : label;
}

function showError(err) {
  if (err && err.name === 'AbortError') { show('home'); return; }
  const fe = err instanceof FriendlyError ? err : new FriendlyError('Something broke', `${(err && err.message) || err}. Please try again, and if it keeps happening, open an issue on GitHub.`);
  $('#errTitle').textContent = fe.title;
  $('#errText').textContent = fe.message;
  $('#errEmoji').textContent = fe.extra.tooBig ? '🐘' : fe.extra.rateLimited ? '⏳' : '💔';
  const cli = $('#errCli');
  cli.hidden = !fe.extra.tooBig;
  if (fe.extra.tooBig) {
    $('#errCloneUrl').textContent = `https://github.com/${fe.extra.spec.full}`;
    $('#errCloneDir').textContent = fe.extra.spec.repo;
  }
  show('error');
  console.info('[unused-and-looking]', fe.title, fe.message);
}

async function run(kind, arg) {
  if (state.abort) state.abort.abort();
  const ac = new AbortController();
  state.abort = ac;
  $('#loadTitle').textContent = 'Looking for singles…';
  setProgress(0, 1, 'Warming up');
  show('loading');
  try {
    let files, label, spec, report;
    if (kind === 'demo') {
      files = await loadDemo();
      label = 'lovelorn-shop (demo)';
    } else if (kind === 'github') {
      spec = arg;
      label = spec.full;
      $('#loadTitle').textContent = `Reading ${spec.full}…`;
      const cacheKey = `ual:report:${spec.full}@${spec.ref}`;
      try { const c = sessionStorage.getItem(cacheKey); if (c) report = JSON.parse(c); } catch {}
      if (!report) {
        files = await loadGithub(spec, { token: state.token, signal: ac.signal, onProgress: setProgress });
      }
      if (!report) {
        await new Promise((r) => setTimeout(r, 0));
        if (ac.signal.aborted) throw new DOMException('aborted', 'AbortError');
        setProgress(1, 1, 'Interviewing every function…');
        await new Promise((r) => setTimeout(r, 30));
        report = analyze(files, { source: label });
        try { sessionStorage.setItem(cacheKey, JSON.stringify(report)); } catch {}
      }
    } else if (kind === 'folder') {
      const res = await loadFolder(arg, { onProgress: setProgress });
      files = res.files;
      label = res.label;
    } else if (kind === 'local') {
      report = await loadLocalReport();
      label = report.source || 'your project';
    }
    if (ac.signal.aborted) return;
    if (!report) {
      setProgress(1, 1, 'Interviewing every function…');
      await new Promise((r) => setTimeout(r, 30));
      report = analyze(files, { source: label });
    }
    const id = kind === 'github' ? `gh:${spec.full}@${spec.ref}` : `${kind}:${label}`;
    setReport(report, { kind, id, label, spec });
  } catch (e) {
    if (ac.signal.aborted && !(e instanceof FriendlyError)) { show('home'); return; }
    showError(e);
  } finally {
    if (state.abort === ac) state.abort = null;
  }
}

function setReport(report, source) {
  state.report = report;
  state.source = source;
  state.profiles.clear();
  state.ageBudget = 0;
  state.rateLimited = false;
  state.showShy = false;
  state.pinnedId = null;
  try {
    const saved = JSON.parse(storage.get(`ual:dec:${source.id}`) || 'null');
    state.decisions = saved && saved.d ? saved.d : {};
    state.history = saved && saved.h ? saved.h : [];
  } catch { state.decisions = {}; state.history = []; }
  // Drop decisions for functions that no longer exist.
  const ids = new Set([...report.orphans, ...report.shy].map((o) => o.id));
  for (const k of Object.keys(state.decisions)) if (!ids.has(k)) delete state.decisions[k];
  state.history = state.history.filter((h) => state.decisions[h]);
  const pill = $('#sourcePill');
  pill.hidden = false;
  pill.textContent = source.label;
  pill.title = source.label;
  const params = new URLSearchParams(location.search);
  const keep = new URLSearchParams();
  if (source.kind === 'github') { keep.set('repo', source.spec.full); if (source.spec.ref !== 'HEAD') keep.set('ref', source.spec.ref); }
  if (source.kind === 'demo') keep.set('demo', '');
  if (source.kind === 'local') keep.set('local', '1');
  for (const k of ['theme']) if (params.has(k)) keep.set(k, params.get(k));
  const qs = keep.toString().replace(/%2F/gi, '/').replace(/=(?=&|$)/g, '');
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  updateCounts();
  // ?fn=name puts that profile on top
  const fn = params.get('fn');
  if (fn) {
    const o = [...report.orphans, ...report.shy].find((x) => x.name === fn);
    if (o) {
      if (!report.orphans.includes(o)) state.showShy = true;
      delete state.decisions[o.id];
      state.pinnedId = o.id;
      const list = state.showShy ? report.shy : report.orphans;
      list.splice(list.indexOf(o), 1);
      list.unshift(o);
    }
  }
  if (params.has('card')) { renderCardOnly(); return; }
  const view = params.get('view');
  show(VIEWS.includes(view) && !['home', 'loading', 'error'].includes(view) ? view : 'deck');
  if (fn && params.get('open') !== '0') { const o = findOrphan([...report.orphans, ...report.shy].find((x) => x.name === fn)?.id); if (o && state.view === 'deck') openProfile(o); }
  const love = report.orphans.find((o) => profileOf(o).easterEgg === 'love');
  if (love && !state.decisions[love.id] && state.view === 'deck') setTimeout(() => hearts(14), 400);
}

// ?card: just the 1200x630 share card at full size (used for README shots).
async function renderCardOnly() {
  const o = loneliest(state.report.orphans);
  document.body.innerHTML = '<canvas id="solo" width="1200" height="630" style="display:block"></canvas>';
  document.body.style.cssText = 'margin:0;background:#000;min-height:0';
  if (o) await drawShareCard($('#solo'), { orphan: o, profile: profileOf(o), sourceLabel: state.source.label, total: state.report.orphans.length });
  document.body.dataset.ready = '1';
}

// ---------------------------------------------------------------- wiring

function wire() {
  deck = new Deck($('#deck'), { onSwipe, onTap: () => { const o = topOrphan(); if (o) openProfile(o); } });

  $('#repoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const spec = parseRepo($('#repoInput').value);
    if (!spec) { toast('Paste a public GitHub repo, like github.com/owner/repo'); $('#repoInput').focus(); return; }
    run('github', spec);
  });
  $('#demoBtn').addEventListener('click', () => run('demo'));
  $('#errDemo').addEventListener('click', () => run('demo'));
  $('#errBack').addEventListener('click', () => { history.replaceState(null, '', location.pathname); show('home'); $('#repoInput').focus(); });
  $('#errCopy').addEventListener('click', () => copyText($('#errCli code').textContent.replace(/\s+/g, ' ').trim(), 'Command copied'));
  $('#cancelLoad').addEventListener('click', () => { if (state.abort) state.abort.abort(); show('home'); });
  $('#folderInput').addEventListener('change', (e) => { if (e.target.files && e.target.files.length) run('folder', e.target.files); e.target.value = ''; });

  const tokenInput = $('#tokenInput');
  tokenInput.value = state.token;
  $('#tokenRemember').checked = !!storage.get('ual:token');
  tokenInput.addEventListener('input', () => { state.token = tokenInput.value.trim(); if ($('#tokenRemember').checked) storage.set('ual:token', state.token); });
  $('#tokenRemember').addEventListener('change', (e) => { if (e.target.checked && state.token) storage.set('ual:token', state.token); else storage.del('ual:token'); });

  $('#featured').innerHTML = FEATURED.map((f) => `<button class="chip-btn" data-repo="${f.repo}" type="button"><span class="lang-dot" style="background:${LANG_COLOR[f.lang]}"></span>${f.repo}</button>`).join('');

  // tabs (desktop + mobile)
  $('#bottomTabs').innerHTML = $('#tabs').innerHTML;
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view].tab'); if (t) { show(t.dataset.view); return; }
    const g = e.target.closest('[data-goto]'); if (g) { show(g.dataset.goto); return; }
    const rp = e.target.closest('[data-repo]'); if (rp) { const spec = parseRepo(rp.dataset.repo); $('#repoInput').value = spec.full; run('github', spec); return; }
    const cp = e.target.closest('[data-copy]'); if (cp) { copyText(cp.dataset.copy); return; }
    if (e.target.closest('[data-close]')) { closeModal(e.target.closest('.modal')); return; }
    const a = e.target.closest('[data-action]');
    if (a) {
      const act = a.dataset.action;
      if (act === 'profile') { const o = findOrphan(a.closest('.card').dataset.id); if (o) openProfile(o); }
      else if (act === 'profile-id') { const o = findOrphan(a.closest('[data-id]').dataset.id); if (o) openProfile(o); }
      else if (act === 'shy') { state.showShy = true; state.profiles.clear(); updateCounts(); show('deck'); toast('Meet the shy ones. Lower confidence, so double-check before deleting.'); }
      else if (act === 'home') { history.replaceState(null, '', location.pathname); show('home'); }
      else if (act === 'share-profile') { const o = findOrphan(a.dataset.id); closeModal(); if (o) openShare(o); }
      else if (act === 'rebreak') { const o = findOrphan(a.dataset.id); if (o) { state.decisions[o.id] = 'breakup'; saveDecisions(); updateCounts(); closeModal(); toast(`💔 ${o.name}() moved to the Breakup List`); } }
      return;
    }
    const pd = e.target.closest('[data-pdecide]');
    if (pd) { closeModal(); deck.fly(pd.dataset.pdecide); return; }
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const id = mv.closest('[data-id]').dataset.id;
      const o = findOrphan(id);
      if (mv.dataset.move === 'deck') { delete state.decisions[id]; state.history = state.history.filter((h) => h !== id); toast(`↶ ${o.name}() is back in the deck`); }
      else { state.decisions[id] = mv.dataset.move; toast(mv.dataset.move === 'breakup' ? `💔 Broke up with ${o.name}()` : mv.dataset.move === 'match' ? `💘 Matched with ${o.name}()` : `🤔 ${o.name}(): it's complicated`); }
      saveDecisions(); updateCounts(); renderList(state.view);
      return;
    }
    const op = e.target.closest('[data-open]'); if (op) { const o = findOrphan(op.dataset.open); if (o) openProfile(o); return; }
    const sh = e.target.closest('[data-share]');
    if (sh) {
      const inModal = !!sh.closest('#shareModal');
      const o = inModal ? state.shareTarget : state.statsShare;
      if (!o) return;
      if (sh.dataset.share === 'download') {
        e.preventDefault();
        downloadCanvas(inModal ? $('#shareCanvas') : $('#statsCanvas'), `${o.name.replace(/[^\w-]/g, '')}-is-single.png`).then((ok) => toast(ok ? 'Image downloaded 💌' : "Couldn't create the image. Try another browser."));
      } else if (sh.dataset.share === 'link') {
        e.preventDefault();
        const local = !['github', 'demo'].includes(state.source.kind);
        copyText(shareLink(o), local ? 'Local folders stay private, so we copied the project link instead.' : 'Link copied! It opens this exact profile.');
      }
    }
  });

  $('#nopeBtn').addEventListener('click', () => deck.fly('left'));
  $('#likeBtn').addEventListener('click', () => deck.fly('right'));
  $('#superBtn').addEventListener('click', () => deck.fly('up'));
  $('#undoBtn').addEventListener('click', undo);
  $('#infoBtn').addEventListener('click', () => { const o = topOrphan(); if (o) openProfile(o); });
  $('#copyMd').addEventListener('click', () => copyText(breakupMd(), 'Breakup List copied as Markdown. Paste it into a PR.'));
  $('#downloadMd').addEventListener('click', () => {
    const blob = new Blob([breakupMd()], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'breakup.md';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('breakup.md downloaded');
  });
  $('#badgeCopy').addEventListener('click', () => copyText($('#badgeCode').textContent, 'Badge Markdown copied. Paste it in your README.'));
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    storage.set('ual:theme', next);
    if (state.view === 'stats') renderStats();
  });

  // keyboard
  let typed = '';
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && anyModalOpen()) { closeModal(); return; }
    if (e.target.closest('input, textarea, select')) return;
    if (e.key.length === 1) {
      typed = (typed + e.key.toLowerCase()).slice(-4);
      if (typed === 'love') hearts(30); // shh
    }
    if (anyModalOpen()) {
      if (e.key === 'Tab') trapFocus(e);
      return;
    }
    if (state.view !== 'deck' || !deck.card || e.metaKey || e.ctrlKey || e.altKey) {
      if ((e.key === 'z' || e.key === 'Z') && state.view === 'deck' && !e.metaKey && !e.ctrlKey) undo();
      return;
    }
    if (e.target.closest('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); deck.fly('left'); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); deck.fly('right'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); deck.fly('up'); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const o = topOrphan(); if (o) openProfile(o); }
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); undo(); }
  });
}

function trapFocus(e) {
  const m = $$('.modal').find((x) => !x.hidden);
  const f = $$('button, a[href], input, [tabindex]:not([tabindex="-1"])', m).filter((x) => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function heroCard() {
  const sample = {
    id: 'hero', name: 'formatLegacyDate', file: 'src/utils/date.js', line: 14, endLine: 31, length: 18, lang: 'js', kind: 'function',
    params: ['date', 'separator', 'padMonths', 'includeTime', 'locale'], paramsText: '', confidence: 92, status: 'Very single',
    doc: '', calls: ['padStart', 'getMonth'], snippet: 'var d = new Date(date); d.getMonth(); padStart', reasons: [], risks: [], matches: [],
    lastModified: Date.now() - 1402 * 86400000, isPrivate: false,
  };
  state.profiles.set('hero', buildProfile(sample));
  $('#heroCard').innerHTML = cardHtml(sample).replace('<article class="card', '<article style="position:static;height:100%;border:0;box-shadow:none" class="card');
}

function boot() {
  wire();
  heroCard();
  const q = new URLSearchParams(location.search);
  if (q.has('local')) run('local');
  else if (q.has('repo')) {
    const spec = parseRepo(q.get('repo') + (q.get('ref') ? '/tree/' + q.get('ref') : ''));
    if (spec) { $('#repoInput').value = spec.full; run('github', spec); }
    else showError(new FriendlyError("That doesn't look like a repo", `"${q.get('repo')}" isn't a GitHub repo name. Use owner/repo, like ?repo=lukeed/polka.`));
  } else if (q.has('demo')) run('demo');
  else show('home');
}

boot();
