import * as THREE from 'three';
import { HALF } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

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
    this.autoFollow = true;
    this.ray = new THREE.Raycaster();
    this.snap = true;
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

    // Ease behind the runner's heading when the player is not steering the camera.
    if (this.autoFollow && this.idle > 1.0 && speed > 1.5) {
      const want = Math.atan2(-vel.x, -vel.z);
      const d = angleDelta(this.yaw, want);
      if (Math.abs(d) < 2.2) this.yaw += d * (1 - Math.exp(-0.9 * dt));
    }

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
      const cur = m.material.opacity;
      const next = damp(cur, want, 10, dt);
      m.material.opacity = next;
      m.children[0].material.opacity = next;
      m.material.depthWrite = next > 0.95;
    }
  }
}
