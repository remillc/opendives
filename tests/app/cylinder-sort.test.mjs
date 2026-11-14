// The cylinder types sorted for the screen (plugins/opendives-core/cylinder-sort.js): by name,
// A-Z case ignored, equal names kept in the core's order, as the façade sorted them before.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortCylinderTypes } from '../../plugins/opendives-core/cylinder-sort.js';

test('by name, ignoring the case of A-Z', () => {
  const names = sortCylinderTypes([{ name: 'LP85' }, { name: 'al80' }, { name: 'AL40' }, { name: 'D12 232 bar' }, { name: 'hp100' }]).map((t) => t.name);
  assert.deepEqual(names, ['AL40', 'al80', 'D12 232 bar', 'hp100', 'LP85']);
});

test('equal names keep the core order, and the input is not changed', () => {
  const input = [{ name: 'AL80', id: 1 }, { name: 'al80', id: 2 }, { name: 'AL80', id: 3 }];
  assert.deepEqual(sortCylinderTypes(input).map((t) => t.id), [1, 2, 3]);
  assert.deepEqual(input.map((t) => t.id), [1, 2, 3]);
});
