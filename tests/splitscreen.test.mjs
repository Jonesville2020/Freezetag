import test from 'node:test';
import assert from 'node:assert/strict';
import { slotRects, playerRects, normalizeSlots, assignSlot, padFor, keymapFor, inRect } from '../docs/js/splitscreen.js';

test('layouts tile the whole screen', () => {
  for (const n of [1, 2, 3, 4]) {
    const area = slotRects(801, 601, n).reduce((a, r) => a + r.w * r.h, 0);
    assert.equal(area, 801 * 601, `players=${n}`);
  }
});

test('slots stay a permutation and swap on assignment', () => {
  assert.deepEqual(normalizeSlots([1, 1, 7], 3), [1, 0, 2]);
  assert.deepEqual(assignSlot([0, 1], 2, 0, 1), [1, 0]);
  const rects = playerRects(100, 50, 2, [1, 0]);
  assert.equal(rects[0].x, 50);
  assert.ok(inRect(rects[1], 10, 10) && !inRect(rects[1], 60, 10));
});

test('keys: solo keeps WASD+arrows, split separates them', () => {
  assert.deepEqual(keymapFor(0, 1).up, ['KeyW', 'ArrowUp']);
  assert.deepEqual(keymapFor(0, 2).up, ['KeyW']);
  assert.deepEqual(keymapFor(1, 2).up, ['ArrowUp']);
  assert.deepEqual(keymapFor(2, 4).up, []);
});

test('gamepads: solo uses first; 2P one each; 3-4P P3/P4 first', () => {
  const pads = [{ index: 0, connected: true }, { index: 1, connected: true }, { index: 2, connected: false }];
  assert.equal(padFor(pads, 0, 1).index, 0);
  assert.equal(padFor(pads, 1, 2).index, 1);
  assert.equal(padFor(pads, 2, 4).index, 0);
  assert.equal(padFor(pads, 3, 4).index, 1);
  assert.equal(padFor(pads, 2, 3).index, 0);
  assert.equal(padFor(pads, 0, 3).index, 1);
  assert.equal(padFor(pads, 0, 4), null);
});

test('Input only reacts to its own keys and region', async () => {
  const listeners = {};
  globalThis.addEventListener = (t, f) => { (listeners[t] ??= []).push(f); };
  globalThis.innerWidth = 800;
  const nav = { getGamepads: () => [] };
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
  const { Input } = await import('../docs/js/input.js');
  const canvas = { addEventListener() {}, setPointerCapture() {} };
  const el = { style: {} };
  const mk = (i) => { const x = new Input(canvas, el, el); x.configure({ keymap: keymapFor(i, 2), region: null, slot: i, count: 2 }); return x; };
  const [a, b] = [mk(0), mk(1)];
  for (const f of listeners.keydown) f({ code: 'KeyW', target: {}, preventDefault() {} });
  for (const f of listeners.keydown) f({ code: 'ArrowLeft', target: {}, preventDefault() {} });
  assert.deepEqual(a.poll(0.016).move, { x: 0, y: 1 });
  assert.deepEqual(b.poll(0.016).move, { x: -1, y: 0 });
  b.enabled = false;
  for (const f of listeners.keydown) f({ code: 'ArrowUp', target: {}, preventDefault() {} });
  assert.equal(b.keys.has('ArrowUp'), false);
});
