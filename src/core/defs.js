// Definition extraction. Regex/token based, run over *stripped* code (so
// nothing inside comments or strings is mistaken for a definition), with the
// original text used only for params, doc comments and snippets.

const JS_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'super', 'constructor',
  'new', 'delete', 'void', 'do', 'else', 'try', 'finally', 'with', 'yield', 'await', 'import',
  'export', 'class', 'extends', 'in', 'of', 'instanceof', 'throw', 'case', 'default', 'break',
  'continue', 'var', 'let', 'const', 'this', 'async', 'static', 'get', 'set',
]);

export const CALL_KEYWORDS = new Set([
  ...JS_KEYWORDS, 'def', 'elif', 'lambda', 'not', 'and', 'or', 'is', 'assert', 'func', 'go',
  'defer', 'range', 'map', 'chan', 'struct', 'interface', 'select', 'unless', 'until', 'end',
  'begin', 'rescue', 'ensure', 'when', 'then', 'module', 'raise', 'except', 'from', 'as',
  'print', 'puts', 'make', 'len', 'append', 'panic', 'require', 'include', 'self', 'nil',
  'None', 'True', 'False', 'true', 'false', 'null', 'undefined',
]);

export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  const lineOf = (off) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  return { starts, lineOf };
}

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);

/** Index of the bracket matching the one at `i`, or -1. Works on stripped code. */
export function matchBracket(code, i) {
  let depth = 0;
  for (let k = i; k < code.length; k++) {
    const c = code[k];
    if (OPEN[c]) depth++;
    else if (CLOSE.has(c)) { depth--; if (depth === 0) return k; if (depth < 0) return -1; }
  }
  return -1;
}

/** Split a parameter list on top-level commas and return compact names. */
export function splitParams(text, lang) {
  const parts = [];
  let depth = 0, cur = '';
  for (const c of text) {
    if ('([{<'.includes(c)) depth++;
    else if (')]}>'.includes(c)) depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  const out = [];
  for (let p of parts) {
    p = p.replace(/\s+/g, ' ').trim();
    if (!p) continue;
    if (lang === 'py' && /^(self|cls|\*|\/)$/.test(p.split(/[:=]/)[0].trim())) continue;
    if (lang === 'go') {
      // "a, b int" -> names only. A lone type (unnamed param) is kept as-is.
      const m = /^([A-Za-z_]\w*)\s+\S/.exec(p);
      out.push(m ? m[1] : p);
      continue;
    }
    if (/^[{[]/.test(p)) { out.push(p.length > 28 ? p.slice(0, 26) + '…' : p.replace(/\s*[:=].*$/s, (m) => (p[0] === '{' ? m : ''))); continue; }
    const m = /^(\*{0,2}|\.\.\.|&)?\s*([A-Za-z_$][\w$]*[?]?)/.exec(p);
    out.push(m ? (m[1] || '') + m[2] : p.slice(0, 24));
  }
  return out;
}

function compactParams(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 80 ? t.slice(0, 78) + '…' : t;
}

/** Leading comment block directly above `line` (1-based) in the original text. */
function leadingComment(origLines, line, style) {
  let i = line - 2;
  // skip decorators / annotations / Go directives
  while (i >= 0 && /^\s*@/.test(origLines[i]) && style !== 'rb') i--;
  if (i < 0) return '';
  const out = [];
  if (style === 'c' && /\*\/\s*$/.test(origLines[i])) {
    let j = i;
    while (j >= 0 && !/\/\*/.test(origLines[j])) j--;
    if (j < 0) return '';
    for (let k = j; k <= i; k++) out.push(origLines[k]);
    const text = out.join('\n')
      .replace(/^\s*\/\*\*?/, '').replace(/\*\/\s*$/, '')
      .split('\n').map((l) => l.replace(/^\s*\*\s?/, '')).join('\n');
    return cleanDoc(text);
  }
  const marker = style === 'c' ? /^\s*\/\/\/?\s?/ : /^\s*#\s?/;
  while (i >= 0 && marker.test(origLines[i]) && !/^\s*#!/.test(origLines[i])) {
    out.unshift(origLines[i].replace(marker, ''));
    i--;
  }
  return cleanDoc(out.filter((l) => !/^(go:|export |nolint|eslint|prettier|rubocop|frozen_string_literal|type: ignore|noqa|@ts-)/.test(l.trim())).join('\n'));
}

function cleanDoc(text) {
  // Keep the description, drop @param/@returns and similar tag lines.
  const lines = [];
  for (const l of text.split('\n')) {
    if (/^\s*[@:](param|arg|returns?|throws|type|raises|example|see|rtype|yield)/i.test(l)) break;
    lines.push(l.trim());
  }
  const t = lines.join(' ').replace(/\s+/g, ' ').trim();
  return t.length > 240 ? t.slice(0, 237) + '…' : t;
}

function callsIn(code, from, to, selfName) {
  const seg = code.slice(from, to);
  const re = /([A-Za-z_$][\w$]*[?!]?)\s*\(/g;
  const seen = new Set();
  let recursive = false;
  let m;
  while ((m = re.exec(seg))) {
    const n = m[1];
    if (n === selfName) { recursive = true; continue; }
    if (CALL_KEYWORDS.has(n) || seen.has(n)) continue;
    seen.add(n);
  }
  return { calls: [...seen].slice(0, 12), recursive };
}

function finish(def, file, ix) {
  def.line = ix.lineOf(def.nameOffset);
  def.endLine = ix.lineOf(Math.max(def.bodyEnd - 1, def.nameOffset));
  def.length = def.endLine - def.line + 1;
  const { calls, recursive } = callsIn(file.code, def.bodyStart, def.bodyEnd, def.name);
  def.calls = calls;
  def.recursive = recursive;
  def.file = file.path;
  def.lang = file.lang;
  return def;
}

// ---------------------------------------------------------------- JS / TS

const FN_VALUE = /^(async\s+)?(function\b|(\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=;{]+?)?=>|(?:React\.)?(memo|forwardRef|observer)\s*\()/;
const CLASS_HEAD = /\bclass\b(?:\s+([A-Za-z_$][\w$]*))?(?:\s*<[^{]*?>)?(\s+extends\s+[^{]+?)?(\s+implements\s+[^{]+?)?\s*$/;

/** Find the end of the function value starting at `v` (after `=`). */
function jsValueBody(code, v, indent) {
  let s = v;
  while (/\s/.test(code[s] || '')) s++;
  const rest = code.slice(s, s + 600);
  if (/^async\b/.test(rest)) { s += 5; while (/\s/.test(code[s] || '')) s++; }
  const wrap = /^(?:React\.)?(memo|forwardRef|observer)\s*\(/.exec(code.slice(s, s + 40));
  if (wrap) {
    const open = s + wrap[0].length - 1;
    const close = matchBracket(code, open);
    const inner = jsValueBody(code, open + 1, indent);
    return { paramsStart: inner.paramsStart, paramsEnd: inner.paramsEnd, bodyStart: s, bodyEnd: close === -1 ? inner.bodyEnd : close + 1 };
  }
  if (/^function\b/.test(code.slice(s, s + 9))) {
    const p = code.indexOf('(', s);
    const pe = matchBracket(code, p);
    const b = code.indexOf('{', pe);
    const be = b === -1 ? -1 : matchBracket(code, b);
    return { paramsStart: p + 1, paramsEnd: pe, bodyStart: b, bodyEnd: be === -1 ? code.length : be + 1 };
  }
  let paramsStart, paramsEnd, after;
  if (code[s] === '(') {
    paramsStart = s + 1; paramsEnd = matchBracket(code, s); after = paramsEnd + 1;
  } else {
    const m = /^[A-Za-z_$][\w$]*/.exec(code.slice(s));
    paramsStart = s; paramsEnd = s + (m ? m[0].length : 0); after = paramsEnd;
  }
  const arrow = code.indexOf('=>', after);
  let b = arrow + 2;
  while (/\s/.test(code[b] || '')) b++;
  if (code[b] === '{') {
    const be = matchBracket(code, b);
    return { paramsStart, paramsEnd, bodyStart: b, bodyEnd: be === -1 ? code.length : be + 1 };
  }
  // Expression body: run until a top-level `;`, or a newline followed by a
  // line that is not a continuation.
  let depth = 0;
  let k = b;
  for (; k < code.length; k++) {
    const c = code[k];
    if (OPEN[c]) depth++;
    else if (CLOSE.has(c)) { depth--; if (depth < 0) break; }
    else if (c === ';' && depth === 0) break;
    else if (c === '\n' && depth === 0) {
      const next = code.slice(k + 1, k + 200);
      const m = /^([ \t]*)(\S?)(\S?)/.exec(next);
      const ind = m[1].length;
      if (!(ind > indent || /^[.?:)\]}+\-*/|&]/.test(m[2] || '') || (m[2] === '=' && m[3] === '>'))) break;
    }
  }
  return { paramsStart, paramsEnd, bodyStart: b, bodyEnd: k };
}

export function extractJs(file) {
  const { code, content } = file;
  const ix = lineIndex(code);
  const origLines = content.split('\n');
  const codeLines = code.split('\n');
  const defs = [];
  const exportNames = new Set();
  let defaultExport = null;
  const excluded = []; // [offset] of tokens that are export bookkeeping, not uses
  const reexports = [];
  const imports = [];

  // Brace context at the start of every line.
  const frames = []; // { type: 'class'|'block', name, inherits }
  const lineFrames = new Array(codeLines.length);
  let line = 0;
  lineFrames[0] = [];
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '\n') { line++; lineFrames[line] = frames.slice(); continue; }
    if (c === '{') {
      const back = code.slice(Math.max(0, i - 300), i);
      const cut = Math.max(back.lastIndexOf(';'), back.lastIndexOf('}'), back.lastIndexOf('{'), back.lastIndexOf('=>'));
      const head = back.slice(cut + 1);
      const m = CLASS_HEAD.exec(head);
      if (m && !/=>\s*$/.test(head)) frames.push({ type: 'class', name: m[1] || 'anonymous', inherits: !!(m[2] || m[3]) });
      else frames.push({ type: 'block' });
    } else if (c === '}') frames.pop();
  }

  const push = (name, nameOffset, kind, body, extra = {}) => {
    const paramsRaw = body.paramsStart != null && body.paramsEnd > body.paramsStart ? content.slice(body.paramsStart, body.paramsEnd) : '';
    const def = {
      name, kind, nameOffset,
      bodyStart: body.bodyStart < 0 ? nameOffset : Math.min(body.paramsStart ?? body.bodyStart, body.bodyStart),
      bodyEnd: body.bodyEnd,
      paramsText: compactParams(paramsRaw),
      params: splitParams(paramsRaw, 'js'),
      ...extra,
    };
    def.doc = leadingComment(origLines, ix.lineOf(nameOffset), 'c');
    // decorators (TS / Angular / Nest) directly above
    const ln = ix.lineOf(nameOffset);
    const decorators = [];
    for (let k = ln - 2; k >= 0 && /^\s*@\w/.test(origLines[k]); k--) decorators.push(origLines[k].trim().split(/[(\s]/)[0]);
    def.decorators = decorators;
    defs.push(finish(def, file, ix));
  };

  for (let li = 0; li < codeLines.length; li++) {
    const text = codeLines[li];
    if (!text.trim()) continue;
    const lineStart = ix.starts[li];
    const fr = lineFrames[li] || [];
    const indent = /^[ \t]*/.exec(text)[0].length;
    if (fr.length === 0) {
      let m;
      if ((m = /^(\s*)(export\s+(default\s+)?)?(declare\s+)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(text)) && !m[4]) {
        const nameOffset = lineStart + m[0].length - m[6].length;
        const p = code.indexOf('(', nameOffset);
        const pe = matchBracket(code, p);
        if (pe === -1) continue;
        // overload signature (no body) -> just bookkeeping
        let k = pe + 1;
        while (k < code.length && code[k] !== '{' && code[k] !== ';' && !(code[k] === '\n' && /^\s*(export|function|const|let|var|class|import)\b/.test(code.slice(k + 1, k + 40)))) k++;
        if (code[k] !== '{') { excluded.push(nameOffset); continue; }
        const be = matchBracket(code, k);
        push(m[6], nameOffset, 'function', { paramsStart: p + 1, paramsEnd: pe, bodyStart: k, bodyEnd: be === -1 ? code.length : be + 1 },
          { exported: !!m[2], isDefaultExport: !!m[3] });
        continue;
      }
      if ((m = /^(\s*)(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=(?!=)\s*/.exec(text))) {
        const v = lineStart + m[0].length;
        if (FN_VALUE.test(code.slice(v, v + 500))) {
          const nameOffset = lineStart + m[0].indexOf(m[3], m[1].length + (m[2] ? m[2].length : 0));
          push(m[3], nameOffset, 'function', jsValueBody(code, v, indent), { exported: !!m[2] });
        }
        continue;
      }
      if ((m = /^(\s*)(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=(?!=)\s*/.exec(text))) {
        const v = lineStart + m[0].length;
        const nameOffset = lineStart + m[0].indexOf(m[2]);
        if (FN_VALUE.test(code.slice(v, v + 500))) {
          push(m[2], nameOffset, 'function', jsValueBody(code, v, indent), { exported: true, commonjs: true });
        } else {
          const id = /^([A-Za-z_$][\w$]*)\s*;?\s*$/.exec(code.slice(v, lineStart + text.length));
          if (id) { exportNames.add(id[1]); excluded.push(v); }
        }
        continue;
      }
      if ((m = /^(\s*)module\.exports\s*=\s*(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(text))) {
        const nameOffset = lineStart + m[0].length - m[3].length;
        const p = code.indexOf('(', nameOffset);
        const pe = matchBracket(code, p);
        const b = code.indexOf('{', pe);
        const be = matchBracket(code, b);
        push(m[3], nameOffset, 'function', { paramsStart: p + 1, paramsEnd: pe, bodyStart: b, bodyEnd: be === -1 ? code.length : be + 1 }, { exported: true, isDefaultExport: true, commonjs: true });
        continue;
      }
    } else {
      const top = fr[fr.length - 1];
      if (top.type !== 'class') continue;
      let m;
      if ((m = /^(\s*)((?:(?:static|async|get|set|public|private|protected|readonly|override|abstract|declare)\s+)*)(\*\s*)?(#?[A-Za-z_$][\w$]*)\s*[?!]?\s*(<[^>(]*>)?\s*\(/.exec(text))) {
        const name = m[4];
        if (JS_KEYWORDS.has(name) && !/^(get|set|static|async)$/.test(name)) continue;
        if (/\babstract\b/.test(m[2])) continue;
        const nameOffset = lineStart + m[1].length + m[2].length + (m[3] ? m[3].length : 0);
        const p = lineStart + m[0].length - 1;
        const pe = matchBracket(code, p);
        if (pe === -1) continue;
        let k = pe + 1;
        while (k < code.length && code[k] !== '{' && code[k] !== ';' && code[k] !== '}') k++;
        if (code[k] !== '{') continue;
        const be = matchBracket(code, k);
        push(name.replace(/^#/, ''), nameOffset + (name[0] === '#' ? 1 : 0), 'method', { paramsStart: p + 1, paramsEnd: pe, bodyStart: k, bodyEnd: be === -1 ? code.length : be + 1 }, {
          className: top.name, inherits: top.inherits,
          isPrivate: name[0] === '#' || /\bprivate\b/.test(m[2]),
          isStatic: /\bstatic\b/.test(m[2]), accessor: /\b(get|set)\b/.test(m[2]),
        });
        continue;
      }
      if ((m = /^(\s*)((?:(?:static|public|private|protected|readonly|override)\s+)*)(#?[A-Za-z_$][\w$]*)\s*[?!]?\s*(?::[^=]+)?=(?!=)\s*/.exec(text))) {
        const v = lineStart + m[0].length;
        if (!FN_VALUE.test(code.slice(v, v + 500))) continue;
        const name = m[3];
        const nameOffset = lineStart + m[1].length + m[2].length + (name[0] === '#' ? 1 : 0);
        push(name.replace(/^#/, ''), nameOffset, 'method', jsValueBody(code, v, indent), {
          className: top.name, inherits: top.inherits,
          isPrivate: name[0] === '#' || /\bprivate\b/.test(m[2]), isStatic: /\bstatic\b/.test(m[2]),
        });
      }
    }
  }

  // Export bookkeeping: `export { a, b as c }`, `export default foo`,
  // `module.exports = foo | { a, b: c }`. These mark things exported but are
  // not "uses" of them.
  let m;
  const reList = /\bexport\s*(type\s*)?\{([^}]*)\}(\s*from\b)?/g;
  while ((m = reList.exec(code))) {
    if (m[3] || m[1]) continue;
    const inner = m[2];
    const base = m.index + m[0].indexOf('{') + 1;
    const re = /([A-Za-z_$][\w$]*)(\s+as\s+([A-Za-z_$][\w$]*))?/g;
    let t;
    while ((t = re.exec(inner))) {
      if (t[1] === 'type') continue;
      exportNames.add(t[1]);
      if (t[3] === 'default') defaultExport = t[1];
      excluded.push(base + t.index);
      re.lastIndex = t.index + t[0].length;
    }
  }
  const reDef = /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*(?:\n|$)/g;
  while ((m = reDef.exec(code))) {
    if (/^(function|class|async)$/.test(m[1])) continue;
    defaultExport = m[1];
    excluded.push(m.index + m[0].indexOf(m[1], 14));
  }
  // `export default memo(Foo)` / `connect(...)(Foo)` style wrappers
  const reWrap = /\bexport\s+default\s+(?:[\w$.]+\([^()]*\)\s*)*[\w$.]+\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
  while ((m = reWrap.exec(code))) { defaultExport = defaultExport || m[1]; }
  const reCjs = /\bmodule\.exports\s*=\s*/g;
  while ((m = reCjs.exec(code))) {
    const v = m.index + m[0].length;
    if (code[v] === '{') {
      const e = matchBracket(code, v);
      if (e === -1) continue;
      const body = code.slice(v + 1, e);
      let depth = 0, start = 0;
      const parts = [];
      for (let k = 0; k <= body.length; k++) {
        const c = body[k];
        if (c && OPEN[c]) depth++;
        else if (c && CLOSE.has(c)) depth--;
        if ((c === ',' && depth === 0) || k === body.length) { parts.push([start, body.slice(start, k)]); start = k + 1; }
      }
      for (const [off, part] of parts) {
        const pm = /^(\s*)([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*)\s*)?$/.exec(part);
        if (!pm) continue;
        const nm = pm[3] || pm[2];
        exportNames.add(nm);
        excluded.push(v + 1 + off + (pm[3] ? part.lastIndexOf(pm[3]) : pm[1].length));
      }
    } else {
      const id = /^([A-Za-z_$][\w$]*)\s*;?\s*(\n|$)/.exec(code.slice(v, v + 80));
      if (id && id[1] !== 'function' && id[1] !== 'require') { defaultExport = id[1]; excluded.push(v); }
    }
  }

  const reRe = /\bexport\s+(?:type\s+)?(\*|\{[^}]*\})\s*(?:as\s+[\w$]+\s*)?from\s*['"]([^'"\n]+)['"]/g;
  while ((m = reRe.exec(content))) reexports.push(m[2]);
  const reImp = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g;
  while ((m = reImp.exec(content))) imports.push(m[1]);

  for (const d of defs) {
    if (exportNames.has(d.name) && d.kind === 'function') d.exported = true;
    if (defaultExport === d.name && d.kind === 'function') { d.exported = true; d.isDefaultExport = true; }
  }
  return { defs, excluded, reexports, imports, defaultExport };
}

// ---------------------------------------------------------------- Python

function pyIndent(s) {
  let n = 0;
  for (const c of s) { if (c === ' ') n++; else if (c === '\t') n += 4; else break; }
  return n;
}

export function extractPy(file) {
  const { code, content } = file;
  const ix = lineIndex(code);
  const lines = code.split('\n');
  const orig = content.split('\n');
  const defs = [];
  const frames = []; // { indent, type, name, inherits }
  let contLine = false; // inside brackets across lines

  let depth = 0;
  for (let li = 0; li < lines.length; li++) {
    const text = lines[li];
    const startDepth = depth;
    for (const c of text) { if (OPEN[c]) depth++; else if (CLOSE.has(c)) depth = Math.max(0, depth - 1); }
    if (startDepth > 0 || !text.trim()) continue;
    contLine = false;
    const ind = pyIndent(text);
    while (frames.length && frames[frames.length - 1].indent >= ind) frames.pop();
    let m;
    if ((m = /^(\s*)class\s+([A-Za-z_]\w*)\s*(\(([^)]*)\))?\s*:/.exec(text))) {
      const bases = (m[4] || '').replace(/\s+/g, '').split(',').filter((b) => b && b !== 'object' && !/^metaclass=/.test(b));
      frames.push({ indent: ind, type: 'class', name: m[2], inherits: bases.length > 0, bases });
      continue;
    }
    if ((m = /^(\s*)(async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(text))) {
      const parent = frames[frames.length - 1];
      frames.push({ indent: ind, type: 'def' });
      if (parent && parent.type === 'def') continue; // nested helper: local scope
      const name = m[3];
      const nameOffset = ix.starts[li] + m[0].length - 1 - (m[0].length - 1 - m[0].lastIndexOf(name));
      const p = ix.starts[li] + m[0].length - 1;
      const pe = matchBracket(code, p);
      if (pe === -1) continue;
      const colon = code.indexOf(':', pe);
      const sigEndLine = ix.lineOf(colon === -1 ? pe : colon);
      // body: following lines indented deeper than the def
      let end = sigEndLine;
      const sameLineBody = colon !== -1 && code.slice(colon + 1, ix.starts[sigEndLine] ?? code.length).trim();
      if (!sameLineBody) {
        for (let k = sigEndLine; k < lines.length; k++) {
          const t = lines[k];
          if (!t.trim()) continue;
          if (pyIndent(t) <= ind && !/^\s*[)\]}]/.test(t)) break;
          end = k + 1;
        }
      }
      // decorators above
      const decorators = [];
      for (let k = li - 1; k >= 0 && k >= li - 20; k--) {
        const t = orig[k];
        if (!t.trim()) break;
        const ti = pyIndent(t);
        if (ti === ind && /^\s*@/.test(t)) { decorators.unshift(t.trim().replace(/^@\s*/, '').split(/[(\s]/)[0]); continue; }
        if (ti > ind || /^\s*[)\]}]/.test(t)) continue;
        break;
      }
      // docstring
      let doc = '';
      for (let k = sigEndLine; k < Math.min(orig.length, sigEndLine + 3); k++) {
        const t = orig[k] || '';
        if (!t.trim()) continue;
        const dm = /^\s*[rRuU]?("""|'''|"|')/.exec(t);
        if (dm) {
          let txt = t.trim().slice(dm[0].trim().length);
          let kk = k;
          while (!txt.includes(dm[1]) && kk + 1 < orig.length && kk < k + 30) { kk++; txt += '\n' + orig[kk]; }
          doc = cleanDoc(txt.split(dm[1])[0]);
        }
        break;
      }
      const paramsRaw = content.slice(p + 1, pe);
      const bodyEnd = end < ix.starts.length ? ix.starts[end] - 1 : code.length;
      const def = {
        name, kind: parent && parent.type === 'class' ? 'method' : 'function', nameOffset,
        bodyStart: p, bodyEnd: Math.max(bodyEnd, pe + 1),
        className: parent && parent.type === 'class' ? parent.name : undefined,
        inherits: !!(parent && parent.inherits), bases: parent && parent.bases,
        paramsText: compactParams(paramsRaw), params: splitParams(paramsRaw, 'py'),
        decorators, doc,
        isPrivate: /^_/.test(name) && !/^__.*__$/.test(name),
        exported: ind === 0 && !/^_/.test(name),
      };
      defs.push(finish(def, file, ix));
    }
  }
  return { defs, excluded: [], imports: [], reexports: [] };
}

// ---------------------------------------------------------------- Go

export function extractGo(file) {
  const { code, content } = file;
  const ix = lineIndex(code);
  const orig = content.split('\n');
  const defs = [];
  const pkg = (/^\s*package\s+(\w+)/m.exec(code) || [])[1] || '';
  const re = /^func\s*(\(([^)]*)\))?\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*\(/gm;
  let m;
  while ((m = re.exec(code))) {
    const name = m[3];
    const nameOffset = m.index + m[0].lastIndexOf(name, m[0].length - 1 - (m[4] ? m[4].length : 0));
    const p = m.index + m[0].length - 1;
    const pe = matchBracket(code, p);
    if (pe === -1) continue;
    // Skip the result type, which may contain interface{} / struct{} braces.
    let k = pe + 1, depth = 0, bodyStart = -1;
    while (k < code.length) {
      const c = code[k];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === '\n' && depth === 0) break;
      else if (c === '{' && depth === 0) {
        if (/\b(interface|struct)\s*$/.test(code.slice(Math.max(0, k - 12), k))) { k = matchBracket(code, k); if (k === -1) break; }
        else { bodyStart = k; break; }
      }
      k++;
    }
    if (bodyStart === -1) continue;
    const be = matchBracket(code, bodyStart);
    let receiverType;
    if (m[2]) receiverType = (/([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*$/.exec(m[2].replace(/\*/g, ' ')) || [])[1];
    const line = ix.lineOf(nameOffset);
    const directives = [];
    for (let j = line - 2; j >= 0 && /^\s*\/\//.test(orig[j]); j--) if (/^\s*\/\/(export\s|go:)/.test(orig[j])) directives.push(orig[j].trim());
    const paramsRaw = content.slice(p + 1, pe);
    const def = {
      name, kind: m[1] ? 'method' : 'function', nameOffset,
      bodyStart: p, bodyEnd: be === -1 ? code.length : be + 1,
      className: receiverType, pkg,
      paramsText: compactParams(paramsRaw), params: splitParams(paramsRaw, 'go'),
      doc: leadingComment(orig, line, 'c'), directives,
      exported: /^[A-Z]/.test(name), isPrivate: !/^[A-Z]/.test(name),
    };
    defs.push(finish(def, file, ix));
  }
  return { defs, excluded: [], imports: [], reexports: [], pkg };
}

// ---------------------------------------------------------------- Ruby

export function extractRb(file) {
  const { code, content } = file;
  const ix = lineIndex(code);
  const lines = code.split('\n');
  const orig = content.split('\n');
  const defs = [];
  const excluded = [];
  const frames = []; // { indent, type, name, superclass, visibility, privateNames }
  const privByClass = [];

  for (let li = 0; li < lines.length; li++) {
    const text = lines[li];
    const t = text.trim();
    if (!t) continue;
    const ind = /^[ \t]*/.exec(text)[0].length;
    while (frames.length && ind < frames[frames.length - 1].indent) frames.pop();
    if (/^end\b/.test(t)) {
      if (frames.length && frames[frames.length - 1].indent === ind) frames.pop();
      continue;
    }
    const top = frames[frames.length - 1];
    const owner = [...frames].reverse().find((f) => f.type !== 'def');
    let m;
    if ((m = /^class\s*<<\s*self\b/.exec(t))) { frames.push({ indent: ind, type: 'sclass', name: owner && owner.name, superclass: owner && owner.superclass, visibility: 'public' }); continue; }
    if ((m = /^(class|module)\s+([A-Z][\w:]*)\s*(<\s*([A-Z][\w:]*(?:\[[^\]]*\])?|[\w:.()]+))?/.exec(t))) {
      if (/;\s*end\s*$/.test(t)) continue;
      const fr = { indent: ind, type: m[1], name: m[2], superclass: m[4] || null, visibility: 'public', privateNames: new Set() };
      frames.push(fr); privByClass.push(fr);
      continue;
    }
    if (owner && /^(private|protected|public|module_function)\s*$/.test(t) && (!top || top.type !== 'def')) { owner.visibility = t === 'module_function' ? 'public' : t; continue; }
    if (owner && (m = /^(private|protected|private_class_method|public)\s+(:[\w?!=]+(\s*,\s*:[\w?!=]+)*)\s*$/.exec(t))) {
      const lineStart = ix.starts[li];
      const re = /:([\w?!=]+)/g; let s;
      while ((s = re.exec(text))) { if (m[1] !== 'public') owner.privateNames && owner.privateNames.add(s[1]); excluded.push(lineStart + s.index + 1); }
      continue;
    }
    if ((m = /^((?:private|protected|public)\s+)?def\s+(self\.)?([A-Za-z_]\w*[?!=]?)/.exec(t))) {
      if (top && top.type === 'def') continue;
      const name = m[3];
      const lineStart = ix.starts[li];
      const nameOffset = lineStart + ind + m[0].length - name.length;
      let endLi = li;
      const after = text.slice(ind + m[0].length);
      const endless = /^\s*(\([^)]*\))?\s*=[^=~>]/.test(after) && !name.endsWith('=');
      if (!endless && !/;\s*end\s*$/.test(t)) {
        for (let k = li + 1; k < lines.length; k++) {
          const tt = lines[k];
          if (!tt.trim()) continue;
          const ti = /^[ \t]*/.exec(tt)[0].length;
          if (ti < ind) { endLi = k - 1; break; }
          if (ti === ind) {
            if (/^\s*end\b/.test(tt)) { endLi = k; break; }
            if (/^\s*(rescue|ensure|else)\b/.test(tt)) continue;
            endLi = k - 1; break;
          }
          endLi = k;
        }
        if (endLi !== li) frames.push({ indent: ind, type: 'def' });
        // the def frame is popped when we reach its `end`
      }
      let paramsRaw = '';
      const pm = /^\s*\(([^)]*)\)/.exec(after) || /^\s+([^;=#]+)/.exec(after);
      if (pm) paramsRaw = pm[1];
      const bodyEnd = endLi + 1 < ix.starts.length ? ix.starts[endLi + 1] - 1 : code.length;
      const vis = m[1] ? m[1].trim() : (owner ? owner.visibility : 'public');
      const def = {
        name, kind: owner ? 'method' : 'function', nameOffset,
        bodyStart: nameOffset + name.length, bodyEnd,
        className: owner && owner.name, superclass: owner && owner.superclass, inherits: !!(owner && owner.superclass),
        singleton: !!m[2] || (owner && owner.type === 'sclass'),
        paramsText: compactParams(paramsRaw), params: splitParams(paramsRaw, 'rb'),
        doc: leadingComment(orig, li + 1, 'rb'),
        visibility: vis, isPrivate: vis !== 'public', exported: vis === 'public',
        _owner: owner,
      };
      defs.push(finish(def, file, ix));
    }
  }
  for (const d of defs) {
    if (d._owner && d._owner.privateNames && d._owner.privateNames.has(d.name)) { d.isPrivate = true; d.exported = false; d.visibility = 'private'; }
    delete d._owner;
  }
  return { defs, excluded, imports: [], reexports: [] };
}

export function extractDefs(file) {
  switch (file.lang) {
    case 'js': return extractJs(file);
    case 'py': return extractPy(file);
    case 'go': return extractGo(file);
    case 'rb': return extractRb(file);
    default: return { defs: [], excluded: [], imports: [], reexports: [] };
  }
}
