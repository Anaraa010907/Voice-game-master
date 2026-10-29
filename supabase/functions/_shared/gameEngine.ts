/**
 * MAFIA: SHADOWS rules engine.
 *
 * Pure TypeScript with no imports, so the same file runs in the browser (Vite), in Node tests
 * and in Supabase Edge Functions (Deno). The server is the only place that mutates a real game;
 * clients only ever see the public projection and their own private slice.
 *
 * The Don, Bodyguard and Jester roles, the room modes (classic / hard / custom) and the
 * "everyone has seen their role" ready check follow MAFIA by Sattorov Alixon (MIT licence),
 * fitted to this game's trial, informants and Old Lady rules.
 */

export type RoleName =
  | 'Mafia'
  | 'Don'
  | 'Doctor'
  | 'Detective'
  | 'Bodyguard'
  | 'Good Informant'
  | 'Bad Informant'
  | 'Old Lady with Shotgun'
  | 'Jester'
  | 'Citizen';

export type Team = 'town' | 'mafia' | 'wildcard';

export const roleTeams: Record<RoleName, Team> = {
  Mafia: 'mafia',
  Don: 'mafia',
  Doctor: 'town',
  Detective: 'town',
  Bodyguard: 'town',
  Jester: 'wildcard',
  'Good Informant': 'town',
  'Bad Informant': 'mafia',
  'Old Lady with Shotgun': 'town',
  Citizen: 'town',
};

export type EnginePlayer = { id: number; name: string; initials: string; color: string; host?: boolean; avatarUrl?: string | null; bot?: boolean };

export type GamePhase = 'Role Reveal' | 'Night' | 'Morning' | 'Discussion' | 'Voting' | 'Results';
export type VoteChoice = number | 'skip' | null;
export type Verdict = 'guilty' | 'innocent';
/** What happened each Night and Day, shown to everyone once the game is over. */
export type HistoryEntry =
  | { kind: 'night'; round: number; mafiaTargetId: number | null; outcome: 'killed' | 'protected' | 'guarded' | 'shotgun' | 'none'; eliminatedId: number | null;
      protectedIds: number[]; guardIds?: number[]; investigations: Array<{ detectiveId: number; targetId: number; mafia: boolean }> }
  | { kind: 'day'; round: number; accusedId: number | null; guilty: number | null; innocent: number | null; eliminatedId: number | null; jester?: boolean };
/** A nominated player defends themselves, then the table decides: guilty eliminates, innocent spares. */
export type Trial = { accusedId: number; nominationVotes: number; verdicts: Record<number, Verdict> };
export type WinningTeam = 'Citizens' | 'Mafia' | 'Jester' | null;
export type NightRole = 'Mafia' | 'Doctor' | 'Detective' | 'Bodyguard';

/** Room rules the host picks in the lobby. Classic and Hard are presets; Custom unlocks every switch. */
export type GameMode = 'classic' | 'hard' | 'custom';
export type OptionalRole = 'don' | 'bodyguard' | 'jester' | 'oldLady' | 'informants';
export type DiscussionLength = 'short' | 'normal' | 'long';
export type MafiaSettings = {
  mode: GameMode;
  /** Optional roles that may be dealt (each still needs a big enough table). */
  roles: Record<OptionalRole, boolean>;
  /** A convicted player's role is shown to the table. */
  revealOnConviction: boolean;
  /** Vote counts are shown, but not who voted for whom. */
  anonymousVotes: boolean;
  discussion: DiscussionLength;
};
export const OPTIONAL_ROLES: OptionalRole[] = ['don', 'bodyguard', 'jester', 'oldLady', 'informants'];
const ALL_ROLES_ON: Record<OptionalRole, boolean> = { don: true, bodyguard: true, jester: true, oldLady: true, informants: true };
export const DEFAULT_MAFIA_SETTINGS: MafiaSettings = { mode: 'classic', roles: ALL_ROLES_ON, revealOnConviction: true, anonymousVotes: false, discussion: 'normal' };

/** Cleans settings from the client or an older room. Classic and Hard fix every rule except the discussion length. */
export function sanitizeMafiaSettings(input: unknown): MafiaSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<MafiaSettings>;
  const mode: GameMode = raw.mode === 'hard' || raw.mode === 'custom' ? raw.mode : 'classic';
  const discussion: DiscussionLength = raw.discussion === 'short' || raw.discussion === 'long' ? raw.discussion : 'normal';
  if (mode === 'classic') return { ...DEFAULT_MAFIA_SETTINGS, discussion };
  if (mode === 'hard') return { mode, roles: ALL_ROLES_ON, revealOnConviction: false, anonymousVotes: true, discussion };
  const roles = Object.fromEntries(OPTIONAL_ROLES.map((role) => [role, raw.roles?.[role] !== false])) as Record<OptionalRole, boolean>;
  return { mode, roles, revealOnConviction: raw.revealOnConviction !== false, anonymousVotes: raw.anonymousVotes === true, discussion };
}

export type PublicGamePlayer = Pick<EnginePlayer, 'id' | 'name' | 'initials' | 'color' | 'host' | 'avatarUrl' | 'bot'> & {
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
  morningReport: string;
  publicEventLog: string[];
  voteCounts: Record<string, number>;
  voteSummary: string;
  votesRevealed: boolean;
  /** A tied ballot triggers exactly one runoff between the tied players. */
  runoffCandidates: number[] | null;
  runoffUsed: boolean;
  /** Set once the nomination ballot picks one player; cleared at the next Voting or Night. */
  trial: Trial | null;
  /** Older saved games may not have it yet. */
  history?: HistoryEntry[];
  /** Room rules for this match (older saved games: classic). */
  settings?: MafiaSettings;
  /**
   * Players who tapped "done" in the current waiting step (role reveal, morning report, discussion,
   * revealed ballot). Once every living person has, the step ends early. `readyStep` names the step
   * the list belongs to, so it empties itself when the game moves on.
   */
  readyIds?: number[];
  readyStep?: string;
  winner: WinningTeam;
};

export type EngineResult = { state: GameEngineState; error?: string };
export type RandomSource = () => number;

export const MIN_PLAYERS = 4;


const defaultRandom: RandomSource = () => Math.random();

function shuffle<T>(items: T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function isMafiaAligned(role: RoleName): boolean {
  return roleTeams[role] === 'mafia';
}

/** The Mafia proper: the members (and their Don) who know each other and attack together. */
export function isMafiaMember(role: RoleName): boolean {
  return role === 'Mafia' || role === 'Don';
}

/** What the Detective is told. The Don passes as innocent. */
function appearsMafia(role: RoleName) {
  return isMafiaAligned(role) && role !== 'Don';
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
  if (isMafiaMember(secret.role)) return 'Mafia';
  if (secret.role === 'Doctor' || secret.role === 'Detective' || secret.role === 'Bodyguard') return secret.role;
  if (secret.role === 'Bad Informant') {
    const mafiaLeft = state.publicPlayers.some((candidate) => candidate.alive && isMafiaMember(state.privatePlayers[candidate.id].role));
    if (!mafiaLeft) return 'Mafia';
  }
  return null;
}

/**
 * The roles dealt for a table of this size, before shuffling. About a third of the table is on the
 * Mafia side. Optional roles join once the table is big enough for them not to decide the game:
 * Classic and Hard add the Don and the Jester at 10 players and the Bodyguard at 12; Custom lets
 * the host switch each one on or off and brings them in earlier.
 */
export function roleComposition(playerCount: number, settings: MafiaSettings = DEFAULT_MAFIA_SETTINGS): RoleName[] {
  const custom = settings.mode === 'custom';
  const allowed = settings.roles;
  const mafiaQuota = Math.max(1, Math.floor((playerCount - 1) / 3));
  const mafiaSide: RoleName[] = ['Mafia'];
  if (allowed.informants && playerCount >= 7) mafiaSide.push('Bad Informant');
  while (mafiaSide.length < mafiaQuota) mafiaSide.push('Mafia');
  // The Don leads other Mafia members; he never plays alone.
  if (allowed.don && playerCount >= (custom ? 6 : 10) && mafiaSide.filter((role) => role === 'Mafia').length >= 2) mafiaSide[0] = 'Don';

  const special: RoleName[] = ['Doctor', 'Detective'];
  if (allowed.oldLady && playerCount >= 6) special.push('Old Lady with Shotgun');
  // The Good Informant knows every Mafia member. At small tables (one or two Mafia) that decides
  // the game on day one, so the role only joins tables of eight or more.
  if (allowed.informants && playerCount >= 8) special.push('Good Informant');
  if (allowed.jester && playerCount >= (custom ? 7 : 10)) special.push('Jester');
  if (allowed.bodyguard && playerCount >= (custom ? 8 : 12)) special.push('Bodyguard');
  while (mafiaSide.length + special.length > playerCount && special.length > 2) special.pop();

  const pool: RoleName[] = [mafiaSide[0], ...special.slice(0, 2), ...special.slice(2, 3), ...mafiaSide.slice(1), ...special.slice(3)];
  while (pool.length < playerCount) pool.push('Citizen');
  return pool;
}

export function createInitialGame(
  players: EnginePlayer[],
  assignments?: Partial<Record<number, RoleName>>,
  random: RandomSource = defaultRandom,
  settings: MafiaSettings = DEFAULT_MAFIA_SETTINGS,
): GameEngineState {
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error('Player IDs must be unique.');
  const rules = sanitizeMafiaSettings(settings);
  const shuffled = shuffle(roleComposition(players.length, rules), random);
  const roleById = Object.fromEntries(players.map((player, index) => [player.id, assignments?.[player.id] ?? shuffled[index]])) as Record<number, RoleName>;
  const mafiaIds = players.filter((other) => isMafiaMember(roleById[other.id])).map((other) => other.id);
  const privatePlayers = Object.fromEntries(players.map((player) => {
    const role = roleById[player.id];
    return [player.id, {
      role,
      team: roleTeams[role],
      info: {
        mafiaTeammateIds: isMafiaMember(role) ? mafiaIds.filter((id) => id !== player.id) : [],
        // Both informants learn who the Mafia and their Don are: the Good Informant to expose them, the
        // Bad Informant to know whom to help. The Mafia never learn the Bad Informant, so the Mafia
        // side keeps one hidden piece even after the Good Informant speaks up.
        informantMafiaIds: role === 'Good Informant' || role === 'Bad Informant' ? mafiaIds : [],
        badInformantObjective: role === 'Bad Informant' ? 'Help the Mafia survive and mislead the citizens.' : '',
        investigationResult: '',
        protectionResult: '',
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
    publicPlayers: players.map((player) => ({ id: player.id, name: player.name, initials: player.initials, color: player.color, host: player.host, avatarUrl: player.avatarUrl ?? null, bot: player.bot ?? false, alive: true, voteStatus: 'hidden', voteTargetId: null, revealedRole: null })),
    privatePlayers,
    nightResolved: false,
    retaliationResolved: false,
    morningReport: '',
    publicEventLog: ['The table is set. Roles have been dealt in secret.'],
    voteCounts: {},
    voteSummary: '',
    votesRevealed: false,
    runoffCandidates: null,
    runoffUsed: false,
    trial: null,
    history: [],
    settings: rules,
    readyIds: [],
    winner: null,
  };
}

/**
 * The steps that only wait for people (nobody has to act): reading the role card, the morning
 * report, the discussion and the revealed ballot. Each can end early once everyone is done.
 */
export function waitStep(state: Pick<GameEngineState, 'phase' | 'round' | 'votesRevealed'>): string | null {
  if (state.phase === 'Role Reveal') return 'reveal';
  if (state.phase === 'Morning') return `morning-${state.round}`;
  if (state.phase === 'Discussion') return `discussion-${state.round}`;
  if (state.phase === 'Voting' && state.votesRevealed) return `ballot-${state.round}`;
  return null;
}

/** Who is done with the current waiting step. */
export function readyNow(state: GameEngineState): number[] {
  const step = waitStep(state);
  if (!step) return [];
  // Games saved before readyStep existed only ever waited at the role reveal.
  if (state.readyStep === step || (state.readyStep === undefined && step === 'reveal')) return state.readyIds ?? [];
  return [];
}

/** A living player is done with the current waiting step. Bots never hold anyone up. */
export function markReady(state: GameEngineState, playerId: number): EngineResult {
  const step = waitStep(state);
  if (!step) return { state, error: 'Nothing to wait for now.' };
  if (!state.publicPlayers.some((player) => player.id === playerId && player.alive)) return { state, error: 'Eliminated players cannot act.' };
  const ready = readyNow(state);
  if (ready.includes(playerId)) return { state };
  return { state: { ...state, readyIds: [...ready, playerId], readyStep: step } };
}

export function allReady(state: GameEngineState): boolean {
  if (!waitStep(state)) return false;
  const ready = readyNow(state);
  return state.publicPlayers.every((player) => !player.alive || player.bot || ready.includes(player.id));
}

/** Role Reveal: a player has read their card. */
export function markRevealReady(state: GameEngineState, playerId: number): EngineResult {
  if (state.phase !== 'Role Reveal') return { state, error: 'The Night has already begun.' };
  return markReady(state, playerId);
}

export function allRevealReady(state: GameEngineState): boolean {
  return state.phase === 'Role Reveal' && allReady(state);
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
    info: { ...player.info, investigationResult: '', protectionResult: '' },
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
    morningReport: '',
    votesRevealed: false,
    runoffCandidates: null,
    runoffUsed: false,
    trial: null,
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
    trial: null,
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
  if (nightRole === 'Bodyguard' && actorId === targetId) return { state, error: 'Choose another living player to guard.' };
  if (nightRole === 'Doctor' && secret.lastProtectedId === targetId) return { state, error: 'You cannot protect the same player two nights in a row.' };
  const mafiaAligned = appearsMafia(state.privatePlayers[targetId].role);
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
  // The Don's word is final. Otherwise most Mafia votes wins; ties break toward the lowest seat.
  // No votes (timeout) means no attack.
  const don = livingMafia.find((player) => state.privatePlayers[player.id].role === 'Don');
  const donPick = don ? state.privatePlayers[don.id].nightAction : null;
  if (don && donPick?.submitted && donPick.targetId !== null && candidates.some((player) => player.id === donPick.targetId)) {
    return { targetId: donPick.targetId, attackerId: don.id };
  }
  const ranked = [...tally.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  const targetId = ranked[0]?.[0] ?? null;
  const voters = livingMafia.filter((player) => state.privatePlayers[player.id].nightAction.targetId === targetId);
  const attackerId = targetId === null ? null : voters[0]?.id ?? null;
  return { targetId, attackerId };
}

export function resolveMafiaTarget(state: GameEngineState) {
  return selectedMafiaTarget(state);
}

export function resolveNight(state: GameEngineState, _random: RandomSource = defaultRandom): EngineResult {
  if (state.phase !== 'Night' || state.winner || state.nightResolved) return { state, error: 'This Night has already been resolved or is closed.' };

  const { targetId: mafiaTargetId, attackerId } = selectedMafiaTarget(state);
  const target = state.publicPlayers.find((player) => player.id === mafiaTargetId && player.alive);
  const doctors = state.publicPlayers.filter((player) => player.alive && state.privatePlayers[player.id].role === 'Doctor');
  const protectingDoctor = doctors.find((doctor) => {
    const action = state.privatePlayers[doctor.id].nightAction;
    return action.submitted && action.targetId === target?.id;
  });
  const protectedTarget = Boolean(target && protectingDoctor);
  const bodyguards = state.publicPlayers.filter((player) => nightRoleOf(state, player.id) === 'Bodyguard');
  const guardingBodyguard = bodyguards.find((guard) => {
    const action = state.privatePlayers[guard.id].nightAction;
    return action.submitted && action.targetId === target?.id;
  });
  let publicPlayers = state.publicPlayers;
  let report = 'No Mafia attack reached the neighborhood tonight.';
  let retaliationResolved = false;
  let outcome: 'killed' | 'protected' | 'guarded' | 'shotgun' | 'none' = 'none';
  let eliminatedId: number | null = null;
  const privatePlayers: Record<number, PrivateGamePlayer> = { ...state.privatePlayers };

  if (target && attackerId !== null) {
    const targetSecret = state.privatePlayers[target.id];
    if (protectedTarget) {
      outcome = 'protected';
      report = 'A failed attack was reported before dawn. No one was eliminated.';
    } else if (guardingBodyguard) {
      // The Bodyguard steps in front of the attack and dies in the target's place. Like any night
      // victim, their role stays secret.
      outcome = 'guarded';
      eliminatedId = guardingBodyguard.id;
      publicPlayers = publicPlayers.map((player) => player.id === guardingBodyguard.id ? { ...player, alive: false } : player);
      report = `${guardingBodyguard.name} was eliminated during the night.`;
    } else if (targetSecret.role === 'Old Lady with Shotgun' && !targetSecret.shotgunSpent) {
      // The shotgun fires once. She survives the first attack, but the Mafia now knows where she lives.
      const retaliator = state.publicPlayers
        .filter((player) => player.alive && isMafiaAligned(state.privatePlayers[player.id].role))
        .sort((left, right) => left.id === attackerId ? -1 : right.id === attackerId ? 1 : left.id - right.id)[0];
      privatePlayers[target.id] = { ...targetSecret, shotgunSpent: true };
      outcome = 'shotgun';
      if (retaliator) {
        eliminatedId = retaliator.id;
        publicPlayers = publicPlayers.map((player) => player.id === retaliator.id ? { ...player, alive: false } : player);
        retaliationResolved = true;
        report = 'A shotgun answered from the dark. The attacker was eliminated before dawn.';
      } else {
        report = 'An attempted attack was stopped at the old house. No one was eliminated.';
      }
    } else {
      outcome = 'killed';
      eliminatedId = target.id;
      publicPlayers = publicPlayers.map((player) => player.id === target.id ? { ...player, alive: false } : player);
      report = `${target.name} was eliminated during the night.`;
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
  for (const guard of bodyguards) {
    const guardSecret = privatePlayers[guard.id];
    if (!guardSecret.nightAction.submitted || guard.id === guardingBodyguard?.id) continue;
    privatePlayers[guard.id] = { ...guardSecret, info: { ...guardSecret.info, protectionResult: 'No attack came for the player you guarded.' } };
  }

  const livingCount = publicPlayers.filter((player) => player.alive).length;
  const morningReport = `${report} ${livingCount} players remain alive.`;
  const nightEntry: HistoryEntry = {
    kind: 'night',
    round: state.round,
    mafiaTargetId: target?.id ?? null,
    outcome,
    eliminatedId,
    protectedIds: doctors.map((doctor) => state.privatePlayers[doctor.id].nightAction).filter((action) => action.submitted && action.targetId !== null).map((action) => action.targetId!),
    guardIds: bodyguards.map((guard) => state.privatePlayers[guard.id].nightAction).filter((action) => action.submitted && action.targetId !== null).map((action) => action.targetId!),
    // What each Detective was told (the Don shows as innocent).
    investigations: state.publicPlayers
      .filter((player) => nightRoleOf(state, player.id) === 'Detective' && state.privatePlayers[player.id].nightAction.submitted && state.privatePlayers[player.id].nightAction.targetId !== null)
      .map((player) => {
        const targetId = state.privatePlayers[player.id].nightAction.targetId!;
        return { detectiveId: player.id, targetId, mafia: appearsMafia(state.privatePlayers[targetId].role) };
      }),
  };
  return {
    state: {
      ...state,
      phase: 'Morning',
      publicPlayers,
      privatePlayers,
      nightResolved: true,
      retaliationResolved,
      morningReport,
      history: [...(state.history ?? []), nightEntry],
      publicEventLog: [...state.publicEventLog.slice(-3), report],
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
  if (state.phase !== 'Voting' || state.winner || state.votesRevealed || state.trial) return { state, error: 'Voting is closed.' };
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
  if (state.phase !== 'Voting' || state.winner || state.votesRevealed || state.trial) return { state, error: 'Voting is closed.' };

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

  const accusedId = leaders.length === 1 && leaders[0][0] !== 'skip' ? Number(leaders[0][0]) : null;
  const publicPlayers = state.publicPlayers.map((player) => {
    const ballot = ballots.find((item) => item.voterId === player.id);
    return {
      ...player,
      voteStatus: player.alive ? 'revealed' as const : 'not-eligible' as const,
      voteTargetId: typeof ballot?.choice === 'number' ? ballot.choice : null,
    };
  });
  const privatePlayers = { ...state.privatePlayers };
  for (const ballot of ballots) {
    privatePlayers[ballot.voterId] = { ...privatePlayers[ballot.voterId], vote: { submitted: true, choice: ballot.choice } };
  }

  // One clear leader goes on trial: they get to defend themselves before the verdict.
  const accused = state.publicPlayers.find((player) => player.id === accusedId);
  if (accused) {
    const voteSummary = `${accused.name} is on trial with ${voteCounts[String(accused.id)]} votes.`;
    return {
      state: {
        ...state,
        publicPlayers,
        privatePlayers,
        voteCounts,
        voteSummary,
        trial: { accusedId: accused.id, nominationVotes: voteCounts[String(accused.id)], verdicts: {} },
        publicEventLog: [...state.publicEventLog.slice(-3), voteSummary],
      },
    };
  }

  const voteSummary = state.runoffUsed && tiedPlayers.length > 1
    ? 'The runoff was tied again. No one was eliminated.'
    : 'The vote was tied or Skip Vote led the count. No one was eliminated.';
  return {
    state: {
      ...state,
      phase: 'Voting',
      publicPlayers,
      privatePlayers,
      voteCounts,
      voteSummary,
      votesRevealed: true,
      history: [...(state.history ?? []), { kind: 'day', round: state.round, accusedId: null, guilty: null, innocent: null, eliminatedId: null }],
      winner: getWinner({ publicPlayers, privatePlayers }),
      publicEventLog: [...state.publicEventLog.slice(-3), voteSummary],
    },
  };
}

/** Who may give a verdict: every living player except the accused. */
function verdictVoters(state: GameEngineState) {
  return state.publicPlayers.filter((player) => player.alive && player.id !== state.trial?.accusedId);
}

export function recordVerdict(state: GameEngineState, voterId: number, verdict: Verdict): EngineResult {
  const trial = state.trial;
  if (state.phase !== 'Voting' || state.winner || state.votesRevealed || !trial) return { state, error: 'There is no trial right now.' };
  if (verdict !== 'guilty' && verdict !== 'innocent') return { state, error: 'Choose guilty or innocent.' };
  if (!verdictVoters(state).some((player) => player.id === voterId)) return { state, error: 'You cannot give a verdict in this trial.' };
  if (trial.verdicts[voterId]) return { state, error: 'Your verdict is already locked.' };
  return { state: { ...state, trial: { ...trial, verdicts: { ...trial.verdicts, [voterId]: verdict } } } };
}

export function allVerdictsSubmitted(state: GameEngineState): boolean {
  const trial = state.trial;
  return Boolean(trial) && verdictVoters(state).every((player) => Boolean(trial!.verdicts[player.id]));
}

/** Counts the verdict. More guilty than innocent eliminates the accused; a tie or no votes spares them. */
export function resolveTrial(state: GameEngineState): EngineResult {
  const trial = state.trial;
  if (state.phase !== 'Voting' || state.winner || state.votesRevealed || !trial) return { state, error: 'There is no trial right now.' };
  const voters = verdictVoters(state);
  const guilty = voters.filter((player) => trial.verdicts[player.id] === 'guilty').length;
  const innocent = voters.filter((player) => trial.verdicts[player.id] === 'innocent').length;
  const accused = state.publicPlayers.find((player) => player.id === trial.accusedId);
  const convicted = Boolean(accused?.alive) && guilty > innocent;
  const accusedRole = state.privatePlayers[trial.accusedId]?.role;
  // The Jester wants exactly this: being voted out wins the game for them alone.
  const jesterWins = convicted && accusedRole === 'Jester';
  const reveal = jesterWins || (state.settings?.revealOnConviction ?? true);
  const publicPlayers = state.publicPlayers.map((player) => player.id === trial.accusedId && convicted
    ? { ...player, alive: false, revealedRole: reveal ? state.privatePlayers[player.id].role : null }
    : player);
  const name = accused?.name ?? '?';
  const voteSummary = !accused?.alive
    ? `${name} left before the verdict. No one was eliminated.`
    : convicted
      ? `${name} was found guilty (${guilty}–${innocent}) and eliminated.`
      : `${name} was acquitted (${guilty}–${innocent}). No one was eliminated.`;
  const roleReveal = convicted && reveal ? `${name} was revealed as ${accusedRole}.` : '';
  const jesterLine = jesterWins ? 'The Jester fooled the town and wins alone.' : '';
  return {
    state: {
      ...state,
      publicPlayers,
      voteSummary,
      votesRevealed: true,
      history: [...(state.history ?? []), { kind: 'day', round: state.round, accusedId: trial.accusedId, guilty, innocent, eliminatedId: convicted ? trial.accusedId : null, ...(jesterWins ? { jester: true } : {}) }],
      winner: jesterWins ? 'Jester' : getWinner({ publicPlayers, privatePlayers: state.privatePlayers }),
      publicEventLog: [...state.publicEventLog.slice(-3), voteSummary, ...(roleReveal ? [roleReveal] : []), ...(jesterLine ? [jesterLine] : [])],
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
  // Anonymous voting: the counts are public, who voted for whom is not (until the game ends).
  const hideBallots = Boolean(state.settings?.anonymousVotes) && !finished;
  return {
    phase: state.phase,
    round: state.round,
    players: hideBallots
      ? state.publicPlayers.map((player) => ({ ...player, voteStatus: player.voteStatus === 'revealed' ? 'hidden' as const : player.voteStatus, voteTargetId: null }))
      : state.publicPlayers,
    settings: state.settings ?? DEFAULT_MAFIA_SETTINGS,
    readyIds: readyNow(state),
    morningReport: state.morningReport,
    publicEventLog: state.publicEventLog,
    voteCounts: state.votesRevealed || state.trial ? state.voteCounts : {},
    voteSummary: state.voteSummary,
    votesRevealed: state.votesRevealed,
    runoffCandidates: state.runoffCandidates,
    voteCountsOpen: state.votesRevealed || Boolean(state.trial),
    trial: state.trial ? {
      accusedId: state.trial.accusedId,
      nominationVotes: state.trial.nominationVotes,
      decided: Object.keys(state.trial.verdicts).length,
      guilty: state.votesRevealed ? Object.values(state.trial.verdicts).filter((verdict) => verdict === 'guilty').length : null,
      innocent: state.votesRevealed ? Object.values(state.trial.verdicts).filter((verdict) => verdict === 'innocent').length : null,
    } : null,
    winner: state.winner,
    history: finished ? state.history ?? [] : null,
    finalRoles: finished ? Object.fromEntries(Object.entries(state.privatePlayers).map(([id, player]) => [id, player.role])) as Record<number, RoleName> : null,
  };
}
export type PublicGameView = ReturnType<typeof publicView>;

/**
 * What one player may see. Living players see only their own role. Eliminated players become
 * spectators and see every role, since they can no longer affect the game.
 */
export function privateView(state: GameEngineState, playerId: number) {
  const secret = state.privatePlayers[playerId];
  if (!secret) return null;
  const eliminated = state.publicPlayers.find((player) => player.id === playerId)?.alive === false;
  return {
    spectatorRoles: eliminated ? Object.fromEntries(Object.entries(state.privatePlayers).map(([id, player]) => [id, player.role])) as Record<number, RoleName> : null,
    seat: playerId,
    role: secret.role,
    team: secret.team,
    info: secret.info,
    nightRole: nightRoleOf(state, playerId),
    nightAction: secret.nightAction,
    vote: secret.vote,
    verdict: state.trial?.verdicts[playerId] ?? null,
    lastProtectedId: secret.lastProtectedId,
    knownAlignment: secret.knownAlignment,
    shotgunSpent: secret.shotgunSpent,
    /** Done with the current waiting step (the name dates from when only the role reveal waited). */
    readyForNight: readyNow(state).includes(playerId),
    /** Night only, for the Mafia: which target each known teammate has locked (null = not yet). */
    teamTargets: state.phase === 'Night' && nightRoleOf(state, playerId) === 'Mafia'
      ? Object.fromEntries(secret.info.mafiaTeammateIds
        .filter((id) => state.publicPlayers.find((player) => player.id === id)?.alive)
        .map((id) => [id, state.privatePlayers[id].nightAction.submitted ? state.privatePlayers[id].nightAction.targetId : null])) as Record<number, number | null>
      : null,
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
  for (let count = MIN_PLAYERS; count <= 12; count += 1) require(roleComposition(count).includes('Good Informant') === count >= 8, `Good Informant only at tables of 8+ (${count}).`);

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
  require(privateView(state, 4)?.spectatorRoles === null, 'Living players never receive other roles.');
  const spectating = { ...state, publicPlayers: state.publicPlayers.map((player) => player.id === 4 ? { ...player, alive: false } : player) };
  require(privateView(spectating, 4)?.spectatorRoles?.[3] === 'Mafia', 'Eliminated players see every role as spectators.');

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
  require(state.privatePlayers[1].info.informantMafiaIds.includes(2) && !state.privatePlayers[1].info.informantMafiaIds.includes(3), 'Good Informant learns the Mafia members, not the Bad Informant.');

  // Mafia see which target each teammate has locked, and only at Night.
  {
    let team = startNight(fixed({ 1: 'Mafia', 2: 'Mafia', 3: 'Citizen', 4: 'Doctor', 5: 'Citizen', 6: 'Detective' }));
    require(privateView(team, 2)?.teamTargets?.[1] === null, 'A teammate with no pick shows as not chosen.');
    team = submitNightAction(team, 1, 3).state;
    require(privateView(team, 2)?.teamTargets?.[1] === 3, 'A teammate sees the locked Mafia target.');
    require(privateView(team, 3)?.teamTargets === null, 'Town players never see Mafia targets.');
  }
  require(!('role' in state.publicPlayers[1]), 'Public player data does not contain secret roles.');
  require(publicView(state).finalRoles === null, 'Roles stay hidden in the public view until the game ends.');
  require(state.privatePlayers[3].info.badInformantObjective.length > 0, 'Bad Informant receives a private objective.');
  require(state.privatePlayers[3].info.informantMafiaIds.includes(2) && !state.privatePlayers[3].info.informantMafiaIds.includes(3), 'Bad Informant learns the Mafia members it helps.');
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

  // The nomination winner goes on trial; a guilty verdict eliminates them, reveals the role, and can end the game.
  state = startVoting(fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' }));
  for (const [voter, choice] of [[1, 2], [2, 1], [3, 2], [4, 2]] as const) state = recordVote(state, voter, choice).state;
  resolved = resolveVoting(state);
  require(resolved.state.trial?.accusedId === 2 && !resolved.state.votesRevealed && resolved.state.publicPlayers.find((player) => player.id === 2)?.alive === true, 'One clear leader goes on trial instead of being eliminated at once.');
  require(Boolean(recordVote(resolved.state, 1, 3).error), 'The nomination ballot is closed during a trial.');
  require(Boolean(recordVerdict(resolved.state, 2, 'innocent').error), 'The accused cannot vote in their own trial.');
  state = resolved.state;
  for (const voter of [1, 3, 4]) state = recordVerdict(state, voter, 'guilty').state;
  require(allVerdictsSubmitted(state) && Boolean(recordVerdict(state, 1, 'innocent').error), 'Each verdict locks once; the trial is complete when everyone else decided.');
  resolved = resolveTrial(state);
  require(resolved.state.publicPlayers.find((player) => player.id === 2)?.revealedRole === 'Mafia', 'A voted-out player has their role revealed publicly.');
  require(resolved.state.winner === 'Citizens' && finishDay(resolved.state).phase === 'Results', 'A winning vote leads to Results.');
  require(publicView(finishDay(resolved.state)).finalRoles?.[3] === 'Doctor', 'All roles are revealed once the game ends.');

  // A tie or a majority of innocent verdicts spares the accused.
  state = startVoting(fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective', 5: 'Citizen' }));
  for (const [voter, choice] of [[1, 2], [2, 1], [3, 2], [4, 2], [5, 2]] as const) state = recordVote(state, voter, choice).state;
  state = resolveVoting(state).state;
  state = recordVerdict(state, 1, 'guilty').state;
  state = recordVerdict(state, 3, 'innocent').state;
  resolved = resolveTrial(state);
  require(resolved.state.votesRevealed && resolved.state.publicPlayers.every((player) => player.alive) && /acquitted \(1–1\)/.test(resolved.state.voteSummary), 'A tied verdict (missing votes abstain) acquits.');

  const citizenWin = fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' });
  require(getWinner({ ...citizenWin, publicPlayers: citizenWin.publicPlayers.map((player) => player.id === 2 ? { ...player, alive: false } : player) }) === 'Citizens', 'Citizens win when all Mafia-aligned players are gone.');
  require(getWinner({ ...citizenWin, publicPlayers: citizenWin.publicPlayers.map((player) => player.id > 2 ? { ...player, alive: false } : player) }) === 'Mafia', 'Mafia wins when aligned players equal or outnumber the living town.');

  // The morning reports only what happened: no footprint or trace clues.
  state = startNight(fixed({ 1: 'Doctor', 2: 'Mafia', 3: 'Citizen', 4: 'Old Lady with Shotgun' }));
  state = submitNightAction(state, 1, 1).state;
  resolved = resolveNight(state, () => 0);
  require(!/trace/i.test(resolved.state.morningReport) && !resolved.state.publicEventLog.some((line) => /trace/i.test(line)), 'Morning reports carry no trace clues.');
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

  // Optional roles join at the table sizes each mode allows; Custom can switch every one off.
  for (let count = MIN_PLAYERS; count <= 12; count += 1) {
    const classic = roleComposition(count);
    require(classic.includes('Don') === count >= 10 && classic.includes('Jester') === count >= 10 && classic.includes('Bodyguard') === count >= 12, `Classic optional roles at ${count}.`);
    require(roleComposition(count, sanitizeMafiaSettings({ mode: 'custom' })).length === count, `Custom composition fills ${count} seats.`);
    const plain = roleComposition(count, sanitizeMafiaSettings({ mode: 'custom', roles: { don: false, bodyguard: false, jester: false, oldLady: false, informants: false } }));
    require(plain.length === count && plain.every((role) => role === 'Mafia' || role === 'Doctor' || role === 'Detective' || role === 'Citizen'), `Custom can switch every optional role off (${count}).`);
  }
  require(sanitizeMafiaSettings({ mode: 'hard', anonymousVotes: false }).anonymousVotes && !sanitizeMafiaSettings({ mode: 'hard' }).revealOnConviction, 'Hard mode fixes its own rules.');
  require(sanitizeMafiaSettings('nonsense').mode === 'classic', 'Bad settings fall back to Classic.');

  // The Don leads the attack and passes the Detective's check.
  state = startNight(createInitialGame(seven, { 1: 'Don', 2: 'Mafia', 3: 'Detective', 4: 'Citizen', 5: 'Citizen', 6: 'Doctor', 7: 'Citizen' }, () => 0));
  require(state.privatePlayers[1].info.mafiaTeammateIds.includes(2) && state.privatePlayers[2].info.mafiaTeammateIds.includes(1), 'The Don and the Mafia know each other.');
  state = submitNightAction(state, 3, 1).state;
  require(state.privatePlayers[3].knownAlignment[1] === 'town', 'The Detective sees the Don as innocent.');
  state = submitNightAction(state, 2, 4).state;
  state = submitNightAction(state, 1, 5).state;
  require(resolveMafiaTarget(state).targetId === 5, "The Don's pick decides the Mafia attack.");

  // The Bodyguard dies in place of the player they guard.
  state = startNight(createInitialGame(seven, { 1: 'Bodyguard', 2: 'Mafia', 3: 'Citizen', 4: 'Citizen', 5: 'Citizen', 6: 'Doctor', 7: 'Detective' }, () => 0));
  require(Boolean(submitNightAction(state, 1, 1).error), 'The Bodyguard cannot guard themselves.');
  state = submitNightAction(state, 1, 3).state;
  state = submitNightAction(state, 2, 3).state;
  resolved = resolveNight(state, () => 0);
  const guardedNight = resolved.state.history?.[resolved.state.history.length - 1];
  require(resolved.state.publicPlayers.find((player) => player.id === 1)?.alive === false && resolved.state.publicPlayers.find((player) => player.id === 3)?.alive === true
    && guardedNight?.kind === 'night' && guardedNight.outcome === 'guarded', 'The Bodyguard dies in place of the guarded player.');

  // A convicted Jester wins alone.
  state = startVoting(fixed({ 1: 'Citizen', 2: 'Mafia', 3: 'Jester', 4: 'Citizen' }));
  for (const [voter, choice] of [[1, 3], [2, 3], [3, 1], [4, 3]] as const) state = recordVote(state, voter, choice).state;
  state = resolveVoting(state).state;
  for (const voter of [1, 2, 4]) state = recordVerdict(state, voter, 'guilty').state;
  resolved = resolveTrial(state);
  require(resolved.state.winner === 'Jester' && finishDay(resolved.state).phase === 'Results', 'A convicted Jester wins the game alone.');

  // Hard mode: ballots are anonymous and a convicted player's role stays hidden.
  state = startVoting(createInitialGame(players, { 1: 'Citizen', 2: 'Mafia', 3: 'Doctor', 4: 'Detective' }, () => 0, sanitizeMafiaSettings({ mode: 'hard' })));
  for (const [voter, choice] of [[1, 2], [2, 1], [3, 2], [4, 2]] as const) state = recordVote(state, voter, choice).state;
  state = resolveVoting(state).state;
  require(publicView(state).players.every((player) => player.voteTargetId === null) && publicView(state).voteCounts['2'] === 3, 'Anonymous ballots show counts but not voters.');
  for (const voter of [1, 3, 4]) state = recordVerdict(state, voter, 'guilty').state;
  resolved = resolveTrial(state);
  require(resolved.state.publicPlayers.find((player) => player.id === 2)?.alive === false && resolved.state.publicPlayers.find((player) => player.id === 2)?.revealedRole === null, 'Hard mode keeps the convicted role hidden.');

  // Role Reveal ends early once every person has read their card; bots are always ready.
  state = createInitialGame([...players.slice(0, 3), { ...players[3], bot: true }], undefined, () => 0);
  require(!allRevealReady(state), 'The Night waits for people who have not read their card.');
  for (const id of [1, 2, 3]) state = markRevealReady(state, id).state;
  require(allRevealReady(state) && privateView(state, 1)?.readyForNight === true, 'Everyone ready lets the Night start.');
  // The same "done" works in the morning, the discussion and after the ballot, and resets each step.
  const morning = { ...state, phase: 'Morning' as const, round: 2 };
  require(!allReady(morning) && readyNow(morning).length === 0, 'Readiness does not carry over to the next step.');
  let waiting: GameEngineState = morning;
  for (const id of state.publicPlayers.filter((player) => player.alive && !player.bot).map((player) => player.id)) {
    require(!allReady(waiting), 'The morning waits until everyone is done.');
    waiting = markReady(waiting, id).state;
  }
  require(allReady(waiting), 'Everyone done ends the morning early.');
  require(!allReady({ ...waiting, phase: 'Discussion' }), 'The discussion starts with nobody done.');
  require(Boolean(markReady({ ...waiting, phase: 'Night' }, 1).error), 'Nobody can skip the Night by tapping done.');

  return 'Game engine self-tests passed.';
}
