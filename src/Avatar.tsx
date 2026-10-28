import type { CSSProperties, ReactNode } from 'react';

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

/** Nameplates: a wide picture behind the player's name; the decoration sits on the right, the name on the dark left. */
const NAMEPLATE_IMAGES: Record<string, string> = {
  'plate-ice-crystal': '/assets/nameplates/ice-crystal.webp',
  'plate-royal-crown': '/assets/nameplates/royal-crown.webp',
  'plate-skull-king': '/assets/nameplates/skull-king.webp',
  'plate-fire-dragon': '/assets/nameplates/fire-dragon.webp',
};

/** Class and style that put the player's nameplate behind a row (see .has-nameplate in theme.css). */
export function nameplate(key: string | null | undefined): { className: string; style: CSSProperties } {
  const image = key ? NAMEPLATE_IMAGES[key] : undefined;
  return image ? { className: `has-nameplate ${key}`, style: { ['--plate' as string]: `url("${image}")` } as CSSProperties } : { className: '', style: {} };
}

/** Name borders: a shining ring around a player's whole row (see .row-border in theme.css). */
export const BORDER_KEYS = ['border-gold', 'border-neon', 'border-ice', 'border-fire', 'border-ruby', 'border-royal'];

/** The animated border, placed as the first child of a row; the row gets `has-row-border`. */
export function RowBorder({ borderKey }: { borderKey: string | null | undefined }) {
  if (!borderKey || !BORDER_KEYS.includes(borderKey)) return null;
  return <span className={`row-border ${borderKey}`} aria-hidden="true"><i /></span>;
}
export const rowBorderClass = (key: string | null | undefined) => (key && BORDER_KEYS.includes(key) ? 'has-row-border' : '');

/** Avatar frames sold in the shop: CSS-animated rings plus painted ones (see the frame-* styles in theme.css). */
export const FRAME_KEYS = ['frame-gold', 'frame-neon', 'frame-ice', 'frame-fire', 'frame-blood', 'frame-royal', ...Object.keys(FRAME_IMAGES)];

/*
 * Frame motion. Each frame moves in its own way instead of blinking: fire throws embers upward,
 * ice drops snow, roses shed petals, butterflies flutter, gold catches a passing gleam, the skull's
 * eyes glow, the mafia cigar smokes. Every particle is an <i class="fx fx-KIND"> placed by the
 * variables below and animated by the .fx-* rules in theme.css (sizes in cqw of the frame box).
 */
type FxKind = 'ember' | 'flame' | 'snow' | 'petal' | 'butterfly' | 'dust' | 'drip' | 'feather' | 'smoke' | 'beam' | 'eye' | 'star' | 'glint';
type FxSpec = { kind: FxKind; n: number; at?: number[] };
const FRAME_FX: Record<string, FxSpec[]> = {
  'frame-gold': [{ kind: 'dust', n: 4 }],
  'frame-neon': [{ kind: 'star', n: 3 }],
  'frame-ice': [{ kind: 'snow', n: 7 }],
  'frame-fire': [{ kind: 'ember', n: 8 }],
  'frame-blood': [{ kind: 'drip', n: 3 }],
  'frame-royal': [{ kind: 'star', n: 4 }],
  'frame-rose-night': [{ kind: 'petal', n: 6 }, { kind: 'butterfly', n: 1, at: [-140] }],
  'frame-butterfly': [{ kind: 'glint', n: 1 }, { kind: 'butterfly', n: 2, at: [-35, 150] }, { kind: 'dust', n: 4 }],
  'frame-ice-butterfly': [{ kind: 'glint', n: 1 }, { kind: 'snow', n: 6 }, { kind: 'butterfly', n: 1, at: [-40] }],
  'frame-fire-dragon': [{ kind: 'flame', n: 2 }, { kind: 'ember', n: 9 }],
  'frame-twin-serpent': [{ kind: 'flame', n: 2 }, { kind: 'ember', n: 9 }],
  'frame-mafia-city': [{ kind: 'glint', n: 1 }, { kind: 'beam', n: 2 }, { kind: 'smoke', n: 4 }],
  'frame-gold-skull': [{ kind: 'glint', n: 1 }, { kind: 'eye', n: 2 }, { kind: 'dust', n: 4 }],
  'frame-eagle-crown': [{ kind: 'glint', n: 1 }, { kind: 'feather', n: 3 }],
};

/** Spots painted into the frame pictures (percent of the frame box). */
const SPOTS: Partial<Record<FxKind, Array<[number, number]>>> = {
  beam: [[66.8, 71.7], [78.9, 71.7]], // the car's headlights
  eye: [[47.7, 22.5], [52.3, 22.5]], // the skull's eyes
  smoke: [[36.7, 81.5]], // the cigar in the ashtray
};

const noise = (seed: number) => { const v = Math.sin(seed * 12.9898 + 4.1414) * 43758.5453; return v - Math.floor(v); };
const onRing = (deg: number, radius: number): [number, number] => [50 + radius * Math.cos((deg * Math.PI) / 180), 50 + radius * Math.sin((deg * Math.PI) / 180)];

function fxStyle({ kind, n, at }: FxSpec, i: number, painted: boolean): CSSProperties {
  const r = (k: number) => noise(i * 31 + k * 7 + kind.length * 101);
  // Painted pictures have their ring at about 36% of the box from the centre; CSS rings sit at 47%.
  const ring = painted ? 36 : 47;
  const side = i % 2 === 0 ? -1 : 1;
  const v: Record<string, string | number> = {};
  let [x, y] = [50, 50];
  let dur = 3;
  switch (kind) {
    case 'ember': {
      // Along the top and the sides (never below the photo), drifting up and away.
      [x, y] = onRing(-200 + 220 * ((i + 0.2 + r(1) * 0.6) / n), ring + 4 * r(2));
      dur = 1.5 + 1.2 * r(3); v['--rise'] = 16 + 18 * r(4); v['--sway'] = (r(5) - 0.5) * 14; v['--s'] = 2.2 + 2.2 * r(6);
      break;
    }
    case 'snow': case 'petal': case 'dust': {
      // Down the outside of the ring, left and right in turn.
      x = 50 + side * (ring - 6 + 14 * r(1)); y = 50 - ring * (0.25 + 0.7 * r(2));
      dur = kind === 'petal' ? 4.2 + 2 * r(3) : kind === 'dust' ? 3.4 + 2 * r(3) : 3.6 + 2.6 * r(3);
      v['--fall'] = 34 + 22 * r(4); v['--sway'] = 3 + 4 * r(5);
      v['--s'] = kind === 'petal' ? 5 + 2.4 * r(6) : kind === 'dust' ? 1.6 + 1.4 * r(6) : 2.4 + 2.6 * r(6);
      break;
    }
    case 'butterfly': {
      [x, y] = onRing(at?.[i] ?? (side < 0 ? -130 : -50), ring + 7);
      dur = 5.5 + 2 * r(3); v['--w'] = 7 + 4 * r(4); v['--s'] = 13 + 3 * r(5);
      break;
    }
    case 'drip': {
      [x, y] = onRing(90 + (i - (n - 1) / 2) * 24 + (r(1) - 0.5) * 8, ring + 1);
      dur = 2.8 + 1.6 * r(3); v['--fall'] = 14 + 10 * r(4); v['--s'] = 2.6 + 0.8 * r(5);
      break;
    }
    case 'feather': {
      // From the eagles' wings.
      x = side < 0 ? 8 + 9 * r(1) : 83 + 9 * r(1); y = 16 + 8 * r(2);
      dur = 6 + 2.5 * r(3); v['--fall'] = 50 + 14 * r(4); v['--sway'] = 5 + 3 * r(5); v['--s'] = 11 + 3 * r(6);
      break;
    }
    case 'smoke': case 'beam': case 'eye': {
      const spots = SPOTS[kind] ?? [[50, 50]];
      [x, y] = spots[i % spots.length];
      if (kind === 'smoke') { x += (r(1) - 0.5) * 1.5; dur = 3.4 + 1.4 * r(3); v['--rise'] = 22 + 12 * r(4); v['--sway'] = (r(5) - 0.5) * 12; v['--s'] = 6 + 2.5 * r(6); }
      else if (kind === 'beam') { dur = 3.4; v['--s'] = 13; }
      else { dur = 3.8; v['--s'] = 3.6; }
      break;
    }
    case 'star': {
      v['--a'] = `${Math.round((360 / n) * i)}deg`; v['--orbit'] = ring + 3; dur = 7; v['--s'] = 4.5;
      break;
    }
    case 'flame': dur = 1.4; break;
    case 'glint': dur = 5; break;
  }
  v['--x'] = `${x.toFixed(1)}%`; v['--y'] = `${y.toFixed(1)}%`;
  v['--dur'] = `${dur.toFixed(2)}s`;
  // Negative delays spread the particles through their cycle so the motion never starts in a burst.
  v['--delay'] = kind === 'glint' || kind === 'beam' || kind === 'eye' ? `${(-i * 0.4).toFixed(2)}s` : `${(-((i + r(9) * 0.5) / n) * dur).toFixed(2)}s`;
  return v as CSSProperties;
}

/**
 * Round player avatar: the profile photo when there is one, otherwise coloured initials.
 * `frame` adds the player's animated shop frame around it.
 */
export default function Avatar({ name, color, url, initials, frame, className = '', children }: {
  name: string; color: string; url?: string | null; initials?: string; frame?: string | null; className?: string; children?: ReactNode;
}) {
  const framed = frame && FRAME_KEYS.includes(frame) ? frame : null;
  const painted = framed ? FRAME_IMAGES[framed] : undefined;
  return <span className={`avatar avatar-${color} ${url ? 'has-photo' : ''} ${framed ? `has-frame ${framed}` : ''} ${className}`} style={url ? { backgroundImage: `url("${url}")` } : undefined} role="img" aria-label={name}>
    {framed && <span className={`avatar-frame ${painted ? 'is-painted' : ''}`} aria-hidden="true"
      style={painted ? { backgroundImage: `url("${painted}")`, ['--frame-img' as string]: `url("${painted}")` } as CSSProperties : undefined}>
      {(FRAME_FX[framed] ?? []).flatMap((spec) => Array.from({ length: spec.n }, (_, i) =>
        <i key={`${spec.kind}${i}`} className={`fx fx-${spec.kind}`} style={fxStyle(spec, i, Boolean(painted))} />))}
    </span>}
    {!url && <span>{initials ?? initialsOf(name)}</span>}
    {children}
  </span>;
}
