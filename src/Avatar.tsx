import type { ReactNode } from 'react';

export function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??';
}

/** Painted frames: a 512px image whose transparent hole is half its width, centred on the avatar. */
const FRAME_IMAGES: Record<string, string> = {
  'frame-rose-night': '/assets/frames/rose-night.webp',
  'frame-butterfly': '/assets/frames/butterfly.webp',
  'frame-ice-butterfly': '/assets/frames/ice-butterfly.webp',
  'frame-fire-dragon': '/assets/frames/fire-dragon.webp',
  'frame-mafia-city': '/assets/frames/mafia-city.webp',
  'frame-gold-skull': '/assets/frames/gold-skull.webp',
  'frame-twin-serpent': '/assets/frames/twin-serpent.webp',
  'frame-eagle-crown': '/assets/frames/eagle-crown.webp',
};

/** Avatar frames sold in the shop: CSS-animated rings plus painted ones (see the frame-* styles in theme.css). */
export const FRAME_KEYS = ['frame-gold', 'frame-neon', 'frame-ice', 'frame-fire', 'frame-blood', 'frame-royal', ...Object.keys(FRAME_IMAGES)];

/**
 * Round player avatar: the profile photo when there is one, otherwise coloured initials.
 * `frame` adds the player's animated shop frame around it.
 */
export default function Avatar({ name, color, url, initials, frame, className = '', children }: {
  name: string; color: string; url?: string | null; initials?: string; frame?: string | null; className?: string; children?: ReactNode;
}) {
  const framed = frame && FRAME_KEYS.includes(frame) ? frame : null;
  return <span className={`avatar avatar-${color} ${url ? 'has-photo' : ''} ${framed ? `has-frame ${framed}` : ''} ${className}`} style={url ? { backgroundImage: `url("${url}")` } : undefined} role="img" aria-label={name}>
    {framed && <span className={`avatar-frame ${FRAME_IMAGES[framed] ? 'is-painted' : ''}`} aria-hidden="true"
      style={FRAME_IMAGES[framed] ? { backgroundImage: `url("${FRAME_IMAGES[framed]}")` } : undefined} />}
    {!url && <span>{initials ?? initialsOf(name)}</span>}
    {children}
  </span>;
}
