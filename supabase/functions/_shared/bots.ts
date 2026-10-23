/*
 * Computer players. They sit in real seats, but the server makes their moves:
 *  - Mafia: bots lock in a night target and a vote as soon as a phase opens (a testing aid —
 *    they cannot talk, so they are not meant for real social-deduction games).
 *  - Board game: bots take one step (roll, buy or pass, build, end turn) each time their short
 *    turn timer runs out, so humans can watch their dice and moves.
 */
import {
  isMafiaAligned, nightRoleOf, recordVerdict, recordVote, submitNightAction,
  type GameEngineState, type RandomSource, type VoteChoice,
} from './gameEngine.ts';
import {
  BOARD, JAIL_FINE, applyMonopolyAction, autoPlay, canBuild, currentPlayerId,
  type MonopolyAction, type MonopolyState,
} from './monopolyEngine.ts';

export const BOT_NAMES = ['Болд', 'Сарнай', 'Тэмүүжин', 'Номин', 'Ганбат', 'Хулан', 'Мөнх', 'Ариун', 'Энх', 'Оюун', 'Тулга', 'Цэцэг'];
/** Seconds a board-game bot "thinks" before each step, so its moves are visible. */
export const BOT_STEP_SECONDS = 2;

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

/** One sensible step for the board-game bot whose turn it is. */
export function monopolyBotStep(state: MonopolyState, random: RandomSource): MonopolyState {
  if (state.phase === 'finished') return state;
  const id = currentPlayerId(state);
  const me = state.players.find((entry) => entry.id === id);
  if (!me) return autoPlay(state, random);
  const attempt = (action: MonopolyAction) => {
    const result = applyMonopolyAction(state, id, action, random);
    return result.error ? null : result.state;
  };

  if (state.phase === 'roll') {
    // Pays its way out of jail when it can comfortably afford it.
    if (me.inJail && me.money >= JAIL_FINE + 250) {
      const paid = attempt({ type: 'pay-jail' });
      if (paid) return paid;
    }
    return attempt({ type: 'roll' }) ?? autoPlay(state, random);
  }

  if (state.phase === 'buy') {
    const price = BOARD[me.position].price;
    if (price !== undefined && me.money - price >= 120) {
      const bought = attempt({ type: 'buy' });
      if (bought) return bought;
    }
    return attempt({ type: 'decline' }) ?? autoPlay(state, random);
  }

  // End of turn: builds one house at a time while it keeps a cash cushion.
  for (const tile of BOARD) {
    if (tile.kind !== 'property' || tile.houseCost === undefined) continue;
    if (state.tiles[tile.id].owner !== id || me.money - tile.houseCost < 300 || !canBuild(state, id, tile.id)) continue;
    const built = attempt({ type: 'build', tile: tile.id });
    if (built) return built;
  }
  return attempt({ type: 'end' }) ?? autoPlay(state, random);
}

/** True when the board-game player to move is a bot. */
export function boardBotToMove(state: MonopolyState): boolean {
  if (state.phase === 'finished') return false;
  return state.players.find((entry) => entry.id === currentPlayerId(state))?.bot === true;
}
