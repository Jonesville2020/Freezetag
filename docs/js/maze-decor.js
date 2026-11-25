import * as THREE from 'three';

// Visuals for Maze Dash: a hedge maze with stone plinths, corner posts, lanterns, banners and flowers,
// plus the glowing exit gate and the start pad. Everything is instanced or built from a handful of
// meshes so four split-screen views stay cheap. Textures are generated procedurally (no DOM needed) and
// cached; materials and geometries are created per call so the match cleanup can dispose them.

export const MAZE_ATMOSPHERE = { color: 0x7d9a8e, near: 9, far: 40 };
export const EXIT_COLOR = 0x64e5ff;
const START_COLOR = 0xffd36b;
const HEDGE_H = 2.5, POST_H = 3.0;

const frac = (v) => v - Math.floor(v);
const hash = (x, y, s) => frac(Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453);
const mulberry = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Tileable value noise on a lattice of `period` cells; x, y in 0..1.
function noise(x, y, period, seed) {
  const fx = x * period, fy = y * period, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const p = (i, j) => hash(((i % period) + period) % period, ((j % period) + period) % period, seed);
  const a = p(ix, iy), b = p(ix + 1, iy), c = p(ix, iy + 1), d = p(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function dataTexture(n, pixel, { repeat = 1, anisotropy = 8 } = {}) {
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [r, g, b, a = 1] = pixel(i, j, i / n, j / n), k = (j * n + i) * 4;
    data[k] = Math.max(0, Math.min(255, r * 255));
    data[k + 1] = Math.max(0, Math.min(255, g * 255));
    data[k + 2] = Math.max(0, Math.min(255, b * 255));
    data[k + 3] = a * 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const cache = {};
const once = (key, make) => cache[key] ??= make();

const leafTexture = () => once('leaf', () => dataTexture(128, (i, j, u, v) => {
  const n = 0.5 * noise(u, v, 8, 1) + 0.3 * noise(u, v, 16, 2) + 0.2 * noise(u, v, 32, 3);
  const fleck = hash(i >> 1, j >> 1, 9) > 0.9 ? 0.72 : 1;
  const l = (0.6 + n * 0.5) * fleck;
  return [l, l, l];
}));

export const grassTexture = () => once('grass', () => dataTexture(128, (i, j, u, v) => {
  const n = 0.5 * noise(u, v, 8, 4) + 0.3 * noise(u, v, 16, 5) + 0.2 * noise(u, v, 32, 6);
  const blade = hash(i, j, 7) > 0.8 ? 1.12 : 1;
  const l = (0.68 + n * 0.45) * blade;
  return [l * 0.92, l, l * 0.85];
}, { repeat: 16 }));

// Running-bond flagstones, four rows of 32px stones per cell with darker grout and softened edges.
const flagTexture = () => once('flag', () => dataTexture(128, (i, j, u, v) => {
  const row = Math.floor(j / 32), x = (i + (row % 2) * 16) % 128, col = Math.floor(x / 32);
  const dx = Math.min(x % 32, 31 - (x % 32)), dy = Math.min(j % 32, 31 - (j % 32)), edge = Math.min(dx, dy);
  const grout = edge < 1.2 ? 0.68 : edge < 3 ? 0.93 : 1;
  const stone = 0.9 + hash(col, row, 11) * 0.12;
  const speck = 0.96 + noise(u, v, 32, 12) * 0.08;
  const l = grout * stone * speck;
  return [l, l * 0.98, l * 0.93];
}));

const glowTexture = () => once('glow', () => dataTexture(64, (i, j) => {
  const d = Math.hypot(i - 31.5, j - 31.5) / 32, a = Math.max(0, 1 - d);
  return [1, 1, 1, a * a * (3 - 2 * a)];
}, { anisotropy: 1 }));

const beamTexture = () => once('beam', () => dataTexture(32, (i, j) => {
  const t = j / 31, a = Math.pow(1 - t, 1.4) * Math.min(1, t * 8);
  return [1, 1, 1, a];
}, { anisotropy: 1 }));

const unitBox = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const decalMat = (params) => new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...params,
});

function instanced(geometry, material, count, { cast = true, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// Fill an instanced mesh from rows of { x, y, z, sx, sy, sz, ry?, color }.
function fill(mesh, rows) {
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  rows.forEach((r, i) => {
    dummy.position.set(r.x, r.y, r.z);
    dummy.rotation.set(0, r.ry ?? 0, 0);
    dummy.scale.set(r.sx, r.sy, r.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.set(r.color));
  });
  mesh.count = rows.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l).getHex();

// Builds hedges, plinths, corner posts, lanterns, banners, flowers, floor tiles and the start pad for layout.maze.
export function buildMazeVisuals(layout) {
  const m = layout.maze, rnd = mulberry(m.seed ?? 1), group = new THREE.Group();
  const { size, cellSize: C, origin } = m;
  const horizontal = (s) => s.w > s.d;

  // Floor: flagstone path in every cell, tinted like a checker; rooms get a warmer, rosier stone.
  const roomCell = new Set(m.rooms.flatMap((r) => r.cells));
  const tiles = instanced(new THREE.PlaneGeometry(C, C).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    size * size, { cast: false });
  const tileRows = [];
  for (let cell = 0; cell < size * size; cell++) {
    const x = cell % size, z = Math.floor(cell / size), checker = (x + z) % 2;
    const base = roomCell.has(cell) ? (checker ? 0xcdaea0 : 0xd8baa8) : checker ? 0xbdb08f : 0xcdc09e;
    const c = new THREE.Color(base).multiplyScalar(0.94 + hash(x, z, 21) * 0.1);
    tileRows.push({ x: origin + (x + 0.5) * C, y: 0.02, z: origin + (z + 0.5) * C, sx: 1, sy: 1, sz: 1, color: c.getHex() });
  }
  group.add(fill(tiles, tileRows));

  // Hedges: body + overhanging leafy cap on a mossy stone plinth. Colours are seeded per segment.
  const n = m.segments.length;
  const leaf = leafTexture();
  const bodies = instanced(unitBox(), new THREE.MeshStandardMaterial({ map: leaf, roughness: 1 }), n);
  const caps = instanced(unitBox(), new THREE.MeshStandardMaterial({ map: leaf, roughness: 1 }), n);
  const plinths = instanced(unitBox(), new THREE.MeshStandardMaterial({ roughness: 0.9 }), n);
  const bodyRows = [], capRows = [], plinthRows = [], flowerRows = [];
  const flowerColors = [0xfff2f2, 0xff9fc2, 0xffe27a, 0xc8a2ff, 0xff7f7f];
  m.segments.forEach((s, idx) => {
    const len = horizontal(s) ? s.w : s.d, h = hash(s.x, s.z, 3);
    const hue = 0.28 + hash(s.x, s.z, 1) * 0.05, light = 0.26 + hash(s.x, s.z, 2) * 0.09;
    const place = (t, y, sy, color) => ({
      x: s.x, y, z: s.z, sx: horizontal(s) ? len : t, sy, sz: horizontal(s) ? t : len, color,
    });
    bodyRows.push(place(0.9, 0.3, HEDGE_H - 0.5 - h * 0.1, hsl(hue, 0.5, light)));
    capRows.push(place(1.04, HEDGE_H - 0.4 - h * 0.1, 0.38 + h * 0.1, hsl(hue + 0.01, 0.55, light + 0.07)));
    const moss = hash(s.x, s.z, 4) < 0.45;
    plinthRows.push(place(1.12, 0, 0.38, moss ? hsl(0.24, 0.18, 0.5) : hsl(0.1, 0.1, 0.6 + h * 0.06)));
    const flowers = Math.floor(hash(s.x, s.z, 5) * 5);
    for (let i = 0; i < flowers; i++) {
      const along = (rnd() - 0.5) * (len - 1.6), side = rnd() < 0.5 ? -1 : 1, y = 0.7 + rnd() * 1.3;
      const off = side * 0.43;
      flowerRows.push({
        x: s.x + (horizontal(s) ? along : off), y, z: s.z + (horizontal(s) ? off : along),
        sx: 0.08, sy: 0.08, sz: 0.08, color: flowerColors[Math.floor(rnd() * flowerColors.length)],
      });
    }
  });
  group.add(fill(bodies, bodyRows), fill(caps, capRows), fill(plinths, plinthRows));

  // Corner posts at every junction: base, shaft, coping and either a finial or a glowing lantern.
  const posts = m.posts, nP = posts.length;
  const stone = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const bases = instanced(unitBox(), stone, nP), shafts = instanced(unitBox(), stone.clone(), nP), copings = instanced(unitBox(), stone.clone(), nP);
  const baseRows = [], shaftRows = [], copeRows = [], finialRows = [], lanternRows = [], bannerRows = [], haloPositions = [], glowRows = [];
  const bannerColors = [0xb8403a, 0x3f6fb0, 0xd9a43a, 0x6b4a9a];
  posts.forEach((p) => {
    const tone = hsl(0.1, 0.08, 0.58 + hash(p.i, p.j, 6) * 0.1);
    baseRows.push({ x: p.x, y: 0, z: p.z, sx: 1.3, sy: 0.4, sz: 1.3, color: tone });
    shaftRows.push({ x: p.x, y: 0.4, z: p.z, sx: 1.15, sy: POST_H - 0.62, sz: 1.15, color: tone });
    copeRows.push({ x: p.x, y: POST_H - 0.22, z: p.z, sx: 1.4, sy: 0.22, sz: 1.4, color: hsl(0.1, 0.08, 0.66) });
    const lit = hash(p.i, p.j, 7) < 0.42;
    if (lit) {
      lanternRows.push({ x: p.x, y: POST_H, z: p.z, sx: 0.5, sy: 0.62, sz: 0.5, color: 0xffffff });
      haloPositions.push(p.x, POST_H + 0.32, p.z);
      glowRows.push({ x: p.x, y: 0.03, z: p.z });
    } else {
      finialRows.push({ x: p.x, y: POST_H, z: p.z, sx: 0.46, sy: 0.7, sz: 0.46, ry: Math.PI / 4, color: hsl(0.1, 0.08, 0.5) });
    }
    // Banners hang on a free face (a direction no wall leaves from).
    const free = [[1, 0, 0, -1], [2, 1, 0, 0], [4, 0, 0, 1], [8, -1, 0, 0]].filter(([bit]) => !(p.mask & bit));
    if (free.length && hash(p.i, p.j, 8) < 0.3) {
      const pick = free[Math.floor(hash(p.i, p.j, 10) * free.length)], dx = pick[1], dz = pick[3];
      bannerRows.push({
        x: p.x + dx * 0.6, y: 1.05, z: p.z + dz * 0.6, sx: dx ? 0.05 : 0.72, sy: 1.35, sz: dx ? 0.72 : 0.05,
        color: bannerColors[Math.floor(hash(p.i, p.j, 12) * bannerColors.length)],
      });
    }
  });
  group.add(fill(bases, baseRows), fill(shafts, shaftRows), fill(copings, copeRows));
  if (finialRows.length) group.add(fill(instanced(new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), finialRows.length), finialRows));
  if (bannerRows.length) group.add(fill(instanced(unitBox(), new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), bannerRows.length), bannerRows));
  if (lanternRows.length) {
    const lamps = instanced(unitBox(), new THREE.MeshBasicMaterial({ color: 0xffd08a }), lanternRows.length, { cast: false, receive: false });
    group.add(fill(lamps, lanternRows));
    const halo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(haloPositions, 3));
    const halos = new THREE.Points(halo, new THREE.PointsMaterial({
      map: glowTexture(), color: 0xffb35c, size: 3, sizeAttenuation: true, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halos.frustumCulled = false;
    group.add(halos);
    const pools = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), decalMat({ map: glowTexture(), color: 0xffa94d, opacity: 0.35, blending: THREE.AdditiveBlending }), glowRows.length, { cast: false, receive: false });
    group.add(fill(pools, glowRows.map((g) => ({ ...g, sx: 7, sy: 1, sz: 7, color: 0xffffff }))));
  }

  // Flowers on the hedge faces plus a few flower tufts and rocks tucked into cell corners.
  const tuftRows = [], rockRows = [];
  const special = [m.start, m.exit];
  for (let cell = 0; cell < size * size; cell++) {
    const x = cell % size, z = Math.floor(cell / size), c = { x: origin + (x + 0.5) * C, z: origin + (z + 0.5) * C };
    if (special.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 1)) continue;
    const roll = hash(x, z, 31);
    if (roll > 0.42) continue;
    const sx = hash(x, z, 32) < 0.5 ? -1 : 1, sz = hash(x, z, 33) < 0.5 ? -1 : 1, px = c.x + sx * 2.7, pz = c.z + sz * 2.7;
    if (roll < 0.22) {
      tuftRows.push({ x: px, y: 0, z: pz, sx: 0.5, sy: 0.22, sz: 0.5, color: hsl(0.3, 0.45, 0.28) });
      for (let i = 0; i < 6; i++) {
        flowerRows.push({
          x: px + (rnd() - 0.5) * 0.7, y: 0.2 + rnd() * 0.1, z: pz + (rnd() - 0.5) * 0.7,
          sx: 0.08, sy: 0.08, sz: 0.08, color: flowerColors[Math.floor(rnd() * flowerColors.length)],
        });
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const s = 0.18 + rnd() * 0.2;
        rockRows.push({ x: px + (rnd() - 0.5) * 0.9, y: 0, z: pz + (rnd() - 0.5) * 0.9, sx: s, sy: s * 0.7, sz: s * 0.9, ry: rnd() * 3, color: hsl(0.22, 0.08, 0.38 + rnd() * 0.2) });
      }
    }
  }
  if (flowerRows.length) group.add(fill(instanced(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshStandardMaterial({ roughness: 0.7 }), flowerRows.length, { cast: false }), flowerRows));
  if (tuftRows.length) group.add(fill(instanced(new THREE.SphereGeometry(1, 8, 5), new THREE.MeshStandardMaterial({ roughness: 1 }), tuftRows.length, { cast: false }), tuftRows));
  if (rockRows.length) group.add(fill(instanced(new THREE.IcosahedronGeometry(1, 0).translate(0, 0.6, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rockRows.length), rockRows));

  // Room medallions: gold-ish ring inlay around the central feature.
  for (const room of m.rooms) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.55, 48).rotateX(-Math.PI / 2), decalMat({ color: 0xe6c477, opacity: 0.8 }));
    ring.position.set(room.x0, 0.035, room.z0);
    const inner = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.5, 48).rotateX(-Math.PI / 2), decalMat({ color: 0xe6c477, opacity: 0.5 }));
    inner.position.set(room.x0, 0.036, room.z0);
    group.add(ring, inner);
  }

  group.add(createStartPad(m.start));
  return group;
}

// Start pad: dark stone disc, a warm glowing ring with rune ticks and a soft glow pool.
export function createStartPad(start) {
  const g = new THREE.Group();
  g.position.set(start.x, 0, start.z);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.3, 0.1, 40), new THREE.MeshStandardMaterial({ color: 0x4b4a46, roughness: 0.8 }));
  disc.position.y = 0.07;
  disc.receiveShadow = true;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), decalMat({ map: glowTexture(), color: START_COLOR, opacity: 0.4, blending: THREE.AdditiveBlending }));
  glow.position.y = 0.05;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.65, 1.85, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: START_COLOR }));
  ring.position.y = 0.13;
  const inner = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.08, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: START_COLOR, transparent: true, opacity: 0.7 }));
  inner.position.y = 0.13;
  const ticks = instanced(new THREE.BoxGeometry(0.12, 0.03, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff2c4 }), 12, { cast: false, receive: false });
  fill(ticks, Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { x: Math.sin(a) * 2.05, y: 0.12, z: Math.cos(a) * 2.05, sx: 1, sy: 1, sz: 1, ry: a, color: 0xffffff };
  }));
  g.add(glow, disc, ring, inner, ticks);
  return g;
}

// Glowing exit gate: dais, four stone columns joined by crossed arches, gyroscope rings, a light beam,
// rising sparkles and a pulsing crystal. All emissive/basic materials, so it needs no real lights.
// The returned group has userData.update(dt) which main.js calls once per frame.
export function createExitMarker(exit) {
  const g = new THREE.Group();
  g.name = 'maze-exit';
  g.position.set(exit.x, 0, exit.z);
  const glowMat = (color, opacity, extra = {}) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, ...extra,
  });
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.8 });

  const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.3, 32), stone);
  dais.position.y = 0.15;
  dais.receiveShadow = true;
  const runes = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: EXIT_COLOR }));
  runes.position.y = 0.32;
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), decalMat({ map: glowTexture(), color: EXIT_COLOR, opacity: 0.6, blending: THREE.AdditiveBlending }));
  pool.position.y = 0.06;
  g.add(dais, runes, pool);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, x = Math.sin(a) * 1.85, z = Math.cos(a) * 1.85;
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.1, 0.5), stone);
    column.position.set(x, 1.85, z);
    column.castShadow = true;
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.52), new THREE.MeshBasicMaterial({ color: EXIT_COLOR }));
    inlay.position.set(x, 1.85, z);
    inlay.rotation.y = a;
    g.add(column, inlay);
  }
  for (const rot of [Math.PI / 4, -Math.PI / 4]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.14, 8, 28, Math.PI), stone);
    arch.position.y = 3.4;
    arch.rotation.y = rot + Math.PI / 2;
    arch.castShadow = true;
    g.add(arch);
  }

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color: 0xbff6ff }));
  crystal.position.y = 2.6;
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), glowMat(EXIT_COLOR, 0.28));
  aura.position.y = 2.6;
  g.add(crystal, aura);

  const rings = [1.5, 1.15, 0.8].map((r, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 40), glowMat(i === 1 ? 0xffffff : EXIT_COLOR, 0.9));
    ring.position.y = 2.6;
    g.add(ring);
    return ring;
  });

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 14, 20, 1, true).translate(0, 7, 0),
    glowMat(EXIT_COLOR, 0.5, { map: beamTexture(), side: THREE.DoubleSide, fog: false }));
  beam.renderOrder = 2;
  g.add(beam);

  const COUNT = 48, pos = new Float32Array(COUNT * 3), phase = Array.from({ length: COUNT }, (_, i) => ({
    a: hash(i, 1, 5) * 6.283, r: 0.3 + hash(i, 2, 5) * 1.5, y: hash(i, 3, 5) * 6, s: 0.6 + hash(i, 4, 5) * 1.2,
  }));
  const sparkGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    map: glowTexture(), color: 0xdaf9ff, size: 0.45, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  g.add(sparks);

  let time = 0;
  g.userData.update = (dt) => {
    time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    rings[0].rotation.set(time * 0.9, time * 0.5, 0);
    rings[1].rotation.set(0.5, time * -1.3, time * 0.7);
    rings[2].rotation.set(time * 1.6, 0, time * -0.8);
    crystal.rotation.y = time * 1.4;
    crystal.position.y = 2.6 + Math.sin(time * 2) * 0.12;
    aura.scale.setScalar(0.9 + pulse * 0.25);
    aura.material.opacity = 0.2 + pulse * 0.16;
    beam.material.opacity = 0.42 + pulse * 0.14;
    beam.rotation.y = time * 0.4;
    pool.material.opacity = 0.45 + pulse * 0.25;
    runes.rotation.y = time * 0.3;
    for (let i = 0; i < COUNT; i++) {
      const p = phase[i], y = (p.y + time * p.s) % 6, a = p.a + time * 0.8;
      const r = p.r * (1 - y / 8);
      pos[i * 3] = Math.sin(a) * r;
      pos[i * 3 + 1] = 0.4 + y;
      pos[i * 3 + 2] = Math.cos(a) * r;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  };
  g.userData.update(0);
  return g;
}
