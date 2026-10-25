/**
 * "Монгол Монополь" rules engine. Pure TypeScript with no imports so the server (Deno), the
 * browser and Node tests share it. Everything here is public information, so the server
 * publishes the whole state to every player.
 *
 * The auction, trading, per-tile rent ladders, the bank's limited houses and ger camps, the
 * shuffled card decks with "get out of jail free" cards, and the bot strategy in bots.ts are
 * ported from Monopoly Forge by Dimitriuses (MIT licence, github.com/Dimitriuses/monopoly-forge)
 * and adapted to this 32-tile Mongolian board and the 20-round online game.
 */

export type TileKind = 'start' | 'property' | 'rail' | 'utility' | 'tax' | 'chance' | 'chest' | 'jail' | 'parking' | 'gotojail';
export type ColorGroup = 'brown' | 'sky' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'navy';

export type Tile = {
  id: number;
  kind: TileKind;
  name: string;
  /** Short label for small board cells. */
  short: string;
  /** Aimag / region shown in the detail card. */
  region?: string;
  group?: ColorGroup;
  price?: number;
  /** Base rent for properties; tax amount for tax tiles. */
  rent?: number;
  houseCost?: number;
  /** Property rent with 0, 1, 2, 3, 4 houses and a ger camp (the classic rent ladder). */
  rents?: number[];
};

export const BOARD: Tile[] = [
  { id: 0, kind: 'start', name: 'Эхлэл', short: 'ЭХЛЭЛ' },
  { id: 1, kind: 'property', name: 'Даланзадгад', short: 'Даланзадгад', region: 'Өмнөговь', group: 'brown', price: 60, rent: 4, houseCost: 50, rents: [4, 20, 60, 180, 320, 450] },
  { id: 2, kind: 'chance', name: 'Хувь тавилан', short: 'Хувь' },
  { id: 3, kind: 'property', name: 'Сайншанд', short: 'Сайншанд', region: 'Дорноговь', group: 'brown', price: 60, rent: 4, houseCost: 50, rents: [4, 20, 60, 180, 320, 450] },
  { id: 4, kind: 'tax', name: 'Орлогын татвар', short: 'Татвар', rent: 200 },
  { id: 5, kind: 'rail', name: 'Улаанбаатар өртөө', short: 'УБ өртөө', region: 'Төмөр зам', price: 200 },
  { id: 6, kind: 'property', name: 'Мөрөн', short: 'Мөрөн', region: 'Хөвсгөл', group: 'sky', price: 100, rent: 6, houseCost: 50, rents: [6, 30, 90, 270, 400, 550] },
  { id: 7, kind: 'property', name: 'Улиастай', short: 'Улиастай', region: 'Завхан', group: 'sky', price: 120, rent: 8, houseCost: 50, rents: [8, 40, 100, 300, 450, 600] },
  { id: 8, kind: 'jail', name: 'Шорон', short: 'ШОРОН' },
  { id: 9, kind: 'property', name: 'Өлгий', short: 'Өлгий', region: 'Баян-Өлгий', group: 'pink', price: 140, rent: 10, houseCost: 100, rents: [10, 50, 150, 450, 625, 750] },
  { id: 10, kind: 'utility', name: 'Цахилгаан станц', short: 'Цахилгаан', region: 'Дулааны станц', price: 150 },
  { id: 11, kind: 'property', name: 'Ховд', short: 'Ховд', region: 'Ховд', group: 'pink', price: 160, rent: 12, houseCost: 100, rents: [12, 60, 180, 500, 700, 900] },
  { id: 12, kind: 'property', name: 'Баянхонгор', short: 'Баянхонгор', region: 'Баянхонгор', group: 'orange', price: 180, rent: 14, houseCost: 100, rents: [14, 70, 200, 550, 750, 950] },
  { id: 13, kind: 'rail', name: 'Чингис хаан нисэх буудал', short: 'Нисэх буудал', region: 'Агаарын зам', price: 200 },
  { id: 14, kind: 'property', name: 'Арвайхээр', short: 'Арвайхээр', region: 'Өвөрхангай', group: 'orange', price: 200, rent: 16, houseCost: 100, rents: [16, 80, 220, 600, 800, 1000] },
  { id: 15, kind: 'chest', name: 'Эрдэнэсийн авдар', short: 'Авдар' },
  { id: 16, kind: 'parking', name: 'Наадам', short: 'НААДАМ' },
  { id: 17, kind: 'property', name: 'Цэцэрлэг', short: 'Цэцэрлэг', region: 'Архангай', group: 'red', price: 220, rent: 18, houseCost: 150, rents: [18, 90, 250, 700, 875, 1050] },
  { id: 18, kind: 'chance', name: 'Хувь тавилан', short: 'Хувь' },
  { id: 19, kind: 'property', name: 'Хархорин', short: 'Хархорин', region: 'Өвөрхангай', group: 'red', price: 240, rent: 20, houseCost: 150, rents: [20, 100, 300, 750, 925, 1100] },
  { id: 20, kind: 'property', name: 'Хөвсгөл нуур', short: 'Хөвсгөл', region: 'Хөвсгөл', group: 'yellow', price: 260, rent: 22, houseCost: 150, rents: [22, 110, 330, 800, 975, 1150] },
  { id: 21, kind: 'rail', name: 'Замын-Үүд боомт', short: 'Замын-Үүд', region: 'Хилийн боомт', price: 200 },
  { id: 22, kind: 'property', name: 'Чойбалсан', short: 'Чойбалсан', region: 'Дорнод', group: 'yellow', price: 280, rent: 24, houseCost: 150, rents: [24, 120, 360, 850, 1025, 1200] },
  { id: 23, kind: 'utility', name: 'Ус сувгийн компани', short: 'Ус суваг', region: 'УСУГ', price: 150 },
  { id: 24, kind: 'gotojail', name: 'Шоронд яв', short: 'ШОРОНД ЯВ' },
  { id: 25, kind: 'property', name: 'Дархан', short: 'Дархан', region: 'Дархан-Уул', group: 'green', price: 300, rent: 26, houseCost: 200, rents: [26, 130, 390, 900, 1100, 1275] },
  { id: 26, kind: 'property', name: 'Эрдэнэт', short: 'Эрдэнэт', region: 'Орхон', group: 'green', price: 300, rent: 26, houseCost: 200, rents: [26, 130, 390, 900, 1100, 1275] },
  { id: 27, kind: 'chest', name: 'Эрдэнэсийн авдар', short: 'Авдар' },
  { id: 28, kind: 'property', name: 'Тэрэлж', short: 'Тэрэлж', region: 'Төв', group: 'green', price: 320, rent: 28, houseCost: 200, rents: [28, 150, 450, 1000, 1200, 1400] },
  { id: 29, kind: 'tax', name: 'Тансгийн татвар', short: 'Тансаг', rent: 100 },
  { id: 30, kind: 'property', name: 'Зайсан', short: 'Зайсан', region: 'Улаанбаатар', group: 'navy', price: 350, rent: 35, houseCost: 200, rents: [35, 175, 500, 1100, 1300, 1500] },
  { id: 31, kind: 'property', name: 'Сүхбаатарын талбай', short: 'Сүхбаатар', region: 'Улаанбаатар', group: 'navy', price: 400, rent: 50, houseCost: 200, rents: [50, 200, 600, 1400, 1700, 2000] },
];

export const GROUP_TILES: Record<ColorGroup, number[]> = BOARD.reduce((groups, tile) => {
  if (tile.group) groups[tile.group] = [...(groups[tile.group] ?? []), tile.id];
  return groups;
}, {} as Record<ColorGroup, number[]>);

export const START_MONEY = 1500;
export const PASS_START_BONUS = 200;
export const JAIL_FINE = 50;
export const JAIL_TILE = 8;
/** Rolls a jailed player gets to throw doubles; after the last miss the fine is paid automatically. */
export const JAIL_TERM = 3;
export const MAX_ROUNDS = 20;
export const MIN_MONOPOLY_PLAYERS = 2;
/** The bank's building supply. A ger camp hands its four houses back to the bank. */
export const MAX_HOUSES = 32;
export const MAX_HOTELS = 12;
/** Opening bid and the smallest raise at an auction. */
export const AUCTION_INCREMENT = 10;
/** Interest charged when a mortgaged deed changes hands or is redeemed. */
export const MORTGAGE_INTEREST = 0.1;
/** Trade offers one player may put forward in a single turn. */
export const MAX_OFFERS_PER_TURN = 3;

export type DeckName = 'chance' | 'chest';
type CardEffect =
  | { type: 'money'; amount: number }
  | { type: 'move-to'; tile: number }
  | { type: 'move-by'; steps: number }
  | { type: 'nearest'; kind: 'rail' | 'utility' }
  | { type: 'jail' }
  | { type: 'jail-free' }
  | { type: 'collect-each'; amount: number }
  | { type: 'pay-each'; amount: number }
  | { type: 'repairs'; perHouse: number; perHotel: number };
export type Card = { title: string; text: string; effect: CardEffect };

const JAIL_FREE_TEXT = 'Шоронгоос үнэгүй гарах карт. Хадгалж байгаад хэрэгтэй үедээ ашиглах эсвэл арилжаалж болно.';

export const CHANCE: Card[] = [
  { title: 'Шуурхай аялал', text: 'Эхлэл рүү шууд оч, 200₮ ав.', effect: { type: 'move-to', tile: 0 } },
  { title: 'Хархорин аялал', text: 'Хархорин руу яв. Эхлэлийг давбал 200₮ авна.', effect: { type: 'move-to', tile: 19 } },
  { title: 'Бүргэдийн баяр', text: 'Өлгийд бүргэдийн баярт оч. Эхлэлийг давбал 200₮ авна.', effect: { type: 'move-to', tile: 9 } },
  { title: 'Галт тэрэг', text: 'Хамгийн ойрын өртөө, боомт руу яв. Эзэнтэй бол түрээсийг 2 дахин төлнө.', effect: { type: 'nearest', kind: 'rail' } },
  { title: 'Ашиглалтын газар', text: 'Хамгийн ойрын цахилгаан, ус сувгийн газар руу яв. Эзэнтэй бол шооны нийлбэрийг 10-аар үржүүлж төлнө.', effect: { type: 'nearest', kind: 'utility' } },
  { title: 'Ногдол ашиг', text: 'Банк танд 50₮ ногдол ашиг өгнө.', effect: { type: 'money', amount: 50 } },
  { title: 'Өршөөл', text: JAIL_FREE_TEXT, effect: { type: 'jail-free' } },
  { title: 'Замын түгжрэл', text: 'Түгжрэлд орж 3 нүд ухарна.', effect: { type: 'move-by', steps: -3 } },
  { title: 'Хурд хэтрүүлэв', text: 'Зам цагдаа баривчиллаа. Шууд шоронд яв.', effect: { type: 'jail' } },
  { title: 'Ерөнхий засвар', text: 'Гэр бүрд 25₮, жуулчны бааз бүрд 100₮ засварын зардал төлнө.', effect: { type: 'repairs', perHouse: 25, perHotel: 100 } },
  { title: 'Торгууль', text: 'Хог хаясны торгууль 15₮ төлнө.', effect: { type: 'money', amount: -15 } },
  { title: 'Нисэх буудал', text: 'Чингис хаан нисэх буудал руу яв. Эхлэлийг давбал 200₮ авна.', effect: { type: 'move-to', tile: 13 } },
  { title: 'Нийслэлд', text: 'Сүхбаатарын талбай руу яв.', effect: { type: 'move-to', tile: 31 } },
  { title: 'Хурлын дарга', text: 'Хурлын даргаар сонгогдлоо. Тоглогч бүрд 50₮ төлнө.', effect: { type: 'pay-each', amount: 50 } },
  { title: 'Наадмын бөх', text: 'Улсын наадамд түрүүлж 150₮ авна.', effect: { type: 'money', amount: 150 } },
  { title: 'Шатрын тэмцээн', text: 'Шатрын тэмцээнд түрүүлж 100₮ авна.', effect: { type: 'money', amount: 100 } },
];

export const CHEST: Card[] = [
  { title: 'Эхлэл', text: 'Эхлэл рүү оч, 200₮ ав.', effect: { type: 'move-to', tile: 0 } },
  { title: 'Банкны алдаа', text: 'Банк таны талд алдаа гаргалаа. 200₮ авна.', effect: { type: 'money', amount: 200 } },
  { title: 'Эмчийн үзлэг', text: 'Эмчийн үзлэгт 50₮ төлнө.', effect: { type: 'money', amount: -50 } },
  { title: 'Ноолуурын ашиг', text: 'Ноолуур зарж 50₮ олов.', effect: { type: 'money', amount: 50 } },
  { title: 'Өршөөл', text: JAIL_FREE_TEXT, effect: { type: 'jail-free' } },
  { title: 'Шоронд яв', text: 'Татвараас зайлсхийсэн нь илэрлээ. Шууд шоронд яв.', effect: { type: 'jail' } },
  { title: 'Цагаан сар', text: 'Цагаан сарын золголт. Тоглогч бүр танд 50₮ өгнө.', effect: { type: 'collect-each', amount: 50 } },
  { title: 'Мал төллөв', text: 'Сүрэг өсөж 100₮ орлого оров.', effect: { type: 'money', amount: 100 } },
  { title: 'Татварын буцаалт', text: 'Татварын буцаалт 20₮ авна.', effect: { type: 'money', amount: 20 } },
  { title: 'Төрсөн өдөр', text: 'Төрсөн өдөр тань баяр хүргэе! Тоглогч бүр 10₮ бэлэглэнэ.', effect: { type: 'collect-each', amount: 10 } },
  { title: 'Даатгал', text: 'Даатгалын хугацаа дуусч 100₮ авна.', effect: { type: 'money', amount: 100 } },
  { title: 'Эмнэлгийн төлбөр', text: 'Эмнэлэгт 100₮ төлнө.', effect: { type: 'money', amount: -100 } },
  { title: 'Сургалтын төлбөр', text: 'Сургалтын төлбөр 150₮ төлнө.', effect: { type: 'money', amount: -150 } },
  { title: 'Зөвлөх үйлчилгээ', text: 'Зөвлөгөө өгсний хөлс 25₮ авна.', effect: { type: 'money', amount: 25 } },
  { title: 'Гудамжны засвар', text: 'Гэр бүрд 40₮, жуулчны бааз бүрд 115₮ төлнө.', effect: { type: 'repairs', perHouse: 40, perHotel: 115 } },
  { title: 'Өв залгамжлал', text: 'Өв залгамжилж 100₮ авна.', effect: { type: 'money', amount: 100 } },
];

const DECKS: Record<DeckName, Card[]> = { chance: CHANCE, chest: CHEST };
const JAIL_FREE_CARD: Record<DeckName, number> = {
  chance: CHANCE.findIndex((card) => card.effect.type === 'jail-free'),
  chest: CHEST.findIndex((card) => card.effect.type === 'jail-free'),
};

export type MonopolyPlayer = {
  id: number;
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string | null;
  host?: boolean;
  /** A computer player: the server moves for it. */
  bot?: boolean;
  money: number;
  position: number;
  inJail: boolean;
  jailTries: number;
  bankrupt: boolean;
  /** "Get out of jail free" cards held, by the deck each goes back to. */
  jailCards?: DeckName[];
  /** Round of this player's last trade offer (bots wait a while before asking again). */
  lastOfferRound?: number;
};

export type TileState = { owner: number | null; houses: number; mortgaged: boolean };
export type MonopolyPhase = 'roll' | 'buy' | 'auction' | 'end' | 'finished';

/** A deed nobody bought goes under the hammer: round-robin bidding, and a pass is final. */
export type AuctionState = {
  tile: number;
  /** Still in the running, in seat order. A pass removes a bidder for good. */
  bidders: number[];
  /** Index into `bidders` of whoever bids next. */
  turn: number;
  highBid: number;
  highBidder: number | null;
};

/** A trade offer, written from the proposer's side: `give` goes to `to`, `get` comes back. */
export type TradeOffer = {
  from: number;
  to: number;
  give: number[];
  get: number[];
  giveCash: number;
  getCash: number;
  giveCards: number;
  getCards: number;
};
export type TradeProposal = Omit<TradeOffer, 'from'>;

export type MonopolyState = {
  kind: 'monopoly';
  phase: MonopolyPhase;
  round: number;
  order: number[];
  turn: number;
  players: MonopolyPlayer[];
  tiles: TileState[];
  dice: [number, number] | null;
  doublesInRow: number;
  /** Set when the current player rolled doubles and may roll again after this landing. */
  rollAgain: boolean;
  card: { title: string; text: string; deck?: DeckName } | null;
  log: string[];
  winner: number | null;
  /** Running auction (phase 'auction'). */
  auction?: AuctionState | null;
  /** A trade offer waiting for `to` to answer; the turn pauses until it is settled. */
  trade?: TradeOffer | null;
  offersThisTurn?: number;
  /** Draw piles (card indexes). A drawn card goes to the bottom; a jail card stays with its holder. */
  decks?: Record<DeckName, number[]>;
};

export type MonopolyAction =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'end' }
  | { type: 'pay-jail' }
  | { type: 'use-card' }
  | { type: 'build'; tile: number }
  | { type: 'sell'; tile: number }
  | { type: 'mortgage'; tile: number }
  | { type: 'unmortgage'; tile: number }
  | { type: 'bid'; amount: number }
  | { type: 'pass' }
  | { type: 'propose'; offer: TradeProposal }
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'cancel-trade' };

export type MonopolyResult = { state: MonopolyState; error?: string };
export type RandomSource = () => number;

const money = (amount: number) => `${amount}₮`;

export function currentPlayerId(state: MonopolyState) {
  return state.order[state.turn];
}

/** Whoever has to act now: the trade partner, the bidder whose turn it is, or the player whose turn it is. */
export function actingPlayerId(state: MonopolyState) {
  if (state.phase !== 'finished') {
    if (state.trade) return state.trade.to;
    if (state.phase === 'auction' && state.auction?.bidders.length) return state.auction.bidders[state.auction.turn % state.auction.bidders.length];
  }
  return currentPlayerId(state);
}

function player(state: MonopolyState, id: number) {
  return state.players.find((candidate) => candidate.id === id)!;
}

function withPlayer(state: MonopolyState, id: number, change: (value: MonopolyPlayer) => MonopolyPlayer): MonopolyState {
  return { ...state, players: state.players.map((candidate) => candidate.id === id ? change(candidate) : candidate) };
}

function withTile(state: MonopolyState, tile: number, change: (value: TileState) => TileState): MonopolyState {
  return { ...state, tiles: state.tiles.map((value, index) => index === tile ? change(value) : value) };
}

function log(state: MonopolyState, line: string): MonopolyState {
  return { ...state, log: [...state.log.slice(-19), line] };
}

function shuffle<T>(items: T[], random: RandomSource): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Freshly shuffled draw piles, leaving out any jail card a player is already holding. */
function freshDecks(players: MonopolyPlayer[], random: RandomSource): Record<DeckName, number[]> {
  const held = players.flatMap((entry) => entry.jailCards ?? []);
  const pile = (deck: DeckName) => shuffle(DECKS[deck].map((_, index) => index), random)
    .filter((index) => !(index === JAIL_FREE_CARD[deck] && held.includes(deck)));
  return { chance: pile('chance'), chest: pile('chest') };
}

export function createMonopolyGame(players: Array<Pick<MonopolyPlayer, 'id' | 'name' | 'initials' | 'color' | 'avatarUrl' | 'host' | 'bot'>>, random: RandomSource = Math.random): MonopolyState {
  const order = shuffle(players.map((entry) => entry.id), random);
  const first = players.find((entry) => entry.id === order[0])!;
  const seated = players.map((entry) => ({ ...entry, avatarUrl: entry.avatarUrl ?? null, money: START_MONEY, position: 0, inJail: false, jailTries: 0, bankrupt: false, jailCards: [] as DeckName[] }));
  return {
    kind: 'monopoly',
    phase: 'roll',
    round: 1,
    order,
    turn: 0,
    players: seated,
    tiles: BOARD.map(() => ({ owner: null, houses: 0, mortgaged: false })),
    dice: null,
    doublesInRow: 0,
    rollAgain: false,
    card: null,
    log: [`Тоглоом эхэллээ. ${first.name} эхэлж шоо хаяна.`],
    winner: null,
    auction: null,
    trade: null,
    offersThisTurn: 0,
    decks: freshDecks(seated, random),
  };
}

export function ownsGroup(state: MonopolyState, owner: number, group: ColorGroup) {
  return GROUP_TILES[group].every((tile) => state.tiles[tile].owner === owner);
}

/** Houses and ger camps still in the bank. */
export function bankSupply(state: MonopolyState) {
  let houses = MAX_HOUSES;
  let hotels = MAX_HOTELS;
  for (const tileState of state.tiles) {
    if (tileState.houses === 5) hotels -= 1;
    else houses -= tileState.houses;
  }
  return { houses, hotels };
}

export function rentFor(state: MonopolyState, tileId: number, diceTotal: number): number {
  const tile = BOARD[tileId];
  const tileState = state.tiles[tileId];
  if (tileState.owner === null || tileState.mortgaged) return 0;
  if (tile.kind === 'property') {
    const rents = tile.rents!;
    if (tileState.houses > 0) return rents[tileState.houses];
    return ownsGroup(state, tileState.owner, tile.group!) ? rents[0] * 2 : rents[0];
  }
  if (tile.kind === 'rail') {
    const owned = BOARD.filter((other) => other.kind === 'rail' && state.tiles[other.id].owner === tileState.owner).length;
    return 25 * 2 ** (owned - 1);
  }
  if (tile.kind === 'utility') {
    const owned = BOARD.filter((other) => other.kind === 'utility' && state.tiles[other.id].owner === tileState.owner).length;
    return diceTotal * (owned === 2 ? 10 : 4);
  }
  return 0;
}

export const mortgageValue = (tileId: number) => (BOARD[tileId].price ?? 0) / 2;
/** Redeeming a mortgage costs the loan plus 10% interest. */
export const unmortgageCost = (tileId: number) => Math.ceil(mortgageValue(tileId) * (1 + MORTGAGE_INTEREST));
/** Taking over a mortgaged deed in a trade costs the new owner the 10% interest at once. */
export const mortgageInterest = (tileId: number) => Math.ceil(mortgageValue(tileId) * MORTGAGE_INTEREST);

export function netWorth(state: MonopolyState, id: number) {
  const holder = player(state, id);
  if (holder.bankrupt) return 0;
  return state.tiles.reduce((total, tileState, index) => {
    if (tileState.owner !== id) return total;
    const tile = BOARD[index];
    const value = tileState.mortgaged ? (tile.price ?? 0) / 2 : tile.price ?? 0;
    return total + value + tileState.houses * (tile.houseCost ?? 0);
  }, holder.money);
}

function finish(state: MonopolyState, winner: number | null, line: string): MonopolyState {
  return log({ ...state, phase: 'finished', winner, auction: null, trade: null }, line);
}

/** Puts spent or surrendered jail cards back at the bottom of their decks. */
function returnJailCards(state: MonopolyState, cards: DeckName[]): MonopolyState {
  if (!cards.length || !state.decks) return state;
  const decks = { ...state.decks };
  for (const deck of cards) {
    if (!decks[deck].includes(JAIL_FREE_CARD[deck])) decks[deck] = [...decks[deck], JAIL_FREE_CARD[deck]];
  }
  return { ...state, decks };
}

/**
 * Pays `amount` from a player to a creditor (another player or the bank when null).
 * If cash runs out, houses are sold and property mortgaged automatically at half value.
 * A player who still cannot pay goes bankrupt; their assets go to the creditor or back to the bank.
 */
function pay(state: MonopolyState, from: number, amount: number, to: number | null, reason: string): MonopolyState {
  if (amount <= 0 || player(state, from).bankrupt) return state;
  let next = state;
  let debtor = player(next, from);
  if (debtor.money < amount) next = raiseCash(next, from, amount);
  debtor = player(next, from);
  if (debtor.money >= amount) {
    next = withPlayer(next, from, (value) => ({ ...value, money: value.money - amount }));
    if (to !== null) next = withPlayer(next, to, (value) => ({ ...value, money: value.money + amount }));
    return log(next, `${debtor.name} ${reason} ${money(amount)} төллөө.`);
  }
  // Bankrupt: give everything that is left to the creditor.
  const remaining = debtor.money;
  const cards = debtor.jailCards ?? [];
  next = withPlayer(next, from, (value) => ({ ...value, money: 0, bankrupt: true, inJail: false, jailCards: [] }));
  if (to !== null) next = withPlayer(next, to, (value) => ({ ...value, money: value.money + remaining, jailCards: [...(value.jailCards ?? []), ...cards] }));
  else next = returnJailCards(next, cards);
  next = {
    ...next,
    tiles: next.tiles.map((tileState) => tileState.owner === from
      ? to === null ? { owner: null, houses: 0, mortgaged: false } : { ...tileState, owner: to, houses: 0 }
      : tileState),
  };
  next = log(next, `${debtor.name} дампуурлаа${to !== null ? `. Хөрөнгө нь ${player(next, to).name}-д шилжив` : ''}.`);
  return checkWinner(next);
}

function raiseCash(state: MonopolyState, id: number, needed: number): MonopolyState {
  let next = state;
  // Sell buildings first, most-built tiles first, half price each. A ger camp the bank cannot
  // swap back for four houses is sold down to as many houses as the bank still has.
  for (;;) {
    if (player(next, id).money >= needed) return next;
    const built = next.tiles.map((value, index) => ({ value, index })).filter(({ value }) => value.owner === id && value.houses > 0).sort((left, right) => right.value.houses - left.value.houses)[0];
    if (!built) break;
    const level = built.value.houses;
    const lower = level === 5 ? Math.min(4, bankSupply(next).houses) : level - 1;
    const refund = (level - lower) * (BOARD[built.index].houseCost ?? 0) / 2;
    next = withTile(next, built.index, (value) => ({ ...value, houses: lower }));
    next = withPlayer(next, id, (value) => ({ ...value, money: value.money + refund }));
  }
  // Then mortgage the cheapest property.
  for (;;) {
    if (player(next, id).money >= needed) return next;
    const target = next.tiles.map((value, index) => ({ value, index })).filter(({ value }) => value.owner === id && !value.mortgaged).sort((left, right) => (BOARD[left.index].price ?? 0) - (BOARD[right.index].price ?? 0))[0];
    if (!target) break;
    next = withTile(next, target.index, (value) => ({ ...value, mortgaged: true }));
    next = withPlayer(next, id, (value) => ({ ...value, money: value.money + mortgageValue(target.index) }));
    next = log(next, `${player(next, id).name} ${BOARD[target.index].name}-г барьцаалав.`);
  }
  return next;
}

function checkWinner(state: MonopolyState): MonopolyState {
  if (state.phase === 'finished') return state;
  const active = state.players.filter((entry) => !entry.bankrupt);
  if (active.length === 1) return finish(state, active[0].id, `${active[0].name} ялагч боллоо!`);
  return state;
}

function finishByRounds(state: MonopolyState): MonopolyState {
  const ranked = state.players.filter((entry) => !entry.bankrupt).sort((left, right) => netWorth(state, right.id) - netWorth(state, left.id));
  const champion = ranked[0];
  return finish(state, champion?.id ?? null, `${MAX_ROUNDS} тойрог дууслаа. Хамгийн их хөрөнгөтэй ${champion?.name ?? ''} яллаа!`);
}

function sendToJail(state: MonopolyState, id: number): MonopolyState {
  const next = withPlayer(state, id, (value) => ({ ...value, position: JAIL_TILE, inJail: true, jailTries: 0 }));
  return log({ ...next, rollAgain: false, phase: 'end' }, `${player(state, id).name} шоронд орлоо.`);
}

function moveTo(state: MonopolyState, id: number, target: number, collectStart: boolean): MonopolyState {
  const mover = player(state, id);
  const passedStart = collectStart && target < mover.position;
  let next = withPlayer(state, id, (value) => ({ ...value, position: target, money: value.money + (passedStart ? PASS_START_BONUS : 0) }));
  if (passedStart) next = log(next, `${mover.name} Эхлэлийг давж ${money(PASS_START_BONUS)} авлаа.`);
  return next;
}

const settled = (state: MonopolyState): MonopolyState => ({ ...state, phase: state.phase === 'finished' ? 'finished' : 'end' });

function drawCard(state: MonopolyState, id: number, deckName: DeckName, random: RandomSource, diceTotal: number): MonopolyState {
  const decks = state.decks ?? freshDecks(state.players, random);
  const pile = decks[deckName];
  if (!pile.length) return { ...state, decks, phase: 'end' };
  const index = pile[0];
  const card = DECKS[deckName][index];
  const keep = card.effect.type === 'jail-free';
  let next: MonopolyState = log(
    { ...state, decks: { ...decks, [deckName]: keep ? pile.slice(1) : [...pile.slice(1), index] }, card: { title: card.title, text: card.text, deck: deckName } },
    `${player(state, id).name}: «${card.title}» — ${card.text}`,
  );
  const effect = card.effect;
  switch (effect.type) {
    case 'jail-free':
      return { ...withPlayer(next, id, (value) => ({ ...value, jailCards: [...(value.jailCards ?? []), deckName] })), phase: 'end' };
    case 'money':
      return effect.amount >= 0
        ? { ...withPlayer(next, id, (value) => ({ ...value, money: value.money + effect.amount })), phase: 'end' }
        : settled(pay(next, id, -effect.amount, null, 'картын дагуу'));
    case 'jail':
      return sendToJail(next, id);
    case 'collect-each':
      for (const other of next.players) {
        if (other.id === id || other.bankrupt) continue;
        next = pay(next, other.id, effect.amount, id, 'бэлэг');
      }
      return settled(next);
    case 'pay-each':
      for (const other of next.players) {
        if (other.id === id || other.bankrupt || player(next, id).bankrupt) continue;
        next = pay(next, id, effect.amount, other.id, `${other.name}-д`);
      }
      return settled(next);
    case 'repairs': {
      const owned = next.tiles.filter((tileState) => tileState.owner === id);
      const cost = owned.reduce((total, tileState) => total + (tileState.houses === 5 ? effect.perHotel : tileState.houses * effect.perHouse), 0);
      return settled(pay(next, id, cost, null, 'засварт'));
    }
    case 'nearest': {
      const position = player(next, id).position;
      let target = position;
      for (let step = 1; step <= BOARD.length; step += 1) {
        target = (position + step) % BOARD.length;
        if (BOARD[target].kind === effect.kind) break;
      }
      return land(moveTo(next, id, target, true), id, diceTotal, random, true);
    }
    case 'move-to':
    case 'move-by': {
      const position = player(next, id).position;
      const target = effect.type === 'move-to' ? effect.tile : (position + effect.steps + BOARD.length) % BOARD.length;
      return land(moveTo(next, id, target, effect.type === 'move-to'), id, diceTotal, random);
    }
  }
}

/** Resolves the tile the current player just landed on. `sentByCard` doubles rail rent and makes utilities 10× the dice. */
function land(state: MonopolyState, id: number, diceTotal: number, random: RandomSource, sentByCard = false): MonopolyState {
  const position = player(state, id).position;
  const tile = BOARD[position];
  const tileState = state.tiles[position];
  if (tile.kind === 'property' || tile.kind === 'rail' || tile.kind === 'utility') {
    if (tileState.owner === null) return { ...state, phase: 'buy' };
    if (tileState.owner !== id) {
      let rent = rentFor(state, position, diceTotal);
      if (rent > 0 && sentByCard) rent = tile.kind === 'utility' ? diceTotal * 10 : rent * 2;
      if (rent > 0) return settled(pay(state, id, rent, tileState.owner, `${player(state, tileState.owner).name}-д ${tile.name}-ийн түрээс`));
    }
    return { ...state, phase: 'end' };
  }
  if (tile.kind === 'tax') return settled(pay(state, id, tile.rent!, null, tile.name));
  if (tile.kind === 'chance') return drawCard(state, id, 'chance', random, diceTotal);
  if (tile.kind === 'chest') return drawCard(state, id, 'chest', random, diceTotal);
  if (tile.kind === 'gotojail') return sendToJail(state, id);
  return { ...state, phase: 'end' };
}

function nextTurn(state: MonopolyState): MonopolyState {
  if (state.phase === 'finished') return state;
  let turn = state.turn;
  let round = state.round;
  for (let step = 0; step < state.order.length; step += 1) {
    turn = (turn + 1) % state.order.length;
    if (turn === 0) round += 1;
    if (!player(state, state.order[turn]).bankrupt) break;
  }
  const reset = { auction: null, trade: null, offersThisTurn: 0 };
  if (round > MAX_ROUNDS) return finishByRounds({ ...state, ...reset, round: MAX_ROUNDS });
  const next = player(state, state.order[turn]);
  return log({ ...state, ...reset, turn, round, phase: 'roll', dice: null, doublesInRow: 0, rollAgain: false, card: null }, `${next.name}-ийн ээлж.`);
}

// ─── Building ──────────────────────────────────────────────────────────────────

function canBuildOn(state: MonopolyState, id: number, tileId: number): string {
  const tile = BOARD[tileId];
  const tileState = state.tiles[tileId];
  if (tile.kind !== 'property' || tileState.owner !== id) return 'Зөвхөн өөрийн газар дээр байшин барина.';
  if (!ownsGroup(state, id, tile.group!)) return 'Эхлээд нэг өнгийн бүх газрыг эзэмшинэ үү.';
  const group = GROUP_TILES[tile.group!];
  if (group.some((other) => state.tiles[other].mortgaged)) return 'Барьцаалсан газартай бүлэгт барих боломжгүй.';
  if (tileState.houses >= 5) return 'Энэ газар бүрэн баригдсан.';
  if (tileState.houses > Math.min(...group.map((other) => state.tiles[other].houses))) return 'Байшинг бүлгийн газруудад жигд барина.';
  const supply = bankSupply(state);
  if (tileState.houses === 4 && supply.hotels <= 0) return 'Банкинд жуулчны бааз дууссан.';
  if (tileState.houses < 4 && supply.houses <= 0) return 'Банкинд гэр дууссан.';
  if (player(state, id).money < tile.houseCost!) return 'Мөнгө хүрэлцэхгүй байна.';
  return '';
}

/** Why `id` may not act on their own deeds right now ('' when they may). */
function ownTurnProblem(state: MonopolyState, id: number): string {
  if (state.phase === 'finished') return 'Тоглоом дууссан.';
  if (state.trade) return 'Арилжааны хариуг хүлээж байна.';
  if (state.phase === 'auction') return 'Дуудлага худалдаа явагдаж байна.';
  if (currentPlayerId(state) !== id) return 'Таны ээлж биш байна.';
  return '';
}

export function canBuild(state: MonopolyState, id: number, tileId: number) {
  return ownTurnProblem(state, id) === '' && canBuildOn(state, id, tileId) === '';
}

// ─── Auction ───────────────────────────────────────────────────────────────────

export function minimumBid(auction: AuctionState) {
  return auction.highBid === 0 ? AUCTION_INCREMENT : auction.highBid + AUCTION_INCREMENT;
}

function startAuction(state: MonopolyState, tile: number): MonopolyState {
  // Everybody may bid, the player who turned the deed down included; they bid last.
  const bidders: number[] = [];
  for (let step = 1; step <= state.order.length; step += 1) {
    const id = state.order[(state.turn + step) % state.order.length];
    if (!player(state, id).bankrupt) bidders.push(id);
  }
  const next = log({ ...state, phase: 'auction', auction: { tile, bidders, turn: 0, highBid: 0, highBidder: null } }, `${BOARD[tile].name} дуудлага худалдаанд гарлаа.`);
  return settleAuction(next);
}

/**
 * Closes the auction once nobody is left to outbid the leader. Bidders who cannot afford the
 * next minimum bid could only pass, so they drop out without being asked.
 */
function settleAuction(state: MonopolyState): MonopolyState {
  let auction = state.auction!;
  for (let guard = 0; guard < 64; guard += 1) {
    const { bidders } = auction;
    if (!bidders.length || (bidders.length === 1 && bidders[0] === auction.highBidder)) return closeAuction(state, auction);
    const turn = auction.turn % bidders.length;
    const who = bidders[turn];
    if (who === auction.highBidder) { auction = { ...auction, turn: turn + 1 }; continue; }
    if (player(state, who).money < minimumBid(auction)) { auction = { ...auction, bidders: bidders.filter((_, index) => index !== turn), turn }; continue; }
    return { ...state, auction: { ...auction, turn } };
  }
  return closeAuction(state, auction);
}

function closeAuction(state: MonopolyState, auction: AuctionState): MonopolyState {
  const tile = BOARD[auction.tile];
  let next: MonopolyState = { ...state, auction: null, phase: 'end' };
  if (auction.highBidder === null || auction.highBid <= 0) return log(next, `${tile.name}-г хэн ч аваагүй.`);
  const winner = auction.highBidder;
  next = withPlayer(next, winner, (value) => ({ ...value, money: value.money - auction.highBid }));
  next = withTile(next, auction.tile, (value) => ({ ...value, owner: winner }));
  return log(next, `${player(next, winner).name} ${tile.name}-г дуудлага худалдаагаар ${money(auction.highBid)}-өөр авлаа.`);
}

/** Takes a bidder out of a running auction (they left the game); a bid they made no longer stands. */
function dropBidder(state: MonopolyState, id: number): MonopolyState {
  const auction = state.auction;
  if (!auction || state.phase !== 'auction') return state;
  const index = auction.bidders.indexOf(id);
  const lostLeader = auction.highBidder === id;
  if (index < 0 && !lostLeader) return state;
  const bidders = auction.bidders.filter((bidder) => bidder !== id);
  const turn = index >= 0 && index < auction.turn % Math.max(1, auction.bidders.length) ? auction.turn - 1 : auction.turn;
  return settleAuction({ ...state, auction: { ...auction, bidders, turn: Math.max(0, turn), highBid: lostLeader ? 0 : auction.highBid, highBidder: lostLeader ? null : auction.highBidder } });
}

// ─── Trading ───────────────────────────────────────────────────────────────────

/** A deed can change hands when nothing is built anywhere in its colour group. */
export function canTradeTile(state: MonopolyState, tileId: number) {
  const tile = BOARD[tileId];
  if (!tile || tile.price === undefined) return false;
  return !tile.group || GROUP_TILES[tile.group].every((other) => state.tiles[other].houses === 0);
}

/** Why an offer is not allowed ('' when it is). Checked when it is made and again when it is accepted. */
export function tradeProblem(state: MonopolyState, offer: TradeOffer): string {
  const from = state.players.find((entry) => entry.id === offer.from);
  const to = state.players.find((entry) => entry.id === offer.to);
  if (!from || !to || from.bankrupt || to.bankrupt) return 'Арилжаанд хоёр тал тоглоомд байх ёстой.';
  if (from.id === to.id) return 'Өөртэйгөө арилжаа хийх боломжгүй.';
  const counts = [offer.giveCash, offer.getCash, offer.giveCards, offer.getCards];
  if (counts.some((value) => !Number.isInteger(value) || value < 0)) return 'Арилжааны дүн буруу байна.';
  if (!offer.give.length && !offer.get.length && !counts.some((value) => value > 0)) return 'Санал хоосон байна.';
  if (from.money < offer.giveCash) return `${from.name}-д ${money(offer.giveCash)} алга.`;
  if (to.money < offer.getCash) return `${to.name}-д ${money(offer.getCash)} алга.`;
  if ((from.jailCards ?? []).length < offer.giveCards || (to.jailCards ?? []).length < offer.getCards) return 'Шоронгийн карт хүрэлцэхгүй байна.';
  const sides: Array<[MonopolyPlayer, number[]]> = [[from, offer.give], [to, offer.get]];
  for (const [owner, tiles] of sides) {
    if (new Set(tiles).size !== tiles.length) return 'Нэг газрыг давхар оруулсан байна.';
    for (const tileId of tiles) {
      const tile = BOARD[tileId];
      if (!tile || state.tiles[tileId].owner !== owner.id) return `${owner.name} ${tile?.name ?? 'энэ газар'}-г эзэмшдэггүй.`;
      if (!canTradeTile(state, tileId)) return `${tile.name}-ийн бүлэгт барилга байна. Эхлээд зарна уу.`;
    }
  }
  return '';
}

/** "Өлгий + 100₮" — what one side of an offer puts up. */
export function describeSide(tiles: number[], cash: number, cards: number) {
  const parts = tiles.map((tileId) => BOARD[tileId].name);
  if (cash > 0) parts.push(money(cash));
  if (cards > 0) parts.push(`${cards} шоронгийн карт`);
  return parts.length ? parts.join(' + ') : 'юу ч үгүй';
}

function executeTrade(state: MonopolyState, offer: TradeOffer): MonopolyState {
  const from = player(state, offer.from);
  const to = player(state, offer.to);
  let next: MonopolyState = { ...state, trade: null };
  const move = (tiles: number[], owner: number) => {
    for (const tileId of tiles) next = withTile(next, tileId, (value) => ({ ...value, owner }));
  };
  move(offer.give, to.id);
  move(offer.get, from.id);
  const net = offer.giveCash - offer.getCash;
  next = withPlayer(next, from.id, (value) => ({ ...value, money: value.money - net }));
  next = withPlayer(next, to.id, (value) => ({ ...value, money: value.money + net }));
  const fromCards = [...(from.jailCards ?? [])];
  const toCards = [...(to.jailCards ?? [])];
  const fromGives = fromCards.splice(fromCards.length - offer.giveCards, offer.giveCards);
  const toGives = toCards.splice(toCards.length - offer.getCards, offer.getCards);
  next = withPlayer(next, from.id, (value) => ({ ...value, jailCards: [...fromCards, ...toGives] }));
  next = withPlayer(next, to.id, (value) => ({ ...value, jailCards: [...toCards, ...fromGives] }));
  next = log(next, `${from.name} ⇄ ${to.name}: ${describeSide(offer.give, offer.giveCash, offer.giveCards)} ↔ ${describeSide(offer.get, offer.getCash, offer.getCards)}.`);
  // Whoever takes on a mortgaged deed pays the bank 10% interest on the loan straight away.
  for (const [receiver, tiles] of [[to.id, offer.give], [from.id, offer.get]] as Array<[number, number[]]>) {
    for (const tileId of tiles) {
      if (next.phase === 'finished') return next;
      if (state.tiles[tileId].mortgaged) next = pay(next, receiver, mortgageInterest(tileId), null, `${BOARD[tileId].name}-ийн барьцааны хүү`);
    }
  }
  return next;
}

// ─── Actions ───────────────────────────────────────────────────────────────────

/** Applies one player action. Returns an error message (Mongolian) instead of changing state when invalid. */
export function applyMonopolyAction(state: MonopolyState, actorId: number, action: MonopolyAction, random: RandomSource = Math.random): MonopolyResult {
  const result = applyAction(state, actorId, action, random);
  return result.error ? result : { state: skipBankruptTurn(result.state) };
}

/** A player who goes bankrupt on their own turn (rent, tax, a card) hands the turn on instead of freezing the game. */
function skipBankruptTurn(state: MonopolyState): MonopolyState {
  if (state.phase === 'finished' || state.phase === 'auction' || !player(state, currentPlayerId(state)).bankrupt) return state;
  return nextTurn({ ...state, phase: 'end', rollAgain: false });
}

function applyAction(state: MonopolyState, actorId: number, action: MonopolyAction, random: RandomSource): MonopolyResult {
  if (state.phase === 'finished') return { state, error: 'Тоглоом дууссан.' };
  const actor = state.players.find((entry) => entry.id === actorId);
  if (!actor || actor.bankrupt) return { state, error: 'Та энэ тоглоомд оролцохгүй байна.' };

  if (action.type === 'bid' || action.type === 'pass') {
    const auction = state.auction;
    if (state.phase !== 'auction' || !auction) return { state, error: 'Дуудлага худалдаа явагдаагүй байна.' };
    if (actingPlayerId(state) !== actorId) return { state, error: 'Таны үнэ хаях ээлж биш байна.' };
    const turn = auction.turn % auction.bidders.length;
    if (action.type === 'pass') {
      const next = { ...auction, bidders: auction.bidders.filter((_, index) => index !== turn), turn };
      return { state: settleAuction(log({ ...state, auction: next }, `${actor.name} өнжлөө.`)) };
    }
    const amount = Math.floor(Number(action.amount));
    if (!Number.isFinite(amount) || amount < minimumBid(auction)) return { state, error: `Хамгийн багадаа ${money(minimumBid(auction))} хаяна.` };
    if (amount > actor.money) return { state, error: 'Мөнгө хүрэлцэхгүй байна.' };
    const next = { ...auction, highBid: amount, highBidder: actorId, turn: turn + 1 };
    return { state: settleAuction(log({ ...state, auction: next }, `${actor.name} ${money(amount)} хаялаа.`)) };
  }

  if (action.type === 'accept' || action.type === 'reject' || action.type === 'cancel-trade') {
    const trade = state.trade;
    if (!trade) return { state, error: 'Хүлээгдэж буй арилжаа алга.' };
    if (action.type === 'cancel-trade') {
      if (trade.from !== actorId) return { state, error: 'Зөвхөн санал тавьсан хүн цуцална.' };
      return { state: log({ ...state, trade: null }, `${actor.name} арилжааны саналаа буцаалаа.`) };
    }
    if (trade.to !== actorId) return { state, error: 'Энэ санал танд ирээгүй.' };
    if (action.type === 'reject') return { state: log({ ...state, trade: null }, `${actor.name} арилжааны саналаас татгалзлаа.`) };
    const problem = tradeProblem(state, trade);
    if (problem) return { state: log({ ...state, trade: null }, `Арилжаа хүчингүй боллоо: ${problem}`) };
    return { state: executeTrade(state, trade) };
  }

  const problem = ownTurnProblem(state, actorId);
  if (problem) return { state, error: problem };

  switch (action.type) {
    case 'roll': {
      if (state.phase !== 'roll') return { state, error: 'Одоо шоо хаях боломжгүй.' };
      const dice: [number, number] = [1 + Math.min(5, Math.floor(random() * 6)), 1 + Math.min(5, Math.floor(random() * 6))];
      const total = dice[0] + dice[1];
      const doubles = dice[0] === dice[1];
      let next: MonopolyState = log({ ...state, dice, card: null }, `${actor.name} ${dice[0]} + ${dice[1]} буулгалаа.`);
      if (actor.inJail) {
        if (doubles) {
          next = withPlayer(next, actorId, (value) => ({ ...value, inJail: false, jailTries: 0 }));
          next = log(next, `${actor.name} хос буулгаж шоронгоос гарлаа.`);
        } else if (actor.jailTries >= JAIL_TERM - 1) {
          next = pay(next, actorId, JAIL_FINE, null, 'шоронгийн торгууль');
          if (next.phase === 'finished' || player(next, actorId).bankrupt) return { state: next.phase === 'finished' ? next : nextTurn(next) };
          next = withPlayer(next, actorId, (value) => ({ ...value, inJail: false, jailTries: 0 }));
        } else {
          next = withPlayer(next, actorId, (value) => ({ ...value, jailTries: value.jailTries + 1 }));
          return { state: { ...next, phase: 'end', rollAgain: false } };
        }
        next = moveTo(next, actorId, (player(next, actorId).position + total) % BOARD.length, true);
        return { state: { ...land(next, actorId, total, random), rollAgain: false } };
      }
      const doublesInRow = doubles ? state.doublesInRow + 1 : 0;
      if (doublesInRow >= 3) return { state: sendToJail({ ...next, doublesInRow: 0 }, actorId) };
      next = moveTo({ ...next, doublesInRow }, actorId, (actor.position + total) % BOARD.length, true);
      next = land(next, actorId, total, random);
      const stillHere = !player(next, actorId).bankrupt && !player(next, actorId).inJail;
      return { state: { ...next, rollAgain: doubles && stillHere && next.phase !== 'finished' } };
    }
    case 'buy': {
      if (state.phase !== 'buy') return { state, error: 'Одоо худалдаж авах боломжгүй.' };
      const tile = BOARD[actor.position];
      if (actor.money < tile.price!) return { state, error: 'Мөнгө хүрэлцэхгүй байна.' };
      let next = withPlayer(state, actorId, (value) => ({ ...value, money: value.money - tile.price! }));
      next = withTile(next, tile.id, (value) => ({ ...value, owner: actorId }));
      return { state: log({ ...next, phase: 'end' }, `${actor.name} ${tile.name}-г ${money(tile.price!)}-өөр худалдаж авлаа.`) };
    }
    case 'decline': {
      if (state.phase !== 'buy') return { state, error: 'Одоо алгасах зүйл алга.' };
      return { state: startAuction(log(state, `${actor.name} ${BOARD[actor.position].name}-г авсангүй.`), actor.position) };
    }
    case 'end': {
      if (state.phase === 'buy') return { state, error: 'Эхлээд газрыг авах эсвэл алгасна уу.' };
      if (state.phase === 'roll') return { state, error: 'Эхлээд шоо хаяна уу.' };
      if (state.rollAgain) return { state: log({ ...state, phase: 'roll', rollAgain: false, card: null }, `${actor.name} хос буулгасан тул дахин хаяна.`) };
      return { state: nextTurn(state) };
    }
    case 'pay-jail': {
      if (!actor.inJail || state.phase !== 'roll') return { state, error: 'Одоо торгууль төлөх шаардлагагүй.' };
      if (actor.money < JAIL_FINE) return { state, error: 'Мөнгө хүрэлцэхгүй байна.' };
      const next = withPlayer(state, actorId, (value) => ({ ...value, money: value.money - JAIL_FINE, inJail: false, jailTries: 0 }));
      return { state: log(next, `${actor.name} ${money(JAIL_FINE)} төлж шоронгоос гарлаа.`) };
    }
    case 'use-card': {
      const cards = actor.jailCards ?? [];
      if (!actor.inJail || state.phase !== 'roll') return { state, error: 'Одоо шоронгийн карт хэрэглэх шаардлагагүй.' };
      if (!cards.length) return { state, error: 'Танд шоронгоос гарах карт алга.' };
      const spent = cards[cards.length - 1];
      let next = withPlayer(state, actorId, (value) => ({ ...value, inJail: false, jailTries: 0, jailCards: cards.slice(0, -1) }));
      next = returnJailCards(next, [spent]);
      return { state: log(next, `${actor.name} «Өршөөл» картаар шоронгоос гарлаа.`) };
    }
    case 'build': {
      const reason = canBuildOn(state, actorId, action.tile);
      if (reason) return { state, error: reason };
      const tile = BOARD[action.tile];
      let next = withPlayer(state, actorId, (value) => ({ ...value, money: value.money - tile.houseCost! }));
      next = withTile(next, action.tile, (value) => ({ ...value, houses: value.houses + 1 }));
      const houses = next.tiles[action.tile].houses;
      return { state: log(next, `${actor.name} ${tile.name}-д ${houses === 5 ? 'жуулчны бааз' : `${houses}-р гэр`} барилаа.`) };
    }
    case 'sell': {
      const tile = BOARD[action.tile];
      const tileState = state.tiles[action.tile];
      if (!tile || tileState.owner !== actorId || tileState.houses === 0) return { state, error: 'Зарах байшин алга.' };
      const group = GROUP_TILES[tile.group!];
      if (tileState.houses < Math.max(...group.map((other) => state.tiles[other].houses))) return { state, error: 'Байшинг бүлгийн газруудаас жигд зарна.' };
      if (tileState.houses === 5 && bankSupply(state).houses < 4) return { state, error: 'Банкинд 4 гэр үлдээгүй тул баазыг гэр болгож задлах боломжгүй.' };
      let next = withTile(state, action.tile, (value) => ({ ...value, houses: value.houses - 1 }));
      next = withPlayer(next, actorId, (value) => ({ ...value, money: value.money + tile.houseCost! / 2 }));
      return { state: log(next, `${actor.name} ${tile.name}-ийн ${tileState.houses === 5 ? 'жуулчны баазыг' : 'нэг гэрийг'} заралаа.`) };
    }
    case 'mortgage': {
      const tile = BOARD[action.tile];
      const tileState = state.tiles[action.tile];
      if (!tile || tileState.owner !== actorId || tileState.mortgaged) return { state, error: 'Энэ газрыг барьцаалах боломжгүй.' };
      if (tile.group && GROUP_TILES[tile.group].some((other) => state.tiles[other].houses > 0)) return { state, error: 'Эхлээд бүлгийн байшингуудыг зарна уу.' };
      let next = withTile(state, action.tile, (value) => ({ ...value, mortgaged: true }));
      next = withPlayer(next, actorId, (value) => ({ ...value, money: value.money + mortgageValue(action.tile) }));
      return { state: log(next, `${actor.name} ${tile.name}-г барьцаалж ${money(mortgageValue(action.tile))} авлаа.`) };
    }
    case 'unmortgage': {
      const tile = BOARD[action.tile];
      const tileState = state.tiles[action.tile];
      if (!tile || tileState.owner !== actorId || !tileState.mortgaged) return { state, error: 'Энэ газар барьцаанд байхгүй.' };
      const cost = unmortgageCost(action.tile);
      if (actor.money < cost) return { state, error: 'Мөнгө хүрэлцэхгүй байна.' };
      let next = withTile(state, action.tile, (value) => ({ ...value, mortgaged: false }));
      next = withPlayer(next, actorId, (value) => ({ ...value, money: value.money - cost }));
      return { state: log(next, `${actor.name} ${tile.name}-г ${money(cost)} төлж барьцаанаас гаргалаа.`) };
    }
    case 'propose': {
      if (state.phase !== 'roll' && state.phase !== 'end') return { state, error: 'Арилжааг шоо хаяхаас өмнө эсвэл ээлжийн төгсгөлд санал болгоно.' };
      if ((state.offersThisTurn ?? 0) >= MAX_OFFERS_PER_TURN) return { state, error: `Нэг ээлжид ${MAX_OFFERS_PER_TURN}-аас олон санал тавих боломжгүй.` };
      const raw = action.offer;
      const offer: TradeOffer = {
        from: actorId, to: Number(raw?.to),
        give: Array.isArray(raw?.give) ? raw.give.map(Number) : [], get: Array.isArray(raw?.get) ? raw.get.map(Number) : [],
        giveCash: Number(raw?.giveCash ?? 0), getCash: Number(raw?.getCash ?? 0), giveCards: Number(raw?.giveCards ?? 0), getCards: Number(raw?.getCards ?? 0),
      };
      const reason = tradeProblem(state, offer);
      if (reason) return { state, error: reason };
      const next = withPlayer({ ...state, trade: offer, offersThisTurn: (state.offersThisTurn ?? 0) + 1 }, actorId, (value) => ({ ...value, lastOfferRound: state.round }));
      return { state: log(next, `${actor.name} ${player(state, offer.to).name}-д арилжааны санал тавилаа.`) };
    }
    default:
      return { state, error: 'Үйлдэл буруу байна.' };
  }
}

/** What happens when the acting player's timer runs out: roll, skip buying, pass a bid, turn down an offer, or end the turn. */
export function autoPlay(state: MonopolyState, random: RandomSource = Math.random): MonopolyState {
  if (state.phase === 'finished') return state;
  // Also unfreezes games saved before bankrupt turns were handed on.
  const unstuck = skipBankruptTurn(state);
  if (unstuck !== state) return unstuck;
  const actorId = actingPlayerId(state);
  const step: MonopolyAction = state.trade ? { type: 'reject' }
    : state.phase === 'auction' ? { type: 'pass' }
      : state.phase === 'roll' ? { type: 'roll' } : state.phase === 'buy' ? { type: 'decline' } : { type: 'end' };
  const result = applyMonopolyAction(state, actorId, step, random);
  // Never leave a timed-out game stuck, whatever shape a saved state is in.
  return result.error ? nextTurn({ ...state, phase: 'end', rollAgain: false, auction: null, trade: null }) : result.state;
}

/** A player who leaves goes bankrupt to the bank; the game continues without them. */
export function removeMonopolyPlayer(state: MonopolyState, id: number): MonopolyState {
  const leaver = state.players.find((entry) => entry.id === id);
  if (!leaver || leaver.bankrupt || state.phase === 'finished') return state;
  let next = withPlayer(state, id, (value) => ({ ...value, bankrupt: true, money: 0, inJail: false, jailCards: [] }));
  next = returnJailCards(next, leaver.jailCards ?? []);
  next = { ...next, tiles: next.tiles.map((tileState) => tileState.owner === id ? { owner: null, houses: 0, mortgaged: false } : tileState) };
  next = log(next, `${leaver.name} тоглоомоос гарлаа.`);
  if (next.trade && (next.trade.from === id || next.trade.to === id)) next = log({ ...next, trade: null }, 'Арилжааны санал цуцлагдлаа.');
  next = checkWinner(next);
  if (next.phase === 'auction') next = dropBidder(next, id);
  if (next.phase !== 'finished' && next.phase !== 'auction' && currentPlayerId(next) === id) next = nextTurn({ ...next, phase: 'end', rollAgain: false });
  return next;
}

export function runMonopolySelfTests() {
  const people = [
    { id: 1, name: 'Бат', initials: 'БА', color: 'rose' },
    { id: 2, name: 'Сараа', initials: 'СА', color: 'teal' },
    { id: 3, name: 'Тэмүүлэн', initials: 'ТЭ', color: 'gold' },
  ];
  const require = (condition: boolean, message: string) => { if (!condition) throw new Error(`Monopoly self-test failed: ${message}`); };
  const sequence = (values: number[]) => { let index = 0; return () => values[index++ % values.length]; };
  const dieValue = (face: number) => (face - 1) / 6 + 0.01;
  const act = (value: MonopolyState, id: number, action: MonopolyAction, random?: RandomSource) => {
    const result = applyMonopolyAction(value, id, action, random);
    if (result.error) throw new Error(`Monopoly self-test failed: unexpected error "${result.error}" for ${action.type}`);
    return result.state;
  };
  const own = (value: MonopolyState, owners: Record<number, number>, extra: Partial<TileState> = {}) => ({
    ...value, tiles: value.tiles.map((tileState, index) => owners[index] !== undefined ? { ...tileState, owner: owners[index], ...extra } : tileState),
  });

  require(BOARD.length === 32 && BOARD.every((tile, index) => tile.id === index), 'The board has 32 tiles in order.');
  require(Object.values(GROUP_TILES).every((tiles) => tiles.length >= 2), 'Every colour group has at least two tiles.');
  require(BOARD.every((tile) => tile.kind !== 'property' || (tile.rents?.length === 6 && tile.rents[0] === tile.rent)), 'Every property has a six-step rent ladder.');
  require(CHANCE.length === 16 && CHEST.length === 16 && JAIL_FREE_CARD.chance >= 0 && JAIL_FREE_CARD.chest >= 0, 'Both decks have 16 cards and a jail card.');

  let state = createMonopolyGame(people, () => 0.99);
  require(state.order.length === 3 && state.players.every((entry) => entry.money === START_MONEY), 'Players start with equal money.');
  require(state.decks!.chance.length === 16 && state.decks!.chest.length === 16, 'Both decks are dealt.');
  const first = currentPlayerId(state);
  require(Boolean(applyMonopolyAction(state, state.order[1], { type: 'roll' }).error), 'Only the current player may act.');

  // Roll 1+2 = 3 → Сайншанд, buy it.
  state = act(state, first, { type: 'roll' }, sequence([dieValue(1), dieValue(2)]));
  require(player(state, first).position === 3 && state.phase === 'buy', 'Landing on an unowned property offers it for sale.');
  state = act(state, first, { type: 'buy' });
  require(state.tiles[3].owner === first && player(state, first).money === START_MONEY - 60, 'Buying transfers ownership and money.');
  require(Boolean(applyMonopolyAction(state, first, { type: 'build', tile: 3 }).error), 'Cannot build without the whole colour group.');
  state = act(state, first, { type: 'end' });
  require(currentPlayerId(state) !== first && state.phase === 'roll', 'Ending the turn passes to the next player.');

  // Next player lands on Сайншанд and pays rent.
  const second = currentPlayerId(state);
  state = act(state, second, { type: 'roll' }, sequence([dieValue(1), dieValue(2)]));
  require(player(state, second).money === START_MONEY - 4 && player(state, first).money === START_MONEY - 60 + 4, 'Rent is paid to the owner.');

  // Group ownership doubles rent; building follows the rent ladder and must be even.
  state = createMonopolyGame(people, () => 0.99);
  const owner = currentPlayerId(state);
  state = own(state, { 1: owner, 3: owner });
  require(rentFor(state, 1, 7) === 8, 'Owning the whole group doubles base rent.');
  state = act(state, owner, { type: 'build', tile: 1 });
  require(state.tiles[1].houses === 1, 'A house can be built on a full group.');
  require(Boolean(applyMonopolyAction(state, owner, { type: 'build', tile: 1 }).error), 'Houses must be built evenly.');
  state = act(state, owner, { type: 'build', tile: 3 });
  require(rentFor(state, 3, 7) === BOARD[3].rents![1], 'Rent follows the ladder.');
  require(bankSupply(state).houses === MAX_HOUSES - 2, 'Built houses leave the bank.');

  // The bank's supply limits building.
  state = createMonopolyGame(people, () => 0.99);
  const builder = currentPlayerId(state);
  const rival = state.order[1];
  state = { ...state, tiles: state.tiles.map((tileState, index) => [17, 19, 20, 22, 25, 26, 28, 30].includes(index) ? { owner: rival, houses: 4, mortgaged: false } : index === 1 || index === 3 ? { owner: builder, houses: 0, mortgaged: false } : tileState) };
  require(bankSupply(state).houses === 0 && Boolean(applyMonopolyAction(state, builder, { type: 'build', tile: 1 }).error), 'No houses can be built once the bank runs out.');
  state = { ...state, tiles: state.tiles.map((tileState, index) => [6, 7, 9, 11, 12, 14, 17, 19, 20, 22, 25, 26].includes(index) ? { owner: rival, houses: 5, mortgaged: false } : index === 1 || index === 3 ? { owner: builder, houses: 4, mortgaged: false } : index === 28 || index === 30 ? { owner: null, houses: 0, mortgaged: false } : tileState) };
  require(bankSupply(state).hotels === 0 && Boolean(applyMonopolyAction(state, builder, { type: 'build', tile: 1 }).error), 'No ger camp can be built once the bank runs out.');

  // Declining starts an auction; a pass is final; the last bidder standing pays and takes the deed.
  state = createMonopolyGame(people, () => 0.99);
  const [p1, p2, p3] = state.order;
  state = act(state, p1, { type: 'roll' }, sequence([dieValue(1), dieValue(2)]));
  state = act(state, p1, { type: 'decline' });
  require(state.phase === 'auction' && actingPlayerId(state) === p2, 'Declining starts an auction with the next player.');
  require(Boolean(applyMonopolyAction(state, p3, { type: 'bid', amount: 20 }).error), 'Only the bidder whose turn it is may bid.');
  require(Boolean(applyMonopolyAction(state, p2, { type: 'bid', amount: 5 }).error), 'Bids below the minimum are refused.');
  state = act(state, p2, { type: 'bid', amount: 10 });
  state = act(state, p3, { type: 'bid', amount: 30 });
  state = act(state, p1, { type: 'pass' });
  require(actingPlayerId(state) === p2 && minimumBid(state.auction!) === 40, 'The auction goes round to the next bidder.');
  state = act(state, p2, { type: 'pass' });
  require(state.phase === 'end' && state.tiles[3].owner === p3 && player(state, p3).money === START_MONEY - 30, 'The highest bidder wins the auction.');
  require(currentPlayerId(state) === p1, 'The turn stays with the player who declined.');

  // Nobody bidding leaves the deed with the bank; timeouts pass for the bidder.
  state = createMonopolyGame(people, () => 0.99);
  state = act(state, state.order[0], { type: 'roll' }, sequence([dieValue(1), dieValue(2)]));
  for (let step = 0; step < 4 && state.phase !== 'end'; step += 1) state = autoPlay(state);
  require(state.phase === 'end' && state.tiles[3].owner === null, 'An auction where everyone passes leaves the deed unsold.');

  // Trading swaps deeds and cash; taking a mortgaged deed costs 10% interest.
  state = createMonopolyGame(people, () => 0.99);
  const [t1, t2] = state.order;
  state = own(state, { 1: t1, 3: t2 });
  state = own(state, { 6: t1 }, { mortgaged: true });
  state = act(state, t1, { type: 'propose', offer: { to: t2, give: [6], get: [3], giveCash: 50, getCash: 0, giveCards: 0, getCards: 0 } });
  require(actingPlayerId(state) === t2 && Boolean(applyMonopolyAction(state, t1, { type: 'roll' }).error), 'A pending offer pauses the turn for the partner.');
  state = act(state, t2, { type: 'accept' });
  require(state.tiles[3].owner === t1 && state.tiles[6].owner === t2 && state.tiles[6].mortgaged, 'Accepted trades move the deeds.');
  require(player(state, t1).money === START_MONEY - 50 && player(state, t2).money === START_MONEY + 50 - mortgageInterest(6), 'Cash moves and the mortgage interest is charged.');
  require(Boolean(applyMonopolyAction(state, t1, { type: 'propose', offer: { to: t2, give: [], get: [9], giveCash: 0, getCash: 0, giveCards: 0, getCards: 0 } }).error), 'You cannot ask for a deed the partner does not own.');
  state = own(state, { 1: t1, 3: t1 }, { houses: 1 });
  require(Boolean(applyMonopolyAction(state, t1, { type: 'propose', offer: { to: t2, give: [1], get: [], giveCash: 0, getCash: 0, giveCards: 0, getCards: 0 } }).error), 'Deeds in a built-up group cannot be traded.');
  state = act(state, t1, { type: 'propose', offer: { to: t2, give: [], get: [], giveCash: 10, getCash: 0, giveCards: 0, getCards: 0 } });
  state = act(state, t2, { type: 'reject' });
  require(!state.trade && player(state, t1).money === START_MONEY - 50, 'A rejected offer changes nothing.');

  // A "get out of jail free" card is kept, used, and goes back under its deck.
  state = createMonopolyGame(people, () => 0.99);
  const lucky = currentPlayerId(state);
  state = { ...state, decks: { ...state.decks!, chance: [JAIL_FREE_CARD.chance, ...state.decks!.chance.filter((index) => index !== JAIL_FREE_CARD.chance)] } };
  state = act(state, lucky, { type: 'roll' }, sequence([dieValue(1), dieValue(1)]));
  require(player(state, lucky).jailCards?.length === 1 && state.decks!.chance.length === 15, 'Drawing the jail card keeps it in hand.');
  state = withPlayer({ ...state, phase: 'roll', rollAgain: false }, lucky, (value) => ({ ...value, inJail: true, position: JAIL_TILE }));
  state = act(state, lucky, { type: 'use-card' });
  require(!player(state, lucky).inJail && player(state, lucky).jailCards?.length === 0 && state.decks!.chance[state.decks!.chance.length - 1] === JAIL_FREE_CARD.chance, 'Using the card frees the player and returns it to the deck.');

  // "Nearest railway" doubles the rent.
  state = createMonopolyGame(people, () => 0.99);
  const traveller = currentPlayerId(state);
  const landlord = state.order[1];
  state = own(state, { 5: landlord });
  state = { ...state, decks: { ...state.decks!, chance: [3, ...state.decks!.chance.filter((index) => index !== 3)] } };
  state = act(state, traveller, { type: 'roll' }, sequence([dieValue(1), dieValue(1)]));
  require(player(state, traveller).position === 5 && player(state, traveller).money === START_MONEY - 50, 'The nearest-railway card charges double rent.');

  // Three doubles in a row sends to jail; three missed jail rolls pay the fine.
  state = createMonopolyGame(people, () => 0.99);
  const roller = currentPlayerId(state);
  state = { ...state, doublesInRow: 2 };
  state = act(state, roller, { type: 'roll' }, sequence([dieValue(3), dieValue(3)]));
  require(player(state, roller).inJail && player(state, roller).position === JAIL_TILE, 'Third doubles in a row goes to jail.');
  state = withPlayer({ ...state, phase: 'roll' }, roller, (value) => ({ ...value, jailTries: JAIL_TERM - 1 }));
  state = act(state, roller, { type: 'roll' }, sequence([dieValue(1), dieValue(2)]));
  require(!player(state, roller).inJail && player(state, roller).position === JAIL_TILE + 3, 'The last jail roll pays the fine and moves on.');

  // Passing start pays the bonus.
  state = createMonopolyGame(people, () => 0.99);
  const passer = currentPlayerId(state);
  state = withPlayer(state, passer, (value) => ({ ...value, position: 30 }));
  state = act(state, passer, { type: 'roll' }, sequence([dieValue(1), dieValue(2)]));
  require(player(state, passer).position === 1 && player(state, passer).money === START_MONEY + PASS_START_BONUS, 'Passing start pays the bonus.');

  // Bankruptcy hands assets to the creditor and ends a two-player game.
  state = createMonopolyGame(people.slice(0, 2), () => 0.99);
  const [a, b] = state.order;
  state = { ...state, tiles: state.tiles.map((value, index) => index === 31 ? { owner: b, houses: 2, mortgaged: false } : index === 6 ? { owner: a, houses: 0, mortgaged: false } : value) };
  state = withPlayer(state, a, (value) => ({ ...value, money: 10, position: 29 }));
  state = act(state, a, { type: 'roll' }, sequence([dieValue(1), dieValue(1)]));
  require(player(state, a).bankrupt && state.phase === 'finished' && state.winner === b, 'A player who cannot pay goes bankrupt and the last player wins.');
  require(state.tiles[6].owner === b && state.tiles[6].mortgaged, 'Bankrupt assets (already mortgaged) go to the creditor.');
  require(player(state, b).money === START_MONEY + 60, 'The creditor receives all remaining cash.');

  // Timeouts never leave the game stuck.
  state = createMonopolyGame(people, () => 0.99);
  for (let step = 0; step < 600 && state.phase !== 'finished'; step += 1) state = autoPlay(state, Math.random);
  require(state.round <= MAX_ROUNDS, 'Automatic play keeps the round counter within the limit.');

  // Leaving players are removed cleanly, also in the middle of an auction or a trade.
  state = createMonopolyGame(people, () => 0.99);
  state = removeMonopolyPlayer(state, currentPlayerId(state));
  require(state.players.filter((entry) => entry.bankrupt).length === 1 && !player(state, currentPlayerId(state)).bankrupt, 'A leaver is removed and the turn moves on.');
  state = createMonopolyGame(people, () => 0.99);
  const [l1, l2, l3] = state.order;
  state = act(state, l1, { type: 'roll' }, sequence([dieValue(1), dieValue(2)]));
  state = act(state, l1, { type: 'decline' });
  state = act(state, l2, { type: 'bid', amount: 40 });
  state = removeMonopolyPlayer(state, l2);
  require(state.phase === 'auction' && state.auction!.highBid === 0 && actingPlayerId(state) === l3, "A leaver's bid no longer stands.");
  state = removeMonopolyPlayer(state, l1);
  require(state.phase === 'finished' && state.winner === l3, 'The last player left wins, even mid-auction.');

  return 'Monopoly self-tests passed.';
}
