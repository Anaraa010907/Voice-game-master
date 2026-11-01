import { t } from './lang.ts';

/** Built-in noir portraits a player can pick as their profile picture instead of uploading a photo. */
export const PORTRAITS = [
  { url: '/assets/avatars/portrait-1.webp', label: t('Нягтлан', 'Accountant') },
  { url: '/assets/avatars/portrait-2.webp', label: t('Сэтгүүлч', 'Journalist') },
  { url: '/assets/avatars/portrait-3.webp', label: t('Жолооч', 'Driver') },
  { url: '/assets/avatars/portrait-4.webp', label: t('Дуучин', 'Singer') },
  { url: '/assets/avatars/portrait-5.webp', label: t('Хотын дарга', 'Mayor') },
  { url: '/assets/avatars/portrait-6.webp', label: t('Өмгөөлөгч', 'Lawyer') },
  { url: '/assets/avatars/portrait-7.webp', label: t('Хатагтай', 'Lady') },
  { url: '/assets/avatars/portrait-8.webp', label: t('Мөрдөгч', 'Detective') },
] as const;

export const isPortrait = (url: string | null | undefined) => PORTRAITS.some((portrait) => portrait.url === url);
