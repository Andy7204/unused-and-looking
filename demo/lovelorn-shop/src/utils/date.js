/**
 * Formats a date the way the 2019 reporting system wanted it.
 * Kept "just in case" during the migration.
 */
export function formatLegacyDate(date, separator, padMonths, includeTime, locale) {
  var d = new Date(date);
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  var out = d.getFullYear() + separator + month + separator + day;
  if (includeTime) {
    out += ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  return out;
}

export function formatDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// TODO: remove after the timezone rewrite
export function daysBetween(a, b) {
  const ms = Math.abs(new Date(b) - new Date(a));
  return Math.floor(ms / 86400000);
}
