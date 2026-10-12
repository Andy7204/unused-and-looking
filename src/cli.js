#!/usr/bin/env node
// npx unused-and-looking [dir] — find lonely functions. Read-only: it never
// deletes or edits code, it only prints and exports lists.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, VERSION, DEFAULT_MIN_CONFIDENCE } from './core/analyze.js';
import { buildProfile, fmtNum, loneliest } from './core/profile.js';
import { breakupMarkdown, badgeMarkdown, statsSentence } from './core/report.js';
import { readProject, readDemo, addGitAges } from './node/scan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(HERE, '..', 'demo');

const HELP = `
  Unused & Looking ${VERSION}
  Your codebase is full of lonely functions. Help them find love (or delete them).

  Usage
    npx unused-and-looking [dir] [options]

  Options
    --swipe               Open the swipe UI in your browser with these results
    --json                Print the full report as JSON
    --markdown, --md      Print every orphan as a Breakup List (Markdown)
    --min-confidence <n>  Only show orphans at least this sure (default ${DEFAULT_MIN_CONFIDENCE})
    --limit <n>           How many profiles to print (default 15, 0 = all)
    --max <n>             Exit with code 1 if more than n orphans (for CI)
    --no-git              Don't use git (ages fall back to file modified time)
    --demo                Analyse the bundled demo repo
    --port <n>            Port for --swipe (default 5186)
    --no-open             With --swipe, don't open a browser
    --no-color            Disable colours (NO_COLOR is respected too)
    -v, --version         Print the version
    -h, --help            Show this help

  Nothing is ever deleted or edited. It only prints and exports lists.
`;

export function parseArgs(argv) {
  const o = { dir: '.', minConfidence: DEFAULT_MIN_CONFIDENCE, limit: 15, git: true, open: true, port: 5186, color: true };
  const num = (v, flag) => {
    const n = Number(v);
    if (v === undefined || !Number.isFinite(n) || n < 0) throw new Error(`${flag} needs a number, e.g. ${flag} 10`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const val = () => (inline !== undefined ? inline : argv[++i]);
    switch (flag) {
      case '-h': case '--help': o.help = true; break;
      case '-v': case '--version': o.version = true; break;
      case '--json': o.json = true; break;
      case '--markdown': case '--md': o.markdown = true; break;
      case '--swipe': o.swipe = true; break;
      case '--demo': o.demo = true; break;
      case '--no-git': o.git = false; break;
      case '--no-open': o.open = false; break;
      case '--no-color': o.color = false; break;
      case '--min-confidence': o.minConfidence = num(val(), flag); break;
      case '--limit': o.limit = num(val(), flag); break;
      case '--max': o.max = num(val(), flag); break;
      case '--port': o.port = num(val(), flag); break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option ${a}. Run with --help to see the options.`);
        o.dir = a;
    }
  }
  return o;
}

function colors(enabled) {
  const wrap = (open, close) => (s) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
  return {
    bold: wrap(1, 22), dim: wrap(2, 22), pink: wrap('38;5;205', 39), red: wrap(31, 39), green: wrap(32, 39),
    yellow: wrap(33, 39), cyan: wrap(36, 39), magenta: wrap(35, 39), gray: wrap(90, 39),
  };
}

export function renderPretty(report, { limit = 15, color = false, label = '.', now = Date.now() } = {}) {
  const c = colors(color);
  const out = [];
  const s = report.stats;
  out.push('');
  out.push(`${c.pink('♥')} ${c.bold('Unused & Looking')} ${c.dim(`· scanned ${fmtNum(s.filesScanned)} files in ${label}`)}`);
  out.push('');
  if (!report.orphans.length) {
    out.push(`  ${c.green('💍 Your codebase is happily married.')} No lonely functions at ≥${report.minConfidence}% confidence.`);
    if (s.shy) out.push(c.dim(`  (${s.shy} shy maybe-orphans below the threshold: try --min-confidence 0)`));
    out.push('');
    return out.join('\n');
  }
  const shown = limit === 0 ? report.orphans : report.orphans.slice(0, limit);
  shown.forEach((o, i) => {
    const p = buildProfile(o, now);
    const age = p.days != null ? `${fmtNum(p.days)} days single` : 'age unknown';
    const conf = o.confidence >= 85 ? c.green : o.confidence >= 65 ? c.yellow : c.gray;
    const egg = p.easterEgg ? c.magenta(` ✨ ${p.eggTitle}`) : '';
    out.push(`${c.dim(String(i + 1).padStart(3) + '.')} ${c.bold(o.name + '()')}  ${c.dim('·')} ${c.pink(age)}  ${c.dim('·')} ${conf(o.confidence + '% sure')}${egg}`);
    out.push(`     ${c.cyan(`${o.file}:${o.line}`)} ${c.dim(`· ${o.params.length} param${o.params.length === 1 ? '' : 's'} · ${o.length} line${o.length === 1 ? '' : 's'}`)}`);
    out.push(`     ${c.dim('"')}${p.bio}${c.dim('"')}`);
    if (p.redFlags.length) out.push(`     ${c.red('🚩 ' + p.redFlags.slice(0, 3).join(' · '))}`);
    const m = (o.matches || [])[0];
    if (m) out.push(`     ${c.magenta('💘')} ${c.dim('Best match:')} ${m.file}:${m.line} ${c.dim(`(${m.score}%)`)} ${c.dim('— ' + m.reason)}`);
    out.push('');
  });
  if (shown.length < report.orphans.length) out.push(c.dim(`  …and ${report.orphans.length - shown.length} more. Use --limit 0 to see everyone, or --swipe to swipe through them.`), '');
  const lonely = loneliest(report.orphans, now);
  out.push(`  ${c.bold(statsSentence(report))}`);
  if (lonely) {
    const p = buildProfile(lonely, now);
    out.push(`  ${c.dim('Loneliest:')} ${lonely.name}()${p.days != null ? `, ${fmtNum(p.days)} days single` : ''}`);
  }
  if (s.shy) out.push(c.dim(`  ${s.shy} more are "maybe seeing someone" (below ${report.minConfidence}% confidence).`));
  out.push('');
  out.push(`  ${c.dim('README badge:')} ${badgeMarkdown(s.orphans)}`);
  out.push(`  ${c.dim('Swipe through them:')} npx unused-and-looking --swipe   ${c.dim('· Breakup List:')} --markdown > breakup.md`);
  out.push('');
  return out.join('\n');
}

async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { process.stderr.write(`✖ ${e.message}\n`); return 2; }
  if (opts.help) { process.stdout.write(HELP); return 0; }
  if (opts.version) { process.stdout.write(VERSION + '\n'); return 0; }
  const color = opts.color && !process.env.NO_COLOR && process.stdout.isTTY && !opts.json && !opts.markdown;
  const now = Date.now();

  let files, label, root;
  if (opts.demo) {
    files = readDemo(DEMO_DIR, now);
    label = 'the demo repo (lovelorn-shop)';
  } else {
    root = path.resolve(opts.dir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      process.stderr.write(`✖ "${opts.dir}" is not a folder. Pass a project directory, e.g. npx unused-and-looking ./my-app (or try --demo).\n`);
      return 2;
    }
    ({ files } = readProject(root, { useGit: opts.git }));
    label = opts.dir === '.' ? path.basename(root) || root : opts.dir;
  }
  if (!files.length) {
    process.stderr.write(`✖ No JavaScript/TypeScript, Python, Go or Ruby files found in ${label}. Point it at a project folder, or try --demo.\n`);
    return 2;
  }
  if (!opts.json && !opts.markdown && process.stderr.isTTY) process.stderr.write(`  Reading ${fmtNum(files.length)} files…\r`);
  const report = analyze(files, { minConfidence: opts.minConfidence, now, source: opts.demo ? 'demo' : label });
  if (root && opts.git) await addGitAges(root, [...report.orphans, ...report.shy]);
  if (opts.demo) for (const o of [...report.orphans, ...report.shy]) o.ageSource = 'demo';
  if (!opts.json && !opts.markdown && process.stderr.isTTY) process.stderr.write(' '.repeat(40) + '\r');

  if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else if (opts.markdown) process.stdout.write(breakupMarkdown(report.orphans, { now, sourceLabel: label }));
  else process.stdout.write(renderPretty(report, { limit: opts.limit, color, label, now }) + '\n');

  if (opts.swipe) {
    const { startServer, openBrowser } = await import('./node/server.js');
    report.source = label;
    const { url } = await startServer({ report, port: opts.port });
    const full = url + '?local=1';
    process.stderr.write(`\n  💘 Swipe UI running at ${full}  (Ctrl+C to stop)\n`);
    if (opts.open) openBrowser(full);
    return new Promise(() => {}); // keep serving until Ctrl+C
  }
  if (opts.max != null && report.orphans.length > opts.max) {
    process.stderr.write(`✖ ${report.orphans.length} lonely functions (max allowed: ${opts.max}).\n`);
    return 1;
  }
  return 0;
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    process.stderr.write(`✖ Something went wrong: ${err && err.message}\n  Please open an issue: https://github.com/Andy7204/unused-and-looking/issues\n`);
    process.exitCode = 1;
  });
}
