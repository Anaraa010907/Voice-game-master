import type { ReactNode } from 'react';

export function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??';
}

/** Animated avatar frames sold in the shop (see the frame-* styles in theme.css). */
export const FRAME_KEYS = ['frame-gold', 'frame-neon', 'frame-ice', 'frame-fire', 'frame-blood', 'frame-royal'];

/**
 * Round player avatar: the profile photo when there is one, otherwise coloured initials.
 * `frame` adds the player's animated shop frame around it.
 */
export default function Avatar({ name, color, url, initials, frame, className = '', children }: {
  name: string; color: string; url?: string | null; initials?: string; frame?: string | null; className?: string; children?: ReactNode;
}) {
  const framed = frame && FRAME_KEYS.includes(frame) ? frame : null;
  return <span className={`avatar avatar-${color} ${url ? 'has-photo' : ''} ${framed ? `has-frame ${framed}` : ''} ${className}`} style={url ? { backgroundImage: `url("${url}")` } : undefined} role="img" aria-label={name}>
    {framed && <span className="avatar-frame" aria-hidden="true" />}
    {!url && <span>{initials ?? initialsOf(name)}</span>}
    {children}
  </span>;
}
