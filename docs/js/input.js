const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dz = (v, d = 0.15) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

// Keyboard, mouse, touch (floating joystick + drag-to-look) and gamepad.
export class Input {
  constructor(canvas, stickEl, knobEl) {
    this.canvas = canvas;
    this.keys = new Set();
    this.look = { yaw: 0, pitch: 0 };
    this.zoomDelta = 0;
    this.stick = { x: 0, y: 0 };
    this.stickEl = stickEl;
    this.knobEl = knobEl;
    this.pointers = new Map();
    this.onPause = () => {};
    this.touchSeen = false;

    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input,select,textarea')) return;
      if (['Escape', 'KeyP'].includes(e.code) && !e.repeat) this.onPause();
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); this.#resetStick(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomDelta += Math.sign(e.deltaY) * 1.2; }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => this.#down(e));
    canvas.addEventListener('pointermove', (e) => this.#move(e));
    for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, (e) => this.#up(e));
  }

  #down(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const touch = e.pointerType === 'touch';
    if (touch) this.touchSeen = true;
    const leftHalf = e.clientX < innerWidth * 0.5;
    const role = touch && leftHalf && ![...this.pointers.values()].some((p) => p.role === 'stick') ? 'stick' : 'look';
    const p = { role, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY };
    this.pointers.set(e.pointerId, p);
    if (role === 'stick') {
      this.stickEl.style.display = 'block';
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.knobEl.style.transform = 'translate(-50%,-50%)';
    }
  }

  #move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (p.role === 'stick') {
      const r = 56;
      let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
      const len = Math.hypot(dx, dy);
      if (len > r) { dx = (dx / len) * r; dy = (dy / len) * r; }
      this.stick.x = dx / r;
      this.stick.y = -dy / r;
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      this.look.yaw -= dx * 0.006;
      this.look.pitch += dy * 0.005;
    }
    p.x = e.clientX; p.y = e.clientY;
  }

  #up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (p?.role === 'stick') this.#resetStick();
  }

  #resetStick() {
    this.stick.x = this.stick.y = 0;
    this.stickEl.style.display = 'none';
  }

  // Returns { move: {x, y} (x right, y forward, length ≤ 1), yaw, pitch, zoom }.
  poll(dt) {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    x += this.stick.x; y += this.stick.y;

    let yaw = this.look.yaw, pitch = this.look.pitch;
    this.look.yaw = this.look.pitch = 0;
    yaw += ((k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0)) * 2.2 * dt;
    pitch += ((k.has('KeyR') ? 1 : 0) - (k.has('KeyF') ? 1 : 0)) * 1.2 * dt;
    let zoom = this.zoomDelta;
    this.zoomDelta = 0;
    zoom += ((k.has('Minus') ? 1 : 0) - (k.has('Equal') ? 1 : 0)) * 8 * dt;

    const pad = navigator.getGamepads?.().find((g) => g?.connected);
    if (pad) {
      x += dz(pad.axes[0]) + ((pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0));
      y += -dz(pad.axes[1]) + ((pad.buttons[12]?.pressed ? 1 : 0) - (pad.buttons[13]?.pressed ? 1 : 0));
      yaw -= dz(pad.axes[2] ?? 0) * 2.6 * dt;
      pitch += dz(pad.axes[3] ?? 0) * 1.6 * dt;
      zoom += ((pad.buttons[6]?.value ?? 0) - (pad.buttons[7]?.value ?? 0)) * 8 * dt;
      const start = !!pad.buttons[9]?.pressed;
      if (start && !this.padStart) this.onPause();
      this.padStart = start;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { move: { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }, yaw, pitch, zoom };
  }
}
