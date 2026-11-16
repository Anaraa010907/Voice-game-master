import type { CSSProperties } from 'react';

/**
 * Profile backdrops («Профайлын дэвсгэр»): a painted portrait picture that fills the showcase card
 * behind the big avatar on the profile, and the small card behind the avatar on a player's card.
 * One picture per shop item of kind 'backdrop' (see supabase/migrations/20261119_profile_backdrops.sql);
 * the pictures are drawn with `cover`, so any portrait size works.
 */
export const BACKDROP_IMAGES: Record<string, string> = {
  'backdrop-ice-butterfly': '/assets/showcases/ice-butterfly.webp',
  'backdrop-rainy-night': '/assets/showcases/rainy-night.webp',
  'backdrop-casino': '/assets/showcases/casino.webp',
  'backdrop-blood-rose': '/assets/showcases/blood-rose.webp',
  'backdrop-fire-dragon': '/assets/showcases/fire-dragon.webp',
  'backdrop-gold-crown': '/assets/showcases/gold-crown.webp',
};

/**
 * Class and style that lay the player's backdrop under a showcase card (see .has-backdrop in
 * theme.css). No backdrop, or a key without a picture, leaves the card exactly as it is.
 */
export function backdrop(key: string | null | undefined): { className: string; style: CSSProperties } {
  const image = key ? BACKDROP_IMAGES[key] : undefined;
  return image
    ? { className: `has-backdrop ${key}`, style: { ['--backdrop' as string]: `url("${image}")` } as CSSProperties }
    : { className: '', style: {} };
}
