// Swipe physics for the top card: pointer drag (touch + mouse), fling
// detection, a damped spring back to centre, and fly-out animations.
// Respects prefers-reduced-motion (no flying, just a quick fade).

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const THRESHOLD = 110;
const FLING = 0.55; // px/ms

export class Deck {
  constructor(el, { onSwipe, onTap }) {
    this.el = el;
    this.onSwipe = onSwipe;
    this.onTap = onTap;
    this.card = null;
    this.busy = false;
    this.raf = 0;
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
  }

  /** Attach to the current top card element. */
  attach(card) {
    if (this.card) this.card.removeEventListener('pointerdown', this._down);
    this.card = card;
    this.busy = false;
    this.x = 0; this.y = 0;
    if (!card) return;
    card.classList.add('is-top');
    card.addEventListener('pointerdown', this._down);
    this._next = card.previousElementSibling;
  }

  _down(e) {
    if (this.busy || e.button > 0) return;
    if (e.target.closest('button, a')) return;
    cancelAnimationFrame(this.raf);
    this.dragging = true;
    this.moved = false;
    this.startX = e.clientX - this.x;
    this.startY = e.clientY - this.y;
    this.samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    this.card.setPointerCapture(e.pointerId);
    this.card.addEventListener('pointermove', this._move);
    this.card.addEventListener('pointerup', this._up);
    this.card.addEventListener('pointercancel', this._up);
  }

  _move(e) {
    if (!this.dragging) return;
    this.x = e.clientX - this.startX;
    this.y = e.clientY - this.startY;
    if (Math.abs(this.x) + Math.abs(this.y) > 6) { this.moved = true; this.card.classList.add('dragging'); }
    const now = performance.now();
    this.samples.push({ x: e.clientX, y: e.clientY, t: now });
    while (this.samples.length > 2 && now - this.samples[0].t > 100) this.samples.shift();
    this.render();
  }

  _up() {
    if (!this.dragging) return;
    this.dragging = false;
    this.card.classList.remove('dragging');
    this.card.removeEventListener('pointermove', this._move);
    this.card.removeEventListener('pointerup', this._up);
    this.card.removeEventListener('pointercancel', this._up);
    if (!this.moved) { this.x = 0; this.y = 0; this.render(); this.onTap && this.onTap(); return; }
    const a = this.samples[0], b = this.samples[this.samples.length - 1];
    const dt = Math.max(1, b.t - a.t);
    const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    let dir = null;
    if ((this.y < -THRESHOLD || vy < -FLING) && Math.abs(this.y) > Math.abs(this.x)) dir = 'up';
    else if (this.x > THRESHOLD || vx > FLING) dir = 'right';
    else if (this.x < -THRESHOLD || vx < -FLING) dir = 'left';
    if (dir) this.fly(dir, { vx, vy });
    else this.springBack({ vx, vy });
  }

  render() {
    if (!this.card) return;
    const rot = this.x * 0.06;
    this.card.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) rotate(${rot}deg)`;
    const like = Math.max(0, Math.min(1, this.x / THRESHOLD));
    const nope = Math.max(0, Math.min(1, -this.x / THRESHOLD));
    const sup = Math.max(0, Math.min(1, -this.y / THRESHOLD)) * (Math.abs(this.y) > Math.abs(this.x) ? 1 : 0);
    const s = (cls, v) => { const st = this.card.querySelector(cls); if (st) st.style.opacity = v; };
    s('.stamp-like', like); s('.stamp-nope', nope); s('.stamp-super', sup);
    if (this._next) {
      const p = Math.min(1, Math.hypot(this.x, this.y) / THRESHOLD);
      this._next.style.transform = `scale(${0.95 + 0.05 * p}) translateY(${14 - 14 * p}px)`;
    }
  }

  springBack({ vx = 0, vy = 0 } = {}) {
    if (reduceMotion()) { this.x = 0; this.y = 0; this.render(); return; }
    // Damped spring integrated per frame.
    let velX = vx * 16, velY = vy * 16;
    const k = 0.14, c = 0.24;
    const step = () => {
      velX += -k * this.x - c * velX;
      velY += -k * this.y - c * velY;
      this.x += velX; this.y += velY;
      if (Math.abs(this.x) < 0.4 && Math.abs(this.y) < 0.4 && Math.abs(velX) < 0.4 && Math.abs(velY) < 0.4) {
        this.x = 0; this.y = 0; this.render();
        if (this._next) this._next.style.transform = '';
        return;
      }
      this.render();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Throw the card off-screen, then report the decision. */
  fly(dir, { vx = 0, vy = 0 } = {}) {
    if (!this.card || this.busy) return;
    this.busy = true;
    const card = this.card;
    const done = () => { card.remove(); this.onSwipe(dir); };
    if (reduceMotion()) {
      card.style.transition = 'opacity 120ms';
      card.style.opacity = '0';
      setTimeout(done, 130);
      return;
    }
    const W = window.innerWidth, H = window.innerHeight;
    const tx = dir === 'right' ? W : dir === 'left' ? -W : this.x + vx * 200;
    const ty = dir === 'up' ? -H : this.y + vy * 200;
    const sx = this.x, sy = this.y;
    const t0 = performance.now();
    const dur = 320;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    if (dir === 'right') this.x = Math.max(this.x, 1);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      this.x = sx + (tx - sx) * ease(t);
      this.y = sy + (ty - sy) * ease(t);
      this.render();
      if (dir === 'up') { const st = card.querySelector('.stamp-super'); if (st) st.style.opacity = 1; }
      if (t < 1) this.raf = requestAnimationFrame(frame);
      else done();
    };
    // Show the right stamp immediately for button/keyboard swipes.
    const st = card.querySelector(dir === 'right' ? '.stamp-like' : dir === 'left' ? '.stamp-nope' : '.stamp-super');
    if (st) st.style.opacity = 1;
    this.raf = requestAnimationFrame(frame);
  }
}
