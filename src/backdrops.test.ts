import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BACKDROP_IMAGES, backdrop } from './backdrops.ts';

// Every backdrop the migration sells has a picture in the app, and every picture is sold.
const migration = readFileSync(new URL('../supabase/migrations/20261119_profile_backdrops.sql', import.meta.url), 'utf8');
const sold = [...migration.matchAll(/\('(backdrop-[a-z0-9-]+)', 'backdrop'/g)].map((match) => match[1]);
assert.equal(sold.length, 6, 'The migration sells six backdrops.');
assert.deepEqual(Object.keys(BACKDROP_IMAGES).sort(), [...sold].sort(), 'The picture map and the shop items list the same backdrops.');
for (const [key, path] of Object.entries(BACKDROP_IMAGES)) {
  assert.match(path, /^\/assets\/showcases\/[a-z-]+\.webp$/, `${key}: pictures live in public/assets/showcases`);
  assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), `${key}: ${path} is missing`);
}

// No backdrop, or a key without a picture, leaves the showcase as it is.
assert.deepEqual(backdrop(null), { className: '', style: {} });
assert.deepEqual(backdrop(undefined), { className: '', style: {} });
assert.deepEqual(backdrop('frame-ice-butterfly'), { className: '', style: {} });
assert.deepEqual(backdrop('backdrop-casino'), { className: 'has-backdrop backdrop-casino', style: { '--backdrop': 'url("/assets/showcases/casino.webp")' } });
console.log('backdrop checks passed');
