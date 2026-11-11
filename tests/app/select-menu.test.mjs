// Exposed dropdown menu: out-of-list values, search, keyboard, direction.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuOptions, filterOptions, moveActive, opensUp, po2Choices } from '../../app/src/lib/select-menu.js';
import { choiceValues } from '../../app/src/lib/planner-rules.js';

const modes = [
  { value: 'oc', label: 'Circuit ouvert' },
  { value: 'ccr', label: 'Recycleur (CCR)' },
];

test('a value outside the list heads the menu', () => {
  assert.deepEqual(menuOptions(modes, 'freedive'), [{ value: 'freedive', label: 'freedive' }, ...modes]);
});

test('a listed or empty value adds nothing', () => {
  assert.equal(menuOptions(modes, 'ccr'), modes);
  assert.equal(menuOptions(modes, ''), modes);
});

test('search: every word, any order, no accents or case', () => {
  const sites = [{ value: 'a', label: 'Carrière de Dour' }, { value: 'b', label: 'Lake Coleridge' }];
  assert.deepEqual(filterOptions(sites, 'dour carriere').map((o) => o.value), ['a']);
  assert.equal(filterOptions(sites, '  ').length, 2);
  assert.equal(filterOptions(sites, 'zzz').length, 0);
});

test('keyboard: arrows stop at the ends, Home and End jump', () => {
  assert.equal(moveActive(-1, 'ArrowDown', 3), 0);
  assert.equal(moveActive(2, 'ArrowDown', 3), 2);
  assert.equal(moveActive(-1, 'ArrowUp', 3), 2);
  assert.equal(moveActive(0, 'ArrowUp', 3), 0);
  assert.equal(moveActive(1, 'Home', 3), 0);
  assert.equal(moveActive(1, 'End', 3), 2);
  assert.equal(moveActive(1, 'ArrowDown', 0), -1);
});

test('the menu opens upwards only when it does not fit below and fits better above', () => {
  assert.equal(opensUp(500, 100, 280), false);
  assert.equal(opensUp(100, 500, 280), true);
  assert.equal(opensUp(100, 120, 280), true);
  assert.equal(opensUp(300, 500, 280), false);
});

test('maximum pO2 of the gas tools: 1.0 to 1.6 by 0.1', () => {
  const values = po2Choices();
  assert.deepEqual(values, [1000, 1100, 1200, 1300, 1400, 1500, 1600]);
  assert.deepEqual(choiceValues(values, 1400), values);
  assert.deepEqual(choiceValues(values, 1450), [1450, ...values]);
});
