import assert from 'node:assert/strict';
import { boardBotToMove, mafiaBotsAct, monopolyBotStep, nextBotName } from '../supabase/functions/_shared/bots.ts';
import {
  allNightActionsSubmitted, allVotesSubmitted, createInitialGame, finishDay, openDiscussion, recordVote, removePlayer,
  resolveNight, resolveVoting, startNight, startVoting, type GameEngineState,
} from '../supabase/functions/_shared/gameEngine.ts';
import { autoPlay, createMonopolyGame, currentPlayerId } from '../supabase/functions/_shared/monopolyEngine.ts';

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
    case 'Voting': return state.votesRevealed ? finishDay(state) : resolveVoting(state).state;
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
    if (state.phase === 'Voting' && !state.votesRevealed) assert.ok(allVotesSubmitted(state), 'Bots cast every vote.');
    steps += 1;
  }
  assert.equal(state.phase, 'Results', `Bot-only Mafia game ${seed} reaches Results.`);
  assert.ok(state.winner, 'A team wins.');
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

// Board game: three bots play to the end; they buy property along the way.
for (const seed of [5, 11, 2024]) {
  const random = seeded(seed);
  let state = createMonopolyGame([
    { id: 1, name: 'Болд (бот)', initials: 'БО', color: 'rose', bot: true },
    { id: 2, name: 'Сарнай (бот)', initials: 'СА', color: 'teal', bot: true },
    { id: 3, name: 'Номин (бот)', initials: 'НО', color: 'gold', bot: true },
  ], random);
  let steps = 0;
  let bought = 0;
  while (state.phase !== 'finished' && steps < 5000) {
    assert.ok(boardBotToMove(state), 'A bot is always to move.');
    const next = monopolyBotStep(state, random);
    assert.notEqual(next, state, 'Every bot step changes the game.');
    bought = Math.max(bought, next.tiles.filter((tile) => tile.owner !== null).length);
    state = next;
    steps += 1;
  }
  assert.equal(state.phase, 'finished', `Bot-only board game ${seed} finishes.`);
  assert.ok(bought > 3, 'Bots buy property.');
  assert.ok(state.players.every((player) => player.money >= 0), 'No negative money.');
}

// Regression: a game frozen on a bankrupt player's turn moves on at the next tick.
{
  const base = createMonopolyGame([
    { id: 1, name: 'А', initials: 'А', color: 'rose' },
    { id: 2, name: 'Б', initials: 'Б', color: 'teal' },
    { id: 3, name: 'В', initials: 'В', color: 'gold' },
  ], seeded(8));
  const stuckId = currentPlayerId(base);
  const frozen = { ...base, phase: 'end' as const, players: base.players.map((player) => player.id === stuckId ? { ...player, bankrupt: true, money: 0 } : player) };
  const moved = autoPlay(frozen, seeded(8));
  assert.notEqual(currentPlayerId(moved), stuckId, 'The turn leaves the bankrupt player.');
  assert.equal(moved.phase, 'roll', 'The next player rolls.');
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
