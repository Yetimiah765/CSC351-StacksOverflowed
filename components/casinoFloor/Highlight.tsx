'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';

/** How thick the outline is, metres. */
const THICKNESS = 0.018;

/**
 * Outlines everything inside it in pulsing white while `enabled`, the way
 * the casino floor shows what the player would use (a chair, a stool, a
 * screen, the shop counter). An "inverted hull": each mesh drawn again a
 * little bigger, back faces only, so only a rim shows round its edges — and
 * bright enough for the bloom to make it glow. (Skinned people are left
 * out: a plain copy of their mesh wouldn't follow their bones.)
 */
export default function Highlight({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    []
  );

  useEffect(() => {
    const root = group.current;
    if (!enabled || !root) return;
    const meshes: THREE.Mesh[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh && !mesh.userData.hull) meshes.push(mesh);
    });
    const hulls = meshes.map((mesh) => {
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
      const centre = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
      const grow = (length: number) => (length > 1e-3 ? 1 + (2 * THICKNESS) / length : 1);
      const hull = new THREE.Mesh(mesh.geometry, material);
      hull.userData.hull = true;
      hull.scale.set(grow(size.x), grow(size.y), grow(size.z));
      // Grow about the shape's middle, not its origin.
      hull.position.copy(centre).multiply(new THREE.Vector3(1, 1, 1).sub(hull.scale));
      hull.raycast = () => {};
      mesh.add(hull);
      return hull;
    });
    return () => {
      for (const hull of hulls) hull.removeFromParent();
    };
  }, [enabled, material]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    if (enabled) material.opacity = 0.7 + 0.3 * Math.sin(state.clock.elapsedTime * 5);
  });

  return <group ref={group}>{children}</group>;
}
