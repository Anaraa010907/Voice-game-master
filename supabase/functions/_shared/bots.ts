/*
 * Computer players. They sit in real seats, but the server makes their moves:
 *  - Mafia: bots lock in a night target and a vote as soon as a phase opens (a testing aid —
 *    they cannot talk, so they are not meant for real social-deduction games).
 *  - Board game: bots take one step (roll, buy or pass, bid, answer a trade, build, end turn)
 *    each time their short timer runs out, so humans can watch their dice and moves.
 */
import {
  isMafiaAligned, nightRoleOf, recordVerdict, recordVote, submitNightAction,
  type GameEngineState, type RandomSource, type VoteChoice,
} from './gameEngine.ts';
import {
  BOARD, GROUP_TILES, JAIL_FINE, actingPlayerId, applyMonopolyAction, autoPlay, canBuild, canTradeTile, minimumBid, ownsGroup,
  tradeProblem, unmortgageCost,
  type MonopolyAction, type MonopolyPlayer, type MonopolyState, type TradeOffer,
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


// ─── Board game ──────────────────────────────────────────────────────────────
// The strategy is Monopoly Forge's baseline bot (Dimitriuses, MIT licence): keep a cash reserve,
// pay up for a deed that completes a set, bid to a ceiling at auctions, build cheapest-first,
// and trade for the missing piece of a colour group — never handing a rival theirs for nothing.

/** Cash a bot keeps back from ordinary purchases. */
const RESERVE = 150;
/** An auction ceiling for an ordinary deed, as a multiple of its price. */
const AUCTION_CEILING = 1.2;
/** Extra cash kept on top of the reserve before building or redeeming. */
const BUILD_BUFFER = 100;
/** A rival's set-completing deed sells for no less than this many times its worth. */
const KEY_PREMIUM = 2.5;
/** What a "get out of jail free" card is worth in a trade. */
const JAIL_CARD_VALUE = JAIL_FINE;
/** Rounds a bot waits after an offer before it proposes again. */
const OFFER_COOLDOWN = 2;
const CASH_STEP = 10;

const ownerOf = (state: MonopolyState, tileId: number) => state.tiles[tileId].owner;
const countOwned = (state: MonopolyState, id: number, kind: 'rail' | 'utility') => BOARD.filter((tile) => tile.kind === kind && ownerOf(state, tile.id) === id).length;

/** A deed that completes (or is part of) a colour group for `id`, or a second railway or utility. */
function isStrategic(state: MonopolyState, id: number, tileId: number): boolean {
  const tile = BOARD[tileId];
  if (tile.kind === 'property' && tile.group) {
    const group = GROUP_TILES[tile.group];
    const owned = group.filter((other) => ownerOf(state, other) === id).length;
    return ownsGroup(state, id, tile.group) || owned + 1 >= group.length;
  }
  if (tile.kind === 'rail' || tile.kind === 'utility') return countOwned(state, id, tile.kind) >= 1;
  return false;
}

/** Would handing this deed to `other` complete a colour group for them? */
function completesGroupFor(state: MonopolyState, other: number, tileId: number): boolean {
  const tile = BOARD[tileId];
  if (tile.kind !== 'property' || !tile.group) return false;
  return GROUP_TILES[tile.group].every((member) => member === tileId || ownerOf(state, member) === other);
}

function valueOf(state: MonopolyState, id: number, tileId: number) {
  const price = BOARD[tileId].price ?? 0;
  return isStrategic(state, id, tileId) ? Math.floor(price * 1.5) : price;
}

function shouldBuy(state: MonopolyState, me: MonopolyPlayer, tileId: number) {
  const price = BOARD[tileId].price ?? Infinity;
  if (me.money < price) return false;
  return isStrategic(state, me.id, tileId) || me.money - price >= RESERVE;
}

function auctionCeiling(state: MonopolyState, me: MonopolyPlayer, tileId: number) {
  const price = BOARD[tileId].price ?? 0;
  const strategic = isStrategic(state, me.id, tileId);
  const worth = Math.floor(price * AUCTION_CEILING);
  const ceiling = strategic ? Math.floor(worth + price * 0.5) : worth;
  const spendable = strategic ? me.money : me.money - RESERVE;
  return Math.max(0, Math.min(ceiling, spendable));
}

/** The bot's next bid, or null to pass. It raises in steps of a tenth of the price. */
export function botBid(state: MonopolyState, me: MonopolyPlayer): number | null {
  const auction = state.auction;
  if (!auction) return null;
  const ceiling = auctionCeiling(state, me, auction.tile);
  const minimum = minimumBid(auction);
  if (minimum > ceiling) return null;
  const step = Math.max(minimum, auction.highBid + Math.ceil((BOARD[auction.tile].price ?? 0) / 10));
  return Math.min(step, ceiling);
}

/** Early on a cell is cheap rent protection, so the bot sits it out; once houses go up it buys its way out. */
function jailChoice(state: MonopolyState, me: MonopolyPlayer): 'use-card' | 'pay-jail' | 'roll' {
  if ((me.jailCards ?? []).length > 0) return 'use-card';
  const developed = state.tiles.some((tileState) => tileState.houses > 0);
  return developed && me.money >= JAIL_FINE + RESERVE ? 'pay-jail' : 'roll';
}

/** Would this bot take the offer? Forge's rule: it must gain more than it gives, and a rival's set-completing deed costs a premium. */
export function botAcceptsTrade(state: MonopolyState, botId: number, offer: TradeOffer): boolean {
  const me = state.players.find((entry) => entry.id === botId);
  if (!me) return false;
  const proposer = offer.from === botId;
  const giving = proposer ? offer.give : offer.get;
  const getting = proposer ? offer.get : offer.give;
  const givingCash = proposer ? offer.giveCash : offer.getCash;
  const gettingCash = proposer ? offer.getCash : offer.giveCash;
  const givingCards = proposer ? offer.giveCards : offer.getCards;
  const gettingCards = proposer ? offer.getCards : offer.giveCards;
  if (me.money < givingCash) return false;

  const other = proposer ? offer.to : offer.from;
  const givingTheirKey = giving.some((tileId) => completesGroupFor(state, other, tileId));
  const gettingOurKey = getting.some((tileId) => completesGroupFor(state, botId, tileId));
  if (givingTheirKey && !gettingOurKey) {
    const asking = giving.filter((tileId) => completesGroupFor(state, other, tileId)).reduce((sum, tileId) => sum + valueOf(state, botId, tileId), 0) * KEY_PREMIUM;
    if (gettingCash < asking) return false;
  }
  // Taking on a mortgage costs the redemption price, so a mortgaged deed is worth that much less.
  const worth = (tileId: number) => valueOf(state, botId, tileId) - (state.tiles[tileId].mortgaged ? unmortgageCost(tileId) : 0);
  const given = giving.reduce((sum, tileId) => sum + valueOf(state, botId, tileId), givingCash + givingCards * JAIL_CARD_VALUE);
  const gained = getting.reduce((sum, tileId) => sum + worth(tileId), gettingCash + gettingCards * JAIL_CARD_VALUE);
  return gained > given;
}

const emptyOffer = (from: number, to: number): TradeOffer => ({ from, to, give: [], get: [], giveCash: 0, getCash: 0, giveCards: 0, getCards: 0 });

/** The smallest cash sweetener (in steps of 10) that the partner would still say yes to, within budget. */
function cheapestYes(state: MonopolyState, partner: number, base: TradeOffer, budget: number): TradeOffer | null {
  const withCash = (cash: number): TradeOffer => ({ ...base, giveCash: cash });
  const yes = (cash: number) => tradeProblem(state, withCash(cash)) === '' && botAcceptsTrade(state, partner, withCash(cash));
  const top = Math.floor(budget / CASH_STEP);
  if (!yes(top * CASH_STEP)) return null;
  let low = 0;
  let high = top;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (yes(middle * CASH_STEP)) high = middle;
    else low = middle + 1;
  }
  return withCash(low * CASH_STEP);
}

const activeOwner = (state: MonopolyState, tileId: number) => {
  const owner = ownerOf(state, tileId);
  return owner === null ? null : state.players.find((entry) => entry.id === owner && !entry.bankrupt) ?? null;
};

/** The offer a bot would make this turn: swap set-completers, buy the missing deed, or buy a second railway/utility. */
export function botTradeOffer(state: MonopolyState, botId: number): TradeOffer | null {
  const me = state.players.find((entry) => entry.id === botId);
  if (!me) return null;
  const budget = Math.max(0, me.money - RESERVE);
  const wanted = BOARD.filter((tile) => tile.kind === 'property' && ownerOf(state, tile.id) !== null && ownerOf(state, tile.id) !== botId
    && completesGroupFor(state, botId, tile.id) && canTradeTile(state, tile.id));

  // 1. A swap that completes a group on each side.
  for (const target of wanted) {
    const owner = activeOwner(state, target.id);
    if (!owner) continue;
    const ours = BOARD.filter((tile) => ownerOf(state, tile.id) === botId && tile.group !== target.group
      && completesGroupFor(state, owner.id, tile.id) && canTradeTile(state, tile.id)).sort((left, right) => (left.price ?? 0) - (right.price ?? 0));
    for (const key of ours) {
      const offer = cheapestYes(state, owner.id, { ...emptyOffer(botId, owner.id), give: [key.id], get: [target.id] }, budget);
      if (offer) return offer;
    }
  }
  // 2. Buy the missing deed for cash, most valuable first.
  for (const target of [...wanted].sort((left, right) => valueOf(state, botId, right.id) - valueOf(state, botId, left.id))) {
    const owner = activeOwner(state, target.id);
    if (!owner) continue;
    const offer = cheapestYes(state, owner.id, { ...emptyOffer(botId, owner.id), get: [target.id] }, budget);
    if (offer) return offer;
  }
  // 3. A railway or utility that pairs with one already held.
  for (const tile of BOARD) {
    if ((tile.kind !== 'rail' && tile.kind !== 'utility') || ownerOf(state, tile.id) === botId || !isStrategic(state, botId, tile.id)) continue;
    const owner = activeOwner(state, tile.id);
    if (!owner) continue;
    const offer = cheapestYes(state, owner.id, { ...emptyOffer(botId, owner.id), get: [tile.id] }, budget);
    if (offer) return offer;
  }
  return null;
}

/** One sensible step for the board-game bot that has to act: answer an offer, bid, roll, buy, build or end the turn. */
export function monopolyBotStep(state: MonopolyState, random: RandomSource): MonopolyState {
  if (state.phase === 'finished') return state;
  const id = actingPlayerId(state);
  const me = state.players.find((entry) => entry.id === id);
  if (!me) return autoPlay(state, random);
  const attempt = (action: MonopolyAction, from: MonopolyState = state) => {
    const result = applyMonopolyAction(from, id, action, random);
    return result.error ? null : result.state;
  };

  if (state.trade) {
    if (state.trade.to !== id) return autoPlay(state, random);
    return attempt({ type: botAcceptsTrade(state, id, state.trade) ? 'accept' : 'reject' }) ?? autoPlay(state, random);
  }

  if (state.phase === 'auction') {
    const amount = botBid(state, me);
    return (amount !== null ? attempt({ type: 'bid', amount }) : null) ?? attempt({ type: 'pass' }) ?? autoPlay(state, random);
  }

  if (state.phase === 'roll') {
    if (me.inJail) {
      const choice = jailChoice(state, me);
      if (choice !== 'roll') {
        const freed = attempt({ type: choice });
        if (freed) return freed;
      }
    }
    return attempt({ type: 'roll' }) ?? autoPlay(state, random);
  }

  if (state.phase === 'buy') {
    if (shouldBuy(state, me, me.position)) {
      const bought = attempt({ type: 'buy' });
      if (bought) return bought;
    }
    return attempt({ type: 'decline' }) ?? autoPlay(state, random);
  }

  // End of turn: redeem mortgages and build while a cushion is left, all as one visible step.
  let next = state;
  const cushion = () => next.players.find((entry) => entry.id === id)!.money - RESERVE - BUILD_BUFFER;
  for (const tile of BOARD) {
    if (next.tiles[tile.id].owner !== id || !next.tiles[tile.id].mortgaged || cushion() < unmortgageCost(tile.id)) continue;
    next = attempt({ type: 'unmortgage', tile: tile.id }, next) ?? next;
  }
  const lots = BOARD.filter((tile) => tile.kind === 'property' && tile.houseCost !== undefined).sort((left, right) => left.houseCost! - right.houseCost!);
  for (let round = 0; round < 5; round += 1) {
    let builtThisRound = false;
    for (const lot of lots) {
      if (next.tiles[lot.id].owner !== id || cushion() < lot.houseCost! || !canBuild(next, id, lot.id)) continue;
      const built = attempt({ type: 'build', tile: lot.id }, next);
      if (built) { next = built; builtThisRound = true; }
    }
    if (!builtThisRound) break;
  }
  if (next !== state) return next;

  // Then perhaps one trade offer, rationed so people are not pestered every turn.
  const lastOffer = me.lastOfferRound ?? -Infinity;
  if ((state.offersThisTurn ?? 0) === 0 && state.round - lastOffer >= OFFER_COOLDOWN) {
    const offer = botTradeOffer(state, id);
    if (offer) {
      const { from: _from, ...proposal } = offer;
      const proposed = attempt({ type: 'propose', offer: proposal });
      if (proposed) return proposed;
    }
  }
  return attempt({ type: 'end' }) ?? autoPlay(state, random);
}

/** True when the board-game player who has to act (turn, bid or trade answer) is a bot. */
export function boardBotToMove(state: MonopolyState): boolean {
  if (state.phase === 'finished') return false;
  return state.players.find((entry) => entry.id === actingPlayerId(state))?.bot === true;
}
