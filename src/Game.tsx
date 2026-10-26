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
import Avatar, { nameplate } from './Avatar';
import { useLongPress } from './Social';

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

function GamePlayerCard({ player, isCurrent, selected, selectable, voteCount, voteTargetName, runoff, finalRole, bubble, frame, plateKey, onSelect, onProfile }: {
  player: PublicGamePlayer; isCurrent: boolean; selected: boolean; selectable: boolean; voteCount?: number; voteTargetName?: string; runoff?: boolean; finalRole?: RoleName; bubble?: string;
  frame?: string | null; plateKey?: string | null; onSelect: () => void; onProfile: () => void;
}) {
  const plate = nameplate(plateKey);
  const shownRole = player.revealedRole ?? finalRole;
  // Tap picks a target while one can be picked, otherwise opens the profile; a long press always opens it.
  const press = useLongPress(onProfile);
  const tap = () => { if (press.fired.current) { press.fired.current = false; return; } if (selectable) onSelect(); else onProfile(); };
  return <button type="button" className={`game-player-card ${isCurrent ? 'is-current' : ''} ${selected ? 'is-selected' : ''} ${!player.alive ? 'is-dead' : ''} ${runoff ? 'is-runoff' : ''} ${selectable ? '' : 'is-locked'} ${plate.className}`} style={plate.style} onClick={tap} {...press.handlers} aria-pressed={selected}>
    <Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials} frame={frame}>{player.host && <i><Crown size={10} /></i>}<VoiceAvatarIndicator name={player.name} seat={player.id} /></Avatar>
    <span className="game-player-copy"><b>{player.name}{isCurrent && <small>ЧИ</small>}</b><span className={`${player.alive ? 'alive-label' : 'dead-label'} ${finalRole && roleInfo(finalRole).team === 'mafia' ? 'spectator-mafia' : ''}`}>{player.alive ? (runoff ? 'ДАВТАН САНАЛД' : finalRole ? `АМЬД · ${translateRole(finalRole).toUpperCase()}` : 'АМЬД') : shownRole ? `ХАСАГДСАН · ${translateRole(shownRole).toUpperCase()}` : 'ХАСАГДСАН'}</span></span>
    {voteCount !== undefined && <span className="player-vote-count">{voteCount} <small>САНАЛ</small></span>}
    {player.voteStatus === 'revealed' && <span className="player-vote-status">{player.voteTargetId === null ? 'АЛГАСАВ' : `САНАЛ ${voteTargetName ?? ''}`}</span>}
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

export default function GameScreen({ roomCode, roomName, userId, isHost, seats, onLeave, onRematch, onNotice, fullscreen, onProfile, watching }: {
  roomCode: string; roomName: string; userId: string; isHost: boolean; seats: RoomSeat[];
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
    return <div className="core-game"><div className="room-loading">Ширээ бэлдэж байна…</div></div>;
  }

  const currentPlayer: PublicGamePlayer = game.players.find((player) => player.id === me.seat)
    ?? { id: me.seat, name: '?', initials: '?', color: 'rose', alive: false, voteStatus: 'not-eligible', voteTargetId: null, revealedRole: null };
  const living = game.players.filter((player) => player.alive);
  const nameOf = (id: number) => game.players.find((player) => player.id === id)?.name;
  const namesOf = (ids: number[]) => ids.map(nameOf).filter((name): name is string => Boolean(name));
  const mafiaNames = namesOf(isMafiaMember(me.role) ? me.info.mafiaTeammateIds : me.role === 'Good Informant' ? me.info.informantMafiaIds : []);
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
      onNotice(cause instanceof Error ? cause.message : 'Алдаа гарлаа.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const hostSkip = () => { void send('tick', { skip: true }); };

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
  const renderPlayer = (player: PublicGamePlayer) => <GamePlayerCard key={player.id} player={player} isCurrent={player.id === me.seat} selected={game.phase === 'Night' ? nightSelection === player.id : voteSelection === player.id} selectable={game.phase === 'Night' ? canChooseNightTarget(player) : canSelectForVote(player)} voteCount={game.voteCountsOpen ? game.voteCounts[String(player.id)] : undefined} voteTargetName={player.voteTargetId === null ? undefined : nameOf(player.voteTargetId)} runoff={inRunoff(player)} finalRole={game.finalRoles?.[player.id] ?? me.spectatorRoles?.[player.id]} bubble={quick.bubbles[player.id]?.text} frame={seats.find((seat) => seat.seat === player.id)?.frame_key} plateKey={seats.find((seat) => seat.seat === player.id)?.nameplate_key} onSelect={() => select(player)} onProfile={() => onProfile(player.id)} />;

  const confirmNight = async () => {
    if (nightSelection === null) return onNotice(translateMessage('Select a living target first.'));
    if (await send('night', { targetId: nightSelection })) setNightSelection(null);
  };
  const giveVerdict = (choice: 'guilty' | 'innocent') => { void send('verdict', { choice }); };
  const submitVote = async () => {
    if (await send('vote', { choice: voteSelection })) { setVoteConfirmOpen(false); setVoteSelection(null); }
  };

  const withVoice = (content: ReactNode) => watching ? <>{content}</> : <VoiceChatProvider roomCode={roomCode} userId={userId} seats={seats} phase={voicePhase} alive={currentPlayer.alive} isHost={isHost}>{content}</VoiceChatProvider>;

  if (game.phase === 'Results') return withVoice(<ResultsScreen game={game} me={me} roomName={roomName} isHost={isHost && !watching} watching={Boolean(watching)} onReplay={onRematch} onMenu={onLeave} />);

  return withVoice(<div className={`core-game ${game.phase === 'Night' ? 'is-night' : ''} stage-${game.phase === 'Night' ? 'night' : game.phase === 'Voting' ? 'vote' : 'day'}`}>
    <header className="core-game-topbar">
      <div className="round-label"><span>{i18n.game.round}</span><strong>{String(game.round).padStart(2, '0')}</strong></div>
      <div className={`current-phase phase-${game.phase.toLowerCase().replace(' ', '-')}`}><span>{translatePhase(game.phase)}</span></div>
      <div className="demo-timer"><Clock3 size={14} /><strong>{time}</strong></div>
      <div className="game-top-actions"><button className="game-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Тоглоомын тохиргоо" title="Тоглоомын тохиргоо"><Settings size={16} /></button><button className="game-leave-button" onClick={() => watching ? onLeave() : setLeaveDialog(true)}><ArrowLeft size={14} /> {i18n.game.leaveGame.toUpperCase()}</button></div>
    </header>

    {game.phase === 'Role Reveal' && !watching ? <RoleReveal game={game} player={currentPlayer} me={me} namesOf={namesOf} roomName={roomName} isHost={isHost} busy={busy} secondsLeft={secondsLeft} onContinue={hostSkip} onReady={() => { void send('reveal-ready'); }} /> : <>
      <div className="core-game-board">
        <aside className="game-player-list game-player-list-left"><div className="game-list-heading">{i18n.game.table} <span>{String(game.players.length).padStart(2, '0')}</span></div>{leftPlayers.map(renderPlayer)}{!currentPlayer.alive && !watching && <GhostVoice roomCode={roomCode} userId={userId} />}{whisperOpen && !watching && <GhostVoice key="mafia-whisper" roomCode={roomCode} userId={userId} channel="mafia" />}</aside>
        <section className="crime-stage">
          <div className="crime-stage-art" aria-hidden="true"><div className="crime-window" /><div className="crime-light" /><div className="crime-table" /></div>
          <div className="crime-stage-label"><span><i /> {roomName.toUpperCase()} · {roomCode}</span>{me.spectatorRoles && <span className="spectator-tag">АЖИГЛАГЧ · БҮХ ДҮР ХАРАГДАНА</span>}</div>
          {game.phase === 'Night' && <NightPanel round={game.round} player={currentPlayer} me={me} mafiaNames={mafiaNames} nameOf={nameOf} selectedName={nightSelection === null ? undefined : nameOf(nightSelection)} lockedName={me.nightAction.targetId === null ? undefined : nameOf(me.nightAction.targetId)} lastProtectedName={me.lastProtectedId === null ? undefined : nameOf(me.lastProtectedId)} busy={busy} onConfirm={confirmNight} onCancel={() => setNightSelection(null)} />}
          {game.phase === 'Morning' && <MorningPanel round={game.round} report={game.morningReport} winner={game.winner} isHost={isHost} busy={busy} onContinue={hostSkip} />}
          {game.phase === 'Discussion' && <DiscussionPanel round={game.round} alive={currentPlayer.alive} watching={Boolean(watching)} isHost={isHost} busy={busy} onVote={hostSkip} onPrivate={() => setPrivateOpen((open) => !open)} />}
          {game.phase === 'Voting' && <VotingPanel game={game} me={me} alive={currentPlayer.alive} voteSelection={voteSelection} voteConfirmOpen={voteConfirmOpen} isHost={isHost} busy={busy} nameOf={nameOf} onSkip={() => setVoteSelection('skip')} onReview={() => voteSelection === null ? onNotice(translateMessage('Choose a living player or Skip Vote.')) : setVoteConfirmOpen(true)} onSubmit={submitVote} onCancel={() => { setVoteConfirmOpen(false); setVoteSelection(null); }} onNext={hostSkip} onVerdict={giveVerdict} />}
          {quickOpen && <div className="quick-replies" aria-label="Хурдан хариулт">{QUICK_REPLIES.map((text) => <button type="button" key={text} onClick={() => quick.send(text)}>{text}</button>)}</div>}
        </section>
        <aside className="game-player-list game-player-list-right"><div className="game-list-heading">{i18n.game.stillInIt} <span>{String(living.length).padStart(2, '0')}</span></div>{rightPlayers.map(renderPlayer)}{!watching && <><MyRoleCard role={roleInfo(me.role)} dead={!currentPlayer.alive} onOpen={() => setCardOpen(true)} /><button className="private-info-button" onClick={() => setPrivateOpen((open) => !open)}><LockKeyhole size={13} /> {i18n.game.privateInfo}</button></>}</aside>
      </div>
    </>}

    {introOpen && <RoleRevealIntro role={roleInfo(me.role)} onDone={closeIntro} />}
    {cardOpen && <RoleCardViewer role={roleInfo(me.role)} onClose={closeCard} />}
    {privateOpen && !watching && <PrivateInfoPanel player={currentPlayer} me={me} mafiaNames={mafiaNames} namesOf={namesOf} onClose={() => setPrivateOpen(false)} />}
    {leaveDialog && <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="leave-game-title"><div className="modal-symbol"><ArrowLeft size={18} /></div><h2 id="leave-game-title">Тоглоомоос гарах уу?</h2><p>Гарвал та хасагдсанд тооцогдож, энэ тоглолтод буцаж орох боломжгүй.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setLeaveDialog(false)}>ҮЛДЭХ</button><button className="primary-button" onClick={onLeave}>ТОГЛООМООС ГАРАХ</button></div></section></div>}
    {settingsOpen && <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="game-settings-title"><div className="modal-symbol"><Settings size={18} /></div><h2 id="game-settings-title">Тоглоомын тохиргоо</h2><p>Үе шат бүр цаг дуусахад автоматаар солигдоно. Өрөөний эзэн хүлээх үеийг алгасаж болно.</p><p className="rules-line">Дүрэм: {rulesSummary(game.settings)}</p><div className="modal-fullscreen"><FullscreenToggle fullscreen={fullscreen} /></div><div className="modal-actions"><button className="primary-button" onClick={() => setSettingsOpen(false)}>ТОГЛООМ ҮРГЭЛЖЛҮҮЛЭХ</button></div></section></div>}
  </div>);
}

function HostButton({ isHost, busy, label, onClick }: { isHost: boolean; busy: boolean; label: string; onClick: () => void }) {
  if (!isHost) return <div className="action-locked"><Clock3 size={12} /> Цаг дуусахад автоматаар үргэлжилнэ.</div>;
  return <button className="primary-button" disabled={busy} onClick={onClick}>{label} <ChevronRight size={15} /></button>;
}

function RoleReveal({ game, player, me, namesOf, roomName, isHost, busy, secondsLeft, onContinue, onReady }: { game: PublicGameView; player: PublicGamePlayer; me: PrivateGameView; namesOf: (ids: number[]) => string[]; roomName: string; isHost: boolean; busy: boolean; secondsLeft: number | null; onContinue: () => void; onReady: () => void }) {
  const role = roleInfo(me.role);
  const roleSecret = isMafiaMember(me.role) ? `Таны мафийн хамтрагчид: ${namesOf(me.info.mafiaTeammateIds).join(', ') || 'байхгүй'}.${me.role === 'Don' ? ' Та тэднийг удирдана.' : ''}` : me.role === 'Good Informant' ? `Мафийн таних тэмдэг: ${namesOf(me.info.informantMafiaIds).join(', ') || 'идэвхтэй гишүүн алга'}.` : me.role === 'Bad Informant' ? translateMessage(me.info.badInformantObjective) : me.role === 'Jester' ? 'Зорилго: шүүх хурлаар хасагдах. Сэжигтэй харагдаарай!' : '';
  const people = game.players.filter((entry) => entry.alive && !entry.bot);
  const readyCount = people.filter((entry) => (game.readyIds ?? []).includes(entry.id)).length;
  const waitLine = `Бэлэн ${readyCount}/${people.length} · шөнө ${secondsLeft ?? '…'} секундын дараа`;
  return <main className="role-reveal-screen"><div className="reveal-backdrop"><div className="reveal-moon" /><div className="reveal-city" /></div><div className="reveal-heading"><span>ЭЭЛЖ 01 <i>•</i> {roomName.toUpperCase()}</span><h1>Хот <em>шийдвэрээ гаргалаа.</em></h1><p>{player.name}, таны дүр нууц. Дэлгэцээ бусдад бүү харуул.</p></div><article className={`reveal-role-card team-${role.team}`}><div className="reveal-card-art"><RoleCardArtwork role={role} /><span>НУУЦ</span></div><div className="reveal-card-copy"><span className={`team-tag ${role.team}`}>{translateTeam(role.team).toUpperCase()} {i18n.game.messages.specialAbility.toUpperCase()}</span><h2>{role.displayName}</h2><p>{role.description}</p><p className="reveal-role-ability">{role.ability}</p>{roleSecret && <div className="role-reveal-secret"><LockKeyhole size={12} />{roleSecret}</div>}<div className="reveal-private-note"><LockKeyhole size={13} /><span>Энэ картыг зөвхөн та харах боломжтой.</span></div></div></article>
    <div className="reveal-ready-row">
      {me.readyForNight
        ? <span className="reveal-wait"><Check size={14} /> {waitLine}</span>
        : <button className="primary-button" disabled={busy} onClick={onReady}><Check size={15} /> БЭЛЭН</button>}
      {isHost && <button className="secondary-button" disabled={busy} onClick={onContinue}>ШӨНИЙГ ЭХЛҮҮЛЭХ <ChevronRight size={15} /></button>}
      {!me.readyForNight && <span className="reveal-wait">{waitLine}</span>}
    </div></main>;
}

function NightPanel({ round, player, me, mafiaNames, nameOf, selectedName, lockedName, lastProtectedName, busy, onConfirm, onCancel }: {
  round: number; player: PublicGamePlayer; me: PrivateGameView; mafiaNames: string[]; nameOf: (id: number) => string | undefined; selectedName?: string; lockedName?: string; lastProtectedName?: string; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const role = me.role;
  const nightRole = me.nightRole;
  const targetVerb = nightRole === 'Mafia' ? (role === 'Bad Informant' ? 'Мафийн гишүүд хасагдсан тул довтолгоог та удирдана. Зорилтоо сонгоно уу.' : role === 'Don' ? 'Довтолгооны зорилтоо сонгоно уу. Таны сонголт эцсийнх.' : 'Мафийн зорилт сонгоно уу.') : nightRole === 'Doctor' ? 'Шөнө хамгаалах тоглогчоо сонгоно уу.' : nightRole === 'Detective' ? 'Шалгах тоглогчоо сонгоно уу.' : nightRole === 'Bodyguard' ? 'Хамгаалах тоглогчоо сонгоно уу. Түүн рүү халдвал та оронд нь амиа өгнө.' : '';
  const submitted = me.nightAction.submitted;
  const privateResult = nightRole === 'Detective' ? translateMessage(me.info.investigationResult) : '';
  return <div className="phase-panel night-panel"><div className="phase-panel-heading"><span className="night-panel-icon"><Moon size={17} /></span><div><small>ШӨНӨ {round} · ХУВИЙН ҮЙЛДЭЛ</small><h2>{player.alive ? translateRole(role) : 'Шөнө бууж ирлээ'}</h2></div></div>
    {!player.alive ? <p>Та хасагдсан тул шөнийн үйлдэл хийх боломжгүй. Хот сэрэхийг хүлээнэ үү.</p> : <>
      <p>{nightRole ? targetVerb : 'Таны дүрд шөнийн үйлдэл байхгүй. Нүдээ аниад өглөөг хүлээнэ үү.'}</p>
      {isMafiaMember(role) && mafiaNames.length > 0 && <div className="night-secret"><Skull size={12} /> Хамтрагчид: {mafiaNames.join(', ')}. {role === 'Don' ? 'Тэд санал өгнө, эцсийн шийдвэр таных.' : 'Дон байвал түүний сонголт, үгүй бол олонхийн сонгосон хүн рүү довтолно.'}</div>}
      {me.teamTargets && Object.keys(me.teamTargets).length > 0 && <div className="night-secret team-picks"><Target size={12} /> Хамтрагчийн сонголт — {Object.entries(me.teamTargets).map(([id, target]) => `${nameOf(Number(id)) ?? '?'}: ${target === null ? 'сонгоогүй' : nameOf(target) ?? '?'}`).join(' · ')}</div>}
      {role === 'Good Informant' && <div className="night-secret"><LockKeyhole size={12} /> Таны хувийн сэжүүр: {mafiaNames.join(', ') || 'Идэвхтэй мафийн гишүүн алга.'}</div>}
      {nightRole === 'Doctor' && lastProtectedName && !submitted && <div className="night-secret"><HeartPulse size={12} /> Өчигдөр {lastProtectedName}-г хамгаалсан тул энэ шөнө өөр хүн сонгоно.</div>}
      {role === 'Old Lady with Shotgun' && <div className="night-secret"><Crosshair size={12} /> {me.shotgunSpent ? 'Таны буу аль хэдийн буудсан. Дахин хариу буудах боломжгүй.' : 'Мафи тан руу анх халдахад буугаар нэг удаа хариу буудна.'}</div>}
      {role === 'Bad Informant' && nightRole !== 'Mafia' && <div className="night-secret"><LockKeyhole size={12} /> {translateMessage(me.info.badInformantObjective)}</div>}
      {role === 'Citizen' && <div className="night-secret"><Shield size={12} /> Өглөөний тайланг анхаараарай.</div>}
      {role === 'Jester' && <div className="night-secret"><Drama size={12} /> Өдөр сэжигтэй харагдаж, шүүх хурлаар хасагдвал та ганцаараа ялна.</div>}
      {privateResult && <div className="action-locked"><LockKeyhole size={12} /> {privateResult}</div>}
      {submitted && <div className="action-locked"><Check size={13} /> Үйлдэл баталгаажсан{lockedName ? ` · ${lockedName}` : ''}. Бусдыг хүлээж байна.</div>}
      {!submitted && nightRole && <div className="night-target-hint"><Target size={12} /> {selectedName ? `Сонгосон: ${selectedName}` : 'Амьд тоглогчийн картыг товшоод зорилт сонгоно уу.'}</div>}
    </>}
    {player.alive && nightRole && !submitted && <div className="phase-panel-actions"><button className="secondary-button" onClick={onCancel} disabled={!selectedName}>БОЛИХ</button><button className="primary-button" onClick={onConfirm} disabled={busy || !selectedName}>ҮЙЛДЭЛ БАТЛАХ <Check size={14} /></button></div>}
  </div>;
}

function MorningPanel({ round, report, winner, isHost, busy, onContinue }: { round: number; report: string; winner: PublicGameView['winner']; isHost: boolean; busy: boolean; onContinue: () => void }) {
  const headline = report.includes('No Mafia attack') ? 'Шөнө тайван өнгөрлөө.' : report.includes('shotgun answered') ? 'Харанхуйд буун дуу гарав.' : report.includes('No one was eliminated') || report.includes('stopped') ? 'Халдлага няцаагдлаа.' : 'Хотод хохирогч гарлаа.';
  return <div className="phase-panel morning-panel"><div className="morning-seal"><Sun size={21} /></div><div className="morning-kicker">ӨГЛӨӨНИЙ ТАЙЛАН · ЭЭЛЖ {round}</div><h2>{headline}</h2><p className="morning-report-text">{translateMessage(report)}</p><HostButton isHost={isHost} busy={busy} label={winner ? 'ҮР ДҮНГ ҮЗЭХ' : 'ХЭЛЭЛЦҮҮЛЭГ НЭЭХ'} onClick={onContinue} /></div>;
}

function DiscussionPanel({ round, alive, isHost, busy, watching = false, onVote, onPrivate }: { round: number; alive: boolean; isHost: boolean; busy: boolean; watching?: boolean; onVote: () => void; onPrivate: () => void }) {
  return <div className="phase-panel discussion-panel"><div className="discussion-head"><div><small>ӨДӨР {round} · ХЭЛЭЛЦҮҮЛЭГ</small><h2>Юу харсан бэ?</h2></div><Mic size={19} /></div><p>{watching ? 'Тоглогчид хэлэлцэж байна. Та админаар ажиглаж байгаа тул бүх дүр харагдана.' : alive ? 'Микрофоноо асаагаад сэжүүрээ хуваалцаарай. Хэн худлаа ярьж байна вэ?' : 'Та хасагдсан тул сонсох боломжтой, ярих боломжгүй.'}</p><div className="discussion-actions">{!watching && <button className="secondary-button" onClick={onPrivate}><LockKeyhole size={13} /> НУУЦ МЭДЭЭЛЭЛ</button>}{isHost ? <button className="primary-button" disabled={busy} onClick={onVote}>САНАЛ ХУРААЛТ НЭЭХ <Vote size={14} /></button> : <span className="discussion-wait">Цаг дуусахад санал хураалт эхэлнэ</span>}</div></div>;
}

function VotingPanel({ game, me, alive, voteSelection, voteConfirmOpen, isHost, busy, nameOf, onSkip, onReview, onSubmit, onCancel, onNext, onVerdict }: {
  game: PublicGameView; me: PrivateGameView; alive: boolean; voteSelection: VoteChoice; voteConfirmOpen: boolean; isHost: boolean; busy: boolean; nameOf: (id: number) => string | undefined;
  onSkip: () => void; onReview: () => void; onSubmit: () => void; onCancel: () => void; onNext: () => void; onVerdict: (choice: 'guilty' | 'innocent') => void;
}) {
  if (game.trial && !game.votesRevealed) return <TrialPanel game={game} me={me} alive={alive} busy={busy} nameOf={nameOf} onVerdict={onVerdict} />;
  const totals = Object.entries(game.voteCounts).sort((left, right) => right[1] - left[1]);
  const runoffNames = game.runoffCandidates && !game.votesRevealed ? game.runoffCandidates.map((id) => nameOf(id) ?? '?') : null;
  const mine = me.vote.choice;
  const mineLabel = mine === 'skip' ? 'АЛГАСАХ' : typeof mine === 'number' ? nameOf(mine) ?? '?' : 'ӨГӨӨГҮЙ';
  const selectedName = typeof voteSelection === 'number' ? nameOf(voteSelection) : undefined;
  return <div className="phase-panel voting-panel"><div className="discussion-head"><div><small>ӨДӨР {game.round} · ЭЦСИЙН САНАЛ</small><h2>{game.votesRevealed ? 'Хот шийдвэрээ гаргалаа.' : runoffNames ? 'Давтан санал хураалт' : 'Сэжигтнээ сонго.'}</h2></div><Vote size={19} /></div>
    {runoffNames && <div className="runoff-banner"><Vote size={13} /><span><b>Санал тэнцлээ.</b> Зөвхөн {runoffNames.join(', ')} нарын дундаас сонгоно. Дахин тэнцвэл хэн ч хасагдахгүй.</span></div>}
    {!game.votesRevealed ? <>
      {!alive ? <p>Та хасагдсан тул санал өгөх боломжгүй.</p>
        : me.vote.submitted ? <div className="action-locked"><Check size={13} /> Таны санал: {mineLabel}. Бусдыг хүлээж байна.</div>
        : <>{!runoffNames && <p>Өөрөөсөө бусад амьд тоглогчийг сонгох эсвэл саналаа алгасна уу. Хамгийн олон санал авсан тоглогч шүүгдэж, өөрийгөө хамгаалсны дараа хот гэмтэй эсэхийг шийднэ.</p>}<div className="vote-choices"><button className={`skip-vote ${voteSelection === 'skip' ? 'chosen' : ''}`} onClick={onSkip}><ArrowLeft size={13} /> САНАЛ АЛГАСАХ</button><span>{selectedName ? `Сонгосон: ${selectedName}` : voteSelection === 'skip' ? 'Сонгосон: Санал алгасах' : 'Тоглогчийн картыг товшино уу.'}</span></div><button className="primary-button" onClick={onReview} disabled={voteSelection === null}>САНАЛЫГ ХЯНАХ <ChevronRight size={15} /></button></>}
    </> : <>
      <p className="vote-summary">{translateMessage(game.voteSummary)}</p>
      <p className="your-vote-status">ТАНЫ САНАЛ · {mineLabel}{me.verdict ? ` · ШИЙДВЭР: ${me.verdict === 'guilty' ? 'ГЭМТЭЙ' : 'ГЭМГҮЙ'}` : ''}</p>
      {game.trial && game.trial.guilty !== null
        ? <div className="vote-count-list verdict-count-list"><div><span>ГЭМТЭЙ</span><b>{game.trial.guilty}</b></div><div><span>ГЭМГҮЙ</span><b>{game.trial.innocent}</b></div></div>
        : <div className="vote-count-list">{totals.map(([key, count]) => <div key={key}><span>{key === 'skip' ? 'САНАЛ АЛГАСАХ' : nameOf(Number(key)) ?? 'Үл мэдэгдэх'}</span><b>{count}</b></div>)}</div>}
      <HostButton isHost={isHost} busy={busy} label={game.winner ? 'ҮР ДҮНГ ҮЗЭХ' : 'ДАРААХ ШӨНӨ'} onClick={onNext} />
    </>}
    {voteConfirmOpen && !game.votesRevealed && alive && !me.vote.submitted && <div className="vote-confirm-card"><div><small>САНАЛАА БАТЛАХ</small><p>{voteSelection === 'skip' ? 'Саналаа алгасах уу?' : `${selectedName ?? 'Энэ тоглогч'}-г хасах санал өгөх үү?`}</p></div><div><button className="secondary-button" onClick={onCancel}>БОЛИХ</button><button className="primary-button" disabled={busy} onClick={onSubmit}>САНАЛ ИЛГЭЭХ <Check size={13} /></button></div></div>}
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
    <div className="discussion-head"><div><small>ӨДӨР {game.round} · ШҮҮХ ХУРАЛ</small><h2>{iAmAccused ? 'Та буруутгагдлаа.' : `${accused} шүүгдэж байна.`}</h2></div><Vote size={19} /></div>
    <p>{iAmAccused
      ? `${trial.nominationVotes} хүн таныг сонголоо. Микрофоноор өөрийгөө хамгаалж, яагаад мафи биш гэдгээ тайлбарла.`
      : `${accused} ${trial.nominationVotes} санал авлаа. Түүний хамгаалалтыг сонсоод шийдвэрээ гарга. Тэнцвэл цагаатгана.`}</p>
    {!alive ? <p>Та хасагдсан тул шийдвэр өгөх боломжгүй.</p>
      : iAmAccused ? <div className="action-locked"><Mic size={13} /> Бусад {eligible} тоглогч шийдвэрээ гаргаж байна · {trial.decided}/{eligible}</div>
      : me.verdict ? <div className="action-locked"><Check size={13} /> Таны шийдвэр: {me.verdict === 'guilty' ? 'ГЭМТЭЙ' : 'ГЭМГҮЙ'}. Бусдыг хүлээж байна · {trial.decided}/{eligible}</div>
      : <div className="verdict-actions"><button className="secondary-button" disabled={busy} onClick={() => onVerdict('innocent')}><Shield size={14} /> ГЭМГҮЙ</button><button className="primary-button" disabled={busy} onClick={() => onVerdict('guilty')}><Skull size={14} /> ГЭМТЭЙ</button></div>}
  </div>;
}

function PrivateInfoPanel({ player, me, mafiaNames, namesOf, onClose }: { player: PublicGamePlayer; me: PrivateGameView; mafiaNames: string[]; namesOf: (ids: number[]) => string[]; onClose: () => void }) {
  const role = roleInfo(me.role);
  const info = me.info;
  const informant = me.role === 'Good Informant' ? `Мафийн таних тэмдэг: ${namesOf(info.informantMafiaIds).join(', ') || 'идэвхтэй гишүүн алга'}` : '';
  const notebook = Object.entries(me.knownAlignment);
  return <aside className="game-private-panel" aria-label="Нууц дүрийн мэдээлэл"><header><span><LockKeyhole size={12} /> ЗӨВХӨН {player.name.toUpperCase()} ҮҮНИЙГ ХАРНА</span><button onClick={onClose} aria-label="Нууц мэдээлэл хаах"><X size={15} /></button></header><div className="private-game-role"><span className={`private-game-icon team-${role.team}`}><NightIcon role={role.name} /></span><div><small>ТАНЫ ДҮР</small><b>{role.displayName}</b></div></div><RoleCardArtwork role={role} compact /><p>{role.description}</p><p className="private-role-ability">{role.ability}</p>
    {isMafiaMember(me.role) && <div className="private-secret-line"><b>МАФИЙН ХАМТРАГЧИД</b><span>{mafiaNames.join(', ') || 'Та цорын ганц мафийн гишүүн.'}</span></div>}
    {me.role === 'Don' && <div className="private-secret-line"><b>ДОН</b><span>Довтолгооны эцсийн шийдвэр таных. Цагдаа таныг «мафи биш» гэж харна.</span></div>}
    {me.role === 'Jester' && <div className="private-secret-line"><b>НУУЦ ЗОРИЛГО</b><span>Шүүх хурлаар гэмтэй гэж хасагдвал ганцаараа ялна.</span></div>}
    {informant && <div className="private-secret-line"><b>ХУВИЙН СЭЖҮҮР</b><span>{informant}</span></div>}
    {me.role === 'Bad Informant' && <div className="private-secret-line"><b>НУУЦ ЗОРИЛГО</b><span>{translateMessage(info.badInformantObjective)}</span></div>}
    {me.role === 'Detective' && notebook.length > 0 && <div className="private-secret-line detective-notebook"><b>ЦАГДААГИЙН ТЭМДЭГЛЭЛ</b>{notebook.map(([id, alignment]) => <span key={id} className={`notebook-entry is-${alignment}`}>{namesOf([Number(id)])[0] ?? '?'} — {alignment === 'mafia' ? 'мафийн талд' : 'мафи биш'}</span>)}</div>}
    {info.protectionResult && <div className="private-secret-line"><b>ХАМГААЛАЛТ · ХУВИЙН</b><span>{translateMessage(info.protectionResult)}</span></div>}
    {me.role === 'Old Lady with Shotgun' && <div className="private-secret-line"><b>БУУ</b><span>{me.shotgunSpent ? 'Буудсан — дахин хариу буудах боломжгүй.' : 'Цэнэглэсэн — нэг удаа хариу буудна.'}</span></div>}
  </aside>;
}

/** Night-by-night and day-by-day recap, shown once the game is over. */
function MatchRecap({ game, onClose }: { game: PublicGameView; onClose: () => void }) {
  const name = (id: number | null) => id === null ? '?' : game.players.find((player) => player.id === id)?.name ?? '?';
  const withRole = (id: number) => {
    const role = game.finalRoles?.[id];
    return role ? `${name(id)} (${translateRole(role)})` : name(id);
  };
  return <div className="game-modal-backdrop" onClick={onClose}><section className="game-modal match-recap" role="dialog" aria-modal="true" aria-label="Тоглолтын түүх" onClick={(event) => event.stopPropagation()}>
    <header><h2>Тоглолтын түүх</h2><button type="button" className="game-icon-button" onClick={onClose} aria-label="Хаах"><X size={15} /></button></header>
    <ol className="recap-list">{(game.history ?? []).map((entry, index) => entry.kind === 'night'
      ? <li key={index} className="recap-night"><b><Moon size={13} /> ШӨНӨ {entry.round}</b>
          <span>{entry.mafiaTargetId === null ? 'Мафи хэнийг ч онилоогүй.' : `Мафи ${withRole(entry.mafiaTargetId)}-г онилсон.`}
            {entry.outcome === 'killed' ? ` ${name(entry.eliminatedId)} алагдсан.` : entry.outcome === 'protected' ? ' Эмч хамгаалж аварсан.' : entry.outcome === 'guarded' ? ` Бие хамгаалагч ${name(entry.eliminatedId)} оронд нь амиа өгсөн.` : entry.outcome === 'shotgun' ? (entry.eliminatedId === null ? ' Буутай эмээ халдлагыг няцаасан.' : ` Буутай эмээ хариу буудаж ${withRole(entry.eliminatedId)}-г хассан.`) : ''}</span>
          {entry.protectedIds.length > 0 && <span>Эмч: {entry.protectedIds.map(name).join(', ')}-г хамгаалсан.</span>}
          {(entry.guardIds?.length ?? 0) > 0 && <span>Бие хамгаалагч: {entry.guardIds!.map(name).join(', ')}-г манасан.</span>}
          {entry.investigations.map((check) => <span key={`${check.detectiveId}-${check.targetId}`}>Цагдаа {name(check.detectiveId)}: {name(check.targetId)} — {check.mafia ? 'мафийн тал' : 'мафи биш'}.</span>)}
        </li>
      : <li key={index} className="recap-day"><b><Sun size={13} /> ӨДӨР {entry.round}</b>
          <span>{entry.accusedId === null ? 'Хэн ч шүүгдээгүй.' : `${withRole(entry.accusedId)} шүүгдсэн: гэмтэй ${entry.guilty ?? 0} – гэмгүй ${entry.innocent ?? 0}. ${entry.eliminatedId === null ? 'Цагаатгагдсан.' : entry.jester ? 'Хасагдсан — Алиа яллаа!' : 'Хасагдсан.'}`}</span>
        </li>)}</ol>
  </section></div>;
}

function ResultsScreen({ game, me, roomName, isHost, watching = false, onReplay, onMenu }: { game: PublicGameView; me: PrivateGameView; roomName: string; isHost: boolean; watching?: boolean; onReplay: () => void; onMenu: () => void }) {
  const [recapOpen, setRecapOpen] = useState(false);
  const headline = game.winner === 'Citizens' ? i18n.game.results.citizensWin : game.winner === 'Mafia' ? i18n.game.results.mafiaWin : game.winner === 'Jester' ? i18n.game.results.jesterWin : i18n.game.results.draw;
  // The Jester only wins alone; town and Mafia win as teams.
  const iWon = game.winner === 'Jester' ? me.role === 'Jester' : me.team !== 'wildcard' && (game.winner === 'Mafia') === (me.team === 'mafia');
  const history = game.history ?? [];
  const nights = history.filter((entry) => entry.kind === 'night');
  const stats = [
    `${nights.length} шөнө`,
    `${nights.filter((entry) => entry.eliminatedId !== null && entry.outcome !== 'shotgun').length} аллага`,
    `${nights.filter((entry) => entry.outcome === 'protected' || entry.outcome === 'guarded' || entry.outcome === 'shotgun').length} аврагдсан`,
    `${nights.reduce((total, entry) => total + (entry.kind === 'night' ? entry.investigations.length : 0), 0)} шалгалт`,
    `${history.filter((entry) => entry.kind === 'day' && entry.accusedId !== null).length} шүүх хурал`,
  ];
  return <main className="game-results-screen"><div className="results-glow" /><div className="results-heading"><span>ЭЭЛЖ {String(game.round).padStart(2, '0')} · {roomName.toUpperCase()}</span><h1>{headline}</h1><p>{watching ? 'Админ ажиглагч · тоглолт дууслаа.' : game.winner === 'Jester' ? (iWon ? 'Та бүгдийг хуурч ганцаараа яллаа!' : 'Алиа таныг хуурчээ.') : iWon ? 'Таны баг яллаа!' : 'Таны баг энэ удаа ялагдлаа.'}</p>{history.length > 0 && <p className="results-stats">{stats.join(' · ')}</p>}</div><div className="results-player-list">{game.players.map((player) => { const roleName = game.finalRoles?.[player.id]; const role = roleName ? roleInfo(roleName) : null; return <div className={`results-player ${!player.alive ? 'is-dead' : ''}`} key={player.id}><Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials}><VoiceAvatarIndicator name={player.name} seat={player.id} /></Avatar><span className="results-name">{player.name}{player.id === me.seat && <small>ЧИ</small>}</span>{role && <span className={`team-tag ${role.team}`}>{translateRole(role.name)}</span>}<span className="results-status">{player.alive ? 'АМЬД' : 'ХАСАГДСАН'}</span></div>; })}</div><div className="results-actions"><button className="secondary-button" onClick={onMenu}><ArrowLeft size={14} /> {i18n.game.results.mainMenu}</button>{(game.history?.length ?? 0) > 0 && <button className="secondary-button" onClick={() => setRecapOpen(true)}><Info size={14} /> ТОГЛОЛТЫН ТҮҮХ</button>}{isHost ? <button className="primary-button" onClick={onReplay}>{i18n.game.results.playAgain} <ChevronRight size={15} /></button> : <span className="discussion-wait">Эзэн шинэ тоглолт эхлүүлэхийг хүлээж байна</span>}</div>{recapOpen && <MatchRecap game={game} onClose={() => setRecapOpen(false)} />}</main>;
}
