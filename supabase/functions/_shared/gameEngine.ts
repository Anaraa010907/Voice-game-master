/**
 * MAFIA: SHADOWS rules engine.
 *
 * Pure TypeScript with no imports, so the same file runs in the browser (Vite), in Node tests
 * and in Supabase Edge Functions (Deno). The server is the only place that mutates a real game;
 * clients only ever see the public projection and their own private slice.
 */

export type RoleName =
  | 'Mafia'
  | 'Doctor'
  | 'Detective'
  | 'Good Informant'
  | 'Bad Informant'
  | 'Old Lady with Shotgun'
  | 'Citizen';

export type Team = 'town' | 'mafia' | 'wildcard';

export const roleTeams: Record<RoleName, Team> = {
  Mafia: 'mafia',
  Doctor: 'town',
  Detective: 'town',
  'Good Informant': 'town',
  'Bad Informant': 'mafia',
  'Old Lady with Shotgun': 'town',
  Citizen: 'town',
};

export type EnginePlayer = { id: number; name: string; initials: string; color: string; host?: boolean };

export type GamePhase = 'Role Reveal' | 'Night' | 'Morning' | 'Discussion' | 'Voting' | 'Results';
export type VoteChoice = number | 'skip' | null;
export type WinningTeam = 'Citizens' | 'Mafia' | null;
export type NightRole = 'Mafia' | 'Doctor' | 'Detective';

export type PublicGamePlayer = Pick<EnginePlayer, 'id' | 'name' | 'initials' | 'color' | 'host'> & {
  alive: boolean;
  voteStatus: 'hidden' | 'revealed' | 'not-eligible';
  voteTargetId: number | null;
  /** Set only when a player is voted out: the town learns their role. Night victims stay hidden. */
  revealedRole: RoleName | null;
};

export type PrivatePlayerInfo = {
  mafiaTeammateIds: number[];
  informantMafiaIds: number[];
  badInformantObjective: string;
  investigationResult: string;
  protectionResult: string;
  traceExplanation: string;
};

export type PrivateGamePlayer = {
  role: RoleName;
  team: Team;
  info: PrivatePlayerInfo;
  nightAction: { submitted: boolean; targetId: number | null };
  vote: { submitted: boolean; choice: VoteChoice };
  /** Doctor only: who was protected last night (cannot be protected two nights in a row). */
  lastProtectedId: number | null;
  /** Detective only: everything learned so far, kept across nights. */
  knownAlignment: Record<number, 'mafia' | 'town'>;
  /** Old Lady only: the single retaliation shot has been fired. */
  shotgunSpent: boolean;
};

export type GameEngineState = {
  phase: GamePhase;
  round: number;
  publicPlayers: PublicGamePlayer[];
  privatePlayers: Record<number, PrivateGamePlayer>;
  nightResolved: boolean;
  retaliationResolved: boolean;
  tracePlayerIds: number[];
  morningReport: string;
  publicEventLog: string[];
  voteCounts: Record<string, number>;
  voteSummary: string;
  votesRevealed: boolean;
  /** A tied ballot triggers exactly one runoff between the tied players. */
  runoffCandidates: number[] | null;
  runoffUsed: boolean;
  winner: WinningTeam;
};

export type EngineResult = { state: GameEngineState; error?: string };
export type RandomSource = () => number;

export const MIN_PLAYERS = 4;

const traceStories = [
  'A torn ticket stub from the last train was caught in the fence nearby.',
  'A few drops of rainwater and ash marked the path beside the scene.',
  'A thread of dark wool snagged on the gate after the storm.',
  'Fresh grit from the river walk was pressed into the wet pavement.',
  'A faint trace of machine oil led away toward the street.',
];
const locations = ['the old rail yard', 'the riverside arcade', 'an alley off Bell Street', 'the shuttered cinema'];
const methods = ['a single gunshot', 'a broken bottle', 'a length of piano wire', 'a blunt strike in the dark'];

const defaultRandom: RandomSource = () => Math.random();

function shuffle<T>(items: T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function pick<T>(items: T[], random: RandomSource): T | undefined {
  if (!items.length) return undefined;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function isMafiaAligned(role: RoleName): boolean {
  return roleTeams[role] === 'mafia';
}

function alignmentSentence(name: string, mafiaAligned: boolean) {
  return `${name} is ${mafiaAligned ? 'aligned with the Mafia' : 'not aligned with the Mafia'}.`;
}

/**
 * The night action a living player can actually perform. A Bad Informant inherits the
 * Mafia's attack once every Mafia member is gone, so the Mafia side is never left without a killer.
 */
export function nightRoleOf(state: Pick<GameEngineState, 'publicPlayers' | 'privatePlayers'>, playerId: number): NightRole | null {
  const player = state.publicPlayers.find((candidate) => candidate.id === playerId);
  const secret = state.privatePlayers[playerId];
  if (!player?.alive || !secret) return null;
  if (secret.role === 'Mafia' || secret.role === 'Doctor' || secret.role === 'Detective') return secret.role;
  if (secret.role === 'Bad Informant') {
    const mafiaLeft = state.publicPlayers.some((candidate) => candidate.alive && state.privatePlayers[candidate.id].role === 'Mafia');
    if (!mafiaLeft) return 'Mafia';
  }
  return null;
}

/** The roles dealt for a table of this size, before shuffling. */
export function roleComposition(playerCount: number): RoleName[] {
  const pool: RoleName[] = ['Mafia', 'Doctor', 'Detective'];
  const mafiaQuota = Math.max(1, Math.floor((playerCount - 1) / 3));
  let mafiaCount = 1;
  if (playerCount >= 5) pool.push('Good Informant');
  if (playerCount >= 6) pool.push('Old Lady with Shotgun');
  if (playerCount >= 7) {
    pool.push('Bad Informant');
    mafiaCount += 1;
  }
  while (mafiaCount < mafiaQuota) {
    pool.push('Mafia');
    mafiaCount += 1;
  }
  while (pool.length < playerCount) pool.push('Citizen');
  return pool.slice(0, Math.max(playerCount, pool.length));
}

export function createInitialGame(
  players: EnginePlayer[],
  assignments?: Partial<Record<number, RoleName>>,
  random: RandomSource = defaultRandom,
): GameEngineState {
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error('Player IDs must be unique.');
  const shuffled = shuffle(roleComposition(players.length), random);
  const roleById = Object.fromEntries(players.map((player, index) => [player.id, assignments?.[player.id] ?? shuffled[index]])) as Record<number, RoleName>;
  const mafiaIds = players.filter((other) => isMafiaAligned(roleById[other.id])).map((other) => other.id);
  const privatePlayers = Object.fromEntries(players.map((player) => {
    const role = roleById[player.id];
    return [player.id, {
      role,
      team: roleTeams[role],
      info: {
        mafiaTeammateIds: role === 'Mafia' ? mafiaIds.filter((id) => id !== player.id && roleById[id] === 'Mafia') : [],
        informantMafiaIds: role === 'Good Informant' ? mafiaIds : [],
        badInformantObjective: role === 'Bad Informant' ? 'Help the Mafia survive and mislead the citizens.' : '',
        investigationResult: '',
        protectionResult: '',
        traceExplanation: '',
      },
      nightAction: { submitted: false, targetId: null },
      vote: { submitted: false, choice: null },
      lastProtectedId: null,
      knownAlignment: {},
      shotgunSpent: false,
    } satisfies PrivateGamePlayer];
  })) as Record<number, PrivateGamePlayer>;

  return {
    phase: 'Role Reveal',
    round: 1,
    publicPlayers: players.map((player) => ({ id: player.id, name: player.name, initials: player.initials, color: player.color, host: player.host, alive: true, voteStatus: 'hidden', voteTargetId: null, revealedRole: null })),
    privatePlayers,
    nightResolved: false,
    retaliationResolved: false,
    tracePlayerIds: [],
    morningReport: '',
    publicEventLog: ['The table is set. Roles have been dealt in secret.'],
    voteCounts: {},
    voteSummary: '',
    votesRevealed: false,
    runoffCandidates: null,
    runoffUsed: false,
    winner: null,
  };
}

export function getWinner(state: Pick<GameEngineState, 'publicPlayers' | 'privatePlayers'>): WinningTeam {
  const living = state.publicPlayers.filter((player) => player.alive);
  const mafiaCount = living.filter((player) => isMafiaAligned(state.privatePlayers[player.id].role)).length;
  const nonMafiaCount = living.length - mafiaCount;
  if (mafiaCount === 0) return 'Citizens';
  if (mafiaCount >= nonMafiaCount) return 'Mafia';
  return null;
}

export function startNight(state: GameEngineState): GameEngineState {
  const validStart = state.phase === 'Role Reveal' || (state.phase === 'Voting' && state.votesRevealed && !state.winner);
  if (!validStart || state.winner) return state;
  const nextRound = state.phase === 'Role Reveal' ? state.round : state.round + 1;
  const privatePlayers = Object.fromEntries(Object.entries(state.privatePlayers).map(([id, player]) => [id, {
    ...player,
    info: { ...player.info, investigationResult: '', protectionResult: '', traceExplanation: '' },
    nightAction: { submitted: false, targetId: null },
    vote: { submitted: false, choice: null },
  }])) as Record<number, PrivateGamePlayer>;

  return {
    ...state,
    phase: 'Night',
    round: nextRound,
    privatePlayers,
    nightResolved: false,
    retaliationResolved: false,
    tracePlayerIds: [],
    morningReport: '',
    votesRevealed: false,
    runoffCandidates: null,
    runoffUsed: false,
    voteCounts: {},
    voteSummary: '',
    publicPlayers: state.publicPlayers.map((player) => ({ ...player, voteStatus: player.alive ? 'hidden' : 'not-eligible', voteTargetId: null })),
  };
}

/** Morning → Discussion, or straight to Results when the night decided the game. */
export function openDiscussion(state: GameEngineState): GameEngineState {
  if (state.phase !== 'Morning') return state;
  return { ...state, phase: state.winner ? 'Results' : 'Discussion' };
}

/** Opens a fresh ballot. Clears any runoff left over from an earlier day. */
export function startVoting(state: GameEngineState): GameEngineState {
  if (state.winner) return state;
  const privatePlayers = Object.fromEntries(Object.entries(state.privatePlayers).map(([id, player]) => [id, { ...player, vote: { submitted: false, choice: null } }])) as Record<number, PrivateGamePlayer>;
  return {
    ...state,
    phase: 'Voting',
    privatePlayers,
    voteCounts: {},
    voteSummary: '',
    votesRevealed: false,
    runoffCandidates: null,
    runoffUsed: false,
    publicPlayers: state.publicPlayers.map((player) => ({ ...player, voteStatus: player.alive ? 'hidden' : 'not-eligible', voteTargetId: null })),
  };
}

/** After the revealed ballot: next Night, or Results if the vote decided the game. */
export function finishDay(state: GameEngineState): GameEngineState {
  if (state.phase !== 'Voting' || !state.votesRevealed) return state;
  return state.winner ? { ...state, phase: 'Results' } : startNight(state);
}

export function submitNightAction(state: GameEngineState, actorId: number, targetId: number): EngineResult {
  if (state.phase !== 'Night' || state.winner || state.nightResolved) return { state, error: 'Night actions are closed.' };
  const actor = state.publicPlayers.find((player) => player.id === actorId);
  const secret = state.privatePlayers[actorId];
  const target = state.publicPlayers.find((player) => player.id === targetId);
  if (!actor?.alive || !secret) return { state, error: 'Eliminated players cannot act.' };
  if (secret.nightAction.submitted) return { state, error: 'Your night action is already locked.' };
  if (!target?.alive) return { state, error: 'Choose a living target.' };
  const nightRole = nightRoleOf(state, actorId);
  if (!nightRole) return { state, error: 'This role has no targeted night action.' };
  if (nightRole === 'Mafia' && isMafiaAligned(state.privatePlayers[targetId].role)) return { state, error: 'Mafia cannot target a Mafia-aligned player.' };
  if (nightRole === 'Detective' && actorId === targetId) return { state, error: 'Choose another living player to investigate.' };
  if (nightRole === 'Doctor' && secret.lastProtectedId === targetId) return { state, error: 'You cannot protect the same player two nights in a row.' };
  const mafiaAligned = isMafiaAligned(state.privatePlayers[targetId].role);
  return {
    state: {
      ...state,
      privatePlayers: {
        ...state.privatePlayers,
        [actorId]: {
          ...secret,
          nightAction: { submitted: true, targetId },
          knownAlignment: nightRole === 'Detective' ? { ...secret.knownAlignment, [targetId]: mafiaAligned ? 'mafia' as const : 'town' as const } : secret.knownAlignment,
          info: nightRole === 'Detective'
            ? { ...secret.info, investigationResult: alignmentSentence(target.name, mafiaAligned) }
            : secret.info,
        },
      },
    },
  };
}

/** True once every living player with a targeted night action has chosen. */
export function allNightActionsSubmitted(state: GameEngineState): boolean {
  return state.publicPlayers.every((player) => !nightRoleOf(state, player.id) || state.privatePlayers[player.id].nightAction.submitted);
}

function selectedMafiaTarget(state: GameEngineState) {
  const livingMafia = state.publicPlayers
    .filter((player) => nightRoleOf(state, player.id) === 'Mafia')
    .sort((left, right) => left.id - right.id);
  const candidates = state.publicPlayers.filter((player) => player.alive && !isMafiaAligned(state.privatePlayers[player.id].role));
  const tally = new Map<number, number>();
  for (const mafia of livingMafia) {
    const action = state.privatePlayers[mafia.id].nightAction;
    if (action.submitted && action.targetId !== null && candidates.some((player) => player.id === action.targetId)) {
      tally.set(action.targetId, (tally.get(action.targetId) ?? 0) + 1);
    }
  }
  // Most Mafia votes wins; ties break toward the lowest seat. No votes (timeout) means no attack.
  const ranked = [...tally.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  const targetId = ranked[0]?.[0] ?? null;
  const voters = livingMafia.filter((player) => state.privatePlayers[player.id].nightAction.targetId === targetId);
  const attackerId = targetId === null ? null : voters[0]?.id ?? null;
  return { targetId, attackerId };
}

export function resolveMafiaTarget(state: GameEngineState) {
  return selectedMafiaTarget(state);
}

export function resolveNight(state: GameEngineState, random: RandomSource = defaultRandom): EngineResult {
  if (state.phase !== 'Night' || state.winner || state.nightResolved) return { state, error: 'This Night has already been resolved or is closed.' };

  const { targetId: mafiaTargetId, attackerId } = selectedMafiaTarget(state);
  const target = state.publicPlayers.find((player) => player.id === mafiaTargetId && player.alive);
  const doctors = state.publicPlayers.filter((player) => player.alive && state.privatePlayers[player.id].role === 'Doctor');
  const protectingDoctor = doctors.find((doctor) => {
    const action = state.privatePlayers[doctor.id].nightAction;
    return action.submitted && action.targetId === target?.id;
  });
  const protectedTarget = Boolean(target && protectingDoctor);
  let publicPlayers = state.publicPlayers;
  let report = 'No Mafia attack reached the neighborhood tonight.';
  let retaliationResolved = false;
  const privatePlayers: Record<number, PrivateGamePlayer> = { ...state.privatePlayers };

  if (target && attackerId !== null) {
    const targetSecret = state.privatePlayers[target.id];
    if (protectedTarget) {
      report = 'A failed attack was reported before dawn. No one was eliminated.';
    } else if (targetSecret.role === 'Old Lady with Shotgun' && !targetSecret.shotgunSpent) {
      // The shotgun fires once. She survives the first attack, but the Mafia now knows where she lives.
      const retaliator = state.publicPlayers
        .filter((player) => player.alive && isMafiaAligned(state.privatePlayers[player.id].role))
        .sort((left, right) => left.id === attackerId ? -1 : right.id === attackerId ? 1 : left.id - right.id)[0];
      privatePlayers[target.id] = { ...targetSecret, shotgunSpent: true };
      if (retaliator) {
        publicPlayers = publicPlayers.map((player) => player.id === retaliator.id ? { ...player, alive: false } : player);
        retaliationResolved = true;
        report = 'A shotgun answered from the dark. The attacker was eliminated before dawn.';
      } else {
        report = 'An attempted attack was stopped at the old house. No one was eliminated.';
      }
    } else {
      publicPlayers = publicPlayers.map((player) => player.id === target.id ? { ...player, alive: false } : player);
      report = `${target.name} was found at ${pick(locations, random)}, killed by ${pick(methods, random)}.`;
    }
  }

  for (const doctor of doctors) {
    const doctorSecret = privatePlayers[doctor.id];
    const action = doctorSecret.nightAction;
    if (!action.submitted) {
      privatePlayers[doctor.id] = { ...doctorSecret, lastProtectedId: null };
      continue;
    }
    const result = doctor.id === protectingDoctor?.id
      ? 'Your protection stopped the Mafia attack.'
      : target && attackerId !== null
        ? 'Your protection did not stop the attack this night.'
        : 'No attack required your protection tonight.';
    privatePlayers[doctor.id] = { ...doctorSecret, lastProtectedId: action.targetId, info: { ...doctorSecret.info, protectionResult: result } };
  }

  const eligible = publicPlayers.filter((player) => player.alive && !isMafiaAligned(privatePlayers[player.id].role) && privatePlayers[player.id].role !== 'Doctor' && privatePlayers[player.id].role !== 'Detective');
  const traces = shuffle(eligible, random).slice(0, Math.min(2, eligible.length));
  for (const trace of traces) {
    privatePlayers[trace.id] = {
      ...privatePlayers[trace.id],
      info: { ...privatePlayers[trace.id].info, traceExplanation: pick(traceStories, random) ?? traceStories[0] },
    };
  }
  const traceNames = traces.map((player) => player.name);
  const clueReport = traceNames.length
    ? `Traces associated with ${traceNames.join(' and ')} were found. Traces are clues, not proof.`
    : 'No eligible trace clues were found.';
  const livingCount = publicPlayers.filter((player) => player.alive).length;
  const morningReport = `${report} ${clueReport} ${livingCount} players remain alive.`;
  return {
    state: {
      ...state,
      phase: 'Morning',
      publicPlayers,
      privatePlayers,
      nightResolved: true,
      retaliationResolved,
      tracePlayerIds: traces.map((player) => player.id),
      morningReport,
      publicEventLog: [...state.publicEventLog.slice(-3), report, clueReport],
      winner: getWinner({ publicPlayers, privatePlayers }),
    },
  };
}

function isValidBallotChoice(state: GameEngineState, voterId: number, choice: VoteChoice): boolean {
  if (choice === 'skip') return true;
  if (typeof choice !== 'number' || choice === voterId) return false;
  if (!state.publicPlayers.some((player) => player.id === choice && player.alive)) return false;
  return !state.runoffCandidates || state.runoffCandidates.includes(choice);
}

export function recordVote(state: GameEngineState, voterId: number, choice: VoteChoice): EngineResult {
  if (state.phase !== 'Voting' || state.winner || state.votesRevealed) return { state, error: 'Voting is closed.' };
  const voter = state.publicPlayers.find((player) => player.id === voterId);
  const secret = state.privatePlayers[voterId];
  if (!voter?.alive || !secret) return { state, error: 'Eliminated players cannot vote.' };
  if (secret.vote.submitted) return { state, error: 'You have already voted this round.' };
  if (choice === null) return { state, error: 'Choose a player or Skip Vote.' };
  if (typeof choice === 'number') {
    const target = state.publicPlayers.find((player) => player.id === choice && player.alive);
    if (!target) return { state, error: 'Votes can only target living players.' };
    if (choice === voterId) return { state, error: 'You cannot vote for yourself.' };
    if (state.runoffCandidates && !state.runoffCandidates.includes(choice)) return { state, error: 'Runoff votes can only target the tied players.' };
  }
  return {
    state: {
      ...state,
      privatePlayers: { ...state.privatePlayers, [voterId]: { ...secret, vote: { submitted: true, choice } } },
    },
  };
}

export function allVotesSubmitted(state: GameEngineState): boolean {
  return state.publicPlayers.every((player) => !player.alive || state.privatePlayers[player.id].vote.submitted);
}

/** Counts the ballot. Living players who did not vote before the deadline count as Skip. */
export function resolveVoting(state: GameEngineState): EngineResult {
  if (state.phase !== 'Voting' || state.winner || state.votesRevealed) return { state, error: 'Voting is closed.' };

  const ballots = state.publicPlayers.filter((player) => player.alive).map((voter) => {
    const vote = state.privatePlayers[voter.id].vote;
    const choice: VoteChoice = vote.submitted && isValidBallotChoice(state, voter.id, vote.choice) ? vote.choice : 'skip';
    return { voterId: voter.id, choice };
  });

  const voteCounts: Record<string, number> = {};
  for (const ballot of ballots) {
    const key = String(ballot.choice);
    voteCounts[key] = (voteCounts[key] ?? 0) + 1;
  }
  const highest = Math.max(0, ...Object.values(voteCounts));
  const leaders = Object.entries(voteCounts).filter(([, count]) => count === highest);
  const leaderIds = leaders.map(([key]) => key);
  const tiedPlayers = leaderIds.length > 1 && leaderIds.every((key) => key !== 'skip') ? leaderIds.map(Number).sort((left, right) => left - right) : [];

  // A tie between players earns one runoff, limited to the tied players. A second tie eliminates nobody.
  if (tiedPlayers.length > 1 && !state.runoffUsed) {
    const names = tiedPlayers.map((id) => state.publicPlayers.find((player) => player.id === id)?.name ?? '?');
    const voteSummary = `The vote was tied between ${names.join(' and ')}. A runoff vote begins.`;
    const privatePlayers = Object.fromEntries(Object.entries(state.privatePlayers).map(([id, player]) => [id, { ...player, vote: { submitted: false, choice: null } }])) as Record<number, PrivateGamePlayer>;
    return {
      state: {
        ...state,
        privatePlayers,
        publicPlayers: state.publicPlayers.map((player) => ({ ...player, voteStatus: player.alive ? 'hidden' as const : 'not-eligible' as const, voteTargetId: null })),
        voteCounts,
        voteSummary,
        votesRevealed: false,
        runoffCandidates: tiedPlayers,
        runoffUsed: true,
        publicEventLog: [...state.publicEventLog.slice(-3), voteSummary],
      },
    };
  }

  const eliminatedId = leaders.length === 1 && leaders[0][0] !== 'skip' ? Number(leaders[0][0]) : null;
  const publicPlayers = state.publicPlayers.map((player) => {
    const ballot = ballots.find((item) => item.voterId === player.id);
    return {
      ...player,
      alive: player.alive && player.id !== eliminatedId,
      revealedRole: player.id === eliminatedId ? state.privatePlayers[player.id].role : player.revealedRole,
      voteStatus: player.alive ? 'revealed' as const : 'not-eligible' as const,
      voteTargetId: typeof ballot?.choice === 'number' ? ballot.choice : null,
    };
  });
  const eliminated = state.publicPlayers.find((player) => player.id === eliminatedId);
  const voteSummary = eliminated
    ? `${eliminated.name} was voted out with ${voteCounts[String(eliminated.id)]} votes.`
    : state.runoffUsed && tiedPlayers.length > 1
      ? 'The runoff was tied again. No one was eliminated.'
      : 'The vote was tied or Skip Vote led the count. No one was eliminated.';
  const roleReveal = eliminated ? `${eliminated.name} was revealed as ${state.privatePlayers[eliminated.id].role}.` : '';
  const privatePlayers = { ...state.privatePlayers };
  for (const ballot of ballots) {
    privatePlayers[ballot.voterId] = { ...privatePlayers[ballot.voterId], vote: { submitted: true, choice: ballot.choice } };
  }
  return {
    state: {
      ...state,
      phase: 'Voting',
      publicPlayers,
      privatePlayers,
      voteCounts,
      voteSummary,
      votesRevealed: true,
      winner: getWinner({ publicPlayers, privatePlayers }),
      publicEventLog: [...state.publicEventLog.slice(-3), voteSummary, ...(roleReveal ? [roleReveal] : [])],
    },
  };
}

/** Removes a player who left mid-game. They count as eliminated; their role is not revealed. */
export function removePlayer(state: GameEngineState, playerId: number): GameEngineState {
  const player = state.publicPlayers.find((candidate) => candidate.id === playerId);
  if (!player?.alive || state.phase === 'Results') return state;
  const publicPlayers = state.publicPlayers.map((candidate) => candidate.id === playerId ? { ...candidate, alive: false, voteStatus: 'not-eligible' as const } : candidate);
  const note = `${player.name} left the table.`;
  const winner = getWinner({ publicPlayers, privatePlayers: state.privatePlayers });
  return { ...state, publicPlayers, winner, phase: winner ? 'Results' : state.phase, publicEventLog: [...state.publicEventLog.slice(-3), note] };
}

/** What every player at the table may see. Roles stay hidden until the game ends. */
export function publicView(state: GameEngineState) {
  const finished = state.phase === 'Results';
  return {
    phase: state.phase,
    round: state.round,
    players: state.publicPlayers,
    morningReport: state.morningReport,
    publicEventLog: state.publicEventLog,
    voteCounts: state.votesRevealed ? state.voteCounts : {},
    voteSummary: state.voteSummary,
    votesRevealed: state.votesRevealed,
    runoffCandidates: state.runoffCandidates,
    tracePlayerIds: state.tracePlayerIds,
    winner: state.winner,
    finalRoles: finished ? Object.fromEntries(Object.entries(state.privatePlayers).map(([id, player]) => [id, player.role])) as Record<number, RoleName> : null,
  };
}
export type PublicGameView = ReturnType<typeof publicView>;

/** What one player may see about themselves. Never includes anyone else's role. */
export function privateView(state: GameEngineState, playerId: number) {
  const secret = state.privatePlayers[playerId];
  if (!secret) return null;
  return {
    seat: playerId,
    role: secret.role,
    team: secret.team,
    info: secret.info,
    nightRole: nightRoleOf(state, playerId),
    nightAction: secret.nightAction,
    vote: secret.vote,
    lastProtectedId: secret.lastProtectedId,
    knownAlignment: secret.knownAlignment,
    shotgunSpent: secret.shotgunSpent,
  };
}
export type PrivateGameView = NonNullable<ReturnType<typeof privateView>>;

export function runGameEngineSelfTests() {
  const players: EnginePlayer[] = [
    { id: 1, name: 'You', initials: 'YO', color: 'rose' },
    { id: 2, name: 'Violet', initials: 'VI', color: 'violet' },
    { id: 3, name: 'Marlow', initials: 'MA', color: 'gold' },
    { id: 4, name: 'Rook', initials: 'RO', color: 'teal' },
  ];
  const seven: EnginePlayer[] = [...players, { id: 5, name: 'June', initials: 'JU', color: 'blue' }, { id: 6, name: 'Silas', initials: 'SI', color: 'plum' }, { id: 7, name: 'Mina', initials: 'MI', color: 'gold' }];
  const fixed = (assignment: Partial<Record<number, RoleName>>) => createInitialGame(players, assignment, () => 0);
  const require = (condition: boolean, message: string) => { if (!condition) throw new Error(`Game engine self-test failed: ${message}`); };

  // Role composition always fills every seat.
  for (let count = MIN_PLAYERS; count <= 12; count += 1) require(roleComposition(count).length === count, `Role composition fills ${count} seats.`);

  let state = startNight(fixed({ 1: 'Doctor', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }));
  require(!allNightActionsSubmitted(state), 'Night waits for the Doctor and Mafia.');
  state = submitNightAction(state, 2, 1).state;
  state = submitNightAction(state, 1, 1).state;
  require(allNightActionsSubmitted(state), 'Night is complete once all acting roles chose.');
  let resolved = resolveNight(state, () => 0);
  require(!resolved.error && resolved.state.publicPlayers.every((player) => player.alive), 'Doctor protection prevents the Mafia attack.');
  require(resolved.state.privatePlayers[1].info.protectionResult.includes('stopped'), 'Doctor receives the protection result privately.');

  state = startNight(fixed({ 1: 'Doctor', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }));
  resolved = resolveNight(state, () => 0);
  require(resolved.state.publicPlayers.every((player) => player.alive), 'A Mafia that never chose (timeout) attacks nobody.');

  state = startNight(fixed({ 1: 'Detective', 2: 'Bad Informant', 3: 'Mafia', 4: 'Citizen' }));
  state = submitNightAction(state, 1, 2).state;
  require(state.privatePlayers[1].info.investigationResult.includes('aligned with the Mafia'), 'Detective receives the correct private team result.');
  require(!state.publicEventLog.join(' ').includes('aligned with the Mafia'), 'Detective results are absent from public logs.');
  require(Boolean(submitNightAction(state, 1, 3).error), 'Detective cannot submit multiple investigations in one Night.');
  require(privateView(state, 4)?.knownAlignment[2] === undefined, 'Other players never see the Detective notebook.');

  state = startNight(fixed({ 1: 'Old Lady with Shotgun', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }));
  state = submitNightAction(state, 2, 1).state;
  resolved = resolveNight(state, () => 0);
  require(!resolved.error && resolved.state.publicPlayers.find((player) => player.id === 2)?.alive === false, 'Old Lady retaliates against a living attacker.');

  state = startNight(fixed({ 1: 'Old Lady with Shotgun', 2: 'Mafia', 3: 'Doctor', 4: 'Citizen' }));
  state = submitNightAction(state, 2, 1).state;
  state = submitNightAction(state, 3, 1).state;
  resolved = resolveNight(state, () => 0);
  require(!resolved.error && resolved.state.publicPlayers.find((player) => player.id === 2)?.alive === true, 'Doctor protection suppresses Old Lady retaliation.');

  state = fixed({ 1: 'Good Informant', 2: 'Mafia', 3: 'Bad Informant', 4: 'Citizen' });
  require(state.privatePlayers[1].info.informantMafiaIds.includes(2) && state.privatePlayers[1].info.informantMafiaIds.includes(3), 'Good Informant receives Mafia-aligned identities privately.');
  require(!('role' in state.publicPlayers[1]), 'Public player data does not contain secret roles.');
  require(publicView(state).finalRoles === null, 'Roles stay hidden in the public view until the game ends.');
  require(state.privatePlayers[3].info.badInformantObjective.length > 0, 'Bad Informant receives a private objective.');
  require(!state.privatePlayers[2].info.mafiaTeammateIds.includes(3), 'Bad Informant identity is not automatically revealed to Mafia teammates.');

  state = startNight(fixed({ 1: 'Mafia', 2: 'Mafia', 3: 'Citizen', 4: 'Doctor' }));
  state = submitNightAction(state, 1, 3).state;
  state = submitNightAction(state, 2, 4).state;
  require(resolveMafiaTarget(state).targetId === 3, 'Mafia target ties break by lowest living target ID.');
  require(Boolean(submitNightAction(state, 1, 4).error), 'A Mafia member cannot submit twice in one Night.');

  state = startNight(fixed({ 1: 'Mafia', 2: 'Doctor', 3: 'Detective', 4: 'Citizen' }));
  const deadState = { ...state, publicPlayers: state.publicPlayers.map((player) => player.id === 1 ? { ...player, alive: false } : player) };
  require(Boolean(submitNightAction(deadState, 1, 2).error), 'Dead players cannot take night actions.');
  require(Boolean(recordVote({ ...deadState, phase: 'Voting' }, 1, 2).error), 'Dead players cannot vote.');

  // Ties go to one runoff; a second tie eliminates nobody.
  state = startVoting(fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }));
  for (const [voter, choice] of [[1, 2], [2, 3], [3, 2], [4, 3]] as const) state = recordVote(state, voter, choice).state;
  require(Boolean(recordVote(state, 1, 3).error), 'A player cannot vote twice in one round.');
  require(allVotesSubmitted(state), 'Ballot is complete when every living player voted.');
  resolved = resolveVoting(state);
  require(!resolved.state.votesRevealed && resolved.state.runoffCandidates?.join(',') === '2,3', 'A tie between players opens a runoff limited to the tied players.');
  require(Boolean(recordVote(resolved.state, 1, 4).error), 'Runoff ballots cannot target players outside the tie.');
  state = resolved.state;
  for (const [voter, choice] of [[1, 2], [2, 3], [3, 2], [4, 3]] as const) state = recordVote(state, voter, choice).state;
  const runoff = resolveVoting(state);
  require(runoff.state.votesRevealed && runoff.state.publicPlayers.every((player) => player.alive), 'A second tie in the runoff eliminates nobody.');

  // Missing ballots count as Skip at the deadline.
  state = startVoting(fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' }));
  state = recordVote(state, 1, 2).state;
  resolved = resolveVoting(state);
  require(resolved.state.votesRevealed && resolved.state.voteCounts.skip === 3 && resolved.state.publicPlayers.every((player) => player.alive), 'Unsubmitted ballots count as Skip.');

  // Voted-out players reveal their role and can end the game.
  state = startVoting(fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' }));
  for (const [voter, choice] of [[1, 2], [2, 1], [3, 2], [4, 2]] as const) state = recordVote(state, voter, choice).state;
  resolved = resolveVoting(state);
  require(resolved.state.publicPlayers.find((player) => player.id === 2)?.revealedRole === 'Mafia', 'A voted-out player has their role revealed publicly.');
  require(resolved.state.winner === 'Citizens' && finishDay(resolved.state).phase === 'Results', 'A winning vote leads to Results.');
  require(publicView(finishDay(resolved.state)).finalRoles?.[3] === 'Doctor', 'All roles are revealed once the game ends.');

  const citizenWin = fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' });
  require(getWinner({ ...citizenWin, publicPlayers: citizenWin.publicPlayers.map((player) => player.id === 2 ? { ...player, alive: false } : player) }) === 'Citizens', 'Citizens win when all Mafia-aligned players are gone.');
  require(getWinner({ ...citizenWin, publicPlayers: citizenWin.publicPlayers.map((player) => player.id > 2 ? { ...player, alive: false } : player) }) === 'Mafia', 'Mafia wins when aligned players equal or outnumber the living town.');

  // Traces stay private and only go to plain town roles.
  state = startNight(fixed({ 1: 'Doctor', 2: 'Mafia', 3: 'Citizen', 4: 'Old Lady with Shotgun' }));
  state = submitNightAction(state, 1, 1).state;
  resolved = resolveNight(state, () => 0);
  require(resolved.state.tracePlayerIds.length <= 2, 'Morning generates up to two eligible living traces.');
  require(!resolved.state.privatePlayers[2].info.traceExplanation && !resolved.state.privatePlayers[1].info.traceExplanation, 'Mafia and Doctor receive no trace explanation.');
  const privateText = Object.values(resolved.state.privatePlayers).map((player) => player.info.traceExplanation).filter(Boolean);
  require(privateText.every((text) => !resolved.state.publicEventLog.join(' ').includes(text)), 'Private trace explanations never enter public logs.');
  require(resolveNight(resolved.state, () => 0).state === resolved.state, 'A completed Night cannot be resolved twice.');

  // Doctor cannot protect the same player on consecutive nights.
  state = startNight(fixed({ 1: 'Doctor', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }));
  state = submitNightAction(state, 1, 1).state;
  state = submitNightAction(state, 2, 3).state;
  resolved = resolveNight(state, () => 0);
  const doctorNight = { ...resolved.state, phase: 'Night' as const, nightResolved: false, privatePlayers: { ...resolved.state.privatePlayers, 1: { ...resolved.state.privatePlayers[1], nightAction: { submitted: false, targetId: null } } } };
  require(Boolean(submitNightAction(doctorNight, 1, 1).error), 'The Doctor cannot protect the same player on consecutive nights.');
  require(!submitNightAction(doctorNight, 1, 4).error, 'The Doctor may protect someone else the next night.');

  // Detective keeps every result across nights.
  state = startNight(fixed({ 1: 'Detective', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }));
  state = submitNightAction(state, 1, 2).state;
  const detectiveNextNight = startNight({ ...state, phase: 'Voting', votesRevealed: true });
  require(detectiveNextNight.privatePlayers[1].knownAlignment[2] === 'mafia' && !detectiveNextNight.privatePlayers[1].info.investigationResult, 'Detective findings survive into the next night.');

  // The Old Lady's shotgun fires only once.
  state = startNight(createInitialGame(seven, { 1: 'Old Lady with Shotgun', 2: 'Mafia', 3: 'Mafia', 4: 'Citizen', 5: 'Citizen', 6: 'Citizen', 7: 'Citizen' }, () => 0));
  state = submitNightAction(state, 2, 1).state;
  state = submitNightAction(state, 3, 1).state;
  resolved = resolveNight(state, () => 0);
  require(resolved.state.publicPlayers.find((player) => player.id === 2)?.alive === false && resolved.state.publicPlayers.find((player) => player.id === 1)?.alive === true, 'The first attack on the Old Lady is answered by her shotgun.');
  state = startNight({ ...resolved.state, phase: 'Voting', votesRevealed: true });
  state = submitNightAction(state, 3, 1).state;
  resolved = resolveNight(state, () => 0);
  require(resolved.state.publicPlayers.find((player) => player.id === 1)?.alive === false, 'A second attack on the Old Lady succeeds without retaliation.');

  // The Bad Informant inherits the attack once every Mafia member is gone.
  state = createInitialGame(seven, { 1: 'Citizen', 2: 'Mafia', 3: 'Bad Informant', 4: 'Citizen', 5: 'Doctor', 6: 'Detective', 7: 'Citizen' }, () => 0);
  require(nightRoleOf(state, 3) === null, 'The Bad Informant has no attack while a Mafia member lives.');
  state = removePlayer(state, 2);
  require(nightRoleOf(state, 3) === 'Mafia' && state.publicEventLog[state.publicEventLog.length - 1].includes('left the table'), 'A leaving Mafia member hands the attack to the Bad Informant.');

  return 'Game engine self-tests passed.';
}
