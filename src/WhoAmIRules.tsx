import { useState } from 'react';
import { Check, ScrollText, SlidersHorizontal } from 'lucide-react';
import { i18n } from './i18n';
import { ScrollCue } from './ScrollCue';
import { isEnglish } from './lang';
import { WHO_AM_I_PACK } from './whoAmIContent';
import { WHOAMI_ROUND_CHOICES, sanitizeWhoAmISettings, type WhoAmISettings } from './whoAmIEngine';

const w = () => i18n.whoAmI;
const categoryName = (id: string) => {
  const category = WHO_AM_I_PACK.find((entry) => entry.id === id);
  return category ? (isEnglish ? category.nameEn : category.name) : id;
};

/** "5 тойрог · Амьтан, Хоол" for the lobby card. */
export function whoAmIRulesSummary(raw: unknown) {
  const rules = sanitizeWhoAmISettings(raw, WHO_AM_I_PACK);
  const categories = rules.categories.length ? rules.categories.map(categoryName).join(', ') : w().allCategories;
  return [w().roundsCount(rules.rounds), categories, ...(rules.kidsSafe ? [w().kidsSafe] : [])].join(' · ');
}

/** The lobby card: rounds, categories and scoring, plus (for the host) the button to change them. */
export function WhoAmIRulesCard({ settings, isHost, busy, onEdit }: { settings: unknown; isHost: boolean; busy: boolean; onEdit: () => void }) {
  const rules = sanitizeWhoAmISettings(settings, WHO_AM_I_PACK);
  return <section className="lobby-rules whoami-rules" aria-label={w().rulesTitle}>
    <header>
      <span><ScrollText size={13} /> {w().title.toUpperCase()} · <b>{w().roundsCount(rules.rounds).toUpperCase()}</b></span>
      {isHost && <button type="button" className="lobby-rules-edit" disabled={busy} onClick={onEdit}><SlidersHorizontal size={13} /> {w().edit}</button>}
    </header>
    <ScrollCue className="whoami-rules-body" label={w().moreRules}>
      {/* Every category (the default) is one chip, so the card stays short; a picked set lists its names. */}
      <div className="rules-roles">{rules.categories.length
        ? rules.categories.map((id) => <span key={id} className="team-town">{categoryName(id)}</span>)
        : <span className="team-town">{w().allCategoriesCount(WHO_AM_I_PACK.filter((entry) => !rules.kidsSafe || entry.kidsSafe).length)}</span>}
        {rules.kidsSafe && <span className="team-town">{w().kidsSafe}</span>}</div>
      <p>{w().rulesLine}</p>{' '}
      <p className="whoami-rules-scoring">{w().scoringLine}</p>
    </ScrollCue>
  </section>;
}

/** Host-only editor: rounds (3 / 5 / 8), categories (none picked = all) and kid-friendly content. */
export function WhoAmIRulesEditor({ initial, busy, onSave, onClose }: { initial: unknown; busy: boolean; onSave: (settings: WhoAmISettings) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => sanitizeWhoAmISettings(initial, WHO_AM_I_PACK));
  const change = (patch: Partial<WhoAmISettings>) => setDraft((current) => sanitizeWhoAmISettings({ ...current, ...patch }, WHO_AM_I_PACK));
  const toggle = (id: string) => change({ categories: draft.categories.includes(id) ? draft.categories.filter((entry) => entry !== id) : [...draft.categories, id] });
  return <div className="game-modal-backdrop" onClick={onClose}>
    <section className="game-modal rules-modal" role="dialog" aria-modal="true" aria-labelledby="whoami-rules-title" onClick={(event) => event.stopPropagation()}>
      <header className="rules-modal-head">
        <h2 id="whoami-rules-title">{w().rulesTitle}</h2>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{w().cancel}</button><button type="button" className="primary-button" disabled={busy} onClick={() => onSave(draft)}><Check size={14} /> {w().save}</button></div>
      </header>
      <div className="rules-row"><span>{w().rounds}</span>
        {WHOAMI_ROUND_CHOICES.map((rounds) => <button type="button" key={rounds} className={draft.rounds === rounds ? 'is-picked' : ''} onClick={() => change({ rounds })}>{rounds}</button>)}
      </div>
      <div className="rules-switches">
        <button type="button" aria-pressed={draft.categories.length === 0} className={draft.categories.length === 0 ? 'is-on' : ''} onClick={() => change({ categories: [] })}>{draft.categories.length === 0 && <Check size={12} />}{w().allCategories}</button>
        {WHO_AM_I_PACK.map((category) => {
          const on = draft.categories.includes(category.id);
          const locked = draft.kidsSafe && !category.kidsSafe;
          return <button type="button" key={category.id} disabled={locked} aria-pressed={on} className={on ? 'is-on' : ''} onClick={() => toggle(category.id)}>{on && <Check size={12} />}{categoryName(category.id)}</button>;
        })}
      </div>
      <div className="rules-switches">
        <button type="button" aria-pressed={draft.kidsSafe} className={draft.kidsSafe ? 'is-on' : ''} onClick={() => change({ kidsSafe: !draft.kidsSafe })}>{draft.kidsSafe && <Check size={12} />}{w().kidsSafe}</button>
      </div>
      <p className="whoami-rules-note">{w().rulesLine}<br />{w().scoringLine}</p>
    </section>
  </div>;
}
