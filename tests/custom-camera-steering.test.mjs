import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character, DEFAULT_APPEARANCE, normalizeAppearance } from '../docs/js/character.js';
import { ChaseCamera, mazeCameraFraction } from '../docs/js/camera.js';
import { holdDirection } from '../docs/js/steering.js';

test('custom appearance validates saved values and applies colors to a seeker', () => {
  const look = normalizeAppearance({ shirt: '#123456', style: 'bun', pants: 'invalid' });
  assert.equal(look.pants, DEFAULT_APPEARANCE.pants);
  const character = new Character({ seeker: true, appearance: look });
  assert.equal(character.mats.shirt.color.getHexString(), '123456');
  assert.equal(character.mats.pants.color.getHexString(), DEFAULT_APPEARANCE.pants.slice(1));
  assert.equal(normalizeAppearance({ style: 'bad' }).style, 'short');
});

test('maze camera remains below wall height and in front of blocking walls', () => {
  const rect = { minX: -1, maxX: 1, minZ: -3, maxZ: -2 };
  assert.ok(mazeCameraFraction({ x: 0, z: 0 }, { x: 0, z: -5 }, [rect]) < 0.4);
  assert.equal(mazeCameraFraction({ x: 4, z: 0 }, { x: 4, z: -5 }, [rect]), 1);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2.6, 1), new THREE.MeshBasicMaterial({ transparent: true }));
  wall.add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1), new THREE.MeshBasicMaterial({ transparent: true })));
  const world = { rects: [rect], wallMeshes: [wall] };
  const camera = new THREE.PerspectiveCamera();
  const rig = new ChaseCamera(camera);
  rig.maze = true;
  rig.pitch = 1.25;
  rig.dist = 18;
  rig.yaw = Math.PI;
  rig.fade.set(wall, 0.16);
  rig.update(0.016, { x: 0, z: 0 }, { x: 0, z: 0 }, 0, world);
  assert.ok(camera.position.y < 2.6);
  assert.ok(camera.position.z > rect.maxZ);
  assert.equal(wall.material.opacity, 1);
});

test('held steering moves continuously in the indicated camera-relative direction', () => {
  const forward = { x: 0, z: 1 }, right = { x: -1, z: 0 };
  assert.deepEqual(holdDirection({ x: 50, y: 0 }, { x: 50, y: 100 }, forward, right), { x: 0, z: 1, mag: 1 });
  assert.deepEqual(holdDirection({ x: 150, y: 100 }, { x: 50, y: 100 }, forward, right), { x: -1, z: 0, mag: 1 });
  assert.equal(holdDirection({ x: 50, y: 100 }, { x: 50, y: 100 }, forward, right).mag, 0);
});
