import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronRight, CircleHelp, Clock3, Crown, Flag, Gift, HelpCircle, Mic, SkipForward, ThumbsDown, ThumbsUp, Trophy, X } from 'lucide-react';
import Avatar, { RowBorder, nameplate, rowBorderClass } from './Avatar';
import { i18n } from './i18n';
import { isEnglish } from './lang';
import { MatchRewardBanner } from './MatchReward';
import { callGame, useCountdown, useGame, type NotifyFn, type RoomSeat } from './multiplayer';
import { ScrollCue } from './ScrollCue';
import { playSfx } from './sfx';
import { useLongPress } from './Social';
import { VoiceAvatarIndicator, VoiceChatProvider } from './VoiceChat';
import { whoAmICategoryInfo } from './whoAmICatalog';
import { WHOAMI_HEARTBEAT_MS } from './whoAmIEngine';
import type {
  AnswerVote, JudgeVote, WhoAmIAction, WhoAmIIdentity, WhoAmILastResult, WhoAmIPrivateView, WhoAmIPublicPlayer, WhoAmIPublicView,
} from './whoAmIEngine';

const w = () => i18n.whoAmI;

/** Display name of an identity in the app language. */
export const identityName = (identity: WhoAmIIdentity) => isEnglish ? identity.nameEn ?? identity.name : identity.name;

/** Category name in the app language (the category is public, even to the identity's owner). */
export function categoryLabel(player: Pick<WhoAmIPublicPlayer, 'categoryId' | 'categoryName'> & { categoryNameEn?: string }) {
  const own = isEnglish ? player.categoryNameEn : player.categoryName;
  if (own) return own;
  const category = whoAmICategoryInfo(player.categoryId);
  return category ? (isEnglish ? category.nameEn : category.name) : player.categoryName;
}

/**
 * An identity's picture, when staff gave the entry one. It only ever comes from an identity the viewer
 * may see (the server leaves the owner's own identity, picture included, out of their view), so drawing
 * it here can never show anyone their own card. A picture that fails to load is simply left out.
 */
function IdentityPicture({ identity, className = '' }: { identity: WhoAmIIdentity | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = identity?.image;
  if (!src || failed === src) return null;
  return <img className={`whoami-picture ${className}`} src={src} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(src)} />;
}

const formatTime = (seconds: number | null) => seconds === null ? '--:--' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/** One line describing the last thing that was decided (answer tally, guess, pass). */
export function lastResultLine(result: WhoAmILastResult | null, players: WhoAmIPublicPlayer[]) {
  if (!result) return '';
  const player = players.find((entry) => entry.id === result.playerId);
  const name = player?.name ?? '?';
  if (result.kind === 'answer') return w().lastAnswer(name, w().answerWord[result.result], result.yes, result.no);
  if (result.kind === 'guess') return result.correct ? w().lastSolved(name, player?.identity ? identityName(player.identity) : '?') : w().lastWrong(name, result.text);
  return w().lastPass[result.reason](name);
}

/**
 * Each seat's shop looks, by seat number (the player id in the Who Am I views): avatar frame, nameplate and
 * name border, from the seat's game_room_players row, as on Mafia seats. They are the same for every viewer and
 * say nothing about anyone's identity.
 */
export type SeatLooks = Record<number, { frame?: string | null; plate?: string | null; border?: string | null }>;
export const seatLooks = (seats: RoomSeat[]): SeatLooks =>
  Object.fromEntries(seats.map((seat) => [seat.seat, { frame: seat.frame_key, plate: seat.nameplate_key, border: seat.border_key }]));

/** What a seat's looks add to a row or card: the nameplate's class and picture, the name border's class. */
function lookOf(looks: SeatLooks | undefined, id: number) {
  const look = looks?.[id];
  const plate = nameplate(look?.plate);
  return { frame: look?.frame ?? null, border: look?.border ?? null, plateClass: plate.className, plateStyle: plate.style, borderClass: rowBorderClass(look?.border) };
}

/** Tap opens the player's card (profile, gift, friend); a long press goes straight to the gift picker when they can get one. */
function usePlayerPress(id: number, onProfile?: (seat: number) => void, onGift?: (seat: number) => void) {
  const press = useLongPress(() => (onGift ?? onProfile)?.(id));
  const onClick = () => { if (press.fired.current) { press.fired.current = false; return; } onProfile?.(id); };
  return onProfile || onGift ? { onClick, ...press.handlers } : {};
}

export type WhoAmITableProps = {
  game: WhoAmIPublicView;
  me: WhoAmIPrivateView;
  roomName: string;
  isHost: boolean;
  busy: boolean;
  secondsLeft: number | null;
  onAction: (action: WhoAmIAction) => void;
  onLeave: () => void;
  onRematch: () => void;
  onProfile?: (seat: number) => void;
  /** Opens the gift picker for a seat (long press on a player, or the gift button). Left out, there are no gifts (an admin watching). */
  onGift?: (seat: number) => void;
  /** Avatar frames, nameplates and name borders by seat. */
  looks?: SeatLooks;
  /** Extra content under the results heading (the coin reward). */
  resultsExtra?: ReactNode;
  /** Small banner shown over the table (the demo mode uses it). */
  banner?: ReactNode;
};

/**
 * The Who Am I table: reveal, ask / answer / guess, results. Pure view: the caller sends actions to
 * the server (or to the local engine in the demo). The viewer's own identity is never in `me` while
 * they still guess; the server leaves it out.
 */
export function WhoAmITable({ game, me, roomName, isHost, busy, secondsLeft, onAction, onLeave, onRematch, onProfile, onGift, looks, resultsExtra, banner }: WhoAmITableProps) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [giveUpOpen, setGiveUpOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [guessOpen, setGuessOpen] = useState(false);
  const [guessText, setGuessText] = useState('');
  const self = game.players.find((player) => player.id === me.viewerId);
  const active = game.players.find((player) => player.id === game.activeId) ?? null;
  const iAmActive = game.activeId === me.viewerId;
  const iCanVote = game.voterIds.includes(me.viewerId);
  const identityOf = (player: WhoAmIPublicPlayer) => me.identities[player.id] ?? player.identity ?? null;
  // Gifts go to the other people still at the table (the server refuses a gift to oneself or to an empty seat).
  const giftable = onGift ? game.players.filter((player) => player.id !== me.viewerId && !player.bot && player.status !== 'left') : [];
  const giftFor = (player: WhoAmIPublicPlayer) => (giftable.includes(player) ? onGift : undefined);

  // A fresh turn closes the guess form.
  useEffect(() => { setGuessOpen(false); setGuessText(''); }, [game.activeId, game.phase]);

  if (game.phase === 'results') {
    return <WhoAmIResults game={game} me={me} roomName={roomName} isHost={isHost} onReplay={onRematch} onMenu={onLeave} extra={resultsExtra} banner={banner}
      looks={looks} onProfile={onProfile} giftFor={giftFor} />;
  }

  const sendGuess = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAction({ type: 'guess', text: guessText.trim() || null });
  };

  const turnLine = active ? (iAmActive ? w().yourTurn : w().turnOf(active.name)) : '';
  const lastLine = lastResultLine(game.lastResult, game.players);

  let panel: ReactNode = null;
  if (game.phase === 'reveal') {
    const people = game.players.filter((player) => !player.bot && player.status !== 'left');
    const readyCount = people.filter((player) => player.ready).length;
    panel = <section className={`whoami-reveal ${game.players.length > 6 ? 'is-crowded' : ''}`}>
      <div className="whoami-reveal-head">
        <span className="whoami-kicker">{w().revealKicker}</span>
        <h1>{w().revealTitle}</h1>
        <p>{w().revealHint}</p>
      </div>
      <ScrollCue className={`whoami-reveal-grid count-${game.players.length}`} wrapClassName="whoami-reveal-scroll" label={w().morePlayers} focusKey={me.viewerId}>
        {game.players.map((player) => <IdentityCard key={player.id} player={player} identity={identityOf(player)} isMe={player.id === me.viewerId} looks={looks} onProfile={onProfile} onGift={giftFor(player)} />)}
      </ScrollCue>
      <div className="whoami-reveal-actions">
        {self?.ready
          ? <span className="whoami-wait"><Check size={14} /> {w().readyCount(readyCount, people.length, secondsLeft)}</span>
          : <button type="button" className="primary-button whoami-big" disabled={busy} onClick={() => onAction({ type: 'ready' })}><Check size={16} /> {w().ready}</button>}
        {!self?.ready && <span className="whoami-wait">{w().readyCount(readyCount, people.length, secondsLeft)}</span>}
        {isHost && <button type="button" className="secondary-button" disabled={busy} onClick={() => onAction({ type: 'hostSkip' })}>{w().startNow} <ChevronRight size={15} /></button>}
      </div>
    </section>;
  } else if (active) {
    const voted = game.votedIds.length;
    const voters = game.voterIds.length;
    let actions: ReactNode;
    if (game.phase === 'ask' && iAmActive) {
      actions = guessOpen
        ? <form className="whoami-guess-form" onSubmit={sendGuess}>
            <b>{w().guessTitle}</b>
            <p>{w().guessHint}</p>
            <input value={guessText} onChange={(event) => setGuessText(event.target.value)} maxLength={60} placeholder={w().guessPlaceholder} aria-label={w().guessPlaceholder} autoFocus />
            <div className="whoami-row">
              <button type="button" className="secondary-button" onClick={() => setGuessOpen(false)}>{w().cancel}</button>
              <button type="submit" className="primary-button" disabled={busy}><Check size={15} /> {w().guessSubmit}</button>
            </div>
          </form>
        : <>
            <p className="whoami-hint"><Mic size={13} /> {w().askHint}</p>
            <button type="button" className="primary-button whoami-big" disabled={busy} onClick={() => onAction({ type: 'asked' })}><Check size={17} /> {w().asked}</button>
            <div className="whoami-row">
              <button type="button" className="secondary-button" disabled={busy} onClick={() => setGuessOpen(true)}><HelpCircle size={15} /> {w().guess}</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => onAction({ type: 'pass' })}><SkipForward size={15} /> {w().pass}</button>
            </div>
          </>;
    } else if (game.phase === 'ask') {
      actions = <div className="whoami-waiting"><Mic size={18} /><b>{w().isAsking(active.name)}</b><span>{w().listenHint}</span></div>;
    } else if (game.phase === 'answer' && iCanVote) {
      const vote = me.myVote as AnswerVote | null;
      actions = <>
        <p className="whoami-prompt">{w().answerPrompt(active.name)}</p>
        <div className="whoami-vote-buttons is-three">
          <VoteButton tone="yes" picked={vote === 'yes'} disabled={busy} onClick={() => onAction({ type: 'answer', vote: 'yes' })} icon={<ThumbsUp size={18} />} label={w().yes} />
          <VoteButton tone="no" picked={vote === 'no'} disabled={busy} onClick={() => onAction({ type: 'answer', vote: 'no' })} icon={<ThumbsDown size={18} />} label={w().no} />
          <VoteButton tone="unknown" picked={vote === 'unknown'} disabled={busy} onClick={() => onAction({ type: 'answer', vote: 'unknown' })} icon={<CircleHelp size={18} />} label={w().unknown} />
        </div>
        <p className="whoami-meta">{vote ? w().yourVote(w().answerWord[vote]) : w().votePoint} · {w().votes(voted, voters)}</p>
      </>;
    } else if (game.phase === 'guess' && iCanVote) {
      const vote = me.myVote as JudgeVote | null;
      const real = identityOf(active);
      actions = <>
        <p className="whoami-prompt">{w().judgePrompt(active.name)}</p>
        <div className="whoami-guess-compare">
          <span><small>{game.guess?.text ? w().typedGuess : w().spokenGuess}</small><b>{game.guess?.text ? `«${game.guess.text}»` : <Mic size={16} />}</b></span>
          <span className={real?.image ? 'has-picture' : ''}><small>{w().realIdentity}</small><b><IdentityPicture identity={real} className="is-compare" />{real ? identityName(real) : '?'}</b></span>
        </div>
        <div className="whoami-vote-buttons">
          <VoteButton tone="yes" picked={vote === 'correct'} disabled={busy} onClick={() => onAction({ type: 'judge', verdict: 'correct' })} icon={<Check size={18} />} label={w().correct} />
          <VoteButton tone="no" picked={vote === 'wrong'} disabled={busy} onClick={() => onAction({ type: 'judge', verdict: 'wrong' })} icon={<X size={18} />} label={w().wrong} />
        </div>
        <p className="whoami-meta">{vote ? w().yourVote(w().judgeWord[vote]) : w().votePoint} · {w().votes(voted, voters)}</p>
      </>;
    } else {
      actions = <div className="whoami-waiting"><Clock3 size={18} /><b>{game.phase === 'guess' ? (iAmActive ? w().othersJudging : w().judgePrompt(active.name)) : w().othersAnswering}</b><span>{w().votes(voted, voters)}</span></div>;
    }
    panel = <section className="whoami-stage">
      <div className="whoami-spotlight">
        <span className="whoami-kicker">{turnLine}</span>
        <IdentityCard player={active} identity={identityOf(active)} isMe={iAmActive} large looks={looks} onProfile={onProfile} onGift={giftFor(active)} />
        <div className="whoami-counters"><span>{w().turnQuestions(game.turnQuestions, game.maxQuestionsPerTurn)}</span><span>{w().totalQuestions(active.questions)}</span></div>
      </div>
      <div className="whoami-actions">{actions}</div>
    </section>;
  }

  return <div className={`whoami-game phase-${game.phase}`}>
    <header className="whoami-top">
      <div className="whoami-round"><span>{w().round}</span><strong>{w().roundOf(Math.max(1, game.round), game.maxRounds)}</strong></div>
      <div className="whoami-phase">{w().phase[game.phase]}</div>
      <div className="whoami-timer"><Clock3 size={14} /><strong>{formatTime(secondsLeft)}</strong></div>
      <div className="whoami-top-actions">
        {isHost && game.phase !== 'reveal' && <button type="button" className="whoami-chip-button" disabled={busy} onClick={() => onAction({ type: 'hostSkip' })} title={w().hostSkip}><SkipForward size={13} /> {w().hostSkip}</button>}
        {self?.status === 'playing' && game.phase !== 'reveal' && <button type="button" className="whoami-chip-button" disabled={busy} onClick={() => setGiveUpOpen(true)}><Flag size={13} /> {w().giveUp}</button>}
        {giftable.length > 0 && <button type="button" className="whoami-chip-button whoami-gift-button" onClick={() => setGiftOpen(true)} aria-label={w().sendGift} title={w().sendGift}><Gift size={13} /> <span>{w().gift}</span></button>}
        <button type="button" className="game-leave-button" onClick={() => setLeaveOpen(true)}><ArrowLeft size={14} /> {w().leave}</button>
      </div>
    </header>
    {banner}
    <div className="whoami-body">
      {game.phase === 'reveal' ? panel : <div className="whoami-main">
        {panel}
        {lastLine && <div className="whoami-last" role="status" key={game.step}>{lastLine}</div>}
      </div>}
      {game.phase !== 'reveal' && <ScrollCue as="aside" className="whoami-players" wrapClassName="whoami-players-scroll" ariaLabel={i18n.game.table} label={w().morePlayers} focusKey={game.activeId}>
        {game.players.map((player) => <PlayerRow key={player.id} player={player} identity={identityOf(player)} isMe={player.id === me.viewerId} isActive={player.id === game.activeId}
          voted={game.votedIds.includes(player.id)} looks={looks} onProfile={onProfile} onGift={giftFor(player)} />)}
      </ScrollCue>}
    </div>
    {giveUpOpen && <Confirm title={w().giveUpTitle} body={w().giveUpBody} confirm={w().giveUp} onCancel={() => setGiveUpOpen(false)} onConfirm={() => { setGiveUpOpen(false); onAction({ type: 'giveUp' }); }} />}
    {leaveOpen && <Confirm title={w().leaveTitle} body={w().leaveBody} confirm={w().leave} onCancel={() => setLeaveOpen(false)} onConfirm={onLeave} />}
    {giftOpen && onGift && <GiftTargets players={giftable} looks={looks} onClose={() => setGiftOpen(false)} onPick={(id) => { setGiftOpen(false); onGift(id); }} />}
  </div>;
}

/** The gift button: who gets it. Picking a player opens the same gift picker as tapping them. */
function GiftTargets({ players, looks, onPick, onClose }: { players: WhoAmIPublicPlayer[]; looks?: SeatLooks; onPick: (id: number) => void; onClose: () => void }) {
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal whoami-gift-targets" role="dialog" aria-modal="true" aria-labelledby="whoami-gift-title" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="icon-button whoami-modal-close" onClick={onClose} aria-label={w().close}><X size={15} /></button>
      <h2 id="whoami-gift-title"><Gift size={17} /> {w().giftTitle}</h2>
      <p>{w().giftHint}</p>
      <div className="whoami-gift-list">{players.map((player) => {
        const look = lookOf(looks, player.id);
        return <button type="button" key={player.id} className={`whoami-gift-target ${look.plateClass} ${look.borderClass}`} style={look.plateStyle} onClick={() => onPick(player.id)}>
          <RowBorder borderKey={look.border} />
          <Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials} frame={look.frame} />
          <b>{player.name}</b>
          <Gift className="whoami-gift-target-icon" size={14} aria-hidden="true" />
        </button>;
      })}</div>
    </section>
  </div>;
}

function VoteButton({ tone, picked, disabled, onClick, icon, label }: { tone: 'yes' | 'no' | 'unknown'; picked: boolean; disabled: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button type="button" className={`whoami-vote is-${tone} ${picked ? 'is-picked' : ''}`} aria-pressed={picked} disabled={disabled} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function Confirm({ title, body, confirm, onCancel, onConfirm }: { title: string; body: string; confirm: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-symbol"><Flag size={18} /></div>
    <h2>{title}</h2><p>{body}</p>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>{w().stay}</button><button type="button" className="primary-button" onClick={onConfirm}>{confirm}</button></div>
  </section></div>;
}

/** A player with the identity everyone else sees. Their own card shows only "?" and the category. */
function IdentityCard({ player, identity, isMe, large = false, looks, onProfile, onGift }: {
  player: WhoAmIPublicPlayer; identity: WhoAmIIdentity | null; isMe: boolean; large?: boolean; looks?: SeatLooks; onProfile?: (seat: number) => void; onGift?: (seat: number) => void;
}) {
  const category = categoryLabel(player);
  const look = lookOf(looks, player.id);
  const press = usePlayerPress(player.id, onProfile, onGift);
  const pictured = Boolean(identity?.image);
  // The name border goes round the whole card; the nameplate sits behind the name strip at its top.
  return <button type="button" className={`whoami-card ${large ? 'is-large' : ''} ${isMe ? 'is-me' : ''} ${pictured ? 'has-picture' : ''} status-${player.status} ${look.borderClass}`} {...press} data-cue-focus={(isMe && !large) || undefined}>
    <RowBorder borderKey={look.border} />
    <span className={`whoami-card-who ${look.plateClass}`} style={look.plateStyle}>
      <Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials} frame={look.frame}>{player.host && <i className="host-badge" title={w().host}><Crown size={9} /></i>}<VoiceAvatarIndicator name={player.name} seat={player.id} /></Avatar>
      <b>{player.name}{isMe && <small>{w().you}</small>}</b>
    </span>
    <span className="whoami-card-identity">{identity ? <><IdentityPicture identity={identity} className="is-card" /><span>{identityName(identity)}</span></> : <><i className="whoami-mystery">?</i><em>{w().hidden}</em></>}</span>
    <span className="whoami-card-category">{isMe ? w().yourCategory(category) : category}</span>
    {player.status !== 'playing' && <span className={`whoami-status is-${player.status}`}>{w().status[player.status]}</span>}
  </button>;
}

function PlayerRow({ player, identity, isMe, isActive, voted, looks, onProfile, onGift }: {
  player: WhoAmIPublicPlayer; identity: WhoAmIIdentity | null; isMe: boolean; isActive: boolean; voted: boolean; looks?: SeatLooks; onProfile?: (seat: number) => void; onGift?: (seat: number) => void;
}) {
  const category = categoryLabel(player);
  const look = lookOf(looks, player.id);
  const press = usePlayerPress(player.id, onProfile, onGift);
  // A known identity gets the whole second line (the category is in the tooltip); a hidden one shows its category.
  // Its picture, if any, sits as a small thumbnail before the score.
  return <button type="button" className={`whoami-player ${isActive ? 'is-active' : ''} ${isMe ? 'is-me' : ''} status-${player.status} ${look.plateClass} ${look.borderClass}`} style={look.plateStyle} {...press} title={category} data-cue-focus={isActive || undefined}>
    <RowBorder borderKey={look.border} />
    <Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials} frame={look.frame}>{player.host && <i className="host-badge" title={w().host}><Crown size={9} /></i>}<VoiceAvatarIndicator name={player.name} seat={player.id} /></Avatar>
    <span className="whoami-player-copy">
      <b>{player.name}{isMe && <small>{w().you}</small>}</b>
      {identity ? <span className="whoami-player-identity">{identityName(identity)}</span> : <span className="whoami-player-identity is-hidden">? · {category}</span>}
    </span>
    <IdentityPicture identity={identity} className="is-thumb" />
    {voted && <Check className="whoami-voted" size={13} aria-label="✓" />}
    <span className="whoami-player-score"><b>{player.points}</b><small>{player.status === 'playing' ? '' : w().status[player.status]}</small></span>
  </button>;
}

function WhoAmIResults({ game, me, roomName, isHost, onReplay, onMenu, extra, banner, looks, onProfile, giftFor }: {
  game: WhoAmIPublicView; me: WhoAmIPrivateView; roomName: string; isHost: boolean; onReplay: () => void; onMenu: () => void; extra?: ReactNode; banner?: ReactNode;
  looks?: SeatLooks; onProfile?: (seat: number) => void; giftFor: (player: WhoAmIPublicPlayer) => ((seat: number) => void) | undefined;
}) {
  const ranking = [...game.players].sort((a, b) => b.points - a.points || (a.place ?? 99) - (b.place ?? 99) || a.questions - b.questions || a.id - b.id);
  const winners = game.players.filter((player) => game.winners.includes(player.id));
  const iWon = game.winners.includes(me.viewerId);
  return <main className="whoami-results">
    {banner}
    <div className="whoami-results-head">
      <span className="whoami-kicker">{w().resultsKicker(game.round)} · {roomName.toUpperCase()}</span>
      <h1><Trophy size={22} /> {winners.length ? w().winner(winners.map((player) => player.name).join(', ')) : w().noWinner}</h1>
      <p>{iWon ? w().youWon : w().youLost}</p>
      {extra}
    </div>
    <ScrollCue as="ol" className="whoami-ranking" wrapClassName="whoami-ranking-scroll" label={w().morePlayers}>
      {ranking.map((player, index) => <RankingRow key={player.id} player={player} place={index + 1} winner={game.winners.includes(player.id)} isMe={player.id === me.viewerId}
        looks={looks} onProfile={onProfile} onGift={giftFor(player)} />)}
    </ScrollCue>
    <div className="whoami-results-actions">
      <button type="button" className="secondary-button" onClick={onMenu}><ArrowLeft size={14} /> {w().mainMenu}</button>
      {isHost ? <button type="button" className="primary-button" onClick={onReplay}>{w().playAgain} <ChevronRight size={15} /></button> : <span className="whoami-wait">{w().waitingHost}</span>}
    </div>
  </main>;
}

/** A results row. The whole row is one tap target (profile, or a gift on a long press) over its text. */
function RankingRow({ player, place, winner, isMe, looks, onProfile, onGift }: {
  player: WhoAmIPublicPlayer; place: number; winner: boolean; isMe: boolean; looks?: SeatLooks; onProfile?: (seat: number) => void; onGift?: (seat: number) => void;
}) {
  const look = lookOf(looks, player.id);
  const press = usePlayerPress(player.id, onProfile, onGift);
  return <li className={`${winner ? 'is-winner' : ''} ${isMe ? 'is-me' : ''} ${look.plateClass} ${look.borderClass}`} style={look.plateStyle}>
    <RowBorder borderKey={look.border} />
    {onProfile && <button type="button" className="whoami-ranking-hit" aria-label={w().profile(player.name)} {...press} />}
    <span className="whoami-rank">{place}</span>
    <Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials} frame={look.frame}><VoiceAvatarIndicator name={player.name} seat={player.id} /></Avatar>
    <span className="whoami-ranking-copy">
      <b>{player.name}{isMe && <small>{w().you}</small>}{player.status !== 'playing' && <i className={`whoami-status is-${player.status}`}>{w().status[player.status]}</i>}</b>
      <span><span className="whoami-ranking-identity">{player.identity ? identityName(player.identity) : '?'}</span> <small className="whoami-ranking-questions">· {w().questionsUsed(player.questions)}</small></span>
    </span>
    <IdentityPicture identity={player.identity} className="is-thumb" />
    <span className="whoami-ranking-score"><b>{w().points(player.points)}</b><small>{w().breakdown(player.solveScore, player.votesCast)}</small></span>
  </li>;
}

/** The live Who Am I table for a seated player: server views, the phase clock, voice open for everyone. */
export default function WhoAmIScreen({ roomCode, roomName, userId, isHost, seats, onLeave, onRematch, onNotice, onProfile, onGift }: {
  roomCode: string; roomName: string; userId: string; isHost: boolean; seats: RoomSeat[];
  onLeave: () => void; onRematch: () => void; onNotice: NotifyFn; onProfile: (seat: number) => void; onGift: (seat: number) => void;
}) {
  const { publicView: game, privateView: me, deadline, reload } = useGame<WhoAmIPublicView, WhoAmIPrivateView>(roomCode, userId);
  const secondsLeft = useCountdown(deadline);
  const [busy, setBusy] = useState(false);
  const tickedFor = useRef<number | null>(null);
  const heardPhase = useRef<string | null>(null);
  const looks = useMemo(() => seatLooks(seats), [seats]);

  useEffect(() => {
    const phase = game?.phase ?? null;
    if (phase && heardPhase.current !== null && heardPhase.current !== phase) {
      if (phase === 'results') playSfx('win');
      else if (phase === 'answer' || phase === 'guess') playSfx('vote');
      else if (heardPhase.current === 'reveal') playSfx('morning');
    }
    heardPhase.current = phase;
  }, [game?.phase]);

  // Presence: while this screen is visible the phone reports in every few seconds. The server marks a seat
  // that goes quiet as away (it stops holding up votes) and brings it back on the next report.
  const playing = Boolean(game) && game?.phase !== 'results';
  useEffect(() => {
    if (!playing) return;
    const beat = () => { if (document.visibilityState === 'visible') void callGame('tick', { roomCode, heartbeat: true }).catch(() => undefined); };
    beat();
    const timer = window.setInterval(beat, WHOAMI_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', beat); };
  }, [playing, roomCode]);

  // When the clock runs out, any phone may ask the server to move on. The server re-checks the deadline.
  useEffect(() => {
    if (secondsLeft !== 0 || deadline === null || tickedFor.current === deadline) return;
    tickedFor.current = deadline;
    const timer = window.setTimeout(() => { void callGame('tick', { roomCode }).then(reload).catch(() => undefined); }, 300 + Math.random() * 700);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, deadline, roomCode, reload]);

  if (!game || !me) return <div className="core-game"><div className="room-loading">{isEnglish ? 'Setting the table…' : 'Ширээ бэлдэж байна…'}</div></div>;

  const onAction = async (action: WhoAmIAction) => {
    setBusy(true);
    try {
      await callGame('whoami', { roomCode, ...action });
      await reload();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : (isEnglish ? 'Something went wrong.' : 'Алдаа гарлаа.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return <VoiceChatProvider roomCode={roomCode} userId={userId} seats={seats} phase={game.phase === 'results' ? 'results' : 'discussion'} alive isHost={isHost}>
    <WhoAmITable game={game} me={me} roomName={roomName} isHost={isHost} busy={busy} secondsLeft={secondsLeft} onAction={(action) => { void onAction(action); }}
      onLeave={onLeave} onRematch={onRematch} onProfile={onProfile} onGift={onGift} looks={looks} resultsExtra={<MatchRewardBanner roomCode={roomCode} userId={userId} />} />
  </VoiceChatProvider>;
}

/** An admin watching a Who Am I table: the public view only (hidden identities stay "?"), read only (no gifts). */
export function WhoAmIWatch({ roomCode, roomName, userId, seats, onExit }: { roomCode: string; roomName: string; userId: string; seats: RoomSeat[]; onExit: () => void }) {
  const { publicView: game, deadline } = useGame<WhoAmIPublicView, WhoAmIPrivateView>(roomCode, userId);
  const secondsLeft = useCountdown(deadline);
  const looks = useMemo(() => seatLooks(seats), [seats]);
  if (!game) return <div className="core-game"><div className="room-loading">{isEnglish ? 'Setting the table…' : 'Ширээ бэлдэж байна…'}</div></div>;
  return <WhoAmITable game={game} me={{ viewerId: 0, identities: {}, myVote: null }} roomName={roomName} isHost={false} busy secondsLeft={secondsLeft}
    onAction={() => undefined} onLeave={onExit} onRematch={() => undefined} looks={looks} />;
}
