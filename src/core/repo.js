// Parse the many ways people paste a GitHub repo.

/** Accepts owner/repo, github.com/owner/repo, full URLs, /tree/<ref> and .git. */
export function parseRepo(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  s = s.replace(/^git@github\.com:/, 'github.com/').replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.replace(/^github\.com\//, '');
  s = s.split(/[?#]/)[0].replace(/\.git$/, '').replace(/\/+$/, '');
  const parts = s.split('/');
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
  let ref = 'HEAD';
  if (parts[2] === 'tree' && parts[3]) ref = parts.slice(3).join('/');
  return { owner, repo, ref, full: `${owner}/${repo}` };
}
