import * as THREE from 'three';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
const geo = {
  thigh: cap(0.095, 0.3), shin: cap(0.075, 0.3),
  upperArm: cap(0.07, 0.2), foreArm: cap(0.06, 0.2),
  torso: cap(0.19, 0.3), pelvis: cap(0.17, 0.06),
  head: new THREE.SphereGeometry(0.2, 20, 16), hand: new THREE.SphereGeometry(0.065, 12, 10),
  eye: new THREE.SphereGeometry(0.03, 8, 8),
  foot: new THREE.BoxGeometry(0.14, 0.09, 0.3), brim: new THREE.BoxGeometry(0.26, 0.025, 0.2),
  dome: new THREE.SphereGeometry(0.215, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  bun: new THREE.SphereGeometry(0.09, 12, 10), ice: new THREE.IcosahedronGeometry(1, 1),
  detail: new THREE.SphereGeometry(1, 12, 10),
  skirt: new THREE.CylinderGeometry(0.17, 0.29, 0.34, 16),
  band: new THREE.CylinderGeometry(0.197, 0.197, 0.09, 16),
};

const SKINS = [0xf2c9a5, 0xd9a47c, 0xb97a56, 0x8a5a3c, 0x5e3b27];
const HAIR = [0x2b1b12, 0x6b3f1f, 0xd9b36a, 0x1a1a22, 0xb23a2e, 0x5b7fe0];
export const RUNNER_COLORS = [0x3da9fc, 0x59d98e, 0xffc542, 0xb27cff, 0xff8fb1, 0x2ec4b6, 0xff9f43, 0x8fd14f];
export const SEEKER_COLOR = 0xe5384c;

export const DEFAULT_APPEARANCE = {
  skin: '#d9a47c', hair: '#2b1b12', shirt: '#3da9fc',
  pants: '#24303f', shoe: '#f4f4f4', accent: '#ff9f43', style: 'short', top: 'tee', bottom: 'pants', model: 'custom',
};
export const HAIR_STYLES = ['short', 'side', 'spiky', 'bob', 'long', 'ponytail', 'pigtails', 'buns', 'curly', 'bun', 'cap', 'beanie', 'none'];
export const TOP_STYLES = ['tee', 'striped', 'hoodie', 'jacket'];
export const BOTTOM_STYLES = ['pants', 'shorts', 'skirt'];

export function normalizeAppearance(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_APPEARANCE)) {
    const options = { style: HAIR_STYLES, top: TOP_STYLES, bottom: BOTTOM_STYLES, model: ['custom', 'supplied'] }[key];
    result[key] = options
      ? (options.includes(value[key]) ? value[key] : fallback)
      : (typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key]) ? value[key] : fallback);
  }
  return result;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedural humanoid. Faces +z. Rotation conventions: a hanging limb swings
// forward with negative rotation.x, and a knee/elbow bends with the shin/forearm
// going back/forward respectively.
export class Character {
  constructor({ seed = 0, seeker = false, shirt, appearance } = {}) {
    this.group = new THREE.Group();
    this.seeker = seeker;
    this.custom = Boolean(appearance);
    const rng = mulberry(seed * 9973 + 17);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    this.mats = {
      skin: new THREE.MeshStandardMaterial({ color: pick(SKINS), roughness: 0.7 }),
      shirt: new THREE.MeshStandardMaterial({ color: shirt ?? (seeker ? SEEKER_COLOR : pick(RUNNER_COLORS)), roughness: 0.75 }),
      pants: new THREE.MeshStandardMaterial({ color: pick([0x24303f, 0x3a3a4a, 0x2f4a3a, 0x4a3a2f, 0x1f2a44]), roughness: 0.85 }),
      shoe: new THREE.MeshStandardMaterial({ color: pick([0xf4f4f4, 0x111111, 0xffd23f, 0xff5d5d]), roughness: 0.6 }),
      hair: new THREE.MeshStandardMaterial({ color: pick(HAIR), roughness: 0.9 }),
      accent: new THREE.MeshStandardMaterial({ color: pick(RUNNER_COLORS), roughness: 0.7 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.3 }),
      white: new THREE.MeshStandardMaterial({ color: 0xfff8ef, roughness: 0.5 }),
    };
    if (appearance) {
      const look = normalizeAppearance(appearance);
      for (const key of ['skin', 'hair', 'shirt', 'pants', 'shoe', 'accent']) this.mats[key].color.set(look[key]);
      this.#build(look.style, look.top, look.bottom);
    } else {
      this.#build(seeker ? 'cap' : pick(HAIR_STYLES), pick(TOP_STYLES), pick(BOTTOM_STYLES));
    }
    this.group.scale.setScalar(0.92);
    this.group.traverse((o) => { if (o.isMesh && o !== this.ice) o.castShadow = true; });

    this.phase = rng() * Math.PI * 2;
    this.yaw = 0;
    this.speed = 0;
    this.turnRate = 0;
    this.prevVel = { x: 0, z: 0 };
    this.accel = 0;
    this.t = rng() * 10;
    this.frozenAmt = 0;
    this.reach = 0;
    this.joy = 0;
  }

  #mesh(g, m, parent, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(g, m);
    mesh.userData.shared = true;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  #pivot(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  #build(style, top, bottom) {
    const { skin, shirt, pants, shoe, eye, hair, accent, white } = this.mats;
    this.body = this.#pivot(this.group, 0, 0, 0);
    this.hips = this.#pivot(this.body, 0, 0.98, 0);
    this.#mesh(geo.pelvis, pants, this.hips).rotation.z = Math.PI / 2;
    this.spine = this.#pivot(this.hips, 0, 0.05, 0);
    this.#mesh(geo.torso, shirt, this.spine, 0, 0.3, 0).scale.set(1, 1, 0.68);
    if (top === 'striped') {
      for (const y of [0.2, 0.37]) this.#mesh(geo.band, accent, this.spine, 0, y, 0).scale.z = 0.69;
    } else if (top === 'hoodie') {
      this.#mesh(geo.detail, shirt, this.spine, 0, 0.56, -0.1).scale.set(0.19, 0.18, 0.13);
      this.#mesh(geo.detail, accent, this.spine, 0, 0.22, 0.13).scale.set(0.12, 0.07, 0.025);
    } else if (top === 'jacket') {
      this.#mesh(geo.detail, accent, this.spine, 0, 0.34, 0.133).scale.set(0.018, 0.22, 0.012);
      for (const x of [-0.1, 0.1]) this.#mesh(geo.detail, accent, this.spine, x, 0.22, 0.12).scale.set(0.045, 0.035, 0.015);
    }
    if (bottom === 'skirt') this.#mesh(geo.skirt, pants, this.hips, 0, -0.13, 0);

    this.neck = this.#pivot(this.spine, 0, 0.68, 0);
    const head = this.#mesh(geo.head, skin, this.neck, 0, 0.14, 0);
    head.scale.set(0.96, 1.04, 0.96);
    for (const side of [-1, 1]) {
      this.#mesh(geo.detail, skin, head, side * 0.195, -0.005, 0).scale.set(0.045, 0.064, 0.032);
      this.#mesh(geo.eye, white, head, side * 0.068, 0.015, 0.18).scale.set(1, 0.72, 0.45);
      this.#mesh(geo.detail, eye, head, side * 0.068, 0.015, 0.194).scale.set(0.013, 0.018, 0.009);
      this.#mesh(geo.detail, hair, head, side * 0.068, 0.058, 0.177).scale.set(0.033, 0.007, 0.006);
    }
    this.#mesh(geo.detail, skin, head, 0, -0.025, 0.194).scale.set(0.024, 0.02, 0.018);
    this.#mesh(geo.detail, this.mats.eye, head, 0, -0.078, 0.18).scale.set(0.033, 0.006, 0.004);
    this.#headgear(head, style);

    this.arms = [-1, 1].map((side) => {
      const shoulder = this.#pivot(this.spine, side * 0.27, 0.55, 0);
      this.#mesh(geo.upperArm, shirt, shoulder, 0, -0.17, 0);
      const elbow = this.#pivot(shoulder, 0, -0.34, 0);
      this.#mesh(geo.foreArm, skin, elbow, 0, -0.15, 0);
      this.#mesh(geo.hand, skin, elbow, 0, -0.33, 0);
      return { side, shoulder, elbow };
    });

    this.legs = [-1, 1].map((side) => {
      const hip = this.#pivot(this.hips, side * 0.11, -0.04, 0);
      this.#mesh(geo.thigh, bottom === 'skirt' ? skin : pants, hip, 0, -0.23, 0);
      const knee = this.#pivot(hip, 0, -0.46, 0);
      this.#mesh(geo.shin, bottom === 'pants' ? pants : skin, knee, 0, -0.22, 0);
      const ankle = this.#pivot(knee, 0, -0.45, 0);
      this.#mesh(geo.foot, shoe, ankle, 0, -0.02, 0.07);
      this.#mesh(geo.detail, white, ankle, 0, -0.055, 0.13).scale.set(0.072, 0.018, 0.13);
      return { side, hip, knee, ankle };
    });

    this.ice = new THREE.Mesh(geo.ice, new THREE.MeshPhysicalMaterial({
      color: 0x9eefff, transparent: true, opacity: 0.5, roughness: 0.1,
      emissive: 0x2a8fb0, emissiveIntensity: 0.5, flatShading: true, depthWrite: false,
    }));
    this.ice.position.y = 0.95;
    this.ice.userData.shared = true;
    this.ice.visible = false;
    this.group.add(this.ice);
  }

  #headgear(head, style) {
    const { hair, accent } = this.mats;
    const paint = this.seeker && !this.custom ? this.mats.shirt : accent;
    if (['short', 'side', 'spiky', 'bob', 'long', 'ponytail', 'pigtails', 'buns', 'curly', 'bun'].includes(style)) {
      this.#mesh(geo.dome, hair, head, 0, 0.02, -0.01);
      if (['short', 'side', 'spiky', 'bob', 'long', 'ponytail', 'pigtails'].includes(style)) {
        const fringe = this.#mesh(geo.detail, hair, head, style === 'side' ? 0.05 : 0, 0.12, 0.14);
        fringe.scale.set(0.16, 0.065, 0.065);
        fringe.rotation.z = style === 'side' ? -0.3 : 0;
      }
      if (['bob', 'long'].includes(style)) {
        this.#mesh(geo.detail, hair, head, 0, style === 'long' ? -0.14 : -0.07, -0.11)
          .scale.set(0.21, style === 'long' ? 0.3 : 0.2, 0.12);
      }
      if (style === 'ponytail') this.#mesh(geo.detail, hair, head, 0, -0.04, -0.24).scale.set(0.09, 0.22, 0.1);
      if (style === 'pigtails' || style === 'buns') for (const side of [-1, 1]) {
        this.#mesh(geo.detail, hair, head, side * 0.22, style === 'buns' ? 0.16 : -0.01, -0.06)
          .scale.set(0.1, style === 'buns' ? 0.1 : 0.18, 0.09);
      }
      if (style === 'bun') this.#mesh(geo.bun, hair, head, 0, 0.24, -0.06);
      if (style === 'curly') for (const x of [-0.13, 0, 0.13]) for (const z of [-0.09, 0.06]) {
        this.#mesh(geo.bun, hair, head, x, 0.16, z);
      }
      if (style === 'spiky') for (const x of [-0.11, 0, 0.11]) {
        const tuft = this.#mesh(geo.detail, hair, head, x, 0.21, 0);
        tuft.scale.set(0.06, 0.12, 0.06); tuft.rotation.z = x * -2;
      }
    } else if (style === 'cap') {
      this.#mesh(geo.dome, paint, head, 0, 0.03, 0);
      this.#mesh(geo.brim, paint, head, 0, 0.1, 0.2);
    } else if (style === 'beanie') {
      this.#mesh(geo.dome, paint, head, 0, 0.04, 0).scale.set(1.04, 1.1, 1.04);
    }
  }

  // v: planar velocity {x,z}. state: {frozen, reach, joy, thaw, faceYaw}
  update(dt, v, state = {}) {
    this.t += dt;
    const speed = Math.hypot(v.x, v.z);
    this.speed = damp(this.speed, speed, 18, dt);
    const spd = this.speed;

    if (!state.frozen && speed > 0.4) {
      const d = angleDelta(this.yaw, Math.atan2(v.x, v.z));
      const step = clamp(d, -14 * dt, 14 * dt);
      this.turnRate = damp(this.turnRate, step / Math.max(dt, 1e-4), 14, dt);
      this.yaw += step;
    } else {
      this.turnRate = damp(this.turnRate, 0, 10, dt);
      if (state.faceYaw !== undefined && !state.frozen) this.yaw += clamp(angleDelta(this.yaw, state.faceYaw), -8 * dt, 8 * dt);
    }
    this.group.rotation.y = this.yaw;

    const accel = ((v.x - this.prevVel.x) * Math.sin(this.yaw) + (v.z - this.prevVel.z) * Math.cos(this.yaw)) / Math.max(dt, 1e-4);
    this.accel = damp(this.accel, clamp(accel, -30, 30), 10, dt);
    this.prevVel.x = v.x; this.prevVel.z = v.z;

    this.frozenAmt = damp(this.frozenAmt, state.frozen ? 1 : 0, state.frozen ? 14 : 5, dt);
    this.reach = damp(this.reach, state.reach ?? 0, 9, dt);
    this.joy = damp(this.joy, state.joy ?? 0, 8, dt);
    const thaw = state.thaw ?? 0;

    this.ice.visible = this.frozenAmt > 0.02;
    if (this.ice.visible) {
      const s = lerp(0.2, 1, this.frozenAmt), w = 1 - thaw * 0.18;
      this.ice.scale.set(0.72 * s * w, 1.08 * s, 0.72 * s * w);
      this.ice.material.opacity = 0.18 + 0.4 * this.frozenAmt * (1 - thaw * 0.5);
    }

    if (state.frozen) {
      // Hold the pose captured at the moment of the freeze; only a thaw shiver moves it.
      this.body.position.x = Math.sin(this.t * 60) * thaw * 0.03;
      return;
    }
    this.body.position.x = 0;

    const run = smooth(2.4, 5.6, spd);
    const amt = smooth(0.15, 1.6, spd);
    const idle = 1 - amt;
    this.phase += dt * spd * lerp(4.4, 2.5, run);
    const ph = this.phase;

    // Bob peaks at mid-stance when walking and dips there when running.
    this.hips.position.y = 0.98 - run * 0.07 * amt + Math.cos(2 * ph) * lerp(0.025, -0.045, run) * amt + Math.sin(this.t * 2) * 0.004 * idle;
    this.hips.rotation.y = Math.sin(ph) * lerp(0.1, 0.2, run) * amt;
    this.hips.rotation.z = Math.sin(ph) * 0.05 * amt;

    const lean = clamp(spd / 6) * 0.28 + clamp(this.accel / 30, -0.3, 0.3);
    this.spine.rotation.x = lean + Math.sin(this.t * 1.7) * 0.012 * idle;
    this.spine.rotation.y = -Math.sin(ph) * lerp(0.12, 0.28, run) * amt;
    this.spine.rotation.z = -Math.sin(ph) * 0.04 * amt;
    this.body.rotation.z = clamp(-this.turnRate * 0.022 * clamp(spd / 4), -0.3, 0.3);

    this.neck.rotation.x = -lean * 0.8 + Math.sin(this.t * 0.8) * 0.03 * idle;
    this.neck.rotation.y = -this.spine.rotation.y * 0.6 + Math.sin(this.t * 0.5) * 0.25 * idle;

    const stride = lerp(0.42, 1.0, run) * amt;
    for (const leg of this.legs) {
      const p = ph + (leg.side > 0 ? Math.PI : 0);
      const swing = Math.sin(p);
      const hip = -swing * stride;
      const knee = (0.08 + lerp(0.3, 1.25, run) * Math.max(0, Math.cos(p - 0.15))) * amt + 0.03 * idle;
      leg.hip.rotation.x = hip;
      leg.hip.rotation.z = leg.side * 0.03 * amt;
      leg.knee.rotation.x = knee;
      leg.ankle.rotation.x = -(hip + knee) * 0.85 + Math.max(0, swing) * 0.25 * amt;
    }

    const swingArm = lerp(0.5, 1.1, run) * amt;
    for (const arm of this.arms) {
      const fwd = Math.sin(ph + (arm.side > 0 ? 0 : Math.PI));
      let sx = -fwd * swingArm + Math.sin(this.t * 1.4 + arm.side) * 0.03 * idle;
      let ex = -(0.2 + run * 0.95 + 0.3 * Math.max(0, fwd) * amt);
      let sz = arm.side * (0.07 + 0.08 * idle + 0.1 * run);

      sx = lerp(sx, -1.45 + Math.sin(this.t * 14) * 0.05, this.reach);
      ex = lerp(ex, -0.15, this.reach);
      sz = lerp(sz, arm.side * 0.12, this.reach);
      sx = lerp(sx, -2.9 + Math.sin(this.t * 10 + arm.side) * 0.25, this.joy);
      ex = lerp(ex, -0.2, this.joy);
      sz = lerp(sz, arm.side * 0.35, this.joy);
      arm.shoulder.rotation.x = sx;
      arm.shoulder.rotation.z = sz;
      arm.elbow.rotation.x = ex;
    }
    this.body.position.y = this.joy > 0.01 ? Math.abs(Math.sin(this.t * 9)) * 0.2 * this.joy : 0;
  }
}
