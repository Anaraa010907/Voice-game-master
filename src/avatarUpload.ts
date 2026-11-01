import { supabase } from './supabaseClient';

import { t } from './lang.ts';
const SIZE = 320;

/** Center-crops and shrinks a picked photo to a small square JPEG, so uploads stay fast on mobile data. */
async function toSquareJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error(t('Зөвхөн зураг сонгоно уу.', 'Please choose an image.'));
  if (file.size > 20 * 1024 * 1024) throw new Error(t('Зураг хэт том байна (20MB-аас бага).', 'The image is too large (it must be under 20MB).'));
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error(t('Энэ зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.', 'Could not read this image. Please choose another one.')); });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(t('Зургийг боловсруулж чадсангүй.', 'Could not process the image.'));
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(t('Зургийг боловсруулж чадсангүй.', 'Could not process the image.'))), 'image/jpeg', 0.85));
}

/** Uploads a new profile photo into the player's own folder and returns its public URL. */
export async function uploadProfilePhoto(userId: string, file: File): Promise<string> {
  if (!supabase) throw new Error(t('Сервер тохируулагдаагүй байна.', 'The server is not set up.'));
  const blob = await toSquareJpeg(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw new Error(t('Зураг хуулж чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.', 'Could not upload the image. Check your connection and try again.'));
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/** Deletes an old photo of this player. Failures are ignored; it only saves storage space. */
export async function removeProfilePhoto(userId: string, url: string | null | undefined) {
  if (!supabase || !url) return;
  const marker = `/avatars/${userId}/`;
  const index = url.indexOf(marker);
  if (index < 0) return;
  await supabase.storage.from('avatars').remove([url.slice(index + '/avatars/'.length)]).catch(() => undefined);
}
