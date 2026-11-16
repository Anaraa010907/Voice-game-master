import { useState, type CSSProperties } from 'react';
import { Search, Sparkles } from 'lucide-react';
import type { Role } from './gameData';
import { t } from './lang';

/** Gold frame laid over every role card; the art is clipped to sit inside it. */
export const CARD_FRAME = '/assets/cards/card-frame.webp';
/** The card's blank face; it also gives the card its 3:2 shape wherever it is shown. */
const CARD_BASE = '/assets/cards/card-base.webp';
const SKYLINE = '/assets/cards/skyline.svg';

const TEAM_LABEL: Record<Role['faction'], string> = {
  mafia: t('Мафийн баг', 'Mafia team'),
  citizens: t('Иргэдийн баг', 'Town team'),
  neutral: t('Бие даасан', 'Solo'),
};

/**
 * A role card: the role's picture on the left and its name, side and ability on the right. The text
 * is drawn by the app (not painted into the picture), so it follows the player's language and the
 * current rules.
 */
export default function RoleCardArtwork({ role, compact = false }: { role: Role; compact?: boolean }) {
  const [portraitMissing, setPortraitMissing] = useState(false);
  const RoleIcon = role.icon;
  const goal = role.name === 'Jester';

  return <div className={`role-card-artwork has-panel faction-${role.faction} ${role.id === 'citizen' ? 'is-citizen' : ''} ${compact ? 'is-compact' : ''}`}
    style={{ ['--skyline' as string]: `url("${SKYLINE}")` } as CSSProperties}>
    <img className="role-card-art" src={CARD_BASE} alt="" draggable={false} />
    <div className="role-card-portrait">
      {portraitMissing
        ? <span className="role-card-portrait-fallback"><RoleIcon /></span>
        : <img src={role.portrait} alt={t(`${role.displayName} дүрийн зураг`, `${role.displayName} card art`)} draggable={false} onError={() => setPortraitMissing(true)} />}
    </div>
    <div className="role-card-panel">
      <header>
        <span className="role-card-emblem"><RoleIcon /></span>
        <span className="role-card-title"><b>{role.displayName}</b><small>{TEAM_LABEL[role.faction]}</small></span>
      </header>
      <i className="role-card-rule" />
      <h3>{goal ? <Sparkles /> : <Search />}{goal ? t('Зорилго', 'Goal') : t('Тусгай чадвар', 'Special ability')}</h3>
      <p>{role.cardText}</p>
      <i className="role-card-skyline" />
    </div>
    <img className="role-card-frame" src={CARD_FRAME} alt="" aria-hidden="true" draggable={false} />
  </div>;
}
