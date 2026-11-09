// Tiny WebAudio synth; no audio assets.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }
  unlock() {
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
    this.ctx?.state === 'suspended' && this.ctx.resume();
  }
  toggle() { this.on = !this.on; return this.on; }
  beep(freq, dur = 0.12, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  freeze() { this.beep(1400, 0.22, 'triangle', 0.1, -900); this.beep(2200, 0.1, 'sine', 0.05, -1200, 0.03); }
  thaw() { this.beep(500, 0.18, 'triangle', 0.1, 500); this.beep(900, 0.2, 'triangle', 0.08, 400, 0.1); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.22, 'triangle', 0.12, 0, i * 0.12)); }
  lose() { [392, 330, 262].forEach((f, i) => this.beep(f, 0.26, 'sawtooth', 0.07, 0, i * 0.14)); }
}
