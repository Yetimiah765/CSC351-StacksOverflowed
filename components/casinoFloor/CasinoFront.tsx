'use client';

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { COLS, DOOR, FOYER_PLANTS, FRONT_WALL_Y, GATE_HALF_WIDTH, ROWS, TILE_METRES } from '../../lib/casinoFloor';
import { Plant } from './Furniture';
import Highlight from './Highlight';
import type { LobbyState } from './Lobby';
import { carpetTexture, wallTexture } from './textures';

// The front of the casino room (Scene.tsx's Room draws the rest): a low
// rail across the floor, with a gate in it at the door that swings open away
// from the player walking through it either way (SRS-105.4), the foyer beyond
// it, and the front wall with the casino's big doors. They're always there,
// so the room is closed in. The walk in after logging in (SRS-103.12) opens
// the doors from the lobby (Lobby.tsx), and they shut again behind the
// player; in reach of them, the doors are outlined, and a logged-in player
// can leave through them, logging out (SRS-105.5).
// lib/casinoFloor.ts has where the rail, the gate and the foyer's plants
// stand, so the player bumps into the same things drawn here.

const M = TILE_METRES;
const doorX = (DOOR.x + DOOR.w / 2 - COLS / 2) * M;
/** Where the floor ends (the rail), and the front wall, world z. */
export const RAIL_Z = (DOOR.y - ROWS / 2) * M;
export const FRONT_WALL_Z = (FRONT_WALL_Y - ROWS / 2) * M;
/** The casino's doorway (and the gate in the rail, as wide). */
export const CASINO_DOOR_HALF = GATE_HALF_WIDTH * M;
export const CASINO_DOOR_HEIGHT = 4.2;
/** The doorway's gold lining, round the opening and through the wall. */
const LINING = 0.16;

function Gold() {
  return <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />;
}

/** One of the casino's doors: mahogany, with gold panels, studs and a ring handle on both faces, hung at the doorway's side and swinging out into the lobby. */
function CasinoDoor({ side, door }: { side: -1 | 1; door: MutableRefObject<THREE.Group | null> }) {
  const w = CASINO_DOOR_HALF;
  const h = CASINO_DOOR_HEIGHT;
  // Laid out from the hinge: the leaf runs -side·x away from it.
  const along = (f: number) => -side * w * f;
  const strip = (key: string, face: number, x: number, y: number, sw: number, sh: number) => (
    <mesh key={key} position={[x, y, face * 0.07]}>
      <boxGeometry args={[sw, sh, 0.02]} />
      <Gold />
    </mesh>
  );
  return (
    <group ref={door} position={[doorX + side * w, 0, FRONT_WALL_Z + 0.22]}>
      <mesh position={[along(0.5), h / 2, 0]} castShadow>
        <boxGeometry args={[w - 0.03, h - 0.04, 0.12]} />
        <meshStandardMaterial color="#4a1d10" roughness={0.45} metalness={0.15} />
      </mesh>
      {[1, -1].map((face) => (
        <group key={face}>
          {/* Two raised panels outlined in gold, and a studded edge. */}
          {[
            [h * 0.68, h * 0.46],
            [h * 0.22, h * 0.3],
          ].map(([cy, ph]) => (
            <group key={cy}>
              {strip(`t${cy}`, face, along(0.5), cy + ph / 2, w * 0.7, 0.04)}
              {strip(`b${cy}`, face, along(0.5), cy - ph / 2, w * 0.7, 0.04)}
              {strip(`l${cy}`, face, along(0.15), cy, 0.04, ph)}
              {strip(`r${cy}`, face, along(0.85), cy, 0.04, ph)}
            </group>
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[along(0.94), 0.4 + i * ((h - 0.8) / 8), face * 0.07]}>
              <sphereGeometry args={[0.025, 8, 6]} />
              <Gold />
            </mesh>
          ))}
          {/* The big ring handle near the meeting edge. */}
          <mesh position={[along(0.88), 1.15, face * 0.12]}>
            <torusGeometry args={[0.1, 0.018, 8, 24]} />
            <Gold />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A low stretch of the rail from x1 to x2, along the floor's edge. */
function RailPiece({ x1, x2 }: { x1: number; x2: number }) {
  return (
    <group position={[(x1 + x2) / 2, 0, 0]}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[x2 - x1, 0.5, 0.2]} />
        <meshStandardMaterial color="#1b0f2e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.51, 0]}>
        <boxGeometry args={[x2 - x1, 0.04, 0.24]} />
        <Gold />
      </mesh>
    </group>
  );
}

/** One leaf of the gate in the rail, hung on a brass post and swinging in onto the floor. */
function GateLeaf({ side, leaf }: { side: -1 | 1; leaf: MutableRefObject<THREE.Group | null> }) {
  const w = CASINO_DOOR_HALF - 0.05;
  return (
    <group position={[doorX + side * CASINO_DOOR_HALF, 0, RAIL_Z]}>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.72, 14]} />
        <Gold />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.08, 14, 10]} />
        <Gold />
      </mesh>
      <group ref={leaf}>
        <group position={[(-side * w) / 2 - side * 0.04, 0, 0]}>
          <RailPiece x1={-w / 2} x2={w / 2} />
        </group>
      </group>
    </group>
  );
}

/** Where the uplight below the doors is set in the foyer floor, world z. */
const UPLIGHT_Z = FRONT_WALL_Z - 1.5;

/**
 * An uplight set in the foyer floor, washing the doors from below (the room's
 * key light shines on the wall's other side). Aimed up, it leaves the polished
 * floor without a reflection of a lamp that isn't there.
 */
function DoorLight() {
  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    target.position.set(doorX, 2.4, FRONT_WALL_Z);
    if (light.current) light.current.target = target;
  }, [target]);
  return (
    <>
      <primitive object={target} />
      <spotLight ref={light} position={[doorX, 0.05, UPLIGHT_Z]} angle={0.8} penumbra={0.6} intensity={30} distance={8} decay={2} color="#ffd9b0" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[doorX, 0.004, UPLIGHT_Z]}>
        <ringGeometry args={[0.07, 0.12, 24]} />
        <Gold />
      </mesh>
    </>
  );
}

export default function CasinoFront({
  state,
  width,
  height,
  highlight,
  onDoorsClick,
}: {
  state: MutableRefObject<LobbyState>;
  width: number;
  height: number;
  /** Outline the doors: the player's in reach of them and can leave. */
  highlight: boolean;
  onDoorsClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const leftDoor = useRef<THREE.Group>(null);
  const rightDoor = useRef<THREE.Group>(null);
  const leftLeaf = useRef<THREE.Group>(null);
  const rightLeaf = useRef<THREE.Group>(null);
  useFrame(() => {
    // The doors swing out into the lobby, a little past square; the gate's
    // leaves swing in onto the floor or out into the foyer, whichever way the
    // player's walking.
    const swing = state.current.casino * (Math.PI / 2) * 0.92;
    if (leftDoor.current) leftDoor.current.rotation.y = -swing;
    if (rightDoor.current) rightDoor.current.rotation.y = swing;
    const gate = state.current.gate * (Math.PI / 2);
    if (leftLeaf.current) leftLeaf.current.rotation.y = gate;
    if (rightLeaf.current) rightLeaf.current.rotation.y = -gate;
  });

  const foyerDepth = FRONT_WALL_Z - RAIL_Z;
  const foyer = useMemo(() => carpetTexture([width / 1.6, foyerDepth / 1.6]), [width, foyerDepth]);
  // The front wall, seen from inside: one piece round the doorway, painted
  // like the room's other walls (its UVs are in metres, so the pattern's the
  // same size).
  const walls = useMemo(() => wallTexture([1 / 2.4, 1.6 / height]), [height]);
  const wall = useMemo(() => {
    const edge = CASINO_DOOR_HALF + LINING;
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(doorX - edge, 0);
    shape.lineTo(doorX - edge, CASINO_DOOR_HEIGHT + LINING);
    shape.lineTo(doorX + edge, CASINO_DOOR_HEIGHT + LINING);
    shape.lineTo(doorX + edge, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, height);
    shape.lineTo(-width / 2, height);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [width, height]);

  return (
    <group>
      {/* The rail where the floor ends, either side of its gate. */}
      <group position={[0, 0, RAIL_Z]}>
        <RailPiece x1={-width / 2} x2={doorX - CASINO_DOOR_HALF} />
        <RailPiece x1={doorX + CASINO_DOOR_HALF} x2={width / 2} />
      </group>
      <GateLeaf side={-1} leaf={leftLeaf} />
      <GateLeaf side={1} leaf={rightLeaf} />

      {/* The foyer between the rail and the front wall. */}
      <DoorLight />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, RAIL_Z + foyerDepth / 2]} receiveShadow>
        <planeGeometry args={[width, foyerDepth]} />
        <meshStandardMaterial map={foyer} roughness={0.95} />
      </mesh>
      {FOYER_PLANTS.map((plant) => (
        <group key={plant.x} position={[(plant.x - COLS / 2) * M, 0, (plant.y - ROWS / 2) * M]}>
          <Plant />
        </group>
      ))}

      {/* The front wall facing into the room, with a neon strip along its top
          like the side walls, neon either side of the doorway, and sconces. */}
      <mesh geometry={wall} position={[0, 0, FRONT_WALL_Z - 0.12]} rotation={[0, Math.PI, 0]} receiveShadow>
        <meshStandardMaterial map={walls} roughness={0.7} />
      </mesh>
      <mesh position={[0, height - 0.25, FRONT_WALL_Z - 0.15]}>
        <boxGeometry args={[width, 0.05, 0.04]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={`neon${s}`}>
          <mesh position={[doorX + s * (CASINO_DOOR_HALF + LINING + 0.3), 2.2, FRONT_WALL_Z - 0.16]}>
            <boxGeometry args={[0.05, 3.8, 0.05]} />
            <meshStandardMaterial color="#ff3fa4" emissive="#ff3fa4" emissiveIntensity={3} toneMapped={false} />
          </mesh>
          <group position={[doorX + s * 4.2, 2.6, FRONT_WALL_Z - 0.18]}>
            <mesh>
              <boxGeometry args={[0.18, 0.36, 0.08]} />
              <Gold />
            </mesh>
            <mesh position={[0, 0.22, -0.08]}>
              <sphereGeometry args={[0.09, 12, 8]} />
              <meshStandardMaterial color="#fff4d6" emissive="#ffd9a0" emissiveIntensity={2.2} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}

      {/* The doorway's gold lining, through the wall's thickness, and the doors in it. */}
      {[-1, 1].map((s) => (
        <mesh key={`jamb${s}`} position={[doorX + s * (CASINO_DOOR_HALF + LINING / 2), CASINO_DOOR_HEIGHT / 2, FRONT_WALL_Z + 0.05]}>
          <boxGeometry args={[LINING, CASINO_DOOR_HEIGHT, 0.5]} />
          <Gold />
        </mesh>
      ))}
      <mesh position={[doorX, CASINO_DOOR_HEIGHT + LINING / 2, FRONT_WALL_Z + 0.05]}>
        <boxGeometry args={[(CASINO_DOOR_HALF + LINING) * 2, LINING, 0.5]} />
        <Gold />
      </mesh>
      <group onClick={onDoorsClick}>
        <Highlight enabled={highlight}>
          <CasinoDoor side={-1} door={leftDoor} />
          <CasinoDoor side={1} door={rightDoor} />
        </Highlight>
      </group>
    </group>
  );
}
