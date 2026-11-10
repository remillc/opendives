// A saved filter fills the Filter page: its rules become criteria again, and
// what the page cannot show stays in the saved filter, still applied.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeKeys,
  emptyCriteria,
  gearRows,
  isEmpty,
  presetCriteria,
  rowCriteria,
  rulesFor,
} from '../../app/src/lib/filter.svelte.js';

const metric = { length: 'm', temperature: 'C', pressure: 'bar', volume: 'l', weight: 'kg' };
const imperial = { ...metric, length: 'ft', temperature: 'F', volume: 'cuft' };

/** What the core lists for rules it was given: data kept, modes filled. */
const listed = (rules) => rules.map((r) => ({ stringMode: '', rangeMode: '', negate: false, ...r }));
const preset = (rules, fulltext = '', mode = 'starts_with') => ({ index: 0, name: 'Saved', filter: { fulltext, mode, rules: listed(rules) } });

function fullCriteria() {
  return {
    ...emptyCriteria(),
    mode: 'rebreather',
    suits: ['Drysuit'],
    computers: ['Vyper', 'Perdix'],
    tags: ['shore'],
    weekdays: ['1', '6'],
    planned: ['logged'],
    date: { min: '2024-01-31', max: '' },
    timeOfDay: { min: '9:30', max: '18:00' },
    depth: { min: '12', max: '30' },
    duration: { min: '', max: '45' },
    cylinderSize: { min: '10', max: '' },
    o2: { min: '21', max: '32' },
    waterTemp: { min: '-1', max: '' },
    rating: 3,
    notes: 'wreck',
  };
}

test('every criterion comes back from the rules, in metric', () => {
  const c = fullCriteria();
  const back = presetCriteria(preset(rulesFor(c, metric), 'manta'), metric);
  assert.deepEqual(back, { ...c, fulltext: 'manta', preset: { name: 'Saved', fulltext: '', mode: 'starts_with', rules: [] } });
});

test('the rules made again from the page are the saved ones, in imperial units', () => {
  const c = { ...emptyCriteria(), depth: { min: '40', max: '100' }, waterTemp: { min: '50', max: '' }, sac: { min: '', max: '0.5' } };
  const rules = rulesFor(c, imperial);
  const back = presetCriteria(preset(rules), imperial);
  assert.deepEqual(back.preset.rules, []);
  assert.deepEqual(rulesFor(back, imperial), rules);
});

test('a rule the page cannot show stays in the saved filter and still applies', () => {
  const negated = { type: 'suit', stringMode: 'exact', negate: true, data: 'Wetsuit\n' };
  const starts = { type: 'people', stringMode: 'starts_with', data: 'Ann\n' };
  const back = presetCriteria(preset([negated, starts]), metric);
  assert.deepEqual(back.suits, []);
  assert.deepEqual(back.people, []);
  assert.equal(back.preset.rules.length, 2);
  assert.equal(rulesFor(back, metric).length, 2);
  assert.deepEqual(activeKeys(back), ['preset']);
});

test('a text search of another mode stays in the saved filter', () => {
  const back = presetCriteria(preset([], 'manta', 'substring'), metric);
  assert.equal(back.fulltext, '');
  assert.equal(back.preset.fulltext, 'manta');
  assert.equal(isEmpty(back), false);
});

test('a fully shown saved filter adds no chip, and is empty once its criteria are gone', () => {
  const back = presetCriteria(preset(rulesFor({ ...emptyCriteria(), suits: ['Drysuit'] }, metric)), metric);
  assert.deepEqual(activeKeys(back), ['suits']);
  back.suits = [];
  assert.equal(isEmpty(back), true);
});

test('the cylinder and gas criteria make one row each, in place', () => {
  const keys = ['suits', 'computers', 'cylinderTypes', 'cylinderSize', 'o2', 'he', 'tags'].map((key) => ({ key }));
  assert.deepEqual(gearRows(keys), ['suits', 'computers', 'cylinder', 'gas', 'tags']);
  assert.deepEqual(gearRows([{ key: 'he' }]), ['gas']);
});

test('a combined row opens only the criteria that apply to the logbook', () => {
  assert.deepEqual(rowCriteria('gas', { oxygen: true, helium: false }), ['o2']);
  assert.deepEqual(rowCriteria('cylinder', null), ['cylinderTypes', 'cylinderSize']);
  assert.deepEqual(rowCriteria('depth', null), ['depth']);
});
