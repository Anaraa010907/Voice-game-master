import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft, Check, ChevronRight, Clock3, Crown, Crosshair, Drama, Eye, Fingerprint,
  HeartPulse, Info, LockKeyhole, Mic, Moon, Radio, Settings,
  Shield, ShieldHalf, Skull, Sun, Target, Vote, X,
} from 'lucide-react';
import { roles, type RoleName } from './gameData';
import RoleCardArtwork from './RoleCardArtwork';
import { MyRoleCard, RoleCardViewer, RoleRevealIntro } from './RoleCardReveal';
import { isMafiaMember, type PrivateGameView, type PublicGamePlayer, type PublicGameView, type VoteChoice } from './gameEngine';
import { rulesSummary } from './MafiaRules';
import { i18n, translateMessage, translatePhase, translateRole, translateTeam } from './i18n';
import { VoiceAvatarIndicator, VoiceChatProvider, type VoicePhase } from './VoiceChat';
import { FullscreenToggle, type FullscreenState } from './fullscreen';
import { callGame, useCountdown, useGame, type NotifyFn, type RoomSeat } from './multiplayer';
import { playSfx, startMusic } from './sfx';
import GhostVoice from './GhostVoice';
import { QUICK_REPLIES, useQuickReplies } from './quickReplies';
import Avatar, { RowBorder, nameplate, rowBorderClass } from './Avatar';
import { useLongPress } from './Social';
import { VolumeControls } from './VolumeControls';
import { RankResultBanner } from './Ranks';

import { plural, t } from './lang';
function roleInfo(name: RoleName) {
  return roles.find((item) => item.name === name)!;
}

function NightIcon({ role, size = 19 }: { role: RoleName; size?: number }) {
  const iconProps = { size, strokeWidth: 1.7 };
  if (role === 'Mafia') return <Skull {...iconProps} />;
  if (role === 'Don') return <Crown {...iconProps} />;
  if (role === 'Bodyguard') return <ShieldHalf {...iconProps} />;
  if (role === 'Jester') return <Drama {...iconProps} />;
  if (role === 'Doctor') return <HeartPulse {...iconProps} />;
  if (role === 'Detective') return <Eye {...iconProps} />;
  if (role === 'Good Informant') return <Fingerprint {...iconProps} />;
  if (role === 'Bad Informant') return <Radio {...iconProps} />;
  if (role === 'Old Lady with Shotgun') return <Crosshair {...iconProps} />;
  return <Shield {...iconProps} />;
}

function GamePlayerCard({ player, isCurrent, selected, selectable, voteCount, voteTargetName, runoff, finalRole, bubble, frame, plateKey, borderKey, onSelect, onProfile }: {
  player: PublicGamePlayer; isCurrent: boolean; selected: boolean; selectable: boolean; voteCount?: number; voteTargetName?: string; runoff?: boolean; finalRole?: RoleName; bubble?: string;
  frame?: string | null; plateKey?: string | null; borderKey?: string | null; onSelect: () => void; onProfile: () => void;
}) {
  const plate = nameplate(plateKey);
  const shownRole = player.revealedRole ?? finalRole;
  // Tap picks a target while one can be picked, otherwise opens the profile; a long press always opens it.
  const press = useLongPress(onProfile);
  const tap = () => { if (press.fired.current) { press.fired.current = false; return; } if (selectable) onSelect(); else onProfile(); };
  return <button type="button" className={`game-player-card ${isCurrent ? 'is-current' : ''} ${selected ? 'is-selected' : ''} ${!player.alive ? 'is-dead' : ''} ${runoff ? 'is-runoff' : ''} ${selectable ? '' : 'is-locked'} ${plate.className} ${rowBorderClass(borderKey)}`} style={plate.style} onClick={tap} {...press.handlers} aria-pressed={selected}>
    <RowBorder borderKey={borderKey} />
    <Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials} frame={frame}>{player.host && <i><Crown size={10} /></i>}<VoiceAvatarIndicator name={player.name} seat={player.id} /></Avatar>
    <span className="game-player-copy"><b>{player.name}{isCurrent && <small>{t(`ЧИ`, `YOU`)}</small>}</b><span className={`${player.alive ? 'alive-label' : 'dead-label'} ${finalRole && roleInfo(finalRole).team === 'mafia' ? 'spectator-mafia' : ''}`}>{player.alive ? (runoff ? t('ДАВТАН САНАЛД', 'IN THE RUNOFF') : finalRole ? t(`АМЬД · ${translateRole(finalRole).toUpperCase()}`, `ALIVE · ${translateRole(finalRole).toUpperCase()}`) : t('АМЬД', 'ALIVE')) : shownRole ? t(`ХАСАГДСАН · ${translateRole(shownRole).toUpperCase()}`, `OUT · ${translateRole(shownRole).toUpperCase()}`) : t('ХАСАГДСАН', 'OUT')}</span></span>
    {voteCount !== undefined && <span className="player-vote-count">{voteCount} <small>{t(`САНАЛ`, `VOTES`)}</small></span>}
    {player.voteStatus === 'revealed' && <span className="player-vote-status">{player.voteTargetId === null ? t('АЛГАСАВ', 'SKIPPED') : t(`САНАЛ ${voteTargetName ?? ''}`, `VOTED ${voteTargetName ?? ''}`)}</span>}
    {selectable && <Target className="game-player-target" size={14} />}
    {bubble && <span className="quick-bubble" role="status">{bubble}</span>}
  </button>;
}

/** What an admin watching the table sees: no seat of their own, every role (once loaded) like an eliminated player. */
function watcherView(roles: Record<number, RoleName> | null): PrivateGameView {
  return {
    spectatorRoles: roles ?? {}, seat: 0, role: 'Citizen', team: 'town',
    info: { mafiaTeammateIds: [], informantMafiaIds: [], badInformantObjective: '', investigationResult: '', protectionResult: '' },
    nightRole: null, nightAction: { submitted: false, targetId: null }, vote: { submitted: false, choice: null }, verdict: null,
    lastProtectedId: null, knownAlignment: {}, shotgunSpent: false, readyForNight: true, teamTargets: null,
  } as unknown as PrivateGameView;
}

export default function GameScreen({ roomCode, roomName, userId, isHost, ranked = false, seats, onLeave, onRematch, onNotice, fullscreen, onProfile, watching }: {
  roomCode: string; roomName: string; userId: string; isHost: boolean; ranked?: boolean; seats: RoomSeat[];
  onLeave: () => void; onRematch: () => void; onNotice: NotifyFn; fullscreen: FullscreenState; onProfile: (seat: number) => void;
  /** Set when an admin watches the table: read only, no voice, every role shown. */
  watching?: { roles: Record<number, RoleName> | null };
}) {
  const { publicView: game, privateView: ownView, deadline, reload } = useGame(roomCode, userId);
  const me = watching ? watcherView(watching.roles) : ownView;
  const secondsLeft = useCountdown(deadline);
  const [nightSelection, setNightSelection] = useState<number | null>(null);
  const [voteSelection, setVoteSelection] = useState<VoteChoice>(null);
  const [voteConfirmOpen, setVoteConfirmOpen] = useState(false);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const revealShown = useRef(false);
  const closeIntro = useCallback(() => setIntroOpen(false), []);
  const closeCard = useCallback(() => setCardOpen(false), []);
  const tickedFor = useRef<number | null>(null);
  const stage = game ? `${game.phase}-${game.round}-${game.votesRevealed}-${game.runoffCandidates?.join() ?? ''}` : '';

  useEffect(() => {
    startMusic('mafia');
    return () => startMusic('menu');
  }, []);

  // Sound cues for phase changes and my own death.
  const heardPhase = useRef<string | null>(null);
  const iAmAlive = game?.players.find((player) => player.id === me?.seat)?.alive ?? true;
  const heardAlive = useRef(iAmAlive);
  useEffect(() => {
    const phase = game?.phase ?? null;
    if (phase && heardPhase.current !== null && heardPhase.current !== phase) {
      if (phase === 'Night') playSfx('night');
      else if (phase === 'Morning') playSfx('morning');
      else if (phase === 'Voting') playSfx('vote');
      else if (phase === 'Results') playSfx('win');
    }
    heardPhase.current = phase;
    if (heardAlive.current && !iAmAlive) playSfx('death');
    heardAlive.current = iAmAlive;
  }, [game?.phase, iAmAlive]);

  // Fresh selections for every new phase.
  useEffect(() => {
    setNightSelection(null);
    setVoteSelection(null);
    setVoteConfirmOpen(false);
  }, [stage]);

  // When the clock runs out, any phone may ask the server to move on. The server re-checks the deadline.
  useEffect(() => {
    if (watching || secondsLeft !== 0 || deadline === null || tickedFor.current === deadline) return;
    tickedFor.current = deadline;
    const timer = window.setTimeout(() => { void callGame('tick', { roomCode }).then(reload).catch(() => undefined); }, 300 + Math.random() * 700);
    return () => window.clearTimeout(timer);
  }, [watching, secondsLeft, deadline, roomCode, reload]);

  // The flash-and-flip reveal plays once, when the match opens on the role screen.
  const hasPrivate = Boolean(me) && !watching;
  useEffect(() => {
    if (!hasPrivate || !game) return;
    if (game.phase === 'Role Reveal' && !revealShown.current) setIntroOpen(true);
    revealShown.current = true;
  }, [game?.phase, hasPrivate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quick replies: living players, in the day phases only.
  const mySeat = seats.find((seat) => seat.user_id === userId)?.seat ?? 0;
  const seatedAlive = game?.players.find((player) => player.id === mySeat)?.alive ?? false;
  const quickOpen = Boolean(game && me && seatedAlive && (game.phase === 'Morning' || game.phase === 'Discussion' || game.phase === 'Voting'));
  const quick = useQuickReplies(roomCode, mySeat, quickOpen);

  if (!game || !me) {
    return <div className="core-game"><div className="room-loading">{t(`Ширээ бэлдэж байна…`, `Setting the table…`)}</div></div>;
  }

  const currentPlayer: PublicGamePlayer = game.players.find((player) => player.id === me.seat)
    ?? { id: me.seat, name: '?', initials: '?', color: 'rose', alive: false, voteStatus: 'not-eligible', voteTargetId: null, revealedRole: null };
  const living = game.players.filter((player) => player.alive);
  const nameOf = (id: number) => game.players.find((player) => player.id === id)?.name;
  const namesOf = (ids: number[]) => ids.map(nameOf).filter((name): name is string => Boolean(name));
  const mafiaNames = namesOf(isMafiaMember(me.role) ? me.info.mafiaTeammateIds : me.role === 'Good Informant' || me.role === 'Bad Informant' ? me.info.informantMafiaIds : []);
  const livingTeammates = me.info.mafiaTeammateIds.filter((id) => game.players.find((player) => player.id === id)?.alive);
  const whisperOpen = game.phase === 'Night' && currentPlayer.alive && isMafiaMember(me.role) && livingTeammates.length > 0;
  const leftPlayers = game.players.slice(0, Math.ceil(game.players.length / 2));
  const rightPlayers = game.players.slice(Math.ceil(game.players.length / 2));
  const time = secondsLeft === null ? '--:--' : `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const voicePhase: VoicePhase = game.phase === 'Role Reveal' ? 'role-reveal' : game.phase.toLowerCase() as VoicePhase;

  const send = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await callGame(action, { roomCode, ...body });
      await reload();
      return true;
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : t('Алдаа гарлаа.', 'Something went wrong.'), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const hostSkip = () => { void send('tick', { skip: true }); };
  // Ranked: no host skip. Each step ends when the clock runs out or when every living player taps done.
  const people = game.players.filter((entry) => entry.alive && !entry.bot);
  const doneCount = people.filter((entry) => (game.readyIds ?? []).includes(entry.id)).length;
  const doneBar = ranked && !watching
    ? <DoneBar alive={currentPlayer.alive} done={me.readyForNight} count={doneCount} total={people.length} busy={busy} onDone={() => { void send('done'); }} />
    : null;

  const canChooseNightTarget = (target: PublicGamePlayer) => {
    if (!target.alive || !currentPlayer.alive || game.phase !== 'Night' || me.nightAction.submitted || !me.nightRole) return false;
    if (me.nightRole === 'Mafia') return target.id !== me.seat && !me.info.mafiaTeammateIds.includes(target.id);
    if (me.nightRole === 'Detective' || me.nightRole === 'Bodyguard') return target.id !== me.seat;
    if (me.nightRole === 'Doctor') return target.id !== me.lastProtectedId;
    return true;
  };
  const canSelectForVote = (player: PublicGamePlayer) => game.phase === 'Voting' && !game.votesRevealed && currentPlayer.alive && !me.vote.submitted && player.alive && player.id !== me.seat && (!game.runoffCandidates || game.runoffCandidates.includes(player.id));
  const inRunoff = (player: PublicGamePlayer) => game.phase === 'Voting' && !game.votesRevealed && !game.trial && Boolean(game.runoffCandidates?.includes(player.id));
  const select = (player: PublicGamePlayer) => {
    if (game.phase === 'Night' && canChooseNightTarget(player)) setNightSelection(player.id);
    if (game.phase === 'Voting' && canSelectForVote(player)) setVoteSelection(player.id);
  };
  const renderPlayer = (player: PublicGamePlayer) => <GamePlayerCard key={player.id} player={player} isCurrent={player.id === me.seat} selected={game.phase === 'Night' ? nightSelection === player.id : voteSelection === player.id} selectable={game.phase === 'Night' ? canChooseNightTarget(player) : canSelectForVote(player)} voteCount={game.voteCountsOpen ? game.voteCounts[String(player.id)] : undefined} voteTargetName={player.voteTargetId === null ? undefined : nameOf(player.voteTargetId)} runoff={inRunoff(player)} finalRole={game.finalRoles?.[player.id] ?? me.spectatorRoles?.[player.id]} bubble={quick.bubbles[player.id]?.text} frame={seats.find((seat) => seat.seat === player.id)?.frame_key} plateKey={seats.find((seat) => seat.seat === player.id)?.nameplate_key} borderKey={seats.find((seat) => seat.seat === player.id)?.border_key} onSelect={() => select(player)} onProfile={() => onProfile(player.id)} />;

  const confirmNight = async () => {
    if (nightSelection === null) return onNotice(translateMessage('Select a living target first.'));
    if (await send('night', { targetId: nightSelection })) setNightSelection(null);
  };
  const giveVerdict = (choice: 'guilty' | 'innocent') => { void send('verdict', { choice }); };
  const submitVote = async () => {
    if (await send('vote', { choice: voteSelection })) { setVoteConfirmOpen(false); setVoteSelection(null); }
  };

  // In a ranked game only the clock moves phases on; the host gets no skip buttons.
  const canSkip = isHost && !ranked;
  const withVoice = (content: ReactNode) => watching ? <>{content}</> : <VoiceChatProvider roomCode={roomCode} userId={userId} seats={seats} phase={voicePhase} alive={currentPlayer.alive} isHost={isHost}>{content}</VoiceChatProvider>;

  if (game.phase === 'Results') return withVoice(<ResultsScreen game={game} me={me} roomName={roomName} roomCode={roomCode} userId={userId} isHost={isHost && !watching} watching={Boolean(watching)} onReplay={onRematch} onMenu={onLeave} />);

  return withVoice(<div className={`core-game ${game.phase === 'Night' ? 'is-night' : ''} stage-${game.phase === 'Night' ? 'night' : game.phase === 'Voting' ? 'vote' : 'day'}`}>
    <header className="core-game-topbar">
      <div className="round-label"><span>{i18n.game.round}</span><strong>{String(game.round).padStart(2, '0')}</strong></div>
      <div className={`current-phase phase-${game.phase.toLowerCase().replace(' ', '-')}`}><span>{translatePhase(game.phase)}</span></div>
      <div className="demo-timer"><Clock3 size={14} /><strong>{time}</strong></div>
      <div className="game-top-actions"><button className="game-icon-button" onClick={() => setSettingsOpen(true)} aria-label={t('Тоглоомын тохиргоо', 'Game settings')} title={t('Тоглоомын тохиргоо', 'Game settings')}><Settings size={16} /></button><button className="game-leave-button" onClick={() => watching ? onLeave() : setLeaveDialog(true)}><ArrowLeft size={14} /> {i18n.game.leaveGame.toUpperCase()}</button></div>
    </header>

    {game.phase === 'Role Reveal' && !watching ? <RoleReveal game={game} player={currentPlayer} me={me} namesOf={namesOf} roomName={roomName} isHost={canSkip} busy={busy} secondsLeft={secondsLeft} onContinue={hostSkip} onReady={() => { void send('reveal-ready'); }} /> : <>
      <div className="core-game-board">
        <aside className="game-player-list game-player-list-left"><div className="game-list-heading">{i18n.game.table} <span>{String(game.players.length).padStart(2, '0')}</span></div>{leftPlayers.map(renderPlayer)}{!currentPlayer.alive && !watching && <GhostVoice roomCode={roomCode} userId={userId} />}{whisperOpen && !watching && <GhostVoice key="mafia-whisper" roomCode={roomCode} userId={userId} channel="mafia" />}</aside>
        <section className="crime-stage">
          <div className="crime-stage-art" aria-hidden="true"><div className="crime-window" /><div className="crime-light" /><div className="crime-table" /></div>
          <div className="crime-stage-label"><span><i /> {roomName.toUpperCase()} · {roomCode}</span>{me.spectatorRoles && <span className="spectator-tag">{t(`АЖИГЛАГЧ · БҮХ ДҮР ХАРАГДАНА`, `SPECTATOR · ALL ROLES VISIBLE`)}</span>}</div>
          {game.phase === 'Night' && <NightPanel round={game.round} player={currentPlayer} me={me} mafiaNames={mafiaNames} nameOf={nameOf} selectedName={nightSelection === null ? undefined : nameOf(nightSelection)} lockedName={me.nightAction.targetId === null ? undefined : nameOf(me.nightAction.targetId)} lastProtectedName={me.lastProtectedId === null ? undefined : nameOf(me.lastProtectedId)} busy={busy} onConfirm={confirmNight} onCancel={() => setNightSelection(null)} />}
          {game.phase === 'Morning' && <MorningPanel round={game.round} report={game.morningReport} winner={game.winner} isHost={canSkip} busy={busy} onContinue={hostSkip} doneBar={doneBar} />}
          {game.phase === 'Discussion' && <DiscussionPanel round={game.round} alive={currentPlayer.alive} watching={Boolean(watching)} isHost={canSkip} busy={busy} onVote={hostSkip} doneBar={doneBar} onPrivate={() => setPrivateOpen((open) => !open)} />}
          {game.phase === 'Voting' && <VotingPanel game={game} me={me} alive={currentPlayer.alive} voteSelection={voteSelection} voteConfirmOpen={voteConfirmOpen} isHost={canSkip} busy={busy} nameOf={nameOf} onSkip={() => setVoteSelection('skip')} onReview={() => voteSelection === null ? onNotice(translateMessage('Choose a living player or Skip Vote.')) : setVoteConfirmOpen(true)} onSubmit={submitVote} onCancel={() => { setVoteConfirmOpen(false); setVoteSelection(null); }} onNext={hostSkip} doneBar={doneBar} onVerdict={giveVerdict} />}
          {quickOpen && <div className="quick-replies" aria-label={t('Хурдан хариулт', 'Quick replies')}>{QUICK_REPLIES.map((text) => <button type="button" key={text} onClick={() => quick.send(text)}>{text}</button>)}</div>}
        </section>
        <aside className="game-player-list game-player-list-right"><div className="game-list-heading">{i18n.game.stillInIt} <span>{String(living.length).padStart(2, '0')}</span></div>{rightPlayers.map(renderPlayer)}{!watching && <><MyRoleCard role={roleInfo(me.role)} dead={!currentPlayer.alive} onOpen={() => setCardOpen(true)} /><button className="private-info-button" onClick={() => setPrivateOpen((open) => !open)}><LockKeyhole size={13} /> {i18n.game.privateInfo}</button></>}</aside>
      </div>
    </>}

    {introOpen && <RoleRevealIntro role={roleInfo(me.role)} onDone={closeIntro} />}
    {cardOpen && <RoleCardViewer role={roleInfo(me.role)} onClose={closeCard} />}
    {privateOpen && !watching && <PrivateInfoPanel player={currentPlayer} me={me} mafiaNames={mafiaNames} namesOf={namesOf} onClose={() => setPrivateOpen(false)} />}
    {leaveDialog && <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="leave-game-title"><div className="modal-symbol"><ArrowLeft size={18} /></div><h2 id="leave-game-title">{t(`Тоглоомоос гарах уу?`, `Leave the game?`)}</h2><p>{t(`Гарвал та хасагдсанд тооцогдож, энэ тоглолтод буцаж орох боломжгүй.`, `If you leave, you count as eliminated and cannot rejoin this match.`)}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setLeaveDialog(false)}>{t(`ҮЛДЭХ`, `STAY`)}</button><button className="primary-button" onClick={onLeave}>{t(`ТОГЛООМООС ГАРАХ`, `LEAVE GAME`)}</button></div></section></div>}
    {settingsOpen && <div className="game-modal-backdrop" onClick={() => setSettingsOpen(false)}><section className="game-modal game-settings-modal" role="dialog" aria-modal="true" aria-labelledby="game-settings-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setSettingsOpen(false)} aria-label={t('Тохиргоо хаах', 'Close settings')}><X size={16} /></button><div className="modal-symbol"><Settings size={18} /></div><h2 id="game-settings-title">{t(`Тоглоомын тохиргоо`, `Game settings`)}</h2><p>{ranked ? t('Рэйтинг тоглолт: үе шат цаг дуусахад, эсвэл бүх тоглогч «БОЛСОН» дарахад солигдоно.', 'Ranked match: each phase moves on when time runs out or every player taps “DONE”.') : t('Үе шат бүр цаг дуусахад автоматаар солигдоно. Өрөөний эзэн хүлээх үеийг алгасаж болно.', 'Each phase moves on automatically when time runs out. The room host can skip waiting phases.')}</p><p className="rules-line">{t(`Дүрэм: ${rulesSummary(game.settings)}`, `Rules: ${rulesSummary(game.settings)}`)}</p><div className="setting-list modal-volume"><VolumeControls /></div><div className="modal-fullscreen"><FullscreenToggle fullscreen={fullscreen} /></div><div className="modal-actions"><button className="primary-button" onClick={() => setSettingsOpen(false)}>{t(`ТОГЛООМ ҮРГЭЛЖЛҮҮЛЭХ`, `RESUME GAME`)}</button></div></section></div>}
  </div>);
}

function HostButton({ isHost, busy, label, onClick }: { isHost: boolean; busy: boolean; label: string; onClick: () => void }) {
  if (!isHost) return <div className="action-locked"><Clock3 size={12} />{t(` Цаг дуусахад автоматаар үргэлжилнэ.`, ` Moves on automatically when time runs out.`)}</div>;
  return <button className="primary-button" disabled={busy} onClick={onClick}>{label} <ChevronRight size={15} /></button>;
}

function RoleReveal({ game, player, me, namesOf, roomName, isHost, busy, secondsLeft, onContinue, onReady }: { game: PublicGameView; player: PublicGamePlayer; me: PrivateGameView; namesOf: (ids: number[]) => string[]; roomName: string; isHost: boolean; busy: boolean; secondsLeft: number | null; onContinue: () => void; onReady: () => void }) {
  const role = roleInfo(me.role);
  const roleSecret = isMafiaMember(me.role) ? t(`Таны мафийн хамтрагчид: ${namesOf(me.info.mafiaTeammateIds).join(', ') || 'байхгүй'}.${me.role === 'Don' ? ' Та тэднийг удирдана.' : ''}`, `Your Mafia partners: ${namesOf(me.info.mafiaTeammateIds).join(', ') || 'none'}.${me.role === 'Don' ? ' You lead them.' : ''}`) : me.role === 'Good Informant' ? t(`Мафийн таних тэмдэг: ${namesOf(me.info.informantMafiaIds).join(', ') || 'идэвхтэй гишүүн алга'}.`, `Mafia identities: ${namesOf(me.info.informantMafiaIds).join(', ') || 'no active members'}.`) : me.role === 'Bad Informant' ? t(`Таны туслах мафийн гишүүд: ${namesOf(me.info.informantMafiaIds).join(', ') || 'идэвхтэй гишүүн алга'}. Тэд таныг мэдэхгүй.`, `The Mafia you help: ${namesOf(me.info.informantMafiaIds).join(', ') || 'no active members'}. They don’t know you.`) : me.role === 'Jester' ? t('Зорилго: шүүх хурлаар хасагдах. Сэжигтэй харагдаарай!', 'Goal: get voted out at trial. Look suspicious!') : '';
  const people = game.players.filter((entry) => entry.alive && !entry.bot);
  const readyCount = people.filter((entry) => (game.readyIds ?? []).includes(entry.id)).length;
  const waitLine = t(`Бэлэн ${readyCount}/${people.length} · шөнө ${secondsLeft ?? '…'} секундын дараа`, `Ready ${readyCount}/${people.length} · night in ${secondsLeft ?? '…'} seconds`);
  return <main className="role-reveal-screen"><div className="reveal-backdrop"><div className="reveal-moon" /><div className="reveal-city" /></div><div className="reveal-heading"><span>{t(`ЭЭЛЖ 01 `, `ROUND 01 `)}<i>•</i> {roomName.toUpperCase()}</span><h1>{t(`Хот `, `The city `)}<em>{t(`шийдвэрээ гаргалаа.`, `has decided.`)}</em></h1><p>{t(`${player.name}, таны дүр нууц. Дэлгэцээ бусдад бүү харуул.`, `${player.name}, your role is secret. Don’t show your screen to anyone.`)}</p></div><article className={`reveal-role-card team-${role.team}`}><div className="reveal-card-art"><RoleCardArtwork role={role} /><span>{t(`НУУЦ`, `SECRET`)}</span></div><div className="reveal-card-copy"><span className={`team-tag ${role.team}`}>{translateTeam(role.team).toUpperCase()} {i18n.game.messages.specialAbility.toUpperCase()}</span><h2>{role.displayName}</h2><p>{role.description}</p><p className="reveal-role-ability">{role.ability}</p>{roleSecret && <div className="role-reveal-secret"><LockKeyhole size={12} />{roleSecret}</div>}<div className="reveal-private-note"><LockKeyhole size={13} /><span>{t(`Энэ картыг зөвхөн та харах боломжтой.`, `Only you can see this card.`)}</span></div></div></article>
    <div className="reveal-ready-row">
      {me.readyForNight
        ? <span className="reveal-wait"><Check size={14} /> {waitLine}</span>
        : <button className="primary-button" disabled={busy} onClick={onReady}><Check size={15} />{t(` БЭЛЭН`, ` READY`)}</button>}
      {isHost && <button className="secondary-button" disabled={busy} onClick={onContinue}>{t(`ШӨНИЙГ ЭХЛҮҮЛЭХ `, `START THE NIGHT `)}<ChevronRight size={15} /></button>}
      {!me.readyForNight && <span className="reveal-wait">{waitLine}</span>}
    </div></main>;
}

function NightPanel({ round, player, me, mafiaNames, nameOf, selectedName, lockedName, lastProtectedName, busy, onConfirm, onCancel }: {
  round: number; player: PublicGamePlayer; me: PrivateGameView; mafiaNames: string[]; nameOf: (id: number) => string | undefined; selectedName?: string; lockedName?: string; lastProtectedName?: string; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const role = me.role;
  const nightRole = me.nightRole;
  const targetVerb = nightRole === 'Mafia' ? (role === 'Bad Informant' ? t('Мафийн гишүүд хасагдсан тул довтолгоог та удирдана. Зорилтоо сонгоно уу.', 'The Mafia members are out, so you lead the attack now. Choose your target.') : role === 'Don' ? t('Довтолгооны зорилтоо сонгоно уу. Таны сонголт эцсийнх.', 'Choose the target of the attack. Your choice is final.') : t('Мафийн зорилт сонгоно уу.', 'Choose the Mafia’s target.')) : nightRole === 'Doctor' ? t('Шөнө хамгаалах тоглогчоо сонгоно уу.', 'Choose a player to protect tonight.') : nightRole === 'Detective' ? t('Шалгах тоглогчоо сонгоно уу.', 'Choose a player to investigate.') : nightRole === 'Bodyguard' ? t('Хамгаалах тоглогчоо сонгоно уу. Түүн рүү халдвал та оронд нь амиа өгнө.', 'Choose a player to guard. If they are attacked, you die in their place.') : '';
  const submitted = me.nightAction.submitted;
  const privateResult = nightRole === 'Detective' ? translateMessage(me.info.investigationResult) : '';
  return <div className="phase-panel night-panel"><div className="phase-panel-heading"><span className="night-panel-icon"><Moon size={17} /></span><div><small>{t(`ШӨНӨ ${round} · ХУВИЙН ҮЙЛДЭЛ`, `NIGHT ${round} · PRIVATE ACTION`)}</small><h2>{player.alive ? translateRole(role) : t('Шөнө бууж ирлээ', 'Night has fallen')}</h2></div></div>
    {!player.alive ? <p>{t(`Та хасагдсан тул шөнийн үйлдэл хийх боломжгүй. Хот сэрэхийг хүлээнэ үү.`, `You are out of the game, so you have no night action. Wait for the city to wake.`)}</p> : <>
      <p>{nightRole ? targetVerb : t('Таны дүрд шөнийн үйлдэл байхгүй. Нүдээ аниад өглөөг хүлээнэ үү.', 'Your role has no night action. Close your eyes and wait for morning.')}</p>
      {isMafiaMember(role) && mafiaNames.length > 0 && <div className="night-secret"><Skull size={12} />{t(` Хамтрагчид: ${mafiaNames.join(', ')}. `, ` Partners: ${mafiaNames.join(', ')}. `)}{role === 'Don' ? t('Тэд санал өгнө, эцсийн шийдвэр таных.', 'They vote; the final call is yours.') : t('Дон байвал түүний сонголт, үгүй бол олонхийн сонгосон хүн рүү довтолно.', 'The Don’s choice counts if there is a Don; otherwise the majority’s target is attacked.')}</div>}
      {me.teamTargets && Object.keys(me.teamTargets).length > 0 && <div className="night-secret team-picks"><Target size={12} />{t(` Хамтрагчийн сонголт — ${Object.entries(me.teamTargets).map(([id, target]) => `${nameOf(Number(id)) ?? '?'}: ${target === null ? 'сонгоогүй' : nameOf(target) ?? '?'}`).join(' · ')}`, ` Partners’ picks — ${Object.entries(me.teamTargets).map(([id, target]) => `${nameOf(Number(id)) ?? '?'}: ${target === null ? 'none yet' : nameOf(target) ?? '?'}`).join(' · ')}`)}</div>}
      {role === 'Good Informant' && <div className="night-secret"><LockKeyhole size={12} />{t(` Таны хувийн сэжүүр: `, ` Your private clue: `)}{mafiaNames.join(', ') || t('Идэвхтэй мафийн гишүүн алга.', 'No active Mafia members.')}</div>}
      {nightRole === 'Doctor' && lastProtectedName && !submitted && <div className="night-secret"><HeartPulse size={12} />{t(` Өчигдөр ${lastProtectedName}-г хамгаалсан тул энэ шөнө өөр хүн сонгоно.`, ` You protected ${lastProtectedName} last night, so choose someone else tonight.`)}</div>}
      {role === 'Old Lady with Shotgun' && <div className="night-secret"><Crosshair size={12} /> {me.shotgunSpent ? t('Таны буу аль хэдийн буудсан. Дахин хариу буудах боломжгүй.', 'Your shotgun has already fired. You cannot shoot back again.') : t('Мафи тан руу анх халдахад буугаар нэг удаа хариу буудна.', 'The first time the Mafia come for you, you shoot back once.')}</div>}
      {role === 'Bad Informant' && <div className="night-secret"><Skull size={12} />{t(` Таны туслах мафийн гишүүд: `, ` The Mafia you help: `)}{mafiaNames.join(', ') || t('идэвхтэй гишүүн алга', 'no active members')}{t(`. Тэд таныг мэдэхгүй.`, `. They don’t know you.`)}</div>}
      {role === 'Bad Informant' && nightRole !== 'Mafia' && <div className="night-secret"><LockKeyhole size={12} /> {translateMessage(me.info.badInformantObjective)}</div>}
      {role === 'Citizen' && <div className="night-secret"><Shield size={12} />{t(` Өглөөний тайланг анхаараарай.`, ` Keep an eye on the morning report.`)}</div>}
      {role === 'Jester' && <div className="night-secret"><Drama size={12} />{t(` Өдөр сэжигтэй харагдаж, шүүх хурлаар хасагдвал та ганцаараа ялна.`, ` Look suspicious by day; if you are voted out at trial, you win alone.`)}</div>}
      {privateResult && <div className="action-locked"><LockKeyhole size={12} /> {privateResult}</div>}
      {submitted && <div className="action-locked"><Check size={13} />{t(` Үйлдэл баталгаажсан`, ` Action confirmed`)}{lockedName ? ` · ${lockedName}` : ''}{t(`. Бусдыг хүлээж байна.`, `. Waiting for the others.`)}</div>}
      {!submitted && nightRole && <div className="night-target-hint"><Target size={12} /> {selectedName ? t(`Сонгосон: ${selectedName}`, `Selected: ${selectedName}`) : t('Амьд тоглогчийн картыг товшоод зорилт сонгоно уу.', 'Tap a living player’s card to choose a target.')}</div>}
    </>}
    {player.alive && nightRole && !submitted && <div className="phase-panel-actions"><button className="secondary-button" onClick={onCancel} disabled={!selectedName}>{t(`БОЛИХ`, `CANCEL`)}</button><button className="primary-button" onClick={onConfirm} disabled={busy || !selectedName}>{t(`ҮЙЛДЭЛ БАТЛАХ `, `CONFIRM ACTION `)}<Check size={14} /></button></div>}
  </div>;
}

/** Ranked: "done" for the current step, with how many are done. The clock still ends it anyway. */
function DoneBar({ alive, done, count, total, busy, onDone }: { alive: boolean; done: boolean; count: number; total: number; busy: boolean; onDone: () => void }) {
  if (!alive) return <div className="action-locked done-bar"><Clock3 size={12} />{t(` Цаг дуусахад эсвэл бүгд «БОЛСОН» дарахад үргэлжилнэ · ${count}/${total}`, ` Moves on when time runs out or everyone taps “DONE” · ${count}/${total}`)}</div>;
  if (done) return <div className="action-locked done-bar"><Check size={13} />{t(` Та бэлэн · ${count}/${total} · бусдыг хүлээж байна`, ` You’re ready · ${count}/${total} · waiting for the others`)}</div>;
  return <div className="done-bar-row"><button className="primary-button done-button" disabled={busy} onClick={onDone}><Check size={14} />{t(` БОЛСОН`, ` DONE`)}</button><span className="done-count">{t(`${count}/${total} бэлэн · бүгд дарвал дараагийн шат эхэлнэ`, `${count}/${total} ready · when everyone taps, the next phase starts`)}</span></div>;
}

function MorningPanel({ round, report, winner, isHost, busy, onContinue, doneBar }: { round: number; report: string; winner: PublicGameView['winner']; isHost: boolean; busy: boolean; onContinue: () => void; doneBar?: ReactNode }) {
  const headline = report.includes('No Mafia attack') ? t('Шөнө тайван өнгөрлөө.', 'The night passed quietly.') : report.includes('shotgun answered') ? t('Харанхуйд буун дуу гарав.', 'A shot rang out in the dark.') : report.includes('No one was eliminated') || report.includes('stopped') ? t('Халдлага няцаагдлаа.', 'The attack was stopped.') : t('Хотод хохирогч гарлаа.', 'The city has a victim.');
  return <div className="phase-panel morning-panel"><div className="morning-seal"><Sun size={21} /></div><div className="morning-kicker">{t(`ӨГЛӨӨНИЙ ТАЙЛАН · ЭЭЛЖ ${round}`, `MORNING REPORT · ROUND ${round}`)}</div><h2>{headline}</h2><p className="morning-report-text">{translateMessage(report)}</p>{doneBar ?? <HostButton isHost={isHost} busy={busy} label={winner ? t('ҮР ДҮНГ ҮЗЭХ', 'SEE RESULTS') : t('ХЭЛЭЛЦҮҮЛЭГ НЭЭХ', 'OPEN DISCUSSION')} onClick={onContinue} />}</div>;
}

function DiscussionPanel({ round, alive, isHost, busy, watching = false, onVote, onPrivate, doneBar }: { round: number; alive: boolean; isHost: boolean; busy: boolean; watching?: boolean; onVote: () => void; onPrivate: () => void; doneBar?: ReactNode }) {
  return <div className="phase-panel discussion-panel"><div className="discussion-head"><div><small>{t(`ӨДӨР ${round} · ХЭЛЭЛЦҮҮЛЭГ`, `DAY ${round} · DISCUSSION`)}</small><h2>{t(`Юу харсан бэ?`, `What did you see?`)}</h2></div><Mic size={19} /></div><p>{watching ? t('Тоглогчид хэлэлцэж байна. Та админаар ажиглаж байгаа тул бүх дүр харагдана.', 'The players are talking. You are watching as an admin, so every role is visible.') : alive ? t('Микрофоноо асаагаад сэжүүрээ хуваалцаарай. Хэн худлаа ярьж байна вэ?', 'Turn on your mic and share your clues. Who is lying?') : t('Та хасагдсан тул сонсох боломжтой, ярих боломжгүй.', 'You are out of the game: you can listen but not speak.')}</p><div className="discussion-actions">{!watching && <button className="secondary-button" onClick={onPrivate}><LockKeyhole size={13} />{t(` НУУЦ МЭДЭЭЛЭЛ`, ` PRIVATE INFO`)}</button>}{doneBar ? null : isHost ? <button className="primary-button" disabled={busy} onClick={onVote}>{t(`САНАЛ ХУРААЛТ НЭЭХ `, `OPEN THE VOTE `)}<Vote size={14} /></button> : <span className="discussion-wait">{t(`Цаг дуусахад санал хураалт эхэлнэ`, `The vote starts when time runs out`)}</span>}</div>{doneBar}</div>;
}

function VotingPanel({ game, me, alive, voteSelection, voteConfirmOpen, isHost, busy, nameOf, onSkip, onReview, onSubmit, onCancel, onNext, onVerdict, doneBar }: {
  game: PublicGameView; me: PrivateGameView; alive: boolean; voteSelection: VoteChoice; voteConfirmOpen: boolean; isHost: boolean; busy: boolean; nameOf: (id: number) => string | undefined;
  onSkip: () => void; onReview: () => void; onSubmit: () => void; onCancel: () => void; onNext: () => void; onVerdict: (choice: 'guilty' | 'innocent') => void; doneBar?: ReactNode;
}) {
  if (game.trial && !game.votesRevealed) return <TrialPanel game={game} me={me} alive={alive} busy={busy} nameOf={nameOf} onVerdict={onVerdict} />;
  const totals = Object.entries(game.voteCounts).sort((left, right) => right[1] - left[1]);
  const runoffNames = game.runoffCandidates && !game.votesRevealed ? game.runoffCandidates.map((id) => nameOf(id) ?? '?') : null;
  const mine = me.vote.choice;
  const mineLabel = mine === 'skip' ? t('АЛГАСАХ', 'SKIP') : typeof mine === 'number' ? nameOf(mine) ?? '?' : t('ӨГӨӨГҮЙ', 'NONE');
  const selectedName = typeof voteSelection === 'number' ? nameOf(voteSelection) : undefined;
  return <div className="phase-panel voting-panel"><div className="discussion-head"><div><small>{t(`ӨДӨР ${game.round} · ЭЦСИЙН САНАЛ`, `DAY ${game.round} · FINAL VOTE`)}</small><h2>{game.votesRevealed ? t('Хот шийдвэрээ гаргалаа.', 'The city has decided.') : runoffNames ? t('Давтан санал хураалт', 'Runoff vote') : t('Сэжигтнээ сонго.', 'Choose your suspect.')}</h2></div><Vote size={19} /></div>
    {runoffNames && <div className="runoff-banner"><Vote size={13} /><span><b>{t(`Санал тэнцлээ.`, `The vote is tied.`)}</b>{t(` Зөвхөн ${runoffNames.join(', ')} нарын дундаас сонгоно. Дахин тэнцвэл хэн ч хасагдахгүй.`, ` Choose only between ${runoffNames.join(', ')}. If it ties again, no one is eliminated.`)}</span></div>}
    {!game.votesRevealed ? <>
      {!alive ? <p>{t(`Та хасагдсан тул санал өгөх боломжгүй.`, `You are out of the game and cannot vote.`)}</p>
        : me.vote.submitted ? <div className="action-locked"><Check size={13} />{t(` Таны санал: ${mineLabel}. Бусдыг хүлээж байна.`, ` Your vote: ${mineLabel}. Waiting for the others.`)}</div>
        : <>{!runoffNames && <p>{t(`Өөрөөсөө бусад амьд тоглогчийг сонгох эсвэл саналаа алгасна уу. Хамгийн олон санал авсан тоглогч шүүгдэж, өөрийгөө хамгаалсны дараа хот гэмтэй эсэхийг шийднэ.`, `Choose another living player or skip your vote. The player with the most votes goes on trial and, after their defence, the city decides whether they are guilty.`)}</p>}<div className="vote-choices"><button className={`skip-vote ${voteSelection === 'skip' ? 'chosen' : ''}`} onClick={onSkip}><ArrowLeft size={13} />{t(` САНАЛ АЛГАСАХ`, ` SKIP VOTE`)}</button><span>{selectedName ? t(`Сонгосон: ${selectedName}`, `Selected: ${selectedName}`) : voteSelection === 'skip' ? t('Сонгосон: Санал алгасах', 'Selected: skip vote') : t('Тоглогчийн картыг товшино уу.', 'Tap a player’s card.')}</span></div><button className="primary-button" onClick={onReview} disabled={voteSelection === null}>{t(`САНАЛЫГ ХЯНАХ `, `REVIEW VOTE `)}<ChevronRight size={15} /></button></>}
    </> : <>
      <p className="vote-summary">{translateMessage(game.voteSummary)}</p>
      <p className="your-vote-status">{t(`ТАНЫ САНАЛ · ${mineLabel}`, `YOUR VOTE · ${mineLabel}`)}{me.verdict ? t(` · ШИЙДВЭР: ${me.verdict === 'guilty' ? 'ГЭМТЭЙ' : 'ГЭМГҮЙ'}`, ` · VERDICT: ${me.verdict === 'guilty' ? 'GUILTY' : 'INNOCENT'}`) : ''}</p>
      {game.trial && game.trial.guilty !== null
        ? <div className="vote-count-list verdict-count-list"><div><span>{t(`ГЭМТЭЙ`, `GUILTY`)}</span><b>{game.trial.guilty}</b></div><div><span>{t(`ГЭМГҮЙ`, `INNOCENT`)}</span><b>{game.trial.innocent}</b></div></div>
        : <div className="vote-count-list">{totals.map(([key, count]) => <div key={key}><span>{key === 'skip' ? t('САНАЛ АЛГАСАХ', 'SKIP VOTE') : nameOf(Number(key)) ?? t('Үл мэдэгдэх', 'Unknown')}</span><b>{count}</b></div>)}</div>}
      {doneBar ?? <HostButton isHost={isHost} busy={busy} label={game.winner ? t('ҮР ДҮНГ ҮЗЭХ', 'SEE RESULTS') : t('ДАРААХ ШӨНӨ', 'NEXT NIGHT')} onClick={onNext} />}
    </>}
    {voteConfirmOpen && !game.votesRevealed && alive && !me.vote.submitted && <div className="vote-confirm-card"><div><small>{t(`САНАЛАА БАТЛАХ`, `CONFIRM YOUR VOTE`)}</small><p>{voteSelection === 'skip' ? t('Саналаа алгасах уу?', 'Skip your vote?') : t(`${selectedName ?? 'Энэ тоглогч'}-г хасах санал өгөх үү?`, `Vote to eliminate ${selectedName ?? 'this player'}?`)}</p></div><div><button className="secondary-button" onClick={onCancel}>{t(`БОЛИХ`, `CANCEL`)}</button><button className="primary-button" disabled={busy} onClick={onSubmit}>{t(`САНАЛ ИЛГЭЭХ `, `SEND VOTE `)}<Check size={13} /></button></div></div>}
  </div>;
}

/** The nominated player defends themselves; everyone else living gives a guilty / innocent verdict. */
function TrialPanel({ game, me, alive, busy, nameOf, onVerdict }: {
  game: PublicGameView; me: PrivateGameView; alive: boolean; busy: boolean; nameOf: (id: number) => string | undefined; onVerdict: (choice: 'guilty' | 'innocent') => void;
}) {
  const trial = game.trial!;
  const accused = nameOf(trial.accusedId) ?? '?';
  const iAmAccused = trial.accusedId === me.seat;
  const eligible = game.players.filter((player) => player.alive && player.id !== trial.accusedId).length;
  return <div className="phase-panel voting-panel trial-panel">
    <div className="discussion-head"><div><small>{t(`ӨДӨР ${game.round} · ШҮҮХ ХУРАЛ`, `DAY ${game.round} · TRIAL`)}</small><h2>{iAmAccused ? t('Та буруутгагдлаа.', 'You are accused.') : t(`${accused} шүүгдэж байна.`, `${accused} is on trial.`)}</h2></div><Vote size={19} /></div>
    <p>{iAmAccused
      ? t(`${trial.nominationVotes} хүн таныг сонголоо. Микрофоноор өөрийгөө хамгаалж, яагаад мафи биш гэдгээ тайлбарла.`, `${trial.nominationVotes} players chose you. Use your mic to defend yourself and explain why you are not the Mafia.`)
      : t(`${accused} ${trial.nominationVotes} санал авлаа. Түүний хамгаалалтыг сонсоод шийдвэрээ гарга. Тэнцвэл цагаатгана.`, `${accused} got ${trial.nominationVotes} votes. Hear their defence, then decide. A tie means acquittal.`)}</p>
    {!alive ? <p>{t(`Та хасагдсан тул шийдвэр өгөх боломжгүй.`, `You are out of the game and cannot give a verdict.`)}</p>
      : iAmAccused ? <div className="action-locked"><Mic size={13} />{t(` Бусад ${eligible} тоглогч шийдвэрээ гаргаж байна · ${trial.decided}/${eligible}`, ` The other ${eligible} players are deciding · ${trial.decided}/${eligible}`)}</div>
      : me.verdict ? <div className="action-locked"><Check size={13} />{t(` Таны шийдвэр: `, ` Your verdict: `)}{me.verdict === 'guilty' ? t('ГЭМТЭЙ', 'GUILTY') : t('ГЭМГҮЙ', 'INNOCENT')}{t(`. Бусдыг хүлээж байна · ${trial.decided}/${eligible}`, `. Waiting for the others · ${trial.decided}/${eligible}`)}</div>
      : <div className="verdict-actions"><button className="secondary-button" disabled={busy} onClick={() => onVerdict('innocent')}><Shield size={14} />{t(` ГЭМГҮЙ`, ` INNOCENT`)}</button><button className="primary-button" disabled={busy} onClick={() => onVerdict('guilty')}><Skull size={14} />{t(` ГЭМТЭЙ`, ` GUILTY`)}</button></div>}
  </div>;
}

function PrivateInfoPanel({ player, me, mafiaNames, namesOf, onClose }: { player: PublicGamePlayer; me: PrivateGameView; mafiaNames: string[]; namesOf: (ids: number[]) => string[]; onClose: () => void }) {
  const role = roleInfo(me.role);
  const info = me.info;
  const informant = me.role === 'Good Informant' ? t(`Мафийн таних тэмдэг: ${namesOf(info.informantMafiaIds).join(', ') || 'идэвхтэй гишүүн алга'}`, `Mafia identities: ${namesOf(info.informantMafiaIds).join(', ') || 'no active members'}`) : '';
  const notebook = Object.entries(me.knownAlignment);
  return <aside className="game-private-panel" aria-label={t('Нууц дүрийн мэдээлэл', 'Your secret role')}><header><span><LockKeyhole size={12} />{t(` ЗӨВХӨН ${player.name.toUpperCase()} ҮҮНИЙГ ХАРНА`, ` ONLY ${player.name.toUpperCase()} CAN SEE THIS`)}</span><button onClick={onClose} aria-label={t('Нууц мэдээлэл хаах', 'Close private info')}><X size={15} /></button></header><div className="private-game-role"><span className={`private-game-icon team-${role.team}`}><NightIcon role={role.name} /></span><div><small>{t(`ТАНЫ ДҮР`, `YOUR ROLE`)}</small><b>{role.displayName}</b></div></div><RoleCardArtwork role={role} compact /><p>{role.description}</p><p className="private-role-ability">{role.ability}</p>
    {isMafiaMember(me.role) && <div className="private-secret-line"><b>{t(`МАФИЙН ХАМТРАГЧИД`, `MAFIA PARTNERS`)}</b><span>{mafiaNames.join(', ') || t('Та цорын ганц мафийн гишүүн.', 'You are the only Mafia member.')}</span></div>}
    {me.role === 'Don' && <div className="private-secret-line"><b>{t(`ДОН`, `DON`)}</b><span>{t(`Довтолгооны эцсийн шийдвэр таных. Цагдаа таныг «мафи биш» гэж харна.`, `The final call on each attack is yours. The Detective sees you as “not Mafia”.`)}</span></div>}
    {me.role === 'Jester' && <div className="private-secret-line"><b>{t(`НУУЦ ЗОРИЛГО`, `SECRET GOAL`)}</b><span>{t(`Шүүх хурлаар гэмтэй гэж хасагдвал ганцаараа ялна.`, `Get voted out as guilty at trial and you win alone.`)}</span></div>}
    {informant && <div className="private-secret-line"><b>{t(`ХУВИЙН СЭЖҮҮР`, `PRIVATE CLUE`)}</b><span>{informant}</span></div>}
    {me.role === 'Bad Informant' && <div className="private-secret-line"><b>{t(`ТАНЫ ТУСЛАХ МАФИ`, `THE MAFIA YOU HELP`)}</b><span>{namesOf(info.informantMafiaIds).join(', ') || t('Идэвхтэй мафийн гишүүн алга.', 'No active Mafia members.')}{t(` Тэд таныг мэдэхгүй.`, ` They don’t know you.`)}</span></div>}
    {me.role === 'Bad Informant' && <div className="private-secret-line"><b>{t(`НУУЦ ЗОРИЛГО`, `SECRET GOAL`)}</b><span>{translateMessage(info.badInformantObjective)}</span></div>}
    {me.role === 'Detective' && notebook.length > 0 && <div className="private-secret-line detective-notebook"><b>{t(`ЦАГДААГИЙН ТЭМДЭГЛЭЛ`, `DETECTIVE’S NOTES`)}</b>{notebook.map(([id, alignment]) => <span key={id} className={`notebook-entry is-${alignment}`}>{namesOf([Number(id)])[0] ?? '?'} — {alignment === 'mafia' ? t('мафийн талд', 'Mafia') : t('мафи биш', 'not Mafia')}</span>)}</div>}
    {info.protectionResult && <div className="private-secret-line"><b>{t(`ХАМГААЛАЛТ · ХУВИЙН`, `PROTECTION · PRIVATE`)}</b><span>{translateMessage(info.protectionResult)}</span></div>}
    {me.role === 'Old Lady with Shotgun' && <div className="private-secret-line"><b>{t(`БУУ`, `SHOTGUN`)}</b><span>{me.shotgunSpent ? t('Буудсан — дахин хариу буудах боломжгүй.', 'Fired — you cannot shoot back again.') : t('Цэнэглэсэн — нэг удаа хариу буудна.', 'Loaded — you shoot back once.')}</span></div>}
  </aside>;
}

/** Night-by-night and day-by-day recap, shown once the game is over. */
function MatchRecap({ game, onClose }: { game: PublicGameView; onClose: () => void }) {
  const name = (id: number | null) => id === null ? '?' : game.players.find((player) => player.id === id)?.name ?? '?';
  const withRole = (id: number) => {
    const role = game.finalRoles?.[id];
    return role ? `${name(id)} (${translateRole(role)})` : name(id);
  };
  return <div className="game-modal-backdrop" onClick={onClose}><section className="game-modal match-recap" role="dialog" aria-modal="true" aria-label={t('Тоглолтын түүх', 'Match history')} onClick={(event) => event.stopPropagation()}>
    <header><h2>{t(`Тоглолтын түүх`, `Match history`)}</h2><button type="button" className="game-icon-button" onClick={onClose} aria-label={t('Хаах', 'Close')}><X size={15} /></button></header>
    <ol className="recap-list">{(game.history ?? []).map((entry, index) => entry.kind === 'night'
      ? <li key={index} className="recap-night"><b><Moon size={13} />{t(` ШӨНӨ ${entry.round}`, ` NIGHT ${entry.round}`)}</b>
          <span>{entry.mafiaTargetId === null ? t('Мафи хэнийг ч онилоогүй.', 'The Mafia targeted no one.') : t(`Мафи ${withRole(entry.mafiaTargetId)}-г онилсон.`, `The Mafia targeted ${withRole(entry.mafiaTargetId)}.`)}
            {entry.outcome === 'killed' ? t(` ${name(entry.eliminatedId)} алагдсан.`, ` ${name(entry.eliminatedId)} was killed.`) : entry.outcome === 'protected' ? t(' Эмч хамгаалж аварсан.', ' The Doctor saved them.') : entry.outcome === 'guarded' ? t(` Бие хамгаалагч ${name(entry.eliminatedId)} оронд нь амиа өгсөн.`, ` The Bodyguard died in place of ${name(entry.eliminatedId)}.`) : entry.outcome === 'shotgun' ? (entry.eliminatedId === null ? t(' Буутай эмээ халдлагыг няцаасан.', ' The Shotgun Granny fought off the attack.') : t(` Буутай эмээ хариу буудаж ${withRole(entry.eliminatedId)}-г хассан.`, ` The Shotgun Granny shot back and took out ${withRole(entry.eliminatedId)}.`)) : ''}</span>
          {entry.protectedIds.length > 0 && <span>{t(`Эмч: ${entry.protectedIds.map(name).join(', ')}-г хамгаалсан.`, `Doctor: protected ${entry.protectedIds.map(name).join(', ')}.`)}</span>}
          {(entry.guardIds?.length ?? 0) > 0 && <span>{t(`Бие хамгаалагч: ${entry.guardIds!.map(name).join(', ')}-г манасан.`, `Bodyguard: guarded ${entry.guardIds!.map(name).join(', ')}.`)}</span>}
          {entry.investigations.map((check) => <span key={`${check.detectiveId}-${check.targetId}`}>{t(`Цагдаа ${name(check.detectiveId)}: ${name(check.targetId)} — `, `Detective ${name(check.detectiveId)}: ${name(check.targetId)} — `)}{check.mafia ? t('мафийн тал', 'Mafia') : t('мафи биш', 'not Mafia')}.</span>)}
        </li>
      : <li key={index} className="recap-day"><b><Sun size={13} />{t(` ӨДӨР ${entry.round}`, ` DAY ${entry.round}`)}</b>
          <span>{entry.accusedId === null ? t('Хэн ч шүүгдээгүй.', 'No one went on trial.') : t(`${withRole(entry.accusedId)} шүүгдсэн: гэмтэй ${entry.guilty ?? 0} – гэмгүй ${entry.innocent ?? 0}. ${entry.eliminatedId === null ? 'Цагаатгагдсан.' : entry.jester ? 'Хасагдсан — Алиа яллаа!' : 'Хасагдсан.'}`, `${withRole(entry.accusedId)} went on trial: guilty ${entry.guilty ?? 0} – innocent ${entry.innocent ?? 0}. ${entry.eliminatedId === null ? 'Acquitted.' : entry.jester ? 'Eliminated — the Jester wins!' : 'Eliminated.'}`)}</span>
        </li>)}</ol>
  </section></div>;
}

function ResultsScreen({ game, me, roomName, roomCode, userId, isHost, watching = false, onReplay, onMenu }: { game: PublicGameView; me: PrivateGameView; roomName: string; roomCode: string; userId: string; isHost: boolean; watching?: boolean; onReplay: () => void; onMenu: () => void }) {
  const [recapOpen, setRecapOpen] = useState(false);
  const headline = game.winner === 'Citizens' ? i18n.game.results.citizensWin : game.winner === 'Mafia' ? i18n.game.results.mafiaWin : game.winner === 'Jester' ? i18n.game.results.jesterWin : i18n.game.results.draw;
  // The Jester only wins alone; town and Mafia win as teams.
  const iWon = game.winner === 'Jester' ? me.role === 'Jester' : me.team !== 'wildcard' && (game.winner === 'Mafia') === (me.team === 'mafia');
  const history = game.history ?? [];
  const nights = history.filter((entry) => entry.kind === 'night');
  const stats = [
    t(`${nights.length} шөнө`, `${plural(nights.length, 'night')}`),
    t(`${nights.filter((entry) => entry.eliminatedId !== null && entry.outcome !== 'shotgun').length} аллага`, `${plural(nights.filter((entry) => entry.eliminatedId !== null && entry.outcome !== 'shotgun').length, 'kill')}`),
    t(`${nights.filter((entry) => entry.outcome === 'protected' || entry.outcome === 'guarded' || entry.outcome === 'shotgun').length} аврагдсан`, `${nights.filter((entry) => entry.outcome === 'protected' || entry.outcome === 'guarded' || entry.outcome === 'shotgun').length} saved`),
    t(`${nights.reduce((total, entry) => total + (entry.kind === 'night' ? entry.investigations.length : 0), 0)} шалгалт`, `${plural(nights.reduce((total, entry) => total + (entry.kind === 'night' ? entry.investigations.length : 0), 0), 'check')}`),
    t(`${history.filter((entry) => entry.kind === 'day' && entry.accusedId !== null).length} шүүх хурал`, `${plural(history.filter((entry) => entry.kind === 'day' && entry.accusedId !== null).length, 'trial')}`),
  ];
  return <main className="game-results-screen"><div className="results-glow" /><div className="results-heading"><span>{t(`ЭЭЛЖ ${String(game.round).padStart(2, '0')} · ${roomName.toUpperCase()}`, `ROUND ${String(game.round).padStart(2, '0')} · ${roomName.toUpperCase()}`)}</span><h1>{headline}</h1><p>{watching ? t('Админ ажиглагч · тоглолт дууслаа.', 'Admin spectator · the match is over.') : game.winner === 'Jester' ? (iWon ? t('Та бүгдийг хуурч ганцаараа яллаа!', 'You fooled everyone and won alone!') : t('Алиа таныг хуурчээ.', 'The Jester fooled you.')) : iWon ? t('Таны баг яллаа!', 'Your team won!') : t('Таны баг энэ удаа ялагдлаа.', 'Your team lost this time.')}</p>{history.length > 0 && <p className="results-stats">{stats.join(' · ')}</p>}{!watching && <RankResultBanner roomCode={roomCode} userId={userId} />}</div><div className="results-player-list">{game.players.map((player) => { const roleName = game.finalRoles?.[player.id]; const role = roleName ? roleInfo(roleName) : null; return <div className={`results-player ${!player.alive ? 'is-dead' : ''}`} key={player.id}><Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials}><VoiceAvatarIndicator name={player.name} seat={player.id} /></Avatar><span className="results-name">{player.name}{player.id === me.seat && <small>{t(`ЧИ`, `YOU`)}</small>}</span>{role && <span className={`team-tag ${role.team}`}>{translateRole(role.name)}</span>}<span className="results-status">{player.alive ? t('АМЬД', 'ALIVE') : t('ХАСАГДСАН', 'OUT')}</span></div>; })}</div><div className="results-actions"><button className="secondary-button" onClick={onMenu}><ArrowLeft size={14} /> {i18n.game.results.mainMenu}</button>{(game.history?.length ?? 0) > 0 && <button className="secondary-button" onClick={() => setRecapOpen(true)}><Info size={14} />{t(` ТОГЛОЛТЫН ТҮҮХ`, ` MATCH HISTORY`)}</button>}{isHost ? <button className="primary-button" onClick={onReplay}>{i18n.game.results.playAgain} <ChevronRight size={15} /></button> : <span className="discussion-wait">{t(`Эзэн шинэ тоглолт эхлүүлэхийг хүлээж байна`, `Waiting for the host to start a new match`)}</span>}</div>{recapOpen && <MatchRecap game={game} onClose={() => setRecapOpen(false)} />}</main>;
}
