import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Bot, Check, Coins, Flag, Gift, Send, ShoppingBag, Sparkles, Trophy, UserPlus, X } from 'lucide-react';
import Avatar, { RowBorder, nameplate, rowBorderClass } from './Avatar';
import { supabase } from './supabaseClient';
import type { NotifyFn, RoomSeat } from './multiplayer';
import { playSfx } from './sfx';

/* ---------- shop catalogue ---------- */

export type ShopKind = 'gift' | 'frame' | 'title' | 'nameplate' | 'border';
export type ShopItem = { key: string; kind: ShopKind; name: string; description: string; icon: string; price: number; sort: number };

let catalogue: Promise<ShopItem[]> | null = null;
/** The shop's items, loaded once per app start. */
export function loadShopItems(): Promise<ShopItem[]> {
  if (!supabase) return Promise.resolve([]);
  catalogue ??= Promise.resolve(supabase.from('shop_items').select('key,kind,name,description,icon,price,sort').order('sort'))
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

/** My coins, refreshed on demand. */
function useMyCoins() {
  const [coins, setCoins] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    const id = auth.session?.user.id;
    const query = supabase.from('profiles').select('coins');
    const { data } = await (id ? query.eq('id', id) : query).maybeSingle();
    if (data && typeof (data as { coins?: number }).coins === 'number') setCoins((data as { coins: number }).coins);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { coins, setCoins, refresh };
}

const failure = (error: { message?: string } | null | undefined) => error?.message || 'Алдаа гарлаа. Дахин оролдоно уу.';
const failureOf = (result: { error: { message?: string } | null }) => result.error ? failure(result.error) : '';

export function CoinCount({ value, className = '' }: { value: number | null; className?: string }) {
  return <span className={`coin-count ${className}`}><Coins size={13} />{value === null ? '…' : value.toLocaleString('en-US')}</span>;
}

/** A player's shop title, in gold. */
export function TitleBadge({ titleKey, items }: { titleKey?: string | null; items: ShopItem[] }) {
  const title = titleKey ? items.find((item) => item.key === titleKey) : null;
  return title ? <span className="title-badge"><Sparkles size={10} />{title.name}</span> : null;
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
  const { coins } = useMyCoins();
  const free = useFreeShopping();
  const [tab, setTab] = useState<GiftTab>('gift');
  const [picked, setPicked] = useState<string | null>(null);
  const shown = items.filter((item) => item.kind === tab);
  const choice = items.find((item) => item.key === picked);
  return <>
    <div className="pcard-subhead">{onBack && <button type="button" className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={14} /></button>}<b>{targetName}-д бэлэг</b><CoinCount value={coins} /></div>
    {allowCosmetics && <div className="admin-choice-row gift-tabs" role="tablist">{GIFT_TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} key={item.key}
      className={tab === item.key ? 'is-picked' : ''} onClick={() => { setTab(item.key); setPicked(null); }}>{item.label}</button>)}</div>}
    <div className={`gift-grid kind-${tab}`}>{shown.map((item) => <button type="button" key={item.key} className={picked === item.key ? 'is-picked' : ''} disabled={!free && coins !== null && coins < item.price}
      onClick={() => setPicked(item.key)} aria-pressed={picked === item.key}>
      {item.kind === 'gift' && <span className="gift-icon">{item.icon}</span>}
      {item.kind === 'frame' && <Avatar name={item.name} color="rose" frame={item.key} className="gift-frame-preview" />}
      {item.kind === 'nameplate' && <span className={`gift-plate-preview ${nameplate(item.key).className}`} style={nameplate(item.key).style} />}
      {item.kind === 'border' && <span className={`gift-plate-preview gift-border-preview ${rowBorderClass(item.key)}`}><RowBorder borderKey={item.key} /></span>}
      <b>{item.name}</b><small>{free ? 'ҮНЭГҮЙ' : <><Coins size={10} />{item.price}</>}</small></button>)}</div>
    <p className="pcard-note">{tab === 'gift' ? note : 'Найз тань энэ барааг өөрийн болгож авна. Аль хэдийн байгаа бол илгээгдэхгүй.'}</p>
    <div className="modal-actions"><button type="button" className="primary-button" disabled={busy || !choice} onClick={() => choice && onSend(choice)}>
      <Gift size={14} /> {choice ? (free ? 'ҮНЭГҮЙ ИЛГЭЭХ' : `${choice.price} ЗООСООР ИЛГЭЭХ`) : 'БЭЛЭГ СОНГОНО УУ'}</button></div>
  </>;
}

/* ---------- a player's card at the table ---------- */

type Card = {
  id: string; display_name: string; avatar_url: string | null; avatar_key: string; frame_key: string | null; title_key: string | null; nameplate_key?: string | null; border_key?: string | null;
  rank_name: string; rank_points: number; total_matches: number; wins: number; win_rate: number; best_win_streak: number;
  created_at: string; gift_total: number; gifts: { gift_key: string; count: number }[];
};

const REPORT_REASONS = ['Доромжилсон, хараасан', 'Хуурсан, луйвардсан', 'Тоглоомыг зориуд эвдсэн', 'Зохисгүй нэр, зураг', 'Бусад'];
const RANK_LABEL: Record<string, string> = { Rookie: 'Шинэ тоглогч', Bronze: 'Хүрэл', Silver: 'Мөнгө', Gold: 'Алт', Platinum: 'Платин', Diamond: 'Алмаз', Master: 'Мастер' };

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
          <TitleBadge titleKey={card?.title_key} items={items} />
          {card && <span className="pcard-rank"><Trophy size={11} /> {RANK_LABEL[card.rank_name] ?? card.rank_name} · {card.rank_points} оноо</span>}
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
type Me = { coins: number; frame_key: string | null; title_key: string | null; nameplate_key?: string | null; border_key?: string | null; avatar_url: string | null; avatar_key: string; display_name: string; bonus_claimed_at: string | null };

const TABS: { key: ShopKind; label: string }[] = [{ key: 'frame', label: 'Аватар хүрээ' }, { key: 'nameplate', label: 'Нэрийн хавтан' }, { key: 'border', label: 'Нэрийн хүрээ' }, { key: 'gift', label: 'Бэлэг' }, { key: 'title', label: 'Цол' }];

export function ShopScreen({ onBack, notify }: { onBack: () => void; notify: NotifyFn }) {
  const items = useShopItems();
  const [tab, setTab] = useState<ShopKind>('frame');
  const [me, setMe] = useState<Me | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShopItem | null>(null);
  const free = useFreeShopping();

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    const id = auth.session?.user.id;
    const profileQuery = supabase.from('profiles').select('coins,frame_key,title_key,nameplate_key,border_key,avatar_url,avatar_key,display_name,bonus_claimed_at');
    const [profile, mine] = await Promise.all([
      (id ? profileQuery.eq('id', id) : profileQuery).maybeSingle(),
      supabase.from('player_items').select('item_key'),
    ]);
    if (profile.data) setMe(profile.data as Me);
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
  const shown = items.filter((item) => item.kind === tab);
  const equippedKey = tab === 'frame' ? me?.frame_key : tab === 'title' ? me?.title_key : tab === 'nameplate' ? me?.nameplate_key : tab === 'border' ? me?.border_key : null;

  return <div className="inner-screen panel-screen shop-screen">
    <header className="top-bar panel-top-bar">
      <button className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={17} /></button>
      <div className="top-title"><span>ХОТЫН ДЭЛГҮҮР</span><strong>ДЭЛГҮҮР</strong></div>
      <div className="panel-top-trailing">
        <button type="button" className={`shop-bonus ${bonusReady ? 'is-ready' : ''}`} disabled={!bonusReady || busy !== null}
          onClick={() => void call('bonus', 'claim_daily_bonus', {}, 'Өдрийн бонус +100 зоос!')}><Gift size={13} /> {bonusReady ? 'ӨДРИЙН +100' : 'МАРГААШ'}</button>
        <CoinCount value={me?.coins ?? null} className="is-big" />
      </div>
    </header>
    <div className="panel-body shop-body">
      <div className="admin-choice-row shop-tabs" role="tablist">{TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} key={item.key}
        className={tab === item.key ? 'is-picked' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
      {tab === 'gift' && <p className="admin-note">Бэлгийг тоглолтын үеэр тоглогчийн зураг дээр дарж илгээнэ. Бүх хүнд харагдана. Дээр нь дарж харж болно.</p>}
      <div className={`shop-grid kind-${tab}`}>
        {shown.map((item) => {
          const has = owned.includes(item.key);
          const equipped = equippedKey === item.key;
          return <article key={item.key} className={`shop-card ${equipped ? 'is-equipped' : ''}`}>
            <button type="button" className="shop-visual" onClick={() => setPreview(item)} aria-label={`${item.name} харах`}>
              {item.kind === 'frame' && <Avatar name={me?.display_name ?? 'Би'} color={me?.avatar_key ?? 'rose'} url={me?.avatar_url} frame={item.key} className="shop-avatar" />}
              {item.kind === 'gift' && <span className="gift-icon is-floating">{item.icon}</span>}
              {item.kind === 'title' && <span className="title-badge is-large"><Sparkles size={12} />{item.name}</span>}
              {item.kind === 'nameplate' && <PlatePreview plateKey={item.key} me={me} />}
              {item.kind === 'border' && <PlatePreview plateKey={me?.nameplate_key ?? null} borderKey={item.key} me={me} />}
            </button>
            <b>{item.name}</b>
            <small>{item.description}</small>
            {item.kind === 'gift'
              ? <span className="shop-price">{free ? 'ҮНЭГҮЙ' : <><Coins size={12} />{item.price}</>}</span>
              : equipped
                ? <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void call(item.key, 'equip_item', { p_kind: item.kind, p_key: null }, 'Тайллаа.')}><Check size={13} /> ЗҮҮСЭН</button>
                : has
                  ? <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void call(item.key, 'equip_item', { p_kind: item.kind, p_key: item.key }, 'Зүүлээ!')}>ЗҮҮХ</button>
                  : <button type="button" className="primary-button" disabled={busy !== null || (!free && me !== null && me.coins < item.price)} onClick={() => void call(item.key, 'buy_item', { p_key: item.key }, `${item.name} таных боллоо!`)}><ShoppingBag size={13} />{free ? 'ҮНЭГҮЙ АВАХ' : <><Coins size={12} />{item.price}</>}</button>}
          </article>;
        })}
      </div>
      <p className="admin-note shop-foot">Одоогоор жишээ хувилбар: бүх тоглогч 1000 зоостой эхэлж, өдөр бүр 100 зоос авна. Зоос цэнэглэх, шинэ бараа нэмэхийг дараа ярилцана.</p>
    </div>
    {preview && <div className="game-modal-backdrop" onClick={() => setPreview(null)}>
      <section className="game-modal shop-preview" role="dialog" aria-modal="true" aria-label={preview.name} onClick={(event) => event.stopPropagation()}>
        {preview.kind === 'frame' && <Avatar name={me?.display_name ?? 'Би'} color={me?.avatar_key ?? 'rose'} url={me?.avatar_url} frame={preview.key} className="shop-avatar is-preview" />}
        {preview.kind === 'gift' && <div className="gift-preview"><div className="gift-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ ['--i' as string]: index }} />)}</div><div className="gift-big">{preview.icon}</div></div>}
        {preview.kind === 'title' && <span className="title-badge is-large"><Sparkles size={14} />{preview.name}</span>}
        {preview.kind === 'nameplate' && <PlatePreview plateKey={preview.key} me={me} large />}
        {preview.kind === 'border' && <PlatePreview plateKey={me?.nameplate_key ?? null} borderKey={preview.key} me={me} large />}
        <h2>{preview.name}</h2><p>{preview.description}</p>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPreview(null)}>ХААХ</button></div>
      </section>
    </div>}
  </div>;
}
