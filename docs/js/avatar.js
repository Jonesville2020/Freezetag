import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { clone } from '../vendor/addons/utils/SkeletonUtils.js';
import { Character, normalizeAppearance } from './character.js?v=avatar5';
import { setTints } from './outfit.js?v=avatar5';
import { applyColors } from './avatar-color.js?v=avatar5';
import { buildHair } from './avatar-hair.js?v=avatar5';
import { buildTop, buildBottom } from './avatar-clothes.js?v=avatar5';
import { buildAccessory } from './avatar-accessories.js?v=avatar5';

const LOCOMOTION = ['Idle_9', 'Walking', 'Running'];
const WALK_STRIDE = 1.45, RUN_STRIDE = 2.2, MAX_CADENCE = 1.9, FADE_RATE = 9;
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
    this.look = normalizeAppearance(options.appearance);
    for (const build of [applyColors, buildTop, buildBottom, buildHair, buildAccessory]) build(this);
    this.setSeeker(Boolean(options.seeker));
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = Object.fromEntries(asset.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]));
    this.current = null;
    this.wasFrozen = false;
    this.recovering = false;
    this.stridePhase = 0;
    this.weights = {};
    for (const [name, action] of Object.entries(this.actions)) {
      this.weights[name] = 0;
      action.setEffectiveWeight(0);
      if (LOCOMOTION.includes(name)) { action.play(); action.timeScale = 0; }
    }
    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.actions.Stand_Up2) this.recovering = false;
    });
    this.update(0, { x: 0, z: 0 });
    for (const name of LOCOMOTION) this.weights[name] = name === 'Idle_9' ? 1 : 0;
    this.applyWeights(0);
  }

  // Seekers always wear red: swaps the registered shirt / trim colours in place.
  setSeeker(on) {
    on = Boolean(on);
    if (this.seekerOn === on) return;
    this.seekerOn = on;
    setTints(this, on);
  }

  // Locomotion is blended by speed on a shared stride phase so feet stay in step
  // across idle/walk/run; one-shot reactions fade in over it.
  setShot(name) {
    if (this.shot === name) return;
    if (name) {
      const action = this.actions[name];
      if (!action) throw new Error(`Missing character animation: ${name}`);
      action.reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.enabled = true;
      action.timeScale = 1;
      action.setEffectiveWeight(0);
      action.play();
      this.weights[name] = 0;
    }
    this.shot = name;
  }

  applyWeights(dt) {
    const step = Math.min(1, dt * FADE_RATE);
    const targets = {};
    for (const name of Object.keys(this.actions)) targets[name] = 0;
    if (this.shot) targets[this.shot] = 1;
    const loco = 1 - (this.shot ? 1 : 0);
    const speed = this.moveSpeed;
    const move = smooth(speed, 0.2, 1.0);
    const run = smooth(speed, 2.2, 4.0);
    targets.Idle_9 = loco * (1 - move);
    targets.Walking = loco * move * (1 - run);
    targets.Running = loco * move * run;
    let total = 0;
    for (const name of Object.keys(this.actions)) {
      const w = this.weights[name] += (targets[name] - this.weights[name]) * (dt === 0 ? 1 : step);
      total += w;
    }
    for (const [name, action] of Object.entries(this.actions)) {
      const w = total > 1 ? this.weights[name] / total : this.weights[name];
      action.setEffectiveWeight(w);
      if (!LOCOMOTION.includes(name)) {
        action.enabled = this.shot === name || w > 0.002;
      }
    }
  }

  update(dt, velocity, state = {}) {
    super.update(dt, velocity, state);
    this.wasFrozen = Boolean(state.frozen);
    this.moveSpeed = Math.hypot(velocity.x, velocity.z);
    let shot = null;
    if (state.frozen || state.caught) {
      this.recovering = false;
      shot = 'Alert';
    } else if (state.joy) {
      this.recovering = false;
      shot = 'Victory_Cheer';
    } else if (this.recovering) shot = 'Stand_Up2';
    else if (state.reach) shot = 'Touch_and_Run';
    this.setShot(shot);
    this.current = shot ?? (this.moveSpeed > 3.6 ? 'Running' : this.moveSpeed > 0.25 ? 'Walking' : 'Idle_9');

    // Cadence follows ground speed so feet do not skate; capped so sprints stay readable.
    const run = smooth(this.moveSpeed, 2.2, 4.0);
    const stride = WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * run;
    this.stridePhase = (this.stridePhase + dt * Math.min(this.moveSpeed / stride, MAX_CADENCE)) % 1;
    this.actions.Walking.time = this.stridePhase * this.actions.Walking.getClip().duration;
    this.actions.Running.time = this.stridePhase * this.actions.Running.getClip().duration;
    const idle = this.actions.Idle_9;
    idle.time = (idle.time + dt) % idle.getClip().duration;
    this.applyWeights(dt);
    this.mixer.update(dt);
  }
}
