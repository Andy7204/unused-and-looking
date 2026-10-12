// TRAP: default export, imported as `makeTitle`
export default function buildTitle(t) {
  return `~ ${t} ~`;
}

// TRAP: name only appears inside a template literal interpolation
function shout(s) {
  return s.toUpperCase();
}
export const banner = (s) => `${shout(s)}!`;

// TRAP: mentioned in a comment only -> comments are stripped, so this
// is an ORPHAN: unusedHelper()
function unusedHelper() {
  return 42;
}

// TRAP: regex literal containing quotes and slashes must not confuse the stripper
const RE = /["'\/]+/g;
export function clean(s) {
  return s.replace(RE, '');
}

// TRAP: called via an exact string lookup -> treated as alive
function onSave() {
  return 'saved';
}
const handlers = { save: 'onSave' };
export function dispatch(kind) {
  return globalThis[handlers[kind]]();
}

// ORPHAN: only calls itself
function countdown(n) {
  return n <= 0 ? 0 : countdown(n - 1);
}

// ORPHAN: overly long parameter list + var
function legacyFormat(a, b, c, d, e, f) {
  var out = [a, b, c, d, e, f].join('-');
  return out;
}
