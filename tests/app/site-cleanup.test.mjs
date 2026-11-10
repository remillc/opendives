// Clean up the sites: the groups an edit made disappear.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairsGone } from '../../app/src/lib/site-cleanup.js';

const pair = (a, b) => ({ a: { uuid: a }, b: { uuid: b } });

test('a pair of the edited site that left the list is reported', () => {
  const before = [pair(1, 2), pair(3, 4)];
  assert.deepEqual(pairsGone(before, [pair(3, 4)], 2), [pair(1, 2)]);
});

test('nothing changed: nothing reported', () => {
  const before = [pair(1, 2), pair(3, 4)];
  assert.deepEqual(pairsGone(before, [pair(4, 3), pair(2, 1)], 1), []);
});

test('a pair that left without involving the edited site is not reported', () => {
  assert.deepEqual(pairsGone([pair(1, 2), pair(3, 4)], [pair(1, 2)], 1), []);
});

test('a pair absent before (dismissed earlier) is not reported', () => {
  assert.deepEqual(pairsGone([pair(3, 4)], [], 1), []);
});
