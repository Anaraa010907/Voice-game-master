import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft, Ban, Bug, Check, Clock3, Coins, DoorClosed, Eye, Flag, Flame, Gem, History, Inbox, LayoutDashboard, Lightbulb, Lock, LogOut, Megaphone, MessageSquare, Play, RefreshCw, Search, Send, ShieldCheck, Square, Ticket, Undo2, UserCog, Users, X,
} from 'lucide-react';
import Avatar from './Avatar';
import { supabase } from './supabaseClient';
import { callGame, type NotifyFn } from './multiplayer';
import { GAMES, type GameType } from './games';
import { Price, forSale, timeLeft, useShopItems, type Currency, type ShopOffer } from './Social';
import type { PassSeason } from './BattlePass';

import { isEnglish, t } from './lang';
import { translateMessage } from './i18n';
/* ---------- shared bits ---------- */

/** Admins do everything; moderators read reports and ban. */
export type StaffRole = 'admin' | 'moderator';
const ROLE_LABEL: Record<StaffRole, string> = { admin: t('АДМИН', 'ADMIN'), moderator: t('МОДЕРАТОР', 'MODERATOR') };

export type FeedbackCategory = 'idea' | 'bug' | 'report' | 'other';
export type PlayerBan = { reason: string; banned_until: string | null };

const CATEGORIES: { key: FeedbackCategory; label: string; icon: ReactNode }[] = [
  { key: 'idea', label: t('Санал', 'Idea'), icon: <Lightbulb size={13} /> },
  { key: 'bug', label: t('Алдаа', 'Bug'), icon: <Bug size={13} /> },
  { key: 'report', label: t('Тоглогчийн гомдол', 'Player report'), icon: <Flag size={13} /> },
  { key: 'other', label: t('Бусад', 'Other'), icon: <MessageSquare size={13} /> },
];
const categoryLabel = (key: string) => CATEGORIES.find((item) => item.key === key)?.label ?? t('Бусад', 'Other');

/** "5 мин өмнө" style times. */
export function ago(iso: string | null | undefined) {
  if (!iso) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return t('дөнгөж сая', 'just now');
  if (minutes < 60) return t(`${minutes} мин өмнө`, `${minutes} min ago`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(`${hours} цагийн өмнө`, `${hours} h ago`);
  return t(`${Math.round(hours / 24)} өдрийн өмнө`, `${Math.round(hours / 24)} days ago`);
}

/** When a ban ends, in the phone's own time. */
export function banEnd(until: string | null) {
  if (!until) return t('Бүрмөсөн', 'Permanent');
  const date = new Date(until);
  const pad = (value: number) => String(value).padStart(2, '0');
  return t(`${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} хүртэл`, `until ${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`);
}

export const banActive = (ban: PlayerBan | null | undefined) => Boolean(ban && (!ban.banned_until || new Date(ban.banned_until).getTime() > Date.now()));

const failure = (error: { message?: string } | null | undefined) => (error?.message ? translateMessage(error.message) : '') || t('Алдаа гарлаа. Дахин оролдоно уу.', 'Something went wrong. Please try again.');

function PanelTopBar({ title, subtitle, onBack, trailing }: { title: string; subtitle: string; onBack: () => void; trailing?: ReactNode }) {
  return <header className="top-bar panel-top-bar">
    <button className="icon-button" onClick={onBack} aria-label={t('Буцах', 'Back')}><ArrowLeft size={17} /></button>
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
    <button type="button" className="icon-button" onClick={close} aria-label={t('Хаах', 'Close')}><X size={13} /></button>
  </div>;
}

/* ---------- banned player ---------- */

export function BannedOverlay({ ban, onSignOut, onFeedback }: { ban: PlayerBan; onSignOut: () => void; onFeedback: () => void }) {
  return <div className="game-modal-backdrop banned-backdrop">
    <section className="game-modal banned-modal" role="alertdialog" aria-modal="true" aria-labelledby="banned-title">
      <span className="banned-icon"><Lock size={22} /></span>
      <h2 id="banned-title">{t(`Таны бүртгэл хаагдсан байна`, `Your account is banned`)}</h2>
      <p className="banned-until">{banEnd(ban.banned_until)}</p>
      {ban.reason && <p className="banned-reason"><b>{t(`Шалтгаан:`, `Reason:`)}</b> {ban.reason}</p>}
      <p className="banned-hint">{t(`Буруу хаагдсан гэж үзэж байвал админд санал хүсэлт илгээгээрэй.`, `If you think this is a mistake, send feedback to the admins.`)}</p>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onSignOut}><LogOut size={14} />{t(` ГАРАХ`, ` SIGN OUT`)}</button>
        <button type="button" className="primary-button" onClick={onFeedback}><Send size={14} />{t(` АДМИНД БИЧИХ`, ` WRITE TO ADMINS`)}</button>
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
    if (message.trim().length < 3) { notify(t('Дор хаяж 3 тэмдэгт бичнэ үү.', 'Please write at least 3 characters.'), 'error'); return; }
    setSending(true);
    const { error } = await supabase.rpc('send_feedback', { p_category: category, p_message: message.trim() });
    setSending(false);
    if (error) { notify(failure(error), 'error'); return; }
    setMessage('');
    notify(t('Админд илгээгдлээ. Баярлалаа!', 'Sent to the admins. Thank you!'), 'success');
    void load();
  };

  return <div className="inner-screen panel-screen feedback-screen">
    <PanelTopBar title={t('САНАЛ ХҮСЭЛТ', 'FEEDBACK')} subtitle={t('АДМИНД ИЛГЭЭХ', 'SEND TO ADMINS')} onBack={onBack} />
    <div className="panel-body feedback-body">
      <form className="feedback-form" onSubmit={send}>
        <div className="eyebrow left-eye">{t(`ЮУНЫ ТАЛААР ВЭ?`, `WHAT IS IT ABOUT?`)}</div>
        <div className="feedback-categories" role="radiogroup" aria-label={t('Төрөл', 'Type')}>
          {CATEGORIES.map((item) => <button type="button" role="radio" aria-checked={category === item.key} key={item.key}
            className={category === item.key ? 'is-picked' : ''} onClick={() => setCategory(item.key)}>{item.icon}{item.label}</button>)}
        </div>
        <label className="feedback-text">
          <textarea value={message} maxLength={1000} onChange={(event) => setMessage(event.target.value)}
            placeholder={category === 'report' ? t('Ямар тоглогч, аль өрөөнд, юу болсныг бичнэ үү…', 'Which player, which room and what happened…') : category === 'bug' ? t('Юу хийж байхад ямар алдаа гарсныг бичнэ үү…', 'What were you doing and what went wrong…') : t('Санал, хүсэлтээ энд бичнэ үү…', 'Write your ideas and requests here…')} />
          <small>{message.length}/1000</small>
        </label>
        <button type="submit" className="primary-button" disabled={sending || message.trim().length < 3}><Send size={14} /> {sending ? t('ИЛГЭЭЖ БАЙНА…', 'SENDING…') : t('ИЛГЭЭХ', 'SEND')}</button>
      </form>
      <section className="feedback-history" aria-label={t('Миний илгээсэн', 'Sent by me')}>
        <div className="eyebrow left-eye">{t(`МИНИЙ ИЛГЭЭСЭН`, `SENT BY ME`)}</div>
        {mine.length === 0 && <p className="panel-empty">{t(`Одоогоор илгээсэн зүйл алга.`, `Nothing sent yet.`)}</p>}
        {mine.map((item) => <article key={item.id} className={`feedback-card is-${item.status}`}>
          <header><span className="chip">{categoryLabel(item.category)}</span><small>{ago(item.created_at)}</small>
            <span className={`chip status-${item.status}`}>{item.status === 'resolved' ? t('ШИЙДСЭН', 'RESOLVED') : t('ХҮЛЭЭГДЭЖ БАЙНА', 'WAITING')}</span></header>
          <p>{item.message}</p>
          {item.admin_reply && <p className="feedback-reply"><ShieldCheck size={12} /> <b>{t(`Админ:`, `Admin:`)}</b> {item.admin_reply}</p>}
        </article>)}
      </section>
    </div>
  </div>;
}

/* ---------- admin panel ---------- */

type Tab = 'dash' | 'players' | 'feedback' | 'rooms' | 'offers' | 'pass' | 'announce' | 'log';
type Stats = { players: number; new_today: number; rooms_live: number; rooms_playing: number; open_feedback: number; banned: number };
type AdminPlayer = {
  id: string; display_name: string; avatar_url: string | null; email: string | null; provider: string; created_at: string;
  last_sign_in_at: string | null; total_matches: number; wins: number; coins: number; staff_role: StaffRole | null;
  is_banned: boolean; banned_until: string | null; ban_reason: string | null;
};
type AdminFeedback = MyFeedback & { user_id: string; display_name: string; avatar_url: string | null; target_user: string | null; target_name: string | null; room_code: string | null };
type AdminRoom = { room_code: string; name: string; game_type: string; status: string; is_private: boolean; players: number; bots: number; max_players: number; host_name: string; updated_at: string };
type AdminAction = { id: number; admin_name: string; action: string; target: string | null; detail: string | null; created_at: string };

const TABS: { key: Tab; label: string; icon: ReactNode; adminOnly?: boolean }[] = [
  { key: 'dash', label: t('Самбар', 'Dashboard'), icon: <LayoutDashboard size={15} /> },
  { key: 'players', label: t('Тоглогчид', 'Players'), icon: <Users size={15} /> },
  { key: 'feedback', label: t('Санал, гомдол', 'Feedback'), icon: <Inbox size={15} /> },
  { key: 'rooms', label: t('Өрөөнүүд', 'Rooms'), icon: <DoorClosed size={15} />, adminOnly: true },
  { key: 'offers', label: t('Онцлох', 'Featured'), icon: <Flame size={15} />, adminOnly: true },
  { key: 'pass', label: 'Battle Pass', icon: <Ticket size={15} />, adminOnly: true },
  { key: 'announce', label: t('Мэдэгдэл', 'Announcements'), icon: <Megaphone size={15} />, adminOnly: true },
  { key: 'log', label: t('Түүх', 'Log'), icon: <History size={15} />, adminOnly: true },
];
const BAN_CHOICES = [{ hours: 24, label: t('1 өдөр', '1 day') }, { hours: 72, label: t('3 өдөр', '3 days') }, { hours: 168, label: t('7 өдөр', '7 days') }, { hours: 720, label: t('30 өдөр', '30 days') }, { hours: 0, label: t('Бүрмөсөн', 'Permanent') }];
const ACTION_LABEL: Record<string, string> = {
  ban: t('Тоглогч хаасан', 'Banned a player'), unban: t('Хаалт арилгасан', 'Lifted a ban'), 'room-close': t('Өрөө хаасан', 'Closed a room'), 'feedback-resolve': t('Санал шийдсэн', 'Resolved feedback'),
  'feedback-reopen': t('Санал дахин нээсэн', 'Reopened feedback'), announcement: t('Мэдэгдэл нийтэлсэн', 'Posted an announcement'), 'announcement-clear': t('Мэдэгдэл авсан', 'Removed an announcement'),
  coins: t('Зоос өгсөн', 'Gave coins'), diamonds: t('Алмаз өгсөн', 'Gave diamonds'), role: t('Эрх өөрчилсөн', 'Changed a role'), offer: t('Онцлох санал нэмсэн', 'Added a featured offer'), 'offer-end': t('Онцлох санал зогсоосон', 'Stopped a featured offer'),
  'pass-start': t('Battle Pass эхлүүлсэн', 'Started a Battle Pass'), 'pass-end': t('Battle Pass дуусгасан', 'Ended a Battle Pass'),
};
const ROOM_STATUS: Record<string, string> = { lobby: t('ЛОББИ', 'LOBBY'), playing: t('ТОГЛОЖ БАЙНА', 'PLAYING'), finished: t('ДУУССАН', 'FINISHED') };

export function AdminScreen({ role, onBack, notify, onWatch }: { role: StaffRole; onBack: () => void; notify: NotifyFn; onWatch: (roomCode: string) => void }) {
  const isAdmin = role === 'admin';
  const tabs = TABS.filter((item) => isAdmin || !item.adminOnly);
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
    <PanelTopBar title={isAdmin ? t('АДМИНЫ САМБАР', 'ADMIN DASHBOARD') : t('МОДЕРАТОРЫН САМБАР', 'MODERATOR DASHBOARD')} subtitle={t('УДИРДЛАГА', 'CONTROL')} onBack={onBack}
      trailing={<span className={`admin-badge ${isAdmin ? '' : 'is-moderator'}`}><ShieldCheck size={13} /> {ROLE_LABEL[role]}</span>} />
    <div className="admin-layout">
      <nav className="admin-tabs" aria-label={t('Админы хэсгүүд', 'Admin sections')}>
        {tabs.map((item) => <button type="button" key={item.key} className={tab === item.key ? 'is-active' : ''} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>
          {item.icon}<span>{item.label}</span>
          {item.key === 'feedback' && Boolean(stats?.open_feedback) && <b className="admin-count">{stats!.open_feedback}</b>}
        </button>)}
      </nav>
      <div className="admin-content">
        {tab === 'dash' && <Dashboard stats={stats} isAdmin={isAdmin} onOpen={setTab} />}
        {tab === 'players' && <PlayersTab isAdmin={isAdmin} notify={notify} onChanged={loadStats} />}
        {tab === 'feedback' && <FeedbackTab notify={notify} onChanged={loadStats} />}
        {tab === 'rooms' && isAdmin && <RoomsTab notify={notify} onChanged={loadStats} onWatch={onWatch} />}
        {tab === 'offers' && isAdmin && <OffersTab notify={notify} />}
        {tab === 'pass' && isAdmin && <PassTab notify={notify} />}
        {tab === 'announce' && isAdmin && <AnnounceTab notify={notify} />}
        {tab === 'log' && isAdmin && <LogTab notify={notify} />}
      </div>
    </div>
  </div>;
}

function Dashboard({ stats, isAdmin, onOpen }: { stats: Stats | null; isAdmin: boolean; onOpen: (tab: Tab) => void }) {
  const tiles: { value: number | string; label: string; tab: Tab; tone?: string }[] = [
    { value: stats?.players ?? '…', label: t('Нийт тоглогч', 'Total players'), tab: 'players' },
    { value: stats?.new_today ?? '…', label: t('Сүүлийн 24 цагт шинэ', 'New in the last 24 hours'), tab: 'players' },
    { value: stats ? `${stats.rooms_live}` : '…', label: t(`Нээлттэй өрөө${stats ? ` · ${stats.rooms_playing} тоглож байна` : ''}`, `Open rooms${stats ? ` · ${stats.rooms_playing} playing` : ''}`), tab: isAdmin ? 'rooms' : 'dash' },
    { value: stats?.open_feedback ?? '…', label: t('Хариулаагүй санал хүсэлт', 'Unanswered feedback'), tab: 'feedback', tone: stats?.open_feedback ? 'alert' : '' },
    { value: stats?.banned ?? '…', label: t('Хаагдсан тоглогч', 'Banned players'), tab: 'players' },
  ];
  return <div className="admin-dash">
    <div className="admin-tiles">{tiles.map((tile) => <button type="button" key={tile.label} className={`admin-tile ${tile.tone ? `is-${tile.tone}` : ''}`} onClick={() => onOpen(tile.tab)}>
      <b>{tile.value}</b><span>{tile.label}</span></button>)}</div>
    <p className="admin-note">{t(`Тоглогч хаахад тэр нэвтэрч чадахгүй болж, сууж байсан өрөөнөөсөө гарна. Тоглож байсан тоглолтод нь ялагдал бичигдэнэ.`, `A banned player can’t sign in and is removed from their room. A match they were playing counts as a loss.`)}</p>
    <p className="admin-note">{isAdmin
      ? t('Админ: тоглогчдод зоос өгөх, админ/модератор эрх олгох, тоглож буй өрөөг ажиглах, өрөө хаах, мэдэгдэл нийтлэх. Дэлгүүр, бэлэг танд үнэгүй.', 'Admin: give players coins, grant admin/moderator roles, watch live rooms, close rooms, post announcements. The shop and gifts are free for you.')
      : t('Модератор: санал, гомдлыг харж хариулах, тоглогч хаах, хаалт арилгах.', 'Moderator: read and answer feedback and reports, ban and unban players.')}</p>
  </div>;
}

function PlayersTab({ isAdmin, notify, onChanged }: { isAdmin: boolean; notify: NotifyFn; onChanged: () => void }) {
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null);
  const [banning, setBanning] = useState<AdminPlayer | null>(null);
  const [giving, setGiving] = useState<{ player: AdminPlayer; currency: 'coin' | 'diamond' } | null>(null);
  const [promoting, setPromoting] = useState<AdminPlayer | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query = '') => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_find_players', { p_search: query, p_limit: 80 });
    if (error) { notify(failure(error), 'error'); return; }
    setPlayers((data as AdminPlayer[] | null) ?? []);
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const unban = async (player: AdminPlayer) => {
    setBusy(true);
    try {
      await callGame('admin-unban', { userId: player.id });
      notify(t(`${player.display_name}-ийн хаалтыг арилгалаа.`, `Lifted ${player.display_name}’s ban.`), 'success');
      void load(search); onChanged();
    } catch (cause) { notify(cause instanceof Error ? cause.message : failure(null), 'error'); }
    setBusy(false);
  };

  return <div className="admin-pane">
    <form className="admin-search" onSubmit={(event) => { event.preventDefault(); void load(search); }}>
      <Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isAdmin ? t('Нэр эсвэл и-мэйлээр хайх', 'Search by name or email') : t('Нэрээр хайх', 'Search by name')} aria-label={t('Тоглогч хайх', 'Find players')} />
      <button type="submit" className="secondary-button">{t(`ХАЙХ`, `SEARCH`)}</button>
    </form>
    {players === null && <p className="panel-empty">{t(`Ачаалж байна…`, `Loading…`)}</p>}
    {players?.length === 0 && <p className="panel-empty">{t(`Тоглогч олдсонгүй.`, `No players found.`)}</p>}
    <ul className="admin-list">
      {players?.map((player) => <li key={player.id} className={player.is_banned ? 'is-banned' : ''}>
        <Avatar name={player.display_name} color="rose" url={player.avatar_url} className="admin-avatar" />
        <div className="admin-row-main">
          <b>{player.display_name}
            {player.staff_role && <span className={`chip ${player.staff_role === 'admin' ? 'chip-gold' : 'chip-blue'}`}>{ROLE_LABEL[player.staff_role]}</span>}
            {player.is_banned && <span className="chip chip-red">{t(`ХААГДСАН · ${banEnd(player.banned_until)}`, `BANNED · ${banEnd(player.banned_until)}`)}</span>}
          </b>
          <small>{isAdmin ? t(`${player.email ?? 'и-мэйлгүй'} · `, `${player.email ?? 'no email'} · `) : ''}{player.provider === 'facebook' ? 'Facebook' : t('И-мэйл', 'Email')}{t(` · бүртгүүлсэн ${ago(player.created_at)} · сүүлд ${ago(player.last_sign_in_at)}`, ` · joined ${ago(player.created_at)} · last seen ${ago(player.last_sign_in_at)}`)}</small>
          <small>{t(`${player.total_matches} тоглолт · ${player.wins} ялалт · `, `${player.total_matches} matches · ${player.wins} wins · `)}<span className="admin-coins"><Coins size={10} />{player.coins.toLocaleString('en-US')}</span>{player.is_banned && player.ban_reason ? t(` · Шалтгаан: ${player.ban_reason}`, ` · Reason: ${player.ban_reason}`) : ''}</small>
        </div>
        <span className="admin-row-actions">
          {isAdmin && <button type="button" className="secondary-button" disabled={busy} onClick={() => setGiving({ player, currency: 'coin' })} title={t('Зоос өгөх, хасах', 'Give or take coins')}><Coins size={13} />{t(` ЗООС`, ` COINS`)}</button>}
          {isAdmin && <button type="button" className="secondary-button admin-diamond-button" disabled={busy} onClick={() => setGiving({ player, currency: 'diamond' })} title={t('Алмаз өгөх, хасах', 'Give or take diamonds')}><Gem size={13} />{t(` АЛМАЗ`, ` DIAMONDS`)}</button>}
          {isAdmin && <button type="button" className="secondary-button" disabled={busy} onClick={() => setPromoting(player)} title={t('Эрх өгөх', 'Grant a role')}><UserCog size={13} />{t(` ЭРХ`, ` ROLE`)}</button>}
          {!player.staff_role && (player.is_banned
            ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void unban(player)}><Undo2 size={13} />{t(` АРИЛГАХ`, ` UNBAN`)}</button>
            : <button type="button" className="danger-button" disabled={busy} onClick={() => setBanning(player)}><Ban size={13} />{t(` ХААХ`, ` BAN`)}</button>)}
        </span>
      </li>)}
    </ul>
    {banning && <BanDialog player={banning} onClose={() => setBanning(null)} onDone={() => { setBanning(null); void load(search); onChanged(); }} notify={notify} />}
    {giving && <CoinsDialog player={giving.player} initialCurrency={giving.currency} onClose={() => setGiving(null)} onDone={() => { setGiving(null); void load(search); }} notify={notify} />}
    {promoting && <RoleDialog player={promoting} onClose={() => setPromoting(null)} onDone={() => { setPromoting(null); void load(search); }} notify={notify} />}
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
      notify(t(`${player.display_name} хаагдлаа.`, `${player.display_name} is banned.`), 'success');
      onDone();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : failure(null), 'error');
      setBusy(false);
    }
  };
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal admin-ban-modal" role="dialog" aria-modal="true" aria-labelledby="ban-title" onClick={(event) => event.stopPropagation()}>
      <header><h2 id="ban-title"><Ban size={16} />{t(` ${player.display_name}-г хаах`, ` Ban ${player.display_name}`)}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t('Хаах', 'Close')}><X size={15} /></button></header>
      <div className="admin-choice-row" role="radiogroup" aria-label={t('Хугацаа', 'Length')}>
        {BAN_CHOICES.map((choice) => <button type="button" role="radio" aria-checked={hours === choice.hours} key={choice.hours}
          className={hours === choice.hours ? 'is-picked' : ''} onClick={() => setHours(choice.hours)}>{choice.label}</button>)}
      </div>
      <label className="auth-field"><span>{t(`ШАЛТГААН (тоглогчид харагдана)`, `REASON (the player sees it)`)}</span>
        <input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder={t('Жишээ нь: Бусдыг доромжилсон', 'For example: Insulted other players')} /></label>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>{t(`БОЛИХ`, `CANCEL`)}</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void submit()}><Ban size={14} /> {busy ? t('ХААЖ БАЙНА…', 'BANNING…') : t('ХААХ', 'BAN')}</button>
      </div>
    </section>
  </div>;
}

const COIN_PRESETS = [100, 500, 1000, 5000, 10000];
const DIAMOND_PRESETS = [10, 50, 100, 250, 500];

function CoinsDialog({ player, initialCurrency = 'coin', onClose, onDone, notify }: { player: AdminPlayer; initialCurrency?: 'coin' | 'diamond'; onClose: () => void; onDone: () => void; notify: NotifyFn }) {
  const [amount, setAmount] = useState(initialCurrency === 'diamond' ? '100' : '1000');
  const [take, setTake] = useState(false);
  /** Coins are earned in play; diamonds stand in for real-money top-ups until payment is connected. */
  const [currency, setCurrencyState] = useState<'coin' | 'diamond'>(initialCurrency);
  const setCurrency = (next: 'coin' | 'diamond') => {
    if (next === currency) return;
    setCurrencyState(next);
    setAmount(next === 'diamond' ? '100' : '1000');
  };
  const presets = currency === 'diamond' ? DIAMOND_PRESETS : COIN_PRESETS;
  const [diamonds, setDiamonds] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase || currency !== 'diamond') return;
    void Promise.resolve(supabase.from('profiles').select('diamonds').eq('id', player.id).maybeSingle())
      .then(({ data }) => setDiamonds((data as { diamonds?: number } | null)?.diamonds ?? 0));
  }, [currency, player.id]);
  const unit = currency === 'diamond' ? t('алмаз', 'diamonds') : t('зоос', 'coins');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const value = Number(amount || 0);
  const submit = async () => {
    if (!supabase || !value) return;
    setBusy(true);
    const { data, error } = await supabase.rpc(currency === 'diamond' ? 'admin_grant_diamonds' : 'admin_grant_coins', { p_user: player.id, p_amount: take ? -value : value, p_reason: reason.trim() });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(t(`${player.display_name}: ${take ? '−' : '+'}${value.toLocaleString('en-US')} ${unit}. Одоо ${Number(data).toLocaleString('en-US')}.`, `${player.display_name}: ${take ? '−' : '+'}${value.toLocaleString('en-US')} ${unit}. Now ${Number(data).toLocaleString('en-US')}.`), 'success');
    onDone();
  };
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal admin-ban-modal" role="dialog" aria-modal="true" aria-labelledby="coins-title" onClick={(event) => event.stopPropagation()}>
      <header><h2 id="coins-title">{currency === 'diamond' ? <Gem size={16} /> : <Coins size={16} />} {player.display_name}</h2><button type="button" className="icon-button" onClick={onClose} aria-label={t('Хаах', 'Close')}><X size={15} /></button></header>
      <div className="admin-choice-row" role="radiogroup" aria-label={t('Валют', 'Currency')}>
        <button type="button" role="radio" aria-checked={currency === 'coin'} className={currency === 'coin' ? 'is-picked' : ''} onClick={() => setCurrency('coin')}><Coins size={12} />{t(` Зоос`, ` Coins`)}</button>
        <button type="button" role="radio" aria-checked={currency === 'diamond'} className={currency === 'diamond' ? 'is-picked' : ''} onClick={() => setCurrency('diamond')}><Gem size={12} />{t(` Алмаз`, ` Diamonds`)}</button>
      </div>
      <p className="admin-note">{t(`Одоо `, `Has `)}{currency === 'diamond' ? (diamonds === null ? '…' : diamonds.toLocaleString('en-US')) + t(' алмазтай', ' diamonds') : player.coins.toLocaleString('en-US') + t(' зоостой', ' coins')}.</p>
      <div className="admin-choice-row" role="radiogroup" aria-label={t('Өгөх эсвэл хасах', 'Give or take')}>
        <button type="button" role="radio" aria-checked={!take} className={!take ? 'is-picked' : ''} onClick={() => setTake(false)}>{t(`Өгөх`, `Give`)}</button>
        <button type="button" role="radio" aria-checked={take} className={take ? 'is-picked' : ''} onClick={() => setTake(true)}>{t(`Хасах`, `Take`)}</button>
      </div>
      <div className="admin-choice-row">{presets.map((preset) => <button type="button" key={preset} className={value === preset ? 'is-picked' : ''} onClick={() => setAmount(String(preset))}>{preset.toLocaleString('en-US')}</button>)}</div>
      <label className="auth-field"><span>{t(`ХЭМЖЭЭ`, `AMOUNT`)}</span><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7))} /></label>
      <label className="auth-field"><span>{t(`ШАЛТГААН (заавал биш)`, `REASON (optional)`)}</span><input value={reason} maxLength={80} onChange={(event) => setReason(event.target.value)} placeholder={currency === 'diamond' ? t('Жишээ нь: 5000₮ цэнэглэлт', 'For example: 5000₮ top-up') : t('Жишээ нь: Тэмцээний шагнал', 'For example: Tournament prize')} /></label>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>{t(`БОЛИХ`, `CANCEL`)}</button>
        <button type="button" className="primary-button" disabled={busy || !value} onClick={() => void submit()}>{currency === 'diamond' ? <Gem size={14} /> : <Coins size={14} />} {take ? t('ХАСАХ', 'TAKE') : t('ӨГӨХ', 'GIVE')}</button>
      </div>
    </section>
  </div>;
}

const ROLE_CHOICES: { value: StaffRole | null; label: string; hint: string }[] = [
  { value: 'admin', label: t('Админ', 'Admin'), hint: t('Бүх эрх: зоос, эрх олгох, өрөө ажиглах, хаах', 'Everything: coins, roles, watching rooms, bans') },
  { value: 'moderator', label: t('Модератор', 'Moderator'), hint: t('Санал, гомдол харах, тоглогч хаах', 'Reads feedback and reports, bans players') },
  { value: null, label: t('Энгийн тоглогч', 'Player'), hint: t('Удирдах эрхгүй', 'No staff role') },
];

function RoleDialog({ player, onClose, onDone, notify }: { player: AdminPlayer; onClose: () => void; onDone: () => void; notify: NotifyFn }) {
  const [role, setRole] = useState<StaffRole | null>(player.staff_role);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_role', { p_user: player.id, p_role: role });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(`${player.display_name}: ${ROLE_CHOICES.find((choice) => choice.value === role)?.label}.`, 'success');
    onDone();
  };
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal admin-ban-modal" role="dialog" aria-modal="true" aria-labelledby="role-title" onClick={(event) => event.stopPropagation()}>
      <header><h2 id="role-title"><UserCog size={16} />{t(` ${player.display_name}-ийн эрх`, ` ${player.display_name}’s role`)}</h2><button type="button" className="icon-button" onClick={onClose} aria-label={t('Хаах', 'Close')}><X size={15} /></button></header>
      <div className="role-choices" role="radiogroup" aria-label={t('Эрх', 'Role')}>{ROLE_CHOICES.map((choice) => <button type="button" role="radio" aria-checked={role === choice.value} key={choice.label}
        className={role === choice.value ? 'is-picked' : ''} onClick={() => setRole(choice.value)}><b>{choice.label}</b><small>{choice.hint}</small></button>)}</div>
      {player.is_banned && role && <p className="admin-note">{t(`Энэ тоглогч хаагдсан байна. Эрх өгөхөөс өмнө хаалтыг нь арилгана уу.`, `This player is banned. Lift the ban before granting a role.`)}</p>}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>{t(`БОЛИХ`, `CANCEL`)}</button>
        <button type="button" className="primary-button" disabled={busy || role === player.staff_role} onClick={() => void submit()}><Check size={14} />{t(` ХАДГАЛАХ`, ` SAVE`)}</button>
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
    const { data, error } = await supabase.rpc('admin_feedback_inbox', { p_status: status, p_limit: 80 });
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
    notify(resolve ? t('Шийдсэн гэж тэмдэглэлээ.', 'Marked as resolved.') : t('Дахин нээлээ.', 'Reopened.'), 'success');
    setReplies((current) => ({ ...current, [item.id]: '' }));
    void load(); onChanged();
  };

  return <div className="admin-pane">
    <div className="admin-choice-row" role="radiogroup" aria-label={t('Шүүлтүүр', 'Filter')}>
      {([['open', t('Шинэ', 'New')], ['resolved', t('Шийдсэн', 'Resolved')], ['all', t('Бүгд', 'All')]] as const).map(([key, label]) => <button type="button" role="radio" aria-checked={status === key} key={key}
        className={status === key ? 'is-picked' : ''} onClick={() => setStatus(key)}>{label}</button>)}
      <button type="button" className="icon-button admin-refresh" onClick={() => void load()} aria-label={t('Шинэчлэх', 'Refresh')}><RefreshCw size={14} /></button>
    </div>
    {items === null && <p className="panel-empty">{t(`Ачаалж байна…`, `Loading…`)}</p>}
    {items?.length === 0 && <p className="panel-empty">{status === 'open' ? t('Хариулаагүй санал хүсэлт алга.', 'No unanswered feedback.') : t('Санал хүсэлт алга.', 'No feedback.')}</p>}
    {items?.map((item) => <article key={item.id} className={`feedback-card admin-feedback is-${item.status}`}>
      <header>
        <Avatar name={item.display_name} color="rose" url={item.avatar_url} className="admin-avatar small" />
        <b>{item.display_name}</b><span className="chip">{categoryLabel(item.category)}</span><small>{ago(item.created_at)}</small>
        <span className={`chip status-${item.status}`}>{item.status === 'resolved' ? t('ШИЙДСЭН', 'RESOLVED') : t('ШИНЭ', 'NEW')}</span>
      </header>
      {item.target_name && <p className="feedback-target"><Flag size={12} />{t(` Гомдол: `, ` Report: `)}<b>{item.target_name}</b>{item.room_code ? t(` · ${item.room_code} өрөө`, ` · room ${item.room_code}`) : ''}</p>}
      <p>{item.message}</p>
      {item.admin_reply && <p className="feedback-reply"><ShieldCheck size={12} /> <b>{t(`Хариу:`, `Reply:`)}</b> {item.admin_reply}</p>}
      {item.status === 'open'
        ? <div className="admin-reply-row">
          <input value={replies[item.id] ?? ''} maxLength={1000} onChange={(event) => setReplies((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={t('Хариу бичих (заавал биш)', 'Write a reply (optional)')} aria-label={t('Хариу', 'Reply')} />
          <button type="button" className="primary-button" disabled={busyId === item.id} onClick={() => void answer(item, true)}><Check size={13} /> {replies[item.id]?.trim() ? t('ХАРИУЛАХ', 'REPLY') : t('ШИЙДСЭН', 'RESOLVED')}</button>
        </div>
        : <button type="button" className="text-button" disabled={busyId === item.id} onClick={() => void answer(item, false)}><Undo2 size={12} />{t(` Дахин нээх`, ` Reopen`)}</button>}
    </article>)}
  </div>;
}

function RoomsTab({ notify, onChanged, onWatch }: { notify: NotifyFn; onChanged: () => void; onWatch: (roomCode: string) => void }) {
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
      notify(t(`${room.room_code} өрөөг хаалаа.`, `Closed room ${room.room_code}.`), 'success');
      setConfirm(null); void load(); onChanged();
    } catch (cause) { notify(cause instanceof Error ? cause.message : failure(null), 'error'); }
    setBusy(false);
  };

  return <div className="admin-pane">
    <div className="admin-choice-row"><span className="admin-pane-title">{t(`Одоо байгаа өрөөнүүд`, `Current rooms`)}</span>
      <button type="button" className="icon-button admin-refresh" onClick={() => void load()} aria-label={t('Шинэчлэх', 'Refresh')}><RefreshCw size={14} /></button></div>
    {rooms === null && <p className="panel-empty">{t(`Ачаалж байна…`, `Loading…`)}</p>}
    {rooms?.length === 0 && <p className="panel-empty">{t(`Нээлттэй өрөө алга.`, `No open rooms.`)}</p>}
    <ul className="admin-list">
      {rooms?.map((room) => <li key={room.room_code}>
        <div className="admin-row-main">
          <b>{room.name} <span className="chip">{room.room_code}</span>{room.is_private && <Lock size={11} />}</b>
          <small>{GAMES[room.game_type as GameType]?.title ?? room.game_type}{t(` · эзэн ${room.host_name} · ${room.players} хүн`, ` · host ${room.host_name} · ${room.players} players`)}{room.bots ? t(` + ${room.bots} бот`, ` + ${room.bots} bots`) : ''} / {room.max_players} · {ago(room.updated_at)}</small>
        </div>
        <span className={`chip room-${room.status}`}>{ROOM_STATUS[room.status] ?? room.status}</span>
        <button type="button" className="primary-button admin-watch-button" onClick={() => onWatch(room.room_code)}><Eye size={13} />{t(` ҮЗЭХ`, ` WATCH`)}</button>
        {confirm === room.room_code
          ? <span className="admin-confirm"><button type="button" className="danger-button" disabled={busy} onClick={() => void close(room)}>{t(`ТИЙМ, ХААХ`, `YES, CLOSE`)}</button>
            <button type="button" className="icon-button" onClick={() => setConfirm(null)} aria-label={t('Болих', 'Cancel')}><X size={13} /></button></span>
          : <button type="button" className="secondary-button" onClick={() => setConfirm(room.room_code)}><DoorClosed size={13} />{t(` ХААХ`, ` CLOSE`)}</button>}
      </li>)}
    </ul>
  </div>;
}

const OFFER_DAYS = [1, 3, 7, 14];
const KIND_LABEL: Record<string, string> = { frame: t('Хүрээ', 'Frame'), nameplate: t('Нэрийн хавтан', 'Nameplate'), border: t('Нэрийн хүрээ', 'Name border') };

/**
 * Limited offers: the weekly discount runs by itself (two painted looks, 20% off, Monday to Monday);
 * here an admin adds any look (not a rank prize) at a price for a few days, or ends one early.
 */
function OffersTab({ notify }: { notify: NotifyFn }) {
  const items = useShopItems();
  const [offers, setOffers] = useState<ShopOffer[] | null>(null);
  const [itemKey, setItemKey] = useState('');
  const [currency, setCurrency] = useState<Currency>('diamond');
  const [price, setPrice] = useState('');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('shop_offers').select('id,item_key,price,currency,starts_at,ends_at,auto').gt('ends_at', new Date().toISOString()).order('ends_at');
    if (error) notify(failure(error), 'error');
    setOffers((data as ShopOffer[] | null) ?? []);
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const choices = items.filter((item) => ['frame', 'nameplate', 'border'].includes(item.kind) && item.source !== 'rank');
  const picked = choices.find((item) => item.key === itemKey) ?? null;
  const pick = (key: string) => {
    setItemKey(key);
    const item = choices.find((entry) => entry.key === key);
    if (item) { setCurrency(item.currency ?? 'coin'); setPrice(String(Math.max(1, Math.round(item.price * 0.8)))); }
  };
  const amount = Number(price || 0);
  const nameOf = (key: string) => items.find((item) => item.key === key)?.name ?? key;

  const create = async () => {
    if (!supabase || !picked) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_create_offer', { p_item: picked.key, p_price: amount, p_currency: currency, p_hours: days * 24 });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(t(`${picked.name} онцлох санал боллоо.`, `${picked.name} is now a featured offer.`), 'success');
    setItemKey(''); setPrice(''); void load();
  };
  const end = async (offer: ShopOffer) => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_end_offer', { p_offer: offer.id });
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    notify(t('Санал зогслоо.', 'Offer stopped.'), 'success'); void load();
  };

  return <div className="admin-pane admin-offers">
    <p className="admin-note">{t(`Долоо хоног бүр 2 зурган гоёл 20% хямдарч автоматаар гарна (даваагаас даваа). Энд гараар нэмэх эсвэл зогсоож болно. Цолны шагналыг онцлох болгох боломжгүй.`, `Every week two painted looks go 20% off automatically (Monday to Monday). Add or stop offers by hand here. Rank rewards can’t be featured.`)}</p>
    <ul className="admin-offer-list">
      {offers === null && <li className="panel-empty">{t(`Ачаалж байна…`, `Loading…`)}</li>}
      {offers?.length === 0 && <li className="panel-empty">{t(`Одоо идэвхтэй санал алга.`, `No active offers.`)}</li>}
      {offers?.map((offer) => <li key={offer.id}>
        <span><b>{nameOf(offer.item_key)}</b><small>{offer.auto ? t('Долоо хоногийн', 'Weekly') : t('Гараар нэмсэн', 'Added by hand')} · <Clock3 size={10} />{t(` ${timeLeft(offer.ends_at)} үлдсэн`, ` ${timeLeft(offer.ends_at)} left`)}</small></span>
        <Price item={offer} />
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void end(offer)}><X size={13} />{t(` ЗОГСООХ`, ` STOP`)}</button>
      </li>)}
    </ul>
    <h4 className="admin-subhead">{t(`Шинэ санал`, `New offer`)}</h4>
    <label className="auth-field"><span>{t(`ГОЁЛ`, `LOOK`)}</span>
      <select value={itemKey} onChange={(event) => pick(event.target.value)}>
        <option value="">{t(`Сонгоно уу`, `Choose`)}</option>
        {choices.map((item) => <option key={item.key} value={item.key}>{KIND_LABEL[item.kind]} · {item.name} ({item.price} {item.currency === 'diamond' ? t('алмаз', 'diamonds') : t('зоос', 'coins')}{forSale(item) ? '' : t(' · зөвхөн онцлох', ' · featured only')})</option>)}
      </select>
    </label>
    <div className="admin-choice-row" role="radiogroup" aria-label={t('Валют', 'Currency')}>
      {(['diamond', 'coin'] as Currency[]).map((option) => <button type="button" role="radio" aria-checked={currency === option} key={option} className={currency === option ? 'is-picked' : ''} onClick={() => setCurrency(option)}>
        {option === 'diamond' ? <><Gem size={12} />{t(` Алмаз`, ` Diamonds`)}</> : <><Coins size={12} />{t(` Зоос`, ` Coins`)}</>}</button>)}
    </div>
    <label className="auth-field"><span>{t(`ҮНЭ`, `PRICE`)}{picked ? t(` · ердийн ${picked.price}`, ` · normally ${picked.price}`) : ''}</span><input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7))} /></label>
    <div className="admin-choice-row" role="radiogroup" aria-label={t('Хугацаа', 'Length')}>
      {OFFER_DAYS.map((option) => <button type="button" role="radio" aria-checked={days === option} key={option} className={days === option ? 'is-picked' : ''} onClick={() => setDays(option)}>{t(`${option} өдөр`, `${option} days`)}</button>)}
    </div>
    <button type="button" className="primary-button" disabled={busy || !picked || !price} onClick={() => void create()}><Flame size={14} />{t(` САНАЛ НЭМЭХ`, ` ADD OFFER`)}</button>
  </div>;
}

/* ---------- battle pass ---------- */

type PassRewardRow = { season_id: number; tier: number; track: 'free' | 'premium'; kind: 'coins' | 'diamonds' | 'item'; amount: number; item_key: string | null };
type PassStats = { players: number; premium: number; claims: number };
const PASS_DAYS = [30, 42, 60, 90];
const SEASON_STATUS: Record<PassSeason['status'], { label: string; chip: string }> = {
  draft: { label: t('БЭЛЭН · ЭХЛЭЭГҮЙ', 'READY · NOT STARTED'), chip: 'chip-blue' },
  active: { label: t('ИДЭВХТЭЙ', 'ACTIVE'), chip: 'chip-gold' },
  ended: { label: t('ДУУССАН', 'ENDED'), chip: 'chip-red' },
};

/**
 * Battle Pass seasons are written ahead as drafts (tiers and rewards). An admin starts one when
 * the game is ready (choosing its length and the gold-track price), and can end it early.
 */
function PassTab({ notify }: { notify: NotifyFn }) {
  const items = useShopItems();
  const [seasons, setSeasons] = useState<PassSeason[] | null>(null);
  const [rewards, setRewards] = useState<PassRewardRow[]>([]);
  const [stats, setStats] = useState<Record<number, PassStats>>({});
  const [days, setDays] = useState(42);
  const [price, setPrice] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState<{ id: number; action: 'start' | 'end' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('pass_seasons').select('id,name,name_en,tiers,xp_per_tier,premium_price,status,starts_at,ends_at').order('id', { ascending: false });
    if (error) notify(failure(error), 'error');
    const list = ((data as Array<PassSeason & { name_en?: string | null }> | null) ?? []).map(({ name_en, ...season }) => (isEnglish && name_en ? { ...season, name: name_en } : season));
    setSeasons(list);
    const ids = list.map((season) => season.id);
    if (!ids.length) return;
    const { data: rows } = await supabase.from('pass_rewards').select('season_id,tier,track,kind,amount,item_key').in('season_id', ids);
    setRewards((rows as PassRewardRow[] | null) ?? []);
    const live = list.filter((season) => season.status !== 'draft');
    const entries = await Promise.all(live.map(async (season) => {
      const { data: result } = await supabase!.rpc('admin_pass_stats', { p_season: season.id });
      return [season.id, (result as PassStats | null) ?? { players: 0, premium: 0, claims: 0 }] as const;
    }));
    setStats(Object.fromEntries(entries));
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const act = async (season: PassSeason, action: 'start' | 'end') => {
    if (!supabase) return;
    const cost = Number(price[season.id] ?? season.premium_price);
    setBusy(true);
    const { error } = action === 'start'
      ? await supabase.rpc('admin_start_pass_season', { p_season: season.id, p_days: days, p_price: cost })
      : await supabase.rpc('admin_end_pass_season', { p_season: season.id });
    setBusy(false);
    setConfirm(null);
    if (error) { notify(failure(error), 'error'); return; }
    notify(action === 'start' ? t(`${season.name} эхэллээ! Тоглогчид одоо XP цуглуулна.`, `${season.name} has started! Players now earn XP.`) : t(`${season.name} дууслаа. Тоглогчид 3 хоногийн дотор шагналаа авч болно.`, `${season.name} has ended. Players can claim rewards for 3 more days.`), 'success');
    void load();
  };

  const summary = (season: PassSeason, track: 'free' | 'premium') => {
    const list = rewards.filter((reward) => reward.season_id === season.id && reward.track === track);
    const coins = list.filter((reward) => reward.kind === 'coins').reduce((sum, reward) => sum + reward.amount, 0);
    const gems = list.filter((reward) => reward.kind === 'diamonds').reduce((sum, reward) => sum + reward.amount, 0);
    const looks = list.filter((reward) => reward.kind === 'item').map((reward) => items.find((item) => item.key === reward.item_key)?.name ?? reward.item_key);
    return <span className={`admin-pass-track is-${track}`}>
      <b>{track === 'free' ? t('Үнэгүй зам', 'Free track') : t('Алтан зам', 'Gold track')}</b>
      <span><Coins size={11} /> {coins.toLocaleString('en-US')} · <Gem size={11} />{t(` ${gems} · ${looks.length} гоёл`, ` ${gems} · ${looks.length} looks`)}</span>
      {looks.length > 0 && <small>{looks.join(', ')}</small>}
    </span>;
  };

  const active = seasons?.find((season) => season.status === 'active');

  return <div className="admin-pane admin-pass">
    <p className="admin-note">{t(`Улирал бүр урьдчилан бэлдэгдсэн байна (шат, шагнал). Тоглоомоо гаргахдаа энд “ЭХЛҮҮЛЭХ” дарна. Эхлэхэд алтан замын гоёлууд дэлгүүрээс гарч зөвхөн Battle Pass-аар авагдана; улирал дуусахад онцлох санал болж эргэж ирнэ.`, `Each season is prepared ahead (tiers and rewards). When you launch the game, press “START” here. Once it starts, the gold-track looks leave the shop and come only from the Battle Pass; when the season ends they return as featured offers.`)}</p>
    {seasons === null && <p className="panel-empty">{t(`Ачаалж байна…`, `Loading…`)}</p>}
    {seasons?.length === 0 && <p className="panel-empty">{t(`Улирал алга.`, `No seasons.`)}</p>}
    <ul className="admin-pass-list">{seasons?.map((season) => {
      const status = SEASON_STATUS[season.status];
      const numbers = stats[season.id];
      const asking = confirm?.id === season.id ? confirm.action : null;
      const cost = price[season.id] ?? String(season.premium_price);
      return <li key={season.id} className={`is-${season.status}`}>
        <div className="admin-pass-head">
          <b><Ticket size={14} /> {season.name}</b>
          <span className={`chip ${status.chip}`}>{status.label}</span>
        </div>
        <small className="admin-pass-meta">{t(`${season.tiers} шат · шат бүр ${season.xp_per_tier} XP · алтан зам ${season.premium_price} алмаз`, `${season.tiers} tiers · ${season.xp_per_tier} XP each · gold track ${season.premium_price} diamonds`)}
          {season.status === 'active' && season.ends_at && <> · <Clock3 size={10} />{t(` ${timeLeft(season.ends_at)} үлдсэн`, ` ${timeLeft(season.ends_at)} left`)}</>}
          {season.status === 'ended' && season.ends_at && <>{t(` · ${ago(season.ends_at)} дууссан`, ` · ended ${ago(season.ends_at)}`)}</>}</small>
        <div className="admin-pass-tracks">{summary(season, 'free')}{summary(season, 'premium')}</div>
        {numbers && <div className="admin-pass-stats">
          <span><b>{numbers.players}</b>{t(` тоглогч XP авсан`, ` players earned XP`)}</span>
          <span><b>{numbers.premium}</b>{t(` алтан зам авсан`, ` bought the gold track`)}</span>
          <span><b>{numbers.claims}</b>{t(` шагнал авагдсан`, ` rewards claimed`)}</span>
        </div>}
        {season.status === 'draft' && <div className="admin-pass-start">
          <div className="admin-choice-row" role="radiogroup" aria-label={t('Улирлын урт', 'Season length')}>
            {PASS_DAYS.map((option) => <button type="button" role="radio" aria-checked={days === option} key={option} className={days === option ? 'is-picked' : ''} onClick={() => setDays(option)}>{t(`${option} хоног`, `${option} days`)}</button>)}
          </div>
          <label className="auth-field"><span>{t(`АЛТАН ЗАМЫН ҮНЭ (алмаз)`, `GOLD TRACK PRICE (diamonds)`)}</span>
            <input inputMode="numeric" value={cost} onChange={(event) => setPrice((current) => ({ ...current, [season.id]: event.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 5) }))} /></label>
          {asking === 'start'
            ? <div className="admin-confirm"><span>{t(`${days} хоногийн улирал ${cost} алмазаар эхлүүлэх үү?`, `Start a ${days}-day season for ${cost} diamonds?`)}</span>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirm(null)}>{t(`БОЛИХ`, `CANCEL`)}</button>
              <button type="button" className="primary-button" disabled={busy} onClick={() => void act(season, 'start')}><Check size={14} />{t(` ТИЙМ, ЭХЛҮҮЛЭХ`, ` YES, START`)}</button></div>
            : <button type="button" className="primary-button" disabled={busy || Boolean(active) || cost === ''} onClick={() => setConfirm({ id: season.id, action: 'start' })}><Play size={14} />{t(` ЭХЛҮҮЛЭХ`, ` START`)}</button>}
          {active && <small className="admin-note">{t(`“${active.name}” явж байгаа тул эхлээд түүнийг дуусгана.`, `“${active.name}” is running, so end it first.`)}</small>}
        </div>}
        {season.status === 'active' && (asking === 'end'
          ? <div className="admin-confirm"><span>{t(`Улирлыг одоо дуусгах уу? Буцаах боломжгүй.`, `End the season now? This can’t be undone.`)}</span>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirm(null)}>{t(`БОЛИХ`, `CANCEL`)}</button>
            <button type="button" className="danger-button" disabled={busy} onClick={() => void act(season, 'end')}><Square size={13} />{t(` ТИЙМ, ДУУСГАХ`, ` YES, END`)}</button></div>
          : <button type="button" className="danger-button admin-pass-end" disabled={busy} onClick={() => setConfirm({ id: season.id, action: 'end' })}><Square size={13} />{t(` ДУУСГАХ`, ` END`)}</button>)}
      </li>;
    })}</ul>
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
    notify(message ? t('Мэдэгдэл нийтлэгдлээ.', 'Announcement posted.') : t('Мэдэгдлийг авлаа.', 'Announcement removed.'), 'success');
    setDraft(''); void load();
  };

  return <div className="admin-pane admin-announce">
    <p className="admin-note">{t(`Мэдэгдэл бүх тоглогчийн үндсэн цэсний дээд хэсэгт харагдана. Тоглогч хаах хүртэл нэг удаа гарна.`, `The announcement shows at the top of every player’s main menu, once, until they close it.`)}</p>
    <div className="admin-current">{current
      ? <><Megaphone size={14} /><p>{current.message}<small>{t(`${ago(current.created_at)} нийтэлсэн`, `posted ${ago(current.created_at)}`)}</small></p>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void publish('')}><X size={13} />{t(` АВАХ`, ` REMOVE`)}</button></>
      : <p className="panel-empty">{t(`Одоо идэвхтэй мэдэгдэл алга.`, `No active announcement.`)}</p>}</div>
    <label className="feedback-text"><textarea value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)} placeholder={t('Жишээ нь: Шинэ хувилбар гарлаа! Апп-аа шинэчилнэ үү.', 'For example: A new version is out! Please update the app.')} /><small>{draft.length}/200</small></label>
    <button type="button" className="primary-button" disabled={busy || !draft.trim()} onClick={() => void publish(draft.trim())}><Megaphone size={14} />{t(` НИЙТЛЭХ`, ` POST`)}</button>
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
    {items === null && <p className="panel-empty">{t(`Ачаалж байна…`, `Loading…`)}</p>}
    {items?.length === 0 && <p className="panel-empty">{t(`Одоогоор үйлдэл алга.`, `No actions yet.`)}</p>}
    <ul className="admin-log">{items?.map((item) => <li key={item.id}>
      <small>{ago(item.created_at)}</small><b>{item.admin_name}</b><span>{ACTION_LABEL[item.action] ?? item.action}</span>
      {item.detail && <em>{item.detail}</em>}
    </li>)}</ul>
  </div>;
}
