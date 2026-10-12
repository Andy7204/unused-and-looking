// Matchmaking: find places that could use a lonely function.
//  1. Duplicated logic: normalised token shingles, compared against every other
//     function and against sliding windows of loose code.
//  2. Call sites of similarly named functions.
//  3. Lines that use the same APIs near the same keywords (inline code doing
//     the same job).

const KEYWORDS = new Set(`
break case catch class const continue debugger default delete do else export extends finally for function if import in
instanceof let new return super switch this throw try typeof var void while with yield async await of static get set
def elif except lambda pass raise from as global nonlocal not and or is None True False self cls
func go defer chan map range struct interface select package type fallthrough nil true false
begin end ensure rescue unless until when then module self yield nil next redo retry
`.trim().split(/\s+/));

const SHINGLE = 3;

/** Normalised token stream: locals become `v`, numbers `0`, member names kept. */
export function normTokens(code) {
  const out = [];
  const re = /([A-Za-z_$][\w$]*[?!]?)|(\d[\w.]*)|("|'|`)|(=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\+\+|--|\*\*|<<|>>|:=|->|[-+*/%=<>!&|^~?:;,.()[\]{}])/g;
  let m;
  let prev = '';
  while ((m = re.exec(code))) {
    let t;
    if (m[1]) {
      if (m[1] === 'var' || m[1] === 'const' || m[1] === 'let') t = 'let';
      else if (KEYWORDS.has(m[1])) t = m[1];
      else if (prev === '.') t = '.' + m[1].toLowerCase();
      else t = 'v';
    } else if (m[2]) t = '0';
    else if (m[3]) { if (prev === '"') { prev = ''; continue; } t = '"'; }
    else t = m[4];
    if (t === '.') { prev = '.'; continue; }
    out.push(t);
    prev = t;
  }
  return out;
}

export function shingles(tokens, k = SHINGLE) {
  const s = new Set();
  for (let i = 0; i + k <= tokens.length; i++) s.add(tokens.slice(i, i + k).join(' '));
  return s;
}

/** Jaccard similarity of two code snippets (exported for tests and reuse). */
export function similarity(a, b) {
  const A = shingles(normTokens(a));
  const B = shingles(normTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

const STOP = new Set(['get', 'set', 'do', 'handle', 'make', 'to', 'is', 'the', 'a', 'an', 'of', 'fn', 'func', 'helper', 'util', 'utils', 'new', 'old', 'legacy', 'my', 'tmp', 'temp', 'and', 'or', 'for', 'with', 'by', 'from', 'on', 'in', 'v1', 'v2', 'impl', 'internal', 'private', 'has', 'can', 'should']);

export function nameTokens(name) {
  return name
    .replace(/[?!=]$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_$-]+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

export function nameSimilarity(a, b) {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.length || !B.length) return { score: 0, shared: [] };
  const w = (t) => (STOP.has(t) ? 0.3 : 1);
  const all = new Set([...A, ...B]);
  let inter = 0, union = 0;
  const shared = [];
  for (const t of all) {
    const x = w(t);
    union += x;
    if (A.includes(t) && B.includes(t)) { inter += x; if (!STOP.has(t)) shared.push(t); }
  }
  return { score: union ? inter / union : 0, shared };
}

function snippetOf(lines, from, to, max = 8) {
  return lines.slice(from - 1, Math.min(to, from - 1 + max)).join('\n');
}

/**
 * @param {Array} orphans  definitions judged orphan (mutated: .matches added)
 * @param {Array} files    analysed files { path, code, content, lines, defs }
 * @param {Object} refIndex name -> [{ fi, line }] references (code only)
 * @param {Array} allDefs  every definition
 */
export function matchmake(orphans, files, refIndex, allDefs, opts = {}) {
  const maxOrphans = opts.maxOrphans ?? 400;
  const subjects = orphans.slice(0, maxOrphans);
  for (const o of orphans) o.matches = [];
  if (!subjects.length) return;
  const fileIdx = new Map(files.map((f, i) => [f.path, i]));

  // ---- 1. shingle index ---------------------------------------------------
  const oSets = subjects.map((o) => {
    const f = files[fileIdx.get(o.file)];
    return shingles(normTokens(f.code.slice(o.bodyStart, o.bodyEnd)));
  });
  const wanted = new Map(); // shingle -> [orphan index]
  oSets.forEach((s, oi) => { if (s.size >= 6) for (const x of s) { if (!wanted.has(x)) wanted.set(x, []); wanted.get(x).push(oi); } });

  const units = [];
  for (const d of allDefs) units.push({ file: d.file, from: d.line, to: d.endLine, def: d, start: d.bodyStart, end: d.bodyEnd });
  for (const f of files) {
    const n = f.lines.length;
    for (let s = 1; s <= n; s += 10) {
      const e = Math.min(n, s + 19);
      units.push({ file: f.path, from: s, to: e, start: f.lineStarts[s - 1], end: e < n ? f.lineStarts[e] : f.code.length });
      if (e === n) break;
    }
  }
  const df = new Map();
  const unitHits = units.map((u) => {
    const f = files[fileIdx.get(u.file)];
    const set = shingles(normTokens(f.code.slice(u.start, u.end)));
    const hits = [];
    for (const x of set) if (wanted.has(x)) { hits.push(x); df.set(x, (df.get(x) || 0) + 1); }
    return { size: set.size, hits };
  });
  const maxDf = Math.max(6, units.length * 0.04);
  const scores = subjects.map(() => new Map());
  unitHits.forEach((uh, ui) => {
    for (const x of uh.hits) {
      if (df.get(x) > maxDf) continue;
      for (const oi of wanted.get(x)) scores[oi].set(ui, (scores[oi].get(ui) || 0) + 1);
    }
  });

  subjects.forEach((o, oi) => {
    const S = oSets[oi];
    let effective = 0;
    for (const x of S) if (!(df.get(x) > maxDf)) effective++;
    const found = [];
    if (effective >= 6) {
      for (const [ui, hits] of scores[oi]) {
        const u = units[ui];
        if (u.file === o.file && u.from <= o.endLine && u.to >= o.line) continue; // itself
        if (u.def && u.def === o) continue;
        const containment = hits / effective;
        const jaccard = hits / (effective + unitHits[ui].size - hits);
        const score = 0.75 * containment + 0.25 * Math.min(1, jaccard * 1.5);
        if (score >= 0.45) found.push({ u, score, containment, jaccard });
      }
    }
    found.sort((a, b) => b.score - a.score);
    const used = [];
    for (const c of found) {
      if (used.some((x) => x.u.file === c.u.file && x.u.from <= c.u.to && x.u.to >= c.u.from)) continue;
      used.push(c);
      if (used.length >= 3) break;
    }
    for (const c of used) {
      const f = files[fileIdx.get(c.u.file)];
      const pct = Math.min(99, Math.round(c.score * 100));
      const twin = c.u.def && c.jaccard >= 0.5;
      const where = c.u.def ? `${c.u.def.name}()` : `${c.u.file}:${c.u.from}`;
      o.matches.push({
        type: twin ? 'twin' : 'inline',
        file: c.u.file, line: c.u.from, endLine: c.u.to,
        target: c.u.def ? c.u.def.name : null,
        score: pct,
        reason: twin
          ? `Near-twin: ${Math.round(c.containment * 100)}% of its logic matches ${where}. One of you is a copy, so keep one and call it from both places.`
          : `Does the same thing inline: ${Math.round(c.containment * 100)}% of ${o.name}()'s logic shows up in ${where}. That code could just call ${o.name}().`,
        snippet: snippetOf(f.lines, c.u.from, c.u.to),
      });
    }
  });

  // ---- 2. similarly named functions' call sites ---------------------------
  const byName = new Map();
  for (const d of allDefs) if (!byName.has(d.name)) byName.set(d.name, d);
  const orphanNames = new Set(orphans.map((o) => o.name));
  subjects.forEach((o) => {
    const cands = [];
    for (const [nm, d] of byName) {
      if (nm === o.name || orphanNames.has(nm) || d.lang !== o.lang) continue;
      const { score, shared } = nameSimilarity(o.name, nm);
      if (score >= 0.45 && shared.length) cands.push({ d, score, shared });
    }
    cands.sort((a, b) => b.score - a.score);
    let added = 0;
    for (const c of cands.slice(0, 4)) {
      const refs = (refIndex.get(c.d.name) || []).filter((r) => {
        if (files[r.fi].path === c.d.file && r.line >= c.d.line && r.line <= c.d.endLine) return false;
        // import lines are not call sites
        return !/^\s*(import\b|export\b.*\bfrom\b|from\s+\S+\s+import\b|const\s*\{[^}]*\}\s*=\s*require)/.test(files[r.fi].lines[r.line - 1] || '');
      });
      for (const r of refs.slice(0, 2)) {
        const f = files[r.fi];
        if (o.matches.some((m) => m.file === f.path && Math.abs(m.line - r.line) < 4)) continue;
        const paramBonus = o.params.length === c.d.params.length ? 8 : 0;
        o.matches.push({
          type: 'cousin',
          file: f.path, line: r.line, endLine: r.line,
          target: c.d.name,
          score: Math.min(95, Math.round(35 + 50 * c.score + paramBonus)),
          reason: `Calls ${c.d.name}(), a close cousin (they share ${c.shared.map((s) => `"${s}"`).join(' + ')}). Maybe ${o.name}() was meant to be the one here.`,
          snippet: snippetOf(f.lines, Math.max(1, r.line - 1), r.line + 1, 3),
        });
        added++;
        if (added >= 3) break;
      }
      if (added >= 3) break;
    }
  });

  // ---- 3. keyword + API overlap on single lines ---------------------------
  subjects.forEach((o) => {
    const f = files[fileIdx.get(o.file)];
    const body = f.code.slice(o.bodyStart, o.bodyEnd);
    const apis = new Set();
    const re = /\.\s*([A-Za-z_]\w{2,})\s*\(|\b(strftime|strptime|sprintf|Sprintf|Printf|parseInt|parseFloat|encodeURIComponent|decodeURIComponent|isoformat|fromisoformat|gsub|sub|scan|split|join|replace)\s*\(/g;
    let m;
    while ((m = re.exec(body))) apis.add(m[1] || m[2]);
    const words = nameTokens(o.name).filter((t) => t.length >= 3 && !STOP.has(t));
    if (apis.size < 1 || !words.length) return;
    const lineHits = new Map();
    for (const api of apis) {
      const refs = opts.apiIndex ? opts.apiIndex.get(api) : null;
      if (!refs || refs.length > 400) continue;
      for (const r of refs) {
        const key = r.fi + ':' + r.line;
        if (!lineHits.has(key)) lineHits.set(key, { r, apis: new Set() });
        lineHits.get(key).apis.add(api);
      }
    }
    const cands = [];
    for (const { r, apis: hit } of lineHits.values()) {
      const lf = files[r.fi];
      if (lf.path === o.file && r.line >= o.line && r.line <= o.endLine) continue;
      const text = (lf.lines[r.line - 1] || '').toLowerCase();
      const ctx = [r.line - 2, r.line - 1, r.line].map((k) => (lf.lines[k] || '').toLowerCase()).join(' ');
      const nameHits = words.filter((w) => ctx.includes(w)).length;
      if (!(nameHits >= 1 && hit.size >= 1) && hit.size < 3) continue;
      if (text.trim().length < 6) continue;
      const score = Math.min(0.82, 0.3 + 0.15 * hit.size + 0.12 * nameHits);
      cands.push({ r, lf, hit, nameHits, score });
    }
    cands.sort((a, b) => b.score - a.score);
    let added = 0;
    for (const c of cands) {
      if (o.matches.some((x) => x.file === c.lf.path && c.r.line >= x.line - 3 && c.r.line <= (x.endLine || x.line) + 3)) continue;
      const apiList = [...c.hit].slice(0, 3).map((a) => a + '()').join(' + ');
      const near = words.filter((w) => (c.lf.lines[c.r.line - 1] || '').toLowerCase().includes(w));
      o.matches.push({
        type: 'keyword',
        file: c.lf.path, line: c.r.line, endLine: c.r.line,
        target: null,
        score: Math.round(c.score * 100),
        reason: `Uses ${apiList}${near.length ? ` right next to the word "${near[0]}"` : ''}, which is ${o.name}()'s whole personality. Could this line call it instead?`,
        snippet: snippetOf(c.lf.lines, Math.max(1, c.r.line - 1), c.r.line + 1, 3),
      });
      if (++added >= 2) break;
    }
  });

  for (const o of subjects) {
    o.matches.sort((a, b) => b.score - a.score);
    o.matches = o.matches.slice(0, 5);
  }
}
