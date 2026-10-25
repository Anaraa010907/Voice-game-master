import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  ArrowLeft, Bot, Building2, Check, ChevronRight, CircleAlert, Dices, Info, X, Clipboard, Crown, LockKeyhole, Mic, Moon,
  Radio, RefreshCw, Settings as SettingsIcon, Shield, Trophy, UserRound, Users, WandSparkles, Zap,
} from 'lucide-react';
import { roles } from './gameData';
import RoleCardArtwork from './RoleCardArtwork';
import GameScreen from './Game';
import Auth, { type AuthView } from './Auth';
import { ProfileScreen } from './AccountScreens';
import { supabase, supabaseConfigured, type PublicProfile } from './supabaseClient';
import { i18n, translateMessage } from './i18n';
import { removeProfilePhoto, uploadProfilePhoto } from './avatarUpload';
import Avatar from './Avatar';
import { callGame, useRoom, type ListedRoom, type NoticeTone, type NotifyFn, type RoomSeat } from './multiplayer';
import { GAMES, type GameType } from './games';
import MonopolyScreen from './Monopoly';
import { motionReduced, setMotionReduced } from './motion';
import { musicEnabled, setMusicEnabled, setSfxEnabled, sfxEnabled, startMusic, wakeMusic } from './sfx';
import { VoiceAvatarIndicator, VoiceChatProvider } from './VoiceChat';
import { FullscreenToggle, useFullscreen, type FullscreenState } from './fullscreen';
import Brand from './Logo';

type Screen = 'menu' | 'hub' | 'browse' | 'create-room' | 'join-room' | 'lobby' | 'game' | 'roles' | 'profile' | 'settings' | 'auth';

type RoomSettings = { name: string; maxPlayers: number; isPublic: boolean; password: string; gameType: GameType };
const ROOM_STORAGE_KEY = 'mafia-shadows:room';

const readStoredRoom = () => {
  try { return window.localStorage.getItem(ROOM_STORAGE_KEY); } catch { return null; }
};
const storeRoom = (code: string | null) => {
  try {
    if (code) window.localStorage.setItem(ROOM_STORAGE_KEY, code);
    else window.localStorage.removeItem(ROOM_STORAGE_KEY);
  } catch {
    // Private mode: the player simply re-enters the code after a reload.
  }
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [authView, setAuthView] = useState<AuthView>('sign-in');
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [copied, setCopied] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [gameType, setGameType] = useState<GameType>('mafia');
  const [notice, setNotice] = useState<{ text: string; tone: NoticeTone } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [namePromptDismissed, setNamePromptDismissed] = useState(false);
  const fullscreen = useFullscreen();

  // The menu theme starts on the main menu and keeps playing across menus and lobbies; games swap in their own music.
  useEffect(() => {
    startMusic('menu');
    // Phones keep audio locked until the first touch; any tap wakes the current theme.
    window.addEventListener('pointerdown', wakeMusic);
    return () => window.removeEventListener('pointerdown', wakeMusic);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return;
    const client = supabase;
    let active = true;
    const restoreAccount = async (id: string) => {
      setAccountLoading(true);
      setProfileError('');
      const profileResult = await client.from('profiles').select('*').eq('id', id).maybeSingle();
      if (!active) return;
      if (profileResult.error) setProfileError(i18n.account.profileLoadFailed);
      else setProfile(profileResult.data as PublicProfile | null);
      setAccountLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id ?? null;
      setUserId(id);
      if (!id) {
        setProfile(null);
        setAccountLoading(false);
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        window.setTimeout(() => { if (active) void restoreAccount(id); }, 0);
      }
      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('reset-password');
        setScreen('auth');
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const notify: NotifyFn = (text, tone = 'info') => {
    setNotice({ text, tone });
    // A newer message restarts the clock; errors stay up a little longer.
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), tone === 'error' ? 4200 : 2600);
  };

  useEffect(() => {
    const client = supabase;
    if (!Capacitor.isNativePlatform() || !client) return;
    let active = true;
    const handledUrls = new Set<string>();
    const handleAuthCallback = async (url: string) => {
      if (!active || !url.startsWith('mafia-shadows://auth/callback') || handledUrls.has(url)) return;
      handledUrls.add(url);
      const callbackUrl = new URL(url);
      const fragment = new URLSearchParams(callbackUrl.hash.slice(1));
      const code = callbackUrl.searchParams.get('code') ?? fragment.get('code');
      const accessToken = fragment.get('access_token');
      const refreshToken = fragment.get('refresh_token');
      const errorDescription = callbackUrl.searchParams.get('error_description') ?? fragment.get('error_description');
      if (errorDescription) { notify(errorDescription, 'error'); return; }

      const result = code
        ? await client.auth.exchangeCodeForSession(code)
        : accessToken && refreshToken
          ? await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          : null;
      if (result?.error) notify(i18n.auth.invalidCredentials, 'error');
      if (callbackUrl.searchParams.get('type') === 'recovery' || fragment.get('type') === 'recovery') {
        setAuthView('reset-password');
        setScreen('auth');
      }
    };
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => { void handleAuthCallback(url); });
    void CapacitorApp.getLaunchUrl().then((launch) => { if (launch?.url) return handleAuthCallback(launch.url); });
    return () => {
      active = false;
      void listener.then((handle) => handle.remove());
    };
  }, []);

  // Return to the room after a reload or app restart.
  useEffect(() => {
    if (!userId) return;
    const stored = readStoredRoom();
    if (stored) {
      setRoomCode(stored);
      setScreen((current) => current === 'menu' ? 'lobby' : current);
    }
  }, [userId]);

  const enterRoom = (code: string) => {
    storeRoom(code);
    setRoomCode(code);
    setScreen('lobby');
  };

  const leaveRoom = () => {
    storeRoom(null);
    setRoomCode(null);
    setScreen('menu');
  };

  const requireAccount = (next: Screen) => {
    if (userId) return setScreen(next);
    notify('Онлайн тоглохын тулд эхлээд нэвтэрнэ үү.');
    openAuth('sign-in');
  };

  const createRoom = async (room: RoomSettings) => {
    const result = await callGame<{ roomCode: string }>('create', room);
    enterRoom(result.roomCode);
    notify(`${i18n.app.roomReady} ${result.roomCode}`, 'success');
  };

  const joinRoom = async (codeInput: string, passwordInput: string) => {
    const code = codeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}-[A-Z0-9]{2,4}$/.test(code)) throw new Error(translateMessage('Enter a room code in the format NIGHT-7X.'));
    const result = await callGame<{ roomCode: string }>('join', { roomCode: code, password: passwordInput });
    enterRoom(result.roomCode);
  };

  const copyRoom = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      notify(`${i18n.app.roomCode}: ${roomCode}`, 'success');
    }
  };

  const goBack = () => setScreen('menu');

  const openAuth = (view: AuthView = 'sign-in') => {
    setAuthView(view);
    setScreen('auth');
  };

  const saveProfilePhoto = async (file: File | null) => {
    if (!supabase || !userId) return translateMessage('Sign in again before editing your profile.');
    const previous = profile?.avatar_url ?? null;
    try {
      const url = file ? await uploadProfilePhoto(userId, file) : null;
      const { data, error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId).select('*').single();
      if (error) {
        if (url) await removeProfilePhoto(userId, url);
        return 'Профайл зургийг хадгалж чадсангүй.';
      }
      setProfile(data as PublicProfile);
      if (previous && previous !== url) await removeProfilePhoto(userId, previous);
      return '';
    } catch (cause) {
      return cause instanceof Error ? cause.message : 'Профайл зургийг хадгалж чадсангүй.';
    }
  };

  const saveProfile = async (displayName: string, avatarKey: string) => {
    if (!supabase || !userId) return translateMessage('Sign in again before editing your profile.');
    const { data, error } = await supabase.from('profiles').update({ display_name: displayName, avatar_key: avatarKey }).eq('id', userId).select('*').single();
    if (error) return translateMessage('Profile could not be saved. Only your display name and avatar can be edited.');
    setProfile(data as PublicProfile);
    return '';
  };

  return (
    <main className="viewport">
      <section className={`game-frame screen-${screen}`} aria-label="MAFIA: SHADOWS тоглоом">
        <div className="grain" aria-hidden="true" />
        {screen === 'menu' && <Menu onNavigate={setScreen} onPlay={() => requireAccount(roomCode ? 'lobby' : 'hub')} onCreate={() => requireAccount('hub')} onJoin={() => requireAccount('join-room')} signedIn={Boolean(userId)} onAuth={openAuth} fullscreen={fullscreen} />}
        {screen === 'hub' && <GameHub onBack={goBack} onChoose={(type) => { setGameType(type); setScreen('browse'); }} onJoinCode={() => setScreen('join-room')} />}
        {screen === 'browse' && <RoomBrowser key={gameType} gameType={gameType} onBack={() => setScreen('hub')} onCreate={() => setScreen('create-room')} onJoinCode={() => setScreen('join-room')} onEnter={enterRoom} />}
        {screen === 'create-room' && <CreateRoom key={gameType} gameType={gameType} onBack={() => setScreen('browse')} onCreate={createRoom} />}
        {screen === 'join-room' && <JoinRoom onBack={() => setScreen('menu')} onJoin={joinRoom} />}
        {screen === 'lobby' && roomCode && userId && (
          <RoomScreen
            roomCode={roomCode}
            userId={userId}
            copied={copied}
            onCopy={copyRoom}
            onLeft={leaveRoom}
            onNotice={notify}
            fullscreen={fullscreen}
          />
        )}
        {screen === 'lobby' && (!roomCode || !userId) && <JoinRoom onBack={goBack} onJoin={joinRoom} />}
        {screen === 'roles' && <RoleGallery onBack={goBack} />}
        {screen === 'profile' && <ProfileScreen profile={profile} loading={accountLoading} loadError={profileError} onBack={goBack} onSignIn={() => openAuth('sign-in')} onSignOut={() => openAuth('sign-out')} onSave={saveProfile} onPhoto={saveProfilePhoto} />}
        {screen === 'auth' && <Auth key={authView} initialView={authView} onBack={goBack} onAuthenticated={() => setScreen('profile')} onSignedOut={() => { setUserId(null); setProfile(null); setScreen('menu'); }} />}
        {screen === 'settings' && <Settings onBack={goBack} onProfile={() => setScreen('profile')} onAuth={() => openAuth(userId ? 'sign-out' : 'sign-in')} signedIn={Boolean(userId)} />}
        {userId && profile && needsName(profile.display_name) && !namePromptDismissed && screen !== 'auth' && screen !== 'profile'
          && <NameSetup current={profile.display_name} onSave={(name) => saveProfile(name, profile.avatar_key)} onLater={() => setNamePromptDismissed(true)} onDone={() => notify('Нэр хадгалагдлаа.', 'success')} />}
        {notice && <div className={`toast is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.tone === 'error' ? <CircleAlert size={14} /> : notice.tone === 'success' ? <Check size={14} /> : <Info size={14} />}{notice.text}</div>}
      </section>
      <div className="rotate-overlay" aria-live="polite">
        <div className="rotate-phone"><span /></div>
        <p>{i18n.app.turnPhone}</p>
        <small>{i18n.app.landscapePlay}</small>
      </div>
    </main>
  );
}

function Menu({ onNavigate, onPlay, onCreate, onJoin, signedIn, onAuth, fullscreen }: { onNavigate: (screen: Screen) => void; onPlay: () => void; onCreate: () => void; onJoin: () => void; signedIn: boolean; onAuth: (view?: AuthView) => void; fullscreen: FullscreenState }) {
  const items: Array<{ icon: ReactNode; label: string; onClick: () => void }> = [
    { icon: <Users size={17} />, label: i18n.app.createRoom, onClick: onCreate },
    { icon: <Radio size={17} />, label: i18n.app.joinRoom, onClick: onJoin },
    { icon: <Shield size={17} />, label: i18n.app.roleGallery, onClick: () => onNavigate('roles') },
    { icon: <UserRound size={17} />, label: i18n.app.profile, onClick: () => onNavigate('profile') },
    { icon: <SettingsIcon size={17} />, label: i18n.app.settings, onClick: () => onNavigate('settings') },
    { icon: <LockKeyhole size={17} />, label: signedIn ? i18n.app.signOut : i18n.auth.signInAccount, onClick: () => onAuth(signedIn ? 'sign-out' : 'sign-in') },
  ];
  return (
    <div className="menu-screen ds-menu">
      <header className="ds-menu-top"><Brand /><div className="ds-menu-actions"><span className={`online-note ${signedIn ? '' : 'is-offline'}`}><span className="status-dot" /> {signedIn ? 'ОНЛАЙН' : 'НЭВТРЭЭГҮЙ'}</span><FullscreenToggle fullscreen={fullscreen} /></div></header>
      <section className="ds-hero">
        <span className="ds-kicker">{i18n.app.cityOfSecrets}</span>
        <h1>Хэнд ч <em>бүү итгэ.</em></h1>
        <p>{i18n.app.darkStory}</p>
        <div className="ds-hero-cta">
          <button className="primary-button ds-play" onClick={onPlay}>{i18n.app.playNow.toUpperCase()} <ChevronRight size={18} /></button>
          <span className="ds-hero-meta"><Users size={13} /> {i18n.app.tableCount} <i /> {i18n.app.duration}</span>
        </div>
      </section>
      <section className="ds-menu-side">
        <MenuOrbit />
        <nav className="ds-menu-nav" aria-label="Үндсэн цэс">
          {items.map((item) => <button key={item.label} type="button" onClick={item.onClick}><span className="ds-nav-icon">{item.icon}</span><span className="ds-nav-label">{item.label}</span></button>)}
        </nav>
      </section>
      <footer className="ds-menu-foot"><span>{i18n.app.afterDark.toUpperCase()}</span><span>{i18n.app.version} <i>•</i> ОНЛАЙН ДУУТ ТОГЛООМ</span></footer>
    </div>
  );
}

/** Crescent moon with two tilted orbits and glowing nodes, drawn with CSS. */
function MenuOrbit() {
  return <div className="ds-orbit" aria-hidden="true">
    <div className="ds-orbit-ring is-a" /><div className="ds-orbit-ring is-b" />
    <div className="ds-moon" />
    <i className="ds-node is-cyan" /><i className="ds-node is-coral" /><i className="ds-node is-amber" />
  </div>;
}

function CreateRoom({ gameType, onBack, onCreate }: { gameType: GameType; onBack: () => void; onCreate: (room: RoomSettings) => Promise<void> }) {
  const game = GAMES[gameType];
  const [name, setName] = useState(game.defaultRoomName);
  const [maxPlayers, setMaxPlayers] = useState(game.defaultSize);
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return setError('Өрөөний нэрийг оруулаад үүсгэнэ үү.');
    if (!isPublic && password && password.length < 4) return setError('Өрөөний нууц үг хамгийн багадаа 4 тэмдэгт байна.');
    setError('');
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), maxPlayers, isPublic, password: isPublic ? '' : password, gameType });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Өрөө үүсгэж чадсангүй.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="inner-screen setup-screen"><TopBar title="ӨРӨӨ ҮҮСГЭХ" subtitle="ӨРӨӨНИЙ ТӨХИРГӨӨ" onBack={onBack} /><div className="setup-content"><div className="setup-heading"><div className="eyebrow left-eye">ТӨХИРГӨӨ СОНГОХ</div><h1>Өөрийнхөө <i>өрөөг</i> бүтээ.</h1><p><b className="setup-game-name">{game.title}</b> · Өрөөний кодыг найзууддаа илгээгээрэй. Дор хаяж {game.minPlayers} хүн нэгдвэл тоглоом эхэлнэ.</p></div><form className="room-form" onSubmit={submit}>
    <label className="form-field room-name-field"><span>{i18n.app.roomName.toUpperCase()}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="Өрөөний нэрээ оруулна уу" /></label>
    <label className="form-field"><span>{i18n.app.maxPlayers.toUpperCase()}</span><select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>{game.sizes.map((count) => <option key={count} value={count}>{count} тоглогч</option>)}</select></label>
    <div className="private-setting"><span><b>Нийтэд нээлттэй</b><small>{isPublic ? 'Өрөөний жагсаалтад харагдана, хэн ч нэгдэнэ' : 'Зөвхөн кодоор нэгдэнэ, нууц үг тавьж болно'}</small></span><button type="button" role="switch" aria-checked={isPublic} className={`toggle ${isPublic ? 'toggle-on' : ''}`} onClick={() => setIsPublic((value) => !value)}><i /></button></div>
    {!isPublic && <label className="form-field password-field"><span>ӨРӨӨНИЙ НУУЦ ҮГ <small>СОНГОЛТТОЙ</small></span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={32} placeholder="Нууц үггүй орж болно" autoComplete="new-password" /></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={15} /> {i18n.common.back.toUpperCase()}</button><button type="submit" className="primary-button" disabled={busy}><Users size={15} /> {busy ? 'ҮҮСГЭЖ БАЙНА…' : i18n.app.createRoom.toUpperCase()} <ChevronRight size={16} /></button></div>
  </form></div></div>;
}

function JoinRoom({ onBack, onJoin }: { onBack: () => void; onJoin: (code: string, password: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onJoin(code, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Өрөөнд нэгдэж чадсангүй.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="inner-screen setup-screen"><TopBar title="ӨРӨӨНД НЭГДЭХ" subtitle="ШИРЭЭНД НЭГДЭХ" onBack={onBack} /><div className="join-content"><div className="setup-heading"><div className="eyebrow left-eye">ХОТ ХҮЛЭЭЖ БАЙНА</div><h1>Код <i>мэдэх үү?</i></h1><p>Найзынхаа илгээсэн өрөөний кодыг оруулна уу.</p></div><form className="join-form" onSubmit={submit}>
    <label className="form-field"><span>{i18n.app.roomCode.toUpperCase()}</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={11} placeholder="NIGHT-7XQ2" autoComplete="off" autoCapitalize="characters" /></label>
    <label className="form-field"><span>ӨРӨӨНИЙ НУУЦ ҮГ <small>ШААРДЛАГАТАЙ БОЛ</small></span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Нууц үг оруулна уу" autoComplete="off" /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={15} /> {i18n.common.back.toUpperCase()}</button><button type="submit" className="primary-button" disabled={busy}><Radio size={15} /> {busy ? 'НЭГДЭЖ БАЙНА…' : i18n.app.joinRoom.toUpperCase()} <ChevronRight size={16} /></button></div>
  </form></div></div>;
}

/** Choose a game: two large glass cards with drawn art. */
function GameHub({ onBack, onChoose, onJoinCode }: { onBack: () => void; onChoose: (type: GameType) => void; onJoinCode: () => void }) {
  return <div className="inner-screen ds-hub"><TopBar title="ТОГЛООМ СОНГОНО УУ" subtitle="ТОГЛОХ" onBack={onBack} trailing={<button className="secondary-button hub-code-button" onClick={onJoinCode}><Radio size={14} /> КОДООР НЭГДЭХ</button>} />
    <div className="ds-hub-body">
      <span className="ds-kicker">ХОЁР ӨӨР ЕРТӨНЦ · НЭГ НУУЦ</span>
      <div className="ds-game-grid">
        <article className="ds-game-card is-mono">
          <BoardArt />
          <div className="ds-card-copy">
            <span className="ds-card-badge">BOARD GAME</span>
            <h2>{GAMES.monopoly.title}</h2>
            <p>{GAMES.monopoly.players} · Монгол газрууд, гэр бааз</p>
            <button type="button" className="ds-card-play hub-play" onClick={() => onChoose('monopoly')}>ТОГЛОХ <ChevronRight size={16} /></button>
          </div>
        </article>
        <article className="ds-game-card is-mafia">
          <MafiaArt />
          <div className="ds-card-copy">
            <span className="ds-card-badge">VOICE GAME</span>
            <h2>{GAMES.mafia.title}</h2>
            <p>{GAMES.mafia.players} · Дуут чат, нууц дүр</p>
            <button type="button" className="ds-card-play hub-play" onClick={() => onChoose('mafia')}>ТОГЛОХ <ChevronRight size={16} /></button>
          </div>
        </article>
      </div>
    </div>
  </div>;
}

/** Board game card art: a tilted board outline with two dice. */
function BoardArt() {
  const pip = (cx: number, cy: number) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.4" />;
  return <svg className="ds-card-art" viewBox="0 0 320 220" aria-hidden="true" preserveAspectRatio="xMaxYMid slice">
    <defs>
      <linearGradient id="die-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe2ad" /><stop offset="1" stopColor="#e2923a" /></linearGradient>
      <radialGradient id="amber-glow"><stop offset="0" stopColor="rgba(242,172,72,.45)" /><stop offset="1" stopColor="rgba(242,172,72,0)" /></radialGradient>
    </defs>
    <circle cx="228" cy="96" r="110" fill="url(#amber-glow)" />
    <g className="ds-art-lines" transform="rotate(-18 230 110)">
      <rect x="140" y="20" width="180" height="180" rx="10" />
      <rect x="168" y="48" width="124" height="124" rx="6" />
      {[0, 1, 2, 3, 4].map((i) => <line key={`t${i}`} x1={168 + i * 31} y1="20" x2={168 + i * 31} y2="48" />)}
      {[0, 1, 2, 3, 4].map((i) => <line key={`b${i}`} x1={168 + i * 31} y1="172" x2={168 + i * 31} y2="200" />)}
      {[0, 1, 2, 3, 4].map((i) => <line key={`l${i}`} x1="140" y1={48 + i * 31} x2="168" y2={48 + i * 31} />)}
    </g>
    <g transform="translate(196 58) rotate(-14)">
      <rect width="62" height="62" rx="14" fill="url(#die-face)" />
      <g fill="#5b2f08">{[pip(16, 16), pip(46, 16), pip(31, 31), pip(16, 46), pip(46, 46)]}</g>
    </g>
    <g transform="translate(250 112) rotate(12)">
      <rect width="50" height="50" rx="12" fill="url(#die-face)" opacity=".92" />
      <g fill="#5b2f08">{[pip(14, 14), pip(36, 36)]}</g>
    </g>
  </svg>;
}

/** Voice game card art: crescent moon, mask and sound waves. */
function MafiaArt() {
  return <svg className="ds-card-art" viewBox="0 0 320 220" aria-hidden="true" preserveAspectRatio="xMaxYMid slice">
    <defs>
      <radialGradient id="coral-glow"><stop offset="0" stopColor="rgba(240,92,103,.42)" /><stop offset="1" stopColor="rgba(240,92,103,0)" /></radialGradient>
      <linearGradient id="moon-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff9aa1" /><stop offset="1" stopColor="#c8303f" /></linearGradient>
    </defs>
    <circle cx="226" cy="100" r="112" fill="url(#coral-glow)" />
    <g className="ds-art-waves">
      <path d="M262 40a80 80 0 0 1 0 120" /><path d="M280 22a106 106 0 0 1 0 156" /><path d="M298 6a130 130 0 0 1 0 188" />
    </g>
    <path d="M214 34a66 66 0 1 0 52 106 54 54 0 1 1-52-106Z" fill="url(#moon-fill)" />
    <g className="ds-art-mask" transform="translate(186 70) scale(1.55)">
      <path d="M8 19c4-10 22-14 28-2-1 11-6 17-14 18C14 34 9 28 8 19Z" /><path d="M13 21c5-5 12-5 17 0-5 5-12 5-17 0Z" /><path d="M21 18v7M12 8l3 5M30 8l-3 5" />
    </g>
  </svg>;
}

/** Open public lobbies, refreshed automatically, plus quick join. */
function RoomBrowser({ gameType, onBack, onCreate, onJoinCode, onEnter }: { gameType: GameType; onBack: () => void; onCreate: () => void; onJoinCode: () => void; onEnter: (code: string) => void }) {
  const game = GAMES[gameType];
  const [rooms, setRooms] = useState<ListedRoom[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await callGame<{ rooms: ListedRoom[] }>('list', { gameType });
      setRooms(Array.isArray(result?.rooms) ? result.rooms : []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Өрөөнүүдийг ачаалж чадсангүй.');
    }
  }, [gameType]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const join = async (code: string) => {
    setBusy(code);
    try {
      const result = await callGame<{ roomCode: string }>('join', { roomCode: code });
      onEnter(result.roomCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Өрөөнд нэгдэж чадсангүй.');
      void load();
    } finally {
      setBusy('');
    }
  };

  const quick = async () => {
    setBusy('quick');
    try {
      const result = await callGame<{ roomCode: string | null }>('quick', { gameType });
      if (result.roomCode) onEnter(result.roomCode);
      else setError('Одоогоор нээлттэй өрөө алга. Өөрөө өрөө үүсгээд бусдыг хүлээгээрэй.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Өрөө олдсонгүй.');
    } finally {
      setBusy('');
    }
  };

  return <div className="inner-screen browse-screen"><TopBar title={game.title.toUpperCase()} subtitle="НЭЭЛТТЭЙ ӨРӨӨНҮҮД" onBack={onBack} trailing={<button className="icon-button" onClick={() => { void load(); }} aria-label="Шинэчлэх" title="Шинэчлэх"><RefreshCw size={15} /></button>} />
    <div className="browse-content">
      <section className="browse-list" aria-live="polite">
        {rooms === null && !error && <div className="browse-empty">Өрөөнүүдийг хайж байна…</div>}
        {rooms !== null && rooms.length === 0 && <div className="browse-empty"><Users size={20} /><b>Нээлттэй өрөө алга</b><span>Өөрөө өрөө үүсгээд кодоо найзууддаа илгээгээрэй.</span></div>}
        {rooms?.map((room) => <div className="browse-room" key={room.roomCode}>
          <div className="browse-room-copy"><b>{room.name}</b><span>Эзэн: {room.hostName} · {room.roomCode}</span></div>
          <div className="browse-room-count"><div className="browse-seats" aria-hidden="true">{Array.from({ length: room.maxPlayers }, (_, index) => <i key={index} className={index < room.players ? 'taken' : ''} />)}</div><span>{room.players}/{room.maxPlayers}</span></div>
          <button className="primary-button browse-join" disabled={Boolean(busy)} onClick={() => room.joined ? onEnter(room.roomCode) : join(room.roomCode)}>{room.joined ? 'БУЦАХ' : busy === room.roomCode ? '…' : 'НЭГДЭХ'} <ChevronRight size={14} /></button>
        </div>)}
      </section>
      <aside className="browse-actions">
        <button className="primary-button browse-quick" disabled={Boolean(busy)} onClick={quick}><Zap size={16} /> {busy === 'quick' ? 'ХАЙЖ БАЙНА…' : 'ХУРДАН НЭГДЭХ'}</button>
        <button className="secondary-button" onClick={onCreate}><Users size={15} /> {i18n.app.createRoom.toUpperCase()}</button>
        <button className="secondary-button" onClick={onJoinCode}><Radio size={15} /> КОДООР НЭГДЭХ</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="browse-note">{game.title}: дор хаяж {game.minPlayers} хүн хэрэгтэй. Хурдан нэгдэх нь хамгийн дүүрэх дөхсөн өрөөнд оруулна.</p>
      </aside>
    </div>
  </div>;
}

/** Lobby while the room waits; switches to the live game once the host starts. */
function RoomScreen({ roomCode, userId, copied, onCopy, onLeft, onNotice, fullscreen }: {
  roomCode: string; userId: string; copied: boolean; onCopy: () => void; onLeft: () => void; onNotice: NotifyFn; fullscreen: FullscreenState;
}) {
  const { room, seats, loaded, missing, error, reload } = useRoom(roomCode);
  const [busy, setBusy] = useState(false);
  const mine = seats.find((seat) => seat.user_id === userId);

  useEffect(() => {
    // The room was closed, or this player is no longer seated (left on another device).
    if (loaded && (missing || (room && !mine))) {
      onNotice(missing ? 'Өрөө хаагдсан байна.' : 'Та энэ өрөөнд байхгүй байна.');
      onLeft();
    }
  }, [loaded, missing, room, mine, onLeft, onNotice]);

  const run = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await callGame(action, { roomCode, ...body });
      await reload();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'Алдаа гарлаа.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    try { await callGame('leave', { roomCode }); } catch { /* leaving locally is still fine */ }
    onLeft();
  };

  if (!room || !mine) return <div className="inner-screen"><TopBar title="ӨРӨӨ" subtitle={error ? 'АЛДАА' : 'АЧААЛЖ БАЙНА'} onBack={leave} /><div className="room-loading">{error ?? 'Өрөөнд холбогдож байна…'}</div></div>;

  if (room.status !== 'lobby' && room.game_type === 'monopoly') {
    return <MonopolyScreen roomCode={roomCode} roomName={room.name} userId={userId} isHost={room.host_id === userId} seats={seats} onLeave={leave} onRematch={() => run('rematch')} onNotice={onNotice} />;
  }

  if (room.status !== 'lobby') {
    return <GameScreen roomCode={roomCode} roomName={room.name} userId={userId} isHost={room.host_id === userId} seats={seats} onLeave={leave} onRematch={() => run('rematch')} onNotice={onNotice} fullscreen={fullscreen} />;
  }

  const isHost = room.host_id === userId;
  const emptySlots = Math.max(room.max_players - seats.length, 0);
  const botsAllowed = GAMES[room.game_type ?? 'mafia'].allowBots;
  const others = seats.filter((seat) => seat.user_id !== room.host_id);
  const waitingFor = others.filter((seat) => !seat.ready);
  const minimum = GAMES[room.game_type ?? 'mafia'].minPlayers;
  const canStart = seats.length >= minimum && waitingFor.length === 0;
  const hint = seats.length < minimum
    ? `Дор хаяж ${minimum} тоглогч хэрэгтэй · одоо ${seats.length}`
    : waitingFor.length ? `Хүлээж байна: ${waitingFor.map((seat) => seat.display_name).join(', ')}` : 'Бүгд бэлэн!';

  return (
    <VoiceChatProvider roomCode={roomCode} userId={userId} phase="lobby" alive isHost={isHost}>
      <div className="inner-screen lobby-screen">
        <TopBar title={room.name.toUpperCase()} subtitle={`${GAMES[room.game_type ?? 'mafia'].title.toUpperCase()} · ЛОББИ`} onBack={leave} />
        <div className={`ds-lobby capacity-${room.max_players}`}>
          <section className="ds-lobby-main">
            <div className="ds-lobby-head">
              <div><div className="eyebrow">ХОТ СЭРЭХЭЭСЭЭ ӨМНӨ</div><h1>Бүлгээ <i>цуглуулаарай.</i></h1></div>
              <div className="lobby-toolbar"><span><Users size={14} /> ТОГЛОГЧИД <b>{String(seats.length).padStart(2, '0')}</b> <span className="muted">/ {room.max_players}</span></span><span className="room-visibility">{room.is_private ? 'ХУВИЙН' : 'НИЙТЭД НЭЭЛТТЭЙ'}</span></div>
            </div>
            <div className="player-grid">
              {seats.map((seat) => <SeatCard key={seat.user_id} seat={seat} isHost={seat.user_id === room.host_id} isMe={seat.user_id === userId}
                onRemoveBot={isHost && seat.is_bot ? () => run('bot-remove', { seat: seat.seat }) : undefined} busy={busy} />)}
              {Array.from({ length: emptySlots }, (_, index) => isHost && botsAllowed
                ? <button type="button" className="invite-slot add-bot-slot" key={`slot-${index}`} disabled={busy} onClick={() => run('bot-add')}><Bot size={18} /><small>БОТ НЭМЭХ</small></button>
                : <div className="invite-slot" key={`slot-${index}`}><span>+</span><small>СУЛ СУУДАЛ</small></div>)}
            </div>
          </section>
          <aside className="ds-lobby-side">
            <div className="room-code"><span>{i18n.app.roomCode.toUpperCase()}</span><strong>{roomCode}</strong><button aria-label="Өрөөний код хуулах" title="Өрөөний код хуулах" onClick={onCopy}>{copied ? <Check size={16} /> : <Clipboard size={16} />}</button></div>
            <GameRules type={room.game_type ?? 'mafia'} />
            <div className="lobby-hint"><LockKeyhole size={14} /><span>{isHost ? 'ТА ӨРӨӨНИЙ ЭЗЭН' : 'ЭЗЭН ЭХЛҮҮЛЭХИЙГ ХҮЛЭЭЖ БАЙНА'} <b>•</b> {hint}</span></div>
            <div className="lobby-actions">
              {!isHost && <button className={`secondary-button ready-button ${mine.ready ? 'is-ready' : ''}`} disabled={busy} onClick={() => run('ready', { ready: !mine.ready })}>{mine.ready ? <Check size={15} /> : <Shield size={15} />}{mine.ready ? 'БЭЛЭН' : 'БИ БЭЛЭН'}</button>}
              <button className="secondary-button leave-room-button" onClick={leave}><ArrowLeft size={15} /> {isHost ? 'ӨРӨӨГ ХААХ' : i18n.common.leave.toUpperCase()}</button>
              {isHost && <button className="primary-button start-button" disabled={busy || !canStart} onClick={() => run('start')}><Moon size={15} /> {i18n.app.startGame.toUpperCase()}</button>}
            </div>
          </aside>
        </div>
      </div>
    </VoiceChatProvider>
  );
}

function SeatCard({ seat, isHost, isMe, onRemoveBot, busy }: { seat: RoomSeat; isHost: boolean; isMe: boolean; onRemoveBot?: () => void; busy?: boolean }) {
  return <div className={`player-card compact-card ${seat.ready || isHost ? 'player-ready' : ''} ${seat.is_bot ? 'is-bot' : ''}`}>
    <Avatar name={seat.is_bot ? seat.display_name.replace(/ \(бот\)$/, '') : seat.display_name} color={seat.color} url={seat.avatar_url}>{isHost && <i title="Өрөөний эзэн"><Crown size={11} /></i>}{seat.is_bot ? <i className="bot-badge" title="Бот"><Bot size={11} /></i> : <VoiceAvatarIndicator name={seat.display_name} identity={seat.user_id} />}</Avatar>
    <div className="player-name">{seat.display_name}{isMe && <small>ЧИ</small>}</div>
    <div className={`player-status ${seat.ready || isHost ? 'online' : ''}`}>{isHost ? 'ЭЗЭН' : seat.is_bot ? 'БОТ' : seat.ready ? 'БЭЛЭН' : 'ХҮЛЭЭЖ БАЙНА'}</div>
    {onRemoveBot && <button type="button" className="remove-bot-button" disabled={busy} onClick={onRemoveBot} aria-label={`${seat.display_name} хасах`} title="Ботыг хасах"><X size={13} /></button>}
  </div>;
}

/** Three-line "how it works" card in the lobby. */
function GameRules({ type }: { type: GameType }) {
  const lines: Array<[ReactNode, string, string]> = type === 'monopoly'
    ? [[<Dices size={15} key="d" />, 'Нүүдэл', 'Шоо хаяж нүүгээд газар худалдаж ав.'], [<Building2 size={15} key="b" />, 'Гэр', 'Нэг өнгийн газраа бүрдүүлж гэр бариарай.'], [<Trophy size={15} key="t" />, 'Ялалт', '20 тойргийн дараа хамгийн баян нь ялна.']]
    : [[<Moon size={15} key="m" />, 'Шөнө', 'Мафи онилж, эмч хамгаалж, цагдаа шалгана.'], [<Mic size={15} key="v" />, 'Өдөр', 'Хэлэлцээд сэжигтнээ шүүх хуралд оруулна.'], [<Trophy size={15} key="t" />, 'Ялалт', 'Иргэд бүх мафийг илрүүлбэл ялна.']];
  return <div className={`ds-rules is-${type}`}>
    <div className="ds-rules-art" aria-hidden="true">{type === 'monopoly' ? <BoardArt /> : <MafiaArt />}</div>
    {lines.map(([icon, title, text]) => <div className="ds-rule" key={title}><span className="ds-rule-icon">{icon}</span><span><b>{title}</b>{text}</span></div>)}
  </div>;
}

/** Accounts created without a name get the placeholder "Player" (see the sign-up trigger). */
const needsName = (name: string) => name.trim() === '' || name.trim().toLowerCase() === 'player';

/** Asks once for the name other players will see at the table. */
function NameSetup({ current, onSave, onLater, onDone }: { current: string; onSave: (name: string) => Promise<string>; onLater: () => void; onDone: () => void }) {
  const [name, setName] = useState(needsName(current) ? '' : current);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 24) { setError('Нэр 2–24 тэмдэгт байна.'); return; }
    if (needsName(clean)) { setError('Өөр нэр сонгоно уу.'); return; }
    setSaving(true);
    const failure = await onSave(clean);
    setSaving(false);
    if (failure) setError(failure); else onDone();
  };
  return <div className="game-modal-backdrop name-setup-backdrop"><form className="game-modal name-setup" onSubmit={(event) => void submit(event)} aria-labelledby="name-setup-title">
    <div className="modal-symbol"><UserRound size={18} /></div>
    <h2 id="name-setup-title">Таныг хэн гэж дуудах вэ?</h2>
    <p>Бусад тоглогчид ширээн дээр энэ нэрийг харна. Дараа нь профайлаасаа сольж болно.</p>
    <input className="name-setup-input" value={name} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="Жишээ нь: Бат" maxLength={24} autoFocus aria-label="Нэр" />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onLater}>ДАРАА</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'ХАДГАЛЖ БАЙНА…' : 'ХАДГАЛАХ'} <Check size={14} /></button></div>
  </form></div>;
}

function TopBar({ title, subtitle, onBack, trailing }: { title: string; subtitle: string; onBack: () => void; trailing?: ReactNode }) {
  return <header className="top-bar"><button className="icon-button back-button" onClick={onBack} aria-label="Цэс рүү буцах"><ArrowLeft size={17} /></button><div className="top-title"><span>{subtitle}</span><strong>{title}</strong></div><Brand compact /><div className="top-trailing">{trailing}</div></header>;
}

/** Role cards only; the artwork already carries each role's text. Tap a card to view it full screen. */
function RoleGallery({ onBack }: { onBack: () => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex === null ? null : roles[openIndex];
  const step = (delta: number) => setOpenIndex((index) => index === null ? null : (index + delta + roles.length) % roles.length);

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenIndex(null);
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex]);

  return <div className="inner-screen gallery-screen card-gallery"><TopBar title="ДҮРИЙН ЛАВЛАХ" subtitle={`${roles.length} НУУЦ ДҮР`} onBack={onBack} />
    <div className="card-gallery-strip">
      {roles.map((item, index) => <button type="button" key={item.id} className={`card-gallery-item team-${item.team}`} onClick={() => setOpenIndex(index)} aria-label={`${item.displayName} картыг томоор харах`}>
        <RoleCardArtwork role={item} />
      </button>)}
    </div>
    <p className="card-gallery-hint">Картан дээр дарж томоор харна уу</p>
    {open && <div className="card-viewer" role="dialog" aria-modal="true" aria-label={open.displayName} onClick={() => setOpenIndex(null)}>
      <button type="button" className="card-viewer-nav is-prev" aria-label="Өмнөх карт" onClick={(event) => { event.stopPropagation(); step(-1); }}><ChevronRight size={22} /></button>
      <div className="card-viewer-card" onClick={(event) => event.stopPropagation()}><RoleCardArtwork role={open} /></div>
      <button type="button" className="card-viewer-nav is-next" aria-label="Дараагийн карт" onClick={(event) => { event.stopPropagation(); step(1); }}><ChevronRight size={22} /></button>
      <button type="button" className="card-viewer-close" aria-label="Хаах" onClick={() => setOpenIndex(null)}><X size={20} /></button>
    </div>}
  </div>;
}

function Settings({ onBack, onProfile, onAuth, signedIn }: { onBack: () => void; onProfile: () => void; onAuth: () => void; signedIn: boolean }) {
  const [sound, setSound] = useState(sfxEnabled());
  const [music, setMusic] = useState(musicEnabled());
  const [reduceMotion, setReduceMotion] = useState(motionReduced());
  return <div className="inner-screen simple-screen"><TopBar title="ТОХИРГОО" subtitle="ТОХИРГОО" onBack={onBack} /><div className="settings-content">  <div className="settings-intro"><div className="eyebrow left-eye">ӨӨРТӨӨ ТОХИРУУЛ</div><h1>Уур амьсгалаа <i>сонго.</i></h1></div><div className="setting-list"><SettingRow icon={<Radio size={17} />} title="Дууны эффект" detail="Хотын дуу чимээ болон тоглоомын эффект" checked={sound} onToggle={() => { setSfxEnabled(!sound); setSound(!sound); }} /><SettingRow icon={<Radio size={17} />} title="Дэвсгэр хөгжим" detail="Цэс болон тоглоом дундах аялгуу" checked={music} onToggle={() => { setMusicEnabled(!music); setMusic(!music); }} /><SettingRow icon={<WandSparkles size={17} />} title="Хөдөлгөөнийг багасгах" detail="Анивчих эффект, хөдөлгөөнт шилжилтийг унтраах" checked={reduceMotion} onToggle={() => { setMotionReduced(!reduceMotion); setReduceMotion(!reduceMotion); }} /><SettingsLink icon={<UserRound size={17} />} label="Профайл" detail={signedIn ? 'Нэр болон аватар засах' : 'Бүртгэлээ харахын тулд нэвтэрнэ үү'} onClick={onProfile} /><SettingsLink icon={<LockKeyhole size={17} />} label={signedIn ? 'Гарах' : 'Нэвтрэх / бүртгэл үүсгэх'} detail={signedIn ? 'Supabase бүртгэлээс гарах' : 'Бүртгэлийн боломжийг нээх'} onClick={onAuth} /></div><span className="settings-version">MAFIA: SHADOWS <i>•</i> ХУВИЛБАР 0.1.0</span></div></div>;
}

function SettingsLink({ icon, label, detail, onClick }: { icon: ReactNode; label: string; detail: string; onClick: () => void }) {
  return <button className="setting-row settings-link-row" onClick={onClick}><span className="setting-icon">{icon}</span><span className="setting-copy"><b>{label}</b><small>{detail}</small></span><ChevronRight size={15} /></button>;
}

function SettingRow({ icon, title, detail, checked, onToggle }: { icon: ReactNode; title: string; detail: string; checked: boolean; onToggle: () => void }) {
  return <button className="setting-row" role="switch" aria-checked={checked} onClick={onToggle}><span className="setting-icon">{icon}</span><span className="setting-copy"><b>{title}</b><small>{detail}</small></span><span className={`toggle ${checked ? 'toggle-on' : ''}`}><i /></span></button>;
}