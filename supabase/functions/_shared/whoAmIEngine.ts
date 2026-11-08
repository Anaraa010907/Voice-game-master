/**
 * "Би хэн бэ" (Who Am I) rules engine.
 *
 * Pure TypeScript with no runtime imports, so the same file runs in the browser (Vite), in Node tests
 * and later in Supabase Edge Functions (Deno). Every function returns a new state; nothing is mutated.
 * Randomness only comes from the `random` argument, so a seeded source makes a game fully reproducible.
 *
 * Anti-cheat: the full state holds every player's identity. The server must never send it as is.
 * Send `whoAmIPublicView(state)` to everyone and `whoAmIPrivateView(state, seat)` to each seat: a
 * player's own identity is left out of their private view until they solve it, give up, or the game ends.
 *
 * Rules and numbers are documented in docs/who-am-i.md.
 */

// ---------------------------------------------------------------------------------------------
// Content pack types (the Mongolian pack lives in src/whoAmIContent.ts)
// ---------------------------------------------------------------------------------------------

export type WhoAmIEntry = {
  /** Unique across the whole pack, e.g. "animal-wolf". */
  id: string;
  /** Mongolian display name. */
  name: string;
  nameEn?: string;
  /** Extra spellings accepted by the typed-guess matcher. */
  aliases?: string[];
};

export type WhoAmICategory = {
  id: string;
  name: string;
  nameEn: string;
  /** True when every entry suits children. */
  kidsSafe: boolean;
  entries: WhoAmIEntry[];
};

export type WhoAmIPack = WhoAmICategory[];

// ---------------------------------------------------------------------------------------------
// Rule constants
// ---------------------------------------------------------------------------------------------

export const MIN_WHOAMI_PLAYERS = 3;
export const MAX_WHOAMI_PLAYERS = 10;

/** Points for a correct guess before deductions. */
export const BASE_POINTS = 100;
/** Deducted for every question used (answered questions and wrong guesses, across all turns). */
export const POINTS_PER_QUESTION = 5;
/** A correct guess never scores less than this before the placing bonus. */
export const MIN_SOLVE_POINTS = 20;
/** Placing bonus for the 1st, 2nd and 3rd player to solve. Later solvers get 0. */
export const PLACE_BONUS = [30, 20, 10] as const;
/**
 * Every vote a player casts earns this many points: answering a question (Тийм / Үгүй / Мэдэхгүй) or
 * judging a guess (Зөв / Буруу). Only the vote standing when the ballot closes counts, so changing a
 * vote never pays twice. A typed guess that matches at once has no ballot and pays no one.
 */
export const POINTS_PER_VOTE = 1;

/** After this many answered questions in one turn the turn passes even on "Тийм". */
export const MAX_QUESTIONS_PER_TURN = 8;

export const WHOAMI_ROUND_CHOICES = [3, 5, 8] as const;
export const DEFAULT_WHOAMI_ROUNDS = 5;

/** Phase timers in seconds. The server restarts the deadline whenever `whoAmIStageKey` changes. */
export const WHOAMI_TIMERS = { reveal: 30, ask: 45, answer: 20, guess: 25 } as const;

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

export type RandomSource = () => number;

export type WhoAmISettings = {
  rounds: number;
  /** Category ids to draw from; empty = every category. */
  categories: string[];
  /** Only draw from kids-safe categories. */
  kidsSafe: boolean;
};

export const DEFAULT_WHOAMI_SETTINGS: WhoAmISettings = { rounds: DEFAULT_WHOAMI_ROUNDS, categories: [], kidsSafe: false };

export type WhoAmIIdentity = {
  entryId: string;
  name: string;
  nameEn?: string;
  aliases: string[];
  categoryId: string;
  categoryName: string;
};

export type WhoAmIPlayerStatus = 'playing' | 'solved' | 'gaveUp' | 'left';

export type WhoAmIPlayer = {
  id: number;
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string | null;
  host?: boolean;
  bot?: boolean;
  status: WhoAmIPlayerStatus;
  connected: boolean;
  /** Has tapped "Бэлэн" on the reveal screen. */
  ready: boolean;
  /** Questions used: answered questions plus wrong guesses. */
  questions: number;
  wrongGuesses: number;
  /** 1-based solve order, null until solved. */
  place: number | null;
  /** Points from solving their own identity (0 until solved). */
  solveScore: number;
  /** Votes this player cast on other players' questions and guesses. */
  votesCast: number;
  /** Total score: solveScore + votesCast × POINTS_PER_VOTE. */
  points: number;
};

export type WhoAmIPhase = 'reveal' | 'ask' | 'answer' | 'guess' | 'results';
export type AnswerVote = 'yes' | 'no' | 'unknown';
export type JudgeVote = 'correct' | 'wrong';

export type WhoAmILastResult =
  | { kind: 'answer'; playerId: number; result: AnswerVote; yes: number; no: number; unknown: number }
  | { kind: 'guess'; playerId: number; correct: boolean; text: string | null; auto: boolean; correctVotes: number; wrongVotes: number }
  | { kind: 'pass'; playerId: number; reason: 'pass' | 'timeout' | 'limit' | 'gaveUp' | 'left' };

export type WhoAmIState = {
  kind: 'whoami';
  phase: WhoAmIPhase;
  /** 0 during reveal, then 1..maxRounds. A round ends each time the turn wraps past the end of `order`. */
  round: number;
  maxRounds: number;
  order: number[];
  /** Index into `order` of the player whose turn it is (meaningless during reveal). */
  turn: number;
  players: WhoAmIPlayer[];
  /** SECRET: never send this map to clients as is. */
  identities: Record<number, WhoAmIIdentity>;
  /** Questions answered in the current turn. */
  turnQuestions: number;
  answerVotes: Record<number, AnswerVote>;
  judgeVotes: Record<number, JudgeVote>;
  /** The guess being judged (phase 'guess'). */
  guess: { text: string | null } | null;
  lastResult: WhoAmILastResult | null;
  finishOrder: number[];
  winners: number[];
  /** Bumped on every change (votes included). The phase timer follows `whoAmIStageKey` instead. */
  step: number;
  log: string[];
};

export type WhoAmIAction =
  | { type: 'ready' }
  | { type: 'asked' }
  | { type: 'answer'; vote: AnswerVote }
  | { type: 'guess'; text?: string | null }
  | { type: 'judge'; verdict: JudgeVote }
  | { type: 'pass' }
  | { type: 'giveUp' }
  | { type: 'hostSkip' };

export type WhoAmIResult = { state: WhoAmIState; error?: string };

export type WhoAmISeat = Pick<WhoAmIPlayer, 'id' | 'name' | 'initials' | 'color' | 'avatarUrl' | 'host' | 'bot'>;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Small deterministic RNG (mulberry32) for tests, replays and bots. The server may pass crypto randomness instead. */
export function createSeededRandom(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: RandomSource): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Lower-case, fold ё/ү/ө to е/у/о (people often type without them), drop punctuation and extra spaces. */
export function normalizeGuess(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е').replace(/ү/g, 'у').replace(/ө/g, 'о').replace(/й/g, 'и')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether a typed guess names this identity (Mongolian name, English name or an alias). */
export function guessMatches(identity: WhoAmIIdentity, text: string): boolean {
  const guess = normalizeGuess(text);
  if (!guess) return false;
  return [identity.name, identity.nameEn ?? '', ...identity.aliases].some((name) => name && normalizeGuess(name) === guess);
}

export function sanitizeWhoAmISettings(input: unknown, pack?: WhoAmIPack): WhoAmISettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof WhoAmISettings, unknown>>;
  const rounds = WHOAMI_ROUND_CHOICES.includes(raw.rounds as never) ? raw.rounds as number : DEFAULT_WHOAMI_ROUNDS;
  const known = pack ? new Set(pack.map((category) => category.id)) : null;
  const categories = Array.isArray(raw.categories)
    ? [...new Set(raw.categories.filter((id): id is string => typeof id === 'string' && (!known || known.has(id))))]
    : [];
  return { rounds, categories, kidsSafe: raw.kidsSafe === true };
}

export function activeWhoAmIPlayerId(state: WhoAmIState): number | null {
  if (state.phase === 'reveal' || state.phase === 'results') return null;
  return state.order[state.turn] ?? null;
}

function playerOf(state: WhoAmIState, id: number) {
  return state.players.find((candidate) => candidate.id === id);
}

function withPlayer(state: WhoAmIState, id: number, change: (value: WhoAmIPlayer) => WhoAmIPlayer): WhoAmIState {
  return { ...state, players: state.players.map((candidate) => candidate.id === id ? change(candidate) : candidate) };
}

function log(state: WhoAmIState, line: string): WhoAmIState {
  return { ...state, log: [...state.log.slice(-29), line] };
}

const bump = (state: WhoAmIState): WhoAmIState => ({ ...state, step: state.step + 1 });

/** Can take a real turn now. */
const canPlay = (value: WhoAmIPlayer) => value.status === 'playing' && value.connected && !value.bot;

/** Players whose buttons count for the current vote: everyone present except the asker and bots. */
export function eligibleVoters(state: WhoAmIState): number[] {
  const active = activeWhoAmIPlayerId(state);
  return state.players.filter((value) => value.id !== active && value.status !== 'left' && value.connected && !value.bot).map((value) => value.id);
}

/** Points for a correct guess: max(MIN, BASE − PER × questions) + placing bonus. */
export function solvePoints(questions: number, place: number): number {
  return Math.max(MIN_SOLVE_POINTS, BASE_POINTS - POINTS_PER_QUESTION * questions) + (PLACE_BONUS[place - 1] ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------

/** The entries a game with these settings draws from. */
export function identityPool(pack: WhoAmIPack, settings: WhoAmISettings): WhoAmIIdentity[] {
  const chosen = pack.filter((category) => (!settings.categories.length || settings.categories.includes(category.id)) && (!settings.kidsSafe || category.kidsSafe));
  return chosen.flatMap((category) => category.entries.map((entry) => ({
    entryId: entry.id,
    name: entry.name,
    ...(entry.nameEn ? { nameEn: entry.nameEn } : {}),
    aliases: entry.aliases ?? [],
    categoryId: category.id,
    categoryName: category.name,
  })));
}

export function createWhoAmIGame(seats: WhoAmISeat[], pack: WhoAmIPack, random: RandomSource, settings: WhoAmISettings = DEFAULT_WHOAMI_SETTINGS): WhoAmIState {
  if (seats.length < MIN_WHOAMI_PLAYERS || seats.length > MAX_WHOAMI_PLAYERS) {
    throw new Error(`Би хэн бэ: ${MIN_WHOAMI_PLAYERS}–${MAX_WHOAMI_PLAYERS} тоглогч хэрэгтэй.`);
  }
  if (new Set(seats.map((seat) => seat.id)).size !== seats.length) throw new Error('Би хэн бэ: тоглогчийн дугаар давхардсан.');
  const pool = identityPool(pack, settings);
  if (pool.length < seats.length) throw new Error('Би хэн бэ: сонгосон ангилалд хангалттай дүр алга.');
  const dealt = shuffle(pool, random);
  const identities: Record<number, WhoAmIIdentity> = {};
  seats.forEach((seat, index) => { identities[seat.id] = dealt[index]; });
  const order = shuffle(seats.map((seat) => seat.id), random);
  return {
    kind: 'whoami',
    phase: 'reveal',
    round: 0,
    maxRounds: settings.rounds,
    order,
    turn: order.length - 1,
    players: seats.map((seat) => ({
      id: seat.id, name: seat.name, initials: seat.initials, color: seat.color,
      ...(seat.avatarUrl !== undefined ? { avatarUrl: seat.avatarUrl } : {}),
      ...(seat.host ? { host: true } : {}),
      ...(seat.bot ? { bot: true } : {}),
      status: 'playing', connected: true, ready: seat.bot === true,
      questions: 0, wrongGuesses: 0, place: null, solveScore: 0, votesCast: 0, points: 0,
    })),
    identities,
    turnQuestions: 0,
    answerVotes: {},
    judgeVotes: {},
    guess: null,
    lastResult: null,
    finishOrder: [],
    winners: [],
    step: 0,
    log: ['Дүрүүд тараагдлаа. Бусдын картыг хараад "Бэлэн" дар.'],
  };
}

// ---------------------------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------------------------

function finish(state: WhoAmIState): WhoAmIState {
  if (state.phase === 'results') return state;
  // Players who left were recorded as leavers (a loss) when they went, so they cannot take the win.
  const present = state.players.filter((value) => value.status !== 'left');
  const best = Math.max(0, ...present.map((value) => value.points));
  const winners = best > 0 ? present.filter((value) => value.points === best).map((value) => value.id) : [];
  const names = winners.map((id) => playerOf(state, id)?.name).join(', ');
  return bump(log({ ...state, phase: 'results', winners, answerVotes: {}, judgeVotes: {}, guess: null }, winners.length ? `Тоглоом дууслаа. Ялагч: ${names}.` : 'Тоглоом дууслаа. Хэн ч таасангүй.'));
}

/** Hands the turn to the next player who is still guessing; ends the game past the last round. */
function advanceTurn(state: WhoAmIState): WhoAmIState {
  const cleared: WhoAmIState = { ...state, phase: 'ask', turnQuestions: 0, answerVotes: {}, judgeVotes: {}, guess: null };
  if (state.players.filter((value) => value.status !== 'left').length < 2) return finish(cleared);
  const count = state.order.length;
  let preferred: { turn: number; round: number } | null = null;
  let fallback: { turn: number; round: number } | null = null;
  for (let offset = 1; offset <= count; offset += 1) {
    const turn = (state.turn + offset) % count;
    const round = state.round + Math.floor((state.turn + offset) / count);
    const candidate = playerOf(state, state.order[turn]);
    if (!candidate || candidate.status !== 'playing') continue;
    fallback ??= { turn, round };
    if (canPlay(candidate)) { preferred = { turn, round }; break; }
  }
  // Nobody connected is still guessing: hand the turn to an absent guesser and let the ask timer pass it on.
  const chosen = preferred ?? fallback;
  if (!chosen || chosen.round > state.maxRounds) return finish(cleared);
  const next = bump({ ...cleared, turn: chosen.turn, round: chosen.round });
  const name = playerOf(next, next.order[next.turn])?.name;
  return log(next, chosen.round !== state.round ? `${chosen.round}-р тойрог. ${name}-ийн ээлж.` : `${name}-ийн ээлж.`);
}

function startPlay(state: WhoAmIState): WhoAmIState {
  return advanceTurn(log(state, 'Бүгд бэлэн. Тоглоом эхэллээ!'));
}

function allReady(state: WhoAmIState) {
  return state.players.every((value) => value.status === 'left' || !value.connected || value.bot || value.ready);
}

function tally<T extends string>(votes: Record<number, T>, voters: number[]) {
  const counts: Partial<Record<T, number>> = {};
  for (const id of voters) {
    const vote = votes[id];
    if (vote) counts[vote] = (counts[vote] ?? 0) + 1;
  }
  return (key: T) => counts[key] ?? 0;
}

/** One point per vote standing when the ballot closes, for every present voter who pressed a button. */
function payVoters(state: WhoAmIState, votes: Record<number, string>): WhoAmIState {
  const paid = new Set(eligibleVoters(state).filter((id) => votes[id] !== undefined));
  if (!paid.size) return state;
  return {
    ...state,
    players: state.players.map((value) => paid.has(value.id)
      ? { ...value, votesCast: value.votesCast + 1, points: value.points + POINTS_PER_VOTE }
      : value),
  };
}

/**
 * Majority of the present voters' buttons: more Тийм than Үгүй → "yes", more Үгүй than Тийм → "no",
 * equal (including nobody voting, or only Мэдэхгүй) → "unknown". Only "no" ends the turn.
 */
function resolveAnswer(state: WhoAmIState): WhoAmIState {
  const active = activeWhoAmIPlayerId(state)!;
  const count = tally(state.answerVotes, eligibleVoters(state));
  const yes = count('yes');
  const no = count('no');
  const result: AnswerVote = yes > no ? 'yes' : no > yes ? 'no' : 'unknown';
  let next = withPlayer(payVoters(state, state.answerVotes), active, (value) => ({ ...value, questions: value.questions + 1 }));
  next = bump({ ...next, turnQuestions: next.turnQuestions + 1, answerVotes: {}, lastResult: { kind: 'answer', playerId: active, result, yes, no, unknown: count('unknown') } });
  const name = playerOf(next, active)?.name;
  next = log(next, `${name}: ${result === 'yes' ? 'Тийм' : result === 'no' ? 'Үгүй' : 'Мэдэхгүй'} (${yes}–${no}).`);
  if (result === 'no') return advanceTurn(next);
  if (next.turnQuestions >= MAX_QUESTIONS_PER_TURN) {
    return advanceTurn(log({ ...next, lastResult: { kind: 'pass', playerId: active, reason: 'limit' } }, `${name} нэг ээлжийн ${MAX_QUESTIONS_PER_TURN} асуултаа дуусгалаа.`));
  }
  return { ...next, phase: 'ask' };
}

function solve(state: WhoAmIState, id: number): WhoAmIState {
  const place = state.finishOrder.length + 1;
  const solver = playerOf(state, id)!;
  const points = solvePoints(solver.questions, place);
  let next = withPlayer(state, id, (value) => ({ ...value, status: 'solved', place, solveScore: points, points: value.points + points }));
  next = log({ ...next, finishOrder: [...next.finishOrder, id] }, `${solver.name} зөв таалаа: ${state.identities[id].name}! +${points} оноо.`);
  if (!next.players.some((value) => value.status === 'playing')) return finish(next);
  return advanceTurn(next);
}

/** Correct when the typed text matched, or more of the present voters said "Зөв" than "Буруу" (a tie is wrong). */
function resolveGuess(state: WhoAmIState, auto: boolean): WhoAmIState {
  const active = activeWhoAmIPlayerId(state)!;
  const count = tally(state.judgeVotes, eligibleVoters(state));
  const correctVotes = count('correct');
  const wrongVotes = count('wrong');
  const correct = auto || correctVotes > wrongVotes;
  const text = state.guess?.text ?? null;
  const next = bump({ ...(auto ? state : payVoters(state, state.judgeVotes)), judgeVotes: {}, guess: null, lastResult: { kind: 'guess', playerId: active, correct, text, auto, correctVotes, wrongVotes } });
  if (correct) return solve(next, active);
  const name = playerOf(next, active)?.name;
  const wrong = withPlayer(next, active, (value) => ({ ...value, questions: value.questions + 1, wrongGuesses: value.wrongGuesses + 1 }));
  return advanceTurn(log(wrong, text ? `${name} "${text}" гэж таалаа — буруу.` : `${name} буруу таалаа.`));
}

/** Closes the vote once every present voter has pressed a button. */
function maybeClose(state: WhoAmIState): WhoAmIState {
  if (state.phase !== 'answer' && state.phase !== 'guess') return state;
  const votes: Record<number, unknown> = state.phase === 'answer' ? state.answerVotes : state.judgeVotes;
  if (!eligibleVoters(state).every((id) => votes[id] !== undefined)) return state;
  return state.phase === 'answer' ? resolveAnswer(state) : resolveGuess(state, false);
}

function passTurn(state: WhoAmIState, reason: 'pass' | 'timeout' | 'gaveUp' | 'left'): WhoAmIState {
  const active = activeWhoAmIPlayerId(state);
  if (active === null) return state;
  const name = playerOf(state, active)?.name;
  const line = reason === 'timeout' ? `${name}-ийн хугацаа дууслаа.` : reason === 'pass' ? `${name} ээлжээ өглөө.` : null;
  const next: WhoAmIState = { ...state, lastResult: { kind: 'pass', playerId: active, reason } };
  return advanceTurn(line ? log(next, line) : next);
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

export function applyWhoAmIAction(state: WhoAmIState, actorId: number, action: WhoAmIAction): WhoAmIResult {
  const fail = (error: string): WhoAmIResult => ({ state, error });
  const actor = playerOf(state, actorId);
  if (!actor || actor.status === 'left') return fail('Та энэ тоглоомд алга.');
  if (state.phase === 'results') return fail('Тоглоом дууссан.');
  const active = activeWhoAmIPlayerId(state);
  const isActive = active === actorId;

  switch (action.type) {
    case 'ready': {
      if (state.phase !== 'reveal') return fail('Одоо бэлэн болох шат биш.');
      if (actor.ready) return { state };
      const next = bump(withPlayer(state, actorId, (value) => ({ ...value, ready: true })));
      return { state: allReady(next) ? startPlay(next) : next };
    }
    case 'asked': {
      if (state.phase !== 'ask') return fail('Одоо асуух шат биш.');
      if (!isActive) return fail('Таны ээлж биш.');
      return { state: maybeClose(bump({ ...state, phase: 'answer', answerVotes: {} })) };
    }
    case 'answer': {
      if (state.phase !== 'answer') return fail('Одоо хариулах шат биш.');
      if (isActive) return fail('Өөрийнхөө асуултад хариулахгүй.');
      if (!['yes', 'no', 'unknown'].includes(action.vote)) return fail('Буруу хариулт.');
      if (!eligibleVoters(state).includes(actorId)) return fail('Та одоо санал өгөх боломжгүй.');
      return { state: maybeClose(bump({ ...state, answerVotes: { ...state.answerVotes, [actorId]: action.vote } })) };
    }
    case 'guess': {
      if (state.phase !== 'ask') return fail('Одоо таах шат биш.');
      if (!isActive) return fail('Таны ээлж биш.');
      const text = typeof action.text === 'string' && action.text.trim() ? action.text.trim().slice(0, 60) : null;
      const guessing = bump({ ...state, phase: 'guess', guess: { text }, judgeVotes: {} });
      if (text && guessMatches(state.identities[actorId], text)) return { state: resolveGuess(guessing, true) };
      return { state: maybeClose(log(guessing, `${actor.name} таалаа${text ? `: "${text}"` : ''}. Зөв үү?`)) };
    }
    case 'judge': {
      if (state.phase !== 'guess') return fail('Одоо шүүх шат биш.');
      if (isActive) return fail('Өөрийнхөө таамгийг шүүхгүй.');
      if (action.verdict !== 'correct' && action.verdict !== 'wrong') return fail('Буруу санал.');
      if (!eligibleVoters(state).includes(actorId)) return fail('Та одоо санал өгөх боломжгүй.');
      return { state: maybeClose(bump({ ...state, judgeVotes: { ...state.judgeVotes, [actorId]: action.verdict } })) };
    }
    case 'pass': {
      if (state.phase !== 'ask') return fail('Одоо ээлж өгөх боломжгүй.');
      if (!isActive) return fail('Таны ээлж биш.');
      return { state: passTurn(state, 'pass') };
    }
    case 'giveUp': {
      if (state.phase === 'reveal') return fail('Тоглоом эхлээгүй байна.');
      if (actor.status !== 'playing') return fail('Та аль хэдийн дууссан.');
      let next = bump(withPlayer(state, actorId, (value) => ({ ...value, status: 'gaveUp' })));
      next = log(next, `${actor.name} бууж өглөө. Дүр нь: ${state.identities[actorId].name}.`);
      if (!next.players.some((value) => value.status === 'playing')) return { state: finish(next) };
      return { state: isActive ? passTurn(next, 'gaveUp') : maybeClose(next) };
    }
    case 'hostSkip': {
      if (!actor.host) return fail('Зөвхөн өрөөний эзэн алгасна.');
      return { state: timeoutWhoAmI(state) };
    }
    default:
      return fail('Үл мэдэгдэх үйлдэл.');
  }
}

/** What happens when the phase timer runs out (also the host's "Алгасах" button). */
export function timeoutWhoAmI(state: WhoAmIState): WhoAmIState {
  switch (state.phase) {
    case 'reveal': return startPlay(state);
    case 'ask': return passTurn(state, 'timeout');
    case 'answer': return resolveAnswer(state);
    case 'guess': return resolveGuess(state, false);
    default: return state;
  }
}

/** Seconds the current phase may last; null when no timer runs. */
export function whoAmIDeadlineSeconds(state: WhoAmIState): number | null {
  return state.phase === 'results' ? null : WHOAMI_TIMERS[state.phase];
}

/**
 * Identifies the timed stage the game is in. It changes when a new phase, turn or question opens, but
 * not when someone votes or taps "Бэлэн", so the server restarts the phase timer only when it changes.
 */
export function whoAmIStageKey(state: WhoAmIState): string {
  const wrong = state.players.reduce((total, value) => total + value.wrongGuesses, 0);
  return [state.phase, state.round, state.turn, state.turnQuestions, state.finishOrder.length, wrong].join(':');
}

/** Presence change from the voice room / realtime channel. Absent players do not block votes or the reveal. */
export function setWhoAmIConnected(state: WhoAmIState, id: number, connected: boolean): WhoAmIState {
  const target = playerOf(state, id);
  if (!target || target.connected === connected || target.status === 'left' || state.phase === 'results') return state;
  let next = bump(withPlayer(state, id, (value) => ({ ...value, connected })));
  if (!connected) {
    const { [id]: _answer, ...answerVotes } = next.answerVotes;
    const { [id]: _judge, ...judgeVotes } = next.judgeVotes;
    next = { ...next, answerVotes, judgeVotes };
  }
  if (next.phase === 'reveal') return allReady(next) ? startPlay(next) : next;
  return maybeClose(next);
}

/** How often a player's app reports that it is still at the table, and when a silent seat counts as away. */
export const WHOAMI_HEARTBEAT_MS = 8_000;
export const WHOAMI_PRESENCE_STALE_MS = 25_000;

/**
 * Who is at the table, from each seat's last heartbeat (epoch ms): fresh = connected, older than
 * `staleMs` = away. Seats with no heartbeat on record (bots, players who left, older apps) are not
 * listed, so their flag is left as it is.
 */
export function whoAmIPresence(state: WhoAmIState, lastSeen: Record<number, number | null | undefined>, now: number, staleMs = WHOAMI_PRESENCE_STALE_MS): Record<number, boolean> {
  const presence: Record<number, boolean> = {};
  for (const player of state.players) {
    const seen = lastSeen[player.id];
    if (player.bot || player.status === 'left' || typeof seen !== 'number' || !Number.isFinite(seen)) continue;
    presence[player.id] = now - seen <= staleMs;
  }
  return presence;
}

/**
 * Applies a presence snapshot. Returning players are marked first, so one who comes back mid-vote gets
 * to vote; then the absent ones are dropped, which may close a vote nobody present is still holding up.
 * Returns the same state object when nothing changes (idempotent).
 */
export function applyWhoAmIPresence(state: WhoAmIState, presence: Record<number, boolean>): WhoAmIState {
  let next = state;
  for (const connected of [true, false]) {
    for (const player of state.players) {
      if (presence[player.id] === connected) next = setWhoAmIConnected(next, player.id, connected);
    }
  }
  return next;
}

/** A player who leaves the room for good. Their identity stays secret from the public view. */
export function removeWhoAmIPlayer(state: WhoAmIState, id: number): WhoAmIState {
  const leaver = playerOf(state, id);
  if (!leaver || leaver.status === 'left' || state.phase === 'results') return state;
  const wasActive = activeWhoAmIPlayerId(state) === id;
  const { [id]: _answer, ...answerVotes } = state.answerVotes;
  const { [id]: _judge, ...judgeVotes } = state.judgeVotes;
  let next = bump(withPlayer({ ...state, answerVotes, judgeVotes }, id, (value) => ({ ...value, status: 'left', connected: false })));
  next = log(next, `${leaver.name} тоглоомоос гарлаа.`);
  if (next.players.filter((value) => value.status !== 'left').length < 2 || !next.players.some((value) => value.status === 'playing')) return finish(next);
  if (next.phase === 'reveal') return allReady(next) ? startPlay(next) : next;
  if (wasActive) return passTurn(next, 'left');
  return maybeClose(next);
}

/** Bots cannot hear voice questions: they never vote and pass their own turn at once. */
export function whoAmIBotStep(state: WhoAmIState): WhoAmIState {
  const active = activeWhoAmIPlayerId(state);
  if (state.phase === 'ask' && active !== null && playerOf(state, active)?.bot) return passTurn(state, 'pass');
  return state;
}

export function whoAmIBotToMove(state: WhoAmIState): boolean {
  const active = activeWhoAmIPlayerId(state);
  return state.phase === 'ask' && active !== null && playerOf(state, active)?.bot === true;
}

/** Final ranking: points, then earlier solve, then fewer questions. */
export function whoAmIRanking(state: WhoAmIState): WhoAmIPlayer[] {
  return [...state.players].sort((a, b) => b.points - a.points || (a.place ?? 99) - (b.place ?? 99) || a.questions - b.questions || a.id - b.id);
}

// ---------------------------------------------------------------------------------------------
// Views (what the server sends)
// ---------------------------------------------------------------------------------------------

const identityIsPublic = (state: WhoAmIState, value: WhoAmIPlayer) => state.phase === 'results' || value.status === 'solved' || value.status === 'gaveUp';

export type WhoAmIPublicPlayer = WhoAmIPlayer & { identity: WhoAmIIdentity | null; categoryId: string; categoryName: string };

export type WhoAmIPublicView = Omit<WhoAmIState, 'identities' | 'players' | 'answerVotes' | 'judgeVotes'> & {
  activeId: number | null;
  players: WhoAmIPublicPlayer[];
  /** Who has pressed a button in the open vote; the choices stay hidden until it closes. */
  votedIds: number[];
  voterIds: number[];
  maxQuestionsPerTurn: number;
};

/** Safe for everyone: identities only for solved / given-up players, or all of them once the game is over. Category names are public. */
export function whoAmIPublicView(state: WhoAmIState): WhoAmIPublicView {
  const { identities, players, answerVotes, judgeVotes, ...rest } = state;
  const votes = state.phase === 'answer' ? answerVotes : state.phase === 'guess' ? judgeVotes : {};
  return {
    ...rest,
    activeId: activeWhoAmIPlayerId(state),
    players: players.map((value) => ({ ...value, identity: identityIsPublic(state, value) ? identities[value.id] : null, categoryId: identities[value.id]?.categoryId ?? '', categoryName: identities[value.id]?.categoryName ?? '' })),
    votedIds: Object.keys(votes).map(Number),
    voterIds: state.phase === 'answer' || state.phase === 'guess' ? eligibleVoters(state) : [],
    maxQuestionsPerTurn: MAX_QUESTIONS_PER_TURN,
  };
}

export type WhoAmIPrivateView = {
  viewerId: number;
  /** Every other player's identity; the viewer's own is null until it is public. */
  identities: Record<number, WhoAmIIdentity | null>;
  myVote: AnswerVote | JudgeVote | null;
};

/** One seat's secrets. Never contains the viewer's own identity while they are still guessing. */
export function whoAmIPrivateView(state: WhoAmIState, viewerId: number): WhoAmIPrivateView {
  const identities: Record<number, WhoAmIIdentity | null> = {};
  for (const value of state.players) {
    identities[value.id] = value.id !== viewerId || identityIsPublic(state, value) ? state.identities[value.id] : null;
  }
  const myVote = state.phase === 'answer' ? state.answerVotes[viewerId] ?? null : state.phase === 'guess' ? state.judgeVotes[viewerId] ?? null : null;
  return { viewerId, identities, myVote };
}
