import * as THREE from 'three';
import { HALF } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// Clamp the camera's ground-plane segment before it enters any maze wall.
export function mazeCameraFraction(start, end, rects, padding = 0.25) {
  let closest = 1;
  for (const w of rects) {
    let enter = 0, exit = 1;
    for (const [origin, delta, low, high] of [
      [start.x, end.x - start.x, w.minX - padding, w.maxX + padding],
      [start.z, end.z - start.z, w.minZ - padding, w.maxZ + padding],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (origin < low || origin > high) { enter = 2; break; }
      } else {
        let a = (low - origin) / delta, b = (high - origin) / delta;
        if (a > b) [a, b] = [b, a];
        enter = Math.max(enter, a);
        exit = Math.min(exit, b);
        if (enter > exit) break;
      }
    }
    if (enter <= exit) closest = Math.min(closest, Math.max(0, enter - 0.02));
  }
  return closest;
}

// Third-person orbit camera: smooth follow, velocity look-ahead, speed FOV,
// arena-bounds clamp, and fading of any wall between the lens and the player.
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;        // camera sits at -z, looking toward +z
    this.pitch = 0.62;
    this.dist = 9.5;
    this.focus = new THREE.Vector3();
    this.lookAhead = new THREE.Vector3();
    this.idle = 0;             // seconds since last manual rotation
    this.autoFollow = true;    // separate mode: recentre after idling
    this.mode = 'separate';    // 'separate' | 'follow'
    this.ray = new THREE.Raycaster();
    this.snap = true;
    this.fade = new Map();     // wall mesh -> opacity for this view (walls are shared between split-screen views)
    this.maze = false;
  }

  rotate(dYaw, dPitch) {
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, 0.22, 1.25);
    this.idle = 0;
  }

  zoom(delta) { this.dist = clamp(this.dist + delta, 5, 18); }

  // Direction on the ground the camera looks along.
  get forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  get right() { const f = this.forward; return { x: -f.z, z: f.x }; }

  update(dt, target, vel, heading, world) {
    this.idle += dt;
    const speed = Math.hypot(vel.x, vel.z);

    if (this.mode === 'follow') {
      // Turn with the character. Backing up (nearly 180° off) is ignored so the camera does not spin around.
      if (speed > 0.8) {
        const d = angleDelta(this.yaw, heading + Math.PI);
        if (Math.abs(d) < 2.4) this.yaw += d * (1 - Math.exp(-4.5 * dt));
      }
    } else if (this.autoFollow && this.idle > 1.0 && speed > 1.5) {
      // Separate mode: ease behind the runner only after the player stops steering.
      const want = Math.atan2(-vel.x, -vel.z);
      const d = angleDelta(this.yaw, want);
      if (Math.abs(d) < 2.2) this.yaw += d * (1 - Math.exp(-0.9 * dt));
    }

    if (this.maze) {
      const start = { x: target.x, z: target.z };
      const end = { x: target.x + Math.sin(this.yaw) * 3.5, z: target.z + Math.cos(this.yaw) * 3.5 };
      const fraction = mazeCameraFraction(start, end, world.rects);
      this.camera.position.set(start.x + (end.x - start.x) * fraction, 1.65, start.z + (end.z - start.z) * fraction);
      this.focus.set(target.x, 1.25, target.z);
      this.camera.lookAt(this.focus);
      this.camera.near = 0.05;
      this.camera.fov = 65;
      this.camera.updateProjectionMatrix();
      this.fade.clear();
      this.applyFade(world);
      return;
    }

    this.camera.near = 0.1;
    const la = Math.min(1.6, speed * 0.25);
    const lx = speed > 0.1 ? (vel.x / speed) * la : 0, lz = speed > 0.1 ? (vel.z / speed) * la : 0;
    this.lookAhead.x = damp(this.lookAhead.x, lx, 3, dt);
    this.lookAhead.z = damp(this.lookAhead.z, lz, 3, dt);
    const goal = new THREE.Vector3(target.x + this.lookAhead.x, 1.25, target.z + this.lookAhead.z);
    if (this.snap) { this.focus.copy(goal); this.snap = false; }
    else {
      this.focus.x = damp(this.focus.x, goal.x, 9, dt);
      this.focus.y = damp(this.focus.y, goal.y, 6, dt);
      this.focus.z = damp(this.focus.z, goal.z, 9, dt);
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const pos = new THREE.Vector3(
      this.focus.x + Math.sin(this.yaw) * cp * this.dist,
      this.focus.y + sp * this.dist,
      this.focus.z + Math.cos(this.yaw) * cp * this.dist,
    );
    // The lens may orbit past the perimeter; blocking walls fade instead of pulling the camera in.
    const lim = HALF + 12;
    pos.x = clamp(pos.x, -lim, lim);
    pos.z = clamp(pos.z, -lim, lim);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.focus);

    const fov = 58 + clamp(speed / 6, 0, 1) * 6;
    this.camera.fov = damp(this.camera.fov, fov, 4, dt);
    this.camera.updateProjectionMatrix();

    this.#fadeWalls(dt, world, target);
    this.applyFade(world);
  }

  // Write this view's wall opacities onto the shared materials; call right before rendering the view.
  applyFade(world) {
    for (const m of world.wallMeshes) {
      const next = this.fade.get(m) ?? 1;
      m.material.opacity = next;
      m.children[0].material.opacity = next;
      m.material.depthWrite = next > 0.95;
    }
  }

  #fadeWalls(dt, world, target) {
    const cam = this.camera.position;
    const chest = new THREE.Vector3(target.x, 1.2, target.z);
    const dir = chest.clone().sub(cam);
    const len = dir.length();
    dir.normalize();
    this.ray.set(cam, dir);
    this.ray.far = len;
    const hit = new Set(this.ray.intersectObjects(world.wallMeshes, false).map((h) => h.object));
    for (const m of world.wallMeshes) {
      const b = m.userData.bounds;
      const lensInside = cam.x > b.minX - 0.8 && cam.x < b.maxX + 0.8 && cam.z > b.minZ - 0.8 && cam.z < b.maxZ + 0.8 && cam.y < m.userData.h + 0.8;
      const want = hit.has(m) || lensInside ? 0.16 : 1;
      this.fade.set(m, damp(this.fade.get(m) ?? 1, want, 10, dt));
    }
  }
}
