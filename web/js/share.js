// 1200x630 share card, drawn with canvas after fonts load.

import { drawAvatar } from '../core/avatar.js';
import { fmtNum } from '../core/profile.js';

const W = 1200, H = 630;

export async function ensureFonts() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load('700 64px Fredoka'), document.fonts.load('600 30px Fredoka'),
      document.fonts.load('500 26px "DM Sans"'), document.fonts.load('700 22px "DM Sans"'),
      document.fonts.load('400 22px "JetBrains Mono"'),
    ]);
  } catch { /* fall back to system fonts */ }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = t;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxWidth && last.length) last = last.slice(0, -1);
    lines[maxLines - 1] = last.replace(/[\s,.]+$/, '') + '…';
  }
  return lines;
}

function fitText(ctx, text, font, size, maxWidth, min = 28) {
  let s = size;
  ctx.font = font.replace('{s}', s);
  while (ctx.measureText(text).width > maxWidth && s > min) { s -= 2; ctx.font = font.replace('{s}', s); }
  return s;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ orphan, profile, sourceLabel, total?: number, dark?: boolean }} d
 */
export async function drawShareCard(canvas, d) {
  await ensureFonts();
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const { orphan: o, profile: p } = d;
  // background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#ff3d7f'); g.addColorStop(0.5, '#ff7a59'); g.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // floating hearts
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#fff';
  const heart = (x, y, s) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fill(new Path2D('M0,30C0,30 -30,12 -30,-6A15,15 0 0,1 0,-12A15,15 0 0,1 30,-6C30,12 0,30 0,30Z'));
    ctx.restore();
  };
  [[80, 90, 1.4], [1120, 70, 1], [1060, 560, 1.8], [620, 600, 0.8], [40, 560, 0.9], [700, 40, 0.7]].forEach(([x, y, s]) => heart(x, y, s));
  ctx.globalAlpha = 1;

  // card
  const cx = 60, cy = 50, cw = W - 120, ch = H - 100;
  ctx.save();
  ctx.shadowColor = 'rgba(60, 0, 40, 0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  roundRect(ctx, cx, cy, cw, ch, 36);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // avatar
  const as = 360;
  ctx.save();
  roundRect(ctx, cx + 30, cy + 30, as, as, 30);
  ctx.clip();
  drawAvatar(ctx, o.name, cx + 30, cy + 30, as, { heart: p.easterEgg === 'love' });
  ctx.restore();
  if (p.easterEgg) {
    ctx.lineWidth = 6; ctx.strokeStyle = p.easterEgg === 'love' ? '#ffb800' : '#8b5cf6';
    roundRect(ctx, cx + 30, cy + 30, as, as, 30); ctx.stroke();
  }
  // confidence pill under avatar
  ctx.font = '700 22px "DM Sans", sans-serif';
  const pill = `${o.confidence}% single`;
  const pw = ctx.measureText(pill).width + 36;
  roundRect(ctx, cx + 30 + (as - pw) / 2, cy + 30 + as + 20, pw, 42, 21);
  ctx.fillStyle = '#fff0f5'; ctx.fill();
  ctx.fillStyle = '#ff3d7f';
  ctx.textBaseline = 'middle';
  ctx.fillText(pill, cx + 30 + (as - pw) / 2 + 18, cy + 30 + as + 41);

  // text side
  const tx = cx + 30 + as + 44, tw = cx + cw - tx - 36;
  let y = cy + 64;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#b55cf6';
  ctx.font = '700 22px "DM Sans", sans-serif';
  ctx.fillText(p.easterEgg ? `✨ ${p.eggTitle.toUpperCase()} ✨` : 'MEET', tx, y);
  y += 62;
  ctx.fillStyle = '#2a1830';
  const title = `${o.name}(),`;
  fitText(ctx, title, '700 {s}px Fredoka, sans-serif', 64, tw, 30);
  ctx.fillText(title, tx, y);
  y += 54;
  ctx.font = '600 38px Fredoka, sans-serif';
  const grad = ctx.createLinearGradient(tx, 0, tx + 420, 0);
  grad.addColorStop(0, '#ff3d7f'); grad.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = grad;
  ctx.fillText(p.days != null ? `${fmtNum(p.days)} days single` : 'single since forever', tx, y);
  y += 40;
  ctx.fillStyle = '#7a6380';
  ctx.font = '400 20px "JetBrains Mono", monospace';
  let loc = `📍 ${o.file}:${o.line}`;
  while (ctx.measureText(loc).width > tw && loc.length > 10) loc = '📍 …' + loc.slice(4 + 2);
  ctx.fillText(loc, tx, y);
  y += 44;
  ctx.fillStyle = '#2a1830';
  ctx.font = '500 24px "DM Sans", sans-serif';
  for (const line of wrap(ctx, p.bio, tw, 4)) { ctx.fillText(line, tx, y); y += 34; }
  y += 10;
  // interest chips
  ctx.font = '700 19px "DM Sans", sans-serif';
  let chipX = tx;
  for (const it of p.interests.slice(0, 4)) {
    const label = it.label;
    const w = ctx.measureText(label).width + 30;
    if (chipX + w > tx + tw) break;
    roundRect(ctx, chipX, y - 24, w, 36, 18);
    ctx.fillStyle = '#fff0f5'; ctx.fill();
    ctx.fillStyle = '#ff3d7f';
    ctx.fillText(label, chipX + 15, y);
    chipX += w + 10;
  }
  y += 44;
  if (p.redFlags[0] && y < cy + ch - 70) {
    ctx.fillStyle = '#ff4f6d';
    ctx.font = '600 20px "DM Sans", sans-serif';
    const flag = wrap(ctx, '🚩 ' + p.redFlags[0], tw, 1)[0];
    ctx.fillText(flag, tx, y);
  }

  // footer
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px Fredoka, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('♥ Unused & Looking', cx, H - 26);
  ctx.font = '400 19px "JetBrains Mono", monospace';
  const right = `${d.total != null ? `${fmtNum(d.total)} lonely functions in ${d.sourceLabel} · ` : ''}npx unused-and-looking`;
  ctx.textAlign = 'right';
  let r = right;
  while (ctx.measureText(r).width > cw - 280 && r.length > 24) r = r.slice(0, -1);
  ctx.fillText(r === right ? r : r + '…', cx + cw, H - 26);
  ctx.textAlign = 'left';
  return canvas;
}

export function downloadCanvas(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(false);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      resolve(true);
    }, 'image/png');
  });
}

export function xIntent(text, url) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
