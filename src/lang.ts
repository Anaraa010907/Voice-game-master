/*
 * The player's language: Mongolian (default) or English. It is read once at start-up; changing it
 * saves the choice and reloads the app, so every screen, memo and module-level table is rebuilt in
 * the new language without each one having to listen for the change.
 */
export type Lang = 'mn' | 'en';

const STORAGE_KEY = 'mafia-shadows:lang';

function storedLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'mn';
  } catch {
    return 'mn';
  }
}

export const LANG: Lang = storedLang();
export const isEnglish = LANG === 'en';

if (typeof document !== 'undefined') document.documentElement.lang = LANG;

/** Picks the text for the current language: t('Буцах', 'Back'). */
export const t = (mn: string, en: string) => (isEnglish ? en : mn);

export function setLang(next: Lang) {
  if (next === LANG) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode: the choice lasts until the reload only.
  }
  window.location.reload();
}

/** English count with the right noun form: plural(1, 'night') → "1 night", plural(2, 'night') → "2 nights". */
export const plural = (count: number, noun: string, many = `${noun}s`) => `${count} ${count === 1 ? noun : many}`;
