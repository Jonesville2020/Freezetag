import * as THREE from 'three';
import { Navigator } from './nav.js';

export const MONSTER_SPEED = 1.15;
export const MONSTER_DELAY = 12;

export class MazeMonster {
  constructor(start) {
    this.pos = { ...start };
    this.delay = MONSTER_DELAY;
    this.nav = new Navigator();
    this.time = 0;
    this.group = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0xb18ce3, roughness: 0.8 });
    const light = new THREE.MeshStandardMaterial({ color: 0xf1dfff, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x29233b, roughness: 0.5 });
    const sphere = new THREE.SphereGeometry(1, 16, 12);
    const part = (material, position, scale) => {
      const mesh = new THREE.Mesh(sphere, material);
      mesh.position.set(...position); mesh.scale.set(...scale);
      mesh.castShadow = true; this.group.add(mesh);
    };
    part(body, [0, 0.47, 0], [0.48, 0.47, 0.43]);
    part(light, [0, 0.32, 0.36], [0.28, 0.21, 0.07]);
    for (const side of [-1, 1]) {
      part(body, [side * 0.3, 0.85, 0], [0.13, 0.23, 0.12]);
      part(body, [side * 0.3, 0.12, 0.08], [0.16, 0.1, 0.2]);
      part(dark, [side * 0.15, 0.55, 0.39], [0.035, 0.045, 0.025]);
      part(light, [side * 0.16, 0.57, 0.41], [0.012, 0.014, 0.01]);
    }
    part(dark, [0, 0.43, 0.426], [0.055, 0.014, 0.01]);
    this.group.position.set(start.x, 0, start.z);
  }

  update(dt, world, players) {
    this.time += dt;
    this.delay = Math.max(0, this.delay - dt);
    if (this.delay > 0) return [];
    const active = players.filter((player) => !player.escaped && !player.gaveUp && !player.caught);
    if (!active.length) return [];
    const target = active.reduce((best, player) =>
      Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z)
        < Math.hypot(best.pos.x - this.pos.x, best.pos.z - this.pos.z) ? player : best);
    const dir = this.nav.steer(world, this.pos, target.pos, dt);
    this.pos.x += dir.x * MONSTER_SPEED * dt;
    this.pos.z += dir.z * MONSTER_SPEED * dt;
    world.resolve(this.pos, 0.4);
    this.group.position.set(this.pos.x, 0.025 + Math.abs(Math.sin(this.time * 4)) * 0.08, this.pos.z);
    if (dir.x || dir.z) this.group.rotation.y = Math.atan2(dir.x, dir.z);
    return active.filter((player) => Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 0.95
      && !world.blocked(this.pos.x, this.pos.z, player.pos.x, player.pos.z, 0));
  }
}
