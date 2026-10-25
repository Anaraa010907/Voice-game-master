/*
 * "Reduce motion" setting. Stored per phone; while on, the root carries data-reduce-motion and
 * theme.css stops animations, transitions and the lightning flash of the role reveal.
 * Follows the phone's own accessibility setting until the player chooses.
 */
const KEY = 'night-table:reduce-motion';

export function motionReduced(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null) return saved === 'on';
  } catch { /* storage may be unavailable */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function applyMotionSetting(reduced = motionReduced()) {
  document.documentElement.toggleAttribute('data-reduce-motion', reduced);
}

export function setMotionReduced(reduced: boolean) {
  try { localStorage.setItem(KEY, reduced ? 'on' : 'off'); } catch { /* storage may be unavailable */ }
  applyMotionSetting(reduced);
}
