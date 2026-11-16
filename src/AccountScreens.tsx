import { useEffect, useState, type FormEvent } from 'react';
import { useRef } from 'react';
import { ArrowLeft, Camera, Check, ChevronRight, LoaderCircle, LockKeyhole, Shield, ShoppingBag, Trash2, UserRound, X } from 'lucide-react';
import { CoinCount, DiamondCount, TitleBadge, TopUpModal, useShopItems } from './Social';
import Avatar, { RowBorder, nameplate, rowBorderClass } from './Avatar';
import { backdrop } from './backdrops';
import { PORTRAITS } from './portraits';
import { supabaseConfigured, type PublicProfile } from './supabaseClient';
import { i18n } from './i18n';

import { formatJoinDate, t } from './lang';
export const avatarOptions = [
  { key: 'rose', label: t('Сарнай ягаан', 'Rose pink') },
  { key: 'violet', label: t('Нил ягаан', 'Violet') },
  { key: 'gold', label: t('Алтан шар', 'Golden yellow') },
  { key: 'teal', label: t('Цэнхэр ногоон', 'Teal') },
  { key: 'blue', label: t('Цэнхэр', 'Blue') },
  { key: 'plum', label: t('Чавганы ягаан', 'Plum') },
] as const;



export function ProfileScreen({ profile, loading, loadError, onBack, onSignIn, onSignOut, onSave, onPhoto, onPortrait, onShop }: {
  profile: PublicProfile | null; loading: boolean; loadError: string; onBack: () => void; onSignIn: () => void; onSignOut: () => void; onShop: () => void;
  onSave: (displayName: string, avatarKey: string) => Promise<string>;
  onPhoto: (file: File | null) => Promise<string>;
  onPortrait: (url: string) => Promise<string>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const shopItems = useShopItems();
  const [uploading, setUploading] = useState(false);
  const [portraitsOpen, setPortraitsOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const choosePortrait = async (url: string) => {
    setError('');
    setMessage('');
    setUploading(true);
    const result = await onPortrait(url);
    setUploading(false);
    if (result) setError(result);
    else { setMessage(t('Профайл зураг шинэчлэгдлээ.', 'Profile picture updated.')); setPortraitsOpen(false); }
  };
  const changePhoto = async (file: File | null) => {
    setError('');
    setMessage('');
    setUploading(true);
    const result = await onPhoto(file);
    setUploading(false);
    if (result) setError(result);
    else setMessage(file ? t('Профайл зураг шинэчлэгдлээ.', 'Profile picture updated.') : t('Профайл зураг устгагдлаа.', 'Profile picture removed.'));
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
      <section className={`profile-showcase showcase-plain ${backdrop(profile.backdrop_key).className}`} style={backdrop(profile.backdrop_key).style} aria-label={t('Аватар ба цол', 'Avatar and title')}>
        <span className="showcase-decor" aria-hidden="true"><i className="sc-backdrop" /></span>
        <Avatar name={profile.display_name} color={profile.avatar_key} url={profile.avatar_url} frame={profile.frame_key} className="account-avatar" />
        {profile.title_key && <TitleBadge titleKey={profile.title_key} items={shopItems} size="hero" />}
      </section>
      <div className="profile-main">
        <div className={`profile-identity-row ${nameplate(profile.nameplate_key).className} ${rowBorderClass(profile.border_key)}`} style={nameplate(profile.nameplate_key).style}><RowBorder borderKey={profile.border_key} /><div className="profile-identity"><div className="eyebrow left-eye">{profile.is_verified ? i18n.account.verifiedAccount : i18n.account.verificationRequired} <span className={profile.is_verified ? 'verified-led' : 'unverified-led'} /></div><h1>{profile.display_name}</h1><div className="profile-shop-row">{profile.player_no && <span className="chip profile-id">ID #{profile.player_no}</span>}<CoinCount value={profile.coins ?? null} /><DiamondCount value={profile.diamonds ?? 0} onTopUp={() => setTopUpOpen(true)} /><button type="button" className="text-button" onClick={onShop}><ShoppingBag size={13} />{t(` ДЭЛГҮҮР`, ` SHOP`)}</button></div><p>{i18n.account.memberSince} {formatDate(profile.created_at)} · {profile.registration_method === 'email' ? i18n.account.emailAccount : i18n.account.phoneAccount}</p></div></div>
        {loadError && <div className="account-inline-error">{loadError}</div>}
        {message && <div className="account-inline-success"><Check size={13} /> {message}</div>}
        <div className="profile-data-grid"><Stat value={profile.total_matches} label={i18n.account.matches} /><Stat value={profile.wins} label={i18n.account.wins} /><Stat value={profile.losses} label={i18n.account.losses} /><Stat value={`${profile.win_rate.toFixed(1)}%`} label={i18n.account.winRate} />
        </div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ''; if (file) void changePhoto(file); }} />
        {editing ? <form className="profile-edit-form" onSubmit={saveProfile}><label className="auth-field"><span>{i18n.account.displayNameLabel}</span><input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={24} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="account-actions"><button type="button" className="secondary-button" onClick={() => { setEditing(false); setError(''); }}>{i18n.account.cancel}</button><button type="submit" className="primary-button" disabled={saving}>{saving ? t('ХАДГАЛЖ БАЙНА…', 'SAVING…') : i18n.account.saveProfile} <Check size={14} /></button></div></form>
          : <div className="profile-footer">
            <div className="profile-photo-actions" role="group" aria-label={t('Профайл зураг', 'Profile picture')}>
              <button type="button" className="secondary-button" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <LoaderCircle size={13} className="voice-spinner" /> : <Camera size={13} />}{uploading ? t('ХУУЛЖ БАЙНА…', 'UPLOADING…') : t('ЗУРАГ ОРУУЛАХ', 'UPLOAD PHOTO')}</button>
              <button type="button" className="secondary-button" disabled={uploading} onClick={() => setPortraitsOpen(true)}><UserRound size={13} />{t(`ПОРТРЕТ`, `PORTRAIT`)}</button>
              {profile.avatar_url && <button type="button" className="text-button" disabled={uploading} onClick={() => void changePhoto(null)} aria-label={t('Зураг устгах', 'Remove photo')} title={t('Зураг устгах', 'Remove photo')}><Trash2 size={13} /></button>}
            </div>
            <button className="secondary-button" onClick={() => { setEditing(true); setMessage(''); }}>{i18n.account.editProfile} <ChevronRight size={14} /></button>
          </div>}
        <p className="profile-note"><Shield size={11} /> {i18n.account.profileNote}</p>
      </div>
    </div>}
    {topUpOpen && <TopUpModal onClose={() => setTopUpOpen(false)} />}
    {portraitsOpen && profile && <div className="game-modal-backdrop" onClick={() => setPortraitsOpen(false)}>
      <section className="game-modal portrait-picker" role="dialog" aria-modal="true" aria-labelledby="portrait-title" onClick={(event) => event.stopPropagation()}>
        <header><h2 id="portrait-title">{t(`Портрет сонгох`, `Choose a portrait`)}</h2><button type="button" className="icon-button" onClick={() => setPortraitsOpen(false)} aria-label={t('Хаах', 'Close')}><X size={15} /></button></header>
        <div className="portrait-grid">{PORTRAITS.map((portrait) => <button type="button" key={portrait.url} disabled={uploading} aria-pressed={profile.avatar_url === portrait.url}
          className={profile.avatar_url === portrait.url ? 'is-chosen' : ''} onClick={() => void choosePortrait(portrait.url)} title={portrait.label}>
          <span className="avatar has-photo" style={{ backgroundImage: `url("${portrait.url}")` }} role="img" aria-label={portrait.label} />
          <small>{portrait.label}</small>{profile.avatar_url === portrait.url && <i><Check size={12} /></i>}
        </button>)}</div>
        <p>{t(`Сонгосон зураг тань лобби, тоглоомын ширээн дээр бусдад харагдана. Өөрийн зургаа «ЗУРАГ ОРУУЛАХ» товчоор оруулж болно.`, `Others see your picture in the lobby and at the game table. Use “UPLOAD PHOTO” to add your own.`)}</p>
      </section>
    </div>}
  </div>;
}

function AccountTopBar({ title, subtitle, onBack, trailing }: { title: string; subtitle: string; onBack: () => void; trailing?: React.ReactNode }) {
  return <header className="top-bar account-top-bar"><button className="icon-button" onClick={onBack} aria-label={t('Буцах', 'Back')}><ArrowLeft size={17} /></button><div className="top-title"><span>{subtitle}</span><strong>{title}</strong></div><div className="account-top-trailing">{trailing}</div></header>;
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

const formatDate = (value: string) => formatJoinDate(value);

