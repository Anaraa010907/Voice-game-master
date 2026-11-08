import assert from 'node:assert/strict';
import { initialsOf } from '../supabase/functions/_shared/initials.ts';

// One rule for the game server's seat initials and the app's Avatar.
assert.equal(initialsOf('Бат'), 'БА');
assert.equal(initialsOf('Бат Эрдэнэ'), 'БА');
assert.equal(initialsOf('Б Эрдэнэ'), 'БЭ', 'spaces are dropped before taking two letters');
assert.equal(initialsOf('  өнөр'), 'ӨН', 'leading spaces and Mongolian Cyrillic letters');
assert.equal(initialsOf('ий'), 'ИЙ', 'a decomposed й (и + combining breve) stays one letter');
assert.equal(initialsOf('й́x'), 'Й́X', 'a letter with a mark that has no composed form is not split');
assert.equal(initialsOf('😀Bat'), '😀B', 'an astral symbol (surrogate pair) is never cut in half');
assert.equal(initialsOf('👨‍👩‍👧x'), '👨‍👩‍👧X', 'an emoji sequence counts as one character');
assert.equal(initialsOf('a'), 'A');
assert.equal(initialsOf('   '), '??');
assert.equal(initialsOf(''), '??');
console.log('initials checks passed');
