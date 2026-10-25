import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft, Ban, Bug, Check, DoorClosed, Flag, History, Inbox, LayoutDashboard, Lightbulb, Lock, LogOut,
  Megaphone, MessageSquare, RefreshCw, Search, Send, ShieldCheck, Undo2, Users, X,
} from 'lucide-react';
import Avatar from './Avatar';
import { supabase } from './supabaseClient';
import { callGame, type NotifyFn } from './multiplayer';
import { GAMES, type GameType } from './games';

/* ---------- shared bits ---------- */

export type FeedbackCategory = 'idea' | 'bug' | 'report' | 'other';
export type PlayerBan = { reason: string; banned_until: string | null };

const CATEGORIES: { key: FeedbackCategory; label: string; icon: ReactNode }[] = [
  { key: 'idea', label: 'Санал', icon: <Lightbulb size={13} /> },
  { key: 'bug', label: 'Алдаа', icon: <Bug size={13} /> },
  { key: 'report', label: 'Тоглогчийн гомдол', icon: <Flag size={13} /> },
  { key: 'other', label: 'Бусад', icon: <MessageSquare size={13} /> },
];
const categoryLabel = (key: string) => CATEGORIES.find((item) => item.key === key)?.label ?? 'Бусад';

/** "5 мин өмнө" style times. */
export function ago(iso: string | null | undefined) {
  if (!iso) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'дөнгөж сая';
  if (minutes < 60) return `${minutes} мин өмнө`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} цагийн өмнө`;
  return `${Math.round(hours / 24)} өдрийн өмнө`;
}

/** When a ban ends, in the phone's own time. */
export function banEnd(until: string | null) {
  if (!until) return 'Бүрмөсөн';
  const date = new Date(until);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} хүртэл`;
}

export const banActive = (ban: PlayerBan | null | undefined) => Boolean(ban && (!ban.banned_until || new Date(ban.banned_until).getTime() > Date.now()));

const failure = (error: { message?: string } | null | undefined) => error?.message || 'Алдаа гарлаа. Дахин оролдоно уу.';

function PanelTopBar({ title, subtitle, onBack, trailing }: { title: string; subtitle: string; onBack: () => void; trailing?: ReactNode }) {
  return <header className="top-bar panel-top-bar">
    <button className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={17} /></button>
    <div className="top-title"><span>{subtitle}</span><strong>{title}</strong></div>
    <div className="panel-top-trailing">{trailing}</div>
  </header>;
}

/* ---------- menu announcement ---------- */

const DISMISS_KEY = 'mafia-shadows:announcement-dismissed';

/** The admin's live announcement, shown once per message until the player closes it. */
export function AnnouncementBanner() {
  const [item, setItem] = useState<{ id: number; message: string } | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.from('announcements').select('id,message').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        let dismissed = '';
        try { dismissed = window.localStorage.getItem(DISMISS_KEY) ?? ''; } catch { /* private mode */ }
        if (String(data.id) !== dismissed) setItem(data as { id: number; message: string });
      });
    return () => { active = false; };
  }, []);
  if (!item) return null;
  const close = () => {
    try { window.localStorage.setItem(DISMISS_KEY, String(item.id)); } catch { /* private mode */ }
    setItem(null);
  };
  return <div className="menu-announcement" role="status">
    <Megaphone size={14} /><p>{item.message}</p>
    <button type="button" className="icon-button" onClick={close} aria-label="Хаах"><X size={13} /></button>
  </div>;
}

/* ---------- banned player ---------- */

export function BannedOverlay({ ban, onSignOut, onFeedback }: { ban: PlayerBan; onSignOut: () => void; onFeedback: () => void }) {
  return <div className="game-modal-backdrop banned-backdrop">
    <section className="game-modal banned-modal" role="alertdialog" aria-modal="true" aria-labelledby="banned-title">
      <span className="banned-icon"><Lock size={22} /></span>
      <h2 id="banned-title">Таны бүртгэл хаагдсан байна</h2>
      <p className="banned-until">{banEnd(ban.banned_until)}</p>
      {ban.reason && <p className="banned-reason"><b>Шалтгаан:</b> {ban.reason}</p>}
      <p className="banned-hint">Буруу хаагдсан гэж үзэж байвал админд санал хүсэлт илгээгээрэй.</p>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onSignOut}><LogOut size={14} /> ГАРАХ</button>
        <button type="button" className="primary-button" onClick={onFeedback}><Send size={14} /> АДМИНД БИЧИХ</button>
      </div>
    </section>
  </div>;
}

/* ---------- player feedback ---------- */

type MyFeedback = { id: number; category: string; message: string; status: string; admin_reply: string | null; replied_at: string | null; created_at: string };

export function FeedbackScreen({ onBack, notify }: { onBack: () => void; notify: NotifyFn }) {
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<MyFeedback[]>([]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('feedback').select('id,category,message,status,admin_reply,replied_at,created_at').order('created_at', { ascending: false }).limit(20);
    setMine((data as MyFeedback[] | null) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || sending) return;
    if (message.trim().length < 3) { notify('Дор хаяж 3 тэмдэгт бичнэ үү.', 'error'); return; }
    setSending(true);
    const { error } = await supabase.rpc('send_feedback', { p_category: category, p_message: message.trim() });
    setSending(false);
    if (error) { notify(failure(error), 'error'); return; }
    setMessage('');
    notify('Админд илгээгдлээ. Баярлалаа!', 'success');
    void load();
  };

  return <div className="inner-screen panel-screen feedback-screen">
    <PanelTopBar title="САНАЛ ХҮСЭЛТ" subtitle="АДМИНД ИЛГЭЭХ" onBack={onBack} />
    <div className="panel-body feedback-body">
      <form className="feedback-form" onSubmit={send}>
        <div className="eyebrow left-eye">ЮУНЫ ТАЛААР ВЭ?</div>
        <div className="feedback-categories" role="radiogroup" aria-label="Төрөл">
          {CATEGORIES.map((item) => <button type="button" role="radio" aria-checked={category === item.key} key={item.key}
            className={category === item.key ? 'is-picked' : ''} onClick={() => setCategory(item.key)}>{item.icon}{item.label}</button>)}
        </div>
        <label className="feedback-text">
          <textarea value={message} maxLength={1000} onChange={(event) => setMessage(event.target.value)}
            placeholder={category === 'report' ? 'Ямар тоглогч, аль өрөөнд, юу болсныг бичнэ үү…' : category === 'bug' ? 'Юу хийж байхад ямар алдаа гарсныг бичнэ үү…' : 'Санал, хүсэлтээ энд бичнэ үү…'} />
          <small>{message.length}/1000</small>
        </label>
        <button type="submit" className="primary-button" disabled={sending || message.trim().length < 3}><Send size={14} /> {sending ? 'ИЛГЭЭЖ БАЙНА…' : 'ИЛГЭЭХ'}</button>
      </form>
      <section className="feedback-history" aria-label="Миний илгээсэн">
        <div className="eyebrow left-eye">МИНИЙ ИЛГЭЭСЭН</div>
        {mine.length === 0 && <p className="panel-empty">Одоогоор илгээсэн зүйл алга.</p>}
        {mine.map((item) => <article key={item.id} className={`feedback-card is-${item.status}`}>
          <header><span className="chip">{categoryLabel(item.category)}</span><small>{ago(item.created_at)}</small>
            <span className={`chip status-${item.status}`}>{item.status === 'resolved' ? 'ШИЙДСЭН' : 'ХҮЛЭЭГДЭЖ БАЙНА'}</span></header>
          <p>{item.message}</p>
          {item.admin_reply && <p className="feedback-reply"><ShieldCheck size={12} /> <b>Админ:</b> {item.admin_reply}</p>}
        </article>)}
      </section>
    </div>
  </div>;
}

/* ---------- admin panel ---------- */

type Tab = 'dash' | 'players' | 'feedback' | 'rooms' | 'announce' | 'log';
type Stats = { players: number; new_today: number; rooms_live: number; rooms_playing: number; open_feedback: number; banned: number };
type AdminPlayer = {
  id: string; display_name: string; avatar_url: string | null; email: string | null; provider: string; created_at: string;
  last_sign_in_at: string | null; total_matches: number; wins: number; is_admin: boolean; is_banned: boolean; banned_until: string | null; ban_reason: string | null;
};
type AdminFeedback = MyFeedback & { user_id: string; display_name: string; avatar_url: string | null };
type AdminRoom = { room_code: string; name: string; game_type: string; status: string; is_private: boolean; players: number; bots: number; max_players: number; host_name: string; updated_at: string };
type AdminAction = { id: number; admin_name: string; action: string; target: string | null; detail: string | null; created_at: string };

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'dash', label: 'Самбар', icon: <LayoutDashboard size={15} /> },
  { key: 'players', label: 'Тоглогчид', icon: <Users size={15} /> },
  { key: 'feedback', label: 'Санал хүсэлт', icon: <Inbox size={15} /> },
  { key: 'rooms', label: 'Өрөөнүүд', icon: <DoorClosed size={15} /> },
  { key: 'announce', label: 'Мэдэгдэл', icon: <Megaphone size={15} /> },
  { key: 'log', label: 'Түүх', icon: <History size={15} /> },
];
const BAN_CHOICES = [{ hours: 24, label: '1 өдөр' }, { hours: 72, label: '3 өдөр' }, { hours: 168, label: '7 өдөр' }, { hours: 720, label: '30 өдөр' }, { hours: 0, label: 'Бүрмөсөн' }];
const ACTION_LABEL: Record<string, string> = {
  ban: 'Тоглогч хаасан', unban: 'Хаалт арилгасан', 'room-close': 'Өрөө хаасан', 'feedback-resolve': 'Санал шийдсэн',
  'feedback-reopen': 'Санал дахин нээсэн', announcement: 'Мэдэгдэл нийтэлсэн', 'announcement-clear': 'Мэдэгдэл авсан',
};
const ROOM_STATUS: Record<string, string> = { lobby: 'ЛОББИ', playing: 'ТОГЛОЖ БАЙНА', finished: 'ДУУССАН' };

export function AdminScreen({ onBack, notify }: { onBack: () => void; notify: NotifyFn }) {
  const [tab, setTab] = useState<Tab>('dash');
  const [stats, setStats] = useState<Stats | null>(null);

  const loadStats = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_stats');
    if (error) { notify(failure(error), 'error'); return; }
    setStats(data as Stats);
  }, [notify]);
  useEffect(() => { void loadStats(); }, [loadStats, tab]);

  return <div className="inner-screen panel-screen admin-screen">
    <PanelTopBar title="АДМИНЫ САМБАР" subtitle="УДИРДЛАГА" onBack={onBack}
      trailing={<span className="admin-badge"><ShieldCheck size={13} /> АДМИН</span>} />
    <div className="admin-layout">
      <nav className="admin-tabs" aria-label="Админы хэсгүүд">
        {TABS.map((item) => <button type="button" key={item.key} className={tab === item.key ? 'is-active' : ''} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>
          {item.icon}<span>{item.label}</span>
          {item.key === 'feedback' && Boolean(stats?.open_feedback) && <b className="admin-count">{stats!.open_feedback}</b>}
        </button>)}
      </nav>
      <div className="admin-content">
        {tab === 'dash' && <Dashboard stats={stats} onOpen={setTab} />}
        {tab === 'players' && <PlayersTab notify={notify} onChanged={loadStats} />}
        {tab === 'feedback' && <FeedbackTab notify={notify} onChanged={loadStats} />}
        {tab === 'rooms' && <RoomsTab notify={notify} onChanged={loadStats} />}
        {tab === 'announce' && <AnnounceTab notify={notify} />}
        {tab === 'log' && <LogTab notify={notify} />}
      </div>
    </div>
  </div>;
}

function Dashboard({ stats, onOpen }: { stats: Stats | null; onOpen: (tab: Tab) => void }) {
  const tiles: { value: number | string; label: string; tab: Tab; tone?: string }[] = [
    { value: stats?.players ?? '…', label: 'Нийт тоглогч', tab: 'players' },
    { value: stats?.new_today ?? '…', label: 'Сүүлийн 24 цагт шинэ', tab: 'players' },
    { value: stats ? `${stats.rooms_live}` : '…', label: `Нээлттэй өрөө${stats ? ` · ${stats.rooms_playing} тоглож байна` : ''}`, tab: 'rooms' },
    { value: stats?.open_feedback ?? '…', label: 'Хариулаагүй санал хүсэлт', tab: 'feedback', tone: stats?.open_feedback ? 'alert' : '' },
    { value: stats?.banned ?? '…', label: 'Хаагдсан тоглогч', tab: 'players' },
  ];
  return <div className="admin-dash">
    <div className="admin-tiles">{tiles.map((tile) => <button type="button" key={tile.label} className={`admin-tile ${tile.tone ? `is-${tile.tone}` : ''}`} onClick={() => onOpen(tile.tab)}>
      <b>{tile.value}</b><span>{tile.label}</span></button>)}</div>
    <p className="admin-note">Тоглогч хаахад тэр нэвтэрч чадахгүй болж, сууж байсан өрөөнөөсөө гарна. Тоглож байсан тоглолтод нь ялагдал бичигдэнэ.</p>
  </div>;
}

function PlayersTab({ notify, onChanged }: { notify: NotifyFn; onChanged: () => void }) {
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null);
  const [banning, setBanning] = useState<AdminPlayer | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query = '') => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_list_players', { p_search: query, p_limit: 80 });
    if (error) { notify(failure(error), 'error'); return; }
    setPlayers((data as AdminPlayer[] | null) ?? []);
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const unban = async (player: AdminPlayer) => {
    setBusy(true);
    try {
      await callGame('admin-unban', { userId: player.id });
      notify(`${player.display_name}-ийн хаалтыг арилгалаа.`, 'success');
      void load(search); onChanged();
    } catch (cause) { notify(cause instanceof Error ? cause.message : failure(null), 'error'); }
    setBusy(false);
  };

  return <div className="admin-pane">
    <form className="admin-search" onSubmit={(event) => { event.preventDefault(); void load(search); }}>
      <Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Нэр эсвэл и-мэйлээр хайх" aria-label="Тоглогч хайх" />
      <button type="submit" className="secondary-button">ХАЙХ</button>
    </form>
    {players === null && <p className="panel-empty">Ачаалж байна…</p>}
    {players?.length === 0 && <p className="panel-empty">Тоглогч олдсонгүй.</p>}
    <ul className="admin-list">
      {players?.map((player) => <li key={player.id} className={player.is_banned ? 'is-banned' : ''}>
        <Avatar name={player.display_name} color="rose" url={player.avatar_url} className="admin-avatar" />
        <div className="admin-row-main">
          <b>{player.display_name}
            {player.is_admin && <span className="chip chip-gold">АДМИН</span>}
            {player.is_banned && <span className="chip chip-red">ХААГДСАН · {banEnd(player.banned_until)}</span>}
          </b>
          <small>{player.email ?? 'и-мэйлгүй'} · {player.provider === 'facebook' ? 'Facebook' : 'И-мэйл'} · бүртгүүлсэн {ago(player.created_at)} · сүүлд {ago(player.last_sign_in_at)}</small>
          <small>{player.total_matches} тоглолт · {player.wins} ялалт{player.is_banned && player.ban_reason ? ` · Шалтгаан: ${player.ban_reason}` : ''}</small>
        </div>
        {!player.is_admin && (player.is_banned
          ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void unban(player)}><Undo2 size={13} /> АРИЛГАХ</button>
          : <button type="button" className="danger-button" disabled={busy} onClick={() => setBanning(player)}><Ban size={13} /> ХААХ</button>)}
      </li>)}
    </ul>
    {banning && <BanDialog player={banning} onClose={() => setBanning(null)} onDone={() => { setBanning(null); void load(search); onChanged(); }} notify={notify} />}
  </div>;
}

function BanDialog({ player, onClose, onDone, notify }: { player: AdminPlayer; onClose: () => void; onDone: () => void; notify: NotifyFn }) {
  const [hours, setHours] = useState(24);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await callGame('admin-ban', { userId: player.id, hours, reason: reason.trim() });
      notify(`${player.display_name} хаагдлаа.`, 'success');
      onDone();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : failure(null), 'error');
      setBusy(false);
    }
  };
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal admin-ban-modal" role="dialog" aria-modal="true" aria-labelledby="ban-title" onClick={(event) => event.stopPropagation()}>
      <header><h2 id="ban-title"><Ban size={16} /> {player.display_name}-г хаах</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Хаах"><X size={15} /></button></header>
      <div className="admin-choice-row" role="radiogroup" aria-label="Хугацаа">
        {BAN_CHOICES.map((choice) => <button type="button" role="radio" aria-checked={hours === choice.hours} key={choice.hours}
          className={hours === choice.hours ? 'is-picked' : ''} onClick={() => setHours(choice.hours)}>{choice.label}</button>)}
      </div>
      <label className="auth-field"><span>ШАЛТГААН (тоглогчид харагдана)</span>
        <input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="Жишээ нь: Бусдыг доромжилсон" /></label>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>БОЛИХ</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void submit()}><Ban size={14} /> {busy ? 'ХААЖ БАЙНА…' : 'ХААХ'}</button>
      </div>
    </section>
  </div>;
}

function FeedbackTab({ notify, onChanged }: { notify: NotifyFn; onChanged: () => void }) {
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open');
  const [items, setItems] = useState<AdminFeedback[] | null>(null);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_list_feedback', { p_status: status, p_limit: 80 });
    if (error) { notify(failure(error), 'error'); return; }
    setItems((data as AdminFeedback[] | null) ?? []);
  }, [notify, status]);
  useEffect(() => { setItems(null); void load(); }, [load]);

  const answer = async (item: AdminFeedback, resolve: boolean) => {
    if (!supabase) return;
    setBusyId(item.id);
    const { error } = await supabase.rpc('admin_reply_feedback', { p_id: item.id, p_reply: replies[item.id] ?? '', p_resolve: resolve });
    setBusyId(null);
    if (error) { notify(failure(error), 'error'); return; }
    notify(resolve ? 'Шийдсэн гэж тэмдэглэлээ.' : 'Дахин нээлээ.', 'success');
    setReplies((current) => ({ ...current, [item.id]: '' }));
    void load(); onChanged();
  };

  return <div className="admin-pane">
    <div className="admin-choice-row" role="radiogroup" aria-label="Шүүлтүүр">
      {([['open', 'Шинэ'], ['resolved', 'Шийдсэн'], ['all', 'Бүгд']] as const).map(([key, label]) => <button type="button" role="radio" aria-checked={status === key} key={key}
        className={status === key ? 'is-picked' : ''} onClick={() => setStatus(key)}>{label}</button>)}
      <button type="button" className="icon-button admin-refresh" onClick={() => void load()} aria-label="Шинэчлэх"><RefreshCw size={14} /></button>
    </div>
    {items === null && <p className="panel-empty">Ачаалж байна…</p>}
    {items?.length === 0 && <p className="panel-empty">{status === 'open' ? 'Хариулаагүй санал хүсэлт алга.' : 'Санал хүсэлт алга.'}</p>}
    {items?.map((item) => <article key={item.id} className={`feedback-card admin-feedback is-${item.status}`}>
      <header>
        <Avatar name={item.display_name} color="rose" url={item.avatar_url} className="admin-avatar small" />
        <b>{item.display_name}</b><span className="chip">{categoryLabel(item.category)}</span><small>{ago(item.created_at)}</small>
        <span className={`chip status-${item.status}`}>{item.status === 'resolved' ? 'ШИЙДСЭН' : 'ШИНЭ'}</span>
      </header>
      <p>{item.message}</p>
      {item.admin_reply && <p className="feedback-reply"><ShieldCheck size={12} /> <b>Хариу:</b> {item.admin_reply}</p>}
      {item.status === 'open'
        ? <div className="admin-reply-row">
          <input value={replies[item.id] ?? ''} maxLength={1000} onChange={(event) => setReplies((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Хариу бичих (заавал биш)" aria-label="Хариу" />
          <button type="button" className="primary-button" disabled={busyId === item.id} onClick={() => void answer(item, true)}><Check size={13} /> {replies[item.id]?.trim() ? 'ХАРИУЛАХ' : 'ШИЙДСЭН'}</button>
        </div>
        : <button type="button" className="text-button" disabled={busyId === item.id} onClick={() => void answer(item, false)}><Undo2 size={12} /> Дахин нээх</button>}
    </article>)}
  </div>;
}

function RoomsTab({ notify, onChanged }: { notify: NotifyFn; onChanged: () => void }) {
  const [rooms, setRooms] = useState<AdminRoom[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_list_rooms');
    if (error) { notify(failure(error), 'error'); return; }
    setRooms((data as AdminRoom[] | null) ?? []);
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const close = async (room: AdminRoom) => {
    setBusy(true);
    try {
      await callGame('admin-close-room', { roomCode: room.room_code });
      notify(`${room.room_code} өрөөг хаалаа.`, 'success');
      setConfirm(null); void load(); onChanged();
    } catch (cause) { notify(cause instanceof Error ? cause.message : failure(null), 'error'); }
    setBusy(false);
  };

  return <div className="admin-pane">
    <div className="admin-choice-row"><span className="admin-pane-title">Одоо байгаа өрөөнүүд</span>
      <button type="button" className="icon-button admin-refresh" onClick={() => void load()} aria-label="Шинэчлэх"><RefreshCw size={14} /></button></div>
    {rooms === null && <p className="panel-empty">Ачаалж байна…</p>}
    {rooms?.length === 0 && <p className="panel-empty">Нээлттэй өрөө алга.</p>}
    <ul className="admin-list">
      {rooms?.map((room) => <li key={room.room_code}>
        <div className="admin-row-main">
          <b>{room.name} <span className="chip">{room.room_code}</span>{room.is_private && <Lock size={11} />}</b>
          <small>{GAMES[room.game_type as GameType]?.title ?? room.game_type} · эзэн {room.host_name} · {room.players} хүн{room.bots ? ` + ${room.bots} бот` : ''} / {room.max_players} · {ago(room.updated_at)}</small>
        </div>
        <span className={`chip room-${room.status}`}>{ROOM_STATUS[room.status] ?? room.status}</span>
        {confirm === room.room_code
          ? <span className="admin-confirm"><button type="button" className="danger-button" disabled={busy} onClick={() => void close(room)}>ТИЙМ, ХААХ</button>
            <button type="button" className="icon-button" onClick={() => setConfirm(null)} aria-label="Болих"><X size={13} /></button></span>
          : <button type="button" className="secondary-button" onClick={() => setConfirm(room.room_code)}><DoorClosed size={13} /> ХААХ</button>}
      </li>)}
    </ul>
  </div>;
}

function AnnounceTab({ notify }: { notify: NotifyFn }) {
  const [current, setCurrent] = useState<{ message: string; created_at: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('announcements').select('message,created_at').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setCurrent((data as { message: string; created_at: string } | null) ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const publish = async (message: string) => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_announcement', { p_message: message });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(message ? 'Мэдэгдэл нийтлэгдлээ.' : 'Мэдэгдлийг авлаа.', 'success');
    setDraft(''); void load();
  };

  return <div className="admin-pane admin-announce">
    <p className="admin-note">Мэдэгдэл бүх тоглогчийн үндсэн цэсний дээд хэсэгт харагдана. Тоглогч хаах хүртэл нэг удаа гарна.</p>
    <div className="admin-current">{current
      ? <><Megaphone size={14} /><p>{current.message}<small>{ago(current.created_at)} нийтэлсэн</small></p>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void publish('')}><X size={13} /> АВАХ</button></>
      : <p className="panel-empty">Одоо идэвхтэй мэдэгдэл алга.</p>}</div>
    <label className="feedback-text"><textarea value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)} placeholder="Жишээ нь: Шинэ хувилбар гарлаа! Апп-аа шинэчилнэ үү." /><small>{draft.length}/200</small></label>
    <button type="button" className="primary-button" disabled={busy || !draft.trim()} onClick={() => void publish(draft.trim())}><Megaphone size={14} /> НИЙТЛЭХ</button>
  </div>;
}

function LogTab({ notify }: { notify: NotifyFn }) {
  const [items, setItems] = useState<AdminAction[] | null>(null);
  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc('admin_recent_actions', { p_limit: 50 }).then(({ data, error }) => {
      if (error) notify(failure(error), 'error');
      setItems((data as AdminAction[] | null) ?? []);
    });
  }, [notify]);
  return <div className="admin-pane">
    {items === null && <p className="panel-empty">Ачаалж байна…</p>}
    {items?.length === 0 && <p className="panel-empty">Одоогоор үйлдэл алга.</p>}
    <ul className="admin-log">{items?.map((item) => <li key={item.id}>
      <small>{ago(item.created_at)}</small><b>{item.admin_name}</b><span>{ACTION_LABEL[item.action] ?? item.action}</span>
      {item.detail && <em>{item.detail}</em>}
    </li>)}</ul>
  </div>;
}
