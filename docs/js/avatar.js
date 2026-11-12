import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { clone } from '../vendor/addons/utils/SkeletonUtils.js';
import { Character } from './character.js?v=avatar';

let avatarPromise;
export function loadAvatar() {
  if (!avatarPromise) {
    avatarPromise = new GLTFLoader().loadAsync(new URL('../assets/character.glb', import.meta.url).href)
      .then((asset) => {
        const bounds = new THREE.Box3().setFromObject(asset.scene);
        const height = bounds.max.y - bounds.min.y;
        if (!height || !Number.isFinite(height)) throw new Error('Character model has invalid dimensions.');
        return { ...asset, bounds, scale: 1.7 / height };
      })
      .catch((error) => { avatarPromise = null; throw error; });
  }
  return avatarPromise;
}

export class Avatar extends Character {
  constructor(options, asset) {
    super(options);
    this.body.visible = false;
    this.model = clone(asset.scene);
    this.model.scale.setScalar(asset.scale);
    this.model.position.set(
      -(asset.bounds.min.x + asset.bounds.max.x) * asset.scale / 2,
      -asset.bounds.min.y * asset.scale,
      -(asset.bounds.min.z + asset.bounds.max.z) * asset.scale / 2,
    );
    this.model.traverse((object) => {
      if (object.isMesh) {
        object.userData.shared = true;
        object.castShadow = true;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          material.userData.avatarShared = true;
        }
      }
    });
    this.group.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = Object.fromEntries(asset.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]));
    this.current = null;
    this.wasFrozen = false;
    this.recovering = false;
    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.actions.Stand_Up2) this.recovering = false;
    });
    this.update(0, { x: 0, z: 0 });
  }

  play(name, once = false) {
    if (this.current === name) return;
    const next = this.actions[name];
    if (!next) throw new Error(`Missing character animation: ${name}`);
    const previous = this.current && this.actions[this.current];
    next.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.play();
    if (previous) { previous.crossFadeTo(next, 0.15, false); }
    this.current = name;
  }

  update(dt, velocity, state = {}) {
    super.update(dt, velocity, state);
    if (this.wasFrozen && !state.frozen) this.recovering = true;
    this.wasFrozen = Boolean(state.frozen);
    if (state.frozen || state.caught) {
      this.recovering = false;
      this.play('Alert', true);
    } else if (state.joy) {
      this.recovering = false;
      this.play('Victory_Cheer', true);
    } else if (this.recovering) {
      this.play('Stand_Up2', true);
    } else if (state.reach) {
      this.play('Touch_and_Run', true);
    } else {
      const speed = Math.hypot(velocity.x, velocity.z);
      this.play(speed > 3.6 ? 'Running' : speed > 0.25 ? 'Walking' : 'Idle_9');
    }
    this.mixer.update(dt);
  }
}
