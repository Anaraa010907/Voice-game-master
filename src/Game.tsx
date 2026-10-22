import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft, Check, ChevronRight, Clock3, Crown, Crosshair, Eye, Fingerprint,
  HeartPulse, Info, LockKeyhole, Mic, Moon, Radio, Settings,
  Shield, Skull, Sun, Target, Users, Vote, X,
} from 'lucide-react';
import { roles, type RoleName } from './gameData';
import RoleCardArtwork from './RoleCardArtwork';
import type { PrivateGameView, PublicGamePlayer, PublicGameView, VoteChoice } from './gameEngine';
import { i18n, translateMessage, translatePhase, translateRole, translateTeam } from './i18n';
import { VoiceAvatarIndicator, VoiceChatProvider, type VoicePhase } from './VoiceChat';
import { FullscreenToggle, type FullscreenState } from './fullscreen';
import { callGame, useCountdown, useGame, type RoomSeat } from './multiplayer';
import GhostVoice from './GhostVoice';
import Avatar from './Avatar';

function roleInfo(name: RoleName) {
  return roles.find((item) => item.name === name)!;
}

function NightIcon({ role, size = 19 }: { role: RoleName; size?: number }) {
  const iconProps = { size, strokeWidth: 1.7 };
  if (role === 'Mafia') return <Skull {...iconProps} />;
  if (role === 'Doctor') return <HeartPulse {...iconProps} />;
  if (role === 'Detective') return <Eye {...iconProps} />;
  if (role === 'Good Informant') return <Fingerprint {...iconProps} />;
  if (role === 'Bad Informant') return <Radio {...iconProps} />;
  if (role === 'Old Lady with Shotgun') return <Crosshair {...iconProps} />;
  return <Shield {...iconProps} />;
}

function GamePlayerCard({ player, isCurrent, selected, selectable, voteCount, voteTargetName, runoff, finalRole, onSelect }: {
  player: PublicGamePlayer; isCurrent: boolean; selected: boolean; selectable: boolean; voteCount?: number; voteTargetName?: string; runoff?: boolean; finalRole?: RoleName; onSelect: () => void;
}) {
  const shownRole = player.revealedRole ?? finalRole;
  return <button type="button" className={`game-player-card ${isCurrent ? 'is-current' : ''} ${selected ? 'is-selected' : ''} ${!player.alive ? 'is-dead' : ''} ${runoff ? 'is-runoff' : ''}`} onClick={onSelect} disabled={!selectable} aria-pressed={selected}>
    <Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials}>{player.host && <i><Crown size={10} /></i>}<VoiceAvatarIndicator name={player.name} seat={player.id} /></Avatar>
    <span className="game-player-copy"><b>{player.name}{isCurrent && <small>ЧИ</small>}</b><span className={`${player.alive ? 'alive-label' : 'dead-label'} ${finalRole && roleInfo(finalRole).team === 'mafia' ? 'spectator-mafia' : ''}`}>{player.alive ? (runoff ? 'ДАВТАН САНАЛД' : finalRole ? `АМЬД · ${translateRole(finalRole).toUpperCase()}` : 'АМЬД') : shownRole ? `ХАСАГДСАН · ${translateRole(shownRole).toUpperCase()}` : 'ХАСАГДСАН'}</span></span>
    {voteCount !== undefined && <span className="player-vote-count">{voteCount} <small>САНАЛ</small></span>}
    {player.voteStatus === 'revealed' && <span className="player-vote-status">{player.voteTargetId === null ? 'АЛГАСАВ' : `САНАЛ ${voteTargetName ?? ''}`}</span>}
    {selectable && <Target className="game-player-target" size={14} />}
  </button>;
}

export default function GameScreen({ roomCode, roomName, userId, isHost, seats, onLeave, onRematch, onNotice, fullscreen }: {
  roomCode: string; roomName: string; userId: string; isHost: boolean; seats: RoomSeat[];
  onLeave: () => void; onRematch: () => void; onNotice: (message: string) => void; fullscreen: FullscreenState;
}) {
  const { publicView: game, privateView: me, deadline, reload } = useGame(roomCode, userId);
  const secondsLeft = useCountdown(deadline);
  const [nightSelection, setNightSelection] = useState<number | null>(null);
  const [voteSelection, setVoteSelection] = useState<VoteChoice>(null);
  const [voteConfirmOpen, setVoteConfirmOpen] = useState(false);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const tickedFor = useRef<number | null>(null);
  const stage = game ? `${game.phase}-${game.round}-${game.votesRevealed}-${game.runoffCandidates?.join() ?? ''}` : '';

  // Fresh selections for every new phase.
  useEffect(() => {
    setNightSelection(null);
    setVoteSelection(null);
    setVoteConfirmOpen(false);
  }, [stage]);

  // When the clock runs out, any phone may ask the server to move on. The server re-checks the deadline.
  useEffect(() => {
    if (secondsLeft !== 0 || deadline === null || tickedFor.current === deadline) return;
    tickedFor.current = deadline;
    const timer = window.setTimeout(() => { void callGame('tick', { roomCode }).then(reload).catch(() => undefined); }, 300 + Math.random() * 700);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, deadline, roomCode, reload]);

  if (!game || !me) {
    return <div className="core-game"><div className="room-loading">Ширээ бэлдэж байна…</div></div>;
  }

  const currentPlayer: PublicGamePlayer = game.players.find((player) => player.id === me.seat)
    ?? { id: me.seat, name: '?', initials: '?', color: 'rose', alive: false, voteStatus: 'not-eligible', voteTargetId: null, revealedRole: null };
  const living = game.players.filter((player) => player.alive);
  const nameOf = (id: number) => game.players.find((player) => player.id === id)?.name;
  const namesOf = (ids: number[]) => ids.map(nameOf).filter((name): name is string => Boolean(name));
  const mafiaNames = namesOf(me.role === 'Mafia' ? me.info.mafiaTeammateIds : me.role === 'Good Informant' ? me.info.informantMafiaIds : []);
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
      onNotice(cause instanceof Error ? cause.message : 'Алдаа гарлаа.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const hostSkip = () => { void send('tick', { skip: true }); };

  const canChooseNightTarget = (target: PublicGamePlayer) => {
    if (!target.alive || !currentPlayer.alive || game.phase !== 'Night' || me.nightAction.submitted || !me.nightRole) return false;
    if (me.nightRole === 'Mafia') return target.id !== me.seat && !me.info.mafiaTeammateIds.includes(target.id);
    if (me.nightRole === 'Detective') return target.id !== me.seat;
    if (me.nightRole === 'Doctor') return target.id !== me.lastProtectedId;
    return true;
  };
  const canSelectForVote = (player: PublicGamePlayer) => game.phase === 'Voting' && !game.votesRevealed && currentPlayer.alive && !me.vote.submitted && player.alive && player.id !== me.seat && (!game.runoffCandidates || game.runoffCandidates.includes(player.id));
  const inRunoff = (player: PublicGamePlayer) => game.phase === 'Voting' && !game.votesRevealed && Boolean(game.runoffCandidates?.includes(player.id));
  const select = (player: PublicGamePlayer) => {
    if (game.phase === 'Night' && canChooseNightTarget(player)) setNightSelection(player.id);
    if (game.phase === 'Voting' && canSelectForVote(player)) setVoteSelection(player.id);
  };
  const renderPlayer = (player: PublicGamePlayer) => <GamePlayerCard key={player.id} player={player} isCurrent={player.id === me.seat} selected={game.phase === 'Night' ? nightSelection === player.id : voteSelection === player.id} selectable={game.phase === 'Night' ? canChooseNightTarget(player) : canSelectForVote(player)} voteCount={game.votesRevealed ? game.voteCounts[String(player.id)] : undefined} voteTargetName={player.voteTargetId === null ? undefined : nameOf(player.voteTargetId)} runoff={inRunoff(player)} finalRole={game.finalRoles?.[player.id] ?? me.spectatorRoles?.[player.id]} onSelect={() => select(player)} />;

  const confirmNight = async () => {
    if (nightSelection === null) return onNotice(translateMessage('Select a living target first.'));
    if (await send('night', { targetId: nightSelection })) setNightSelection(null);
  };
  const submitVote = async () => {
    if (await send('vote', { choice: voteSelection })) { setVoteConfirmOpen(false); setVoteSelection(null); }
  };

  const withVoice = (content: ReactNode) => <VoiceChatProvider roomCode={roomCode} userId={userId} seats={seats} phase={voicePhase} alive={currentPlayer.alive} isHost={isHost}>{content}</VoiceChatProvider>;

  if (game.phase === 'Results') return withVoice(<ResultsScreen game={game} me={me} roomName={roomName} isHost={isHost} onReplay={onRematch} onMenu={onLeave} />);

  return withVoice(<div className={`core-game ${game.phase === 'Night' ? 'is-night' : ''}`}>
    <header className="core-game-topbar">
      <div className="round-label"><span>{i18n.game.round}</span><strong>{String(game.round).padStart(2, '0')}</strong></div>
      <div className={`current-phase phase-${game.phase.toLowerCase().replace(' ', '-')}`}><span>{translatePhase(game.phase)}</span></div>
      <div className="demo-timer"><Clock3 size={14} /><strong>{time}</strong></div>
      <div className="game-top-actions"><button className="game-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Тоглоомын тохиргоо" title="Тоглоомын тохиргоо"><Settings size={16} /></button><button className="game-leave-button" onClick={() => setLeaveDialog(true)}><ArrowLeft size={14} /> {i18n.game.leaveGame.toUpperCase()}</button></div>
    </header>

    {game.phase === 'Role Reveal' ? <RoleReveal player={currentPlayer} me={me} namesOf={namesOf} roomName={roomName} isHost={isHost} busy={busy} secondsLeft={secondsLeft} onContinue={hostSkip} /> : <>
      <div className="core-game-board">
        <aside className="game-player-list game-player-list-left"><div className="game-list-heading">{i18n.game.table} <span>{String(game.players.length).padStart(2, '0')}</span></div>{leftPlayers.map(renderPlayer)}{!currentPlayer.alive && <GhostVoice roomCode={roomCode} userId={userId} />}</aside>
        <section className="crime-stage">
          <div className="crime-stage-art" aria-hidden="true"><div className="crime-window" /><div className="crime-light" /><div className="crime-table" /></div>
          <div className="crime-stage-label"><span><i /> {roomName.toUpperCase()} · {roomCode}</span>{me.spectatorRoles && <span className="spectator-tag">АЖИГЛАГЧ · БҮХ ДҮР ХАРАГДАНА</span>}</div>
          {game.phase === 'Night' && <NightPanel round={game.round} player={currentPlayer} me={me} mafiaNames={mafiaNames} selectedName={nightSelection === null ? undefined : nameOf(nightSelection)} lockedName={me.nightAction.targetId === null ? undefined : nameOf(me.nightAction.targetId)} lastProtectedName={me.lastProtectedId === null ? undefined : nameOf(me.lastProtectedId)} busy={busy} onConfirm={confirmNight} onCancel={() => setNightSelection(null)} />}
          {game.phase === 'Morning' && <MorningPanel round={game.round} report={game.morningReport} winner={game.winner} isHost={isHost} busy={busy} onContinue={hostSkip} />}
          {game.phase === 'Discussion' && <DiscussionPanel round={game.round} alive={currentPlayer.alive} isHost={isHost} busy={busy} onVote={hostSkip} onPrivate={() => setPrivateOpen((open) => !open)} />}
          {game.phase === 'Voting' && <VotingPanel game={game} me={me} alive={currentPlayer.alive} voteSelection={voteSelection} voteConfirmOpen={voteConfirmOpen} isHost={isHost} busy={busy} nameOf={nameOf} onSkip={() => setVoteSelection('skip')} onReview={() => voteSelection === null ? onNotice(translateMessage('Choose a living player or Skip Vote.')) : setVoteConfirmOpen(true)} onSubmit={submitVote} onCancel={() => { setVoteConfirmOpen(false); setVoteSelection(null); }} onNext={hostSkip} />}
          <div className="public-event-log"><span><Info size={11} /> {i18n.game.messages.publicLogs}</span>{game.publicEventLog.slice(-2).map((entry, index) => <p key={`${entry}-${index}`}>{translateMessage(entry)}</p>)}</div>
        </section>
        <aside className="game-player-list game-player-list-right"><div className="game-list-heading">{i18n.game.stillInIt} <span>{String(living.length).padStart(2, '0')}</span></div>{rightPlayers.map(renderPlayer)}<button className="private-info-button" onClick={() => setPrivateOpen((open) => !open)}><LockKeyhole size={13} /> {i18n.game.privateInfo}</button></aside>
      </div>
      <div className="core-game-bottom"><div className="phase-caption"><span>{game.phase === 'Night' ? <Moon size={12} /> : game.phase === 'Morning' ? <Sun size={12} /> : game.phase === 'Voting' ? <Vote size={12} /> : <Mic size={12} />}{translatePhase(game.phase)}</span><small>{phaseHint(game, currentPlayer.alive)}</small></div><div className="bottom-local-note"><Users size={12} /> {seats.length} тоглогч · {roomCode}</div></div>
    </>}

    {privateOpen && <PrivateInfoPanel player={currentPlayer} me={me} mafiaNames={mafiaNames} namesOf={namesOf} onClose={() => setPrivateOpen(false)} />}
    {leaveDialog && <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="leave-game-title"><div className="modal-symbol"><ArrowLeft size={18} /></div><h2 id="leave-game-title">Тоглоомоос гарах уу?</h2><p>Гарвал та хасагдсанд тооцогдож, энэ тоглолтод буцаж орох боломжгүй.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setLeaveDialog(false)}>ҮЛДЭХ</button><button className="primary-button" onClick={onLeave}>ТОГЛООМООС ГАРАХ</button></div></section></div>}
    {settingsOpen && <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="game-settings-title"><div className="modal-symbol"><Settings size={18} /></div><h2 id="game-settings-title">Тоглоомын тохиргоо</h2><p>Үе шат бүр цаг дуусахад автоматаар солигдоно. Өрөөний эзэн хүлээх үеийг алгасаж болно.</p><div className="modal-fullscreen"><FullscreenToggle fullscreen={fullscreen} /></div><div className="modal-actions"><button className="primary-button" onClick={() => setSettingsOpen(false)}>ТОГЛООМ ҮРГЭЛЖЛҮҮЛЭХ</button></div></section></div>}
  </div>);
}

function phaseHint(game: PublicGameView, alive: boolean) {
  if (game.phase === 'Night') return alive ? 'Үйлдэлтэй дүрүүд зорилтоо сонгоно. Бусад нь хүлээнэ.' : translateMessage('You can only observe the simulated night.');
  if (game.phase === 'Morning') return `${game.players.filter((player) => player.alive).length} тоглогч амьд үлдсэн.`;
  if (game.phase === 'Discussion') return 'Микрофоноор ярилцаарай. Хувийн мэдээлэл хувийн хэвээр үлдэнэ.';
  if (game.phase === 'Voting') return game.votesRevealed ? 'Санал хураалт дууслаа.' : 'Амьд тоглогч сонгох эсвэл саналаа алгасах боломжтой.';
  return 'Таны дүр болон мэдээлэл хувийн хэвээр байна.';
}

function HostButton({ isHost, busy, label, onClick }: { isHost: boolean; busy: boolean; label: string; onClick: () => void }) {
  if (!isHost) return <div className="action-locked"><Clock3 size={12} /> Цаг дуусахад автоматаар үргэлжилнэ.</div>;
  return <button className="primary-button" disabled={busy} onClick={onClick}>{label} <ChevronRight size={15} /></button>;
}

function RoleReveal({ player, me, namesOf, roomName, isHost, busy, secondsLeft, onContinue }: { player: PublicGamePlayer; me: PrivateGameView; namesOf: (ids: number[]) => string[]; roomName: string; isHost: boolean; busy: boolean; secondsLeft: number | null; onContinue: () => void }) {
  const role = roleInfo(me.role);
  const roleSecret = me.role === 'Mafia' ? `Таны мафийн хамтрагчид: ${namesOf(me.info.mafiaTeammateIds).join(', ') || 'байхгүй'}.` : me.role === 'Good Informant' ? `Мафийн таних тэмдэг: ${namesOf(me.info.informantMafiaIds).join(', ') || 'идэвхтэй гишүүн алга'}.` : me.role === 'Bad Informant' ? translateMessage(me.info.badInformantObjective) : '';
  return <main className="role-reveal-screen"><div className="reveal-backdrop"><div className="reveal-moon" /><div className="reveal-city" /></div><div className="reveal-heading"><span>ЭЭЛЖ 01 <i>•</i> {roomName.toUpperCase()}</span><h1>Хот <em>шийдвэрээ гаргалаа.</em></h1><p>{player.name}, таны дүр нууц. Дэлгэцээ бусдад бүү харуул.</p></div><article className={`reveal-role-card team-${role.team}`}><div className="reveal-card-art"><RoleCardArtwork role={role} /><span>НУУЦ</span></div><div className="reveal-card-copy"><span className={`team-tag ${role.team}`}>{translateTeam(role.team).toUpperCase()} {i18n.game.messages.specialAbility.toUpperCase()}</span><h2>{role.displayName}</h2><p>{role.description}</p><p className="reveal-role-ability">{role.ability}</p>{roleSecret && <div className="role-reveal-secret"><LockKeyhole size={12} />{roleSecret}</div>}<div className="reveal-private-note"><LockKeyhole size={13} /><span>Энэ картыг зөвхөн та харах боломжтой.</span></div></div></article>{isHost ? <button className="primary-button reveal-continue" disabled={busy} onClick={onContinue}>ШӨНИЙГ ЭХЛҮҮЛЭХ <ChevronRight size={16} /></button> : <span className="reveal-continue reveal-wait">Шөнө {secondsLeft ?? '…'} секундын дараа эхэлнэ</span>}</main>;
}

function NightPanel({ round, player, me, mafiaNames, selectedName, lockedName, lastProtectedName, busy, onConfirm, onCancel }: {
  round: number; player: PublicGamePlayer; me: PrivateGameView; mafiaNames: string[]; selectedName?: string; lockedName?: string; lastProtectedName?: string; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const role = me.role;
  const nightRole = me.nightRole;
  const targetVerb = nightRole === 'Mafia' ? (role === 'Bad Informant' ? 'Мафийн гишүүд хасагдсан тул довтолгоог та удирдана. Зорилтоо сонгоно уу.' : 'Мафийн зорилт сонгоно уу.') : nightRole === 'Doctor' ? 'Шөнө хамгаалах тоглогчоо сонгоно уу.' : nightRole === 'Detective' ? 'Шалгах тоглогчоо сонгоно уу.' : '';
  const submitted = me.nightAction.submitted;
  const privateResult = nightRole === 'Detective' ? translateMessage(me.info.investigationResult) : '';
  return <div className="phase-panel night-panel"><div className="phase-panel-heading"><span className="night-panel-icon"><Moon size={17} /></span><div><small>ШӨНӨ {round} · ХУВИЙН ҮЙЛДЭЛ</small><h2>{player.alive ? translateRole(role) : 'Шөнө бууж ирлээ'}</h2></div></div>
    {!player.alive ? <p>Та хасагдсан тул шөнийн үйлдэл хийх боломжгүй. Хот сэрэхийг хүлээнэ үү.</p> : <>
      <p>{nightRole ? targetVerb : 'Таны дүрд шөнийн үйлдэл байхгүй. Нүдээ аниад өглөөг хүлээнэ үү.'}</p>
      {role === 'Mafia' && mafiaNames.length > 0 && <div className="night-secret"><Skull size={12} /> Хамтрагчид: {mafiaNames.join(', ')}. Олонхийн сонгосон хүн рүү довтолно.</div>}
      {role === 'Good Informant' && <div className="night-secret"><LockKeyhole size={12} /> Таны хувийн сэжүүр: {mafiaNames.join(', ') || 'Идэвхтэй мафийн гишүүн алга.'}</div>}
      {nightRole === 'Doctor' && lastProtectedName && !submitted && <div className="night-secret"><HeartPulse size={12} /> Өчигдөр {lastProtectedName}-г хамгаалсан тул энэ шөнө өөр хүн сонгоно.</div>}
      {role === 'Old Lady with Shotgun' && <div className="night-secret"><Crosshair size={12} /> {me.shotgunSpent ? 'Таны буу аль хэдийн буудсан. Дахин хариу буудах боломжгүй.' : 'Мафи тан руу анх халдахад буугаар нэг удаа хариу буудна.'}</div>}
      {role === 'Bad Informant' && nightRole !== 'Mafia' && <div className="night-secret"><LockKeyhole size={12} /> {translateMessage(me.info.badInformantObjective)}</div>}
      {role === 'Citizen' && <div className="night-secret"><Shield size={12} /> Өглөөний тайланг анхаараарай.</div>}
      {privateResult && <div className="action-locked"><LockKeyhole size={12} /> {privateResult}</div>}
      {submitted && <div className="action-locked"><Check size={13} /> Үйлдэл баталгаажсан{lockedName ? ` · ${lockedName}` : ''}. Бусдыг хүлээж байна.</div>}
      {!submitted && nightRole && <div className="night-target-hint"><Target size={12} /> {selectedName ? `Сонгосон: ${selectedName}` : 'Амьд тоглогчийн картыг товшоод зорилт сонгоно уу.'}</div>}
    </>}
    {player.alive && nightRole && !submitted && <div className="phase-panel-actions"><button className="secondary-button" onClick={onCancel} disabled={!selectedName}>БОЛИХ</button><button className="primary-button" onClick={onConfirm} disabled={busy || !selectedName}>ҮЙЛДЭЛ БАТЛАХ <Check size={14} /></button></div>}
  </div>;
}

function MorningPanel({ round, report, winner, isHost, busy, onContinue }: { round: number; report: string; winner: PublicGameView['winner']; isHost: boolean; busy: boolean; onContinue: () => void }) {
  const headline = report.includes('No Mafia attack') ? 'Шөнө тайван өнгөрлөө.' : report.includes('shotgun answered') ? 'Харанхуйд буун дуу гарав.' : report.includes('No one was eliminated') || report.includes('stopped') ? 'Халдлага няцаагдлаа.' : 'Бие олдлоо.';
  return <div className="phase-panel morning-panel"><div className="morning-seal"><Sun size={21} /></div><div className="morning-kicker">ӨГЛӨӨНИЙ ТАЙЛАН · ЭЭЛЖ {round}</div><h2>{headline}</h2><p className="morning-report-text">{translateMessage(report)}</p><div className="clue-disclaimer"><Info size={13} /> Сэжүүр нь нотлох баримт биш, зөвхөн заалт юм.</div><HostButton isHost={isHost} busy={busy} label={winner ? 'ҮР ДҮНГ ҮЗЭХ' : 'ХЭЛЭЛЦҮҮЛЭГ НЭЭХ'} onClick={onContinue} /></div>;
}

function DiscussionPanel({ round, alive, isHost, busy, onVote, onPrivate }: { round: number; alive: boolean; isHost: boolean; busy: boolean; onVote: () => void; onPrivate: () => void }) {
  return <div className="phase-panel discussion-panel"><div className="discussion-head"><div><small>ӨДӨР {round} · ХЭЛЭЛЦҮҮЛЭГ</small><h2>Юу харсан бэ?</h2></div><Mic size={19} /></div><p>{alive ? 'Микрофоноо асаагаад сэжүүрээ хуваалцаарай. Хэн худлаа ярьж байна вэ?' : 'Та хасагдсан тул сонсох боломжтой, ярих боломжгүй.'}</p><div className="discussion-actions"><button className="secondary-button" onClick={onPrivate}><LockKeyhole size={13} /> НУУЦ МЭДЭЭЛЭЛ</button>{isHost ? <button className="primary-button" disabled={busy} onClick={onVote}>САНАЛ ХУРААЛТ НЭЭХ <Vote size={14} /></button> : <span className="discussion-wait">Цаг дуусахад санал хураалт эхэлнэ</span>}</div></div>;
}

function VotingPanel({ game, me, alive, voteSelection, voteConfirmOpen, isHost, busy, nameOf, onSkip, onReview, onSubmit, onCancel, onNext }: {
  game: PublicGameView; me: PrivateGameView; alive: boolean; voteSelection: VoteChoice; voteConfirmOpen: boolean; isHost: boolean; busy: boolean; nameOf: (id: number) => string | undefined;
  onSkip: () => void; onReview: () => void; onSubmit: () => void; onCancel: () => void; onNext: () => void;
}) {
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
        : <>{!runoffNames && <p>Өөрөөсөө бусад амьд тоглогчийг сонгох эсвэл саналаа алгасна уу. Хамгийн олон санал авсан нэг тоглогч хасагдаж, дүр нь илчлэгдэнэ.</p>}<div className="vote-choices"><button className={`skip-vote ${voteSelection === 'skip' ? 'chosen' : ''}`} onClick={onSkip}><ArrowLeft size={13} /> САНАЛ АЛГАСАХ</button><span>{selectedName ? `Сонгосон: ${selectedName}` : voteSelection === 'skip' ? 'Сонгосон: Санал алгасах' : 'Тоглогчийн картыг товшино уу.'}</span></div><button className="primary-button" onClick={onReview} disabled={voteSelection === null}>САНАЛЫГ ХЯНАХ <ChevronRight size={15} /></button></>}
    </> : <>
      <p className="vote-summary">{translateMessage(game.voteSummary)}</p>
      <p className="your-vote-status">ТАНЫ САНАЛ · {mineLabel}</p>
      <div className="vote-count-list">{totals.map(([key, count]) => <div key={key}><span>{key === 'skip' ? 'САНАЛ АЛГАСАХ' : nameOf(Number(key)) ?? 'Үл мэдэгдэх'}</span><b>{count}</b></div>)}</div>
      <HostButton isHost={isHost} busy={busy} label={game.winner ? 'ҮР ДҮНГ ҮЗЭХ' : 'ДАРААХ ШӨНӨ'} onClick={onNext} />
    </>}
    {voteConfirmOpen && !game.votesRevealed && alive && !me.vote.submitted && <div className="vote-confirm-card"><div><small>САНАЛАА БАТЛАХ</small><p>{voteSelection === 'skip' ? 'Саналаа алгасах уу?' : `${selectedName ?? 'Энэ тоглогч'}-г хасах санал өгөх үү?`}</p></div><div><button className="secondary-button" onClick={onCancel}>БОЛИХ</button><button className="primary-button" disabled={busy} onClick={onSubmit}>САНАЛ ИЛГЭЭХ <Check size={13} /></button></div></div>}
  </div>;
}

function PrivateInfoPanel({ player, me, mafiaNames, namesOf, onClose }: { player: PublicGamePlayer; me: PrivateGameView; mafiaNames: string[]; namesOf: (ids: number[]) => string[]; onClose: () => void }) {
  const role = roleInfo(me.role);
  const info = me.info;
  const informant = me.role === 'Good Informant' ? `Мафийн таних тэмдэг: ${namesOf(info.informantMafiaIds).join(', ') || 'идэвхтэй гишүүн алга'}` : '';
  const notebook = Object.entries(me.knownAlignment);
  return <aside className="game-private-panel" aria-label="Нууц дүрийн мэдээлэл"><header><span><LockKeyhole size={12} /> ЗӨВХӨН {player.name.toUpperCase()} ҮҮНИЙГ ХАРНА</span><button onClick={onClose} aria-label="Нууц мэдээлэл хаах"><X size={15} /></button></header><div className="private-game-role"><span className={`private-game-icon team-${role.team}`}><NightIcon role={role.name} /></span><div><small>ТАНЫ ДҮР</small><b>{role.displayName}</b></div></div><RoleCardArtwork role={role} compact /><p>{role.description}</p><p className="private-role-ability">{role.ability}</p>
    {me.role === 'Mafia' && <div className="private-secret-line"><b>МАФИЙН ХАМТРАГЧИД</b><span>{mafiaNames.join(', ') || 'Та цорын ганц мафийн гишүүн.'}</span></div>}
    {informant && <div className="private-secret-line"><b>ХУВИЙН СЭЖҮҮР</b><span>{informant}</span></div>}
    {me.role === 'Bad Informant' && <div className="private-secret-line"><b>НУУЦ ЗОРИЛГО</b><span>{translateMessage(info.badInformantObjective)}</span></div>}
    {me.role === 'Detective' && notebook.length > 0 && <div className="private-secret-line detective-notebook"><b>ЦАГДААГИЙН ТЭМДЭГЛЭЛ</b>{notebook.map(([id, alignment]) => <span key={id} className={`notebook-entry is-${alignment}`}>{namesOf([Number(id)])[0] ?? '?'} — {alignment === 'mafia' ? 'мафийн талд' : 'мафи биш'}</span>)}</div>}
    {info.protectionResult && <div className="private-secret-line"><b>ХАМГААЛАЛТ · ХУВИЙН</b><span>{translateMessage(info.protectionResult)}</span></div>}
    {me.role === 'Old Lady with Shotgun' && <div className="private-secret-line"><b>БУУ</b><span>{me.shotgunSpent ? 'Буудсан — дахин хариу буудах боломжгүй.' : 'Цэнэглэсэн — нэг удаа хариу буудна.'}</span></div>}
    {info.traceExplanation && <div className="private-trace-card"><span><Fingerprint size={13} /> ТАНЫ ХУВИЙН СЭЖҮҮРИЙН ТАЙЛБАР</span><p>{translateMessage(info.traceExplanation)}</p><small>Хэлэлцүүлгийн үеэр энэ мөрийг тайлбарлаж болно.</small></div>}
  </aside>;
}

function ResultsScreen({ game, me, roomName, isHost, onReplay, onMenu }: { game: PublicGameView; me: PrivateGameView; roomName: string; isHost: boolean; onReplay: () => void; onMenu: () => void }) {
  const headline = game.winner === 'Citizens' ? i18n.game.results.citizensWin : game.winner === 'Mafia' ? i18n.game.results.mafiaWin : i18n.game.results.draw;
  const myTeamWon = (game.winner === 'Mafia') === (me.team === 'mafia');
  return <main className="game-results-screen"><div className="results-glow" /><div className="results-heading"><span>ЭЭЛЖ {String(game.round).padStart(2, '0')} · {roomName.toUpperCase()}</span><h1>{headline}</h1><p>{myTeamWon ? 'Таны баг яллаа!' : 'Таны баг энэ удаа ялагдлаа.'}</p></div><div className="results-player-list">{game.players.map((player) => { const roleName = game.finalRoles?.[player.id]; const role = roleName ? roleInfo(roleName) : null; return <div className={`results-player ${!player.alive ? 'is-dead' : ''}`} key={player.id}><Avatar name={player.name} color={player.color} url={player.avatarUrl} initials={player.initials}><VoiceAvatarIndicator name={player.name} seat={player.id} /></Avatar><span className="results-name">{player.name}{player.id === me.seat && <small>ЧИ</small>}</span>{role && <span className={`team-tag ${role.team}`}>{translateRole(role.name)}</span>}<span className="results-status">{player.alive ? 'АМЬД' : 'ХАСАГДСАН'}</span></div>; })}</div><div className="results-actions"><button className="secondary-button" onClick={onMenu}><ArrowLeft size={14} /> {i18n.game.results.mainMenu}</button>{isHost ? <button className="primary-button" onClick={onReplay}>{i18n.game.results.playAgain} <ChevronRight size={15} /></button> : <span className="discussion-wait">Эзэн шинэ тоглолт эхлүүлэхийг хүлээж байна</span>}</div></main>;
}
