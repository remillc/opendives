// "See changes not sent yet" (split button of the sync, task 2026-11-11-39):
// the Logbook is filtered on the dives whose edits are not sent, a criterion
// of its own that the core does not match and the Filter screen does not show.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeKeys, emptyCriteria, isEmpty, rulesFor, unsentIds } from '../../app/src/lib/filter.svelte.js';

const metric = { length: 'm', temperature: 'C', pressure: 'bar', volume: 'l', weight: 'kg' };

test('the dives with pending edits are those of the pending commits, by number', () => {
  const dives = [
    { id: 10, number: 1 },
    { id: 11, number: 2 },
    { id: 12, number: 0 },
    { id: 13, number: 3 },
  ];
  assert.deepEqual([...unsentIds(dives, { 2: ['notes'], 3: ['tags', 'rating'], 7: ['suit'] })], [11, 13]);
  assert.equal(unsentIds(dives, {}).size, 0);
});

test('the criterion makes a filter, shown as a chip, without a rule for the core', () => {
  const c = { ...emptyCriteria(), unsent: true };
  assert.equal(isEmpty(c), false);
  assert.deepEqual(activeKeys(c), ['unsent']);
  assert.deepEqual(rulesFor(c, metric), []);
  assert.equal(isEmpty(emptyCriteria()), true);
});
