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
