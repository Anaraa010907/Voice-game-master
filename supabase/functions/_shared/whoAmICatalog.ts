/**
 * "Би хэн бэ" content from the database (supabase/migrations/20261120_whoami_content.sql), turned into
 * the engine's pack. Staff edit categories, entries and pictures in the admin panel; the game server
 * reads them with one call (`whoami_game_pack()`) when a table starts and when room rules are saved.
 *
 * Pure TypeScript with no runtime imports, so it runs in the Edge Function (Deno), the app (Vite) and
 * Node tests alike.
 *
 * Which content is used:
 *   - a category is dealt from only when it has at least MIN_CATEGORY_ENTRIES active entries
 *     (10, the largest table, so any single category the host picks can fill every seat);
 *   - with fewer than MIN_USABLE_CATEGORIES such categories the built-in pack (whoAmIContent.ts) is used
 *     instead, exactly as when the database cannot be read at all.
 */
import { MAX_WHOAMI_PLAYERS, normalizeGuess, type WhoAmICategory, type WhoAmIEntry, type WhoAmIPack } from './whoAmIEngine.ts';

export const MIN_CATEGORY_ENTRIES = MAX_WHOAMI_PLAYERS;
export const MIN_USABLE_CATEGORIES = 2;
/** Supabase Storage bucket for entry pictures; objects are named `<entry-id>.<jpg|png|webp>`. */
export const WHOAMI_IMAGE_BUCKET = 'whoami';
const IMAGE_PATH = /^[a-z][a-z0-9-]{1,63}\.(jpg|png|webp)$/;

export type WhoAmIEntryRow = {
  id: string;
  name: string;
  name_en?: string | null;
  aliases?: string[] | null;
  image_path?: string | null;
  updated_at?: string | null;
};

export type WhoAmICategoryRow = {
  id: string;
  name: string;
  name_en?: string | null;
  kid_safe?: boolean | null;
  sort?: number | null;
  entries?: WhoAmIEntryRow[] | null;
};

/** What the room settings need to show a category. */
export type WhoAmICategoryInfo = { id: string; name: string; nameEn: string; kidsSafe: boolean };

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/**
 * Public URL of an entry picture. `version` (the row's updated_at) is added as `?v=`, so a replaced
 * picture with the same file name is fetched again instead of coming from a cache.
 */
export function whoAmIImageUrl(supabaseUrl: string, path: string, version?: string | null): string {
  const stamp = version ? Date.parse(version) : NaN;
  const query = Number.isFinite(stamp) ? `?v=${Math.floor(stamp / 1000).toString(36)}` : '';
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${WHOAMI_IMAGE_BUCKET}/${encodeURIComponent(path)}${query}`;
}

/**
 * The pack from `whoami_game_pack()` rows, or null when the content is not enough to play (see the rule
 * above). Malformed rows are skipped, and so is an entry that repeats a spelling of an earlier one
 * (the database already refuses that; this only keeps a typed guess unambiguous if it ever slipped in).
 */
export function buildWhoAmIPack(rows: unknown, supabaseUrl: string): WhoAmIPack | null {
  if (!Array.isArray(rows)) return null;
  const taken = new Set<string>();
  const ids = new Set<string>();
  const pack: WhoAmICategory[] = [];
  const ordered = [...rows as WhoAmICategoryRow[]].filter((row) => row && typeof row === 'object')
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.id).localeCompare(String(b.id)));
  for (const row of ordered) {
    const id = text(row.id);
    const name = text(row.name);
    if (!id || !name || ids.has(id) || !Array.isArray(row.entries)) continue;
    const entries: WhoAmIEntry[] = [];
    for (const item of row.entries) {
      const entryId = text(item?.id);
      const entryName = text(item?.name);
      if (!entryId || !entryName || ids.has(entryId)) continue;
      const nameEn = text(item.name_en);
      const aliases = Array.isArray(item.aliases) ? item.aliases.map(text).filter(Boolean) : [];
      const spellings = [...new Set([entryName, nameEn, ...aliases].map(normalizeGuess).filter(Boolean))];
      if (!normalizeGuess(entryName) || spellings.some((spelling) => taken.has(spelling))) continue;
      spellings.forEach((spelling) => taken.add(spelling));
      ids.add(entryId);
      const path = text(item.image_path);
      entries.push({
        id: entryId,
        name: entryName,
        ...(nameEn ? { nameEn } : {}),
        ...(aliases.length ? { aliases } : {}),
        ...(IMAGE_PATH.test(path) ? { image: whoAmIImageUrl(supabaseUrl, path, item.updated_at) } : {}),
      });
    }
    if (entries.length < MIN_CATEGORY_ENTRIES) continue;
    ids.add(id);
    pack.push({ id, name, nameEn: text(row.name_en) || name, kidsSafe: row.kid_safe !== false, entries });
  }
  return pack.length >= MIN_USABLE_CATEGORIES ? pack : null;
}

/** The pack to deal from: the database content when it is usable, otherwise `fallback` (the built-in pack). */
export function resolveWhoAmIPack(rows: unknown, supabaseUrl: string, fallback: WhoAmIPack): { pack: WhoAmIPack; source: 'database' | 'built-in' } {
  const pack = buildWhoAmIPack(rows, supabaseUrl);
  return pack ? { pack, source: 'database' } : { pack: fallback, source: 'built-in' };
}

/**
 * The categories a host can pick, from `whoami_category_list()` rows (id, name, name_en, kid_safe, entries),
 * by the same rule as the server; null means the server will use the built-in pack.
 */
export function usableWhoAmICategories(rows: unknown): WhoAmICategoryInfo[] | null {
  if (!Array.isArray(rows)) return null;
  const list = (rows as Array<{ id?: unknown; name?: unknown; name_en?: unknown; kid_safe?: unknown; entries?: unknown }>)
    .filter((row) => row && text(row.id) && text(row.name) && Number(row.entries) >= MIN_CATEGORY_ENTRIES)
    .map((row) => ({ id: text(row.id), name: text(row.name), nameEn: text(row.name_en) || text(row.name), kidsSafe: row.kid_safe !== false }));
  return list.length >= MIN_USABLE_CATEGORIES ? list : null;
}

export const packCategoryInfos = (pack: WhoAmIPack): WhoAmICategoryInfo[] =>
  pack.map((category) => ({ id: category.id, name: category.name, nameEn: category.nameEn, kidsSafe: category.kidsSafe }));
