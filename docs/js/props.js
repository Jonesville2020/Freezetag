import * as THREE from 'three';

// Visual builders for map props and decor. buildProp(prop, layout) returns an Object3D centred on
// (0, 0, 0) at ground level; the caller positions it at (prop.x, 0, prop.z). Every builder fills the
// world-aligned footprint w x d and height h (only `overhang` types may spill outside it).
// Geometries are shared (module cache; meshes flagged userData.shared); materials are created per call.

// cls: low (vault) / mid (climb) / tall (full cover) / soft (passable, blocks sight) / decor (visual only).
// sight:false = solid but see-through. auto = traverse hint derived from the final height (see maps.js).
export const PROP_TYPES = {
  crate: { w: 1.1, d: 1.1, h: 1.1, cls: 'mid', auto: true },
  crateStack: { w: 1.4, d: 1.4, h: 1.9, cls: 'tall' },
  pallets: { w: 1.4, d: 1.4, h: 1.2, cls: 'mid', auto: true },
  bench: { w: 1.8, d: 0.6, h: 0.9, cls: 'low', traverse: 'vault', sight: false },
  planter: { w: 1.6, d: 0.8, h: 0.8, cls: 'low', traverse: 'vault' },
  lowWall: { w: 3, d: 0.5, h: 0.9, cls: 'low', traverse: 'vault', sight: false },
  picnicTable: { w: 1.9, d: 1.6, h: 0.85, cls: 'low', traverse: 'vault', sight: false },
  slide: { w: 1.1, d: 3.6, h: 2.2, cls: 'tall', sight: false },
  seesaw: { w: 3, d: 0.6, h: 0.8, cls: 'low', traverse: 'vault', sight: false },
  tunnel: { w: 2.6, d: 1.2, h: 1.1, cls: 'mid', traverse: 'slide', sight: false },
  monkeyBars: { w: 3, d: 1, h: 2, cls: 'tall', sight: false },
  merryGoRound: { w: 2.6, d: 2.6, h: 0.9, cls: 'low', traverse: 'vault', sight: false },
  swingSet: { w: 3.6, d: 1.4, h: 2.3, cls: 'tall', sight: false },
  jungleGym: { w: 2.4, d: 2.4, h: 1.6, cls: 'mid', traverse: 'climb', sight: false },
  trampoline: { w: 3, d: 3, h: 0.9, cls: 'low', traverse: 'vault', sight: false },
  car: { w: 1.9, d: 4.2, h: 1.5, cls: 'mid', traverse: 'climb' },
  van: { w: 2.1, d: 4.8, h: 2.2, cls: 'tall' },
  stall: { w: 3, d: 2, h: 2.4, cls: 'tall' },
  fountain: { w: 3.6, d: 3.6, h: 1.8, cls: 'mid', sight: false },
  statue: { w: 1.4, d: 1.4, h: 2.8, cls: 'tall' },
  pillar: { w: 0.9, d: 0.9, h: 2.6, cls: 'tall' },
  barrier: { w: 2.4, d: 0.6, h: 0.9, cls: 'low', traverse: 'vault' },
  container: { w: 6, d: 2.4, h: 2.6, cls: 'tall' },
  forklift: { w: 1.3, d: 2.6, h: 2.1, cls: 'tall', sight: false },
  tyres: { w: 1.0, d: 1.0, h: 1.2, cls: 'mid', auto: true },
  bin: { w: 0.7, d: 0.7, h: 1.0, cls: 'low', traverse: 'vault' },
  dumpster: { w: 2.2, d: 1.2, h: 1.4, cls: 'mid', traverse: 'climb' },
  hedge: { w: 4, d: 1, h: 1.6, cls: 'soft', soft: true },
  bush: { w: 1.6, d: 1.6, h: 1.3, cls: 'soft', soft: true },
  tallGrass: { w: 3, d: 2.5, h: 1.4, cls: 'soft', soft: true },
  tree: { w: 0.8, d: 0.8, h: 3.4, cls: 'tall', overhang: true },
  lampPost: { w: 0.4, d: 0.4, h: 4.2, cls: 'tall', sight: false },
  bollard: { w: 0.4, d: 0.4, h: 0.8, cls: 'low', traverse: 'vault', sight: false },
  kiosk: { w: 2.4, d: 2.4, h: 2.6, cls: 'tall' },
  busShelter: { w: 3.2, d: 1.2, h: 2.5, cls: 'tall', sight: false },
  fence: { w: 3, d: 0.25, h: 1.2, cls: 'mid', traverse: 'climb', sight: false },
  hayBale: { w: 1.4, d: 0.9, h: 0.9, cls: 'low', traverse: 'vault' },
  stairs: { w: 2, d: 2.4, h: 0.9, cls: 'low', traverse: 'vault' },
  shelf: { w: 3, d: 1, h: 2.4, cls: 'tall' },
  barrel: { w: 0.8, d: 0.8, h: 1.0, cls: 'low', traverse: 'vault' },
  boat: { w: 4.4, d: 1.8, h: 1.7, cls: 'tall' },
  cafeTable: { w: 1.6, d: 1.6, h: 2.4, cls: 'tall', sight: false },
  vending: { w: 1.0, d: 0.9, h: 1.9, cls: 'tall' },
  mailbox: { w: 0.55, d: 0.55, h: 1.3, cls: 'mid', traverse: 'climb' },
  hydrant: { w: 0.5, d: 0.5, h: 0.8, cls: 'low', traverse: 'vault', sight: false },
  phoneBooth: { w: 1.0, d: 1.0, h: 2.4, cls: 'tall' },
  // decor-only (any solid type may also be used as decor)
  roadLine: { w: 8, d: 0.2, h: 0.02, cls: 'decor', decor: true },
  crosswalk: { w: 6, d: 3, h: 0.02, cls: 'decor', decor: true },
  hazard: { w: 6, d: 0.8, h: 0.02, cls: 'decor', decor: true },
  pavers: { w: 6, d: 6, h: 0.03, cls: 'decor', decor: true },
  flowers: { w: 2, d: 1, h: 0.4, cls: 'decor', decor: true },
  mudPatch: { w: 4, d: 3, h: 0.03, cls: 'decor', decor: true },
  puddlePatch: { w: 4, d: 3, h: 0.03, cls: 'decor', decor: true },
  sandPatch: { w: 4, d: 3, h: 0.03, cls: 'decor', decor: true },
  leafPile: { w: 4, d: 3, h: 0.03, cls: 'decor', decor: true },
  sandbox: { w: 5, d: 4, h: 0.3, cls: 'decor', decor: true },
  bunting: { w: 8, d: 0.2, h: 3, cls: 'decor', decor: true },
  sign: { w: 0.5, d: 0.2, h: 2.4, cls: 'decor', decor: true },
  cone: { w: 0.5, d: 0.5, h: 0.7, cls: 'decor', decor: true },
  building: { w: 12, d: 8, h: 8, cls: 'decor', decor: true },
  water: { w: 80, d: 12, h: 0.02, cls: 'decor', decor: true },
  crane: { w: 6, d: 3, h: 12, cls: 'decor', decor: true },
};

const geoCache = new Map();
const cached = (key, make) => {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
};
const GEO = {
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  cyl: (seg = 14, top = 1) => cached(`cyl${seg}:${top}`, () => new THREE.CylinderGeometry(top, 1, 1, seg).translate(0, 0.5, 0)),
  frus: (top) => cached(`frus${top}`, () => new THREE.CylinderGeometry(top, 1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0)),
  cylX: () => cached('cylX', () => new THREE.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2)),
  cylZ: () => cached('cylZ', () => new THREE.CylinderGeometry(1, 1, 1, 16).rotateX(Math.PI / 2)),
  sph: () => cached('sph', () => new THREE.SphereGeometry(1, 14, 10)),
  dome: () => cached('dome', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
  bowl: () => cached('bowl', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)),
  cone: (seg = 8) => cached(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0)),
  torus: () => cached('torus', () => new THREE.TorusGeometry(0.7, 0.3, 8, 20).rotateX(Math.PI / 2)),
  tri: () => cached('tri', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, -1, 0], 3));
    g.computeVertexNormals();
    return g;
  }),
  panel: (long, short, h, n) => cached(`panel${long}:${short}:${h}:${n}`, () => corrugatedBox(long, short, h, n)),
};

// Box whose two long faces are corrugated (shipping container body); long axis x, base on y = 0.
function corrugatedBox(w, d, h, n) {
  const hw = w / 2, hd = d / 2, a = 0.045, step = w / n;
  const pts = [[-hw, -hd + a]];
  for (let i = 0; i < n; i++) {
    const x0 = -hw + i * step;
    pts.push([x0 + step * 0.25, -hd], [x0 + step * 0.75, -hd], [x0 + step, -hd + a]);
  }
  pts.push([hw, hd - a]);
  for (let i = n - 1; i >= 0; i--) {
    const x0 = -hw + i * step;
    pts.push([x0 + step * 0.75, hd], [x0 + step * 0.25, hd], [x0, hd - a]);
  }
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2);
}

const frac = (v) => v - Math.floor(v);
const hash = (x, z, n = 0) => frac(Math.sin(x * 12.9898 + z * 78.233 + n * 37.719) * 43758.5453);

const PAL = {
  street: { paint: [0xe86a5c, 0x4f9bd9, 0xf2c14e, 0x6bbf8a], wood: 0xb98557, stone: 0xb9ad9d, leaf: 0x5aa06a, water: 0x6fb6d8 },
  plaza: { paint: [0x3fa3a5, 0xe8a05a, 0xcf6d92, 0x7f93d9], wood: 0xa9794f, stone: 0xd2d0c0, leaf: 0x66a878, water: 0x76c3df },
  warehouse: { paint: [0xf2a33a, 0x4a74c9, 0xd9534f, 0x58a778], wood: 0xc59a63, stone: 0xb7a9b3, leaf: 0x6a9a70, water: 0x7fb0c8 },
  park: { paint: [0xf2c14e, 0x4f9bd9, 0xe8665c, 0x6bbf5f], wood: 0xb98a5a, stone: 0xc8c2a8, leaf: 0x5bab5e, water: 0x74bfe0 },
  harbor: { paint: [0xd9604c, 0x2f86a8, 0xf0b94a, 0x4d9f7a], wood: 0x9a7650, stone: 0xa9a79a, leaf: 0x5a9a72, water: 0x3d8fb5 },
};

const tint = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
const lerpHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

class Builder {
  constructor(pal, prop) {
    this.g = new THREE.Group();
    this.mats = new Map();
    this.pal = pal;
    this.prop = prop;
    this.v = Math.floor(hash(prop.x ?? 0, prop.z ?? 0) * 1000);
  }

  rnd(n) { return hash(this.prop.x ?? 0, this.prop.z ?? 0, n + 1); }

  mat(color, o = {}) {
    const key = `${color}|${o.rough ?? ''}|${o.metal ?? ''}|${o.emissive ?? ''}|${o.opacity ?? ''}|${o.side ?? ''}|${o.offset ?? ''}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.78, metalness: o.metal ?? 0.04 });
      if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = 0.8; }
      if (o.opacity != null) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
      if (o.side) m.side = THREE.DoubleSide;
      if (o.offset) { m.polygonOffset = true; m.polygonOffsetFactor = -o.offset; m.polygonOffsetUnits = -o.offset; }
      this.mats.set(key, m);
    }
    return m;
  }

  put(geo, color, sx, sy, sz, x, y, z, o = {}) {
    const m = new THREE.Mesh(geo, this.mat(color, o));
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (o.rx || o.ry || o.rz) m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    m.castShadow = o.cast ?? true;
    m.receiveShadow = true;
    m.userData.shared = true;
    (o.to ?? this.g).add(m);
    return m;
  }

  // Bottom-centred unit box: (w, h, d) at (x, y = base, z).
  box(w, h, d, x, y, z, c, o) { return this.put(GEO.box(), c, w, h, d, x, y, z, o); }
  cyl(rx, h, rz, x, y, z, c, o = {}) { return this.put(GEO.cyl(o.seg ?? 14, o.top ?? 1), c, rx, h, rz, x, y, z, o); }
  // Four-sided frustum: full footprint w x d at the base, `top` = top/base ratio.
  frus(w, h, d, top, x, y, z, c, o) { return this.put(GEO.frus(top), c, w * Math.SQRT1_2, h, d * Math.SQRT1_2, x, y, z, o); }
  sph(rx, ry, rz, x, y, z, c, o) { return this.put(GEO.sph(), c, rx, ry, rz, x, y, z, o); }
  dome(rx, ry, rz, x, y, z, c, o) { return this.put(GEO.dome(), c, rx, ry, rz, x, y, z, o); }
  cylX(len, ry, rz, x, y, z, c, o) { return this.put(GEO.cylX(), c, len, ry, rz, x, y, z, o); }
  cylZ(len, rx, ry, x, y, z, c, o) { return this.put(GEO.cylZ(), c, rx, ry, len, x, y, z, o); }
  cone(rx, h, rz, x, y, z, c, o = {}) { return this.put(GEO.cone(o.seg ?? 8), c, rx, h, rz, x, y, z, o); }
  group(x = 0, y = 0, z = 0, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this.g.add(g);
    return g;
  }
}

function wheels(b, to, W, r, zf, zr, color = 0x30343a) {
  for (const z of [zf, zr]) for (const s of [-1, 1]) {
    b.cylX(0.26, r, r, s * (W / 2 - 0.13), r, z, color, { to, rough: 0.9 });
    b.cylX(0.28, r * 0.5, r * 0.5, s * (W / 2 - 0.13), r, z, 0xcfd6dc, { to, metal: 0.5 });
  }
}

// Builds a lengthwise object (long axis = z inside `fn`), rotated to match the footprint.
function lengthwise(b, w, d, fn) {
  const inner = b.group(0, 0, 0, w > d ? Math.PI / 2 : 0);
  fn(inner, Math.min(w, d), Math.max(w, d));
}

const B = {
  crate(b, w, d, h) {
    const wood = tint(b.pal.wood, 0.92 + b.rnd(1) * 0.16), frame = tint(wood, 0.78), light = tint(wood, 1.12);
    b.box(w - 0.04, h - 0.04, d - 0.04, 0, 0.02, 0, wood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, h, 0.1, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), frame);
    for (const sz of [-1, 1]) {
      const z = sz * (d / 2 - 0.015);
      b.box(w - 0.2, 0.1, 0.03, 0, h * 0.12, z, frame);
      b.box(w - 0.2, 0.1, 0.03, 0, h * 0.88 - 0.1, z, frame);
      const dx = w - 0.2, dy = h * 0.76 - 0.1;
      b.box(Math.hypot(dx, dy) * 0.92, 0.07, 0.03, 0, h / 2 - 0.035, z, frame, { rz: Math.atan2(dy, dx) * (sz > 0 ? 1 : -1) });
    }
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.015);
      b.box(0.03, 0.1, d - 0.2, x, h * 0.12, 0, frame);
      b.box(0.03, 0.1, d - 0.2, x, h * 0.88 - 0.1, 0, frame);
    }
    b.box(w - 0.02, 0.03, d - 0.02, 0, h - 0.03, 0, light);
  },

  crateStack(b, w, d, h) {
    const lower = h * 0.52, up = h - lower;
    const sub = (cw, cd, ch, x, y, z, k) => {
      const g = b.group(x, y, z);
      const wood = tint(b.pal.wood, 0.9 + hash(x, z, k) * 0.2), frame = tint(wood, 0.76);
      b.box(cw - 0.03, ch, cd - 0.03, 0, 0, 0, wood, { to: g });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, ch, 0.1, sx * (cw / 2 - 0.05), 0, sz * (cd / 2 - 0.05), frame, { to: g });
      for (const sz of [-1, 1]) b.box(cw - 0.2, 0.1, 0.03, 0, ch * 0.5 - 0.05, sz * (cd / 2 - 0.015), frame, { to: g });
      b.box(cw - 0.02, 0.04, cd - 0.02, 0, ch - 0.04, 0, tint(wood, 1.12), { to: g });
    };
    sub(w, d, lower, 0, 0, 0, 1);
    sub(w * 0.8, d * 0.8, up, w * 0.1, lower, -d * 0.1, 2);
  },

  pallets(b, w, d, h) {
    const wood = tint(b.pal.wood, 1.05), dark = tint(b.pal.wood, 0.8);
    b.box(w, 0.13, d, 0, 0, 0, wood);
    for (const x of [-1, 0, 1]) b.box(0.12, 0.1, d, x * (w / 2 - 0.06), 0, 0, dark);
    b.box(w, 0.04, d, 0, 0.13, 0, tint(wood, 0.92));
    const cargoH = h - 0.17, rows = Math.max(1, Math.round(cargoH / 0.42)), rh = cargoH / rows;
    const cardboard = [0xc9a06a, 0xd7b27c, 0xbb935b];
    for (let r = 0; r < rows; r++) {
      const c = cardboard[(b.v + r) % 3];
      b.box(w - 0.1, rh - 0.015, d - 0.1, 0, 0.17 + r * rh, 0, c);
      b.box(0.03, rh - 0.02, d - 0.09, 0, 0.17 + r * rh, 0, tint(c, 0.8));
    }
    b.box(w - 0.04, h - 0.2, d - 0.04, 0, 0.17, 0, 0xe8f0f2, { opacity: 0.28, cast: false });
  },

  bench(b, w, d, h) {
    const wood = tint(b.pal.wood, 0.95 + b.rnd(2) * 0.1), iron = 0x3f4650, seat = 0.45;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.12);
      b.box(0.06, seat, d - 0.06, x, 0, 0, iron);
      b.box(0.06, h - seat, 0.06, x, seat, -d / 2 + 0.06, iron);
    }
    for (let i = 0; i < 3; i++) b.box(w, 0.045, d * 0.26, 0, seat - 0.05, -d / 2 + d * (0.2 + i * 0.3), wood);
    for (let i = 0; i < 3; i++) b.box(w, 0.1, 0.035, 0, seat + 0.1 + i * ((h - seat - 0.28) / 2), -d / 2 + 0.05, tint(wood, 1.08));
  },

  planter(b, w, d, h) {
    const rim = b.pal.stone, body = tint(b.pal.paint[b.v % 4], 0.9), bh = h * 0.62;
    b.box(w - 0.06, bh, d - 0.06, 0, 0, 0, body);
    b.box(w, 0.1, d, 0, 0, 0, tint(body, 0.7));
    b.box(w, 0.08, d, 0, bh - 0.08, 0, rim);
    b.box(w - 0.16, 0.03, d - 0.16, 0, bh - 0.02, 0, 0x6b4a36);
    const long = w >= d, len = long ? w : d, n = Math.max(2, Math.round(len / 0.55));
    for (let i = 0; i < n; i++) {
      const r = Math.min(len / n * 0.62, (long ? d : w) * 0.5 - 0.02), ry = (h - bh) * 0.5;
      const t = (i + 0.5) / n * (len - 2 * r) - (len - 2 * r) / 2 + 0 * r;
      const x = long ? t : 0, z = long ? 0 : t;
      b.sph(r, ry, r, x, bh + ry - 0.02, z, tint(b.pal.leaf, 0.85 + hash(i, b.v) * 0.3));
      if (i % 2 === 0) b.sph(0.07, 0.07, 0.07, x + 0.04, h - 0.1, z + 0.04, b.pal.paint[(i + b.v) % 4], { cast: false });
    }
  },

  lowWall(b, w, d, h) {
    const stone = tint(b.pal.stone, 0.96 + b.rnd(3) * 0.08);
    b.box(w - 0.04, h - 0.1, d - 0.04, 0, 0, 0, stone);
    b.box(w, 0.1, d, 0, h - 0.1, 0, tint(stone, 1.12));
    b.box(w, 0.1, d, 0, 0, 0, tint(stone, 0.8));
    const long = w >= d, n = Math.max(2, Math.floor((long ? w : d) / 0.9));
    for (let i = 1; i < n; i++) {
      const t = (i / n - 0.5) * (long ? w : d);
      b.box(long ? 0.025 : w - 0.02, h * 0.6, long ? d - 0.02 : 0.025, long ? t : 0, h * 0.18, long ? 0 : t, tint(stone, 0.78), { cast: false });
    }
  },

  picnicTable(b, w, d, h) {
    const wood = tint(b.pal.wood, 0.95 + b.rnd(4) * 0.12), dark = tint(wood, 0.75);
    const benchY = h * 0.52, top = h - 0.05;
    for (let i = 0; i < 3; i++) b.box(w, 0.05, d * 0.16, 0, top, -d * 0.17 + i * d * 0.17, wood);
    for (const sz of [-1, 1]) b.box(w, 0.05, d * 0.2, 0, benchY, sz * (d / 2 - d * 0.1), tint(wood, 1.1));
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.25);
      b.box(0.07, benchY, d - 0.05, x, 0, 0, dark, { cast: false });
      for (const sz of [-1, 1]) b.box(0.07, top, 0.07, x, 0, sz * (d * 0.12), dark, { rx: sz * 0.12 });
    }
  },

  slide(b, w, d, h) {
    const blue = b.pal.paint[1], red = b.pal.paint[2], yellow = b.pal.paint[0], steel = 0xc7d0d6;
    const towerD = Math.min(1.1, d * 0.3), pz = -d / 2 + towerD / 2, platY = h * 0.72;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, platY + 0.6, 0.1, sx * (w / 2 - 0.07), 0, pz + sz * (towerD / 2 - 0.07), blue);
    b.box(w, 0.06, towerD, 0, platY - 0.06, pz, tint(yellow, 0.9));
    for (const sz of [-1, 1]) b.box(w - 0.1, 0.4, 0.04, 0, platY, pz + sz * (towerD / 2 - 0.03), tint(blue, 1.1), { cast: false });
    for (const sx of [-1, 1]) b.box(0.04, 0.4, towerD - 0.05, sx * (w / 2 - 0.03), platY, pz, tint(blue, 1.1), { cast: false });
    b.frus(w, h - platY - 0.6, towerD, 0.08, 0, platY + 0.6, pz, red);
    const z0 = pz + towerD / 2, z1 = d / 2 - 0.06, y1 = 0.14, dy = platY - y1, len = Math.hypot(z1 - z0, dy), ang = Math.atan2(dy, z1 - z0);
    const cy = (platY + y1) / 2 - 0.03, cz = (z0 + z1) / 2;
    b.box(w - 0.2, 0.05, len, 0, cy, cz, yellow, { rx: ang });
    for (const sx of [-1, 1]) b.box(0.05, 0.16, len, sx * (w / 2 - 0.12), cy, cz, tint(yellow, 0.82), { rx: ang, cast: false });
    for (const sx of [-1, 1]) b.box(0.05, 0.05, 0.0 + 0.05, sx * (w / 2 - 0.12), 0, z1, steel, { cast: false });
    for (const sx of [-1, 1]) b.box(0.05, platY - 0.06, 0.05, sx * (w / 2 - 0.2), 0, -d / 2 + 0.04, steel, { cast: false });
    for (let i = 0; i < 4; i++) b.box(w - 0.4, 0.04, 0.04, 0, 0.2 + i * (platY - 0.3) / 3, -d / 2 + 0.04, steel, { cast: false });
  },

  seesaw(b, w, d, h) {
    const col = b.pal.paint[b.v % 4], steel = 0xcfd6dc;
    const tilt = Math.asin(Math.min(0.5, (h - 0.42 - 0.2) / (w / 2)));
    b.frus(0.5, 0.4, d * 0.9, 0.3, 0, 0, 0, tint(col, 0.7));
    b.box(w * 0.96, 0.07, d * 0.5, 0, 0.4, 0, col, { rz: tilt });
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.35) * Math.cos(tilt);
      b.box(0.04, 0.16, d * 0.4, x, 0.42 + Math.sin(tilt) * x, 0, steel, { cast: false });
    }
    b.cylZ(d * 0.5, 0.04, 0.04, 0, 0.4, 0, steel);
  },

  tunnel(b, w, d, h) {
    const col = b.pal.paint[b.v % 4], ring = b.pal.paint[(b.v + 2) % 4], ry = h / 2, rz = d / 2;
    b.cylX(w * 0.94, ry * 0.96, rz * 0.96, 0, ry, 0, col);
    for (const t of [-0.42, -0.14, 0.14, 0.42]) b.cylX(0.14, ry, rz, t * w, ry, 0, ring);
    for (const s of [-1, 1]) b.cylX(0.03, ry * 0.8, rz * 0.8, s * (w / 2 - 0.015), ry, 0, 0x1f2430, { cast: false });
  },

  monkeyBars(b, w, d, h) {
    const col = b.pal.paint[1], steel = 0xcfd6dc;
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.06);
      for (const sz of [-1, 1]) b.box(0.09, h, 0.09, x, 0, sz * (d / 2 - 0.1), col, { rz: -sx * 0.05 });
      b.box(0.09, 0.09, d - 0.1, x, h - 0.09, 0, col);
    }
    for (const sz of [-1, 1]) b.cylX(w - 0.1, 0.035, 0.035, 0, h - 0.06, sz * (d / 2 - 0.12), steel);
    const n = Math.floor(w / 0.32);
    for (let i = 0; i < n; i++) b.cylZ(d - 0.2, 0.025, 0.025, -w / 2 + 0.3 + i * ((w - 0.6) / (n - 1)), h - 0.1, 0, steel, { cast: false });
    b.box(0.5, 0.06, 0.5, -w / 2 + 0.3, h * 0.45, 0, b.pal.paint[0]);
  },

  merryGoRound(b, w, d, h) {
    const rx = w / 2, rz = d / 2;
    b.cyl(rx * 0.3, 0.2, rz * 0.3, 0, 0, 0, 0x4a5058, { seg: 10 });
    b.cyl(rx, 0.1, rz, 0, 0.2, 0, 0xe3e7ea, { seg: 20 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      b.cone(rx * 0.5, 0.02, rz * 0.5, Math.cos(a) * rx * 0.42, 0.3, Math.sin(a) * rz * 0.42, b.pal.paint[i], { seg: 5, cast: false });
    }
    b.cyl(0.05, h - 0.3, 0.05, 0, 0.3, 0, 0xcfd6dc, { seg: 8 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78, x = Math.cos(a) * (rx - 0.12), z = Math.sin(a) * (rz - 0.12);
      b.box(0.05, h - 0.3, 0.05, x, 0.3, z, 0xcfd6dc);
      b.cylX(0.05, 0.03, 0.03, 0, 0, 0, 0xcfd6dc, { cast: false }).visible = false;
    }
    b.cyl(rx * 0.7, 0.04, rz * 0.7, 0, h - 0.04, 0, 0xcfd6dc, { seg: 4, top: 0.08, cast: false });
  },

  swingSet(b, w, d, h) {
    const col = b.pal.paint[2], steel = 0x8a949c;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, h, 0.1, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.06), col);
    b.cylX(w, 0.06, 0.06, 0, h - 0.06, 0, steel);
    for (const sx of [-1, 1]) b.box(0.09, 0.09, d - 0.1, sx * (w / 2 - 0.05), h - 0.1, 0, col, { cast: false });
    for (const x of [-0.26, 0.26]) {
      const px = x * w;
      for (const c of [-0.2, 0.2]) b.box(0.015, h - 0.6, 0.015, px + c, 0.5, 0, steel, { cast: false });
      b.box(0.5, 0.06, 0.2, px, 0.45, 0, b.pal.paint[x > 0 ? 0 : 1]);
    }
  },

  jungleGym(b, w, d, h) {
    const col = b.pal.paint[(b.v + 1) % 4], steel = 0xcfd6dc, t = 0.06;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(t, h, t, sx * (w / 2 - t / 2), 0, sz * (d / 2 - t / 2), col);
    for (const y of [h * 0.5, h - t]) for (const s of [-1, 1]) {
      b.box(w - t, t, t, 0, y, s * (d / 2 - t / 2), steel, { cast: false });
      b.box(t, t, d - t, s * (w / 2 - t / 2), y, 0, steel, { cast: false });
    }
    for (const f of [-0.3, 0, 0.3]) b.box(t * 0.7, t * 0.7, d - t, f * w, h - t, 0, steel, { cast: false });
    b.box(w - 0.2, 0.05, d - 0.2, 0, h * 0.5 - 0.05, 0, b.pal.paint[0], { cast: false });
    for (const f of [-0.3, 0, 0.3]) b.box(t * 0.7, h * 0.5, t * 0.7, f * w, 0, d / 2 - t / 2, steel, { cast: false });
  },

  trampoline(b, w, d, h) {
    const rx = w / 2, rz = d / 2, top = h - 0.1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.box(0.06, top, 0.06, Math.cos(a) * (rx - 0.06), 0, Math.sin(a) * (rz - 0.06), 0x8fa0ad);
    }
    b.cyl(rx, 0.1, rz, 0, top - 0.03, 0, b.pal.paint[1], { seg: 20 });
    b.cyl(rx * 0.86, 0.04, rz * 0.86, 0, top + 0.06, 0, 0x2b2f3b, { seg: 20 });
    b.cyl(rx * 0.2, 0.01, rz * 0.2, 0, h - 0.005, 0, 0xf2c14e, { seg: 12, cast: false });
  },

  car(b, w, d, h) {
    const col = b.pal.paint[b.v % 4], glass = 0x31404f;
    lengthwise(b, w, d, (g, W, L) => {
      const wr = Math.min(0.36, h * 0.24), bodyTop = h * 0.56;
      b.box(W, bodyTop - wr * 0.7, L, 0, wr * 0.7, 0, col, { to: g });
      b.box(W - 0.1, 0.12, L - 0.1, 0, bodyTop - 0.06, 0, tint(col, 1.12), { to: g });
      b.frus(W * 0.9, h - bodyTop - 0.07, L * 0.52, 0.72, 0, bodyTop, -L * 0.04, glass, { to: g });
      b.box(W * 0.66, 0.07, L * 0.3, 0, h - 0.07, -L * 0.04, tint(col, 1.05), { to: g });
      b.box(W - 0.02, 0.12, 0.14, 0, wr * 0.7, L / 2 - 0.07, 0x3a3f46, { to: g });
      b.box(W - 0.02, 0.12, 0.14, 0, wr * 0.7, -L / 2 + 0.07, 0x3a3f46, { to: g });
      for (const s of [-1, 1]) {
        b.box(0.34, 0.14, 0.05, s * (W / 2 - 0.3), bodyTop - 0.34, L / 2 - 0.025, 0xfff1b8, { to: g, emissive: 0x8a7a30 });
        b.box(0.3, 0.12, 0.05, s * (W / 2 - 0.3), bodyTop - 0.34, -L / 2 + 0.025, 0xd9403a, { to: g, emissive: 0x601010 });
      }
      wheels(b, g, W, wr, L * 0.3, -L * 0.3);
    });
  },

  van(b, w, d, h) {
    const col = b.pal.paint[(b.v + 1) % 4], glass = 0x31404f;
    lengthwise(b, w, d, (g, W, L) => {
      const wr = 0.38, cabL = L * 0.28, cargoL = L - cabL, cabH = h * 0.72;
      b.box(W, h - wr * 0.7, cargoL, 0, wr * 0.7, -L / 2 + cargoL / 2, 0xeef0ee, { to: g });
      b.box(W - 0.0, 0.14, cargoL - 0.02, 0, h * 0.42, -L / 2 + cargoL / 2, col, { to: g });
      b.box(W, cabH - wr * 0.7 - 0.0, cabL, 0, wr * 0.7, L / 2 - cabL / 2, col, { to: g });
      b.frus(W * 0.94, cabH * 0.34, cabL * 0.9, 0.82, 0, cabH * 0.66, L / 2 - cabL / 2 - 0.05, glass, { to: g });
      b.box(W - 0.02, 0.14, 0.14, 0, wr * 0.7, L / 2 - 0.07, 0x3a3f46, { to: g });
      b.box(W - 0.02, 0.14, 0.14, 0, wr * 0.7, -L / 2 + 0.07, 0x3a3f46, { to: g });
      for (const s of [-1, 1]) b.box(0.3, 0.14, 0.05, s * (W / 2 - 0.3), cabH * 0.4, L / 2 - 0.025, 0xfff1b8, { to: g, emissive: 0x8a7a30 });
      b.box(W * 0.5, 0.35, 0.04, 0, h * 0.55, -L / 2 + 0.02, col, { to: g });
      wheels(b, g, W, wr, L / 2 - cabL * 0.55, -L / 2 + cargoL * 0.25);
    });
  },

  stall(b, w, d, h) {
    const wood = b.pal.wood, col = b.pal.paint[b.v % 4], alt = 0xfaf3e6;
    const slope = 0.5, n = Math.max(4, Math.round(w / 1) * 2), cz = d * 0.28 - 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, sz < 0 ? h - 0.12 : h - slope - 0.1, 0.1, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), wood);
    b.box(w - 0.1, h * 0.38, d * 0.4, 0, 0, cz, tint(wood, 0.9));
    b.box(w - 0.02, 0.06, d * 0.46, 0, h * 0.38, cz, tint(wood, 1.12));
    b.box(w - 0.1, h - slope - 0.2, 0.06, 0, 0.1, -d / 2 + 0.04, tint(wood, 0.85), { cast: false });
    const L = Math.hypot(d, slope), ang = Math.atan2(slope, d);
    for (let i = 0; i < n; i++) {
      const sw = w / n, x = -w / 2 + sw * (i + 0.5), c = i % 2 ? alt : col;
      b.box(sw, 0.05, L, x, h - slope / 2 - 0.1, 0, c, { rx: ang });
      b.box(sw, 0.13, 0.03, x, h - slope - 0.17, d / 2 - 0.02, c, { cast: false });
    }
    const goods = [0xe8665c, 0xf2c14e, 0x6bbf5f, 0xd98ad1];
    for (let i = 0; i < Math.floor((w - 0.4) / 0.55); i++) {
      const x = -w / 2 + 0.4 + i * 0.55;
      b.box(0.34, 0.1, 0.3, x, h * 0.38 + 0.06, cz, tint(wood, 0.9), { cast: false });
      b.sph(0.14, 0.14, 0.14, x, h * 0.38 + 0.2, cz, goods[(i + b.v) % 4]);
    }
  },

  fountain(b, w, d, h) {
    const rx = w / 2, rz = d / 2, stone = b.pal.stone;
    b.cyl(rx, 0.55, rz, 0, 0, 0, tint(stone, 0.9), { seg: 24 });
    b.cyl(rx, 0.06, rz, 0, 0.55, 0, tint(stone, 1.15), { seg: 24 });
    b.cyl(rx * 0.88, 0.02, rz * 0.88, 0, 0.5, 0, b.pal.water, { seg: 24, rough: 0.15, metal: 0.1, emissive: 0x143848 });
    b.cyl(rx * 0.14, h * 0.4, rz * 0.14, 0, 0.5, 0, stone, { seg: 12 });
    b.cyl(rx * 0.42, 0.08, rz * 0.42, 0, 0.5 + h * 0.4 - 0.2, 0, tint(stone, 1.1), { seg: 18, top: 0.8 });
    b.cyl(rx * 0.1, h * 0.28, rz * 0.1, 0, 0.5 + h * 0.4 - 0.12, 0, stone, { seg: 10 });
    b.sph(rx * 0.14, 0.18, rz * 0.14, 0, h - 0.2, 0, b.pal.water, { rough: 0.2, emissive: 0x143848 });
  },

  statue(b, w, d, h) {
    const stone = tint(b.pal.stone, 1.05), bronze = lerpHex(0x6aa38f, b.pal.paint[b.v % 4], 0.12);
    const ph = h * 0.34;
    b.box(w, ph * 0.5, d, 0, 0, 0, tint(stone, 0.9));
    b.box(w * 0.78, ph * 0.5, d * 0.78, 0, ph * 0.5, 0, stone);
    b.box(w * 0.9, 0.06, d * 0.9, 0, ph - 0.06, 0, tint(stone, 1.15));
    const fh = h - ph, r = Math.min(w, d) * 0.5;
    b.box(r * 0.4, fh * 0.42, r * 0.4, -r * 0.2, ph, 0, bronze);
    b.box(r * 0.4, fh * 0.42, r * 0.4, r * 0.2, ph, 0, bronze);
    b.cyl(r * 0.5, fh * 0.34, r * 0.34, 0, ph + fh * 0.4, 0, bronze, { seg: 10, top: 0.8 });
    b.sph(r * 0.25, r * 0.25, r * 0.25, 0, h - r * 0.25, 0, bronze);
    b.box(r * 0.2, fh * 0.3, r * 0.2, r * 0.55, ph + fh * 0.5, 0, bronze, { rz: 0.4 });
    b.box(r * 0.2, fh * 0.34, r * 0.2, -r * 0.58, ph + fh * 0.4, 0, bronze, { rz: -0.15 });
  },

  pillar(b, w, d, h) {
    const stone = tint(b.pal.stone, 1.05), band = b.pal.paint[b.v % 4];
    b.box(w, 0.22, d, 0, 0, 0, tint(stone, 0.88));
    b.box(w * 0.88, 0.1, d * 0.88, 0, 0.22, 0, tint(stone, 0.95));
    b.cyl(w * 0.38, h - 0.62, d * 0.38, 0, 0.32, 0, stone, { seg: 16 });
    b.cyl(w * 0.4, 0.12, d * 0.4, 0, h * 0.4, 0, band, { seg: 16 });
    b.box(w * 0.88, 0.1, d * 0.88, 0, h - 0.3, 0, tint(stone, 0.95));
    b.box(w, 0.2, d, 0, h - 0.2, 0, tint(stone, 1.12));
  },

  barrier(b, w, d, h) {
    const con = tint(b.pal.stone, 0.98 + b.rnd(5) * 0.06);
    b.box(w, h * 0.38, d, 0, 0, 0, tint(con, 0.9));
    b.box(w, h * 0.34, d * 0.72, 0, h * 0.38, 0, con);
    const n = Math.max(2, Math.floor(w / 0.6));
    for (let i = 0; i < n; i++) b.box(w / n, h * 0.28, d * 0.46, -w / 2 + (w / n) * (i + 0.5), h * 0.72, 0, i % 2 ? 0xf2f2f2 : b.pal.paint[0]);
  },

  container(b, w, d, h) {
    const col = [0xd9604c, 0x2f86a8, 0x4d9f7a, 0xe0a13a, 0x8f6fb5][b.v % 5];
    lengthwise(b, w, d, (g, W, L) => {
      const body = new THREE.Mesh(GEO.panel(L, W, h - 0.16, Math.max(6, Math.round(L / 0.35))), b.mat(col, { rough: 0.6 }));
      body.rotation.y = Math.PI / 2;
      body.castShadow = body.receiveShadow = true;
      body.userData.shared = true;
      g.add(body);
      b.box(W, 0.16, L, 0, h - 0.16, 0, tint(col, 0.7), { to: g });
      b.box(W, 0.14, L, 0, 0, 0, tint(col, 0.6), { to: g });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.18, h, 0.18, sx * (W / 2 - 0.09), 0, sz * (L / 2 - 0.09), 0x3b4048, { to: g });
      for (const sx of [-0.28, 0.28]) {
        b.box(0.05, h - 0.6, 0.04, sx * W, 0.3, L / 2 - 0.03, 0xb9c0c6, { to: g, metal: 0.5 });
        b.box(0.1, 0.14, 0.04, sx * W + (sx > 0 ? -0.1 : 0.1), h * 0.45, L / 2 - 0.03, 0x2c3036, { to: g });
      }
      b.box(W * 0.5, 0.2, 0.03, 0, h * 0.72, -L / 2 + 0.03, 0xf2f2f2, { to: g, cast: false });
    });
  },

  forklift(b, w, d, h) {
    const col = b.pal.paint[0], dark = 0x383c44, steel = 0x7c858d;
    lengthwise(b, w, d, (g, W, L) => {
      b.box(W, h * 0.3, L * 0.58, 0, 0.22, -L * 0.2, col, { to: g });
      b.box(W, h * 0.4, L * 0.22, 0, 0.22, -L * 0.4, dark, { to: g });
      b.box(W * 0.72, 0.1, L * 0.28, 0, h * 0.3 + 0.26, -L * 0.18, 0x2b3a58, { to: g });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, h * 0.58, 0.06, sx * (W / 2 - 0.1), h * 0.3 + 0.3, -L * 0.18 + sz * L * 0.12, dark, { to: g });
      b.box(W - 0.1, 0.07, L * 0.34, 0, h - 0.07, -L * 0.18, dark, { to: g });
      for (const sx of [-1, 1]) b.box(0.08, h * 0.88, 0.08, sx * (W * 0.28), 0, L / 2 - 0.12, steel, { to: g });
      b.box(W * 0.6, 0.08, 0.08, 0, h * 0.8, L / 2 - 0.12, steel, { to: g });
      for (const sx of [-1, 1]) b.box(0.09, 0.05, L * 0.34, sx * W * 0.28, 0.06, L / 2 - L * 0.17, steel, { to: g });
      for (const sx of [-1, 1]) b.cylX(0.24, 0.3, 0.3, sx * (W / 2 - 0.12), 0.3, L * 0.12, dark, { to: g });
      for (const sx of [-1, 1]) b.cylX(0.2, 0.22, 0.22, sx * (W / 2 - 0.12), 0.22, -L * 0.36, dark, { to: g });
    });
  },

  tyres(b, w, d, h) {
    const n = Math.max(1, Math.round(h / 0.32)), th = h / n;
    for (let i = 0; i < n; i++) {
      b.put(GEO.torus(), 0x2b2d33, w / 2, th / 0.6, d / 2, 0, i * th + th / 2, 0, { rough: 0.95 });
    }
    b.cyl(w * 0.2, 0.01, d * 0.2, 0, h - 0.005, 0, 0x14161a, { cast: false });
  },

  bin(b, w, d, h) {
    const col = [0x4d9f7a, 0x2f86a8, 0x8f98a0][b.v % 3], rx = w / 2, rz = d / 2;
    b.cyl(rx, h * 0.9, rz, 0, 0, 0, col, { seg: 12, top: 0.86 });
    b.cyl(rx * 0.94, 0.08, rz * 0.94, 0, h * 0.9, 0, tint(col, 0.75), { seg: 12 });
    b.cyl(rx * 0.3, h * 0.02, rz * 0.3, 0, h * 0.98, 0, tint(col, 0.6), { seg: 8 });
    b.box(rx * 1.0, 0.07, 0.03, 0, h * 0.5, rz * 0.82, 0xf2f2f2, { cast: false });
  },

  dumpster(b, w, d, h) {
    const col = b.pal.paint[(b.v + 3) % 4];
    lengthwise(b, w, d, (g, W, L) => {
      b.box(W - 0.1, 0.12, L - 0.1, 0, 0.18, 0, 0x30343a, { to: g });
      b.box(W, h * 0.74, L, 0, 0.3, 0, col, { to: g });
      b.box(W, 0.08, L, 0, h * 0.74 + 0.22, 0, tint(col, 0.7), { to: g });
      b.box(W - 0.08, h - h * 0.74 - 0.3, L * 0.5, 0, h * 0.74 + 0.3, -L * 0.24, 0x2b2f36, { to: g });
      for (const s of [-1, 1]) b.cylX(0.1, 0.1, 0.1, s * (W / 2 - 0.1), 0.1, L / 2 - 0.15, 0x20232a, { to: g });
      b.box(W * 0.3, 0.12, 0.03, 0, h * 0.5, L / 2 + 0.0, 0xf2f2f2, { to: g, cast: false });
    });
  },

  hedge(b, w, d, h) {
    const long = w >= d, len = long ? w : d, wid = long ? d : w;
    b.box(w - 0.04, h * 0.6, d - 0.04, 0, 0, 0, tint(b.pal.leaf, 0.62), { cast: false });
    const n = Math.max(2, Math.round(len / 0.85)), r = len / n / 2;
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + r + i * (len - 2 * r) / (n - 1), col = tint(b.pal.leaf, 0.82 + hash(i, b.v) * 0.34), ry = h * 0.34;
      const x = long ? t : 0, z = long ? 0 : t;
      b.sph(long ? r : wid / 2, ry, long ? wid / 2 : r, x, h - ry, z, col);
      b.sph(long ? r : wid / 2, ry * 0.7, long ? wid / 2 : r, x, h * 0.4, z, tint(col, 0.88));
      if (hash(i, 9 + b.v) > 0.6) b.sph(0.07, 0.07, 0.07, long ? x + 0.15 : 0, h - 0.3, long ? wid / 2 - 0.08 : z + 0.15, b.pal.paint[(i + b.v) % 4], { cast: false });
    }
  },

  bush(b, w, d, h) {
    const col = tint(b.pal.leaf, 0.85 + b.rnd(6) * 0.3), r = 0.55;
    b.sph(w / 2, h / 2, d / 2, 0, h / 2, 0, col);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + b.rnd(7) * 3;
      b.sph(w / 2 * r, h / 2 * r, d / 2 * r, Math.cos(a) * w / 2 * (1 - r), h / 2 * r + (i % 2) * 0.1, Math.sin(a) * d / 2 * (1 - r), tint(col, 0.9 + (i % 3) * 0.1));
    }
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + b.rnd(8) * 5;
      b.sph(0.06, 0.06, 0.06, Math.cos(a) * w * 0.36, h * (0.45 + 0.1 * (i % 3)), Math.sin(a) * d * 0.36, b.pal.paint[(i + b.v) % 4], { cast: false });
    }
  },

  tallGrass(b, w, d, h) {
    const cols = 4, rows = 3;
    b.sph(w / 2, 0.12, d / 2, 0, 0, 0, tint(b.pal.leaf, 0.7), { cast: false });
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const cx = -w / 2 + (i + 0.5) * (w / cols), cz = -d / 2 + (j + 0.5) * (d / rows);
      for (let k = 0; k < 2; k++) {
        const hh = h * (0.7 + hash(i * 3 + k, j) * 0.3), r = Math.min(w / cols, d / rows) * 0.45;
        const px = cx + (hash(i, j, k) - 0.5) * 0.3, pz = cz + (hash(j, i, k + 4) - 0.5) * 0.3;
        b.cone(r, hh, r, Math.max(-w / 2 + r, Math.min(w / 2 - r, px)), 0, Math.max(-d / 2 + r, Math.min(d / 2 - r, pz)), lerpHex(b.pal.leaf, 0xd9d070, hash(i, j, k + 2) * 0.55), { seg: 5 });
      }
    }
  },

  tree(b, w, d, h) {
    const trunk = 0x8a6a52, r = Math.min(w, d) / 2, leaf = tint(b.pal.leaf, 0.85 + b.rnd(9) * 0.25);
    b.cyl(r, h * 0.12, r, 0, 0, 0, tint(trunk, 0.9), { top: 0.7 });
    b.cyl(r * 0.7, h * 0.6, r * 0.7, 0, h * 0.1, 0, trunk, { top: 0.75 });
    if (b.v % 2 === 1) {
      for (let i = 0; i < 3; i++) b.cone(h * (0.3 - i * 0.07), h * 0.34, h * (0.3 - i * 0.07), 0, h * (0.28 + i * 0.22) - (i === 2 ? 0.0 : 0), 0, tint(0x4f9a62, 0.9 + i * 0.1), { seg: 8 });
    } else {
      const R = h * 0.3;
      b.sph(R, R * 0.9, R, 0, h - R * 0.9, 0, leaf);
      b.sph(R * 0.7, R * 0.65, R * 0.7, R * 0.6, h - R * 1.5, R * 0.2, tint(leaf, 0.9));
      b.sph(R * 0.65, R * 0.6, R * 0.65, -R * 0.55, h - R * 1.45, -R * 0.2, tint(leaf, 1.08));
    }
  },

  lampPost(b, w, d, h) {
    const iron = 0x3d4550, r = w / 2;
    b.cyl(r, 0.25, r, 0, 0, 0, iron, { seg: 8, top: 0.55 });
    b.cyl(r * 0.28, h - 0.7, r * 0.28, 0, 0.25, 0, iron, { seg: 8 });
    b.cyl(r * 0.6, 0.1, r * 0.6, 0, h - 0.5, 0, iron, { seg: 8 });
    b.cyl(r * 0.85, 0.34, r * 0.85, 0, h - 0.42, 0, 0xfff3c4, { seg: 8, top: 0.8, emissive: 0xb59b3a });
    b.cone(r, 0.16, r, 0, h - 0.16, 0, iron, { seg: 8 });
  },

  bollard(b, w, d, h) {
    b.cyl(w / 2, h, d / 2, 0, 0, 0, tint(b.pal.stone, 0.9), { seg: 10 });
    b.cyl(w / 2, 0.14, d / 2, 0, h * 0.62, 0, b.pal.paint[b.v % 4], { seg: 10 });
    b.sph(w / 2, 0.12, d / 2, 0, h - 0.12, 0, tint(b.pal.stone, 1.1));
  },

  kiosk(b, w, d, h) {
    const wall = tint(b.pal.paint[b.v % 4], 1.15), trim = 0xfaf3e6, alt = b.pal.paint[(b.v + 1) % 4];
    b.box(w, 0.2, d, 0, 0, 0, tint(b.pal.stone, 0.8));
    b.box(w - 0.1, h - 0.45, d - 0.1, 0, 0.2, 0, wall);
    b.box(w, 0.25, d, 0, h - 0.25, 0, tint(alt, 0.85));
    b.box(w * 0.62, h * 0.3, 0.04, 0, h * 0.36, d / 2 - 0.07, 0x2d3a48, { cast: false });
    b.box(w * 0.7, 0.08, 0.28, 0, h * 0.34 - 0.04, d / 2 - 0.2, trim);
    const n = 6, sw = (w - 0.1) / n;
    for (let i = 0; i < n; i++) b.box(sw, 0.05, 0.6, -(w - 0.1) / 2 + sw * (i + 0.5), h * 0.64, d / 2 - 0.36, i % 2 ? trim : alt, { rx: 0.25 });
    b.box(0.9, 0.3, 0.1, w / 2 - 0.7, h - 0.78, -d / 2 + 0.1, trim, { cast: false });
  },

  busShelter(b, w, d, h) {
    const frame = b.pal.paint[1], glass = 0xbfe3ef;
    for (const sx of [-1, 1]) b.box(0.1, h - 0.1, 0.1, sx * (w / 2 - 0.05), 0, -d / 2 + 0.06, frame);
    b.box(0.08, h - 0.2, 0.08, -w / 2 + 0.05, 0, d / 2 - 0.05, frame);
    b.box(w, 0.12, d, 0, h - 0.12, 0, tint(frame, 0.8));
    b.box(w - 0.2, h - 0.5, 0.03, 0, 0.3, -d / 2 + 0.05, glass, { opacity: 0.4, rough: 0.1, cast: false });
    b.box(0.03, h - 0.5, d - 0.2, -w / 2 + 0.06, 0.3, 0, glass, { opacity: 0.4, rough: 0.1, cast: false });
    b.box(w * 0.6, 0.06, d * 0.36, 0, 0.5, -d / 2 + d * 0.3, b.pal.wood);
    b.box(w * 0.3, 1.2, 0.05, w / 2 - w * 0.2, 0.5, -d / 2 + 0.1, b.pal.paint[0], { cast: false });
  },

  fence(b, w, d, h) {
    const wood = lerpHex(0xf3ede0, b.pal.paint[(b.v + 1) % 4], 0.14);
    const long = w >= d, len = long ? w : d, thick = long ? d : w, n = Math.max(3, Math.round(len / 0.26));
    for (let i = 0; i < n; i++) {
      const a = -len / 2 + (len / n) * (i + 0.5), pw = len / n * 0.72, ph = h * (i % 2 ? 0.94 : 1) - 0.02;
      if (long) b.box(pw, ph, thick, a, 0.02, 0, wood, { cast: false });
      else b.box(thick, ph, pw, 0, 0.02, a, wood, { cast: false });
    }
    for (const y of [h * 0.25, h * 0.65]) b.box(long ? len : thick * 0.6, 0.07, long ? thick * 0.6 : len, 0, y, 0, tint(wood, 0.82), { cast: false });
    const posts = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= posts; i++) {
      const a = -len / 2 + 0.06 + i * (len - 0.12) / posts;
      b.box(long ? 0.12 : thick, h, long ? thick : 0.12, long ? a : 0, 0, long ? 0 : a, tint(wood, 0.88));
    }
  },

  hayBale(b, w, d, h) {
    const straw = tint(0xe6c46a, 0.92 + b.rnd(10) * 0.14), n = Math.max(1, Math.round(h / 0.45)), lh = h / n;
    for (let i = 0; i < n; i++) {
      const off = (i % 2) * 0.06, y = i * lh;
      b.box(w - 0.04 - off, lh - 0.01, d - 0.04 - off, 0, y, 0, i % 2 ? tint(straw, 0.94) : straw);
      for (const s of [-0.28, 0.28]) b.box(0.04, lh - 0.02, d - off, s * w, y, 0, 0x8a6a3c, { cast: false });
    }
  },

  stairs(b, w, d, h) {
    const stone = b.pal.stone, n = 4, sd = d / n;
    for (let i = 0; i < n; i++) {
      b.box(w, h * (i + 1) / n, sd, 0, 0, d / 2 - sd * (i + 0.5), tint(stone, 0.9 + i * 0.05));
      b.box(w - 0.1, 0.03, sd * 0.3, 0, h * (i + 1) / n - 0.015, d / 2 - sd * i - sd * 0.85, b.pal.paint[0], { cast: false });
    }
  },

  shelf(b, w, d, h) {
    const post = b.pal.paint[1], beam = b.pal.paint[0], lv = 3, boxes = [0xc9a06a, 0xd7b27c, 0xb98f58, 0xdfe5e8];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, h, 0.08, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), post);
    for (let i = 0; i < lv; i++) {
      const y = 0.15 + i * (h - 0.35) / lv;
      b.box(w, 0.07, 0.06, 0, y, d / 2 - 0.04, beam, { cast: false });
      b.box(w, 0.07, 0.06, 0, y, -d / 2 + 0.04, beam, { cast: false });
      b.box(w - 0.1, 0.03, d - 0.1, 0, y + 0.07, 0, 0x8c8f96, { cast: false });
      const bh = (h - 0.35) / lv - 0.22;
      for (let k = 0; k < 3; k++) {
        const bw = (w - 0.2) / 3 - 0.05;
        b.box(bw, bh * (0.6 + hash(i, k, b.v) * 0.4), d - 0.22, -w / 2 + 0.15 + bw / 2 + k * (bw + 0.05), y + 0.1, 0, boxes[(i + k + b.v) % 4]);
      }
    }
    b.box(w, 0.05, d, 0, h - 0.05, 0, beam, { cast: false });
  },

  barrel(b, w, d, h) {
    const nx = Math.max(1, Math.round(w / 0.8)), nz = Math.max(1, Math.round(d / 0.8));
    const cols = [b.pal.paint[0], b.pal.paint[1], b.pal.paint[2], 0x6a7682];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const r = Math.min(w / nx, d / nz) / 2, x = -w / 2 + (i + 0.5) * w / nx, z = -d / 2 + (j + 0.5) * d / nz;
      const c = cols[(b.v + i * 2 + j) % 4];
      b.cyl(r, h, r, x, 0, z, c, { seg: 14, metal: 0.25, rough: 0.55 });
      for (const y of [0.18, 0.5, 0.82]) b.cyl(r, 0.06, r, x, h * y - 0.03, z, tint(c, 0.72), { seg: 14, metal: 0.25 });
      b.cyl(r * 0.8, 0.02, r * 0.8, x, h - 0.01, z, tint(c, 0.85), { seg: 14, cast: false });
    }
  },

  boat(b, w, d, h) {
    const hull = b.pal.paint[b.v % 4], trim = 0xfaf3e6;
    lengthwise(b, w, d, (g, W, L) => {
      const sx = W / 2, sz = L / 2, standH = 0.4, hh = h * 0.42, rim = standH + hh;
      for (const z of [-L * 0.2, L * 0.2]) b.box(W * 0.9, 0.1, 0.12, 0, standH - 0.1, z, 0x6b4a36, { to: g });
      for (const s of [-1, 1]) b.box(0.1, standH, 0.1, s * sx * 0.45, 0, L * 0.2, 0x6b4a36, { to: g });
      b.put(GEO.bowl(), hull, sx, hh, sz, 0, rim, 0, { side: true, to: g });
      b.cyl(sx, 0.06, sz, 0, rim - 0.03, 0, trim, { seg: 20, to: g });
      b.cyl(sx * 0.92, 0.02, sz * 0.92, 0, rim - 0.05, 0, 0x6b4a36, { seg: 20, to: g });
      b.box(W * 0.76, h - rim - 0.1, L * 0.3, 0, rim, -L * 0.22, trim, { to: g });
      b.box(W * 0.8, 0.1, L * 0.34, 0, h - 0.1, -L * 0.22, hull, { to: g });
      b.box(W * 0.66, 0.22, 0.03, 0, rim + 0.25, -L * 0.22 + L * 0.15, 0x31404f, { to: g });
      b.box(0.06, h - rim, 0.06, 0, rim, L * 0.2, 0x6b4a36, { to: g });
    });
  },

  cafeTable(b, w, d, h) {
    const col = b.pal.paint[b.v % 4];
    b.cyl(0.18, 0.03, 0.18, 0, 0, 0, 0x3b4048, { seg: 10 });
    b.cyl(0.04, 0.72, 0.04, 0, 0, 0, 0x3b4048, { seg: 8 });
    b.cyl(0.35, 0.04, 0.35, 0, 0.72, 0, b.pal.wood, { seg: 14 });
    for (const x of [-w * 0.32, w * 0.32]) {
      b.cyl(0.19, 0.04, 0.19, x, 0.44, 0, col, { seg: 10 });
      b.box(0.04, 0.44, 0.04, x, 0, 0, 0x3b4048);
    }
    b.cyl(0.03, h - 0.3, 0.03, 0, 0.3, 0, 0xcfd6dc, { seg: 6 });
    b.cone(w / 2, 0.3, d / 2, 0, h - 0.3, 0, col, { seg: 10 });
    b.cone(w * 0.12, 0.05, d * 0.12, 0, h - 0.05, 0, tint(col, 1.3), { seg: 8 });
  },

  vending(b, w, d, h) {
    const col = b.pal.paint[b.v % 4];
    b.box(w, h, d, 0, 0, 0, col);
    b.box(w * 0.7, h * 0.55, 0.04, -w * 0.08, h * 0.32, d / 2 - 0.0, 0xbfe3ef, { opacity: 0.55, emissive: 0x30586a, cast: false }).position.z = d / 2 - 0.02;
    for (let i = 0; i < 3; i++) b.box(w * 0.64, 0.14, 0.04, -w * 0.08, h * 0.38 + i * h * 0.15, d / 2 - 0.03, b.pal.paint[(i + b.v) % 4], { cast: false });
    b.box(w * 0.14, h * 0.4, 0.03, w * 0.36, h * 0.4, d / 2 - 0.0, 0x2d3a48, { cast: false }).position.z = d / 2 - 0.015;
  },

  mailbox(b, w, d, h) {
    const col = b.pal.paint[1];
    b.box(w * 0.5, h * 0.45, d * 0.5, 0, 0, 0, 0x3d4550);
    b.cyl(w / 2, h * 0.5, d / 2, 0, h * 0.45, 0, col, { seg: 12 });
    b.box(w * 0.7, 0.04, 0.03, 0, h * 0.62, d / 2 - 0.03, 0x1d2430, { cast: false });
    b.cyl(w * 0.45, 0.06, d * 0.45, 0, h - 0.06, 0, tint(col, 0.75), { seg: 12 });
  },

  hydrant(b, w, d, h) {
    const col = 0xe5493a;
    b.cyl(w * 0.34, h * 0.8, d * 0.34, 0, 0, 0, col, { seg: 10 });
    b.cyl(w / 2, 0.1, d / 2, 0, 0, 0, tint(col, 0.75), { seg: 10 });
    b.sph(w * 0.34, h * 0.2, d * 0.34, 0, h * 0.8, 0, col);
    b.cylX(w, 0.09, 0.09, 0, h * 0.5, 0, col, { seg: 8 });
  },

  phoneBooth(b, w, d, h) {
    const col = 0xd9403a, glass = 0xbfe3ef;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, h - 0.2, 0.08, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), col);
    b.box(w, 0.2, d, 0, h - 0.2, 0, col);
    b.box(w * 0.7, 0.14, 0.02, 0, h - 0.17, d / 2, 0xfff3c4, { emissive: 0x8a7a30, cast: false }).position.z = d / 2 - 0.0;
    for (const s of [-1, 1]) {
      b.box(w - 0.14, h - 0.6, 0.03, 0, 0.25, s * (d / 2 - 0.03), glass, { opacity: 0.35, cast: false });
      b.box(0.03, h - 0.6, d - 0.14, s * (w / 2 - 0.03), 0.25, 0, glass, { opacity: 0.35, cast: false });
    }
    b.box(w, 0.25, d, 0, 0, 0, tint(col, 0.8));
    b.box(0.35, 0.3, 0.1, 0, 1.15, -d / 2 + 0.08, 0x30343a);
  },
};

// Decor-only builders. w/d = bounds.
const FLAT = 0.025;
const flat = (b, w, d, x, z, c, off = 1, y = FLAT) => b.box(w, 0.01, d, x, y, z, c, { cast: false, offset: off });

const D = {
  roadLine(b, w, d) {
    const long = w >= d, len = long ? w : d, col = b.prop.colour ?? 0xf0f0d7, dash = b.prop.dash;
    if (!dash) return flat(b, w, d, 0, 0, col);
    const n = Math.floor((len + dash) / (dash * 2));
    for (let i = 0; i < n; i++) {
      const a = -len / 2 + dash / 2 + i * dash * 2;
      if (long) flat(b, dash, d, a, 0, col); else flat(b, w, dash, 0, a, col);
    }
  },
  crosswalk(b, w, d) {
    const long = w >= d, len = long ? w : d, span = long ? d : w, n = Math.floor(len / 0.7);
    for (let i = 0; i < n; i++) {
      const a = -len / 2 + (len / n) * (i + 0.5);
      if (long) flat(b, 0.38, span, a, 0, 0xf4f1e4); else flat(b, span, 0.38, 0, a, 0xf4f1e4);
    }
  },
  hazard(b, w, d) {
    const long = w >= d, len = long ? w : d, span = long ? d : w, n = Math.floor(len / 0.5);
    flat(b, w, d, 0, 0, 0x30333a);
    for (let i = 0; i < n; i += 2) {
      const a = -len / 2 + (len / n) * (i + 0.5);
      if (long) flat(b, len / n, span, a, 0, 0xf2c14e, 1.5); else flat(b, span, len / n, 0, a, 0xf2c14e, 1.5);
    }
  },
  pavers(b, w, d) {
    const base = b.prop.colour ?? tint(b.pal.stone, 1.06), step = b.prop.cell ?? 1.5;
    flat(b, w, d, 0, 0, base);
    for (let x = -w / 2 + step; x < w / 2 - 0.1; x += step) flat(b, 0.04, d, x, 0, tint(base, 0.82), 1.5);
    for (let z = -d / 2 + step; z < d / 2 - 0.1; z += step) flat(b, w, 0.04, 0, z, tint(base, 0.82), 1.5);
  },
  flowers(b, w, d) {
    const n = Math.min(18, Math.max(4, Math.round(w * d * 3)));
    b.cyl(w / 2, 0.03, d / 2, 0, 0, 0, tint(b.pal.leaf, 0.8), { seg: 12, cast: false });
    for (let i = 0; i < n; i++) {
      const x = (hash(i, 1, b.v) - 0.5) * (w - 0.2), z = (hash(i, 2, b.v) - 0.5) * (d - 0.2), hh = 0.18 + hash(i, 3, b.v) * 0.2;
      b.box(0.02, hh, 0.02, x, 0, z, 0x4d8f58, { cast: false });
      b.sph(0.07, 0.05, 0.07, x, hh + 0.03, z, b.pal.paint[(i + b.v) % 4], { cast: false });
    }
  },
  mudPatch: (b, w, d) => patch(b, w, d, 0x7b5a3c, 0x65472e, 0x8c6a48, 'mud'),
  puddlePatch: (b, w, d) => patch(b, w, d, 0x7cc0dc, 0x6bb2d2, 0xdff4fb, 'water'),
  sandPatch: (b, w, d) => patch(b, w, d, 0xe6cf93, 0xd9bf80, 0xf2e2b0, 'sand'),
  leafPile(b, w, d) {
    patch(b, w, d, 0x9a7a3a, 0x8a6a30, 0xb08a40, 'leaf');
    const cols = [0xd9604c, 0xe8a03a, 0xf0c64a, 0xb5472f];
    for (let i = 0; i < 22; i++) {
      const a = hash(i, 1, b.v) * Math.PI * 2, r = Math.sqrt(hash(i, 2, b.v)) * 0.4;
      b.box(0.28, 0.01, 0.2, Math.cos(a) * w * r, FLAT + 0.012, Math.sin(a) * d * r, cols[i % 4], { cast: false, ry: hash(i, 3, b.v) * 3, offset: 2 });
    }
  },
  sandbox(b, w, d) {
    const wood = b.pal.wood, t = 0.2;
    b.box(w - 2 * t, 0.2, d - 2 * t, 0, 0, 0, 0xe6cf93, { cast: false });
    for (const s of [-1, 1]) {
      b.box(w, 0.3, t, 0, 0, s * (d / 2 - t / 2), wood);
      b.box(t, 0.3, d - 2 * t, s * (w / 2 - t / 2), 0, 0, tint(wood, 0.9));
    }
    b.dome(0.45, 0.2, 0.45, -w * 0.15, 0.2, -d * 0.1, 0xdcc487);
    b.dome(0.3, 0.14, 0.3, w * 0.18, 0.2, d * 0.12, 0xdcc487);
    b.cyl(0.14, 0.2, 0.14, w * 0.05, 0.2, d * 0.2, b.pal.paint[2], { seg: 10, top: 0.8 });
    b.cone(0.12, 0.2, 0.12, -w * 0.3, 0.2, d * 0.18, b.pal.paint[1], { seg: 6 });
  },
  bunting(b, w, d, h) {
    for (const s of [-1, 1]) b.cyl(0.05, h, 0.05, s * w / 2, 0, 0, 0x6c747c, { seg: 6 });
    const n = Math.max(3, Math.round(w / 0.55));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = -w / 2 + t * w, sag = Math.sin(t * Math.PI) * 0.35;
      b.put(GEO.tri(), b.pal.paint[i % 4], 0.4, 0.4, 1, x, h - 0.03 - sag, 0, { side: true, cast: false });
      b.cylX(w / n, 0.012, 0.012, x, h - sag, 0, 0x3b4048, { cast: false });
    }
  },
  sign(b, w, d, h) {
    b.cyl(0.04, h, 0.04, 0, 0, 0, 0x6c747c, { seg: 6 });
    b.box(0.6, 0.4, 0.04, 0, h - 0.45, 0, b.prop.colour ?? b.pal.paint[1]);
    b.box(0.46, 0.06, 0.05, 0, h - 0.3, 0, 0xf4f1e4, { cast: false });
    b.box(0.46, 0.06, 0.05, 0, h - 0.5, 0, 0xf4f1e4, { cast: false });
  },
  cone(b, w, d, h) {
    b.box(w, 0.04, d, 0, 0, 0, 0x30333a);
    b.cone(w * 0.4, h - 0.04, d * 0.4, 0, 0.04, 0, 0xf2762e, { seg: 10 });
    b.cyl(w * 0.27, 0.1, d * 0.27, 0, h * 0.4, 0, 0xf4f1e4, { seg: 10, top: 0.8 });
  },
  building(b, w, d, h) {
    const col = b.prop.colour ?? b.pal.stone;
    b.box(w, h, d, 0, 0, 0, col);
    b.box(w + 0.4, 0.4, d + 0.4, 0, h, 0, tint(col, 0.75));
    const cols = Math.max(2, Math.floor(w / 2.4)), rows = Math.max(1, Math.floor((h - 1.5) / 2.2));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lit = hash(c, r, b.v) > 0.75;
      b.box(w / cols * 0.5, 1.0, 0.1, -w / 2 + (c + 0.5) * w / cols, 1.5 + r * 2.2, d / 2, lit ? 0xffe9a8 : 0x4a5d70, { cast: false, emissive: lit ? 0x6a5a20 : undefined });
    }
  },
  water(b, w, d) {
    b.box(w, 0.02, d, 0, -0.02, 0, b.prop.colour ?? b.pal.water, { cast: false, rough: 0.2, metal: 0.1, emissive: 0x10303f });
    const n = Math.floor(w / 5);
    for (let i = 0; i < n; i++) b.box(2.2, 0.01, 0.06, -w / 2 + (i + 0.5) * 5 + hash(i, 1), 0.0, (hash(i, 2) - 0.5) * (d - 1), 0xdff4fb, { cast: false, opacity: 0.55 });
  },
  crane(b, w, d, h) {
    const col = b.pal.paint[2];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.4, h * 0.8, 0.4, sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2), col);
    b.box(w, 0.5, d, 0, h * 0.8, 0, tint(col, 0.85));
    b.box(w * 2.2, 0.5, 0.6, w * 0.4, h * 0.8 + 0.5, 0, col);
    b.box(1.6, 1.4, 1.6, -w * 0.4, h * 0.8 + 0.5, 0, 0x6c747c);
    b.box(0.08, h * 0.25, 0.08, w * 1.2, h * 0.55, 0, 0x2b2f36, { cast: false });
  },
};

// Slow-zone decal: overlapping flat ellipses inside the w x d bounds.
function patch(b, w, d, base, dark, light, kind) {
  const blobs = [[0, 0, 0.5, 0.5], [-0.25, 0.1, 0.3, 0.36], [0.26, -0.1, 0.3, 0.38], [0.05, 0.3, 0.28, 0.2], [-0.05, -0.3, 0.3, 0.2]];
  const shiny = kind === 'water';
  const mat = { cast: false, seg: 18, offset: 2, rough: shiny ? 0.12 : 0.95, metal: shiny ? 0.15 : 0.02 };
  blobs.forEach(([ox, oz, rx, rz], i) => b.cyl(w * rx, 0.01, d * rz, w * ox, FLAT + i * 0.001, d * oz, i % 2 ? dark : base, mat));
  if (shiny) b.cyl(w * 0.2, 0.012, d * 0.14, -w * 0.08, FLAT + 0.01, -d * 0.06, light, { ...mat, opacity: 0.6, emissive: 0x20607a });
  else if (kind !== 'leaf') for (let i = 0; i < 4; i++) b.sph(w * 0.05, 0.02, d * 0.05, (hash(i, 1, b.v) - 0.5) * w * 0.5, FLAT + 0.01, (hash(i, 2, b.v) - 0.5) * d * 0.5, light, { cast: false });
}

export function buildProp(prop, layout) {
  const group = new THREE.Group();
  const def = PROP_TYPES[prop.type];
  if (!def) return group;
  const rot = (((prop.rot ?? 0) % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const w = prop.w ?? def.w, d = prop.d ?? def.d, h = prop.h ?? def.h;
  const b = new Builder(PAL[layout?.theme] ?? PAL.street, prop);
  (B[prop.type] ?? D[prop.type])(b, swap ? d : w, swap ? w : d, h);
  b.g.rotation.y = (rot * Math.PI) / 180;
  group.add(b.g);
  group.userData.propType = prop.type;
  return group;
}
