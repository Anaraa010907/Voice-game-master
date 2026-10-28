import { useId } from 'react';
import { MAX_RANK_LEVEL, RANK_METALS, RANK_NAMES, rankInfo, type RankGame, type RankMetal } from './rankRules';

export const RANK_GAME_LABEL: Record<RankGame, string> = { mafia: 'Мафи', monopoly: 'Монополь' };

/** Painted emblems replace the drawn ones where they exist (512px, same canvas for every rank). */
const RANK_IMAGES: Partial<Record<RankGame, Partial<Record<number, string>>>> = {
  mafia: Object.fromEntries(Array.from({ length: MAX_RANK_LEVEL }, (_, index) => [index + 1, `/assets/ranks/mafia-${index + 1}.webp`])),
  monopoly: Object.fromEntries(Array.from({ length: MAX_RANK_LEVEL }, (_, index) => [index + 1, `/assets/ranks/monopoly-${index + 1}.webp`])),
};

/** Metal (light, mid, dark) and enamel (centre, edge) of each rank. */
const PALETTE: Record<RankMetal, { hi: string; mid: string; lo: string; e1: string; e2: string }> = {
  iron: { hi: '#eef1f5', mid: '#959ca7', lo: '#3c424b', e1: '#30353e', e2: '#121418' },
  bronze: { hi: '#ffe0bd', mid: '#c98a4f', lo: '#5e3416', e1: '#47291a', e2: '#170c06' },
  silver: { hi: '#ffffff', mid: '#bcc6d3', lo: '#56606d', e1: '#26354a', e2: '#0b111a' },
  gold: { hi: '#fff4c8', mid: '#e5b65a', lo: '#7a5016', e1: '#4a300b', e2: '#140c02' },
  emerald: { hi: '#dcffec', mid: '#45c78a', lo: '#0d5a39', e1: '#11402d', e2: '#03140d' },
  sapphire: { hi: '#e1eeff', mid: '#5b95ff', lo: '#14307a', e1: '#14295e', e2: '#040a1c' },
  ruby: { hi: '#ffdbe0', mid: '#f0566d', lo: '#6d0d1f', e1: '#4d0c19', e2: '#170307' },
  amethyst: { hi: '#f3e2ff', mid: '#b878ff', lo: '#4a1680', e1: '#341159', e2: '#0e0419' },
  legend: { hi: '#fff6d2', mid: '#ffb347', lo: '#8a3a10', e1: '#5a1236', e2: '#12030b' },
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const SHIELD = 'M60 8 L102 22 V60 C102 90 85 110 60 124 C35 110 18 90 18 60 V22 Z';
const SHIELD_INNER = 'M60 17 L93 28 V60 C93 84 79 101 60 113 C41 101 27 84 27 60 V28 Z';
const WING = 'M22 30 C8 20 -8 22 -13 32 C-5 33 3 36 9 41 C-3 41 -11 49 -14 58 C-4 55 4 55 12 58 C2 62 -5 70 -5 79 C4 73 12 71 20 73 Z';

/** Laurel leaves up one side of the shield (mirrored for the other side). */
const LEAVES = Array.from({ length: 6 }, (_, index) => {
  const angle = 104 + index * 17;
  const radians = (angle * Math.PI) / 180;
  return { x: 60 + 54 * Math.cos(radians), y: 64 + 54 * Math.sin(radians), rotate: angle + 115 };
});

/** Flame tongues around the shield for the top rank. */
const FLAMES = (() => {
  const points = 18;
  let path = '';
  for (let index = 0; index < points; index += 1) {
    const outer = ((index / points) * 2 - 0.5) * Math.PI;
    const inner = (((index + 0.5) / points) * 2 - 0.5) * Math.PI;
    const tall = index % 2 === 0 ? 70 : 62;
    const ox = 60 + tall * Math.cos(outer);
    const oy = 64 + tall * Math.sin(outer) * 1.05;
    const ix = 60 + 46 * Math.cos(inner);
    const iy = 64 + 46 * Math.sin(inner);
    path += `${index === 0 ? 'M' : 'L'}${ox.toFixed(1)} ${oy.toFixed(1)} Q${((ox + ix) / 2 + 4).toFixed(1)} ${((oy + iy) / 2).toFixed(1)} ${ix.toFixed(1)} ${iy.toFixed(1)} `;
  }
  return `${path}Z`;
})();

/**
 * A rank emblem: a metal shield with the game's symbol and the rank's numeral. Higher ranks add
 * laurels (3+), a jewel (4+), wings (5+), light rays (6+), a crown (7+) and flames (9).
 */
export default function RankEmblem({ game, level, className = '' }: { game: RankGame; level: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const safeLevel = Math.min(MAX_RANK_LEVEL, Math.max(1, Math.round(level) || 1));
  const metal = RANK_METALS[safeLevel - 1];
  const name = RANK_NAMES[game][safeLevel - 1];
  const image = RANK_IMAGES[game]?.[safeLevel];
  if (image) return <img className={`rank-crest metal-${metal} ${className}`} src={image} alt={name} draggable={false} />;
  const color = PALETTE[metal];
  const metalFill = `url(#${id}m)`;
  return <svg className={`rank-crest metal-${metal} level-${safeLevel} ${className}`} viewBox="-18 -16 156 160" role="img" aria-label={name}>
    <defs>
      <linearGradient id={`${id}m`} x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stopColor={color.hi} /><stop offset=".42" stopColor={color.mid} /><stop offset=".7" stopColor={color.lo} /><stop offset="1" stopColor={color.mid} />
      </linearGradient>
      <radialGradient id={`${id}e`} cx=".5" cy=".36" r=".75">
        <stop offset="0" stopColor={color.e1} /><stop offset="1" stopColor={color.e2} />
      </radialGradient>
      <radialGradient id={`${id}f`} cx=".5" cy=".55" r=".55">
        <stop offset=".55" stopColor="#ffcf5a" /><stop offset=".8" stopColor="#ff5a1f" /><stop offset="1" stopColor="#b0103a" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <clipPath id={`${id}c`}><path d={SHIELD} /></clipPath>
    </defs>
    {safeLevel >= 9 && <path className="em-flames" d={FLAMES} fill={`url(#${id}f)`} />}
    {safeLevel >= 6 && <g className="em-rays" opacity=".5">
      {Array.from({ length: 12 }, (_, index) => <path key={index} d="M60 64 L56 -10 L64 -10 Z" fill={color.hi} opacity=".45" transform={`rotate(${index * 30} 60 64)`} />)}
    </g>}
    {safeLevel >= 5 && <g className="em-wings" fill={metalFill} stroke={color.lo} strokeWidth="1.2" strokeLinejoin="round">
      <path d={WING} /><path d={WING} transform="translate(120 0) scale(-1 1)" />
    </g>}
    {safeLevel >= 3 && <g className="em-laurel" fill={metalFill} stroke={color.lo} strokeWidth=".8">
      {LEAVES.map((leaf, index) => <ellipse key={`l${index}`} cx={leaf.x} cy={leaf.y} rx="7.5" ry="3.2" transform={`rotate(${leaf.rotate} ${leaf.x} ${leaf.y})`} />)}
      {LEAVES.map((leaf, index) => <ellipse key={`r${index}`} cx={120 - leaf.x} cy={leaf.y} rx="7.5" ry="3.2" transform={`rotate(${180 - leaf.rotate} ${120 - leaf.x} ${leaf.y})`} />)}
    </g>}
    <path d={SHIELD} fill={metalFill} stroke={color.lo} strokeWidth="2" />
    <path d={SHIELD_INNER} fill={`url(#${id}e)`} stroke={color.lo} strokeWidth="1.5" />
    <path d="M27 28 L60 17 L93 28" fill="none" stroke={color.hi} strokeOpacity=".7" strokeWidth="1.2" />
    {game === 'mafia'
      ? <g className="em-symbol" fill={metalFill} stroke={color.lo} strokeWidth="1">
        <path d="M42 70 C41 58 44 47 51 44 C55 42 57 46 60 46 C63 46 65 42 69 44 C76 47 79 58 78 70 Z" />
        <path d="M42.6 63 L77.4 63 L78 70 L42 70 Z" fill={color.e2} />
        <path d="M28 73 C38 81 82 81 92 73 C88 69 81 68 77 68 L43 68 C39 68 32 69 28 73 Z" />
      </g>
      : <g className="em-symbol" fill={metalFill} stroke={color.lo} strokeWidth="1">
        <path d="M33 54 L60 39 L87 54 Z" />
        <rect x="35" y="55" width="50" height="5" />
        {[38.5, 50, 62.5, 74].map((x) => <rect key={x} x={x} y="61" width="7.5" height="17" />)}
        <rect x="33" y="79" width="54" height="5" /><rect x="30" y="84.5" width="60" height="4" />
      </g>}
    {safeLevel >= 4 && <path d="M60 21 L64 26 L60 31 L56 26 Z" fill={color.hi} stroke={color.lo} strokeWidth=".8" />}
    <g clipPath={`url(#${id}c)`}><rect className="em-shine" x="-30" y="0" width="26" height="130" fill={`url(#${id}s)`} transform="skewX(-18)" /></g>
    <path d="M30 94 L90 94 L95 102 L90 110 L30 110 L25 102 Z" fill={color.e2} stroke={metalFill} strokeWidth="2" />
    <text x="60" y="102.5" textAnchor="middle" dominantBaseline="central" fill={color.hi} fontSize="12" fontWeight="700" fontFamily="Georgia, 'Times New Roman', serif" letterSpacing="1">{ROMAN[safeLevel - 1]}</text>
    {safeLevel >= 7 && <g className="em-crown" fill={metalFill} stroke={color.lo} strokeWidth="1.2" strokeLinejoin="round">
      <path d="M40 14 L35 -3 L48 6 L60 -9 L72 6 L85 -3 L80 14 Z" />
      <rect x="40" y="12" width="40" height="5" rx="1.5" />
      {[[35, -3], [60, -9], [85, -3]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="2.8" fill={metal === 'legend' ? '#ff5a3a' : color.hi} />)}
    </g>}
  </svg>;
}

/** Small emblem with the game and rank name, for profiles and player cards. */
export function RankChip({ game, points, onClick }: { game: RankGame; points: number; onClick?: () => void }) {
  const info = rankInfo(game, points);
  const body = <>
    <RankEmblem game={game} level={info.level} className="rank-chip-emblem" />
    <span className="rank-chip-copy"><small>{RANK_GAME_LABEL[game]}</small><b>{info.name}</b><i>{info.points} оноо</i></span>
    {info.next && <span className="rank-chip-bar" aria-hidden="true"><i style={{ width: `${info.progress}%` }} /></span>}
  </>;
  return onClick
    ? <button type="button" className={`rank-chip metal-${info.metal}`} onClick={onClick} aria-label={`${RANK_GAME_LABEL[game]} рэйтинг: ${info.name}, ${info.points} оноо`}>{body}</button>
    : <span className={`rank-chip metal-${info.metal}`}>{body}</span>;
}
