import assert from 'node:assert/strict';
import { mafiaBotsAct, nextBotName } from '../supabase/functions/_shared/bots.ts';
import {
  allNightActionsSubmitted, allVerdictsSubmitted, allVotesSubmitted, createInitialGame, finishDay, openDiscussion, recordVote, removePlayer,
  publicView, resolveNight, resolveTrial, resolveVoting, sanitizeMafiaSettings, startNight, startVoting, type GameEngineState,
} from '../supabase/functions/_shared/gameEngine.ts';

// A small seeded random source so every run plays the same games.
function seeded(seed: number) {
  let value = seed;
  return () => { value = (value * 1664525 + 1013904223) % 4294967296; return value / 4294967296; };
}

// Same phase flow as the game server.
function advance(state: GameEngineState, random: () => number): GameEngineState {
  switch (state.phase) {
    case 'Role Reveal': return startNight(state);
    case 'Night': return resolveNight(state, random).state;
    case 'Morning': return openDiscussion(state);
    case 'Discussion': return startVoting(state);
    case 'Voting': return state.votesRevealed ? finishDay(state) : state.trial ? resolveTrial(state).state : resolveVoting(state).state;
    default: return state;
  }
}

// Names
assert.equal(nextBotName([]), 'Болд (бот)');
assert.equal(nextBotName(['Болд (бот)']), 'Сарнай (бот)');

// Mafia: six bots finish a whole game on their own, and every night/vote is locked in by them.
for (const seed of [1, 7, 42, 99, 1234]) {
  const random = seeded(seed);
  const people = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Bot ${index + 1}`, initials: `B${index + 1}`, color: 'rose', bot: true }));
  let state = createInitialGame(people, undefined, random);
  let steps = 0;
  while (state.phase !== 'Results' && steps < 80) {
    state = mafiaBotsAct(advance(state, random), random);
    if (state.phase === 'Night' && !state.nightResolved) assert.ok(allNightActionsSubmitted(state), 'Bots lock every night action.');
    if (state.phase === 'Voting' && !state.votesRevealed) assert.ok(state.trial ? allVerdictsSubmitted(state) : allVotesSubmitted(state), 'Bots cast every vote and verdict.');
    steps += 1;
  }
  assert.equal(state.phase, 'Results', `Bot-only Mafia game ${seed} reaches Results.`);
  assert.ok(state.winner, 'A team wins.');
  const recap = publicView(state).history ?? [];
  assert.ok(recap.some((entry) => entry.kind === 'night') && recap.every((entry) => entry.round >= 1), 'The finished game carries a night-by-night recap.');
  assert.equal(publicView({ ...state, phase: 'Night' }).history, null, 'The recap stays hidden until the game ends.');
}

// Mafia: big tables with the Don, Jester and Bodyguard (Classic) and a Custom table also finish.
for (const [seed, count, settings] of [[21, 12, undefined], [8, 10, undefined], [33, 9, sanitizeMafiaSettings({ mode: 'custom' })], [4, 12, sanitizeMafiaSettings({ mode: 'hard' })]] as const) {
  const random = seeded(seed);
  const people = Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Bot ${index + 1}`, initials: `B${index + 1}`, color: 'rose', bot: true }));
  let state = createInitialGame(people, undefined, random, settings);
  let steps = 0;
  while (state.phase !== 'Results' && steps < 120) {
    state = mafiaBotsAct(advance(state, random), random);
    steps += 1;
  }
  assert.equal(state.phase, 'Results', `Bot-only Mafia game with ${count} seats (seed ${seed}) reaches Results.`);
  assert.ok(state.winner === 'Citizens' || state.winner === 'Mafia' || state.winner === 'Jester', 'Someone wins.');
}

// Mafia: humans are never moved for.
{
  const random = seeded(3);
  const people = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `P${index + 1}`, initials: `P${index + 1}`, color: 'rose', bot: index >= 2 }));
  let state = startVoting(openDiscussion(resolveNight(mafiaBotsAct(startNight(createInitialGame(people, undefined, random)), random), random).state));
  state = mafiaBotsAct(state, random);
  for (const player of state.publicPlayers) {
    if (!player.alive) continue;
    assert.equal(state.privatePlayers[player.id].vote.submitted, player.bot === true, 'Only bots vote automatically.');
  }
}

// A player who leaves while everyone else has voted no longer holds the ballot open.
{
  const people = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `P${index + 1}`, initials: `P${index + 1}`, color: 'rose' }));
  let state = startVoting(openDiscussion(createInitialGame(people, { 1: 'Mafia', 2: 'Doctor', 3: 'Detective', 4: 'Citizen', 5: 'Citizen', 6: 'Citizen' }, seeded(4))));
  for (const voter of [1, 2, 3, 4, 5]) state = recordVote(state, voter, 'skip').state;
  assert.equal(allVotesSubmitted(state), false, 'Player 6 has not voted yet.');
  assert.equal(allVotesSubmitted(removePlayer(state, 6)), true, 'Once player 6 leaves, the ballot is complete.');
}

console.log('bot checks passed');
