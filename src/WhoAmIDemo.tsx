import { useEffect, useMemo, useState, type ComponentType } from 'react';
import type { LobbyViewProps } from './App';
import type { FullscreenState } from './fullscreen';
import { i18n } from './i18n';
import { isEnglish, t } from './lang';
import type { NotifyFn, RoomInfo, RoomSeat } from './multiplayer';
import { VoiceChatProvider } from './VoiceChat';
import { DEMO_PHASES, DEMO_SEAT_COUNT, demoRequest, type DemoPhase, type DemoRequest } from './whoAmIDemoRequest';
import { WhoAmITable } from './WhoAmI';
import { WHO_AM_I_PACK } from './whoAmIContent';
import {
  activeWhoAmIPlayerId, applyWhoAmIAction, createSeededRandom, createWhoAmIGame, eligibleVoters, sanitizeWhoAmISettings, timeoutWhoAmI,
  whoAmIDeadlineSeconds, whoAmIPrivateView, whoAmIPublicView, whoAmIStageKey, type WhoAmIAction, type WhoAmISeat, type WhoAmIState,
} from './whoAmIEngine';

/*
 * Server-free preview of Who Am I for development and screenshots. It runs the real engine in the
 * browser and shows the table exactly as the server would: the public view plus the private view of
 * the chosen seat (so that seat's own identity is hidden here too).
 *
 *   ?demo=hub                      game picker
 *   ?demo=create                   create-room form for Who Am I
 *   ?demo=lobby[&seat=2]           lobby (seat 1 is the host)
 *   ?demo=game&phase=reveal|ask|answer|guess|results[&seat=3][&auto=1][&bar=0]
 *   any of the above with &players=3..10 for another table size (6 by default)
 *
 * Only in dev builds, or in any build that has no Supabase keys (so never on the live app). App.tsx
 * imports this file lazily behind DEMO_ENABLED, so keyed builds do not ship it (whoAmIDemoRequest.ts).
 */

const PHASES = DEMO_PHASES;

const DEMO_NAMES = isEnglish
  ? ['Bat', 'Saraa', 'Temuulen', 'Nomin', 'Ganaa', 'Khulan', 'Enkhjin', 'Dorj', 'Oyunchimeg', 'Boldbaatar']
  : ['Бат', 'Сараа', 'Тэмүүлэн', 'Номин', 'Ганаа', 'Хулан', 'Энхжин', 'Дорж', 'Оюунчимэг', 'Болдбаатар'];
const DEMO_COLORS = ['rose', 'violet', 'gold', 'teal', 'blue', 'plum', 'rose', 'violet', 'gold', 'teal'];
const ALL_DEMO_SEATS: WhoAmISeat[] = DEMO_NAMES.map((name, index) => ({ id: index + 1, name, initials: name.slice(0, 2).toUpperCase(), color: DEMO_COLORS[index], host: index === 0 }));
/** The demo table: the first `players` seats (see whoAmIDemoRequest.ts). */
const DEMO_SEATS = ALL_DEMO_SEATS.slice(0, demoRequest()?.players ?? DEMO_SEAT_COUNT);

const step = (state: WhoAmIState, id: number, action: WhoAmIAction) => applyWhoAmIAction(state, id, action).state;
const asker = (state: WhoAmIState) => activeWhoAmIPlayerId(state)!;
function vote(state: WhoAmIState, votes: Array<'yes' | 'no' | 'unknown'>) {
  let next = step(state, asker(state), { type: 'asked' });
  eligibleVoters(next).forEach((id, index) => { if (next.phase === 'answer') next = step(next, id, { type: 'answer', vote: votes[index % votes.length] }); });
  return next;
}
function judge(state: WhoAmIState, verdicts: Array<'correct' | 'wrong'>, text: string | null = null) {
  let next = step(state, asker(state), { type: 'guess', text });
  eligibleVoters(next).forEach((id, index) => { if (next.phase === 'guess') next = step(next, id, { type: 'judge', verdict: verdicts[index % verdicts.length] }); });
  return next;
}

/** A believable table in the requested phase, always the same for the same phase. */
function scenario(phase: DemoPhase): WhoAmIState {
  let state = createWhoAmIGame(DEMO_SEATS, WHO_AM_I_PACK, createSeededRandom(2026), { rounds: 5, categories: [], kidsSafe: false });
  if (phase === 'reveal') return step(step(state, 3, { type: 'ready' }), 5, { type: 'ready' });
  state = state.players.reduce((value, player) => step(value, player.id, { type: 'ready' }), state);
  // Round 1: the first player answers two questions and solves; the second is told "no".
  state = vote(state, ['yes', 'yes', 'yes', 'no', 'unknown']);
  state = vote(state, ['yes', 'yes', 'unknown', 'yes', 'no']);
  state = judge(state, ['correct', 'correct', 'correct', 'wrong', 'correct']);
  state = vote(state, ['no', 'no', 'yes', 'no', 'no']);
  // The third player is on: one "yes" so far.
  state = vote(state, ['yes', 'yes', 'yes', 'no', 'yes']);
  if (phase === 'ask') return state;
  if (phase === 'answer') {
    let next = step(state, asker(state), { type: 'asked' });
    const [first, second] = eligibleVoters(next);
    next = step(step(next, first, { type: 'answer', vote: 'yes' }), second, { type: 'answer', vote: 'no' });
    return next;
  }
  if (phase === 'guess') {
    let next = step(state, asker(state), { type: 'guess', text: isEnglish ? 'A camel?' : 'Тэмээ?' });
    next = step(next, eligibleVoters(next)[0], { type: 'judge', verdict: 'wrong' });
    return next;
  }
  // Results: a few more solves and give-ups, then the round limit.
  state = judge(state, ['correct', 'correct', 'correct', 'correct', 'wrong']);
  state = vote(state, ['yes', 'no', 'no', 'no', 'yes']);
  state = vote(state, ['yes', 'yes', 'yes', 'unknown', 'yes']);
  state = judge(state, ['wrong', 'wrong', 'correct', 'wrong', 'wrong']);
  state = step(state, state.order[state.order.length - 1], { type: 'giveUp' });
  let guard = 0;
  while (state.phase !== 'results' && guard < 200) { state = guard % 3 === 0 && state.phase === 'ask' ? vote(state, ['yes', 'no', 'yes', 'no', 'unknown']) : timeoutWhoAmI(state); guard += 1; }
  return state;
}

function setUrl(patch: Record<string, string | null>) {
  try {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(patch)) { if (value === null) url.searchParams.delete(key); else url.searchParams.set(key, value); }
    window.history.replaceState(null, '', url);
  } catch {
    // Not important for a preview.
  }
}

export type DemoProps = { request: DemoRequest; fullscreen: FullscreenState; notify: NotifyFn; lobby: ComponentType<LobbyViewProps> };

export function WhoAmIDemo({ request, notify, lobby: Lobby }: DemoProps) {
  const [mode, setMode] = useState<'lobby' | DemoPhase>(request.screen === 'lobby' ? 'lobby' : request.phase);
  const [state, setState] = useState<WhoAmIState>(() => scenario(request.screen === 'lobby' ? 'reveal' : request.phase));
  const [auto, setAuto] = useState(request.auto);
  const [barOpen, setBarOpen] = useState(false);
  const [viewer, setViewer] = useState<number>(() => request.seat ?? defaultViewer(state, mode));
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [settings, setSettings] = useState<Record<string, unknown>>({ rounds: 5, categories: [], kidsSafe: false });
  const [ready, setReady] = useState<Record<string, boolean>>({ 'demo-2': true, 'demo-3': true, 'demo-5': true });

  const stage = whoAmIStageKey(state);
  useEffect(() => {
    const seconds = whoAmIDeadlineSeconds(state);
    setDeadline(seconds === null ? null : Date.now() + seconds * 1000);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [auto]);
  const seconds = deadline === null ? null : auto ? Math.max(0, Math.ceil((deadline - now) / 1000)) : whoAmIDeadlineSeconds(state);

  // Auto play: the clock runs and the other seats vote and ask on their own.
  useEffect(() => {
    if (!auto || state.phase === 'results') return;
    if (seconds === 0) { setState((current) => timeoutWhoAmI(current)); return; }
    const timer = window.setTimeout(() => setState((current) => simulateOthers(current, viewer)), 1600);
    return () => window.clearTimeout(timer);
  }, [auto, seconds === 0, state.step, viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePhase = (next: 'lobby' | DemoPhase) => {
    setMode(next);
    const fresh = scenario(next === 'lobby' ? 'reveal' : next);
    setState(fresh);
    setViewer(defaultViewer(fresh, next));
    setUrl(next === 'lobby' ? { demo: 'lobby', phase: null, seat: null } : { demo: 'game', phase: next, seat: null });
  };
  const chooseViewer = (seat: number) => { setViewer(seat); setUrl({ seat: String(seat) }); };

  const bar = request.bar && (!barOpen
    ? <button type="button" className="whoami-demo-pill" onClick={() => setBarOpen(true)}>{i18n.whoAmI.demoBanner} ▸</button>
    : <div className="whoami-demo-bar" role="toolbar" aria-label="Demo">
    <button type="button" onClick={() => setBarOpen(false)} aria-label="Close">✕</button>
    <b>{i18n.whoAmI.demoBanner}</b>
    <span className="whoami-demo-group">{(['lobby', ...PHASES] as const).map((phase) => <button type="button" key={phase} className={mode === phase ? 'is-picked' : ''} onClick={() => choosePhase(phase)}>{phase === 'lobby' ? t('Лобби', 'Lobby') : i18n.whoAmI.phase[phase]}</button>)}</span>
    <span className="whoami-demo-group"><small>{i18n.whoAmI.demoViewAs}</small>{DEMO_SEATS.map((seat) => <button type="button" key={seat.id} className={viewer === seat.id ? 'is-picked' : ''} onClick={() => chooseViewer(seat.id)}>{seat.name}</button>)}</span>
    {mode !== 'lobby' && <button type="button" className={auto ? 'is-picked' : ''} onClick={() => setAuto((value) => !value)}>Auto {auto ? 'ON' : 'OFF'}</button>}
  </div>);

  const seats: RoomSeat[] = useMemo(() => DEMO_SEATS.map((seat) => ({ user_id: `demo-${seat.id}`, seat: seat.id, display_name: seat.name, color: seat.color, ready: seat.id === 1 || ready[`demo-${seat.id}`] === true })), [ready]);

  if (mode === 'lobby') {
    const room: RoomInfo = { room_code: 'NIGHT-WHO1', name: isEnglish ? 'Guess Who I Am' : 'Хэн бэ би?', host_id: 'demo-1', max_players: Math.max(8, DEMO_SEATS.length), is_private: false, status: 'lobby', game_type: 'whoami', settings, language: isEnglish ? 'en' : 'mn' };
    const onRun = async (action: string, body: Record<string, unknown> = {}) => {
      if (action === 'settings') setSettings(sanitizeWhoAmISettings(body.settings, WHO_AM_I_PACK));
      else if (action === 'ready') setReady((current) => ({ ...current, [`demo-${viewer}`]: body.ready === true }));
      else if (action === 'start') choosePhase('reveal');
      else notify(t('Туршилтын горимд сервер алга.', 'There is no server in the demo.'));
      return true;
    };
    return <>
      <Lobby room={room} seats={seats} roomCode={room.room_code} userId={`demo-${viewer}`} copied={false} busy={false} onCopy={() => undefined}
        onLeave={() => notify(t('Туршилтын горим', 'Demo mode'))} onRun={onRun} onProfileSeat={() => undefined} onInvite={() => undefined} />
      {bar}
    </>;
  }

  const onAction = (action: WhoAmIAction) => {
    const result = applyWhoAmIAction(state, viewer, action);
    if (result.error) notify(result.error, 'error');
    else setState(result.state);
  };

  return <VoiceChatProvider roomCode="NIGHT-WHO1" userId={null} seats={seats} phase={state.phase === 'results' ? 'results' : 'discussion'} alive isHost={viewer === 1}>
    <WhoAmITable game={whoAmIPublicView(state)} me={whoAmIPrivateView(state, viewer)} roomName={isEnglish ? 'Guess Who I Am' : 'Хэн бэ би?'} isHost={viewer === 1} busy={false}
      secondsLeft={seconds} onAction={onAction} onLeave={() => notify(t('Туршилтын горим', 'Demo mode'))} onRematch={() => choosePhase('reveal')} banner={bar} />
  </VoiceChatProvider>;
}

/** The seat whose view shows the most: someone other than the asker (they see the asker's identity and can vote). */
function defaultViewer(state: WhoAmIState, mode: 'lobby' | DemoPhase) {
  if (mode === 'lobby' || mode === 'reveal' || mode === 'results') return 1;
  const active = activeWhoAmIPlayerId(state);
  return eligibleVoters(state).find((id) => id !== active && !(state.answerVotes[id] || state.judgeVotes[id])) ?? state.order.find((id) => id !== active) ?? 1;
}

/** Auto play: every other seat votes at random once the viewer has acted; an asker who is not the viewer asks. */
function simulateOthers(state: WhoAmIState, viewer: number): WhoAmIState {
  const random = Math.random;
  const active = activeWhoAmIPlayerId(state);
  if (state.phase === 'reveal') return state.players.reduce((value, player) => player.id === viewer ? value : step(value, player.id, { type: 'ready' }), state);
  if (state.phase === 'ask' && active !== viewer && active !== null) return step(state, active, random() < 0.2 ? { type: 'guess', text: null } : { type: 'asked' });
  if (state.phase === 'answer' || state.phase === 'guess') {
    const waitingOnViewer = eligibleVoters(state).includes(viewer) && state.answerVotes[viewer] === undefined && state.judgeVotes[viewer] === undefined;
    if (waitingOnViewer) return state;
    return eligibleVoters(state).reduce((value, id) => {
      if (id === viewer || value.phase !== state.phase) return value;
      return state.phase === 'answer'
        ? step(value, id, { type: 'answer', vote: (['yes', 'no', 'unknown'] as const)[Math.floor(random() * 3)] })
        : step(value, id, { type: 'judge', verdict: random() < 0.5 ? 'correct' : 'wrong' });
    }, state);
  }
  return state;
}
