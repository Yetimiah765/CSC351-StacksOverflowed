'use client';

// The sportsbook header's background: a muted montage of sports clips that
// crossfade every few seconds, darkened so the title stays readable. The
// clips are free Mixkit stock footage (Mixkit Stock Video Free License: no
// attribution needed, no league logos), linked from Mixkit's servers the way
// the team logos are linked from ESPN's, so no video files live in the repo.
// Only the clip on screen and the next one load. Players who turn animations
// off, or whose browser can't play the clips, get the plain background.

import { useEffect, useRef, useState } from 'react';

const CLIPS = [
  44454, // basketball player dunking
  42549, // quarterback throwing
  2285, // dribble then dunk
  42556, // wide receiver catching
].map((id) => `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`);

const CLIP_MS = 5000;

export function HighlightReel() {
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState(0);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    setEnabled(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setActive((current) => (current + 1) % CLIPS.length), CLIP_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  // Start the clip coming on screen from the top; stop the others once they've faded.
  useEffect(() => {
    const current = videos.current[active];
    if (current) {
      current.currentTime = 0;
      current.play().catch(() => {});
    }
    const timer = setTimeout(() => {
      videos.current.forEach((video, i) => {
        if (video && i !== active) video.pause();
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [active, enabled]);

  if (!enabled) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {CLIPS.map((src, i) => {
        const near = i === active || i === (active + 1) % CLIPS.length;
        return (
          <video
            key={src}
            ref={(el) => {
              videos.current[i] = el;
            }}
            src={src}
            muted
            playsInline
            loop
            preload={near ? 'auto' : 'none'}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              i === active ? 'opacity-100' : 'opacity-0'
            }`}
          />
        );
      })}
    </div>
  );
}
