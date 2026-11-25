import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LAYOUTS } from '../docs/js/maps.js';
import { PROP_TYPES, buildProp } from '../docs/js/props.js';

const HALF = 32;
const rectOf = (x, z, w, d) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
const wallRects = (L) => L.walls.map(([x, z, w, d]) => ({ ...rectOf(x, z, w, d), kind: 'wall' }));
const propRects = (L) => L.props.map((p) => ({ ...rectOf(p.x, p.z, p.w, p.d), kind: 'prop', p }));
const solidRects = (L) => [...wallRects(L), ...propRects(L).filter((r) => !r.p.soft)];
const distToRect = (r, x, z) => Math.hypot(x - Math.max(r.minX, Math.min(x, r.maxX)), z - Math.max(r.minZ, Math.min(z, r.maxZ)));
const overlap = (a, b) => ({ x: Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX), z: Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) });
const label = (r) => (r.p ? `${r.p.type}@${r.p.x},${r.p.z}` : `wall@${(r.minX + r.maxX) / 2},${(r.minZ + r.maxZ) / 2}`);

// 1 m nav grid like World: a cell is open if its centre is >= 0.8 m from every solid and >= 0.7 m from the edge.
function floodFill(L, extraBlocked = []) {
  const N = 64, rects = [...solidRects(L), ...extraBlocked];
  const open = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i + 0.5 - HALF, z = j + 0.5 - HALF;
    open[j * N + i] = Math.abs(x) < HALF - 0.7 && Math.abs(z) < HALF - 0.7 && rects.every((r) => distToRect(r, x, z) >= 0.8) ? 1 : 0;
  }
  const seen = new Uint8Array(N * N);
  const start = (N / 2) * N + N / 2;
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const c = queue.pop(), ci = c % N, cj = (c / N) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = ci + di, nj = cj + dj, n = nj * N + ni;
      if ((!di && !dj) || ni < 0 || nj < 0 || ni >= N || nj >= N || !open[n] || seen[n]) continue;
      if (di && dj && (!open[cj * N + ni] || !open[nj * N + ci])) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  const total = open.reduce((a, b) => a + b, 0);
  return { open, seen, total, reached: seen.reduce((a, b) => a + b, 0), N };
}

test('five maps with unique names', () => {
  assert.equal(LAYOUTS.length, 5);
  assert.equal(new Set(LAYOUTS.map((l) => l.name)).size, 5);
  for (const n of ['Street Circuit', 'Metro Plaza', 'Warehouse Run']) assert.ok(LAYOUTS.some((l) => l.name === n));
});

for (const L of LAYOUTS) {
  test(`${L.name}: schema and bounds`, () => {
    for (const k of ['name', 'theme']) assert.equal(typeof L[k], 'string');
    for (const k of ['floor', 'line', 'wall', 'trim']) assert.equal(typeof L[k], 'number');
    for (const k of ['walls', 'props', 'zones', 'decor']) assert.ok(Array.isArray(L[k]), k);
    for (const w of L.walls) assert.ok(w.length === 4 && w.every(Number.isFinite));
    for (const r of [...wallRects(L), ...propRects(L), ...L.zones.map((z) => rectOf(z.x, z.z, z.w, z.d))]) {
      assert.ok(r.minX >= -HALF - 1e-6 && r.maxX <= HALF + 1e-6 && r.minZ >= -HALF - 1e-6 && r.maxZ <= HALF + 1e-6, `out of bounds: ${label(r)}`);
    }
    for (const z of L.zones) {
      assert.ok(['mud', 'puddle', 'sand', 'leaves'].includes(z.type), z.type);
      assert.ok(z.slow > 0 && z.slow < 1);
    }
    assert.ok(L.zones.length >= 3, 'needs slow patches');
    for (const p of L.props) {
      assert.ok(PROP_TYPES[p.type] && !PROP_TYPES[p.type].decor, `unknown prop ${p.type}`);
      assert.ok([undefined, 0, 90, 180, 270].includes(p.rot));
      assert.ok(p.w > 0 && p.d > 0 && p.h > 0);
      assert.ok([undefined, 'vault', 'climb', 'slide'].includes(p.traverse));
      if (p.traverse === 'vault') assert.ok(p.h <= 1.05, `vault too tall ${label({ p })}`);
      if (p.traverse === 'climb') assert.ok(p.h > 1.0 && p.h <= 1.7, `climb height ${label({ p })}`);
    }
    for (const d of L.decor) assert.ok(PROP_TYPES[d.type], `unknown decor ${d.type}`);
  });

  test(`${L.name}: content budget and variety`, () => {
    const solids = L.props.filter((p) => !p.soft);
    assert.ok(solids.length <= 70, `solids ${solids.length}`);
    assert.ok(L.props.length <= 85, `props ${L.props.length}`);
    const hides = L.props.filter((p) => p.soft || (p.sight !== false && p.h >= 1.5)).length + L.walls.length;
    assert.ok(hides >= 6, `hide spots ${hides}`);
    const low = solids.filter((p) => p.h <= 1.0).length;
    assert.ok(low >= 8, `low objects ${low}`);
    assert.ok(L.zones.length <= 8);
  });

  test(`${L.name}: no bad overlaps or sliver gaps`, () => {
    const bad = [];
    const all = [...wallRects(L), ...propRects(L)];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.kind === 'wall' && b.kind === 'wall') continue;
      if (a.p?.soft && b.p?.soft) continue;
      const o = overlap(a, b);
      if (o.x > 0.3 && o.z > 0.3) bad.push(`overlap ${label(a)} / ${label(b)}`);
    }
    const solids = solidRects(L);
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j], o = overlap(a, b);
      if (-o.x >= 0.8 && -o.x < 1.4 && o.z > 0.3) bad.push(`sliver gap ${(-o.x).toFixed(2)} ${label(a)} / ${label(b)}`);
      if (-o.z >= 0.8 && -o.z < 1.4 && o.x > 0.3) bad.push(`sliver gap ${(-o.z).toFixed(2)} ${label(a)} / ${label(b)}`);
    }
    for (const r of solids) {
      for (const g of [r.minX + HALF, HALF - r.maxX, r.minZ + HALF, HALF - r.maxZ]) if (g >= 0.8 && g < 1.4) bad.push(`sliver to edge ${g.toFixed(2)} ${label(r)}`);
    }
    assert.deepEqual(bad, []);
  });

  test(`${L.name}: spawn area clear and map connected`, () => {
    for (const r of [...wallRects(L), ...propRects(L)]) assert.ok(distToRect(r, 0, 0) >= 6, `blocks spawn: ${label(r)}`);
    const { total, reached } = floodFill(L);
    assert.ok(reached / total >= 0.95, `connected ${reached}/${total}`);
    const slow = floodFill(L, L.zones.map((z) => ({ ...rectOf(z.x, z.z, z.w, z.d) })));
    assert.ok(slow.reached >= reached - 0.1 * total, 'slow zones must not cut routes');
  });

  test(`${L.name}: no open area is sealed off from the spawn`, () => {
    const { open, seen, N } = floodFill(L);
    const lost = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (open[j * N + i] && !seen[j * N + i]) lost.push([i - 31.5, j - 31.5]);
    assert.equal(lost.length, 0, `unreachable open cells: ${JSON.stringify(lost.slice(0, 6))}`);
  });

  test(`${L.name}: every prop builds with a matching footprint`, () => {
    for (const p of [...L.props, ...L.decor]) {
      const obj = buildProp(p, L);
      assert.ok(obj instanceof THREE.Object3D);
      let meshes = 0;
      obj.traverse((o) => { if (o.isMesh && o.geometry) meshes++; });
      assert.ok(meshes > 0, `empty ${p.type}`);
      if (PROP_TYPES[p.type].decor) continue;
      const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      const tol = (v, t) => Math.abs(v / t - 1) <= 0.15;
      if (PROP_TYPES[p.type].overhang) {
        assert.ok(size.x >= p.w * 0.85 && size.z >= p.d * 0.85, `${p.type} too small`);
      } else {
        assert.ok(tol(size.x, p.w) && tol(size.z, p.d), `${p.type}@${p.x},${p.z} footprint ${size.x.toFixed(2)}x${size.z.toFixed(2)} vs ${p.w}x${p.d}`);
      }
      assert.ok(Math.abs(size.y / p.h - 1) <= 0.2, `${p.type}@${p.x},${p.z} height ${size.y.toFixed(2)} vs ${p.h}`);
    }
  });
}
