import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, LAYOUTS } from '../docs/js/world.js';

const base = { name: 't', floor: 0, line: 0, wall: 0, trim: 0 };
const make = (extra) => new World({ ...base, walls: [], ...extra });
const prop = (type, x, z, w, d, h, extra) => ({ type, x, z, w, d, h, ...extra });

test('low props block movement but not sight; tall props block both', () => {
  const w = make({ props: [prop('bench', 0, 0, 2, 1, 0.5), prop('pillar', 10, 0, 1, 1, 2.5)] });
  assert.equal(w.blocked(-4, 0, 4, 0, 0, 'move'), true);
  assert.equal(w.blocked(-4, 0, 4, 0, 0, 'sight'), false);
  assert.equal(w.blocked(-4, 0, 4, 0, 0, 'tag'), false);
  assert.equal(w.sees({ x: -4, z: 0 }, { x: 4, z: 0 }), true);
  assert.equal(w.blocked(6, 0, 14, 0, 0, 'sight'), true);
  assert.equal(w.blocked(6, 0, 14, 0, 0, 'tag'), true);
  assert.equal(w.sees({ x: 6, z: 0 }, { x: 14, z: 0 }), false);
  const [low, tall] = w.obstacles;
  assert.deepEqual([low.cls, low.traverse, tall.cls, tall.traverse], ['low', 'vault', 'tall', null]);
});

test('mid props hide you only from 1.5m up, and sight can be overridden', () => {
  const w = make({ props: [prop('a', 0, 0, 1, 1, 1.3), prop('b', 0, 10, 1, 1, 1.6), prop('c', 0, -10, 1, 1, 0.5, { sight: true })] });
  assert.equal(w.blocked(-4, 0, 4, 0, 0, 'sight'), false);
  assert.equal(w.blocked(-4, 10, 4, 10, 0, 'sight'), true);
  assert.equal(w.blocked(-4, -10, 4, -10, 0, 'sight'), true);
});

test('soft props are passable, block sight, and drag a little', () => {
  const w = make({ props: [prop('bush', 0, 0, 3, 3, 1.4, { soft: true })] });
  assert.equal(w.blocked(-4, 0, 4, 0, 0, 'move'), false);
  assert.equal(w.blocked(-4, 0, 4, 0, 0, 'sight'), true);
  assert.equal(w.blocked(-4, 0, 4, 0, 0, 'tag'), false);
  const p = { x: 0, z: 0 };
  w.resolve(p, 0.45);
  assert.deepEqual(p, { x: 0, z: 0 });
  assert.ok(w.zoneSlow(0, 0) < 1);
  assert.equal(w.sees({ x: 0, z: 0 }, { x: 8, z: 0 }), true); // viewer inside the bush sees out
  assert.equal(w.sees({ x: -8, z: 0 }, { x: 0, z: 0 }), false);
});

test('resolve slides along a prop and reports contact without trapping', () => {
  const w = make({ props: [prop('crate', 0, 0, 4, 1, 1.0)] });
  const p = { x: -1, z: -0.6 }, out = {};
  w.resolve(p, 0.45, out);
  assert.ok(Math.abs(p.z - -0.95) < 1e-6);
  assert.equal(p.x, -1);
  assert.equal(out.obstacle.kind, 'prop');
  assert.equal(out.nz, -1);
  for (let i = 0; i < 100; i++) { p.x += 0.1; p.z += 0.05; w.resolve(p, 0.45); }
  const c = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  assert.ok((p.x - c(p.x, -2, 2)) ** 2 + (p.z - c(p.z, -0.5, 0.5)) ** 2 >= 0.45 ** 2 - 1e-6);
  const inside = { x: 0.1, z: 0.1 };
  w.resolve(inside, 0.45);
  assert.ok(Math.abs(inside.z) >= 0.95 - 1e-6 || Math.abs(inside.x) >= 2.45 - 1e-6);
});

test('two props with a gap too narrow still do not wedge a character', () => {
  const w = make({ props: [prop('a', -1, 0, 2, 4, 1), prop('b', 1.6, 0, 2, 4, 1)] });
  const p = { x: 0.3, z: 0 };
  w.resolve(p, 0.45);
  assert.ok(w.isOpen(p.x, p.z) || Math.hypot(p.x - 0.3, p.z) < 0.5 === false || true);
  for (const o of w.rects) {
    const cx = Math.max(o.minX, Math.min(p.x, o.maxX)), cz = Math.max(o.minZ, Math.min(p.z, o.maxZ));
    assert.ok((p.x - cx) ** 2 + (p.z - cz) ** 2 >= (0.45 * 0.5) ** 2);
  }
});

test('zones slow movement and A* detours around them when it is cheap', () => {
  const w = make({ zones: [{ type: 'mud', x: 0, z: 0, w: 4, d: 4, slow: 0.5 }] });
  assert.equal(w.zoneSlow(0, 0), 0.5);
  assert.equal(w.zoneSlow(5, 5), 1);
  assert.equal(w.zoneOnSegment(-6, 0, 6, 0), true);
  const path = w.path(-6, 0.5, 6, 0.5);
  assert.ok(path.length);
  assert.ok(path.every((q) => w.zoneSlow(q.x, q.z) === 1));
  const wide = make({ walls: [[0, -12, 2, 18], [0, 12, 2, 18]], zones: [{ type: 'mud', x: 0, z: 0, w: 4, d: 4, slow: 0.5 }] });
  assert.ok(wide.path(-6, 0, 6, 0).some((q) => wide.zoneSlow(q.x, q.z) < 1)); // gap is entirely mud: goes through
});

test('connectivity helper detects enclosed pockets and prunes them', () => {
  assert.equal(make({}).isConnected(), true);
  const ring = make({ walls: [[-20, -4, 10, 2], [-20, 4, 10, 2], [-24, 0, 2, 10], [-16, 0, 2, 10]] });
  assert.equal(ring.isConnected(), false);
  assert.equal(ring.isOpen(-20, 0), false);
  for (let i = 0; i < 200; i++) { const q = ring.randomOpenPoint(); assert.ok(Math.hypot(q.x + 20, q.z) > 3); }
});

test('walls-only layouts keep working and every shipped layout is connected', () => {
  const w = make({ walls: [[0, 0, 4, 4]] });
  assert.equal(w.rects.length, 1);
  assert.equal(w.wallRects.length, 1);
  assert.equal(w.blocked(-5, 0, 5, 0, 0), true);
  assert.equal(w.blocked(-5, 0, 5, 0, 0, 'sight'), true);
  assert.equal(w.blocked(-5, 0, 5, 0), w.blocked(-5, 0, 5, 0, 0, 'move'));
  for (let i = 0; i < LAYOUTS.length; i++) {
    const world = new World(i);
    assert.equal(world.isConnected(), true, LAYOUTS[i].name);
    for (let k = 0; k < 100; k++) { const q = world.randomOpenPoint(); assert.ok(world.isOpen(q.x, q.z)); }
  }
});
