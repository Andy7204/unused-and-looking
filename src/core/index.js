// Public entry for the shared core (used by the CLI and the web app).
export { analyze, VERSION, DEFAULT_MIN_CONFIDENCE, confidenceLabel } from './analyze.js';
export { stripSource } from './strip.js';
export { classifyPath, isSkippedDir, isSkippedPath, MAX_FILE_BYTES } from './files.js';
export { similarity, nameSimilarity, nameTokens } from './match.js';
export { buildProfile, loneliest, daysSince, fmtNum, hash, easterEggOf } from './profile.js';
export { avatarSvg, avatarSpec, drawAvatar } from './avatar.js';
export { breakupMarkdown, badgeMarkdown, badgeUrl, statsSentence, shareText, locationLink, HOMEPAGE, DEMO_URL } from './report.js';
export { parseRepo } from './repo.js';
