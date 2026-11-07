import {
  BASE_POINTS, MAX_QUESTIONS_PER_TURN, MIN_SOLVE_POINTS, PLACE_BONUS, POINTS_PER_QUESTION,
  activeWhoAmIPlayerId, applyWhoAmIAction, createSeededRandom, createWhoAmIGame, eligibleVoters, guessMatches,
  identityPool, normalizeGuess, removeWhoAmIPlayer, sanitizeWhoAmISettings, setWhoAmIConnected, solvePoints,
  timeoutWhoAmI, whoAmIBotStep, whoAmIBotToMove, whoAmIDeadlineSeconds, whoAmIPrivateView, whoAmIPublicView, whoAmIRanking,
} from './whoAmIEngine.ts';
import type { WhoAmIAction, WhoAmISeat, WhoAmIState } from './whoAmIEngine.ts';
import { WHO_AM_I_PACK } from './whoAmIContent.ts';

let passed = 0;
const require = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`Who Am I self-test failed: ${message}`);
  passed += 1;
};
const seats = (count: number, extra: Partial<WhoAmISeat> = {}): WhoAmISeat[] =>
  ['Бат', 'Сараа', 'Тэмүүлэн', 'Номин', 'Ганаа', 'Хулан', 'Мөнх', 'Ариун', 'Энх', 'Оюун'].slice(0, count)
    .map((name, index) => ({ id: index + 1, name, initials: name.slice(0, 2).toUpperCase(), color: 'teal', host: index === 0, ...extra }));
const act = (state: WhoAmIState, id: number, action: WhoAmIAction) => {
  const result = applyWhoAmIAction(state, id, action);
  if (result.error) throw new Error(`Who Am I self-test failed: unexpected error "${result.error}" for ${action.type} by ${id}`);
  return result.state;
};
const rejects = (state: WhoAmIState, id: number, action: WhoAmIAction) => Boolean(applyWhoAmIAction(state, id, action).error);
const everyoneReady = (state: WhoAmIState) => state.players.reduce((value, entry) => entry.ready ? value : act(value, entry.id, { type: 'ready' }), state);
const active = (state: WhoAmIState) => activeWhoAmIPlayerId(state)!;
/** Everyone except the active player answers with the given votes, in seat order. */
const answer = (state: WhoAmIState, votes: Array<'yes' | 'no' | 'unknown'>) => {
  let next = act(state, active(state), { type: 'asked' });
  eligibleVoters(next).forEach((id, index) => { if (next.phase === 'answer' && votes[index]) next = act(next, id, { type: 'answer', vote: votes[index] }); });
  return next;
};
const judge = (state: WhoAmIState, verdicts: Array<'correct' | 'wrong'>, text?: string) => {
  let next = act(state, active(state), { type: 'guess', text });
  eligibleVoters(next).forEach((id, index) => { if (next.phase === 'guess' && verdicts[index]) next = act(next, id, { type: 'judge', verdict: verdicts[index] }); });
  return next;
};
const fresh = (count = 4, seed = 7) => everyoneReady(createWhoAmIGame(seats(count), WHO_AM_I_PACK, createSeededRandom(seed)));

// --- Content pack ------------------------------------------------------------------------------
const ids = WHO_AM_I_PACK.flatMap((category) => category.entries.map((entry) => entry.id));
require(new Set(ids).size === ids.length, 'Entry ids are unique across the pack.');
require(new Set(WHO_AM_I_PACK.map((category) => category.id)).size === WHO_AM_I_PACK.length, 'Category ids are unique.');
for (const category of WHO_AM_I_PACK) {
  require(category.entries.length >= 25, `${category.id} has at least 25 entries (${category.entries.length}).`);
  require(category.entries.every((entry) => entry.name.trim() && entry.id.startsWith(category.id === 'profession' ? 'job-' : `${category.id}-`)), `${category.id} entries have names and prefixed ids.`);
  const names = category.entries.map((entry) => normalizeGuess(entry.name));
  require(new Set(names).size === names.length, `${category.id} has no duplicate names.`);
}
const allNames = WHO_AM_I_PACK.flatMap((category) => category.entries.map((entry) => normalizeGuess(entry.name)));
require(new Set(allNames).size === allNames.length, 'No name appears twice in the pack.');

// --- Helpers -------------------------------------------------------------------------------------
require(normalizeGuess('  Хөвсгөл   НУУР! ') === 'ховсгол нуур', 'Guesses are normalised (case, ө, punctuation, spaces).');
require(solvePoints(0, 1) === BASE_POINTS + PLACE_BONUS[0], 'Instant first solve scores base + 1st bonus.');
require(solvePoints(4, 2) === BASE_POINTS - 4 * POINTS_PER_QUESTION + PLACE_BONUS[1], '4 questions, 2nd place.');
require(solvePoints(40, 5) === MIN_SOLVE_POINTS, 'Points never drop below the minimum.');
require(sanitizeWhoAmISettings({ rounds: 99, categories: ['animal', 'nope', 3], kidsSafe: 'yes' }, WHO_AM_I_PACK).rounds === 5, 'Unknown round counts fall back to the default.');
require(sanitizeWhoAmISettings({ rounds: 8, categories: ['animal', 'nope', 'animal'] }, WHO_AM_I_PACK).categories.join() === 'animal', 'Unknown and duplicate categories are dropped.');
require(identityPool(WHO_AM_I_PACK, { rounds: 5, categories: ['food'], kidsSafe: false }).every((entry) => entry.categoryId === 'food'), 'Category filter works.');

// --- Setup, determinism and secrecy ------------------------------------------------------------
let threw = false;
try { createWhoAmIGame(seats(2), WHO_AM_I_PACK, createSeededRandom(1)); } catch { threw = true; }
require(threw, 'Fewer than 3 players cannot start.');
const a = createWhoAmIGame(seats(6), WHO_AM_I_PACK, createSeededRandom(42));
const b = createWhoAmIGame(seats(6), WHO_AM_I_PACK, createSeededRandom(42));
const c = createWhoAmIGame(seats(6), WHO_AM_I_PACK, createSeededRandom(43));
require(JSON.stringify(a) === JSON.stringify(b), 'The same seed deals the same game.');
require(JSON.stringify(a.identities) !== JSON.stringify(c.identities), 'A different seed deals a different game.');
require(new Set(Object.values(a.identities).map((entry) => entry.entryId)).size === 6, 'Every player gets a different identity.');
require(a.phase === 'reveal' && activeWhoAmIPlayerId(a) === null && whoAmIDeadlineSeconds(a) === 30, 'Game opens on the reveal screen with a 30 s timer.');
for (const viewer of a.players) {
  const view = whoAmIPrivateView(a, viewer.id);
  require(view.identities[viewer.id] === null, `Seat ${viewer.id} cannot see their own identity.`);
  require(!JSON.stringify(view).includes(a.identities[viewer.id].entryId), `Seat ${viewer.id}'s private view never contains their entry id.`);
  require(a.players.every((other) => other.id === viewer.id || view.identities[other.id]?.entryId === a.identities[other.id].entryId), `Seat ${viewer.id} sees everyone else.`);
}
const publicA = JSON.stringify(whoAmIPublicView(a));
require(Object.values(a.identities).every((entry) => !publicA.includes(entry.entryId)), 'The public view leaks no identity.');

// --- Reveal → play -------------------------------------------------------------------------------
let state = createWhoAmIGame(seats(4), WHO_AM_I_PACK, createSeededRandom(7));
state = act(state, 1, { type: 'ready' });
require(state.phase === 'reveal', 'One ready player does not start the game.');
require(timeoutWhoAmI(state).phase === 'ask', 'The reveal timer starts the game anyway.');
state = everyoneReady(state);
require(state.phase === 'ask' && state.round === 1 && active(state) === state.order[0], 'All ready → round 1, first player in order asks.');
const first = active(state);
const other = state.order[1];
require(rejects(state, other, { type: 'asked' }), 'Only the active player may ask.');
require(rejects(state, first, { type: 'answer', vote: 'yes' }), 'Answering outside the answer phase is refused.');

// --- Answers -------------------------------------------------------------------------------------
state = answer(state, ['yes', 'yes', 'no']);
require(state.phase === 'ask' && active(state) === first && state.turnQuestions === 1, 'Majority Тийм keeps the turn.');
require(state.lastResult?.kind === 'answer' && state.lastResult.result === 'yes' && state.lastResult.yes === 2, 'The tally is recorded.');
let check = act(state, first, { type: 'asked' });
require(rejects(check, first, { type: 'answer', vote: 'yes' }), 'The asker cannot answer their own question.');
state = answer(state, ['yes', 'no', 'unknown']);
require(state.phase === 'ask' && active(state) === first && state.lastResult?.kind === 'answer' && state.lastResult.result === 'unknown', 'A tie counts as Мэдэхгүй and keeps the turn.');
state = answer(state, ['unknown', 'unknown', 'unknown']);
require(active(state) === first && state.players.find((p) => p.id === first)!.questions === 3, 'All Мэдэхгүй keeps the turn; every answer uses a question.');
state = answer(state, ['no', 'no', 'yes']);
require(active(state) === other && state.turnQuestions === 0, 'Majority Үгүй passes the turn.');

// Disconnected voters do not block a vote.
check = act(state, other, { type: 'asked' });
const [v1, v2, v3] = eligibleVoters(check);
check = act(act(check, v1, { type: 'answer', vote: 'no' }), v2, { type: 'answer', vote: 'no' });
require(check.phase === 'answer', 'The vote waits for the last voter.');
check = setWhoAmIConnected(check, v3, false);
require(active(check) !== other, 'When the last voter drops, the vote closes (2 Үгүй → turn passes).');
check = act(state, other, { type: 'asked' });
require(timeoutWhoAmI(check).lastResult?.kind === 'answer', 'The answer timer closes the vote with the votes so far.');

// --- Guesses -------------------------------------------------------------------------------------
const secretOther = state.identities[other];
const typed = judge(state, [], secretOther.name.toUpperCase().replace(/ө/gi, 'о'));
require(typed.players.find((p) => p.id === other)!.status === 'solved', 'A typed guess matching the name (case/ө-folded) solves at once.');
require(guessMatches(secretOther, secretOther.nameEn ?? secretOther.name), 'The English name is accepted too.');
const otherQuestions = state.players.find((p) => p.id === other)!.questions;
require(typed.players.find((p) => p.id === other)!.points === solvePoints(otherQuestions, 1), 'Solver scores by the formula with the 1st-place bonus.');
require(typed.finishOrder[0] === other && active(typed) !== other, 'The solver is recorded and the turn moves on.');
require(whoAmIPublicView(typed).players.find((p) => p.id === other)!.identity?.entryId === secretOther.entryId, 'A solved identity becomes public.');
require(whoAmIPrivateView(typed, other).identities[other]?.entryId === secretOther.entryId, 'The solver now sees their own identity.');

let wrong = judge(state, ['wrong', 'correct']);
require(wrong.phase === 'guess', 'The judging vote waits for the third voter.');
wrong = timeoutWhoAmI(wrong);
require(wrong.lastResult?.kind === 'guess' && !wrong.lastResult.correct, 'A judging tie counts as wrong.');
require(active(wrong) !== other && wrong.players.find((p) => p.id === other)!.questions === otherQuestions + 1, 'A wrong guess uses a question and passes the turn.');
const voiced = judge(state, ['correct', 'correct', 'wrong']);
require(voiced.players.find((p) => p.id === other)!.status === 'solved', 'A spoken guess confirmed by the majority solves.');
require(rejects(act(state, other, { type: 'guess' }), other, { type: 'judge', verdict: 'correct' }), 'The guesser cannot judge their own guess.');

// --- Turn limit, pass, timeout -------------------------------------------------------------------
let limit = fresh(3, 11);
const limited = active(limit);
for (let index = 0; index < MAX_QUESTIONS_PER_TURN; index += 1) limit = answer(limit, ['yes', 'yes']);
require(active(limit) !== limited && limit.lastResult?.kind === 'pass' && limit.lastResult.reason === 'limit', `The turn passes after ${MAX_QUESTIONS_PER_TURN} questions.`);
const passing = fresh(3, 12);
require(active(act(passing, active(passing), { type: 'pass' })) !== active(passing), 'A player may pass their turn.');
require(active(timeoutWhoAmI(passing)) !== active(passing), 'The ask timer passes the turn.');
require(rejects(passing, passing.order[1], { type: 'hostSkip' }) || passing.order[1] === 1, 'Only the host may skip.');
require(active(act(passing, 1, { type: 'hostSkip' })) !== active(passing), 'The host can skip a stuck turn.');

// --- Rounds and the end --------------------------------------------------------------------------
let rounds = everyoneReady(createWhoAmIGame(seats(3), WHO_AM_I_PACK, createSeededRandom(3), { rounds: 3, categories: [], kidsSafe: false }));
for (let index = 0; index < 9; index += 1) rounds = timeoutWhoAmI(rounds);
require(rounds.phase === 'results' && rounds.round === 3, 'After 3 rounds of 3 turns the game ends.');
require(rounds.winners.length === 0 && rounds.players.every((p) => p.points === 0), 'Nobody solved → no winner, everyone 0.');
require(Object.values(rounds.identities).every((entry) => JSON.stringify(whoAmIPublicView(rounds)).includes(entry.entryId)), 'Results reveal every identity.');
require(whoAmIDeadlineSeconds(rounds) === null && rejects(rounds, 1, { type: 'pass' }), 'No timer and no actions after the end.');

let race = fresh(3, 21);
const order = [...race.order];
race = judge(race, ['correct', 'correct']); // first player, 0 questions
race = answer(race, ['yes', 'yes']);
race = judge(race, ['correct', 'correct']); // second player, 1 question
require(race.phase === 'ask' && active(race) === order[2], 'The last guesser keeps playing alone.');
race = answer(race, ['no', 'no']);
require(active(race) === order[2] && race.round === 2, 'With one guesser left, every turn is theirs (rounds still count).');
race = judge(race, ['correct', 'correct']); // third player, 1 question
require(race.phase === 'results', 'Everyone solved → results.');
const points = order.map((id) => race.players.find((p) => p.id === id)!.points);
require(points.join() === [solvePoints(0, 1), solvePoints(1, 2), solvePoints(1, 3)].join(), `Points by order: ${points.join(', ')}.`);
require(race.winners.join() === String(order[0]) && whoAmIRanking(race)[0].id === order[0], 'The fastest solver wins and tops the ranking.');

// --- Give up, leave, disconnect, bots ------------------------------------------------------------
let quit = fresh(4, 5);
const quitter = active(quit);
quit = act(quit, quitter, { type: 'giveUp' });
require(quit.players.find((p) => p.id === quitter)!.status === 'gaveUp' && active(quit) !== quitter, 'Giving up reveals and passes the turn.');
require(eligibleVoters(quit).includes(quitter) || active(quit) === quitter, 'A player who gave up still answers.');
require(whoAmIPrivateView(quit, quitter).identities[quitter] !== null, 'A player who gave up sees their identity.');

let leave = fresh(4, 6);
const leaver = active(leave);
leave = removeWhoAmIPlayer(leave, leaver);
require(active(leave) !== leaver && leave.phase === 'ask', 'When the active player leaves, the turn passes.');
require(whoAmIPublicView(leave).players.find((p) => p.id === leaver)!.identity === null, 'A leaver\'s identity stays hidden publicly.');
leave = removeWhoAmIPlayer(removeWhoAmIPlayer(leave, leave.order.find((id) => id !== leaver)!), leave.order.filter((id) => id !== leaver)[1]);
require(leave.phase === 'results', 'Fewer than 2 players left ends the game.');

let away = fresh(4, 8);
const absent = away.order[1];
away = setWhoAmIConnected(away, absent, false);
away = act(away, active(away), { type: 'pass' });
require(active(away) === away.order[2], 'A disconnected player\'s turn is skipped.');
require(!eligibleVoters(away).includes(absent), 'A disconnected player does not vote.');
away = setWhoAmIConnected(away, absent, true);
require(eligibleVoters(away).includes(absent), 'Reconnecting restores voting.');

let bots = createWhoAmIGame([...seats(3), { id: 9, name: 'Болд (бот)', initials: 'БО', color: 'gold', bot: true }], WHO_AM_I_PACK, createSeededRandom(2));
require(bots.players.find((p) => p.id === 9)!.ready, 'Bots are ready at once.');
bots = everyoneReady(bots);
require(!eligibleVoters(bots).includes(9), 'Bots never vote.');
let botTurns = 0;
for (let index = 0; index < 6; index += 1) { if (whoAmIBotToMove(bots)) botTurns += 1; bots = timeoutWhoAmI(bots); }
require(botTurns === 0, 'Bots are skipped while humans can play.');
for (const human of [1, 2, 3]) if (bots.phase !== 'results') bots = act(bots, human, { type: 'giveUp' });
require(bots.phase === 'ask' && whoAmIBotToMove(bots), 'With only a bot still guessing, the bot gets the turn.');
let botGuard = 0;
while (bots.phase !== 'results' && botGuard < 50) { bots = whoAmIBotStep(bots); botGuard += 1; }
require(bots.phase === 'results', 'A bot passes every turn until the round limit ends the game.');

// --- Random play: invariants over many seeds -----------------------------------------------------
for (let seed = 1; seed <= 200; seed += 1) {
  const random = createSeededRandom(seed * 7919);
  let game = createWhoAmIGame(seats(3 + (seed % 8)), WHO_AM_I_PACK, random, { rounds: 3, categories: [], kidsSafe: seed % 2 === 0 });
  let steps = 0;
  while (game.phase !== 'results' && steps < 2000) {
    steps += 1;
    const roll = random();
    const ids = game.players.filter((p) => p.status !== 'left').map((p) => p.id);
    const someone = ids[Math.floor(random() * ids.length)];
    if (roll < 0.03) game = setWhoAmIConnected(game, someone, random() < 0.5);
    else if (roll < 0.04) game = removeWhoAmIPlayer(game, someone);
    else if (roll < 0.1) game = timeoutWhoAmI(game);
    else {
      const turn = activeWhoAmIPlayerId(game);
      const action: WhoAmIAction = game.phase === 'reveal' ? { type: 'ready' }
        : game.phase === 'ask' ? (random() < 0.25 ? { type: 'guess', text: random() < 0.3 ? game.identities[turn!].name : null } : random() < 0.05 ? { type: 'giveUp' } : { type: 'asked' })
          : game.phase === 'answer' ? { type: 'answer', vote: (['yes', 'no', 'unknown'] as const)[Math.floor(random() * 3)] }
            : { type: 'judge', verdict: random() < 0.5 ? 'correct' : 'wrong' };
      const actor = game.phase === 'ask' ? turn! : someone;
      game = whoAmIBotStep(applyWhoAmIAction(game, actor, action).state);
    }
    for (const viewer of game.players) {
      const own = whoAmIPrivateView(game, viewer.id).identities[viewer.id];
      if (game.phase !== 'results' && viewer.status === 'playing' && own !== null) throw new Error(`Seed ${seed}: seat ${viewer.id} saw their own identity.`);
    }
    if (game.round > game.maxRounds) throw new Error(`Seed ${seed}: round ${game.round} past the limit.`);
  }
  if (game.phase !== 'results') throw new Error(`Seed ${seed}: game did not end in ${steps} steps.`);
  const solved = game.players.filter((p) => p.place !== null);
  if (solved.some((p) => p.points !== solvePoints(p.questions, p.place!))) throw new Error(`Seed ${seed}: points do not match the formula.`);
  if (game.players.some((p) => p.place === null && p.points !== 0)) throw new Error(`Seed ${seed}: a non-solver scored.`);
}
passed += 1;

const counts = WHO_AM_I_PACK.map((category) => `${category.id} ${category.entries.length}`).join(', ');
console.log(`Who Am I engine: ${passed} checks passed. Pack: ${counts}.`);
