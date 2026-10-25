import assert from 'node:assert/strict';
import { botAcceptsTrade, botBid, boardBotToMove, mafiaBotsAct, monopolyBotStep, nextBotName } from '../supabase/functions/_shared/bots.ts';
import {
  allNightActionsSubmitted, allVerdictsSubmitted, allVotesSubmitted, createInitialGame, finishDay, openDiscussion, recordVote, removePlayer,
  publicView, resolveNight, resolveTrial, resolveVoting, sanitizeMafiaSettings, startNight, startVoting, type GameEngineState,
} from '../supabase/functions/_shared/gameEngine.ts';
import { actingPlayerId, applyMonopolyAction, autoPlay, createMonopolyGame, currentPlayerId, type MonopolyState } from '../supabase/functions/_shared/monopolyEngine.ts';

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

// Board game: bots play to the end; they buy, bid at auctions, trade and build along the way.
{
  let auctions = 0;
  let trades = 0;
  let buildings = 0;
  for (const [seed, count] of [[5, 3], [11, 3], [2024, 4], [77, 6]]) {
    const random = seeded(seed);
    let state = createMonopolyGame(Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Бот ${index + 1}`, initials: 'БО', color: 'rose', bot: true })), random);
    let steps = 0;
    let bought = 0;
    while (state.phase !== 'finished' && steps < 5000) {
      assert.ok(boardBotToMove(state), 'A bot is always to move.');
      const next = monopolyBotStep(state, random);
      assert.notEqual(next, state, 'Every bot step changes the game.');
      if (next.phase === 'auction' && state.phase !== 'auction') auctions += 1;
      if (state.trade && !next.trade && next.log[next.log.length - 1].includes('⇄')) trades += 1;
      buildings = Math.max(buildings, next.tiles.reduce((total, tile) => total + tile.houses, 0));
      bought = Math.max(bought, next.tiles.filter((tile) => tile.owner !== null).length);
      assert.ok(next.players.every((player) => player.money >= 0), 'No negative money.');
      state = next;
      steps += 1;
    }
    assert.equal(state.phase, 'finished', `Bot-only board game ${seed} finishes.`);
    assert.ok(bought > 3, 'Bots buy property.');
  }
  assert.ok(auctions > 0, 'Bots hold auctions for deeds they turn down.');
  assert.ok(trades > 0, 'Bots trade with each other.');
  assert.ok(buildings > 0, 'Bots build houses.');
}

// Board game: a bot answers a person's offer on its own merits, and bids only to its ceiling.
{
  const people = [
    { id: 1, name: 'Хүн', initials: 'ХҮ', color: 'rose' },
    { id: 2, name: 'Бот', initials: 'БО', color: 'teal', bot: true },
  ];
  let base: MonopolyState = createMonopolyGame(people, () => 0.99);
  base = { ...base, tiles: base.tiles.map((tile, index) => index === 1 ? { ...tile, owner: 1 } : index === 3 || index === 6 ? { ...tile, owner: 2 } : tile) };
  const offer = (give: number[], get: number[], giveCash: number) => ({ from: 1, to: 2, give, get, giveCash, getCash: 0, giveCards: 0, getCards: 0 });
  assert.equal(botAcceptsTrade(base, 2, offer([], [3], 100)), false, 'A bot will not sell a rival the deed that completes their set at its price.');
  assert.equal(botAcceptsTrade(base, 2, offer([], [3], 400)), true, 'A large enough premium buys it.');
  assert.equal(botAcceptsTrade(base, 2, offer([1], [6], 0)), false, 'A bot values what it gives up by its own plans.');
  assert.equal(botAcceptsTrade(base, 2, offer([1], [6], 100)), true, 'Its own set-completer plus cash is a yes.');
  const proposed = applyMonopolyAction(base, 1, { type: 'propose', offer: { to: 2, give: [], get: [3], giveCash: 50, getCash: 0, giveCards: 0, getCards: 0 } });
  assert.ok(!proposed.error && boardBotToMove(proposed.state), 'The bot has to answer the offer.');
  const answered = monopolyBotStep(proposed.state, seeded(1));
  assert.ok(!answered.trade && answered.tiles[3].owner === 2, 'The bot turns down a lowball offer.');

  const auction: MonopolyState = { ...base, phase: 'auction', auction: { tile: 31, bidders: [2, 1], turn: 0, highBid: 0, highBidder: null } };
  const bot = auction.players.find((player) => player.id === 2)!;
  assert.equal(botBid(auction, bot), 40, 'A bot opens at a tenth of the price.');
  assert.equal(botBid({ ...auction, auction: { ...auction.auction!, highBid: 480, highBidder: 1 } }, bot), null, 'A bot passes above its ceiling.');
  assert.equal(actingPlayerId(monopolyBotStep(auction, seeded(1))), 1, 'After its bid the auction moves to the person.');
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
