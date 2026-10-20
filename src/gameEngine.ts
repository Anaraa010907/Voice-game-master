import { roles, type Player, type RoleName } from './gameData.ts';

export type GamePhase = 'Role Reveal' | 'Night' | 'Morning' | 'Discussion' | 'Voting' | 'Results';
export type VoteChoice = number | 'skip' | null;
export type WinningTeam = 'Citizens' | 'Mafia' | null;
export type NightRole = 'Mafia' | 'Doctor' | 'Detective';
export type PublicGamePlayer = Pick<Player, 'id' | 'name' | 'initials' | 'color' | 'host'> & {
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
  team: 'town' | 'mafia' | 'wildcard';
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
  return roles.find((definition) => definition.name === role)?.team === 'mafia';
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

function weightedPick<T>(items: T[], weights: number[], random: RandomSource): T | undefined {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!items.length || total <= 0) return undefined;
  let roll = Math.min(0.999999, Math.max(0, random())) * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return items[index];
  }
  return items[items.length - 1];
}

function alignmentSentence(name: string, mafiaAligned: boolean) {
  return `${name} is ${mafiaAligned ? 'aligned with the Mafia' : 'not aligned with the Mafia'}.`;
}

function distributeRoles(players: Player[], assignments?: Partial<Record<number, RoleName>>, random = defaultRandom): RoleName[] {
  const pool: RoleName[] = ['Mafia', 'Doctor', 'Detective'];
  const mafiaQuota = Math.max(1, Math.floor((players.length - 1) / 3));
  let mafiaCount = 1;
  if (players.length >= 5) pool.push('Good Informant');
  if (players.length >= 6) pool.push('Old Lady with Shotgun');
  if (players.length >= 7) {
    pool.push('Bad Informant');
    mafiaCount += 1;
  }
  while (mafiaCount < mafiaQuota) {
    pool.push('Mafia');
    mafiaCount += 1;
  }
  while (pool.length < players.length) pool.push('Citizen');
  const shuffled = shuffle(pool, random);
  return players.map((player, index) => assignments?.[player.id] ?? shuffled[index]);
}

export function createInitialGame(
  players: Player[],
  assignments?: Partial<Record<number, RoleName>>,
  random: RandomSource = defaultRandom,
): GameEngineState {
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error('Player IDs must be unique.');
  const assignedRoles = distributeRoles(players, assignments, random);
  const roleById = Object.fromEntries(players.map((player, index) => [player.id, assignedRoles[index]])) as Record<number, RoleName>;
  const privatePlayers = Object.fromEntries(players.map((player) => {
    const role = roleById[player.id];
    const mafiaIds = players.filter((other) => isMafiaAligned(roleById[other.id])).map((other) => other.id);
    const definition = roles.find((item) => item.name === role)!;
    return [player.id, {
      role,
      team: definition.team,
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
    publicEventLog: ['Ширээ бэлэн боллоо. Бүх зочид симуляцийн тоглогчид.'],
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

export function startNight(state: GameEngineState, simulateNpcActions = true, random: RandomSource = defaultRandom): GameEngineState {
  const validStart = state.phase === 'Role Reveal' || (state.phase === 'Voting' && state.votesRevealed && !state.winner);
  if (!validStart || state.winner) return state;
  const nextRound = state.phase === 'Role Reveal' ? state.round : state.round + 1;
  const living = state.publicPlayers.filter((player) => player.alive).sort((left, right) => left.id - right.id);
  const privatePlayers = Object.fromEntries(Object.entries(state.privatePlayers).map(([id, player]) => [id, {
    ...player,
    info: { ...player.info, investigationResult: '', protectionResult: '', traceExplanation: '' },
    nightAction: { submitted: false, targetId: null },
    vote: { submitted: false, choice: null },
  }])) as Record<number, PrivateGamePlayer>;
  const stateForRoles = { publicPlayers: state.publicPlayers, privatePlayers };

  if (simulateNpcActions) {
    const livingNonMafia = living.filter((player) => !isMafiaAligned(privatePlayers[player.id].role));
    // Simulated Mafia members agree on one victim, like a real table would.
    const mafiaVictim = pick(livingNonMafia, random);
    for (const player of living) {
      if (player.id === 1) continue;
      const secret = privatePlayers[player.id];
      const nightRole = nightRoleOf(stateForRoles, player.id);
      if (nightRole === 'Mafia' && mafiaVictim) {
        secret.nightAction = { submitted: true, targetId: mafiaVictim.id };
      } else if (nightRole === 'Doctor') {
        const options = living.filter((candidate) => candidate.id !== secret.lastProtectedId);
        const target = pick(options, random);
        if (target) secret.nightAction = { submitted: true, targetId: target.id };
      } else if (nightRole === 'Detective') {
        const unknown = living.filter((candidate) => candidate.id !== player.id && secret.knownAlignment[candidate.id] === undefined);
        const target = pick(unknown.length ? unknown : living.filter((candidate) => candidate.id !== player.id), random);
        if (target) {
          const mafiaAligned = isMafiaAligned(privatePlayers[target.id].role);
          secret.nightAction = { submitted: true, targetId: target.id };
          secret.knownAlignment = { ...secret.knownAlignment, [target.id]: mafiaAligned ? 'mafia' : 'town' };
          secret.info.investigationResult = alignmentSentence(target.name, mafiaAligned);
        }
      }
    }
  }

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
  const next = {
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
  };
  return { state: next };
}

export function markNightReady(state: GameEngineState, actorId: number): EngineResult {
  if (state.phase !== 'Night' || state.winner || state.nightResolved) return { state, error: 'Night actions are closed.' };
  const actor = state.publicPlayers.find((player) => player.id === actorId);
  const secret = state.privatePlayers[actorId];
  if (!actor?.alive || !secret) return { state, error: 'Eliminated players cannot act.' };
  if (secret.nightAction.submitted) return { state, error: 'Your night action is already locked.' };
  if (nightRoleOf(state, actorId)) return { state, error: 'This role must submit a target.' };
  return {
    state: {
      ...state,
      privatePlayers: {
        ...state.privatePlayers,
        [actorId]: { ...secret, nightAction: { submitted: true, targetId: null } },
      },
    },
  };
}

function selectedMafiaTarget(state: GameEngineState) {
  const livingMafia = state.publicPlayers
    .filter((player) => nightRoleOf(state, player.id) === 'Mafia')
    .sort((left, right) => left.id - right.id);
  const candidates = state.publicPlayers.filter((player) => player.alive && !isMafiaAligned(state.privatePlayers[player.id].role)).sort((left, right) => left.id - right.id);
  const tally = new Map<number, number>();
  for (const mafia of livingMafia) {
    const action = state.privatePlayers[mafia.id].nightAction;
    if (action.submitted && action.targetId !== null && candidates.some((player) => player.id === action.targetId)) {
      tally.set(action.targetId, (tally.get(action.targetId) ?? 0) + 1);
    }
  }
  const ranked = [...tally.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  const targetId = ranked[0]?.[0] ?? candidates[0]?.id ?? null;
  const voters = livingMafia.filter((player) => state.privatePlayers[player.id].nightAction.targetId === targetId);
  const attackerId = voters[0]?.id ?? livingMafia[0]?.id ?? null;
  return { targetId, attackerId };
}

export function resolveMafiaTarget(state: GameEngineState) {
  return selectedMafiaTarget(state);
}

export function resolveNight(state: GameEngineState, random: RandomSource = defaultRandom): EngineResult {
  if (state.phase !== 'Night' || state.winner || state.nightResolved) return { state, error: 'This Night has already been resolved or is closed.' };
  const human = state.publicPlayers.find((player) => player.id === 1);
  const humanSecret = state.privatePlayers[1];
  if (human?.alive && humanSecret && !humanSecret.nightAction.submitted) return { state, error: 'Confirm or pass on your night action first.' };

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
  const next: GameEngineState = {
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
  };
  return { state: next };
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

/**
 * Chooses ballots for every simulated living player who has not voted yet.
 * Mafia-aligned bots protect each other and push town players, the Detective and Good Informant
 * use what they privately know, and everyone leans toward players who left traces this morning.
 */
export function simulateNpcVotes(state: GameEngineState, random: RandomSource = defaultRandom): Record<number, VoteChoice> {
  const votes: Record<number, VoteChoice> = {};
  const living = state.publicPlayers.filter((player) => player.alive);
  for (const voter of living) {
    if (voter.id === 1 || state.privatePlayers[voter.id].vote.submitted) continue;
    const secret = state.privatePlayers[voter.id];
    const options = living.filter((candidate) => isValidBallotChoice(state, voter.id, candidate.id));
    if (!options.length) { votes[voter.id] = 'skip'; continue; }
    if (isMafiaAligned(secret.role)) {
      const townTargets = options.filter((candidate) => !isMafiaAligned(state.privatePlayers[candidate.id].role));
      votes[voter.id] = pick(townTargets, random)?.id ?? 'skip';
      continue;
    }
    const knownMafia = secret.role === 'Detective'
      ? options.filter((candidate) => secret.knownAlignment[candidate.id] === 'mafia')
      : secret.role === 'Good Informant'
        ? options.filter((candidate) => secret.info.informantMafiaIds.includes(candidate.id))
        : [];
    if (knownMafia.length) { votes[voter.id] = knownMafia[0].id; continue; }
    const cleared = options.filter((candidate) => secret.knownAlignment[candidate.id] !== 'town');
    const pool = cleared.length ? cleared : options;
    const weights = pool.map((candidate) => state.tracePlayerIds.includes(candidate.id) ? 2.5 : 1);
    // Roughly one bot in five prefers to skip rather than guess.
    votes[voter.id] = random() < 0.2 ? 'skip' : weightedPick(pool, weights, random)?.id ?? 'skip';
  }
  return votes;
}

export function resolveVoting(state: GameEngineState, simulatedVotes: Record<number, VoteChoice> = {}): EngineResult {
  if (state.phase !== 'Voting' || state.winner || state.votesRevealed) return { state, error: 'Voting is closed.' };
  const human = state.publicPlayers.find((player) => player.id === 1);
  if (human?.alive && !state.privatePlayers[1].vote.submitted) return { state, error: 'Submit your vote before resolving the ballot.' };

  const ballots: Array<{ voterId: number; choice: VoteChoice }> = [];
  for (const voter of state.publicPlayers.filter((player) => player.alive)) {
    const privateVote = state.privatePlayers[voter.id].vote;
    if (privateVote.submitted) {
      ballots.push({ voterId: voter.id, choice: privateVote.choice });
      continue;
    }
    if (voter.id === 1) return { state, error: 'Submit your vote before resolving the ballot.' };
    const choice = simulatedVotes[voter.id] ?? 'skip';
    ballots.push({ voterId: voter.id, choice: isValidBallotChoice(state, voter.id, choice) ? choice : 'skip' });
  }

  const voteCounts: Record<string, number> = {};
  for (const ballot of ballots) {
    if (ballot.choice === null) continue;
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
    privatePlayers[ballot.voterId] = {
      ...privatePlayers[ballot.voterId],
      vote: { submitted: true, choice: ballot.choice },
    };
  }
  const winner = getWinner({ publicPlayers, privatePlayers });
  return {
    state: {
      ...state,
      phase: 'Voting',
      publicPlayers,
      privatePlayers,
      voteCounts,
      voteSummary,
      votesRevealed: true,
      winner,
      publicEventLog: [...state.publicEventLog.slice(-3), voteSummary, ...(roleReveal ? [roleReveal] : [])],
    },
  };
}

export function runGameEngineSelfTests() {
  const players: Player[] = [
    { id: 1, name: 'You', initials: 'YO', color: 'rose' },
    { id: 2, name: 'Violet', initials: 'VI', color: 'violet' },
    { id: 3, name: 'Marlow', initials: 'MA', color: 'gold' },
    { id: 4, name: 'Rook', initials: 'RO', color: 'teal' },
  ];
  const fixed = (assignment: Partial<Record<number, RoleName>>) => createInitialGame(players, assignment, () => 0);
  const require = (condition: boolean, message: string) => { if (!condition) throw new Error(`Game engine self-test failed: ${message}`); };

  let state = startNight(fixed({ 1: 'Doctor', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }), false);
  let action = submitNightAction(state, 2, 1); state = action.state;
  action = submitNightAction(state, 1, 1); state = action.state;
  let resolved = resolveNight(state, () => 0);
  require(!resolved.error && resolved.state.publicPlayers.every((player) => player.alive), 'Doctor protection prevents the Mafia attack.');
  require(resolved.state.privatePlayers[1].info.protectionResult.includes('stopped'), 'Doctor receives the protection result privately.');

  state = startNight(fixed({ 1: 'Detective', 2: 'Bad Informant', 3: 'Mafia', 4: 'Citizen' }), true, () => 0);
  action = submitNightAction(state, 1, 2); state = action.state;
  require(state.privatePlayers[1].info.investigationResult.includes('aligned with the Mafia'), 'Detective receives the correct private team result.');
  require(!state.publicEventLog.join(' ').includes('aligned with the Mafia'), 'Detective results are absent from public logs.');
  require(Boolean(submitNightAction(state, 1, 3).error), 'Detective cannot submit multiple investigations in one Night.');

  state = startNight(fixed({ 1: 'Old Lady with Shotgun', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }), true, () => 0);
  action = markNightReady(state, 1); state = action.state;
  resolved = resolveNight(state, () => 0);
  require(!resolved.error && resolved.state.publicPlayers.find((player) => player.id === 2)?.alive === false, 'Old Lady retaliates against a living attacker.');

  state = startNight(fixed({ 1: 'Old Lady with Shotgun', 2: 'Mafia', 3: 'Doctor', 4: 'Citizen' }), true, () => 0);
  action = markNightReady(state, 1); state = action.state;
  resolved = resolveNight(state, () => 0);
  require(!resolved.error && resolved.state.publicPlayers.find((player) => player.id === 2)?.alive === true, 'Doctor protection suppresses Old Lady retaliation.');

  state = fixed({ 1: 'Good Informant', 2: 'Mafia', 3: 'Bad Informant', 4: 'Citizen' });
  require(state.privatePlayers[1].info.informantMafiaIds.includes(2) && state.privatePlayers[1].info.informantMafiaIds.includes(3), 'Good Informant receives Mafia-aligned identities privately.');
  require(!('role' in state.publicPlayers[1]), 'Public player data does not contain secret roles.');
  require(state.privatePlayers[3].info.badInformantObjective.length > 0, 'Bad Informant receives a private objective.');
  require(!state.privatePlayers[2].info.mafiaTeammateIds.includes(3), 'Bad Informant identity is not automatically revealed to Mafia teammates.');

  state = startNight(fixed({ 1: 'Mafia', 2: 'Mafia', 3: 'Citizen', 4: 'Doctor' }), false);
  action = submitNightAction(state, 1, 3); state = action.state;
  action = submitNightAction(state, 2, 4); state = action.state;
  require(resolveMafiaTarget(state).targetId === 3, 'Mafia target ties break by lowest living target ID.');
  require(Boolean(submitNightAction(state, 1, 4).error), 'A Mafia member cannot submit twice in one Night.');

  state = startNight(fixed({ 1: 'Mafia', 2: 'Doctor', 3: 'Detective', 4: 'Citizen' }), false);
  const deadPublic = state.publicPlayers.map((player) => player.id === 1 ? { ...player, alive: false } : player);
  const deadState = { ...state, publicPlayers: deadPublic };
  require(Boolean(submitNightAction(deadState, 1, 2).error), 'Dead players cannot take night actions.');
  const votingState = { ...deadState, phase: 'Voting' as const };
  require(Boolean(recordVote(votingState, 1, 2).error), 'Dead players cannot vote.');

  state = { ...fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }), phase: 'Voting' };
  action = recordVote(state, 1, 2); state = action.state;
  require(Boolean(recordVote(state, 1, 3).error), 'A player cannot vote twice in one round.');
  resolved = resolveVoting(state, { 2: 3, 3: 2, 4: 3 });
  require(!resolved.error && resolved.state.publicPlayers.every((player) => player.alive), 'A tied ballot eliminates nobody.');
  require(!resolved.state.votesRevealed && resolved.state.runoffCandidates?.join(',') === '2,3', 'A tie between players opens a runoff limited to the tied players.');
  require(Boolean(recordVote(resolved.state, 1, 4).error), 'Runoff ballots cannot target players outside the tie.');
  action = recordVote(resolved.state, 1, 2); state = action.state;
  const runoff = resolveVoting(state, { 2: 3, 3: 2, 4: 3 });
  require(!runoff.error && runoff.state.votesRevealed && runoff.state.publicPlayers.every((player) => player.alive), 'A second tie in the runoff eliminates nobody.');
  require(startVoting(runoff.state).runoffCandidates === null && !startVoting(runoff.state).runoffUsed, 'A new ballot clears the previous runoff.');

  state = { ...fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' }), phase: 'Voting' };
  action = recordVote(state, 1, 2); state = action.state;
  resolved = resolveVoting(state, { 2: 1, 3: 2, 4: 2 });
  require(!resolved.error && resolved.state.winner === 'Citizens' && resolved.state.phase === 'Voting' && resolved.state.votesRevealed, 'A winning vote reveals its tally before results.');

  const citizenWin = fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' });
  require(getWinner({ ...citizenWin, publicPlayers: citizenWin.publicPlayers.map((player) => player.id === 2 ? { ...player, alive: false } : player) }) === 'Citizens', 'Citizens win when all Mafia-aligned players are gone.');
  const mafiaWin = fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' });
  require(getWinner({ ...mafiaWin, publicPlayers: mafiaWin.publicPlayers.map((player) => player.id > 2 ? { ...player, alive: false } : player) }) === 'Mafia', 'Mafia wins when aligned players equal or outnumber the living town.');

  state = startNight(fixed({ 1: 'Doctor', 2: 'Mafia', 3: 'Citizen', 4: 'Old Lady with Shotgun' }), true, () => 0);
  action = submitNightAction(state, 1, 1); state = action.state;
  resolved = resolveNight(state, () => 0);
  require(!resolved.error && resolved.state.tracePlayerIds.length <= 2, 'Morning generates up to two eligible living traces.');
  require(!resolved.state.privatePlayers[2].info.traceExplanation, 'Mafia receives no prewritten trace explanation.');
  require(!resolved.state.privatePlayers[1].info.traceExplanation, 'Doctor receives no prewritten trace explanation.');
  const privateText = Object.values(resolved.state.privatePlayers).map((player) => player.info.traceExplanation).filter(Boolean);
  require(privateText.every((text) => !resolved.state.publicEventLog.join(' ').includes(text)), 'Private trace explanations never enter public logs.');
  const afterResolvedNight = resolveNight(resolved.state, () => 0);
  require(afterResolvedNight.state === resolved.state, 'A completed Night cannot be resolved twice.');

  state = startNight(fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' }), true, () => 0);
  action = markNightReady(state, 1); state = action.state;
  resolved = resolveNight(state, () => 0);
  require(!resolved.error && resolved.state.tracePlayerIds.length <= 1, 'Morning shows fewer traces when fewer than two eligible players live.');

  // Voted-out players reveal their role; night victims stay hidden.
  state = { ...fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' }), phase: 'Voting' };
  action = recordVote(state, 1, 3); state = action.state;
  resolved = resolveVoting(state, { 2: 3, 3: 2, 4: 3 });
  require(resolved.state.publicPlayers.find((player) => player.id === 3)?.revealedRole === 'Doctor', 'A voted-out player has their role revealed publicly.');
  require(resolved.state.publicEventLog.some((entry) => entry.includes('was revealed as Doctor')), 'The role reveal enters the public log.');

  // The Doctor cannot protect the same player two nights in a row.
  state = startNight(fixed({ 1: 'Doctor', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }), false);
  state = submitNightAction(state, 1, 1).state;
  state = submitNightAction(state, 2, 3).state;
  resolved = resolveNight(state, () => 0);
  require(resolved.state.privatePlayers[1].lastProtectedId === 1, 'The Doctor remembers last night\'s protection.');
  const doctorNight = { ...resolved.state, phase: 'Night' as const, nightResolved: false, privatePlayers: { ...resolved.state.privatePlayers, 1: { ...resolved.state.privatePlayers[1], nightAction: { submitted: false, targetId: null } } } };
  require(Boolean(submitNightAction(doctorNight, 1, 1).error), 'The Doctor cannot protect the same player on consecutive nights.');
  require(!submitNightAction(doctorNight, 1, 4).error, 'The Doctor may protect someone else the next night.');

  // The Detective keeps every result across nights.
  state = startNight(fixed({ 1: 'Detective', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen' }), false);
  state = submitNightAction(state, 1, 2).state;
  require(state.privatePlayers[1].knownAlignment[2] === 'mafia', 'Detective findings are stored.');
  const detectiveNextNight = startNight({ ...state, phase: 'Voting', votesRevealed: true }, false);
  require(detectiveNextNight.privatePlayers[1].knownAlignment[2] === 'mafia' && !detectiveNextNight.privatePlayers[1].info.investigationResult, 'Detective findings survive into the next night.');

  // The Old Lady's shotgun fires only once.
  const sevenPlayers: Player[] = [...players, { id: 5, name: 'June', initials: 'JU', color: 'blue' }, { id: 6, name: 'Silas', initials: 'SI', color: 'plum' }, { id: 7, name: 'Mina', initials: 'MI', color: 'gold' }];
  state = startNight(createInitialGame(sevenPlayers, { 1: 'Old Lady with Shotgun', 2: 'Mafia', 3: 'Mafia', 4: 'Citizen', 5: 'Citizen', 6: 'Citizen', 7: 'Citizen' }, () => 0), false);
  state = markNightReady(state, 1).state;
  state = submitNightAction(state, 2, 1).state;
  state = submitNightAction(state, 3, 1).state;
  resolved = resolveNight(state, () => 0);
  require(resolved.state.publicPlayers.find((player) => player.id === 2)?.alive === false && resolved.state.publicPlayers.find((player) => player.id === 1)?.alive === true, 'The first attack on the Old Lady is answered by her shotgun.');
  require(resolved.state.privatePlayers[1].shotgunSpent, 'The shotgun is marked as spent.');
  state = startNight({ ...resolved.state, phase: 'Voting', votesRevealed: true }, false);
  state = markNightReady(state, 1).state;
  state = submitNightAction(state, 3, 1).state;
  resolved = resolveNight(state, () => 0);
  require(resolved.state.publicPlayers.find((player) => player.id === 1)?.alive === false && resolved.state.publicPlayers.find((player) => player.id === 3)?.alive === true, 'A second attack on the Old Lady succeeds without retaliation.');

  // The Bad Informant inherits the attack once every Mafia member is gone.
  state = createInitialGame(sevenPlayers, { 1: 'Citizen', 2: 'Mafia', 3: 'Bad Informant', 4: 'Citizen', 5: 'Doctor', 6: 'Detective', 7: 'Citizen' }, () => 0);
  require(nightRoleOf(state, 3) === null, 'The Bad Informant has no attack while a Mafia member lives.');
  state = { ...state, publicPlayers: state.publicPlayers.map((player) => player.id === 2 ? { ...player, alive: false } : player) };
  require(nightRoleOf(state, 3) === 'Mafia', 'The Bad Informant takes over the attack after the Mafia falls.');
  state = startNight(state, true, () => 0);
  require(state.privatePlayers[3].nightAction.submitted && state.privatePlayers[3].nightAction.targetId !== null, 'A simulated Bad Informant attacks when the Mafia is gone.');

  // Simulated ballots are always legal and the Mafia never votes for its own.
  state = startVoting(createInitialGame(sevenPlayers, { 1: 'Citizen', 2: 'Mafia', 3: 'Bad Informant', 4: 'Good Informant', 5: 'Doctor', 6: 'Detective', 7: 'Citizen' }, () => 0));
  for (const seed of [0, 0.3, 0.6, 0.95]) {
    const ballots = simulateNpcVotes(state, () => seed);
    for (const [voterId, choice] of Object.entries(ballots)) {
      require(choice === 'skip' || (typeof choice === 'number' && choice !== Number(voterId)), 'Simulated ballots never target the voter.');
      if (Number(voterId) === 2 && typeof choice === 'number') require(!isMafiaAligned(state.privatePlayers[choice].role), 'Mafia bots never vote out a Mafia-aligned player.');
    }
    require(ballots[4] === 2 || ballots[4] === 3, 'The Good Informant bot votes for a known Mafia player.');
  }

  return 'Game engine self-tests passed.';
}