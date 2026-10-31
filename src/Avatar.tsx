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
  // Battle Pass season 1, gold track.
  'frame-rainy-night': '/assets/frames/rainy-night.webp',
  'frame-card-master': '/assets/frames/card-master.webp',
  'frame-blood-rose': '/assets/frames/blood-rose.webp',
  'frame-shadow-don': '/assets/frames/shadow-don.webp',
};

/*
 * Three tiers of looks:
 *   - plain (still, matte): sold for coins;
 *   - animated rings and borders: won by reaching ranks;
 *   - painted art: sold for diamonds (later also the season pass and limited offers).
 */

/** Nameplates: a wide picture behind the player's name; the decoration sits on the right, the name on the dark left. */
const NAMEPLATE_IMAGES: Record<string, string> = {
  'plate-ice-crystal': '/assets/nameplates/ice-crystal.webp',
  'plate-royal-crown': '/assets/nameplates/royal-crown.webp',
  'plate-skull-king': '/assets/nameplates/skull-king.webp',
  'plate-fire-dragon': '/assets/nameplates/fire-dragon.webp',
  // Battle Pass season 1, gold track.
  'plate-neon-alley': '/assets/nameplates/neon-alley.webp',
  'plate-casino': '/assets/nameplates/casino.webp',
  'plate-don-office': '/assets/nameplates/don-office.webp',
  // Plain plates (coins): still pictures, no light sweep.
  'plate-night-blue': '/assets/nameplates/plain/night-blue.svg',
  'plate-paper': '/assets/nameplates/plain/paper.svg',
  'plate-leather': '/assets/nameplates/plain/leather.svg',
  'plate-marble': '/assets/nameplates/plain/marble.svg',
  'plate-black-gold': '/assets/nameplates/plain/black-gold.svg',
  'plate-ornament': '/assets/nameplates/plain/ornament.svg',
  // Battle Pass free track.
  'plate-season1': '/assets/nameplates/plain/season1.svg',
};
const PLAIN_PLATES = new Set(['plate-night-blue', 'plate-paper', 'plate-leather', 'plate-marble', 'plate-black-gold', 'plate-ornament', 'plate-season1']);

/** Class and style that put the player's nameplate behind a row (see .has-nameplate in theme.css). */
export function nameplate(key: string | null | undefined): { className: string; style: CSSProperties } {
  const image = key ? NAMEPLATE_IMAGES[key] : undefined;
  return image
    ? { className: `has-nameplate ${key} ${PLAIN_PLATES.has(key!) ? 'is-plain-plate' : ''}`, style: { ['--plate' as string]: `url("${image}")` } as CSSProperties }
    : { className: '', style: {} };
}

/** Name borders: a ring around a player's whole row (see .row-border in theme.css). The plain ones stand still. */
const PLAIN_BORDERS = ['border-bronze', 'border-silver', 'border-ivory', 'border-azure', 'border-crimson', 'border-double', 'border-season1'];
export const BORDER_KEYS = ['border-gold', 'border-neon', 'border-ice', 'border-fire', 'border-ruby', 'border-royal', 'border-jade', ...PLAIN_BORDERS];

/** The border, placed as the first child of a row; the row gets `has-row-border`. */
export function RowBorder({ borderKey }: { borderKey: string | null | undefined }) {
  if (!borderKey || !BORDER_KEYS.includes(borderKey)) return null;
  return <span className={`row-border ${borderKey} ${PLAIN_BORDERS.includes(borderKey) ? 'is-plain' : ''}`} aria-hidden="true"><i /></span>;
}
export const rowBorderClass = (key: string | null | undefined) => (key && BORDER_KEYS.includes(key) ? 'has-row-border' : '');

/** Plain rings (coins): still and matte. Two carry a pattern drawn as an image. */
const PLAIN_FRAMES = ['frame-bronze', 'frame-silver', 'frame-brass', 'frame-wood', 'frame-leather', 'frame-double', 'frame-sky', 'frame-onyx', 'frame-khana', 'frame-ulzii', 'frame-season1'];
/** Plain rings whose pattern is a picture laid into the ring band (see .frame-khana in theme.css). */
const RING_ART: Record<string, string> = {
  'frame-khana': '/assets/frames/plain/khana.svg',
  'frame-ulzii': '/assets/frames/plain/ulzii.svg',
  'frame-season1': '/assets/frames/plain/season1.svg',
};
/** Animated rings won by rank (frame-gold … frame-royal were sold before ranks gave them). */
const ANIMATED_FRAMES = ['frame-gold', 'frame-neon', 'frame-ice', 'frame-fire', 'frame-blood', 'frame-royal', 'frame-smoke', 'frame-coins', 'frame-tycoon'];
/** Every avatar frame the app can draw (see the frame-* styles in theme.css). */
export const FRAME_KEYS = [...PLAIN_FRAMES, ...ANIMATED_FRAMES, ...Object.keys(FRAME_IMAGES)];

/*
 * Frame motion. Each frame moves in its own way instead of blinking: fire throws embers upward,
 * ice drops snow, roses shed petals, butterflies flutter, gold catches a passing gleam, the skull's
 * eyes glow, the mafia cigar smokes. Every particle is an <i class="fx fx-KIND"> placed by the
 * variables below and animated by the .fx-* rules in theme.css (sizes in cqw of the frame box).
 */
type FxKind = 'ember' | 'flame' | 'snow' | 'rain' | 'petal' | 'butterfly' | 'dust' | 'drip' | 'feather' | 'smoke' | 'beam' | 'eye' | 'star' | 'glint';
/** `at`: angles on the ring; `pts`: spots painted into this frame's picture (percent of the frame box). */
type FxSpec = { kind: FxKind; n: number; at?: number[]; pts?: Array<[number, number]> };
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
  'frame-rainy-night': [{ kind: 'beam', n: 1, pts: [[24.4, 31.6]] }, { kind: 'rain', n: 7 }],
  'frame-card-master': [{ kind: 'glint', n: 1 }, { kind: 'dust', n: 4 }],
  'frame-blood-rose': [{ kind: 'glint', n: 1 }, { kind: 'petal', n: 6 }],
  'frame-shadow-don': [{ kind: 'glint', n: 1 }, { kind: 'feather', n: 3 }, { kind: 'dust', n: 4 }],
  'frame-smoke': [{ kind: 'smoke', n: 5, at: [-150, -110, -70, -30, 200] }],
  'frame-coins': [{ kind: 'dust', n: 3 }],
  'frame-tycoon': [{ kind: 'star', n: 3 }, { kind: 'dust', n: 3 }],
};

/** Spots painted into the frame pictures (percent of the frame box). */
const SPOTS: Partial<Record<FxKind, Array<[number, number]>>> = {
  beam: [[66.8, 71.7], [78.9, 71.7]], // the car's headlights
  eye: [[47.7, 22.5], [52.3, 22.5]], // the skull's eyes
  smoke: [[36.7, 81.5]], // the cigar in the ashtray
};

const noise = (seed: number) => { const v = Math.sin(seed * 12.9898 + 4.1414) * 43758.5453; return v - Math.floor(v); };
const onRing = (deg: number, radius: number): [number, number] => [50 + radius * Math.cos((deg * Math.PI) / 180), 50 + radius * Math.sin((deg * Math.PI) / 180)];

function fxStyle({ kind, n, at, pts }: FxSpec, i: number, painted: boolean): CSSProperties {
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
    case 'rain': {
      // Thin streaks falling past the outside of the ring.
      x = 50 + side * (ring - 2 + 12 * r(1)); y = 50 - ring * (0.4 + 0.6 * r(2));
      dur = 0.8 + 0.5 * r(3); v['--fall'] = 40 + 20 * r(4); v['--s'] = 4 + 3 * r(6);
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
      // Painted pictures put these on fixed spots; rings spread them along the ring at the given angles.
      const spots = pts ?? (at ? at.map((deg) => onRing(deg, ring)) : SPOTS[kind] ?? [[50, 50]]);
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
      style={painted ? { backgroundImage: `url("${painted}")`, ['--frame-img' as string]: `url("${painted}")` } as CSSProperties
        : RING_ART[framed] ? { ['--ring-art' as string]: `url("${RING_ART[framed]}")` } as CSSProperties : undefined}>
      {(FRAME_FX[framed] ?? []).flatMap((spec) => Array.from({ length: spec.n }, (_, i) =>
        <i key={`${spec.kind}${i}`} className={`fx fx-${spec.kind}`} style={fxStyle(spec, i, Boolean(painted))} />))}
    </span>}
    {!url && <span>{initials ?? initialsOf(name)}</span>}
    {children}
  </span>;
}
