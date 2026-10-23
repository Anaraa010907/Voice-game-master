/**
 * "Монгол Монополь" rules engine. Pure TypeScript with no imports so the server (Deno), the
 * browser and Node tests share it. Everything here is public information, so the server
 * publishes the whole state to every player.
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
};

export const BOARD: Tile[] = [
  { id: 0, kind: 'start', name: 'Эхлэл', short: 'ЭХЛЭЛ' },
  { id: 1, kind: 'property', name: 'Даланзадгад', short: 'Даланзадгад', region: 'Өмнөговь', group: 'brown', price: 60, rent: 4, houseCost: 50 },
  { id: 2, kind: 'chance', name: 'Хувь тавилан', short: 'Хувь' },
  { id: 3, kind: 'property', name: 'Сайншанд', short: 'Сайншанд', region: 'Дорноговь', group: 'brown', price: 60, rent: 4, houseCost: 50 },
  { id: 4, kind: 'tax', name: 'Орлогын татвар', short: 'Татвар', rent: 200 },
  { id: 5, kind: 'rail', name: 'Улаанбаатар өртөө', short: 'УБ өртөө', region: 'Төмөр зам', price: 200 },
  { id: 6, kind: 'property', name: 'Мөрөн', short: 'Мөрөн', region: 'Хөвсгөл', group: 'sky', price: 100, rent: 6, houseCost: 50 },
  { id: 7, kind: 'property', name: 'Улиастай', short: 'Улиастай', region: 'Завхан', group: 'sky', price: 120, rent: 8, houseCost: 50 },
  { id: 8, kind: 'jail', name: 'Шорон', short: 'ШОРОН' },
  { id: 9, kind: 'property', name: 'Өлгий', short: 'Өлгий', region: 'Баян-Өлгий', group: 'pink', price: 140, rent: 10, houseCost: 100 },
  { id: 10, kind: 'utility', name: 'Цахилгаан станц', short: 'Цахилгаан', region: 'Дулааны станц', price: 150 },
  { id: 11, kind: 'property', name: 'Ховд', short: 'Ховд', region: 'Ховд', group: 'pink', price: 160, rent: 12, houseCost: 100 },
  { id: 12, kind: 'property', name: 'Баянхонгор', short: 'Баянхонгор', region: 'Баянхонгор', group: 'orange', price: 180, rent: 14, houseCost: 100 },
  { id: 13, kind: 'rail', name: 'Чингис хаан нисэх буудал', short: 'Нисэх буудал', region: 'Агаарын зам', price: 200 },
  { id: 14, kind: 'property', name: 'Арвайхээр', short: 'Арвайхээр', region: 'Өвөрхангай', group: 'orange', price: 200, rent: 16, houseCost: 100 },
  { id: 15, kind: 'chest', name: 'Эрдэнэсийн авдар', short: 'Авдар' },
  { id: 16, kind: 'parking', name: 'Наадам', short: 'НААДАМ' },
  { id: 17, kind: 'property', name: 'Цэцэрлэг', short: 'Цэцэрлэг', region: 'Архангай', group: 'red', price: 220, rent: 18, houseCost: 150 },
  { id: 18, kind: 'chance', name: 'Хувь тавилан', short: 'Хувь' },
  { id: 19, kind: 'property', name: 'Хархорин', short: 'Хархорин', region: 'Өвөрхангай', group: 'red', price: 240, rent: 20, houseCost: 150 },
  { id: 20, kind: 'property', name: 'Хөвсгөл нуур', short: 'Хөвсгөл', region: 'Хөвсгөл', group: 'yellow', price: 260, rent: 22, houseCost: 150 },
  { id: 21, kind: 'rail', name: 'Замын-Үүд боомт', short: 'Замын-Үүд', region: 'Хилийн боомт', price: 200 },
  { id: 22, kind: 'property', name: 'Чойбалсан', short: 'Чойбалсан', region: 'Дорнод', group: 'yellow', price: 280, rent: 24, houseCost: 150 },
  { id: 23, kind: 'utility', name: 'Ус сувгийн компани', short: 'Ус суваг', region: 'УСУГ', price: 150 },
  { id: 24, kind: 'gotojail', name: 'Шоронд яв', short: 'ШОРОНД ЯВ' },
  { id: 25, kind: 'property', name: 'Дархан', short: 'Дархан', region: 'Дархан-Уул', group: 'green', price: 300, rent: 26, houseCost: 200 },
  { id: 26, kind: 'property', name: 'Эрдэнэт', short: 'Эрдэнэт', region: 'Орхон', group: 'green', price: 300, rent: 26, houseCost: 200 },
  { id: 27, kind: 'chest', name: 'Эрдэнэсийн авдар', short: 'Авдар' },
  { id: 28, kind: 'property', name: 'Тэрэлж', short: 'Тэрэлж', region: 'Төв', group: 'green', price: 320, rent: 28, houseCost: 200 },
  { id: 29, kind: 'tax', name: 'Тансгийн татвар', short: 'Тансаг', rent: 100 },
  { id: 30, kind: 'property', name: 'Зайсан', short: 'Зайсан', region: 'Улаанбаатар', group: 'navy', price: 350, rent: 35, houseCost: 200 },
  { id: 31, kind: 'property', name: 'Сүхбаатарын талбай', short: 'Сүхбаатар', region: 'Улаанбаатар', group: 'navy', price: 400, rent: 50, houseCost: 200 },
];

export const GROUP_TILES: Record<ColorGroup, number[]> = BOARD.reduce((groups, tile) => {
  if (tile.group) groups[tile.group] = [...(groups[tile.group] ?? []), tile.id];
  return groups;
}, {} as Record<ColorGroup, number[]>);

export const START_MONEY = 1500;
export const PASS_START_BONUS = 200;
export const JAIL_FINE = 50;
export const JAIL_TILE = 8;
export const MAX_ROUNDS = 20;
export const MIN_MONOPOLY_PLAYERS = 2;
/** Rent multipliers for 0–4 houses and a ger-camp "hotel" (5). */
export const HOUSE_RENT = [1, 5, 15, 40, 55, 70];

type Card = { title: string; text: string; effect: CardEffect };
type CardEffect =
  | { type: 'money'; amount: number }
  | { type: 'move-to'; tile: number }
  | { type: 'move-by'; steps: number }
  | { type: 'jail' }
  | { type: 'collect-each'; amount: number }
  | { type: 'repairs'; perHouse: number };

const CHANCE: Card[] = [
  { title: 'Наадмын бөх', text: 'Улсын наадамд түрүүллээ. 150₮ авна.', effect: { type: 'money', amount: 150 } },
  { title: 'Замын түгжрэл', text: 'Түгжрэлд орж 3 нүд ухарна.', effect: { type: 'move-by', steps: -3 } },
  { title: 'Шуурхай аялал', text: 'Эхлэл рүү шууд оч, 200₮ авна.', effect: { type: 'move-to', tile: 0 } },
  { title: 'Хурд хэтрүүлэв', text: 'Зам цагдаа баривчиллаа. Шоронд яв.', effect: { type: 'jail' } },
  { title: 'Хархорин аялал', text: 'Хархорин руу аялна. Эхлэлийг давбал 200₮.', effect: { type: 'move-to', tile: 19 } },
  { title: 'Торгууль', text: 'Хог хаясны торгууль 50₮ төлнө.', effect: { type: 'money', amount: -50 } },
  { title: 'Нисэх буудал', text: 'Чингис хаан нисэх буудал руу оч.', effect: { type: 'move-to', tile: 13 } },
  { title: 'Засвар', text: 'Байшин бүрийн засварт 25₮ төлнө.', effect: { type: 'repairs', perHouse: 25 } },
];

const CHEST: Card[] = [
  { title: 'Төрсөн өдөр', text: 'Тоглогч бүр танд 20₮ бэлэглэнэ.', effect: { type: 'collect-each', amount: 20 } },
  { title: 'Ноолуурын ашиг', text: 'Ноолуур зарж 100₮ олов.', effect: { type: 'money', amount: 100 } },
  { title: 'Эмнэлгийн төлбөр', text: 'Эмнэлэгт 100₮ төлнө.', effect: { type: 'money', amount: -100 } },
  { title: 'Хадгаламж', text: 'Хадгаламжийн хүү 50₮ авна.', effect: { type: 'money', amount: 50 } },
  { title: 'Мал төллөв', text: 'Сүрэг өсөж 120₮ орлого оров.', effect: { type: 'money', amount: 120 } },
  { title: 'Сургалтын төлбөр', text: 'Сургалтын төлбөр 80₮ төлнө.', effect: { type: 'money', amount: -80 } },
  { title: 'Эхлэл', text: 'Эхлэл рүү оч, 200₮ авна.', effect: { type: 'move-to', tile: 0 } },
  { title: 'Татварын буцаалт', text: 'Татварын буцаалт 60₮ авна.', effect: { type: 'money', amount: 60 } },
];

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
};

export type TileState = { owner: number | null; houses: number; mortgaged: boolean };
export type MonopolyPhase = 'roll' | 'buy' | 'end' | 'finished';

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
  card: { title: string; text: string } | null;
  log: string[];
  winner: number | null;
};

export type MonopolyAction =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'end' }
  | { type: 'pay-jail' }
  | { type: 'build'; tile: number }
  | { type: 'sell'; tile: number }
  | { type: 'mortgage'; tile: number }
  | { type: 'unmortgage'; tile: number };

export type MonopolyResult = { state: MonopolyState; error?: string };
export type RandomSource = () => number;

const money = (amount: number) => `${amount}₮`;

export function currentPlayerId(state: MonopolyState) {
  return state.order[state.turn];
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

export function createMonopolyGame(players: Array<Pick<MonopolyPlayer, 'id' | 'name' | 'initials' | 'color' | 'avatarUrl' | 'host' | 'bot'>>, random: RandomSource = Math.random): MonopolyState {
  const order = players.map((entry) => entry.id);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  const first = players.find((entry) => entry.id === order[0])!;
  return {
    kind: 'monopoly',
    phase: 'roll',
    round: 1,
    order,
    turn: 0,
    players: players.map((entry) => ({ ...entry, avatarUrl: entry.avatarUrl ?? null, money: START_MONEY, position: 0, inJail: false, jailTries: 0, bankrupt: false })),
    tiles: BOARD.map(() => ({ owner: null, houses: 0, mortgaged: false })),
    dice: null,
    doublesInRow: 0,
    rollAgain: false,
    card: null,
    log: [`Тоглоом эхэллээ. ${first.name} эхэлж шоо хаяна.`],
    winner: null,
  };
}

export function ownsGroup(state: MonopolyState, owner: number, group: ColorGroup) {
  return GROUP_TILES[group].every((tile) => state.tiles[tile].owner === owner);
}

export function rentFor(state: MonopolyState, tileId: number, diceTotal: number): number {
  const tile = BOARD[tileId];
  const tileState = state.tiles[tileId];
  if (tileState.owner === null || tileState.mortgaged) return 0;
  if (tile.kind === 'property') {
    if (tileState.houses > 0) return tile.rent! * HOUSE_RENT[tileState.houses];
    return ownsGroup(state, tileState.owner, tile.group!) ? tile.rent! * 2 : tile.rent!;
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

/**
 * Pays `amount` from a player to a creditor (another player or the bank when null).
 * If cash runs out, houses are sold and property mortgaged automatically at half value.
 * A player who still cannot pay goes bankrupt; their assets go to the creditor or back to the bank.
 */
function pay(state: MonopolyState, from: number, amount: number, to: number | null, reason: string): MonopolyState {
  if (amount <= 0) return state;
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
  next = withPlayer(next, from, (value) => ({ ...value, money: 0, bankrupt: true, inJail: false }));
  if (to !== null) next = withPlayer(next, to, (value) => ({ ...value, money: value.money + remaining }));
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
  // Sell houses first, most-built tiles first, half price each.
  for (;;) {
    if (player(next, id).money >= needed) return next;
    const built = next.tiles.map((value, index) => ({ value, index })).filter(({ value }) => value.owner === id && value.houses > 0).sort((left, right) => right.value.houses - left.value.houses)[0];
    if (!built) break;
    const refund = (BOARD[built.index].houseCost ?? 0) / 2;
    next = withTile(next, built.index, (value) => ({ ...value, houses: value.houses - 1 }));
    next = withPlayer(next, id, (value) => ({ ...value, money: value.money + refund }));
  }
  // Then mortgage the cheapest property.
  for (;;) {
    if (player(next, id).money >= needed) return next;
    const target = next.tiles.map((value, index) => ({ value, index })).filter(({ value }) => value.owner === id && !value.mortgaged).sort((left, right) => (BOARD[left.index].price ?? 0) - (BOARD[right.index].price ?? 0))[0];
    if (!target) break;
    next = withTile(next, target.index, (value) => ({ ...value, mortgaged: true }));
    next = withPlayer(next, id, (value) => ({ ...value, money: value.money + (BOARD[target.index].price ?? 0) / 2 }));
    next = log(next, `${player(next, id).name} ${BOARD[target.index].name}-г барьцаалав.`);
  }
  return next;
}

function checkWinner(state: MonopolyState): MonopolyState {
  const active = state.players.filter((entry) => !entry.bankrupt);
  if (active.length === 1) return log({ ...state, phase: 'finished', winner: active[0].id }, `${active[0].name} ялагч боллоо!`);
  return state;
}

function finishByRounds(state: MonopolyState): MonopolyState {
  const ranked = state.players.filter((entry) => !entry.bankrupt).sort((left, right) => netWorth(state, right.id) - netWorth(state, left.id));
  const champion = ranked[0];
  return log({ ...state, phase: 'finished', winner: champion?.id ?? null }, `${MAX_ROUNDS} тойрог дууслаа. Хамгийн их хөрөнгөтэй ${champion?.name ?? ''} яллаа!`);
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

function drawCard(state: MonopolyState, id: number, deck: Card[], random: RandomSource, diceTotal: number): MonopolyState {
  const card = deck[Math.min(deck.length - 1, Math.floor(random() * deck.length))];
  let next: MonopolyState = log({ ...state, card: { title: card.title, text: card.text } }, `${player(state, id).name}: «${card.title}» — ${card.text}`);
  const effect = card.effect;
  if (effect.type === 'money') {
    return effect.amount >= 0
      ? { ...withPlayer(next, id, (value) => ({ ...value, money: value.money + effect.amount })), phase: 'end' }
      : { ...pay(next, id, -effect.amount, null, 'картын дагуу'), phase: 'end' };
  }
  if (effect.type === 'jail') return sendToJail(next, id);
  if (effect.type === 'collect-each') {
    for (const other of next.players) {
      if (other.id === id || other.bankrupt) continue;
      next = pay(next, other.id, effect.amount, id, 'бэлэг');
    }
    return { ...next, phase: next.phase === 'finished' ? 'finished' : 'end' };
  }
  if (effect.type === 'repairs') {
    const houses = next.tiles.filter((tileState) => tileState.owner === id).reduce((total, tileState) => total + tileState.houses, 0);
    return { ...pay(next, id, houses * effect.perHouse, null, 'засварт'), phase: 'end' };
  }
  const position = player(next, id).position;
  const target = effect.type === 'move-to' ? effect.tile : (position + effect.steps + BOARD.length) % BOARD.length;
  next = moveTo(next, id, target, effect.type === 'move-to');
  return land(next, id, diceTotal, random);
}

/** Resolves the tile the current player just landed on. */
function land(state: MonopolyState, id: number, diceTotal: number, random: RandomSource): MonopolyState {
  const position = player(state, id).position;
  const tile = BOARD[position];
  const tileState = state.tiles[position];
  if (tile.kind === 'property' || tile.kind === 'rail' || tile.kind === 'utility') {
    if (tileState.owner === null) return { ...state, phase: 'buy' };
    if (tileState.owner !== id) {
      const rent = rentFor(state, position, diceTotal);
      if (rent > 0) {
        const next = pay(state, id, rent, tileState.owner, `${player(state, tileState.owner).name}-д ${tile.name}-ийн түрээс`);
        return { ...next, phase: next.phase === 'finished' ? 'finished' : 'end' };
      }
    }
    return { ...state, phase: 'end' };
  }
  if (tile.kind === 'tax') {
    const next = pay(state, id, tile.rent!, null, tile.name);
    return { ...next, phase: next.phase === 'finished' ? 'finished' : 'end' };
  }
  if (tile.kind === 'chance') return drawCard(state, id, CHANCE, random, diceTotal);
  if (tile.kind === 'chest') return drawCard(state, id, CHEST, random, diceTotal);
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
  if (round > MAX_ROUNDS) return finishByRounds({ ...state, round: MAX_ROUNDS });
  const next = player(state, state.order[turn]);
  return log({ ...state, turn, round, phase: 'roll', dice: null, doublesInRow: 0, rollAgain: false, card: null }, `${next.name}-ийн ээлж.`);
}

function canBuildOn(state: MonopolyState, id: number, tileId: number): string {
  const tile = BOARD[tileId];
  const tileState = state.tiles[tileId];
  if (tile.kind !== 'property' || tileState.owner !== id) return 'Зөвхөн өөрийн газар дээр байшин барина.';
  if (!ownsGroup(state, id, tile.group!)) return 'Эхлээд нэг өнгийн бүх газрыг эзэмшинэ үү.';
  const group = GROUP_TILES[tile.group!];
  if (group.some((other) => state.tiles[other].mortgaged)) return 'Барьцаалсан газартай бүлэгт барих боломжгүй.';
  if (tileState.houses >= 5) return 'Энэ газар бүрэн баригдсан.';
  if (tileState.houses > Math.min(...group.map((other) => state.tiles[other].houses))) return 'Байшинг бүлгийн газруудад жигд барина.';
  if (player(state, id).money < tile.houseCost!) return 'Мөнгө хүрэлцэхгүй байна.';
  return '';
}

export function canBuild(state: MonopolyState, id: number, tileId: number) {
  return state.phase !== 'finished' && currentPlayerId(state) === id && canBuildOn(state, id, tileId) === '';
}

/** Applies one player action. Returns an error message (Mongolian) instead of changing state when invalid. */
export function applyMonopolyAction(state: MonopolyState, actorId: number, action: MonopolyAction, random: RandomSource = Math.random): MonopolyResult {
  const result = applyAction(state, actorId, action, random);
  return result.error ? result : { state: skipBankruptTurn(result.state) };
}

/** A player who goes bankrupt on their own turn (rent, tax, a card) hands the turn on instead of freezing the game. */
function skipBankruptTurn(state: MonopolyState): MonopolyState {
  if (state.phase === 'finished' || !player(state, currentPlayerId(state)).bankrupt) return state;
  return nextTurn({ ...state, phase: 'end', rollAgain: false });
}

function applyAction(state: MonopolyState, actorId: number, action: MonopolyAction, random: RandomSource): MonopolyResult {
  if (state.phase === 'finished') return { state, error: 'Тоглоом дууссан.' };
  const actor = state.players.find((entry) => entry.id === actorId);
  if (!actor || actor.bankrupt) return { state, error: 'Та энэ тоглоомд оролцохгүй байна.' };
  if (currentPlayerId(state) !== actorId) return { state, error: 'Таны ээлж биш байна.' };

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
        } else if (actor.jailTries >= 2) {
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
      return { state: log({ ...state, phase: 'end' }, `${actor.name} ${BOARD[actor.position].name}-г авсангүй.`) };
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
      if (tileState.owner !== actorId || tileState.houses === 0) return { state, error: 'Зарах байшин алга.' };
      const group = GROUP_TILES[tile.group!];
      if (tileState.houses < Math.max(...group.map((other) => state.tiles[other].houses))) return { state, error: 'Байшинг бүлгийн газруудаас жигд зарна.' };
      let next = withTile(state, action.tile, (value) => ({ ...value, houses: value.houses - 1 }));
      next = withPlayer(next, actorId, (value) => ({ ...value, money: value.money + tile.houseCost! / 2 }));
      return { state: log(next, `${actor.name} ${tile.name}-ийн нэг байшинг заралаа.`) };
    }
    case 'mortgage': {
      const tile = BOARD[action.tile];
      const tileState = state.tiles[action.tile];
      if (tileState.owner !== actorId || tileState.mortgaged) return { state, error: 'Энэ газрыг барьцаалах боломжгүй.' };
      if (tile.group && GROUP_TILES[tile.group].some((other) => state.tiles[other].houses > 0)) return { state, error: 'Эхлээд бүлгийн байшингуудыг зарна уу.' };
      let next = withTile(state, action.tile, (value) => ({ ...value, mortgaged: true }));
      next = withPlayer(next, actorId, (value) => ({ ...value, money: value.money + tile.price! / 2 }));
      return { state: log(next, `${actor.name} ${tile.name}-г барьцаалж ${money(tile.price! / 2)} авлаа.`) };
    }
    case 'unmortgage': {
      const tile = BOARD[action.tile];
      const tileState = state.tiles[action.tile];
      const cost = Math.ceil(tile.price! * 0.55);
      if (tileState.owner !== actorId || !tileState.mortgaged) return { state, error: 'Энэ газар барьцаанд байхгүй.' };
      if (actor.money < cost) return { state, error: 'Мөнгө хүрэлцэхгүй байна.' };
      let next = withTile(state, action.tile, (value) => ({ ...value, mortgaged: false }));
      next = withPlayer(next, actorId, (value) => ({ ...value, money: value.money - cost }));
      return { state: log(next, `${actor.name} ${tile.name}-г ${money(cost)} төлж барьцаанаас гаргалаа.`) };
    }
    default:
      return { state, error: 'Үйлдэл буруу байна.' };
  }
}

/** What happens when the current player's timer runs out: roll, skip buying, or end the turn. */
export function autoPlay(state: MonopolyState, random: RandomSource = Math.random): MonopolyState {
  if (state.phase === 'finished') return state;
  // Also unfreezes games saved before bankrupt turns were handed on.
  const unstuck = skipBankruptTurn(state);
  if (unstuck !== state) return unstuck;
  const actorId = currentPlayerId(state);
  const step: MonopolyAction = state.phase === 'roll' ? { type: 'roll' } : state.phase === 'buy' ? { type: 'decline' } : { type: 'end' };
  return applyMonopolyAction(state, actorId, step, random).state;
}

/** A player who leaves goes bankrupt to the bank; the game continues without them. */
export function removeMonopolyPlayer(state: MonopolyState, id: number): MonopolyState {
  const leaver = state.players.find((entry) => entry.id === id);
  if (!leaver || leaver.bankrupt || state.phase === 'finished') return state;
  let next = withPlayer(state, id, (value) => ({ ...value, bankrupt: true, money: 0, inJail: false }));
  next = { ...next, tiles: next.tiles.map((tileState) => tileState.owner === id ? { owner: null, houses: 0, mortgaged: false } : tileState) };
  next = log(next, `${leaver.name} тоглоомоос гарлаа.`);
  next = checkWinner(next);
  if (next.phase !== 'finished' && currentPlayerId(next) === id) next = nextTurn({ ...next, phase: 'end', rollAgain: false });
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

  require(BOARD.length === 32 && BOARD.every((tile, index) => tile.id === index), 'The board has 32 tiles in order.');
  require(Object.values(GROUP_TILES).every((tiles) => tiles.length >= 2), 'Every colour group has at least two tiles.');

  let state = createMonopolyGame(people, () => 0.99);
  require(state.order.length === 3 && state.players.every((entry) => entry.money === START_MONEY), 'Players start with equal money.');
  const first = currentPlayerId(state);
  require(Boolean(applyMonopolyAction(state, state.order[1], { type: 'roll' }).error), 'Only the current player may act.');

  // Roll 1+2 = 3 → Сайншанд, buy it.
  let result = applyMonopolyAction(state, first, { type: 'roll' }, sequence([dieValue(1), dieValue(2)]));
  state = result.state;
  require(player(state, first).position === 3 && state.phase === 'buy', 'Landing on an unowned property offers it for sale.');
  state = applyMonopolyAction(state, first, { type: 'buy' }).state;
  require(state.tiles[3].owner === first && player(state, first).money === START_MONEY - 60, 'Buying transfers ownership and money.');
  require(Boolean(applyMonopolyAction(state, first, { type: 'build', tile: 3 }).error), 'Cannot build without the whole colour group.');
  state = applyMonopolyAction(state, first, { type: 'end' }).state;
  require(currentPlayerId(state) !== first && state.phase === 'roll', 'Ending the turn passes to the next player.');

  // Next player lands on Сайншанд and pays rent.
  const second = currentPlayerId(state);
  state = applyMonopolyAction(state, second, { type: 'roll' }, sequence([dieValue(1), dieValue(2)])).state;
  require(player(state, second).money === START_MONEY - 4 && player(state, first).money === START_MONEY - 60 + 4, 'Rent is paid to the owner.');

  // Group ownership doubles rent and allows even building.
  state = createMonopolyGame(people, () => 0.99);
  const owner = currentPlayerId(state);
  state = { ...state, tiles: state.tiles.map((value, index) => index === 1 || index === 3 ? { ...value, owner } : value) };
  require(rentFor(state, 1, 7) === 8, 'Owning the whole group doubles base rent.');
  state = applyMonopolyAction(state, owner, { type: 'build', tile: 1 }).state;
  require(state.tiles[1].houses === 1, 'A house can be built on a full group.');
  require(Boolean(applyMonopolyAction(state, owner, { type: 'build', tile: 1 }).error), 'Houses must be built evenly.');
  state = applyMonopolyAction(state, owner, { type: 'build', tile: 3 }).state;
  require(rentFor(state, 3, 7) === 4 * HOUSE_RENT[1], 'Rent grows with houses.');

  // Three doubles in a row sends to jail.
  state = createMonopolyGame(people, () => 0.99);
  const roller = currentPlayerId(state);
  state = { ...state, doublesInRow: 2 };
  state = applyMonopolyAction(state, roller, { type: 'roll' }, sequence([dieValue(3), dieValue(3)])).state;
  require(player(state, roller).inJail && player(state, roller).position === JAIL_TILE, 'Third doubles in a row goes to jail.');

  // Passing start pays the bonus.
  state = createMonopolyGame(people, () => 0.99);
  const passer = currentPlayerId(state);
  state = withPlayer(state, passer, (value) => ({ ...value, position: 30 }));
  state = applyMonopolyAction(state, passer, { type: 'roll' }, sequence([dieValue(1), dieValue(2)])).state;
  require(player(state, passer).position === 1 && player(state, passer).money === START_MONEY + PASS_START_BONUS, 'Passing start pays the bonus.');

  // Bankruptcy hands assets to the creditor and ends a two-player game.
  state = createMonopolyGame(people.slice(0, 2), () => 0.99);
  const [a, b] = state.order;
  state = { ...state, tiles: state.tiles.map((value, index) => index === 31 ? { owner: b, houses: 2, mortgaged: false } : index === 6 ? { owner: a, houses: 0, mortgaged: false } : value) };
  state = withPlayer(state, a, (value) => ({ ...value, money: 10, position: 29 }));
  state = applyMonopolyAction(state, a, { type: 'roll' }, sequence([dieValue(1), dieValue(1)])).state;
  require(player(state, a).bankrupt && state.phase === 'finished' && state.winner === b, 'A player who cannot pay goes bankrupt and the last player wins.');
  require(state.tiles[6].owner === b && state.tiles[6].mortgaged, 'Bankrupt assets (already mortgaged) go to the creditor.');
  require(player(state, b).money === START_MONEY + 60, 'The creditor receives all remaining cash.');

  // Timeouts never leave the game stuck.
  state = createMonopolyGame(people, () => 0.99);
  for (let step = 0; step < 300 && state.phase !== 'finished'; step += 1) state = autoPlay(state, Math.random);
  require(state.round <= MAX_ROUNDS, 'Automatic play keeps the round counter within the limit.');

  // Leaving players are removed cleanly.
  state = createMonopolyGame(people, () => 0.99);
  state = removeMonopolyPlayer(state, currentPlayerId(state));
  require(state.players.filter((entry) => entry.bankrupt).length === 1 && !player(state, currentPlayerId(state)).bankrupt, 'A leaver is removed and the turn moves on.');

  return 'Monopoly self-tests passed.';
}
