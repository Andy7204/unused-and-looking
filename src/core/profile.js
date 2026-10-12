// Dating-profile generation: interests, bio, red/green flags, easter eggs.
// Deterministic: the same function always gets the same profile.

import { nameTokens } from './match.js';

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const INTERESTS = [
  { key: 'dates', label: 'dates', emoji: '📅', re: /\b(date|time|day|month|year|week|hour|minute|timestamp|moment|dayjs|luxon|strftime|strptime|isoformat|toISOString|getMonth|getFullYear|getDate|datetime|timedelta|Duration|time\.)/i, want: 'parses dates' },
  { key: 'strings', label: 'strings', emoji: '🧵', re: /\b(str|string|split|join|replace|trim|strip|lower|upper|toLowerCase|toUpperCase|padStart|padEnd|slug|format|sprintf|Sprintf|substr|substring|slice|capitalize|gsub|camel|snake|kebab|text|template)/i, want: 'needs a string formatted' },
  { key: 'arrays', label: 'arrays', emoji: '📚', re: /\b(map|filter|reduce|forEach|push|append|sort|sorted|list|array|slice|concat|flat|zip|chunk|uniq|dedupe|each_with|collect|select|items|keys|values)\b/i, want: 'has a list to sort out' },
  { key: 'auth', label: 'auth', emoji: '🔐', re: /\b(auth|token|login|logout|password|passwd|session|jwt|oauth|user|permission|role|credential|signin|signup|cookie|csrf)/i, want: 'needs to be let in' },
  { key: 'math', label: 'math', emoji: '🧮', re: /\b(Math\.|round|floor|ceil|sqrt|sum|avg|average|mean|median|abs|pow|min|max|clamp|percent|ratio|random|rand|lerp|math\.)/i, want: "can't do the math alone" },
  { key: 'dom', label: 'DOM', emoji: '🖼️', re: /\b(document|querySelector|getElementById|element|addEventListener|innerHTML|textContent|classList|window|style|scroll|click|dom|node|createElement|appendChild)/i, want: 'wants to be seen' },
  { key: 'network', label: 'network', emoji: '📡', re: /\b(fetch|http|https|axios|request|response|url|uri|api|endpoint|socket|websocket|net\/http|requests\.|urllib|Net::HTTP|webhook|graphql|ajax)/i, want: 'keeps calling' },
  { key: 'files', label: 'files', emoji: '📁', re: /\b(fs\.|readFile|writeFile|path\.|file|dir|folder|open\(|os\.path|pathlib|io\.|File\.|Dir\.|mkdir|unlink|stream|buffer|csv|upload)/i, want: 'has some files to share' },
  { key: 'json', label: 'JSON', emoji: '🧾', re: /\b(JSON|json|parse|stringify|serialize|deserialize|marshal|unmarshal|yaml|toml|payload|schema)/, want: 'speaks fluent JSON' },
  { key: 'async', label: 'async', emoji: '⏳', re: /\b(await|async|Promise|then|setTimeout|setInterval|asyncio|goroutine|chan|WaitGroup|Thread|Queue|debounce|throttle|retry|sleep)/, want: 'is worth the wait' },
  { key: 'errors', label: 'errors', emoji: '🧯', re: /\b(throw|raise|error|Error|err|try|catch|except|rescue|panic|recover|fail|exception|warn)/, want: "isn't afraid to fail" },
  { key: 'crypto', label: 'crypto', emoji: '🗝️', re: /\b(hash|sha|md5|crypto|encrypt|decrypt|cipher|hmac|bcrypt|salt|base64|uuid|nonce|sign|verify)/i, want: 'can keep a secret' },
  { key: 'db', label: 'databases', emoji: '🗄️', re: /\b(sql|query|select|insert|update|delete|db|database|cursor|model|table|orm|migrate|prisma|knex|sequelize|ActiveRecord|redis|mongo|collection)/i, want: 'wants something serious (and indexed)' },
  { key: 'logging', label: 'talking', emoji: '💬', re: /\b(console\.|log|logger|print|puts|fmt\.Print|debug|info|trace|verbose)/, want: 'loves a good chat' },
  { key: 'config', label: 'config', emoji: '⚙️', re: /\b(env|process\.env|os\.environ|config|settings|options|opts|flags|getenv|ENV\[|feature)/, want: 'knows how they like things' },
  { key: 'money', label: 'money', emoji: '💸', re: /\b(price|total|discount|tax|vat|amount|coupon|currency|payment|invoice|refund|cost|balance|cents|money|billing)/i, want: 'is good with money' },
  { key: 'color', label: 'colors', emoji: '🎨', re: /\b(color|colour|rgb|hex|hsl|theme|palette|css|tint|shade)/i, want: 'brings some color' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function daysSince(ts, now = Date.now()) {
  if (!ts) return null;
  return Math.max(0, Math.floor((now - ts) / 86400000));
}

export function monthYear(ts) {
  const d = new Date(ts);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function interestsOf(o) {
  const text = nameTokens(o.name).join(' ') + ' ' + o.name + '\n' + (o.snippet || '') + '\n' + (o.calls || []).join(' ');
  const scored = [];
  for (const it of INTERESTS) {
    const re = new RegExp(it.re.source, it.re.flags.includes('g') ? it.re.flags : it.re.flags + 'g');
    const hits = (text.match(re) || []).length;
    // The name counts most, and its last word (usually the noun: formatLegacy*Date*) most of all.
    const toks = nameTokens(o.name);
    const nounHit = toks.length && it.re.test(toks[toks.length - 1]);
    const nameHit = it.re.test(toks.join(' ')) || it.re.test(o.name);
    if (hits) scored.push({ ...it, score: hits + (nameHit ? 6 : 0) + (nounHit ? 6 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return scored.slice(0, 4).map(({ key, label, emoji, want }) => ({ key, label, emoji, want }));
}

export function redFlagsOf(o, now = Date.now()) {
  const flags = [];
  const s = o.snippet || '';
  const body = s.split('\n').slice(1).join('\n');
  if (o.params.length >= 5) flags.push(`has ${o.params.length} parameters (that's a lot of baggage)`);
  if (o.lang === 'js' && /\bvar\s/.test(s)) flags.push('uses var');
  if (o.length > 60) flags.push(`talks too much (${o.length} lines)`);
  if (/\b(TODO|FIXME|HACK|XXX)\b/.test(s)) flags.push('has unresolved TODOs');
  if (o.lang === 'js' && /:\s*any\b|<any>|as any\b/.test(s)) flags.push("types everything as 'any'");
  if (/\beval\s*\(/.test(s)) flags.push('uses eval()');
  if (o.lang === 'js' && /[^=!]==[^=]/.test(body.replace(/['"`][^'"`]*['"`]/g, ''))) flags.push('loose equality (==)');
  if (/\bdebugger\b/.test(s)) flags.push('left a debugger in');
  if (/catch\s*(\([^)]*\))?\s*\{\s*\}|except\s*:\s*\n\s*pass|rescue\s*(=>\s*\w+)?\s*\n\s*end/.test(s)) flags.push('swallows errors silently');
  if (o.lang === 'py' && /except\s*:/.test(s)) flags.push('bare except:');
  if (/\bglobal\s+\w/.test(s) && o.lang === 'py') flags.push("uses 'global'");
  if (o.lang === 'go' && /\bpanic\(/.test(s)) flags.push('panics under pressure');
  if (o.recursive) flags.push('talks to itself (recursive)');
  if (o.lang === 'js' && /console\.log\(/.test(s)) flags.push('overshares (console.log)');
  let depth = 0, maxDepth = 0;
  for (const c of body) { if (c === '{') { depth++; maxDepth = Math.max(maxDepth, depth); } else if (c === '}') depth--; }
  if (maxDepth >= 5) flags.push(`${maxDepth} levels of nesting (commitment issues)`);
  const days = daysSince(o.lastModified, now);
  if (days != null && days > 1095) flags.push(`hasn't changed in ${Math.floor(days / 365)} years`);
  if (!o.doc) flags.push('never wrote a bio (no doc comment)');
  return flags.slice(0, 5);
}

export function greenFlagsOf(o) {
  const g = [];
  if (o.doc) g.push('has a doc comment');
  if (o.length <= 12) g.push('short and sweet');
  if (o.params.length <= 2) g.push('low maintenance');
  if (o.isPrivate) g.push('keeps to itself (private)');
  return g.slice(0, 3);
}

const EGGS = {
  love: {
    title: 'The One',
    bio: "Literally named love(). Has been waiting in this codebase the whole time, hoping you'd find it. You did. Please don't swipe left.",
    flags: ['none. it is perfect. look at it.'],
  },
  match: {
    title: 'Matchmaker',
    bio: "Named match(). Spends all day setting other functions up and never gets called itself. The cobbler's children have no shoes.",
    flags: ['too busy finding matches for everyone else'],
  },
};

export function easterEggOf(o) {
  const n = o.name.toLowerCase().replace(/[?!=]$/, '');
  if (n === 'love' || n === 'findlove' || n === 'find_love') return 'love';
  if (n === 'match' || n === 'matchmake' || n === 'matchmaker') return 'match';
  return null;
}

function pick(arr, seed) {
  return arr[seed % arr.length];
}

/** Build the full dating profile for an orphan. */
export function buildProfile(o, now = Date.now()) {
  const days = daysSince(o.lastModified, now);
  const interests = interestsOf(o);
  const seed = hash(o.name + o.file);
  const egg = easterEggOf(o);
  const likes = interests.slice(0, 2).map((i) => i.label);
  const want = interests[0] ? interests[0].want : 'just wants to be called';
  const p = o.params.length;
  const paramsTxt = p === 0 ? 'No baggage (0 params)' : `${p} param${p === 1 ? '' : 's'}`;
  const linesTxt = `${o.length} line${o.length === 1 ? '' : 's'}`;
  const since = days == null ? null : monthYear(o.lastModified);
  const dir = o.file.includes('/') ? o.file.slice(0, o.file.lastIndexOf('/')) + '/' : 'the root folder';
  const likesTxt = likes.length ? likes.join(', ') : 'quiet nights in';
  const templates = [
    () => `${paramsTxt}, ${linesTxt}. Likes: ${likesTxt}. Looking for: someone who ${want}. ${since ? `Ghosted since ${since}.` : 'Has lost track of time.'}`,
    () => `${o.length <= 10 ? 'Low-maintenance' : o.length > 40 ? 'Deep' : 'Easygoing'} (${linesTxt}). Into ${likesTxt} and long walks through ${dir}. Seeking a caller who ${want}. ${since ? `Last texted back ${since}.` : ''}`.trim(),
    () => `${o.kind === 'method' && o.className ? `Lives with the ${o.className} family. ` : ''}${paramsTxt}. Passionate about ${likesTxt}. Wants someone who ${want}. ${since ? `Single since ${since}.` : 'Age is just a number (we could not find it).'}`,
    () => `Fluent in ${likesTxt}. ${o.calls.length ? `Friends with ${o.calls.slice(0, 2).map((c) => c + '()').join(' and ')}. ` : 'Has no friends to call. '}Swipe right if you're someone who ${want}.`,
  ];
  let bio = pick(templates, seed)();
  let redFlags = redFlagsOf(o, now);
  if (egg) { bio = EGGS[egg].bio; redFlags = EGGS[egg].flags; }
  return {
    days,
    since,
    interests,
    bio,
    redFlags,
    greenFlags: greenFlagsOf(o),
    easterEgg: egg,
    eggTitle: egg ? EGGS[egg].title : null,
    headline: `${o.name}()${days != null ? `, ${fmtNum(days)}` : ''}`,
  };
}

/** Rank by loneliness: confidence first, then age, then length. */
export function lonelinessScore(o, now = Date.now()) {
  const days = daysSince(o.lastModified, now) ?? 0;
  return o.confidence * 10 + Math.min(days, 3650) / 10 + Math.min(o.length, 200) / 20;
}

export function loneliest(orphans, now = Date.now()) {
  // The oldest of the confident ones; fall back to the most confident overall.
  let best = null, bestScore = -1;
  const pool = orphans.filter((o) => o.confidence >= 80);
  for (const o of pool.length ? pool : orphans) {
    const s = lonelinessScore(o, now) + (daysSince(o.lastModified, now) ?? 0) * 10;
    if (s > bestScore) { best = o; bestScore = s; }
  }
  return best;
}
