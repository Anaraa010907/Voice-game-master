/*
 * Painted backgrounds live in public/assets/bg/bg-<name>.jpg. A name is listed here once its
 * file is in place; until then the screen keeps its CSS gradient, so nothing ever loads a
 * missing image. CSS reads them as var(--bg-<name>).
 */
export const BACKGROUNDS = ['menu', 'office', 'table-day', 'table-night', 'table-vote', 'ger', 'reveal', 'victory'] as const;
export type BackgroundName = typeof BACKGROUNDS[number];

/** Backgrounds whose image files have been added to public/assets/bg/. */
const AVAILABLE: BackgroundName[] = [];

export function installBackgrounds() {
  for (const name of AVAILABLE) {
    document.documentElement.style.setProperty(`--bg-${name}`, `url('/assets/bg/bg-${name}.jpg')`);
    // Lets CSS drop the drawn stand-ins (skyline, table) once the painting is there.
    document.documentElement.setAttribute(`data-bg-${name}`, '');
  }
}
