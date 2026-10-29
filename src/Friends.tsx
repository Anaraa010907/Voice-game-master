import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Clipboard, Clock3, DoorOpen, Gift, MessageCircle, Search, Send, UserMinus, UserPlus, Users, X } from 'lucide-react';
import Avatar from './Avatar';
import { supabase } from './supabaseClient';
import type { NotifyFn } from './multiplayer';
import { GAMES, type GameType } from './games';
import { GiftPicker, sendFriendGift, useShopItems } from './Social';

/** How long a chat message lives (the server deletes older ones). */
const CHAT_LIFETIME_MS = 24 * 3600_000;

/* ---------- data ---------- */

export type Friend = {
  id: string; display_name: string; avatar_url: string | null; avatar_key: string; frame_key: string | null; player_no: number;
  status: 'pending' | 'accepted'; incoming: boolean; online: boolean;
  room_code: string | null; room_name: string | null; game_type: string | null; room_status: string | null;
  unread: number; last_message_at: string | null;
};
type Found = { id: string; display_name: string; avatar_url: string | null; avatar_key: string; frame_key: string | null; player_no: number; relation: 'friend' | 'incoming' | 'outgoing' | null };
type Message = { id: number; sender: string; recipient: string; kind: 'text' | 'invite' | 'gift'; body: string; room_code: string | null; gift_key: string | null; created_at: string };

const failure = (error: { message?: string } | null | undefined) => error?.message || 'Алдаа гарлаа. Дахин оролдоно уу.';

/** My friends and requests, kept fresh by realtime and a slow poll; also keeps my "online" mark alive. */
export function useFriends(userId: string | null) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const reload = useCallback(async () => {
    if (!supabase || !userId) { setFriends([]); return; }
    const { data } = await supabase.rpc('my_friends');
    setFriends((data as Friend[] | null) ?? []);
  }, [userId]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    const touch = () => { void Promise.resolve(client.rpc('touch_presence')).catch(() => undefined); };
    touch();
    void reload();
    const channel = client.channel(`friends-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => { void reload(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient=eq.${userId}` }, () => { void reload(); })
      .subscribe();
    const presence = window.setInterval(touch, 60000);
    const poll = window.setInterval(() => { void reload(); }, 45000);
    return () => { window.clearInterval(presence); window.clearInterval(poll); void client.removeChannel(channel); };
  }, [userId, reload]);

  const badge = friends.reduce((total, friend) => total + (friend.incoming ? 1 : 0) + (friend.status === 'accepted' ? friend.unread : 0), 0);
  return { friends, reload, badge };
}

/** New messages and invites while I am elsewhere in the app pop up as a toast. */
export function useMessageToasts(userId: string | null, quiet: boolean, notify: NotifyFn) {
  const quietRef = useRef(quiet);
  quietRef.current = quiet;
  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    const channel = client.channel(`dm-toast-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient=eq.${userId}` }, async (payload) => {
        if (quietRef.current) return;
        const message = payload.new as Message;
        const { data } = await client.rpc('my_friends');
        const sender = ((data as Friend[] | null) ?? []).find((friend) => friend.id === message.sender)?.display_name ?? 'Найз';
        notify(message.kind === 'invite' ? `${sender} таныг «${message.body}» өрөөнд урилаа. Найзууд хэсгээс нэгдээрэй.`
          : message.kind === 'gift' ? `${sender} танд ${message.body} бэлэглэлээ!` : `${sender}: ${message.body.slice(0, 60)}`, 'info');
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [userId, notify]);
}

/** "Онлайн", "Тоглож байна · Мафи", "Лобби · …" or "Офлайн". */
function presenceLine(friend: Friend) {
  const game = friend.game_type ? GAMES[friend.game_type as GameType]?.title ?? friend.game_type : '';
  if (friend.room_status === 'playing') return { text: `Тоглож байна · ${game}`, tone: 'is-playing' };
  if (friend.room_status === 'lobby') return { text: `Лобби · ${friend.room_name ?? game}`, tone: 'is-lobby' };
  return friend.online ? { text: 'Онлайн', tone: 'is-online' } : { text: 'Офлайн', tone: '' };
}

const clock = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  const today = new Date().toDateString() === date.toDateString();
  return `${today ? '' : `${date.getMonth() + 1}/${date.getDate()} `}${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/* ---------- screen ---------- */

export function FriendsScreen({ userId, playerNo, friendsState, myRoom, onBack, onJoinRoom, notify }: {
  userId: string; playerNo: number | null; friendsState: ReturnType<typeof useFriends>;
  /** The lobby I sit in, if any: friends can be invited to it. */
  myRoom: { code: string; name: string; status: string } | null;
  onBack: () => void; onJoinRoom: (roomCode: string) => Promise<void>; notify: NotifyFn;
}) {
  const { friends, reload } = friendsState;
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accepted = friends.filter((friend) => friend.status === 'accepted');
  const incoming = friends.filter((friend) => friend.incoming);
  const outgoing = friends.filter((friend) => friend.status === 'pending' && !friend.incoming);
  const selected = accepted.find((friend) => friend.id === selectedId) ?? null;

  useEffect(() => { if (!selectedId && accepted.length) setSelectedId(accepted[0].id); }, [selectedId, accepted]);

  const search = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!supabase) return;
    if (query.trim().replace('#', '').length < 2) { notify('Дор хаяж 2 тэмдэгт эсвэл ID бичнэ үү.'); return; }
    const { data, error } = await supabase.rpc('search_players', { p_query: query.trim() });
    if (error) { notify(failure(error), 'error'); return; }
    setFound((data as Found[] | null) ?? []);
  };

  const act = async (fn: string, args: Record<string, unknown>, done: string) => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(done, 'success');
    await reload();
    if (found) void search();
  };

  const copyId = async () => {
    if (!playerNo) return;
    try { await navigator.clipboard.writeText(String(playerNo)); notify('ID хуулагдлаа.', 'success'); } catch { notify(`Таны ID: #${playerNo}`); }
  };

  return <div className="inner-screen panel-screen friends-screen">
    <header className="top-bar panel-top-bar">
      <button className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={17} /></button>
      <div className="top-title"><span>НАЙЗУУД</span><strong>НАЙЗУУД {accepted.length ? `· ${accepted.length}` : ''}</strong></div>
      <div className="panel-top-trailing">{playerNo && <button type="button" className="my-id" onClick={() => void copyId()} title="ID хуулах">Миний ID <b>#{playerNo}</b><Clipboard size={12} /></button>}</div>
    </header>
    <div className="friends-layout">
      <aside className="friends-side">
        <form className="admin-search" onSubmit={(event) => void search(event)}>
          <Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID эсвэл нэрээр хайх" aria-label="Тоглогч хайх" />
          <button type="submit" className="secondary-button">ХАЙХ</button>
        </form>
        {found && <section className="friends-group">
          <header><span>ХАЙЛТЫН ҮР ДҮН</span><button type="button" className="icon-button" onClick={() => { setFound(null); setQuery(''); }} aria-label="Хаах"><X size={12} /></button></header>
          {found.length === 0 && <p className="panel-empty">Тоглогч олдсонгүй.</p>}
          {found.map((player) => <div className="friend-row" key={player.id}>
            <Avatar name={player.display_name} color={player.avatar_key} url={player.avatar_url} frame={player.frame_key} />
            <span className="friend-copy"><b>{player.display_name}</b><small>#{player.player_no}</small></span>
            {player.relation === 'friend' ? <span className="chip">НАЙЗ</span>
              : player.relation === 'outgoing' ? <span className="chip">ИЛГЭЭСЭН</span>
                : <button type="button" className="primary-button" disabled={busy} onClick={() => void act('send_friend_request', { p_user: player.id }, player.relation === 'incoming' ? 'Найз боллоо!' : 'Хүсэлт илгээлээ.')}>
                  <UserPlus size={13} /> {player.relation === 'incoming' ? 'ЗӨВШӨӨРӨХ' : 'НЭМЭХ'}</button>}
          </div>)}
        </section>}
        {incoming.length > 0 && <section className="friends-group">
          <header><span>НАЙЗЫН ХҮСЭЛТ · {incoming.length}</span></header>
          {incoming.map((friend) => <div className="friend-row is-request" key={friend.id}>
            <Avatar name={friend.display_name} color={friend.avatar_key} url={friend.avatar_url} frame={friend.frame_key} />
            <span className="friend-copy"><b>{friend.display_name}</b><small>#{friend.player_no}</small></span>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void act('respond_friend_request', { p_user: friend.id, p_accept: true }, 'Найз боллоо!')} aria-label="Зөвшөөрөх"><Check size={14} /></button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void act('respond_friend_request', { p_user: friend.id, p_accept: false }, 'Хүсэлтийг цуцаллаа.')} aria-label="Татгалзах"><X size={14} /></button>
          </div>)}
        </section>}
        <section className="friends-group">
          <header><span>НАЙЗУУД</span></header>
          {accepted.length === 0 && <p className="panel-empty">Одоогоор найз алга. Найзынхаа ID эсвэл нэрийг дээр хайгаад нэмээрэй.</p>}
          {accepted.map((friend) => {
            const presence = presenceLine(friend);
            return <button type="button" className={`friend-row is-friend ${selectedId === friend.id ? 'is-selected' : ''}`} key={friend.id} onClick={() => setSelectedId(friend.id)}>
              <Avatar name={friend.display_name} color={friend.avatar_key} url={friend.avatar_url} frame={friend.frame_key}><i className={`presence-dot ${presence.tone}`} /></Avatar>
              <span className="friend-copy"><b>{friend.display_name}</b><small className={presence.tone}>{presence.text}</small></span>
              {friend.unread > 0 && <span className="admin-count">{friend.unread}</span>}
            </button>;
          })}
        </section>
        {outgoing.length > 0 && <section className="friends-group">
          <header><span>ИЛГЭЭСЭН ХҮСЭЛТ</span></header>
          {outgoing.map((friend) => <div className="friend-row" key={friend.id}>
            <Avatar name={friend.display_name} color={friend.avatar_key} url={friend.avatar_url} frame={friend.frame_key} />
            <span className="friend-copy"><b>{friend.display_name}</b><small>Хариу хүлээж байна</small></span>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void act('remove_friend', { p_user: friend.id }, 'Хүсэлтээ буцаалаа.')}>БУЦААХ</button>
          </div>)}
        </section>}
      </aside>
      <section className="friends-main">
        {selected
          ? <FriendPanel key={selected.id} friend={selected} userId={userId} myRoom={myRoom} notify={notify} onJoinRoom={onJoinRoom}
            onRead={reload} onRemoved={() => { setSelectedId(null); void reload(); }} />
          : <div className="friends-empty"><Users size={28} /><p>Найзаа сонговол энд чатлах, бэлэг илгээх, өрөөндөө урих боломжтой.</p></div>}
      </section>
    </div>
  </div>;
}

/* ---------- one friend: chat, gifts, invite ---------- */

function FriendPanel({ friend, userId, myRoom, notify, onJoinRoom, onRead, onRemoved }: {
  friend: Friend; userId: string; myRoom: { code: string; name: string; status: string } | null;
  notify: NotifyFn; onJoinRoom: (roomCode: string) => Promise<void>; onRead: () => void; onRemoved: () => void;
}) {
  const items = useShopItems();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [view, setView] = useState<'chat' | 'gift'>('chat');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const presence = presenceLine(friend);
  const inGame = myRoom?.status === 'playing';

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('direct_messages').select('id,sender,recipient,kind,body,room_code,gift_key,created_at')
      .or(`and(sender.eq.${userId},recipient.eq.${friend.id}),and(sender.eq.${friend.id},recipient.eq.${userId})`)
      // Chats last one day; the server removes older messages every hour.
      .gte('created_at', new Date(Date.now() - CHAT_LIFETIME_MS).toISOString())
      .order('created_at', { ascending: false }).limit(80);
    setMessages(((data as Message[] | null) ?? []).reverse());
    await supabase.rpc('mark_chat_read', { p_from: friend.id });
    onRead();
  }, [friend.id, userId, onRead]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    void load();
    const channel = client.channel(`chat-${userId}-${friend.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient=eq.${userId}` }, (payload) => {
        if ((payload.new as Message).sender === friend.id) void load();
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [friend.id, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const element = list.current; if (element) element.scrollTop = element.scrollHeight; }, [messages.length, view]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!supabase || !body) return;
    setBusy(true);
    const { error } = await supabase.rpc('send_message', { p_to: friend.id, p_body: body });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    setDraft('');
    void load();
  };

  const invite = async () => {
    if (!supabase || !myRoom) return;
    setBusy(true);
    const { error } = await supabase.rpc('invite_friend', { p_to: friend.id, p_room: myRoom.code });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(`${friend.display_name}-г өрөөндөө урилаа.`, 'success');
    void load();
  };

  const remove = async () => {
    if (!supabase) return;
    const { error } = await supabase.rpc('remove_friend', { p_user: friend.id });
    if (error) { notify(failure(error), 'error'); return; }
    notify(`${friend.display_name}-г найзаас хаслаа.`);
    onRemoved();
  };

  const giftName = (key: string | null) => items.find((item) => item.key === key);

  return <div className="friend-panel">
    <header className="friend-head">
      <Avatar name={friend.display_name} color={friend.avatar_key} url={friend.avatar_url} frame={friend.frame_key} className="friend-head-avatar" />
      <span className="friend-copy"><b>{friend.display_name} <small>#{friend.player_no}</small></b><small className={presence.tone}>{presence.text}</small></span>
      <span className="friend-head-actions">
        {myRoom && myRoom.status === 'lobby' && <button type="button" className="primary-button" disabled={busy} onClick={() => void invite()}><DoorOpen size={13} /> УРИХ</button>}
        <button type="button" className={view === 'gift' ? 'primary-button' : 'secondary-button'} onClick={() => setView(view === 'gift' ? 'chat' : 'gift')}>{view === 'gift' ? <><MessageCircle size={13} /> ЧАТ</> : <><Gift size={13} /> БЭЛЭГ</>}</button>
        {confirmRemove
          ? <><button type="button" className="danger-button" onClick={() => void remove()}>ХАСАХ</button><button type="button" className="icon-button" onClick={() => setConfirmRemove(false)} aria-label="Болих"><X size={13} /></button></>
          : <button type="button" className="icon-button" onClick={() => setConfirmRemove(true)} aria-label="Найзаас хасах" title="Найзаас хасах"><UserMinus size={14} /></button>}
      </span>
    </header>
    {view === 'gift'
      ? <div className="friend-gift">{inGame
        ? <p className="panel-empty">Тоглолтын үеэр хүрээ, нэрийн хавтан бэлэглэх боломжгүй. Тоглолт дууссаны дараа илгээнэ үү.</p>
        : <GiftPicker targetName={friend.display_name} allowCosmetics busy={busy} note="Бэлэг чатанд харагдана."
          onSend={(item) => { setBusy(true); void sendFriendGift(friend.id, item).then((problem) => {
            setBusy(false);
            if (problem) { notify(problem, 'error'); return; }
            notify(`${friend.display_name}-д ${item.name} илгээлээ!`, 'success');
            setView('chat'); void load();
          }); }} />}</div>
      : <>
        <ol className="chat-list" ref={list} aria-live="polite">
          <li className="chat-expiry-note"><Clock3 size={11} /> Мессежүүд 24 цагийн дараа автоматаар устна.</li>
          {messages.length === 0 && <li className="chat-empty">Мэндчилгээ бичээд эхлээрэй 👋</li>}
          {messages.map((message) => {
            const mine = message.sender === userId;
            const gift = message.kind === 'gift' ? giftName(message.gift_key) : null;
            return <li key={message.id} className={`chat-message ${mine ? 'is-mine' : ''} kind-${message.kind}`}>
              {message.kind === 'invite'
                ? <div className="chat-card"><DoorOpen size={16} /><span><b>{mine ? 'Та урилаа' : 'Урилга'}</b>«{message.body}» өрөө</span>
                  {!mine && <button type="button" className="primary-button" disabled={busy || myRoom?.code === message.room_code} onClick={() => { if (message.room_code) { setBusy(true); void onJoinRoom(message.room_code).finally(() => setBusy(false)); } }}>
                    {myRoom?.code === message.room_code ? 'ӨРӨӨНД БАЙНА' : 'НЭГДЭХ'}</button>}</div>
                : message.kind === 'gift'
                  ? <div className="chat-card is-gift"><span className="gift-icon">{gift?.icon || '🎁'}</span><span><b>{mine ? 'Та бэлэглэлээ' : 'Бэлэг ирлээ!'}</b>{message.body}</span></div>
                  : <p>{message.body}</p>}
              <small>{clock(message.created_at)}</small>
            </li>;
          })}
        </ol>
        <form className="chat-input" onSubmit={(event) => void send(event)}>
          <input value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder={`${friend.display_name}-д бичих…`} aria-label="Мессеж" />
          <button type="submit" className="primary-button" disabled={busy || !draft.trim()} aria-label="Илгээх"><Send size={14} /></button>
        </form>
      </>}
  </div>;
}

/* ---------- lobby: invite friends ---------- */

export function InviteFriendsModal({ roomCode, friends, onClose, notify }: { roomCode: string; friends: Friend[]; onClose: () => void; notify: NotifyFn }) {
  const [sent, setSent] = useState<string[]>([]);
  const accepted = friends.filter((friend) => friend.status === 'accepted');
  const invite = async (friend: Friend) => {
    if (!supabase) return;
    const { error } = await supabase.rpc('invite_friend', { p_to: friend.id, p_room: roomCode });
    if (error) { notify(failure(error), 'error'); return; }
    setSent((current) => [...current, friend.id]);
  };
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal admin-ban-modal invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title" onClick={(event) => event.stopPropagation()}>
      <header><h2 id="invite-title"><UserPlus size={16} /> Найзаа урих</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Хаах"><X size={15} /></button></header>
      {accepted.length === 0 && <p className="panel-empty">Найз алга. Үндсэн цэсний "Найзууд" хэсгээс найз нэмээрэй.</p>}
      <div className="invite-list">{accepted.map((friend) => {
        const presence = presenceLine(friend);
        const here = friend.room_code === roomCode;
        return <div className="friend-row" key={friend.id}>
          <Avatar name={friend.display_name} color={friend.avatar_key} url={friend.avatar_url} frame={friend.frame_key}><i className={`presence-dot ${presence.tone}`} /></Avatar>
          <span className="friend-copy"><b>{friend.display_name}</b><small className={presence.tone}>{here ? 'Энэ өрөөнд байна' : presence.text}</small></span>
          <button type="button" className={sent.includes(friend.id) ? 'secondary-button' : 'primary-button'} disabled={here || sent.includes(friend.id)} onClick={() => void invite(friend)}>
            {sent.includes(friend.id) ? <><Check size={13} /> УРЬСАН</> : 'УРИХ'}</button>
        </div>;
      })}</div>
      <p className="admin-note">Урилга найзын тань чатанд очно. Нууц үгтэй өрөө байсан ч урилгаар шууд нэгдэнэ.</p>
    </section>
  </div>;
}
