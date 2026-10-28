import { useCallback, useEffect, useState } from 'react';
import { Hand, LockKeyhole, X } from 'lucide-react';
import RoleCardArtwork, { CARD_FRAME } from './RoleCardArtwork';
import FlipCard from './FlipCard';
import type { Role } from './gameData';
import { translateTeam } from './i18n';
import { playSfx } from './sfx';

/** The shared card back, framed like every role card. */
export function CardBack({ compact = false }: { compact?: boolean }) {
  return <div className={`role-card-artwork card-back-art ${compact ? 'is-compact' : ''}`}>
    <img className="role-card-art" src="/assets/cards/card-back.jpg" alt="" draggable={false} />
    <img className="role-card-frame" src={CARD_FRAME} alt="" aria-hidden="true" draggable={false} />
  </div>;
}

function FlipHint({ shown, text = 'Картаа гараараа эргүүлж дүрээ хараарай' }: { shown: boolean; text?: string }) {
  return <span className={`flip-hint ${shown ? '' : 'is-hidden'}`} aria-hidden={!shown}><Hand size={14} /> {text}</span>;
}

/**
 * Game-start reveal: lightning, then a face-down card drops in. The player turns it over by hand
 * (drag sideways or tap) to see their role, then taps anywhere to continue.
 */
export function RoleRevealIntro({ role, onDone }: { role: Role; onDone: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { playSfx('night'); }, []);
  useEffect(() => {
    if (!revealed) return;
    const tapReady = window.setTimeout(() => setReady(true), 900);
    const auto = window.setTimeout(onDone, 9000);
    return () => { window.clearTimeout(tapReady); window.clearTimeout(auto); };
  }, [revealed, onDone]);

  const reveal = useCallback(() => { playSfx('reveal'); setRevealed(true); }, []);

  return <div className={`role-intro team-${role.team} ${revealed ? 'is-revealed' : ''}`} role="dialog" aria-modal="true" aria-label="Таны дүр" onClick={() => ready && onDone()}>
    <div className="role-intro-flash" aria-hidden="true" />
    <div className="role-intro-glow" aria-hidden="true" />
    <p className="role-intro-kicker">ТАНЫ ДҮР</p>
    <div className="role-intro-card">
      <FlipCard back={<CardBack />} front={<RoleCardArtwork role={role} />} autoRevealMs={25000} onReveal={reveal} />
    </div>
    <div className="role-intro-copy">
      {revealed
        ? <><h2>{role.displayName} <small>· {translateTeam(role.team)}</small></h2><p><LockKeyhole size={12} /> Дүрээ бусдад бүү хэлээрэй.</p></>
        : <FlipHint shown />}
    </div>
    <span className={`role-intro-hint ${ready ? 'is-ready' : ''}`}>Дэлгэц дээр дарж үргэлжлүүлнэ үү</span>
  </div>;
}

/** The player's own card, face down in a corner during play. Tap to pick it up and turn it over. */
export function MyRoleCard({ role, dead, onOpen }: { role: Role; dead: boolean; onOpen: () => void }) {
  return <button type="button" className={`my-role-card team-${role.team} ${dead ? 'is-dead' : ''}`} onClick={onOpen} aria-label="Миний дүр. Картаа эргүүлж харах">
    <CardBack compact />
    <span className="my-role-label">ЭРГҮҮЛЖ ХАРАХ</span>
  </button>;
}

export function RoleCardViewer({ role, onClose }: { role: Role; onClose: () => void }) {
  const [faceUp, setFaceUp] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="card-viewer my-role-viewer" role="dialog" aria-modal="true" aria-label="Таны дүр" onClick={onClose}>
    <div className={`card-viewer-card team-${role.team}`} onClick={(event) => event.stopPropagation()}>
      <FlipCard back={<CardBack />} front={<RoleCardArtwork role={role} />} onTurn={setFaceUp} />
    </div>
    {faceUp
      ? <p className="my-role-viewer-ability" onClick={(event) => event.stopPropagation()}><b>{role.displayName}</b>{role.ability}</p>
      : <FlipHint shown text="Картаа гараараа эргүүлнэ үү. Хажуу тийш нь чирэх эсвэл дарна." />}
    <button type="button" className="card-viewer-close" aria-label="Хаах" onClick={onClose}><X size={20} /></button>
  </div>;
}
