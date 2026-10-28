import assert from 'node:assert/strict';
import { MAX_RANK_LEVEL, RANK_NAMES, RANK_THRESHOLDS, boardRankDelta, mafiaRankDelta, parseRankTitle, rankInfo, rankLevel, rankTitleKey } from './rankRules.ts';

assert.equal(RANK_THRESHOLDS.length, MAX_RANK_LEVEL);
assert.equal(RANK_NAMES.mafia.length, MAX_RANK_LEVEL);
assert.equal(RANK_NAMES.monopoly.length, MAX_RANK_LEVEL);
assert.equal(rankLevel(0), 1);
assert.equal(rankLevel(99), 1);
assert.equal(rankLevel(100), 2);
assert.equal(rankLevel(2599), 8);
assert.equal(rankLevel(9999), 9);
assert.equal(rankLevel(-50), 1);

const capo = rankInfo('mafia', 800);
assert.equal(capo.name, 'Капо');
assert.equal(capo.next?.name, 'Зөвлөх');
assert.equal(capo.toNext, 200);
assert.equal(capo.progress, 33);
assert.equal(rankInfo('monopoly', 3000).next, null);
assert.equal(rankInfo('monopoly', 3000).progress, 100);

assert.equal(mafiaRankDelta(true, true), 24);
assert.equal(mafiaRankDelta(true, false), 20);
assert.equal(mafiaRankDelta(false, true), -12);
assert.equal(boardRankDelta(true, false), 30);
assert.equal(boardRankDelta(false, false), -6);
assert.equal(boardRankDelta(false, true), -12);

assert.equal(rankTitleKey('mafia', 1), null);
assert.equal(rankTitleKey('mafia', 5), 'title-mafia-5');
assert.equal(rankTitleKey('monopoly', 9), 'title-mono-9');
assert.deepEqual(parseRankTitle('title-mono-4'), { game: 'monopoly', level: 4 });
assert.equal(parseRankTitle('title-legend'), null);
console.log('rank checks passed');
