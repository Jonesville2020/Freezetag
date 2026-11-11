import * as THREE from 'three';

export const SIZE = 64;
export const HALF = SIZE / 2;
export const WALL_H = 2.6;

// Walls are centred rectangles: [x, z, width, depth].
export const LAYOUTS = [
  {
    name: 'Street Circuit',
    floor: 0x679b7d, line: 0xe7f4ce, wall: 0xe6c6a4, trim: 0x947b6d,
    walls: [
      [-14, -12, 10, 3], [14, -12, 10, 3], [-14, 12, 10, 3], [14, 12, 10, 3],
      [0, 0, 3, 14], [-23, 0, 3, 10], [23, 0, 3, 10], [0, -23, 12, 2], [0, 23, 12, 2],
      [-6, -6, 3, 3], [6, 6, 3, 3], [-26, -22, 3, 8], [26, 22, 3, 8],
    ],
  },
  {
    name: 'Metro Plaza',
    floor: 0x889da2, line: 0xf0f0d7, wall: 0xd7d6c6, trim: 0x879a9a,
    walls: [
      [0, 0, 10, 10], [-18, -18, 4, 4], [18, -18, 4, 4], [-18, 18, 4, 4], [18, 18, 4, 4],
      [-18, 0, 2, 12], [18, 0, 2, 12], [0, -19, 12, 2], [0, 19, 12, 2],
      [-27, -8, 6, 2], [27, 8, 6, 2], [-8, 27, 2, 6], [8, -27, 2, 6],
    ],
  },
  {
    name: 'Warehouse Run',
    floor: 0x9a8b9b, line: 0xf2e5dd, wall: 0xdbbca0, trim: 0x907d91,
    walls: [
      [-20, -20, 2, 18], [-10, -14, 2, 18], [0, -20, 2, 18], [10, -14, 2, 18], [20, -20, 2, 18],
      [-20, 14, 2, 18], [-10, 20, 2, 18], [0, 14, 2, 18], [10, 20, 2, 18], [20, 14, 2, 18],
      [-26, 0, 8, 2], [26, 0, 8, 2], [0, 0, 6, 2],
    ],
  },
];

export class World {
  constructor(layoutIndex) {
    this.layout = typeof layoutIndex === 'number' ? LAYOUTS[layoutIndex % LAYOUTS.length] : layoutIndex;
    this.rects = this.layout.walls.map(([x, z, w, d]) => ({
      minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, x, z, w, d,
    }));
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
    this.group.add(treeTrunks, treeCrowns);

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
      mesh.userData = { border, bounds: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }, h };
      this.group.add(mesh);
      this.wallMeshes.push(mesh);
    };
    for (const r of this.rects) addWall(r.x, r.z, r.w, r.d);
    // Perimeter walls are visual only; resolve() clamps to the arena bounds.
    const t = 1.5;
    addWall(0, -HALF - t / 2, SIZE + t * 2, t, WALL_H + 0.6, true);
    addWall(0, HALF + t / 2, SIZE + t * 2, t, WALL_H + 0.6, true);
    addWall(-HALF - t / 2, 0, t, SIZE, WALL_H + 0.6, true);
    addWall(HALF + t / 2, 0, t, SIZE, WALL_H + 0.6, true);
  }

  // Pushes a circle out of walls and arena bounds.
  resolve(p, r) {
    p.x = Math.max(-HALF + r, Math.min(HALF - r, p.x));
    p.z = Math.max(-HALF + r, Math.min(HALF - r, p.z));
    for (let pass = 0; pass < 2; pass++) {
      for (const w of this.rects) {
        const cx = Math.max(w.minX, Math.min(p.x, w.maxX));
        const cz = Math.max(w.minZ, Math.min(p.z, w.maxZ));
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          const left = p.x - w.minX, right = w.maxX - p.x, up = p.z - w.minZ, down = w.maxZ - p.z;
          const m = Math.min(left, right, up, down);
          if (m === left) p.x = w.minX - r;
          else if (m === right) p.x = w.maxX + r;
          else if (m === up) p.z = w.minZ - r;
          else p.z = w.maxZ + r;
        }
      }
    }
  }

  // True if the segment a→b crosses any wall grown by `pad`.
  blocked(ax, az, bx, bz, pad = 0) {
    const dx = bx - ax, dz = bz - az;
    for (const w of this.rects) {
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

  // Line of sight between two characters. Walls are taller than anyone, so any
  // wall in the way blocks the view. Three rays (centre and both shoulders)
  // let a character peeking around a corner be seen.
  sees(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    if (l < 0.01) return true;
    const nx = -dz / l * 0.4, nz = dx / l * 0.4;
    return !this.blocked(a.x, a.z, b.x, b.z, 0)
      || !this.blocked(a.x, a.z, b.x + nx, b.z + nz, 0)
      || !this.blocked(a.x, a.z, b.x - nx, b.z - nz, 0);
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
    this.N = SIZE;
    this.open = new Uint8Array(this.N * this.N);
    for (let j = 0; j < this.N; j++) for (let i = 0; i < this.N; i++) {
      const x = i + 0.5 - HALF, z = j + 0.5 - HALF;
      let ok = Math.abs(x) < HALF - 0.7 && Math.abs(z) < HALF - 0.7;
      for (const w of this.rects) {
        if (!ok) break;
        const cx = Math.max(w.minX, Math.min(x, w.maxX)), cz = Math.max(w.minZ, Math.min(z, w.maxZ));
        if ((x - cx) ** 2 + (z - cz) ** 2 < 0.8 * 0.8) ok = false;
      }
      this.open[j * this.N + i] = ok ? 1 : 0;
    }
  }

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
        const cost = g[cur] + (di && dj ? 1.414 : 1);
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
