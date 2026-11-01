import { useState } from 'react';
import { BookOpen, Check, ScrollText, SlidersHorizontal } from 'lucide-react';
import {
  ROUND_CHOICES, STARTING_CASH_CHOICES, sanitizeMonopolySettings, type MonopolyRules, type MonopolySettings,
} from './monopolyEngine';

import { t } from './lang';
export const roundsLabel = (rounds: number | null) => rounds === null ? t('Дампууртал', 'To bankruptcy') : t(`${rounds} тойрог`, `${rounds} rounds`);
export const ROUND_OPTIONS: Array<number | null> = [null, ...ROUND_CHOICES];

const money = (value: number) => `${value.toLocaleString('en-US')}₮`;

type Flag = Exclude<keyof MonopolyRules, 'startingCash'>;
/** The switchable rules, as Richup lists them. */
const FLAGS: Array<{ key: Flag; label: string; chip: string; hint: string }> = [
  { key: 'doubleRent', label: t('Бүлгээрээ 2 дахин түрээс', 'Double rent for groups'), chip: t('x2 түрээс', 'x2 rent'), hint: t('Нэг өнгийн бүх газрыг эзэмшвэл гэргүй газрын түрээс 2 дахин өснө.', 'Own every property of one colour and its rent without gers doubles.') },
  { key: 'vacationCash', label: t('Наадмын сан', 'Naadam pot'), chip: t('Наадмын сан', 'Naadam pot'), hint: t('Татвар, торгууль санд хуримтлагдаж, Наадмын амралт дээр буусан хүн авна.', 'Taxes and fines collect in a pot; whoever lands on the Naadam holiday takes it.') },
  { key: 'auction', label: t('Дуудлага худалдаа', 'Auction'), chip: t('Дуудлага худалдаа', 'Auction'), hint: t('Хүн авахгүй газар дуудлага худалдаанд гарна.', 'Properties nobody buys go to auction.') },
  { key: 'prisonNoRent', label: t('Шоронд түрээс авахгүй', 'No rent in jail'), chip: t('Шоронд түрээсгүй', 'No rent in jail'), hint: t('Шоронд байгаа тоглогч газрынхаа түрээсийг авахгүй.', 'Players in jail collect no rent on their properties.') },
  { key: 'mortgage', label: t('Барьцаа', 'Mortgage'), chip: t('Барьцаа', 'Mortgage'), hint: t('Газраа үнийн талаар барьцаалж мөнгө олно.', 'Mortgage a property for half its price to raise money.') },
  { key: 'evenBuild', label: t('Тэгш барих', 'Even building'), chip: t('Тэгш барих', 'Even building'), hint: t('Бүлгийн газар бүрт гэрийг нэг нэгээр тэгш барина.', 'Build gers evenly, one at a time on each property in the group.') },
];

/** Lobby card for the board game: the room's rules at a glance, the guide, and (for the host) the editor. */
export function BoardRulesCard({ settings, isHost, busy, ranked = false, onEdit, onGuide }: {
  settings: unknown; isHost: boolean; busy: boolean; ranked?: boolean; onEdit: () => void; onGuide: () => void;
}) {
  const rules = sanitizeMonopolySettings(ranked ? { ...(settings && typeof settings === 'object' ? settings : {}), rounds: null } : settings);
  return <section className="lobby-rules board-rules" aria-label={t('Тоглоомын дүрэм', 'Game rules')}>
    <header>
      <span><ScrollText size={13} /> <b>{ranked ? t('РЭЙТИНГ · ДАМПУУРТАЛ', 'RANKED · TO BANKRUPTCY') : roundsLabel(rules.rounds).toUpperCase()}</b></span>
      <span className="board-rules-buttons">
        <button type="button" className="lobby-rules-edit is-guide" onClick={onGuide}><BookOpen size={13} />{t(` ЗААВАР`, ` GUIDE`)}</button>
        {isHost && <button type="button" className="lobby-rules-edit is-icon" disabled={busy} onClick={onEdit} aria-label={t('Дүрэм өөрчлөх', 'Change rules')} title={t('Дүрэм өөрчлөх', 'Change rules')}><SlidersHorizontal size={13} /></button>}
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
        <h2 id="board-rules-title">{t(`Тоглоомын дүрэм`, `Game rules`)}</h2>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{t(`БОЛИХ`, `CANCEL`)}</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => onSave(draft)}><Check size={14} />{t(` ХАДГАЛАХ`, ` SAVE`)}</button>
        </div>
      </header>
      <div className="rules-row"><span>{t(`Эхлэх мөнгө`, `Starting money`)}</span>
        {STARTING_CASH_CHOICES.map((cash) => <button type="button" key={cash} className={draft.startingCash === cash ? 'is-picked' : ''} onClick={() => change({ startingCash: cash })}>{money(cash)}</button>)}
      </div>
      <div className="rules-row"><span>{t(`Хугацаа`, `Length`)}</span>
        {ROUND_OPTIONS.map((rounds) => <button type="button" key={String(rounds)} className={draft.rounds === rounds ? 'is-picked' : ''} onClick={() => change({ rounds })}>{rounds === null ? t('Дампууртал', 'To bankruptcy') : t(`${rounds} тойрог`, `${rounds} rounds`)}</button>)}
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
