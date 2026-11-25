import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Avatar } from '../docs/js/avatar.js';
import { normalizeAppearance } from '../docs/js/character.js';

test('supplied character uses movement and reaction animations without losing old appearance settings', () => {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
  const names = ['Idle_9', 'Walking', 'Running', 'Alert', 'Stand_Up2', 'Touch_and_Run', 'Victory_Cheer'];
  const asset = {
    scene, bounds: new THREE.Box3().setFromObject(scene), scale: 1,
    animations: names.map((name) => new THREE.AnimationClip(name, 0.5, [])),
  };
  const look = normalizeAppearance({ model: 'supplied', style: 'bun' });
  assert.equal(look.style, 'bun');
  assert.equal(normalizeAppearance({ model: 'invalid' }).model, 'custom');
  const character = new Avatar({ appearance: look }, asset);
  assert.equal(character.current, 'Idle_9');
  character.update(0.1, { x: 1, z: 0 });
  assert.equal(character.current, 'Walking');
  character.update(0.1, { x: 5, z: 0 });
  assert.equal(character.current, 'Running');
  character.update(0.1, { x: 0, z: 0 }, { frozen: true });
  assert.equal(character.current, 'Alert');
  character.update(0.1, { x: 0, z: 0 });
  assert.equal(character.current, 'Stand_Up2');
  character.update(0.6, { x: 0, z: 0 });
  character.update(0.1, { x: 0, z: 0 });
  assert.equal(character.current, 'Idle_9');
  character.update(0.1, { x: 0, z: 0 }, { joy: true });
  assert.equal(character.current, 'Victory_Cheer');
});

test('seeker avatar gets a team marker', () => {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
  const names = ['Idle_9', 'Walking', 'Running', 'Alert', 'Stand_Up2', 'Touch_and_Run', 'Victory_Cheer'];
  const asset = { scene, bounds: new THREE.Box3().setFromObject(scene), scale: 1, animations: names.map((n) => new THREE.AnimationClip(n, 0.5, [])) };
  assert.ok(new Avatar({ seeker: true }, asset).beacon);
  assert.equal(new Avatar({}, asset).beacon, undefined);
});

test('locomotion blends walk and run on a shared stride phase', () => {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
  const names = ['Idle_9', 'Walking', 'Running', 'Alert', 'Stand_Up2', 'Touch_and_Run', 'Victory_Cheer'];
  const asset = { scene, bounds: new THREE.Box3().setFromObject(scene), scale: 1, animations: names.map((n) => new THREE.AnimationClip(n, 1, [])) };
  const character = new Avatar({}, asset);
  for (let i = 0; i < 60; i++) character.update(1 / 60, { x: 3, z: 0 });
  const { Walking, Running, Idle_9 } = character.weights;
  assert.ok(Walking > 0.2 && Running > 0.2 && Idle_9 < 0.01);
  assert.ok(character.stridePhase > 0 && character.stridePhase < 1);
});
