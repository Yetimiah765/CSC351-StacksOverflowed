'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PieceLayout } from '../../lib/casinoFloor';
import Highlight from './Highlight';
import Person from './Person';
import {
  blackjackFeltTexture,
  cardTexture,
  feltBumpTexture,
  neonTexture,
  pokerFeltTexture,
  paintSportsScreen,
  rouletteLayoutTexture,
  rouletteWheelTexture,
  slotReelTexture,
  sportsScreen,
} from './textures';

// The 3D casino floor's furniture (Scene.tsx). Each piece is centred on the
// origin, `width` x `depth` metres on the floor, with players' side towards
// +z (the room's front) and the dealer's side towards -z. Chairs and the
// dealer (or shopkeeper) go where `layout` (pieceLayout() in
// lib/casinoFloor.ts) puts them — the same spots the player bumps into.

const FELT = '#16683a';
const WOOD = '#5a2f14';
const GOLD = '#c9a227';

/** Felt cloth: a soft sheen that lights up at grazing angles, and a fibre bump. */
function Felt({ map, color = FELT }: { map?: THREE.Texture; color?: string }) {
  const bump = useMemo(() => feltBumpTexture(6), []);
  return (
    <meshPhysicalMaterial
      map={map ?? null}
      color={map ? '#ffffff' : color}
      roughness={0.92}
      sheen={1}
      sheenColor="#5fbf86"
      sheenRoughness={0.55}
      bumpMap={bump}
      bumpScale={0.6}
    />
  );
}
/** The padded leather armrest round a table's edge. */
function Leather() {
  return <meshPhysicalMaterial color="#1a0f0a" roughness={0.42} clearcoat={0.55} clearcoatRoughness={0.4} />;
}
function Wood() {
  return <meshStandardMaterial color={WOOD} roughness={0.35} metalness={0.1} />;
}
function Gold() {
  return <meshStandardMaterial color={GOLD} roughness={0.25} metalness={0.9} />;
}

/** A padded casino chair facing `angle` (radians, 0 = facing -z); `highlighted` outlines it in white. */
function Chair({ position, angle, highlighted = false }: { position: [number, number, number]; angle: number; highlighted?: boolean }) {
  return (
    <Highlight enabled={highlighted}>
      <group position={position} rotation={[0, angle, 0]}>
        <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.46, 0.09, 0.44]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.82, 0.2]} castShadow>
          <boxGeometry args={[0.46, 0.62, 0.08]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.5} />
        </mesh>
        {[-0.18, 0.18].map((x) =>
          [-0.17, 0.17].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.21, z]}>
              <cylinderGeometry args={[0.02, 0.02, 0.42, 8]} />
              <Gold />
            </mesh>
          ))
        )}
      </group>
    </Highlight>
  );
}

const CHIP_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#111827', '#f59e0b', '#7c3aed'];

/** A stack of chips, `count` high. */
function ChipStack({ position, count, color }: { position: [number, number, number]; count: number; color: string }) {
  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => (
        // Real stacks are never quite straight.
        <group key={i} position={[Math.sin(i * 2.3) * 0.002, 0.006 + i * 0.0105, Math.cos(i * 1.7) * 0.002]} rotation={[0, i * 0.9, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.0095, 24]} />
            <meshStandardMaterial color={color} roughness={0.45} />
          </mesh>
          {/* White edge spots */}
          {[0, 1, 2].map((k) => (
            <mesh key={k} rotation={[0, (k * Math.PI * 2) / 3, 0]}>
              <cylinderGeometry args={[0.0202, 0.0202, 0.0097, 6, 1, true, 0, 0.45]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.45} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

const CARDS: [string, '♠' | '♥' | '♦' | '♣'][] = [
  ['A', '♠'], ['K', '♥'], ['7', '♦'], ['Q', '♣'], ['10', '♥'],
];

function Card({ position, rank, suit, rotation = 0 }: { position: [number, number, number]; rank: string; suit: '♠' | '♥' | '♦' | '♣'; rotation?: number }) {
  const map = useMemo(() => cardTexture(rank, suit), [rank, suit]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]}>
      <planeGeometry args={[0.09, 0.13]} />
      <meshStandardMaterial map={map} roughness={0.6} />
    </mesh>
  );
}

/** The dealer behind the table, facing the players, hands resting on it. */
function Dealer({ layout, offset = 0 }: { layout: PieceLayout; offset?: number }) {
  const spot = layout.dealer;
  if (!spot) return null;
  return (
    <group position={[spot.x, 0, spot.z]}>
      <Person who="staff" idleOffset={offset} pose="dealer" hands={{ y: spot.handsY, z: spot.handsZ }} />
    </group>
  );
}

interface PieceProps {
  width: number;
  depth: number;
  layout: PieceLayout;
  /** The chair (index into layout.chairs) to outline: the one the player would sit in. */
  highlight?: number | null;
}

// ---------- Poker ----------
export function PokerTable({ width, depth, layout, highlight = null }: PieceProps) {
  const rx = width / 2 - 0.55;
  const rz = depth / 2 - 0.5;
  const felt = useMemo(() => pokerFeltTexture(rx / rz), [rx, rz]);
  return (
    <group>
      <Dealer layout={layout} offset={1} />
      {/* Pedestal, the wooden body, a racetrack of wood inside a padded leather rail, the felt */}
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.42, 0.72, 32]} />
        <meshStandardMaterial color="#111" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.74, 0]} scale={[rx + 0.18, 1, rz + 0.18]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 0.96, 0.12, 72]} />
        <Wood />
      </mesh>
      <mesh position={[0, 0.83, 0]} scale={[rx + 0.13, 1, rz + 0.13]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[1, 0.07, 16, 96]} />
        <Leather />
      </mesh>
      <mesh position={[0, 0.812, 0]} scale={[rx + 0.04, 1, rz + 0.04]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[0.92, 1, 72]} />
        <meshPhysicalMaterial color="#6b3a1a" roughness={0.25} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
      <mesh position={[0, 0.81, 0]} scale={[rx - 0.04, 1, rz - 0.04]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1, 72]} />
        <Felt map={felt} />
      </mesh>
      {CARDS.map(([rank, suit], i) => (
        <Card key={i} position={[-0.24 + i * 0.12, 0.813, -0.02]} rank={rank} suit={suit} />
      ))}
      {layout.chairs.map((seat, i) => {
        // Each player's chips on the felt in front of their chair.
        const angle = Math.atan2(seat.z / rz, seat.x / rx);
        const cx = Math.cos(angle) * rx * 0.74;
        const cz = Math.sin(angle) * rz * 0.74;
        return (
          <group key={i}>
            <Chair position={[seat.x, 0, seat.z]} angle={seat.angle} highlighted={highlight === i} />
            <ChipStack position={[cx, 0.811, cz]} count={4 + (i % 3) * 3} color={CHIP_COLORS[i % CHIP_COLORS.length] as string} />
            <ChipStack position={[cx + 0.045, 0.811, cz]} count={3 + (i % 2) * 4} color={CHIP_COLORS[(i + 2) % CHIP_COLORS.length] as string} />
          </group>
        );
      })}
      <ChipStack position={[0.06, 0.811, 0.16]} count={9} color="#f59e0b" />
      <ChipStack position={[0.11, 0.811, 0.18]} count={6} color="#dc2626" />
    </group>
  );
}

/** A dealing shoe: a red acrylic box of cards on a slope, the next card showing at its mouth. */
function Shoe({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group rotation={[0.16, 0, 0]} position={[0, 0.065, 0]}>
        {/* The deck inside, then the see-through body over it */}
        <mesh position={[0, 0.005, -0.02]}>
          <boxGeometry args={[0.105, 0.075, 0.26]} />
          <meshStandardMaterial color="#f5f3ee" roughness={0.7} />
        </mesh>
        <mesh castShadow>
          <boxGeometry args={[0.13, 0.11, 0.32]} />
          <meshPhysicalMaterial color="#b91c1c" roughness={0.08} clearcoat={1} transparent opacity={0.6} depthWrite={false} />
        </mesh>
        {/* The black mouth plate with its finger slot, and the next card */}
        <mesh position={[0, -0.005, 0.162]}>
          <boxGeometry args={[0.134, 0.1, 0.006]} />
          <meshStandardMaterial color="#0b0b0b" roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.03, 0.166]}>
          <boxGeometry args={[0.07, 0.03, 0.004]} />
          <meshStandardMaterial color="#9ca3af" roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.05, 0.19]} rotation={[-Math.PI / 2 + 0.16, 0, 0]}>
          <planeGeometry args={[0.09, 0.06]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

// ---------- Blackjack ----------
export function BlackjackTable({ width, depth, layout, highlight = null }: PieceProps) {
  const r = Math.min(width / 2 - 0.3, depth - 0.9);
  const z0 = -depth / 2 + 0.75;
  const felt = useMemo(() => blackjackFeltTexture(), []);
  // The seven betting boxes, where they're printed on the felt.
  const spots = Array.from({ length: 7 }, (_, i) => Math.PI * 0.2 + (i * Math.PI * 0.6) / 6);
  return (
    <group>
      <Dealer layout={layout} offset={2} />
      <mesh position={[0, 0.36, z0 + 0.3]} castShadow>
        <boxGeometry args={[1.2, 0.72, 0.4]} />
        <Wood />
      </mesh>
      <mesh position={[0, 0.75, z0]} castShadow receiveShadow>
        <cylinderGeometry args={[r + 0.14, r + 0.1, 0.1, 64, 1, false, -Math.PI / 2, Math.PI]} />
        <Wood />
      </mesh>
      <mesh position={[0, 0.81, z0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[r, 64, Math.PI, Math.PI]} />
        <Felt map={felt} />
      </mesh>
      {/* Padded rail round the players' side */}
      <mesh position={[0, 0.83, z0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[r + 0.07, 0.065, 16, 64, Math.PI]} />
        <Leather />
      </mesh>
      {/* The dealer's chip tray: chips standing on edge in rows */}
      <group position={[0, 0.812, z0 + 0.1]}>
        <mesh>
          <boxGeometry args={[0.5, 0.02, 0.14]} />
          <meshStandardMaterial color="#111827" roughness={0.3} metalness={0.3} />
        </mesh>
        {CHIP_COLORS.map((color, i) => (
          <mesh key={color} position={[-0.21 + i * 0.084, 0.022, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.12, 20]} />
            <meshStandardMaterial color={color} roughness={0.45} />
          </mesh>
        ))}
      </group>
      <Shoe position={[r * 0.6, 0.812, z0 + 0.17]} rotation={-0.5} />
      {/* The discard holder on the other side */}
      <group position={[-r * 0.6, 0.812, z0 + 0.17]} rotation={[0, 0.5, 0]}>
        <mesh position={[0, 0.04, 0]} castShadow>
          <boxGeometry args={[0.12, 0.08, 0.16]} />
          <meshPhysicalMaterial color="#e5e7eb" roughness={0.1} clearcoat={1} transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.095, 0.035, 0.13]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.6} />
        </mesh>
      </group>
      {/* The dealer's cards (one face down), and a bet and two cards in three of the boxes */}
      <Card position={[-0.06, 0.813, z0 + 0.3]} rank="K" suit="♠" />
      <mesh position={[0.06, 0.813, z0 + 0.3]} rotation={[-Math.PI / 2, 0, 0.08]}>
        <planeGeometry args={[0.09, 0.13]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.6} />
      </mesh>
      {[1, 3, 5].map((k, n) => {
        const a = spots[k] as number;
        const chip = { x: Math.cos(a) * r * 0.82, z: z0 + Math.sin(a) * r * 0.82 };
        const cards = { x: Math.cos(a) * r * 0.66, z: z0 + Math.sin(a) * r * 0.66 };
        const turn = Math.PI / 2 - a;
        return (
          <group key={k}>
            <ChipStack position={[chip.x, 0.811, chip.z]} count={3 + k} color={CHIP_COLORS[k] as string} />
            <Card position={[cards.x - 0.03, 0.813, cards.z]} rank={['7', 'Q', '10'][n] as string} suit="♦" rotation={turn} />
            <Card position={[cards.x + 0.03, 0.814, cards.z + 0.01]} rank={['A', '5', '9'][n] as string} suit="♣" rotation={turn + 0.1} />
          </group>
        );
      })}
      {layout.chairs.map((seat, i) => (
        <Chair key={i} position={[seat.x, 0, seat.z]} angle={seat.angle} highlighted={highlight === i} />
      ))}
    </group>
  );
}

// ---------- Roulette ----------
/** One spin, in seconds: the ball races round against the wheel, slows, drops in, then rides with it. */
const SPIN = { rolling: 6.5, dropping: 1.2, riding: 3.3 };
const SPIN_LENGTH = SPIN.rolling + SPIN.dropping + SPIN.riding;
/** The wheel's speed, radians a second (anticlockwise seen from above). */
const WHEEL_SPEED = 0.7;

export function RouletteTable({ width, depth, layout, highlight = null }: PieceProps) {
  const wheelMap = useMemo(() => rouletteWheelTexture(), []);
  const layoutMap = useMemo(() => rouletteLayoutTexture(), []);
  const wheel = useRef<THREE.Mesh>(null);
  const ball = useRef<THREE.Mesh>(null);
  const ballAngle = useRef(0);
  const tableW = width - 0.4;
  const tableD = depth - 1.0;
  const wheelX = -tableW / 2 + 0.65;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const step = Math.min(delta, 0.1);
    if (wheel.current) wheel.current.rotation.y = t * WHEEL_SPEED;
    if (!ball.current) return;
    // The ball is thrown against the wheel (clockwise), slowing as it goes;
    // then it drops in and is carried round with the wheel.
    const into = t % SPIN_LENGTH;
    let radius: number;
    let height: number;
    if (into < SPIN.rolling) {
      const slowing = 1 - into / SPIN.rolling;
      ballAngle.current -= step * (1.2 + 5.5 * slowing);
      radius = 0.46;
      height = 0.995;
    } else if (into < SPIN.rolling + SPIN.dropping) {
      const k = (into - SPIN.rolling) / SPIN.dropping;
      ballAngle.current += step * THREE.MathUtils.lerp(-1.2, WHEEL_SPEED, k);
      radius = THREE.MathUtils.lerp(0.46, 0.38, k);
      height = 0.99 + Math.abs(Math.sin(k * Math.PI * 3)) * 0.025 * (1 - k);
    } else {
      ballAngle.current += step * WHEEL_SPEED;
      radius = 0.38;
      height = 0.985;
    }
    // Matching rotation.y, where a positive angle turns +x towards -z.
    const a = ballAngle.current;
    ball.current.position.set(wheelX + Math.cos(a) * radius, height, 0.15 - Math.sin(a) * radius);
  });

  return (
    <group>
      <Dealer layout={layout} offset={3} />
      <mesh position={[0, 0.39, 0.15]} castShadow receiveShadow>
        <boxGeometry args={[tableW, 0.78, tableD]} />
        <Wood />
      </mesh>
      <mesh position={[0, 0.781, 0.15]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[tableW - 0.1, tableD - 0.1]} />
        <Felt color="#14612f" />
      </mesh>
      <mesh position={[0.35, 0.783, 0.15]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[tableW - 1.5, tableD - 0.2]} />
        <Felt map={layoutMap} />
      </mesh>
      {/* Padded rail on the players' side */}
      <mesh position={[0, 0.8, 0.15 + tableD / 2 - 0.02]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.055, tableW - 0.1, 8, 16]} />
        <Leather />
      </mesh>
      {/* The wheel in its bowl */}
      <mesh position={[wheelX, 0.86, 0.15]} castShadow>
        <cylinderGeometry args={[0.6, 0.55, 0.18, 64]} />
        <Wood />
      </mesh>
      <mesh position={[wheelX, 0.96, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.56, 0.035, 12, 64]} />
        <Gold />
      </mesh>
      <mesh ref={wheel} position={[wheelX, 0.975, 0.15]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 64]} />
        <meshStandardMaterial attach="material-0" color={WOOD} />
        <meshStandardMaterial attach="material-1" map={wheelMap} roughness={0.35} metalness={0.2} />
        <meshStandardMaterial attach="material-2" color={WOOD} />
      </mesh>
      <mesh position={[wheelX, 1.03, 0.15]} castShadow>
        <coneGeometry args={[0.09, 0.12, 24]} />
        <Gold />
      </mesh>
      <mesh ref={ball} castShadow>
        <sphereGeometry args={[0.018, 16, 16]} />
        <meshPhysicalMaterial color="#ffffff" roughness={0.08} clearcoat={1} />
      </mesh>
      {/* Bets on the layout */}
      {([[0.1, 0, '#dc2626', 5], [0.6, 0.25, '#2563eb', 3], [1.0, -0.1, '#16a34a', 4], [-0.2, 0.3, '#111827', 2]] as const).map(([x, z, color, n], i) => (
        <ChipStack key={i} position={[x, 0.783, 0.15 + z]} count={n} color={color} />
      ))}
      {layout.chairs.map((seat, i) => (
        <Chair key={i} position={[seat.x, 0, seat.z]} angle={seat.angle} highlighted={highlight === i} />
      ))}
    </group>
  );
}

// ---------- Slots ----------
function SlotMachine({ x, index, highlighted }: { x: number; index: number; highlighted: boolean }) {
  const reels = useMemo(() => slotReelTexture(), []);
  const topLight = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    reels.offset.y = (t * (0.35 + index * 0.07)) % 1;
    if (topLight.current) {
      topLight.current.emissiveIntensity = Math.floor(t * 3 + index) % 2 ? 2.2 : 0.8;
    }
  });
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 1.7, 0.62]} />
        <meshStandardMaterial color="#9f1239" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Gold trim, reels behind glass, the top light, the button deck, the lever */}
      <mesh position={[0, 1.08, 0.316]}>
        <planeGeometry args={[0.6, 0.48]} />
        <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.08, 0.318]}>
        <planeGeometry args={[0.54, 0.42]} />
        <meshStandardMaterial map={reels} emissiveMap={reels} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <boxGeometry args={[0.72, 0.22, 0.5]} />
        <meshStandardMaterial ref={topLight} color="#fbbf24" emissive="#f97316" emissiveIntensity={1.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.72, 0.36]} rotation={[-0.5, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.06, 0.24]} />
        <meshStandardMaterial color="#1f2937" roughness={0.4} />
      </mesh>
      {[-0.2, 0, 0.2].map((bx) => (
        <mesh key={bx} position={[bx, 0.77, 0.42]}>
          <sphereGeometry args={[0.03, 12, 12]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1.2} />
        </mesh>
      ))}
      <mesh position={[0.44, 1.2, 0.1]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.5, 10]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.44, 1.47, 0.1]} castShadow>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#dc2626" roughness={0.3} />
      </mesh>
      {/* A stool in front */}
      <Highlight enabled={highlighted}>
        <mesh position={[0, 0.34, 0.75]} castShadow>
          <cylinderGeometry args={[0.04, 0.06, 0.68, 12]} />
          <Gold />
        </mesh>
        <mesh position={[0, 0.7, 0.75]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.08, 20]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.5} />
        </mesh>
      </Highlight>
    </group>
  );
}

export function SlotMachines({ width, depth, highlight = null }: { width: number; depth: number; highlight?: number | null }) {
  return (
    <group position={[0, 0, -depth / 2 + 0.35]}>
      {/* In the same order as the stools in pieceLayout(). */}
      {[-1, 0, 1].map((i) => (
        <SlotMachine key={i} x={i * (width / 3.2)} index={i + 1} highlighted={highlight === i + 1} />
      ))}
    </group>
  );
}

// ---------- Sports betting ----------
function Screen({ x, variant, highlighted }: { x: number; variant: number; highlighted: boolean }) {
  const screen = useMemo(() => sportsScreen(), []);
  useFrame((state) => {
    paintSportsScreen(screen.ctx, state.clock.elapsedTime * 1000, variant);
    screen.texture.needsUpdate = true;
  });
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.9, -0.05]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 1.8, 10]} />
        <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.3} />
      </mesh>
      <Highlight enabled={highlighted}>
        <mesh position={[0, 1.9, 0]} castShadow>
          <boxGeometry args={[1.5, 0.88, 0.07]} />
          <meshStandardMaterial color="#0b0b10" roughness={0.3} />
        </mesh>
      </Highlight>
      <mesh position={[0, 1.9, 0.037]}>
        <planeGeometry args={[1.4, 0.79]} />
        <meshStandardMaterial map={screen.texture} emissiveMap={screen.texture} emissive="#ffffff" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** `highlight` outlines one of the two screens (the one to zoom into), in pieceLayout()'s order. */
export function SportsBar({ width, depth, highlight = null }: { width: number; depth: number; highlight?: number | null }) {
  return (
    <group>
      <group position={[0, 0, -depth / 2 + 0.2]}>
        <Screen x={-width / 4} variant={0} highlighted={highlight === 0} />
        <Screen x={width / 4} variant={1} highlighted={highlight === 1} />
      </group>
      <mesh position={[0, 0.5, depth / 2 - 0.45]} castShadow receiveShadow>
        <boxGeometry args={[width - 0.3, 1.0, 0.5]} />
        <Wood />
      </mesh>
      <mesh position={[0, 1.02, depth / 2 - 0.45]}>
        <boxGeometry args={[width - 0.2, 0.05, 0.6]} />
        <meshStandardMaterial color="#111827" roughness={0.15} metalness={0.4} />
      </mesh>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * 1.1, 1.06, depth / 2 - 0.4]}>
          <boxGeometry args={[0.36, 0.02, 0.22]} />
          <meshStandardMaterial color="#f8fafc" emissive="#e2e8f0" emissiveIntensity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- The shop ----------
export function ShopCounter({ width, depth, layout }: PieceProps) {
  const sign = useMemo(() => neonTexture('SHOP', '#a855f7', 512, 160), []);
  return (
    <group>
      <Dealer layout={layout} offset={4} />
      <mesh position={[0, 0.5, 0.15]} castShadow receiveShadow>
        <boxGeometry args={[width - 0.4, 1.0, 0.6]} />
        <Wood />
      </mesh>
      <mesh position={[0, 0.9, 0.46]}>
        <boxGeometry args={[width - 0.38, 0.04, 0.02]} />
        <Gold />
      </mesh>
      <mesh position={[0, 1.02, 0.15]}>
        <boxGeometry args={[width - 0.3, 0.04, 0.7]} />
        <meshPhysicalMaterial color="#cbd5e1" roughness={0.05} clearcoat={1} transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {[['#7c3aed', -1.6], ['#db2777', -1.1], ['#0ea5e9', 1.1], ['#f59e0b', 1.6]].map(([color, x]) => (
        <group key={String(x)} position={[Number(x), 1.17, 0.15]}>
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.26, 0.28]} />
            <meshStandardMaterial color={String(color)} roughness={0.5} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.06, 0.265, 0.285]} />
            <Gold />
          </mesh>
          <mesh>
            <boxGeometry args={[0.285, 0.265, 0.06]} />
            <Gold />
          </mesh>
        </group>
      ))}
      <mesh position={[0.45, 1.16, 0.1]} castShadow>
        <boxGeometry args={[0.36, 0.24, 0.3]} />
        <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[0, 2.35, -depth / 2 + 0.05]}>
        <planeGeometry args={[1.6, 0.5]} />
        <meshStandardMaterial map={sign} emissiveMap={sign} emissive="#ffffff" emissiveIntensity={2.2} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------- Decoration ----------
export function Plant() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.18, 0.6, 20]} />
        <meshStandardMaterial color="#3f2a1d" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <torusGeometry args={[0.235, 0.025, 8, 24]} />
        <Gold />
      </mesh>
      {[[0, 0.95, 0, 0.34], [0.15, 1.2, 0.05, 0.24], [-0.14, 1.15, -0.06, 0.24], [0, 1.4, 0, 0.2]].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x as number, y as number, z as number]} castShadow>
          <icosahedronGeometry args={[r as number, 1]} />
          <meshStandardMaterial color={i % 2 ? '#166534' : '#15803d'} roughness={0.8} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Pillar({ height }: { height: number }) {
  return (
    <group>
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.38, 0.2, 24]} />
        <Gold />
      </mesh>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.28, height - 0.4, 24]} />
        <meshStandardMaterial color="#ece7df" roughness={0.18} metalness={0.05} />
      </mesh>
      <mesh position={[0, height - 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.36, 0.3, 0.2, 24]} />
        <Gold />
      </mesh>
    </group>
  );
}
