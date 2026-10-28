/*
 * Ranked play. Mafia and the board game each have their own ladder of nine ranks. Points are won
 * and lost only in ranked rooms (people only, no bots, standard rules). Reaching a rank from the
 * second one up unlocks its title for good, even if the player later drops back.
 * The database mirrors RANK_THRESHOLDS in public.rank_level() and the title keys in shop_items.
 */
export type RankGame = 'mafia' | 'monopoly';
export const RANK_GAMES: RankGame[] = ['mafia', 'monopoly'];

/** Points needed for ranks 1 to 9. */
export const RANK_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2600] as const;
export const MAX_RANK_LEVEL = RANK_THRESHOLDS.length;

export const RANK_NAMES: Record<RankGame, readonly string[]> = {
  mafia: ['Шинэ хүн', 'Гудамжны хүү', 'Туслах', 'Цэрэг', 'Капо', 'Зөвлөх', 'Баруун гар', 'Дон', 'Мафийн домог'],
  monopoly: ['Шинэ наймаачин', 'Наймаачин', 'Худалдаачин', 'Газрын эзэн', 'Банкир', 'Хөрөнгөтөн', 'Магнат', 'Тэрбумтан', 'Монополийн хаан'],
};

/** The metal of each rank: it colours the emblem and the title plaque. */
export const RANK_METALS = ['iron', 'bronze', 'silver', 'gold', 'emerald', 'sapphire', 'ruby', 'amethyst', 'legend'] as const;
export type RankMetal = (typeof RANK_METALS)[number];

/** Points for one ranked game. Leaving a ranked game early costs more than losing it. */
export const RANK_POINTS = {
  mafiaWin: 20,
  /** Extra for winners who are still alive at the end. */
  mafiaAliveBonus: 4,
  mafiaLoss: -12,
  boardWin: 30,
  /** Lost, but still in business when the game ended. */
  boardSurvived: -6,
  boardBankrupt: -12,
  leave: -20,
} as const;

export function mafiaRankDelta(won: boolean, alive: boolean) {
  return won ? RANK_POINTS.mafiaWin + (alive ? RANK_POINTS.mafiaAliveBonus : 0) : RANK_POINTS.mafiaLoss;
}

export function boardRankDelta(won: boolean, bankrupt: boolean) {
  return won ? RANK_POINTS.boardWin : bankrupt ? RANK_POINTS.boardBankrupt : RANK_POINTS.boardSurvived;
}

const safe = (points: number) => Math.max(0, Math.floor(Number.isFinite(points) ? points : 0));

export function rankLevel(points: number) {
  const value = safe(points);
  let level = 1;
  RANK_THRESHOLDS.forEach((min, index) => { if (value >= min) level = index + 1; });
  return level;
}

export function rankInfo(game: RankGame, points: number) {
  const value = safe(points);
  const level = rankLevel(value);
  const min = RANK_THRESHOLDS[level - 1];
  const nextMin = level < MAX_RANK_LEVEL ? RANK_THRESHOLDS[level] : null;
  return {
    game,
    points: value,
    level,
    name: RANK_NAMES[game][level - 1],
    metal: RANK_METALS[level - 1],
    min,
    next: nextMin === null ? null : { level: level + 1, name: RANK_NAMES[game][level], min: nextMin },
    progress: nextMin === null ? 100 : Math.round(((value - min) / (nextMin - min)) * 100),
    toNext: nextMin === null ? 0 : nextMin - value,
  };
}

/** The title a rank unlocks (none for the first rank). */
export function rankTitleKey(game: RankGame, level: number) {
  return level >= 2 && level <= MAX_RANK_LEVEL ? `title-${game === 'mafia' ? 'mafia' : 'mono'}-${level}` : null;
}

export function parseRankTitle(key: string | null | undefined): { game: RankGame; level: number } | null {
  const match = key ? /^title-(mafia|mono)-([2-9])$/.exec(key) : null;
  return match ? { game: match[1] === 'mafia' ? 'mafia' : 'monopoly', level: Number(match[2]) } : null;
}
