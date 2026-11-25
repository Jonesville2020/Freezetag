import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sfx } from '../docs/js/sfx.js';
import { BARS, Sequencer, THEMES, buildPattern, layerLevel, matchIntensity, midiToFreq, scaleNotes, stepDuration } from '../docs/js/music.js';

class Param {
  constructor() { this.value = 0; }
  setTargetAtTime(v) { this.value = v; }
  setValueAtTime(v) { this.value = v; }
  linearRampToValueAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
  cancelScheduledValues() {}
}
class FakeNode {
  constructor(ctx, kind) {
    this.kind = kind; this.ctx = ctx;
    for (const k of ['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release', 'pan']) this[k] = new Param();
  }
  connect(node) { return node; }
  disconnect() {}
  start() { this.ctx.started[this.kind] = (this.ctx.started[this.kind] ?? 0) + 1; }
  stop() {}
}
class FakeContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.started = {}; }
  get oscillators() { return { length: this.started.osc ?? 0 }; }
  createGain() { return new FakeNode(this, 'gain'); }
  createOscillator() { return new FakeNode(this, 'osc'); }
  createBiquadFilter() { return new FakeNode(this, 'filter'); }
  createDynamicsCompressor() { return new FakeNode(this, 'comp'); }
  createStereoPanner() { return new FakeNode(this, 'pan'); }
  createBufferSource() { return new FakeNode(this, 'noise'); }
  createBuffer() { return { sampleRate: 8000, getChannelData: () => new Float32Array(8000) }; }
}

test('music and effects have independent volume and music stops scheduling while inactive', () => {
  globalThis.window = { AudioContext: FakeContext };
  const sound = new Sfx();
  sound.unlock();
  sound.setVolumes(0, 0.6);
  sound.update(true);
  assert.equal(sound.ctx.oscillators.length, 0);
  sound.freeze();
  const afterFreeze = sound.ctx.oscillators.length;
  assert.ok(afterFreeze >= 5);
  sound.setVolumes(0.3, 0);
  sound.update(true);
  const playing = sound.ctx.oscillators.length;
  assert.ok(playing > afterFreeze);
  assert.equal(sound.musicGain.gain.value, 0.3);
  assert.equal(sound.effectsGain.gain.value, 0);
  sound.ctx.currentTime = 2;
  sound.update(false);
  assert.equal(sound.ctx.oscillators.length, playing);
  sound.update(true);
  assert.ok(sound.ctx.oscillators.length > playing);
});

test('effects are rate limited, voice capped and attenuated by distance', () => {
  globalThis.window = { AudioContext: FakeContext };
  const sound = new Sfx();
  sound.unlock();
  sound.setListener({ x: 0, z: 0, rx: 1, rz: 0 });
  sound.freeze({ x: 100, z: 0 });
  assert.equal(sound.ctx.oscillators.length, 0);
  sound.freeze({ x: 1, z: 0 });
  const one = sound.ctx.oscillators.length;
  sound.freeze({ x: 1, z: 0 });
  assert.equal(sound.ctx.oscillators.length, one);
  for (let i = 0; i < 40; i++) { sound.ctx.currentTime += 0.2; sound.thaw(); }
  assert.ok(sound.voiceEnds.length <= 20);
});

test('a trusted gesture can retry audio while an earlier resume is pending', async () => {
  class SuspendedContext extends FakeContext {
    constructor() { super(); this.state = 'suspended'; this.calls = 0; }
    resume() {
      this.calls++;
      if (this.calls === 1) return new Promise(() => {});
      this.state = 'running';
      return Promise.resolve();
    }
  }
  globalThis.window = { AudioContext: SuspendedContext };
  const messages = [];
  const sound = new Sfx({ report: (message) => messages.push(message) });
  sound.unlock();
  assert.match(messages.at(-1), /enable sound/);
  sound.unlock();
  assert.equal(sound.ctx.calls, 1);
  sound.unlock(true);
  await Promise.resolve();
  assert.equal(sound.ctx.calls, 2);
  assert.equal(messages.at(-1), '');
});

test('notes, scales and patterns are pure and deterministic', () => {
  assert.equal(midiToFreq(69), 440);
  assert.ok(Math.abs(midiToFreq(60) - 261.63) < 0.01);
  assert.deepEqual(scaleNotes(60, 'major', 60, 72), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.deepEqual(buildPattern('menu'), buildPattern('menu'));
  for (const name of Object.keys(THEMES)) {
    const bars = buildPattern(name);
    assert.equal(bars.length, BARS);
    const lead = bars.flat().filter((e) => e.inst === THEMES[name].lead && e.layer === 0);
    assert.ok(lead.length > 8, name);
    assert.ok(lead.every((e) => Number.isFinite(e.midi) && e.step >= 0 && e.step < 16));
  }
  assert.notDeepEqual(buildPattern('freeze'), buildPattern('outbreak'));
});

test('sequencer schedules every step once on the audio clock with swing', () => {
  let now = 0;
  const hits = [];
  const seq = new Sequencer({ getTime: () => now, bpm: 120, swing: 0.2, lookahead: 0.2, onStep: (step, time) => hits.push([step, time]) });
  for (let i = 0; i < 100; i++) { now += 0.016; seq.tick(); }
  assert.deepEqual(hits.map(([s]) => s), hits.map((_, i) => i));
  const dur = stepDuration(120);
  assert.ok(Math.abs(hits[1][1] - hits[0][1] - dur * 1.2) < 1e-9);
  assert.ok(Math.abs(hits[2][1] - hits[0][1] - dur * 2) < 1e-9);
  assert.ok(hits.at(-1)[1] <= now + 0.2 + dur * 0.2);
});

test('intensity fades in layers and rises for chases, low time and frozen runners', () => {
  assert.equal(layerLevel(0, 0), 1);
  assert.equal(layerLevel(1, 0.2), 0);
  assert.equal(layerLevel(1, 0.45), 1);
  assert.ok(layerLevel(2, 0.4) === 0 && layerLevel(2, 0.6) > 0 && layerLevel(3, 0.8) > 0 && layerLevel(3, 0.7) === 0);
  const calm = matchIntensity({ nearestThreat: 40, timeLeft: 90 });
  const chased = matchIntensity({ nearestThreat: 5, timeLeft: 90 });
  assert.ok(chased > calm && chased > 0.75);
  assert.ok(matchIntensity({ nearestThreat: 40, timeLeft: 5 }) >= 0.85);
  assert.ok(matchIntensity({ nearestThreat: 40, timeLeft: 90, frozenFraction: 0.9 }) > 0.7);
});
