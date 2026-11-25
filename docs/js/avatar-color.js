import * as THREE from 'three';
import { findSkinnedMesh, registerTint } from './outfit.js?v=avatar5';

// Recolours the baked texture (skin, top, bottoms, shoes) per avatar from avatar.look.
// A region mask (R skin, G shirt, B pants, A shoes) is built once per geometry from the
// texture colours plus per-triangle bone regions, then a patched clone of the material
// remaps luminance toward each chosen colour so shading, folds and stitching survive.

const FEET = ['Foot', 'ToeBase'];
const LOWER_LEG = ['Leg'];
const LEGS_HIPS = ['Hips', 'UpLeg'];
const TORSO = ['Spine', 'Spine01', 'Spine02', 'Shoulder', 'Arm'];
const ROLE = { none: 0, feet: 1, lowerLeg: 2, pants: 3, shirt: 4, other: 5 };

const cache = new WeakMap();

function boneRole(name) {
  const n = name.replace(/^(Left|Right)/, '');
  if (FEET.includes(n)) return ROLE.feet;
  if (LOWER_LEG.includes(n)) return ROLE.lowerLeg;
  if (LEGS_HIPS.includes(n)) return ROLE.pants;
  if (TORSO.includes(n)) return ROLE.shirt;
  return ROLE.other;
}

function rgb2hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h * 60, max ? d / max : 0, max];
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function imageData(image) {
  const w = image.width || image.naturalWidth, h = image.height || image.naturalHeight;
  if (!w || !h || image.complete === false) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}

function triangleRoles(mesh, w, h) {
  const geo = mesh.geometry;
  const uv = geo.attributes.uv, joints = geo.attributes.skinIndex, weights = geo.attributes.skinWeight;
  const boneRoles = mesh.skeleton.bones.map((b) => boneRole(b.name));
  const vertexRole = new Uint8Array(uv.count);
  for (let i = 0; i < uv.count; i++) {
    const sum = new Float32Array(6);
    for (let k = 0; k < 4; k++) sum[boneRoles[joints.getComponent(i, k)]] += weights.getComponent(i, k);
    let best = 5;
    for (let r = 1; r < 6; r++) if (sum[r] > sum[best]) best = r;
    vertexRole[i] = best;
  }
  const roleMap = new Uint8Array(w * h);
  const index = geo.index ? geo.index.array : null;
  const count = index ? index.length : uv.count;
  for (let t = 0; t + 2 < count; t += 3) {
    const ids = [0, 1, 2].map((k) => (index ? index[t + k] : t + k));
    const votes = new Float32Array(6);
    for (const id of ids) votes[vertexRole[id]]++;
    let role = 5;
    for (let r = 1; r < 6; r++) if (votes[r] > votes[role]) role = r;
    const p = ids.map((id) => [uv.getX(id) * w - 0.5, uv.getY(id) * h - 0.5]);
    const minX = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])));
    const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]);
    if (Math.abs(area) < 1e-6) continue;
    const e = -0.6 / Math.sqrt(Math.abs(area));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const a = ((p[1][0] - x) * (p[2][1] - y) - (p[2][0] - x) * (p[1][1] - y)) / area;
        const b = ((p[2][0] - x) * (p[0][1] - y) - (p[0][0] - x) * (p[2][1] - y)) / area;
        if (a >= e && b >= e && 1 - a - b >= e) roleMap[y * w + x] = role;
      }
    }
  }
  // Grow the roles into the padding gutter so filtered edge texels classify correctly.
  for (let pass = 0; pass < 6; pass++) {
    const next = roleMap.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (roleMap[y * w + x]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r = roleMap[ny * w + nx];
          if (r) { next[y * w + x] = r; break; }
        }
      }
    }
    roleMap.set(next);
  }
  return { roleMap, vertexRole };
}

function buildRegions(mesh, image) {
  const data = imageData(image);
  if (!data) return null;
  const { width: w, height: h } = data;
  const { roleMap, vertexRole } = triangleRoles(mesh, w, h);
  const mask = new Uint8Array(w * h * 4);
  const sums = [0, 0, 0, 0], totals = [0, 0, 0, 0];
  const px = data.data;
  for (let i = 0; i < w * h; i++) {
    const role = roleMap[i];
    if (!role) continue;
    const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    const [hue, sat, val] = rgb2hsv(r, g, b);
    const l = luma(r, g, b);
    // Soft colour classes.
    const skinHue = Math.max(0, 1 - Math.max(0, Math.abs(hue - 22) - 10) / 12);
    const skinW = sstep(0.18, 0.32, sat) * sstep(0.5, 0.64, l) * skinHue;
    const blueHue = sstep(185, 205, hue) * (1 - sstep(245, 265, hue));
    const blueW = blueHue * sstep(0.22, 0.4, sat) * sstep(0.04, 0.12, val);
    const khakiHue = sstep(28, 40, hue) * (1 - sstep(62, 78, hue));
    const khakiW = khakiHue * sstep(0.08, 0.16, sat) * (1 - sstep(0.45, 0.6, sat)) * sstep(0.2, 0.3, val) * (1 - sstep(0.62, 0.75, l));
    let s = skinW, t = 0, p = 0, f = 0;
    if (role === ROLE.feet || role === ROLE.lowerLeg) f = blueW;
    else if (role === ROLE.shirt) t = blueW;
    else if (role === ROLE.pants) { p = khakiW; t = blueW; }
    else if (role === ROLE.other) t = blueW;
    const sum = s + t + p + f;
    if (sum > 1) { s /= sum; t /= sum; p /= sum; f /= sum; }
    mask[i * 4] = Math.round(s * 255); mask[i * 4 + 1] = Math.round(t * 255);
    mask[i * 4 + 2] = Math.round(p * 255); mask[i * 4 + 3] = Math.round(f * 255);
    const cls = [s, t, p, f];
    for (let k = 0; k < 4; k++) if (cls[k] > 0.9) { sums[k] += l; totals[k]++; }
  }
  const texture = new THREE.DataTexture(mask, w, h, THREE.RGBAFormat);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  const fallback = [0.78, 0.35, 0.45, 0.4];
  const baseLuma = sums.map((v, k) => (totals[k] > 50 ? v / totals[k] : fallback[k]));

  // Bind-pose extents of the shirt, used to place stripes, collar and sleeve trim.
  const pos = mesh.geometry.attributes.position;
  const box = new THREE.Box3(), torso = new THREE.Box3(), v = new THREE.Vector3();
  const bones = mesh.skeleton.bones.map((b) => b.name);
  const joints = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < pos.count; i++) {
    if (vertexRole[i] !== ROLE.shirt) continue;
    v.fromBufferAttribute(pos, i);
    box.expandByPoint(v);
    let best = 0;
    for (let k = 1; k < 4; k++) if (weights.getComponent(i, k) > weights.getComponent(i, best)) best = k;
    if (/^Spine/.test(bones[joints.getComponent(i, best)])) torso.expandByPoint(v);
  }
  return { texture, baseLuma, box, torso };
}

function regionsFor(mesh, image) {
  let entry = cache.get(mesh.geometry);
  if (entry === undefined) {
    try { entry = buildRegions(mesh, image); } catch { entry = null; }
    if (entry) cache.set(mesh.geometry, entry);
  }
  return entry;
}

const RECOLOR = /* glsl */`
vec3 ftRecolor(vec3 src, vec3 target, float baseL) {
  vec3 s = pow(max(src, vec3(0.0)), vec3(1.0 / 2.2));
  vec3 t = pow(max(target, vec3(0.0)), vec3(1.0 / 2.2));
  float ratio = clamp(dot(s, vec3(0.299, 0.587, 0.114)) / baseL, 0.2, 2.2);
  float lt = dot(t, vec3(0.299, 0.587, 0.114));
  float down = min(ratio, 1.0);
  float up = max(ratio - 1.0, 0.0);
  vec3 o = t * down;
  o += (1.0 - t) * up * 0.45 * (1.0 - lt * 0.6);
  o += (ratio - 1.0) * 0.05 * (1.0 - lt);
  return pow(clamp(o, 0.0, 1.0), vec3(2.2));
}
`;

export function applyColors(avatar) {
  const mesh = findSkinnedMesh(avatar);
  if (!mesh || !mesh.skeleton || Array.isArray(mesh.material) || !mesh.material.map?.image) return;
  const { uv, skinIndex, skinWeight } = mesh.geometry.attributes;
  if (!uv || !skinIndex || !skinWeight || typeof document === 'undefined') return;
  const regions = regionsFor(mesh, mesh.material.map.image);
  if (!regions) return;

  const look = avatar.look;
  const material = mesh.material.clone();
  delete material.userData.avatarShared;
  const style = look.top === 'striped' ? 1 : look.top === 'jersey' ? 2 : 0;
  const { box, torso } = regions;
  const uniforms = {
    ftRegion: { value: regions.texture },
    ftSkin: { value: new THREE.Color(look.skin) },
    ftShirt: { value: new THREE.Color(look.shirt) },
    ftPants: { value: new THREE.Color(look.pants) },
    ftShoe: { value: new THREE.Color(look.shoe) },
    ftAccent: { value: new THREE.Color(look.accent) },
    ftBase: { value: new THREE.Vector4(...regions.baseLuma) },
    ftStyle: { value: style },
    ftShirtBox: { value: new THREE.Vector4(box.min.y, box.max.y, torso.max.x, box.max.x) },
  };
  registerTint(avatar, 'shirt', uniforms.ftShirt.value);
  registerTint(avatar, 'trim', uniforms.ftAccent.value);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFtBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFtBind = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFtBind;
uniform sampler2D ftRegion;
uniform vec3 ftSkin, ftShirt, ftPants, ftShoe, ftAccent;
uniform vec4 ftBase, ftShirtBox;
uniform int ftStyle;
${RECOLOR}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
{
  vec4 m = texture2D(ftRegion, vMapUv);
  vec3 src = diffuseColor.rgb;
  vec3 shirtColor = ftShirt;
  if (ftStyle != 0) {
    float span = max(ftShirtBox.y - ftShirtBox.x, 1e-4);
    float v = (vFtBind.y - ftShirtBox.x) / span;
    if (ftStyle == 1) {
      shirtColor = mix(ftShirt, ftAccent, step(0.5, fract(v * 7.0)));
    } else {
      float sleeve = smoothstep(ftShirtBox.z * 1.15, ftShirtBox.z * 1.25, abs(vFtBind.x));
      float hem = smoothstep(ftShirtBox.w * 0.78, ftShirtBox.w * 0.82, abs(vFtBind.x));
      float chest = step(0.5, v) * step(v, 0.66) * (1.0 - sleeve);
      float collar = smoothstep(0.9, 0.93, v);
      shirtColor = mix(ftShirt, ftAccent, max(max(hem, chest), collar));
    }
  }
  vec3 outc = src;
  outc = mix(outc, ftRecolor(src, ftSkin, ftBase.x), m.r);
  outc = mix(outc, ftRecolor(src, shirtColor, ftBase.y), m.g);
  outc = mix(outc, ftRecolor(src, ftPants, ftBase.z), m.b);
  outc = mix(outc, ftRecolor(src, ftShoe, ftBase.w), m.a);
  diffuseColor.rgb = outc;
}
#endif`);
  };
  material.customProgramCacheKey = () => 'avatar-color-v1';
  mesh.material = material;
}
