// Dev-only: take README screenshots with headless Edge/Chrome while
// `npm start` is running. Usage: node scripts/shots.js [baseUrl]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://localhost:5186/';
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const browser = BROWSERS.find((b) => fs.existsSync(b));
if (!browser) { console.error('No Chrome/Edge found'); process.exit(1); }

const SHOTS = [
  ['docs/hero.png', '?demo&theme=dark&fn=formatLegacyDate&open=0', 1280, 860],
  ['docs/gallery-deck-light.png', '?demo&theme=light', 1280, 860],
  ['docs/gallery-stats.png', '?demo&theme=dark&view=stats', 1280, 1500],
  ['docs/gallery-mobile.png', '?demo&theme=light', 390, 844],
  ['docs/share-card.png', '?demo&card', 1200, 630],
  ['docs/og-image.png', 'og.html', 1200, 630],
];

const only = process.argv[3];
const PROFILE = path.join(ROOT, '.shots-profile').split(path.sep).join('/');
for (const [out, q, w, h] of SHOTS) {
  if (only && !out.includes(only)) continue;
  const file = path.join(ROOT, out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const profile = PROFILE + '-' + path.basename(out, '.png');
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
    '--virtual-time-budget=6000', `--screenshot=${file.split(path.sep).join("/")}`, BASE + q,
  ], { stdio: 'pipe' });
  console.log('saved', out, fs.existsSync(file) ? `${(fs.statSync(file).size / 1024).toFixed(0)} KB` : 'FAILED');
}
for (const d of fs.readdirSync(ROOT)) if (d.startsWith('.shots-profile')) try { fs.rmSync(path.join(ROOT, d), { recursive: true, force: true }); } catch { /* Edge may still hold a lock */ }
