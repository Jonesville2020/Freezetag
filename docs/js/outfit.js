import * as THREE from 'three';

// Shared helpers for dressing the supplied (baked, skinned) character.
// Builders (avatar-color/hair/clothes/accessories.js) all receive the Avatar and
// read avatar.look (a normalized appearance). They are built once in the Avatar
// constructor, before any animation is evaluated, so the model is in its bind pose.

export function findSkinnedMesh(avatar) {
  let found = null;
  avatar.model.traverse((o) => { if (o.isSkinnedMesh && !found) found = o; });
  return found;
}

// Returns an Object3D that follows `boneName`, with 1 unit = 1 metre in the
// character frame (+Y up, +Z forward) at bind pose and the bone origin at (0,0,0).
// Add geometry to it in metres; it animates with the bone.
export function attachToBone(avatar, boneName) {
  avatar.mounts ??= {};
  if (avatar.mounts[boneName]) return avatar.mounts[boneName];
  const bone = avatar.model.getObjectByName(boneName);
  if (!bone) throw new Error(`Missing bone: ${boneName}`);
  avatar.group.updateMatrixWorld(true);
  const relative = new THREE.Matrix4().copy(avatar.group.matrixWorld).invert().multiply(bone.matrixWorld);
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  relative.decompose(position, quaternion, scale);
  const mount = new THREE.Object3D();
  mount.name = `mount-${boneName}`;
  mount.quaternion.copy(quaternion).invert();
  mount.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
  bone.add(mount);
  avatar.mounts[boneName] = mount;
  return mount;
}

// Bind-pose bounding box (metres, character frame) of the skinned vertices whose
// strongest influence is one of `boneNames`. Use it to size hair, hats and accessories.
export function regionBox(avatar, boneNames) {
  const mesh = findSkinnedMesh(avatar);
  const wanted = new Set(boneNames.map((n) => mesh.skeleton.bones.findIndex((b) => b.name === n)));
  const { position } = mesh.geometry.attributes;
  const joints = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
  avatar.group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(avatar.group.matrixWorld).invert().multiply(mesh.matrixWorld);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (weights.getComponent(i, k) > weights.getComponent(i, best)) best = k;
    if (!wanted.has(joints.getComponent(i, best))) continue;
    box.expandByPoint(v.fromBufferAttribute(position, i).applyMatrix4(toGroup));
  }
  return box;
}
