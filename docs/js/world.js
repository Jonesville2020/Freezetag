import * as THREE from 'three';
import { LAYOUTS } from './maps.js';
import { buildProp } from './props.js';

export const SIZE = 64;
export const HALF = SIZE / 2;
export const WALL_H = 2.6;

export { LAYOUTS };

// Layout schema: { name, floor, line, wall, trim, walls: [[x,z,w,d]], props: [{type,x,z,w,d,h,sight?,soft?,traverse?}],
// zones: [{type,x,z,w,d,slow}], decor: [{type,x,z,w,d,h}] (visual only) }.
// Obstacle height classes (traverse metadata is reserved for future vault/climb/slide; nothing uses it yet):
//   low  h<1.1   blocks movement only (can see/tag over)    traverse 'vault'
//   mid  h<1.7   blocks movement; blocks sight when h>=1.5   traverse 'climb'
//   tall h>=1.7  walls and tall props block movement + sight traverse null
// prop.soft: passable (slightly slowing) but blocks sight, like a bush.
export const LOW_H = 1.1, TALL_H = 1.7, MID_SIGHT_H = 1.5;
const ZONE_COLORS = { mud: 0x6b4a2f, puddle: 0x6fb7e6, sand: 0xe3cf94, leaves: 0xd98a3a };
const SOFT_SLOW = 0.85;
const CELL = 4;
let softTexture = null;

function zoneTexture() {
  if (softTexture) return softTexture;
  const n = 32, data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const e = Math.min(i, j, n - 1 - i, n - 1 - j) / (n * 0.3);
    const a = Math.max(0, Math.min(1, e)), k = (j * n + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255;
    data[k + 3] = Math.round(a * a * (3 - 2 * a) * 255);
  }
  softTexture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  softTexture.needsUpdate = true;
  return softTexture;
}

function makeRect(x, z, w, d) {
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, x, z, w, d };
}

export function classify(h) { return h < LOW_H ? 'low' : h < TALL_H ? 'mid' : 'tall'; }

export class World {
  constructor(layoutIndex) {
    this.layout = typeof layoutIndex === 'number' ? LAYOUTS[layoutIndex % LAYOUTS.length] : layoutIndex;
    this.obstacles = [];
    for (const [x, z, w, d] of this.layout.walls) {
      this.obstacles.push({
        ...makeRect(x, z, w, d), kind: 'wall', type: 'wall', h: WALL_H, cls: 'tall', soft: false,
        blocksMove: true, blocksSight: true, traverse: null,
      });
    }
    for (const prop of this.layout.props ?? []) {
      const h = prop.h ?? 1, cls = classify(h), soft = !!prop.soft;
      this.obstacles.push({
        ...makeRect(prop.x, prop.z, prop.w, prop.d), kind: 'prop', type: prop.type, h, cls, soft, prop,
        blocksMove: !soft,
        blocksSight: prop.sight ?? (soft || h >= MID_SIGHT_H),
        traverse: soft ? null : prop.traverse !== undefined ? prop.traverse : cls === 'low' ? 'vault' : cls === 'mid' ? 'climb' : null,
      });
    }
    this.rects = this.obstacles.filter((o) => o.blocksMove); // everything that stops a walking character
    this.wallRects = this.obstacles.filter((o) => o.kind === 'wall');
    this.sightRects = this.obstacles.filter((o) => o.blocksSight);
    this.tagRects = this.sightRects.filter((o) => !o.soft);
    this.softRects = this.obstacles.filter((o) => o.soft);
    this.zones = (this.layout.zones ?? []).map((z) => ({ ...makeRect(z.x, z.z, z.w, z.d), type: z.type, slow: z.slow ?? 0.5 }));
    this.#buildBroadphase();
    this.group = new THREE.Group();
    this.wallMeshes = [];
    this.#buildMeshes();
    this.#buildNavGrid();
  }

  #buildMeshes() {
    const L = this.layout;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE),
      new THREE.MeshStandardMaterial({ color: L.floor, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x698b77, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    this.group.add(outer);

    const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(7.7, 7.7),
      new THREE.MeshBasicMaterial({ color: L.line, transparent: true, opacity: 0.07, depthWrite: false }), 32);
    const tileTransform = new THREE.Object3D();
    let tile = 0;
    for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
      if ((x + z) % 2) continue;
      tileTransform.position.set(-28 + x * 8, 0.005, -28 + z * 8);
      tileTransform.rotation.x = -Math.PI / 2;
      tileTransform.updateMatrix();
      tiles.setMatrixAt(tile++, tileTransform.matrix);
    }
    this.group.add(tiles);

    const treeTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x826957, roughness: 1 }), 32);
    const treeCrowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x619375, roughness: 1 }), 32);
    const tree = new THREE.Object3D();
    for (let i = 0; i < 32; i++) {
      const side = Math.floor(i / 8), offset = -29 + (i % 8) * 8.3;
      const x = side < 2 ? offset : side === 2 ? -38 : 38;
      const z = side < 2 ? side === 0 ? -38 : 38 : offset;
      tree.position.set(x, 1.4, z); tree.scale.set(1, 1, 1); tree.updateMatrix();
      treeTrunks.setMatrixAt(i, tree.matrix);
      tree.position.y = 3.6; tree.scale.set(1, 1.2, 1); tree.updateMatrix();
      treeCrowns.setMatrixAt(i, tree.matrix);
    }
    if (L.theme !== 'harbor') this.group.add(treeTrunks, treeCrowns);

    const lineMat = new THREE.MeshBasicMaterial({ color: L.line, transparent: true, opacity: 0.22 });
    const addLine = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, z);
      this.group.add(m);
    };
    for (let i = -HALF + 8; i < HALF; i += 8) { addLine(i, 0, 0.06, SIZE); addLine(0, i, SIZE, 0.06); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.8, 64), lineMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    this.group.add(ring);

    const wallMat = new THREE.MeshStandardMaterial({ color: L.wall, roughness: 0.8 });
    const trimMat = new THREE.MeshStandardMaterial({ color: L.trim, roughness: 0.8 });
    const addWall = (x, z, w, d, h = WALL_H, border = false) => {
      const mat = wallMat.clone();
      mat.transparent = true;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = mesh.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.14, d + 0.12), trimMat.clone());
      cap.position.y = h / 2;
      cap.material.transparent = true;
      mesh.add(cap);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.18, d + 0.05), trimMat.clone());
      base.position.y = -h / 2 + 0.18;
      base.material.transparent = true;
      mesh.add(base);
      mesh.userData = {
        border, bounds: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }, h,
        fadeMats: [mesh.material, cap.material, base.material],
      };
      this.group.add(mesh);
      this.wallMeshes.push(mesh);
    };
    for (const r of this.wallRects) addWall(r.x, r.z, r.w, r.d);

    for (const z of this.zones) {
      const mat = new THREE.MeshBasicMaterial({
        color: ZONE_COLORS[z.type] ?? 0x888888, map: zoneTexture(), transparent: true, opacity: 0.6, depthWrite: false,
      });
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), mat);
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(z.x, 0.015, z.z);
      this.group.add(decal);
    }
    for (const o of this.obstacles) {
      if (o.kind !== 'prop') continue;
      const obj = buildProp(o.prop, L);
      obj.position.set(o.x, 0, o.z);
      obj.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
      if (o.cls === 'tall' && !o.soft) {
        // Tall props fade like walls when they block the chase camera; give them private materials.
        const mats = [];
        obj.traverse((m) => {
          if (!m.isMesh) return;
          m.material = Array.isArray(m.material) ? m.material.map((q) => q.clone()) : m.material.clone();
          for (const q of [].concat(m.material)) { q.transparent = true; mats.push(q); }
        });
        obj.userData = { ...obj.userData, bounds: { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ }, h: o.h, fadeMats: mats };
        this.wallMeshes.push(obj);
      }
      this.group.add(obj);
    }
    for (const dec of this.layout.decor ?? []) {
      const obj = buildProp(dec, L);
      obj.position.set(dec.x, 0, dec.z);
      this.group.add(obj);
    }
    // Perimeter walls are visual only; resolve() clamps to the arena bounds.
    const t = 1.5;
    addWall(0, -HALF - t / 2, SIZE + t * 2, t, WALL_H + 0.6, true);
    addWall(0, HALF + t / 2, SIZE + t * 2, t, WALL_H + 0.6, true);
    addWall(-HALF - t / 2, 0, t, SIZE, WALL_H + 0.6, true);
    addWall(HALF + t / 2, 0, t, SIZE, WALL_H + 0.6, true);
  }

  #buildBroadphase() {
    this.cells = new Map();
    const n = Math.ceil(SIZE / CELL);
    this.cellsN = n;
    for (const o of this.rects) {
      const i0 = Math.max(0, Math.floor((o.minX + HALF) / CELL)), i1 = Math.min(n - 1, Math.floor((o.maxX + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((o.minZ + HALF) / CELL)), j1 = Math.min(n - 1, Math.floor((o.maxZ + HALF) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * n + i;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(o);
      }
    }
    this.stamp = 0;
  }

  #nearby(x, z, r) {
    const n = this.cellsN, c = (v) => Math.max(0, Math.min(n - 1, Math.floor((v + HALF) / CELL)));
    const out = [];
    const stamp = ++this.stamp;
    for (let j = c(z - r); j <= c(z + r); j++) for (let i = c(x - r); i <= c(x + r); i++) {
      const list = this.cells.get(j * n + i);
      if (!list) continue;
      for (const o of list) if (o.seen !== stamp) { o.seen = stamp; out.push(o); }
    }
    return out;
  }

  // Pushes a circle out of solid obstacles and arena bounds. Surfaces only push along their normal, so
  // characters slide along edges. If `out` is given it receives the deepest contact:
  // { depth, nx, nz, obstacle } (obstacle null when there was no contact).
  resolve(p, r, out) {
    if (out) { out.depth = 0; out.nx = 0; out.nz = 0; out.obstacle = null; }
    p.x = Math.max(-HALF + r, Math.min(HALF - r, p.x));
    p.z = Math.max(-HALF + r, Math.min(HALF - r, p.z));
    const near = this.#nearby(p.x, p.z, r + 0.2);
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const w of near) {
        const cx = Math.max(w.minX, Math.min(p.x, w.maxX));
        const cz = Math.max(w.minZ, Math.min(p.z, w.maxZ));
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        moved = true;
        let nx, nz, depth;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; depth = r - d;
          p.x = cx + nx * r;
          p.z = cz + nz * r;
        } else {
          const left = p.x - w.minX, right = w.maxX - p.x, up = p.z - w.minZ, down = w.maxZ - p.z;
          const m = Math.min(left, right, up, down);
          nx = 0; nz = 0; depth = m + r;
          if (m === left) { p.x = w.minX - r; nx = -1; }
          else if (m === right) { p.x = w.maxX + r; nx = 1; }
          else if (m === up) { p.z = w.minZ - r; nz = -1; }
          else { p.z = w.maxZ + r; nz = 1; }
        }
        if (out && depth > out.depth) { out.depth = depth; out.nx = nx; out.nz = nz; out.obstacle = w; }
      }
      p.x = Math.max(-HALF + r, Math.min(HALF - r, p.x));
      p.z = Math.max(-HALF + r, Math.min(HALF - r, p.z));
      if (!moved) return;
    }
    // Squeezed between obstacles: pop to the nearest walkable spot rather than staying wedged.
    for (const w of near) {
      const cx = Math.max(w.minX, Math.min(p.x, w.maxX)), cz = Math.max(w.minZ, Math.min(p.z, w.maxZ));
      if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < (r * 0.5) ** 2) {
        const s = this.snapOpen(p.x, p.z);
        p.x = s.x; p.z = s.z;
        return;
      }
    }
  }

  // Movement multiplier at a point: the strongest zone, or a little drag inside soft props such as bushes.
  zoneSlow(x, z) {
    let m = 1;
    for (const q of this.zones) if (x >= q.minX && x <= q.maxX && z >= q.minZ && z <= q.maxZ && q.slow < m) m = q.slow;
    for (const o of this.softRects) if (x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && SOFT_SLOW < m) m = SOFT_SLOW;
    return m;
  }

  // True if any zone lies along the segment (sampled every metre).
  zoneOnSegment(ax, az, bx, bz) {
    if (!this.zones.length) return false;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const q of this.zones) if (x >= q.minX && x <= q.maxX && z >= q.minZ && z <= q.maxZ) return true;
    }
    return false;
  }

  // True if the segment a→b crosses an obstacle grown by `pad`.
  // mode 'move': everything solid. 'sight': anything that blocks the view (soft props are skipped when
  // the viewer stands inside them). 'tag': sight blockers except soft ones, so bushes can't make you untaggable.
  blocked(ax, az, bx, bz, pad = 0, mode = 'move') {
    const list = mode === 'sight' ? this.sightRects : mode === 'tag' ? this.tagRects : this.rects;
    const dx = bx - ax, dz = bz - az;
    for (const w of list) {
      if (mode === 'sight' && w.soft && ax >= w.minX && ax <= w.maxX && az >= w.minZ && az <= w.maxZ) continue;
      let t0 = 0, t1 = 1;
      for (const [a, d, lo, hi] of [[ax, dx, w.minX - pad, w.maxX + pad], [az, dz, w.minZ - pad, w.maxZ + pad]]) {
        if (Math.abs(d) < 1e-9) { if (a < lo || a > hi) { t0 = 2; break; } continue; }
        let ta = (lo - a) / d, tb = (hi - a) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) break;
      }
      if (t0 <= t1) return true;
    }
    return false;
  }

  // Line of sight between two characters. Tall things block the view; low props do not. Three rays
  // (centre and both shoulders) let a character peeking around a corner be seen, and anyone within
  // arm's reach of a bush edge is spotted.
  sees(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    if (l < 0.01) return true;
    const nx = -dz / l * 0.4, nz = dx / l * 0.4;
    return !this.blocked(a.x, a.z, b.x, b.z, 0, 'sight')
      || !this.blocked(a.x, a.z, b.x + nx, b.z + nz, 0, 'sight')
      || !this.blocked(a.x, a.z, b.x - nx, b.z - nz, 0, 'sight');
  }

  // Nearest walkable point to (x, z), inside the arena.
  snapOpen(x, z) {
    const c = (v) => Math.max(-HALF + 1, Math.min(HALF - 1, v));
    x = c(x); z = c(z);
    if (this.isOpen(x, z)) return { x, z };
    const [i, j] = this.nearestOpen(x, z);
    return { x: i + 0.5 - HALF, z: j + 0.5 - HALF };
  }

  #buildNavGrid() {
    const N = this.N = SIZE;
    this.open = new Uint8Array(N * N);
    this.cost = new Float32Array(N * N).fill(1);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i + 0.5 - HALF, z = j + 0.5 - HALF;
      let ok = Math.abs(x) < HALF - 0.7 && Math.abs(z) < HALF - 0.7;
      for (const w of this.#nearby(x, z, 0.9)) {
        if (!ok) break;
        const cx = Math.max(w.minX, Math.min(x, w.maxX)), cz = Math.max(w.minZ, Math.min(z, w.maxZ));
        if ((x - cx) ** 2 + (z - cz) ** 2 < 0.8 * 0.8) ok = false;
      }
      this.open[j * N + i] = ok ? 1 : 0;
      this.cost[j * N + i] = 1 / this.zoneSlow(x, z);
    }
    this.#prunePockets();
  }

  // Flood fill over open cells (same adjacency as A*). Returns the component label per cell and sizes.
  #components() {
    const N = this.N, label = new Int32Array(N * N).fill(-1), sizes = [];
    for (let s = 0; s < N * N; s++) {
      if (!this.open[s] || label[s] !== -1) continue;
      const id = sizes.length;
      let count = 0;
      const stack = [s];
      label[s] = id;
      while (stack.length) {
        const c = stack.pop();
        count++;
        const ci = c % N, cj = (c / N) | 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const n = nj * N + ni;
          if (!this.open[n] || label[n] !== -1) continue;
          if (di && dj && (!this.open[cj * N + ni] || !this.open[nj * N + ci])) continue;
          label[n] = id;
          stack.push(n);
        }
      }
      sizes.push(count);
    }
    return { label, sizes };
  }

  // Keeps the walkable region around the arena centre and closes enclosed pockets so spawns and wander targets are always reachable.
  #prunePockets() {
    const { label, sizes } = this.#components();
    this.pockets = Math.max(0, sizes.length - 1);
    if (sizes.length <= 1) return;
    const [ci, cj] = this.nearestOpen(0, 0);
    const main = label[cj * this.N + ci] >= 0 ? label[cj * this.N + ci] : sizes.indexOf(Math.max(...sizes));
    for (let c = 0; c < label.length; c++) if (this.open[c] && label[c] !== main) this.open[c] = 0;
  }

  // True when every walkable cell can be reached from the arena centre (no enclosed pockets in the layout).
  isConnected() { return this.pockets === 0; }

  cellOf(x, z) {
    const c = (v) => Math.max(0, Math.min(this.N - 1, Math.floor(v + HALF)));
    return [c(x), c(z)];
  }

  isOpen(x, z) {
    const [i, j] = this.cellOf(x, z);
    return this.open[j * this.N + i] === 1;
  }

  nearestOpen(x, z) {
    const [ci, cj] = this.cellOf(x, z);
    for (let r = 0; r < 8; r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= this.N || j >= this.N) continue;
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        if (this.open[j * this.N + i]) return [i, j];
      }
    }
    return [ci, cj];
  }

  randomOpenPoint(rng = Math.random) {
    for (let n = 0; n < 200; n++) {
      const x = (rng() - 0.5) * (SIZE - 4), z = (rng() - 0.5) * (SIZE - 4);
      if (this.isOpen(x, z)) return { x, z };
    }
    return { x: 0, z: -HALF + 3 };
  }

  // A* over the 8-connected grid; returns world-space waypoints.
  path(ax, az, bx, bz) {
    const N = this.N;
    const [si, sj] = this.nearestOpen(ax, az), [gi, gj] = this.nearestOpen(bx, bz);
    const start = sj * N + si, goal = gj * N + gi;
    const g = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1);
    const closed = new Uint8Array(N * N);
    const heap = [[0, start]];
    g[start] = 0;
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) break;
      const ci = cur % N, cj = (cur / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = nj * N + ni;
        if (!this.open[n] || closed[n]) continue;
        if (di && dj && (!this.open[cj * N + ni] || !this.open[nj * N + ci])) continue;
        const cost = g[cur] + (di && dj ? 1.414 : 1) * (this.cost[n] + this.cost[cur]) / 2;
        if (cost < g[n]) {
          g[n] = cost; from[n] = cur;
          push([cost + Math.hypot(gi - ni, gj - nj), n]);
        }
      }
    }
    if (from[goal] === -1 && goal !== start) return [];
    const out = [];
    for (let c = goal; c !== -1 && c !== start; c = from[c]) out.push({ x: (c % N) + 0.5 - HALF, z: ((c / N) | 0) + 0.5 - HALF });
    return out.reverse();
  }
}
