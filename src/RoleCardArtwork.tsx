import { useState } from 'react';
import type { Role } from './gameData';

export default function RoleCardArtwork({ role, compact = false }: { role: Role; compact?: boolean }) {
  const [imageMissing, setImageMissing] = useState(false);
  const RoleIcon = role.icon;

  return <div className={`role-card-artwork ${role.id === 'citizen' ? 'is-citizen' : ''} ${compact ? 'is-compact' : ''}`}>
    {imageMissing ? <div className="role-card-image-fallback"><RoleIcon size={28} /><span>{role.displayName}</span><small>Зураг олдсонгүй</small></div> : <img src={role.cardImage} alt={`${role.displayName} дүрийн карт`} onError={() => setImageMissing(true)} />}
  </div>;
}