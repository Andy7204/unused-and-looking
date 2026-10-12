// The core analyser. Pure: takes [{ path, content, mtime? }] and returns a
// report. Never touches the file system, so the CLI and the browser share it.

import { stripSource } from './strip.js';
import { classifyPath, looksMinifiedOrGenerated, isTestFile, isRouteFile, isConfigScript, isStoryFile, basename, dirname, extname, MAX_FILE_BYTES } from './files.js';
import { extractDefs, lineIndex } from './defs.js';
import { matchmake } from './match.js';

export const VERSION = '1.0.0';
export const DEFAULT_MIN_CONFIDENCE = 50;

// ---- names the runtime/framework calls for you -----------------------------

const JS_LIFECYCLE = new Set([
  'render', 'componentDidMount', 'componentDidUpdate', 'componentWillUnmount', 'shouldComponentUpdate',
  'getSnapshotBeforeUpdate', 'componentDidCatch', 'getDerivedStateFromProps', 'getDerivedStateFromError',
  'componentWillMount', 'componentWillReceiveProps', 'componentWillUpdate', 'UNSAFE_componentWillMount',
  'UNSAFE_componentWillReceiveProps', 'UNSAFE_componentWillUpdate', 'getInitialState', 'getDefaultProps',
  'connectedCallback', 'disconnectedCallback', 'attributeChangedCallback', 'adoptedCallback', 'formAssociatedCallback',
  'firstUpdated', 'updated', 'willUpdate', 'shouldUpdate', 'createRenderRoot', 'getUpdateComplete',
  'ngOnInit', 'ngOnDestroy', 'ngOnChanges', 'ngDoCheck', 'ngAfterViewInit', 'ngAfterViewChecked', 'ngAfterContentInit', 'ngAfterContentChecked',
  'connect', 'disconnect', 'initialize', 'toString', 'toJSON', 'valueOf', 'toLocaleString', 'then', 'handleEvent',
  'next', 'return', 'throw', 'inspect', 'transform', 'flush', '_transform', '_flush', '_read', '_write', '_writev', '_final', '_destroy',
  'onModuleInit', 'onModuleDestroy', 'onApplicationBootstrap', 'canActivate', 'intercept', 'catch', 'use', 'resolve',
  'getInitialProps', 'getStaticProps', 'getServerSideProps', 'getStaticPaths', 'loader', 'action', 'getLayout',
]);
const JS_FRAMEWORK_EXPORTS = new Set([
  'default', 'getServerSideProps', 'getStaticProps', 'getStaticPaths', 'getInitialProps', 'generateMetadata', 'generateStaticParams',
  'generateViewport', 'generateImageMetadata', 'generateSitemaps', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
  'middleware', 'loader', 'action', 'meta', 'links', 'headers', 'handle', 'shouldRevalidate', 'ErrorBoundary', 'HydrateFallback',
  'load', 'actions', 'entries', 'handler', 'register', 'onRequest', 'onRequestGet', 'onRequestPost', 'config', 'setup', 'teardown',
  'globalSetup', 'globalTeardown', 'reportWebVitals', 'instrumentation', 'onRequestError',
]);
const PY_FRAMEWORK_METHODS = new Set([
  'save', 'delete', 'clean', 'full_clean', 'get_absolute_url', 'get_queryset', 'get_context_data', 'get_object', 'get_serializer_class',
  'get_serializer', 'get_success_url', 'get_form', 'get_form_class', 'form_valid', 'form_invalid', 'dispatch', 'get', 'post', 'put',
  'patch', 'head', 'options', 'perform_create', 'perform_update', 'perform_destroy', 'has_permission', 'has_object_permission',
  'handle', 'add_arguments', 'ready', 'run', 'process_request', 'process_response', 'process_view', 'process_exception',
  'to_representation', 'to_internal_value', 'validate', 'create', 'update', 'natural_key', 'setUp', 'tearDown', 'setUpClass',
  'tearDownClass', 'setUpTestData', 'asyncSetUp', 'asyncTearDown', 'emit', 'filter', 'format', 'formatTime', 'formatException',
  'default', 'encode', 'decode', 'forward', 'compose', 'build', 'call', 'invoke', 'execute', 'render', 'serialize', 'deserialize',
  'exec_module', 'find_spec', 'create_module', 'parse_args', 'error', 'close', 'read', 'write', 'flush', 'connect', 'send',
  'on_connect', 'on_message', 'data_received', 'connection_made', 'connection_lost',
  'readinto', 'readable', 'writable', 'seekable', 'fileno', 'isatty', 'readline', 'readlines', 'writelines', 'tell',
  'seek', 'truncate', 'detach', 'keys', 'values', 'items', 'copy', 'pop', 'popitem', 'setdefault', 'clear', 'append',
  'extend', 'insert', 'remove', 'index', 'count', 'add', 'discard',
]);
const PY_FRAMEWORK_PATTERNS = /^(clean_|validate_|visit_|depart_|do_|on_|handle_|test|get_[a-z_]+_display$|pytest_|setup_|teardown_)/;
const PY_NEUTRAL_DECORATORS = /^(staticmethod|classmethod|property|cached_property|functools\.(cache|lru_cache|cached_property|wraps|total_ordering)|lru_cache|cache|wraps|[\w.]*\.(setter|getter|deleter))$/;
const GO_INTERFACE_METHODS = new Set([
  'String', 'Error', 'GoString', 'Format', 'ServeHTTP', 'Read', 'Write', 'Close', 'Seek', 'ReadFrom', 'WriteTo', 'ReadAt', 'WriteAt',
  'Len', 'Less', 'Swap', 'Push', 'Pop', 'MarshalJSON', 'UnmarshalJSON', 'MarshalText', 'UnmarshalText', 'MarshalYAML', 'UnmarshalYAML',
  'MarshalBinary', 'UnmarshalBinary', 'MarshalXML', 'UnmarshalXML', 'Scan', 'Value', 'Unwrap', 'Is', 'As', 'Timeout', 'Temporary',
  'Lock', 'Unlock', 'RLock', 'RUnlock', 'Header', 'WriteHeader', 'Flush', 'Hijack', 'Sum', 'Reset', 'Size', 'BlockSize', 'Get', 'Set',
  'Run', 'Execute', 'Validate', 'Describe', 'Collect', 'Init', 'Name', 'Type', 'Kind', 'Next', 'Err', 'Key', 'Deadline', 'Done',
  'Accept', 'Addr', 'Dial', 'Network', 'Handle', 'Apply', 'Reconcile', 'SetupWithManager', 'DeepCopyObject', 'DeepCopy', 'DeepCopyInto',
  'ProtoMessage', 'ProtoReflect', 'Descriptor', 'Equal', 'Clone', 'Copy', 'Start', 'Stop', 'Serve', 'Shutdown', 'Open', 'Ping',
]);
const RB_HOOKS = new Set([
  'initialize', 'method_missing', 'respond_to_missing?', 'to_s', 'to_str', 'to_h', 'to_hash', 'to_a', 'to_ary', 'to_proc', 'to_json',
  'as_json', 'inspect', 'each', 'hash', 'eql?', 'call', 'perform', 'up', 'down', 'change', 'included', 'extended', 'inherited',
  'prepended', 'coerce', 'marshal_dump', 'marshal_load', 'initialize_copy', 'to_param', 'to_partial_path', 'serializable_hash',
  'persisted?', 'render_in', 'setup', 'teardown', 'before_setup', 'after_teardown', 'run', 'process', 'handle', 'to_i', 'to_f',
  'to_sym', 'to_io', 'to_path', 'encode_with', 'init_with', 'method_added', 'const_missing', 'respond_to?', 'each_pair', 'succ', 'size',
]);

const STATUS = (c) => (c >= 85 ? 'Very single' : c >= 65 ? 'Probably single' : c >= 50 ? "It's complicated" : 'Maybe seeing someone');
export const confidenceLabel = STATUS;

function posix(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function idTokenizer(lang) {
  return lang === 'rb' ? /[A-Za-z_]\w*(?:[?!](?!=))?/g : /[A-Za-z_$][\w$]*/g;
}

/** Resolve a package.json entry (which may point at dist/) to a source file. */
function resolveEntry(pkgDir, entry, pathSet) {
  if (typeof entry !== 'string') return null;
  const rel = posix(entry).replace(/^\.\//, '');
  const join = (p) => posix((pkgDir ? pkgDir + '/' : '') + p).replace(/\/\.\//g, '/');
  const noExt = rel.replace(/\.(m|c)?js$|\.d\.ts$/, '');
  const exts = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx'];
  const tries = [rel, noExt];
  const mapped = noExt.replace(/^(dist|build|lib|out|es|esm|cjs|umd|module)\//, 'src/');
  tries.push(mapped, noExt.replace(/^(dist|build|out)\//, 'lib/'), noExt.replace(/^(dist|build|lib|out|esm|cjs)\//, ''));
  for (const t of tries) {
    for (const e of exts) { const p = join(t + e); if (pathSet.has(p)) return p; }
    for (const e of exts.slice(1)) { const p = join(t + '/index' + e); if (pathSet.has(p)) return p; }
  }
  return null;
}

function collectStrings(obj, out = []) {
  if (typeof obj === 'string') out.push(obj);
  else if (Array.isArray(obj)) obj.forEach((x) => collectStrings(x, out));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((x) => collectStrings(x, out));
  return out;
}

function resolveRelative(fromFile, spec, pathSet) {
  if (!spec.startsWith('.')) return null;
  const parts = (dirname(fromFile) ? dirname(fromFile).split('/') : []);
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  const base = parts.join('/');
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts'];
  for (const e of exts) if (pathSet.has(base + e)) return base + e;
  const noJs = base.replace(/\.[cm]?js$/, '');
  for (const e of exts) if (pathSet.has(noJs + e)) return noJs + e;
  for (const e of exts.slice(1)) if (pathSet.has(base + '/index' + e)) return base + '/index' + e;
  return null;
}

/**
 * Analyse a set of files.
 * @param {Array<{path:string, content:string, mtime?:number}>} input
 * @param {{ minConfidence?:number, now?:number, source?:string, maxMatchOrphans?:number }} opts
 */
export function analyze(input, opts = {}) {
  const now = opts.now ?? Date.now();
  const minConfidence = opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const files = [];
  const templates = [];
  const configs = [];
  let skipped = 0;

  for (const f of input) {
    const path = posix(f.path);
    const cls = classifyPath(path);
    if (!cls.kind || typeof f.content !== 'string' || f.content.length > MAX_FILE_BYTES) { skipped++; continue; }
    if (cls.kind === 'template') { templates.push({ path, content: f.content }); continue; }
    if (cls.kind === 'config') { configs.push({ path, content: f.content }); continue; }
    if (looksMinifiedOrGenerated(f.content, cls.lang)) { skipped++; continue; }
    const content = f.content.replace(/\r\n?/g, '\n');
    const { code, strings } = stripSource(content, cls.lang);
    const ix = lineIndex(code);
    files.push({ path, lang: cls.lang, content, code, strings, mtime: f.mtime ?? null, lines: content.split('\n'), lineStarts: ix.starts, lineOf: ix.lineOf, isTest: isTestFile(path, cls.lang) });
  }
  const pathSet = new Set(files.map((f) => f.path));

  // ---- project shape ---------------------------------------------------------
  const packages = [];
  for (const c of configs) {
    if (basename(c.path) !== 'package.json') continue;
    try {
      const pkg = JSON.parse(c.content);
      const dir = dirname(c.path);
      const entryStrings = collectStrings([pkg.main, pkg.module, pkg.browser, pkg.exports, pkg.types && null, pkg.source, pkg.svelte, pkg.unpkg, pkg.jsdelivr]);
      const binStrings = collectStrings(pkg.bin);
      const library = !pkg.private && entryStrings.length > 0;
      const entries = new Set();
      for (const s of entryStrings) { const r = resolveEntry(dir, s, pathSet); if (r) entries.add(r); }
      if (library && !entries.size) for (const guess of ['src/index', 'index', 'lib/index']) { const r = resolveEntry(dir, guess, pathSet); if (r) { entries.add(r); break; } }
      const bins = new Set();
      for (const s of binStrings) { const r = resolveEntry(dir, s, pathSet); if (r) bins.add(r); }
      // scripts: "node scripts/foo.js" etc.
      for (const s of collectStrings(pkg.scripts)) for (const m of s.matchAll(/([\w./-]+\.[cm]?[jt]s)\b/g)) { const r = resolveEntry(dir, m[1], pathSet); if (r) bins.add(r); }
      packages.push({ dir, library, entries, bins, name: pkg.name });
    } catch { /* malformed package.json: ignore */ }
  }
  const hasFile = (re) => [...configs, ...files].some((f) => re.test(f.path));
  // A Python *library* (whose public functions outsiders may import): setup.py /
  // setup.cfg, or a pyproject.toml that declares a build backend.
  const isPyLib = hasFile(/^(setup\.py|setup\.cfg)$/) ||
    configs.some((c) => c.path === 'pyproject.toml' && /^\s*\[build-system\]/m.test(c.content));
  const isGem = hasFile(/\.gemspec$/);
  const goModule = configs.some((c) => /(^|\/)go\.mod$/.test(c.path)) || files.some((f) => /(^|\/)go\.mod$/.test(f.path));

  // ---- definitions -----------------------------------------------------------
  const allDefs = [];
  const excludedByFile = new Map();
  const importBasenames = new Set();
  const reexportsByFile = new Map();
  for (const f of files) {
    let res;
    try { res = extractDefs(f); } catch { res = { defs: [], excluded: [], imports: [], reexports: [] }; }
    f.defs = res.defs;
    f.pkg = res.pkg;
    excludedByFile.set(f.path, new Set(res.excluded));
    reexportsByFile.set(f.path, res.reexports || []);
    for (const spec of res.imports || []) {
      const segs = spec.replace(/[?#].*$/, '').split('/').filter(Boolean);
      let last = (segs[segs.length - 1] || '').replace(/\.[cm]?[jt]sx?$|\.vue$|\.svelte$/, '');
      if (last === 'index' && segs.length > 1) last = segs[segs.length - 2];
      if (last) importBasenames.add(last);
    }
    allDefs.push(...res.defs);
  }
  const defNames = new Set(allDefs.map((d) => d.name));
  // Classes defined in this codebase. A parent class from *outside* (stdlib,
  // a framework) may call hook methods we can't see.
  const localClasses = new Set();
  for (const f of files) for (const m of f.code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) localClasses.add(m[1]);
  const externalBase = (d) => {
    const bases = d.lang === 'py' ? (d.bases || []) : d.lang === 'rb' && d.superclass ? [d.superclass] : [];
    return bases.map((b) => b.split(/[.:]/).pop().replace(/\[.*$/, '')).find((b) => b && (!localClasses.has(b) || b === d.className)) || null;
  };
  const setterBases = new Set([...defNames].filter((n) => n.endsWith('=')).map((n) => n.slice(0, -1)));

  // Public API: package entries plus everything they re-export.
  const publicFiles = new Set();
  const entryFiles = new Set();
  for (const p of packages) {
    for (const b of p.bins) entryFiles.add(b);
    if (!p.library) continue;
    const queue = [...p.entries];
    while (queue.length) {
      const fp = queue.shift();
      if (publicFiles.has(fp)) continue;
      publicFiles.add(fp);
      for (const spec of reexportsByFile.get(fp) || []) { const r = resolveRelative(fp, spec, pathSet); if (r) queue.push(r); }
    }
  }

  // ---- references --------------------------------------------------------------
  const refIndex = new Map(); // name -> [{ fi, off, line }]
  const dynamic = { js: false, py: false, rb: false, go: false };
  files.forEach((f, fi) => {
    const re = idTokenizer(f.lang);
    const excl = excludedByFile.get(f.path);
    let m;
    while ((m = re.exec(f.code))) {
      let name = m[0];
      if (f.lang === 'rb' && setterBases.has(name)) {
        const after = f.code.slice(m.index + name.length, m.index + name.length + 4);
        if (/^\s*=(?![=~>])/.test(after) && f.code[m.index - 1] === '.') name = name + '=';
      }
      if (!defNames.has(name) || excl.has(m.index)) continue;
      if (!refIndex.has(name)) refIndex.set(name, []);
      refIndex.get(name).push({ fi, off: m.index, line: 0 });
    }
    if (f.lang === 'js' && /[\w$\])]\s*\[\s*[A-Za-z_$][\w$]*\s*\]\s*\(/.test(f.code)) dynamic.js = true;
    if (f.lang === 'py' && /\bgetattr\s*\(\s*[^,]+,\s*[^'"\s)]/.test(f.code)) dynamic.py = true;
    if (f.lang === 'rb' && /\b(send|public_send|__send__|method|define_method|instance_method)\s*\(?\s*[^:\s'"]/.test(f.code)) dynamic.rb = true;
    if (f.lang === 'go' && /\bMethodByName\s*\(/.test(f.code)) dynamic.go = true;
  });
  for (const list of refIndex.values()) for (const r of list) r.line = files[r.fi].lineOf(r.off);

  // String / template / config mentions.
  // Names built at runtime: `voice_${x}`, 'handle_' + x, f"do_{x}", "visit_#{x}".
  const dynamicPrefixes = new Map(); // prefix -> path:line
  const prefixRes = [/([A-Za-z_$][\w$]{2,})\$\{/g, /['"`]([A-Za-z_$][\w$]{2,})['"`]\s*\+/g, /\bf['"]([A-Za-z_]\w{2,})\{/g, /([A-Za-z_]\w{2,})#\{/g];
  for (const f of files) {
    for (const re of prefixRes) {
      for (const m of f.content.matchAll(re)) {
        if (!dynamicPrefixes.has(m[1])) dynamicPrefixes.set(m[1], `${f.path}:${f.content.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  const prefixOf = (name) => {
    for (const [p, where] of dynamicPrefixes) if (name.length > p.length && name.startsWith(p)) return { p, where };
    return null;
  };
  const stringMention = new Map(); // name -> path
  const exactString = new Set();
  const entryPointNames = new Set();
  const wordRe = /[A-Za-z_$][\w$]*[?!]?/g;
  const entryRe = /[\w.]+:([A-Za-z_]\w*)/g;
  for (const f of files) {
    for (const s of f.strings) {
      const t = s.text.trim();
      if (defNames.has(t)) exactString.add(t);
      if (t.length > 2000) continue;
      for (const w of t.match(wordRe) || []) {
        if (!defNames.has(w)) continue;
        if (!stringMention.has(w)) stringMention.set(w, []);
        const list = stringMention.get(w);
        if (list.length < 20) list.push({ path: f.path, line: s.line });
      }
      for (const m of t.matchAll(entryRe)) if (defNames.has(m[1])) entryPointNames.add(m[1]);
    }
  }
  const templateMention = new Map();
  for (const t of templates) for (const w of t.content.match(wordRe) || []) if (defNames.has(w) && !templateMention.has(w)) templateMention.set(w, t.path);
  const configMention = new Map();
  for (const c of configs) {
    for (const w of c.content.match(wordRe) || []) if (defNames.has(w) && !configMention.has(w)) configMention.set(w, c.path);
    for (const m of c.content.matchAll(entryRe)) if (defNames.has(m[1])) entryPointNames.add(m[1]);
  }

  // ---- judge every definition ----------------------------------------------------
  const fileByPath = new Map(files.map((f) => [f.path, f]));
  const orphans = [];
  const shy = [];
  const byNameCount = new Map();
  for (const d of allDefs) byNameCount.set(d.name, (byNameCount.get(d.name) || 0) + 1);

  for (const d of allDefs) {
    const f = fileByPath.get(d.file);
    if (aliveReason(d, f)) continue;
    // References outside its own body.
    const refs = (refIndex.get(d.name) || []).filter((r) => {
      const rf = files[r.fi];
      if (rf.path !== d.file) return true;
      if (r.off === d.nameOffset) return false;
      return !(r.off >= d.bodyStart && r.off < d.bodyEnd);
    });
    // A definition with the same name elsewhere means `x.name()` could be either.
    if (refs.length) continue;
    if (exactString.has(d.name) || templateMention.has(d.name) || entryPointNames.has(d.name)) continue;
    if (d.isDefaultExport && d.lang === 'js') {
      const base = basename(d.file).replace(/\.[^.]+$/, '');
      const key = base === 'index' ? basename(dirname(d.file)) : base;
      if (importBasenames.has(key)) continue;
    }

    // ---- it's an orphan; how sure are we? ----
    let confidence = 95;
    const risks = [];
    const reasons = [];
    const add = (delta, text) => { confidence += delta; risks.push({ delta, text }); };
    if (d.exported && d.lang === 'js') reasons.push('Exported, but nothing ever imports it');
    else if (d.isPrivate) reasons.push(d.kind === 'method' && d.lang !== 'go' ? 'Private, and nothing in its class calls it' : 'Private, and nothing calls it');
    else reasons.push('Never referenced anywhere in the scanned code');
    if (d.recursive) reasons.push('Only ever calls itself');

    const libPublic = isLibraryPublic(d, f);
    if (libPublic) add(-50, libPublic);
    else if (d.exported && d.lang === 'js') add(d.isDefaultExport ? -20 : -15, d.isDefaultExport ? 'Default export: a bundler or tool might load the file directly' : 'Something outside the scanned files could still import it');
    if (d.kind === 'method' && !d.isPrivate) add(-15, 'Methods can be called by name or through a parent type');
    const ext = d.kind === 'method' && !/^__/.test(d.name) && !(d.lang === 'rb' && d.isPrivate) ? externalBase(d) : null;
    if (ext) add(-50, `Its class extends ${ext} from outside this codebase, which may call it as a hook`);
    else if (d.inherits && !(d.isPrivate && d.lang === 'js')) add(-15, 'Its class inherits from another, so it may be overriding a parent method');
    const dyn = prefixOf(d.name);
    if (dyn) add(-50, `Its name starts with "${dyn.p}", and ${dyn.where} builds names like "${dyn.p}…" at runtime`);
    // Ignore its own docstring / messages that mention itself.
    const mention = (stringMention.get(d.name) || []).find((m) => !(m.path === d.file && m.line >= d.line && m.line <= d.endLine));
    if (mention) add(-40, `Its name appears in a string (${mention.path}:${mention.line}), which could be a dynamic call`);
    if (configMention.has(d.name)) add(-50, `Mentioned in ${configMention.get(d.name)}`);
    if (dynamic[d.lang] && (d.kind === 'method' || d.exported)) add(-10, 'This codebase calls some functions dynamically');
    if (f.isTest) add(-10, 'Lives in a test file');
    if (d.name.endsWith('=')) add(-40, 'Setter: called as `obj.x = value`');
    if (d.name.length <= 2) add(-10, 'Very short name, easy to miss');
    if ((byNameCount.get(d.name) || 0) > 1) add(-5, 'Another function shares its name');
    confidence = Math.max(5, Math.min(99, confidence));

    const o = {
      id: `${d.file}:${d.line}:${d.name}`,
      name: d.name,
      kind: d.kind,
      className: d.className || null,
      lang: d.lang,
      file: d.file,
      line: d.line,
      endLine: d.endLine,
      length: d.length,
      params: d.params,
      paramsText: d.paramsText,
      doc: d.doc || '',
      calls: d.calls,
      recursive: d.recursive,
      exported: !!d.exported,
      isPrivate: !!d.isPrivate,
      confidence,
      status: STATUS(confidence),
      reasons,
      risks,
      snippet: f.lines.slice(d.line - 1, Math.min(d.endLine, d.line + 59)).join('\n'),
      snippetTruncated: d.endLine - d.line + 1 > 60,
      lastModified: f.mtime,
      ageSource: f.mtime ? 'mtime' : null,
      bodyStart: d.bodyStart,
      bodyEnd: d.bodyEnd,
    };
    (confidence >= minConfidence ? orphans : shy).push(o);
  }

  // ---- matchmaking ----------------------------------------------------------------
  const sortFn = (a, b) => b.confidence - a.confidence || b.length - a.length || a.file.localeCompare(b.file) || a.line - b.line;
  orphans.sort(sortFn);
  shy.sort(sortFn);
  const apiNames = new Set();
  const apiRe = /\.\s*([A-Za-z_]\w{2,})\s*\(|\b(strftime|strptime|sprintf|Sprintf|Printf|parseInt|parseFloat|encodeURIComponent|decodeURIComponent|isoformat|fromisoformat|gsub|sub|scan|split|join|replace)\s*\(/g;
  for (const o of orphans) {
    const f = fileByPath.get(o.file);
    for (const m of f.code.slice(o.bodyStart, o.bodyEnd).matchAll(apiRe)) apiNames.add(m[1] || m[2]);
  }
  const apiIndex = new Map();
  if (apiNames.size) {
    files.forEach((f, fi) => {
      for (const m of f.code.matchAll(/[A-Za-z_$][\w$]*/g)) {
        if (!apiNames.has(m[0])) continue;
        if (!apiIndex.has(m[0])) apiIndex.set(m[0], []);
        const list = apiIndex.get(m[0]);
        const line = f.lineOf(m.index);
        if (!list.length || list[list.length - 1].fi !== fi || list[list.length - 1].line !== line) list.push({ fi, line });
      }
    });
  }
  const shyMatched = shy.slice(0, 50);
  matchmake([...orphans, ...shyMatched], files, refIndex, allDefs, { apiIndex, maxOrphans: opts.maxMatchOrphans ?? 400 });
  for (const o of shy.slice(50)) o.matches = [];
  for (const o of [...orphans, ...shy]) { delete o.bodyStart; delete o.bodyEnd; }

  // ---- stats ------------------------------------------------------------------------
  const byLanguage = {};
  for (const f of files) {
    byLanguage[f.lang] = byLanguage[f.lang] || { files: 0, definitions: 0, orphans: 0, lonelyLines: 0 };
    byLanguage[f.lang].files++;
    byLanguage[f.lang].definitions += f.defs.length;
  }
  for (const o of orphans) { byLanguage[o.lang].orphans++; byLanguage[o.lang].lonelyLines += o.length; }

  return {
    tool: 'unused-and-looking',
    version: VERSION,
    generatedAt: new Date(now).toISOString(),
    source: opts.source || null,
    minConfidence,
    stats: {
      filesScanned: files.length,
      templatesScanned: templates.length,
      configsScanned: configs.length,
      skipped,
      definitions: allDefs.length,
      orphans: orphans.length,
      shy: shy.length,
      lonelyLines: orphans.reduce((s, o) => s + o.length, 0),
      byLanguage,
    },
    project: { libraryPackages: packages.filter((p) => p.library).map((p) => p.name || p.dir || '.'), isPyLib, isGem, goModule },
    orphans,
    shy,
  };

  // ---- helpers that need the closure ----------------------------------------------
  function aliveReason(d, f) {
    const n = d.name;
    const path = d.file;
    if (d.lang === 'js') {
      if (d.kind === 'method' && JS_LIFECYCLE.has(n)) return 'lifecycle';
      if (d.decorators && d.decorators.length) return 'decorated';
      if ((d.exported || d.isDefaultExport) && (isRouteFile(path) || isConfigScript(path) || isStoryFile(path))) return 'framework export';
      if (d.exported && JS_FRAMEWORK_EXPORTS.has(n)) return 'framework export';
      if (d.exported && (publicFiles.has(path) || entryFiles.has(path))) return 'public API';
      if (f.isTest && /^(before|after)(Each|All)?$|^(setup|teardown)$/i.test(n)) return 'test hook';
      if (d.accessor) return 'accessor';
    }
    if (d.lang === 'py') {
      if (/^__.*__$/.test(n)) return 'dunder';
      const decs = (d.decorators || []).filter((x) => !PY_NEUTRAL_DECORATORS.test(x));
      if (decs.length) return 'decorated';
      if ((d.decorators || []).some((x) => x === 'abstractmethod' || /\.abstractmethod$/.test(x) || x === 'overload' || /\.overload$/.test(x))) return 'abstract';
      if (f.isTest && (/^test/.test(n) || /^Test/.test(d.className || '') || /^(setUp|tearDown|setup|teardown)/.test(n))) return 'test';
      if (basename(path) === 'conftest.py') return 'pytest hook';
      if (/^pytest_/.test(n)) return 'pytest hook';
      if (d.kind === 'method' && d.inherits && (PY_FRAMEWORK_METHODS.has(n) || PY_FRAMEWORK_PATTERNS.test(n))) return 'framework method';
      if (d.kind === 'method' && /^(visit_|depart_|do_|test_)/.test(n)) return 'dispatch by name';
    }
    if (d.lang === 'go') {
      if ((n === 'main' && d.pkg === 'main') || n === 'init') return 'entrypoint';
      if (n === 'main' && d.kind === 'function') return 'entrypoint';
      if (f.isTest && /^(Test|Benchmark|Example|Fuzz)/.test(n)) return 'test';
      if (d.directives && d.directives.length) return 'directive';
      if (d.kind === 'method' && GO_INTERFACE_METHODS.has(n)) return 'interface method';
    }
    if (d.lang === 'rb') {
      if (RB_HOOKS.has(n)) return 'hook';
      if (d.kind === 'method' && /^to_[a-z_]+[?!]?$/.test(n)) return 'conversion protocol';
      if (f.isTest && (/^test_/.test(n) || /^(setup|teardown)$/.test(n))) return 'test';
      if (d.visibility === 'public' && d.kind === 'method') {
        if (/(^|\/)app\/(controllers|mailers|channels|jobs|graphql|mailboxes|views\/components|components)\//.test(path) || /Controller$|Mailer$|Channel$|Job$/.test(d.className || '')) return 'rails action';
        if (/^(Thor|Rake::TaskLib|Sinatra::Base|Grape::API|Roda|Hanami::Action)/.test(d.superclass || '')) return 'framework action';
      }
      if (/(^|\/)(db\/migrate|config)\//.test(path)) return 'framework file';
    }
    return null;
  }

  function isLibraryPublic(d, f) {
    if (d.isPrivate) return null;
    if (d.lang === 'go' && d.exported && d.pkg !== 'main' && !/(^|\/)internal\//.test(d.file) && !f.isTest && (d.kind === 'function' || /^[A-Z]/.test(d.className || ''))) {
      return 'Exported Go identifier in a library package: other modules may import it';
    }
    if (d.lang === 'py' && isPyLib && !f.isTest && !/(^|\/)(scripts?|examples?|docs?|bin|tools|benchmarks?)\//.test(d.file) && !/^_/.test(d.className || '')) {
      return 'Public function in a Python package: users of the library may call it';
    }
    if (d.lang === 'rb' && isGem && /(^|\/)lib\//.test(d.file) && d.visibility === 'public') {
      return 'Public method in a gem: users of the library may call it';
    }
    if (d.lang === 'js' && d.exported) {
      const pkg = packages.filter((p) => p.library && (!p.dir || d.file.startsWith(p.dir + '/'))).sort((a, b) => b.dir.length - a.dir.length)[0];
      if (pkg && publicFiles.size === 0) return 'Exported from a published package whose entry point we could not find';
    }
    return null;
  }
}

export { extname };
