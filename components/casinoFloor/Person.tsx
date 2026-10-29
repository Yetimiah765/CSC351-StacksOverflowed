'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { compileInBackground } from './compile';
import { retargetClip } from './retarget';

// A person on the 3D casino floor, standing on the origin and facing +z: a
// rigged, textured human model (public/models/) moved by motion-captured
// idle, walk and run clips. The player is the Mixamo character "Michelle";
// the dealers and the shopkeeper are a Ready Player Me avatar in a suit
// (both from the three.js examples). The clips come from a third rig
// (moves.glb, the three.js Soldier's animations with its mesh removed), so
// retarget.ts maps them onto each body — every bone gets the same world
// rotation as the source's, so limbs line up whatever the rig.
//
// The clips blend by `motion.speed` (metres a second): idle, walk, run, each
// played at the rate that matches the feet to the ground so nobody skates.

const MODELS = { player: '/models/player.glb', staff: '/models/staff.glb' } as const;
/** Michelle is modelled about 1.55 m tall; brought up to an average height. */
const SCALE: Record<keyof typeof MODELS, number> = { player: 1.1, staff: 1 };
const MOVES = '/models/moves.glb';

export type Who = keyof typeof MODELS;

export interface Motion {
  speed: number;
}

/** How fast each clip carries a person at its normal rate, metres a second. */
const WALK_CLIP_SPEED = 1.4;
const RUN_CLIP_SPEED = 3.6;
/** Between these speeds the walk blends into the run. */
const RUN_BLEND: [number, number] = [1.8, 3];

type Clips = Record<'idle' | 'walk' | 'run' | 'stand', THREE.AnimationClip>;
const clipCache = new Map<Who, Clips>();

function useClips(who: Who): Clips {
  const model = useGLTF(MODELS[who]);
  const moves = useGLTF(MOVES);
  return useMemo(() => {
    const cached = clipCache.get(who);
    if (cached) return cached;
    const find = (clips: THREE.AnimationClip[], name: string) => clips.find((clip) => clip.name === name);
    const source = { root: moves.scene, reference: find(moves.animations, 'TPose')! };
    const target = { root: model.scene, reference: find(model.animations, 'TPose') };
    const clips: Clips = {
      idle: retargetClip(source, target, find(moves.animations, 'Idle')!),
      walk: retargetClip(source, target, find(moves.animations, 'Walk')!),
      run: retargetClip(source, target, find(moves.animations, 'Run')!),
      // Standing straight and square: the base of the dealer's pose.
      stand: retargetClip(source, target, find(moves.animations, 'TPose')!),
    };
    clipCache.set(who, clips);
    return clips;
  }, [who, model, moves]);
}

interface PersonProps {
  who: Who;
  /** Live speed, read every frame; leave out for someone who stands still. */
  motion?: MutableRefObject<Motion>;
  /** Puts idle people out of step with each other. */
  idleOffset?: number;
  /**
   * `idle` is the motion-captured idle (and walk); `dealer` stands square
   * behind the table, leaning in a little with both hands resting on it,
   * breathing, shifting their weight and looking along the players.
   */
  pose?: 'idle' | 'dealer';
  /** For a dealer: where the hands rest — the height of the table top, and how far in front, metres. */
  hands?: { y: number; z: number };
  /** For the player: how far they've sat down (read every frame), and where the table top is from the seat. */
  seat?: MutableRefObject<SeatPose>;
}

export interface SeatPose {
  /** 0 standing (the clips), 1 sitting; in between blends the two. */
  amount: number;
  /** The table top: how high, and how far in front of the seat, metres. */
  handsY: number;
  handsZ: number;
}

/** How high the hip joints sit above the floor, sitting on a casino chair (its seat is about 0.5 m up), metres. */
const SEAT_HIP_HEIGHT = 0.6;

/** How far apart a dealer's hands rest, from the middle, metres. */
const DEALER_HANDS_APART = 0.19;
/** Which way a dealer's elbows point, in the body's own space (left arm; +x is their left): out and back. */
const DEALER_ELBOW = new THREE.Vector3(0.55, -0.15, -0.8);

const scratch = {
  have: new THREE.Vector3(),
  at: new THREE.Vector3(),
  want: new THREE.Vector3(),
  bend: new THREE.Quaternion(),
  world: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
};

/** Turns `bone` by `angle` about `axis` (world space); positive is anticlockwise looking down the axis. */
function turnAbout(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  const { bend, world, parent } = scratch;
  bend.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(world).premultiply(bend);
  bone.parent!.getWorldQuaternion(parent).invert();
  bone.quaternion.copy(parent.multiply(world));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone reach: bends the arm (`upper` → `fore` → `hand`) so the wrist
 * lands on `target` (world space), the elbow bending towards `pole`. If the
 * target is out of reach the arm reaches towards it, elbow still a little bent.
 */
function reach(upper: THREE.Object3D, fore: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
  const shoulder = upper.getWorldPosition(new THREE.Vector3());
  const elbowNow = fore.getWorldPosition(new THREE.Vector3());
  const a = shoulder.distanceTo(elbowNow);
  const b = elbowNow.distanceTo(hand.getWorldPosition(new THREE.Vector3()));
  const toTarget = target.clone().sub(shoulder);
  // Never quite straight: an arm locked out looks stiff.
  const d = THREE.MathUtils.clamp(toTarget.length(), 0.05, (a + b) * 0.97);
  const along = toTarget.normalize();
  const cos = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sideways = pole.clone().addScaledVector(along, -pole.dot(along)).normalize();
  const elbow = shoulder
    .clone()
    .addScaledVector(along, a * cos)
    .addScaledVector(sideways, a * Math.sqrt(1 - cos * cos));
  aim(upper, fore, elbow.sub(shoulder));
  aim(fore, hand, target.clone().sub(fore.getWorldPosition(new THREE.Vector3())));
}

/**
 * Lays a hand flat, palm down: points it along `forward` (world space), then
 * rolls the forearm until the knuckles run level across it, index finger on
 * the inside (`mirror` 1 for the left hand, -1 for the right).
 */
function palmDown(
  fore: THREE.Object3D,
  hand: THREE.Object3D,
  middle: THREE.Object3D,
  index: THREE.Object3D | undefined,
  pinky: THREE.Object3D | undefined,
  forward: THREE.Vector3,
  up: THREE.Vector3,
  mirror: number
) {
  aim(hand, middle, forward);
  if (!index || !pinky) return;
  for (let pass = 0; pass < 2; pass++) {
    const along = middle.getWorldPosition(new THREE.Vector3()).sub(hand.getWorldPosition(new THREE.Vector3())).normalize();
    const across = pinky.getWorldPosition(new THREE.Vector3()).sub(index.getWorldPosition(new THREE.Vector3()));
    across.addScaledVector(along, -across.dot(along)).normalize();
    const want = new THREE.Vector3().crossVectors(up, along).multiplyScalar(mirror).normalize();
    const angle = Math.atan2(along.dot(new THREE.Vector3().crossVectors(across, want)), across.dot(want));
    if (pass === 0) {
      // Most of the roll in the forearm, about its own length, as a real arm turns over.
      const forearm = hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
      turnAbout(fore, forearm, angle * Math.sign(forearm.dot(along) || 1));
    } else {
      turnAbout(hand, along, angle);
    }
    aim(hand, middle, forward);
  }
}

/** Turns `bone` so that it points from itself to `child` along `direction` (world space). */
function aim(bone: THREE.Object3D, child: THREE.Object3D, direction: THREE.Vector3) {
  const { have, at, want, bend, world, parent } = scratch;
  have.copy(child.getWorldPosition(have)).sub(bone.getWorldPosition(at)).normalize();
  want.copy(direction).normalize();
  bend.setFromUnitVectors(have, want);
  bone.getWorldQuaternion(world).premultiply(bend);
  bone.parent!.getWorldQuaternion(parent).invert();
  bone.quaternion.copy(parent.multiply(world));
  bone.updateMatrixWorld(true);
}

/** The room shows straight away; each person appears once their model has loaded. */
export default function Person(props: PersonProps) {
  return (
    <Suspense fallback={null}>
      <Body {...props} />
    </Suspense>
  );
}

function Body({ who, motion, idleOffset = 0, pose = 'idle', hands = { y: 0.9, z: 0.36 }, seat }: PersonProps) {
  const { scene } = useGLTF(MODELS[who]);
  const clips = useClips(who);

  const body = useMemo(() => {
    const copy = clone(scene);
    copy.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      // A skinned body moves away from its bind-pose bounds.
      mesh.frustumCulled = false;
      // The staff avatar comes with a cowboy hat; not at this casino.
      const material = mesh.material as THREE.Material;
      if (material.name === 'Wolf3D_Headwear') mesh.visible = false;
    });
    return copy;
  }, [scene]);

  // The bones the dealer's pose moves, by name without the Mixamo prefix.
  const bones = useMemo(() => {
    const found = new Map<string, THREE.Object3D>();
    body.traverse((object) => {
      if ((object as THREE.Bone).isBone) found.set(object.name.replace(/^mixamorig:?/, ''), object);
    });
    return found;
  }, [body]);

  // Compile the body's shaders in the background, and show it once they're ready.
  const { gl, camera, scene: world } = useThree();
  useEffect(() => {
    body.visible = false;
    let live = true;
    compileInBackground(gl, body, camera, world).then(() => {
      if (live) body.visible = true;
    });
    return () => {
      live = false;
    };
  }, [gl, camera, world, body]);

  const mixer = useMemo(() => new THREE.AnimationMixer(body), [body]);
  const actions = useMemo(() => {
    const idle = mixer.clipAction(clips.idle);
    const walk = mixer.clipAction(clips.walk);
    const run = mixer.clipAction(clips.run);
    for (const action of [idle, walk, run]) action.play();
    idle.time = (idleOffset * 0.37) % clips.idle.duration;
    walk.setEffectiveWeight(0);
    run.setEffectiveWeight(0);
    return { idle, walk, run };
  }, [mixer, clips, idleOffset]);
  useEffect(
    () => () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(body);
    },
    [mixer, body]
  );

  // The dealer's starting point each frame: standing straight, from the
  // stand clip's one frame. Put back by hand every frame — the mixer only
  // writes a bone when its value changes, so it wouldn't undo the frame's
  // adjustments and they would pile up.
  const standPose = useMemo(() => {
    const pose = new Map<THREE.Object3D, { rotation?: THREE.Quaternion; position?: THREE.Vector3 }>();
    for (const track of clips.stand.tracks) {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      const node = body.getObjectByName(nodeName);
      if (!node) continue;
      const entry = pose.get(node) ?? {};
      if (propertyName === 'quaternion') entry.rotation = new THREE.Quaternion().fromArray(track.values, 0);
      if (propertyName === 'position') entry.position = new THREE.Vector3().fromArray(track.values, 0);
      pose.set(node, entry);
    }
    return pose;
  }, [clips, body]);

  const speed = useRef(0);
  const turn = useMemo(() => new THREE.Quaternion(), []);
  useFrame((state, delta) => {
    if (pose === 'dealer') {
      for (const [bone, { rotation, position }] of standPose) {
        if (rotation) bone.quaternion.copy(rotation);
        if (position) bone.position.copy(position);
      }
      const t = state.clock.elapsedTime + idleOffset * 1.3;
      // Turned about the body's own axes, not the bones' (which differ by rig).
      body.updateMatrixWorld(true);
      body.getWorldQuaternion(turn);
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(turn);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(turn);
      const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(turn);
      // Weight shifting slowly from foot to foot.
      const hips = bones.get('Hips');
      if (hips) turnAbout(hips, ahead, Math.sin(t * 0.45) * 0.025);
      // Leaning in over the table, spread down the spine, breathing.
      for (const [name, lean] of [['Spine', 0.2], ['Spine1', 0.14], ['Spine2', 0.09]] as const) {
        const bone = bones.get(name);
        if (bone) turnAbout(bone, across, lean + (name === 'Spine2' ? Math.sin(t * 1.6) * 0.012 : 0));
      }
      // Looking down at the felt and along the players.
      const head = bones.get('Head');
      if (head) {
        turnAbout(head, across, 0.18);
        turnAbout(head, up, Math.sin(t * 0.31) * 0.5 * Math.sin(t * 0.13 + 1));
      }
      // Both hands on the table (the wrists as near it as the arms reach), each sliding a little now and then.
      for (const [side, mirror] of [['Left', 1], ['Right', -1]] as const) {
        const upper = bones.get(`${side}Arm`);
        const fore = bones.get(`${side}ForeArm`);
        const hand = bones.get(`${side}Hand`);
        const middle = bones.get(`${side}HandMiddle1`);
        if (!upper || !fore || !hand) continue;
        const slide = Math.max(0, Math.sin(t * 0.5 + mirror * 1.7)) ** 3 * 0.06;
        const target = new THREE.Vector3(mirror * (DEALER_HANDS_APART + slide * 0.5), hands.y + 0.03, hands.z + slide)
          .divideScalar(SCALE[who])
          .applyMatrix4(body.matrixWorld);
        reach(upper, fore, hand, target, DEALER_ELBOW.clone().setX(DEALER_ELBOW.x * mirror).applyQuaternion(turn));
        if (middle) {
          // Tipped down from the wrist, so the fingertips rest on the table's edge.
          const forward = new THREE.Vector3(-mirror * 0.2, -0.62, 0.78).applyQuaternion(turn).normalize();
          palmDown(fore, hand, middle, bones.get(`${side}HandIndex1`), bones.get(`${side}HandPinky1`), forward, up, mirror);
        }
      }
      return;
    }

    speed.current += ((motion?.current.speed ?? 0) - speed.current) * Math.min(1, delta * 10);
    const s = speed.current;
    const moving = THREE.MathUtils.clamp(s / 0.9, 0, 1);
    const running = THREE.MathUtils.clamp((s - RUN_BLEND[0]) / (RUN_BLEND[1] - RUN_BLEND[0]), 0, 1);
    const { idle, walk, run } = actions;
    idle.setEffectiveWeight(1 - moving);
    walk.setEffectiveWeight(moving * (1 - running));
    run.setEffectiveWeight(moving * running);
    walk.timeScale = Math.max(0.7, s / WALK_CLIP_SPEED);
    run.timeScale = Math.max(0.7, s / RUN_CLIP_SPEED);
    // Keep the run on the same step as the walk, so blending doesn't cross the legs.
    if (running > 0 && running < 1) run.time = (walk.time / clips.walk.duration) * clips.run.duration;
    mixer.update(delta);

    // Sitting down: build the seated pose, and blend to it from the clips' pose.
    const sitting = seat?.current;
    if (sitting && sitting.amount > 0.001) {
      const from = new Map<THREE.Object3D, [THREE.Quaternion, THREE.Vector3]>();
      for (const bone of bones.values()) from.set(bone, [bone.quaternion.clone(), bone.position.clone()]);
      seatedPose(sitting);
      const k = Math.min(1, sitting.amount);
      for (const [bone, [rotation, position]] of from) {
        const seated = bone.quaternion.clone();
        bone.quaternion.copy(rotation).slerp(seated, k);
        bone.position.copy(position.lerp(bone.position, k));
      }
    }
  });

  /**
   * The seated pose, from standing straight (the stand clip): hips down on
   * the seat, thighs along it, shins down and feet flat, leaning in a little
   * with both hands on the table.
   */
  function seatedPose(sitting: SeatPose) {
    for (const [bone, { rotation, position }] of standPose) {
      if (rotation) bone.quaternion.copy(rotation);
      if (position) bone.position.copy(position);
    }
    const scale = SCALE[who];
    body.updateMatrixWorld(true);
    const facing = body.getWorldQuaternion(new THREE.Quaternion());
    const way = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(facing).normalize();
    const hips = bones.get('Hips');
    if (hips) {
      const at = new THREE.Vector3(0, SEAT_HIP_HEIGHT, -0.04).divideScalar(scale).applyMatrix4(body.matrixWorld);
      hips.position.copy(hips.parent!.worldToLocal(at));
      hips.updateMatrixWorld(true);
    }
    for (const [side, mirror] of [['Left', 1], ['Right', -1]] as const) {
      const upLeg = bones.get(`${side}UpLeg`);
      const leg = bones.get(`${side}Leg`);
      const foot = bones.get(`${side}Foot`);
      const toe = bones.get(`${side}ToeBase`);
      if (upLeg && leg) aim(upLeg, leg, way(mirror * 0.1, -0.1, 1));
      if (leg && foot) aim(leg, foot, way(mirror * 0.04, -1, 0.12));
      if (foot && toe) aim(foot, toe, way(0, -0.25, 1));
    }
    const across = way(1, 0, 0);
    for (const [name, lean] of [['Spine', 0.07], ['Spine1', 0.06]] as const) {
      const bone = bones.get(name);
      if (bone) turnAbout(bone, across, lean);
    }
    const head = bones.get('Head');
    if (head) turnAbout(head, across, 0.12);
    const up = way(0, 1, 0);
    for (const [side, mirror] of [['Left', 1], ['Right', -1]] as const) {
      const upper = bones.get(`${side}Arm`);
      const fore = bones.get(`${side}ForeArm`);
      const hand = bones.get(`${side}Hand`);
      const middle = bones.get(`${side}HandMiddle1`);
      if (!upper || !fore || !hand) continue;
      const target = new THREE.Vector3(mirror * 0.2, sitting.handsY + 0.03, sitting.handsZ).divideScalar(scale).applyMatrix4(body.matrixWorld);
      reach(upper, fore, hand, target, way(mirror * 0.7, -0.4, -0.5));
      if (middle) palmDown(fore, hand, middle, bones.get(`${side}HandIndex1`), bones.get(`${side}HandPinky1`), way(-mirror * 0.25, -0.3, 1), up, mirror);
    }
  }

  return <primitive object={body} scale={SCALE[who]} />;
}

useGLTF.preload(MODELS.player);
useGLTF.preload(MODELS.staff);
useGLTF.preload(MOVES);
