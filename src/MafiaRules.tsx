import { useState } from 'react';
import { Check, ScrollText, SlidersHorizontal } from 'lucide-react';
import {
  MIN_PLAYERS, OPTIONAL_ROLES, roleComposition, roleTeams, sanitizeMafiaSettings,
  type DiscussionLength, type GameMode, type MafiaSettings, type OptionalRole, type RoleName,
} from './gameEngine';
import { SHORT_ROLE_NAMES } from './gameData';
import { i18n } from './i18n';
import { ScrollCue } from './ScrollCue';

import { t } from './lang';
export const MODE_LABEL: Record<GameMode, string> = { classic: t('Сонгодог', 'Classic'), hard: t('Хатуу', 'Strict'), custom: t('Өөрийн', 'Custom') };
const MODE_HINT: Record<GameMode, string> = {
  classic: t('Ширээний хэмжээгээр дүр автоматаар хуваарилагдана. Шүүгдсэн хүний дүр нээгдэнэ.', 'Roles are dealt automatically for the table size. A convicted player’s role is revealed.'),
  hard: t('Шүүгдсэн хүний дүр нууц хэвээр, хэн хэнд санал өгсөн нь харагдахгүй.', 'A convicted player’s role stays secret, and no one sees who voted for whom.'),
  custom: t('Нэмэлт дүр, дүрмээ өөрөө асааж унтраана.', 'Turn extra roles and rules on or off yourself.'),
};
const DISCUSSION_LABEL: Record<DiscussionLength, string> = { short: t('Богино', 'Short'), normal: t('Хэвийн', 'Normal'), long: t('Урт', 'Long') };
const OPTIONAL_LABEL: Record<OptionalRole, string> = {
  don: t('Дон', 'Don'), bodyguard: t('Бие хамгаалагч', 'Bodyguard'), jester: t('Алиа', 'Jester'), oldLady: t('Буутай эмээ', 'Shotgun Granny'), informants: t('Мэдээлэгчид', 'Informants'),
};

/** "Мафи ×2 · Эмч · Цагдаа …" for a table of this size under these rules. */
function RoleChips({ players, settings }: { players: number; settings: MafiaSettings }) {
  const counts = new Map<RoleName, number>();
  for (const role of roleComposition(Math.max(MIN_PLAYERS, players), settings)) counts.set(role, (counts.get(role) ?? 0) + 1);
  return <div className="rules-roles">{[...counts].map(([role, count]) => <span key={role} className={`team-${roleTeams[role]}`}>{SHORT_ROLE_NAMES[role]}{count > 1 ? ` ×${count}` : ''}</span>)}</div>;
}

/** One line describing the rules, for the lobby and the in-game settings. */
export function rulesSummary(raw: unknown) {
  const rules = sanitizeMafiaSettings(raw);
  return [
    MODE_LABEL[rules.mode],
    rules.revealOnConviction ? t('шүүгдсэн хүний дүр нээгдэнэ', 'convicted role revealed') : t('дүр нууц хэвээр', 'roles stay secret'),
    ...(rules.anonymousVotes ? [t('нэргүй санал', 'anonymous votes')] : []),
    t(`хэлэлцүүлэг ${DISCUSSION_LABEL[rules.discussion].toLowerCase()}`, `discussion ${DISCUSSION_LABEL[rules.discussion].toLowerCase()}`),
  ].join(' · ');
}

/** The lobby card: which roles this table will get, and (for the host) the button to change the rules. */
export function MafiaRulesCard({ settings, players, isHost, busy, onEdit }: { settings: unknown; players: number; isHost: boolean; busy: boolean; onEdit: () => void }) {
  const rules = sanitizeMafiaSettings(settings);
  return <section className="lobby-rules mafia-rules" aria-label={t('Тоглоомын дүрэм', 'Game rules')}>
    <header>
      <span><ScrollText size={13} />{t(` ДҮРЭМ · `, ` RULES · `)}<b>{MODE_LABEL[rules.mode].toUpperCase()}</b></span>
      {isHost && <button type="button" className="lobby-rules-edit" disabled={busy} onClick={onEdit}><SlidersHorizontal size={13} />{t(` ӨӨРЧЛӨХ`, ` CHANGE`)}</button>}
    </header>
    {/* The header (with CHANGE) stays put; on a short screen the roles and the rules line scroll, with a cue. */}
    <ScrollCue className="lobby-rules-body" label={i18n.app.moreRules}>
      <RoleChips players={players} settings={rules} />
      <p>{t(`${Math.max(MIN_PLAYERS, players)} тоглогчтой · ${rulesSummary(rules).split(' · ').slice(1).join(' · ')}`, `${Math.max(MIN_PLAYERS, players)} players · ${rulesSummary(rules).split(' · ').slice(1).join(' · ')}`)}</p>
    </ScrollCue>
  </section>;
}

/** Host-only editor: mode, optional roles, reveal, anonymous ballots and discussion length. */
export function MafiaRulesEditor({ initial, players, busy, onSave, onClose }: {
  initial: unknown; players: number; busy: boolean; onSave: (settings: MafiaSettings) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => sanitizeMafiaSettings(initial));
  const change = (patch: Partial<MafiaSettings>) => setDraft((current) => sanitizeMafiaSettings({ ...current, ...patch }));
  const toggleRole = (role: OptionalRole) => change({ roles: { ...draft.roles, [role]: !draft.roles[role] } });
  const custom = draft.mode === 'custom';
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={(event) => event.stopPropagation()}>
      <header className="rules-modal-head">
        <h2 id="rules-title">{t(`Тоглоомын дүрэм`, `Game rules`)}</h2>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t(`БОЛИХ`, `CANCEL`)}</button><button type="button" className="primary-button" disabled={busy} onClick={() => onSave(draft)}><Check size={14} />{t(` ХАДГАЛАХ`, ` SAVE`)}</button></div>
      </header>
      <div className="rules-modes" role="radiogroup" aria-label={t('Горим', 'Mode')}>
        {(['classic', 'hard', 'custom'] as GameMode[]).map((mode) => <button type="button" role="radio" aria-checked={draft.mode === mode} key={mode}
          className={draft.mode === mode ? 'is-picked' : ''} onClick={() => change({ mode })}><b>{MODE_LABEL[mode]}</b><small>{MODE_HINT[mode]}</small></button>)}
      </div>
      <div className={`rules-switches ${custom ? '' : 'is-locked'}`}>
        {OPTIONAL_ROLES.map((role) => <button type="button" key={role} disabled={!custom} aria-pressed={draft.roles[role]}
          className={draft.roles[role] ? 'is-on' : ''} onClick={() => toggleRole(role)}>{draft.roles[role] && <Check size={12} />}{OPTIONAL_LABEL[role]}</button>)}
        <button type="button" disabled={!custom} aria-pressed={draft.revealOnConviction} className={draft.revealOnConviction ? 'is-on' : ''}
          onClick={() => change({ revealOnConviction: !draft.revealOnConviction })}>{draft.revealOnConviction && <Check size={12} />}{t(`Шүүгдсэн хүний дүр нээх`, `Reveal the convicted player’s role`)}</button>
        <button type="button" disabled={!custom} aria-pressed={draft.anonymousVotes} className={draft.anonymousVotes ? 'is-on' : ''}
          onClick={() => change({ anonymousVotes: !draft.anonymousVotes })}>{draft.anonymousVotes && <Check size={12} />}{t(`Нэргүй санал`, `Anonymous votes`)}</button>
      </div>
      <div className="rules-row"><span>{t(`Хэлэлцүүлэг`, `Discussion`)}</span>
        {(['short', 'normal', 'long'] as DiscussionLength[]).map((length) => <button type="button" key={length} className={draft.discussion === length ? 'is-picked' : ''}
          onClick={() => change({ discussion: length })}>{DISCUSSION_LABEL[length]}</button>)}
      </div>
      <div className="rules-preview"><span>{t(`${Math.max(MIN_PLAYERS, players)} тоглогчтой бол:`, `With ${Math.max(MIN_PLAYERS, players)} players:`)}</span><RoleChips players={players} settings={draft} /></div>
    </section>
  </div>;
}
