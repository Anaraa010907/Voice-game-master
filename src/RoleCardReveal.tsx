import { useEffect, useState } from 'react';
import { LockKeyhole, X } from 'lucide-react';
import RoleCardArtwork, { RoleCardBack } from './RoleCardArtwork';
import type { Role } from './gameData';
import { translateTeam } from './i18n';
import { playSfx } from './sfx';

/**
 * Game-start reveal: the screen flashes like lightning, a face-down card drops in and flips to show
 * this player's role. Tap anywhere (or wait) to continue to the role screen.
 */
export function RoleRevealIntro({ role, onDone }: { role: Role; onDone: () => void }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    playSfx('night');
    const flip = window.setTimeout(() => playSfx('reveal'), 1150);
    const tapReady = window.setTimeout(() => setReady(true), 2200);
    const auto = window.setTimeout(onDone, 7000);
    return () => { window.clearTimeout(flip); window.clearTimeout(tapReady); window.clearTimeout(auto); };
  }, [onDone]);

  return <div className={`role-intro team-${role.team}`} role="dialog" aria-modal="true" aria-label={`Таны дүр: ${role.displayName}`} onClick={() => ready && onDone()}>
    <div className="role-intro-flash" aria-hidden="true" />
    <div className="role-intro-glow" aria-hidden="true" />
    <p className="role-intro-kicker">ТАНЫ ДҮР</p>
    <div className="role-intro-card">
      <div className="role-intro-face role-intro-back" aria-hidden="true"><RoleCardBack /></div>
      <div className="role-intro-face role-intro-front"><RoleCardArtwork role={role} /></div>
    </div>
    <div className="role-intro-copy">
      <h2>{role.displayName} <small>· {translateTeam(role.team)}</small></h2>
      <p><LockKeyhole size={12} /> Дүрээ бусдад бүү хэлээрэй.</p>
    </div>
    <span className={`role-intro-hint ${ready ? 'is-ready' : ''}`}>Дэлгэц дээр дарж үргэлжлүүлнэ үү</span>
  </div>;
}

/** The player's own card, always in a corner during play. Tap to see it large. */
export function MyRoleCard({ role, dead, onOpen }: { role: Role; dead: boolean; onOpen: () => void }) {
  return <button type="button" className={`my-role-card team-${role.team} ${dead ? 'is-dead' : ''}`} onClick={onOpen} aria-label={`Миний дүр: ${role.displayName}. Томоор харах`}>
    <RoleCardArtwork role={role} compact />
    <span className="my-role-label">ТАНЫ ДҮР</span>
  </button>;
}

export function RoleCardViewer({ role, onClose }: { role: Role; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="card-viewer my-role-viewer" role="dialog" aria-modal="true" aria-label={role.displayName} onClick={onClose}>
    <div className={`card-viewer-card team-${role.team}`} onClick={(event) => event.stopPropagation()}><RoleCardArtwork role={role} /></div>
    <p className="my-role-viewer-ability" onClick={(event) => event.stopPropagation()}><b>{role.displayName}</b>{role.ability}</p>
    <button type="button" className="card-viewer-close" aria-label="Хаах" onClick={onClose}><X size={20} /></button>
  </div>;
}
