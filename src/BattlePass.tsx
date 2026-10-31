import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, Coins, Crown, Gem, Gift, Lock, Sparkles, Ticket } from 'lucide-react';
import Avatar, { RowBorder, nameplate, rowBorderClass } from './Avatar';
import { CoinCount, DiamondCount, TopUpModal, timeLeft, useFreeShopping, useMyWallet, useShopItems, type ShopItem } from './Social';
import { supabase } from './supabaseClient';
import type { NotifyFn } from './multiplayer';
import { playSfx } from './sfx';

/*
 * Battle Pass: a season of tiers. Games give XP; each tier pays a free reward and, with the gold
 * (premium) track bought for diamonds, a premium one. Seasons are prepared as drafts and an admin
 * starts them; until then this screen shows what the next season holds.
 */

export type PassSeason = {
  id: number; name: string; tiers: number; xp_per_tier: number; premium_price: number;
  status: 'draft' | 'active' | 'ended'; starts_at: string | null; ends_at: string | null;
};
type PassReward = { season_id: number; tier: number; track: 'free' | 'premium'; kind: 'coins' | 'diamonds' | 'item'; amount: number; item_key: string | null };
type Progress = { xp: number; premium: boolean };
type Claim = { tier: number; track: 'free' | 'premium' };

/** Days rewards stay claimable after a season ends (the server allows the same). */
const CLAIM_GRACE_MS = 3 * 24 * 3600_000;

/** The season to show: the running one, one just ended (rewards still claimable), else the next draft. */
export function pickSeason(seasons: PassSeason[], now = Date.now()) {
  const running = seasons.find((season) => season.status === 'active' && season.ends_at && new Date(season.ends_at).getTime() > now);
  if (running) return running;
  const recent = seasons.find((season) => season.status !== 'draft' && season.ends_at && new Date(season.ends_at).getTime() + CLAIM_GRACE_MS > now);
  if (recent) return recent;
  return [...seasons].filter((season) => season.status === 'draft').sort((left, right) => left.id - right.id)[0] ?? null;
}

const failure = (error: { message?: string } | null | undefined) => error?.message || 'Алдаа гарлаа. Дахин оролдоно уу.';

export function BattlePassScreen({ onBack, notify }: { onBack: () => void; notify: NotifyFn }) {
  const items = useShopItems();
  const free = useFreeShopping();
  const { wallet, refresh: refreshWallet } = useMyWallet();
  const [seasons, setSeasons] = useState<PassSeason[] | null>(null);
  const [rewards, setRewards] = useState<PassReward[]>([]);
  const [progress, setProgress] = useState<Progress>({ xp: 0, premium: false });
  const [claims, setClaims] = useState<Claim[]>([]);
  const [me, setMe] = useState<{ display_name: string; avatar_url: string | null; avatar_key: string; frame_key: string | null; nameplate_key: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  const season = useMemo(() => (seasons ? pickSeason(seasons) : null), [seasons]);
  const now = Date.now();
  const running = Boolean(season && season.status === 'active' && season.ends_at && new Date(season.ends_at).getTime() > now);
  const claimable = Boolean(season && season.status !== 'draft' && season.ends_at && new Date(season.ends_at).getTime() + CLAIM_GRACE_MS > now);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('pass_seasons').select('id,name,tiers,xp_per_tier,premium_price,status,starts_at,ends_at').order('id', { ascending: false });
    const list = (data as PassSeason[] | null) ?? [];
    setSeasons(list);
    const current = pickSeason(list);
    if (!current) return;
    const { data: auth } = await supabase.auth.getSession();
    const id = auth.session?.user.id;
    const profileQuery = supabase.from('profiles').select('display_name,avatar_url,avatar_key,frame_key,nameplate_key');
    const [rewardRows, progressRow, claimRows, profile] = await Promise.all([
      supabase.from('pass_rewards').select('season_id,tier,track,kind,amount,item_key').eq('season_id', current.id).order('tier'),
      supabase.from('pass_progress').select('xp,premium').eq('season_id', current.id).maybeSingle(),
      supabase.from('pass_claims').select('tier,track').eq('season_id', current.id),
      (id ? profileQuery.eq('id', id) : profileQuery).maybeSingle(),
    ]);
    setRewards(((rewardRows.data as PassReward[] | null) ?? []).filter((reward) => reward.season_id === current.id));
    setProgress((progressRow.data as Progress | null) ?? { xp: 0, premium: false });
    setClaims((claimRows.data as Claim[] | null) ?? []);
    if (profile.data) setMe(profile.data as typeof me);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const tiers = season?.tiers ?? 0;
  const perTier = season?.xp_per_tier ?? 1;
  const reached = Math.min(tiers, Math.floor(progress.xp / perTier));
  const intoTier = reached >= tiers ? perTier : progress.xp - reached * perTier;
  const claimed = (tier: number, line: 'free' | 'premium') => claims.some((claim) => claim.tier === tier && claim.track === line);
  const canClaim = (reward: PassReward) => claimable && reward.tier <= reached && !claimed(reward.tier, reward.track) && (reward.track === 'free' || progress.premium);
  const waiting = rewards.filter(canClaim).length;

  // Bring the next tier to reach into view.
  useEffect(() => {
    const strip = track.current;
    const cell = strip?.querySelector<HTMLElement>(`[data-tier="${Math.min(tiers, reached + 1)}"]`);
    if (strip && cell) strip.scrollLeft = Math.max(0, cell.offsetLeft - strip.clientWidth / 2 + cell.offsetWidth / 2);
  }, [reached, tiers, rewards.length]);

  const run = async (fn: string, args: Record<string, unknown>, done: (data: unknown) => string) => {
    if (!supabase) return;
    setBusy(true);
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { notify(failure(error), 'error'); return; }
    playSfx('buy');
    notify(done(data), 'success');
    void load(); void refreshWallet();
  };

  const itemOf = (key: string | null) => items.find((item) => item.key === key) ?? null;
  const rewardLabel = (reward: PassReward) => reward.kind === 'coins' ? `${reward.amount} зоос` : reward.kind === 'diamonds' ? `${reward.amount} алмаз` : itemOf(reward.item_key)?.name ?? 'Гоёл';
  const claim = (reward: PassReward) => run('claim_pass_reward', { p_season: season!.id, p_tier: reward.tier, p_track: reward.track },
    (data) => (data as { converted?: boolean } | null)?.converted ? `${rewardLabel(reward)} танд аль хэдийн байсан тул 300 зоос авлаа.` : `${rewardLabel(reward)} авлаа!`);

  const cell = (tier: number, line: 'free' | 'premium') => {
    const reward = rewards.find((entry) => entry.tier === tier && entry.track === line);
    if (!reward) return <div className={`pass-cell is-${line} is-empty`} />;
    const got = claimed(tier, line);
    const ready = canClaim(reward);
    const locked = line === 'premium' && !progress.premium;
    const item = itemOf(reward.item_key);
    return <button type="button" className={`pass-cell is-${line} kind-${reward.kind} ${got ? 'is-claimed' : ready ? 'is-ready' : tier <= reached ? 'is-reached' : 'is-ahead'} ${locked ? 'is-locked' : ''}`}
      disabled={!ready || busy} onClick={() => void claim(reward)} aria-label={`${tier}-р шат: ${rewardLabel(reward)}`}>
      <span className="pass-prize">
        {reward.kind === 'coins' && <span className="pass-amount is-coin"><Coins size={15} />{reward.amount}</span>}
        {reward.kind === 'diamonds' && <span className="pass-amount is-diamond"><Gem size={15} />{reward.amount}</span>}
        {reward.kind === 'item' && item && <ItemPreview item={item} me={me} />}
      </span>
      {reward.kind === 'item' && <small className="pass-prize-name">{item?.name ?? 'Гоёл'}</small>}
      {got ? <i className="pass-state"><Check size={12} /></i> : locked ? <i className="pass-state"><Lock size={11} /></i> : ready ? <i className="pass-state is-ready">АВАХ</i> : null}
    </button>;
  };

  return <div className="inner-screen panel-screen pass-screen">
    <header className="top-bar panel-top-bar">
      <button className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={17} /></button>
      <div className="top-title"><span>{season?.name.toUpperCase() ?? 'УЛИРАЛ'}</span><strong>BATTLE PASS</strong></div>
      <div className="panel-top-trailing">
        {season && running && season.ends_at && <span className="pass-time"><Clock3 size={13} /> {timeLeft(season.ends_at)} үлдсэн</span>}
        {season && !running && claimable && <span className="pass-time is-ended"><Clock3 size={13} /> Улирал дууссан · шагналаа авна уу</span>}
        <CoinCount value={wallet?.coins ?? null} className="is-big" />
        <DiamondCount value={wallet?.diamonds ?? null} className="is-big" onTopUp={() => setTopUp(true)} />
      </div>
    </header>
    <div className="panel-body pass-body">
      {seasons === null && <p className="panel-empty">Ачаалж байна…</p>}
      {seasons !== null && !season && <p className="panel-empty"><Ticket size={18} /> Удахгүй шинэ улирал эхэлнэ.</p>}
      {season && <>
        <section className={`pass-hero ${progress.premium ? 'has-premium' : ''}`}>
          <div className="pass-level"><small>ШАТ</small><b>{reached}</b><span>/ {tiers}</span></div>
          <div className="pass-progress">
            <div className="pass-progress-head">
              <b>{season.status === 'draft' ? 'Тун удахгүй эхэлнэ' : reached >= tiers ? 'Бүх шатыг давлаа!' : `${reached + 1}-р шат хүртэл`}</b>
              <span>{season.status === 'draft' ? `${tiers} шат · шат бүр ${perTier} XP` : `${intoTier} / ${perTier} XP`}</span>
            </div>
            <div className="pass-bar"><i style={{ width: `${season.status === 'draft' ? 0 : Math.round((intoTier / perTier) * 100)}%` }} /></div>
            <p className="pass-xp-rules">Тоглолт бүр +50 XP · ялалт +50 · өдрийн эхний тоглолт +100. Дутуу орхисон тоглолтод XP өгөхгүй.</p>
          </div>
          <div className="pass-actions">
            {progress.premium
              ? <span className="pass-premium-on"><Crown size={14} /> АЛТАН ЗАМ НЭЭЛТТЭЙ</span>
              : <button type="button" className="primary-button pass-buy" disabled={busy || !running} onClick={() => setBuyOpen(true)}>
                <Crown size={14} /> АЛТАН ЗАМ {free ? 'ҮНЭГҮЙ' : <><Gem size={13} />{season.premium_price}</>}</button>}
            {waiting > 0 && <button type="button" className="secondary-button pass-claim-all" disabled={busy}
              onClick={() => void run('claim_all_pass_rewards', { p_season: season.id }, (data) => `${Number(data)} шагнал авлаа!`)}><Gift size={14} /> БҮГДИЙГ АВАХ · {waiting}</button>}
          </div>
        </section>
        {season.status === 'draft' && <p className="pass-draft-note"><Sparkles size={13} /> Энэ улирал хараахан эхлээгүй. Эхлэхэд тоглолт бүр XP өгч, шат ахих бүрт шагнал авна.</p>}
        <div className="pass-track" ref={track}>
          <div className="pass-labels" aria-hidden="true">
            <span className="pass-label is-free">ҮНЭГҮЙ</span>
            <span className="pass-label is-premium"><Crown size={12} /> АЛТАН</span>
          </div>
          {Array.from({ length: tiers }, (_, index) => index + 1).map((tier) => <div key={tier} data-tier={tier} className={`pass-column ${tier <= reached ? 'is-reached' : ''} ${tier === reached + 1 ? 'is-next' : ''}`}>
            <span className="pass-tier">{tier}</span>
            {cell(tier, 'free')}
            {cell(tier, 'premium')}
          </div>)}
        </div>
      </>}
    </div>
    {topUp && <TopUpModal onClose={() => setTopUp(false)} />}
    {buyOpen && season && <div className="game-modal-backdrop" onClick={() => setBuyOpen(false)}>
      <section className="game-modal pass-buy-modal" role="dialog" aria-modal="true" aria-labelledby="pass-buy-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="pass-buy-title"><Crown size={18} /> Алтан зам</h2>
        <p>Улирлын турш алтан замын бүх шагнал нээгдэнэ: зурган хүрээ, нэрийн хавтан, алмаз, зоос. Өмнө давсан шатных нь ч шууд авах боломжтой болно.</p>
        <p className="pass-buy-price">{free ? 'Админд үнэгүй' : <><Gem size={15} /> {season.premium_price} алмаз · танд {wallet?.diamonds ?? 0}</>}</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => setBuyOpen(false)}>БОЛИХ</button>
          {!free && (wallet?.diamonds ?? 0) < season.premium_price
            ? <button type="button" className="primary-button" onClick={() => { setBuyOpen(false); setTopUp(true); }}><Gem size={14} /> АЛМАЗ ЦЭНЭГЛЭХ</button>
            : <button type="button" className="primary-button" disabled={busy} onClick={() => { setBuyOpen(false); void run('buy_pass_premium', { p_season: season.id }, () => 'Алтан зам нээгдлээ!'); }}><Crown size={14} /> НЭЭХ</button>}
        </div>
      </section>
    </div>}
  </div>;
}

/** A look as it will appear: the frame on my avatar, the nameplate or border behind my name. */
function ItemPreview({ item, me }: { item: ShopItem; me: { display_name: string; avatar_url: string | null; avatar_key: string; nameplate_key: string | null } | null }) {
  if (item.kind === 'frame') return <Avatar name={me?.display_name ?? 'Би'} color={me?.avatar_key ?? 'rose'} url={me?.avatar_url} frame={item.key} className="pass-avatar" />;
  if (item.kind === 'nameplate') return <span className={`pass-plate ${nameplate(item.key).className}`} style={nameplate(item.key).style} />;
  const plate = nameplate(me?.nameplate_key);
  return <span className={`pass-plate ${plate.className} ${rowBorderClass(item.key)}`} style={plate.style}><RowBorder borderKey={item.key} /></span>;
}
