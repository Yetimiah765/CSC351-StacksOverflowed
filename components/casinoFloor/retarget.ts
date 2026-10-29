import * as THREE from 'three';

// Moves an animation made for one skeleton onto another (both Mixamo-style:
// Hips, Spine, LeftUpLeg, ... — with or without the "mixamorig" prefix).
// The two rigs' bones point their local axes differently (each was exported
// by a different tool), so copying rotations bone for bone would twist the
// limbs. Instead both skeletons are put in the same reference pose (a
// T-pose), and each frame every target bone gets the same *world* rotation
// away from that pose as the source bone has — so arms, legs and spine line
// up whatever the rigs' conventions. The hips also take the source's bounce
// and sway, scaled to the target's height.

const baseName = (name: string) => name.replace(/^mixamorig:?/, '');

function bonesByName(root: THREE.Object3D, onlyBones: boolean) {
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((object) => {
    if (onlyBones ? (object as THREE.Bone).isBone : /^mixamorig/.test(object.name)) bones.set(baseName(object.name), object);
  });
  return bones;
}

/**
 * Puts `root` in the first frame of `clip` (or leaves its bind pose when
 * there's none). Set directly rather than through a mixer, which puts the
 * bones back as they were when its action stops.
 */
function pose(root: THREE.Object3D, clip: THREE.AnimationClip | undefined) {
  if (!clip) return;
  for (const track of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const node = root.getObjectByName(nodeName);
    if (!node) continue;
    if (propertyName === 'quaternion') node.quaternion.fromArray(track.values, 0);
    else if (propertyName === 'position') node.position.fromArray(track.values, 0);
    else if (propertyName === 'scale') node.scale.fromArray(track.values, 0);
  }
}

const worldPosition = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3());

/**
 * The turn that makes the source face the same way as the target, from the
 * line across each one's hips (left leg to right leg), seen from above.
 */
function facing(sourceBones: Map<string, THREE.Object3D>, targetBones: Map<string, THREE.Object3D>) {
  const across = (bones: Map<string, THREE.Object3D>) => {
    const line = worldPosition(bones.get('LeftUpLeg')!).sub(worldPosition(bones.get('RightUpLeg')!));
    line.y = 0;
    return line.normalize();
  };
  return new THREE.Quaternion().setFromUnitVectors(across(sourceBones), across(targetBones));
}

/**
 * Bends the target, bone by bone from the hips out, so each bone points the
 * same way as the matching source bone (turned by `turn`) — e.g. an A-pose
 * into the source's T-pose.
 */
function matchPose(order: THREE.Object3D[], sourceBones: Map<string, THREE.Object3D>, turn: THREE.Quaternion) {
  for (const bone of order) {
    const from = sourceBones.get(baseName(bone.name));
    const child = bone.children.find((c) => (c as THREE.Bone).isBone && sourceBones.has(baseName(c.name)));
    if (!from || !child) continue;
    const sourceChild = sourceBones.get(baseName(child.name))!;
    const want = worldPosition(sourceChild).sub(worldPosition(from)).applyQuaternion(turn).normalize();
    const have = worldPosition(child).sub(worldPosition(bone)).normalize();
    if (have.lengthSq() === 0 || want.lengthSq() === 0) continue;
    const bend = new THREE.Quaternion().setFromUnitVectors(have, want);
    const parentWorld = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
    const desired = bend.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.quaternion.copy(parentWorld.invert().multiply(desired));
    bone.updateMatrixWorld(true);
  }
}

export interface RetargetSource {
  /** The source rig (its bones are named mixamorig...). */
  root: THREE.Object3D;
  /** The source in its reference pose (a T-pose). */
  reference: THREE.AnimationClip;
}

export interface RetargetTarget {
  root: THREE.Object3D;
  /** A pose to start the target from (its T-pose, if it has one); the rest is matched to the source. */
  reference?: THREE.AnimationClip;
}

export function retargetClip(source: RetargetSource, target: RetargetTarget, clip: THREE.AnimationClip, fps = 30) {
  const sourceBones = bonesByName(source.root, false);
  const targetBones = bonesByName(target.root, true);
  const hips = targetBones.get('Hips');
  const sourceHips = sourceBones.get('Hips');
  if (!hips || !sourceHips) throw new Error('retargetClip: no Hips bone');

  // Remember the target's bind pose, to put it back afterwards.
  const bind = new Map<THREE.Object3D, [THREE.Quaternion, THREE.Vector3]>();
  for (const bone of targetBones.values()) bind.set(bone, [bone.quaternion.clone(), bone.position.clone()]);

  // Reference poses: world rotations of each bone, and the hips' position.
  pose(source.root, source.reference);
  source.root.updateMatrixWorld(true);
  pose(target.root, target.reference);
  target.root.updateMatrixWorld(true);

  const targetOrder: THREE.Object3D[] = [];
  hips.traverse((object) => {
    if ((object as THREE.Bone).isBone) targetOrder.push(object);
  });
  const turn = facing(sourceBones, targetBones);
  matchPose(targetOrder, sourceBones, turn);
  target.root.updateMatrixWorld(true);

  // A source bone's world rotation, turned to face the target's way.
  const world = (object: THREE.Object3D) => object.getWorldQuaternion(new THREE.Quaternion());
  const sourceWorld = (object: THREE.Object3D) => turn.clone().multiply(world(object));
  const offsets = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const bone of targetOrder) {
    const from = sourceBones.get(baseName(bone.name));
    if (from) offsets.set(bone, sourceWorld(from).invert().multiply(world(bone)));
  }
  const restLocal = new Map(targetOrder.map((bone) => [bone, bone.quaternion.clone()]));
  const hipsParentWorld = hips.parent!.matrixWorld.clone();
  const hipsParentInverse = hipsParentWorld.clone().invert();
  const hipsParentRotation = hips.parent!.getWorldQuaternion(new THREE.Quaternion());
  const sourceHipsRest = sourceHips.getWorldPosition(new THREE.Vector3());
  const targetHipsRest = hips.getWorldPosition(new THREE.Vector3());
  const scale = targetHipsRest.y / sourceHipsRest.y;

  // Play the clip on the source and copy it over a frame at a time.
  const mixer = new THREE.AnimationMixer(source.root);
  mixer.clipAction(clip).play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const rotations = new Map(targetOrder.map((bone) => [bone, new Float32Array(frames * 4)]));
  const hipsPositions = new Float32Array(frames * 3);
  const worldOf = new Map<THREE.Object3D, THREE.Quaternion>();
  const local = new THREE.Quaternion();
  const position = new THREE.Vector3();

  for (let frame = 0; frame < frames; frame++) {
    const time = Math.min(clip.duration, frame / fps);
    times[frame] = time;
    mixer.setTime(time);
    source.root.updateMatrixWorld(true);
    worldOf.clear();
    for (const bone of targetOrder) {
      const parentWorld = worldOf.get(bone.parent!) ?? hipsParentRotation;
      const from = sourceBones.get(baseName(bone.name));
      const desired = from ? sourceWorld(from).multiply(offsets.get(bone)!) : parentWorld.clone().multiply(restLocal.get(bone)!);
      worldOf.set(bone, desired);
      local.copy(parentWorld).invert().multiply(desired);
      local.toArray(rotations.get(bone)!, frame * 4);
    }
    sourceHips.getWorldPosition(position).sub(sourceHipsRest).applyQuaternion(turn).multiplyScalar(scale).add(targetHipsRest);
    position.applyMatrix4(hipsParentInverse).toArray(hipsPositions, frame * 3);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(source.root);
  pose(source.root, source.reference);

  // Leave the target as it was found.
  for (const [bone, [rotation, place]] of bind) {
    bone.quaternion.copy(rotation);
    bone.position.copy(place);
  }

  const tracks: THREE.KeyframeTrack[] = targetOrder.map(
    (bone) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, rotations.get(bone)!)
  );
  tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, hipsPositions));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
