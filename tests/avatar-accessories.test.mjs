import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildAccessory } from '../docs/js/avatar-accessories.js';

function fakeAvatar(accessory) {
  const group = new THREE.Group();
  const model = new THREE.Group();
  const names = ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand'];
  let parent = model;
  names.forEach((name, i) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(0, i === 0 ? 0.9 : 0.1, 0);
    parent.add(bone);
    parent = bone;
  });
  group.add(model);
  const avatar = { group, model, look: { accessory, accent: '#ff9f43' }, t: 0 };
  buildAccessory(avatar);
  return avatar;
}

test('accessories tolerate a model without a skeleton', () => {
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);
  for (const accessory of ['glasses', 'backpack', 'scarf', 'wristbands', 'cape', 'none']) {
    assert.doesNotThrow(() => buildAccessory({ group, model, look: { accessory, accent: '#fff' } }));
  }
});

test('cape stays finite and inextensible for any frame time and speed', () => {
  const avatar = fakeAvatar('cape');
  let cape = null;
  avatar.group.traverse((o) => { if (o.o?.rows === 9) cape = o; });
  assert.ok(cape, 'cape cloth exists');
  const { rows, length } = cape.o;
  const col = cape.o.cols / 2;
  const pos = cape.geometry.attributes.position;
  for (const dt of [1 / 60, 0.001, 0.05, 0.5, 5, 1 / 240]) {
    for (let i = 0; i < 120; i++) {
      avatar.t += dt;
      avatar.group.position.z += (i % 40 < 20 ? 6 : 0) * dt;
      avatar.group.updateMatrixWorld(true);
      let total = 0;
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      for (let r = 0; r < rows; r++) {
        a.fromBufferAttribute(pos, r * (cape.o.cols + 1) + col);
        b.fromBufferAttribute(pos, (r + 1) * (cape.o.cols + 1) + col);
        assert.ok(Number.isFinite(a.x + a.y + a.z));
        total += a.distanceTo(b);
      }
      assert.ok(Math.abs(total - length) < length * 0.08, `length ${total} (dt ${dt})`);
    }
  }
});

test('cape lifts backwards when running and hangs behind the back at rest', () => {
  const avatar = fakeAvatar('cape');
  let cape = null;
  avatar.group.traverse((o) => { if (o.o?.rows === 9) cape = o; });
  const tip = () => new THREE.Vector3().fromBufferAttribute(cape.geometry.attributes.position, 9 * 9 + 4);
  const step = (speed) => {
    for (let i = 0; i < 90; i++) { avatar.t += 1 / 60; avatar.group.position.z += speed / 60; avatar.group.updateMatrixWorld(true); }
  };
  step(0);
  const idle = tip();
  assert.ok(idle.y < -0.6 && idle.z <= 0.02, 'hangs down without folding into the body');
  step(6);
  const run = tip();
  assert.ok(run.z < idle.z - 0.25 && run.y > idle.y + 0.1, 'streams backwards at speed');
});
