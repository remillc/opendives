// The "Gas" group of "Edit dive": fill ratio, gas change moments, deletion outcome.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deletionOutcome, fillRatio, gasChangeMoments, typeLine } from '../../app/src/lib/gas-group.js';

test('the fill ratio is the end pressure over the working pressure', () => {
  assert.equal(fillRatio(100000, 200000), 0.5);
  assert.equal(fillRatio(200000, 200000), 1);
});

test('the fill ratio is clamped to 0..1', () => {
  assert.equal(fillRatio(250000, 200000), 1);
  assert.equal(fillRatio(-5, 200000), 0);
  assert.equal(fillRatio(0, 200000), 0);
});

test('without a working pressure the start pressure stands in; with neither, 0', () => {
  assert.equal(fillRatio(50000, 0, 200000), 0.25);
  assert.equal(fillRatio(50000, 0, 0), 0);
  assert.equal(fillRatio(50000, 0), 0);
  assert.equal(fillRatio(50000, 100000, 200000), 0.5, 'the working pressure wins');
});

test('moments: the gas changes after the start that go to the cylinder', () => {
  const events = [
    { type: 'gaschange', timeSeconds: 0, cylinder: 0 },
    { type: 'gaschange', timeSeconds: 600, cylinder: 1 },
    { type: 'gaschange', timeSeconds: 1500, cylinder: 0 },
    { type: 'gaschange', timeSeconds: 1800, cylinder: 1 },
    { type: 'other', timeSeconds: 1900, cylinder: 1 },
  ];
  assert.equal(gasChangeMoments(events, 1), 2);
  assert.equal(gasChangeMoments(events, 0), 1, 'the start gas is not a moment');
  assert.equal(gasChangeMoments(events, 2), 0);
  assert.equal(gasChangeMoments(events, -1), 0, 'a new cylinder is not in the dive');
});

test('deletion outcome: refused, moments or plain', () => {
  assert.equal(deletionOutcome({ protected: true, moments: 2 }), 'refused');
  assert.equal(deletionOutcome({ protected: true, moments: 0 }), 'refused');
  assert.equal(deletionOutcome({ protected: false, moments: 2 }), 'moments');
  assert.equal(deletionOutcome({ protected: false, moments: 0 }), 'plain');
});

test('the line under the gas: type and size, or the use', () => {
  assert.equal(typeLine('Dil2', '16 cuft HP', 'Diluent'), 'Dil2, 16 cuft HP');
  assert.equal(typeLine('', '', 'Diluent'), 'Diluent');
  assert.equal(typeLine('AL80', '', 'Open circuit'), 'AL80');
  assert.equal(typeLine('', '80 cuft', 'Open circuit'), 'Open circuit, 80 cuft');
});
