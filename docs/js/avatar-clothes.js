import * as THREE from 'three';
import { findSkinnedMesh, attachToBone, registerTint } from './outfit.js?v=avatar5';

// Garments are shells cut from the character's own skinned geometry (same skeleton,
// same weights), pushed outwards along smoothed normals so they deform with every
// animation. Baked garments (tee, striped, jersey, shorts) need nothing here.
// All lengths below are in mesh units (1 unit = model scale metres, ~1.21 m).

const cache = new WeakMap();   // source geometry -> prepared data + built garments
const textures = {};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0);

// ---------------------------------------------------------------- source data
function prepare(mesh) {
  const geo = mesh.geometry;
  let info = cache.get(geo);
  if (info) return info;
  const { position, normal, uv, skinIndex, skinWeight } = geo.attributes;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const welded = new Map();
  const key = (i) => `${Math.round(position.getX(i) * 2e3)},${Math.round(position.getY(i) * 2e3)},${Math.round(position.getZ(i) * 2e3)}`;
  for (let i = 0; i < position.count; i++) {
    const k = key(i);
    const n = welded.get(k) ?? welded.set(k, new THREE.Vector3()).get(k);
    n.add(new THREE.Vector3().fromBufferAttribute(normal, i));
  }
  const verts = [];
  for (let i = 0; i < position.count; i++) {
    const si = [0, 1, 2, 3].map((k) => skinIndex.getComponent(i, k));
    const sw = [0, 1, 2, 3].map((k) => skinWeight.getComponent(i, k));
    let best = 0;
    for (let k = 1; k < 4; k++) if (sw[k] > sw[best]) best = k;
    verts.push({
      p: new THREE.Vector3().fromBufferAttribute(position, i),
      n: welded.get(key(i)).clone().normalize(),
      uv: [uv.getX(i), uv.getY(i)], si, sw, bone: names[si[best]],
      aw: si.reduce((acc, j, k) => acc + (/(Arm|Hand)$/.test(names[j]) ? sw[k] : 0), 0),
    });
  }
  const index = geo.index ? Array.from(geo.index.array) : verts.map((_, i) => i);
  const bones = {};
  mesh.skeleton.bones.forEach((b, i) => {
    bones[b.name] = new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert());
  });
  info = { verts, index, bones, names, built: new Map() };
  cache.set(geo, info);
  return info;
}

const regionTris = (info, tagOf) => {
  const tags = info.verts.map(tagOf);
  const tris = [];
  for (let i = 0; i < info.index.length; i += 3) {
    const t = [info.index[i], info.index[i + 1], info.index[i + 2]];
    if (t.some((k) => !tags[k])) continue;
    tris.push(t.map((k) => ({ ...info.verts[k], tag: tags[k] })));
  }
  return tris;
};

// ---------------------------------------------------------------- geometry ops
function mixSkin(a, b, t) {
  const acc = new Map();
  for (let k = 0; k < 4; k++) {
    acc.set(a.si[k], (acc.get(a.si[k]) ?? 0) + a.sw[k] * (1 - t));
    acc.set(b.si[k], (acc.get(b.si[k]) ?? 0) + b.sw[k] * t);
  }
  const top = [...acc].sort((x, y) => y[1] - x[1]).slice(0, 4);
  const sum = top.reduce((s, e) => s + e[1], 0) || 1;
  while (top.length < 4) top.push([0, 0]);
  return { si: top.map((e) => e[0]), sw: top.map((e) => e[1] / sum) };
}

function lerpVert(a, b, t, cut) {
  return {
    p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(),
    uv: [lerp(a.uv[0], b.uv[0], t), lerp(a.uv[1], b.uv[1], t)],
    aw: lerp(a.aw, b.aw, t), ...mixSkin(a, b, t), bone: t < 0.5 ? a.bone : b.bone, tag: t < 0.5 ? a.tag : b.tag, cut,
  };
}

let cutCounter = 1;
// Splits triangles by f(v) >= 0 (keep) / < 0 (drop). New vertices carry a cut id.
function clip(tris, f) {
  const cut = cutCounter++;
  const keep = [], drop = [];
  const fan = (poly, out) => { for (let i = 1; i < poly.length - 1; i++) out.push([poly[0], poly[i], poly[i + 1]]); };
  for (const t of tris) {
    const fv = t.map(f);
    if (fv.every((x) => x >= 0)) { keep.push(t); continue; }
    if (fv.every((x) => x < 0)) { drop.push(t); continue; }
    const pk = [], pd = [];
    for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3], fa = fv[i], fb = fv[(i + 1) % 3];
      (fa >= 0 ? pk : pd).push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const c = lerpVert(a, b, fa / (fa - fb), cut);
        pk.push(c); pd.push(c);
      }
    }
    fan(pk, keep); fan(pd, drop);
  }
  return { keep, drop, cut };
}

function clipAll(tris, fns) {
  const cuts = [];
  for (const f of fns) { const r = clip(tris, f); tris = r.keep; cuts.push(r.cut); }
  return { tris, cuts };
}

function finish(tris, offset, move) {
  return tris.map((t) => t.map((v) => {
    const c = { ...v, p: v.p.clone(), n: v.n.clone(), uv: [...v.uv] };
    c.p.addScaledVector(c.n, offset(v));
    move?.(c, v);
    return c;
  }));
}

// Splits the longest edge of every triangle until all edges are <= maxEdge.
function subdivide(tris, maxEdge) {
  const out = [];
  const stack = [...tris];
  while (stack.length) {
    const t = stack.pop();
    let k = 0, best = 0;
    for (let i = 0; i < 3; i++) {
      const d = t[i].p.distanceTo(t[(i + 1) % 3].p);
      if (d > best) { best = d; k = i; }
    }
    if (best <= maxEdge) { out.push(t); continue; }
    const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3];
    const m = lerpVert(a, b, 0.5, 0);
    stack.push([a, m, c], [m, b, c]);
  }
  return out;
}

// Closes the open edge left by clip(): a thin strip folded back towards the body.
function rim(tris, cuts, depth) {
  const out = [];
  const set = new Set(cuts);
  for (const t of tris) {
    const c = t.reduce((s, v) => s.add(v.p), new THREE.Vector3()).multiplyScalar(1 / 3);
    for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3];
      if (!a.cut || a.cut !== b.cut || !set.has(a.cut)) continue;
      const edge = b.p.clone().sub(a.p).normalize();
      const o = a.p.clone().add(b.p).multiplyScalar(0.5).sub(c);
      o.addScaledVector(edge, -o.dot(edge)).normalize();
      const mk = (v, inner) => ({
        p: inner ? v.p.clone().addScaledVector(v.n, -depth) : v.p.clone(), n: o.clone(),
        uv: [...v.uv], si: v.si, sw: v.sw,
      });
      const q = [mk(a, 0), mk(b, 0), mk(b, 1), mk(a, 1)];
      const nrm = q[1].p.clone().sub(q[0].p).cross(q[3].p.clone().sub(q[0].p));
      if (nrm.dot(o) < 0) q.reverse();
      out.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
    }
  }
  return out;
}

// u wraps around `axis`; triangles straddling the seam are re-based so stripes stay intact.
function cylinderUV(tris, origin, axis, ref, cols, rows) {
  const ax = axis.clone().normalize();
  const e1 = ref.clone().addScaledVector(ax, -ref.dot(ax)).normalize();
  const e2 = ax.clone().cross(e1);
  for (const t of tris) {
    const us = t.map((v) => {
      const d = v.p.clone().sub(origin);
      return Math.atan2(d.dot(e2), d.dot(e1)) / (Math.PI * 2) * cols;
    });
    if (Math.max(...us) - Math.min(...us) > cols / 2) us.forEach((u, i) => { if (u < 0) us[i] += cols; });
    t.forEach((v, i) => { v.uv = [us[i], v.p.clone().sub(origin).dot(ax) * rows]; });
  }
}

function toGeometry(tris) {
  const n = tris.length * 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  let i = 0;
  for (const t of tris) for (const v of t) {
    pos.set([v.p.x, v.p.y, v.p.z], i * 3); nor.set([v.n.x, v.n.y, v.n.z], i * 3);
    uv.set(v.uv, i * 2); si.set(v.si, i * 4); sw.set(v.sw, i * 4);
    i++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.computeBoundingSphere();
  return g;
}

// Surface sampling: project (a, b) along `axis` ('z' front-most, 'x' outermost on `side`).
function surfacePoint(tris, axis, a, b, side = 1) {
  const [i, j, k] = axis === 'z' ? ['x', 'y', 'z'] : ['y', 'z', 'x'];
  let best = null;
  for (const t of tris) {
    const [p0, p1, p2] = t.map((v) => v.p);
    const d = (p1[i] - p0[i]) * (p2[j] - p0[j]) - (p2[i] - p0[i]) * (p1[j] - p0[j]);
    if (Math.abs(d) < 1e-9) continue;
    const u = ((a - p0[i]) * (p2[j] - p0[j]) - (p2[i] - p0[i]) * (b - p0[j])) / d;
    const v = ((p1[i] - p0[i]) * (b - p0[j]) - (a - p0[i]) * (p1[j] - p0[j])) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const c = p0[k] + u * (p1[k] - p0[k]) + v * (p2[k] - p0[k]);
    if (c * side <= 0 || (best && c * side <= best.c * side)) continue;
    const n = t[0].n.clone().multiplyScalar(1 - u - v).addScaledVector(t[1].n, u).addScaledVector(t[2].n, v).normalize();
    best = { c, n };
  }
  if (!best) return null;
  const p = new THREE.Vector3();
  p[i] = a; p[j] = b; p[k] = best.c;
  return { p, n: best.n };
}

// Flat ribbon lying on a surface (zippers, side stripes, drawstrings), skinned like the nearest body vertex.
function ribbon(info, pts, wdir, width, lift) {
  const tris = [];
  const mk = (pt, s) => {
    const p = pt.p.clone().addScaledVector(wdir, s * width / 2).addScaledVector(pt.n, lift);
    let near = info.verts[0], bd = Infinity;
    for (const v of info.verts) { const d = v.p.distanceToSquared(pt.p); if (d < bd) { bd = d; near = v; } }
    return { p, n: pt.n.clone(), uv: [s > 0 ? 1 : 0, 0], si: near.si, sw: near.sw };
  };
  const rows = pts.map((pt) => [mk(pt, -1), mk(pt, 1)]);
  for (let i = 0; i + 1 < rows.length; i++) {
    const [l0, r0] = rows[i], [l1, r1] = rows[i + 1];
    for (const t of [[l0, r0, l1], [r0, r1, l1]]) {
      const nrm = t[1].p.clone().sub(t[0].p).cross(t[2].p.clone().sub(t[0].p));
      if (nrm.dot(pts[i].n) < 0) t.reverse();
      tris.push(t);
    }
  }
  return tris;
}

// ---------------------------------------------------------------- textures / materials
function canvasTexture(kind) {
  if (textures[kind] || typeof document === 'undefined') return textures[kind] ?? null;
  const size = 64, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, size, size);
  if (kind === 'rib') {
    const grad = g.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, '#6a6a6a'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#6a6a6a');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
  } else {
    // chunky stockinette: rows of V stitches
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * 16, y = row * 16;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(x + 1, y + 1); g.lineTo(x + 8, y + 15); g.lineTo(x + 15, y + 1);
        g.lineTo(x + 11, y + 1); g.lineTo(x + 8, y + 8); g.lineTo(x + 5, y + 1);
        g.closePath(); g.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return (textures[kind] = tex);
}

function makeMaterial(def, avatar, group) {
  const look = avatar.look;
  const base = new THREE.Color(group === 'top' ? look.shirt : look.pants);
  const color = {
    main: () => base.clone().multiplyScalar(def.shade ?? 1),
    dark: () => base.clone().multiplyScalar(0.78),
    trim: () => new THREE.Color(look.accent),
    skin: () => new THREE.Color(look.skin),
    zip: () => new THREE.Color(0xc9ced6),
  }[def.mat]();
  const tex = def.tex ? canvasTexture(def.tex) : null;
  const m = new THREE.MeshStandardMaterial({
    color, roughness: def.mat === 'zip' ? 0.35 : 0.88, metalness: def.mat === 'zip' ? 0.8 : 0,
    side: def.double ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (group === 'top' && def.mat !== 'skin' && def.mat !== 'zip') {
    registerTint(avatar, def.mat === 'trim' ? 'trim' : 'shirt', m.color, def.mat === 'dark' ? 0.78 : def.mat === 'main' ? def.shade ?? 1 : 1);
  }
  if (tex) { m.map = tex; m.bumpMap = tex; m.bumpScale = def.tex === 'knit' ? 3 : 1.4; }
  return m;
}

function skinnedMesh(source, geometry, material) {
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.position.copy(source.position); mesh.quaternion.copy(source.quaternion); mesh.scale.copy(source.scale);
  mesh.bind(source.skeleton, source.bindMatrix);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.userData.shared = true;   // geometry is cached across avatars; materials are per avatar
  source.parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- tops
const TORSO_BONES = new Set(['Hips', 'Spine', 'Spine01', 'Spine02', 'neck']);
const ARM_PARTS = ['Shoulder', 'Arm', 'ForeArm', 'Hand'];
const upperTag = (v) => {
  if (TORSO_BONES.has(v.bone)) return 'torso';
  if (/^(Left|Right)UpLeg$/.test(v.bone) && v.p.y > 0.62) return 'torso';
  for (const side of ['Left', 'Right']) if (ARM_PARTS.some((a) => v.bone === side + a)) return side;
  return null;
};

function armFrame(info, side) {
  const a = info.bones[`${side}Arm`], e = info.bones[`${side}ForeArm`], h = info.bones[`${side}Hand`];
  const axis = h.clone().sub(e).normalize();
  const length = h.distanceTo(e);
  return { origin: a, elbow: e, axis, length, upper: e.clone().sub(a).normalize() };
}

// Builds the shell for a top: body + sleeves, with hem / cuff / neck bands.
function upperShell(info, spec) {
  const frames = { Left: armFrame(info, 'Left'), Right: armFrame(info, 'Right') };
  const wristDist = (v) => {
    const f = frames[v.tag];
    return f.elbow.clone().addScaledVector(f.axis, f.length * spec.wrist).sub(v.p).dot(f.axis);
  };
  const isTorso = (v) => v.tag === 'torso';
  const fns = [
    (v) => (isTorso(v) ? v.p.y - spec.hem : 1),
    (v) => (isTorso(v) ? spec.neckTop - v.p.y : 1),
    (v) => (isTorso(v) ? 1 : wristDist(v)),
  ];
  const { tris, cuts } = clipAll(regionTris(info, upperTag), fns);

  const split = clip(tris, (v) => (isTorso(v)
    ? Math.min(v.p.y - (spec.hem + spec.hemBand), spec.neckTop - spec.neckBand - v.p.y)
    : wristDist(v) - spec.cuffBand));
  const bodyOff = (v) => {
    if (!isTorso(v)) return lerp(spec.cuffOff, spec.off * 0.8, smooth(spec.cuffBand, spec.cuffBand + 0.06, wristDist(v)));
    const o = lerp(spec.hemOff, spec.off, smooth(spec.hem + spec.hemBand, spec.hem + spec.hemBand + spec.hemRamp, v.p.y));
    return lerp(spec.neckOff, o, smooth(spec.neckTop - spec.neckBand, spec.neckTop - spec.neckBand - 0.05, v.p.y));
  };
  const bandOff = (v) => 0.0015 + (!isTorso(v) ? spec.cuffOff
    : v.p.y < (spec.hem + spec.neckTop) / 2 ? spec.hemOff : spec.neckOff);
  const bodyFin = finish(split.keep, bodyOff);
  const bandFin = finish(split.drop, bandOff);
  return {
    frames, bodyFin, bandFin, cuts,
    bandRim: rim(bandFin, cuts.slice(0, 3), 0.012),
  };
}

function mapUV(shell, bodyCols, bandCols, cell, bandRows) {
  const origin = new THREE.Vector3(0, 0, -0.03);
  const torso = (tris) => tris.filter((t) => t[0].tag === 'torso');
  cylinderUV(torso(shell.bodyFin), origin, Y, Z, bodyCols, 1 / cell);
  cylinderUV(torso(shell.bandFin), origin, Y, Z, bandCols, bandRows);
  for (const side of ['Left', 'Right']) {
    const f = shell.frames[side];
    const arm = (tris) => tris.filter((t) => t[0].tag === side);
    cylinderUV(arm(shell.bodyFin), f.origin, f.axis, Z, 3, 1 / cell);
    cylinderUV(arm(shell.bandFin), f.origin, f.axis, Z, 12, bandRows);
  }
}

const TOP_SPECS = {
  hoodie: { hem: 0.7, neckTop: 1.07, wrist: 0.88, hemBand: 0.04, neckBand: 0.02, cuffBand: 0.035,
    off: 0.018, hemOff: 0.0165, neckOff: 0.006, cuffOff: 0.0075, hemRamp: 0.1 },
  sweater: { hem: 0.7, neckTop: 1.075, wrist: 0.9, hemBand: 0.045, neckBand: 0.035, cuffBand: 0.04,
    off: 0.022, hemOff: 0.0175, neckOff: 0.012, cuffOff: 0.011, hemRamp: 0.1 },
  jacket: { hem: 0.7, neckTop: 1.07, wrist: 0.9, hemBand: 0.035, neckBand: 0.01, cuffBand: 0.035,
    off: 0.014, hemOff: 0.0165, neckOff: 0.01, cuffOff: 0.008, hemRamp: 0.06 },
};

function buildTopPieces(info, style) {
  const pieces = [];
  const push = (tris, def) => pieces.push({ tris, ...def });
  if (style === 'tank') {
    const frames = { Left: armFrame(info, 'Left'), Right: armFrame(info, 'Right') };
    // skin cover over the baked sleeves and upper chest
    const sleeve = (v) => (v.tag === 'torso' ? 1 : 0.2 - v.p.clone().sub(frames[v.tag].origin).dot(frames[v.tag].upper));
    const covered = regionTris(info, upperTag).filter((t) => t.every((v) => v.tag !== 'torso' || v.p.y > 0.85));
    const neckDist = (v) => Math.hypot(v.p.x, v.p.z + 0.05) - 0.053;
    const skin = clipAll(covered, [(v) => (v.tag === 'torso' ? v.p.y - 0.88 : 1), neckDist, sleeve]);
    const skinFin = finish(skin.tris, (v) => (v.tag === 'torso' ? 0.006 : 0.006 * smooth(0.0, 0.1, sleeve(v)) + 0.0015));
    push([...skinFin, ...rim(skinFin, skin.cuts, 0.006)], { mat: 'skin' });
    const neckline = (v) => {
      const x = Math.abs(v.p.x);
      return v.p.z > -0.03 ? 0.955 + 0.14 * Math.min(1, x / 0.07) ** 2 : 1.01 + 0.08 * smooth(0.02, 0.06, x);
    };
    const torso = regionTris(info, (v) => (upperTag(v) ? 'torso' : null));
    const body = clipAll(subdivide(torso.filter((t) => t.every((v) => v.p.y > 0.66)), 0.012), [
      (v) => 0.45 - v.aw, (v) => v.p.y - 0.72, neckDist,
      (v) => Math.min(neckline(v) - v.p.y, Math.max(0.97 - v.p.y, 0.09 - Math.abs(v.p.x))),
    ]);
    const fin = finish(body.tris, (v) => lerp(0.008, 0.012, smooth(0.72, 0.85, v.p.y)));
    push([...fin, ...rim(fin, body.cuts, 0.012)], { mat: 'main' });
    return { pieces };
  }
  const spec = TOP_SPECS[style];
  const shell = upperShell(info, spec);
  const knit = style === 'sweater';
  const ribbed = style !== 'jacket';
  mapUV(shell, 6, ribbed ? 40 : 1, 0.12, 8);
  push(shell.bodyFin, { mat: 'main', tex: knit ? 'knit' : null, shade: style === 'jacket' ? 0.88 : 1 });
  push([...shell.bandFin, ...shell.bandRim], { mat: ribbed ? 'main' : 'trim', tex: ribbed ? 'rib' : null, shade: 0.94 });
  const torso = [...shell.bodyFin, ...shell.bandFin].filter((t) => t[0].tag === 'torso');

  if (style === 'hoodie') {
    const pocket = clipAll(
      regionTris(info, (v) => (upperTag(v) === 'torso' && v.p.y > 0.66 ? 'torso' : null)).filter((t) => t.every((v) => v.p.z > -0.02)),
      [(v) => v.p.y - 0.76, (v) => 0.885 - v.p.y, (v) => (0.075 + (0.885 - v.p.y) * 0.45) - Math.abs(v.p.x)],
    );
    const fin = finish(pocket.tris, () => spec.off + 0.007);
    push([...fin, ...rim(fin, pocket.cuts, 0.01)], { mat: 'main' });
    for (const x of [-0.032, 0.032]) {
      const pts = [1.045, 1.01, 0.975, 0.945].map((y, i) => {
        const h = surfacePoint(torso, 'z', x, y);
        if (h) h.p.x = x * (1 - i * 0.04);
        return h;
      }).filter(Boolean);
      push(ribbon(info, pts, X, 0.012, 0.004), { mat: 'trim' });
    }
  }
  if (style === 'jacket') {
    const pts = [];
    for (let y = spec.hem + 0.005; y <= 1.04; y += 0.02) {
      const h = surfacePoint(torso, 'z', 0, y);
      if (h) pts.push(h);
    }
    push(ribbon(info, pts, X, 0.013, 0.003), { mat: 'zip' });
  }
  return { pieces };
}

// ---------------------------------------------------------------- bottoms
const lowerTag = (v) => (v.bone === 'Hips' || v.bone === 'Spine02' || /^(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/.test(v.bone) ? 'leg' : null);

// Radius of the trouser tube (around the leg axis) by height: [y, radius] pairs.
const BOTTOM_SPECS = {
  pants: { top: 0.745, hem: 0.12, waist: 0.025, cuff: 0, off: 0.0125, hemOff: 0.01,
    radius: [[0.12, 0.074], [0.2, 0.08], [0.3, 0.088], [0.4, 0.092], [0.5, 0.1], [0.6, 0.108]] },
  joggers: { top: 0.745, hem: 0.2, waist: 0.03, cuff: 0.04, off: 0.022, hemOff: 0.008,
    radius: [[0.2, 0.07], [0.26, 0.078], [0.3, 0.1], [0.4, 0.106], [0.5, 0.114], [0.6, 0.12]] },
};

function buildTrousers(info, style) {
  const pieces = [];
  const push = (tris, def) => pieces.push({ tris, ...def });
  const spec = BOTTOM_SPECS[style];
  const { hip, knee, ankle } = {
    hip: info.bones.LeftUpLeg, knee: info.bones.LeftLeg, ankle: info.bones.LeftFoot,
  };
  const axisAt = (y) => {
    const [a, b] = y > knee.y ? [hip, knee] : [knee, ankle];
    const t = (a.y - y) / (a.y - b.y);
    return [lerp(a.x, b.x, t), lerp(a.z, b.z, t)];
  };
  const radiusAt = (y) => {
    const r = spec.radius;
    if (y <= r[0][0]) return r[0][1];
    for (let i = 1; i < r.length; i++) if (y <= r[i][0]) return lerp(r[i - 1][1], r[i][1], smooth(r[i - 1][0], r[i][0], y));
    return r[r.length - 1][1];
  };
  // Legs become clean tubes around the leg axis (the baked shorts bulge is ignored); they blend into the hip surface.
  const tube = (c, v, extra = 0) => {
    const w = 1 - smooth(0.58, 0.7, v.p.y);
    if (w <= 0) return;
    const side = v.p.x >= 0 ? 1 : -1;
    const [ax, az] = axisAt(Math.min(v.p.y, hip.y));
    const dx = Math.abs(v.p.x) - ax, dz = v.p.z - az, len = Math.hypot(dx, dz) || 1;
    const R = radiusAt(v.p.y) + extra;
    const target = new THREE.Vector3(side * (ax + dx / len * R), v.p.y, az + dz / len * R);
    c.p.lerp(target, w);
    c.n.lerp(new THREE.Vector3(side * dx / len, 0, dz / len), w).normalize();
  };
  const { tris, cuts } = clipAll(subdivide(regionTris(info, lowerTag), 0.04), [(v) => spec.top - v.p.y, (v) => (v.p.y < 0.66 ? v.p.y - spec.hem : 1)]);
  const waist = clip(tris, (v) => spec.top - spec.waist - v.p.y);
  const cuff = clip(waist.keep, (v) => (v.p.y < 0.66 && spec.cuff ? v.p.y - (spec.hem + spec.cuff) : 1));
  const hipOff = (v) => lerp(0.012, spec.off, smooth(0.6, 0.7, v.p.y));
  const bodyFin = finish(cuff.keep, hipOff, (c, v) => tube(c, v));
  const waistFin = finish(waist.drop, () => spec.off + 0.003);
  const cuffFin = finish(cuff.drop, () => 0, (c, v) => tube(c, v, 0.004));
  push([...bodyFin, ...rim(bodyFin, cuts, 0.01)], { mat: 'main' });
  push([...waistFin, ...rim(waistFin, cuts, 0.01)], { mat: 'dark' });
  if (cuffFin.length) {
    for (const t of cuffFin) for (const v of t) v.uv = [Math.atan2(v.p.x - (v.p.x > 0 ? 0.13 : -0.13), v.p.z) / (Math.PI * 2) * 12, v.p.y * 20];
    push([...cuffFin, ...rim(cuffFin, cuts, 0.01)], { mat: 'main', tex: 'rib', shade: 0.9 });
  }
  if (style === 'joggers') {
    for (const side of [1, -1]) {
      const pts = [];
      for (let y = spec.top - 0.03; y >= spec.hem + 0.05; y -= 0.02) {
        const h = surfacePoint([...bodyFin, ...waistFin], 'x', y, lerp(-0.02, -0.025, smooth(0.15, 0.7, y)), side);
        if (h) pts.push(h);
      }
      push(ribbon(info, pts, Z, 0.022, 0.003), { mat: 'trim' });
    }
  }
  return { pieces };
}

function buildSkirt(info) {
  const pieces = [];
  const [H, L, R] = ['Hips', 'LeftUpLeg', 'RightUpLeg'].map((n) => info.names.indexOf(n));
  const yTop = 0.78, yHem = 0.44, rings = 14, seg = 64;
  const vert = (t, a) => {
    const flare = Math.pow(t, 0.85), pleat = 1 + Math.sin(a * 14) * t * 0.05;
    const x = Math.sin(a) * lerp(0.132, 0.285, flare) * pleat, z = -0.02 + Math.cos(a) * lerp(0.115, 0.235, flare) * pleat;
    const lw = Math.pow(smooth(0.1, 1, t), 1.1) * 0.8;
    const side = Math.max(-1, Math.min(1, x / (0.06 + 0.1 * (1 - t))));
    const wl = lw * (1 + side) / 2, wr = lw * (1 - side) / 2;
    return {
      p: new THREE.Vector3(x, lerp(yTop, yHem, t), z), n: new THREE.Vector3(Math.sin(a) * 0.9, 0.45, Math.cos(a) * 0.9).normalize(),
      uv: [a, t], si: [H, L, R, 0], sw: [1 - wl - wr, wl, wr, 0],
    };
  };
  const tris = [];
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const a = vert(r / rings, a0), b = vert(r / rings, a1), c = vert((r + 1) / rings, a0), d = vert((r + 1) / rings, a1);
      tris.push([a, c, b], [b, c, d]);
    }
  }
  pieces.push({ tris, mat: 'main', double: true });
  const band = [];
  const mk = (a, y) => ({
    p: new THREE.Vector3(Math.sin(a) * 0.135, y, -0.02 + Math.cos(a) * 0.118), n: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
    uv: [0, 0], si: [H, 0, 0, 0], sw: [1, 0, 0, 0],
  });
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
    const a = mk(a0, yTop + 0.012), b = mk(a1, yTop + 0.012), c = mk(a0, yTop - 0.04), d = mk(a1, yTop - 0.04);
    band.push([a, c, b], [b, c, d]);
  }
  pieces.push({ tris: band, mat: 'dark', double: true });
  return { pieces };
}

// ---------------------------------------------------------------- rigid details
function rigid(avatar, mesh, bone, geometry, material, pos) {
  const mount = attachToBone(avatar, bone);
  const m = new THREE.Mesh(geometry, material);
  m.position.copy(pos).sub(prepare(mesh).bones[bone]).multiplyScalar(avatar.model.scale.x);
  m.castShadow = true;
  mount.add(m);
  return m;
}

function hoodExtras(avatar, mesh) {
  const s = avatar.model.scale.x;
  const mat = new THREE.MeshStandardMaterial({ color: avatar.look.shirt, roughness: 0.9 });
  registerTint(avatar, 'shirt', mat.color);
  // bunched hood: a collar roll around the neck base plus a slumped pouch behind
  const roll = new THREE.TorusGeometry(0.068 * s, 0.026 * s, 10, 28, Math.PI * 1.55);
  roll.rotateX(Math.PI / 2);
  roll.rotateY(Math.PI * 1.225);
  rigid(avatar, mesh, 'Spine', roll, mat, new THREE.Vector3(0, 1.045, -0.052));
  const back = new THREE.SphereGeometry(0.075 * s, 16, 12);
  back.scale(1.25, 0.8, 0.7);
  rigid(avatar, mesh, 'Spine', back, mat, new THREE.Vector3(0, 1.0, -0.115));
}

function collarExtras(avatar, mesh) {
  const s = avatar.model.scale.x;
  const mat = new THREE.MeshStandardMaterial({ color: avatar.look.accent, roughness: 0.85, side: THREE.DoubleSide });
  registerTint(avatar, 'trim', mat.color);
  const g = new THREE.CylinderGeometry(0.078 * s, 0.09 * s, 0.06 * s, 24, 1, true, Math.PI * 0.12, Math.PI * 1.76);
  rigid(avatar, mesh, 'Spine', g, mat, new THREE.Vector3(0, 1.075, -0.05));
}

// ---------------------------------------------------------------- entry points
function dress(avatar, group, style, builder, extras) {
  const mesh = findSkinnedMesh(avatar);
  if (!mesh || !mesh.skeleton || !mesh.parent) return;
  const info = prepare(mesh);
  const key = `${group}:${style}`;
  if (!info.built.has(key)) {
    const { pieces } = builder(info, style);
    info.built.set(key, pieces.map((p) => ({ ...p, geo: toGeometry(p.tris), tris: null })));
  }
  avatar.clothes ??= {};
  avatar.clothes[group] = info.built.get(key).map((piece) => skinnedMesh(mesh, piece.geo, makeMaterial(piece, avatar, group)));
  extras?.(avatar, mesh);
}

export function buildTop(avatar) {
  const style = avatar.look?.top;
  if (!['hoodie', 'jacket', 'sweater', 'tank'].includes(style)) return;
  dress(avatar, 'top', style, buildTopPieces, { hoodie: hoodExtras, jacket: collarExtras }[style]);
}

export function buildBottom(avatar) {
  const style = avatar.look?.bottom;
  if (!['pants', 'joggers', 'skirt'].includes(style)) return;
  dress(avatar, 'bottom', style, style === 'skirt' ? buildSkirt : buildTrousers);
}
