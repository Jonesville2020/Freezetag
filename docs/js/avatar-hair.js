import * as THREE from 'three';
import { attachToBone } from './outfit.js?v=avatar3';

// Builds hair / hats for avatar.look.style on the head bone, coloured by look.hair (and look.accent for hats).
// Everything is authored in metres in the head mount frame (+Y up, +Z forward), fitted to the supplied head.

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => a - TAU * Math.round(a / TAU);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), FRONT = V(0, 0, 1), SIDE = V(1, 0, 0);

// Cranium ellipsoid (azimuth a: 0 = front, +a toward +X; phi: 0 = crown).
const C = V(0.004, 0.175, 0.014);
const R = V(0.128, 0.145, 0.14);

function skin(a, y, k = 1, floor = 0) {
  const dy = clamp((y - C.y) / R.y, -0.999, 0.999);
  let s = Math.sqrt(1 - dy * dy);
  if (dy < 0) s = Math.max(s, floor);
  return V(C.x + R.x * Math.sin(a) * s * k, y, C.z + R.z * Math.cos(a) * s * k);
}
function skinPhi(a, phi, k = 1) {
  const s = Math.sin(phi);
  return V(C.x + R.x * Math.sin(a) * s * k, C.y + R.y * Math.cos(phi) * k, C.z + R.z * Math.cos(a) * s * k);
}
const surfaceNormal = (p) => V((p.x - C.x) / (R.x * R.x), (p.y - C.y) / (R.y * R.y), (p.z - C.z) / (R.z * R.z)).normalize();
const phiAt = (y) => Math.acos(clamp((y - C.y) / R.y, -1, 1));

// Hairline height by azimuth: front / above the ears / nape.
function profile(front, side, back) {
  return (a) => {
    const t = Math.abs(wrap(a));
    return t < 1.5 ? lerp(front, side, smooth(0.55, 1.35, t)) : lerp(side, back, smooth(1.7, 2.8, t));
  };
}

// ---- raw geometry --------------------------------------------------------
class G {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  push(p, n, b) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(b, b, b); return this.count - 1; }

  smoothNormals() {
    const acc = new Float32Array(this.pos.length);
    const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0), f = V(0, 0, 0);
    for (let i = 0; i < this.idx.length; i += 3) {
      const tri = [this.idx[i], this.idx[i + 1], this.idx[i + 2]];
      a.fromArray(this.pos, tri[0] * 3); b.fromArray(this.pos, tri[1] * 3); c.fromArray(this.pos, tri[2] * 3);
      f.crossVectors(b.sub(a), c.sub(a));
      for (const j of tri) { acc[j * 3] += f.x; acc[j * 3 + 1] += f.y; acc[j * 3 + 2] += f.z; }
    }
    for (let i = 0; i < acc.length; i += 3) {
      const l = Math.hypot(acc[i], acc[i + 1], acc[i + 2]) || 1;
      this.nor[i] = acc[i] / l; this.nor[i + 1] = acc[i + 1] / l; this.nor[i + 2] = acc[i + 2] / l;
    }
    return this;
  }

  // Flips every triangle when most of the first `limit` indices face against their vertex normals.
  orient(limit = this.idx.length) {
    const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0), f = V(0, 0, 0), n = V(0, 0, 0);
    let wrong = 0, total = 0;
    for (let i = 0; i < limit; i += 3) {
      a.fromArray(this.pos, this.idx[i] * 3); b.fromArray(this.pos, this.idx[i + 1] * 3); c.fromArray(this.pos, this.idx[i + 2] * 3);
      f.crossVectors(b.sub(a), c.sub(a));
      n.fromArray(this.nor, this.idx[i] * 3);
      total++;
      if (f.dot(n) < 0) wrong++;
    }
    if (wrong > total / 2) for (let i = 0; i < this.idx.length; i += 3) [this.idx[i + 1], this.idx[i + 2]] = [this.idx[i + 2], this.idx[i + 1]];
    return this;
  }

  static from(geometry, matrix, shade = () => 1) {
    const g = new G(), p = V(0, 0, 0), n = V(0, 0, 0);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const { position, normal } = geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(matrix);
      n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      g.push(p, n, shade(p, n));
    }
    g.idx = Array.from(geometry.index.array);
    geometry.dispose();
    return g;
  }
}

function toGeometry(parts, offset) {
  const pos = [], nor = [], col = [], idx = [];
  for (const g of parts) {
    const base = pos.length / 3;
    for (let i = 0; i < g.pos.length; i += 3) pos.push(g.pos[i] - offset.x, g.pos[i + 1] - offset.y, g.pos[i + 2] - offset.z);
    nor.push(...g.nor); col.push(...g.col);
    for (const i of g.idx) idx.push(i + base);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  return geometry;
}

function defaultShade(a, v) {
  return Math.min(1, 1 - 0.2 * smooth(0.5, 1, v) + 0.03 * Math.sin(a * 22 + v * 4));
}

// Dome-like hair shell following the cranium down to a per-azimuth hairline.
function shell({
  yEnd, thick = () => 0.07, floor = 0, rimK = 0.012, span = 0.3, bulge = null,
  shade = defaultShade, na = 60, nv = 16, vStart = 0.05,
}) {
  const g = new G(), P = V(0, 0, 0), rim = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i < na; i++) {
      const a = (i / na) * TAU;
      const phiEnd = Math.acos(clamp((yEnd(a) - C.y) / R.y, -0.97, 0.98));
      const phi = lerp(vStart, phiEnd, v);
      let s = Math.sin(phi);
      if (phi > Math.PI / 2) s = Math.max(s, floor);
      const taper = smooth(1, 1 - span, v);
      let k = 1 + rimK + (thick(a, v) - rimK) * taper;
      if (bulge) k += bulge(a, phi, v) * taper;
      P.set(C.x + R.x * Math.sin(a) * s * k, C.y + R.y * Math.cos(phi) * k, C.z + R.z * Math.cos(a) * s * k);
      g.push(P, P, shade(a, v));
      if (j === nv) rim.push(P.clone());
    }
  }
  const centre = V(0, 0, 0);
  for (let i = 0; i < na; i++) centre.add(P.fromArray(g.pos, i * 3));
  centre.divideScalar(na);
  const top = g.push(centre, centre, shade(0, 0));
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < na; i++) {
      const i2 = (i + 1) % na;
      const a = j * na + i, b = j * na + i2, c = (j + 1) * na + i, d = (j + 1) * na + i2;
      g.idx.push(a, c, b, b, c, d);
    }
  }
  for (let i = 0; i < na; i++) g.idx.push(top, (i + 1) % na, i);
  g.smoothNormals().orient();
  g.rim = rim;
  return g;
}

// Tapered tube along a path; width = flat * thickness, thickness direction from `hint` (or the scalp normal).
function tube(points, {
  r0 = 0.03, r1 = 0, rf = null, flat = 1, hint = FRONT, surface = false, sides = 8, samples = 0,
  closed = false, shade = null, capStart = true, capEnd = true,
} = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const n = samples || Math.max(8, points.length * 4);
  const rows = closed ? n : n + 1;
  const g = new G();
  const T = V(0, 0, 0), W = V(0, 0, 0), N = V(0, 0, 0), P = V(0, 0, 0), H = V(0, 0, 0);
  for (let i = 0; i < rows; i++) {
    const t = Math.min(i / n, 1);
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    H.copy(surface ? surfaceNormal(P) : hint);
    if (Math.abs(H.dot(T)) > 0.97) H.set(1, 0, 0);
    W.crossVectors(T, H).normalize();
    N.crossVectors(W, T).normalize();
    let r = rf ? rf(t) : lerp(r0, r1, t);
    if (!closed) {
      if (capEnd) r *= Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.9) / 0.1), 2)));
      if (capStart) r *= Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (0.06 - t) / 0.06), 2)));
    }
    const b = shade ? shade(t) : 1;
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * TAU, cx = Math.cos(ang), cy = Math.sin(ang);
      g.push(V(0, 0, 0).copy(P).addScaledVector(W, cx * r * flat).addScaledVector(N, cy * r),
        V(0, 0, 0).addScaledVector(W, cx / flat).addScaledVector(N, cy).normalize(), b);
    }
  }
  for (let i = 0; i < (closed ? rows : rows - 1); i++) {
    const i2 = (i + 1) % rows;
    for (let s = 0; s < sides; s++) {
      const s2 = (s + 1) % sides;
      g.idx.push(i * sides + s, i2 * sides + s, i * sides + s2, i * sides + s2, i2 * sides + s, i2 * sides + s2);
    }
  }
  return g.orient();
}

// Closed slab (outer + inner skin pinched at the edges by `th`), e.g. hanging hair, brims, cuffs.
function sheet({ nu, nv, wrapU = false, P, N, th, shade = () => 1 }) {
  const g = new G(), p = V(0, 0, 0), n = V(0, 0, 0), q = V(0, 0, 0);
  const cols = wrapU ? nu : nu + 1, layer = cols * (nv + 1);
  for (const side of [1, -1]) {
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i < cols; i++) {
        const u = i / nu, v = j / nv;
        P(u, v, p); N(u, v, n, p);
        q.copy(p).addScaledVector(n, side * th(u, v) / 2);
        g.push(q, n.clone().multiplyScalar(side), shade(u, v));
      }
    }
  }
  const outer = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i2 = wrapU ? (i + 1) % nu : i + 1;
      const a = j * cols + i, b = j * cols + i2, c = (j + 1) * cols + i, d = (j + 1) * cols + i2;
      outer.push(a, c, b, b, c, d);
    }
  }
  g.idx = outer.concat(outer.map((v, i) => outer[i - (i % 3) + [0, 2, 1][i % 3]] + layer));
  g.orient(outer.length);
  g.smoothNormals();
  return g;
}

const matrixOf = (x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(
  V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));

function ball(x, y, z, r, { sx = 1, sy = 1, sz = 1, rot = [0, 0, 0], shade, detail = 12 } = {}) {
  return G.from(new THREE.SphereGeometry(r, detail, Math.round(detail * 0.7)), matrixOf(x, y, z, sx, sy, sz, ...rot), shade);
}

// Ring of radius r around `dir` at p.
function band(p, dir, r, w, shade) {
  const q = new THREE.Quaternion().setFromUnitVectors(FRONT, dir.clone().normalize());
  return G.from(new THREE.TorusGeometry(r, w, 8, 24), new THREE.Matrix4().compose(p, q, V(1, 1, 1)), shade);
}

const rimTube = (g, r, shade = 0.85) => tube(g.rim.concat([g.rim[0]]), { rf: () => r, closed: true, samples: g.rim.length * 2, hint: UP, shade: () => shade });

// ---- secondary motion ----------------------------------------------------
const _q = new THREE.Quaternion(), _w = V(0, 0, 0), _d = V(0, 0, 0), _e = new THREE.Euler();

// Pivot that swings like a damped pendulum from its own world motion; self-contained and bounded.
class Sway extends THREE.Object3D {
  constructor({ gain = 0.05, stiffness = 15, damping = 0.3, gravity = 0.45, limitX = [-0.5, 0.5], limitZ = [-0.5, 0.5] } = {}) {
    super();
    Object.assign(this, { gain, stiffness, damping, gravity, limitX, limitZ });
    this.angle = [0, 0]; this.rate = [0, 0]; this.last = null; this.prev = V(0, 0, 0);
  }

  updateMatrixWorld(force) {
    if (this.parent) {
      const now = performance.now();
      if (this.last === null) {
        this.last = now;
        this.step(0, true);
      } else {
        const dt = Math.min((now - this.last) / 1000, 0.05);
        if (dt > 0.0005) { this.last = now; this.step(dt, false); }
      }
    }
    super.updateMatrixWorld(force);
  }

  step(dt, first) {
    const m = this.parent.matrixWorld;
    _q.setFromRotationMatrix(m).invert();
    _w.copy(this.position).applyMatrix4(m);
    let vx = 0, vz = 0;
    if (!first) {
      _d.copy(_w).sub(this.prev).divideScalar(dt);
      if (_d.length() < 25) { _d.applyQuaternion(_q); vx = _d.x; vz = _d.z; }
    }
    this.prev.copy(_w);
    _d.set(0, -1, 0).applyQuaternion(_q);
    const target = [
      clamp(this.gravity * Math.atan2(-_d.z, -_d.y) + this.gain * vz, ...this.limitX),
      clamp(this.gravity * Math.atan2(_d.x, -_d.y) - this.gain * vx, ...this.limitZ),
    ];
    if (first) this.angle = target.slice();
    const w = this.stiffness, steps = Math.max(1, Math.ceil(dt * 90)), h = dt / steps;
    for (let s = 0; s < steps && dt > 0; s++) {
      for (let k = 0; k < 2; k++) {
        this.rate[k] += (-w * w * (this.angle[k] - target[k]) - 2 * this.damping * w * this.rate[k]) * h;
        this.angle[k] += this.rate[k] * h;
      }
    }
    this.angle[0] = clamp(this.angle[0], ...this.limitX);
    this.angle[1] = clamp(this.angle[1], ...this.limitZ);
    this.quaternion.setFromEuler(_e.set(this.angle[0], 0, this.angle[1], 'XZY'));
  }
}

// ---- kit: gathers geometry for the hair and accent materials -------------
class Kit {
  constructor(avatar, mount) {
    const { hair, accent } = avatar.look;
    this.hair = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.62, metalness: 0, vertexColors: true });
    this.accent = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7, metalness: 0, vertexColors: true });
    this.root = new THREE.Group();
    this.root.name = 'avatar-hair';
    this.root.pivot = V(0, 0, 0);
    mount.add(this.root);
  }

  // Geometry is authored in mount space; `pivot` is the frame origin of `parent`.
  place(parent, hairParts, accentParts = []) {
    for (const [parts, material] of [[hairParts, this.hair], [accentParts, this.accent]]) {
      if (!parts.length) continue;
      const mesh = new THREE.Mesh(toGeometry(parts, parent.pivot), material);
      mesh.castShadow = true;
      mesh.name = 'hair-part';
      parent.add(mesh);
    }
  }

  add(hairParts, accentParts = []) { this.place(this.root, hairParts, accentParts); }

  // A part that swings about `pivot`; nest by passing another swing as `parent`.
  swing(parent, pivot, options, hairParts, accentParts = []) {
    const sway = new Sway(options);
    sway.pivot = pivot.clone();
    sway.position.copy(pivot).sub(parent.pivot);
    parent.add(sway);
    this.place(sway, hairParts, accentParts);
    return sway;
  }
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lock lying on the scalp from (a0, phi0) to (a1, phi1).
function scalpLock(a0, p0, a1, p1, { k0 = 1.07, k1 = 1.085, lift = 0.012, bend = 0, r0 = 0.024, r1 = 0.003, flat = 2, n = 6, shade } = {}) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, arc = Math.sin(Math.PI * t);
    pts.push(skinPhi(lerp(a0, a1, t) + bend * arc, lerp(p0, p1, t), lerp(k0, k1, t) + lift * arc));
  }
  return tube(pts, { r0, r1, flat, surface: true, samples: n * 3, shade: shade ?? ((t) => 0.86 + 0.14 * smooth(0, 0.6, t)) });
}

// A row of bangs across the forehead (tips end above the brows).
function bangs(parts, { count = 7, tipY = 0.222, spread = 0.2, k0 = 1.08, k1 = 1.1, r0 = 0.03, sweep = 0 } = {}) {
  const tip = phiAt(tipY);
  for (let i = 0; i < count; i++) {
    const a = (i - (count - 1) / 2) * spread;
    parts.push(scalpLock(a * 0.6, 0.4, a * 1.1 + sweep, tip + 0.012 * (i % 2), { k0, k1, r0, r1: 0.005, flat: 2.2, bend: a * 0.1 + sweep * 0.1 }));
  }
}

const sideburns = (parts, y = 0.15) => {
  for (const side of [-1, 1]) parts.push(scalpLock(side * 1.25, 0.9, side * 1.47, phiAt(y), { k0: 1.055, k1: 1.045, r0: 0.014, r1: 0.003, flat: 1.5, n: 5 }));
};

// Hair hanging behind the ears from the back of the head (bob / long hair).
function skirt({ yTop, hemBack, hemSide, half, thick, curl, tooth }) {
  const hem = (u) => lerp(hemBack, hemSide, smooth(0, 1, Math.abs(u - 0.5) * 2) ** 1.4) + tooth * Math.sin(u * 17);
  return sheet({
    nu: 40, nv: 12,
    P: (u, v, out) => {
      const sk = skin(Math.PI + (u - 0.5) * 2 * half, yTop - 0.015, 1.12);
      const flare = 1 + curl * Math.sin(v * Math.PI * 0.85);
      out.set(C.x + (sk.x - C.x) * flare, lerp(yTop, hem(u), v), C.z + (sk.z - C.z) * flare + 0.012 * v);
    },
    N: (u, v, out, p) => out.set(p.x - C.x, 0, p.z - C.z).normalize(),
    th: (u, v) => thick * smooth(0, 0.12, v) * smooth(0, 0.08, u) * smooth(0, 0.08, 1 - u) * (1 - 0.7 * smooth(0.85, 1, v)) + 0.004,
    shade: (u, v) => Math.min(1, 0.92 - 0.14 * v + 0.04 * Math.sin(u * 60)),
  });
}

// ---- styles --------------------------------------------------------------
const STYLES = {
  short(kit) {
    const parts = [shell({ yEnd: profile(0.235, 0.16, 0.085), thick: () => 0.075 })];
    bangs(parts, { count: 7, spread: 0.2 });
    sideburns(parts);
    kit.add(parts);
  },

  side(kit) {
    const parts = [shell({ yEnd: profile(0.235, 0.16, 0.085), thick: (a) => 0.07 + 0.03 * (0.5 + 0.5 * Math.sin(a)) })];
    const tip = phiAt(0.215);
    for (let i = 0; i < 5; i++) {
      parts.push(scalpLock(-0.5 + 0.17 * i, 0.3, 0.35 + 0.2 * i, tip - 0.015 * i, { k0: 1.08 + i * 0.004, k1: 1.1, lift: 0.015, r0: 0.032, r1: 0.003, flat: 2.3, bend: -0.12, n: 7 }));
    }
    parts.push(scalpLock(-0.9, 0.5, 0.3, phiAt(0.245), { k0: 1.09, k1: 1.11, lift: 0.025, r0: 0.04, r1: 0.006, flat: 1.8, bend: -0.2, n: 8 }));
    sideburns(parts);
    kit.add(parts);
  },

  spiky(kit) {
    const rand = rng(11);
    const parts = [shell({ yEnd: profile(0.235, 0.16, 0.085), thick: () => 0.05 })];
    const spike = (a, phi, len, lean, r) => {
      const base = skinPhi(a, phi, 1.02), n = surfaceNormal(base);
      const dir = n.clone().multiplyScalar(0.7).add(UP.clone().multiplyScalar(0.7)).addScaledVector(V(Math.sin(a), 0, Math.cos(a)), lean - 0.5).normalize();
      const bend = new THREE.Vector3().crossVectors(dir, UP).normalize().multiplyScalar(0.012 * (rand() - 0.5) * 2);
      parts.push(tube([base.clone().addScaledVector(dir, -0.012), base, base.clone().addScaledVector(dir, len * 0.5).add(bend), base.clone().addScaledVector(dir, len).addScaledVector(bend, 2)], {
        rf: (t) => r * (1 - t * 0.98) ** 0.9, flat: 1.15, sides: 8, hint: n, samples: 10, shade: (t) => 0.82 + 0.18 * t,
      }));
    };
    spike(0, 0.12, 0.11, 0.5, 0.04);
    for (let i = 0; i < 6; i++) spike(i * TAU / 6 + 0.3, 0.55, 0.095, 0.6, 0.036);
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9 + 0.1;
      if (Math.abs(wrap(a)) >= 0.5) spike(a, 1.0, 0.085, 0.7, 0.032);
    }
    for (const a of [-0.55, 0, 0.55]) spike(a, a === 0 ? 0.6 : 0.78, 0.085, 0.55, 0.03);
    kit.add(parts);
  },

  bob(kit) {
    const parts = [shell({ yEnd: profile(0.232, 0.15, 0.1), thick: () => 0.09 })];
    bangs(parts, { count: 7, tipY: 0.218, spread: 0.2, k0: 1.095, k1: 1.11 });
    sideburns(parts);
    parts.push(skirt({ yTop: 0.15, hemBack: 0.0, hemSide: 0.075, half: Math.PI - 1.8, thick: 0.04, curl: 0.07, tooth: 0.006 }));
    kit.add(parts);
  },

  long(kit) {
    const parts = [shell({ yEnd: profile(0.232, 0.155, 0.1), thick: () => 0.08 })];
    bangs(parts, { count: 7, tipY: 0.218, spread: 0.2, k0: 1.09, k1: 1.105 });
    sideburns(parts);
    kit.add(parts);
    kit.swing(kit.root, V(C.x, 0.13, C.z - 0.1), { gain: 0.035, stiffness: 13, damping: 0.35, gravity: 0.35, limitX: [-0.3, 0.45], limitZ: [-0.25, 0.25] },
      [skirt({ yTop: 0.14, hemBack: -0.13, hemSide: 0.015, half: Math.PI - 1.95, thick: 0.03, curl: 0.07, tooth: 0.012 })]);
  },

  ponytail(kit) {
    const parts = [shell({ yEnd: profile(0.235, 0.17, 0.1), thick: () => 0.07 })];
    bangs(parts, { count: 6, spread: 0.24 });
    sideburns(parts);
    kit.add(parts);

    const root = V(C.x, 0.25, C.z - 0.1), mid = V(C.x, 0.125, C.z - 0.25);
    const tail = (off, r, len) => {
      const knot = mid.clone().add(V(off * 1.5, 0, 0));
      const upper = [root.clone(), V(C.x + off * 0.5, 0.258, C.z - 0.165), V(C.x + off, 0.222, C.z - 0.22), knot];
      const lower = [knot.clone(), V(C.x + off * 1.7, 0.05, C.z - 0.255), V(C.x + off * 1.5, -0.03 * len, C.z - 0.245), V(C.x + off, -0.095 * len, C.z - 0.225)];
      return [
        tube(upper, { rf: (t) => r * (0.7 + 0.3 * Math.sin(Math.PI * t)), flat: 1.15, hint: SIDE, sides: 10, capEnd: false, shade: (t) => 0.8 + 0.2 * t }),
        tube(lower, { rf: (t) => r * (1 - 0.95 * t ** 1.3), flat: 1.15, hint: SIDE, sides: 10, samples: 14, capStart: false, shade: (t) => 1 - 0.15 * t }),
      ];
    };
    const tails = [tail(0, 0.042, 1), tail(0.03, 0.026, 0.85), tail(-0.03, 0.026, 0.92)];
    const tie = band(root.clone().add(V(0, 0.003, -0.028)), V(0, 0.2, -1), 0.034, 0.011);
    const sway = kit.swing(kit.root, root, { gain: 0.045, stiffness: 15, damping: 0.28, gravity: 0.35, limitX: [-0.35, 0.55], limitZ: [-0.4, 0.4] }, tails.map((t) => t[0]), [tie]);
    kit.swing(sway, mid.clone(), { gain: 0.05, stiffness: 12, damping: 0.22, gravity: 0.25, limitX: [-0.5, 0.6], limitZ: [-0.5, 0.5] }, tails.map((t) => t[1]));
  },

  pigtails(kit) {
    const parts = [shell({ yEnd: profile(0.235, 0.18, 0.11), thick: () => 0.065 })];
    bangs(parts, { count: 6, spread: 0.24, k0: 1.075, k1: 1.09 });
    kit.add(parts);
    for (const side of [-1, 1]) {
      const X = (x) => C.x + side * x;
      const root = V(X(0.115), 0.225, -0.04);
      const upper = [root, V(X(0.165), 0.215, -0.045), V(X(0.205), 0.17, -0.05), V(X(0.215), 0.11, -0.05)];
      const lower = [upper[3].clone(), V(X(0.22), 0.05, -0.045), V(X(0.225), -0.01, -0.035), V(X(0.245), -0.065, -0.02), V(X(0.265), -0.09, 0)];
      const tie = band(V(X(0.16), 0.217, -0.045), V(side, -0.25, 0), 0.034, 0.012);
      const tie2 = band(V(X(0.218), 0.088, -0.05), V(0, -1, 0.05), 0.04, 0.011);
      const top = tube(upper, { rf: (t) => 0.036 + 0.01 * Math.sin(t * 3), flat: 1.1, sides: 10, capEnd: false, shade: (t) => 0.82 + 0.18 * t });
      const low = tube(lower, { rf: (t) => 0.042 * (1 - 0.9 * t ** 1.4) + 0.002, flat: 1.1, sides: 10, samples: 16, capStart: false, shade: (t) => 1 - 0.14 * t });
      const lim = side > 0 ? { limitZ: [-0.05, 0.4] } : { limitZ: [-0.4, 0.05] };
      const sway = kit.swing(kit.root, root, { gain: 0.03, stiffness: 15, damping: 0.3, gravity: 0.3, limitX: [-0.35, 0.4], ...lim }, [top], [tie]);
      kit.swing(sway, upper[3], { gain: 0.04, stiffness: 13, damping: 0.25, gravity: 0.25, limitX: [-0.4, 0.5], ...lim }, [low], [tie2]);
    }
  },

  buns(kit) {
    const parts = [shell({ yEnd: profile(0.235, 0.17, 0.11), thick: () => 0.065 })], acc = [];
    bangs(parts, { count: 6, spread: 0.24, k0: 1.075, k1: 1.09 });
    for (const side of [-1, 1]) {
      const c = V(C.x + side * 0.085, 0.317, C.z - 0.035);
      parts.push(ball(c.x, c.y, c.z, 0.062, { sy: 0.92, detail: 16, shade: (p) => 0.78 + 0.22 * smooth(-0.04, 0.06, p.y - c.y) }));
      for (let k = 0; k < 3; k++) parts.push(band(c.clone().add(V(0, 0.012 * (k - 1), 0)), V(0.2 * (k - 1), 1, 0.2), 0.056 * (1 - 0.1 * Math.abs(k - 1)), 0.005, () => 0.8));
      acc.push(band(c.clone().add(V(0, -0.04, 0)), V(side * 0.35, 1, 0), 0.048, 0.01));
    }
    kit.add(parts, acc);
  },

  curly(kit) {
    const rand = rng(7);
    const ph = Array.from({ length: 4 }, () => rand() * TAU);
    const yEnd = profile(0.238, 0.15, 0.07);
    const parts = [shell({
      yEnd, thick: () => 0.012, floor: 0.9, na: 80, nv: 24, span: 0.3,
      bulge: (a, phi) => {
        const front = Math.max(0, Math.cos(a)) ** 1.5 * smooth(0.4, 1.1, phi);
        const lumps = 0.035 * Math.sin(a * 11 + ph[0]) * Math.sin(phi * 13 + ph[1]) + 0.025 * Math.sin(a * 17 + ph[2] + phi * 7) * Math.cos(phi * 5 + ph[3]);
        return (0.24 * (1 - 0.8 * front) + lumps) * smooth(0.12, 0.35, phi);
      },
      shade: (a, v) => Math.min(1, 1 - 0.2 * smooth(0.5, 1, v) + 0.06 * Math.sin(a * 11 + v * 13)),
    })];
    const puff = (a, y, k, r) => {
      const p = skin(a, y, k, 0.8).add(V(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.01));
      parts.push(ball(p.x, p.y, p.z, r * (0.9 + 0.2 * rand()), { detail: 9, shade: (q, n) => 0.75 + 0.25 * clamp(0.6 + 0.8 * Math.max(0, n.y), 0, 1) }));
    };
    for (let i = 0; i < 16; i++) {
      const a = (i + 0.5) / 16 * TAU;
      const t = Math.abs(wrap(a));
      if (t < 0.9) { puff(a, 0.262 - 0.01 * (i % 2), 1.1, 0.032); continue; }
      puff(a, Math.max(yEnd(a) + 0.03, 0.06), 1.2 + 0.03 * smooth(1.2, 2.5, t), 0.036);
    }
    for (let i = 0; i < 10; i++) puff(i / 10 * TAU + 0.3, 0.26 + 0.03 * (i % 2), 1.18, 0.045);
    kit.add(parts);
  },

  bun(kit) {
    const parts = [shell({ yEnd: profile(0.236, 0.165, 0.1), thick: () => 0.065 })], acc = [];
    bangs(parts, { count: 6, spread: 0.24, tipY: 0.224, k0: 1.075, k1: 1.09 });
    sideburns(parts);
    const c = V(C.x, 0.36, C.z - 0.035);
    parts.push(ball(c.x, c.y, c.z, 0.075, { sy: 0.9, detail: 16, shade: (p) => 0.78 + 0.22 * smooth(-0.05, 0.07, p.y - c.y) }));
    for (let k = 0; k < 3; k++) parts.push(band(c.clone().add(V(0, 0.012 * (k - 1), 0)), V(0.15 * (k - 1), 1, 0.1 * k), 0.068 * (1 - 0.12 * Math.abs(k - 1)), 0.005, () => 0.78));
    acc.push(band(c.clone().add(V(0, -0.045, 0)), UP, 0.058, 0.011));
    kit.add(parts, acc);
  },

  cap(kit) {
    // Hair peeking out below the cap at the nape and above the ears.
    const under = shell({ yEnd: profile(0.26, 0.15, 0.07), thick: () => 0.05, floor: 0.9, shade: () => 0.55 });
    const edge = profile(0.215, 0.185, 0.16);
    const dome = shell({
      yEnd: edge, thick: () => 0.12, rimK: 0.1, span: 0.02, na: 64, nv: 18,
      bulge: (a, phi) => 0.004 * Math.pow(Math.abs(Math.cos(a * 3)), 12) * smooth(0.1, 0.5, phi),
      shade: (a, v) => Math.min(1, 0.98 - 0.08 * smooth(0.9, 1, v) + 0.03 * Math.cos(a * 6)),
    });
    const parts = [under, dome, rimTube(dome, 0.007)], acc = [];
    const top = skinPhi(0, 0, 1.12);
    acc.push(ball(top.x, top.y + 0.002, top.z, 0.017, { sy: 0.8 }));
    acc.push(sheet({
      nu: 24, nv: 8,
      P: (u, v, out) => {
        const a = (u - 0.5) * 2 * 0.95, base = skin(a, edge(a) + 0.004, 1.12), f = 0.095 * Math.cos(a * 0.9) * v;
        out.set(base.x + Math.sin(a) * f * 0.9, base.y - 0.03 * v * v - 0.006 * v, base.z + Math.cos(a) * f);
      },
      N: (u, v, out) => out.set(0, 1, 0.12),
      th: (u, v) => 0.009 * smooth(0, 0.06, v) * (1 - 0.7 * smooth(0.9, 1, v)) * smooth(0, 0.07, u) * smooth(0, 0.07, 1 - u) + 0.002,
      shade: (u, v) => 1 - 0.1 * v,
    }));
    kit.add(parts, acc);
  },

  beanie(kit) {
    const parts = [shell({ yEnd: profile(0.27, 0.15, 0.06), thick: () => 0.06, floor: 0.9, shade: () => 0.82 })], acc = [];
    const edge = profile(0.215, 0.185, 0.15), k = 1.115;
    parts.push(shell({
      yEnd: (a) => edge(a) + 0.045, thick: () => k - 1, rimK: k - 1, span: 0.02, na: 64, nv: 16,
      bulge: (a) => 0.003 * Math.sin(a * 36), shade: (a) => 0.94 + 0.05 * Math.sin(a * 36),
    }));
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.2, base = skin(a, 0.232, 1.06);
      const dir = V(a * 0.6, -1, 0.35).normalize();
      parts.push(tube([base.clone().add(V(0, 0.02, 0)), base.clone().add(V(0, 0, 0.012)), base.clone().addScaledVector(dir, 0.028).add(V(0, 0, 0.016))], { r0: 0.022, r1: 0.004, flat: 1.6, shade: () => 0.88 }));
    }
    acc.push(sheet({
      nu: 96, nv: 6, wrapU: true,
      P: (u, v, out) => { const a = u * TAU; out.copy(skin(a, edge(a) + v * 0.05, k + 0.012)); },
      N: (u, v, out, p) => out.set((p.x - C.x) / (R.x * R.x), 0.3, (p.z - C.z) / (R.z * R.z)).normalize(),
      th: (u, v) => (0.016 + 0.0025 * Math.cos(u * 120)) * smooth(0, 0.12, v) * smooth(0, 0.12, 1 - v) + 0.003,
      shade: (u) => 0.92 + 0.08 * Math.cos(u * 120),
    }));
    const rand = rng(5), top = skinPhi(0, 0, k), pom = V(top.x, top.y + 0.035, top.z);
    acc.push(ball(pom.x, pom.y, pom.z, 0.045, { detail: 14, shade: (p) => 0.88 + 0.12 * smooth(-0.05, 0.05, p.y - pom.y) }));
    for (let i = 0; i < 18; i++) {
      const p = pom.clone().addScaledVector(V(rand() - 0.5, rand() - 0.2, rand() - 0.5).normalize(), 0.036);
      acc.push(ball(p.x, p.y, p.z, 0.014 + 0.006 * rand(), { detail: 6, shade: () => 0.95 }));
    }
    kit.add(parts, acc);
  },

  afro(kit) {
    const rand = rng(3);
    const ph = Array.from({ length: 3 }, () => rand() * TAU);
    kit.add([shell({
      yEnd: profile(0.238, 0.13, 0.08), thick: () => 0.012, floor: 0.9, na: 72, nv: 22, span: 0.4,
      bulge: (a, phi) => {
        const front = Math.max(0, Math.cos(a)) ** 1.5 * smooth(0.4, 1.1, phi);
        const lumps = 0.03 * Math.sin(a * 7 + ph[0]) * Math.sin(phi * 9 + ph[1]) + 0.02 * Math.sin(a * 13 + ph[2] + phi * 4);
        return (0.5 * (1 - 0.85 * front) + lumps) * smooth(0.15, 0.4, phi);
      },
      shade: (a, v) => Math.min(1, 1 - 0.18 * smooth(0.55, 1, v) + 0.05 * Math.sin(a * 15 + v * 9)),
    })]);
  },

  mohawk(kit) {
    const parts = [shell({ yEnd: profile(0.235, 0.15, 0.09), thick: () => 0.012, rimK: 0.006, shade: () => 0.62 })];
    const n = 11, ridge = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const p = t < 0.35 ? skinPhi(0, lerp(0.85, 0.05, t / 0.35), 1.03) : skinPhi(Math.PI, lerp(0.05, 1.3, (t - 0.35) / 0.65), 1.03);
      const dir = surfaceNormal(p).multiplyScalar(0.55).add(UP).normalize();
      dir.z -= 0.15 * (t - 0.35);
      dir.normalize();
      const h = 0.085 - 0.02 * Math.abs(t - 0.45);
      parts.push(tube([p.clone().addScaledVector(dir, -0.015), p, p.clone().addScaledVector(dir, h * 0.5).add(V(0, 0, -0.008)), p.clone().addScaledVector(dir, h).add(V(0, 0, -0.02 - 0.02 * t))], {
        rf: (u) => 0.036 * (1 - u * 0.95) ** 0.8, flat: 0.5, hint: SIDE, samples: 10, shade: (u) => 0.8 + 0.2 * u,
      }));
      ridge.push(p);
    }
    parts.push(tube(ridge, { rf: () => 0.03, hint: SIDE, samples: 40, shade: () => 0.8 }));
    kit.add(parts);
  },

  braid(kit) {
    const parts = [shell({ yEnd: profile(0.235, 0.165, 0.1), thick: () => 0.07 })];
    bangs(parts, { count: 6, spread: 0.24 });
    sideburns(parts);
    const root = V(C.x, 0.12, C.z - 0.125);
    parts.push(ball(root.x, root.y - 0.01, root.z + 0.015, 0.05, { sy: 1.1, sz: 0.8, shade: () => 0.85 }));
    kit.add(parts);

    const z = (i) => C.z - 0.145 - 0.012 * Math.sin(i / 11 * Math.PI);
    const segs = (from, to, y0, y1) => {
      const out = [];
      for (let i = from; i < to; i++) {
        const y = lerp(y0, y1, (i - from) / (to - from)), odd = i % 2 ? 1 : -1;
        out.push(ball(C.x + odd * 0.007, y, z(i), 0.037 * (1 - 0.45 * (i / 11) ** 1.5), {
          sy: 0.95, sz: 0.9, rot: [0, 0, odd * 0.6], detail: 10, shade: (p) => 0.85 + 0.15 * smooth(-0.02, 0.02, Math.sin((p.y - y) * 90 + odd)),
        }));
      }
      return out;
    };
    const lastY = -0.105, lastZ = z(10);
    const end = tube([V(C.x, lastY - 0.02, lastZ), V(C.x, lastY - 0.075, lastZ - 0.004)], { rf: (t) => 0.026 * (1 - 0.85 * t), flat: 1.2, hint: SIDE, shade: () => 0.8 });
    const tie = band(V(C.x, lastY - 0.028, lastZ), UP, 0.024, 0.01);
    const sway = kit.swing(kit.root, root, { gain: 0.04, stiffness: 15, damping: 0.28, gravity: 0.3, limitX: [-0.35, 0.5], limitZ: [-0.35, 0.35] }, segs(0, 6, 0.1, 0.0));
    kit.swing(sway, V(C.x, 0.0, C.z - 0.15), { gain: 0.05, stiffness: 12, damping: 0.22, gravity: 0.25, limitX: [-0.5, 0.6], limitZ: [-0.5, 0.5] }, segs(6, 11, -0.02, lastY).concat([end]), [tie]);
  },
};

export function buildHair(avatar) {
  const build = STYLES[avatar.look?.style];
  if (!build || !avatar.model.getObjectByName('Head')) return;
  build(new Kit(avatar, attachToBone(avatar, 'Head')));
}
