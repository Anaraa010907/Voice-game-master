/*
 * The game server and the board-game rules answer in Mongolian. In English mode these tables turn
 * their messages into English; anything not listed is shown as it came.
 */
const EXACT: Record<string, string> = {
  // Game server (supabase/functions/game).
  'Хүсэлтийн талбар буруу байна.': 'The request is invalid.',
  'Өрөөний код буруу байна.': 'The room code is invalid.',
  'Нүд буруу байна.': 'That square is invalid.',
  'Үнийн санал буруу байна.': 'That bid is invalid.',
  'Арилжааны санал буруу байна.': 'That trade offer is invalid.',
  'Өрөө олдсонгүй.': 'Room not found.',
  'Тоглогчийн тоо буруу байна.': 'The number of players is invalid.',
  'Өрөөний нууц үг хамгийн багадаа 4 тэмдэгт байна.': 'The room password needs at least 4 characters.',
  'Өрөөний код үүсгэж чадсангүй. Дахин оролдоно уу.': 'Could not create a room code. Please try again.',
  'Энэ өрөөнд тоглоом аль хэдийн эхэлсэн байна.': 'The game in this room has already started.',
  'Энэ өрөө дүүрсэн байна.': 'This room is full.',
  'Өрөөний нууц үг таарахгүй байна.': 'The room password does not match.',
  'Суудал дөнгөж сая дүүрлээ. Дахин оролдоно уу.': 'The last seat was just taken. Please try again.',
  'Та энэ өрөөний тоглогч биш байна.': 'You are not a player in this room.',
  'Тоглоом аль хэдийн эхэлсэн.': 'The game has already started.',
  'Зөвхөн өрөөний эзэн тоглоом эхлүүлнэ.': 'Only the room host can start the game.',
  'Тоглоомд бот оролцохгүй. Ботуудыг хасна уу.': 'Bots cannot play this game. Please remove them.',
  'Тоглоом эхлээгүй байна.': 'The game has not started.',
  'Олон хүсэлт зэрэг ирлээ. Дахин оролдоно уу.': 'Too many requests at once. Please try again.',
  'Үйлдэл буруу байна.': 'That action is not allowed.',
  'Энэ өрөөнд board game явагдаагүй байна.': 'There is no board game in this room.',
  'Зорилт буруу байна.': 'That target is invalid.',
  'Зөвхөн өрөөний эзэн дүрэм өөрчилнө.': 'Only the room host can change the rules.',
  'Тоглоом эхэлсэн үед дүрэм өөрчлөх боломжгүй.': 'The rules cannot change once the game has started.',
  'Рэйтинг тоглолтын дүрэм тогтмол, өөрчлөх боломжгүй.': 'Ranked matches use fixed rules.',
  'Шийдвэр буруу байна.': 'That verdict is invalid.',
  'Зөвхөн өрөөний эзэн бот нэмнэ.': 'Only the room host can add bots.',
  'Энэ тоглоомд бот нэмэх боломжгүй.': 'Bots cannot be added to this game.',
  'Тоглоом эхэлсэн үед бот нэмэх боломжгүй.': 'Bots cannot be added once the game has started.',
  'Рэйтинг өрөөнд бот нэмэх боломжгүй.': 'Bots cannot join ranked rooms.',
  'Өрөө дүүрсэн байна.': 'The room is full.',
  'Зөвхөн өрөөний эзэн бот хасна.': 'Only the room host can remove bots.',
  'Тоглоом эхэлсэн үед бот хасах боломжгүй.': 'Bots cannot be removed once the game has started.',
  'Суудал буруу байна.': 'That seat is invalid.',
  'Зөвхөн өрөөний эзэн шинэ тоглолт эхлүүлнэ.': 'Only the room host can start a new match.',
  'Зөвхөн админ, модератор хийх боломжтой.': 'Only admins and moderators can do this.',
  'Зөвхөн админ хийх боломжтой.': 'Only admins can do this.',
  'Тоглогч буруу байна.': 'That player is invalid.',
  'Өөрийгөө хаах боломжгүй.': 'You cannot ban yourself.',
  'Админ, модераторыг хаах боломжгүй. Эхлээд эрхийг нь хасна уу.': 'Admins and moderators cannot be banned. Remove their role first.',
  'Хаах хугацаа буруу байна.': 'That ban length is invalid.',
  'Тоглогч олдсонгүй.': 'Player not found.',
  'Энэ домэйноос хүсэлт илгээх эрхгүй байна.': 'Requests from this site are not allowed.',
  'Хүсэлтийн арга зөвшөөрөгдөөгүй.': 'That request method is not allowed.',
  'Тоглохын тулд нэвтэрнэ үү.': 'Please sign in to play.',
  'Нэвтрэлт хүчингүй байна. Дахин нэвтэрнэ үү.': 'Your session has expired. Please sign in again.',
  'Хүсэлтийн хэмжээ хэтэрсэн байна.': 'The request is too large.',
  'Хүсэлтийн JSON буруу байна.': 'The request is not valid JSON.',
  'Тоглоомын серверт алдаа гарлаа. Дахин оролдоно уу.': 'The game server had a problem. Please try again.',
  // Board-game rules (shared Monopoly engine).
  'Зөвхөн өөрийн газар дээр байшин барина.': 'You can only build on your own property.',
  'Эхлээд нэг өнгийн бүх газрыг эзэмшинэ үү.': 'Own every property of that colour first.',
  'Барьцаалсан газартай бүлэгт барих боломжгүй.': 'You cannot build in a group with a mortgaged property.',
  'Энэ газар бүрэн баригдсан.': 'This property is fully built.',
  'Байшинг бүлгийн газруудад жигд барина.': 'Build evenly across the group.',
  'Банкинд жуулчны бааз дууссан.': 'The bank has no ger camps left.',
  'Банкинд гэр дууссан.': 'The bank has no gers left.',
  'Мөнгө хүрэлцэхгүй байна.': 'You don’t have enough money.',
  'Тоглоом дууссан.': 'The game is over.',
  'Арилжааны хариуг хүлээж байна.': 'Waiting for an answer to the trade.',
  'Дуудлага худалдаа явагдаж байна.': 'An auction is in progress.',
  'Таны ээлж биш байна.': 'It’s not your turn.',
  'Арилжаанд хоёр тал тоглоомд байх ёстой.': 'Both sides of a trade must still be in the game.',
  'Өөртэйгөө арилжаа хийх боломжгүй.': 'You cannot trade with yourself.',
  'Арилжааны дүн буруу байна.': 'The trade amount is invalid.',
  'Санал хоосон байна.': 'The offer is empty.',
  'Шоронгийн карт хүрэлцэхгүй байна.': 'Not enough jail cards.',
  'Нэг газрыг давхар оруулсан байна.': 'The same property is listed twice.',
  'Самбар шинэчлэгдсэн тул энэ тоглолт дууслаа. Шинээр эхлүүлнэ үү.': 'The board was updated, so this game has ended. Please start a new one.',
  'Та энэ тоглоомд оролцохгүй байна.': 'You are not in this game.',
  'Дуудлага худалдаа явагдаагүй байна.': 'There is no auction right now.',
  'Таны үнэ хаях ээлж биш байна.': 'It’s not your turn to bid.',
  'Хүлээгдэж буй арилжаа алга.': 'There is no pending trade.',
  'Зөвхөн санал тавьсан хүн цуцална.': 'Only the player who made the offer can withdraw it.',
  'Энэ санал танд ирээгүй.': 'This offer was not made to you.',
  'Одоо шоо хаях боломжгүй.': 'You can’t roll right now.',
  'Одоо худалдаж авах боломжгүй.': 'You can’t buy right now.',
  'Одоо алгасах зүйл алга.': 'There is nothing to skip right now.',
  'Эхлээд газрыг авах эсвэл алгасна уу.': 'Buy the property or pass first.',
  'Эхлээд шоо хаяна уу.': 'Roll the dice first.',
  'Одоо торгууль төлөх шаардлагагүй.': 'You don’t need to pay a fine now.',
  'Одоо шоронгийн карт хэрэглэх шаардлагагүй.': 'You don’t need a jail card now.',
  'Танд шоронгоос гарах карт алга.': 'You have no get-out-of-jail card.',
  'Зарах байшин алга.': 'There are no buildings to sell.',
  'Байшинг бүлгийн газруудаас жигд зарна.': 'Sell evenly across the group.',
  'Банкинд 4 гэр үлдээгүй тул баазыг гэр болгож задлах боломжгүй.': 'The bank doesn’t have 4 gers left, so the camp can’t be broken up.',
  'Энэ өрөөнд барьцаа хаалттай.': 'Mortgages are off in this room.',
  'Энэ газрыг барьцаалах боломжгүй.': 'This property can’t be mortgaged.',
  'Эхлээд бүлгийн байшингуудыг зарна уу.': 'Sell the group’s buildings first.',
  'Энэ газар барьцаанд байхгүй.': 'This property is not mortgaged.',
  'Өөр арилжааны хариуг хүлээж байна. Түр хүлээнэ үү.': 'Another trade is waiting for an answer. Please wait.',
  'Газар худалдан авах эсвэл дуудлага худалдааны үед арилжаа санал болгох боломжгүй.': 'You can’t propose trades while buying a property or during an auction.',
};

const PATTERNS: Array<[RegExp, (...groups: string[]) => string]> = [
  [/^Тоглоом эхлүүлэхэд дор хаяж (\d+) тоглогч хэрэгтэй\.$/, (count) => `At least ${count} players are needed to start.`],
  [/^Бэлэн болоогүй: (.+)$/, (names) => `Not ready yet: ${names}`],
  [/^Таны бүртгэл (.+) \(UTC\) хүртэл хаагдсан байна\.(?: Шалтгаан: (.+))?$/, (until, reason) => `Your account is banned until ${until} (UTC).${reason ? ` Reason: ${reason}` : ''}`],
  [/^Таны бүртгэл бүрмөсөн хаагдсан байна\.(?: Шалтгаан: (.+))?$/, (reason) => `Your account is banned permanently.${reason ? ` Reason: ${reason}` : ''}`],
  [/^(.+)-д (\d+₮) алга\.$/, (name, amount) => `${name} doesn’t have ${amount}.`],
  [/^Хамгийн багадаа (\d+₮) хаяна\.$/, (amount) => `Bid at least ${amount}.`],
  [/^Нэг ээлжид (\d+)-аас олон санал тавих боломжгүй\.$/, (count) => `You can’t make more than ${count} offers in one turn.`],
];

/** Extra translators added by other modules (the board game adds ones that know its square names). */
const extra: Array<(message: string) => string | null> = [];
export function addServerTranslator(translate: (message: string) => string | null) {
  extra.push(translate);
}

/** English for a message from the server; unknown messages come back unchanged. */
export function serverMessageInEnglish(message: string): string {
  const exact = EXACT[message];
  if (exact) return exact;
  for (const translate of extra) {
    const result = translate(message);
    if (result) return result;
  }
  for (const [pattern, build] of PATTERNS) {
    const match = message.match(pattern);
    if (match) return build(...match.slice(1));
  }
  return message;
}
