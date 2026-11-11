// Tiny WebAudio synth; no audio assets.
export class Sfx {
  constructor({ music = 0.2, effects = 0.7, report = () => {} } = {}) {
    this.ctx = null;
    this.on = true;
    this.musicVolume = music;
    this.effectsVolume = effects;
    this.report = report;
    this.note = 0;
    this.nextNote = 0;
  }
  unlock(gesture = false) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.report('Audio is not supported on this device.'); return; }
      this.ctx = new AC();
      this.musicGain = this.ctx.createGain();
      this.effectsGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
      this.effectsGain.connect(this.ctx.destination);
      this.setVolumes(this.musicVolume, this.effectsVolume);
    }
    if (this.ctx.state === 'suspended' && (!this.resumePending || gesture)) {
      this.report('Tap the screen or press a key to enable audio.');
      this.resumePending = true;
      this.ctx.resume().then(() => {
        this.resumePending = false;
        this.report(this.ctx.state === 'running' ? '' : 'Tap the screen to enable audio.');
      }).catch(() => { this.resumePending = false; this.report('Audio could not start. Tap the screen to retry.'); });
    }
  }
  setVolumes(music, effects) {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.effectsVolume = Math.max(0, Math.min(1, effects));
    if (this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.04);
      this.effectsGain.gain.setTargetAtTime(this.on ? this.effectsVolume : 0, this.ctx.currentTime, 0.04);
    }
  }
  toggle() { this.on = !this.on; this.setVolumes(this.musicVolume, this.effectsVolume); return this.on; }
  beep(freq, dur = 0.12, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.effectsGain); o.start(t); o.stop(t + dur + 0.02);
  }
  update(musicActive) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!musicActive || !this.musicVolume) { this.nextNote = 0; return; }
    const now = this.ctx.currentTime;
    if (this.nextNote < now) this.nextNote = now;
    if (this.nextNote > now + 0.12) return;
    const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23, 220, 261.63, 329.63, 392, 196, 246.94, 293.66, 392];
    const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = melody[this.note++ % melody.length];
    gain.gain.setValueAtTime(0.0001, this.nextNote);
    gain.gain.exponentialRampToValueAtTime(0.11, this.nextNote + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.nextNote + 0.48);
    oscillator.connect(gain).connect(this.musicGain);
    oscillator.start(this.nextNote);
    oscillator.stop(this.nextNote + 0.5);
    this.nextNote += 0.3;
  }
  reaction(kind) {
    if (kind === 'frozen') this.beep(340, 0.19, 'triangle', 0.13, -150);
    if (kind === 'thaw') this.beep(360, 0.2, 'triangle', 0.11, 280);
    if (kind === 'infected') this.beep(270, 0.23, 'triangle', 0.1, -130);
    if (kind === 'escape') {
      this.beep(440, 0.12, 'triangle', 0.1, 150);
      this.beep(660, 0.16, 'triangle', 0.1, 180, 0.12);
    }
  }
  freeze() { this.beep(1400, 0.22, 'triangle', 0.1, -900); this.beep(2200, 0.1, 'sine', 0.05, -1200, 0.03); }
  thaw() { this.beep(500, 0.18, 'triangle', 0.1, 500); this.beep(900, 0.2, 'triangle', 0.08, 400, 0.1); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.22, 'triangle', 0.12, 0, i * 0.12)); }
  lose() { [392, 330, 262].forEach((f, i) => this.beep(f, 0.26, 'sawtooth', 0.07, 0, i * 0.14)); }
}
