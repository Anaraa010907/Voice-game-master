import { useState } from 'react';
import { BookOpen, Check, ScrollText, SlidersHorizontal } from 'lucide-react';
import {
  ROUND_CHOICES, STARTING_CASH_CHOICES, sanitizeMonopolySettings, type MonopolyRules, type MonopolySettings,
} from './monopolyEngine';

export const roundsLabel = (rounds: number | null) => rounds === null ? 'Дампууртал' : `${rounds} тойрог`;
export const ROUND_OPTIONS: Array<number | null> = [null, ...ROUND_CHOICES];

const money = (value: number) => `${value.toLocaleString('en-US')}₮`;

type Flag = Exclude<keyof MonopolyRules, 'startingCash'>;
/** The switchable rules, as Richup lists them. */
const FLAGS: Array<{ key: Flag; label: string; chip: string; hint: string }> = [
  { key: 'doubleRent', label: 'Бүлгээрээ 2 дахин түрээс', chip: 'x2 түрээс', hint: 'Нэг өнгийн бүх газрыг эзэмшвэл гэргүй газрын түрээс 2 дахин өснө.' },
  { key: 'vacationCash', label: 'Наадмын сан', chip: 'Наадмын сан', hint: 'Татвар, торгууль санд хуримтлагдаж, Наадмын амралт дээр буусан хүн авна.' },
  { key: 'auction', label: 'Дуудлага худалдаа', chip: 'Дуудлага худалдаа', hint: 'Хүн авахгүй газар дуудлага худалдаанд гарна.' },
  { key: 'prisonNoRent', label: 'Шоронд түрээс авахгүй', chip: 'Шоронд түрээсгүй', hint: 'Шоронд байгаа тоглогч газрынхаа түрээсийг авахгүй.' },
  { key: 'mortgage', label: 'Барьцаа', chip: 'Барьцаа', hint: 'Газраа үнийн талаар барьцаалж мөнгө олно.' },
  { key: 'evenBuild', label: 'Тэгш барих', chip: 'Тэгш барих', hint: 'Бүлгийн газар бүрт гэрийг нэг нэгээр тэгш барина.' },
];

/** Lobby card for the board game: the room's rules at a glance, the guide, and (for the host) the editor. */
export function BoardRulesCard({ settings, isHost, busy, ranked = false, onEdit, onGuide }: {
  settings: unknown; isHost: boolean; busy: boolean; ranked?: boolean; onEdit: () => void; onGuide: () => void;
}) {
  const rules = sanitizeMonopolySettings(ranked ? { ...(settings && typeof settings === 'object' ? settings : {}), rounds: null } : settings);
  return <section className="lobby-rules board-rules" aria-label="Тоглоомын дүрэм">
    <header>
      <span><ScrollText size={13} /> <b>{ranked ? 'РЭЙТИНГ · ДАМПУУРТАЛ' : roundsLabel(rules.rounds).toUpperCase()}</b></span>
      <span className="board-rules-buttons">
        <button type="button" className="lobby-rules-edit is-guide" onClick={onGuide}><BookOpen size={13} /> ЗААВАР</button>
        {isHost && <button type="button" className="lobby-rules-edit is-icon" disabled={busy} onClick={onEdit} aria-label="Дүрэм өөрчлөх" title="Дүрэм өөрчлөх"><SlidersHorizontal size={13} /></button>}
      </span>
    </header>
    <div className="rules-roles">
      <span className="is-cash">{money(rules.startingCash)}</span>
      {FLAGS.filter((flag) => rules[flag.key]).map((flag) => <span key={flag.key}>{flag.chip}</span>)}
    </div>
  </section>;
}

/** Host-only editor: starting cash, length and the switchable rules. */
export function BoardRulesEditor({ initial, busy, onSave, onClose }: {
  initial: unknown; busy: boolean; onSave: (settings: MonopolySettings) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => sanitizeMonopolySettings(initial));
  const change = (patch: Partial<MonopolySettings>) => setDraft((current) => sanitizeMonopolySettings({ ...current, ...patch }));
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal rules-modal board-rules-modal" role="dialog" aria-modal="true" aria-labelledby="board-rules-title" onClick={(event) => event.stopPropagation()}>
      <header className="rules-modal-head">
        <h2 id="board-rules-title">Тоглоомын дүрэм</h2>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>БОЛИХ</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => onSave(draft)}><Check size={14} /> ХАДГАЛАХ</button>
        </div>
      </header>
      <div className="rules-row"><span>Эхлэх мөнгө</span>
        {STARTING_CASH_CHOICES.map((cash) => <button type="button" key={cash} className={draft.startingCash === cash ? 'is-picked' : ''} onClick={() => change({ startingCash: cash })}>{money(cash)}</button>)}
      </div>
      <div className="rules-row"><span>Хугацаа</span>
        {ROUND_OPTIONS.map((rounds) => <button type="button" key={String(rounds)} className={draft.rounds === rounds ? 'is-picked' : ''} onClick={() => change({ rounds })}>{rounds === null ? 'Дампууртал' : `${rounds} тойрог`}</button>)}
      </div>
      <div className="board-rule-switches">
        {FLAGS.map((flag) => <button type="button" role="switch" aria-checked={draft[flag.key]} key={flag.key} className={draft[flag.key] ? 'is-on' : ''}
          onClick={() => change({ [flag.key]: !draft[flag.key] } as Partial<MonopolySettings>)}>
          <span><b>{flag.label}</b><small>{flag.hint}</small></span>
          <i className={`toggle ${draft[flag.key] ? 'toggle-on' : ''}`}><i /></i>
        </button>)}
      </div>
    </section>
  </div>;
}
