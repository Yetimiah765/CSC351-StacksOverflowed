'use client';

import { useId, useMemo } from 'react';
import { drawCosmetic } from '../../lib/cosmeticArt';
import type { CosmeticCategory } from '../../lib/cosmetics';

// How each kind of cosmetic sits inside a square tile: card backs are tall,
// chips a little smaller than profile outlines.
const SIZE: Record<CosmeticCategory, string> = {
  Card: 'h-full aspect-[5/7]',
  Chip: 'h-[80%] aspect-square',
  'Profile Outline': 'h-full aspect-square',
};

// One cosmetic's artwork (lib/cosmeticArt.ts). Give it a category to size it
// inside a square tile, or a className to size it yourself.
export default function CosmeticArt({
  artKey,
  category,
  avatar = true,
  className,
}: {
  artKey: string;
  category?: CosmeticCategory;
  // Profile outlines only: false draws just the ring, to go around a photo.
  avatar?: boolean;
  className?: string;
}) {
  // useId gives each drawing its own gradient and filter ids, and is the
  // same on the server and in the browser.
  const id = useId();
  const svg = useMemo(() => drawCosmetic(artKey, id, { avatar }), [artKey, id, avatar]);
  const size = className ?? (category ? SIZE[category] : 'h-full w-full');

  if (!svg) return <span aria-hidden="true" className={`block rounded-xl bg-slate-800 ${size}`} />;
  // The markup is drawn by lib/cosmeticArt.ts from fixed shapes; nothing in
  // it comes from players.
  return <span className={`block ${size}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
