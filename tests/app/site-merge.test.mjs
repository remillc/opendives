// The list of sites and the site kept by a merge.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultKeeper, sortSitesByName } from '../../app/src/lib/site-merge.js';

const names = (list) => list.map((s) => s.name);

test('sites sort by name, ignoring case and accents, numbers in order', () => {
  const list = [{ name: 'Lock 10' }, { name: 'écluse' }, { name: 'Lock 9' }, { name: 'baie' }];
  assert.deepEqual(names(sortSitesByName(list, 'fr')), ['baie', 'écluse', 'Lock 9', 'Lock 10']);
});

test('sites without a name come last', () => {
  assert.deepEqual(names(sortSitesByName([{ name: '' }, { name: 'Zed' }], 'fr')), ['Zed', '']);
});

test('the list given is not changed', () => {
  const list = [{ name: 'B' }, { name: 'A' }];
  sortSitesByName(list, 'fr');
  assert.deepEqual(names(list), ['B', 'A']);
});

test('the site kept has the most dives, then a position', () => {
  const a = { dives: 2, hasLocation: false };
  const b = { dives: 5, hasLocation: false };
  const c = { dives: 5, hasLocation: true };
  assert.equal(defaultKeeper([a, b]), b);
  assert.equal(defaultKeeper([a, b, c]), c);
  assert.equal(defaultKeeper([a]), a);
});
