/*
 * Computer players. They sit in real seats, but the server makes their moves:
 *  - Mafia: bots lock in a night target and a vote as soon as a phase opens (a testing aid —
 *    they cannot talk, so they are not meant for real social-deduction games).
 */
import {
  isMafiaAligned, nightRoleOf, recordVerdict, recordVote, submitNightAction,
  type GameEngineState, type RandomSource, type VoteChoice,
} from './gameEngine.ts';

export const BOT_NAMES = ['Болд', 'Сарнай', 'Тэмүүжин', 'Номин', 'Ганбат', 'Хулан', 'Мөнх', 'Ариун', 'Энх', 'Оюун', 'Тулга', 'Цэцэг'];

export const botDisplayName = (name: string) => `${name} (бот)`;

/** The first bot name not already used at this table. */
export function nextBotName(taken: string[]): string {
  const free = BOT_NAMES.find((name) => !taken.includes(botDisplayName(name)));
  return botDisplayName(free ?? `Бот ${taken.length + 1}`);
}

function shuffled<T>(items: T[], random: RandomSource): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Every living Mafia bot locks a night target, and every living bot votes, as soon as the phase allows. */
export function mafiaBotsAct(state: GameEngineState, random: RandomSource): GameEngineState {
  let next = state;
  const bots = next.publicPlayers.filter((player) => player.bot && player.alive);
  if (!bots.length) return state;

  if (next.phase === 'Night' && !next.nightResolved) {
    for (const bot of bots) {
      if (!nightRoleOf(next, bot.id) || next.privatePlayers[bot.id].nightAction.submitted) continue;
      const living = next.publicPlayers.filter((player) => player.alive);
      // Mafia bots back a target a teammate already picked, so the team does not split its votes.
      const teamPick = nightRoleOf(next, bot.id) === 'Mafia'
        ? living.find((player) => next.publicPlayers.some((other) => other.id !== bot.id && nightRoleOf(next, other.id) === 'Mafia'
          && next.privatePlayers[other.id].nightAction.targetId === player.id))
        : undefined;
      for (const target of [...(teamPick ? [teamPick] : []), ...shuffled(living, random)]) {
        const result = submitNightAction(next, bot.id, target.id);
        if (!result.error) { next = result.state; break; }
      }
    }
  }

  if (next.phase === 'Voting' && !next.votesRevealed && next.trial) {
    const trial = next.trial;
    for (const bot of bots) {
      if (bot.id === trial.accusedId || next.trial?.verdicts[bot.id]) continue;
      const secret = next.privatePlayers[bot.id];
      // A Mafia-side bot shields a known teammate and pushes everyone else out; town bots lean guilty.
      const shield = isMafiaAligned(secret.role) && secret.info.mafiaTeammateIds.includes(trial.accusedId);
      const verdict = shield ? 'innocent' : isMafiaAligned(secret.role) ? 'guilty' : random() < 0.65 ? 'guilty' : 'innocent';
      const result = recordVerdict(next, bot.id, verdict);
      if (!result.error) next = result.state;
    }
  }

  if (next.phase === 'Voting' && !next.votesRevealed && !next.trial) {
    for (const bot of bots) {
      const secret = next.privatePlayers[bot.id];
      if (secret.vote.submitted) continue;
      const onMafiaSide = isMafiaAligned(secret.role);
      const options = next.publicPlayers.filter((player) => player.alive && player.id !== bot.id
        && (!next.runoffCandidates || next.runoffCandidates.includes(player.id))
        // A Mafia-side bot never votes out a teammate it knows about.
        && !(onMafiaSide && secret.info.mafiaTeammateIds.includes(player.id)));
      const choice: VoteChoice = options.length && random() > 0.15 ? shuffled(options, random)[0].id : 'skip';
      const result = recordVote(next, bot.id, choice);
      next = result.error ? recordVote(next, bot.id, 'skip').state : result.state;
    }
  }
  return next;
}
