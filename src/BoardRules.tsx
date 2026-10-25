import { ScrollText } from 'lucide-react';
import { ROUND_CHOICES, sanitizeMonopolySettings, type MonopolySettings } from './monopolyEngine';

export const roundsLabel = (rounds: number | null) => rounds === null ? 'Дампууртал' : `${rounds} тойрог`;
export const ROUND_OPTIONS: Array<number | null> = [...ROUND_CHOICES, null];

/** Lobby card for the board game: how long the match lasts. The host changes it with one tap. */
export function BoardRulesCard({ settings, isHost, busy, onChange }: { settings: unknown; isHost: boolean; busy: boolean; onChange: (settings: MonopolySettings) => void }) {
  const rules = sanitizeMonopolySettings(settings);
  return <section className="lobby-rules board-rules" aria-label="Тоглоомын дүрэм">
    <header><span><ScrollText size={13} /> ДҮРЭМ · <b>{roundsLabel(rules.rounds).toUpperCase()}</b></span></header>
    {isHost && <div className="rules-rounds" role="radiogroup" aria-label="Тойргийн тоо">
      {ROUND_OPTIONS.map((rounds) => <button type="button" role="radio" aria-checked={rules.rounds === rounds} key={String(rounds)} disabled={busy}
        className={rules.rounds === rounds ? 'is-picked' : ''} onClick={() => onChange({ rounds })}>{rounds === null ? 'Дампууртал' : rounds}</button>)}
    </div>}
    <p>{rules.rounds === null
      ? 'Нэгээс бусад нь дампууртал тоглоно.'
      : `${rules.rounds} тойргийн дараа хамгийн их хөрөнгөтэй нь ялна.`}</p>
  </section>;
}
