import { useState } from 'react';
import type { Role } from './gameData';

/** Gold frame laid over every role card; the art is clipped to sit inside it. */
export const CARD_FRAME = '/assets/cards/card-frame.webp';

export default function RoleCardArtwork({ role, compact = false }: { role: Role; compact?: boolean }) {
  const [imageMissing, setImageMissing] = useState(false);
  const RoleIcon = role.icon;

  return <div className={`role-card-artwork ${role.id === 'citizen' ? 'is-citizen' : ''} ${compact ? 'is-compact' : ''}`}>
    {/* No art yet (a new role): the card back with the role's sign and name, so it still looks finished. */}
    {imageMissing
      ? <><img className="role-card-art" src="/assets/cards/card-back.jpg" alt="" /><div className="role-card-image-fallback"><RoleIcon size={compact ? 22 : 30} /><span>{role.displayName}</span></div></>
      : <img className="role-card-art" src={role.cardImage} alt={`${role.displayName} дүрийн карт`} onError={() => setImageMissing(true)} />}
    <img className="role-card-frame" src={CARD_FRAME} alt="" aria-hidden="true" draggable={false} />
  </div>;
}
