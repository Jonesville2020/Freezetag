import * as THREE from 'three';
import { attachToBone } from './outfit.js?v=avatar5';

// Builds avatar.look.accessory, coloured by look.accent.
// All geometry is authored in metres in the character frame (+Y up, +Z forward) at the
// bind pose; `anchor()` turns a bone mount into a frame where those coordinates apply.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

function anchor(avatar, boneName) {
  const bone = avatar.model.getObjectByName(boneName);
  if (!bone) return null;
  const mount = attachToBone(avatar, boneName);
  avatar.group.updateMatrixWorld(true);
  const p = bone.getWorldPosition(new THREE.Vector3());
  avatar.group.worldToLocal(p);
  const frame = new THREE.Group();
  frame.position.copy(p).negate();
  mount.add(frame);
  return { frame, bone: p };
}

function palette(hex) {
  const accent = new THREE.Color(hex);
  return {
    accent,
    light: accent.clone().lerp(new THREE.Color('#fff6e6'), 0.68),
    dark: accent.clone().multiplyScalar(0.42),
    ink: new THREE.Color('#252a33'),
    cream: new THREE.Color('#fbf4e4'),
  };
}

const std = (color, roughness = 0.6, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

function add(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Box with rounded edges; normals are analytic so there are no creases.
function softBox(w, h, d, r, seg = 5) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(c);
    if (v.lengthSq() > 1e-12) v.normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
    pos.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
  }
  return g;
}

function roundedRect(w, h, r, hole = 0) {
  const trace = (p, w, h, r) => {
    const x = -w / 2, y = -h / 2;
    p.moveTo(x + r, y);
    p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
    p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  };
  const shape = new THREE.Shape();
  trace(shape, w, h, r);
  if (hole) {
    const p = new THREE.Path();
    trace(p, w - hole * 2, h - hole * 2, Math.max(0.002, r - hole * 0.6));
    shape.holes.push(p);
  }
  return shape;
}

const tube = (points, radius, seg = 24, radial = 6) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5), seg, radius, radial, false);

// Flat strap with a rectangular section following `curve`; `up(p)` gives the surface normal.
function ribbon(curve, width, thick, segments, up) {
  const pts = curve.getSpacedPoints(segments);
  const pos = [], nor = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  const corner = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  pts.forEach((p, i) => {
    T.subVectors(pts[Math.min(i + 1, segments)], pts[Math.max(i - 1, 0)]).normalize();
    N.copy(up(p)).normalize();
    B.crossVectors(T, N).normalize();
    N.crossVectors(B, T).normalize();
    for (const [a, b] of corner) {
      pos.push(p.x + B.x * a * width / 2 + N.x * b * thick / 2, p.y + B.y * a * width / 2 + N.y * b * thick / 2, p.z + B.z * a * width / 2 + N.z * b * thick / 2);
      const nx = B.x * a * 0.5 + N.x * b, ny = B.y * a * 0.5 + N.y * b, nz = B.z * a * 0.5 + N.z * b;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
    }
  });
  for (let i = 0; i < segments; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// A soft band (scarf wrap, collar) around an elliptical path with a flattened-oval section.
function ringBand(rx, rz, halfH, thick, nu, nv, colorAt) {
  const pos = [], nor = [], col = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const phi = (i / nu) * Math.PI * 2, cp = Math.cos(phi), sp = Math.sin(phi);
    const c = colorAt(i / nu);
    for (let j = 0; j <= nv; j++) {
      const th = (j / nv) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      pos.push((rx + ct * thick) * cp, st * halfH, (rz + ct * thick) * sp);
      const nr = ct / thick, ny = st / halfH, l = Math.hypot(nr, ny);
      nor.push((nr / l) * cp, ny / l, (nr / l) * sp);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- cloth

// A hanging strip (cape, scarf tail) driven by a damped-spring chain. It reads the
// anchor's own world motion each time its matrix is updated, so nothing else has to
// drive it. Segment lengths are fixed (inextensible), angles are clamped and the
// integration uses capped sub-steps, so it is stable for any frame time.
class Cloth extends THREE.Object3D {
  constructor(avatar, o) {
    super();
    this.avatar = avatar;
    this.o = {
      rows: 8, cols: 6, length: 0.6, width: () => 0.3,
      shape: () => 0, rest: 0, wind: 1, lift: 1.1, minCum: 0, maxCum: 1.4,
      stiffness: 70, damping: 0.55, flutter: 1, ripple: 0.012, sway: 1, ...o,
    };
    const { rows, cols } = this.o;
    this.rowLen = this.o.length / rows;
    this.pitch = new Float32Array(rows).fill(this.o.rest);
    this.pitchV = new Float32Array(rows);
    this.roll = new Float32Array(rows);
    this.rollV = new Float32Array(rows);
    this.ready = false;
    this.last = 0;
    this.prev = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.prevVel = new THREE.Vector3();
    this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.speed = 0;
    const n = (rows + 1) * (cols + 1);
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const c = this.o.colorAt(i / rows, (j / cols) * 2 - 1, i);
      col.set([c.r, c.g, c.b], (i * (cols + 1) + j) * 3);
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, this.o.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.add(this.mesh);
    this.#shape(0, 0);
  }

  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);
    this.#simulate();
  }

  #simulate() {
    const t = this.avatar.t ?? 0;
    const dt = t - this.last;
    this.matrixWorld.decompose(this.p, this.q, this.s);
    if (!this.ready || dt < 0 || dt > 1) {
      this.ready = true; this.last = t;
      this.prev.copy(this.p); this.vel.set(0, 0, 0); this.prevVel.set(0, 0, 0);
      return;
    }
    if (dt < 1e-4) return;
    this.last = t;
    const dtc = Math.min(dt, 0.05);
    const o = this.o;

    const world = new THREE.Vector3().subVectors(this.p, this.prev).divideScalar(dt);
    if (this.p.distanceTo(this.prev) > 3) world.set(0, 0, 0);
    this.prev.copy(this.p);
    this.vel.lerp(world, 1 - Math.exp(-dtc * 10));
    const acc = new THREE.Vector3().subVectors(this.vel, this.prevVel).divideScalar(dtc).clampLength(0, 40);
    this.prevVel.copy(this.vel);

    const inv = this.q.clone().invert();
    const vL = this.vel.clone().applyQuaternion(inv);
    const aL = acc.applyQuaternion(inv);
    const g = new THREE.Vector3(0, -1, 0).applyQuaternion(inv);
    const ag = Math.atan2(-g.z, -g.y), bg = Math.atan2(g.x, -g.y);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    const sp = smooth(this.speed / 6);

    const { rows } = o;
    const lift = o.wind * clamp(vL.z / 6, -0.25, 1) * o.lift + clamp(aL.z * 0.03, -0.25, 0.4) * o.sway;
    const side = (-vL.x * 0.07 - aL.x * 0.025) * o.sway;
    const steps = Math.max(1, Math.ceil(dtc / (1 / 120)));
    const h = dtc / steps;
    const wsum = (rows * (rows + 1)) / 2;
    for (let s = 0; s < steps; s++) {
      const ts = t - dtc + (s + 1) * h;
      let cumP = 0, cumR = 0;
      for (let i = 0; i < rows; i++) {
        const w = (i + 1) / wsum;
        const fl = o.flutter * (0.015 + 0.075 * sp) * (i / rows) * Math.sin(ts * (11 + 3 * sp) - i * 0.95);
        const tp = o.rest + (i === 0 ? ag : 0) + lift * w + fl;
        const tr = (i === 0 ? bg : 0) + side * w + o.flutter * 0.02 * sp * Math.sin(ts * 7.3 + i * 1.3);
        const k = o.stiffness * (1 - 0.5 * i / rows), c = 2 * o.damping * Math.sqrt(k);
        this.pitchV[i] += (k * (tp - this.pitch[i]) - c * this.pitchV[i]) * h;
        this.rollV[i] += (k * (tr - this.roll[i]) - c * this.rollV[i]) * h;
        this.pitch[i] = clamp(this.pitch[i] + this.pitchV[i] * h, -0.6, 0.5);
        this.roll[i] = clamp(this.roll[i] + this.rollV[i] * h, -0.35, 0.35);
        // keep the strip out of the body: cumulative pitch stays within [min, max] of gravity-relative
        cumP += this.pitch[i];
        const lo = ag + o.minCum, hi = ag + o.maxCum;
        if (cumP < lo) { this.pitch[i] += lo - cumP; cumP = lo; if (this.pitchV[i] < 0) this.pitchV[i] = 0; }
        else if (cumP > hi) { this.pitch[i] -= cumP - hi; cumP = hi; if (this.pitchV[i] > 0) this.pitchV[i] = 0; }
        cumR += this.roll[i];
        if (Math.abs(cumR) > 0.9) { this.roll[i] -= cumR - Math.sign(cumR) * 0.9; cumR = Math.sign(cumR) * 0.9; }
      }
    }
    this.#shape(t, sp);
  }

  #shape(t, sp) {
    const { rows, cols, shape, width, ripple } = this.o;
    const pos = this.geometry.attributes.position;
    let x = 0, y = 0, z = 0, cumP = 0, cumR = 0;
    for (let i = 0; i <= rows; i++) {
      if (i > 0) {
        cumP += this.pitch[i - 1]; cumR += this.roll[i - 1];
        const cb = Math.cos(cumR);
        x += this.rowLen * Math.sin(cumR);
        y -= this.rowLen * cb * Math.cos(cumP);
        z -= this.rowLen * cb * Math.sin(cumP);
      }
      const v = i / rows;
      const fall = Math.max(0, 1 - i / 3);
      for (let j = 0; j <= cols; j++) {
        const u = (j / cols) * 2 - 1;
        const rip = ripple * sp * v * Math.sin(t * 17 + u * 5.5 - i * 0.9);
        pos.setXYZ(i * (cols + 1) + j, x + (u * width(u, v)) / 2, y, z + shape(u, v, fall) + rip);
      }
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

// ---------------------------------------------------------------- styles

function buildGlasses(parent, pal, sunglasses) {
  const frameMat = std(sunglasses ? pal.ink : pal.accent, sunglasses ? 0.3 : 0.45, 0.05);
  const tint = sunglasses
    ? new THREE.MeshPhysicalMaterial({ color: '#12151c', roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({ color: '#cfeeff', roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: sunglasses ? 0.55 : 0.4, depthWrite: false });
  const lw = sunglasses ? 0.078 : 0.07, lh = sunglasses ? 0.056 : 0.058, rim = sunglasses ? 0.011 : 0.0075;
  const cx = 0.056, cy = 1.505, cz = 0.118;
  const frameG = new THREE.ExtrudeGeometry(roundedRect(lw, lh, sunglasses ? 0.02 : 0.022, rim), { depth: sunglasses ? 0.01 : 0.007, bevelEnabled: false, curveSegments: 5 });
  frameG.translate(0, 0, -0.004);
  const lensG = new THREE.ShapeGeometry(roundedRect(lw - rim, lh - rim, sunglasses ? 0.02 : 0.022), 5);
  const shineShape = new THREE.Shape();
  shineShape.moveTo(-0.012, -0.014); shineShape.lineTo(-0.004, -0.014); shineShape.lineTo(0.012, 0.016); shineShape.lineTo(0.004, 0.016); shineShape.closePath();
  const shineG = new THREE.ShapeGeometry(shineShape);
  const dotG = new THREE.CircleGeometry(0.0035, 8);
  const hingeG = new THREE.SphereGeometry(sunglasses ? 0.007 : 0.0055, 8, 6);
  const hingeMat = std(sunglasses ? pal.accent : pal.light, 0.5);
  for (const s of [-1, 1]) {
    const lens = new THREE.Group();
    lens.position.set(s * cx, cy, cz);
    lens.rotation.y = s * 0.2;
    parent.add(lens);
    add(lens, frameG, frameMat);
    add(lens, lensG, tint, 0, 0, 0.0015);
    const hl = add(lens, shineG, shine, -s * 0.008, 0.004, 0.0105);
    hl.castShadow = false;
    hl.scale.set(sunglasses ? 1.3 : 1, 1, 1);
    add(lens, dotG, shine, s * 0.02, -0.014, 0.0105).castShadow = false;
    const outer = lw / 2 + 0.002;
    add(parent, tube([
      V(s * (cx + outer * 0.98), cy + 0.012, cz - 0.005),
      V(s * (cx + outer + 0.018), cy + 0.012, cz - 0.03),
      V(s * 0.148, cy + 0.007, 0.03),
      V(s * 0.164, cy + 0.003, -0.03),
      V(s * 0.17, cy - 0.012, -0.065),
    ], sunglasses ? 0.0042 : 0.0034, 16, 5), frameMat);
    add(parent, hingeG, hingeMat, s * (cx + outer * 0.98), cy + 0.012, cz - 0.005).scale.set(1, 1, 0.6);
  }
  add(parent, tube([V(-0.018, cy + 0.011, cz + 0.004), V(0, cy + 0.02, cz + 0.011), V(0.018, cy + 0.011, cz + 0.004)], sunglasses ? 0.0045 : 0.0034, 8, 5), frameMat);
  for (const s of [-1, 1]) add(parent, new THREE.SphereGeometry(0.0048, 6, 5), std(pal.cream, 0.5), s * 0.0125, cy - 0.003, cz).scale.set(0.6, 1.4, 0.7);
}

function buildHeadphones(parent, pal) {
  const shell = std(pal.accent, 0.4, 0.05);
  const dark = std('#2b2f38', 0.55);
  const pad = std(pal.dark, 0.85);
  const metal = std('#cfd5dd', 0.3, 0.7);
  const cy = 1.5, cz = -0.045;
  const A = 0.17, B = 0.222;
  const arc = [];
  for (let i = 0; i <= 14; i++) {
    const t = (i / 14) * Math.PI;
    arc.push(V(Math.cos(t) * A, cy + 0.012 + Math.sin(t) * B, cz));
  }
  add(parent, tube(arc, 0.0085, 40, 8), dark);
  add(parent, tube(arc.slice(4, 11), 0.0115, 18, 8), pad);
  add(parent, tube(arc.slice(5, 10), 0.0125, 12, 8), shell).scale.set(1, 1, 0.9);
  const cup = new THREE.LatheGeometry([
    [0, 0.026], [0.034, 0.026], [0.05, 0.02], [0.058, 0.008], [0.058, -0.004], [0.052, -0.012], [0, -0.012],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  const cushion = new THREE.TorusGeometry(0.043, 0.0155, 8, 22);
  const ring = new THREE.TorusGeometry(0.031, 0.0035, 6, 20);
  const stud = new THREE.CylinderGeometry(0.016, 0.016, 0.006, 14);
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.17, cy, cz);
    g.rotation.z = -s * Math.PI / 2;
    parent.add(g);
    add(g, cup, shell, 0, 0.012, 0);
    const inner = add(g, cushion, pad, 0, -0.004, 0);
    inner.rotation.x = Math.PI / 2;
    add(g, ring, std(pal.light, 0.4), 0, 0.0285, 0).rotation.x = Math.PI / 2;
    add(g, stud, dark, 0, 0.03, 0);
    add(parent, tube([V(s * A, cy + 0.012, cz), V(s * 0.186, cy, cz), V(s * 0.19, cy - 0.008, cz)], 0.0065, 6, 6), metal);
  }
}

function buildBackpack(avatar, pal) {
  const a = anchor(avatar, 'Spine02');
  if (!a) return;
  const root = new THREE.Group();
  a.frame.add(root);
  const body = std(pal.accent, 0.62);
  const dark = std(pal.dark, 0.7);
  const light = std(pal.light, 0.6);
  const webbing = std(pal.ink, 0.8);
  const metal = std('#c9cfd8', 0.3, 0.8);
  const pack = new THREE.Group();
  pack.position.set(0, 1.115, -0.255);
  root.add(pack);
  add(pack, softBox(0.27, 0.32, 0.125, 0.045, 6), body);
  add(pack, softBox(0.275, 0.075, 0.13, 0.036, 5), dark, 0, -0.125, 0);
  // bottom stitching
  const stitch = new THREE.InstancedMesh(new THREE.BoxGeometry(0.01, 0.004, 0.004), std(pal.cream, 0.8), 18);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 18; i++) { m.makeTranslation(-0.119 + i * 0.014, -0.0815, -0.0655); stitch.setMatrixAt(i, m); }
  pack.add(stitch);
  add(pack, new THREE.TorusGeometry(0.022, 0.0055, 6, 14, Math.PI), webbing, 0, 0.158, -0.01);
  // front pocket with zipper
  add(pack, softBox(0.2, 0.125, 0.05, 0.025, 5), light, 0, -0.045, -0.078).scale.set(1, 1, 0.9);
  add(pack, softBox(0.205, 0.03, 0.054, 0.012, 4), dark, 0, 0.012, -0.082);
  add(pack, new THREE.BoxGeometry(0.2, 0.0045, 0.004), webbing, 0, 0.075, -0.0635);
  for (let i = 0; i < 16; i++) add(pack, new THREE.BoxGeometry(0.0035, 0.0045, 0.0045), metal, -0.095 + i * 0.0127, 0.075, -0.0635);
  add(pack, new THREE.TorusGeometry(0.007, 0.0016, 5, 10), metal, 0.075, 0.062, -0.0665);
  add(pack, new THREE.BoxGeometry(0.012, 0.016, 0.003), metal, 0.075, 0.0725, -0.0655);
  add(pack, new THREE.BoxGeometry(0.15, 0.0035, 0.004), webbing, 0, -0.012, -0.1);
  add(pack, new THREE.TorusGeometry(0.0065, 0.0015, 5, 10), metal, 0.05, -0.02, -0.1);
  for (const s of [-1, 1]) add(pack, softBox(0.03, 0.15, 0.085, 0.012, 3), dark, s * 0.14, -0.04, 0.002);

  // shoulder straps: up from the pack, over the shoulder, down the chest, under the arm
  const centre = V(0, 1.16, 0);
  const outward = (p) => p.clone().sub(centre).setY(Math.max(p.y - centre.y, 0) * 1.6);
  const basis = new THREE.Matrix4();
  for (const s of [-1, 1]) {
    const x = s * 0.082;
    const curve = new THREE.CatmullRomCurve3([
      V(x, 1.0, -0.186), V(x, 1.15, -0.182), V(x, 1.25, -0.172), V(x, 1.315, -0.13), V(x, 1.348, -0.055),
      V(x, 1.342, 0.02), V(x, 1.31, 0.088), V(x * 1.08, 1.25, 0.142), V(x * 1.3, 1.18, 0.174), V(s * 0.145, 1.1, 0.162),
      V(s * 0.18, 1.04, 0.07), V(s * 0.185, 1.0, -0.05), V(s * 0.16, 0.995, -0.17), V(s * 0.125, 0.995, -0.19),
    ], false, 'catmullrom', 0.4);
    add(root, ribbon(curve, 0.038, 0.014, 56, outward), body);
    add(root, ribbon(new THREE.CatmullRomCurve3(curve.points.slice(3, 9), false, 'catmullrom', 0.4), 0.012, 0.0165, 28, outward), dark);
    // adjustment buckle on the chest
    const at = curve.getPointAt(0.52), tan = curve.getTangentAt(0.52);
    const n = outward(at).normalize();
    const b = new THREE.Vector3().crossVectors(tan, n).normalize();
    const buckle = add(root, softBox(0.05, 0.028, 0.008, 0.003, 2), metal, at.x, at.y, at.z);
    buckle.position.addScaledVector(n, 0.01);
    buckle.quaternion.setFromRotationMatrix(basis.makeBasis(b, new THREE.Vector3().crossVectors(n, b), n));
  }
}

function buildScarf(avatar, pal) {
  const a = anchor(avatar, 'Spine');
  if (!a) return;
  const root = new THREE.Group();
  a.frame.add(root);
  const wrapMat = std(0xffffff, 0.92, 0, { vertexColors: true });
  const stripe = (n, c1, c2, phase = 0) => (u) => (Math.floor(u * n + phase) % 2 === 0 ? c1 : c2);
  const wraps = [
    { y: 1.292, rx: 0.113, rz: 0.118, h: 0.04, t: 0.034, tilt: 0.1, c: stripe(18, pal.accent, pal.light) },
    { y: 1.328, rx: 0.108, rz: 0.112, h: 0.037, t: 0.03, tilt: 0.18, c: stripe(18, pal.light, pal.accent, 0.5) },
  ];
  for (const w of wraps) {
    add(root, ringBand(w.rx, w.rz, w.h, w.t, 36, 10, w.c), wrapMat, 0.004, w.y, -0.058).rotation.x = w.tilt;
  }
  const knot = add(root, softBox(0.1, 0.075, 0.06, 0.025, 4), std(pal.accent, 0.9), 0.074, 1.285, 0.09);
  knot.rotation.set(0.3, -0.4, 0.2);
  const tail = new Cloth(avatar, {
    rows: 12, cols: 2, length: 0.4, width: (u, v) => 0.086 * (1 + 0.1 * v),
    rest: -0.03, wind: 0, minCum: -1.0, maxCum: -0.05, stiffness: 55, damping: 0.5, flutter: 0.7, ripple: 0.008, sway: 1.6,
    material: std(0xffffff, 0.92, 0, { vertexColors: true, side: THREE.DoubleSide }),
    colorAt: (v, u, i) => (i === 12 ? pal.cream : i % 4 < 2 ? pal.accent : pal.light),
  });
  tail.position.set(0.074, 1.27, 0.15);
  root.add(tail);
}

function buildWristbands(avatar, pal) {
  for (const side of ['Left', 'Right']) {
    const a = anchor(avatar, `${side}ForeArm`);
    const hand = avatar.model.getObjectByName(`${side}Hand`);
    if (!a || !hand) continue;
    const h = hand.getWorldPosition(new THREE.Vector3());
    avatar.group.worldToLocal(h);
    const dir = h.clone().sub(a.bone);
    const len = dir.length();
    dir.normalize();
    const band = new THREE.Group();
    band.position.copy(a.bone).addScaledVector(dir, len * 0.8);
    band.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
    a.frame.add(band);
    const rad = 0.0385;
    add(band, new THREE.CylinderGeometry(rad, rad * 1.02, 0.056, 20, 1, true), std(pal.accent, 0.8, 0, { side: THREE.DoubleSide }));
    for (const y of [-1, 1]) add(band, new THREE.TorusGeometry(rad * 1.005, 0.0045, 6, 20), std(pal.dark, 0.8), 0, y * 0.028, 0).rotation.x = Math.PI / 2;
    add(band, new THREE.CylinderGeometry(rad * 1.015, rad * 1.015, 0.012, 20, 1, true), std(pal.cream, 0.8, 0, { side: THREE.DoubleSide }));
  }
}

function buildCape(avatar, pal) {
  const a = anchor(avatar, 'Spine');
  if (!a) return;
  const root = new THREE.Group();
  a.frame.add(root);
  const gold = std('#e8c25a', 0.28, 0.85);
  const collar = add(root, ringBand(0.108, 0.112, 0.012, 0.011, 32, 6, () => pal.dark), std(0xffffff, 0.8, 0, { vertexColors: true }), 0.004, 1.31, -0.058);
  collar.rotation.x = 0.16;
  const clasp = new THREE.Group();
  clasp.position.set(0.004, 1.295, 0.064);
  clasp.rotation.x = -0.3;
  root.add(clasp);
  add(clasp, new THREE.CylinderGeometry(0.018, 0.018, 0.008, 16), gold).rotation.x = Math.PI / 2;
  add(clasp, new THREE.CylinderGeometry(0.009, 0.009, 0.01, 12), std(pal.light, 0.4, 0.2)).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) add(root, tube([V(s * 0.012, 1.285, 0.068), V(s * 0.03, 1.27, 0.07), V(s * 0.04, 1.252, 0.07)], 0.0025, 6, 4), gold);
  // shoulder mantle so the cape drapes over the trapezius instead of floating behind it
  const mantle = add(root, new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), std(pal.dark, 0.85, 0, { side: THREE.DoubleSide }), 0.004, 1.275, -0.062);
  mantle.scale.set(1.58, 0.36, 1.18);
  const cape = new Cloth(avatar, {
    rows: 9, cols: 8, length: 0.74, width: (u, v) => 0.37 + 0.13 * v,
    shape: (u, v, fall) => 0.15 * u ** 4 * fall + 0.02 * v * Math.sin(u * 7.5),
    rest: 0.022, wind: 1, lift: 1.35, minCum: 0, maxCum: 1.45, stiffness: 75, damping: 0.5, flutter: 1, ripple: 0.018, sway: 1,
    material: std(0xffffff, 0.72, 0, { vertexColors: true, side: THREE.DoubleSide }),
    colorAt: (v, u) => (v > 0.93 ? pal.light : Math.abs(u) > 0.96 ? pal.dark : pal.accent),
  });
  cape.position.set(0.004, 1.305, -0.238);
  root.add(cape);
}

const onHead = (build) => (avatar, pal) => {
  const a = anchor(avatar, 'Head');
  if (a) build(a.frame, pal);
};

const BUILDERS = {
  glasses: onHead((p, pal) => buildGlasses(p, pal, false)),
  sunglasses: onHead((p, pal) => buildGlasses(p, pal, true)),
  headphones: onHead(buildHeadphones),
  backpack: buildBackpack,
  scarf: buildScarf,
  wristbands: buildWristbands,
  cape: buildCape,
};

export function buildAccessory(avatar) {
  const build = BUILDERS[avatar.look?.accessory];
  if (build) build(avatar, palette(avatar.look.accent ?? '#ff9f43'));
}
