// Tiny static server for the web app. Serves web/, maps /core/* to src/core/*
// (the exact same analyser the CLI uses), and optionally a precomputed
// report at /api/report.json for `--swipe` mode. Binds to localhost only.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = path.resolve(HERE, '..', '..', 'web');
export const CORE_DIR = path.resolve(HERE, '..', 'core');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

function safeJoin(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

export function startServer({ report = null, port = 5186, host = '127.0.0.1' } = {}) {
  const server = http.createServer((req, res) => {
    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (urlPath === '/api/report.json') {
      if (!report) { res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"no report"}'); return; }
      res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' }).end(JSON.stringify(report));
      return;
    }
    let file;
    if (urlPath.startsWith('/core/')) file = safeJoin(CORE_DIR, urlPath.slice(6));
    else file = safeJoin(WEB_DIR, urlPath === '/' ? 'index.html' : urlPath.slice(1));
    if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file || !fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    const tryListen = (p, attemptsLeft) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 0) tryListen(p + 1, attemptsLeft - 1);
        else reject(err);
      });
      server.listen(p, host, () => resolve({ server, url: `http://localhost:${p}/` }));
    };
    tryListen(port, 10);
  });
}

export function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: process.platform === 'win32' });
    child.on('error', () => {});
    child.unref();
  } catch { /* the URL is printed anyway */ }
}
