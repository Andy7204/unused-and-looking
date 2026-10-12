// Node-only helpers: read a folder (respecting .gitignore when it's a git
// repo) and look up "last touched" ages with git blame. Strictly read-only.

import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { classifyPath, isSkippedDir, MAX_FILE_BYTES } from '../core/files.js';

const toPosix = (p) => p.split(path.sep).join('/');

function git(args, cwd, opts = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024, windowsHide: true, ...opts });
}

export function gitRoot(dir) {
  try { return git(['rev-parse', '--show-toplevel'], dir).trim(); } catch { return null; }
}

function listWithGit(dir) {
  try {
    const out = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], dir);
    return out.split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/'));
  } catch { return null; }
}

function listWithWalk(dir) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    let entries;
    try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!isSkippedDir(e.name) && !e.name.startsWith('.')) stack.push(r); }
      else if (e.isFile()) out.push(r);
    }
  }
  return out;
}

/**
 * Read every analysable file under `dir`.
 * @returns {{ files: Array<{path, content, mtime}>, usedGit: boolean }}
 */
export function readProject(dir, { useGit = true } = {}) {
  const abs = path.resolve(dir);
  let list = useGit && gitRoot(abs) ? listWithGit(abs) : null;
  const usedGit = !!list;
  if (!list) list = listWithWalk(abs);
  const files = [];
  for (const rel of list) {
    const cls = classifyPath(rel);
    if (!cls.kind) continue;
    const full = path.join(abs, ...rel.split('/'));
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
    let content;
    try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
    if (content.includes('\u0000')) continue; // binary
    files.push({ path: toPosix(rel), content, mtime: st.mtimeMs });
  }
  return { files, usedGit };
}

/** Parse `git blame --porcelain` into per-line commit times (index = line - 1). */
export function parseBlame(text) {
  const times = new Map();
  const lineSha = [];
  let sha = null, finalLine = 0;
  for (const l of text.split('\n')) {
    const h = /^([0-9a-f]{40}) \d+ (\d+)/.exec(l);
    if (h) { sha = h[1]; finalLine = +h[2]; continue; }
    if (l.startsWith('committer-time ')) { times.set(sha, +l.slice(15) * 1000); continue; }
    if (l.startsWith('\t') && sha) lineSha[finalLine - 1] = sha;
  }
  return lineSha.map((s) => times.get(s) ?? null);
}

function blameFile(cwd, rel) {
  return new Promise((resolve) => {
    execFile('git', ['blame', '--porcelain', '--', rel], { cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : parseBlame(stdout));
    });
  });
}

/**
 * Set `lastModified` on each orphan to the newest commit touching its lines.
 * Falls back to the file mtime (already set by analyze) when git is unavailable.
 */
export async function addGitAges(dir, orphans, { maxFiles = 250, concurrency = 8 } = {}) {
  const abs = path.resolve(dir);
  if (!gitRoot(abs)) return false;
  const byFile = new Map();
  for (const o of orphans) { if (!byFile.has(o.file)) byFile.set(o.file, []); byFile.get(o.file).push(o); }
  const queue = [...byFile.keys()].slice(0, maxFiles);
  let any = false;
  async function worker() {
    while (queue.length) {
      const rel = queue.shift();
      const times = await blameFile(abs, rel);
      if (!times) continue;
      for (const o of byFile.get(rel)) {
        let newest = null;
        for (let i = o.line - 1; i < o.endLine && i < times.length; i++) if (times[i] && (!newest || times[i] > newest)) newest = times[i];
        if (newest) { o.lastModified = newest; o.ageSource = 'git'; any = true; }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return any;
}

/** The bundled demo, with fake ages so it has a story to tell. */
export function readDemo(demoDir, now = Date.now()) {
  const root = path.join(demoDir, 'lovelorn-shop');
  const ages = JSON.parse(fs.readFileSync(path.join(demoDir, 'ages.json'), 'utf8'));
  const { files } = readProject(root, { useGit: false });
  for (const f of files) f.mtime = ages[f.path] != null ? now - ages[f.path] * 86400000 : now - 3 * 86400000;
  return files;
}
