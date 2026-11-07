// The rank rules live with the Edge Functions so the server and the browser share one copy.
export * from '../supabase/functions/_shared/ranks.ts';
import { RANK_NAMES as RANK_NAMES_MN, rankInfo as sharedRankInfo, type RankGame } from '../supabase/functions/_shared/ranks.ts';
import { isEnglish } from './lang.ts';

const RANK_NAMES_EN: Record<RankGame, readonly string[]> = {
  mafia: ['Newcomer', 'Street Kid', 'Associate', 'Soldier', 'Capo', 'Consigliere', 'Right Hand', 'Don', 'Mafia Legend'],
};

/** Rank names in the player's language (the server keeps the Mongolian ones). */
export const RANK_NAMES: Record<RankGame, readonly string[]> = isEnglish ? RANK_NAMES_EN : RANK_NAMES_MN;

export function rankInfo(game: RankGame, points: number) {
  const info = sharedRankInfo(game, points);
  if (!isEnglish) return info;
  return { ...info, name: RANK_NAMES_EN[game][info.level - 1], next: info.next && { ...info.next, name: RANK_NAMES_EN[game][info.next.level - 1] } };
}
