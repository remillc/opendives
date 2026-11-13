// The rebreather drawing: which cylinder goes where, and the accessible name.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rebreatherLabel, rebreatherLayout, rebreatherSummaryLabel } from '../../app/src/lib/rebreather-gas.js';

const summaryWords = {
  card: 'Gas: rebreather with {list}. Open the details',
  diluent: 'diluent {gas}',
  oxygen: 'oxygen',
  and: ' and ',
  bailout: 'bailout: {list}',
  join: ', ',
};

test('the editing card names the unit and the bailout (task 86)', () => {
  const items = [{ gas: 'Trimix 16/45' }, { gas: 'Oxygen' }, { gas: 'Air' }];
  const layout = rebreatherLayout([{ use: 'diluent' }, { use: 'oxygen' }, { use: 'OC-gas' }]);
  assert.equal(rebreatherSummaryLabel(items, layout, summaryWords), 'Gas: rebreather with diluent Trimix 16/45 and oxygen, bailout: air. Open the details');
});

test('the editing card without bailout or oxygen leaves those parts out', () => {
  const items = [{ gas: 'Air' }];
  assert.equal(rebreatherSummaryLabel(items, rebreatherLayout([{ use: 'diluent' }]), summaryWords), 'Gas: rebreather with diluent Air. Open the details');
});

test('diluent and oxygen go in the unit, the rest beside it', () => {
  const layout = rebreatherLayout([{ use: 'OC-gas' }, { use: 'oxygen' }, { use: 'diluent' }, { use: 'OC-gas' }]);
  assert.deepEqual(layout, { diluent: 2, oxygen: 1, others: [0, 3] });
});

test('the first of each kind is in the unit, the others beside it in order', () => {
  const layout = rebreatherLayout([{ use: 'diluent' }, { use: 'diluent' }, { use: 'oxygen' }, { use: 'oxygen' }, { use: 'OC-gas' }]);
  assert.deepEqual(layout, { diluent: 0, oxygen: 2, others: [1, 3, 4] });
});

test('a missing kind is -1', () => {
  assert.deepEqual(rebreatherLayout([{ use: 'diluent' }]), { diluent: 0, oxygen: -1, others: [] });
  assert.deepEqual(rebreatherLayout([]), { diluent: -1, oxygen: -1, others: [] });
});

const words = {
  group: 'Rebreather gas: {list}',
  diluent: 'diluent {cylinder}',
  oxygen: 'oxygen {cylinder}',
  bailout: 'Bailout: {list}',
  cylinder: '{gas} from {start} to {end}',
  cylinderGas: '{gas}',
  range: 'from {start} to {end}',
  join: ', ',
};

test('the accessible name follows the spec', () => {
  const items = [
    { gas: 'Trimix 16/45', start: '2 683', end: '1 885 psi' },
    { gas: 'Oxygen', start: '2 756', end: '1 885 psi' },
    { gas: 'air', start: '3 002', end: '2 901 psi' },
  ];
  const layout = rebreatherLayout([{ use: 'diluent' }, { use: 'oxygen' }, { use: 'OC-gas' }]);
  assert.equal(
    rebreatherLabel(items, layout, words),
    'Rebreather gas: diluent Trimix 16/45 from 2 683 to 1 885 psi, oxygen from 2 756 to 1 885 psi. Bailout: air from 3 002 to 2 901 psi',
  );
});

test('no cylinder with pressures: the name ends with "No pressure data" (task 84)', () => {
  const items = [
    { gas: 'Trimix 16/45', start: '', end: '', noPressure: true },
    { gas: 'Oxygen', start: '', end: '', noPressure: true },
    { gas: 'air', start: '', end: '', noPressure: true },
  ];
  const layout = rebreatherLayout([{ use: 'diluent' }, { use: 'oxygen' }, { use: 'OC-gas' }]);
  assert.equal(
    rebreatherLabel(items, layout, { ...words, noPressure: 'No pressure data' }),
    'Rebreather gas: diluent Trimix 16/45, oxygen. Bailout: air. No pressure data',
  );
});

test('only some cylinders without pressures: each of them says so', () => {
  const items = [
    { gas: 'Trimix 16/45', start: '2 683', end: '1 885 psi' },
    { gas: 'Oxygen', start: '', end: '', noPressure: true },
    { gas: 'air', start: '', end: '', noPressure: true },
  ];
  const layout = rebreatherLayout([{ use: 'diluent' }, { use: 'oxygen' }, { use: 'OC-gas' }]);
  assert.equal(
    rebreatherLabel(items, layout, { ...words, noPressure: 'No pressure data' }),
    'Rebreather gas: diluent Trimix 16/45 from 2 683 to 1 885 psi, oxygen, no pressure data. Bailout: air, no pressure data',
  );
});

test('without pressures only the gas is named; no bailout part without bailout', () => {
  const items = [{ gas: 'Air', start: '', end: '' }, { gas: 'Oxygen', start: '', end: '' }];
  assert.equal(rebreatherLabel(items, rebreatherLayout([{ use: 'diluent' }, { use: 'oxygen' }]), words), 'Rebreather gas: diluent Air, oxygen');
});
