/*
 * English for Mongol Monopoly. The rules (shared with the server) name squares and cards and write the
 * play-by-play in Mongolian; in English mode these helpers give the English names, card texts and feed.
 */
import { BOARD, CHANCE, CHEST, type Tile } from './monopolyEngine';
import { isEnglish } from './lang';
import { addServerTranslator, serverMessageInEnglish } from './serverText';

const SH = '­'; // soft hyphen for narrow squares

/** [name, short label, region] by square id. */
const TILE_EN: Record<number, [string, string, string?]> = {
  0: ['Start', 'START'],
  1: ['Sainshand', `Sain${SH}shand`, 'Dornogovi'],
  2: ['Treasure Chest', 'Chest'],
  3: ['Dalanzadgad', `Dalan${SH}zadgad`, 'Umnugovi'],
  4: ['Income Tax', 'Income Tax'],
  5: ['Chinggis Khaan Airport', 'Airport', 'Airways'],
  6: ['Ulaangom', `Ulaan${SH}gom`, 'Uvs'],
  7: ['Fortune', 'Fortune'],
  8: ['Murun', 'Murun', 'Khuvsgul'],
  9: ['Uliastai', `Uliass${SH}tai`, 'Zavkhan'],
  10: ['Jail', 'JAIL'],
  11: ['Ulgii', 'Ulgii', 'Bayan-Ulgii'],
  12: ['Power Plant', `Power${SH}plant`, 'Thermal power'],
  13: ['Khovd', 'Khovd', 'Khovd'],
  14: ['Altai', 'Altai', 'Govi-Altai'],
  15: ['Ulaanbaatar Station', 'UB Station', 'Railway'],
  16: ['Bayankhongor', `Bayan${SH}khongor`, 'Bayankhongor'],
  17: ['Treasure Chest', 'Chest'],
  18: ['Arvaikheer', `Arvai${SH}kheer`, 'Uvurkhangai'],
  19: ['Tsetserleg', `Tsetser${SH}leg`, 'Arkhangai'],
  20: ['Naadam Holiday', 'NAADAM'],
  21: ['Undurkhaan', `Undur${SH}khaan`, 'Khentii'],
  22: ['Fortune', 'Fortune'],
  23: ['Dadal', 'Dadal', 'Khentii'],
  24: ['Kharkhorin', `Khar${SH}khorin`, 'Uvurkhangai'],
  25: ['Zamyn-Uud Port', 'Zamyn-Uud', 'Border port'],
  26: ['Choibalsan', `Choi${SH}balsan`, 'Dornod'],
  27: ['Baruun-Urt', 'Baruun-Urt', 'Sukhbaatar'],
  28: ['Water Works', 'Water Works', 'Water utility'],
  29: ['Khalkhin Gol', 'Khalkhin Gol', 'Dornod'],
  30: ['Go to Jail', 'GO TO JAIL'],
  31: ['Darkhan', 'Darkhan', 'Darkhan-Uul'],
  32: ['Erdenet', 'Erdenet', 'Orkhon'],
  33: ['Treasure Chest', 'Chest'],
  34: ['Oyu Tolgoi', 'Oyu Tolgoi', 'Umnugovi'],
  35: ['Altanbulag Port', `Altan${SH}bulag`, 'Border port'],
  36: ['Fortune', 'Fortune'],
  37: ['Zaisan', 'Zaisan', 'Ulaanbaatar'],
  38: ['Luxury Tax', 'Luxury Tax'],
  39: ['Sukhbaatar Square', 'Sukhbaatar Square', 'Ulaanbaatar'],
};

export const tileName = (tile: Tile) => (isEnglish ? TILE_EN[tile.id]?.[0] ?? tile.name : tile.name);
export const tileShort = (tile: Tile) => (isEnglish ? TILE_EN[tile.id]?.[1] ?? tile.short : tile.short);
export const tileRegion = (tile: Tile) => (isEnglish ? TILE_EN[tile.id]?.[2] ?? tile.region : tile.region);

/** Square names Mongolian → English, longest first so "Ulaanbaatar Station" wins over shorter names. */
const NAME_EN = new Map(BOARD.map((tile) => [tile.name, TILE_EN[tile.id]?.[0] ?? tile.name]));
const enTile = (name: string) => NAME_EN.get(name) ?? name;

const JAIL_FREE_EN = 'Get out of jail free. Keep it until you need it, or trade it.';
/** Card texts by Mongolian title: [English title, English text]. */
const CARD_EN: Record<string, [string, string]> = {
  'Шуурхай аялал': ['Express trip', 'Go straight to Start and collect 200₮.'],
  'Хархорин аялал': ['Trip to Kharkhorin', 'Go to Kharkhorin. Collect 200₮ if you pass Start.'],
  'Бүргэдийн баяр': ['Eagle Festival', 'Go to the eagle festival in Ulgii. Collect 200₮ if you pass Start.'],
  'Аялал': ['Journey', 'Go to the nearest airport, station or port. If it is owned, pay double rent.'],
  'Ашиглалтын газар': ['Utilities', 'Go to the nearest power plant or water works. If it is owned, pay ten times the dice.'],
  'Ногдол ашиг': ['Dividend', 'The bank pays you a 50₮ dividend.'],
  'Өршөөл': ['Pardon', JAIL_FREE_EN],
  'Замын түгжрэл': ['Traffic jam', 'Stuck in traffic: go back 3 squares.'],
  'Хурд хэтрүүлэв': ['Speeding', 'The traffic police caught you. Go straight to jail.'],
  'Ерөнхий засвар': ['General repairs', 'Pay 25₮ for each ger and 100₮ for each ger camp.'],
  'Торгууль': ['Fine', 'Pay a 15₮ littering fine.'],
  'Нисэх буудал': ['Airport', 'Go to Chinggis Khaan Airport. Collect 200₮ if you pass Start.'],
  'Нийслэлд': ['To the capital', 'Go to Sukhbaatar Square.'],
  'Хурлын дарга': ['Chairperson', 'You were elected chairperson. Pay each player 50₮.'],
  'Наадмын бөх': ['Naadam wrestler', 'You won the national Naadam: collect 150₮.'],
  'Шатрын тэмцээн': ['Chess tournament', 'You won the chess tournament: collect 100₮.'],
  'Эхлэл': ['Start', 'Go to Start and collect 200₮.'],
  'Банкны алдаа': ['Bank error', 'A bank error in your favour: collect 200₮.'],
  'Эмчийн үзлэг': ['Doctor’s visit', 'Pay 50₮ for a check-up.'],
  'Ноолуурын ашиг': ['Cashmere profit', 'You sold cashmere and earned 50₮.'],
  'Шоронд яв': ['Go to jail', 'Tax dodging uncovered. Go straight to jail.'],
  'Цагаан сар': ['Tsagaan Sar', 'Lunar New Year greetings: every player gives you 50₮.'],
  'Мал төллөв': ['Lambing season', 'Your herd grew: collect 100₮.'],
  'Татварын буцаалт': ['Tax refund', 'Collect a 20₮ tax refund.'],
  'Төрсөн өдөр': ['Birthday', 'Happy birthday! Every player gives you 10₮.'],
  'Даатгал': ['Insurance', 'Your policy matured: collect 100₮.'],
  'Эмнэлгийн төлбөр': ['Hospital bill', 'Pay 100₮ to the hospital.'],
  'Сургалтын төлбөр': ['School fees', 'Pay 150₮ in school fees.'],
  'Зөвлөх үйлчилгээ': ['Consulting fee', 'Collect 25₮ for your advice.'],
  'Гудамжны засвар': ['Street repairs', 'Pay 40₮ for each ger and 115₮ for each ger camp.'],
  'Өв залгамжлал': ['Inheritance', 'You inherit 100₮.'],
};
// Every card must have its English text.
for (const card of [...CHANCE, ...CHEST]) if (!CARD_EN[card.title]) console.warn('No English for card', card.title);

export function cardText(card: { title: string; text: string }) {
  const en = isEnglish ? CARD_EN[card.title] : undefined;
  return en ? { title: en[0], text: en[1] } : { title: card.title, text: card.text };
}

/** "Ulgii + 100₮" — one side of a trade offer. */
export function describeSideText(tiles: number[], cash: number, cards: number, fallback: string) {
  if (!isEnglish) return fallback;
  const parts = tiles.map((tileId) => TILE_EN[tileId]?.[0] ?? BOARD[tileId].name);
  if (cash > 0) parts.push(`${cash}₮`);
  if (cards > 0) parts.push(`${cards} jail card${cards > 1 ? 's' : ''}`);
  return parts.length ? parts.join(' + ') : 'nothing';
}

/** Why a payment was made, from the rules' Mongolian reason. */
function payReason(reason: string, amount: string) {
  if (reason === 'картын дагуу') return ` paid ${amount} (card).`;
  if (reason === 'бэлэг') return ` paid a ${amount} gift.`;
  if (reason === 'засварт') return ` paid ${amount} for repairs.`;
  if (reason === 'шоронгийн торгууль') return ` paid a ${amount} jail fine.`;
  let match = reason.match(/^(.+)-д (.+)-ийн түрээс$/);
  if (match) return ` paid ${amount} rent to ${match[1]} for ${enTile(match[2])}.`;
  match = reason.match(/^(.+)-ийн барьцааны хүү$/);
  if (match) return ` paid ${amount} mortgage interest on ${enTile(match[1])}.`;
  match = reason.match(/^(.+)-д$/);
  if (match) return ` paid ${amount} to ${match[1]}.`;
  if (NAME_EN.has(reason)) return ` paid ${amount} ${enTile(reason)}.`;
  return ` paid ${amount} (${reason}).`;
}

/** The part after a player's name, Mongolian → English. */
const AFTER_NAME: Array<[RegExp, (...groups: string[]) => string]> = [
  [/^ (.+) (\d+₮) төллөө\.$/, (reason, amount) => payReason(reason, amount)],
  [/^ дампуурлаа\. Хөрөнгө нь (.+)-д шилжив\.$/, (heir) => ` went bankrupt. Their property goes to ${heir}.`],
  [/^ дампуурлаа\.$/, () => ' went bankrupt.'],
  [/^ (.+)-г барьцаалав\.$/, (tile) => ` mortgaged ${enTile(tile)}.`],
  [/^ ялагч боллоо!$/, () => ' is the winner!'],
  [/^ шоронд орлоо\.$/, () => ' went to jail.'],
  [/^ Эхлэлийг давж (\d+₮) авлаа\.$/, (amount) => ` passed Start and collected ${amount}.`],
  [/^: «(.+?)» — (.+)$/, (title, text) => { const card = cardText({ title, text }); return `: “${card.title}” — ${card.text}`; }],
  [/^ Наадмын санг авч (\d+₮) оллоо!$/, (amount) => ` took the Naadam pot: ${amount}!`],
  [/^-ийн ээлж\.$/, () => '’s turn.'],
  [/^ (.+)-г дуудлага худалдаагаар (\d+₮)-өөр авлаа\.$/, (tile, amount) => ` won ${enTile(tile)} at auction for ${amount}.`],
  [/^ өнжлөө\.$/, () => ' passed.'],
  [/^ (\d+₮) хаялаа\.$/, (amount) => ` bid ${amount}.`],
  [/^ арилжааны саналаа буцаалаа\.$/, () => ' withdrew their trade offer.'],
  [/^ арилжааны саналаас татгалзлаа\.$/, () => ' declined the trade offer.'],
  [/^ (\d) \+ (\d) буулгалаа\.$/, (first, second) => ` rolled ${first} + ${second}.`],
  [/^ хос буулгаж шоронгоос гарлаа\.$/, () => ' rolled doubles and got out of jail.'],
  [/^ (.+)-г (\d+₮)-өөр худалдаж авлаа\.$/, (tile, amount) => ` bought ${enTile(tile)} for ${amount}.`],
  [/^ (.+)-г авсангүй\.$/, (tile) => ` passed on ${enTile(tile)}.`],
  [/^ хос буулгасан тул дахин хаяна\.$/, () => ' rolled doubles and rolls again.'],
  [/^ (\d+₮) төлж шоронгоос гарлаа\.$/, (amount) => ` paid ${amount} and got out of jail.`],
  [/^ «Өршөөл» картаар шоронгоос гарлаа\.$/, () => ' used a “Pardon” card to get out of jail.'],
  [/^ (.+)-д жуулчны бааз барилаа\.$/, (tile) => ` built a ger camp on ${enTile(tile)}.`],
  [/^ (.+)-д (\d)-р гэр барилаа\.$/, (tile, count) => ` built ger #${count} on ${enTile(tile)}.`],
  [/^ (.+)-ийн жуулчны баазыг заралаа\.$/, (tile) => ` sold the ger camp on ${enTile(tile)}.`],
  [/^ (.+)-ийн нэг гэрийг заралаа\.$/, (tile) => ` sold a ger on ${enTile(tile)}.`],
  [/^ (.+)-г барьцаалж (\d+₮) авлаа\.$/, (tile, amount) => ` mortgaged ${enTile(tile)} for ${amount}.`],
  [/^ (.+)-г (\d+₮) төлж барьцаанаас гаргалаа\.$/, (tile, amount) => ` paid ${amount} to lift the mortgage on ${enTile(tile)}.`],
  [/^ (.+)-д арилжааны санал тавилаа\.$/, (other) => ` offered ${other} a trade.`],
  [/^ тоглоомоос гарлаа\.$/, () => ' left the game.'],
];

/** Whole lines that don't start with a player's name. */
const SYSTEM: Array<[RegExp, (...groups: string[]) => string]> = [
  [/^Тоглоом эхэллээ\. (.+) эхэлж шоо хаяна\.$/, (name) => `The game has started. ${name} rolls first.`],
  [/^(\d+) тойрог дууслаа\. Хамгийн их хөрөнгөтэй (.*) яллаа!$/, (rounds, name) => `${rounds} rounds are over. ${name}, the richest player, wins!`],
  [/^(.+) дуудлага худалдаанд гарлаа\.$/, (tile) => `${enTile(tile)} goes to auction.`],
  [/^(.+)-г хэн ч аваагүй\.$/, (tile) => `No one bought ${enTile(tile)}.`],
  [/^Арилжаа хүчингүй боллоо: (.+)$/, (problem) => `The trade fell through: ${serverMessageInEnglish(problem)}`],
  [/^Арилжааны санал цуцлагдлаа\.$/, () => 'The trade offer was cancelled.'],
];

/** A play-by-play line in the player's language. `names` are the players at the table. */
export function monoLine(line: string, names: string[]): string {
  if (!isEnglish) return line;
  const who = [...names].sort((left, right) => right.length - left.length).find((name) => line.startsWith(name));
  if (who) {
    const rest = line.slice(who.length);
    for (const [pattern, build] of AFTER_NAME) {
      const match = rest.match(pattern);
      if (match) return who + build(...match.slice(1));
    }
  }
  for (const [pattern, build] of SYSTEM) {
    const match = line.match(pattern);
    if (match) return build(...match.slice(1));
  }
  return line;
}

/** Rule messages that name a square (square names may contain spaces, so they are matched whole). */
function monoMessage(message: string): string {
  if (message.endsWith(' энэ газар-г эзэмшдэггүй.')) return `${message.slice(0, -' энэ газар-г эзэмшдэггүй.'.length)} doesn\u2019t own this property.`;
  for (const [mn, en] of NAME_EN) {
    if (message.endsWith(` ${mn}-г эзэмшдэггүй.`)) return `${message.slice(0, -` ${mn}-г эзэмшдэггүй.`.length)} doesn\u2019t own ${en}.`;
    if (message === `${mn}-ийн бүлэгт барилга байна. Эхлээд зарна уу.`) return `${en}\u2019s group has buildings. Sell them first.`;
  }
  return message;
}

addServerTranslator((message) => {
  const result = monoMessage(message);
  return result === message ? null : result;
});
