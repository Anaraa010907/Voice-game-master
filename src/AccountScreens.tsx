import { useEffect, useState, type FormEvent } from 'react';
import { useRef } from 'react';
import { ArrowLeft, Camera, Check, ChevronRight, LoaderCircle, LockKeyhole, Shield, Trash2 } from 'lucide-react';
import Avatar from './Avatar';
import { supabaseConfigured, type PublicProfile } from './supabaseClient';
import { i18n } from './i18n';

export const avatarOptions = [
  { key: 'rose', label: 'Сарнай ягаан' },
  { key: 'violet', label: 'Нил ягаан' },
  { key: 'gold', label: 'Алтан шар' },
  { key: 'teal', label: 'Цэнхэр ногоон' },
  { key: 'blue', label: 'Цэнхэр' },
  { key: 'plum', label: 'Чавганы ягаан' },
] as const;



export function ProfileScreen({ profile, loading, loadError, onBack, onSignIn, onSignOut, onSave, onPhoto }: {
  profile: PublicProfile | null; loading: boolean; loadError: string; onBack: () => void; onSignIn: () => void; onSignOut: () => void;
  onSave: (displayName: string, avatarKey: string) => Promise<string>;
  onPhoto: (file: File | null) => Promise<string>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const changePhoto = async (file: File | null) => {
    setError('');
    setMessage('');
    setUploading(true);
    const result = await onPhoto(file);
    setUploading(false);
    if (result) setError(result);
    else setMessage(file ? 'Профайл зураг шинэчлэгдлээ.' : 'Профайл зураг устгагдлаа.');
  };
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar_key ?? 'rose');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setAvatar(profile?.avatar_key ?? 'rose');
  }, [profile?.display_name, profile?.avatar_key]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (name.trim().length < 2 || name.trim().length > 24) { setError(i18n.account.displayNameRule); return; }
    setSaving(true);
    const result = await onSave(name.trim(), avatar);
    setSaving(false);
    if (result) setError(result);
    else { setMessage(i18n.account.profileUpdated); setEditing(false); }
  };

  return <div className="inner-screen account-screen"><AccountTopBar title={i18n.account.yourFile.toUpperCase()} subtitle={i18n.account.playerProfile.toUpperCase()} onBack={onBack} trailing={profile && <button className="account-signout-link" onClick={onSignOut}>{i18n.account.signOut}</button>} />
    {!supabaseConfigured ? <BackendSetupNotice /> : loading ? <LoadingState label={i18n.account.loadingAccount} /> : !profile ? <AccountEmpty title={i18n.account.profileWaiting} detail={loadError || i18n.account.profileDetail} action={i18n.account.signInAction} onAction={onSignIn} /> : <div className="account-body profile-body">
      <div className="profile-identity-row"><div className="profile-photo-block"><Avatar name={profile.display_name} color={profile.avatar_key} url={profile.avatar_url} className="account-avatar" /><input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ''; if (file) void changePhoto(file); }} /><div className="profile-photo-actions"><button type="button" className="secondary-button" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <LoaderCircle size={13} className="voice-spinner" /> : <Camera size={13} />}{uploading ? 'ХУУЛЖ БАЙНА…' : profile.avatar_url ? 'ЗУРАГ СОЛИХ' : 'ЗУРАГ ОРУУЛАХ'}</button>{profile.avatar_url && <button type="button" className="text-button" disabled={uploading} onClick={() => void changePhoto(null)} aria-label="Зураг устгах"><Trash2 size={13} /></button>}</div></div><div className="profile-identity"><div className="eyebrow left-eye">{profile.is_verified ? i18n.account.verifiedAccount : i18n.account.verificationRequired} <span className={profile.is_verified ? 'verified-led' : 'unverified-led'} /></div><h1>{profile.display_name}</h1><p>{i18n.account.memberSince} {formatDate(profile.created_at)} · {profile.registration_method === 'email' ? i18n.account.emailAccount : i18n.account.phoneAccount}</p></div></div>
      {loadError && <div className="account-inline-error">{loadError}</div>}
      {message && <div className="account-inline-success"><Check size={13} /> {message}</div>}
      <div className="profile-data-grid"><Stat value={profile.total_matches} label={i18n.account.matches} /><Stat value={profile.wins} label={i18n.account.wins} /><Stat value={profile.losses} label={i18n.account.losses} /><Stat value={`${profile.win_rate.toFixed(1)}%`} label={i18n.account.winRate} /><Stat value={profile.current_win_streak} label={i18n.account.currentStreak} /><Stat value={profile.best_win_streak} label={i18n.account.bestStreak} /><Stat value={`ТҮВШИН ${profile.player_level}`} label={i18n.account.level} /><Stat value={profile.is_verified ? i18n.account.verified : i18n.account.unverified} label={i18n.account.accountStatus} />
      </div>
      {editing ? <form className="profile-edit-form" onSubmit={saveProfile}><label className="auth-field"><span>{i18n.account.displayNameLabel}</span><input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={24} /></label><fieldset className="avatar-picker"><legend>{i18n.account.chooseAvatar}</legend><div>{avatarOptions.map((option) => <button type="button" key={option.key} aria-label={option.label} title={option.label} aria-pressed={avatar === option.key} className={`avatar-choice avatar avatar-${option.key} ${avatar === option.key ? 'chosen' : ''}`} onClick={() => setAvatar(option.key)}><span>{initials(name || profile.display_name)}</span></button>)}</div></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<div className="account-actions"><button type="button" className="secondary-button" onClick={() => { setEditing(false); setError(''); }}>{i18n.account.cancel}</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'ХАДГАЛЖ БАЙНА…' : i18n.account.saveProfile} <Check size={14} /></button></div></form> : <div className="profile-footer"><span><Shield size={13} /> {i18n.account.profileNote}</span><button className="secondary-button" onClick={() => { setEditing(true); setMessage(''); }}>{i18n.account.editProfile} <ChevronRight size={14} /></button></div>}
    </div>}
  </div>;
}

function AccountTopBar({ title, subtitle, onBack, trailing }: { title: string; subtitle: string; onBack: () => void; trailing?: React.ReactNode }) {
  return <header className="top-bar account-top-bar"><button className="icon-button" onClick={onBack} aria-label="Буцах"><ArrowLeft size={17} /></button><div className="top-title"><span>{subtitle}</span><strong>{title}</strong></div><div className="account-top-trailing">{trailing}</div></header>;
}

function BackendSetupNotice() {
  return <div className="account-setup-notice"><div><LockKeyhole size={19} /></div><h2>{i18n.account.backendSetupRequired}</h2><p>{i18n.account.backendSetupMessage}</p></div>;
}

function AccountEmpty({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return <div className="account-empty"><div><LockKeyhole size={18} /></div><h2>{title}</h2><p>{detail}</p><button className="primary-button" onClick={onAction}>{action} <ChevronRight size={14} /></button></div>;
}

function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={`account-loading ${compact ? 'compact' : ''}`}><LoaderCircle size={17} />{label}</div>;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return <div className="account-stat"><b>{value}</b><span>{label}</span></div>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Тодорхойгүй огноо' : new Intl.DateTimeFormat('mn-MN', { month: 'short', year: 'numeric' }).format(date);
}

