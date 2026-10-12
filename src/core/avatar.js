// Deterministic avatar from a function name. Produces a list of simple shapes
// that render identically as SVG (cards) and Path2D (canvas share image).
// Coordinate space: 0..100.

import { hash } from './profile.js';

function rng(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

const circle = (cx, cy, r) => `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`;
const ellipse = (cx, cy, rx, ry) => `M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${rx * 2},0a${rx},${ry} 0 1,0 ${-rx * 2},0Z`;

export function avatarSpec(name, opts = {}) {
  const r = rng(hash(name) || 7);
  const hue = Math.floor(r() * 360);
  const hue2 = (hue + 40 + Math.floor(r() * 80)) % 360;
  const bg = [`hsl(${hue},85%,72%)`, `hsl(${hue2},80%,60%)`];
  const skin = `hsl(${(hue + 180) % 360},70%,${78 + Math.floor(r() * 10)}%)`;
  const ink = '#2b1b33';
  const shapes = [];
  const faceType = Math.floor(r() * 4);
  // body / shoulders
  shapes.push({ d: ellipse(50, 104, 34, 26), fill: `hsl(${hue2},55%,${38 + Math.floor(r() * 15)}%)` });
  // face
  if (faceType === 0) shapes.push({ d: circle(50, 50, 28), fill: skin });
  else if (faceType === 1) shapes.push({ d: 'M24,34Q24,22 36,22L64,22Q76,22 76,34L76,64Q76,78 62,78L38,78Q24,78 24,64Z', fill: skin });
  else if (faceType === 2) shapes.push({ d: ellipse(50, 52, 25, 29), fill: skin });
  else shapes.push({ d: 'M50,20L78,40L72,74L28,74L22,40Z', fill: skin, round: true });
  // brackets as ears: it's code, after all
  if (r() < 0.5) {
    shapes.push({ d: 'M22,42Q15,50 22,58', stroke: ink, sw: 3, fill: 'none' });
    shapes.push({ d: 'M78,42Q85,50 78,58', stroke: ink, sw: 3, fill: 'none' });
  }
  // eyes
  const eyeType = Math.floor(r() * 5);
  const ey = 47 + Math.floor(r() * 4);
  const ex = 11 + Math.floor(r() * 3);
  for (const side of [-1, 1]) {
    const cx = 50 + side * ex;
    if (eyeType === 0) shapes.push({ d: circle(cx, ey, 3.6), fill: ink });
    else if (eyeType === 1) { shapes.push({ d: circle(cx, ey, 6), fill: '#fff' }); shapes.push({ d: circle(cx + 1, ey + 1, 3), fill: ink }); }
    else if (eyeType === 2) shapes.push({ d: `M${cx - 5},${ey + 1}Q${cx},${ey - 5} ${cx + 5},${ey + 1}`, stroke: ink, sw: 3, fill: 'none' });
    else if (eyeType === 3) shapes.push({ d: `M${cx - 5},${ey}L${cx + 5},${ey}`, stroke: ink, sw: 3, fill: 'none' });
    else { shapes.push({ d: ellipse(cx, ey, 3, 4.5), fill: ink }); shapes.push({ d: circle(cx + 1, ey - 1.5, 1.2), fill: '#fff' }); }
  }
  // blush
  if (r() < 0.7) for (const side of [-1, 1]) shapes.push({ d: ellipse(50 + side * 17, 59, 5, 3), fill: 'rgba(255,90,130,0.45)' });
  // mouth
  const mouth = Math.floor(r() * 5);
  const my = 63 + Math.floor(r() * 3);
  if (mouth === 0) shapes.push({ d: `M42,${my}Q50,${my + 7} 58,${my}`, stroke: ink, sw: 2.6, fill: 'none' });
  else if (mouth === 1) shapes.push({ d: `M43,${my + 3}Q50,${my - 3} 57,${my + 3}`, stroke: ink, sw: 2.6, fill: 'none' }); // sad: they're lonely
  else if (mouth === 2) shapes.push({ d: ellipse(50, my + 1, 3.2, 4), fill: ink });
  else if (mouth === 3) shapes.push({ d: `M43,${my}L57,${my}`, stroke: ink, sw: 2.6, fill: 'none' });
  else shapes.push({ d: `M42,${my}Q46,${my + 4} 50,${my}Q54,${my + 4} 58,${my}`, stroke: ink, sw: 2.4, fill: 'none' });
  // accessory
  const acc = Math.floor(r() * 7);
  const accColor = `hsl(${(hue + 200) % 360},75%,45%)`;
  if (acc === 0) { // glasses
    for (const side of [-1, 1]) shapes.push({ d: circle(50 + side * ex, ey, 7.5), stroke: ink, sw: 2.4, fill: 'rgba(255,255,255,0.15)' });
    shapes.push({ d: `M${50 - ex + 7.5},${ey}L${50 + ex - 7.5},${ey}`, stroke: ink, sw: 2.4, fill: 'none' });
  } else if (acc === 1) { // party hat
    shapes.push({ d: 'M38,26L50,2L62,26Z', fill: accColor });
    shapes.push({ d: circle(50, 3, 3.5), fill: '#ffd34d' });
  } else if (acc === 2) { // bow
    shapes.push({ d: 'M50,22L38,14L38,30Z', fill: '#ff4f8b' });
    shapes.push({ d: 'M50,22L62,14L62,30Z', fill: '#ff4f8b' });
    shapes.push({ d: circle(50, 22, 3.5), fill: '#d62d6b' });
  } else if (acc === 3) { // antenna
    shapes.push({ d: 'M50,22L50,8', stroke: ink, sw: 2.5, fill: 'none' });
    shapes.push({ d: circle(50, 7, 4), fill: accColor });
  } else if (acc === 4) { // beanie
    shapes.push({ d: 'M24,36Q24,12 50,12Q76,12 76,36Z', fill: accColor });
    shapes.push({ d: 'M22,34L78,34L78,40L22,40Z', fill: `hsl(${(hue + 200) % 360},60%,35%)` });
  } else if (acc === 5) { // curl of hair
    shapes.push({ d: 'M44,24Q50,10 58,18Q52,16 50,24Z', fill: ink });
  }
  if (opts.heart) shapes.push({ d: 'M50,90C50,90 30,78 30,66A10,10 0 0,1 50,62A10,10 0 0,1 70,66C70,78 50,90 50,90Z', fill: '#ff2e6e' });
  return { bg, shapes };
}

export function avatarSvg(name, opts = {}) {
  const { bg, shapes } = avatarSpec(name, opts);
  const id = 'g' + (hash(name) % 1e6);
  const body = shapes.map((s) => `<path d="${s.d}" fill="${s.fill || 'none'}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" stroke-linejoin="round"` : ''}${s.round ? ' stroke-linejoin="round"' : ''}/>`).join('');
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avatar for ${String(name).replace(/[<>&"]/g, '')}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="100" height="100" fill="url(#${id})"/>${body}</svg>`;
}

/** Draw onto a canvas 2D context at (x, y) with size `size`. Needs Path2D. */
export function drawAvatar(ctx, name, x, y, size, opts = {}) {
  const { bg, shapes } = avatarSpec(name, opts);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  const g = ctx.createLinearGradient(0, 0, 100, 100);
  g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 100, 100);
  for (const s of shapes) {
    const p = new Path2D(s.d);
    if (s.fill && s.fill !== 'none') { ctx.fillStyle = s.fill; ctx.fill(p); }
    if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.sw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(p); }
  }
  ctx.restore();
}
