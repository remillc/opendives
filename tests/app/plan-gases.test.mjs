// The gas a plan from a logbook dive starts on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bottomCylinder } from '../../app/src/lib/plan-gases.js';

const c = (use, used, name = use) => ({ use, used, name });

test('an open-circuit dive starts on its first gas used', () => {
  assert.equal(bottomCylinder([c('OC-gas', false, 'spare'), c('OC-gas', true, 'bottom')]).name, 'bottom');
});

test('a rebreather dive starts on its diluent, not its oxygen', () => {
  assert.equal(bottomCylinder([c('oxygen', true), c('diluent', true)]).use, 'diluent');
});

test('a diluent not marked as used still comes before the oxygen', () => {
  assert.equal(bottomCylinder([c('oxygen', true), c('diluent', false)]).use, 'diluent');
});

test('a bailout breathed during the dive is the open-circuit gas', () => {
  assert.equal(bottomCylinder([c('oxygen', true), c('diluent', true), c('OC-gas', true, 'bailout')]).name, 'bailout');
});

test('nothing breathable: no cylinder, the plan keeps its default gas', () => {
  assert.equal(bottomCylinder([c('oxygen', true)]), null);
  assert.equal(bottomCylinder([]), null);
});
