import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sfx } from '../docs/js/sfx.js';

class Param {
  constructor() { this.value = 0; }
  setTargetAtTime(v) { this.value = v; }
  setValueAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
}
class FakeContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.oscillators = []; }
  createGain() { return { gain: new Param(), connect: (destination) => destination }; }
  createOscillator() {
    const oscillator = { frequency: new Param(), connect: (destination) => destination, start() {}, stop() {} };
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

test('music and effects have independent volume and music stops scheduling while paused', () => {
  globalThis.window = { AudioContext: FakeContext };
  const sound = new Sfx();
  sound.unlock();
  sound.setVolumes(0, 0.6);
  sound.update(true);
  assert.equal(sound.ctx.oscillators.length, 0);
  sound.freeze();
  assert.equal(sound.ctx.oscillators.length, 2);
  sound.setVolumes(0.3, 0);
  sound.update(true);
  assert.equal(sound.ctx.oscillators.length, 3);
  assert.equal(sound.musicGain.gain.value, 0.3);
  assert.equal(sound.effectsGain.gain.value, 0);
  sound.ctx.currentTime = 2;
  sound.update(false);
  assert.equal(sound.ctx.oscillators.length, 3);
  sound.update(true);
  assert.equal(sound.ctx.oscillators.length, 4);
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
  assert.match(messages.at(-1), /enable audio/);
  sound.unlock();
  assert.equal(sound.ctx.calls, 1);
  sound.unlock(true);
  await Promise.resolve();
  assert.equal(sound.ctx.calls, 2);
  assert.equal(messages.at(-1), '');
});
