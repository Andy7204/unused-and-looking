// Where the code comes from: the bundled demo, a public GitHub repo (tree API
// = 1 call, contents from raw.githubusercontent.com), a local folder picked
// in the browser, or a report served by the CLI (`--swipe`).

import { classifyPath } from '../core/files.js';
import { parseRepo } from '../core/repo.js';

export { parseRepo };

export const MAX_GITHUB_FILES = 500;
const CONFIG_KEEP = /(^|\/)(package\.json|pyproject\.toml|setup\.cfg|go\.mod|Procfile)$/;

export class FriendlyError extends Error {
  constructor(title, text, extra = {}) { super(text); this.title = title; this.extra = extra; }
}

function headers(token) {
  const h = { Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function resetTime(res) {
  const r = Number(res.headers.get('x-ratelimit-reset'));
  if (!r) return 'in a little while';
  const d = new Date(r * 1000);
  const mins = Math.max(1, Math.round((d - Date.now()) / 60000));
  return `at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (about ${mins} min)`;
}

async function ghFetch(url, token, signal) {
  let res;
  try { res = await fetch(url, { headers: headers(token), signal }); } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new FriendlyError('Network trouble', "We couldn't reach GitHub. Check your connection (or an ad blocker) and try again.");
  }
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new FriendlyError('GitHub needs a breather', `You've used up GitHub's 60 free API calls for this hour. They reset ${resetTime(res)}. Add a token under "Rate-limited?" on the home page, or run the CLI locally.`, { rateLimited: true });
  }
  return res;
}

/** Fetch & read a public repo. onProgress(done, total, label). */
export async function loadGithub(spec, { token, signal, onProgress = () => {} } = {}) {
  onProgress(0, 1, 'Asking GitHub for the file list…');
  const res = await ghFetch(`https://api.github.com/repos/${spec.owner}/${spec.repo}/git/trees/${encodeURIComponent(spec.ref)}?recursive=1`, token, signal);
  if (res.status === 404) throw new FriendlyError('Repo not found', `We couldn't find ${spec.full}${spec.ref !== 'HEAD' ? ` at "${spec.ref}"` : ''}. Check the spelling. Private repos need the CLI: clone it and run npx unused-and-looking.`);
  if (res.status === 409) throw new FriendlyError('Nobody home', `${spec.full} is an empty repository. There's no code to be lonely yet.`);
  if (res.status === 401) throw new FriendlyError('Token rejected', 'GitHub rejected that token. Remove it or paste a fresh one.');
  if (!res.ok) throw new FriendlyError('GitHub said no', `GitHub answered with HTTP ${res.status}. Try again in a minute, or use the CLI.`);
  const tree = await res.json();
  const blobs = (tree.tree || []).filter((t) => t.type === 'blob');
  const wanted = [];
  let sources = 0;
  for (const b of blobs) {
    const cls = classifyPath(b.path);
    if (!cls.kind) continue;
    if (cls.kind === 'config' && !CONFIG_KEEP.test(b.path)) continue;
    if (b.size > 500000) continue;
    if (cls.kind === 'source') sources++;
    wanted.push(b.path);
  }
  if (tree.truncated || sources > MAX_GITHUB_FILES) {
    throw new FriendlyError('Too many singles for one browser', `${spec.full} has ${tree.truncated ? 'more files than GitHub will list in one go' : `${sources.toLocaleString()} source files`}. The browser version stops at ${MAX_GITHUB_FILES}. The CLI has no limit and runs locally:`, { tooBig: true, spec });
  }
  if (!sources) throw new FriendlyError('No functions here', `${spec.full} has no JavaScript/TypeScript, Python, Go or Ruby files for us to read.`);
  const files = [];
  let done = 0;
  const queue = wanted.slice();
  const base = `https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${spec.ref.split('/').map(encodeURIComponent).join('/')}/`;
  async function worker() {
    while (queue.length) {
      const path = queue.shift();
      try {
        const r = await fetch(base + path.split('/').map(encodeURIComponent).join('/'), { signal });
        if (r.ok) files.push({ path, content: await r.text() });
      } catch (e) { if (e.name === 'AbortError') throw e; }
      done++;
      onProgress(done, wanted.length, `Reading ${path}`);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  if (!files.length) throw new FriendlyError('Network trouble', "We got the file list but couldn't download any files from raw.githubusercontent.com. Check your connection and try again.");
  return files;
}

/** Last commit date touching a file (1 API call, cached per session). */
export async function fetchFileAge(spec, path, token) {
  const key = `ual:age:${spec.full}@${spec.ref}:${path}`;
  try { const c = sessionStorage.getItem(key); if (c) return Number(c) || null; } catch {}
  const sha = spec.ref === 'HEAD' ? '' : `&sha=${encodeURIComponent(spec.ref)}`;
  const res = await ghFetch(`https://api.github.com/repos/${spec.owner}/${spec.repo}/commits?path=${encodeURIComponent(path)}&per_page=1${sha}`, token);
  if (!res.ok) return null;
  const list = await res.json();
  const date = list[0] && (list[0].commit.committer || list[0].commit.author).date;
  const ts = date ? Date.parse(date) : null;
  try { sessionStorage.setItem(key, String(ts || 0)); } catch {}
  return ts;
}

export async function loadDemo(now = Date.now()) {
  const res = await fetch('demo-repo.json');
  if (!res.ok) throw new FriendlyError('Demo missing', "The demo repo didn't load. Refresh the page and try again.");
  const data = await res.json();
  return data.files.map((f) => ({ path: f.path, content: f.content, mtime: f.ageDays != null ? now - f.ageDays * 86400000 : null }));
}

/** Files from <input webkitdirectory>. Strips the top folder name. */
export async function loadFolder(fileList, { onProgress = () => {} } = {}) {
  const all = Array.from(fileList);
  const picked = [];
  for (const f of all) {
    const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
    const cls = classifyPath(rel);
    if (!cls.kind || f.size > 750000) continue;
    picked.push({ f, rel });
  }
  if (!picked.length) throw new FriendlyError('No functions here', "That folder has no JavaScript/TypeScript, Python, Go or Ruby files we can read (node_modules, vendor and build folders are skipped).");
  const out = [];
  let done = 0;
  for (const { f, rel } of picked) {
    out.push({ path: rel, content: await f.text(), mtime: f.lastModified || null });
    if (++done % 25 === 0 || done === picked.length) onProgress(done, picked.length, `Reading ${rel}`);
  }
  const label = (all[0] && all[0].webkitRelativePath.split('/')[0]) || 'local folder';
  return { files: out, label };
}

export async function loadLocalReport() {
  const res = await fetch('/api/report.json');
  if (!res.ok) throw new FriendlyError('CLI report missing', 'This page expects the CLI to be serving results. Run npx unused-and-looking --swipe again.');
  return res.json();
}
