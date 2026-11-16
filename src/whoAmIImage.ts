import { supabase } from './supabaseClient';
import { t } from './lang';
import { WHOAMI_IMAGE_BUCKET } from './whoAmICatalog';

/*
 * "Би хэн бэ" entry pictures (admin panel). A picked photo is shrunk on the phone to at most 512 px on its
 * long side and to WHOAMI_IMAGE_MAX_BYTES (WebP, or JPEG where WebP cannot be written), then stored in the
 * public `whoami` bucket as `<entry-id>.<webp|jpg>`. Only staff may write there (20261120_whoami_content.sql).
 */

/** The bucket refuses anything larger (file_size_limit 307200). */
export const WHOAMI_IMAGE_MAX_BYTES = 300 * 1024;
const SIDES = [512, 420, 340, 260];
const QUALITIES = [0.86, 0.76, 0.66, 0.56];

export type PreparedPicture = { blob: Blob; ext: 'webp' | 'jpg'; contentType: string };

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Shrinks a picked image until it is small enough to upload. */
export async function prepareWhoAmIPicture(file: File): Promise<PreparedPicture> {
  if (!file.type.startsWith('image/')) throw new Error(t('Зөвхөн зураг сонгоно уу.', 'Please choose an image.'));
  if (file.size > 20 * 1024 * 1024) throw new Error(t('Зураг хэт том байна (20MB-аас бага).', 'The image is too large (it must be under 20MB).'));
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error(t('Энэ зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.', 'Could not read this image. Please choose another one.')); });
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error(t('Зургийг боловсруулж чадсангүй.', 'Could not process the image.'));
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      // A dark backing, so a transparent PNG does not turn black-on-black or white in JPEG.
      context.fillStyle = '#0c0d12';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITIES) {
        const webp = await encode(canvas, 'image/webp', quality);
        const blob = webp?.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg', quality);
        if (blob && blob.size <= WHOAMI_IMAGE_MAX_BYTES) return { blob, ext: blob.type === 'image/webp' ? 'webp' : 'jpg', contentType: blob.type };
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error(t('Зургийг 300 KB хүртэл багасгаж чадсангүй. Өөр зураг сонгоно уу.', 'Could not shrink the image to 300 KB. Please choose another one.'));
}

/** Uploads (or replaces) an entry's picture and returns its path in the bucket. */
export async function uploadWhoAmIPicture(entryId: string, picture: PreparedPicture): Promise<string> {
  if (!supabase) throw new Error(t('Сервер тохируулагдаагүй байна.', 'The server is not set up.'));
  const path = `${entryId}.${picture.ext}`;
  const { error } = await supabase.storage.from(WHOAMI_IMAGE_BUCKET).upload(path, picture.blob, { contentType: picture.contentType, cacheControl: '3600', upsert: true });
  if (error) throw new Error(t('Зураг хуулж чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.', 'Could not upload the image. Check your connection and try again.'));
  return path;
}

/** Deletes pictures that no entry uses any more. Failures are ignored; it only saves storage space. */
export async function removeWhoAmIPictures(paths: Array<string | null | undefined>) {
  const list = paths.filter((path): path is string => Boolean(path));
  if (!supabase || !list.length) return;
  await Promise.resolve(supabase.storage.from(WHOAMI_IMAGE_BUCKET).remove(list)).catch(() => undefined);
}

export const formatKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
