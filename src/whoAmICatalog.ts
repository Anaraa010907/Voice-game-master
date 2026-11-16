import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { WHO_AM_I_PACK } from './whoAmIContent';
import { packCategoryInfos, usableWhoAmICategories, type WhoAmICategoryInfo } from '../supabase/functions/_shared/whoAmICatalog.ts';

// The pack rules and picture URLs live with the Edge Functions so the app and the server share one copy.
export * from '../supabase/functions/_shared/whoAmICatalog.ts';

/*
 * The categories a host can pick in the room rules. Staff add, rename and hide them in the admin panel,
 * so the list comes from the database (`whoami_category_list()`), by the same rule as the game server:
 * a category needs 10 active entries, and with fewer than 2 such categories the built-in pack is used.
 * Until the list arrives (or without a server) the built-in categories are shown.
 */

const BUILT_IN = packCategoryInfos(WHO_AM_I_PACK);
const FRESH_MS = 60_000;
let current: WhoAmICategoryInfo[] = BUILT_IN;
let loadedAt = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<(list: WhoAmICategoryInfo[]) => void>();

/** Re-reads the category list (at most once a minute unless `force`). */
export function refreshWhoAmICategories(force = false): Promise<void> {
  const client = supabase;
  if (!client) return Promise.resolve();
  if (pending) return pending;
  if (!force && loadedAt && Date.now() - loadedAt < FRESH_MS) return Promise.resolve();
  pending = Promise.resolve(client.rpc('whoami_category_list')).then(({ data, error }) => {
    if (error) return;
    current = usableWhoAmICategories(data) ?? BUILT_IN;
    loadedAt = Date.now();
    listeners.forEach((listener) => listener(current));
  }).catch(() => undefined).finally(() => { pending = null; });
  return pending;
}

/** The categories to offer, kept fresh while the component is on screen. */
export function useWhoAmICategories(): WhoAmICategoryInfo[] {
  const [list, setList] = useState(current);
  useEffect(() => {
    listeners.add(setList);
    setList(current);
    void refreshWhoAmICategories();
    return () => { listeners.delete(setList); };
  }, []);
  return list;
}

/** A category by id: the live list first, then the built-in pack (an old room's rules, a hidden category). */
export const whoAmICategoryInfo = (id: string): WhoAmICategoryInfo | undefined =>
  current.find((category) => category.id === id) ?? BUILT_IN.find((category) => category.id === id);
