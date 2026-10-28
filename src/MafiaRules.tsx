import { useState } from 'react';
import { Check, ScrollText, SlidersHorizontal } from 'lucide-react';
import {
  MIN_PLAYERS, OPTIONAL_ROLES, roleComposition, roleTeams, sanitizeMafiaSettings,
  type DiscussionLength, type GameMode, type MafiaSettings, type OptionalRole, type RoleName,
} from './gameEngine';
import { SHORT_ROLE_NAMES } from './gameData';

export const MODE_LABEL: Record<GameMode, string> = { classic: 'Сонгодог', hard: 'Хатуу', custom: 'Өөрийн' };
const MODE_HINT: Record<GameMode, string> = {
  classic: 'Ширээний хэмжээгээр дүр автоматаар хуваарилагдана. Шүүгдсэн хүний дүр нээгдэнэ.',
  hard: 'Шүүгдсэн хүний дүр нууц хэвээр, хэн хэнд санал өгсөн нь харагдахгүй.',
  custom: 'Нэмэлт дүр, дүрмээ өөрөө асааж унтраана.',
};
const DISCUSSION_LABEL: Record<DiscussionLength, string> = { short: 'Богино', normal: 'Хэвийн', long: 'Урт' };
const OPTIONAL_LABEL: Record<OptionalRole, string> = {
  don: 'Дон', bodyguard: 'Бие хамгаалагч', jester: 'Алиа', oldLady: 'Буутай эмээ', informants: 'Мэдээлэгчид',
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
    rules.revealOnConviction ? 'шүүгдсэн хүний дүр нээгдэнэ' : 'дүр нууц хэвээр',
    ...(rules.anonymousVotes ? ['нэргүй санал'] : []),
    `хэлэлцүүлэг ${DISCUSSION_LABEL[rules.discussion].toLowerCase()}`,
  ].join(' · ');
}

/** The lobby card: which roles this table will get, and (for the host) the button to change the rules. */
export function MafiaRulesCard({ settings, players, isHost, busy, ranked = false, onEdit }: { settings: unknown; players: number; isHost: boolean; busy: boolean; ranked?: boolean; onEdit: () => void }) {
  const rules = sanitizeMafiaSettings(settings);
  return <section className="lobby-rules" aria-label="Тоглоомын дүрэм">
    <header>
      <span><ScrollText size={13} /> ДҮРЭМ · <b>{ranked ? 'РЭЙТИНГ' : MODE_LABEL[rules.mode].toUpperCase()}</b></span>
      {isHost && <button type="button" className="lobby-rules-edit" disabled={busy} onClick={onEdit}><SlidersHorizontal size={13} /> ӨӨРЧЛӨХ</button>}
    </header>
    <RoleChips players={players} settings={rules} />
    <p>{Math.max(MIN_PLAYERS, players)} тоглогчтой · {rulesSummary(rules).split(' · ').slice(1).join(' · ')}</p>
  </section>;
}

/** Host-only editor: mode, optional roles, reveal, anonymous ballots and discussion length. */
export function MafiaRulesEditor({ initial, players, busy, ranked = false, onSave, onClose }: {
  initial: unknown; players: number; busy: boolean; ranked?: boolean; onSave: (settings: MafiaSettings) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => sanitizeMafiaSettings(initial));
  const change = (patch: Partial<MafiaSettings>) => setDraft((current) => sanitizeMafiaSettings({ ...current, ...patch }));
  const toggleRole = (role: OptionalRole) => change({ roles: { ...draft.roles, [role]: !draft.roles[role] } });
  const custom = draft.mode === 'custom';
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={(event) => event.stopPropagation()}>
      <header className="rules-modal-head">
        <h2 id="rules-title">Тоглоомын дүрэм</h2>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>БОЛИХ</button><button type="button" className="primary-button" disabled={busy} onClick={() => onSave(draft)}><Check size={14} /> ХАДГАЛАХ</button></div>
      </header>
      <div className="rules-modes" role="radiogroup" aria-label="Горим">
        {ranked && <p className="rules-ranked-note">Рэйтинг тоглолт стандарт дүрмээр явагдана. Зөвхөн хэлэлцүүлгийн хугацааг өөрчилж болно.</p>}
        {(ranked ? ['classic'] as GameMode[] : ['classic', 'hard', 'custom'] as GameMode[]).map((mode) => <button type="button" role="radio" aria-checked={draft.mode === mode} key={mode}
          className={draft.mode === mode ? 'is-picked' : ''} onClick={() => change({ mode })}><b>{MODE_LABEL[mode]}</b><small>{MODE_HINT[mode]}</small></button>)}
      </div>
      <div className={`rules-switches ${custom ? '' : 'is-locked'}`}>
        {OPTIONAL_ROLES.map((role) => <button type="button" key={role} disabled={!custom} aria-pressed={draft.roles[role]}
          className={draft.roles[role] ? 'is-on' : ''} onClick={() => toggleRole(role)}>{draft.roles[role] && <Check size={12} />}{OPTIONAL_LABEL[role]}</button>)}
        <button type="button" disabled={!custom} aria-pressed={draft.revealOnConviction} className={draft.revealOnConviction ? 'is-on' : ''}
          onClick={() => change({ revealOnConviction: !draft.revealOnConviction })}>{draft.revealOnConviction && <Check size={12} />}Шүүгдсэн хүний дүр нээх</button>
        <button type="button" disabled={!custom} aria-pressed={draft.anonymousVotes} className={draft.anonymousVotes ? 'is-on' : ''}
          onClick={() => change({ anonymousVotes: !draft.anonymousVotes })}>{draft.anonymousVotes && <Check size={12} />}Нэргүй санал</button>
      </div>
      <div className="rules-row"><span>Хэлэлцүүлэг</span>
        {(['short', 'normal', 'long'] as DiscussionLength[]).map((length) => <button type="button" key={length} className={draft.discussion === length ? 'is-picked' : ''}
          onClick={() => change({ discussion: length })}>{DISCUSSION_LABEL[length]}</button>)}
      </div>
      <div className="rules-preview"><span>{Math.max(MIN_PLAYERS, players)} тоглогчтой бол:</span><RoleChips players={players} settings={draft} /></div>
    </section>
  </div>;
}
