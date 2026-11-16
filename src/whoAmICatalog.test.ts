// Who Am I content from the database: pack building, the fallback rule, picture URLs and picture secrecy.
// Run: node --experimental-strip-types src/whoAmICatalog.test.ts
import {
  MIN_CATEGORY_ENTRIES, buildWhoAmIPack, resolveWhoAmIPack, usableWhoAmICategories, whoAmIImageUrl, type WhoAmICategoryRow,
} from '../supabase/functions/_shared/whoAmICatalog.ts';
import { WHO_AM_I_PACK } from './whoAmIContent.ts';
import {
  applyWhoAmIAction, createSeededRandom, createWhoAmIGame, whoAmIPrivateView, whoAmIPublicView, type WhoAmIState,
} from './whoAmIEngine.ts';

let passed = 0;
const require = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  passed += 1;
};
const URL_BASE = 'https://abc123.supabase.co';

// The built-in pack as whoami_game_pack() rows (what the seed in 20261120_whoami_content.sql inserts).
const builtInRows: WhoAmICategoryRow[] = WHO_AM_I_PACK.map((category, index) => ({
  id: category.id, name: category.name, name_en: category.nameEn, kid_safe: category.kidsSafe, sort: (index + 1) * 10,
  entries: category.entries.map((entry) => ({ id: entry.id, name: entry.name, name_en: entry.nameEn ?? null, aliases: entry.aliases ?? [], image_path: null, updated_at: '2026-11-20T00:00:00Z' })),
}));

// --- Seeded rows give back exactly the built-in pack ----------------------------------------------
const fromDb = buildWhoAmIPack(builtInRows, URL_BASE);
require(fromDb && JSON.stringify(fromDb) === JSON.stringify(WHO_AM_I_PACK), 'Seeded rows build the same pack as the code (ids, names, aliases, order).');
require(resolveWhoAmIPack(builtInRows, URL_BASE, WHO_AM_I_PACK).source === 'database', 'Usable rows are dealt from the database.');

// --- The fallback rule ---------------------------------------------------------------------------
const trimmed = (count: number) => builtInRows.map((row) => ({ ...row, entries: row.entries!.slice(0, count) }));
require(buildWhoAmIPack(trimmed(MIN_CATEGORY_ENTRIES), URL_BASE)?.length === 8, `A category with exactly ${MIN_CATEGORY_ENTRIES} entries is usable.`);
require(buildWhoAmIPack(trimmed(MIN_CATEGORY_ENTRIES - 1), URL_BASE) === null, `Categories with ${MIN_CATEGORY_ENTRIES - 1} entries are skipped (none left -> fallback).`);
const oneSmall = builtInRows.map((row, index) => index === 0 ? { ...row, entries: row.entries!.slice(0, 3) } : row);
require(buildWhoAmIPack(oneSmall, URL_BASE)?.map((category) => category.id).join() === WHO_AM_I_PACK.slice(1).map((category) => category.id).join(), 'Only the small category is skipped.');
require(buildWhoAmIPack(builtInRows.slice(0, 1), URL_BASE) === null, 'One usable category is not enough: fallback.');
require(buildWhoAmIPack(builtInRows.slice(0, 2), URL_BASE)?.length === 2, 'Two usable categories are enough.');
for (const broken of [null, undefined, 'x', {}, [], [{ id: 'a' }]]) {
  const resolved = resolveWhoAmIPack(broken, URL_BASE, WHO_AM_I_PACK);
  require(resolved.source === 'built-in' && resolved.pack === WHO_AM_I_PACK, `Unusable data (${JSON.stringify(broken)}) falls back to the built-in pack.`);
}

// --- Defensive cleaning ---------------------------------------------------------------------------
const dup = structuredClone(builtInRows);
dup[1].entries!.push({ id: 'figure-copy', name: 'ЧОНО!', name_en: 'Someone', aliases: [] });
dup[1].entries!.push({ id: 'figure-blank', name: '   ', aliases: [] });
dup[1].entries!.push({ id: 'animal-wolf', name: 'Давхар дугаар', aliases: [] });
const cleaned = buildWhoAmIPack(dup, URL_BASE)!;
const cleanedIds = cleaned.flatMap((category) => category.entries.map((entry) => entry.id));
require(!cleanedIds.includes('figure-copy'), 'An entry that repeats another entry’s spelling is skipped.');
require(!cleanedIds.includes('figure-blank') && new Set(cleanedIds).size === cleanedIds.length, 'Blank names and repeated ids are skipped.');

// A staff category whose id equals a built-in entry id (both are slugs) is still dealt from.
const clashing = [...builtInRows, { id: 'animal-horse', name: 'Морин хуур аялгуу', name_en: 'Animal horse', kid_safe: true, sort: 90,
  entries: Array.from({ length: MIN_CATEGORY_ENTRIES }, (_, index) => ({ id: `animal-horse-${index}`, name: `Аялгуу ${index + 1}`, aliases: [] })) }];
require(buildWhoAmIPack(clashing, URL_BASE)?.some((category) => category.id === 'animal-horse'), 'A category id equal to an entry id does not drop the category.');

// --- Room settings list ---------------------------------------------------------------------------
const listRows = builtInRows.map((row) => ({ id: row.id, name: row.name, name_en: row.name_en, kid_safe: row.kid_safe, sort: row.sort, entries: row.entries!.length }));
require(usableWhoAmICategories(listRows)?.length === 8, 'The settings list shows the 8 seeded categories.');
require(usableWhoAmICategories([...listRows.slice(0, 1), { id: 'new', name: 'Шинэ', name_en: 'New', kid_safe: true, sort: 90, entries: 4 }]) === null, 'The settings list follows the same fallback rule.');
require(usableWhoAmICategories([...listRows, { id: 'new', name: 'Шинэ', name_en: 'New', kid_safe: true, sort: 90, entries: 4 }])?.length === 8, 'A staff category with too few entries is not offered.');

// --- Picture URLs ----------------------------------------------------------------------------------
const url = whoAmIImageUrl(`${URL_BASE}/`, 'animal-wolf.webp', '2026-11-20T10:00:00Z');
require(url.startsWith(`${URL_BASE}/storage/v1/object/public/whoami/animal-wolf.webp?v=`), `Picture URL points at the public whoami bucket (${url}).`);
require(whoAmIImageUrl(URL_BASE, 'animal-wolf.webp', '2026-11-21T10:00:00Z') !== url, 'A newer picture gets a new URL (no stale cache).');
require(!whoAmIImageUrl(URL_BASE, 'animal-wolf.webp', null).includes('?'), 'No version, no query.');
const withPictures = structuredClone(builtInRows);
withPictures.forEach((row) => row.entries!.forEach((entry) => { entry.image_path = `${entry.id}.webp`; }));
withPictures[0].entries![0].image_path = '../../secret.webp';
const picturePack = buildWhoAmIPack(withPictures, URL_BASE)!;
require(!picturePack[0].entries[0].image && picturePack[0].entries[1].image?.includes(`/${picturePack[0].entries[1].id}.webp`), 'Only well-formed picture paths become URLs.');

// --- Picture secrecy: the same rule as the name -----------------------------------------------------
const seats = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `P${index + 1}`, initials: `P${index + 1}`, color: 'rose' }));
let game: WhoAmIState = createWhoAmIGame(seats(5), picturePack, createSeededRandom(11));
require(Object.values(game.identities).every((identity) => identity.image?.includes(identity.entryId)), 'Dealt identities carry their pictures.');
require(Object.values(game.identities).every((identity) => identity.categoryNameEn), 'Dealt identities carry the English category name.');
const imagesOf = (state: WhoAmIState) => Object.fromEntries(Object.entries(state.identities).map(([id, identity]) => [id, identity.image!]));
const leaks = (state: WhoAmIState, viewer: number) => {
  const own = imagesOf(state)[viewer];
  return JSON.stringify(whoAmIPrivateView(state, viewer)).includes(own) || JSON.stringify(whoAmIPublicView(state)).includes(own);
};
for (const player of game.players) {
  require(!leaks(game, player.id), `Seat ${player.id} never receives their own picture at the reveal.`);
  const view = whoAmIPrivateView(game, player.id);
  require(game.players.every((other) => other.id === player.id || view.identities[other.id]?.image === game.identities[other.id].image), `Seat ${player.id} sees everyone else’s picture.`);
}
require(Object.values(imagesOf(game)).every((image) => !JSON.stringify(whoAmIPublicView(game)).includes(image)), 'The public view has no picture while everyone is guessing.');
game = game.players.reduce((state, player) => applyWhoAmIAction(state, player.id, { type: 'ready' }).state, game);
const giver = game.order[1];
game = applyWhoAmIAction(game, giver, { type: 'giveUp' }).state;
require(JSON.stringify(whoAmIPublicView(game)).includes(imagesOf(game)[giver]), 'A player who gave up has their picture in the public view.');
require(game.players.filter((player) => player.status === 'playing').every((player) => !leaks(game, player.id)), 'Players still guessing still never get their own picture.');
const publicPlayers = whoAmIPublicView(game).players;
require(publicPlayers.every((player) => player.categoryNameEn), 'The public view carries every seat’s English category name.');

console.log(`Who Am I catalog: ${passed} checks passed.`);
