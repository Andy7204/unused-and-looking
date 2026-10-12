// Comment & string stripping. Every comment and string body is replaced with
// spaces (newlines kept), so offsets and line numbers in the stripped code
// match the original file exactly. Code inside interpolations (`${}`, f"{}",
// "#{}") is kept, because that code really does call things.
//
// Returns { code, strings } where strings = [{ text, line }] for the
// "is this name mentioned in a string?" check.

const IDENT = /[A-Za-z0-9_$]/;

function lineCounter(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

function makeCtx(src) {
  const out = src.split('');
  const strings = [];
  const lineAt = lineCounter(src);
  return {
    out,
    strings,
    blank(from, to) {
      for (let i = from; i < to; i++) {
        const c = out[i];
        if (c !== '\n' && c !== '\r') out[i] = ' ';
      }
    },
    record(from, to) {
      if (to > from) strings.push({ text: src.slice(from, to), line: lineAt(from) });
    },
    done() {
      return { code: out.join(''), strings };
    },
  };
}

function prevSignificant(src, i) {
  let j = i - 1;
  while (j >= 0 && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r' || src[j] === '\n')) j--;
  return j;
}

function wordBefore(src, j) {
  let w = '';
  for (let k = j; k >= 0 && IDENT.test(src[k]); k--) w = src[k] + w;
  return w;
}

// ---------- JavaScript / TypeScript ----------

const JS_REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);

function jsRegexAllowed(src, i, code) {
  const j = prevSignificant(code, i);
  if (j < 0) return true;
  const c = code[j];
  // `</` is a JSX closing tag, not the start of a regex.
  if (c === '<' && j === i - 1) return false;
  if ('(,=:[!&|?{};+-*%<>~^'.includes(c)) return true;
  if (IDENT.test(c)) return JS_REGEX_KEYWORDS.has(wordBefore(code, j));
  return false;
}

export function stripJs(src) {
  const ctx = makeCtx(src);
  const n = src.length;
  // Stack of template-literal interpolation depths.
  const tpl = [];
  let i = 0;
  // Regex detection looks back at already-stripped code (ctx.out).
  const view = ctx.out;

  function scanTemplate(start) {
    // start points just after the opening backtick (or after a closing `}` of ${}).
    let k = start;
    let segStart = k;
    while (k < n) {
      const c = src[k];
      if (c === '\\') { k += 2; continue; }
      if (c === '`') {
        ctx.record(segStart, k); ctx.blank(segStart, k);
        return { end: k + 1, interp: false };
      }
      if (c === '$' && src[k + 1] === '{') {
        ctx.record(segStart, k); ctx.blank(segStart, k);
        return { end: k + 2, interp: true };
      }
      k++;
    }
    ctx.record(segStart, n); ctx.blank(segStart, n);
    return { end: n, interp: false };
  }

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let k = i;
      while (k < n && src[k] !== '\n') k++;
      ctx.blank(i, k); i = k; continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const k = end === -1 ? n : end + 2;
      ctx.blank(i, k); i = k; continue;
    }
    if (c === '"' || c === "'") {
      // Single-line strings only. An unterminated one (e.g. an apostrophe in
      // JSX text like <p>Don't</p>) is not a string at all — leave it as code.
      let k = i + 1;
      let ok = false;
      while (k < n) {
        const e = src[k];
        if (e === '\\') { k += 2; continue; }
        if (e === '\n') break;
        if (e === c) { ok = true; break; }
        k++;
      }
      if (ok) {
        ctx.record(i + 1, k); ctx.blank(i + 1, k); i = k + 1;
      } else {
        i++;
      }
      continue;
    }
    if (c === '`') {
      const r = scanTemplate(i + 1);
      if (r.interp) tpl.push(0);
      i = r.end; continue;
    }
    if (tpl.length) {
      if (c === '{') { tpl[tpl.length - 1]++; i++; continue; }
      if (c === '}') {
        if (tpl[tpl.length - 1] === 0) {
          tpl.pop();
          const r = scanTemplate(i + 1);
          if (r.interp) tpl.push(0);
          i = r.end; continue;
        }
        tpl[tpl.length - 1]--; i++; continue;
      }
    }
    if (c === '/' && jsRegexAllowed(src, i, view)) {
      // Regex literal: must close on the same line.
      let k = i + 1;
      let inClass = false;
      let ok = false;
      while (k < n) {
        const e = src[k];
        if (e === '\\') { k += 2; continue; }
        if (e === '\n') break;
        if (e === '[') inClass = true;
        else if (e === ']') inClass = false;
        else if (e === '/' && !inClass) { ok = true; break; }
        k++;
      }
      if (ok && k > i + 1) {
        ctx.blank(i + 1, k);
        i = k + 1;
        while (i < n && /[a-z]/.test(src[i])) i++;
        continue;
      }
    }
    i++;
  }
  return ctx.done();
}

// ---------- Python ----------

export function stripPy(src) {
  const ctx = makeCtx(src);
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '#') {
      let k = i;
      while (k < n && src[k] !== '\n') k++;
      ctx.blank(i, k); i = k; continue;
    }
    if (c === '"' || c === "'") {
      // Prefix letters (f, r, b, u, rb, fr...) sit right before the quote.
      let p = i - 1;
      let prefix = '';
      while (p >= 0 && /[rRbBuUfF]/.test(src[p]) && prefix.length < 2) { prefix = src[p] + prefix; p--; }
      if (p >= 0 && /[A-Za-z0-9_]/.test(src[p])) prefix = '';
      const isF = /f/i.test(prefix);
      const raw = /r/i.test(prefix);
      const triple = src[i + 1] === c && src[i + 2] === c;
      const q = triple ? c + c + c : c;
      let k = i + q.length;
      let segStart = k;
      let depth = 0;
      let closed = false;
      while (k < n) {
        const e = src[k];
        if (depth === 0) {
          if (e === '\\' && !raw) { k += 2; continue; }
          if (e === '\\' && raw) { k += 2; continue; }
          if (!triple && e === '\n') break;
          if (src.startsWith(q, k)) { closed = true; break; }
          if (isF && e === '{') {
            if (src[k + 1] === '{') { k += 2; continue; }
            ctx.record(segStart, k); ctx.blank(segStart, k);
            depth = 1; k++; continue;
          }
          k++;
        } else {
          // Inside an f-string expression: keep it as code.
          if (e === '{' || e === '[' || e === '(') depth++;
          else if (e === '}' || e === ']' || e === ')') {
            depth--;
            if (depth === 0) { segStart = k + 1; }
          } else if (!triple && e === '\n') break;
          k++;
        }
      }
      if (depth === 0) { ctx.record(segStart, k); ctx.blank(segStart, k); }
      i = closed ? k + q.length : k;
      continue;
    }
    i++;
  }
  return ctx.done();
}

// ---------- Go ----------

export function stripGo(src) {
  const ctx = makeCtx(src);
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let k = i;
      while (k < n && src[k] !== '\n') k++;
      ctx.blank(i, k); i = k; continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const k = end === -1 ? n : end + 2;
      ctx.blank(i, k); i = k; continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && src[k] !== c && src[k] !== '\n') { if (src[k] === '\\') k++; k++; }
      ctx.record(i + 1, k); ctx.blank(i + 1, k); i = k + 1; continue;
    }
    if (c === '`') {
      let k = src.indexOf('`', i + 1);
      if (k === -1) k = n;
      ctx.record(i + 1, k); ctx.blank(i + 1, k); i = k + 1; continue;
    }
    i++;
  }
  return ctx.done();
}

// ---------- Ruby ----------

const RB_PAIRS = { '(': ')', '[': ']', '{': '}', '<': '>' };
const RB_REGEX_KEYWORDS = new Set(['if', 'unless', 'when', 'and', 'or', 'not', 'return', 'while', 'until', 'puts', 'then', 'else', 'elsif', 'case']);

export function stripRb(src) {
  const ctx = makeCtx(src);
  const n = src.length;
  let i = 0;
  const pendingHeredocs = [];
  let atLineStart = true;

  // Scan a delimited literal starting at `k` (just after the opener). If
  // `interp`, keep #{...} as code. Returns the index after the closer.
  function scanDelimited(k, open, close, interp, keepAsCode) {
    let depth = 1;
    let segStart = k;
    while (k < n) {
      const e = src[k];
      if (e === '\\') { k += 2; continue; }
      if (interp && e === '#' && src[k + 1] === '{') {
        if (!keepAsCode) { ctx.record(segStart, k); ctx.blank(segStart, k); }
        let dd = 1; k += 2;
        while (k < n && dd > 0) { if (src[k] === '{') dd++; else if (src[k] === '}') dd--; k++; }
        segStart = k; continue;
      }
      if (open !== close && e === open) depth++;
      else if (e === close) { depth--; if (depth === 0) break; }
      k++;
    }
    if (!keepAsCode) { ctx.record(segStart, k); ctx.blank(segStart, k); }
    return Math.min(k + 1, n);
  }

  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      atLineStart = true;
      i++;
      if (pendingHeredocs.length) {
        // Blank whole lines until each heredoc terminator.
        for (const h of pendingHeredocs) {
          let lineStart = i;
          while (lineStart < n) {
            let lineEnd = src.indexOf('\n', lineStart);
            if (lineEnd === -1) lineEnd = n;
            const line = src.slice(lineStart, lineEnd);
            if (line.trim() === h) { i = lineEnd; break; }
            ctx.record(lineStart, lineEnd); ctx.blank(lineStart, lineEnd);
            lineStart = lineEnd + 1;
            i = lineStart;
          }
        }
        pendingHeredocs.length = 0;
      }
      continue;
    }
    if (atLineStart && src.startsWith('=begin', i)) {
      const end = src.indexOf('\n=end', i);
      const k = end === -1 ? n : end + 5;
      ctx.blank(i, k); i = k; continue;
    }
    if (c !== ' ' && c !== '\t') atLineStart = false;
    if (c === '#') {
      let k = i;
      while (k < n && src[k] !== '\n') k++;
      ctx.blank(i, k); i = k; continue;
    }
    if (c === '<' && src[i + 1] === '<') {
      const m = /^<<([~-]?)(['"]?)([A-Z_][A-Z0-9_]*)\2/.exec(src.slice(i, i + 80));
      if (m) { pendingHeredocs.push(m[3]); i += m[0].length; continue; }
    }
    if (c === '"' || c === '`') { i = scanDelimited(i + 1, c, c, true, false); continue; }
    if (c === "'") { i = scanDelimited(i + 1, c, c, false, false); continue; }
    if (c === ':' && src[i + 1] === '"') { i = scanDelimited(i + 2, '"', '"', true, true); continue; }
    if (c === '%') {
      const m = /^%([qQwWiIrs]?)([([{<|!\/^])/.exec(src.slice(i, i + 3));
      const j = prevSignificant(src, i);
      const prevOk = j < 0 || !/[A-Za-z0-9_)\]}]/.test(src[j]) || RB_REGEX_KEYWORDS.has(wordBefore(src, j));
      if (m && (m[1] || prevOk)) {
        const open = m[2];
        const close = RB_PAIRS[open] || open;
        const kind = m[1];
        // %w / %i word lists stay as code: they are often method names.
        const keep = /[wWiI]/.test(kind);
        const interp = kind === '' || kind === 'Q' || kind === 'W' || kind === 'I' || kind === 'r';
        i = scanDelimited(i + m[0].length, open, close, interp, keep);
        continue;
      }
    }
    if (c === '/') {
      const j = prevSignificant(src, i);
      const ok = j < 0 || '(,=~!&|{[;'.includes(src[j]) || RB_REGEX_KEYWORDS.has(wordBefore(src, j));
      if (ok) {
        let k = i + 1;
        let closed = false;
        while (k < n && src[k] !== '\n') { if (src[k] === '\\') { k += 2; continue; } if (src[k] === '/') { closed = true; break; } k++; }
        if (closed) { ctx.blank(i + 1, k); i = k + 1; continue; }
      }
    }
    if (c === '?' && /[\s(,=[]/.test(src[i - 1] || ' ') && src[i + 1] && !/\s/.test(src[i + 1])) {
      // Character literal like ?a, ?" or ?\t (a ternary always has a space after `?`)
      if (src[i + 1] === '\\') { i += 3; continue; }
      if (!/[A-Za-z0-9_]/.test(src[i + 2] || '')) { i += 2; continue; }
    }
    i++;
  }
  return ctx.done();
}

export function stripSource(src, lang) {
  switch (lang) {
    case 'js': return stripJs(src);
    case 'py': return stripPy(src);
    case 'go': return stripGo(src);
    case 'rb': return stripRb(src);
    default: return { code: src, strings: [] };
  }
}
