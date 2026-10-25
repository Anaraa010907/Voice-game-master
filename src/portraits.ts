/** Built-in noir portraits a player can pick as their profile picture instead of uploading a photo. */
export const PORTRAITS = [
  { url: '/assets/avatars/portrait-1.webp', label: 'Нягтлан' },
  { url: '/assets/avatars/portrait-2.webp', label: 'Сэтгүүлч' },
  { url: '/assets/avatars/portrait-3.webp', label: 'Жолооч' },
  { url: '/assets/avatars/portrait-4.webp', label: 'Дуучин' },
  { url: '/assets/avatars/portrait-5.webp', label: 'Хотын дарга' },
  { url: '/assets/avatars/portrait-6.webp', label: 'Өмгөөлөгч' },
  { url: '/assets/avatars/portrait-7.webp', label: 'Хатагтай' },
  { url: '/assets/avatars/portrait-8.webp', label: 'Мөрдөгч' },
] as const;

export const isPortrait = (url: string | null | undefined) => PORTRAITS.some((portrait) => portrait.url === url);
