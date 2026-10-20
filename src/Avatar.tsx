import type { ReactNode } from 'react';

export function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??';
}

/** Round player avatar: the profile photo when there is one, otherwise coloured initials. */
export default function Avatar({ name, color, url, initials, className = '', children }: {
  name: string; color: string; url?: string | null; initials?: string; className?: string; children?: ReactNode;
}) {
  return <span className={`avatar avatar-${color} ${url ? 'has-photo' : ''} ${className}`} style={url ? { backgroundImage: `url("${url}")` } : undefined} role="img" aria-label={name}>
    {!url && <span>{initials ?? initialsOf(name)}</span>}
    {children}
  </span>;
}
