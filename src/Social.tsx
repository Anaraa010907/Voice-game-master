import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Bot, Check, Clock3, Coins, Crown, Flag, Flame, Gem, Gift, Lock, Plus, Send, ShoppingBag, Sparkles, UserPlus, X } from 'lucide-react';
import Avatar, { RowBorder, nameplate, rowBorderClass } from './Avatar';
import { supabase } from './supabaseClient';
import type { NotifyFn, RoomSeat } from './multiplayer';
import { playSfx } from './sfx';

import { isEnglish, t } from './lang';
import { translateMessage } from './i18n';
/* ---------- shop catalogue ---------- */

export type ShopKind = 'gift' | 'frame' | 'title' | 'nameplate' | 'border';
/** Coins are earned by playing; diamonds are bought with real money. */
export type Currency = 'coin' | 'diamond';
/**
 * Where a look comes from: bought in the shop, the season pass, a limited offer, or 'legacy' (a former
 * rank prize: kept and worn by those who own it, no longer sold or won).
 */
export type ItemSource = 'shop' | 'legacy' | 'pass' | 'limited';
export type ShopItem = { key: string; kind: ShopKind; name: string; description: string; icon: string; price: number; sort: number; currency: Currency; source?: ItemSource };
/** Only shop items can be bought or given. */
export const forSale = (item: ShopItem) => (item.source ?? 'shop') === 'shop';

let catalogue: Promise<ShopItem[]> | null = null;
/** The shop's items, loaded once per app start. */
export function loadShopItems(): Promise<ShopItem[]> {
  if (!supabase) return Promise.resolve([]);
  catalogue ??= Promise.resolve(supabase.from('shop_items').select('key,kind,name,description,name_en,description_en,icon,price,sort,currency,source').order('sort'))
    // English mode shows each item's English name and description when it has them.
    .then(({ data }) => ((data as Array<ShopItem & { name_en?: string | null; description_en?: string | null }> | null) ?? [])
      .map(({ name_en, description_en, ...item }) => (isEnglish ? { ...item, name: name_en || item.name, description: description_en || item.description } : item)))
    .catch(() => { catalogue = null; return []; });
  return catalogue;
}

export function useShopItems() {
  const [items, setItems] = useState<ShopItem[]>([]);
  useEffect(() => {
    let active = true;
    void loadShopItems().then((list) => { if (active) setItems(list); });
    return () => { active = false; };
  }, []);
  return items;
}

/** Admins get everything in the shop for free (the server checks this too). */
export function useFreeShopping() {
  const [free, setFree] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void Promise.resolve(supabase.rpc('is_admin')).then(({ data }) => { if (active) setFree(data === true); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return free;
}

export type Wallet = { coins: number; diamonds: number };

/** My coins and diamonds, refreshed on demand. */
export function useMyWallet() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    const id = auth.session?.user.id;
    const query = supabase.from('profiles').select('coins,diamonds');
    const { data } = await (id ? query.eq('id', id) : query).maybeSingle();
    const row = data as Partial<Wallet> | null;
    if (row && typeof row.coins === 'number') setWallet({ coins: row.coins, diamonds: row.diamonds ?? 0 });
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { wallet, refresh };
}

/** Whether the purse this item is priced in holds enough. */
export const canAfford = (item: ShopItem, wallet: Wallet | null, free: boolean) =>
  free || wallet === null || (item.currency === 'diamond' ? wallet.diamonds : wallet.coins) >= item.price;

const failure = (error: { message?: string } | null | undefined) => (error?.message ? translateMessage(error.message) : '') || t('Алдаа гарлаа. Дахин оролдоно уу.', 'Something went wrong. Please try again.');
const failureOf = (result: { error: { message?: string } | null }) => result.error ? failure(result.error) : '';

export function CoinCount({ value, className = '' }: { value: number | null; className?: string }) {
  return <span className={`coin-count ${className}`} title={t('Зоос: тоглож олно', 'Coins: earned by playing')}><Coins size={13} />{value === null ? '…' : value.toLocaleString('en-US')}</span>;
}

export function DiamondCount({ value, className = '', onTopUp }: { value: number | null; className?: string; onTopUp?: () => void }) {
  const body = <><Gem size={13} />{value === null ? '…' : value.toLocaleString('en-US')}{onTopUp && <Plus size={12} className="diamond-plus" />}</>;
  return onTopUp
    ? <button type="button" className={`diamond-count is-button ${className}`} onClick={onTopUp} aria-label={t('Алмаз цэнэглэх', 'Top up diamonds')} title={t('Алмаз цэнэглэх', 'Top up diamonds')}>{body}</button>
    : <span className={`diamond-count ${className}`} title={t('Алмаз: цэнэглэж авна', 'Diamonds: bought with a top-up')}>{body}</span>;
}

/** An item's price with its currency's icon. */
export function Price({ item, free = false, size = 12 }: { item: Pick<ShopItem, 'price' | 'currency'>; free?: boolean; size?: number }) {
  if (free) return <>{t(`ҮНЭГҮЙ`, `FREE`)}</>;
  return <span className={`price is-${item.currency}`}>{item.currency === 'diamond' ? <Gem size={size} /> : <Coins size={size} />}{item.price.toLocaleString('en-US')}</span>;
}

/** Diamond top-up: real-money payment is not connected yet. */
export function TopUpModal({ onClose }: { onClose: () => void }) {
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal topup-modal" role="dialog" aria-modal="true" aria-labelledby="topup-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-symbol topup-symbol"><Gem size={18} /></div>
      <h2 id="topup-title">{t(`Алмаз цэнэглэх`, `Top up diamonds`)}</h2>
      <div className="topup-packs" aria-hidden="true">{[[60, '…'], [330, '…'], [700, '…'], [1500, '…']].map(([gems]) => <span key={gems}><Gem size={14} /><b>{gems}</b><small>{t(`Тун удахгүй`, `Coming soon`)}</small></span>)}</div>
      <p><Clock3 size={12} />{t(` Тун удахгүй. Төлбөр холбогдсоны дараа алмазаа эндээс цэнэглэнэ. Одоогоор админ гараар нэмж өгнө.`, ` Coming soon. Once payments are connected you’ll top up diamonds here. For now an admin adds them by hand.`)}</p>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t(`ХААХ`, `CLOSE`)}</button></div>
    </section>
  </div>;
}

/** A player's shop title, in gold. */
const ICON_SIZE = { sm: 11, lg: 14, hero: 17 } as const;

/** A title as an ornate plaque: emblem, name in metal letters, and a gleam that runs across it (see .title-tier-* in theme.css). */
export function TitlePlaque({ titleKey, name, size = 'sm' }: { titleKey: string; name: string; size?: 'sm' | 'lg' | 'hero' }) {
  return <span className={`title-badge is-${size} title-tier-${titleKey.replace(/^title-/, '')}`} title={name}>
    <i className="tb-emblem" aria-hidden="true"><Sparkles size={ICON_SIZE[size]} /></i>
    <span className="tb-name">{name}</span>
  </span>;
}

export function TitleBadge({ titleKey, items, size = 'sm' }: { titleKey?: string | null; items: ShopItem[]; size?: 'sm' | 'lg' | 'hero' }) {
  if (!titleKey) return null;
  const name = items.find((item) => item.key === titleKey)?.name;
  return name ? <TitlePlaque titleKey={titleKey} name={name} size={size} /> : null;
}

/* ---------- live gifts at the table ---------- */

type GiftRow = { id: number; from_name: string; to_name: string; gift_key: string };

/** Every gift sent at this table pops up for everyone, one after another. */
export function GiftLayer({ roomCode }: { roomCode: string }) {
  const items = useShopItems();
  const [queue, setQueue] = useState<GiftRow[]>([]);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel(`gifts-${roomCode}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gifts', filter: `room_code=eq.${roomCode}` }, (payload) => {
        const row = payload.new as GiftRow;
        if (seen.current.has(row.id)) return;
        seen.current.add(row.id);
        setQueue((current) => [...current, row].slice(-8));
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [roomCode]);

  const showing = queue[0];
  useEffect(() => {
    if (!showing) return;
    playSfx('buy');
    const timer = window.setTimeout(() => setQueue((current) => current.slice(1)), 3400);
    return () => window.clearTimeout(timer);
  }, [showing]);

  if (!showing) return null;
  const item = items.find((entry) => entry.key === showing.gift_key);
  return <div className="gift-layer" aria-live="polite" key={showing.id}>
    <div className="gift-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ ['--i' as string]: index }} />)}</div>
    <div className="gift-big" aria-hidden="true">{item?.icon || '🎁'}</div>
    <p className="gift-caption"><span><b>{showing.from_name}</b> → <b>{showing.to_name}</b></span><small>{item?.name ?? t('Бэлэг', 'A gift')}{t(` илгээлээ`, ` sent`)}</small></p>
  </div>;
}

/* ---------- choosing a gift ---------- */

type GiftTab = 'gift' | 'frame' | 'nameplate' | 'border';
const GIFT_TABS: { key: GiftTab; label: string }[] = [{ key: 'gift', label: t('Бэлэг', 'Gift') }, { key: 'frame', label: t('Хүрээ', 'Frame') }, { key: 'nameplate', label: t('Нэрийн хавтан', 'Nameplate') }, { key: 'border', label: t('Нэрийн хүрээ', 'Name border') }];

/**
 * The gift grid. Frames and nameplates (given to a friend to keep) are offered only outside a game;
 * `onSend` gets the item so the caller decides how it is delivered.
 */
export function GiftPicker({ targetName, allowCosmetics, busy, note, onBack, onSend }: {
  targetName: string; allowCosmetics: boolean; busy: boolean; note: string; onBack?: () => void; onSend: (item: ShopItem) => void;
}) {
  const items = useShopItems();
  const { wallet } = useMyWallet();
  const free = useFreeShopping();
  const [tab, setTab] = useState<GiftTab>('gift');
  const [picked, setPicked] = useState<string | null>(null);
  const shown = items.filter((item) => item.kind === tab && forSale(item));
  const choice = items.find((item) => item.key === picked);
  return <>
    <div className="pcard-subhead">{onBack && <button type="button" className="icon-button" onClick={onBack} aria-label={t('Буцах', 'Back')}><ArrowLeft size={14} /></button>}<b>{t(`${targetName}-д бэлэг`, `A gift for ${targetName}`)}</b><CoinCount value={wallet?.coins ?? null} /><DiamondCount value={wallet?.diamonds ?? null} /></div>
    {allowCosmetics && <div className="admin-choice-row gift-tabs" role="tablist">{GIFT_TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} key={item.key}
      className={tab === item.key ? 'is-picked' : ''} onClick={() => { setTab(item.key); setPicked(null); }}>{item.label}</button>)}</div>}
    <div className={`gift-grid kind-${tab}`}>{shown.map((item) => <button type="button" key={item.key} className={picked === item.key ? 'is-picked' : ''} disabled={!canAfford(item, wallet, free)}
      onClick={() => setPicked(item.key)} aria-pressed={picked === item.key}>
      {item.kind === 'gift' && <span className="gift-icon">{item.icon}</span>}
      {item.kind === 'frame' && <Avatar name={item.name} color="rose" frame={item.key} className="gift-frame-preview" />}
      {item.kind === 'nameplate' && <span className={`gift-plate-preview ${nameplate(item.key).className}`} style={nameplate(item.key).style} />}
      {item.kind === 'border' && <span className={`gift-plate-preview gift-border-preview ${rowBorderClass(item.key)}`}><RowBorder borderKey={item.key} /></span>}
      <b>{item.name}</b><small><Price item={item} free={free} size={10} /></small></button>)}</div>
    <p className="pcard-note">{tab === 'gift' ? note : t('Найз тань энэ барааг өөрийн болгож авна. Аль хэдийн байгаа бол илгээгдэхгүй.', 'Your friend keeps this item. If they already have it, it isn’t sent.')}</p>
    <div className="modal-actions"><button type="button" className="primary-button" disabled={busy || !choice} onClick={() => choice && onSend(choice)}>
      <Gift size={14} /> {choice ? (free ? t('ҮНЭГҮЙ ИЛГЭЭХ', 'SEND FOR FREE') : t(`${choice.price} ${choice.currency === 'diamond' ? 'АЛМАЗААР' : 'ЗООСООР'} ИЛГЭЭХ`, `SEND FOR ${choice.price} ${choice.currency === 'diamond' ? 'DIAMONDS' : 'COINS'}`)) : t('БЭЛЭГ СОНГОНО УУ', 'CHOOSE A GIFT')}</button></div>
  </>;
}

/* ---------- a player's card at the table ---------- */

type Card = {
  id: string; display_name: string; avatar_url: string | null; avatar_key: string; frame_key: string | null; title_key: string | null; nameplate_key?: string | null; border_key?: string | null;
  total_matches: number; wins: number; win_rate: number; best_win_streak: number;
  created_at: string; gift_total: number; gifts: { gift_key: string; count: number }[];
};

const REPORT_REASONS = [t('Доромжилсон, хараасан', 'Insults or swearing'), t('Хуурсан, луйвардсан', 'Cheating or scamming'), t('Тоглоомыг зориуд эвдсэн', 'Ruining the game on purpose'), t('Зохисгүй нэр, зураг', 'Inappropriate name or picture'), t('Бусад', 'Other')];

/** Sends a frame, nameplate or gift to a friend outside a room. Returns '' or the error. */
export async function sendFriendGift(to: string, item: ShopItem) {
  if (!supabase) return t('Сервер тохируулагдаагүй байна.', 'The server is not set up.');
  const { error } = await supabase.rpc('send_friend_gift', { p_to: to, p_key: item.key });
  return error ? failure(error) : '';
}

/** Tap a player: their profile, a gift for them (everyone sees it), a friend request or a report to the admin. */
export function PlayerCardModal({ seat, roomCode, myUserId, inGame, onClose, notify }: {
  seat: RoomSeat; roomCode: string; myUserId: string; inGame: boolean; onClose: () => void; notify: NotifyFn;
}) {
  const items = useShopItems();
  const [card, setCard] = useState<Card | null>(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<'card' | 'gift' | 'report'>('card');
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const isMe = seat.user_id === myUserId;
  const isBot = Boolean(seat.is_bot);

  useEffect(() => {
    if (!supabase || isBot) return;
    let active = true;
    void supabase.rpc('player_card', { p_user: seat.user_id }).then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError(failure(error)); else setCard(data as Card);
    });
    return () => { active = false; };
  }, [seat.user_id, isBot]);

  const sendGift = async (item: ShopItem) => {
    if (!supabase) return;
    setBusy(true);
    // Emoji gifts pop up for the whole table; frames and nameplates go to a friend to keep.
    const problem = item.kind === 'gift'
      ? failureOf(await supabase.rpc('send_gift', { p_room: roomCode, p_to: seat.user_id, p_gift: item.key }))
      : await sendFriendGift(seat.user_id, item);
    setBusy(false);
    if (problem) { notify(problem, 'error'); return; }
    notify(item.kind === 'gift' ? t('Бэлэг илгээгдлээ!', 'Gift sent!') : t(`${item.name} бэлэглэлээ!`, `You gave ${item.name}!`), 'success');
    onClose();
  };

  const addFriend = async () => {
    if (!supabase) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('send_friend_request', { p_user: seat.user_id });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(data === 'friend' ? t('Та хоёр найз боллоо!', 'You are friends now!') : t('Найзын хүсэлт илгээлээ.', 'Friend request sent.'), 'success');
  };

  const sendReport = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('report_player', { p_target: seat.user_id, p_room: roomCode, p_reason: reason, p_message: note.trim() });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(t('Гомдол админд илгээгдлээ. Баярлалаа.', 'Your report was sent to the admins. Thank you.'), 'success');
    onClose();
  };

  const name = card?.display_name ?? seat.display_name.replace(/ \(бот\)$/, '');
  const giftIcon = (key: string) => items.find((item) => item.key === key)?.icon || '🎁';
  let body: ReactNode;
  if (view === 'gift') {
    body = <GiftPicker targetName={name} allowCosmetics={!inGame} busy={busy} note={t('Бэлэг ширээн дээрх бүх хүнд харагдана.', 'Everyone at the table sees the gift.')} onBack={() => setView('card')} onSend={(item) => void sendGift(item)} />;
  } else if (view === 'report') {
    body = <>
      <div className="pcard-subhead"><button type="button" className="icon-button" onClick={() => setView('card')} aria-label={t('Буцах', 'Back')}><ArrowLeft size={14} /></button><b>{t(`${name}-г мэдээлэх`, `Report ${name}`)}</b></div>
      <div className="admin-choice-row report-reasons" role="radiogroup" aria-label={t('Шалтгаан', 'Reason')}>{REPORT_REASONS.map((item) => <button type="button" role="radio" aria-checked={reason === item} key={item}
        className={reason === item ? 'is-picked' : ''} onClick={() => setReason(item)}>{item}</button>)}</div>
      <label className="feedback-text"><textarea value={note} maxLength={600} onChange={(event) => setNote(event.target.value)} placeholder={t('Юу болсныг товч бичнэ үү (заавал биш)', 'Briefly describe what happened (optional)')} /><small>{note.length}/600</small></label>
      <p className="pcard-note">{t(`Гомдлыг зөвхөн админ харна. Тоглогчид мэдэгдэхгүй.`, `Only admins see reports. The player is not told.`)}</p>
      <div className="modal-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void sendReport()}><Send size={14} />{t(` АДМИНД ИЛГЭЭХ`, ` SEND TO ADMINS`)}</button></div>
    </>;
  } else {
    body = <>
      <div className={`pcard-hero ${nameplate(card?.nameplate_key ?? seat.nameplate_key).className} ${rowBorderClass(card?.border_key ?? seat.border_key)}`} style={nameplate(card?.nameplate_key ?? seat.nameplate_key).style}>
        <RowBorder borderKey={card?.border_key ?? seat.border_key} />
        <Avatar name={name} color={card?.avatar_key ?? seat.color} url={card?.avatar_url ?? seat.avatar_url} frame={card?.frame_key ?? seat.frame_key} className="pcard-avatar">
          {isBot && <i className="bot-badge"><Bot size={12} /></i>}
        </Avatar>
        <div className="pcard-name">
          <h2>{name}{isMe && <small>{t(`ЧИ`, `YOU`)}</small>}</h2>
          <TitleBadge titleKey={card?.title_key} items={items} size="lg" />
          {isBot && <span className="pcard-bot-note">{t(`Бот тоглогч · дасгалын ширээнд`, `Bot player · practice table`)}</span>}
        </div>
      </div>
      {loadError && <p className="pcard-note">{loadError}</p>}
      {card && <>
        <div className="pcard-stats">
          <span><b>{card.total_matches}</b>{t(`Тоглолт`, `Matches`)}</span><span><b>{card.wins}</b>{t(`Ялалт`, `Wins`)}</span>
          <span><b>{Math.round(card.win_rate)}%</b>{t(`Ялалтын хувь`, `Win rate`)}</span><span><b>{card.gift_total}</b>{t(`Бэлэг`, `Gifts`)}</span>
        </div>
        {card.gifts.length > 0 && <div className="pcard-gifts" aria-label={t('Хүлээн авсан бэлгүүд', 'Gifts received')}>{card.gifts.slice(0, 8).map((entry) => <span key={entry.gift_key}>{giftIcon(entry.gift_key)}<small>×{entry.count}</small></span>)}</div>}
      </>}
      {!isMe && !isBot && <div className="modal-actions pcard-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void addFriend()}><UserPlus size={14} />{t(` НАЙЗ`, ` FRIEND`)}</button>
        <button type="button" className="secondary-button" onClick={() => setView('report')}><Flag size={14} />{t(` ГОМДОЛ`, ` REPORT`)}</button>
        <button type="button" className="primary-button" onClick={() => setView('gift')}><Gift size={14} />{t(` БЭЛЭГ ИЛГЭЭХ`, ` SEND A GIFT`)}</button>
      </div>}
    </>;
  }

  return <div className="game-modal-backdrop pcard-backdrop" onClick={onClose}>
    <section className="game-modal pcard" role="dialog" aria-modal="true" aria-label={t(`${name} — профайл`, `${name} — profile`)} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="icon-button pcard-close" onClick={onClose} aria-label={t('Хаах', 'Close')}><X size={15} /></button>
      {body}
    </section>
  </div>;
}

/** Tap opens the card; a long press does too (for cards whose tap already picks a target). */
export function useLongPress(onLongPress: () => void, delay = 450) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; };
  return {
    fired,
    handlers: {
      onPointerDown: () => { fired.current = false; clear(); timer.current = window.setTimeout(() => { fired.current = true; onLongPress(); }, delay); },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    },
  };
}

/* ---------- shop ---------- */

/** How a nameplate looks behind my own name, as it will in a lobby seat or a game row. */
export function PlatePreview({ plateKey, borderKey, me, large = false }: { plateKey: string | null; borderKey?: string; me: { display_name: string; avatar_url: string | null; avatar_key: string; frame_key: string | null } | null; large?: boolean }) {
  const plate = nameplate(plateKey);
  return <span className={`plate-preview ${large ? 'is-large' : ''} ${plate.className} ${rowBorderClass(borderKey)}`} style={plate.style}>
    <RowBorder borderKey={borderKey} />
    <Avatar name={me?.display_name ?? t('Би', 'Me')} color={me?.avatar_key ?? 'rose'} url={me?.avatar_url} />
    <b>{me?.display_name ?? t('Таны нэр', 'Your name')}</b>
  </span>;
}

type Owned = { item_key: string };
type Me = { coins: number; diamonds: number; frame_key: string | null; title_key: string | null; nameplate_key?: string | null; border_key?: string | null; avatar_url: string | null; avatar_key: string; display_name: string; bonus_claimed_at: string | null };

type ShopTab = ShopKind | 'offers';
const TABS: { key: ShopTab; label: string }[] = [{ key: 'offers', label: t('Онцлох', 'Featured') }, { key: 'frame', label: t('Аватар хүрээ', 'Avatar frame') }, { key: 'nameplate', label: t('Нэрийн хавтан', 'Nameplate') }, { key: 'border', label: t('Нэрийн хүрээ', 'Name border') }, { key: 'gift', label: t('Бэлэг', 'Gift') }];
const CURRENCY_HEADING: Record<Currency, string> = { coin: t('Зоосоор · энгийн, хөдөлгөөнгүй', 'For coins · plain, still'), diamond: t('Алмазаар · зурган гоёл', 'For diamonds · painted looks') };

/** A look sold for a while at its own price (a weekly discount, or one an admin set). */
export type ShopOffer = { id: string; item_key: string; price: number; currency: Currency; starts_at: string; ends_at: string; auto: boolean };

/** Offers running now; reloads when the screen asks and drops ended ones as time passes. */
export function useShopOffers() {
  const [offers, setOffers] = useState<ShopOffer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('shop_offers').select('id,item_key,price,currency,starts_at,ends_at,auto').gt('ends_at', new Date().toISOString()).order('ends_at');
    setOffers((data as ShopOffer[] | null) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const running = offers.filter((offer) => new Date(offer.starts_at).getTime() <= now && new Date(offer.ends_at).getTime() > now);
  return { offers: running, reload: load, now };
}

/** "2 өдөр 5 цаг", "5 цаг 12 мин", "12 мин". */
export function timeLeft(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return t(`${days} өдөр ${hours} цаг`, `${days}d ${hours}h`);
  if (hours > 0) return t(`${hours} цаг ${minutes % 60} мин`, `${hours}h ${minutes % 60}m`);
  return t(`${Math.max(1, minutes)} мин`, `${Math.max(1, minutes)}m`);
}

export function ShopScreen({ onBack, notify }: { onBack: () => void; notify: NotifyFn }) {
  const items = useShopItems();
  const [tab, setTab] = useState<ShopTab>('offers');
  const [me, setMe] = useState<Me | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShopItem | null>(null);
  const [topUp, setTopUp] = useState(false);
  const free = useFreeShopping();
  const { offers, reload: reloadOffers, now } = useShopOffers();

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    const id = auth.session?.user.id;
    const profileQuery = supabase.from('profiles').select('coins,diamonds,frame_key,title_key,nameplate_key,border_key,avatar_url,avatar_key,display_name,bonus_claimed_at');
    const [profile, mine] = await Promise.all([
      (id ? profileQuery.eq('id', id) : profileQuery).maybeSingle(),
      supabase.from('player_items').select('item_key'),
    ]);
    if (profile.data) { const row = profile.data as Me; setMe({ ...row, diamonds: row.diamonds ?? 0 }); }
    setOwned(((mine.data as Owned[] | null) ?? []).map((row) => row.item_key));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (key: string, fn: string, args: Record<string, unknown>, done: string) => {
    if (!supabase) return;
    setBusy(key);
    const { error } = await supabase.rpc(fn, args);
    setBusy(null);
    if (error) { notify(failure(error), 'error'); if (fn === 'buy_offer') void reloadOffers(); return; }
    notify(done, 'success');
    if (fn === 'buy_item' || fn === 'buy_offer') playSfx('buy');
    void load();
  };

  const bonusReady = !me?.bonus_claimed_at || Date.now() - new Date(me.bonus_claimed_at).getTime() > 20 * 3600_000;
  const wallet: Wallet | null = me ? { coins: me.coins, diamonds: me.diamonds } : null;
  const shown = tab === 'offers' ? [] : items.filter((item) => item.kind === tab);
  // Plain looks for coins, painted ones for diamonds, each purse its own section. Legacy looks (former
  // rank prizes) are no longer sold: they show only to the players who own them, so they can wear them.
  const offerOf = (key: string) => offers.find((offer) => offer.item_key === key) ?? null;
  const legacyList = shown.filter((item) => item.source === 'legacy' && (owned.includes(item.key) || free));
  const sections: Array<{ id: Currency | 'legacy'; list: ShopItem[] }> = [
    { id: 'coin' as const, list: shown.filter((item) => forSale(item) && (item.currency ?? 'coin') === 'coin') },
    { id: 'legacy' as const, list: legacyList },
    { id: 'diamond' as const, list: shown.filter((item) => forSale(item) && item.currency === 'diamond') },
  ].filter((section) => section.list.length);
  const equippedFor = (kind: ShopKind) => kind === 'frame' ? me?.frame_key : kind === 'title' ? me?.title_key : kind === 'nameplate' ? me?.nameplate_key : kind === 'border' ? me?.border_key : null;
  const offerItems = offers.map((offer) => ({ offer, item: items.find((item) => item.key === offer.item_key) })).filter((entry): entry is { offer: ShopOffer; item: ShopItem } => Boolean(entry.item));

  const visual = (item: ShopItem) => <button type="button" className="shop-visual" onClick={() => setPreview(item)} aria-label={t(`${item.name} харах`, `View ${item.name}`)}>
    {item.kind === 'frame' && <Avatar name={me?.display_name ?? t('Би', 'Me')} color={me?.avatar_key ?? 'rose'} url={me?.avatar_url} frame={item.key} className="shop-avatar" />}
    {item.kind === 'gift' && <span className="gift-icon is-floating">{item.icon}</span>}
    {item.kind === 'title' && <TitlePlaque titleKey={item.key} name={item.name} size="lg" />}
    {item.kind === 'nameplate' && <PlatePreview plateKey={item.key} me={me} />}
    {item.kind === 'border' && <PlatePreview plateKey={me?.nameplate_key ?? null} borderKey={item.key} me={me} />}
  </button>;

  /** Wear / take off / buy (at the offer's price while one runs) / not for sale. */
  const action = (item: ShopItem, offer: ShopOffer | null) => {
    // Admins may wear anything; everyone else wears what they own.
    const has = owned.includes(item.key) || (free && item.source === 'legacy');
    const equipped = equippedFor(item.kind) === item.key;
    if (item.kind === 'gift') return <span className="shop-price"><Price item={item} free={free} /></span>;
    if (equipped) return <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void call(item.key, 'equip_item', { p_kind: item.kind, p_key: null }, t('Тайллаа.', 'Removed.'))}><Check size={13} />{t(` ЗҮҮСЭН`, ` EQUIPPED`)}</button>;
    if (has) return <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void call(item.key, 'equip_item', { p_kind: item.kind, p_key: item.key }, t('Зүүлээ!', 'Equipped!'))}>{t(`ЗҮҮХ`, `EQUIP`)}</button>;
    if (offer) {
      const deal: ShopItem = { ...item, price: offer.price, currency: offer.currency };
      return <button type="button" className={`primary-button buy-${offer.currency}`} disabled={busy !== null || !canAfford(deal, wallet, free)}
        onClick={() => void call(item.key, 'buy_offer', { p_offer: offer.id }, t(`${item.name} таных боллоо!`, `${item.name} is yours!`))}>{free ? <><ShoppingBag size={13} />{t(`ҮНЭГҮЙ АВАХ`, `GET FOR FREE`)}</> : <Price item={deal} />}</button>;
    }
    if (!forSale(item)) return <span className="shop-lock"><Lock size={12} />{t('Одоогоор худалдаагүй', 'Not for sale right now')}</span>;
    return <button type="button" className={`primary-button buy-${item.currency ?? 'coin'}`} disabled={busy !== null || !canAfford(item, wallet, free)} onClick={() => void call(item.key, 'buy_item', { p_key: item.key }, t(`${item.name} таных боллоо!`, `${item.name} is yours!`))}>{free ? <><ShoppingBag size={13} />{t(`ҮНЭГҮЙ АВАХ`, `GET FOR FREE`)}</> : <Price item={item} />}</button>;
  };

  /** "−20%" when the offer is cheaper in the same purse, otherwise just "ОНЦЛОХ". */
  const discountOf = (item: ShopItem, offer: ShopOffer) => item.currency === offer.currency && item.price > 0 && offer.price < item.price ? Math.round((1 - offer.price / item.price) * 100) : 0;

  const card = (item: ShopItem) => {
    const offer = offerOf(item.key);
    const discount = offer ? discountOf(item, offer) : 0;
    return <article key={item.key} className={`shop-card ${equippedFor(item.kind) === item.key ? 'is-equipped' : ''} is-${item.currency ?? 'coin'} ${offer ? 'has-offer' : ''}`}>
      {offer && <span className="offer-badge">{discount ? `−${discount}%` : t('ОНЦЛОХ', 'FEATURED')}</span>}
      {visual(item)}
      <b>{item.name}</b>
      <small>{offer ? <><Clock3 size={10} />{t(` ${timeLeft(offer.ends_at, now)} үлдсэн`, ` ${timeLeft(offer.ends_at, now)} left`)}</> : item.description}</small>
      {action(item, offer)}
    </article>;
  };

  const offerCard = ({ offer, item }: { offer: ShopOffer; item: ShopItem }) => {
    const discount = discountOf(item, offer);
    const owns = owned.includes(item.key);
    return <article key={offer.id} className={`shop-card is-offer is-${offer.currency} ${equippedFor(item.kind) === item.key ? 'is-equipped' : ''}`}>
      <span className="offer-badge">{discount ? `−${discount}%` : t('ОНЦЛОХ', 'FEATURED')}</span>
      {visual(item)}
      <b>{item.name}</b>
      <small className="offer-kind">{item.kind === 'frame' ? t('Аватар хүрээ', 'Avatar frame') : item.kind === 'nameplate' ? t('Нэрийн хавтан', 'Nameplate') : t('Нэрийн хүрээ', 'Name border')}{item.source === 'limited' ? t(' · зөвхөн энд', ' · only here') : ''}</small>
      <span className="offer-time"><Clock3 size={11} />{t(` ${timeLeft(offer.ends_at, now)} үлдсэн`, ` ${timeLeft(offer.ends_at, now)} left`)}</span>
      {discount > 0 && !owns && <s className="offer-old"><Price item={item} size={10} /></s>}
      {action(item, offer)}
    </article>;
  };

  return <div className="inner-screen panel-screen shop-screen">
    <header className="top-bar panel-top-bar">
      <button className="icon-button" onClick={onBack} aria-label={t('Буцах', 'Back')}><ArrowLeft size={17} /></button>
      <div className="top-title"><span>{t(`ХОТЫН ДЭЛГҮҮР`, `CITY SHOP`)}</span><strong>{t(`ДЭЛГҮҮР`, `SHOP`)}</strong></div>
      <div className="panel-top-trailing">
        <button type="button" className={`shop-bonus ${bonusReady ? 'is-ready' : ''}`} disabled={!bonusReady || busy !== null}
          onClick={() => void call('bonus', 'claim_daily_bonus', {}, t('Өдрийн бонус +100 зоос!', 'Daily bonus +100 coins!'))}><Gift size={13} /> {bonusReady ? t('ӨДРИЙН +100', 'DAILY +100') : t('МАРГААШ', 'TOMORROW')}</button>
        <CoinCount value={me?.coins ?? null} className="is-big" />
        <DiamondCount value={me?.diamonds ?? null} className="is-big" onTopUp={() => setTopUp(true)} />
      </div>
    </header>
    <div className="panel-body shop-body">
      <div className="admin-choice-row shop-tabs" role="tablist">{TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} key={item.key}
        className={`${tab === item.key ? 'is-picked' : ''} ${item.key === 'offers' ? 'is-offers' : ''}`} onClick={() => setTab(item.key)}>
        {item.key === 'offers' && <Flame size={12} />}{item.label}{item.key === 'offers' && offers.length > 0 && <b className="shop-tab-count">{offers.length}</b>}</button>)}</div>
      {tab === 'gift' && <p className="admin-note">{t(`Бэлгийг тоглолтын үеэр тоглогчийн зураг дээр дарж илгээнэ. Бүх хүнд харагдана. Дээр нь дарж харж болно.`, `Send gifts during a match by tapping a player’s picture. Everyone sees them, and you can tap one to look.`)}</p>}
      {tab === 'offers' && <section className="shop-section is-offers">
        <h3 className="shop-section-title"><Flame size={13} />{t(`Онцлох · хугацаатай хямдрал`, `Featured · limited-time deals`)}</h3>
        <p className="shop-section-note">{t(`Долоо хоног бүрийн даваа гарагт 2 зурган гоёл хямдарч гарна. Хугацаа дуусахад буцаад үндсэн үнэдээ орно.`, `Every Monday two painted looks go on sale. When time runs out they return to their normal price.`)}</p>
        {offerItems.length
          ? <div className="shop-grid kind-offers">{offerItems.map(offerCard)}</div>
          : <p className="panel-empty">{t(`Одоогоор онцлох санал алга. Даваа гарагт шинэчлэгдэнэ.`, `No featured offers right now. They refresh on Monday.`)}</p>}
      </section>}
      {sections.map((section) => <section key={section.id} className={`shop-section is-${section.id}`}>
        {sections.length > 1 || section.id !== 'coin'
          ? <h3 className="shop-section-title">{section.id === 'diamond' ? <Gem size={13} /> : section.id === 'legacy' ? <Crown size={13} /> : <Coins size={13} />}{section.id === 'legacy' ? t('Таны хуучин шагнал · хөдөлгөөнт', 'Your legacy rewards · animated') : CURRENCY_HEADING[section.id]}</h3>
          : null}
        {section.id === 'legacy' && <p className="shop-section-note">{t(`Өмнө нь шагналаар авсан гоёл. Таных хэвээр, зүүж болно. Дахин худалдаалагдахгүй.`, `Looks you won earlier as rewards. They stay yours to wear; they are no longer sold.`)}</p>}
        <div className={`shop-grid kind-${tab}`}>{section.list.map(card)}</div>
      </section>)}
      <p className="admin-note shop-foot"><Coins size={11} />{t(` Зоосыг тоглож олно: тоглолт бүрт +10, ялбал +30, өдөрт тоглолтоос 500 хүртэл, өдрийн бонус +100. Тоглолтын дундуур гарвал зоос өгөхгүй. `, ` Earn coins by playing: +10 for every match, +30 for a win, up to 500 a day from matches, and a +100 daily bonus. Leaving a match early pays nothing. `)}<Gem size={11} />{t(` Алмазыг цэнэглэж авна (тун удахгүй).`, ` Diamonds come from top-ups (coming soon).`)}</p>
    </div>
    {topUp && <TopUpModal onClose={() => setTopUp(false)} />}
    {preview && <div className="game-modal-backdrop" onClick={() => setPreview(null)}>
      <section className="game-modal shop-preview" role="dialog" aria-modal="true" aria-label={preview.name} onClick={(event) => event.stopPropagation()}>
        {preview.kind === 'frame' && <Avatar name={me?.display_name ?? t('Би', 'Me')} color={me?.avatar_key ?? 'rose'} url={me?.avatar_url} frame={preview.key} className="shop-avatar is-preview" />}
        {preview.kind === 'gift' && <div className="gift-preview"><div className="gift-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ ['--i' as string]: index }} />)}</div><div className="gift-big">{preview.icon}</div></div>}
        {preview.kind === 'title' && <TitlePlaque titleKey={preview.key} name={preview.name} size="hero" />}
        {preview.kind === 'nameplate' && <PlatePreview plateKey={preview.key} me={me} large />}
        {preview.kind === 'border' && <PlatePreview plateKey={me?.nameplate_key ?? null} borderKey={preview.key} me={me} large />}
        <h2>{preview.name}</h2><p>{preview.description}</p>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPreview(null)}>{t(`ХААХ`, `CLOSE`)}</button></div>
      </section>
    </div>}
  </div>;
}

