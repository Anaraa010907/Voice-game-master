import { Suspense, lazy, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode, type CSSProperties } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  ArrowLeft, Bot, Check, ChevronRight, CircleAlert, CircleHelp, Info, X, Clipboard, Crown, Languages, LockKeyhole, Moon,
  MessageSquare, Radio, RefreshCw, Settings as SettingsIcon, Shield, ShieldCheck, ShoppingBag, Ticket, UserPlus, UserRound, Users, WandSparkles, Zap,
} from 'lucide-react';
import { roles, type RoleName } from './gameData';
import { LANG, ROOM_LANGS, roomLangName, setLang, t, type Lang } from './lang';
import RoleCardArtwork from './RoleCardArtwork';
import GameScreen from './Game';
import Auth, { takeOAuthPending, type AuthView } from './Auth';
import { ProfileScreen } from './AccountScreens';
import { AdminScreen, AnnouncementBanner, BannedOverlay, FeedbackScreen, banActive, type PlayerBan, type StaffRole } from './AdminScreens';
import { GiftLayer, PlayerCardModal, ShopScreen } from './Social';
import { BattlePassScreen } from './BattlePass';
import { FriendsScreen, InviteFriendsModal, useFriends, useMessageToasts, type Friend } from './Friends';
import { supabase, supabaseConfigured, type PublicProfile } from './supabaseClient';
import { i18n, translateMessage } from './i18n';
import { removeProfilePhoto, uploadProfilePhoto } from './avatarUpload';
import Avatar, { RowBorder, nameplate, rowBorderClass } from './Avatar';
import { callGame, useRoom, type ListedRoom, type NoticeTone, type NotifyFn, type RoomInfo, type RoomSeat } from './multiplayer';
import { GAMES, type GameType } from './games';
import { MafiaRulesCard, MafiaRulesEditor } from './MafiaRules';
import WhoAmIScreen, { WhoAmIWatch } from './WhoAmI';
import { WhoAmIRulesCard, WhoAmIRulesEditor } from './WhoAmIRules';
import { DEMO_ENABLED, demoRequest } from './whoAmIDemoRequest';
import { DEFAULT_WHOAMI_ROUNDS, WHOAMI_ROUND_CHOICES } from './whoAmIEngine';
import { motionReduced, setMotionReduced } from './motion';
import { startMusic, wakeMusic } from './sfx';
import { VolumeControls } from './VolumeControls';
import { VoiceAvatarIndicator, VoiceChatProvider } from './VoiceChat';
import { FullscreenToggle, useFullscreen, type FullscreenState } from './fullscreen';

type Screen = 'menu' | 'hub' | 'browse' | 'create-room' | 'join-room' | 'lobby' | 'game' | 'roles' | 'profile' | 'settings' | 'auth' | 'feedback' | 'admin' | 'shop' | 'watch' | 'friends' | 'pass';

type RoomSettings = { name: string; maxPlayers: number; isPublic: boolean; password: string; gameType: GameType; language: Lang; settings?: Record<string, unknown> };
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

/** The server-free preview; never part of a build that has Supabase keys. */
const WhoAmIDemo = DEMO_ENABLED ? lazy(() => import('./WhoAmIDemo').then((module) => ({ default: module.WhoAmIDemo }))) : null;

export default function App() {
  // Local preview without a server (dev builds, or any build without Supabase keys): ?demo=hub|create|lobby|game.
  const demo = demoRequest();
  const [screen, setScreen] = useState<Screen>(demo?.screen === 'hub' ? 'hub' : demo?.screen === 'create' ? 'create-room' : demo ? 'lobby' : 'menu');
  const [authView, setAuthView] = useState<AuthView>('sign-in');
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [copied, setCopied] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [gameType, setGameType] = useState<GameType>(demo ? 'whoami' : 'mafia');
  // Which language pool the room list shows and new rooms join: the app language unless the player picks the other one.
  const [roomLang, setRoomLang] = useState<Lang>(LANG);
  const [notice, setNotice] = useState<{ text: string; tone: NoticeTone } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [namePromptDismissed, setNamePromptDismissed] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [watchRoom, setWatchRoom] = useState<string | null>(null);
  const [ban, setBan] = useState<PlayerBan | null>(null);
  const fullscreen = useFullscreen();
  const friendsState = useFriends(userId);
  const [myRoomInfo, setMyRoomInfo] = useState<{ code: string; name: string; status: string } | null>(null);

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
      const [profileResult, adminResult, banResult] = await Promise.all([
        client.from('profiles').select('*').eq('id', id).maybeSingle(),
        client.rpc('staff_role'),
        client.from('player_bans').select('reason,banned_until').eq('user_id', id).maybeSingle(),
      ]);
      if (!active) return;
      if (profileResult.error) setProfileError(i18n.account.profileLoadFailed);
      else setProfile(profileResult.data as PublicProfile | null);
      setStaffRole(adminResult.data === 'admin' || adminResult.data === 'moderator' ? adminResult.data : null);
      setBan((banResult.data as PlayerBan | null) ?? null);
      setAccountLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id ?? null;
      setUserId(id);
      if (!id) {
        setProfile(null);
        setStaffRole(null);
        setBan(null);
        setAccountLoading(false);
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        window.setTimeout(() => { if (active) void restoreAccount(id); }, 0);
        // Back from Facebook: show the new account's profile.
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && takeOAuthPending()) setScreen('profile');
      }
      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('reset-password');
        setScreen('auth');
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const notify: NotifyFn = useCallback((text, tone = 'info') => {
    setNotice({ text, tone });
    // A newer message restarts the clock; errors stay up a little longer.
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), tone === 'error' ? 4200 : 2600);
  }, []);

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
      if (errorDescription) { takeOAuthPending(); notify(errorDescription, 'error'); return; }

      const result = code
        ? await client.auth.exchangeCodeForSession(code)
        : accessToken && refreshToken
          ? await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          : null;
      if (result?.error) notify(i18n.auth.invalidCredentials, 'error');
      if (callbackUrl.searchParams.get('type') === 'recovery' || fragment.get('type') === 'recovery') {
        setAuthView('reset-password');
        setScreen('auth');
      } else if (result && !result.error) {
        takeOAuthPending();
        setScreen('profile');
      }
    };
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => { void handleAuthCallback(url); });
    void CapacitorApp.getLaunchUrl().then((launch) => { if (launch?.url) return handleAuthCallback(launch.url); });
    return () => {
      active = false;
      void listener.then((handle) => handle.remove());
    };
  }, []);

  useMessageToasts(userId, screen === 'friends', notify);

  // The friends screen can invite to the lobby I sit in, so it needs that room's name and state.
  useEffect(() => {
    if (screen !== 'friends' || !roomCode || !supabase) { setMyRoomInfo(null); return; }
    let active = true;
    void supabase.from('game_rooms').select('room_code,name,status').eq('room_code', roomCode).maybeSingle().then(({ data }) => {
      if (active) setMyRoomInfo(data ? { code: data.room_code as string, name: data.name as string, status: data.status as string } : null);
    });
    return () => { active = false; };
  }, [screen, roomCode]);

  /** Accept an invite: leave the room I was in (if another), then sit down in the new one. */
  const joinInvite = async (code: string) => {
    try {
      if (roomCode && roomCode !== code) { try { await callGame('leave', { roomCode }); } catch { /* already gone */ } }
      await joinRoom(code, '');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t('Өрөөнд нэгдэж чадсангүй.', 'Could not join the room.'), 'error');
    }
  };

  // The profile shows coins, frame and title bought in the shop, so it is re-read each time it opens.
  useEffect(() => {
    if (screen !== 'profile' || !userId || !supabase) return;
    let active = true;
    void supabase.from('profiles').select('*').eq('id', userId).maybeSingle().then(({ data }) => { if (active && data) setProfile(data as PublicProfile); });
    return () => { active = false; };
  }, [screen, userId]);

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
    notify(t('Онлайн тоглохын тулд эхлээд нэвтэрнэ үү.', 'Sign in first to play online.'));
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
        return t('Профайл зургийг хадгалж чадсангүй.', 'Could not save the profile picture.');
      }
      setProfile(data as PublicProfile);
      if (previous && previous !== url) await removeProfilePhoto(userId, previous);
      return '';
    } catch (cause) {
      return cause instanceof Error ? cause.message : t('Профайл зургийг хадгалж чадсангүй.', 'Could not save the profile picture.');
    }
  };

  /** Picks one of the built-in portraits; a previously uploaded photo is deleted from storage. */
  const saveProfilePortrait = async (url: string) => {
    if (!supabase || !userId) return translateMessage('Sign in again before editing your profile.');
    const previous = profile?.avatar_url ?? null;
    const { data, error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId).select('*').single();
    if (error) return t('Профайл зургийг хадгалж чадсангүй.', 'Could not save the profile picture.');
    setProfile(data as PublicProfile);
    if (previous && previous !== url) await removeProfilePhoto(userId, previous);
    return '';
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
      <section className={`game-frame screen-${screen}`} aria-label={t('MAFIA: SHADOWS тоглоом', 'MAFIA: SHADOWS game')}>
        <div className="grain" aria-hidden="true" />
        {WhoAmIDemo && demo && (demo.screen === 'lobby' || demo.screen === 'game') ? <Suspense fallback={null}><WhoAmIDemo request={demo} fullscreen={fullscreen} notify={notify} lobby={LobbyView} /></Suspense> : <>
        {screen === 'menu' && <Menu onNavigate={setScreen} onPlay={() => requireAccount(roomCode ? 'lobby' : 'hub')} onCreate={() => requireAccount('hub')} onJoin={() => requireAccount('join-room')} onFeedback={() => requireAccount('feedback')} onShop={() => requireAccount('shop')} onPass={() => requireAccount('pass')} onFriends={() => requireAccount('friends')} friendBadge={friendsState.badge} signedIn={Boolean(userId)} staffRole={staffRole} onAuth={openAuth} fullscreen={fullscreen} />}
        {screen === 'hub' && <GameHub onBack={goBack} onChoose={(type) => { setGameType(type); setScreen('browse'); }} onJoinCode={() => setScreen('join-room')} />}
        {screen === 'browse' && <RoomBrowser key={gameType} gameType={gameType} language={roomLang} onLanguage={setRoomLang} onBack={() => setScreen('hub')} onCreate={() => setScreen('create-room')} onJoinCode={() => setScreen('join-room')} onEnter={enterRoom} />}
        {screen === 'create-room' && <CreateRoom key={gameType} gameType={gameType} startLanguage={roomLang} onBack={() => setScreen('browse')} onCreate={createRoom} />}
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
            friends={friendsState.friends}
          />
        )}
        {screen === 'lobby' && (!roomCode || !userId) && <JoinRoom onBack={goBack} onJoin={joinRoom} />}
        {screen === 'roles' && <RoleGallery onBack={goBack} />}
        {screen === 'profile' && <ProfileScreen profile={profile} loading={accountLoading} loadError={profileError} onBack={goBack} onSignIn={() => openAuth('sign-in')} onSignOut={() => openAuth('sign-out')} onSave={saveProfile} onPhoto={saveProfilePhoto} onPortrait={saveProfilePortrait} onShop={() => setScreen('shop')} />}
        {screen === 'auth' && <Auth key={authView} initialView={authView} onBack={goBack} onAuthenticated={() => setScreen('profile')} onSignedOut={() => { setUserId(null); setProfile(null); setScreen('menu'); }} />}
        {screen === 'feedback' && userId && <FeedbackScreen onBack={goBack} notify={notify} />}
        {screen === 'admin' && staffRole && <AdminScreen role={staffRole} onBack={goBack} notify={notify} onWatch={(code) => { setWatchRoom(code); setScreen('watch'); }} />}
        {screen === 'watch' && staffRole === 'admin' && watchRoom && userId && <AdminWatch roomCode={watchRoom} userId={userId} notify={notify} fullscreen={fullscreen}
          onExit={() => { setWatchRoom(null); setScreen('admin'); }} />}
        {screen === 'shop' && userId && <ShopScreen onBack={goBack} notify={notify} />}
        {screen === 'pass' && userId && <BattlePassScreen onBack={goBack} notify={notify} />}
        {screen === 'friends' && userId && <FriendsScreen userId={userId} playerNo={profile?.player_no ?? null} friendsState={friendsState} myRoom={myRoomInfo}
          onBack={goBack} onJoinRoom={joinInvite} notify={notify} />}
        {userId && banActive(ban) && screen !== 'feedback' && screen !== 'auth'
          && <BannedOverlay ban={ban!} onSignOut={() => openAuth('sign-out')} onFeedback={() => setScreen('feedback')} />}
        {screen === 'settings' && <Settings onBack={goBack} onProfile={() => setScreen('profile')} onAuth={() => openAuth(userId ? 'sign-out' : 'sign-in')} signedIn={Boolean(userId)} />}
        {userId && profile && needsName(profile.display_name) && !namePromptDismissed && screen !== 'auth' && screen !== 'profile'
          && <NameSetup current={profile.display_name} onSave={(name) => saveProfile(name, profile.avatar_key)} onLater={() => setNamePromptDismissed(true)} onDone={() => notify(t('Нэр хадгалагдлаа.', 'Name saved.'), 'success')} />}
        </>}
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

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark ${compact ? 'compact' : ''}`}><span className="brand-emblem"><img src="/assets/brand/emblem-192.png" alt="" width={compact ? 30 : 42} height={compact ? 30 : 42} /></span><span>MAFIA<span className="brand-colon">:</span> <b>SHADOWS</b></span></div>;
}

function Menu({ onNavigate, onPlay, onCreate, onJoin, onFeedback, onShop, onPass, onFriends, friendBadge, signedIn, staffRole, onAuth, fullscreen }: { onNavigate: (screen: Screen) => void; onPlay: () => void; onCreate: () => void; onJoin: () => void; onFeedback: () => void; onShop: () => void; onPass: () => void; onFriends: () => void; friendBadge: number; signedIn: boolean; staffRole: StaffRole | null; onAuth: (view?: AuthView) => void; fullscreen: FullscreenState }) {
  return (
    <div className="menu-screen">
      <header className="menu-top"><Brand /><div className="menu-top-actions"><div className="online-note"><span className="status-dot" /> {signedIn ? t('ОНЛАЙН', 'ONLINE') : t('НЭВТРЭЭГҮЙ', 'SIGNED OUT')}</div><FullscreenToggle fullscreen={fullscreen} /></div></header>
      <div className="city-art" aria-hidden="true"><div className="moon-glow" /><div className="cityline" /><div className="rain-lines" /></div>
      <AnnouncementBanner />
      <div className="menu-copy">
        <div className="eyebrow"><span /> {i18n.app.cityOfSecrets} <span /></div>
        <h1>{t('Хэнд ч', 'Trust')} <i>{t('бүү итгэ.', 'no one.')}</i></h1>
        <p>{i18n.app.darkStory}</p>
        <button className="primary-button play-button" onClick={onPlay}><span className="play-triangle" /> {i18n.app.playNow.toUpperCase()} <ChevronRight size={17} /></button>
        <div className="menu-subtext"><Users size={13} /> {i18n.app.tableCount} <span className="sub-divider" /> {i18n.app.duration}</div>
      </div>
      <nav className="menu-nav" aria-label={t('Үндсэн цэс', 'Main menu')}>
        <button onClick={onCreate}><span className="nav-icon"><Users size={16} /></span><span>{i18n.app.createRoom}</span><ChevronRight size={14} /></button>
        <button onClick={onJoin}><span className="nav-icon"><Radio size={16} /></span><span>{i18n.app.joinRoom}</span><ChevronRight size={14} /></button>
        <button onClick={() => onNavigate('roles')}><span className="nav-icon"><Shield size={16} /></span><span>{i18n.app.roleGallery}</span><ChevronRight size={14} /></button>
        <button onClick={() => onNavigate('profile')}><span className="nav-icon"><UserRound size={16} /></span><span>{i18n.app.profile}</span><ChevronRight size={14} /></button>
        <button className="menu-nav-friends" onClick={onFriends}><span className="nav-icon"><Users size={16} /></span><span>{t('Найзууд', 'Friends')}</span>{friendBadge > 0 ? <b className="admin-count">{friendBadge}</b> : <ChevronRight size={14} />}</button>
        <button className="menu-nav-pass" onClick={onPass}><span className="nav-icon"><Ticket size={16} /></span><span>Battle Pass</span><ChevronRight size={14} /></button>
        <button className="menu-nav-shop" onClick={onShop}><span className="nav-icon"><ShoppingBag size={16} /></span><span>{t('Дэлгүүр', 'Shop')}</span><ChevronRight size={14} /></button>
        <button onClick={onFeedback}><span className="nav-icon"><MessageSquare size={16} /></span><span>{t('Санал хүсэлт', 'Feedback')}</span><ChevronRight size={14} /></button>
        <button onClick={() => onNavigate('settings')}><span className="nav-icon"><SettingsIcon size={16} /></span><span>{i18n.app.settings}</span><ChevronRight size={14} /></button>
        {staffRole && <button className="menu-nav-admin" onClick={() => onNavigate('admin')}><span className="nav-icon"><ShieldCheck size={16} /></span><span>{staffRole === 'admin' ? t('Админ', 'Admin') : t('Модератор', 'Moderator')}</span><ChevronRight size={14} /></button>}
        <button onClick={() => onAuth(signedIn ? 'sign-out' : 'sign-in')}><span className="nav-icon"><LockKeyhole size={16} /></span><span>{signedIn ? i18n.app.signOut : i18n.auth.signInAccount}</span><ChevronRight size={14} /></button>
      </nav>
      <footer className="menu-footer"><span>{i18n.app.afterDark.toUpperCase()}</span><span>{i18n.app.version} <i>•</i> {t('ОНЛАЙН ДУУТ ТОГЛООМ', 'ONLINE VOICE GAME')}</span></footer>
    </div>
  );
}

function CreateRoom({ gameType, startLanguage, onBack, onCreate }: { gameType: GameType; startLanguage: Lang; onBack: () => void; onCreate: (room: RoomSettings) => Promise<void> }) {
  const game = GAMES[gameType];
  const [name, setName] = useState(game.defaultRoomName);
  const [maxPlayers, setMaxPlayers] = useState(game.defaultSize);
  const [isPublic, setIsPublic] = useState(true);
  const [language, setLanguage] = useState<Lang>(startLanguage);
  const [password, setPassword] = useState('');
  const [rounds, setRounds] = useState<number>(DEFAULT_WHOAMI_ROUNDS);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return setError(t('Өрөөний нэрийг оруулаад үүсгэнэ үү.', 'Enter a room name to create the room.'));
    if (!isPublic && password && password.length < 4) return setError(t('Өрөөний нууц үг хамгийн багадаа 4 тэмдэгт байна.', 'The room password needs at least 4 characters.'));
    setError('');
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), maxPlayers, isPublic, password: isPublic ? '' : password, gameType, language, ...(gameType === 'whoami' ? { settings: { rounds } } : {}) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Өрөө үүсгэж чадсангүй.', 'Could not create the room.'));
    } finally {
      setBusy(false);
    }
  };

  return <div className="inner-screen setup-screen"><TopBar title={t('ӨРӨӨ ҮҮСГЭХ', 'CREATE ROOM')} subtitle={t('ӨРӨӨНИЙ ТӨХИРГӨӨ', 'ROOM SETTINGS')} onBack={onBack} /><div className="setup-content"><div className="setup-heading"><div className="eyebrow left-eye">{t(`ТӨХИРГӨӨ СОНГОХ`, `CHOOSE YOUR SETTINGS`)}</div><h1>{t(`Өөрийнхөө `, `Build your `)}<i>{t(`өрөөг`, `own room`)}</i>{t(` бүтээ.`, `.`)}</h1><p><b className="setup-game-name">{game.title}</b>{t(` · Өрөөний кодыг найзууддаа илгээгээрэй. Дор хаяж ${game.minPlayers} хүн нэгдвэл тоглоом эхэлнэ.`, ` · Send the room code to your friends. The game starts once at least ${game.minPlayers} players join.`)}</p></div><form className="room-form" onSubmit={submit}>
    <label className="form-field room-name-field"><span>{i18n.app.roomName.toUpperCase()}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder={t('Өрөөний нэрээ оруулна уу', 'Enter a room name')} /></label>
    <label className="form-field"><span>{i18n.app.maxPlayers.toUpperCase()}</span><select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>{game.sizes.map((count) => <option key={count} value={count}>{t(`${count} тоглогч`, `${count} players`)}</option>)}</select></label>
    {gameType === 'whoami' && <label className="form-field"><span>{i18n.whoAmI.rounds.toUpperCase()}</span><select value={rounds} onChange={(event) => setRounds(Number(event.target.value))}>{WHOAMI_ROUND_CHOICES.map((count) => <option key={count} value={count}>{i18n.whoAmI.roundsCount(count)}</option>)}</select></label>}
    <label className="form-field"><span>{t(`ЯРИХ ХЭЛ`, `ROOM LANGUAGE`)}</span><select value={language} onChange={(event) => setLanguage(event.target.value as Lang)}>{ROOM_LANGS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>
    <div className="private-setting"><span><b>{t(`Нийтэд нээлттэй`, `Public room`)}</b><small>{isPublic ? t('Өрөөний жагсаалтад харагдана, хэн ч нэгдэнэ', 'Listed in the room list; anyone can join') : t('Зөвхөн кодоор нэгдэнэ, нууц үг тавьж болно', 'Join by code only; you can set a password')}</small></span><button type="button" role="switch" aria-checked={isPublic} aria-label={t('Нийтэд нээлттэй өрөө', 'Public room')} className={`toggle ${isPublic ? 'toggle-on' : ''}`} onClick={() => setIsPublic((value) => !value)}><i /></button></div>
    {!isPublic && <label className="form-field password-field"><span>{t(`ӨРӨӨНИЙ НУУЦ ҮГ `, `ROOM PASSWORD `)}<small>{t(`СОНГОЛТТОЙ`, `OPTIONAL`)}</small></span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={32} placeholder={t('Нууц үггүй орж болно', 'Leave empty for no password')} autoComplete="new-password" /></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={15} /> {i18n.common.back.toUpperCase()}</button><button type="submit" className="primary-button" disabled={busy}><Users size={15} /> {busy ? t('ҮҮСГЭЖ БАЙНА…', 'CREATING…') : i18n.app.createRoom.toUpperCase()} <ChevronRight size={16} /></button></div>
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
      setError(cause instanceof Error ? cause.message : t('Өрөөнд нэгдэж чадсангүй.', 'Could not join the room.'));
    } finally {
      setBusy(false);
    }
  };
  return <div className="inner-screen setup-screen"><TopBar title={t('ӨРӨӨНД НЭГДЭХ', 'JOIN ROOM')} subtitle={t('ШИРЭЭНД НЭГДЭХ', 'JOIN A TABLE')} onBack={onBack} /><div className="join-content"><div className="setup-heading"><div className="eyebrow left-eye">{t(`ХОТ ХҮЛЭЭЖ БАЙНА`, `THE CITY IS WAITING`)}</div><h1>{t(`Код `, `Got a `)}<i>{t(`мэдэх үү?`, `code?`)}</i></h1><p>{t(`Найзынхаа илгээсэн өрөөний кодыг оруулна уу.`, `Enter the room code your friend sent you.`)}</p></div><form className="join-form" onSubmit={submit}>
    <label className="form-field"><span>{i18n.app.roomCode.toUpperCase()}</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={11} placeholder="NIGHT-7XQ2" autoComplete="off" autoCapitalize="characters" /></label>
    <label className="form-field"><span>{t(`ӨРӨӨНИЙ НУУЦ ҮГ `, `ROOM PASSWORD `)}<small>{t(`ШААРДЛАГАТАЙ БОЛ`, `IF REQUIRED`)}</small></span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('Нууц үг оруулна уу', 'Enter the password')} autoComplete="off" /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={15} /> {i18n.common.back.toUpperCase()}</button><button type="submit" className="primary-button" disabled={busy}><Radio size={15} /> {busy ? t('НЭГДЭЖ БАЙНА…', 'JOINING…') : i18n.app.joinRoom.toUpperCase()} <ChevronRight size={16} /></button></div>
  </form></div></div>;
}

/** Choose a game type: one large illustrated card per game. */
function GameHub({ onBack, onChoose, onJoinCode }: { onBack: () => void; onChoose: (type: GameType) => void; onJoinCode: () => void }) {
  return <div className="inner-screen hub-screen"><TopBar title={t('ТОГЛООМ СОНГОНО УУ', 'CHOOSE A GAME')} subtitle={t('ТОГЛОХ', 'PLAY')} onBack={onBack} trailing={<button className="text-button hub-code-button" onClick={onJoinCode}><Radio size={14} />{t(` КОДООР НЭГДЭХ`, ` JOIN BY CODE`)}</button>} />
    <div className="hub-cards">
      <article className="hub-card hub-card-voice" style={{ '--hub-bg': "url('/assets/hub/voice-bg.jpg')" } as CSSProperties}>
        <h2><span>{i18n.app.hubVoiceTitle}</span></h2>
        <button type="button" className="hub-play" onClick={() => onChoose('mafia')}>{t(`ТОГЛОХ `, `PLAY `)}<ChevronRight size={18} /></button>
        <p className="hub-card-meta"><b>{GAMES.mafia.title}</b>{t(`${GAMES.mafia.players} · Дуут чат, нууц дүр`, `${GAMES.mafia.players} · Voice chat, secret roles`)}</p>
      </article>
      <article className="hub-card hub-card-whoami">
        <WhoAmIHubArt />
        <h2><span>{GAMES.whoami.title.toUpperCase()}</span></h2>
        <button type="button" className="hub-play" onClick={() => onChoose('whoami')}>{t(`ТОГЛОХ `, `PLAY `)}<ChevronRight size={18} /></button>
        <p className="hub-card-meta"><b>{GAMES.whoami.title}</b>{`${GAMES.whoami.players} · ${i18n.whoAmI.hubMeta}`}</p>
      </article>
    </div>
  </div>;
}

/**
 * Who Am I card art, drawn in SVG (original, no photos): a backlit faceless silhouette on a card with a
 * gold "?" over its head, and three face-down cards drifting around it.
 */
function WhoAmIHubArt() {
  const smallCard = (x: number, y: number, angle: number, key: string) => <g key={key} transform={`translate(${x} ${y}) rotate(${angle})`} className="hub-whoami-float">
    <rect x="-17" y="-24" width="34" height="48" rx="5" fill="url(#wa-card-back)" stroke="#d2b073" strokeOpacity=".55" />
    <rect x="-13" y="-20" width="26" height="40" rx="3" fill="none" stroke="#d2b073" strokeOpacity=".22" />
    <text x="0" y="8" textAnchor="middle" fontSize="22" fontWeight="700" fill="#d2b073" fillOpacity=".7" fontFamily="Georgia, serif">?</text>
  </g>;
  return <div className="hub-whoami-art" aria-hidden="true">
    <svg viewBox="0 0 240 170" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="wa-glow" cx="50%" cy="46%" r="50%"><stop offset="0" stopColor="#f3c979" stopOpacity=".55" /><stop offset=".45" stopColor="#a47ad0" stopOpacity=".22" /><stop offset="1" stopColor="#120f1c" stopOpacity="0" /></radialGradient>
        <linearGradient id="wa-card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a2f4c" /><stop offset="1" stopColor="#15121f" /></linearGradient>
        <linearGradient id="wa-card-back" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2c2439" /><stop offset="1" stopColor="#14121c" /></linearGradient>
        <linearGradient id="wa-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbe7b5" /><stop offset="1" stopColor="#c6923f" /></linearGradient>
        <clipPath id="wa-card-clip"><rect x="88" y="34" width="64" height="92" rx="8" /></clipPath>
      </defs>
      <ellipse cx="120" cy="82" rx="118" ry="80" fill="url(#wa-glow)" />
      {smallCard(48, 104, -16, 'a')}
      {smallCard(194, 58, 14, 'b')}
      {smallCard(196, 122, 24, 'c')}
      <g className="hub-whoami-main">
        <rect x="88" y="34" width="64" height="92" rx="8" fill="url(#wa-card)" stroke="url(#wa-gold)" strokeWidth="1.5" />
        <g clipPath="url(#wa-card-clip)">
          <rect x="88" y="34" width="64" height="92" fill="url(#wa-glow)" opacity=".7" />
          <circle cx="120" cy="84" r="13" fill="#0b0a10" />
          <path d="M92 128 C94 108 106 99 120 99 C134 99 146 108 148 128 Z" fill="#0b0a10" />
        </g>
        <rect x="92" y="38" width="56" height="84" rx="5" fill="none" stroke="#d2b073" strokeOpacity=".25" />
      </g>
      <text x="120" y="30" textAnchor="middle" fontSize="34" fontWeight="700" fill="url(#wa-gold)" fontFamily="'Playfair Display', Georgia, serif" className="hub-whoami-mark">?</text>
    </svg>
  </div>;
}

/** Open public lobbies, refreshed automatically, plus quick join. */
function RoomBrowser({ gameType, language, onLanguage, onBack, onCreate, onJoinCode, onEnter }: { gameType: GameType; language: Lang; onLanguage: (language: Lang) => void; onBack: () => void; onCreate: () => void; onJoinCode: () => void; onEnter: (code: string) => void }) {
  const game = GAMES[gameType];
  const [rooms, setRooms] = useState<ListedRoom[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await callGame<{ rooms: ListedRoom[] }>('list', { gameType, language });
      const list = Array.isArray(result?.rooms) ? result.rooms : [];
      setRooms(list);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Өрөөнүүдийг ачаалж чадсангүй.', 'Could not load the rooms.'));
    }
  }, [gameType, language]);

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
      setError(cause instanceof Error ? cause.message : t('Өрөөнд нэгдэж чадсангүй.', 'Could not join the room.'));
      void load();
    } finally {
      setBusy('');
    }
  };

  const quick = async () => {
    setBusy('quick');
    try {
      const result = await callGame<{ roomCode: string | null }>('quick', { gameType, language });
      if (result.roomCode) onEnter(result.roomCode);
      else setError(language === 'en'
        ? t('Англи хэлтэй нээлттэй өрөө одоогоор алга. Өөрөө өрөө үүсгээд бусдыг хүлээгээрэй.', 'No open English rooms right now. Create one and wait for others to join.')
        : t('Монгол хэлтэй нээлттэй өрөө одоогоор алга. Өөрөө өрөө үүсгээд бусдыг хүлээгээрэй.', 'No open Mongolian rooms right now. Create one and wait for others to join.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Өрөө олдсонгүй.', 'Room not found.'));
    } finally {
      setBusy('');
    }
  };

  return <div className="inner-screen browse-screen"><TopBar title={game.title.toUpperCase()} subtitle={t(`НЭЭЛТТЭЙ ӨРӨӨНҮҮД · ${roomLangName(language).toUpperCase()}`, `OPEN ROOMS · ${roomLangName(language).toUpperCase()}`)} onBack={onBack} trailing={<button className="icon-button" onClick={() => { void load(); }} aria-label={t('Шинэчлэх', 'Refresh')} title={t('Шинэчлэх', 'Refresh')}><RefreshCw size={15} /></button>} />
    <div className="browse-content">
      <section className="browse-list" aria-live="polite">
        {rooms === null && !error && <div className="browse-empty">{t(`Өрөөнүүдийг хайж байна…`, `Looking for rooms…`)}</div>}
        {rooms !== null && rooms.length === 0 && <div className="browse-empty"><Users size={20} /><b>{language === 'en' ? t(`Англи хэлтэй нээлттэй өрөө алга`, `No open English rooms`) : t(`Монгол хэлтэй нээлттэй өрөө алга`, `No open Mongolian rooms`)}</b><span>{t(`Өөрөө өрөө үүсгээд кодоо найзууддаа илгээгээрэй.`, `Create a room and send its code to your friends.`)}</span></div>}
        {rooms?.map((room) => <div className="browse-room" key={room.roomCode}>
          <div className="browse-room-copy"><b>{room.name}</b><span>{t(`Эзэн: ${room.hostName} · ${room.roomCode}`, `Host: ${room.hostName} · ${room.roomCode}`)}</span></div>
          <div className="browse-room-count"><div className="browse-seats" aria-hidden="true">{Array.from({ length: room.maxPlayers }, (_, index) => <i key={index} className={index < room.players ? 'taken' : ''} />)}</div><span>{room.players}/{room.maxPlayers}</span></div>
          <button className="primary-button browse-join" disabled={Boolean(busy)} onClick={() => room.joined ? onEnter(room.roomCode) : join(room.roomCode)}>{room.joined ? t('БУЦАХ', 'BACK') : busy === room.roomCode ? '…' : t('НЭГДЭХ', 'JOIN')} <ChevronRight size={14} /></button>
        </div>)}
      </section>
      <aside className="browse-actions">
        <div className="room-lang-pick"><span><Languages size={12} />{t(` ЯРИХ ХЭЛ`, ` ROOM LANGUAGE`)}</span>
          <span className="language-switch" role="radiogroup" aria-label={t('Өрөөний хэл', 'Room language')}>
            {ROOM_LANGS.map((option) => <button type="button" role="radio" key={option.code} aria-checked={language === option.code} className={language === option.code ? 'is-picked' : ''}
              onClick={() => { if (option.code !== language) { setRooms(null); setError(''); onLanguage(option.code); } }}>{option.label}</button>)}
          </span></div>
        <button className="primary-button browse-quick" disabled={Boolean(busy)} onClick={quick}><Zap size={16} /> {busy === 'quick' ? t('ХАЙЖ БАЙНА…', 'SEARCHING…') : t('ХУРДАН НЭГДЭХ', 'QUICK JOIN')}</button>
        <button className="secondary-button" onClick={onCreate}><Users size={15} /> {i18n.app.createRoom.toUpperCase()}</button>
        <button className="secondary-button" onClick={onJoinCode}><Radio size={15} />{t(` КОДООР НЭГДЭХ`, ` JOIN BY CODE`)}</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="browse-note">{t(`${game.title}: дор хаяж ${game.minPlayers} хүн хэрэгтэй. Хурдан нэгдэх нь сонгосон хэлтэй, хамгийн дүүрэх дөхсөн өрөөнд оруулна. Кодоор бол ямар ч хэлтэй өрөөнд нэгдэнэ.`, `${game.title}: needs at least ${game.minPlayers} players. Quick join puts you in the fullest room of the chosen language. With a code you can join a room of any language.`)}</p>
      </aside>
    </div>
  </div>;
}

/** Lobby while the room waits; switches to the live game once the host starts. */
function RoomScreen({ roomCode, userId, copied, onCopy, onLeft, onNotice, fullscreen, friends }: {
  roomCode: string; userId: string; copied: boolean; onCopy: () => void; onLeft: () => void; onNotice: NotifyFn; fullscreen: FullscreenState; friends: Friend[];
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const { room, seats, loaded, missing, error, reload } = useRoom(roomCode);
  const [busy, setBusy] = useState(false);
  const [profileSeat, setProfileSeat] = useState<RoomSeat | null>(null);
  const mine = seats.find((seat) => seat.user_id === userId);
  /** Opens a seated player's card by seat number (games) or seat row (lobby). */
  const openProfile = useCallback((seatNumber: number) => {
    const seat = seats.find((entry) => entry.seat === seatNumber);
    if (seat) setProfileSeat(seat);
  }, [seats]);
  // Gifts pop up for the whole table; a tapped player's card sits on top of any screen in the room.
  const overlays = <>
    <GiftLayer roomCode={roomCode} />
    {profileSeat && <PlayerCardModal seat={profileSeat} roomCode={roomCode} myUserId={userId} inGame={room?.status === 'playing'} notify={onNotice} onClose={() => setProfileSeat(null)} />}
  </>;

  useEffect(() => {
    // The room was closed, or this player is no longer seated (left on another device).
    if (loaded && (missing || (room && !mine))) {
      onNotice(missing ? t('Өрөө хаагдсан байна.', 'The room has closed.') : t('Та энэ өрөөнд байхгүй байна.', 'You are not in this room.'));
      onLeft();
    }
  }, [loaded, missing, room, mine, onLeft, onNotice]);

  const run = async (action: string, body: Record<string, unknown> = {}) => {
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

  const leave = async () => {
    try { await callGame('leave', { roomCode }); } catch { /* leaving locally is still fine */ }
    onLeft();
  };

  if (!room || !mine) return <div className="inner-screen"><TopBar title={t('ӨРӨӨ', 'ROOM')} subtitle={error ? t('АЛДАА', 'ERROR') : t('АЧААЛЖ БАЙНА', 'LOADING')} onBack={leave} /><div className="room-loading">{error ?? t('Өрөөнд холбогдож байна…', 'Connecting to the room…')}</div></div>;

  if (room.status !== 'lobby' && room.game_type === 'whoami') {
    return <><WhoAmIScreen roomCode={roomCode} roomName={room.name} userId={userId} isHost={room.host_id === userId} seats={seats} onLeave={leave} onRematch={() => { void run('rematch'); }} onNotice={onNotice} onProfile={openProfile} />{overlays}</>;
  }
  if (room.status !== 'lobby') {
    return <><GameScreen roomCode={roomCode} roomName={room.name} userId={userId} isHost={room.host_id === userId} seats={seats} onLeave={leave} onRematch={() => run('rematch')} onNotice={onNotice} fullscreen={fullscreen} onProfile={openProfile} />{overlays}</>;
  }

  return <LobbyView room={room} seats={seats} roomCode={roomCode} userId={userId} copied={copied} busy={busy} onCopy={onCopy} onLeave={leave} onRun={run}
    onProfileSeat={setProfileSeat} onInvite={() => setInviteOpen(true)}>
    {overlays}
    {inviteOpen && <InviteFriendsModal roomCode={roomCode} friends={friends} onClose={() => setInviteOpen(false)} notify={onNotice} />}
  </LobbyView>;
}

export type LobbyViewProps = {
  room: RoomInfo; seats: RoomSeat[]; roomCode: string; userId: string; copied: boolean; busy: boolean;
  onCopy: () => void; onLeave: () => void; onRun: (action: string, body?: Record<string, unknown>) => Promise<boolean>;
  onProfileSeat: (seat: RoomSeat) => void; onInvite: () => void; children?: ReactNode;
};

/** The waiting room: seats, the game's rules card, ready / start. Also used by the server-free demo. */
export function LobbyView({ room, seats, roomCode, userId, copied, busy, onCopy, onLeave, onRun, onProfileSeat, onInvite, children }: LobbyViewProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const mine = seats.find((seat) => seat.user_id === userId);
  const type: GameType = room.game_type ?? 'mafia';
  const whoAmI = type === 'whoami';
  const isHost = room.host_id === userId;
  const emptySlots = Math.max(room.max_players - seats.length, 0);
  const botsAllowed = GAMES[type].allowBots;
  const others = seats.filter((seat) => seat.user_id !== room.host_id);
  const waitingFor = others.filter((seat) => !seat.ready);
  const minimum = GAMES[type].minPlayers;
  const canStart = seats.length >= minimum && waitingFor.length === 0;
  const hint = seats.length < minimum
    ? t(`Дор хаяж ${minimum} тоглогч хэрэгтэй · одоо ${seats.length}`, `Needs at least ${minimum} players · now ${seats.length}`)
    : waitingFor.length ? t(`Хүлээж байна: ${waitingFor.map((seat) => seat.display_name).join(', ')}`, `Waiting for: ${waitingFor.map((seat) => seat.display_name).join(', ')}`) : t('Бүгд бэлэн!', 'Everyone is ready!');
  const saveRules = (settings: Record<string, unknown>) => { void onRun('settings', { settings }).then((saved) => { if (saved) setRulesOpen(false); }); };

  return (
    <VoiceChatProvider roomCode={roomCode} userId={userId} phase="lobby" alive isHost={isHost}>
      <div className={`inner-screen lobby-screen lobby-${type}`}>
        <TopBar title={room.name.toUpperCase()} subtitle={t(`${GAMES[type].title.toUpperCase()} · ЛОББИ`, `${GAMES[type].title.toUpperCase()} · LOBBY`)} onBack={onLeave} />
        <div className={`lobby-content capacity-${room.max_players}`}>
          <div className="lobby-heading">
            {whoAmI
              ? <div><div className="eyebrow left-eye">{t(`ДУХАН ДЭЭРХ НУУЦ`, `THE SECRET ON YOUR FOREHEAD`)}</div><h1>{t(`Найзуудаа `, `Gather your `)}<i>{t(`цуглуул.`, `friends.`)}</i></h1></div>
              : <div><div className="eyebrow left-eye">{t(`ХОТ СЭРЭХЭЭСЭЭ ӨМНӨ`, `BEFORE THE CITY WAKES`)}</div><h1>{t(`Бүлгээ `, `Gather your `)}<i>{t(`цуглуулаарай.`, `crew.`)}</i></h1></div>}
            <div className="room-code"><span>{i18n.app.roomCode.toUpperCase()}</span><strong>{roomCode}</strong><button aria-label={t('Өрөөний код хуулах', 'Copy room code')} title={t('Өрөөний код хуулах', 'Copy room code')} onClick={onCopy}>{copied ? <Check size={16} /> : <Clipboard size={16} />}</button></div>
          </div>
          <div className="lobby-toolbar"><span><Users size={14} />{t(` ТОГЛОГЧИД `, ` PLAYERS `)}<b>{String(seats.length).padStart(2, '0')}</b> <span className="muted">/ {room.max_players}</span></span><span className="room-visibility"><span className="room-lang-badge"><Languages size={10} />{` ${roomLangName(room.language).toUpperCase()}`}</span>{room.is_private ? t('ХУВИЙН · ЗӨВХӨН КОДООР', 'PRIVATE · CODE ONLY') : t('НИЙТЭД НЭЭЛТТЭЙ', 'PUBLIC')}</span></div>
          <div className="player-grid">
            {seats.map((seat) => <SeatCard key={seat.user_id} seat={seat} isHost={seat.user_id === room.host_id} isMe={seat.user_id === userId}
              onRemoveBot={isHost && seat.is_bot ? () => { void onRun('bot-remove', { seat: seat.seat }); } : undefined} busy={busy} onProfile={() => onProfileSeat(seat)} />)}
            {Array.from({ length: emptySlots }, (_, index) => isHost && botsAllowed
              ? <button type="button" className="invite-slot add-bot-slot" key={`slot-${index}`} disabled={busy} onClick={() => { void onRun('bot-add'); }}><Bot size={20} /><small>{t(`БОТ НЭМЭХ`, `ADD BOT`)}</small></button>
              : <div className="invite-slot" key={`slot-${index}`}><span>+</span><small>{t(`СУЛ СУУДАЛ`, `EMPTY SEAT`)}</small></div>)}
          </div>
          {whoAmI
            ? <WhoAmIRulesCard settings={room.settings} isHost={isHost} busy={busy} onEdit={() => setRulesOpen(true)} />
            : <MafiaRulesCard settings={room.settings} players={seats.length} isHost={isHost} busy={busy} onEdit={() => setRulesOpen(true)} />}
          <div className="lobby-bottom">
            <div className="lobby-hint"><LockKeyhole size={14} /><span><span className="lobby-hint-role">{isHost ? t('ТА ӨРӨӨНИЙ ЭЗЭН', 'YOU ARE THE HOST') : t('ЭЗЭН ЭХЛҮҮЛЭХИЙГ ХҮЛЭЭЖ БАЙНА', 'WAITING FOR THE HOST TO START')} <b>•</b> </span>{hint}</span></div>
            <div className="lobby-actions">
              <button className="secondary-button invite-friends-button" onClick={onInvite}><UserPlus size={15} />{t(` НАЙЗ УРИХ`, ` INVITE FRIENDS`)}</button>
              {!isHost && mine && <button className={`secondary-button ready-button ${mine.ready ? 'is-ready' : ''}`} disabled={busy} onClick={() => { void onRun('ready', { ready: !mine.ready }); }}>{mine.ready ? <Check size={15} /> : <Shield size={15} />}{mine.ready ? t('БЭЛЭН', 'READY') : t('БИ БЭЛЭН', 'I’M READY')}</button>}
              <button className="text-button" onClick={onLeave}><ArrowLeft size={15} /> {isHost ? t('ӨРӨӨГ ХААХ', 'CLOSE ROOM') : i18n.common.leave.toUpperCase()}</button>
              {isHost && <button className="primary-button start-button" disabled={busy || !canStart} onClick={() => { void onRun('start'); }}>{whoAmI ? <CircleHelp size={15} /> : <Moon size={15} />} {i18n.app.startGame.toUpperCase()} <ChevronRight size={16} /></button>}
            </div>
          </div>
        </div>
        {rulesOpen && isHost && (whoAmI
          ? <WhoAmIRulesEditor initial={room.settings} busy={busy} onClose={() => setRulesOpen(false)} onSave={saveRules} />
          : <MafiaRulesEditor initial={room.settings} players={seats.length} busy={busy} onClose={() => setRulesOpen(false)} onSave={(settings) => saveRules(settings as unknown as Record<string, unknown>)} />)}
      </div>
      {children}
    </VoiceChatProvider>
  );
}

/** An admin looking into a room: the live table, read only. Mafia also shows every role. */
function AdminWatch({ roomCode, userId, notify, fullscreen, onExit }: { roomCode: string; userId: string; notify: NotifyFn; fullscreen: FullscreenState; onExit: () => void }) {
  const { room, seats, loaded, missing } = useRoom(roomCode);
  const [roles, setRoles] = useState<Record<number, RoleName> | null>(null);
  const playingMafia = Boolean(room) && room!.status !== 'lobby' && (room!.game_type ?? 'mafia') === 'mafia';
  useEffect(() => {
    if (!playingMafia) return;
    let active = true;
    const load = () => callGame<{ roles: Record<number, RoleName> | null }>('admin-watch', { roomCode })
      .then((result) => { if (active) setRoles(result.roles); })
      .catch((cause: unknown) => { if (active) notify(cause instanceof Error ? cause.message : t('Дүрүүдийг уншиж чадсангүй.', 'Could not read the roles.'), 'error'); });
    void load();
    // A rematch deals new roles.
    const timer = window.setInterval(() => { void load(); }, 20000);
    return () => { active = false; window.clearInterval(timer); };
  }, [playingMafia, roomCode, notify]);

  const banner = <div className="watch-banner" role="status"><ShieldCheck size={13} />{t(` АДМИН АЖИГЛАЖ БАЙНА · ${roomCode}`, ` ADMIN WATCHING · ${roomCode}`)}<button type="button" onClick={onExit}><X size={13} />{t(` ГАРАХ`, ` LEAVE`)}</button></div>;
  if (!loaded) return <div className="inner-screen"><TopBar title={t('ӨРӨӨ', 'ROOM')} subtitle={t('АЖИГЛАХ', 'WATCH')} onBack={onExit} /><div className="room-loading">{t(`Өрөөнд холбогдож байна…`, `Connecting to the room…`)}</div></div>;
  if (missing || !room) return <div className="inner-screen"><TopBar title={t('ӨРӨӨ', 'ROOM')} subtitle={t('АЖИГЛАХ', 'WATCH')} onBack={onExit} /><div className="room-loading">{t(`Өрөө хаагдсан байна.`, `The room has closed.`)}</div></div>;
  if (room.status === 'lobby') {
    return <div className="inner-screen lobby-screen watch-lobby"><TopBar title={room.name.toUpperCase()} subtitle={t(`${GAMES[room.game_type ?? 'mafia'].title.toUpperCase()} · ЛОББИ`, `${GAMES[room.game_type ?? 'mafia'].title.toUpperCase()} · LOBBY`)} onBack={onExit} />
      <div className="watch-lobby-body"><p className="admin-note">{t(`Тоглоом хараахан эхлээгүй байна. Эхэлмэгц энд шууд харагдана.`, `The game hasn’t started yet. It will show here as soon as it does.`)}</p>
        <div className="player-grid">{seats.map((seat) => <SeatCard key={seat.user_id} seat={seat} isHost={seat.user_id === room.host_id} isMe={false} onProfile={() => undefined} />)}</div></div>
      {banner}</div>;
  }
  if (room.game_type === 'whoami') return <><WhoAmIWatch roomCode={roomCode} roomName={room.name} userId={userId} onExit={onExit} />{banner}</>;
  return <><GameScreen roomCode={roomCode} roomName={room.name} userId={userId} isHost={false} seats={seats} onLeave={onExit} onRematch={() => undefined} onNotice={notify} fullscreen={fullscreen} onProfile={() => undefined} watching={{ roles }} />{banner}</>;
}

function SeatCard({ seat, isHost, isMe, onRemoveBot, busy, onProfile }: { seat: RoomSeat; isHost: boolean; isMe: boolean; onRemoveBot?: () => void; busy?: boolean; onProfile: () => void }) {
  const plate = nameplate(seat.nameplate_key);
  return <div className={`player-card compact-card is-tappable ${seat.ready || isHost ? 'player-ready' : ''} ${seat.is_bot ? 'is-bot' : ''} ${plate.className} ${rowBorderClass(seat.border_key)}`} style={plate.style} role="button" tabIndex={0}
    onClick={onProfile} onKeyDown={(event) => { if (event.key === 'Enter') onProfile(); }} aria-label={t(`${seat.display_name} — профайл`, `${seat.display_name} — profile`)}>
    <RowBorder borderKey={seat.border_key} />
    <Avatar name={seat.is_bot ? seat.display_name.replace(/ \(бот\)$/, '') : seat.display_name} color={seat.color} url={seat.avatar_url} frame={seat.frame_key}>{isHost && <i className="host-badge" title={t('Өрөөний эзэн', 'Room host')}><Crown size={9} /></i>}{seat.is_bot ? <i className="bot-badge" title={t('Бот', 'Bot')}><Bot size={11} /></i> : <VoiceAvatarIndicator name={seat.display_name} identity={seat.user_id} />}</Avatar>
    <div className="player-name">{seat.display_name}{isMe && <small>{t(`ЧИ`, `YOU`)}</small>}</div>
    <div className={`player-status ${seat.ready || isHost ? 'online' : ''}`}>{isHost ? t('ЭЗЭН', 'HOST') : seat.is_bot ? t('БОТ', 'BOT') : seat.ready ? t('БЭЛЭН', 'READY') : t('ХҮЛЭЭЖ БАЙНА', 'WAITING')}</div>
    {onRemoveBot && <button type="button" className="remove-bot-button" disabled={busy} onClick={(event) => { event.stopPropagation(); onRemoveBot(); }} aria-label={t(`${seat.display_name} хасах`, `Remove ${seat.display_name}`)} title={t('Ботыг хасах', 'Remove bot')}><X size={13} /></button>}
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
    if (clean.length < 2 || clean.length > 24) { setError(t('Нэр 2–24 тэмдэгт байна.', 'The name must be 2–24 characters.')); return; }
    if (needsName(clean)) { setError(t('Өөр нэр сонгоно уу.', 'Please choose another name.')); return; }
    setSaving(true);
    const failure = await onSave(clean);
    setSaving(false);
    if (failure) setError(failure); else onDone();
  };
  return <div className="game-modal-backdrop name-setup-backdrop"><form className="game-modal name-setup" onSubmit={(event) => void submit(event)} aria-labelledby="name-setup-title">
    <div className="modal-symbol"><UserRound size={18} /></div>
    <h2 id="name-setup-title">{t(`Таныг хэн гэж дуудах вэ?`, `What should we call you?`)}</h2>
    <p>{t(`Бусад тоглогчид ширээн дээр энэ нэрийг харна. Дараа нь профайлаасаа сольж болно.`, `Other players see this name at the table. You can change it later in your profile.`)}</p>
    <input className="name-setup-input" value={name} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder={t('Жишээ нь: Бат', 'For example: Bat')} maxLength={24} autoFocus aria-label={t('Нэр', 'Name')} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onLater}>{t(`ДАРАА`, `LATER`)}</button><button type="submit" className="primary-button" disabled={saving}>{saving ? t('ХАДГАЛЖ БАЙНА…', 'SAVING…') : t('ХАДГАЛАХ', 'SAVE')} <Check size={14} /></button></div>
  </form></div>;
}

function TopBar({ title, subtitle, onBack, trailing }: { title: string; subtitle: string; onBack: () => void; trailing?: ReactNode }) {
  return <header className="top-bar"><button className="icon-button back-button" onClick={onBack} aria-label={t('Цэс рүү буцах', 'Back to menu')}><ArrowLeft size={17} /></button><div className="top-title"><span>{subtitle}</span><strong>{title}</strong></div><Brand compact /><div className="top-trailing">{trailing}</div></header>;
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

  return <div className="inner-screen gallery-screen card-gallery"><TopBar title={t('ДҮРИЙН ЛАВЛАХ', 'ROLE GALLERY')} subtitle={t(`${roles.length} НУУЦ ДҮР`, `${roles.length} SECRET ROLES`)} onBack={onBack} />
    <div className="card-gallery-strip">
      {roles.map((item, index) => <button type="button" key={item.id} className={`card-gallery-item team-${item.team}`} onClick={() => setOpenIndex(index)} aria-label={t(`${item.displayName} картыг томоор харах`, `Open the ${item.displayName} card`)}>
        <RoleCardArtwork role={item} />
      </button>)}
    </div>
    <p className="card-gallery-hint">{t('Картан дээр дарж томоор харна уу', 'Tap a card to see it up close')}</p>
    {open && <div className="card-viewer" role="dialog" aria-modal="true" aria-label={open.displayName} onClick={() => setOpenIndex(null)}>
      <button type="button" className="card-viewer-nav is-prev" aria-label={t('Өмнөх карт', 'Previous card')} onClick={(event) => { event.stopPropagation(); step(-1); }}><ChevronRight size={22} /></button>
      <div className="card-viewer-card" onClick={(event) => event.stopPropagation()}><RoleCardArtwork role={open} /></div>
      <button type="button" className="card-viewer-nav is-next" aria-label={t('Дараагийн карт', 'Next card')} onClick={(event) => { event.stopPropagation(); step(1); }}><ChevronRight size={22} /></button>
      <button type="button" className="card-viewer-close" aria-label={t('Хаах', 'Close')} onClick={() => setOpenIndex(null)}><X size={20} /></button>
    </div>}
  </div>;
}

function Settings({ onBack, onProfile, onAuth, signedIn }: { onBack: () => void; onProfile: () => void; onAuth: () => void; signedIn: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(motionReduced());
  return <div className="inner-screen simple-screen"><TopBar title={t('ТОХИРГОО', 'SETTINGS')} subtitle={t('ТОХИРГОО', 'SETTINGS')} onBack={onBack} /><div className="settings-content">
    <div className="settings-intro"><div className="eyebrow left-eye">{t('ӨӨРТӨӨ ТОХИРУУЛ', 'MAKE IT YOURS')}</div><h1>{t('Уур амьсгалаа', 'Set the')} <i>{t('сонго.', 'mood.')}</i></h1></div>
    <div className="setting-list">
      <LanguageRow />
      <VolumeControls />
      <SettingRow icon={<WandSparkles size={17} />} title={t('Хөдөлгөөнийг багасгах', 'Reduce motion')} detail={t('Анивчих эффект, хөдөлгөөнт шилжилтийг унтраах', 'Turn off flashing effects and animated transitions')} checked={reduceMotion} onToggle={() => { setMotionReduced(!reduceMotion); setReduceMotion(!reduceMotion); }} />
      <SettingsLink icon={<UserRound size={17} />} label={t('Профайл', 'Profile')} detail={signedIn ? t('Нэр болон аватар засах', 'Edit your name and avatar') : t('Бүртгэлээ харахын тулд нэвтэрнэ үү', 'Sign in to see your account')} onClick={onProfile} />
      <SettingsLink icon={<LockKeyhole size={17} />} label={signedIn ? t('Гарах', 'Sign out') : t('Нэвтрэх / бүртгэл үүсгэх', 'Sign in / create account')} detail={signedIn ? t('Бүртгэлээсээ гарах', 'Sign out of your account') : t('Бүртгэлийн боломжийг нээх', 'Unlock account features')} onClick={onAuth} />
    </div>
    <span className="settings-version">MAFIA: SHADOWS <i>•</i> {t('ХУВИЛБАР', 'VERSION')} 0.1.0</span></div></div>;
}

/** Монгол / English. Changing it reloads the app in the chosen language. */
function LanguageRow() {
  const options: Array<{ code: Lang; label: string }> = [{ code: 'mn', label: 'Монгол' }, { code: 'en', label: 'English' }];
  return <div className="setting-row language-row"><span className="setting-icon"><Languages size={17} /></span>
    <span className="setting-copy"><b>{t('Хэл', 'Language')}</b><small>{t('Апп-ын хэлийг сонгох', 'Choose the app language')}</small></span>
    <span className="language-switch" role="radiogroup" aria-label={t('Хэл', 'Language')}>
      {options.map((option) => <button type="button" role="radio" key={option.code} aria-checked={LANG === option.code} className={LANG === option.code ? 'is-picked' : ''}
        onClick={() => setLang(option.code)}>{option.label}</button>)}
    </span>
  </div>;
}

function SettingsLink({ icon, label, detail, onClick }: { icon: ReactNode; label: string; detail: string; onClick: () => void }) {
  return <button className="setting-row settings-link-row" onClick={onClick}><span className="setting-icon">{icon}</span><span className="setting-copy"><b>{label}</b><small>{detail}</small></span><ChevronRight size={15} /></button>;
}

function SettingRow({ icon, title, detail, checked, onToggle }: { icon: ReactNode; title: string; detail: string; checked: boolean; onToggle: () => void }) {
  return <button className="setting-row" role="switch" aria-checked={checked} onClick={onToggle}><span className="setting-icon">{icon}</span><span className="setting-copy"><b>{title}</b><small>{detail}</small></span><span className={`toggle ${checked ? 'toggle-on' : ''}`}><i /></span></button>;
}