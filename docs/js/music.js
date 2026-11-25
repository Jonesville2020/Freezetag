// Procedural music: pure pattern generation + a lookahead step sequencer + tiny synth voices.
// Nothing here touches window/AudioContext at import time.

export const midiToFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
export const scaleNotes = (tonic, scale, lo, hi) => {
  const out = [];
  for (let m = lo; m <= hi; m++) if (SCALES[scale].includes(((m - tonic) % 12 + 12) % 12)) out.push(m);
  return out;
};
export const chordPitchClasses = (tonic, chord) => [0, chord.q === 'min' ? 3 : 4, 7].map((i) => (tonic + chord.r + i) % 12);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (text) => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const I = (r, q = 'maj') => ({ r, q });
// tonic is a MIDI note; lead/bass/drums pick instruments and grooves.
export const THEMES = {
  menu:     { bpm: 116, tonic: 60, scale: 'major',  prog: [I(0), I(9, 'min'), I(5), I(7)], lead: 'marimba', bass: 'pluck', drums: 'bounce', swing: 0.12, density: 1, level: 1 },
  results:  { bpm: 100, tonic: 65, scale: 'major',  prog: [I(0), I(7), I(9, 'min'), I(5)], lead: 'marimba', bass: 'pluck', drums: 'soft',   swing: 0.1,  density: 0.7, level: 0.9 },
  freeze:   { bpm: 132, tonic: 67, scale: 'major',  prog: [I(0), I(5), I(9, 'min'), I(7)], lead: 'marimba', bass: 'square', drums: 'drive', swing: 0.05, density: 1, level: 1 },
  tag:      { bpm: 140, tonic: 62, scale: 'major',  prog: [I(0), I(7), I(5), I(7)],        lead: 'chip',    bass: 'square', drums: 'drive', swing: 0,    density: 1, level: 0.95 },
  outbreak: { bpm: 128, tonic: 57, scale: 'minor',  prog: [I(0, 'min'), I(8), I(3), I(10)], lead: 'celesta', bass: 'pluck', drums: 'drive', swing: 0.06, density: 0.85, level: 1 },
  maze:     { bpm: 120, tonic: 60, scale: 'dorian', prog: [I(0, 'min'), I(5), I(0, 'min'), I(10)], lead: 'pizz', bass: 'pizz', drums: 'sneak', swing: 0.1, density: 0.6, level: 1 },
};
export const BARS = 16;
export const STEPS = 16;

const RHYTHMS = [
  [0, 3, 6, 8, 10, 12], [0, 2, 4, 7, 8, 11, 14], [0, 4, 6, 8, 12, 14], [0, 3, 6, 10, 12], [0, 2, 4, 8, 10, 12, 14],
];
const BASS_GROOVES = {
  bounce: [[0, 0], [3, 0], [6, 7], [8, 0], [11, 12], [14, 7]],
  soft: [[0, 0], [8, 7], [12, 0]],
  drive: [[0, 0], [2, 0], [4, 12], [6, 0], [8, 0], [10, 0], [12, 12], [14, 7]],
  sneak: [[0, 0], [6, 7], [8, 0], [14, 4]],
};
const DRUMS = {
  bounce: { kick: [0, 8, 10], clap: [4, 12], hat: [2, 6, 10, 14], shaker: [1, 3, 5, 7, 9, 11, 13, 15] },
  soft:   { kick: [0, 10], clap: [4, 12], hat: [2, 6, 10, 14], shaker: [] },
  drive:  { kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], shaker: [1, 3, 5, 7, 9, 11, 13, 15] },
  sneak:  { kick: [0, 10], clap: [], hat: [], shaker: [2, 6, 10, 14], wood: [4, 12] },
};

// Returns BARS arrays of events: {step, inst, midi?, dur, vel, layer}. layer 0 = always on, 1 percussion, 2 arpeggio, 3 sparkle.
export function buildPattern(name) {
  const t = THEMES[name];
  const bars = [];
  const phrases = ['A', 'B', 'A', 'C'];
  const melodyPool = scaleNotes(t.tonic, t.scale, t.tonic + 3, t.tonic + 19);
  let prev = t.tonic + 7;
  for (let bar = 0; bar < BARS; bar++) {
    const chord = t.prog[bar % 4], pcs = chordPitchClasses(t.tonic, chord);
    const events = [];
    const phrase = phrases[bar >> 2], rng = mulberry32(hash(`${name}:${phrase}:${bar & 3}`));
    const rhythm = RHYTHMS[Math.floor(rng() * RHYTHMS.length)];
    for (const step of rhythm) {
      if (rng() > t.density) continue;
      const strong = step % 4 === 0;
      const pool = strong ? melodyPool.filter((m) => pcs.includes(m % 12)) : melodyPool;
      const near = pool.map((m) => [m, Math.abs(m - prev) + rng() * 2.5]).sort((a, b) => a[1] - b[1]);
      prev = near[Math.min(near.length - 1, strong ? 0 : 1 + Math.floor(rng() * 2))][0];
      events.push({ step, inst: t.lead, midi: prev + (phrase === 'C' && bar >= 12 ? 12 : 0), dur: 0.22, vel: strong ? 0.5 : 0.38, layer: 0 });
    }
    const rootMidi = t.tonic + chord.r;
    const bassRoot = 36 + ((rootMidi - 36) % 12 + 12) % 12;
    for (const [step, off] of BASS_GROOVES[t.drums]) {
      events.push({ step, inst: t.bass, midi: bassRoot + (off === 12 ? 12 : off === 7 ? 7 : off === 4 ? (chord.q === 'min' ? 3 : 4) : 0), dur: 0.2, vel: 0.62, layer: 0 });
    }
    const d = DRUMS[t.drums];
    for (const step of d.kick) events.push({ step, inst: 'kick', vel: 0.8, layer: 0 });
    for (const step of d.clap) events.push({ step, inst: 'clap', vel: 0.4, layer: 0 });
    for (const step of d.hat) events.push({ step, inst: 'hat', vel: 0.22, layer: 0 });
    for (const step of d.wood ?? []) events.push({ step, inst: 'wood', vel: 0.35, layer: 0 });
    for (const step of d.shaker) events.push({ step, inst: 'shaker', vel: step % 4 === 3 ? 0.17 : 0.1, layer: 1 });
    if (t.drums !== 'soft') for (const step of [3, 11, 15]) events.push({ step, inst: 'kick', vel: 0.35, layer: 1 });
    if (bar % 4 === 3) for (const step of [12, 13, 14, 15]) events.push({ step, inst: 'wood', vel: 0.3, layer: 1 });
    const chordMidis = pcs.map((pc) => t.tonic + 12 + ((pc - t.tonic) % 12 + 12) % 12);
    for (let i = 0; i < 8; i++) {
      events.push({ step: i * 2, inst: t.lead === 'pizz' ? 'pizz' : 'pluckhi', midi: chordMidis[[0, 1, 2, 1][i % 4]] + (i >= 4 ? 12 : 0), dur: 0.14, vel: 0.2, layer: 2 });
    }
    for (const [step, i] of [[0, 2], [10, 1]]) {
      const midi = chordMidis[i] + 24 + (bar % 2 ? 0 : 0);
      events.push({ step, inst: 'bell', midi, dur: 0.9, vel: 0.2, layer: name === 'menu' && bar >= 8 ? 0 : 3 });
    }
    bars.push(events);
  }
  return bars;
}

export const layerLevel = (layer, intensity) => {
  const ranges = [null, [0.25, 0.45], [0.5, 0.7], [0.75, 0.9]];
  if (!ranges[layer]) return 1;
  const [a, b] = ranges[layer];
  return Math.max(0, Math.min(1, (intensity - a) / (b - a)));
};

// Time (s) of a 16th step on a swung grid, relative to the start of that step's pair.
export const stepDuration = (bpm) => 60 / bpm / 4;
export const swungOffset = (step, bpm, swing) => (step % 2 ? swing * stepDuration(bpm) : 0);

export function matchIntensity({ runner = true, frozen = false, nearestThreat = Infinity, timeLeft = Infinity, frozenFraction = 0 } = {}) {
  let i = 0.12;
  if (runner && !frozen) i = Math.max(i, Math.min(1, 1 - (nearestThreat - 4) / 12) * 0.85);
  if (!runner) i = Math.max(i, 0.3 + (1 - Math.min(1, nearestThreat / 10)) * 0.25);
  if (timeLeft < 20) i = Math.max(i, 0.6 + (1 - timeLeft / 20) * 0.4);
  i = Math.max(i, frozenFraction * 0.8);
  return Math.max(0, Math.min(1, i));
}

// Lookahead scheduler: call tick() often (timer or frame); it schedules every step falling inside the window.
export class Sequencer {
  constructor({ getTime, bpm, swing = 0, lookahead = 0.2, onStep }) {
    Object.assign(this, { getTime, bpm, swing, lookahead, onStep });
    this.step = 0;
    this.next = null;
  }
  tick() {
    const now = this.getTime();
    if (this.next === null || this.next < now - 0.1) this.next = now + 0.05;
    let count = 0;
    while (this.next < now + this.lookahead && count++ < 64) {
      this.onStep(this.step, this.next + swungOffset(this.step, this.bpm, this.swing));
      this.step++;
      this.next += stepDuration(this.bpm);
    }
    return count;
  }
}

// ---- synth voices (all take ctx, destination, start time) ----------------------------------------
let noiseBuffer = null;
const noise = (ctx) => {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    const rng = mulberry32(7);
    for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  }
  return noiseBuffer;
};
export const getNoise = noise;

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function osc(ctx, type, freq, t, end) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t); o.stop(end);
  return o;
}
function noiseHit(ctx, out, t, dur, filterType, freq, q, vol) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise(ctx);
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  env(g, t, vol, 0.002, dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function lowpassed(ctx, out, t, dur, from, to) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.connect(out);
  return f;
}

export const VOICES = {
  marimba(ctx, out, t, midi, vel, dur) {
    const f = midiToFreq(midi), g = ctx.createGain(), end = t + 0.5;
    env(g, t, vel * 0.5, 0.003, 0.32 * (1 + dur));
    g.connect(out);
    osc(ctx, 'sine', f, t, end).connect(g);
    const h = ctx.createGain(); h.gain.setValueAtTime(0.35, t); h.gain.exponentialRampToValueAtTime(0.001, t + 0.09); h.connect(g);
    osc(ctx, 'sine', f * 4, t, end).connect(h);
  },
  celesta(ctx, out, t, midi, vel) {
    const f = midiToFreq(midi), g = ctx.createGain(), end = t + 0.9;
    env(g, t, vel * 0.45, 0.003, 0.6);
    g.connect(out);
    osc(ctx, 'sine', f, t, end).connect(g);
    const h = ctx.createGain(); h.gain.value = 0.25; h.connect(g);
    osc(ctx, 'sine', f * 2.76, t, end).connect(h);
  },
  bell(ctx, out, t, midi, vel) {
    const f = midiToFreq(midi), g = ctx.createGain(), end = t + 1.4;
    env(g, t, vel * 0.4, 0.002, 1);
    g.connect(out);
    osc(ctx, 'sine', f, t, end).connect(g);
    const h = ctx.createGain(); h.gain.setValueAtTime(0.3, t); h.gain.exponentialRampToValueAtTime(0.001, t + 0.4); h.connect(g);
    osc(ctx, 'sine', f * 2.76, t, end).connect(h);
  },
  chip(ctx, out, t, midi, vel, dur) {
    const g = ctx.createGain(), end = t + 0.3;
    env(g, t, vel * 0.22, 0.004, 0.16 + dur * 0.2);
    g.connect(out);
    osc(ctx, 'square', midiToFreq(midi), t, end).connect(lowpassed(ctx, g, t, 0.2, 3500, 900));
  },
  pizz(ctx, out, t, midi, vel) {
    const g = ctx.createGain(), end = t + 0.25;
    env(g, t, vel * 0.55, 0.002, 0.1);
    g.connect(out);
    osc(ctx, 'triangle', midiToFreq(midi), t, end).connect(lowpassed(ctx, g, t, 0.12, 2800, 500));
  },
  pluckhi(ctx, out, t, midi, vel) {
    const g = ctx.createGain(), end = t + 0.25;
    env(g, t, vel * 0.5, 0.002, 0.12);
    g.connect(out);
    osc(ctx, 'triangle', midiToFreq(midi), t, end).connect(g);
  },
  pluck(ctx, out, t, midi, vel) {
    const g = ctx.createGain(), end = t + 0.35;
    env(g, t, vel * 0.7, 0.004, 0.22);
    g.connect(out);
    osc(ctx, 'triangle', midiToFreq(midi), t, end).connect(lowpassed(ctx, g, t, 0.25, 1400, 300));
  },
  square(ctx, out, t, midi, vel) {
    const g = ctx.createGain(), end = t + 0.3;
    env(g, t, vel * 0.3, 0.004, 0.18);
    g.connect(out);
    osc(ctx, 'square', midiToFreq(midi), t, end).connect(lowpassed(ctx, g, t, 0.18, 900, 250));
  },
  kick(ctx, out, t, midi, vel) {
    const g = ctx.createGain(), o = osc(ctx, 'sine', 140, t, t + 0.25);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    env(g, t, vel * 0.9, 0.002, 0.2);
    o.connect(g); g.connect(out);
  },
  clap(ctx, out, t, midi, vel) {
    noiseHit(ctx, out, t, 0.12, 'bandpass', 1500, 1.2, vel);
    noiseHit(ctx, out, t + 0.012, 0.1, 'bandpass', 1900, 1.2, vel * 0.6);
  },
  hat(ctx, out, t, midi, vel) { noiseHit(ctx, out, t, 0.04, 'highpass', 7500, 0.7, vel); },
  shaker(ctx, out, t, midi, vel) { noiseHit(ctx, out, t, 0.06, 'bandpass', 6000, 1.5, vel); },
  wood(ctx, out, t, midi, vel) {
    const g = ctx.createGain();
    env(g, t, vel, 0.001, 0.05);
    g.connect(out);
    osc(ctx, 'sine', 900, t, t + 0.08).connect(g);
  },
};

export class MusicEngine {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;
    this.tracks = [];
    this.current = null;
    this.intensity = 0;
  }
  // Fades in a new theme and fades any previous one out.
  play(name, { fade = 1.2, delay = 0 } = {}) {
    if (this.current?.name === name) return;
    const c = this.ctx, now = c.currentTime;
    for (const old of this.tracks) this.#fadeOut(old, fade, now);
    if (!THEMES[name]) { this.current = null; return; }
    const theme = THEMES[name], pattern = buildPattern(name);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.linearRampToValueAtTime(theme.level, now + delay + fade);
    gain.connect(this.destination);
    const track = { name, gain, dead: false };
    track.seq = new Sequencer({
      getTime: () => this.ctx.currentTime, bpm: theme.bpm, swing: theme.swing,
      onStep: (step, time) => {
        if (time < now + delay) return;
        const s = step % STEPS, bar = Math.floor(step / STEPS) % BARS;
        for (const ev of pattern[bar]) {
          if (ev.step !== s) continue;
          const level = layerLevel(ev.layer, this.intensity);
          if (level < 0.03) continue;
          VOICES[ev.inst](this.ctx, gain, time, ev.midi, ev.vel * level, ev.dur);
        }
      },
    });
    track.seq.next = now + delay + 0.05;
    this.tracks.push(track);
    this.current = track;
  }
  #fadeOut(track, fade, now) {
    if (track.dead) return;
    track.dead = true;
    track.gain.gain.cancelScheduledValues?.(now);
    track.gain.gain.setTargetAtTime(0.0001, now, fade / 4);
    track.expires = now + fade * 2 + 0.5;
  }
  stop(fade = 0.6) { this.play(null, { fade }); }
  tick() {
    const now = this.ctx.currentTime;
    this.tracks = this.tracks.filter((t) => {
      if (t.expires && now > t.expires) { try { t.gain.disconnect(); } catch { /* already gone */ } return false; }
      return true;
    });
    if (this.current && !this.current.dead) this.current.seq.tick();
  }
}
