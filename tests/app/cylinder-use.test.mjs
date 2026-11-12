// "Secours (bailout)" for the open-circuit cylinder of a rebreather dive (task 2026-11-12-54).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useKey } from '../../app/src/lib/cylinder-use.js';

test('in a rebreather dive the open-circuit cylinder is the bailout', () => {
  assert.equal(useKey('OC-gas', 'CCR'), 'edit.uses.bailout');
  assert.equal(useKey('OC-gas', 'PSCR'), 'edit.uses.bailout');
});

test('in an open-circuit dive it stays open circuit; the other uses never change', () => {
  assert.equal(useKey('OC-gas', 'OC'), 'edit.uses.OC-gas');
  assert.equal(useKey('diluent', 'CCR'), 'edit.uses.diluent');
  assert.equal(useKey('Travel Gas', 'CCR'), 'edit.uses.Travel Gas');
});
