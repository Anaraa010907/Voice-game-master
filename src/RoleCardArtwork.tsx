import type { Role } from './gameData';
import { LogoMark } from './Logo';

/**
 * A role card drawn in the app's own style: the role's emblem in glowing rings on the left,
 * team, name and ability on the right. Sized by its container (3:2), so it reads the same in
 * the corner of the table and full screen.
 */
const TEAM_LABEL: Record<Role['team'], string> = { mafia: 'Мафийн баг', town: 'Иргэдийн баг', wildcard: 'Тусгай дүр' };

export default function RoleCardArtwork({ role, compact = false }: { role: Role; compact?: boolean }) {
  const RoleIcon = role.icon;
  return <div className={`role-card-artwork ds-role-card team-${role.team} ${compact ? 'is-compact' : ''} ${role.portrait ? 'has-portrait' : ''}`} role="img" aria-label={`${role.displayName} — ${TEAM_LABEL[role.team]}`}>
    <span className="ds-role-pattern" aria-hidden="true" />
    {role.portrait
      ? <span className="ds-role-portrait" aria-hidden="true"><img src={role.portrait} alt="" decoding="async" /><i><RoleIcon strokeWidth={1.6} /></i></span>
      : <span className="ds-role-emblem" aria-hidden="true"><i /><i /><RoleIcon strokeWidth={1.4} /></span>}
    <span className="ds-role-copy">
      <span className="ds-role-team">{TEAM_LABEL[role.team]}</span>
      <b className="ds-role-name">{role.displayName}</b>
      <span className="ds-role-ability">{role.ability}</span>
    </span>
    <span className="ds-role-mark" aria-hidden="true"><LogoMark size={12} /> MAFIA: SHADOWS</span>
  </div>;
}

/** The face-down side: logo on a fine knot pattern. */
export function RoleCardBack() {
  return <div className="ds-role-back" aria-hidden="true">
    <span className="ds-role-pattern" />
    <span className="ds-role-back-logo"><LogoMark size={40} /></span>
    <b>MAFIA</b><i>SHADOWS</i>
  </div>;
}
