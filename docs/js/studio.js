import * as THREE from 'three';
import { Character, normalizeAppearance } from './character.js?v=avatar';
import { Avatar, loadAvatar } from './avatar.js?v=avatar';

export class CharacterStudio {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(230, 190, false);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xdff4ff, 0x4a4158, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(3, 5, 5);
    this.scene.add(light);
    this.camera = new THREE.PerspectiveCamera(32, 230 / 190, 0.1, 20);
    this.camera.position.set(1.4, 1.6, 3.7);
    this.camera.lookAt(0, 0.95, 0);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.12, 32),
      new THREE.MeshStandardMaterial({ color: 0x25445a, roughness: 0.65 }));
    platform.position.y = -0.07;
    this.scene.add(platform);
  }

  async show(appearance) {
    const request = this.request = (this.request ?? 0) + 1;
    if (this.character) {
      this.scene.remove(this.character.group);
      this.character.group.traverse((object) => { if (object.isSkinnedMesh) object.skeleton.dispose(); });
      for (const material of Object.values(this.character.mats)) material.dispose();
      this.character.ice.material.dispose();
      this.character = null;
    }
    const look = normalizeAppearance(appearance);
    let asset;
    if (look.model === 'supplied') {
      document.getElementById('avatar-status').textContent = 'Loading the new character…';
      try { asset = await loadAvatar(); }
      catch (error) {
        if (request === this.request) document.getElementById('avatar-status').textContent = 'Character could not load. Check your connection and try again.';
        console.error('Character preview failed:', error);
        return;
      }
      if (request !== this.request) return;
      document.getElementById('avatar-status').textContent = '';
    } else document.getElementById('avatar-status').textContent = '';
    if (request !== this.request) return;
    this.character = asset ? new Avatar({ appearance: look }, asset) : new Character({ appearance: look });
    this.scene.add(this.character.group);
    this.character.update(1 / 60, { x: 0, z: 0 });
    this.renderer.render(this.scene, this.camera);
  }
}
