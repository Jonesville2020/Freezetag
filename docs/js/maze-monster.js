import * as THREE from 'three';
import { Navigator } from './nav.js';

export const MONSTER_SPEED = 4.9;
export const MONSTER_DELAY = 12;
export const MONSTER_WARNING = 3;
export const LUNGE_REACH = 0.8;
export const LUNGE_TRIGGER = 2.5;
export const LUNGE_DISTANCE = 1.6;
export const WINDUP_TIME = 0.6;
export const LUNGE_TIME = 0.25;
export const RECOVER_TIME = 1.0;
export const SPAWN_TIME = 1.0;
const FLEE_SPEED = 2.5;
const CONTACT_TIME = 0.4;
const LOST_TRACK_TIME = 1.5;
const RADIUS = 0.4;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const AMBER = new THREE.Color(0xffc247), RED = new THREE.Color(0xff2a1f), VIOLET = new THREE.Color(0xb36bff);

// A chunky purple blob that waits, rumbles, pops out of the ground, then hunts the nearest
// player. Fairness: it telegraphs a short lunge, then is slow while recovering, and only
// catches during the lunge or after sustained contact — passing by is safe.
export class MazeMonster {
  constructor(start) {
    this.pos = { ...start };
    this.delay = MONSTER_DELAY;
    this.nav = new Navigator();
    this.time = 0;
    this.state = 'dormant';
    this.stateTime = 0;
    this.warning = 0;
    this.onEvent = null;
    this.heading = 0;
    this.lungeDir = { x: 0, z: 1 };
    this.lungeLeft = 0;
    this.contact = 0;
    this.lastSeen = null;
    this.lost = 0;
    this.stuckClock = 0;
    this.stuckFrom = { ...start };
    this.nudge = 0;
    this.nudgeDir = { x: 0, z: 0 };
    this.speed = 0;
    this.turn = 0;
    this.warned = false;
    this.targetVel = { x: 0, z: 0 };
    this.lastTarget = null;
    this.dust = [];
    this.#build();
    this.group.position.set(start.x, 0, start.z);
    this.model.visible = false;
  }

  #build() {
    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra });
    const body = mat(0x8e5fd6), belly = mat(0xc9a8f2), dark = mat(0x2a1640, { roughness: 0.5 });
    const horn = mat(0xf3e6c4, { roughness: 0.5 }), tooth = mat(0xfff8ec, { roughness: 0.4 });
    this.eyeMat = mat(0xfff3d6, { emissive: AMBER.clone(), emissiveIntensity: 0.9, roughness: 0.3 });
    const sphere = (m, r, pos, scale, parent) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), m);
      mesh.position.set(...pos); mesh.scale.set(...scale); mesh.castShadow = true;
      parent.add(mesh); return mesh;
    };
    this.group = new THREE.Group();
    this.fx = new THREE.Group();
    this.model = new THREE.Group();
    this.group.add(this.fx, this.model);

    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 28), new THREE.MeshBasicMaterial({ color: 0x120a1c, transparent: true, opacity: 0.3, depthWrite: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), new THREE.MeshBasicMaterial({ color: 0xb36bff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    for (const m of [this.shadow, this.ring]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.03; this.fx.add(m); }

    this.rig = new THREE.Group();
    this.model.add(this.rig);
    this.torso = new THREE.Group();
    this.torso.position.y = 0.72;
    this.rig.add(this.torso);
    const T = this.torso;
    sphere(body, 0.6, [0, 0, 0], [1, 0.95, 0.92], T);
    sphere(belly, 0.45, [0, -0.1, 0.27], [1, 0.9, 0.7], T);
    sphere(body, 0.18, [0, 0.1, -0.52], [1, 1, 1.2], T);

    for (const s of [-1, 1]) {
      const eye = sphere(this.eyeMat, 0.17, [s * 0.24, 0.2, 0.46], [1, 1.1, 0.7], T);
      eye.rotation.y = s * 0.25;
      sphere(dark, 0.075, [s * 0.25, 0.2, 0.6], [1, 1.3, 0.5], T);
      const brow = sphere(dark, 0.14, [s * 0.26, 0.42, 0.42], [1.2, 0.22, 0.6], T);
      brow.rotation.z = s * -0.35;
      const hornMesh = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 14), horn);
      hornMesh.position.set(s * 0.36, 0.55, 0.02); hornMesh.rotation.z = -s * 0.42; hornMesh.castShadow = true;
      T.add(hornMesh);
      const ear = sphere(body, 0.12, [s * 0.58, 0.28, -0.05], [0.5, 1, 0.8], T);
      ear.rotation.z = -s * 0.4;
    }

    this.mouth = new THREE.Group();
    this.mouth.position.set(0, -0.12, 0.5);
    T.add(this.mouth);
    sphere(dark, 0.3, [0, 0, 0], [1.05, 0.5, 0.35], this.mouth);
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 0.095, edge = 1 - Math.abs(i - 2.5) / 6;
      for (const up of [1, -1]) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 8), tooth);
        t.position.set(x, up * (0.115 * edge + 0.02), 0.09); t.rotation.x = up > 0 ? Math.PI : 0; t.castShadow = true;
        this.mouth.add(t);
      }
    }

    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.58, 0, 0.05);
      T.add(pivot);
      sphere(body, 0.13, [s * 0.06, -0.14, 0], [1, 1.5, 1], pivot);
      sphere(belly, 0.1, [s * 0.08, -0.3, 0.02], [1, 0.9, 1], pivot);
      pivot.userData.side = s;
      return pivot;
    });
    this.legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.26, 0.3, 0);
      this.rig.add(pivot);
      sphere(body, 0.15, [0, -0.1, 0], [1, 1.3, 1], pivot);
      sphere(dark, 0.17, [0, -0.25, 0.08], [1, 0.55, 1.4], pivot);
      return pivot;
    });
  }

  #emit(kind) { this.onEvent?.(kind, this.pos); }

  #setState(state) { this.state = state; this.stateTime = 0; }

  #puff(count) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xc9b9a0, transparent: true, opacity: 0.6, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 1.4;
      mesh.position.set(Math.cos(a) * 0.4, 0.15, Math.sin(a) * 0.4);
      this.fx.add(mesh);
      this.dust.push({ mesh, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life: 0.7 + Math.random() * 0.4, age: 0 });
    }
  }

  #turnToward(target, dt, rate) {
    const diff = angleDiff(target, this.heading), step = rate * dt;
    this.turn = Math.max(-1, Math.min(1, diff / 0.8));
    return this.heading + Math.max(-step, Math.min(step, diff));
  }

  update(dt, world, players) {
    this.time += dt;
    this.stateTime += dt;
    if (this.state === 'dormant') {
      this.delay = Math.max(0, this.delay - dt);
      this.warning = this.delay < MONSTER_WARNING ? clamp01(1 - this.delay / MONSTER_WARNING) : 0;
      if (this.warning > 0 && !this.warned) { this.warned = true; this.#emit('rumble'); }
      if (this.delay > 0) { this.#animate(dt, 0); return []; }
      this.#setState('spawn');
      this.model.visible = true;
      this.#puff(14);
      this.#emit('spawn');
    }
    const active = players.filter((player) => !player.escaped && !player.gaveUp && !player.caught);
    const target = active.length
      ? active.reduce((best, player) => dist(player.pos, this.pos) < dist(best.pos, this.pos) ? player : best)
      : null;
    if (target && this.lastTarget?.player === target && dt > 0) {
      const k = Math.min(1, dt * 6);
      this.targetVel.x = lerp(this.targetVel.x, (target.pos.x - this.lastTarget.x) / dt, k);
      this.targetVel.z = lerp(this.targetVel.z, (target.pos.z - this.lastTarget.z) / dt, k);
    } else this.targetVel = { x: 0, z: 0 };
    this.lastTarget = target ? { player: target, x: target.pos.x, z: target.pos.z } : null;
    const caught = [];
    const before = { x: this.pos.x, z: this.pos.z };
    const sees = target && !world.blocked(this.pos.x, this.pos.z, target.pos.x, target.pos.z, 0.3);
    const d = target ? dist(target.pos, this.pos) : Infinity;
    let move = { x: 0, z: 0 }, speed = 0;

    if (this.state === 'spawn') {
      this.warning = clamp01(1 - this.stateTime / SPAWN_TIME);
      if (this.stateTime >= SPAWN_TIME) this.#setState('chase');
    } else if (this.state === 'chase') {
      this.warning = 0;
      if (sees) { this.lastSeen = { x: target.pos.x, z: target.pos.z }; this.lost = 0; } else this.lost += dt;
      // A player clearly running away is chased down rather than lunged at.
      const away = target ? (this.targetVel.x * (target.pos.x - this.pos.x) + this.targetVel.z * (target.pos.z - this.pos.z)) / (d || 1) : 0;
      if (target && sees && d < LUNGE_TRIGGER && away < FLEE_SPEED) {
        this.#setState('windup');
        this.#emit('windup');
      } else if (target) {
        const goal = !sees && this.lastSeen && this.lost < LOST_TRACK_TIME ? this.lastSeen : target.pos;
        move = this.nav.steer(world, this.pos, goal, dt);
        speed = MONSTER_SPEED * (sees ? 1 : 0.85);
        if (sees && d < LUNGE_REACH) {
          this.contact += dt;
          if (this.contact >= CONTACT_TIME) caught.push(target);
        } else this.contact = Math.max(0, this.contact - dt * 2);
      }
    } else if (this.state === 'windup') {
      if (target) {
        const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
        this.heading = this.#turnToward(Math.atan2(dx, dz), dt, 9);
        this.lungeDir = { x: dx / l, z: dz / l };
      }
      move = this.lungeDir; speed = 0.35;
      if (this.stateTime >= WINDUP_TIME) {
        this.#setState('lunge');
        this.lungeLeft = LUNGE_DISTANCE;
        this.heading = Math.atan2(this.lungeDir.x, this.lungeDir.z);
        this.#emit('lunge');
      }
    } else if (this.state === 'lunge') {
      move = this.lungeDir; speed = LUNGE_DISTANCE / LUNGE_TIME;
      if (target && sees && d < LUNGE_REACH) caught.push(target);
      if (this.stateTime >= LUNGE_TIME || this.lungeLeft <= 0) { this.#setState('recover'); this.contact = 0; }
    } else if (this.state === 'recover') {
      if (target) { move = this.nav.steer(world, this.pos, target.pos, dt); speed = 0.9; }
      if (this.stateTime >= RECOVER_TIME) this.#setState('chase');
    }

    if ((this.state === 'chase' || this.state === 'recover') && (move.x || move.z)) {
      this.heading = this.#turnToward(Math.atan2(move.x, move.z), dt, 12);
    }
    if (this.nudge > 0) {
      this.nudge -= dt;
      move = this.nudgeDir; speed = MONSTER_SPEED * 0.8;
    }
    let step = speed * dt;
    if (this.state === 'lunge') step = Math.min(step, this.lungeLeft);
    this.pos.x += move.x * step;
    this.pos.z += move.z * step;
    world.resolve(this.pos, RADIUS);
    if (this.state === 'lunge') this.lungeLeft -= Math.hypot(this.pos.x - before.x, this.pos.z - before.z);

    if (this.state === 'chase' && target && d > 1.5) {
      this.stuckClock += dt;
      if (this.stuckClock >= 0.5) {
        if (dist(this.pos, this.stuckFrom) < 0.35 * MONSTER_SPEED * 0.5) {
          const a = Math.atan2(move.z, move.x) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
          this.nudgeDir = { x: Math.cos(a), z: Math.sin(a) };
          this.nudge = 0.3;
          this.nav.reset();
        }
        this.stuckClock = 0; this.stuckFrom = { x: this.pos.x, z: this.pos.z };
      }
    } else { this.stuckClock = 0; this.stuckFrom = { x: this.pos.x, z: this.pos.z }; }

    this.#animate(dt, dt > 0 ? dist(this.pos, before) / dt : 0);
    return caught;
  }

  #animate(dt, actual) {
    const t = this.time, state = this.state;
    this.speed = lerp(this.speed, actual, Math.min(1, dt * 10));
    this.group.position.set(this.pos.x, 0, this.pos.z);
    if (state === 'dormant') this.group.position.x += Math.sin(t * 60) * 0.03 * this.warning;
    this.group.rotation.y = this.heading;

    let sx = 1, sy = 1, sz = 1, bob = 0, lean = 0, roll = 0, swing = 0, armUp = 0, mouth = 0.3, wobble = 0;
    const run = clamp01(this.speed / MONSTER_SPEED);
    const breathe = Math.sin(t * 2.6);
    if (state === 'chase' || state === 'spawn') {
      const phase = t * 11;
      swing = Math.sin(phase) * 0.9 * run;
      bob = Math.abs(Math.sin(phase)) * 0.14 * run;
      sy = 1 + Math.cos(phase * 2) * 0.06 * run + breathe * 0.025 * (1 - run);
      sx = sz = 1 / Math.sqrt(sy);
      lean = 0.2 * run;
      roll = -this.turn * 0.22 * run;
      armUp = Math.sin(phase + Math.PI) * 0.8 * run;
      mouth = 0.3 + 0.1 * Math.abs(Math.sin(phase));
    } else if (state === 'windup') {
      const k = clamp01(this.stateTime / WINDUP_TIME);
      sy = 1 - 0.3 * k; sx = sz = 1 + 0.18 * k;
      bob = -0.1 * k; lean = -0.35 * k;
      armUp = -1.6 * k + Math.sin(t * 50) * 0.1 * k;
      mouth = 0.3 + 0.6 * k;
      wobble = Math.sin(t * 45) * 0.04 * k;
    } else if (state === 'lunge') {
      const k = clamp01(this.stateTime / LUNGE_TIME);
      sy = 0.78; sz = 1.45; sx = 0.85;
      bob = 0.2 * Math.sin(k * Math.PI); lean = 0.5; armUp = -2.3; swing = -0.9; mouth = 1;
    } else if (state === 'recover') {
      const k = clamp01(this.stateTime / RECOVER_TIME);
      sy = 1 - 0.12 * (1 - k) + breathe * 0.03; sx = sz = 1 / Math.sqrt(sy);
      roll = Math.sin(t * 9) * 0.28 * (1 - k * 0.5);
      lean = 0.15 * Math.sin(t * 5); armUp = Math.sin(t * 9) * 0.5; swing = Math.sin(t * 7) * 0.25; mouth = 0.15;
    } else {
      sy = 1 + breathe * 0.03; sx = sz = 1 / Math.sqrt(sy);
    }
    let pop = 1, sink = 0;
    if (state === 'spawn') {
      const k = clamp01(this.stateTime / SPAWN_TIME);
      pop = k < 0.7 ? 1.15 * Math.sin(k / 0.7 * Math.PI / 2) : lerp(1.15, 1, (k - 0.7) / 0.3);
      sy *= 1 + 0.25 * Math.sin(k * Math.PI);
      sink = (1 - Math.min(1, k * 1.6)) * 1.3;
    }
    this.model.scale.setScalar(Math.max(0.001, pop));
    this.rig.position.y = bob - sink;
    this.torso.scale.set(sx, sy, sz);
    this.torso.rotation.set(lean, 0, roll + wobble);
    this.torso.position.y = 0.72 * (0.5 + 0.5 * sy);
    this.legs.forEach((leg, i) => { leg.rotation.x = swing * (i ? -1 : 1); });
    this.arms.forEach((arm, i) => {
      arm.rotation.x = armUp * (i ? -1 : 1);
      arm.rotation.z = -arm.userData.side * (0.25 + (state === 'windup' ? 0.5 : 0) + Math.abs(armUp) * 0.15);
    });
    this.mouth.scale.set(1, 0.6 + mouth * 1.3, 1);

    const danger = state === 'windup' ? clamp01(this.stateTime / WINDUP_TIME) : state === 'lunge' ? 1 : 0;
    this.eyeMat.emissive.copy(AMBER).lerp(RED, danger);
    this.eyeMat.emissiveIntensity = 0.8 + danger * 1.6 + (state === 'windup' ? Math.sin(t * 40) * 0.3 : 0);
    this.eyeMat.color.setRGB(1, 0.95 - danger * 0.55, 0.84 - danger * 0.65);

    this.shadow.visible = this.model.visible;
    this.shadow.scale.setScalar((0.95 + 0.1 * breathe) * (1 - Math.min(0.35, bob)) * (state === 'lunge' ? 1.3 : 1) * pop);
    const ringBase = state === 'dormant' ? this.warning * 0.55 : state === 'spawn' ? this.warning * 0.5 : danger * 0.35 + 0.12;
    this.ring.material.opacity = ringBase * (0.75 + 0.25 * Math.sin(t * (state === 'dormant' ? 14 : 5)));
    this.ring.material.color.copy(VIOLET).lerp(RED, danger);
    this.ring.scale.setScalar(state === 'dormant' ? 0.6 + this.warning * 0.8 : 1 + 0.08 * Math.sin(t * 5) + danger * 0.15);

    for (let i = this.dust.length - 1; i >= 0; i--) {
      const p = this.dust[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this.fx.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); this.dust.splice(i, 1); continue;
      }
      p.mesh.position.x += p.vx * dt * (1 - k); p.mesh.position.z += p.vz * dt * (1 - k);
      p.mesh.position.y += dt * 0.9;
      p.mesh.scale.setScalar(0.6 + k * 1.8);
      p.mesh.material.opacity = 0.6 * (1 - k);
    }
  }
}
