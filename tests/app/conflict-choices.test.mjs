// The choices of the sync conflict dialog.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conflictChoices, conflictDiveCount, conflictLayout } from '../../app/src/lib/conflict-choices.js';

const items = [{ path: 'a' }, { path: 'b' }, { path: 'c' }];

test('an untouched item keeps the phone version', () => {
  assert.deepEqual(conflictChoices(items, { b: 'cloud' }, false, 'device'), { a: 'device', b: 'cloud', c: 'device' });
});

test('the same choice for all overrides the per-item choices', () => {
  assert.deepEqual(conflictChoices(items, { a: 'device', b: 'device' }, true, 'cloud'), { a: 'cloud', b: 'cloud', c: 'cloud' });
});

test('the dives of a conflict do not count the settings file', () => {
  assert.equal(conflictDiveCount({ items: [{ diveId: 3 }, { date: '2014-04-02' }, {}] }), 2);
  assert.equal(conflictDiveCount(null), 0);
});

test('several items open the full-screen list', () => {
  assert.equal(conflictLayout(1), 'single');
  assert.equal(conflictLayout(3), 'list');
});
