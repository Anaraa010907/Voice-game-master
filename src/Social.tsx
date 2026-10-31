import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Bot, Check, Clock3, Coins, Crown, Flag, Gem, Gift, Landmark, Lock, Plus, Send, ShoppingBag, Sparkles, Ticket, UserPlus, VenetianMask, X } from 'lucide-react';
import Avatar, { RowBorder, nameplate, rowBorderClass } from './Avatar';
import RankEmblem, { RankChip } from './RankEmblem';
import { RANK_GAMES, RANK_METALS, RANK_NAMES, parseRankTitle, type RankGame } from './rankRules';
import { supabase } from './supabaseClient';
import type { NotifyFn, RoomSeat } from './multiplayer';
import { playSfx } from './sfx';

/* ---------- shop catalogue ---------- */

export type ShopKind = 'gift' | 'frame' | 'title' | 'nameplate' | 'border';
/** Coins are earned by playing; diamonds are bought with real money. */
export type Currency = 'coin' | 'diamond';
/** Where a look comes from: bought in the shop, won by reaching a rank, or (later) the season pass / a limited offer. */
export type ItemSource = 'shop' | 'rank' | 'pass' | 'limited';
export type ShopItem = { key: string; kind: ShopKind; name: string; description: string; icon: string; price: number; sort: number; currency: Currency; source?: ItemSource };
/** Only shop items can be bought or given. */
export const forSale = (item: ShopItem) => (item.source ?? 'shop') === 'shop';

let catalogue: Promise<ShopItem[]> | null = null;
/** The shop's items, loaded once per app start. */
export function loadShopItems(): Promise<ShopItem[]> {
  if (!supabase) return Promise.resolve([]);
  catalogue ??= Promise.resolve(supabase.from('shop_items').select('key,kind,name,description,icon,price,sort,currency,source').order('sort'))
    .then(({ data }) => (data as ShopItem[] | null) ?? [])
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
function useMyWallet() {
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

const failure = (error: { message?: string } | null | undefined) => error?.message || 'Алдаа гарлаа. Дахин оролдоно уу.';
const failureOf = (result: { error: { message?: string } | null }) => result.error ? failure(result.error) : '';

export function CoinCount({ value, className = '' }: { value: number | null; className?: string }) {
  return <span className={`coin-count ${className}`} title="Зоос: тоглож олно"><Coins size={13} />{value === null ? '…' : value.toLocaleString('en-US')}</span>;
}

export function DiamondCount({ value, className = '', onTopUp }: { value: number | null; className?: string; onTopUp?: () => void }) {
  const body = <><Gem size={13} />{value === null ? '…' : value.toLocaleString('en-US')}{onTopUp && <Plus size={12} className="diamond-plus" />}</>;
  return onTopUp
    ? <button type="button" className={`diamond-count is-button ${className}`} onClick={onTopUp} aria-label="Алмаз цэнэглэх" title="Алмаз цэнэглэх">{body}</button>
    : <span className={`diamond-count ${className}`} title="Алмаз: цэнэглэж авна">{body}</span>;
}

/** An item's price with its currency's icon. */
export function Price({ item, free = false, size = 12 }: { item: Pick<ShopItem, 'price' | 'currency'>; free?: boolean; size?: number }) {
  if (free) return <>ҮНЭГҮЙ</>;
  return <span className={`price is-${item.currency}`}>{item.currency === 'diamond' ? <Gem size={size} /> : <Coins size={size} />}{item.price.toLocaleString('en-US')}</span>;
}

/** Diamond top-up: real-money payment is not connected yet. */
export function TopUpModal({ onClose }: { onClose: () => void }) {
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal topup-modal" role="dialog" aria-modal="true" aria-labelledby="topup-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-symbol topup-symbol"><Gem size={18} /></div>
      <h2 id="topup-title">Алмаз цэнэглэх</h2>
      <div className="topup-packs" aria-hidden="true">{[[60, '…'], [330, '…'], [700, '…'], [1500, '…']].map(([gems]) => <span key={gems}><Gem size={14} /><b>{gems}</b><small>Тун удахгүй</small></span>)}</div>
      <p><Clock3 size={12} /> Тун удахгүй. Төлбөр холбогдсоны дараа алмазаа эндээс цэнэглэнэ. Одоогоор админ гараар нэмж өгнө.</p>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>ХААХ</button></div>
    </section>
  </div>;
}

/** A player's shop title, in gold. */
const ICON_SIZE = { sm: 11, lg: 14, hero: 17 } as const;

/**
 * A title as an ornate plaque: emblem, name in metal letters, and a gleam that runs across it.
 * Titles are won in ranked play; the plaque takes the metal of the rank that unlocked it
 * (see .title-metal-* in theme.css) and the game's emblem, a crown for the top ranks.
 */
export function TitlePlaque({ titleKey, name, size = 'sm' }: { titleKey: string; name: string; size?: 'sm' | 'lg' | 'hero' }) {
  const rank = parseRankTitle(titleKey);
  const Icon = !rank ? Sparkles : rank.level >= 8 ? Crown : rank.game === 'mafia' ? VenetianMask : Landmark;
  const tone = rank ? `title-metal-${RANK_METALS[rank.level - 1]}` : `title-tier-${titleKey.replace(/^title-/, '')}`;
  return <span className={`title-badge is-${size} ${tone} ${rank ? 'has-crest' : ''}`} title={name}>
    {rank
      ? <RankEmblem game={rank.game} level={rank.level} className="tb-crest" />
      : <i className="tb-emblem" aria-hidden="true"><Icon size={ICON_SIZE[size]} /></i>}
    <span className="tb-name">{name}</span>
  </span>;
}

export function TitleBadge({ titleKey, items, size = 'sm' }: { titleKey?: string | null; items: ShopItem[]; size?: 'sm' | 'lg' | 'hero' }) {
  if (!titleKey) return null;
  const rank = parseRankTitle(titleKey);
  const name = rank ? RANK_NAMES[rank.game][rank.level - 1] : items.find((item) => item.key === titleKey)?.name;
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
    <p className="gift-caption"><span><b>{showing.from_name}</b> → <b>{showing.to_name}</b></span><small>{item?.name ?? 'Бэлэг'} илгээлээ</small></p>
  </div>;
}

/* ---------- choosing a gift ---------- */

type GiftTab = 'gift' | 'frame' | 'nameplate' | 'border';
const GIFT_TABS: { key: GiftTab; label: string }[] = [{ key: 'gift', label: 'Бэлэг' }, { key: 'frame', label: 'Хүрээ' }, { key: 'nameplate', label: 'Нэрийн хавтан' }, { key: 'border', label: 'Нэрийн хүрээ' }];

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
    <div className="pcard-subhead">{onBack && <button type="button" className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={14} /></button>}<b>{targetName}-д бэлэг</b><CoinCount value={wallet?.coins ?? null} /><DiamondCount value={wallet?.diamonds ?? null} /></div>
    {allowCosmetics && <div className="admin-choice-row gift-tabs" role="tablist">{GIFT_TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} key={item.key}
      className={tab === item.key ? 'is-picked' : ''} onClick={() => { setTab(item.key); setPicked(null); }}>{item.label}</button>)}</div>}
    <div className={`gift-grid kind-${tab}`}>{shown.map((item) => <button type="button" key={item.key} className={picked === item.key ? 'is-picked' : ''} disabled={!canAfford(item, wallet, free)}
      onClick={() => setPicked(item.key)} aria-pressed={picked === item.key}>
      {item.kind === 'gift' && <span className="gift-icon">{item.icon}</span>}
      {item.kind === 'frame' && <Avatar name={item.name} color="rose" frame={item.key} className="gift-frame-preview" />}
      {item.kind === 'nameplate' && <span className={`gift-plate-preview ${nameplate(item.key).className}`} style={nameplate(item.key).style} />}
      {item.kind === 'border' && <span className={`gift-plate-preview gift-border-preview ${rowBorderClass(item.key)}`}><RowBorder borderKey={item.key} /></span>}
      <b>{item.name}</b><small><Price item={item} free={free} size={10} /></small></button>)}</div>
    <p className="pcard-note">{tab === 'gift' ? note : 'Найз тань энэ барааг өөрийн болгож авна. Аль хэдийн байгаа бол илгээгдэхгүй.'}</p>
    <div className="modal-actions"><button type="button" className="primary-button" disabled={busy || !choice} onClick={() => choice && onSend(choice)}>
      <Gift size={14} /> {choice ? (free ? 'ҮНЭГҮЙ ИЛГЭЭХ' : `${choice.price} ${choice.currency === 'diamond' ? 'АЛМАЗААР' : 'ЗООСООР'} ИЛГЭЭХ`) : 'БЭЛЭГ СОНГОНО УУ'}</button></div>
  </>;
}

/* ---------- a player's card at the table ---------- */

type Card = {
  id: string; display_name: string; avatar_url: string | null; avatar_key: string; frame_key: string | null; title_key: string | null; nameplate_key?: string | null; border_key?: string | null;
  rank_name: string; rank_points: number; total_matches: number; wins: number; win_rate: number; best_win_streak: number;
  created_at: string; gift_total: number; gifts: { gift_key: string; count: number }[];
  ranks?: { game_type: RankGame; points: number; wins: number; matches: number }[];
};

const REPORT_REASONS = ['Доромжилсон, хараасан', 'Хуурсан, луйвардсан', 'Тоглоомыг зориуд эвдсэн', 'Зохисгүй нэр, зураг', 'Бусад'];

/** Sends a frame, nameplate or gift to a friend outside a room. Returns '' or the error. */
export async function sendFriendGift(to: string, item: ShopItem) {
  if (!supabase) return 'Сервер тохируулагдаагүй байна.';
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
    notify(item.kind === 'gift' ? 'Бэлэг илгээгдлээ!' : `${item.name} бэлэглэлээ!`, 'success');
    onClose();
  };

  const addFriend = async () => {
    if (!supabase) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('send_friend_request', { p_user: seat.user_id });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(data === 'friend' ? 'Та хоёр найз боллоо!' : 'Найзын хүсэлт илгээлээ.', 'success');
  };

  const sendReport = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('report_player', { p_target: seat.user_id, p_room: roomCode, p_reason: reason, p_message: note.trim() });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify('Гомдол админд илгээгдлээ. Баярлалаа.', 'success');
    onClose();
  };

  const name = card?.display_name ?? seat.display_name.replace(/ \(бот\)$/, '');
  const giftIcon = (key: string) => items.find((item) => item.key === key)?.icon || '🎁';
  let body: ReactNode;
  if (view === 'gift') {
    body = <GiftPicker targetName={name} allowCosmetics={!inGame} busy={busy} note="Бэлэг ширээн дээрх бүх хүнд харагдана." onBack={() => setView('card')} onSend={(item) => void sendGift(item)} />;
  } else if (view === 'report') {
    body = <>
      <div className="pcard-subhead"><button type="button" className="icon-button" onClick={() => setView('card')} aria-label="Буцах"><ArrowLeft size={14} /></button><b>{name}-г мэдээлэх</b></div>
      <div className="admin-choice-row report-reasons" role="radiogroup" aria-label="Шалтгаан">{REPORT_REASONS.map((item) => <button type="button" role="radio" aria-checked={reason === item} key={item}
        className={reason === item ? 'is-picked' : ''} onClick={() => setReason(item)}>{item}</button>)}</div>
      <label className="feedback-text"><textarea value={note} maxLength={600} onChange={(event) => setNote(event.target.value)} placeholder="Юу болсныг товч бичнэ үү (заавал биш)" /><small>{note.length}/600</small></label>
      <p className="pcard-note">Гомдлыг зөвхөн админ харна. Тоглогчид мэдэгдэхгүй.</p>
      <div className="modal-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void sendReport()}><Send size={14} /> АДМИНД ИЛГЭЭХ</button></div>
    </>;
  } else {
    body = <>
      <div className={`pcard-hero ${nameplate(card?.nameplate_key ?? seat.nameplate_key).className} ${rowBorderClass(card?.border_key ?? seat.border_key)}`} style={nameplate(card?.nameplate_key ?? seat.nameplate_key).style}>
        <RowBorder borderKey={card?.border_key ?? seat.border_key} />
        <Avatar name={name} color={card?.avatar_key ?? seat.color} url={card?.avatar_url ?? seat.avatar_url} frame={card?.frame_key ?? seat.frame_key} className="pcard-avatar">
          {isBot && <i className="bot-badge"><Bot size={12} /></i>}
        </Avatar>
        <div className="pcard-name">
          <h2>{name}{isMe && <small>ЧИ</small>}</h2>
          <TitleBadge titleKey={card?.title_key} items={items} size="lg" />
          {card && <div className="pcard-ranks">{RANK_GAMES.map((game) => <RankChip key={game} game={game} points={card.ranks?.find((entry) => entry.game_type === game)?.points ?? 0} />)}</div>}
          {isBot && <span className="pcard-rank">Бот тоглогч · дасгалын ширээнд</span>}
        </div>
      </div>
      {loadError && <p className="pcard-note">{loadError}</p>}
      {card && <>
        <div className="pcard-stats">
          <span><b>{card.total_matches}</b>Тоглолт</span><span><b>{card.wins}</b>Ялалт</span>
          <span><b>{Math.round(card.win_rate)}%</b>Ялалтын хувь</span><span><b>{card.gift_total}</b>Бэлэг</span>
        </div>
        {card.gifts.length > 0 && <div className="pcard-gifts" aria-label="Хүлээн авсан бэлгүүд">{card.gifts.slice(0, 8).map((entry) => <span key={entry.gift_key}>{giftIcon(entry.gift_key)}<small>×{entry.count}</small></span>)}</div>}
      </>}
      {!isMe && !isBot && <div className="modal-actions pcard-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void addFriend()}><UserPlus size={14} /> НАЙЗ</button>
        <button type="button" className="secondary-button" onClick={() => setView('report')}><Flag size={14} /> ГОМДОЛ</button>
        <button type="button" className="primary-button" onClick={() => setView('gift')}><Gift size={14} /> БЭЛЭГ ИЛГЭЭХ</button>
      </div>}
    </>;
  }

  return <div className="game-modal-backdrop pcard-backdrop" onClick={onClose}>
    <section className="game-modal pcard" role="dialog" aria-modal="true" aria-label={`${name} — профайл`} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="icon-button pcard-close" onClick={onClose} aria-label="Хаах"><X size={15} /></button>
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
function PlatePreview({ plateKey, borderKey, me, large = false }: { plateKey: string | null; borderKey?: string; me: { display_name: string; avatar_url: string | null; avatar_key: string; frame_key: string | null } | null; large?: boolean }) {
  const plate = nameplate(plateKey);
  return <span className={`plate-preview ${large ? 'is-large' : ''} ${plate.className} ${rowBorderClass(borderKey)}`} style={plate.style}>
    <RowBorder borderKey={borderKey} />
    <Avatar name={me?.display_name ?? 'Би'} color={me?.avatar_key ?? 'rose'} url={me?.avatar_url} />
    <b>{me?.display_name ?? 'Таны нэр'}</b>
  </span>;
}

type Owned = { item_key: string };
type Me = { coins: number; diamonds: number; frame_key: string | null; title_key: string | null; nameplate_key?: string | null; border_key?: string | null; avatar_url: string | null; avatar_key: string; display_name: string; bonus_claimed_at: string | null };

type ShopTab = ShopKind | 'pass';
const TABS: { key: ShopTab; label: string }[] = [{ key: 'frame', label: 'Аватар хүрээ' }, { key: 'nameplate', label: 'Нэрийн хавтан' }, { key: 'border', label: 'Нэрийн хүрээ' }, { key: 'gift', label: 'Бэлэг' }, { key: 'pass', label: 'Battle Pass' }];
const CURRENCY_HEADING: Record<Currency, string> = { coin: 'Зоосоор · энгийн, хөдөлгөөнгүй', diamond: 'Алмазаар · зурган гоёл' };
const GAME_SHORT: Record<RankGame, string> = { mafia: 'Мафи', monopoly: 'Монополь' };
type RankPrize = { game_type: RankGame; level: number; item_key: string | null };

export function ShopScreen({ onBack, notify }: { onBack: () => void; notify: NotifyFn }) {
  const items = useShopItems();
  const [tab, setTab] = useState<ShopTab>('frame');
  const [me, setMe] = useState<Me | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShopItem | null>(null);
  const [topUp, setTopUp] = useState(false);
  const [prizes, setPrizes] = useState<RankPrize[]>([]);
  const free = useFreeShopping();
  useEffect(() => {
    if (!supabase) return;
    void Promise.resolve(supabase.from('rank_rewards').select('game_type,level,item_key').not('item_key', 'is', null))
      .then(({ data }) => setPrizes((data as RankPrize[] | null) ?? [])).catch(() => undefined);
  }, []);

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
    if (error) { notify(failure(error), 'error'); return; }
    notify(done, 'success');
    if (fn === 'buy_item') playSfx('buy');
    void load();
  };

  const bonusReady = !me?.bonus_claimed_at || Date.now() - new Date(me.bonus_claimed_at).getTime() > 20 * 3600_000;
  const wallet: Wallet | null = me ? { coins: me.coins, diamonds: me.diamonds } : null;
  const shown = tab === 'pass' ? [] : items.filter((item) => item.kind === tab);
  // Plain looks for coins, painted ones for diamonds, each purse its own section; animated ones are rank prizes.
  const prizeOf = (key: string) => prizes.find((prize) => prize.item_key === key) ?? null;
  const rankList = shown.filter((item) => item.source === 'rank')
    .sort((left, right) => (prizeOf(left.key)?.game_type ?? '').localeCompare(prizeOf(right.key)?.game_type ?? '') || (prizeOf(left.key)?.level ?? 99) - (prizeOf(right.key)?.level ?? 99));
  const sections: Array<{ id: Currency | 'rank'; list: ShopItem[] }> = [
    { id: 'coin' as const, list: shown.filter((item) => forSale(item) && (item.currency ?? 'coin') === 'coin') },
    { id: 'rank' as const, list: rankList },
    { id: 'diamond' as const, list: shown.filter((item) => forSale(item) && item.currency === 'diamond') },
  ].filter((section) => section.list.length);
  const equippedKey = tab === 'frame' ? me?.frame_key : tab === 'title' ? me?.title_key : tab === 'nameplate' ? me?.nameplate_key : tab === 'border' ? me?.border_key : null;

  const card = (item: ShopItem) => {
    const prize = item.source === 'rank' ? prizeOf(item.key) : null;
    // Admins may wear anything; everyone else wears what they own.
    const has = owned.includes(item.key) || (free && item.source === 'rank');
    const equipped = equippedKey === item.key;
    return <article key={item.key} className={`shop-card ${equipped ? 'is-equipped' : ''} is-${item.currency ?? 'coin'}`}>
      <button type="button" className="shop-visual" onClick={() => setPreview(item)} aria-label={`${item.name} харах`}>
        {item.kind === 'frame' && <Avatar name={me?.display_name ?? 'Би'} color={me?.avatar_key ?? 'rose'} url={me?.avatar_url} frame={item.key} className="shop-avatar" />}
        {item.kind === 'gift' && <span className="gift-icon is-floating">{item.icon}</span>}
        {item.kind === 'title' && <TitlePlaque titleKey={item.key} name={item.name} size="lg" />}
        {item.kind === 'nameplate' && <PlatePreview plateKey={item.key} me={me} />}
        {item.kind === 'border' && <PlatePreview plateKey={me?.nameplate_key ?? null} borderKey={item.key} me={me} />}
      </button>
      <b>{item.name}</b>
      <small>{item.description}</small>
      {item.kind === 'gift'
        ? <span className="shop-price"><Price item={item} free={free} /></span>
        : equipped
          ? <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void call(item.key, 'equip_item', { p_kind: item.kind, p_key: null }, 'Тайллаа.')}><Check size={13} /> ЗҮҮСЭН</button>
          : has
            ? <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void call(item.key, 'equip_item', { p_kind: item.kind, p_key: item.key }, 'Зүүлээ!')}>ЗҮҮХ</button>
            : !forSale(item)
              ? <span className="shop-rank-lock"><Lock size={12} />{prize ? <>{GAME_SHORT[prize.game_type]} · {RANK_NAMES[prize.game_type][prize.level - 1]}</> : 'Цол ахиж авна'}</span>
              : <button type="button" className={`primary-button buy-${item.currency ?? 'coin'}`} disabled={busy !== null || !canAfford(item, wallet, free)} onClick={() => void call(item.key, 'buy_item', { p_key: item.key }, `${item.name} таных боллоо!`)}>{free ? <><ShoppingBag size={13} />ҮНЭГҮЙ АВАХ</> : <Price item={item} />}</button>}
    </article>;
  };

  return <div className="inner-screen panel-screen shop-screen">
    <header className="top-bar panel-top-bar">
      <button className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={17} /></button>
      <div className="top-title"><span>ХОТЫН ДЭЛГҮҮР</span><strong>ДЭЛГҮҮР</strong></div>
      <div className="panel-top-trailing">
        <button type="button" className={`shop-bonus ${bonusReady ? 'is-ready' : ''}`} disabled={!bonusReady || busy !== null}
          onClick={() => void call('bonus', 'claim_daily_bonus', {}, 'Өдрийн бонус +100 зоос!')}><Gift size={13} /> {bonusReady ? 'ӨДРИЙН +100' : 'МАРГААШ'}</button>
        <CoinCount value={me?.coins ?? null} className="is-big" />
        <DiamondCount value={me?.diamonds ?? null} className="is-big" onTopUp={() => setTopUp(true)} />
      </div>
    </header>
    <div className="panel-body shop-body">
      <div className="admin-choice-row shop-tabs" role="tablist">{TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} key={item.key}
        className={`${tab === item.key ? 'is-picked' : ''} ${item.key === 'pass' ? 'is-pass' : ''}`} onClick={() => setTab(item.key)}>{item.key === 'pass' && <Ticket size={12} />}{item.label}</button>)}</div>
      {tab === 'gift' && <p className="admin-note">Бэлгийг тоглолтын үеэр тоглогчийн зураг дээр дарж илгээнэ. Бүх хүнд харагдана. Дээр нь дарж харж болно.</p>}
      {tab === 'pass' ? <BattlePassSoon /> : sections.map((section) => <section key={section.id} className={`shop-section is-${section.id}`}>
        {sections.length > 1 || section.id !== 'coin'
          ? <h3 className="shop-section-title">{section.id === 'diamond' ? <Gem size={13} /> : section.id === 'rank' ? <Crown size={13} /> : <Coins size={13} />}{section.id === 'rank' ? 'Цол ахиж авна · хөдөлгөөнт' : CURRENCY_HEADING[section.id]}</h3>
          : null}
        {section.id === 'rank' && <p className="shop-section-note">Рэйтинг тоглолтод тухайн цолд анх хүрэхэд автоматаар таных болно.</p>}
        <div className={`shop-grid kind-${tab}`}>{section.list.map(card)}</div>
      </section>)}
      <p className="admin-note shop-foot"><Coins size={11} /> Зоосыг тоглож олно: ялбал +30 (рэйтинг +50), ялагдвал +10 (+15), өдөрт тоглолтоос 500 хүртэл, өдрийн бонус +100, цол ахихад шагнал. <Crown size={11} /> Хөдөлгөөнт хүрээг цол ахиж авна. <Gem size={11} /> Алмазыг цэнэглэж авна (тун удахгүй).</p>
    </div>
    {topUp && <TopUpModal onClose={() => setTopUp(false)} />}
    {preview && <div className="game-modal-backdrop" onClick={() => setPreview(null)}>
      <section className="game-modal shop-preview" role="dialog" aria-modal="true" aria-label={preview.name} onClick={(event) => event.stopPropagation()}>
        {preview.kind === 'frame' && <Avatar name={me?.display_name ?? 'Би'} color={me?.avatar_key ?? 'rose'} url={me?.avatar_url} frame={preview.key} className="shop-avatar is-preview" />}
        {preview.kind === 'gift' && <div className="gift-preview"><div className="gift-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ ['--i' as string]: index }} />)}</div><div className="gift-big">{preview.icon}</div></div>}
        {preview.kind === 'title' && <TitlePlaque titleKey={preview.key} name={preview.name} size="hero" />}
        {preview.kind === 'nameplate' && <PlatePreview plateKey={preview.key} me={me} large />}
        {preview.kind === 'border' && <PlatePreview plateKey={me?.nameplate_key ?? null} borderKey={preview.key} me={me} large />}
        <h2>{preview.name}</h2><p>{preview.description}</p>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPreview(null)}>ХААХ</button></div>
      </section>
    </div>}
  </div>;
}

/** The season pass, not open yet: a look at how its two tracks will work. */
function BattlePassSoon() {
  const tiers = [1, 2, 3, 4, 5, 6, 7, 8];
  const freePrize = ['50 зоос', 'Бэлэг', '100 зоос', 'Нэрийн хүрээ', '150 зоос', 'Бэлэг', '200 зоос', 'Хүрээ'];
  const premiumPrize = ['Алмаз', 'Хүрээ', 'Нэрийн хавтан', 'Алмаз', 'Эмоут', 'Нэрийн хүрээ', 'Алмаз', 'Улирлын хүрээ'];
  return <section className="pass-soon" aria-label="Battle Pass · тун удахгүй">
    <div className="pass-hero">
      <span className="pass-badge"><Ticket size={14} /> 1-Р УЛИРАЛ</span>
      <h2>Battle Pass</h2>
      <p>Тоглож XP цуглуулаад шат ахих бүрт шагнал авна. Үнэгүй зам бүх хүнд нээлттэй, алтан замыг алмазаар нээнэ.</p>
      <span className="pass-soon-tag"><Clock3 size={13} /> ТУН УДАХГҮЙ</span>
    </div>
    <div className="pass-track" aria-hidden="true">
      <div className="pass-row"><b>ҮНЭГҮЙ</b>{tiers.map((tier) => <span key={tier} className="pass-cell"><small>{tier}</small>{freePrize[tier - 1]}</span>)}</div>
      <div className="pass-row is-premium"><b><Crown size={12} /> АЛТАН</b>{tiers.map((tier) => <span key={tier} className="pass-cell"><Lock size={11} /><small>{tier}</small>{premiumPrize[tier - 1]}</span>)}</div>
    </div>
  </section>;
}
