import { useState, type ReactNode } from 'react';
import { t } from './lang';
import { Music, Volume1, Volume2, VolumeX, Minus, Plus } from 'lucide-react';
import { getMusicVolume, getSfxVolume, playSfx, setMusicVolume, setSfxVolume } from './sfx';

/** One volume line: tap the speaker to mute/unmute, drag the slider, or step with − and +. */
function VolumeRow({ icon, title, detail, value, onChange, onCommit }: {
  icon: ReactNode; title: string; detail: string; value: number; onChange: (value: number) => void; onCommit?: () => void;
}) {
  const [before, setBefore] = useState(value || 80);
  const mute = () => { if (value > 0) { setBefore(value); onChange(0); } else onChange(before || 80); onCommit?.(); };
  const step = (delta: number) => { onChange(Math.max(0, Math.min(100, Math.round((value + delta) / 10) * 10))); onCommit?.(); };
  const Speaker = value === 0 ? VolumeX : value < 50 ? Volume1 : Volume2;
  return <div className={`setting-row volume-row ${value === 0 ? 'is-muted' : ''}`}>
    <button type="button" className="setting-icon volume-mute" onClick={mute} aria-label={value === 0 ? `${title}: ${t('дуу асаах', 'unmute')}` : `${title}: ${t('дуугүй болгох', 'mute')}`}>{value === 0 ? <VolumeX size={17} /> : icon}</button>
    <span className="setting-copy"><b>{title}</b><small>{detail}</small></span>
    <span className="volume-control">
      <button type="button" className="volume-step" onClick={() => step(-10)} disabled={value === 0} aria-label={`${title}: ${t('багасгах', 'lower')}`}><Minus size={13} /></button>
      <span className="volume-track">
        <Speaker size={14} aria-hidden="true" />
        <input type="range" min={0} max={100} step={1} value={value} style={{ ['--level' as string]: `${value}%` }}
          onChange={(event) => onChange(Number(event.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} aria-label={`${title}: ${t('түвшин', 'level')}`} />
      </span>
      <button type="button" className="volume-step" onClick={() => step(10)} disabled={value === 100} aria-label={`${title}: ${t('нэмэх', 'raise')}`}><Plus size={13} /></button>
      <output className="volume-value">{value}%</output>
    </span>
  </div>;
}

/** Sound effects and background music, each with its own level. Used in Settings and in-game settings. */
export function VolumeControls() {
  const [effects, setEffects] = useState(getSfxVolume());
  const [music, setMusic] = useState(getMusicVolume());
  return <>
    <VolumeRow icon={<Volume2 size={17} />} title={t('Дууны эффект', 'Sound effects')} detail={t('Шоо, санал, шөнө, өглөөний эффект', 'Dice, votes, night and morning sounds')} value={effects}
      onChange={(value) => { setEffects(value); setSfxVolume(value); }} onCommit={() => playSfx('click')} />
    <VolumeRow icon={<Music size={17} />} title={t('Дэвсгэр хөгжим', 'Background music')} detail={t('Цэс болон тоглоом дундах аялгуу', 'Music in the menus and during games')} value={music}
      onChange={(value) => { setMusic(value); setMusicVolume(value); }} />
  </>;
}
