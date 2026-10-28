import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Crown, Flame, History, Lock, Swords, Trophy } from 'lucide-react';
import Avatar from './Avatar';
import RankEmblem, { RANK_GAME_LABEL } from './RankEmblem';
import { TitleBadge, TitlePlaque, useFreeShopping, useShopItems } from './Social';
import { MAX_RANK_LEVEL, RANK_GAMES, RANK_NAMES, RANK_POINTS, RANK_THRESHOLDS, rankInfo, rankTitleKey, type RankGame } from './rankRules';
import { supabase } from './supabaseClient';
import type { NotifyFn } from './multiplayer';
import { playSfx } from './sfx';

export type RankRow = {
  game_type: RankGame; points: number; peak_points: number; matches: number; wins: number; losses: number; current_streak: number; best_streak: number;
};
type Leader = { id: string; display_name: string; avatar_url: string | null; avatar_key: string; frame_key: string | null; title_key: string | null; player_no: number | null; points: number; wins: number; matches: number; level: number };
type Change = { id: number; outcome: 'win' | 'loss'; rp_change: number; rank_points_after: number; previous_rank: string; new_rank: string; created_at: string };

const EMPTY: RankRow = { game_type: 'mafia', points: 0, peak_points: 0, matches: 0, wins: 0, losses: 0, current_streak: 0, best_streak: 0 };

/** A player's rank in both games (all zeros until their first ranked game). */
export function useRanks(userId: string | null | undefined) {
  const [ranks, setRanks] = useState<Record<RankGame, RankRow> | null>(null);
  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data } = await supabase.from('player_ranks').select('game_type,points,peak_points,matches,wins,losses,current_streak,best_streak').eq('user_id', userId);
    const rows = (data ?? []) as RankRow[];
    setRanks({
      mafia: rows.find((row) => row.game_type === 'mafia') ?? { ...EMPTY, game_type: 'mafia' },
      monopoly: rows.find((row) => row.game_type === 'monopoly') ?? { ...EMPTY, game_type: 'monopoly' },
    });
  }, [userId]);
  useEffect(() => { void load(); }, [load]);
  return { ranks, reload: load };
}

const percent = (wins: number, matches: number) => (matches ? Math.round((wins / matches) * 100) : 0);

function RulesList({ game }: { game: RankGame }) {
  return <ul className="rank-rules">
    {game === 'mafia' ? <>
      <li><b className="is-plus">+{RANK_POINTS.mafiaWin}</b> Ялалт</li>
      <li><b className="is-plus">+{RANK_POINTS.mafiaAliveBonus}</b> Ялаад амьд үлдвэл</li>
      <li><b className="is-minus">{RANK_POINTS.mafiaLoss}</b> Ялагдал</li>
    </> : <>
      <li><b className="is-plus">+{RANK_POINTS.boardWin}</b> Ялагч</li>
      <li><b className="is-minus">{RANK_POINTS.boardSurvived}</b> Дампуураагүй ч ялагдсан</li>
      <li><b className="is-minus">{RANK_POINTS.boardBankrupt}</b> Дампуурсан</li>
    </>}
    <li><b className="is-minus">{RANK_POINTS.leave}</b> Тоглолтоос дундуур гарвал</li>
  </ul>;
}

/**
 * The ranking screen: rank and progress per game, the nine-rank ladder with the title each rank
 * unlocks (worn from here), the top players and the player's recent ranked games.
 */
export function RanksScreen({ userId, onBack, onPlay, notify, initialGame = 'mafia' }: {
  userId: string; onBack: () => void; onPlay: (game: RankGame) => void; notify: NotifyFn; initialGame?: RankGame;
}) {
  const [game, setGame] = useState<RankGame>(initialGame);
  const [view, setView] = useState<'ladder' | 'top' | 'history'>('ladder');
  const { ranks, reload } = useRanks(userId);
  const items = useShopItems();
  /** Admins may wear any title, to try them out. */
  const admin = useFreeShopping();
  const [owned, setOwned] = useState<string[]>([]);
  const [wearing, setWearing] = useState<string | null>(null);
  const [leaders, setLeaders] = useState<Leader[] | null>(null);
  const [history, setHistory] = useState<Change[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ladder = useRef<HTMLDivElement>(null);

  const loadMine = useCallback(async () => {
    if (!supabase) return;
    const [itemsResult, profileResult] = await Promise.all([
      supabase.from('player_items').select('item_key').eq('user_id', userId).like('item_key', 'title-%'),
      supabase.from('profiles').select('title_key').eq('id', userId).maybeSingle(),
    ]);
    setOwned(((itemsResult.data ?? []) as Array<{ item_key: string }>).map((row) => row.item_key));
    setWearing((profileResult.data as { title_key: string | null } | null)?.title_key ?? null);
  }, [userId]);
  useEffect(() => { void loadMine(); }, [loadMine]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setLeaders(null);
    setHistory(null);
    void supabase.rpc('rank_leaderboard', { p_game: game, p_limit: 20 }).then(({ data }) => { if (active) setLeaders((data as Leader[] | null) ?? []); });
    void supabase.from('rating_changes').select('id,outcome,rp_change,rank_points_after,previous_rank,new_rank,created_at')
      .eq('user_id', userId).eq('game_type', game).order('created_at', { ascending: false }).limit(15)
      .then(({ data }) => { if (active) setHistory((data as Change[] | null) ?? []); });
    return () => { active = false; };
  }, [game, userId]);

  const wear = async (key: string | null) => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('equip_item', { p_kind: 'title', p_key: key });
    setBusy(false);
    if (error) { notify(error.message, 'error'); return; }
    playSfx('buy');
    notify(key ? 'Цолоо зүүлээ!' : 'Цолоо тайллаа.', 'success');
    setWearing(key);
    void reload();
  };

  const row = ranks?.[game] ?? { ...EMPTY, game_type: game };
  const info = rankInfo(game, row.points);

  // The ladder opens on the player's own rank.
  useEffect(() => {
    if (view !== 'ladder' || !ranks) return;
    const list = ladder.current;
    const current = list?.querySelector<HTMLElement>('.rank-step.is-current');
    if (list && current) list.scrollTop = Math.max(0, current.offsetTop - list.offsetTop - list.clientHeight / 2 + current.clientHeight / 2);
  }, [view, game, ranks, info.level]);

  return <div className="inner-screen panel-screen ranks-screen">
    <header className="top-bar panel-top-bar">
      <button className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={17} /></button>
      <div className="top-title"><span>ЦОЛ ХОЖИХ ТОГЛОЛТ</span><strong>РЭЙТИНГ</strong></div>
      <div className="panel-top-trailing rank-game-tabs" role="tablist" aria-label="Тоглоом">
        {RANK_GAMES.map((key) => <button type="button" role="tab" key={key} aria-selected={game === key} className={game === key ? 'is-picked' : ''}
          onClick={() => setGame(key)}>{RANK_GAME_LABEL[key]}</button>)}
      </div>
    </header>
    <div className="panel-body ranks-body">
      <section className={`rank-hero-card metal-${info.metal}`} aria-label={`${RANK_GAME_LABEL[game]} рэйтинг`}>
        <RankEmblem game={game} level={info.level} className="rank-hero-emblem" />
        <div className="rank-hero-text">
          <small>{RANK_GAME_LABEL[game].toUpperCase()} · {info.level}-Р ШАТ</small>
          <h1>{info.name}</h1>
          <b className="rank-hero-points">{info.points} <span>оноо</span></b>
        </div>
        <div className="rank-progress">
          <div className="rank-progress-bar"><i style={{ width: `${info.progress}%` }} /></div>
          <span>{info.next ? <>Дараагийн цол <b>{info.next.name}</b> · {info.toNext} оноо дутуу</> : <><Crown size={12} /> Хамгийн дээд цолд хүрсэн!</>}</span>
        </div>
        <div className="rank-stats">
          <span><b>{row.matches}</b>Тоглолт</span><span><b>{row.wins}</b>Ялалт</span>
          <span><b>{percent(row.wins, row.matches)}%</b>Ялалтын хувь</span><span><b>{row.best_streak}</b>Шилдэг цуврал</span>
        </div>
        <button type="button" className="primary-button rank-play" onClick={() => onPlay(game)}><Swords size={15} /> РЭЙТИНГ ТОГЛОХ <ChevronRight size={15} /></button>
      </section>

      <section className="rank-panel">
        <div className="admin-choice-row rank-views" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'ladder'} className={view === 'ladder' ? 'is-picked' : ''} onClick={() => setView('ladder')}><Crown size={13} /> Шат ба цол</button>
          <button type="button" role="tab" aria-selected={view === 'top'} className={view === 'top' ? 'is-picked' : ''} onClick={() => setView('top')}><Trophy size={13} /> Шилдэг 20</button>
          <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'is-picked' : ''} onClick={() => setView('history')}><History size={13} /> Миний түүх</button>
        </div>

        {view === 'ladder' && <div className="rank-ladder" ref={ladder}>
          {Array.from({ length: MAX_RANK_LEVEL }, (_, index) => MAX_RANK_LEVEL - index).map((level) => {
            const key = rankTitleKey(game, level);
            const reached = info.level >= level;
            const has = key ? admin || owned.includes(key) : false;
            const worn = key !== null && wearing === key;
            return <div key={level} className={`rank-step ${reached ? 'is-reached' : has ? 'is-open' : 'is-locked'} ${info.level === level ? 'is-current' : ''}`}>
              <RankEmblem game={game} level={level} className="rank-step-emblem" />
              <div className="rank-step-copy"><b>{RANK_NAMES[game][level - 1]}</b><small>{RANK_THRESHOLDS[level - 1]} оноо{info.level === level ? ' · ТА ЭНД' : ''}</small></div>
              {key ? <TitlePlaque titleKey={key} name={RANK_NAMES[game][level - 1]} size="sm" /> : <span className="rank-step-none">Цолгүй</span>}
              {!key ? <span /> : has
                ? worn
                  ? <button type="button" className="secondary-button rank-step-action" disabled={busy} onClick={() => void wear(null)}><Check size={12} /> ЗҮҮСЭН</button>
                  : <button type="button" className="secondary-button rank-step-action" disabled={busy} onClick={() => void wear(key)}>ЗҮҮХ</button>
                : <span className="rank-step-lock"><Lock size={12} /> {RANK_THRESHOLDS[level - 1]}</span>}
            </div>;
          })}
          <RulesList game={game} />
        </div>}

        {view === 'top' && <div className="rank-board">
          {leaders === null && <p className="rank-empty">Ачаалж байна…</p>}
          {leaders?.length === 0 && <p className="rank-empty"><Trophy size={18} /> Одоогоор рэйтинг тоглосон хүн алга. Анхных нь болоорой!</p>}
          {leaders?.map((leader, index) => <div key={leader.id} className={`rank-leader ${leader.id === userId ? 'is-me' : ''} ${index < 3 ? `is-top${index + 1}` : ''}`}>
            <span className="rank-leader-place">{index + 1}</span>
            <Avatar name={leader.display_name} color={leader.avatar_key} url={leader.avatar_url} frame={leader.frame_key} className="rank-leader-avatar" />
            <span className="rank-leader-name"><b>{leader.display_name}</b><TitleBadge titleKey={leader.title_key} items={items} /></span>
            <RankEmblem game={game} level={leader.level} className="rank-leader-emblem" />
            <span className="rank-leader-points"><b>{leader.points}</b><small>{leader.wins}/{leader.matches} ялалт</small></span>
          </div>)}
        </div>}

        {view === 'history' && <div className="rank-log">
          {history === null && <p className="rank-empty">Ачаалж байна…</p>}
          {history?.length === 0 && <p className="rank-empty"><Flame size={18} /> Рэйтинг тоглолт хараахан тоглоогүй байна.</p>}
          {history?.map((change) => {
            const up = Number(change.new_rank) > Number(change.previous_rank);
            const down = Number(change.new_rank) < Number(change.previous_rank);
            return <div key={change.id} className={`rank-change is-${change.outcome}`}>
              <span className="rank-change-outcome">{change.outcome === 'win' ? 'ЯЛАЛТ' : 'ЯЛАГДАЛ'}</span>
              <b className={change.rp_change >= 0 ? 'is-plus' : 'is-minus'}>{change.rp_change >= 0 ? '+' : ''}{change.rp_change}</b>
              <span className="rank-change-total">{change.rank_points_after} оноо{up ? ` · ↑ ${RANK_NAMES[game][Number(change.new_rank) - 1]}` : down ? ` · ↓ ${RANK_NAMES[game][Number(change.new_rank) - 1]}` : ''}</span>
              <small>{new Date(change.created_at).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric' })}</small>
            </div>;
          })}
        </div>}
      </section>
    </div>
  </div>;
}

/**
 * After a ranked game: how many points the player won or lost, and a new rank if they reached one.
 * Casual games have no rating change, so nothing shows.
 */
export function RankResultBanner({ roomCode, userId }: { roomCode: string; userId: string }) {
  const [change, setChange] = useState<(Change & { game_type: RankGame }) | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    let tries = 0;
    const since = new Date(Date.now() - 2 * 60_000).toISOString();
    const look = async () => {
      const { data } = await client.from('rating_changes').select('id,outcome,rp_change,rank_points_after,previous_rank,new_rank,created_at,game_type')
        .eq('user_id', userId).eq('room_code', roomCode).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
      const found = (data as Array<Change & { game_type: RankGame }> | null)?.[0];
      if (!active) return;
      if (found) { setChange(found); if (Number(found.new_rank) > Number(found.previous_rank)) playSfx('reveal'); return; }
      tries += 1;
      if (tries < 6) window.setTimeout(() => { void look(); }, 1500);
    };
    void look();
    return () => { active = false; };
  }, [roomCode, userId]);
  if (!change) return null;
  const game = change.game_type;
  const level = Number(change.new_rank) || 1;
  const promoted = level > (Number(change.previous_rank) || 1);
  return <div className={`rank-result ${promoted ? 'is-promoted' : ''} ${change.rp_change >= 0 ? 'is-plus' : 'is-minus'}`} role="status">
    <RankEmblem game={game} level={level} className="rank-result-emblem" />
    <span className="rank-result-copy">
      <small>{promoted ? 'ШИНЭ ЦОЛ!' : 'РЭЙТИНГ'}</small>
      <b>{promoted ? RANK_NAMES[game][level - 1] : `${change.rp_change >= 0 ? '+' : ''}${change.rp_change} оноо`}</b>
      <i>{promoted ? `+${change.rp_change} оноо · ` : ''}{RANK_NAMES[game][level - 1]} · {change.rank_points_after} оноо</i>
    </span>
  </div>;
}
