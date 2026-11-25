// Procedural WebAudio engine: music bus (sequenced themes) + effects bus (layered synth sfx). No audio assets.
import { MusicEngine, VOICES, getNoise, midiToFreq } from './music.js?v=audio1';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const VOICE_CAP = 20;

export class Sfx {
  constructor({ music = 0.2, effects = 0.7, report = () => {} } = {}) {
    this.ctx = null;
    this.on = true;
    this.musicVolume = music;
    this.effectsVolume = effects;
    this.report = report;
    this.scene = 'menu';
    this.mode = null;
    this.paused = false;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.listener = null;
    this.musicActive = false;
    this.gates = new Map();
    this.voiceEnds = [];
    this.appliedScene = null;
    this.stride = 0;
    this.lastClock = 0;
  }

  unlock(gesture = false) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.report('Audio is not supported on this device.'); return; }
      const c = this.ctx = new AC();
      this.musicGain = c.createGain();
      this.effectsGain = c.createGain();
      this.musicDuck = c.createBiquadFilter();
      this.musicDuck.type = 'lowpass';
      this.musicDuck.frequency.value = 20000;
      this.musicComp = this.#limiter(-14, 6, 0.01, 0.2);
      this.fxComp = this.#limiter(-10, 8, 0.003, 0.15);
      this.musicDuck.connect(this.musicComp);
      this.musicComp.connect(this.musicGain);
      this.musicGain.connect(c.destination);
      this.effectsGain.connect(this.fxComp);
      this.fxComp.connect(c.destination);
      this.music = new MusicEngine(c, this.musicDuck);
      this.setVolumes(this.musicVolume, this.effectsVolume);
      if (typeof setInterval === 'function') {
        const timer = setInterval(() => { if (this.musicActive && c.state === 'running') this.#tickMusic(); }, 40);
        timer.unref?.();
      }
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) c.suspend?.();
          else this.unlock();
        });
      }
    }
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (this.ctx.state === 'suspended' && (!this.resumePending || gesture) && !hidden) {
      this.report('Tap anywhere to enable sound.');
      this.resumePending = true;
      this.ctx.resume().then(() => {
        this.resumePending = false;
        this.report(this.ctx.state === 'running' ? '' : 'Tap anywhere to enable sound.');
      }).catch(() => { this.resumePending = false; this.report('Audio could not start. Tap the screen to retry.'); });
    }
  }
  #limiter(threshold, ratio, attack, release) {
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = threshold; comp.knee.value = 12; comp.ratio.value = ratio;
    comp.attack.value = attack; comp.release.value = release;
    return comp;
  }
  setVolumes(music, effects) {
    this.musicVolume = clamp01(music);
    this.effectsVolume = clamp01(effects);
    if (this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume * (this.paused ? 0.6 : 1), this.ctx.currentTime, 0.04);
      this.effectsGain.gain.setTargetAtTime(this.on ? this.effectsVolume : 0, this.ctx.currentTime, 0.04);
    }
  }
  toggle() { this.on = !this.on; this.setVolumes(this.musicVolume, this.effectsVolume); return this.on; }

  // ---- music control ----------------------------------------------------------------------
  // scene: 'menu' | 'match' | 'results'; mode picks the match theme (freeze, tag, outbreak, maze).
  setScene(scene, { mode = null } = {}) { this.scene = scene; this.mode = mode; }
  setIntensity(value) { this.targetIntensity = clamp01(value); }
  setPaused(paused) {
    if (paused === this.paused) return;
    this.paused = paused;
    if (!this.ctx) return;
    this.musicDuck.frequency.setTargetAtTime(paused ? 500 : 20000, this.ctx.currentTime, paused ? 0.06 : 0.12);
    this.setVolumes(this.musicVolume, this.effectsVolume);
  }
  // listener: {x, z, rx, rz} (rx/rz = camera right vector). Events with a position are attenuated/panned relative to it.
  setListener(listener) { this.listener = listener; }
  #tickMusic() {
    const mode = ['freeze', 'tag', 'outbreak', 'maze'].includes(this.mode) ? this.mode : 'freeze';
    const key = this.scene === 'match' ? mode : this.scene === 'results' ? 'results' : 'menu';
    if (key !== this.appliedScene) {
      this.appliedScene = key;
      const results = key === 'results';
      this.music.play(key, { fade: results ? 1.5 : 1, delay: results ? 1.8 : 0 });
    }
    this.music.intensity = this.scene === 'match' ? this.intensity : 0;
    if (this.musicVolume > 0.001) this.music.tick();
  }
  update(musicActive) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime, dt = Math.max(0, Math.min(0.1, now - this.lastClock));
    this.lastClock = now;
    const rate = (this.targetIntensity > this.intensity ? 0.6 : 0.2) * dt;
    this.intensity += Math.max(-rate, Math.min(rate, this.targetIntensity - this.intensity));
    this.musicActive = Boolean(musicActive);
    if (this.musicActive) this.#tickMusic();
  }

  // ---- effect plumbing --------------------------------------------------------------------
  // Returns {out, t} or null when rate limited, too far away or the voice cap is reached.
  #voice(key, { gap = 0.05, prio = 1, at = null, dur = 0.4, vol = 1 } = {}) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return null;
    const c = this.ctx, now = c.currentTime;
    if (now - (this.gates.get(key) ?? -9) < gap) return null;
    this.voiceEnds = this.voiceEnds.filter((e) => e > now);
    if (this.voiceEnds.length >= VOICE_CAP || (prio < 1 && this.voiceEnds.length > VOICE_CAP * 0.6)) return null;
    let level = vol, pan = 0;
    if (at && this.listener) {
      const dx = at.x - this.listener.x, dz = at.z - this.listener.z, d = Math.hypot(dx, dz);
      level *= 1 / (1 + (d / 9) ** 2);
      if (level < 0.05) return null;
      pan = Math.min(1, d / 6) * ((dx * (this.listener.rx ?? 1) + dz * (this.listener.rz ?? 0)) / (d || 1));
    }
    this.gates.set(key, now);
    this.voiceEnds.push(now + dur);
    const g = c.createGain();
    g.gain.value = level;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
      g.connect(p); p.connect(this.effectsGain);
    } else g.connect(this.effectsGain);
    return { out: g, t: now + 0.005 };
  }
  #tone(out, t, { f, to = f, dur = 0.15, type = 'sine', vol = 0.1, attack = 0.004, delay = 0, lp = 0 }) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), s = t + delay;
    o.type = type;
    o.frequency.setValueAtTime(f, s);
    if (to !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), s + dur);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.linearRampToValueAtTime(vol, s + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    o.connect(g);
    if (lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; g.connect(f2); f2.connect(out); } else g.connect(out);
    o.start(s); o.stop(s + dur + 0.03);
  }
  #noise(out, t, { dur = 0.1, type = 'bandpass', f = 1000, to = f, q = 1, vol = 0.1, delay = 0, attack = 0.003 }) {
    const c = this.ctx, src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), s = t + delay;
    src.buffer = getNoise(c);
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, s);
    if (to !== f) fl.frequency.exponentialRampToValueAtTime(Math.max(20, to), s + dur);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.linearRampToValueAtTime(vol, s + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    src.connect(fl); fl.connect(g); g.connect(out);
    src.start(s, Math.random() * 0.5); src.stop(s + dur + 0.03);
  }
  #note(out, t, name, midi, vel = 0.5, delay = 0) { VOICES[name](this.ctx, out, t + delay, midi, vel, 0.3); }

  // Plain beep, kept for simple one-off uses.
  beep(freq, dur = 0.12, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    const v = this.#voice('beep', { gap: 0, dur: dur + delay });
    if (v) this.#tone(v.out, v.t, { f: freq, to: slide ? freq + slide : freq, dur, type, vol, delay });
  }

  // ---- game effects; `at` is an optional {x, z} world position ------------------------------
  freeze(at) {
    const v = this.#voice('freeze', { gap: 0.08, at, dur: 1 });
    if (!v) return;
    const { out, t } = v;
    [2093, 2794, 3520, 4186].forEach((f, i) => this.#tone(out, t, { f, dur: 0.55 - i * 0.07, vol: 0.06, delay: i * 0.03 }));
    this.#tone(out, t, { f: 1400, to: 380, dur: 0.22, type: 'triangle', vol: 0.09 });
    this.#noise(out, t, { dur: 0.25, type: 'highpass', f: 5000, to: 9000, vol: 0.05 });
    for (let i = 0; i < 5; i++) this.#noise(out, t, { dur: 0.02, type: 'highpass', f: 6000, q: 2, vol: 0.07, delay: 0.1 + Math.random() * 0.25 });
  }
  thaw(at) {
    const v = this.#voice('thaw', { gap: 0.1, at, dur: 1 });
    if (!v) return;
    const { out, t } = v;
    this.#tone(out, t, { f: 300, to: 720, dur: 0.18, type: 'triangle', vol: 0.12 });
    this.#tone(out, t, { f: 420, to: 1000, dur: 0.14, vol: 0.06, delay: 0.1 });
    [880, 1320, 1760].forEach((f, i) => this.#tone(out, t, { f, dur: 0.5, vol: 0.05, delay: 0.16 + i * 0.05 }));
    this.#noise(out, t, { dur: 0.3, type: 'lowpass', f: 400, to: 3000, vol: 0.05 });
  }
  tag(at) {
    const v = this.#voice('tag', { gap: 0.1, at, dur: 0.4 });
    if (!v) return;
    const { out, t } = v;
    this.#noise(out, t, { dur: 0.18, f: 400, to: 2600, q: 1.5, vol: 0.1 });
    this.#tone(out, t, { f: 150, to: 55, dur: 0.16, vol: 0.2, delay: 0.1 });
    this.#tone(out, t, { f: 520, to: 780, dur: 0.1, type: 'triangle', vol: 0.07, delay: 0.1 });
  }
  stumble(at) {
    const v = this.#voice('stumble', { gap: 0.2, at, dur: 0.3, vol: 0.9 });
    if (!v) return;
    this.#noise(v.out, v.t, { dur: 0.12, type: 'lowpass', f: 600, to: 200, vol: 0.14 });
    this.#tone(v.out, v.t, { f: 110, to: 55, dur: 0.14, vol: 0.18 });
  }
  splash(at) {
    const v = this.#voice('splash', { gap: 0.25, at, dur: 0.5, prio: 0 });
    if (!v) return;
    const { out, t } = v;
    this.#noise(out, t, { dur: 0.3, f: 500, to: 1500, q: 0.8, vol: 0.09 });
    this.#tone(out, t, { f: 260, to: 620, dur: 0.07, vol: 0.07, delay: 0.04 });
    this.#tone(out, t, { f: 340, to: 800, dur: 0.07, vol: 0.06, delay: 0.14 });
  }
  // Call every frame for the local player; emits a soft step per stride.
  footstep(speed, dt, at) {
    if (speed < 1.2) { this.stride = 0; return; }
    this.stride += speed * dt;
    if (this.stride < 1.7) return;
    this.stride = 0;
    const v = this.#voice('step', { gap: 0.12, at, dur: 0.08, prio: 0, vol: 0.5 });
    if (v) this.#noise(v.out, v.t, { dur: 0.05, type: 'lowpass', f: 500 + Math.random() * 300, vol: 0.05 });
  }
  pickup(at) {
    const v = this.#voice('pickup', { gap: 0.1, at, dur: 0.4 });
    if (!v) return;
    this.#tone(v.out, v.t, { f: 988, dur: 0.08, vol: 0.09 });
    this.#tone(v.out, v.t, { f: 1319, dur: 0.25, vol: 0.09, delay: 0.07 });
  }
  reaction(kind, at) {
    if (kind === 'frozen') {
      const v = this.#voice('react-frozen', { gap: 0.15, at, dur: 0.3, prio: 0 });
      if (v) this.#tone(v.out, v.t, { f: 380, to: 220, dur: 0.18, type: 'triangle', vol: 0.06, delay: 0.05 });
    }
    if (kind === 'thaw') {
      const v = this.#voice('react-thaw', { gap: 0.15, at, dur: 0.3, prio: 0 });
      if (v) this.#tone(v.out, v.t, { f: 400, to: 620, dur: 0.15, type: 'triangle', vol: 0.06, delay: 0.1 });
    }
    if (kind === 'infected') {
      const v = this.#voice('react-infected', { gap: 0.2, at, dur: 0.5 });
      if (!v) return;
      this.#tone(v.out, v.t, { f: 330, to: 140, dur: 0.35, type: 'triangle', vol: 0.1, lp: 900 });
      this.#tone(v.out, v.t, { f: 392, to: 165, dur: 0.35, vol: 0.05, delay: 0.04 });
    }
    if (kind === 'escape') {
      const v = this.#voice('react-escape', { gap: 0.15, at, dur: 0.5 });
      if (!v) return;
      this.#note(v.out, v.t, 'marimba', 76, 0.6);
      this.#note(v.out, v.t, 'marimba', 83, 0.6, 0.1);
      this.#note(v.out, v.t, 'bell', 95, 0.5, 0.1);
    }
  }
  // Maze monster: 'rumble' (warning), 'spawn', 'windup' (growl), 'lunge' (whoosh).
  monster(kind, at) {
    const v = this.#voice(`monster-${kind}`, { gap: 0.3, at, dur: kind === 'rumble' ? 3 : 0.8, vol: 1.1 });
    if (!v) return;
    const { out, t } = v;
    if (kind === 'rumble') {
      this.#noise(out, t, { dur: 2.8, type: 'lowpass', f: 90, to: 220, vol: 0.16, attack: 1.2 });
      this.#tone(out, t, { f: 48, to: 62, dur: 2.8, type: 'triangle', vol: 0.16, attack: 1.4 });
    } else if (kind === 'spawn') {
      this.#tone(out, t, { f: 120, to: 40, dur: 0.4, vol: 0.28 });
      this.#noise(out, t, { dur: 0.5, type: 'lowpass', f: 1200, to: 200, vol: 0.14 });
      this.#tone(out, t, { f: 180, to: 90, dur: 0.5, type: 'sawtooth', vol: 0.08, delay: 0.15, lp: 700 });
    } else if (kind === 'windup') {
      this.#tone(out, t, { f: 95, to: 60, dur: 0.6, type: 'sawtooth', vol: 0.12, attack: 0.15, lp: 600 });
      this.#tone(out, t, { f: 101, to: 64, dur: 0.6, type: 'sawtooth', vol: 0.09, attack: 0.15, lp: 500 });
      this.#noise(out, t, { dur: 0.55, type: 'bandpass', f: 300, to: 700, q: 2, vol: 0.06, attack: 0.2 });
    } else if (kind === 'lunge') {
      this.#noise(out, t, { dur: 0.3, type: 'bandpass', f: 500, to: 2600, q: 1.2, vol: 0.14 });
      this.#tone(out, t, { f: 220, to: 120, dur: 0.25, type: 'sawtooth', vol: 0.1, lp: 900 });
    }
  }
  // n = 3, 2, 1 rising beeps; 0 = GO.
  countdown(n) {
    const v = this.#voice('countdown', { gap: 0, dur: 1 });
    if (!v) return;
    const { out, t } = v, up = 3 - Math.min(3, n);
    if (n > 0) {
      this.#tone(out, t, { f: midiToFreq(67 + up * 2), dur: 0.16, type: 'triangle', vol: 0.16 });
      this.#tone(out, t, { f: midiToFreq(79 + up * 2), dur: 0.09, vol: 0.05 });
    } else {
      [72, 76, 79, 84].forEach((m) => this.#tone(out, t, { f: midiToFreq(m), dur: 0.6, type: 'square', vol: 0.05, lp: 3000 }));
      this.#tone(out, t, { f: midiToFreq(96), dur: 0.5, vol: 0.06 });
      this.#noise(out, t, { dur: 0.25, f: 800, to: 5000, vol: 0.06 });
    }
  }
  win() {
    const v = this.#voice('stinger', { gap: 0.5, dur: 2, vol: 1.1 });
    if (!v) return;
    const { out, t } = v;
    [[72, 0], [76, 0.11], [79, 0.22], [84, 0.33], [88, 0.5]].forEach(([m, d]) => this.#note(out, t, 'marimba', m, 0.8, d));
    [84, 88, 91].forEach((m, i) => this.#note(out, t, 'bell', m, 0.7, 0.5 + i * 0.06));
    [60, 64, 67].forEach((m) => this.#tone(out, t, { f: midiToFreq(m), dur: 1, type: 'triangle', vol: 0.06, delay: 0.5, lp: 1800 }));
    this.#noise(out, t, { dur: 0.9, type: 'highpass', f: 6000, vol: 0.03, delay: 0.5 });
  }
  lose() {
    const v = this.#voice('stinger', { gap: 0.5, dur: 1.6 });
    if (!v) return;
    const { out, t } = v;
    [[67, 0], [64, 0.2], [60, 0.4]].forEach(([m, d]) => this.#tone(out, t, { f: midiToFreq(m), to: midiToFreq(m) * 0.96, dur: 0.35, type: 'triangle', vol: 0.12, delay: d, lp: 1400 }));
    this.#tone(out, t, { f: midiToFreq(55), to: midiToFreq(53), dur: 0.7, vol: 0.1, delay: 0.6 });
  }
  results() {
    const v = this.#voice('stinger', { gap: 0.5, dur: 1.5 });
    if (!v) return;
    [[67, 0], [72, 0.1], [76, 0.2], [79, 0.3]].forEach(([m, d]) => this.#note(v.out, v.t, 'marimba', m, 0.65, d));
    this.#note(v.out, v.t, 'bell', 91, 0.5, 0.35);
  }

  // ---- UI: 'hover' | 'click' | 'back' | 'toggle' | 'tick' (pitch in semitones) ---------------
  ui(kind, pitch = 0) {
    const v = this.#voice(`ui-${kind}`, { gap: kind === 'tick' ? 0.035 : 0.05, dur: 0.3, vol: 0.9 });
    if (!v) return;
    const { out, t } = v, k = 2 ** (pitch / 12);
    if (kind === 'hover') this.#tone(out, t, { f: 760 * k, to: 900 * k, dur: 0.05, vol: 0.05 });
    else if (kind === 'click') {
      this.#tone(out, t, { f: 520, to: 880, dur: 0.09, type: 'triangle', vol: 0.12 });
      this.#tone(out, t, { f: 1320, dur: 0.12, vol: 0.04, delay: 0.03 });
    } else if (kind === 'back') this.#tone(out, t, { f: 620, to: 330, dur: 0.1, type: 'triangle', vol: 0.11 });
    else if (kind === 'toggle') {
      this.#tone(out, t, { f: 600 * k, dur: 0.06, vol: 0.09 });
      this.#tone(out, t, { f: 900 * k, dur: 0.08, vol: 0.08, delay: 0.05 });
    } else if (kind === 'tick') this.#tone(out, t, { f: 500 * k, dur: 0.03, type: 'triangle', vol: 0.07 });
  }
}
