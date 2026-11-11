import { KEYMAPS, padFor, inRect } from './splitscreen.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dz = (v, d = 0.15) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
const HOLD_MS = 120, TAP_MS = 300, TAP_SLOP = 14;

// Keyboard and gamepad are always active. Pointer behaviour depends on `scheme`:
//  direct: touch = floating joystick (left half) + drag to look (right half); mouse drag looks.
//  tap:    click / tap sets a destination, holding steers toward the pointer,
//          right-drag (mouse) or two-finger drag / pinch (touch) moves the camera.
// In split screen each player owns one Input: `region` limits which pointers it accepts (its viewport),
// `keymap` picks its keys, and `slot`/`count` pick its gamepad. A disabled Input ignores everything.
export class Input {
  constructor(canvas, stickEl, knobEl, { enabled = true, handlesPause = true } = {}) {
    this.canvas = canvas;
    this.enabled = enabled;
    this.handlesPause = handlesPause;
    this.keymap = KEYMAPS.solo;
    this.region = null;
    this.slot = 0;
    this.count = 1;
    this.held = new Set();
    this.scheme = 'direct';
    this.keys = new Set();
    this.look = { yaw: 0, pitch: 0 };
    this.zoomDelta = 0;
    this.stick = { x: 0, y: 0 };
    this.stickEl = stickEl;
    this.knobEl = knobEl;
    this.pointers = new Map();
    this.tapQueue = null;
    this.gesture = null;
    this.onPause = () => {};

    addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.closest?.('input,select,textarea')) return;
      if (this.handlesPause && ['Escape', 'KeyP'].includes(e.code) && !e.repeat) this.onPause();
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (this.enabled && inRect(this.region, e.clientX, e.clientY)) this.zoomDelta += Math.sign(e.deltaY) * 1.2; }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => this.#down(e));
    canvas.addEventListener('pointermove', (e) => this.#move(e));
    for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, (e) => this.#up(e));
  }

  // Configure for a player: keymap, viewport region, gamepad slot.
  configure({ keymap, region, slot = 0, count = 1 }) {
    this.keymap = keymap; this.region = region; this.slot = slot; this.count = count;
    this.releaseAll();
  }

  // Virtual action buttons (on-screen camera turn buttons).
  hold(action, on) { on ? this.held.add(action) : this.held.delete(action); }

  #act(a) { return this.held.has(a) || this.keymap[a].some((c) => this.keys.has(c)); }

  setScheme(s) {
    this.scheme = s;
    this.releaseAll();
  }

  releaseAll() {
    this.keys.clear();
    this.held.clear();
    this.pointers.clear();
    this.gesture = null;
    this.tapQueue = null;
    this.#resetStick();
  }

  #touches() { return [...this.pointers.values()].filter((p) => p.touch); }

  #down(e) {
    if (!this.enabled || !inRect(this.region, e.clientX, e.clientY)) return;
    this.canvas.setPointerCapture(e.pointerId);
    const touch = e.pointerType === 'touch';
    const p = { touch, role: 'look', x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, t: performance.now() };
    this.pointers.set(e.pointerId, p);

    if (this.scheme === 'tap') {
      if (!touch) {
        if (e.button === 0) { p.role = 'aim'; this.tapQueue = { x: p.x, y: p.y }; }
        return; // other buttons orbit the camera
      }
      const touches = this.#touches();
      if (touches.length >= 2) {
        for (const q of touches) q.role = 'gesture';
        this.#startGesture(touches);
      } else p.role = 'pending';
      return;
    }

    const rg = this.region ?? { x: 0, w: innerWidth };
    const leftHalf = e.clientX < rg.x + rg.w * 0.5;
    if (touch && leftHalf && ![...this.pointers.values()].some((q) => q.role === 'stick')) {
      p.role = 'stick';
      this.stickEl.style.display = 'block';
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.knobEl.style.transform = 'translate(-50%,-50%)';
    }
  }

  #startGesture(touches) {
    const [a, b] = touches;
    this.gesture = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  #move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const prevX = p.x, prevY = p.y;
    p.x = e.clientX; p.y = e.clientY;

    if (p.role === 'stick') {
      const r = 56;
      let dx = p.x - p.ox, dy = p.y - p.oy;
      const len = Math.hypot(dx, dy);
      if (len > r) { dx = (dx / len) * r; dy = (dy / len) * r; }
      this.stick.x = dx / r;
      this.stick.y = -dy / r;
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (p.role === 'gesture') {
      const t = this.#touches();
      if (t.length >= 2 && this.gesture) {
        const [a, b] = t;
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y);
        this.look.yaw -= (cx - this.gesture.cx) * 0.006;
        this.look.pitch += (cy - this.gesture.cy) * 0.005;
        this.zoomDelta -= (d - this.gesture.d) * 0.04;
        this.gesture = { cx, cy, d };
      }
    } else if (p.role === 'look') {
      this.look.yaw -= (p.x - prevX) * 0.006;
      this.look.pitch += (p.y - prevY) * 0.005;
    }
  }

  #up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    if (p.role === 'stick') this.#resetStick();
    if (e.type !== 'pointercancel' && p.role === 'pending' && performance.now() - p.t < TAP_MS && Math.hypot(p.x - p.ox, p.y - p.oy) < TAP_SLOP) {
      this.tapQueue = { x: p.x, y: p.y };
    }
    if (this.#touches().length < 2) this.gesture = null;
  }

  #resetStick() {
    this.stick.x = this.stick.y = 0;
    this.stickEl.style.display = 'none';
  }

  // move: { x right, y forward } (length ≤ 1). aim: screen point being held (tap scheme). tap: one-shot screen point.
  poll(dt, allowPause = true) {
    const a = (n) => (this.#act(n) ? 1 : 0);
    let x = a('right') - a('left');
    let y = a('up') - a('down');
    x += this.stick.x; y += this.stick.y;

    let yaw = this.look.yaw, pitch = this.look.pitch;
    this.look.yaw = this.look.pitch = 0;
    yaw += (a('yawL') - a('yawR')) * 2.2 * dt;
    pitch += (a('pitchUp') - a('pitchDown')) * 1.2 * dt;
    let zoom = this.zoomDelta;
    this.zoomDelta = 0;
    zoom += (a('zoomOut') - a('zoomIn')) * 8 * dt;

    const pad = padFor(navigator.getGamepads?.(), this.slot, this.count);
    if (pad) {
      x += dz(pad.axes[0] ?? 0) + ((pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0));
      y += -dz(pad.axes[1] ?? 0) + ((pad.buttons[12]?.pressed ? 1 : 0) - (pad.buttons[13]?.pressed ? 1 : 0));
      yaw -= dz(pad.axes[2] ?? 0) * 2.6 * dt;
      pitch += dz(pad.axes[3] ?? 0) * 1.6 * dt;
      zoom += ((pad.buttons[6]?.value ?? 0) - (pad.buttons[7]?.value ?? 0)) * 8 * dt;
      const start = !!pad.buttons[9]?.pressed;
      if (start && !this.padStart && allowPause) this.onPause();
      this.padStart = start;
    } else this.padStart = false;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }

    let aim = null;
    const now = performance.now();
    for (const p of this.pointers.values()) {
      if (p.role === 'pending' && now - p.t > HOLD_MS) p.role = 'aim';
      if (p.role === 'aim') aim = { x: p.x, y: p.y, touch: p.touch };
    }
    const tap = this.tapQueue;
    this.tapQueue = null;
    const touching = [...this.pointers.values()].some((p) => p.touch && (p.role === 'pending' || p.role === 'aim' || p.role === 'gesture'));
    return { move: { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }, yaw, pitch, zoom, aim, tap, touching };
  }
}
